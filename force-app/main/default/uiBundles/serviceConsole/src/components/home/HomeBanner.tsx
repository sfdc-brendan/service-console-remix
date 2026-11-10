import { useEffect, useRef, useState } from 'react';
import type { FocusList, HomeStats } from '@/api/console/consoleApi';
import { useConsole } from '@/context/consoleContext';
import { useLayout } from '@/context/layoutContext';
import { HEADER_STATES, type HeaderState } from '@/layout/layoutModel';
import { HOME_LAYOUT } from '@/layout/pageSpecs';
import { CompactBar } from './CompactBar';
import { FullBanner } from './FullBanner';
import { useHomeBannerData } from './useHomeBannerData';

const STICKY_TOP = 'calc(var(--console-header-h, 3.25rem) + 0.5rem)';

function readPin(key: string | null): HeaderState | null {
  if (!key) {
    return null;
  }
  try {
    const value = window.localStorage.getItem(key);
    return HEADER_STATES.find(state => state === value) ?? null;
  } catch {
    return null;
  }
}

function writePin(key: string, state: HeaderState | null) {
  try {
    if (state) {
      window.localStorage.setItem(key, state);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode, host restrictions); the pin just won't persist.
  }
}

function headerOffset(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    '--console-header-h'
  );
  return Number.parseFloat(value) || 0;
}

/**
 * Home's page header. Shows the full banner or the compact bar per the admin default and the
 * user's own pin (the pin wins), and floats the compact bar once the full banner scrolls away.
 * Must render as direct children of the page container so the sticky bars span the whole page.
 */
export function HomeBanner({
  stats,
  focus,
}: {
  stats: HomeStats | null;
  focus: FocusList | null;
}) {
  const { me } = useConsole();
  const { layoutFor, editing } = useLayout();
  const data = useHomeBannerData({ stats, focus });
  const header = layoutFor(HOME_LAYOUT).header;
  const pinKey = me?.userId ? `slk.home.banner.${me.userId}` : null;
  const [sessionPin, setSessionPin] = useState<HeaderState | null>();
  const pinned = sessionPin === undefined ? readPin(pinKey) : sessionPin;
  const bannerRef = useRef<HTMLElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);

  const state: HeaderState =
    editing || !pinned ? (header?.defaultState ?? 'expanded') : pinned;
  const watchScroll =
    state === 'expanded' && header?.autoCollapse === true && !editing;

  useEffect(() => {
    const banner = bannerRef.current;
    if (!watchScroll || !banner) {
      return;
    }
    let frame = 0;
    const check = () => {
      frame = 0;
      setScrolledPast(banner.getBoundingClientRect().bottom <= headerOffset());
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(check);
      }
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [watchScroll]);

  if (!header) {
    return null;
  }

  const pin = (next: HeaderState) => {
    const value = next === header.defaultState ? null : next;
    setSessionPin(value);
    if (pinKey) {
      writePin(pinKey, value);
    }
  };

  if (state === 'compact') {
    return (
      <div className="sticky z-10" style={{ top: STICKY_TOP }}>
        <CompactBar
          data={data}
          header={header}
          onExpand={() => pin('expanded')}
          expandLabel="Expand banner"
        />
      </div>
    );
  }

  return (
    <>
      <FullBanner
        ref={bannerRef}
        data={data}
        header={header}
        onCollapse={() => pin('compact')}
      />
      <div className="sticky z-10 mb-0 h-0" style={{ top: STICKY_TOP }}>
        {watchScroll && scrolledPast ? (
          <CompactBar
            floating
            data={data}
            header={header}
            className="animate-rise absolute inset-x-0 top-0"
            expandLabel="Show the full banner"
            onExpand={() =>
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'auto'
                  : 'smooth',
              })
            }
          />
        ) : null}
      </div>
    </>
  );
}

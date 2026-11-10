import { useEffect, useState, type RefObject } from 'react';

/** `top` for page-level sticky bars so they sit just below the console header. */
export const STICKY_BAR_TOP = 'calc(var(--console-header-h, 3.25rem) + 0.5rem)';

function headerOffset(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    '--console-header-h'
  );
  return Number.parseFloat(value) || 0;
}

/** True once the element's bottom has scrolled up under the sticky console header. */
export function useScrolledPast(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
): boolean {
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      return;
    }
    let frame = 0;
    const check = () => {
      frame = 0;
      setScrolledPast(element.getBoundingClientRect().bottom <= headerOffset());
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
  }, [ref, enabled]);

  return enabled && scrolledPast;
}

export function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  });
}

import type { Ref } from 'react';
import { ChevronsUp } from 'lucide-react';
import { PRESENCE_STATUSES } from '@/api/console/consoleApi';
import { HeaderWaves } from '@/components/console/HeaderWaves';
import { PRESENCE_META, PresenceDot } from '@/components/console/primitives';
import type { HeaderLayout } from '@/layout/layoutModel';
import { cn } from '@/lib/utils';
import { orderedStats, type HomeBannerData } from './useHomeBannerData';

export function FullBanner({
  data,
  header,
  onCollapse,
  ref,
}: {
  data: HomeBannerData;
  header: HeaderLayout;
  onCollapse: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const stats = orderedStats(data, header.stats);
  return (
    <section
      ref={ref}
      aria-label="Today"
      className="ink-panel relative overflow-hidden rounded-2xl px-5 py-4 lg:px-6 lg:py-5"
    >
      <HeaderWaves />
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Collapse banner"
        title="Collapse banner"
        className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <ChevronsUp className="size-4" aria-hidden="true" />
      </button>
      <div className="relative grid gap-4 pr-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div className="min-w-0">
          {header.show.date ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">
              {data.dateLong}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold lg:text-3xl">
            {data.greeting}.
          </h1>
          {header.show.headline ? (
            <p className="mt-1 max-w-xl text-sm text-white/70">
              {data.headline}
            </p>
          ) : null}
          {header.show.presence ? (
            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Presence status"
            >
              {PRESENCE_STATUSES.map(option => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={data.status === option}
                  onClick={() => void data.setPresence(option)}
                  className={cn(
                    'flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs transition-colors',
                    data.status === option
                      ? 'border-white bg-white text-ink'
                      : 'border-white/20 text-white/80 hover:bg-white/10'
                  )}
                >
                  <PresenceDot status={option} className="size-2" />
                  {PRESENCE_META[option].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {stats.length ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ meta, value }) => (
              <div key={meta.id} className="flex flex-col-reverse">
                <dt className="mt-1 text-[11px] uppercase tracking-wider text-white/55">
                  {meta.label}
                </dt>
                <dd className="font-display text-2xl leading-none font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

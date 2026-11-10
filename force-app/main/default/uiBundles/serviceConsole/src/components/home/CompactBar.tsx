import { ChevronDown, ChevronsDown } from 'lucide-react';
import {
  PRESENCE_STATUSES,
  type PresenceStatus,
} from '@/api/console/consoleApi';
import { HeaderWaves } from '@/components/console/HeaderWaves';
import { PRESENCE_META, PresenceDot } from '@/components/console/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { HeaderLayout } from '@/layout/layoutModel';
import { cn } from '@/lib/utils';
import { orderedStats, type HomeBannerData } from './useHomeBannerData';

function isPresence(value: string): value is PresenceStatus {
  return PRESENCE_STATUSES.some(status => status === value);
}

function PresenceMenu({ data }: { data: HomeBannerData }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Presence status: ${PRESENCE_META[data.status].label}`}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-white/20 px-3 text-xs text-white/90 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <PresenceDot status={data.status} className="size-2" />
        {PRESENCE_META[data.status].label}
        <ChevronDown className="size-3.5 text-white/60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Presence status
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={data.status}
          onValueChange={value => {
            if (isPresence(value)) {
              void data.setPresence(value);
            }
          }}
        >
          {PRESENCE_STATUSES.map(option => (
            <DropdownMenuRadioItem key={option} value={option}>
              <PresenceDot status={option} className="size-2" />
              {PRESENCE_META[option].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One-row version of the Home banner. Shows every field the full banner shows. */
export function CompactBar({
  data,
  header,
  onExpand,
  expandLabel,
  floating = false,
  className,
}: {
  data: HomeBannerData;
  header: HeaderLayout;
  onExpand: () => void;
  expandLabel: string;
  floating?: boolean;
  className?: string;
}) {
  const stats = orderedStats(data, header.stats);
  return (
    <section
      aria-label="Today"
      className={cn(
        'ink-panel relative flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-xl px-4 py-2',
        floating && 'shadow-xl',
        className
      )}
    >
      <HeaderWaves lines={12} step={18} />
      <div className="relative flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-base font-semibold">{data.greeting}</h1>
        {header.show.date ? (
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
            {data.dateShort}
          </span>
        ) : null}
      </div>
      {header.show.headline ? (
        <p
          className="relative min-w-40 flex-1 truncate text-sm text-white/65"
          title={data.headline}
        >
          {data.headline}
        </p>
      ) : (
        <span className="flex-1" aria-hidden="true" />
      )}
      <div className="relative flex shrink-0 flex-wrap items-center gap-2">
        {stats.length ? (
          <dl className="flex flex-wrap items-center gap-1.5">
            {stats.map(({ meta, value }) => (
              <div
                key={meta.id}
                title={meta.label}
                className="flex items-baseline gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs"
              >
                <dt className="text-white/55">{meta.shortLabel}</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {header.show.presence ? <PresenceMenu data={data} /> : null}
        <button
          type="button"
          onClick={onExpand}
          aria-label={expandLabel}
          title={expandLabel}
          className="flex size-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
        >
          <ChevronsDown className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

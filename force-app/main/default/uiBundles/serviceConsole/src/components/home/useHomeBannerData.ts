import type {
  FocusList,
  HomeStats,
  PresenceStatus,
} from '@/api/console/consoleApi';
import { useConsole } from '@/context/consoleContext';
import { useNow } from '@/hooks/useNow';
import type { HeaderStatMeta } from '@/layout/layoutModel';
import { HOME_LAYOUT, type HomeStatId } from '@/layout/pageSpecs';
import { formatMinutes, greeting } from '@/lib/format';

export interface BannerStat {
  meta: HeaderStatMeta;
  value: string;
}

export interface HomeBannerData {
  greeting: string;
  dateLong: string;
  dateShort: string;
  headline: string;
  status: PresenceStatus;
  setPresence: (status: PresenceStatus) => Promise<void>;
  /** Every registered stat, in registry order. */
  stats: BannerStat[];
}

const HOME_STATS = HOME_LAYOUT.header?.stats ?? [];
const EMPTY = '–';

/** Everything the full banner and compact bar show, so both render from one source. */
export function useHomeBannerData({
  stats,
  focus,
}: {
  stats: HomeStats | null;
  focus: FocusList | null;
}): HomeBannerData {
  const { me, omni, setPresence } = useConsole();
  const now = new Date(useNow(60000));
  const firstName = me?.name.split(' ')[0] ?? '';
  const status = omni?.presence.status ?? 'Offline';

  const values: Record<HomeStatId, string> = {
    closedToday: stats ? String(stats.closedToday) : EMPTY,
    avgHandle: stats ? formatMinutes(stats.avgHandleSeconds) : EMPTY,
    openCases: stats ? String(stats.openCases) : EMPTY,
    inQueue: omni ? String(omni.queued) : EMPTY,
  };

  return {
    greeting: `${greeting(now)}${firstName ? `, ${firstName}` : ''}`,
    dateLong: now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    dateShort: now.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    headline:
      focus?.headline ??
      (status === 'Online'
        ? 'You are live. New work will be offered as it arrives.'
        : 'Set yourself to Available to start receiving routed work.'),
    status,
    setPresence,
    stats: HOME_STATS.map(meta => ({ meta, value: values[meta.id] })),
  };
}

/** The admin's visible stats, in the admin's order. */
export function orderedStats(
  data: HomeBannerData,
  visible: readonly string[]
): BannerStat[] {
  const byId = new Map(data.stats.map(stat => [stat.meta.id, stat]));
  return visible.flatMap(id => byId.get(id) ?? []);
}

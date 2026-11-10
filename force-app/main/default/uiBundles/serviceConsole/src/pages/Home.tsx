import { useCallback } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  Inbox,
  ListChecks,
  Radio,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { consoleApi, PRESENCE_STATUSES } from '@/api/console/consoleApi';
import {
  getMyOpenCases,
  getRecentChannelActivity,
} from '@/api/console/recordService';
import { useConsole } from '@/context/consoleContext';
import { useResource } from '@/hooks/useResource';
import { useNow } from '@/hooks/useNow';
import {
  formatDuration,
  formatMinutes,
  greeting,
  relativeTime,
  secondsSince,
  workPath,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { HOME_LAYOUT } from '@/layout/pageSpecs';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import { SlaWatchPanel } from '@/components/insights/SlaPanels';
import {
  FollowUpsPanel,
  ScorecardPanel,
  TrendingIssuesPanel,
} from '@/components/insights/HomeInsights';
import {
  AiTag,
  CHANNEL_META,
  ChannelIcon,
  EmptyState,
  ErrorNote,
  Meter,
  Panel,
  PRESENCE_META,
  PresenceDot,
  PriorityBadge,
  SentimentBadge,
  ShimmerLines,
} from '@/components/console/primitives';

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-display text-3xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-white/55">
        {label}
      </p>
    </div>
  );
}

export default function Home() {
  const { me, omni, setPresence } = useConsole();
  const now = useNow(1000);
  const userId = me?.userId ?? null;

  const stats = useResource(consoleApi.home, 'home', 15000);
  const cases = useResource(
    useCallback(() => getMyOpenCases(userId as string), [userId]),
    userId,
    30000
  );
  const focus = useResource(
    consoleApi.focus,
    userId ? `focus-${userId}` : null
  );
  const activity = useResource(getRecentChannelActivity, 'activity', 30000);

  const firstName = me?.name.split(' ')[0] ?? '';
  const status = omni?.presence.status ?? 'Offline';
  const sentiment = stats.data?.sentiment;

  return (
    <div className="stagger space-y-5">
      <section className="ink-panel relative overflow-hidden rounded-2xl p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border border-white/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -top-10 right-10 size-40 rounded-full border border-white/10"
          aria-hidden="true"
        />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              {new Date(now).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <h1 className="mt-2 text-4xl font-semibold lg:text-5xl">
              {greeting(new Date(now))}
              {firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-2 max-w-xl text-white/70">
              {focus.data?.headline ??
                (status === 'Online'
                  ? 'You are live. New work will be offered as it arrives.'
                  : 'Set yourself to Available to start receiving routed work.')}
            </p>
            <div
              className="mt-5 flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Presence status"
            >
              {PRESENCE_STATUSES.map(option => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={status === option}
                  onClick={() => void setPresence(option)}
                  className={cn(
                    'flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors',
                    status === option
                      ? 'border-white bg-white text-ink'
                      : 'border-white/20 text-white/80 hover:bg-white/10'
                  )}
                >
                  <PresenceDot status={option} />
                  {PRESENCE_META[option].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <HeroStat
              label="Closed today"
              value={stats.data?.closedToday ?? '–'}
            />
            <HeroStat
              label="Avg handle"
              value={
                stats.data ? formatMinutes(stats.data.avgHandleSeconds) : '–'
              }
            />
            <HeroStat label="Open cases" value={stats.data?.openCases ?? '–'} />
            <HeroStat label="In queue" value={omni?.queued ?? '–'} />
          </div>
        </div>
      </section>

      <LayoutCanvas
        spec={HOME_LAYOUT}
        slots={{
          scorecard: <ScorecardPanel />,
          sla: <SlaWatchPanel />,
          tasks: <FollowUpsPanel />,
          trends: <TrendingIssuesPanel />,
          activeWork: (
            <Panel
              title="Active work"
              icon={Radio}
              action={
                <span className="text-xs text-muted-foreground">
                  {omni?.active.length ?? 0} live
                </span>
              }
            >
              {omni?.active.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {omni.active.map(work => {
                    const path = workPath(work);
                    const meta = CHANNEL_META[work.channel];
                    return (
                      <Link
                        key={work.id}
                        to={path ?? '/'}
                        className="group relative overflow-hidden rounded-xl border bg-card p-4 transition-shadow hover:shadow-lg"
                      >
                        <span
                          className={cn(
                            'absolute inset-y-0 left-0 w-1',
                            meta.bg
                          )}
                          aria-hidden="true"
                        />
                        <div className="flex items-start gap-3">
                          <ChannelIcon channel={work.channel} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-medium leading-snug">
                              {work.subject || `${meta.label} conversation`}
                            </p>
                            <p className="mt-0.5 truncate text-sm text-muted-foreground">
                              {[
                                work.customerName,
                                work.caseNumber
                                  ? `Case ${work.caseNumber}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || meta.label}
                            </p>
                          </div>
                          <ArrowUpRight
                            className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="mt-3 flex items-center gap-3 text-xs">
                          <PriorityBadge priority={work.priority} />
                          <SentimentBadge sentiment={work.sentiment} />
                          <span className="ml-auto font-mono tabular-nums text-muted-foreground">
                            {formatDuration(secondsSince(work.acceptedAt, now))}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Inbox}
                  title="No live conversations"
                  detail="Accept an offer from Omni-Channel, or use Inbound to simulate a customer."
                />
              )}
            </Panel>
          ),
          myCases: (
            <Panel
              title="My open cases"
              icon={Briefcase}
              action={
                <span className="text-xs text-muted-foreground">
                  {cases.data?.total ?? 0} total
                </span>
              }
              bodyClassName="px-0 pb-1"
            >
              {cases.error ? (
                <div className="px-4 pb-3">
                  <ErrorNote
                    message={cases.error}
                    onRetry={() => void cases.refresh()}
                  />
                </div>
              ) : cases.loading && !cases.data ? (
                <ShimmerLines lines={4} className="px-4 pb-3" />
              ) : cases.data?.cases.length ? (
                <ul className="divide-y">
                  {cases.data.cases.map(c => (
                    <li key={c.id}>
                      <Link
                        to={`/case/${c.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
                      >
                        <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                          {c.caseNumber}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {c.subject || '(no subject)'}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[c.contactName, c.origin, c.status]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <PriorityBadge priority={c.priority} />
                        <span className="hidden w-16 text-right text-xs text-muted-foreground sm:block">
                          {relativeTime(c.createdDate, now)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={ListChecks}
                  title="Inbox zero"
                  detail="No open cases are assigned to you."
                />
              )}
            </Panel>
          ),
          focus: (
            <Panel
              title="Focus for today"
              icon={Sparkles}
              tone="ai"
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void focus.refresh()}
                  aria-label="Refresh focus"
                  disabled={focus.loading}
                >
                  <RefreshCw
                    className={cn('size-3.5', focus.loading && 'animate-spin')}
                    aria-hidden="true"
                  />
                </Button>
              }
            >
              {focus.error ? (
                <ErrorNote
                  message={focus.error}
                  onRetry={() => void focus.refresh()}
                />
              ) : focus.loading && !focus.data ? (
                <ShimmerLines lines={5} />
              ) : focus.data?.items.length ? (
                <ol className="space-y-2.5">
                  {focus.data.items.map((item, index) => (
                    <li key={item.caseId}>
                      <Link
                        to={`/case/${item.caseId}`}
                        className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-white/70"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ai text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {item.subject}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.reason}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {focus.data?.headline ?? 'Nothing needs your attention yet.'}
                </p>
              )}
              <AiTag className="mt-3" label="Ranked by AI" />
            </Panel>
          ),
          queuePulse: (
            <Panel title="Queue pulse" icon={Activity}>
              {stats.data?.queues.length ? (
                <ul className="space-y-3">
                  {stats.data.queues.map(queue => (
                    <li key={queue.name}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{queue.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {queue.count} · oldest{' '}
                          {formatMinutes(queue.oldestWaitSeconds)}
                        </span>
                      </div>
                      <Meter
                        className="mt-1.5"
                        segments={[
                          {
                            value: queue.byChannel.Voice ?? 0,
                            className: 'fill-voice',
                            label: 'Voice',
                          },
                          {
                            value: queue.byChannel.Messaging ?? 0,
                            className: 'fill-messaging',
                            label: 'Messaging',
                          },
                          {
                            value: queue.byChannel.Case ?? 0,
                            className: 'fill-case',
                            label: 'Case',
                          },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  All queues are clear.
                </p>
              )}
              {sentiment ? (
                <div className="mt-5 border-t pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    My sentiment today
                  </p>
                  <Meter
                    className="h-2.5"
                    segments={[
                      {
                        value: sentiment.Positive,
                        className: 'fill-positive',
                        label: 'Positive',
                      },
                      {
                        value: sentiment.Neutral,
                        className: 'fill-muted-foreground/40',
                        label: 'Neutral',
                      },
                      {
                        value: sentiment.Negative,
                        className: 'fill-negative',
                        label: 'Negative',
                      },
                    ]}
                  />
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{sentiment.Positive} positive</span>
                    <span>{sentiment.Neutral} neutral</span>
                    <span>{sentiment.Negative} negative</span>
                  </div>
                </div>
              ) : null}
            </Panel>
          ),
          activity: (
            <Panel
              title="Recent channel activity"
              icon={Radio}
              bodyClassName="px-2 pb-2"
            >
              {activity.data?.length ? (
                <ul>
                  {activity.data.slice(0, 8).map(item => (
                    <li key={item.id}>
                      <Link
                        to={
                          item.kind === 'voice'
                            ? `/voice/${item.id}`
                            : `/messaging/${item.id}`
                        }
                        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
                      >
                        <ChannelIcon
                          channel={
                            item.kind === 'voice' ? 'Voice' : 'Messaging'
                          }
                          className="size-7"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {item.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.detail}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(item.createdDate, now)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : activity.error ? (
                <div className="px-2">
                  <ErrorNote message={activity.error} />
                </div>
              ) : (
                <p className="px-2 pb-2 text-sm text-muted-foreground">
                  No recent calls or sessions.
                </p>
              )}
            </Panel>
          ),
        }}
      />
    </div>
  );
}

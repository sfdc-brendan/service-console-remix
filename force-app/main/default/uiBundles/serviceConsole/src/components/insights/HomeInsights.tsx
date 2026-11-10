import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  Check,
  Flame,
  Minus,
  RefreshCw,
  Sparkle,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  consoleApi,
  type FollowUpTask,
  type TrendDirection,
} from '@/api/console/consoleApi';
import { useResource } from '@/hooks/useResource';
import { formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AiTag,
  EmptyState,
  ErrorNote,
  Panel,
  ShimmerLines,
} from '@/components/console/primitives';

const DAILY_GOAL = 6;

function Delta({ now, prior }: { now: number; prior: number }) {
  if (!prior && !now) {
    return null;
  }
  const diff = now - prior;
  const pct = prior ? Math.round((diff / prior) * 100) : 100;
  return (
    <span
      className={cn(
        'text-[11px] font-semibold',
        diff > 0
          ? 'text-positive'
          : diff < 0
            ? 'text-negative'
            : 'text-muted-foreground'
      )}
    >
      {diff > 0 ? '▲' : diff < 0 ? '▼' : '•'} {Math.abs(pct)}% vs last week
    </span>
  );
}

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="font-display text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Seven days of closed cases and conversations against a daily goal. */
export function ScorecardPanel() {
  const card = useResource(consoleApi.scorecard, 'scorecard', 120000);
  const data = card.data;
  const max = data
    ? Math.max(DAILY_GOAL + 1, ...data.days.map(d => d.cases + d.conversations))
    : 1;
  const height = 80;
  const width = 28;
  const gap = 14;
  const goalY = height - (DAILY_GOAL / max) * height;
  return (
    <Panel
      title="My week"
      icon={Trophy}
      action={
        <span className="text-xs text-muted-foreground">
          Goal {DAILY_GOAL}/day
        </span>
      }
    >
      {card.error ? (
        <ErrorNote message={card.error} onRetry={() => void card.refresh()} />
      ) : !data ? (
        <ShimmerLines lines={5} />
      ) : (
        <div className="grid gap-5 @lg:grid-cols-[1fr_auto]">
          <div>
            <svg
              viewBox={`0 0 ${7 * (width + gap) - gap} ${height}`}
              className="h-28 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${data.casesClosed} cases and ${data.conversations} conversations closed this week`}
            >
              {data.days.map((day, index) => {
                const caseH = (day.cases / max) * height;
                const convoH = (day.conversations / max) * height;
                const x = index * (width + gap);
                return (
                  <g key={day.date}>
                    <rect
                      x={x}
                      y={0}
                      width={width}
                      height={height}
                      rx={3}
                      className="fill-muted/50"
                    />
                    <rect
                      x={x}
                      y={height - caseH}
                      width={width}
                      height={caseH}
                      className="fill-case"
                    >
                      <title>{`${day.cases} cases closed`}</title>
                    </rect>
                    <rect
                      x={x}
                      y={height - caseH - convoH}
                      width={width}
                      height={convoH}
                      className="fill-messaging/70"
                    >
                      <title>{`${day.conversations} conversations`}</title>
                    </rect>
                  </g>
                );
              })}
              <line
                x1={0}
                x2={7 * (width + gap)}
                y1={goalY}
                y2={goalY}
                className="stroke-ink/40"
                strokeDasharray="4 4"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="mt-1 grid grid-cols-7 text-center font-mono text-[10px] text-muted-foreground">
              {data.days.map(day => (
                <span key={day.date}>
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: 'narrow' }
                  )}
                </span>
              ))}
            </div>
            <ul className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-case" /> Cases closed
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-messaging/70" />{' '}
                Conversations
              </li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 @lg:w-56">
            <Metric label="Cases closed" value={data.casesClosed}>
              <Delta now={data.casesClosed} prior={data.casesClosedPrior} />
            </Metric>
            <Metric label="Conversations" value={data.conversations}>
              <Delta now={data.conversations} prior={data.conversationsPrior} />
            </Metric>
            <Metric
              label="Avg handle"
              value={
                data.avgHandleSeconds
                  ? formatMinutes(data.avgHandleSeconds)
                  : '–'
              }
            />
            <Metric
              label="Positive"
              value={data.positivePct === null ? '–' : `${data.positivePct}%`}
            />
            <Metric
              label="SLA met"
              value={data.slaMetPct === null ? '–' : `${data.slaMetPct}%`}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

function dueLabel(task: FollowUpTask): string {
  if (!task.dueDate) {
    return 'No date';
  }
  const due = new Date(`${task.dueDate}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Tomorrow';
  }
  if (days < 0) {
    return `${Math.abs(days)}d overdue`;
  }
  return due.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
}

/** Open tasks I own, overdue first, with one-click complete. */
export function FollowUpsPanel() {
  const tasks = useResource(consoleApi.tasks, 'follow-ups', 60000);
  const [completing, setCompleting] = useState<string | null>(null);
  const data = tasks.data;

  const complete = async (task: FollowUpTask) => {
    setCompleting(task.id);
    try {
      await consoleApi.completeTask(task.id);
      tasks.setData(prev =>
        prev
          ? {
              ...prev,
              overdue: prev.overdue - (task.overdue ? 1 : 0),
              dueToday: prev.dueToday - (dueLabel(task) === 'Today' ? 1 : 0),
              items: prev.items.filter(item => item.id !== task.id),
            }
          : prev
      );
      toast.success('Task completed', {
        description: task.subject ?? undefined,
      });
    } catch (err) {
      toast.error('Could not complete the task', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCompleting(null);
    }
  };

  return (
    <Panel
      title="Follow-ups"
      icon={CalendarCheck2}
      action={
        data ? (
          <span className="flex gap-2 text-xs">
            {data.overdue ? (
              <span className="font-semibold text-negative">
                {data.overdue} overdue
              </span>
            ) : null}
            <span className="text-muted-foreground">{data.dueToday} today</span>
          </span>
        ) : null
      }
      bodyClassName="px-2 pb-2"
    >
      {tasks.error ? (
        <div className="px-2">
          <ErrorNote
            message={tasks.error}
            onRetry={() => void tasks.refresh()}
          />
        </div>
      ) : !data ? (
        <ShimmerLines lines={4} className="px-2 pb-2" />
      ) : data.items.length ? (
        <ul>
          {data.items.map(task => {
            const caseLink = task.whatId?.startsWith('500')
              ? `/case/${task.whatId}`
              : null;
            return (
              <li
                key={task.id}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50"
              >
                <button
                  type="button"
                  onClick={() => void complete(task)}
                  disabled={completing !== null}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-transparent transition-colors hover:border-positive hover:text-positive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                  aria-label={`Complete ${task.subject ?? 'task'}`}
                >
                  <Check className="size-3" aria-hidden="true" />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {task.subject || '(no subject)'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {caseLink ? (
                      <Link to={caseLink} className="hover:underline">
                        {task.whatName}
                      </Link>
                    ) : (
                      task.whatName
                    )}
                    {task.whoName ? ` · ${task.whoName}` : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    task.overdue
                      ? 'font-semibold text-negative'
                      : 'text-muted-foreground'
                  )}
                >
                  {dueLabel(task)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={CalendarCheck2}
          title="All caught up"
          detail="No open follow-up tasks."
        />
      )}
    </Panel>
  );
}

const TREND_META: Record<
  TrendDirection,
  { label: string; icon: typeof TrendingUp; className: string }
> = {
  rising: {
    label: 'Rising',
    icon: TrendingUp,
    className: 'bg-negative/10 text-negative',
  },
  new: { label: 'New', icon: Sparkle, className: 'bg-ai/12 text-ai' },
  steady: {
    label: 'Steady',
    icon: Minus,
    className: 'bg-muted text-muted-foreground',
  },
};

/** AI clusters of this week's new cases, so agents see what is driving volume. */
export function TrendingIssuesPanel() {
  const trends = useResource(consoleApi.trends, 'trends');
  const data = trends.data;
  const top = data ? Math.max(1, ...data.clusters.map(c => c.count)) : 1;
  return (
    <Panel
      title="Trending issues"
      icon={Flame}
      tone="ai"
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void trends.refresh()}
          disabled={trends.loading}
          aria-label="Refresh trending issues"
        >
          <RefreshCw
            className={cn('size-3.5', trends.loading && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {trends.error ? (
        <ErrorNote
          message={trends.error}
          onRetry={() => void trends.refresh()}
        />
      ) : !data ? (
        <ShimmerLines lines={6} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground/85">{data.headline}</p>
          {data.clusters.length ? (
            <ol className="space-y-3">
              {data.clusters.map(cluster => {
                const meta = TREND_META[cluster.trend];
                const Icon = meta.icon;
                return (
                  <li
                    key={cluster.label}
                    className="rounded-lg bg-white/70 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {cluster.label}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          meta.className
                        )}
                      >
                        <Icon className="size-3" aria-hidden="true" />
                        {meta.label}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {cluster.count}
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 100 4"
                      preserveAspectRatio="none"
                      className="mt-2 h-1 w-full overflow-hidden rounded-full"
                      aria-hidden="true"
                    >
                      <rect width="100" height="4" className="fill-muted" />
                      <rect
                        width={(cluster.count / top) * 100}
                        height="4"
                        className={cluster.urgent ? 'fill-voice' : 'fill-ai'}
                      />
                    </svg>
                    <p className="mt-2 text-xs text-foreground/80">
                      {cluster.insight}
                    </p>
                    {cluster.action ? (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-ai">
                        <ArrowRight className="size-3" aria-hidden="true" />
                        {cluster.action}
                      </p>
                    ) : null}
                    {cluster.cases.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {cluster.cases.map(c => (
                          <Link
                            key={c.id}
                            to={`/case/${c.id}`}
                            title={c.subject}
                            className="inline-flex items-center gap-0.5 rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {c.caseNumber}
                            <ArrowUpRight
                              className="size-2.5"
                              aria-hidden="true"
                            />
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
          <AiTag label={`Clustered from ${data.sampled} new cases`} />
        </div>
      )}
    </Panel>
  );
}

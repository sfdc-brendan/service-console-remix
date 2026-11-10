import { useCallback } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ShieldCheck, TimerReset } from 'lucide-react';
import {
  consoleApi,
  type Milestone,
  type MilestoneState,
} from '@/api/console/consoleApi';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { formatTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  ErrorNote,
  Panel,
  RatioMeter,
  ShimmerLines,
} from '@/components/console/primitives';

const STATE_META: Record<
  MilestoneState,
  { label: string; dot: string; text: string; bar: string }
> = {
  breached: {
    label: 'Breached',
    dot: 'bg-negative',
    text: 'text-negative',
    bar: 'fill-negative',
  },
  due: {
    label: 'Due soon',
    dot: 'bg-warning',
    text: 'text-warning',
    bar: 'fill-warning',
  },
  ok: {
    label: 'On track',
    dot: 'bg-positive',
    text: 'text-positive',
    bar: 'fill-case',
  },
  met: {
    label: 'Met',
    dot: 'bg-positive',
    text: 'text-positive',
    bar: 'fill-positive',
  },
  missed: {
    label: 'Missed',
    dot: 'bg-negative',
    text: 'text-negative',
    bar: 'fill-negative',
  },
};

/** "in 42m", "3h 10m overdue", recomputed on the client so it ticks live. */
function timeLeft(target: string | null, now: number): string {
  if (!target) {
    return 'No target';
  }
  const minutes = Math.round((new Date(target).getTime() - now) / 60000);
  const abs = Math.abs(minutes);
  const text =
    abs >= 1440
      ? `${Math.floor(abs / 1440)}d ${Math.floor((abs % 1440) / 60)}h`
      : abs >= 60
        ? `${Math.floor(abs / 60)}h ${abs % 60}m`
        : `${abs}m`;
  return minutes < 0 ? `${text} overdue` : `in ${text}`;
}

function liveState(milestone: Milestone, now: number): MilestoneState {
  if (
    milestone.state === 'met' ||
    milestone.state === 'missed' ||
    !milestone.targetDate
  ) {
    return milestone.state;
  }
  const minutes = (new Date(milestone.targetDate).getTime() - now) / 60000;
  return minutes < 0 ? 'breached' : minutes <= 60 ? 'due' : 'ok';
}

function Counter({ value, state }: { value: number; state: MilestoneState }) {
  const meta = STATE_META[state];
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p
        className={cn(
          'font-display text-2xl leading-none font-semibold tabular-nums',
          value ? meta.text : 'text-muted-foreground'
        )}
      >
        {value}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', meta.dot)} />
        {meta.label}
      </p>
    </div>
  );
}

/** Home: my open Entitlement milestones, soonest first. */
export function SlaWatchPanel() {
  const now = useNow(30000);
  const sla = useResource(consoleApi.slaWatch, 'sla-watch', 60000);
  const data = sla.data;
  return (
    <Panel
      title="SLA watch"
      icon={TimerReset}
      action={
        <span className="text-xs text-muted-foreground">
          Entitlement milestones
        </span>
      }
    >
      {sla.error ? (
        <ErrorNote message={sla.error} onRetry={() => void sla.refresh()} />
      ) : !data ? (
        <ShimmerLines lines={4} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Counter value={data.breached} state="breached" />
            <Counter value={data.dueSoon} state="due" />
            <Counter value={data.onTrack} state="ok" />
          </div>
          {data.items.length ? (
            <ul className="-mx-2">
              {data.items.map(item => {
                const state = liveState(item, now);
                const meta = STATE_META[state];
                return (
                  <li key={item.id}>
                    <Link
                      to={`/case/${item.caseId}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
                    >
                      <span
                        className={cn('size-2 shrink-0 rounded-full', meta.dot)}
                        aria-label={meta.label}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.subject || '(no subject)'}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.name} · {item.caseNumber}
                          {item.contactName ? ` · ${item.contactName}` : ''}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-right font-mono text-xs tabular-nums',
                          meta.text
                        )}
                        title={
                          item.targetDate
                            ? `Target ${formatTime(item.targetDate)}`
                            : undefined
                        }
                      >
                        {timeLeft(item.targetDate, now)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Every milestone is on track"
              detail="No open Entitlement milestones on your cases."
            />
          )}
        </div>
      )}
    </Panel>
  );
}

/** Record pages: every milestone on one case with a live countdown. */
export function CaseSlaPanel({ caseId }: { caseId: string }) {
  const now = useNow(15000);
  const sla = useResource(
    useCallback(() => consoleApi.caseSla(caseId), [caseId]),
    `case-sla-${caseId}`,
    60000
  );
  const data = sla.data;
  return (
    <Panel
      title="SLA clock"
      icon={TimerReset}
      action={
        data?.entitlement ? (
          <span
            className="max-w-40 truncate text-xs text-muted-foreground"
            title={data.entitlement}
          >
            {data.entitlement}
          </span>
        ) : null
      }
    >
      {sla.error ? (
        <ErrorNote message={sla.error} onRetry={() => void sla.refresh()} />
      ) : !data ? (
        <ShimmerLines lines={3} />
      ) : data.milestones.length ? (
        <ul className="space-y-3">
          {data.milestones.map(m => {
            const state = liveState(m, now);
            const meta = STATE_META[state];
            const start = m.startDate ? new Date(m.startDate).getTime() : now;
            const end = m.targetDate ? new Date(m.targetDate).getTime() : now;
            const finished = m.completedDate
              ? new Date(m.completedDate).getTime()
              : now;
            const span = Math.max(1, end - start);
            return (
              <li key={m.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    {state === 'met' ? (
                      <CheckCircle2
                        className="size-3.5 shrink-0 text-positive"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className={cn('size-2 shrink-0 rounded-full', meta.dot)}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-mono text-xs tabular-nums',
                      meta.text
                    )}
                  >
                    {state === 'met' || state === 'missed'
                      ? `${meta.label} ${relativeTime(m.completedDate, now)}`
                      : timeLeft(m.targetDate, now)}
                  </span>
                </div>
                <RatioMeter
                  className="mt-1.5"
                  value={Math.min(span, finished - start)}
                  max={span}
                  barClass={meta.bar}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.targetDate ? `Target ${formatTime(m.targetDate)}` : ''}
                  {m.targetMinutes ? ` · ${m.targetMinutes} min goal` : ''}
                  {data.stopped ? ' · clock paused' : ''}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No Entitlement milestones on this case.
        </p>
      )}
    </Panel>
  );
}

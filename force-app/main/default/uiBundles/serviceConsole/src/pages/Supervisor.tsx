import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Hourglass,
  Info,
  Layers,
  RefreshCw,
  Siren,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  consoleApi,
  type AgentPresence,
  type PresenceStatus,
  type Severity,
  type SupervisorInsights,
  type WorkItem,
} from '@/api/console/consoleApi';
import { useConsole } from '@/context/consoleContext';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { formatMinutes, relativeTime, secondsSince } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SUPERVISOR_LAYOUT } from '@/layout/pageSpecs';
import { RoutingFeedPanel } from '@/components/routing/RoutingFeed';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import { AgentCard } from '@/components/supervisor/AgentCard';
import {
  ReassignDialog,
  WhisperDialog,
} from '@/components/supervisor/SupervisorDialogs';
import {
  AiTag,
  ChannelIcon,
  EmptyState,
  ErrorNote,
  Meter,
  Panel,
  PriorityBadge,
  ShimmerLines,
} from '@/components/console/primitives';

const SEVERITY: Record<
  Severity,
  { icon: LucideIcon; className: string; dot: string }
> = {
  critical: {
    icon: Siren,
    className: 'border-negative/30 bg-negative/5',
    dot: 'text-negative',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-warning/40 bg-warning/10',
    dot: 'text-warning',
  },
  info: { icon: Info, className: 'border-case/20 bg-case/5', dot: 'text-case' },
};

type AgentFilter = 'all' | PresenceStatus;

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-3xl leading-none font-medium tabular-nums',
          tone
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] text-white/50">{sub}</p> : null}
    </div>
  );
}

function InsightsPanel({
  insights,
  loading,
  error,
  onRun,
}: {
  insights: SupervisorInsights | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <Panel
      title="Floor intelligence"
      icon={Sparkles}
      tone="ai"
      action={
        <Button size="sm" variant="outline" onClick={onRun} disabled={loading}>
          <RefreshCw
            className={cn('size-3.5', loading && 'animate-spin')}
            aria-hidden="true"
          />{' '}
          {insights ? 'Re-analyze' : 'Analyze'}
        </Button>
      }
    >
      {error ? (
        <ErrorNote message={error} onRetry={onRun} />
      ) : !insights ? (
        loading ? (
          <ShimmerLines lines={6} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask AI to read the floor: queues, agent load, sentiment, and SLA
            risk.
          </p>
        )
      ) : (
        <div className="space-y-3">
          <p className="font-display text-lg leading-snug font-semibold">
            {insights.headline}
          </p>
          <ul className="space-y-2">
            {insights.insights.map(item => {
              const meta = SEVERITY[item.severity];
              const Icon = meta.icon;
              return (
                <li
                  key={item.title}
                  className={cn('rounded-xl border p-3', meta.className)}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Icon
                      className={cn('size-4', meta.dot)}
                      aria-hidden="true"
                    />{' '}
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-foreground/80">
                    {item.detail}
                  </p>
                  {item.action ? (
                    <p className="mt-1.5 text-xs font-medium text-ai">
                      → {item.action}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {insights.staffing ? (
            <p className="rounded-lg bg-white/70 p-2.5 text-xs">
              <span className="font-semibold">Staffing: </span>
              {insights.staffing}
            </p>
          ) : null}
          <div className="flex items-center justify-between">
            <AiTag label="Agentforce analysis" />
            <span className="text-[11px] text-muted-foreground">
              {relativeTime(insights.generatedAt)}
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function Supervisor() {
  const { refreshOmni } = useConsole();
  const now = useNow();
  const snapshot = useResource(consoleApi.supervisor, 'supervisor', 5000);
  const insights = useResource(consoleApi.supervisorInsights, 'insights');
  const [filter, setFilter] = useState<AgentFilter>('all');
  const [whisperTo, setWhisperTo] = useState<AgentPresence | null>(null);
  const [reassign, setReassign] = useState<WorkItem | null>(null);
  const data = snapshot.data;
  const { refresh } = snapshot;

  const agents = useMemo(() => {
    const list = data?.agents ?? [];
    const order: Record<PresenceStatus, number> = {
      Busy: 0,
      Online: 1,
      Break: 2,
      Offline: 3,
    };
    return list
      .filter(a => filter === 'all' || a.status === filter)
      .sort(
        (a, b) =>
          order[a.status] - order[b.status] ||
          b.usedCapacity - a.usedCapacity ||
          a.name.localeCompare(b.name)
      );
  }, [data?.agents, filter]);

  const setStatus = useCallback(
    async (agent: AgentPresence, status: PresenceStatus) => {
      try {
        await consoleApi.setAgentStatus(agent.userId, status);
        toast.success(`${agent.name} set to ${status}`);
        await Promise.all([refresh(), refreshOmni()]);
      } catch (err) {
        toast.error('Could not change status', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [refresh, refreshOmni]
  );

  const findWork = (workId: string | null | undefined) =>
    workId
      ? ([
          ...(data?.agents.flatMap(a => a.work) ?? []),
          ...(data?.waiting ?? []),
        ].find(w => w.id === workId) ?? null)
      : null;

  const counts = useMemo(() => {
    const base: Record<AgentFilter, number> = {
      all: 0,
      Online: 0,
      Busy: 0,
      Break: 0,
      Offline: 0,
    };
    for (const agent of data?.agents ?? []) {
      base.all += 1;
      base[agent.status] += 1;
    }
    return base;
  }, [data?.agents]);

  const kpis = data?.kpis;
  const historyChannels = Object.entries(data?.history.byChannel ?? {}).sort(
    (a, b) => b[1] - a[1]
  );
  const historyFills = [
    'fill-voice',
    'fill-messaging',
    'fill-case',
    'fill-warning',
    'fill-ai',
  ];

  return (
    <div className="space-y-5">
      <section className="ink-panel animate-rise relative overflow-hidden rounded-2xl p-5 lg:p-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(oklch(1_0_0/0.04)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0/0.04)_1px,transparent_1px)] bg-[size:32px_32px]"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
              <span
                className="size-2 animate-pulse rounded-full bg-positive"
                aria-hidden="true"
              />{' '}
              Live floor ·{' '}
              {new Date(now).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
            <h1 className="mt-1 text-3xl font-semibold lg:text-4xl">
              Command Center
            </h1>
          </div>
          {snapshot.error ? (
            <ErrorNote
              message={snapshot.error}
              onRetry={() => void refresh()}
            />
          ) : null}
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiTile
            label="In queue"
            value={kpis?.queued ?? '–'}
            tone={kpis && kpis.queued > 5 ? 'text-voice' : undefined}
          />
          <KpiTile label="Active" value={kpis?.active ?? '–'} />
          <KpiTile
            label="Agents online"
            value={kpis ? `${kpis.agentsOnline}/${kpis.agentsTotal}` : '–'}
          />
          <KpiTile
            label="Avg wait"
            value={kpis ? formatMinutes(kpis.avgWaitSeconds) : '–'}
            tone={
              kpis && kpis.avgWaitSeconds > 300 ? 'text-negative' : undefined
            }
          />
          <KpiTile
            label="Avg handle"
            value={kpis ? formatMinutes(kpis.avgHandleSeconds) : '–'}
          />
          <KpiTile
            label="Closed today"
            value={kpis?.closedToday ?? '–'}
            tone="text-positive"
          />
          <KpiTile
            label="Alerts"
            value={data?.alerts.length ?? '–'}
            tone={
              data?.alerts.some(a => a.severity === 'critical')
                ? 'text-negative'
                : undefined
            }
          />
        </div>
      </section>

      <LayoutCanvas
        spec={SUPERVISOR_LAYOUT}
        slots={{
          agents: (
            <Panel
              title="Agents"
              icon={Users}
              action={
                <div
                  className="flex flex-wrap gap-1"
                  role="tablist"
                  aria-label="Filter agents"
                >
                  {(['all', 'Busy', 'Online', 'Break', 'Offline'] as const).map(
                    f => (
                      <button
                        key={f}
                        type="button"
                        role="tab"
                        aria-selected={filter === f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                          filter === f
                            ? 'bg-ink text-white'
                            : 'text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {f === 'all' ? 'All' : f}{' '}
                        <span className="font-mono opacity-70">
                          {counts[f]}
                        </span>
                      </button>
                    )
                  )}
                </div>
              }
            >
              {!data ? (
                <ShimmerLines lines={6} />
              ) : agents.length ? (
                <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3">
                  {agents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      now={now}
                      onStatus={(a, s) => void setStatus(a, s)}
                      onWhisper={setWhisperTo}
                      onReassign={setReassign}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="No agents match"
                  detail="Run the seed script to add demo agents, or change the filter."
                />
              )}
            </Panel>
          ),
          routing: <RoutingFeedPanel />,
          queues: (
            <Panel title="Queue board" icon={Layers}>
              {data?.queues.length ? (
                <ul className="space-y-4">
                  {data.queues.map(queue => {
                    const slaClass =
                      queue.oldestWaitSeconds > 900
                        ? 'text-negative'
                        : queue.oldestWaitSeconds > 300
                          ? 'text-warning'
                          : 'text-muted-foreground';
                    return (
                      <li key={queue.name}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{queue.name}</span>
                          <span className="flex items-baseline gap-3">
                            <span className={cn('font-mono text-xs', slaClass)}>
                              oldest {formatMinutes(queue.oldestWaitSeconds)}
                            </span>
                            <span className="font-display text-2xl leading-none font-semibold tabular-nums">
                              {queue.count}
                            </span>
                          </span>
                        </div>
                        <Meter
                          className="mt-2 h-2.5"
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
                        <p className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                          <span>{queue.byChannel.Voice ?? 0} voice</span>
                          <span>
                            {queue.byChannel.Messaging ?? 0} messaging
                          </span>
                          <span>{queue.byChannel.Case ?? 0} case</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={Layers}
                  title="Queues are clear"
                  detail="Nothing is waiting for an agent."
                />
              )}
            </Panel>
          ),
          history: (
            <Panel
              title="Omni-Channel history"
              icon={BarChart3}
              action={
                <span className="text-xs text-muted-foreground">
                  last 30 days
                </span>
              }
            >
              {data ? (
                <div className="space-y-4">
                  <p>
                    <span className="font-display text-4xl font-semibold tabular-nums">
                      {data.history.total.toLocaleString()}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      work items routed by Omni-Channel
                    </span>
                  </p>
                  {historyChannels.length ? (
                    <>
                      <Meter
                        className="h-3"
                        segments={historyChannels.map(([name, count], i) => ({
                          value: count,
                          className: historyFills[i % historyFills.length],
                          label: name,
                        }))}
                      />
                      <ul className="grid grid-cols-2 gap-2 text-xs">
                        {historyChannels.map(([name, count], i) => (
                          <li key={name} className="flex items-center gap-2">
                            <svg
                              className="size-2.5"
                              viewBox="0 0 10 10"
                              aria-hidden="true"
                            >
                              <rect
                                width="10"
                                height="10"
                                rx="2"
                                className={
                                  historyFills[i % historyFills.length]
                                }
                              />
                            </svg>
                            <span className="flex-1 truncate">{name}</span>
                            <span className="font-mono text-muted-foreground">
                              {count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No AgentWork history in the last 30 days.
                    </p>
                  )}
                </div>
              ) : (
                <ShimmerLines lines={4} />
              )}
            </Panel>
          ),
          waiting: (
            <Panel
              title="Waiting for an agent"
              icon={Hourglass}
              action={
                <span className="text-xs text-muted-foreground">
                  {data?.waiting.length ?? 0}
                </span>
              }
              bodyClassName="px-2 pb-2"
            >
              {data?.waiting.length ? (
                <ul>
                  {data.waiting.map(work => (
                    <li
                      key={work.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/60"
                    >
                      <ChannelIcon channel={work.channel} className="size-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {work.customerName ?? work.subject}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {work.queue} · waiting{' '}
                          {formatMinutes(secondsSince(work.createdAt, now))}
                        </span>
                      </span>
                      <PriorityBadge priority={work.priority} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReassign(work)}
                      >
                        Assign
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 pb-2 text-sm text-muted-foreground">
                  Nothing waiting — every customer is with an agent.
                </p>
              )}
            </Panel>
          ),
          alerts: (
            <Panel
              title="Live alerts"
              icon={BellRing}
              action={
                <span className="text-xs text-muted-foreground">
                  {data?.alerts.length ?? 0}
                </span>
              }
            >
              {data?.alerts.length ? (
                <ul className="space-y-2">
                  {data.alerts.map((alert, index) => {
                    const meta = SEVERITY[alert.severity];
                    const Icon = meta.icon;
                    const work = findWork(alert.workId);
                    const agent = alert.agentId
                      ? (data.agents.find(a => a.userId === alert.agentId) ??
                        null)
                      : null;
                    return (
                      <li
                        key={`${alert.title}-${index}`}
                        className={cn('rounded-xl border p-3', meta.className)}
                      >
                        <p className="flex items-start gap-2 text-sm font-semibold">
                          <Icon
                            className={cn('mt-0.5 size-4 shrink-0', meta.dot)}
                            aria-hidden="true"
                          />{' '}
                          {alert.title}
                        </p>
                        <p className="mt-1 pl-6 text-xs text-foreground/80">
                          {alert.detail}
                        </p>
                        {work || agent ? (
                          <div className="mt-2 flex gap-2 pl-6">
                            {work ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReassign(work)}
                              >
                                {work.agentId ? 'Reassign' : 'Assign'}
                              </Button>
                            ) : null}
                            {agent ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setWhisperTo(agent)}
                              >
                                Whisper
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={BellRing}
                  title="All clear"
                  detail="No SLA, sentiment, or capacity risks right now."
                />
              )}
            </Panel>
          ),
          insights: (
            <InsightsPanel
              insights={insights.data}
              loading={insights.loading}
              error={insights.error}
              onRun={() => void insights.refresh()}
            />
          ),
        }}
      />

      <WhisperDialog
        agent={whisperTo}
        onClose={() => setWhisperTo(null)}
        onDone={() => void refresh()}
      />
      <ReassignDialog
        work={reassign}
        agents={data?.agents ?? []}
        onClose={() => setReassign(null)}
        onDone={() => void refresh()}
      />
    </div>
  );
}

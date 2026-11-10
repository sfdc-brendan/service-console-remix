import { useCallback, useMemo, useState } from 'react';
import { Loader2, Pencil, RefreshCw, Route, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/sonner';
import {
  consoleApi,
  type CatalogSkill,
  type WorkRouting,
  type WorkStatus,
} from '@/api/console/consoleApi';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  ErrorNote,
  Panel,
  ShimmerLines,
} from '@/components/console/primitives';
import { AnalysisCard, RoutingTimeline } from './RoutingBlocks';

const LIVE: ReadonlySet<WorkStatus> = new Set([
  'Analyzing',
  'Queued',
  'Offered',
]);

const STATUS_TONE: Record<WorkStatus, string> = {
  Analyzing: 'bg-ai/15 text-ai',
  Queued: 'bg-warning/25 text-foreground',
  Offered: 'bg-case/15 text-case',
  Accepted: 'bg-positive/15 text-positive',
  Declined: 'bg-negative/12 text-negative',
  Closed: 'bg-muted text-muted-foreground',
};

function SkillEditor({
  routing,
  onSaved,
}: {
  routing: WorkRouting;
  onSaved: (next: WorkRouting) => void;
}) {
  const work = routing.work;
  const tagged = routing.analysis?.skills ?? [];
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [required, setRequired] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const catalog = useResource(
    consoleApi.skillCatalog,
    open ? 'skill-catalog' : null
  );

  const reset = () => {
    setSelected(tagged.map(skill => skill.name));
    setRequired(tagged.find(skill => skill.level === 'required')?.name ?? null);
  };

  const options = useMemo<CatalogSkill[]>(() => {
    const list = [...(catalog.data ?? [])];
    for (const name of selected) {
      if (!list.some(skill => skill.name === name)) {
        list.push({ name, source: 'agent', agents: 0, online: 0 });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog.data, selected]);

  if (!work) {
    return null;
  }

  const toggle = (name: string) => {
    setSelected(prev => {
      if (prev.includes(name)) {
        if (required === name) {
          setRequired(null);
        }
        return prev.filter(value => value !== name);
      }
      return [...prev, name];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await consoleApi.retagWork(work.id, selected, required));
      toast.success('Skills updated', {
        description: LIVE.has(work.status)
          ? 'Routing re-scored agents with the new tags.'
          : 'Saved for reporting on this work.',
      });
      setOpen(false);
    } catch (err) {
      toast.error('Could not update skills', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) {
          reset();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" /> Skills
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Skills on this work</p>
          <p className="text-xs text-muted-foreground">
            Check the skills it needs. Star the one an agent must have.
          </p>
        </div>
        {catalog.error ? (
          <div className="p-3">
            <ErrorNote
              message={catalog.error}
              onRetry={() => void catalog.refresh()}
            />
          </div>
        ) : !catalog.data ? (
          <div className="p-3">
            <ShimmerLines lines={4} />
          </div>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto">
            {options.map(skill => {
              const checked = selected.includes(skill.name);
              const isRequired = required === skill.name;
              return (
                <li
                  key={skill.name}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(skill.name)}
                      className="size-4 accent-ink"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {skill.name}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] tabular-nums',
                        skill.online
                          ? 'text-muted-foreground'
                          : 'text-negative/80'
                      )}
                    >
                      {skill.online}/{skill.agents} online
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!checked}
                    onClick={() => setRequired(isRequired ? null : skill.name)}
                    aria-pressed={isRequired}
                    aria-label={`Make ${skill.name} required`}
                    className={cn(
                      'rounded p-1 transition-colors disabled:opacity-30',
                      isRequired
                        ? 'text-ai'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Star
                      className={cn('size-4', isRequired && 'fill-current')}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saving
              ? 'Saving…'
              : LIVE.has(work.status)
                ? 'Save & re-route'
                : 'Save'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** How this work was analyzed, which skills it carries, and every routing decision since. */
export function RoutingPanel({
  caseId,
  workId,
  title = 'Routing & skills',
}: {
  caseId?: string | null;
  workId?: string | null;
  title?: string;
}) {
  const key = workId ? `work-${workId}` : caseId ? `case-${caseId}` : null;
  const [live, setLive] = useState(true);
  const routing = useResource(
    useCallback(
      () =>
        workId
          ? consoleApi.workRouting(workId)
          : consoleApi.caseRouting(caseId ?? ''),
      [workId, caseId]
    ),
    key,
    live ? 4000 : null,
    { keepPrevious: true }
  );
  const data = routing.data;
  const work = data?.work ?? null;
  const isLive = work ? LIVE.has(work.status) : false;
  if (data && isLive !== live) {
    setLive(isLive);
  }
  const now = useNow(isLive ? 1000 : 30000);
  const [rerunning, setRerunning] = useState(false);

  const rerun = async () => {
    if (!work) {
      return;
    }
    setRerunning(true);
    try {
      routing.setData(await consoleApi.retriage(work.id));
      toast.success('Case re-analyzed');
    } catch (err) {
      toast.error('Could not re-run triage', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRerunning(false);
    }
  };

  return (
    <Panel
      title={title}
      icon={Route}
      action={
        data && work ? (
          <div className="flex items-center gap-1">
            <SkillEditor
              routing={data}
              onSaved={next => routing.setData(next)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void rerun()}
              disabled={rerunning}
              aria-label="Re-run AI triage"
              title="Re-run AI triage"
            >
              <RefreshCw
                className={cn('size-3.5', rerunning && 'animate-spin')}
                aria-hidden="true"
              />
            </Button>
          </div>
        ) : null
      }
      bodyClassName="space-y-4"
    >
      {routing.error && !data ? (
        <ErrorNote
          message={routing.error}
          onRetry={() => void routing.refresh()}
        />
      ) : !data ? (
        <ShimmerLines lines={5} />
      ) : !work ? (
        <EmptyState
          icon={Route}
          title="Not routed yet"
          detail="Cases created from now on are analyzed by AI and routed on skills automatically."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold',
                STATUS_TONE[work.status]
              )}
            >
              {work.status === 'Analyzing' ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : null}
              {work.status === 'Analyzing' ? 'AI is analyzing' : work.status}
            </span>
            {work.queue ? (
              <span className="rounded-full bg-muted px-2.5 py-1">
                {work.queue}
              </span>
            ) : null}
            {work.agentName ? (
              <span className="text-muted-foreground">
                with {work.agentName}
              </span>
            ) : null}
            {isLive ? (
              <span className="ml-auto font-mono tabular-nums text-muted-foreground">
                waiting{' '}
                {formatDuration(
                  Math.max(0, (now - new Date(work.createdAt).getTime()) / 1000)
                )}
              </span>
            ) : null}
          </div>
          {data.analysis ? (
            <AnalysisCard
              analysis={data.analysis}
              coverage={data.coverage}
              priority={work.priority}
            />
          ) : work.status === 'Analyzing' ? (
            <div className="rounded-xl border border-ai/25 bg-ai/5 p-3">
              <ShimmerLines lines={3} />
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Routing events
            </p>
            <RoutingTimeline events={data.events} now={now} />
          </div>
        </>
      )}
    </Panel>
  );
}

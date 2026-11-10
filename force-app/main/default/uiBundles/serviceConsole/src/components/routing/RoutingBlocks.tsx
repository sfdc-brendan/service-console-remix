import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRightLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleCheckBig,
  Hourglass,
  Inbox,
  Maximize2,
  Minus,
  PencilLine,
  Radio,
  ScanText,
  Sparkles,
  Star,
  Tags,
  TimerOff,
  Undo2,
  UserRound,
  UserRoundCog,
  XCircle,
} from 'lucide-react';
import type {
  RoutingAnalysis,
  RoutingCandidate,
  RoutingEvent,
  RoutingEventType,
  SkillLevel,
  SkillSource,
  TaggedSkill,
  TriageModel,
  WorkRouting,
} from '@/api/console/consoleApi';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '@/components/console/primitives';

const EVENT_META: Record<RoutingEventType, { icon: LucideIcon; tone: string }> =
  {
    received: { icon: Inbox, tone: 'bg-muted text-foreground' },
    analyzed: { icon: Sparkles, tone: 'bg-ai/15 text-ai' },
    tagged: { icon: Tags, tone: 'bg-ai/15 text-ai' },
    waiting: { icon: Hourglass, tone: 'bg-warning/25 text-foreground' },
    relaxed: { icon: Maximize2, tone: 'bg-warning/25 text-foreground' },
    offered: { icon: Radio, tone: 'bg-case/15 text-case' },
    declined: { icon: XCircle, tone: 'bg-negative/12 text-negative' },
    timeout: { icon: TimerOff, tone: 'bg-negative/12 text-negative' },
    requeued: { icon: Undo2, tone: 'bg-muted text-muted-foreground' },
    accepted: { icon: CheckCircle2, tone: 'bg-positive/15 text-positive' },
    transferred: { icon: ArrowRightLeft, tone: 'bg-voice/15 text-voice' },
    retagged: { icon: PencilLine, tone: 'bg-ai/15 text-ai' },
    reassigned: { icon: UserRoundCog, tone: 'bg-messaging/15 text-messaging' },
    closed: { icon: CircleCheckBig, tone: 'bg-muted text-muted-foreground' },
  };

const SOURCE_META: Record<SkillSource, { icon: LucideIcon; label: string }> = {
  ai: { icon: Sparkles, label: 'Tagged by AI' },
  rules: { icon: ScanText, label: 'Matched on keywords' },
  manual: { icon: UserRound, label: 'Tagged by a person' },
  transfer: { icon: ArrowRightLeft, label: 'Set by a transfer' },
};

const MODEL_LABEL: Record<TriageModel, string> = {
  ai: 'AI triage',
  rules: 'Keyword triage',
  manual: 'Manual tags',
};

export function SkillChip({
  name,
  level,
  state,
  proficiency,
  tone = 'light',
  title,
}: {
  name: string;
  level?: SkillLevel;
  state?: 'matched' | 'missing';
  proficiency?: number;
  tone?: 'light' | 'dark';
  title?: string;
}) {
  const required = level === 'required';
  return (
    <span
      title={title ?? (required ? `${name} · required` : name)}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'dark'
          ? required
            ? 'bg-white/20 text-white ring-1 ring-white/40'
            : 'bg-white/8 text-white/80 ring-1 ring-white/15'
          : required
            ? 'bg-ai/15 text-ai ring-1 ring-ai/40'
            : 'border border-dashed border-ai/40 text-foreground/80',
        state === 'missing' && 'opacity-60'
      )}
    >
      {state === 'matched' ? (
        <Check
          className={cn(
            'size-3 shrink-0',
            tone === 'dark' ? 'text-positive' : 'text-positive'
          )}
          aria-label="Agent has this skill"
        />
      ) : state === 'missing' ? (
        <Minus
          className="size-3 shrink-0"
          aria-label="Agent lacks this skill"
        />
      ) : required ? (
        <Star className="size-3 shrink-0 fill-current" aria-hidden="true" />
      ) : null}
      <span className="truncate">{name}</span>
      {proficiency ? (
        <span className="font-mono text-[10px] opacity-70">{proficiency}</span>
      ) : null}
    </span>
  );
}

/** Skill tags with how this agent matched each one. */
export function SkillMatch({
  skills,
  matched,
  levels,
  tone = 'light',
}: {
  skills: TaggedSkill[];
  matched?: string[];
  levels?: Record<string, number>;
  tone?: 'light' | 'dark';
}) {
  if (!skills.length) {
    return null;
  }
  const has = new Set((matched ?? []).map(s => s.toLowerCase()));
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Skills this work needs">
      {skills.map(skill => (
        <li key={skill.name} className="max-w-full">
          <SkillChip
            name={skill.name}
            level={skill.level}
            tone={tone}
            proficiency={levels?.[skill.name]}
            state={
              matched
                ? has.has(skill.name.toLowerCase())
                  ? 'matched'
                  : 'missing'
                : undefined
            }
            title={[
              skill.level === 'required' ? 'Required' : 'Preferred',
              skill.reason,
              `${skill.confidence}% confidence`,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        </li>
      ))}
    </ul>
  );
}

export function AnalysisCard({
  analysis,
  coverage,
  priority,
}: {
  analysis: RoutingAnalysis;
  coverage?: WorkRouting['coverage'];
  priority?: string | null;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-ai/25 bg-ai/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ai">
            {analysis.model === 'ai' ? (
              <Sparkles className="size-3.5" aria-hidden="true" />
            ) : (
              <ScanText className="size-3.5" aria-hidden="true" />
            )}
            {MODEL_LABEL[analysis.model]}
            {analysis.category ? (
              <span className="font-normal normal-case tracking-normal text-muted-foreground">
                · {analysis.category}
              </span>
            ) : null}
          </p>
          <p className="mt-1 font-display text-base leading-snug font-semibold">
            {analysis.intent || 'Routed without a stated intent'}
          </p>
        </div>
        <ConfidenceRing value={analysis.confidence} />
      </div>
      {analysis.summary ? (
        <p className="text-sm leading-relaxed text-foreground/85">
          {analysis.summary}
        </p>
      ) : null}
      {analysis.signals.length ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Signals in the case
          </p>
          <ul className="flex flex-wrap gap-1">
            {analysis.signals.map(signal => (
              <li
                key={signal}
                className="rounded-md bg-card px-2 py-0.5 text-xs ring-1 ring-border"
              >
                “{signal}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Skills tagged
        </p>
        {analysis.skills.length ? (
          <ul className="space-y-2">
            {analysis.skills.map(skill => {
              const source = SOURCE_META[skill.source];
              const SourceIcon = source.icon;
              const staffed = coverage?.[skill.name];
              return (
                <li key={skill.name} className="flex gap-2.5">
                  <SkillChip name={skill.name} level={skill.level} />
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <SourceIcon
                        className="size-3 shrink-0"
                        aria-label={source.label}
                      />
                      <span className="tabular-nums">{skill.confidence}%</span>
                      {staffed ? (
                        <span
                          className={cn(
                            'tabular-nums',
                            staffed.online === 0 && 'font-medium text-negative'
                          )}
                        >
                          · {staffed.agents} agent
                          {staffed.agents === 1 ? '' : 's'}, {staffed.online}{' '}
                          online
                        </span>
                      ) : null}
                    </span>
                    {skill.reason ? (
                      <span className="block text-foreground/80">
                        {skill.reason}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No specialist skills; any agent on the channel can take it.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {analysis.language ? (
          <span className="rounded-full bg-card px-2 py-0.5 ring-1 ring-border">
            {analysis.language}
          </span>
        ) : null}
        <span className="rounded-full bg-card px-2 py-0.5 ring-1 ring-border">
          {analysis.sentiment} sentiment
        </span>
        {analysis.suggestedPriority &&
        analysis.suggestedPriority !== priority ? (
          <span className="rounded-full bg-warning/20 px-2 py-0.5 font-medium">
            AI suggests {analysis.suggestedPriority} priority
          </span>
        ) : null}
        {analysis.fallbackReason ? (
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
            title={analysis.fallbackReason}
          >
            Model unavailable
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ConfidenceRing({ value }: { value: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="relative inline-flex size-11 shrink-0 items-center justify-center"
      title={`${value}% confident in this routing`}
    >
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="fill-none stroke-ai/15"
          strokeWidth="4"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="fill-none stroke-ai transition-[stroke-dashoffset] duration-700"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className="font-mono text-[11px] font-semibold tabular-nums">
        {value}
      </span>
    </span>
  );
}

export function CandidateBoard({
  candidates,
  chosenId,
}: {
  candidates: RoutingCandidate[];
  chosenId?: string | null;
}) {
  if (!candidates.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No agents were online to score.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {candidates.map((candidate, index) => {
        const chosen = candidate.agentId === chosenId;
        return (
          <li
            key={candidate.agentId}
            className={cn(
              'rounded-lg border bg-card p-2',
              chosen && 'border-case/50 ring-1 ring-case/30'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <PersonAvatar name={candidate.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{candidate.name}</span>
                  {candidate.virtual ? (
                    <Bot
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="Virtual agent"
                    />
                  ) : null}
                  {chosen ? (
                    <span className="rounded-full bg-case/15 px-1.5 text-[10px] font-semibold text-case">
                      Chosen
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'block truncate text-[11px]',
                    candidate.eligible
                      ? 'text-muted-foreground'
                      : 'text-negative'
                  )}
                >
                  {candidate.eligible
                    ? `Eligible · load ${candidate.load}/${candidate.capacity}`
                    : candidate.reason}
                </span>
              </span>
              <span className="w-16 shrink-0 text-right">
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {candidate.score}
                </span>
                <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      chosen
                        ? 'bg-case'
                        : candidate.eligible
                          ? 'bg-ink/50'
                          : 'bg-muted-foreground/30'
                    )}
                    style={{ width: `${candidate.score}%` }}
                  />
                </span>
              </span>
            </div>
            {candidate.matched.length || candidate.missing.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1 pl-6">
                {candidate.matched.map(skill => (
                  <li key={skill}>
                    <SkillChip
                      name={skill}
                      state="matched"
                      proficiency={candidate.levels[skill]}
                    />
                  </li>
                ))}
                {candidate.missing.map(skill => (
                  <li key={skill}>
                    <SkillChip name={skill} state="missing" />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function EventRow({
  event,
  defaultOpen,
  now,
}: {
  event: RoutingEvent;
  defaultOpen: boolean;
  now?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const candidates = event.candidates ?? [];
  return (
    <li className="relative flex gap-3">
      <span
        className={cn(
          'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
          meta.tone
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{event.title}</p>
          <time
            className="shrink-0 text-[11px] text-muted-foreground"
            dateTime={event.at}
            title={formatDateTime(event.at)}
          >
            {relativeTime(event.at, now)}
          </time>
        </div>
        {event.detail ? (
          <p className="text-xs text-muted-foreground">{event.detail}</p>
        ) : null}
        {event.skills?.length ? (
          <div className="mt-1.5">
            <SkillMatch skills={event.skills} />
          </div>
        ) : null}
        {event.type === 'analyzed' && event.signals?.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {event.signals.map(signal => (
              <li
                key={signal}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
              >
                “{signal}”
              </li>
            ))}
          </ul>
        ) : null}
        {candidates.length ? (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen(value => !value)}
              aria-expanded={open}
              className="flex items-center gap-1 text-xs font-medium text-case hover:underline"
            >
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform',
                  open && 'rotate-180'
                )}
                aria-hidden="true"
              />
              {open ? 'Hide' : 'Show'} {candidates.length} agent
              {candidates.length === 1 ? '' : 's'} scored
            </button>
            {open ? (
              <div className="mt-2">
                <CandidateBoard
                  candidates={candidates}
                  chosenId={event.agentId}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Every routing decision for a piece of work, oldest first. */
export function RoutingTimeline({
  events,
  now,
}: {
  events: RoutingEvent[];
  now?: number;
}) {
  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground">No routing events yet.</p>
    );
  }
  let lastScored = -1;
  events.forEach((event, index) => {
    if (event.candidates?.length) {
      lastScored = index;
    }
  });
  return (
    <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
      {events.map((event, index) => (
        <EventRow
          key={`${event.type}-${event.at}-${index}`}
          event={event}
          defaultOpen={index === lastScored}
          now={now}
        />
      ))}
    </ol>
  );
}

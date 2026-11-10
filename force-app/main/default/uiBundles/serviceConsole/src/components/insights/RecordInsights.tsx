import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowUpRight,
  Clock4,
  History,
  NotebookPen,
  Save,
  Search,
  Timer,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type ConversationMessage } from '@/api/console/consoleApi';
import { useCustomer360 } from '@/context/customer360Context';
import {
  useCustomerInsight,
  useCustomerProfile,
} from '@/hooks/useCustomerProfile';
import { useResource } from '@/hooks/useResource';
import { formatDuration, formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  ErrorNote,
  Meter,
  Panel,
  PersonAvatar,
  ShimmerLines,
  Textarea,
} from '@/components/console/primitives';
import {
  customerHealth,
  HealthRing,
  InteractionTimeline,
} from '@/components/customer/CustomerBlocks';

/** Closed cases that look like this one, with how they were resolved. */
export function SimilarCasesPanel({ caseId }: { caseId: string }) {
  const similar = useResource(
    useCallback(() => consoleApi.similarCases(caseId), [caseId]),
    `similar-${caseId}`
  );
  const data = similar.data;
  return (
    <Panel
      title="Similar resolved cases"
      icon={Search}
      action={
        data?.terms.length ? (
          <span
            className="max-w-44 truncate text-xs text-muted-foreground"
            title={`Matched on: ${data.terms.join(', ')}`}
          >
            {data.terms.join(' · ')}
          </span>
        ) : null
      }
      bodyClassName="px-2 pb-2"
    >
      {similar.error ? (
        <div className="px-2">
          <ErrorNote
            message={similar.error}
            onRetry={() => void similar.refresh()}
          />
        </div>
      ) : !data ? (
        <ShimmerLines lines={4} className="px-2 pb-2" />
      ) : data.items.length ? (
        <ul>
          {data.items.map(item => (
            <li key={item.id}>
              <Link
                to={`/case/${item.id}`}
                className="block rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.caseNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.subject || '(no subject)'}
                  </span>
                  {item.resolutionMinutes !== null ? (
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground"
                      title="Time to resolve"
                    >
                      {formatMinutes(item.resolutionMinutes * 60)}
                    </span>
                  ) : null}
                </span>
                {item.resolution ? (
                  <span className="mt-1 block line-clamp-2 border-l-2 border-positive/50 pl-2 text-xs text-foreground/75">
                    {item.resolution}
                  </span>
                ) : null}
                {item.matched.length ? (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {item.matched.map(term => (
                      <span
                        key={term}
                        className="rounded bg-case/10 px-1.5 py-0.5 text-[10px] font-medium text-case"
                      >
                        {term}
                      </span>
                    ))}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Search}
          title="Nothing similar yet"
          detail="No closed cases share key terms with this subject."
        />
      )}
    </Panel>
  );
}

/** Compact Customer 360 for record pages: health, AI read, and recent history. */
export function CustomerSnapshotPanel({
  recordId,
  name,
}: {
  recordId: string;
  name: string | null;
}) {
  const { openCustomer } = useCustomer360();
  const profile = useCustomerProfile(recordId);
  const insight = useCustomerInsight(profile.data?.contact.id ?? null);
  const data = profile.data;
  return (
    <Panel
      title="Customer snapshot"
      icon={UserRound}
      action={
        data ? (
          <Link
            to={`/contact/${data.contact.id}`}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-case hover:underline"
          >
            Full profile <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {profile.error ? (
        <p className="text-sm text-muted-foreground">{profile.error}</p>
      ) : !data ? (
        <ShimmerLines lines={5} />
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => openCustomer(recordId, name ?? data.contact.name)}
            className="-m-1.5 flex w-[calc(100%+0.75rem)] items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Open Customer 360 for ${data.contact.name}`}
          >
            <PersonAvatar name={data.contact.name} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {data.contact.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[data.contact.title, data.account?.name]
                  .filter(Boolean)
                  .join(' · ') || 'Customer'}
              </span>
            </span>
            <HealthRing
              health={customerHealth(data, insight.data?.relationship)}
              variant="light"
            />
          </button>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Open', value: data.stats.openCases },
              { label: 'All cases', value: data.stats.totalCases },
              { label: '30-day touches', value: data.stats.interactions30d },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg bg-muted/60 py-2">
                <dd className="font-display text-xl leading-none font-semibold tabular-nums">
                  {stat.value}
                </dd>
                <dt className="mt-1 text-[10px] text-muted-foreground">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
          {insight.data ? (
            <p className="rounded-lg bg-ai/8 p-2.5 text-xs leading-relaxed text-foreground/85">
              <span className="font-semibold text-ai">AI read: </span>
              {insight.data.headline}
              {insight.data.approach ? ` ${insight.data.approach}` : ''}
            </p>
          ) : insight.loading ? (
            <ShimmerLines lines={2} />
          ) : null}
          <InteractionTimeline items={data.timeline} limit={3} />
        </div>
      )}
    </Panel>
  );
}

/** Customer interactions across channels, for the case page. */
export function CustomerHistoryPanel({ recordId }: { recordId: string }) {
  const profile = useCustomerProfile(recordId);
  return (
    <Panel title="Customer history" icon={History}>
      {profile.error ? (
        <p className="text-sm text-muted-foreground">{profile.error}</p>
      ) : !profile.data ? (
        <ShimmerLines lines={5} />
      ) : (
        <InteractionTimeline
          items={profile.data.timeline}
          filterable
          limit={8}
        />
      )}
    </Panel>
  );
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Live pace: how long the customer has waited, response times, and talk share. */
export function ResponsePacePanel({
  messages,
  live,
  now,
  targetSeconds,
  variant,
}: {
  messages: ConversationMessage[];
  live: boolean;
  now: number;
  targetSeconds: number;
  variant: 'voice' | 'chat';
}) {
  const turns = messages.filter(
    m => m.sender === 'Customer' || m.sender === 'Agent'
  );
  const responses: number[] = [];
  let agentWords = 0;
  let customerWords = 0;
  turns.forEach((turn, index) => {
    if (turn.sender === 'Agent') {
      agentWords += words(turn.body);
    } else {
      customerWords += words(turn.body);
    }
    const previous = turns[index - 1];
    if (turn.sender === 'Agent' && previous?.sender === 'Customer') {
      responses.push(
        (new Date(turn.sentAt).getTime() -
          new Date(previous.sentAt).getTime()) /
          1000
      );
    }
  });
  const last = turns[turns.length - 1];
  const waiting =
    live && last?.sender === 'Customer'
      ? Math.max(0, (now - new Date(last.sentAt).getTime()) / 1000)
      : null;
  const average = responses.length
    ? responses.reduce((sum, value) => sum + value, 0) / responses.length
    : null;
  const longest = responses.length ? Math.max(...responses) : null;
  const tone =
    waiting === null
      ? 'text-muted-foreground'
      : waiting < targetSeconds * 0.6
        ? 'text-positive'
        : waiting < targetSeconds
          ? 'text-warning'
          : 'text-negative';
  const talkTotal = agentWords + customerWords;
  return (
    <Panel title="Response pace" icon={Timer}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {waiting === null
                ? 'Ball is with the customer'
                : 'Customer waiting'}
            </p>
            <p
              className={cn(
                'font-mono text-3xl font-medium tabular-nums',
                tone
              )}
              aria-live="off"
            >
              {waiting === null ? '—' : formatDuration(waiting)}
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Target {formatDuration(targetSeconds)}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="text-[11px] text-muted-foreground">
              Avg {variant === 'voice' ? 'reply gap' : 'response'}
            </dt>
            <dd className="font-mono tabular-nums">
              {average === null ? '—' : formatDuration(average)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="text-[11px] text-muted-foreground">Longest</dt>
            <dd
              className={cn(
                'font-mono tabular-nums',
                longest !== null && longest > targetSeconds && 'text-negative'
              )}
            >
              {longest === null ? '—' : formatDuration(longest)}
            </dd>
          </div>
        </dl>
        <div>
          <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>
              You {talkTotal ? Math.round((agentWords / talkTotal) * 100) : 0}%
            </span>
            <span>Talk share</span>
            <span>
              Customer{' '}
              {talkTotal ? Math.round((customerWords / talkTotal) * 100) : 0}%
            </span>
          </div>
          <Meter
            segments={[
              { value: agentWords, className: 'fill-case', label: 'You' },
              {
                value: customerWords,
                className:
                  variant === 'voice' ? 'fill-voice' : 'fill-messaging',
                label: 'Customer',
              },
            ]}
          />
        </div>
      </div>
    </Panel>
  );
}

/** Private scratchpad per conversation; timestamp moments and post to the case. */
export function ConversationNotesPanel({
  workId,
  caseId,
  elapsedSeconds,
}: {
  workId: string;
  caseId: string | null;
  elapsedSeconds: number;
}) {
  const storageKey = `slk-notes-${workId}`;
  const [notes, setNotes] = useState(
    () => window.localStorage.getItem(storageKey) ?? ''
  );
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (notes) {
        window.localStorage.setItem(storageKey, notes);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [notes, storageKey]);

  const stamp = () => {
    const mark = `[${formatDuration(elapsedSeconds)}] `;
    const area = areaRef.current;
    const at = area?.selectionStart ?? notes.length;
    const prefix = notes.slice(0, at);
    const needsBreak = prefix && !prefix.endsWith('\n') ? '\n' : '';
    const next = `${prefix}${needsBreak}${mark}${notes.slice(at)}`;
    setNotes(next);
    window.requestAnimationFrame(() => {
      const caret = prefix.length + needsBreak.length + mark.length;
      area?.focus();
      area?.setSelectionRange(caret, caret);
    });
  };

  const saveToCase = async () => {
    if (!caseId || !notes.trim()) {
      return;
    }
    setSaving(true);
    try {
      await consoleApi.executeAction(caseId, {
        type: 'addComment',
        payload: { body: `Agent notes:\n${notes.trim()}` },
      });
      toast.success('Notes saved to the case');
    } catch (err) {
      toast.error('Could not save notes', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="My notes"
      icon={NotebookPen}
      action={
        <span className="text-[11px] text-muted-foreground">
          {notes ? 'Saved on this device' : 'Private'}
        </span>
      }
    >
      <Textarea
        ref={areaRef}
        rows={5}
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Jot down account numbers, promises, next steps…"
        aria-label="Conversation notes"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={stamp}>
          <Clock4 className="size-3.5" aria-hidden="true" /> Timestamp
        </Button>
        <span className="flex-1" />
        {caseId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!notes.trim() || saving}
            onClick={() => void saveToCase()}
          >
            <Save className="size-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save to case'}
          </Button>
        ) : null}
      </div>
      {caseId ? null : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Link a case to post these notes as a comment.
        </p>
      )}
    </Panel>
  );
}

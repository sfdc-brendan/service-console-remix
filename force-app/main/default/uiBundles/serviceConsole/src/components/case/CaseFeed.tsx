import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  CheckSquare,
  Lock,
  Mail,
  MailOpen,
  MessageSquare,
  Send,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type NoteStyle } from '@/api/console/consoleApi';
import { addCaseComment, type CaseRecord } from '@/api/console/recordService';
import { useResource } from '@/hooks/useResource';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Panel, Textarea } from '@/components/console/primitives';

interface FeedEntry {
  id: string;
  at: string | null;
  icon: LucideIcon;
  tone: string;
  title: string;
  meta: string;
  body?: string;
}

type Filter = 'all' | 'comments' | 'emails' | 'tasks';

const NOTE_STYLES: { id: NoteStyle; label: string; hint: string }[] = [
  { id: 'summary', label: 'Status update', hint: 'Where the case stands' },
  {
    id: 'handoff',
    label: 'Handoff note',
    hint: 'So a teammate can pick it up',
  },
  { id: 'nextSteps', label: 'Next steps', hint: 'Checklist with owners' },
  { id: 'customer', label: 'Customer update', hint: 'Visible to the customer' },
];

export function CaseFeed({
  record,
  onChanged,
}: {
  record: CaseRecord;
  onChanged: () => void;
}) {
  const emails = useResource(
    useCallback(() => consoleApi.caseEmails(record.id), [record.id]),
    record.id,
    20000
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [note, setNote] = useState('');
  const [publicNote, setPublicNote] = useState(false);
  const [busy, setBusy] = useState<'post' | 'polish' | 'generate' | null>(null);

  const entries = useMemo<FeedEntry[]>(() => {
    const items: (FeedEntry & { kind: Exclude<Filter, 'all'> })[] = [
      ...record.comments.map(c => ({
        kind: 'comments' as const,
        id: c.id,
        at: c.createdDate,
        icon: c.isPublished ? MessageSquare : Lock,
        tone: c.isPublished
          ? 'bg-case/10 text-case'
          : 'bg-muted text-muted-foreground',
        title: c.isPublished ? 'Public comment' : 'Internal note',
        meta: c.createdBy,
        body: c.body,
      })),
      ...(emails.data ?? []).map(e => ({
        kind: 'emails' as const,
        id: e.id,
        at: e.sentAt,
        icon: e.incoming ? MailOpen : Mail,
        tone: e.incoming
          ? 'bg-voice/10 text-voice'
          : 'bg-messaging/10 text-messaging',
        title: e.subject ?? '(no subject)',
        meta: e.incoming
          ? `From ${e.fromName || e.fromAddress || 'customer'}`
          : `To ${e.toAddress ?? 'customer'}`,
        body: e.body ?? undefined,
      })),
      ...record.tasks.map(t => ({
        kind: 'tasks' as const,
        id: t.id,
        at: t.createdDate,
        icon: CheckSquare,
        tone: 'bg-warning/20 text-foreground',
        title: t.subject || 'Task',
        meta: [t.status, t.activityDate ? `due ${t.activityDate}` : null]
          .filter(Boolean)
          .join(' · '),
      })),
    ];
    return items
      .filter(item => filter === 'all' || item.kind === filter)
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }, [record.comments, record.tasks, emails.data, filter]);

  const post = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }
    setBusy('post');
    try {
      await addCaseComment(record.id, note.trim(), publicNote);
      setNote('');
      toast.success(
        publicNote ? 'Comment shared with customer' : 'Internal note added'
      );
      onChanged();
    } catch (err) {
      toast.error('Could not post', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const polish = async () => {
    setBusy('polish');
    try {
      const result = await consoleApi.rewrite(
        note,
        publicNote
          ? 'warm, professional, customer-facing'
          : 'concise internal note'
      );
      setNote(result.text);
    } catch (err) {
      toast.error('Could not rewrite', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const generate = async (style: NoteStyle) => {
    setBusy('generate');
    try {
      const draft = await consoleApi.draftNote(record.id, style, note);
      setNote(draft.text);
      setPublicNote(draft.isPublic);
    } catch (err) {
      toast.error('Could not draft a note', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'comments', label: 'Comments' },
    { id: 'emails', label: 'Emails' },
    { id: 'tasks', label: 'Tasks' },
  ];

  return (
    <Panel title="Activity" icon={MessageSquare} bodyClassName="space-y-4">
      <form
        onSubmit={event => void post(event)}
        className="rounded-xl border bg-muted/40 p-2"
      >
        <Textarea
          rows={3}
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder={
            busy === 'generate'
              ? 'Drafting from the case details…'
              : publicNote
                ? 'Write a comment the customer will see…'
                : 'Add an internal note… or Generate one from the case'
          }
          disabled={busy === 'generate'}
          aria-busy={busy === 'generate'}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          aria-label="Case comment"
        />
        <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={publicNote}
              onChange={event => setPublicNote(event.target.checked)}
              className="size-4 accent-ink"
            />
            Visible to customer
          </label>
          <span className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-ai"
                disabled={busy !== null}
              >
                <Sparkles
                  className={cn(
                    'size-3.5',
                    busy === 'generate' && 'animate-pulse'
                  )}
                  aria-hidden="true"
                />
                {busy === 'generate' ? 'Generating…' : 'Generate'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {note.trim()
                  ? 'Build on your notes as a…'
                  : 'Draft from the case as a…'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {NOTE_STYLES.map(style => (
                <DropdownMenuItem
                  key={style.id}
                  onSelect={() => void generate(style.id)}
                  className="flex-col items-start gap-0"
                >
                  <span className="text-sm">{style.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {style.hint}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-ai"
            disabled={!note.trim() || busy !== null}
            onClick={() => void polish()}
          >
            <Wand2 className="size-3.5" aria-hidden="true" />{' '}
            {busy === 'polish' ? 'Polishing…' : 'Polish'}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!note.trim() || busy !== null}
          >
            <Send className="size-3.5" aria-hidden="true" /> Post
          </Button>
        </div>
      </form>

      <div className="flex gap-1" role="tablist" aria-label="Filter activity">
        {filters.map(f => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f.id
                ? 'bg-ink text-white'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries.length ? (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
          {entries.map(entry => {
            const Icon = entry.icon;
            return (
              <li key={entry.id} className="relative flex gap-3">
                <span
                  className={cn(
                    'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                    entry.tone
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.meta}
                    </p>
                    <p className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(entry.at)}
                    </p>
                  </div>
                  {entry.body ? (
                    <p className="mt-1 line-clamp-6 text-sm whitespace-pre-line text-foreground/80">
                      {entry.body}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No activity yet.
        </p>
      )}
    </Panel>
  );
}

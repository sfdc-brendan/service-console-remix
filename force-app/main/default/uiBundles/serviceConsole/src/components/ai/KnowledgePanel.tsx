import { useCallback, useState } from 'react';
import { BookOpen, Check, ChevronDown, Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type KnowledgeMatch } from '@/api/console/consoleApi';
import { useResource } from '@/hooks/useResource';
import { cn } from '@/lib/utils';
import {
  AiTag,
  ErrorNote,
  Panel,
  ShimmerLines,
} from '@/components/console/primitives';

const VERDICT = {
  COVERED: { label: 'Answer found', className: 'bg-positive/12 text-positive' },
  PARTIAL: {
    label: 'Partially covered',
    className: 'bg-warning/20 text-foreground',
  },
  NOT_COVERED: {
    label: 'Knowledge gap',
    className: 'bg-negative/10 text-negative',
  },
} as const;

function ArticleRow({
  match,
  onAttach,
  onInsert,
}: {
  match: KnowledgeMatch;
  onAttach: (match: KnowledgeMatch) => Promise<void>;
  onInsert?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  return (
    <li className="rounded-xl border bg-white/80">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-case/10 text-case">
          <BookOpen className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{match.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {match.reason}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            {match.confidence}%
          </span>
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t px-3 pt-2 pb-3">
          <p className="text-xs leading-relaxed whitespace-pre-line text-foreground/80">
            {match.snippet || match.summary || 'No preview available.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {match.articleNumber}
            </span>
            <span className="flex-1" />
            {onInsert ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onInsert(match.summary || match.snippet || match.title)
                }
              >
                Use in reply
              </Button>
            ) : null}
            {match.linked ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
                <Check className="size-3.5" aria-hidden="true" /> Attached
              </span>
            ) : (
              <Button
                size="sm"
                disabled={attaching}
                onClick={async () => {
                  setAttaching(true);
                  try {
                    await onAttach(match);
                  } finally {
                    setAttaching(false);
                  }
                }}
              >
                <Link2 className="size-3.5" aria-hidden="true" />{' '}
                {attaching ? 'Attaching…' : 'Attach to case'}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function KnowledgePanel({
  caseId,
  onChanged,
  onInsert,
  className,
}: {
  caseId: string;
  onChanged?: () => void;
  onInsert?: (text: string) => void;
  className?: string;
}) {
  const knowledge = useResource(
    useCallback(() => consoleApi.knowledge(caseId), [caseId]),
    caseId
  );
  const { setData } = knowledge;

  const attach = useCallback(
    async (match: KnowledgeMatch) => {
      try {
        await consoleApi.executeAction(caseId, {
          type: 'linkArticle',
          payload: {
            knowledgeArticleId: match.knowledgeArticleId,
            articleId: match.id,
            title: match.title,
          },
        });
        setData(prev =>
          prev
            ? {
                ...prev,
                matches: prev.matches.map(m =>
                  m.id === match.id ? { ...m, linked: true } : m
                ),
              }
            : prev
        );
        toast.success('Article attached', { description: match.title });
        onChanged?.();
      } catch (err) {
        toast.error('Could not attach article', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [caseId, onChanged, setData]
  );

  const data = knowledge.data;
  const verdict = data ? VERDICT[data.verdict] : null;

  return (
    <Panel
      title="Knowledge"
      icon={BookOpen}
      tone="ai"
      className={className}
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void knowledge.refresh()}
          disabled={knowledge.loading}
          aria-label="Refresh knowledge"
        >
          <RefreshCw
            className={cn('size-3.5', knowledge.loading && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {knowledge.error ? (
        <ErrorNote
          message={knowledge.error}
          onRetry={() => void knowledge.refresh()}
        />
      ) : !data || !verdict ? (
        <ShimmerLines lines={4} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                verdict.className
              )}
            >
              {verdict.label}
            </span>
            <p className="text-xs text-muted-foreground">{data.summary}</p>
          </div>
          {data.matches.length ? (
            <ul className="space-y-2">
              {data.matches.map(match => (
                <ArticleRow
                  key={match.id}
                  match={match}
                  onAttach={attach}
                  onInsert={onInsert}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No published article resolves this yet — a good candidate for a
              new article.
            </p>
          )}
          <AiTag label="Matched by AI" />
        </div>
      )}
    </Panel>
  );
}

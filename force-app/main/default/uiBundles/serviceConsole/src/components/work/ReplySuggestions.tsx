import { useCallback } from 'react';
import { MessageCircleReply } from 'lucide-react';
import { consoleApi } from '@/api/console/consoleApi';
import { useResource } from '@/hooks/useResource';
import { AiTag, ErrorNote, Panel, ShimmerLines } from '@/components/console/primitives';

export function ReplySuggestions({ workId, turn, onPick }: { workId: string; turn: string; onPick: (text: string) => void }) {
  const replies = useResource(useCallback(() => consoleApi.replySuggestions(workId), [workId]), `${workId}-${turn}`, null, {
    keepPrevious: true,
  });
  const data = replies.data;
  return (
    <Panel
      title="Suggested replies"
      icon={MessageCircleReply}
      tone="ai"
      action={replies.loading && data ? <span className="text-[11px] text-ai">Thinking…</span> : null}
    >
      {replies.error && !data ? (
        <ErrorNote message={replies.error} onRetry={() => void replies.refresh()} />
      ) : !data ? (
        <ShimmerLines lines={4} />
      ) : (
        <div className="space-y-3">
          {data.intent ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Intent:</span> {data.intent}
            </p>
          ) : null}
          <ul className="space-y-2">
            {data.suggestions.map(s => (
              <li key={s.text}>
                <button
                  type="button"
                  onClick={() => onPick(s.text)}
                  className="w-full rounded-xl border bg-white/80 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-ai/40 hover:shadow-md"
                >
                  <span className="mb-1 inline-block rounded-full bg-ai/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ai">
                    {s.label}
                  </span>
                  <span className="block text-sm leading-relaxed">{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <AiTag label="Click to draft" />
        </div>
      )}
    </Panel>
  );
}

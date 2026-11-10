import {
  ArrowUpRight,
  BrainCircuit,
  RefreshCw,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CallAnalysis } from '@/api/console/consoleApi';
import type { Resource } from '@/hooks/useResource';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AiTag,
  ErrorNote,
  Panel,
  RatioMeter,
  ShimmerLines,
} from '@/components/console/primitives';
import { MARKER_META } from './callTimeline';

const OUTCOME_TONE: Record<CallAnalysis['outcome'], string> = {
  Resolved: 'bg-positive/12 text-positive',
  'Follow-up needed': 'bg-warning/15 text-warning',
  Escalated: 'bg-negative/12 text-negative',
  Unresolved: 'bg-negative/12 text-negative',
};

const SCORE_LABELS: {
  key: keyof Omit<CallAnalysis['scores'], 'overall'>;
  label: string;
}[] = [
  { key: 'empathy', label: 'Empathy' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'compliance', label: 'Compliance' },
];

function scoreTone(score: number): string {
  return score >= 80
    ? 'fill-positive'
    : score >= 60
      ? 'fill-warning'
      : 'fill-negative';
}

/** AI read of a finished conversation, with key moments that jump the player. */
export function CallAnalysisPanel({
  analysis,
  onRegenerate,
  regenerating,
  onSeek,
  title = 'Call analysis',
}: {
  analysis: Resource<CallAnalysis>;
  onRegenerate: () => void;
  regenerating: boolean;
  onSeek?: (messageId: string) => void;
  title?: string;
}) {
  const data = analysis.data;
  const busy = regenerating || (analysis.loading && !data);
  return (
    <Panel
      title={title}
      icon={BrainCircuit}
      tone="ai"
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={onRegenerate}
          disabled={busy}
          aria-label="Re-run analysis"
          title="Re-run analysis"
        >
          <RefreshCw
            className={cn('size-3.5', busy && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {analysis.error && !data ? (
        <ErrorNote
          message={analysis.error}
          onRetry={() => void analysis.refresh()}
        />
      ) : !data ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Listening back through the call…
          </p>
          <ShimmerLines lines={6} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1 ring-ai/20">
              <span className="font-display text-xl font-semibold tabular-nums">
                {data.scores.overall}
              </span>
              <span className="sr-only">overall quality score out of 100</span>
            </div>
            <div className="min-w-0">
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  OUTCOME_TONE[data.outcome]
                )}
                title={data.outcomeReason}
              >
                {data.outcome}
              </span>
              <p className="mt-1 font-display text-base leading-snug font-semibold">
                {data.headline}
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-foreground/85">
            {data.summary}
          </p>
          {data.customerIntent ? (
            <p className="rounded-lg bg-white/70 px-3 py-2 text-xs">
              <span className="font-semibold">Customer wanted: </span>
              {data.customerIntent}
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {SCORE_LABELS.map(({ key, label }) => (
              <div key={key}>
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono tabular-nums">{data.scores[key]}</dd>
                </div>
                <RatioMeter
                  className="mt-1"
                  value={data.scores[key]}
                  max={100}
                  barClass={scoreTone(data.scores[key])}
                />
              </div>
            ))}
          </dl>

          {data.markers.length ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Key moments
              </p>
              <ol className="space-y-1">
                {data.markers.map((marker, index) => {
                  const meta = MARKER_META[marker.kind];
                  const Icon = meta.icon;
                  const body = (
                    <>
                      <span
                        className={cn(
                          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white',
                          meta.dot
                        )}
                      >
                        <Icon className="size-3" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">
                            {marker.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            Turn {marker.turn}
                          </span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {marker.detail}
                        </span>
                      </span>
                      {onSeek ? (
                        <ArrowUpRight
                          className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : null}
                    </>
                  );
                  return (
                    <li key={`${marker.messageId}-${index}`}>
                      {onSeek ? (
                        <button
                          type="button"
                          onClick={() => onSeek(marker.messageId)}
                          className="-mx-2 flex w-[calc(100%+1rem)] gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/70"
                          aria-label={`Play from ${meta.label.toLowerCase()}: ${marker.label}`}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex gap-2.5 py-1.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          {data.strengths.length || data.improvements.length ? (
            <div className="grid gap-3 @sm:grid-cols-2">
              {data.strengths.length ? (
                <div className="rounded-lg bg-positive/8 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-positive">
                    <ThumbsUp className="size-3.5" aria-hidden="true" /> What
                    went well
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs">
                    {data.strengths.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.improvements.length ? (
                <div className="rounded-lg bg-warning/10 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <TrendingUp className="size-3.5" aria-hidden="true" /> Coach
                    on
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs">
                    {data.improvements.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <AiTag label={`Analyzed ${relativeTime(data.generatedAt)}`} />
        </div>
      )}
    </Panel>
  );
}

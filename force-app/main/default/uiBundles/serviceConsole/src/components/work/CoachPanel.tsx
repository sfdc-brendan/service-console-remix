import { useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Circle, GraduationCap, Lightbulb, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { consoleApi } from '@/api/console/consoleApi';
import { useResource } from '@/hooks/useResource';
import { cn } from '@/lib/utils';
import { AiTag, ErrorNote, Panel, ShimmerLines } from '@/components/console/primitives';

function SentimentGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 42;
  const arc = Math.PI * radius;
  const angle = Math.PI * (1 - clamped / 100);
  const needleX = 50 + Math.cos(angle) * (radius - 6);
  const needleY = 50 - Math.sin(angle) * (radius - 6);
  const tone = clamped >= 60 ? 'stroke-positive' : clamped >= 40 ? 'stroke-warning' : 'stroke-negative';
  return (
    <svg viewBox="0 0 100 56" className="w-36" role="img" aria-label={`Sentiment score ${clamped} out of 100`}>
      <path d="M 8 50 A 42 42 0 0 1 92 50" className="fill-none stroke-muted" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M 8 50 A 42 42 0 0 1 92 50"
        className={cn('fill-none transition-[stroke-dashoffset] duration-700', tone)}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={arc}
        strokeDashoffset={arc * (1 - clamped / 100)}
      />
      <line x1="50" y1="50" x2={needleX} y2={needleY} className="stroke-ink" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="3.5" className="fill-ink" />
    </svg>
  );
}

export function CoachPanel({
  workId,
  turn,
  onUseLine,
  title = 'Live coaching',
}: {
  workId: string;
  /** Changes whenever the customer speaks, triggering a fresh coaching pass. */
  turn: number;
  onUseLine?: (text: string) => void;
  title?: string;
}) {
  const coach = useResource(useCallback(() => consoleApi.coach(workId), [workId]), `${workId}-${turn}`, null, { keepPrevious: true });
  const data = coach.data;

  return (
    <Panel title={title} icon={GraduationCap} tone="ai" action={coach.loading && data ? <span className="text-[11px] text-ai">Listening…</span> : null}>
      {coach.error && !data ? (
        <ErrorNote message={coach.error} onRetry={() => void coach.refresh()} />
      ) : !data ? (
        <ShimmerLines lines={5} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <SentimentGauge score={data.sentimentScore} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer wants</p>
              <p className="text-sm font-medium">{data.customerIntent}</p>
            </div>
          </div>

          {data.nextLine ? (
            <div className="rounded-xl border border-ai/25 bg-white/80 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ai">
                <Quote className="size-3" aria-hidden="true" /> Suggested next line
              </p>
              <p className="text-sm leading-relaxed">{data.nextLine}</p>
              {onUseLine ? (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => onUseLine(data.nextLine)}>
                  Use this line
                </Button>
              ) : null}
            </div>
          ) : null}

          {data.warnings.length ? (
            <ul className="space-y-1.5">
              {data.warnings.map(w => (
                <li key={w} className="flex gap-2 rounded-lg bg-negative/8 px-2.5 py-1.5 text-xs text-negative">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {w}
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="space-y-1.5">
            {data.checklist.map(item => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {item.done ? (
                  <CheckCircle2 className="size-4 text-positive" aria-label="Done" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-label="Not yet" />
                )}
                <span className={cn(item.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{item.label}</span>
              </li>
            ))}
          </ul>

          {data.tips.length ? (
            <ul className="space-y-1.5 border-t border-ai/15 pt-3">
              {data.tips.map(tip => (
                <li key={tip} className="flex gap-2 text-xs text-foreground/80">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" /> {tip}
                </li>
              ))}
            </ul>
          ) : null}
          <AiTag label="Real-time agent assist" />
        </div>
      )}
    </Panel>
  );
}

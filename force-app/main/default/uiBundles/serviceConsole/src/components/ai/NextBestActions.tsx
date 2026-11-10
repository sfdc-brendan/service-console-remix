import { useCallback, useState } from 'react';
import {
  AlertOctagon,
  BookOpen,
  CheckCircle2,
  Flag,
  ListTodo,
  Mail,
  MessageSquarePlus,
  RefreshCw,
  Route,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  consoleApi,
  type ActionPayload,
  type ActionType,
  type NextBestAction,
} from '@/api/console/consoleApi';
import { useResource } from '@/hooks/useResource';
import { cn } from '@/lib/utils';
import {
  AiTag,
  ErrorNote,
  Panel,
  ShimmerLines,
} from '@/components/console/primitives';
import { EmailReviewDialog } from './EmailReviewDialog';

export const ACTION_ICON: Record<ActionType, LucideIcon> = {
  updateStatus: Route,
  updatePriority: Flag,
  createTask: ListTodo,
  linkArticle: BookOpen,
  escalate: AlertOctagon,
  sendEmail: Mail,
  addComment: MessageSquarePlus,
};

function actionDetail(action: ActionPayload): string {
  switch (action.type) {
    case 'updateStatus':
      return `Status → ${action.payload.status}`;
    case 'updatePriority':
      return `Priority → ${action.payload.priority}`;
    case 'createTask':
      return `Task: ${action.payload.subject}`;
    case 'linkArticle':
      return `Attach: ${action.payload.title}`;
    case 'escalate':
      return action.payload.reason;
    case 'sendEmail':
      return `Email: ${action.payload.subject}`;
    case 'addComment':
      return action.payload.body;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function NextBestActions({
  caseId,
  onChanged,
  className,
}: {
  caseId: string;
  onChanged?: () => void;
  className?: string;
}) {
  const actions = useResource(
    useCallback(() => consoleApi.nextBestActions(caseId), [caseId]),
    caseId
  );
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Extract<
    NextBestAction,
    { type: 'sendEmail' }
  > | null>(null);

  const execute = async (action: NextBestAction, override?: ActionPayload) => {
    setRunning(action.id);
    try {
      const result = await consoleApi.executeAction(caseId, override ?? action);
      toast.success(result.message || action.title);
      setDone(prev => new Set(prev).add(action.id));
      onChanged?.();
    } catch (err) {
      toast.error(`Could not ${action.title.toLowerCase()}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(null);
    }
  };

  const items = actions.data?.actions ?? [];

  return (
    <Panel
      title="Next best actions"
      icon={Zap}
      tone="ai"
      className={className}
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setDone(new Set());
            void actions.refresh();
          }}
          disabled={actions.loading}
          aria-label="Refresh recommendations"
        >
          <RefreshCw
            className={cn('size-3.5', actions.loading && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {actions.error ? (
        <ErrorNote
          message={actions.error}
          onRetry={() => void actions.refresh()}
        />
      ) : !actions.data ? (
        <ShimmerLines lines={6} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No actions recommended right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map(action => {
            const Icon = ACTION_ICON[action.type];
            const isDone = done.has(action.id);
            return (
              <li
                key={action.id}
                className={cn(
                  'rounded-xl border bg-white/80 p-3 transition-opacity',
                  isDone && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-ai/12 text-ai">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{action.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {action.rationale}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs text-foreground/75">
                      {actionDetail(action)}
                    </p>
                  </div>
                  <span
                    className="font-mono text-[11px] text-muted-foreground"
                    title="Confidence"
                  >
                    {action.confidence}%
                  </span>
                </div>
                <div className="mt-2.5 flex justify-end">
                  {isDone ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />{' '}
                      Done
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={
                        action.type === 'escalate' ? 'destructive' : 'default'
                      }
                      disabled={running !== null}
                      onClick={() =>
                        action.type === 'sendEmail'
                          ? setReviewing(action)
                          : void execute(action)
                      }
                    >
                      {running === action.id
                        ? 'Working…'
                        : action.type === 'sendEmail'
                          ? 'Review & send'
                          : 'Do it'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AiTag className="mt-3" label="Grounded in case + knowledge" />
      {reviewing ? (
        <EmailReviewDialog
          subject={reviewing.payload.subject}
          body={reviewing.payload.body}
          onCancel={() => setReviewing(null)}
          onSend={async payload => {
            await execute(reviewing, { type: 'sendEmail', payload });
            setReviewing(null);
          }}
        />
      ) : null}
    </Panel>
  );
}

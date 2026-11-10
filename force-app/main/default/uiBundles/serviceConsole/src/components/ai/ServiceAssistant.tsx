import { useCallback, useState, type ReactNode } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  CircleDot,
  Copy,
  CornerDownLeft,
  Mail,
  Paperclip,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  consoleApi,
  type AssistArticle,
  type AssistPlan,
  type AssistStage,
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
import { ACTION_ICON } from './NextBestActions';
import { EmailReviewDialog } from './EmailReviewDialog';

const STAGES: AssistStage[] = [
  'Understand',
  'Diagnose',
  'Resolve',
  'Confirm',
  'Follow up',
];

function StageTrack({ stage }: { stage: AssistStage }) {
  const current = STAGES.indexOf(stage);
  return (
    <ol
      className="grid grid-cols-5 gap-1"
      aria-label={`Resolution stage: ${stage}`}
    >
      {STAGES.map((name, index) => (
        <li
          key={name}
          className="min-w-0"
          aria-current={index === current ? 'step' : undefined}
        >
          <span
            className={cn(
              'block h-1.5 rounded-full',
              index < current
                ? 'bg-ai/60'
                : index === current
                  ? 'bg-ai'
                  : 'bg-ai/15'
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'mt-1 block truncate text-[10px] font-medium',
              index === current ? 'text-ai' : 'text-muted-foreground'
            )}
          >
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

const STEP_ICON = {
  done: CheckCircle2,
  current: CircleDot,
  todo: Circle,
} as const;

export function ServiceAssistant({
  caseId,
  workId,
  turn = 'static',
  onInsert,
  insertLabel = 'Insert',
  onChanged,
  className,
}: {
  caseId: string;
  workId?: string | null;
  turn?: string;
  onInsert?: (text: string) => void;
  insertLabel?: string;
  onChanged?: () => void;
  className?: string;
}) {
  const plan = useResource(
    useCallback(() => consoleApi.assist(caseId, workId), [caseId, workId]),
    `${caseId}-${workId ?? 'case'}-${turn}`,
    null,
    { keepPrevious: true }
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<NonNullable<
    AssistPlan['email']
  > | null>(null);
  const data = plan.data;

  const markDone = (key: string) => setDone(prev => new Set(prev).add(key));

  const run = async (
    key: string,
    label: string,
    task: () => Promise<{ message?: string }>
  ) => {
    setBusy(key);
    try {
      const result = await task();
      toast.success(result.message || label);
      markDone(key);
      onChanged?.();
    } catch (err) {
      toast.error(`Could not ${label.toLowerCase()}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const attach = (article: AssistArticle) =>
    consoleApi.executeAction(caseId, {
      type: 'linkArticle',
      payload: {
        knowledgeArticleId: article.knowledgeArticleId,
        articleId: article.articleId,
        title: article.title,
      },
    });

  const share = async (article: AssistArticle) => {
    onInsert?.(article.shareText);
    if (!article.linked && !done.has(`attach-${article.articleId}`)) {
      await run(`attach-${article.articleId}`, 'Attach article', () =>
        attach(article)
      );
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Clipboard is unavailable');
    }
  };

  const runAction = (action: NextBestAction) =>
    run(action.id, action.title, () =>
      consoleApi.executeAction(caseId, action)
    );

  return (
    <Panel
      title="Service Assistant"
      icon={Sparkles}
      tone="ai"
      className={className}
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setDone(new Set());
            void plan.refresh();
          }}
          disabled={plan.loading}
          aria-label="Refresh guidance"
          title="Refresh guidance"
        >
          <RefreshCw
            className={cn('size-3.5', plan.loading && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {plan.error && !data ? (
        <ErrorNote message={plan.error} onRetry={() => void plan.refresh()} />
      ) : !data ? (
        <ShimmerLines lines={7} />
      ) : (
        <div
          className={cn(
            'space-y-5 transition-opacity',
            plan.loading && 'opacity-70'
          )}
          aria-busy={plan.loading}
        >
          <div className="space-y-3">
            {data.intent ? (
              <p className="text-sm leading-relaxed">
                <span className="font-semibold">Customer needs:</span>{' '}
                {data.intent}
              </p>
            ) : null}
            <StageTrack stage={data.stage} />
          </div>

          {data.plan.length ? (
            <Section title="Resolution plan">
              <ol className="space-y-1.5">
                {data.plan.map((step, index) => {
                  const Icon = STEP_ICON[step.status];
                  return (
                    <li
                      key={`${index}-${step.step}`}
                      className={cn(
                        'flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm',
                        step.status === 'current' && 'bg-ai/10 font-medium',
                        step.status === 'done' &&
                          'text-muted-foreground line-through decoration-muted-foreground/40'
                      )}
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          step.status === 'todo'
                            ? 'text-muted-foreground'
                            : 'text-ai'
                        )}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="sr-only">
                          {step.status === 'done'
                            ? 'Done: '
                            : step.status === 'current'
                              ? 'Now: '
                              : 'Next: '}
                        </span>
                        {step.step}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Section>
          ) : null}

          {data.replies.length && onInsert ? (
            <Section title="Recommended replies">
              <ul className="space-y-2">
                {data.replies.map(reply => (
                  <li
                    key={reply.text}
                    className="group rounded-xl border bg-white/80 p-3 transition-shadow hover:shadow-md"
                  >
                    <span className="mb-1 inline-block rounded-full bg-ai/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ai">
                      {reply.label}
                    </span>
                    <p className="text-sm leading-relaxed">{reply.text}</p>
                    <div className="mt-2 flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copy(reply.text)}
                        aria-label={`Copy reply: ${reply.label}`}
                      >
                        <Copy className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onInsert(reply.text)}
                      >
                        <CornerDownLeft
                          className="size-3.5"
                          aria-hidden="true"
                        />{' '}
                        {insertLabel}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {data.articles.length ? (
            <Section title="Articles to share">
              <ul className="space-y-2">
                {data.articles.map(article => {
                  const attached =
                    article.linked || done.has(`attach-${article.articleId}`);
                  return (
                    <li
                      key={article.articleId}
                      className="rounded-xl border bg-white/80 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <BookOpen
                          className="mt-0.5 size-4 shrink-0 text-ai"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug">
                            {article.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {article.articleNumber ? (
                              <span className="font-mono">
                                {article.articleNumber} ·{' '}
                              </span>
                            ) : null}
                            {article.why}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
                        {attached ? (
                          <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-positive">
                            <Paperclip
                              className="size-3.5"
                              aria-hidden="true"
                            />{' '}
                            Attached
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(
                                `attach-${article.articleId}`,
                                'Attach article',
                                () => attach(article)
                              )
                            }
                          >
                            <Paperclip
                              className="size-3.5"
                              aria-hidden="true"
                            />{' '}
                            Attach
                          </Button>
                        )}
                        {onInsert ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => void share(article)}
                          >
                            <CornerDownLeft
                              className="size-3.5"
                              aria-hidden="true"
                            />{' '}
                            Share
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {data.email ? (
            <Section
              title={data.live ? 'Follow-up email' : 'Draft email reply'}
            >
              <div
                className={cn(
                  'rounded-xl border bg-white/80 p-3',
                  done.has('email') && 'opacity-60'
                )}
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Mail className="size-4 text-ai" aria-hidden="true" />
                  <span className="truncate">{data.email.subject}</span>
                </p>
                <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-foreground/75">
                  {data.email.body}
                </p>
                {data.email.why ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {data.email.why}
                  </p>
                ) : null}
                <div className="mt-2.5 flex justify-end">
                  {done.has('email') ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />{' '}
                      Sent
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy !== null || !data.email.to}
                      onClick={() => setReviewing(data.email)}
                    >
                      {data.email.to ? 'Review & send' : 'No contact email'}
                    </Button>
                  )}
                </div>
              </div>
            </Section>
          ) : null}

          {data.actions.length ? (
            <Section title="Quick actions">
              <ul className="space-y-1.5">
                {data.actions.map(action => {
                  const Icon = ACTION_ICON[action.type];
                  const isDone = done.has(action.id);
                  return (
                    <li
                      key={action.id}
                      className="flex items-center gap-2 rounded-lg border bg-white/80 py-1.5 pr-1.5 pl-2.5"
                    >
                      <Icon
                        className="size-4 shrink-0 text-ai"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {action.title}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {action.rationale}
                        </span>
                      </span>
                      {isDone ? (
                        <CheckCircle2
                          className="size-4 text-positive"
                          aria-label="Done"
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => void runAction(action)}
                        >
                          {busy === action.id ? 'Working…' : 'Run'}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          <AiTag
            label={
              data.live
                ? 'Listening to the live conversation'
                : 'Grounded in case, history + knowledge'
            }
          />
        </div>
      )}
      {reviewing ? (
        <EmailReviewDialog
          subject={reviewing.subject}
          body={reviewing.body}
          to={reviewing.to}
          onCancel={() => setReviewing(null)}
          onSend={async payload => {
            await run('email', 'Send email', () =>
              consoleApi.executeAction(caseId, { type: 'sendEmail', payload })
            );
            setReviewing(null);
          }}
        />
      ) : null}
    </Panel>
  );
}

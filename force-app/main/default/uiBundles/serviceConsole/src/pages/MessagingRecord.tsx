import {
  useCallback,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useLocation, useParams } from 'react-router';
import {
  ArrowRightLeft,
  CheckCircle2,
  MessageSquareText,
  Pause,
  Play,
  Send,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { consoleApi } from '@/api/console/consoleApi';
import { getMessagingSession } from '@/api/console/recordService';
import { useConsole, useTabTitle } from '@/context/consoleContext';
import { useCustomer360 } from '@/context/customer360Context';
import { useConversation } from '@/hooks/useConversation';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useWorkForSource } from '@/hooks/useWorkForSource';
import { formatDateTime, formatDuration, secondsSince } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MESSAGING_LAYOUT } from '@/layout/pageSpecs';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import { ServiceAssistant } from '@/components/ai/ServiceAssistant';
import { CaseContextTabs } from '@/components/work/CaseContextTabs';
import { CallAnalysisPanel } from '@/components/analysis/CallAnalysisPanel';
import { RoutingPanel } from '@/components/routing/RoutingPanel';
import { CaseSlaPanel } from '@/components/insights/SlaPanels';
import {
  ConversationNotesPanel,
  CustomerSnapshotPanel,
  ResponsePacePanel,
} from '@/components/insights/RecordInsights';
import { useConversationAnalysis } from '@/hooks/useConversationAnalysis';
import { CoachPanel } from '@/components/work/CoachPanel';
import { ReplySuggestions } from '@/components/work/ReplySuggestions';
import { Transcript } from '@/components/work/Transcript';
import { TransferDialog } from '@/components/work/TransferDialog';
import { WrapUpDialog } from '@/components/work/WrapUpDialog';
import {
  EmptyState,
  ErrorNote,
  FieldRow,
  Panel,
  PersonAvatar,
  PriorityBadge,
  SentimentBadge,
  ShimmerLines,
  Textarea,
} from '@/components/console/primitives';
import NotFound from './NotFound';

const TONES = [
  { id: 'empathetic', label: 'More empathetic' },
  { id: 'concise', label: 'More concise' },
  { id: 'friendly, upbeat', label: 'Friendlier' },
  { id: 'formal, professional', label: 'More formal' },
];

export default function MessagingRecord() {
  const { recordId = '' } = useParams();
  const location = useLocation();
  const { clockSkew, refreshOmni } = useConsole();
  const { openCustomer } = useCustomer360();
  const now = useNow() + clockSkew;
  const session = useResource(
    useCallback(() => getMessagingSession(recordId), [recordId]),
    recordId || null
  );
  const { workId, loading: resolving } = useWorkForSource(recordId || null);
  const convo = useConversation(workId);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'hold' | 'rewrite' | null>(null);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const work = convo.data?.work ?? null;
  const messages = convo.data?.messages ?? [];
  const lastCustomer = [...messages]
    .reverse()
    .find(m => m.sender === 'Customer');
  const customerTurns = messages.filter(m => m.sender === 'Customer').length;
  const live = work?.status === 'Accepted';
  const caseId = work?.caseId ?? session.data?.caseId ?? null;
  const customerName =
    work?.customerName ?? session.data?.contactName ?? 'Customer';
  const profileId = session.data?.contactId ?? caseId ?? work?.id ?? null;
  const { analysis, regenerate, regenerating } = useConversationAnalysis(
    messages.length ? work : null
  );
  const openProfile = () => {
    if (profileId) {
      openCustomer(profileId, customerName);
    }
  };

  useTabTitle(
    location.pathname,
    customerName !== 'Customer' ? `Chat · ${customerName}` : session.data?.name
  );

  const send = async () => {
    if (!draft.trim()) {
      return;
    }
    try {
      await convo.send(draft);
      setDraft('');
    } catch (err) {
      toast.error('Could not send', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const rewrite = async (tone: string) => {
    setBusy('rewrite');
    try {
      const result = await consoleApi.rewrite(draft, tone);
      setDraft(result.text);
    } catch (err) {
      toast.error('Could not rewrite', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleHold = async () => {
    if (!work) {
      return;
    }
    setBusy('hold');
    try {
      await consoleApi.hold(work.id, !work.onHold);
      await Promise.all([convo.refresh(), refreshOmni()]);
    } catch (err) {
      toast.error('Could not change hold', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  if (!session.loading && !session.data && !session.error) {
    return <NotFound />;
  }

  const elapsed = work?.acceptedAt
    ? secondsSince(
        work.acceptedAt,
        work.closedAt ? new Date(work.closedAt).getTime() : now
      )
    : 0;
  const channelLabel = session.data?.channelType ?? 'Messaging';

  const conversation = (
    <section className="flex h-[calc(100dvh-6rem)] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card lg:h-[calc(100dvh-7rem)]">
      <header className="flex flex-wrap items-center gap-4 border-b px-5 py-4">
        <button
          type="button"
          onClick={openProfile}
          disabled={!profileId}
          className="rounded-full transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
          aria-label={`Open Customer 360 for ${customerName}`}
        >
          <PersonAvatar
            name={customerName}
            size="lg"
            status={live ? 'Online' : 'Offline'}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap text-messaging">
            <MessageSquareText
              className="size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="shrink-0 uppercase tracking-[0.16em]">
              {channelLabel}
            </span>
            {session.data?.channelName ? (
              <span
                className="min-w-0 truncate font-medium text-muted-foreground"
                title={session.data.channelName}
              >
                · {session.data.channelName}
              </span>
            ) : null}
          </p>
          <h1 className="truncate text-2xl font-semibold">
            {profileId ? (
              <button
                type="button"
                onClick={openProfile}
                className="group inline-flex max-w-full items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                title="Open Customer 360"
              >
                <span className="truncate decoration-muted-foreground/50 decoration-dotted underline-offset-4 group-hover:underline">
                  {customerName}
                </span>
                <span className="shrink-0 rounded-full bg-messaging/12 px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wider text-messaging group-hover:bg-messaging/20">
                  360
                </span>
              </button>
            ) : (
              customerName
            )}
          </h1>
          {work ? (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              <PriorityBadge priority={work.priority} />
              <SentimentBadge sentiment={work.sentiment} />
              <span className="truncate text-muted-foreground">
                {work.subject}
              </span>
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl tabular-nums">
            {formatDuration(elapsed)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {!work
              ? session.data?.status
              : work.status === 'Closed'
                ? 'Ended'
                : work.onHold
                  ? 'Paused'
                  : 'Active'}
          </p>
        </div>
        {live && work ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void toggleHold()}
            >
              {work.onHold ? (
                <Play className="size-3.5" aria-hidden="true" />
              ) : (
                <Pause className="size-3.5" aria-hidden="true" />
              )}
              {work.onHold ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowRightLeft className="size-3.5" aria-hidden="true" />{' '}
              Transfer
            </Button>
            <Button
              size="sm"
              className="bg-messaging text-white hover:bg-messaging/90"
              onClick={() => setWrapOpen(true)}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> End &
              wrap up
            </Button>
          </div>
        ) : null}
      </header>

      <div className="paper-grain flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-6">
        {convo.error ? (
          <ErrorNote
            message={convo.error}
            onRetry={() => void convo.refresh()}
          />
        ) : null}
        {resolving || (workId && !convo.data) ? (
          <ShimmerLines lines={6} />
        ) : !workId ? (
          <EmptyState
            icon={MessageSquareText}
            title="No conversation captured"
            detail={`Session started ${formatDateTime(session.data?.startTime ?? session.data?.createdDate)}. Only sessions routed through this console carry a transcript.`}
          />
        ) : (
          <Transcript
            messages={messages}
            customerName={customerName}
            typing={convo.customerTyping}
            variant="chat"
            className="min-h-0 flex-1 pr-1"
          />
        )}
      </div>

      {live && work ? (
        <form onSubmit={onSubmit} className="border-t bg-card p-3">
          <div className="rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-messaging/30">
            <Textarea
              rows={2}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                work.onHold
                  ? 'Conversation is paused'
                  : 'Type a reply… (Enter to send, Shift+Enter for a new line)'
              }
              disabled={work.onHold || convo.sending}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              aria-label="Reply"
            />
            <div className="flex items-center gap-2 px-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-ai"
                    disabled={!draft.trim() || busy !== null}
                  >
                    <Wand2 className="size-3.5" aria-hidden="true" />{' '}
                    {busy === 'rewrite' ? 'Rewriting…' : 'Rewrite'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {TONES.map(tone => (
                    <DropdownMenuItem
                      key={tone.id}
                      onSelect={() => void rewrite(tone.id)}
                    >
                      {tone.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="flex-1" />
              <Button
                type="submit"
                size="sm"
                className={cn(
                  'gap-1.5 bg-messaging text-white hover:bg-messaging/90'
                )}
                disabled={!draft.trim() || work.onHold || convo.sending}
              >
                <Send className="size-3.5" aria-hidden="true" /> Send
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );

  return (
    <>
      <LayoutCanvas
        spec={MESSAGING_LAYOUT}
        slots={{
          conversation,
          customer: profileId ? (
            <CustomerSnapshotPanel recordId={profileId} name={customerName} />
          ) : null,
          pace:
            live && work ? (
              <ResponsePacePanel
                messages={messages}
                live={live}
                now={now}
                targetSeconds={45}
                variant="chat"
              />
            ) : null,
          notes: work ? (
            <ConversationNotesPanel
              workId={work.id}
              caseId={caseId}
              elapsedSeconds={elapsed}
            />
          ) : null,
          analysis:
            work?.status === 'Closed' && messages.length ? (
              <CallAnalysisPanel
                title="Conversation analysis"
                analysis={analysis}
                onRegenerate={() => void regenerate()}
                regenerating={regenerating}
              />
            ) : null,
          sla: caseId ? <CaseSlaPanel caseId={caseId} /> : null,
          routing: work ? (
            <RoutingPanel workId={work.id} title="Why this chat reached you" />
          ) : null,
          assistant: caseId ? (
            <ServiceAssistant
              caseId={caseId}
              workId={live ? work?.id : null}
              turn={live ? (lastCustomer?.id ?? 'start') : 'static'}
              onInsert={live ? setDraft : undefined}
            />
          ) : null,
          replies:
            live && work ? (
              <ReplySuggestions
                workId={work.id}
                turn={lastCustomer?.id ?? 'start'}
                onPick={setDraft}
              />
            ) : null,
          coach:
            live && work ? (
              <CoachPanel
                workId={work.id}
                turn={customerTurns}
                title="Conversation insights"
              />
            ) : null,
          wrapSummary:
            work?.status === 'Closed' && work.summary ? (
              <Panel title="Wrap-up summary" icon={CheckCircle2}>
                <p className="text-sm whitespace-pre-line">{work.summary}</p>
              </Panel>
            ) : null,
          caseContext: caseId ? (
            <CaseContextTabs
              caseId={caseId}
              caseNumber={work?.caseNumber ?? null}
              onInsert={text => setDraft(text)}
              defaultTab="summary"
            />
          ) : null,
          session: (
            <Panel title="Session" icon={MessageSquareText}>
              <dl className="divide-y">
                <FieldRow label="Session">{session.data?.name}</FieldRow>
                <FieldRow label="Status">{session.data?.status}</FieldRow>
                <FieldRow label="Origin">{session.data?.origin}</FieldRow>
                <FieldRow label="Started">
                  {formatDateTime(
                    session.data?.startTime ?? session.data?.createdDate
                  )}
                </FieldRow>
                {session.data?.endTime ? (
                  <FieldRow label="Ended">
                    {formatDateTime(session.data.endTime)}
                  </FieldRow>
                ) : null}
              </dl>
            </Panel>
          ),
        }}
      />

      {work ? (
        <WrapUpDialog work={work} open={wrapOpen} onOpenChange={setWrapOpen} />
      ) : null}
      {work ? (
        <TransferDialog
          work={work}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      ) : null}
    </>
  );
}

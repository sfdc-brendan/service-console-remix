import { useCallback, useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router';
import {
  ArrowRightLeft,
  Mic,
  MicOff,
  Pause,
  PhoneCall,
  PhoneOff,
  Play,
  Send,
  Voicemail,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { consoleApi } from '@/api/console/consoleApi';
import { getVoiceCall } from '@/api/console/recordService';
import { useConsole, useTabTitle } from '@/context/consoleContext';
import { useCustomer360 } from '@/context/customer360Context';
import { useConversation } from '@/hooks/useConversation';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useWorkForSource } from '@/hooks/useWorkForSource';
import { formatDateTime, formatDuration, secondsSince } from '@/lib/format';
import { cn } from '@/lib/utils';
import { VOICE_LAYOUT } from '@/layout/pageSpecs';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import { ServiceAssistant } from '@/components/ai/ServiceAssistant';
import { CaseContextTabs } from '@/components/work/CaseContextTabs';
import {
  CallPlayback,
  type SeekRequest,
} from '@/components/analysis/CallPlayback';
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
} from '@/components/console/primitives';
import NotFound from './NotFound';

const WAVE_BARS = Array.from({ length: 28 }, (_, i) => i);
const WAVE_HEIGHTS = [
  'h-3',
  'h-5',
  'h-8',
  'h-4',
  'h-6',
  'h-9',
  'h-5',
  'h-3',
  'h-7',
];

export default function VoiceRecord() {
  const { recordId = '' } = useParams();
  const location = useLocation();
  const { clockSkew, refreshOmni } = useConsole();
  const { openCustomer } = useCustomer360();
  const now = useNow() + clockSkew;
  const call = useResource(
    useCallback(() => getVoiceCall(recordId), [recordId]),
    recordId || null
  );
  const { workId, loading: resolving } = useWorkForSource(recordId || null);
  const convo = useConversation(workId);
  const [line, setLine] = useState('');
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);

  const work = convo.data?.work ?? null;
  const messages = convo.data?.messages ?? [];
  const customerTurns = messages.filter(m => m.sender === 'Customer').length;
  const live = work?.status === 'Accepted';
  const caseId =
    work?.caseId ??
    (call.data?.relatedRecordId?.startsWith('500')
      ? call.data.relatedRecordId
      : null);
  const customerName = work?.customerName ?? 'Caller';
  const profileId = caseId ?? work?.id ?? null;
  const ended = work?.status === 'Closed' && messages.length > 0;
  const { analysis, regenerate, regenerating } = useConversationAnalysis(work);
  const playFrom = (messageId: string) => {
    setSeekRequest({ messageId, nonce: Date.now() });
    document
      .getElementById('call-playback')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const openProfile = () => {
    if (profileId) {
      openCustomer(profileId, customerName);
    }
  };

  useTabTitle(
    location.pathname,
    work?.customerName ? `Call · ${work.customerName}` : call.data?.name
  );

  const speak = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!line.trim()) {
      return;
    }
    try {
      await convo.send(line);
      setLine('');
    } catch (err) {
      toast.error('Could not send', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const toggleHold = async () => {
    if (!work) {
      return;
    }
    setBusy(true);
    try {
      await consoleApi.hold(work.id, !work.onHold);
      await Promise.all([convo.refresh(), refreshOmni()]);
    } catch (err) {
      toast.error('Could not change hold', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!call.loading && !call.data && !call.error) {
    return <NotFound />;
  }

  const elapsed = work?.acceptedAt
    ? secondsSince(
        work.acceptedAt,
        work.closedAt ? new Date(work.closedAt).getTime() : now
      )
    : (call.data?.durationSeconds ?? 0);
  const statusLabel = !work
    ? 'Recorded call'
    : work.status === 'Closed'
      ? 'Call ended'
      : work.onHold
        ? 'On hold'
        : live
          ? 'Connected'
          : work.status;

  return (
    <div className="space-y-5">
      <section className="ink-panel animate-rise relative overflow-hidden rounded-2xl p-5 lg:p-6">
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className={cn(
                'rounded-full',
                live && !work?.onHold && 'animate-ring-pulse'
              )}
            >
              <button
                type="button"
                onClick={openProfile}
                disabled={!profileId}
                className="rounded-full transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:pointer-events-none"
                aria-label={`Open Customer 360 for ${customerName}`}
              >
                <PersonAvatar
                  name={customerName}
                  size="lg"
                  className="[&>span]:size-14"
                />
              </button>
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                <PhoneCall className="size-3.5 text-voice" aria-hidden="true" />{' '}
                {statusLabel}
              </p>
              <h1 className="truncate text-2xl font-semibold lg:text-3xl">
                {profileId ? (
                  <button
                    type="button"
                    onClick={openProfile}
                    className="group inline-flex max-w-full items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                    title="Open Customer 360"
                  >
                    <span className="truncate decoration-white/40 decoration-dotted underline-offset-4 group-hover:underline">
                      {customerName}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wider text-white/80 group-hover:bg-white/25">
                      360
                    </span>
                  </button>
                ) : (
                  customerName
                )}
              </h1>
              <p className="truncate font-mono text-xs text-white/60">
                {call.data?.fromNumber ?? '—'} → {call.data?.toNumber ?? '—'} ·{' '}
                {work?.queue ?? call.data?.callType ?? 'Inbound'}
              </p>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center gap-5">
            <div
              className={cn(
                'flex h-10 items-center gap-[3px]',
                live && !work?.onHold && !muted ? 'waveform' : 'opacity-30'
              )}
              aria-hidden="true"
            >
              {WAVE_BARS.map(i => (
                <span
                  key={i}
                  className={cn(
                    'w-[3px] rounded-full bg-voice',
                    WAVE_HEIGHTS[i % WAVE_HEIGHTS.length]
                  )}
                />
              ))}
            </div>
            <p
              className="font-mono text-4xl font-medium tabular-nums"
              aria-label="Call duration"
            >
              {formatDuration(elapsed)}
            </p>
          </div>

          {live && work ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className={cn(
                  'h-11 gap-2 text-white hover:bg-white/10 hover:text-white',
                  muted && 'bg-white/15'
                )}
                onClick={() => setMuted(!muted)}
                aria-pressed={muted}
              >
                {muted ? (
                  <MicOff className="size-4" aria-hidden="true" />
                ) : (
                  <Mic className="size-4" aria-hidden="true" />
                )}
                {muted ? 'Unmute' : 'Mute'}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  'h-11 gap-2 text-white hover:bg-white/10 hover:text-white',
                  work.onHold && 'bg-warning/25'
                )}
                disabled={busy}
                onClick={() => void toggleHold()}
              >
                {work.onHold ? (
                  <Play className="size-4" aria-hidden="true" />
                ) : (
                  <Pause className="size-4" aria-hidden="true" />
                )}
                {work.onHold ? 'Resume' : 'Hold'}
              </Button>
              <Button
                variant="ghost"
                className="h-11 gap-2 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setTransferOpen(true)}
              >
                <ArrowRightLeft className="size-4" aria-hidden="true" />{' '}
                Transfer
              </Button>
              <Button
                className="h-11 gap-2 bg-negative text-white hover:bg-negative/90"
                onClick={() => setWrapOpen(true)}
              >
                <PhoneOff className="size-4" aria-hidden="true" /> End & wrap up
              </Button>
            </div>
          ) : null}
          {ended ? (
            <Button
              className="h-11 gap-2 bg-white text-ink hover:bg-white/90"
              onClick={() =>
                document
                  .getElementById('call-playback')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              <Waves className="size-4" aria-hidden="true" /> Review call
            </Button>
          ) : null}
        </div>
        {work ? (
          <div className="relative mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 text-xs text-white/70">
            <PriorityBadge priority={work.priority} />
            <SentimentBadge
              sentiment={work.sentiment}
              className="text-white/80"
            />
            {work.caseNumber ? (
              <span className="font-mono">Case {work.caseNumber}</span>
            ) : null}
            <span className="truncate">{work.subject}</span>
          </div>
        ) : null}
      </section>

      <LayoutCanvas
        spec={VOICE_LAYOUT}
        slots={{
          playback: ended ? (
            <CallPlayback
              messages={messages}
              customerName={customerName}
              analysis={analysis.data}
              seekRequest={seekRequest}
            />
          ) : null,
          analysis:
            work?.status === 'Closed' ? (
              <CallAnalysisPanel
                analysis={analysis}
                onRegenerate={() => void regenerate()}
                regenerating={regenerating}
                onSeek={ended ? playFrom : undefined}
              />
            ) : null,
          customer: profileId ? (
            <CustomerSnapshotPanel recordId={profileId} name={customerName} />
          ) : null,
          pace:
            live && work ? (
              <ResponsePacePanel
                messages={messages}
                live={live}
                now={now}
                targetSeconds={10}
                variant="voice"
              />
            ) : null,
          notes: work ? (
            <ConversationNotesPanel
              workId={work.id}
              caseId={caseId}
              elapsedSeconds={elapsed}
            />
          ) : null,
          sla: caseId ? <CaseSlaPanel caseId={caseId} /> : null,
          routing: work ? (
            <RoutingPanel workId={work.id} title="Why this call reached you" />
          ) : null,
          transcript: ended ? null : (
            <Panel
              title="Live transcript"
              icon={Voicemail}
              action={
                live ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-negative">
                    <span className="size-2 animate-pulse rounded-full bg-negative" />{' '}
                    Recording
                  </span>
                ) : null
              }
              bodyClassName="space-y-4"
            >
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
                  icon={Voicemail}
                  title="No transcript for this call"
                  detail="Transcripts are captured for calls routed through this console."
                />
              ) : (
                <Transcript
                  messages={messages}
                  customerName={customerName}
                  typing={convo.customerTyping}
                  variant="voice"
                  className="max-h-[52vh] min-h-64 pr-1"
                />
              )}
              {live && work ? (
                <form
                  onSubmit={event => void speak(event)}
                  className="flex gap-2 border-t pt-4"
                >
                  <Input
                    value={line}
                    onChange={event => setLine(event.target.value)}
                    placeholder={
                      work.onHold
                        ? 'Caller is on hold'
                        : muted
                          ? 'You are muted'
                          : 'Say something to the caller…'
                    }
                    disabled={work.onHold || muted || convo.sending}
                    aria-label="What you say"
                    className="h-11"
                  />
                  <Button
                    type="submit"
                    className="h-11 gap-2"
                    disabled={
                      !line.trim() || work.onHold || muted || convo.sending
                    }
                  >
                    <Send className="size-4" aria-hidden="true" /> Speak
                  </Button>
                </form>
              ) : null}
            </Panel>
          ),
          wrapSummary:
            work?.status === 'Closed' && work.summary ? (
              <Panel title="Wrap-up summary" icon={Voicemail}>
                <p className="text-sm whitespace-pre-line">{work.summary}</p>
              </Panel>
            ) : null,
          callDetails: (
            <Panel title="Call details" icon={PhoneCall}>
              <dl className="grid divide-y sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
                <FieldRow label="Call">{call.data?.name}</FieldRow>
                <FieldRow label="Type">{call.data?.callType}</FieldRow>
                <FieldRow label="Started">
                  {formatDateTime(
                    call.data?.startTime ?? call.data?.createdDate
                  )}
                </FieldRow>
                <FieldRow label="From">{call.data?.fromNumber}</FieldRow>
                <FieldRow label="To">{call.data?.toNumber}</FieldRow>
                <FieldRow label="Disposition">
                  {call.data?.disposition}
                </FieldRow>
              </dl>
            </Panel>
          ),
          assistant: caseId ? (
            <ServiceAssistant
              caseId={caseId}
              workId={live ? work?.id : null}
              turn={live ? String(customerTurns) : 'static'}
              onInsert={live ? setLine : undefined}
              insertLabel="Say"
            />
          ) : null,
          coach:
            live && work ? (
              <CoachPanel
                workId={work.id}
                turn={customerTurns}
                onUseLine={text => setLine(text)}
              />
            ) : null,
          caseContext: caseId ? (
            <CaseContextTabs
              caseId={caseId}
              caseNumber={work?.caseNumber ?? null}
              onInsert={text => setLine(text)}
            />
          ) : null,
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
    </div>
  );
}

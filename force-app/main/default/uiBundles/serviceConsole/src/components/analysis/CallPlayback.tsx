import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  ScissorsLineDashed,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  CallAnalysis,
  CallMarker,
  ConversationMessage,
} from '@/api/console/consoleApi';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/console/primitives';
import {
  buildTimeline,
  escapeRegExp,
  KEYWORD_TONE,
  MARKER_META,
  mentions,
  segmentAt,
  type Segment,
} from './callTimeline';

const RATES = [1, 1.5, 2] as const;
type Rate = (typeof RATES)[number];

export interface SeekRequest {
  messageId: string;
  nonce: number;
}

function pct(value: number, total: number): string {
  return `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
}

function Highlighted({ text, term }: { text: string; term: string | null }) {
  if (!term) {
    return <>{text}</>;
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={index} className="rounded bg-ai/20 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}

function useVoices() {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    supported ? window.speechSynthesis.getVoices() : []
  );
  useEffect(() => {
    if (!supported) {
      return;
    }
    const load = () => setVoices(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);
  const english = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const pool = english.length ? english : voices;
  return {
    supported,
    agent: pool[0] ?? null,
    customer: pool.find(v => v.name !== pool[0]?.name) ?? pool[0] ?? null,
  };
}

/**
 * Replays a finished call on a scrubbable timeline: speaker lanes, AI markers,
 * keyword hits, and a synced transcript. Optionally reads turns aloud.
 */
export function CallPlayback({
  messages,
  customerName,
  analysis,
  seekRequest,
}: {
  messages: ConversationMessage[];
  customerName: string;
  analysis: CallAnalysis | null;
  seekRequest: SeekRequest | null;
}) {
  const [skipSilence, setSkipSilence] = useState(true);
  const timeline = useMemo(
    () => buildTimeline(messages, skipSilence),
    [messages, skipSilence]
  );
  const { segments, events, duration } = timeline;
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<Rate>(1);
  const [readAloud, setReadAloud] = useState(false);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);
  const positionRef = useRef(0);
  const speakingRef = useRef(false);
  const spokenRef = useRef(-1);
  const trackRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const voices = useVoices();

  const current = segmentAt(segments, position);
  const active =
    current >= 0 && position <= segments[current].end + 0.4 ? current : -1;
  const firstName = customerName.split(' ')[0] || 'Customer';

  const markersById = useMemo(() => {
    const map = new Map<string, CallMarker[]>();
    for (const marker of analysis?.markers ?? []) {
      map.set(marker.messageId, [...(map.get(marker.messageId) ?? []), marker]);
    }
    return map;
  }, [analysis]);

  const keywordHits = useMemo(
    () =>
      (analysis?.keywords ?? []).map(k => ({
        ...k,
        hits: segments.filter(s => mentions(s.text, k.term)),
      })),
    [analysis, segments]
  );
  const activeHits = keyword
    ? (keywordHits.find(k => k.term === keyword)?.hits ?? [])
    : [];

  const seek = useCallback(
    (to: number, max: number = duration) => {
      const next = Math.max(0, Math.min(max, to));
      positionRef.current = next;
      setPosition(next);
      speakingRef.current = false;
      spokenRef.current = -1;
      if (voices.supported) {
        window.speechSynthesis.cancel();
      }
      setSeekNonce(n => n + 1);
    },
    [duration, voices.supported]
  );

  const seekToSegment = useCallback(
    (segment: Segment | undefined) => {
      if (segment) {
        seek(segment.start);
      }
    },
    [seek]
  );

  const handledSeek = useRef(0);
  useEffect(() => {
    if (!seekRequest || handledSeek.current === seekRequest.nonce) {
      return;
    }
    handledSeek.current = seekRequest.nonce;
    const target = segments.find(s => s.id === seekRequest.messageId);
    if (target) {
      seek(target.start);
      setPlaying(true);
    }
  }, [seekRequest, segments, seek]);

  useEffect(() => {
    if (!playing) {
      if (voices.supported) {
        window.speechSynthesis.cancel();
      }
      speakingRef.current = false;
      spokenRef.current = -1;
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * rate;
      last = now;
      let next = positionRef.current + dt;
      const index = segmentAt(segments, positionRef.current);
      if (speakingRef.current && index >= 0 && next > segments[index].end) {
        next = segments[index].end;
      }
      if (next >= duration) {
        positionRef.current = duration;
        setPosition(duration);
        setPlaying(false);
        return;
      }
      positionRef.current = next;
      setPosition(next);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, rate, segments, duration, voices.supported]);

  useEffect(() => {
    if (
      !playing ||
      !readAloud ||
      !voices.supported ||
      current < 0 ||
      spokenRef.current === current
    ) {
      return;
    }
    const segment = segments[current];
    if (positionRef.current > segment.end) {
      return;
    }
    spokenRef.current = current;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(segment.text);
    const voice = segment.speaker === 'Agent' ? voices.agent : voices.customer;
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = rate;
    utterance.pitch = segment.speaker === 'Agent' ? 1 : 1.1;
    utterance.onend = () => {
      speakingRef.current = false;
    };
    speakingRef.current = true;
    window.speechSynthesis.speak(utterance);
  }, [current, playing, readAloud, voices, segments, rate, seekNonce]);

  useEffect(() => {
    const log = logRef.current;
    if (!log || active < 0) {
      return;
    }
    const row = log.querySelector<HTMLElement>(`[data-turn="${active}"]`);
    if (row) {
      log.scrollTo({
        top: row.offsetTop - log.clientHeight / 3,
        behavior: 'smooth',
      });
    }
  }, [active]);

  const togglePlay = () => {
    if (!playing && position >= duration - 0.05) {
      seek(0);
    }
    setPlaying(!playing);
  };

  const onTrackPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    seek(((event.clientX - rect.left) / rect.width) * duration);
  };

  const onTrackKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -5,
      ArrowRight: 5,
      PageDown: -15,
      PageUp: 15,
    };
    if (event.key in steps) {
      event.preventDefault();
      seek(position + steps[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      seek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seek(duration);
    } else if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      togglePlay();
    }
  };

  const toggleSkipSilence = () => {
    const next = !skipSilence;
    const anchor = active >= 0 ? segments[active].id : null;
    const rebuilt = buildTimeline(messages, next);
    const target = anchor
      ? rebuilt.segments.find(s => s.id === anchor)
      : undefined;
    setSkipSilence(next);
    seek(target ? target.start : 0, rebuilt.duration);
  };

  const nextHit = () => {
    const after =
      activeHits.find(s => s.start > position + 0.2) ?? activeHits[0];
    seekToSegment(after);
  };

  const agentWords = segments
    .filter(s => s.speaker === 'Agent')
    .reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  const customerWords = segments
    .filter(s => s.speaker === 'Customer')
    .reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  const talkTotal = Math.max(1, agentWords + customerWords);
  const longest = segments.reduce<Segment | null>(
    (best, s) => (!best || s.end - s.start > best.end - best.start ? s : best),
    null
  );

  return (
    <Panel
      title="Call playback"
      icon={Waves}
      className="scroll-mt-20"
      action={
        <span className="text-xs text-muted-foreground">
          {segments.length} turns · {formatDuration(duration)}
        </span>
      }
      bodyClassName="space-y-4"
    >
      <div id="call-playback" className="rounded-xl bg-ink p-4 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => seek(position - 10)}
            aria-label="Back 10 seconds"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex size-11 items-center justify-center rounded-full bg-white text-ink transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            aria-label={playing ? 'Pause playback' : 'Play call'}
          >
            {playing ? (
              <Pause className="size-5" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 size-5" aria-hidden="true" />
            )}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => seek(position + 10)}
            aria-label="Forward 10 seconds"
          >
            <RotateCw className="size-4" aria-hidden="true" />
          </Button>
          <p className="ml-1 font-mono text-sm tabular-nums">
            {formatDuration(position)}{' '}
            <span className="text-white/45">/ {formatDuration(duration)}</span>
          </p>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-white hover:bg-white/10 hover:text-white"
            onClick={() =>
              setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])
            }
            aria-label={`Playback speed ${rate}x`}
          >
            {rate}x
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'text-white hover:bg-white/10 hover:text-white',
              skipSilence && 'bg-white/15'
            )}
            onClick={toggleSkipSilence}
            aria-pressed={skipSilence}
            title="Squeeze out dead air"
          >
            <ScissorsLineDashed className="size-3.5" aria-hidden="true" /> Skip
            silence
          </Button>
          {voices.supported ? (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'text-white hover:bg-white/10 hover:text-white',
                readAloud && 'bg-white/15'
              )}
              onClick={() => setReadAloud(!readAloud)}
              aria-pressed={readAloud}
              title="Read each turn aloud with your browser's voices"
            >
              {readAloud ? (
                <Volume2 className="size-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="size-3.5" aria-hidden="true" />
              )}
              Read aloud
            </Button>
          ) : null}
        </div>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Call timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
          onPointerDown={onTrackPointer}
          onKeyDown={onTrackKey}
          className="relative mt-4 h-28 cursor-pointer touch-none rounded-lg focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          <div className="absolute inset-x-0 top-0 h-6">
            {segments.flatMap(segment =>
              (markersById.get(segment.id) ?? []).map((marker, i) => {
                const meta = MARKER_META[marker.kind];
                const Icon = meta.icon;
                return (
                  <button
                    key={`${segment.id}-${i}`}
                    type="button"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => seekToSegment(segment)}
                    className={cn(
                      'absolute top-0 flex size-6 -translate-x-1/2 items-center justify-center rounded-full text-white ring-2 ring-ink transition-transform hover:scale-110',
                      meta.dot
                    )}
                    style={{ left: pct(segment.start, duration) }}
                    title={`${meta.label}: ${marker.label} (${formatDuration(segment.start)})`}
                    aria-label={`${meta.label} at ${formatDuration(segment.start)}: ${marker.label}`}
                  >
                    <Icon className="size-3" aria-hidden="true" />
                  </button>
                );
              })
            )}
          </div>
          <span className="absolute top-8 left-0 text-[10px] font-medium text-white/45">
            You
          </span>
          <span className="absolute top-[4.25rem] left-0 text-[10px] font-medium text-white/45">
            {firstName}
          </span>
          <div className="absolute inset-x-0 top-12 h-px bg-white/10" />
          {segments.map(segment => (
            <span
              key={segment.id}
              className={cn(
                'absolute h-4 rounded-sm transition-opacity',
                segment.speaker === 'Agent'
                  ? 'top-[2.25rem] bg-case'
                  : segment.sentiment === 'Negative'
                    ? 'top-[3.5rem] bg-negative'
                    : segment.sentiment === 'Positive'
                      ? 'top-[3.5rem] bg-positive'
                      : 'top-[3.5rem] bg-voice',
                keyword && !activeHits.includes(segment) && 'opacity-30'
              )}
              style={{
                left: pct(segment.start, duration),
                width: pct(segment.end - segment.start, duration),
              }}
            />
          ))}
          {events.map(event => (
            <span
              key={event.id}
              className="absolute top-[5.25rem] size-1.5 -translate-x-1/2 rounded-full bg-white/40"
              style={{ left: pct(event.at, duration) }}
              title={event.text}
            />
          ))}
          {activeHits.map(segment => (
            <span
              key={`hit-${segment.id}`}
              className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2 bg-ai"
              style={{ left: pct(segment.start, duration) }}
            />
          ))}
          <span
            className="pointer-events-none absolute top-6 bottom-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_3px_oklch(1_0_0/0.15)]"
            style={{ left: pct(position, duration) }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-white/45">
          <span>0:00</span>
          <span>{formatDuration(duration / 2)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm @md:grid-cols-4">
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Talk share</dt>
          <dd className="font-medium">
            You {Math.round((agentWords / talkTotal) * 100)}% · {firstName}{' '}
            {Math.round((customerWords / talkTotal) * 100)}%
          </dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Customer turns</dt>
          <dd className="font-medium">
            {segments.filter(s => s.speaker === 'Customer').length}
          </dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Longest turn</dt>
          <dd className="font-medium">
            {longest
              ? `${longest.speaker === 'Agent' ? 'You' : firstName} · ${formatDuration(longest.end - longest.start)}`
              : '—'}
          </dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Key moments</dt>
          <dd className="font-medium">
            {analysis ? analysis.markers.length : '…'}
          </dd>
        </div>
      </dl>

      {keywordHits.length ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Keywords spoken
          </p>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Keyword filters"
          >
            {keywordHits.map(k => (
              <button
                key={k.term}
                type="button"
                aria-pressed={keyword === k.term}
                onClick={() => setKeyword(keyword === k.term ? null : k.term)}
                disabled={!k.hits.length}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                  KEYWORD_TONE[k.category],
                  keyword === k.term && 'bg-ai/12 ring-2 ring-ai/30'
                )}
              >
                {k.term}
                <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                  {k.hits.length}
                </span>
              </button>
            ))}
            {keyword && activeHits.length ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={nextHit}
                className="h-7"
              >
                Next mention{' '}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol
        ref={logRef}
        className="relative max-h-[26rem] space-y-1 overflow-y-auto overscroll-contain pr-1"
        aria-label="Synced transcript"
      >
        {segments.map((segment, index) => {
          const markers = markersById.get(segment.id) ?? [];
          const mine = segment.speaker === 'Agent';
          return (
            <li key={segment.id} data-turn={index}>
              <button
                type="button"
                onClick={() => seekToSegment(segment)}
                aria-current={index === active ? 'true' : undefined}
                className={cn(
                  'grid w-full grid-cols-[3rem_1fr] gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60',
                  index === active && 'bg-voice/8 ring-1 ring-voice/30',
                  keyword && !activeHits.includes(segment) && 'opacity-50'
                )}
              >
                <span className="pt-0.5 text-right">
                  <span
                    className={cn(
                      'block text-xs font-semibold',
                      mine ? 'text-case' : 'text-voice'
                    )}
                  >
                    {mine ? 'You' : firstName}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {formatDuration(segment.start)}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-relaxed">
                    <Highlighted text={segment.text} term={keyword} />
                  </span>
                  {markers.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {markers.map((marker, i) => {
                        const meta = MARKER_META[marker.kind];
                        const Icon = meta.icon;
                        return (
                          <span
                            key={i}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              meta.soft,
                              meta.text
                            )}
                            title={marker.detail}
                          >
                            <Icon className="size-3" aria-hidden="true" />{' '}
                            {marker.label}
                          </span>
                        );
                      })}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

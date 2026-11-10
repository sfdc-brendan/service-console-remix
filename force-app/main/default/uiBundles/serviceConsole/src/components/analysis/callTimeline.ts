import type { LucideIcon } from 'lucide-react';
import {
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  Handshake,
  HeartPulse,
  ScrollText,
  ShieldAlert,
  Siren,
  Swords,
} from 'lucide-react';
import type {
  ConversationMessage,
  KeywordCategory,
  MarkerKind,
  Sentiment,
} from '@/api/console/consoleApi';

export const MARKER_META: Record<
  MarkerKind,
  { label: string; icon: LucideIcon; dot: string; text: string; soft: string }
> = {
  issue: {
    label: 'Issue',
    icon: CircleAlert,
    dot: 'bg-voice',
    text: 'text-voice',
    soft: 'bg-voice/12',
  },
  objection: {
    label: 'Objection',
    icon: ShieldAlert,
    dot: 'bg-warning',
    text: 'text-warning',
    soft: 'bg-warning/15',
  },
  escalation: {
    label: 'Escalation',
    icon: Siren,
    dot: 'bg-negative',
    text: 'text-negative',
    soft: 'bg-negative/12',
  },
  commitment: {
    label: 'Commitment',
    icon: Handshake,
    dot: 'bg-case',
    text: 'text-case',
    soft: 'bg-case/12',
  },
  resolution: {
    label: 'Resolution',
    icon: CheckCircle2,
    dot: 'bg-positive',
    text: 'text-positive',
    soft: 'bg-positive/12',
  },
  compliance: {
    label: 'Compliance',
    icon: ScrollText,
    dot: 'bg-ink',
    text: 'text-ink',
    soft: 'bg-ink/10',
  },
  competitor: {
    label: 'Competitor',
    icon: Swords,
    dot: 'bg-messaging',
    text: 'text-messaging',
    soft: 'bg-messaging/12',
  },
  pricing: {
    label: 'Pricing',
    icon: BadgeDollarSign,
    dot: 'bg-ai',
    text: 'text-ai',
    soft: 'bg-ai/12',
  },
  emotion: {
    label: 'Emotion',
    icon: HeartPulse,
    dot: 'bg-negative/70',
    text: 'text-negative',
    soft: 'bg-negative/10',
  },
};

export const KEYWORD_TONE: Record<KeywordCategory, string> = {
  product: 'border-case/30 text-case',
  issue: 'border-voice/30 text-voice',
  competitor: 'border-messaging/30 text-messaging',
  emotion: 'border-negative/30 text-negative',
  commitment: 'border-positive/30 text-positive',
  pricing: 'border-ai/30 text-ai',
};

export interface Segment {
  id: string;
  turn: number;
  speaker: 'Agent' | 'Customer';
  text: string;
  sentiment: Sentiment | null;
  start: number;
  end: number;
}

export interface TimelineEvent {
  id: string;
  text: string;
  at: number;
}

export interface CallTimeline {
  segments: Segment[];
  events: TimelineEvent[];
  duration: number;
}

const WORDS_PER_SECOND = 2.6;
const MAX_SILENCE = 1.2;
const MIN_GAP = 0.4;

/** Speech length estimated from word count, since simulated calls have no audio. */
export function speechSeconds(text: string): number {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(24, Math.max(1.5, count / WORDS_PER_SECOND));
}

/**
 * Lays turns out on a time axis from their sent times. With `skipSilence`, dead air longer
 * than a second is squeezed out so reviewers hear the conversation, not the waiting.
 */
export function buildTimeline(
  messages: ConversationMessage[],
  skipSilence: boolean
): CallTimeline {
  const ordered = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );
  const segments: Segment[] = [];
  const events: TimelineEvent[] = [];
  let cursor = 0;
  let previousSent: number | null = null;
  let previousLength = 0;
  for (const message of ordered) {
    const sent = new Date(message.sentAt).getTime();
    const spoken = message.sender === 'Agent' || message.sender === 'Customer';
    const length = spoken ? speechSeconds(message.body) : 0;
    let gap =
      previousSent === null
        ? 0
        : Math.max(0, (sent - previousSent) / 1000 - previousLength);
    if (skipSilence) {
      gap = Math.min(gap, MAX_SILENCE);
    }
    const start =
      previousSent === null ? 0 : cursor + Math.max(gap, spoken ? MIN_GAP : 0);
    if (spoken) {
      segments.push({
        id: message.id,
        turn: segments.length + 1,
        speaker: message.sender === 'Agent' ? 'Agent' : 'Customer',
        text: message.body,
        sentiment: message.sentiment,
        start,
        end: start + length,
      });
    } else {
      events.push({ id: message.id, text: message.body, at: start });
    }
    cursor = start + length;
    previousSent = sent;
    previousLength = length;
  }
  return { segments, events, duration: Math.max(1, cursor + 1) };
}

/** Index of the turn playing at `position`, or the last one that started before it. */
export function segmentAt(segments: Segment[], position: number): number {
  let index = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start <= position + 0.01) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentions(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

import { useEffect, useRef } from 'react';
import { Bot, Headset, Info, UserRound, Eye } from 'lucide-react';
import type { ConversationMessage, Sender } from '@/api/console/consoleApi';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SentimentBadge } from '@/components/console/primitives';

const SENDER_LABEL: Record<Sender, string> = {
  Customer: 'Customer',
  Agent: 'You',
  System: 'System',
  AI: 'Agentforce',
  Supervisor: 'Supervisor',
};

function TypingIndicator({ name, variant }: { name: string; variant: 'voice' | 'chat' }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className={cn('typing-dots flex gap-1 rounded-full px-3 py-2', variant === 'chat' ? 'bg-muted' : 'bg-voice/10')}>
        <span className="size-1.5 rounded-full bg-current" />
        <span className="size-1.5 rounded-full bg-current" />
        <span className="size-1.5 rounded-full bg-current" />
      </span>
      {variant === 'voice' ? `${name} is speaking…` : `${name} is typing…`}
    </div>
  );
}

export function Transcript({
  messages,
  customerName,
  typing,
  variant,
  className,
}: {
  messages: ConversationMessage[];
  customerName: string;
  typing: boolean;
  variant: 'voice' | 'chat';
  className?: string;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastSender = messages[messages.length - 1]?.sender;

  useEffect(() => {
    const log = logRef.current;
    if (log && (pinnedRef.current || lastSender === 'Agent')) {
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, typing, lastSender]);

  return (
    <div
      ref={logRef}
      onScroll={event => {
        const log = event.currentTarget;
        pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 96;
      }}
      className={cn('space-y-3 overflow-y-auto overscroll-contain', className)}
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {messages.map(message => {
        if (message.sender === 'System') {
          return (
            <p key={message.id} className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="size-3" aria-hidden="true" /> {message.body} · {formatTime(message.sentAt)}
            </p>
          );
        }
        const mine = message.sender === 'Agent';
        const name = message.sender === 'Customer' ? customerName : SENDER_LABEL[message.sender];
        if (variant === 'voice') {
          return (
            <div key={message.id} className="grid grid-cols-[4.5rem_1fr] gap-3">
              <div className="pt-0.5 text-right">
                <p className={cn('text-xs font-semibold', mine ? 'text-case' : 'text-voice')}>{mine ? 'Agent' : name.split(' ')[0]}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{formatTime(message.sentAt)}</p>
              </div>
              <div className={cn('border-l-2 pl-3', mine ? 'border-case/40' : 'border-voice/50')}>
                <p className="text-sm leading-relaxed">{message.body}</p>
                {message.sender === 'Customer' && message.sentiment && message.sentiment !== 'Neutral' ? (
                  <SentimentBadge sentiment={message.sentiment} className="mt-1" />
                ) : null}
              </div>
            </div>
          );
        }
        const Icon = message.sender === 'Customer' ? UserRound : message.sender === 'AI' ? Bot : message.sender === 'Supervisor' ? Eye : Headset;
        return (
          <div key={message.id} className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full',
                mine ? 'bg-ink text-white' : 'bg-messaging/15 text-messaging'
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <div className={cn('max-w-[78%]', mine && 'text-right')}>
              <div
                className={cn(
                  'inline-block rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed',
                  mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border bg-card'
                )}
              >
                {message.body}
              </div>
              <p className="mt-1 px-1 text-[10px] text-muted-foreground">
                {name} · {formatTime(message.sentAt)}
              </p>
            </div>
          </div>
        );
      })}
      {typing ? <TypingIndicator name={customerName.split(' ')[0] || 'Customer'} variant={variant} /> : null}
    </div>
  );
}

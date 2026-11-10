import type { ComponentProps, ReactNode } from 'react';
import { AlertTriangle, Briefcase, MessageSquareText, Phone, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Channel, PresenceStatus, Priority, Sentiment } from '@/api/console/consoleApi';

export const CHANNEL_META: Record<Channel, { icon: LucideIcon; label: string; text: string; bg: string; soft: string }> = {
  Case: { icon: Briefcase, label: 'Case', text: 'text-case', bg: 'bg-case', soft: 'bg-case/10' },
  Voice: { icon: Phone, label: 'Voice', text: 'text-voice', bg: 'bg-voice', soft: 'bg-voice/10' },
  Messaging: { icon: MessageSquareText, label: 'Messaging', text: 'text-messaging', bg: 'bg-messaging', soft: 'bg-messaging/10' },
};

export function ChannelIcon({ channel, className, solid }: { channel: Channel; className?: string; solid?: boolean }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
        solid ? cn(meta.bg, 'text-white') : cn(meta.soft, meta.text),
        className
      )}
      aria-label={meta.label}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

const PRIORITY_CLASS: Record<Priority, string> = {
  Critical: 'bg-negative text-white',
  High: 'bg-voice/15 text-voice',
  Medium: 'bg-secondary text-secondary-foreground',
  Low: 'bg-muted text-muted-foreground',
};

export function PriorityBadge({ priority, className }: { priority: string | null | undefined; className?: string }) {
  const known = (priority && priority in PRIORITY_CLASS ? priority : 'Medium') as Priority;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        PRIORITY_CLASS[known],
        className
      )}
    >
      {priority || 'Medium'}
    </span>
  );
}

const SENTIMENT_CLASS: Record<Sentiment, { dot: string; text: string }> = {
  Positive: { dot: 'bg-positive', text: 'text-positive' },
  Neutral: { dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  Negative: { dot: 'bg-negative', text: 'text-negative' },
};

export function SentimentBadge({ sentiment, className }: { sentiment: Sentiment | null | undefined; className?: string }) {
  const value = sentiment ?? 'Neutral';
  const meta = SENTIMENT_CLASS[value];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', meta.text, className)}>
      <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden="true" />
      {value}
    </span>
  );
}

export const PRESENCE_META: Record<PresenceStatus, { dot: string; label: string; ring: string }> = {
  Online: { dot: 'bg-positive', label: 'Available', ring: 'ring-positive/40' },
  Busy: { dot: 'bg-voice', label: 'Busy', ring: 'ring-voice/40' },
  Break: { dot: 'bg-warning', label: 'On break', ring: 'ring-warning/40' },
  Offline: { dot: 'bg-muted-foreground/60', label: 'Offline', ring: 'ring-muted-foreground/30' },
};

export function PresenceDot({ status, className }: { status: PresenceStatus; className?: string }) {
  return <span className={cn('inline-block size-2.5 rounded-full', PRESENCE_META[status].dot, className)} aria-hidden="true" />;
}

export function PersonAvatar({
  name,
  photoUrl,
  status,
  size = 'default',
  className,
}: {
  name: string | null | undefined;
  photoUrl?: string | null;
  status?: PresenceStatus;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <Avatar size={size}>
        {photoUrl && !photoUrl.includes('/profilephoto/005/') ? <AvatarImage src={photoUrl} alt="" /> : null}
        <AvatarFallback className="bg-ink text-[11px] font-semibold text-white">{initials(name)}</AvatarFallback>
      </Avatar>
      {status ? (
        <PresenceDot status={status} className="absolute -right-0.5 -bottom-0.5 size-3 ring-2 ring-card" />
      ) : null}
    </span>
  );
}

/** Horizontal meter drawn in SVG so widths stay out of inline styles. */
export function Meter({
  segments,
  className,
}: {
  segments: { value: number; className: string; label?: string }[];
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  let offset = 0;
  return (
    <svg className={cn('h-2 w-full overflow-hidden rounded-full', className)} viewBox="0 0 100 4" preserveAspectRatio="none" role="img">
      <rect x="0" y="0" width="100" height="4" className="fill-muted" />
      {total > 0
        ? segments.map((s, i) => {
            const width = (Math.max(0, s.value) / total) * 100;
            const x = offset;
            offset += width;
            return (
              <rect key={i} x={x} y="0" width={width} height="4" className={s.className}>
                {s.label ? <title>{s.label}</title> : null}
              </rect>
            );
          })
        : null}
    </svg>
  );
}

/** A ratio meter, e.g. used capacity out of capacity. */
export function RatioMeter({ value, max, className, barClass }: { value: number; max: number; className?: string; barClass?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <svg className={cn('h-1.5 w-full overflow-hidden rounded-full', className)} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="100" height="4" className="fill-muted" />
      <rect x="0" y="0" width={pct} height="4" className={barClass ?? (pct >= 100 ? 'fill-voice' : 'fill-case')} />
    </svg>
  );
}

export function CountdownRing({ remaining, total, className }: { remaining: number; total: number; className?: string }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <span className={cn('relative inline-flex size-11 items-center justify-center', className)}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="fill-none stroke-white/15" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          className={cn('fill-none transition-[stroke-dashoffset] duration-1000 ease-linear', fraction < 0.3 ? 'stroke-negative' : 'stroke-voice')}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="font-mono text-xs font-medium">{Math.ceil(remaining)}</span>
    </span>
  );
}

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  tone = 'default',
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: 'default' | 'ai';
}) {
  return (
    <section
      className={cn(
        'rounded-xl border bg-card shadow-[0_1px_0_oklch(0.2_0.03_258/0.04),0_8px_24px_-16px_oklch(0.2_0.03_258/0.25)]',
        tone === 'ai' && 'ai-surface border-ai/25',
        className
      )}
    >
      {title ? (
        <header className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          {Icon ? <Icon className={cn('size-4', tone === 'ai' ? 'text-ai' : 'text-muted-foreground')} aria-hidden="true" /> : null}
          <h2 className="flex-1 text-sm font-semibold">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn('px-4 pb-4', !title && 'pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function AiTag({ className, label = 'AI' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-ai/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ai',
        className
      )}
    >
      <Sparkles className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ShimmerLines({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-3/4'];
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cn('ai-shimmer h-3 rounded-full', widths[i % widths.length])} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, detail, children }: { icon: LucideIcon; title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {detail ? <p className="max-w-xs text-xs text-muted-foreground">{detail}</p> : null}
      {children}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-xs text-negative">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-semibold underline-offset-2 hover:underline">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Kpi({ label, value, hint, accent, className }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display text-3xl leading-none font-semibold tabular-nums', accent)}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60',
        className
      )}
      {...props}
    />
  );
}

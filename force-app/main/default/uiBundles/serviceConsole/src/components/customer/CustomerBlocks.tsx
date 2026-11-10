import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Building2,
  Globe,
  HeartHandshake,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  RefreshCw,
  Smartphone,
  Sparkles,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  ActivityChannel,
  CustomerInsight,
  CustomerProfile,
  TimelineKind,
} from '@/api/console/consoleApi';
import type { Resource } from '@/hooks/useResource';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AiTag,
  ErrorNote,
  Meter,
  Panel,
  PersonAvatar,
  PriorityBadge,
  SentimentBadge,
  ShimmerLines,
} from '@/components/console/primitives';

export const KIND_META: Record<
  TimelineKind,
  { icon: LucideIcon; label: string; tone: string }
> = {
  case: { icon: Briefcase, label: 'Case', tone: 'bg-case/12 text-case' },
  voice: { icon: Phone, label: 'Call', tone: 'bg-voice/12 text-voice' },
  messaging: {
    icon: MessageSquareText,
    label: 'Chat',
    tone: 'bg-messaging/12 text-messaging',
  },
  email: { icon: Mail, label: 'Email', tone: 'bg-muted text-foreground/70' },
  work: { icon: Briefcase, label: 'Work', tone: 'bg-muted text-foreground/70' },
};

export const RELATIONSHIP_TONE: Record<
  CustomerInsight['relationship'],
  string
> = {
  Strong: 'bg-positive/20 text-positive ring-positive/30',
  Stable: 'bg-white/15 text-white ring-white/25',
  'At risk': 'bg-negative/25 text-white ring-negative/50',
};

export function timelinePath(
  kind: TimelineKind,
  recordId: string | null
): string | null {
  if (!recordId) {
    return null;
  }
  const isCase = recordId.startsWith('500');
  switch (kind) {
    case 'voice':
      return isCase ? `/case/${recordId}` : `/voice/${recordId}`;
    case 'messaging':
      return isCase ? `/case/${recordId}` : `/messaging/${recordId}`;
    case 'case':
    case 'email':
    case 'work':
      return `/case/${recordId}`;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export interface CustomerHealth {
  score: number;
  label: 'Healthy' | 'Watch' | 'At risk';
  factors: string[];
}

/** A transparent, explainable score built from what the profile actually shows. */
export function customerHealth(
  profile: CustomerProfile,
  relationship?: CustomerInsight['relationship'] | null
): CustomerHealth {
  const { sentiment, stats } = profile;
  const scored = sentiment.Positive + sentiment.Neutral + sentiment.Negative;
  const factors: string[] = [];
  let score = 72;
  if (scored) {
    const tilt = (sentiment.Positive - sentiment.Negative) / scored;
    score += Math.round(tilt * 20);
    factors.push(
      `${Math.round((sentiment.Positive / scored) * 100)}% positive conversations`
    );
  }
  if (stats.openCases > 1) {
    score -= Math.min(18, (stats.openCases - 1) * 6);
    factors.push(`${stats.openCases} open cases`);
  }
  if (stats.escalated) {
    score -= Math.min(16, stats.escalated * 8);
    factors.push(`${stats.escalated} escalated`);
  }
  if (relationship === 'Strong') {
    score += 8;
  } else if (relationship === 'At risk') {
    score -= 15;
  }
  if (relationship) {
    factors.push(`AI reads the relationship as ${relationship.toLowerCase()}`);
  }
  const clamped = Math.max(5, Math.min(98, score));
  return {
    score: clamped,
    label: clamped >= 75 ? 'Healthy' : clamped >= 50 ? 'Watch' : 'At risk',
    factors,
  };
}

export function HealthRing({
  health,
  className,
  variant = 'dark',
}: {
  health: CustomerHealth;
  className?: string;
  variant?: 'dark' | 'light';
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const tone =
    health.label === 'Healthy'
      ? 'stroke-positive'
      : health.label === 'Watch'
        ? 'stroke-warning'
        : 'stroke-negative';
  return (
    <div
      className={cn('flex items-center gap-3', className)}
      title={health.factors.join(' · ')}
    >
      <span className="relative inline-flex size-16 items-center justify-center">
        <svg
          viewBox="0 0 64 64"
          className="absolute inset-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="32"
            cy="32"
            r={radius}
            className={cn(
              'fill-none',
              variant === 'dark' ? 'stroke-white/15' : 'stroke-muted'
            )}
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            className={cn(
              'fill-none transition-[stroke-dashoffset] duration-700',
              tone
            )}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - health.score / 100)}
          />
        </svg>
        <span className="font-display text-xl font-semibold tabular-nums">
          {health.score}
        </span>
      </span>
      <span>
        <span
          className={cn(
            'block text-[11px] font-semibold uppercase tracking-[0.16em]',
            variant === 'dark' ? 'text-white/55' : 'text-muted-foreground'
          )}
        >
          Health
        </span>
        <span className="block text-sm font-semibold">{health.label}</span>
      </span>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="font-display text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
      {hint ? (
        <p className="text-[10px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

export function Fact({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm">
      <Icon
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

export function BriefingPanel({
  insight,
}: {
  insight: Resource<CustomerInsight>;
}) {
  const data = insight.data;
  return (
    <Panel
      title="AI briefing"
      icon={Sparkles}
      tone="ai"
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void insight.refresh()}
          disabled={insight.loading}
          aria-label="Refresh briefing"
        >
          <RefreshCw
            className={cn('size-3.5', insight.loading && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {insight.error && !data ? (
        <ErrorNote
          message={insight.error}
          onRetry={() => void insight.refresh()}
        />
      ) : !data ? (
        <ShimmerLines lines={5} />
      ) : (
        <div className="space-y-3">
          <p className="font-display text-base leading-snug font-semibold">
            {data.headline}
          </p>
          <p className="text-sm leading-relaxed text-foreground/85">
            {data.summary}
          </p>
          {data.caresAbout.length ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <HeartHandshake className="size-3.5" aria-hidden="true" /> Cares
                about
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {data.caresAbout.map(item => (
                  <li
                    key={item}
                    className="rounded-full bg-ai/12 px-2.5 py-1 text-xs font-medium text-ai"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.approach ? (
            <p className="flex gap-2 rounded-lg bg-white/70 p-2.5 text-sm">
              <Target
                className="mt-0.5 size-4 shrink-0 text-ai"
                aria-hidden="true"
              />
              <span>
                <span className="font-semibold">Approach today:</span>{' '}
                {data.approach}
              </span>
            </p>
          ) : null}
          {data.talkingPoints.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm marker:text-ai">
              {data.talkingPoints.map(point => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
          <AiTag label="From cases, conversations + email" />
        </div>
      )}
    </Panel>
  );
}

function MixLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

export function SentimentMix({
  sentiment,
}: {
  sentiment: CustomerProfile['sentiment'];
}) {
  const total = sentiment.Positive + sentiment.Neutral + sentiment.Negative;
  return (
    <div>
      <MixLabel>Sentiment history</MixLabel>
      {total ? (
        <>
          <Meter
            className="h-2.5"
            segments={[
              {
                value: sentiment.Positive,
                className: 'fill-positive',
                label: 'Positive',
              },
              {
                value: sentiment.Neutral,
                className: 'fill-muted-foreground/40',
                label: 'Neutral',
              },
              {
                value: sentiment.Negative,
                className: 'fill-negative',
                label: 'Negative',
              },
            ]}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{sentiment.Positive} positive</span>
            <span>{sentiment.Neutral} neutral</span>
            <span>{sentiment.Negative} negative</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No conversations scored yet.
        </p>
      )}
    </div>
  );
}

const CHANNEL_FILL: Record<ActivityChannel, string> = {
  Voice: 'fill-voice',
  Messaging: 'fill-messaging',
  Case: 'fill-case',
  Email: 'fill-muted-foreground/50',
};
const CHANNEL_DOT: Record<ActivityChannel, string> = {
  Voice: 'bg-voice',
  Messaging: 'bg-messaging',
  Case: 'bg-case',
  Email: 'bg-muted-foreground/50',
};
const CHANNEL_WORD: Record<ActivityChannel, string> = {
  Voice: 'voice',
  Messaging: 'chat',
  Case: 'cases',
  Email: 'email',
};
const ACTIVITY_CHANNELS: ActivityChannel[] = [
  'Case',
  'Voice',
  'Messaging',
  'Email',
];

export function ChannelMix({
  channelMix,
}: {
  channelMix: CustomerProfile['channelMix'];
}) {
  const total =
    channelMix.Voice +
    channelMix.Messaging +
    channelMix.Case +
    channelMix.Email;
  return (
    <div>
      <MixLabel>Preferred channels</MixLabel>
      {total ? (
        <>
          <Meter
            className="h-2.5"
            segments={ACTIVITY_CHANNELS.map(channel => ({
              value: channelMix[channel],
              className: CHANNEL_FILL[channel],
              label: channel,
            }))}
          />
          <div className="mt-2 flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
            <span>{channelMix.Voice} voice</span>
            <span>{channelMix.Messaging} chat</span>
            <span>{channelMix.Email} email</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No routed conversations yet.
        </p>
      )}
    </div>
  );
}

/** Twelve months of engagement, stacked by channel. */
export function ActivityChart({
  months,
}: {
  months: CustomerProfile['activity']['months'];
}) {
  const totals = months.map(m =>
    ACTIVITY_CHANNELS.reduce((sum, channel) => sum + m[channel], 0)
  );
  const max = Math.max(1, ...totals);
  const all = totals.reduce((sum, value) => sum + value, 0);
  const width = 12;
  const gap = 6;
  const height = 64;
  return (
    <div>
      <svg
        viewBox={`0 0 ${months.length * (width + gap) - gap} ${height}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${all} interactions over the last 12 months`}
      >
        {months.map((month, index) => {
          let y = height;
          return (
            <g key={month.month}>
              <rect
                x={index * (width + gap)}
                y={0}
                width={width}
                height={height}
                rx={2}
                className="fill-muted/60"
              />
              {ACTIVITY_CHANNELS.map(channel => {
                const h = (month[channel] / max) * (height - 4);
                y -= h;
                return h > 0 ? (
                  <rect
                    key={channel}
                    x={index * (width + gap)}
                    y={y}
                    width={width}
                    height={h}
                    className={CHANNEL_FILL[channel]}
                  >
                    <title>{`${month[channel]} ${CHANNEL_WORD[channel]}`}</title>
                  </rect>
                ) : null;
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        {months.map((month, index) => (
          <span
            key={month.month}
            className={cn(index % 2 && 'max-sm:invisible')}
          >
            {new Date(`${month.month}T12:00:00`).toLocaleDateString(undefined, {
              month: 'narrow',
            })}
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ACTIVITY_CHANNELS.map(channel => (
          <li key={channel} className="flex items-center gap-1.5">
            <span
              className={cn('size-2 rounded-full', CHANNEL_DOT[channel])}
              aria-hidden="true"
            />
            {months.reduce((sum, m) => sum + m[channel], 0)}{' '}
            {CHANNEL_WORD[channel]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OpenCasesList({
  cases,
  onNavigate,
}: {
  cases: CustomerProfile['openCases'];
  onNavigate?: () => void;
}) {
  if (!cases.length) {
    return (
      <p className="px-4 pb-3 text-sm text-muted-foreground">
        No open cases. Nice.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {cases.map(c => (
        <li key={c.id}>
          <Link
            to={`/case/${c.id}`}
            onClick={onNavigate}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
          >
            <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
              {c.caseNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {c.subject || '(no subject)'}
              </span>
              <span className="block text-xs text-muted-foreground">
                {c.status} · opened {relativeTime(c.createdDate)}
              </span>
            </span>
            <PriorityBadge priority={c.priority} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

type TimelineFilter = 'all' | 'case' | 'conversation' | 'email';

const TIMELINE_FILTERS: { id: TimelineFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'conversation', label: 'Calls & chats' },
  { id: 'case', label: 'Cases' },
  { id: 'email', label: 'Email' },
];

function matchesFilter(kind: TimelineKind, filter: TimelineFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'case':
      return kind === 'case' || kind === 'work';
    case 'conversation':
      return kind === 'voice' || kind === 'messaging';
    case 'email':
      return kind === 'email';
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

export function InteractionTimeline({
  items,
  onNavigate,
  filterable = false,
  limit,
}: {
  items: CustomerProfile['timeline'];
  onNavigate?: () => void;
  filterable?: boolean;
  limit?: number;
}) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const visible = items
    .filter(item => matchesFilter(item.kind, filter))
    .slice(0, limit);
  return (
    <div className="space-y-3">
      {filterable ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Filter interactions"
        >
          {TIMELINE_FILTERS.map(option => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                filter === option.id
                  ? 'border-ink bg-ink text-white'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {visible.length ? (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
          {visible.map(item => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            const path = timelinePath(item.kind, item.recordId);
            const body = (
              <>
                <span
                  className={cn(
                    'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                    meta.tone
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {item.title || meta.label}
                    </span>
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground"
                      title={formatDateTime(item.at)}
                    >
                      {item.at ? relativeTime(item.at) : ''}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {meta.label}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </span>
                  {item.summary ? (
                    <span className="mt-1 block line-clamp-2 text-xs text-foreground/75">
                      {item.summary}
                    </span>
                  ) : null}
                  {item.sentiment && item.sentiment !== 'Neutral' ? (
                    <SentimentBadge
                      sentiment={item.sentiment}
                      className="mt-1"
                    />
                  ) : null}
                </span>
              </>
            );
            return (
              <li key={`${item.kind}-${item.id}`}>
                {path ? (
                  <Link
                    to={path}
                    onClick={onNavigate}
                    className="-mx-2 flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-accent/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          No interactions recorded yet.
        </p>
      )}
    </div>
  );
}

export function ContactFacts({ profile }: { profile: CustomerProfile }) {
  const { contact, account } = profile;
  return (
    <div className="@container">
      <ul className="grid gap-2 @md:grid-cols-2">
        {contact.email ? (
          <Fact icon={Mail}>
            <a href={`mailto:${contact.email}`} className="hover:underline">
              {contact.email}
            </a>
          </Fact>
        ) : null}
        {contact.phone ? (
          <Fact icon={Phone}>
            <a href={`tel:${contact.phone}`} className="hover:underline">
              {contact.phone}
            </a>
          </Fact>
        ) : null}
        {contact.mobile && contact.mobile !== contact.phone ? (
          <Fact icon={Smartphone}>{contact.mobile}</Fact>
        ) : null}
        {contact.location ? (
          <Fact icon={MapPin}>{contact.location}</Fact>
        ) : null}
        {contact.owner ? (
          <Fact icon={UserRound}>Owned by {contact.owner}</Fact>
        ) : null}
        {account ? (
          <Fact icon={Building2}>
            <Link
              to={`/account/${account.id}`}
              className="font-medium hover:underline"
            >
              {account.name}
            </Link>
            {[account.industry, account.type]
              .filter(Boolean)
              .map(part => ` · ${part}`)
              .join('')}
          </Fact>
        ) : null}
        {account?.website ? <Fact icon={Globe}>{account.website}</Fact> : null}
        {account ? (
          <Fact icon={Users}>
            {account.contacts} contacts · {account.totalCases} cases
            {account.employees
              ? ` · ${account.employees.toLocaleString()} employees`
              : ''}
          </Fact>
        ) : null}
      </ul>
    </div>
  );
}

export function Colleagues({
  colleagues,
}: {
  colleagues: CustomerProfile['colleagues'];
}) {
  if (!colleagues.length) {
    return (
      <p className="px-4 pb-3 text-sm text-muted-foreground">
        No other contacts on this account.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {colleagues.map(person => (
        <li key={person.id}>
          <Link
            to={`/contact/${person.id}`}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
          >
            <PersonAvatar name={person.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {person.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {person.title || person.email || 'Contact'}
              </span>
            </span>
            {person.openCases ? (
              <span className="rounded-full bg-case/10 px-2 py-0.5 text-[11px] font-semibold text-case">
                {person.openCases} open
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

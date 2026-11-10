import { Link } from 'react-router';
import {
  Building2,
  CalendarClock,
  Globe,
  MapPin,
  Network,
  Package,
  Phone,
  ShieldCheck,
  Star,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import type { AccountProfile, CustomerInsight } from '@/api/console/consoleApi';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Meter,
  PersonAvatar,
  PriorityBadge,
} from '@/components/console/primitives';
import {
  Fact,
  type CustomerHealth,
} from '@/components/customer/CustomerBlocks';

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'None'];
const PRIORITY_FILL: Record<string, string> = {
  Critical: 'fill-negative',
  High: 'fill-voice',
  Medium: 'fill-warning',
  Low: 'fill-muted-foreground/40',
  None: 'fill-muted-foreground/20',
};
const PRIORITY_DOT: Record<string, string> = {
  Critical: 'bg-negative',
  High: 'bg-voice',
  Medium: 'bg-warning',
  Low: 'bg-muted-foreground/40',
  None: 'bg-muted-foreground/20',
};

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '–';
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDay(iso: string | null): string {
  return iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '–';
}

/** The same explainable score as a contact, weighted for account-level signals like urgent backlog and SLA misses. */
export function accountHealth(
  profile: AccountProfile,
  relationship?: CustomerInsight['relationship'] | null
): CustomerHealth {
  const { sentiment, stats, service } = profile;
  const scored = sentiment.Positive + sentiment.Neutral + sentiment.Negative;
  const factors: string[] = [];
  let score = 74;
  if (scored) {
    score += Math.round(
      ((sentiment.Positive - sentiment.Negative) / scored) * 18
    );
    factors.push(
      `${Math.round((sentiment.Positive / scored) * 100)}% positive conversations`
    );
  }
  if (stats.urgentOpen) {
    score -= Math.min(20, stats.urgentOpen * 4);
    factors.push(`${stats.urgentOpen} urgent open cases`);
  }
  if (stats.escalated) {
    score -= Math.min(12, stats.escalated * 4);
    factors.push(`${stats.escalated} escalations`);
  }
  if (service.metPct !== null) {
    score += Math.max(-15, Math.min(5, Math.round((service.metPct - 80) / 4)));
    factors.push(`${service.metPct}% of SLA milestones met`);
  }
  if (service.breachedOpen) {
    score -= Math.min(10, service.breachedOpen * 3);
    factors.push(`${service.breachedOpen} milestones breached now`);
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

export function AccountFacts({ profile }: { profile: AccountProfile }) {
  const { account, stats } = profile;
  return (
    <div className="@container space-y-3">
      <ul className="grid gap-2 @md:grid-cols-2">
        {account.industry || account.type ? (
          <Fact icon={Building2}>
            {[account.industry, account.type].filter(Boolean).join(' · ')}
          </Fact>
        ) : null}
        {account.phone ? (
          <Fact icon={Phone}>
            <a href={`tel:${account.phone}`} className="hover:underline">
              {account.phone}
            </a>
          </Fact>
        ) : null}
        {account.website ? (
          <Fact icon={Globe}>
            <a
              href={
                account.website.startsWith('http')
                  ? account.website
                  : `https://${account.website}`
              }
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {account.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </Fact>
        ) : null}
        {account.address ? <Fact icon={MapPin}>{account.address}</Fact> : null}
        <Fact icon={Users}>
          {stats.contacts} contacts
          {account.employees
            ? ` · ${account.employees.toLocaleString()} employees`
            : ''}
        </Fact>
        {account.annualRevenue ? (
          <Fact icon={Wallet}>
            {formatMoney(account.annualRevenue)} annual revenue
          </Fact>
        ) : null}
        {account.rating ? (
          <Fact icon={Star}>{account.rating} rating</Fact>
        ) : null}
        {account.owner ? (
          <Fact icon={UserRound}>Owned by {account.owner}</Fact>
        ) : null}
        {account.parent ? (
          <Fact icon={Network}>
            Part of{' '}
            <Link
              to={`/account/${account.parent.id}`}
              className="font-medium hover:underline"
            >
              {account.parent.name}
            </Link>
          </Fact>
        ) : null}
      </ul>
      {account.description ? (
        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          {account.description}
        </p>
      ) : null}
    </div>
  );
}

function MixLabel({ children }: { children: string }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

export function CaseBreakdown({
  caseMix,
  totalCases,
}: {
  caseMix: AccountProfile['caseMix'];
  totalCases: number;
}) {
  const priorities = PRIORITY_ORDER.filter(p => caseMix.byPriority[p]);
  const openTotal = priorities.reduce(
    (sum, p) => sum + caseMix.byPriority[p],
    0
  );
  const statuses = Object.entries(caseMix.byStatus).sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(1, ...caseMix.byType.map(t => t.count));
  return (
    <div className="@container">
      <div className="grid gap-5 @xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <MixLabel>Open by priority</MixLabel>
            {openTotal ? (
              <>
                <Meter
                  className="h-2.5"
                  segments={priorities.map(p => ({
                    value: caseMix.byPriority[p],
                    className: PRIORITY_FILL[p] ?? 'fill-muted-foreground/30',
                    label: p,
                  }))}
                />
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {priorities.map(p => (
                    <li key={p} className="flex items-center gap-1.5">
                      <span
                        className={cn('size-2 rounded-full', PRIORITY_DOT[p])}
                        aria-hidden="true"
                      />
                      {caseMix.byPriority[p]} {p.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No open cases right now.
              </p>
            )}
          </div>
          {statuses.length ? (
            <div>
              <MixLabel>Open by status</MixLabel>
              <ul className="flex flex-wrap gap-1.5">
                {statuses.map(([status, count]) => (
                  <li
                    key={status}
                    className="rounded-full border px-2.5 py-1 text-xs"
                  >
                    {status}{' '}
                    <span className="font-semibold tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div>
          <MixLabel>Top case types</MixLabel>
          {caseMix.byType.length ? (
            <ul className="space-y-2">
              {caseMix.byType.map(type => (
                <li key={type.label} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{type.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {type.count}
                      {totalCases
                        ? ` · ${Math.round((type.count / totalCases) * 100)}%`
                        : ''}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-case"
                      style={{ width: `${(type.count / maxType) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No cases yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ServiceLevels({
  service,
}: {
  service: AccountProfile['service'];
}) {
  const finished = service.met + service.missed;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-3xl leading-none font-semibold tabular-nums">
              {service.metPct === null ? '–' : `${service.metPct}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              milestones met · last 90 days
            </p>
          </div>
          {service.breachedOpen ? (
            <span className="rounded-full bg-negative/12 px-2.5 py-1 text-xs font-semibold text-negative">
              {service.breachedOpen} breached now
            </span>
          ) : service.inFlight ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {service.inFlight} in flight
            </span>
          ) : null}
        </div>
        {finished ? (
          <>
            <Meter
              className="mt-3 h-2.5"
              segments={[
                {
                  value: service.met,
                  className: 'fill-positive',
                  label: 'Met',
                },
                {
                  value: service.missed,
                  className: 'fill-negative',
                  label: 'Missed',
                },
              ]}
            />
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{service.met} met</span>
              <span>{service.missed} missed</span>
            </div>
          </>
        ) : null}
      </div>
      {service.entitlements.length ? (
        <ul className="space-y-2 border-t pt-3">
          {service.entitlements.map(ent => {
            const expired = ent.endDate !== null && ent.endDate < today;
            return (
              <li key={ent.id} className="flex gap-2.5">
                <ShieldCheck
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    ent.status === 'Active' && !expired
                      ? 'text-positive'
                      : 'text-muted-foreground'
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {ent.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      ent.status,
                      ent.process,
                      ent.endDate ? `through ${formatDay(ent.endDate)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t pt-3 text-sm text-muted-foreground">
          No entitlements on this account.
        </p>
      )}
    </div>
  );
}

export function AccountOpenCases({
  cases,
}: {
  cases: AccountProfile['openCases'];
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
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {c.subject || '(no subject)'}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[
                  c.caseNumber,
                  c.contactName,
                  c.status,
                  `opened ${relativeTime(c.createdDate)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <PriorityBadge priority={c.priority} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AccountPeople({
  contacts,
}: {
  contacts: AccountProfile['contacts'];
}) {
  if (!contacts.length) {
    return (
      <p className="px-4 pb-3 text-sm text-muted-foreground">
        No contacts on this account yet.
      </p>
    );
  }
  const max = Math.max(1, ...contacts.map(c => c.totalCases));
  return (
    <ul className="divide-y">
      {contacts.map(person => (
        <li key={person.id}>
          <Link
            to={`/contact/${person.id}`}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
          >
            <PersonAvatar name={person.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {person.name}
                </span>
                {person.openCases ? (
                  <span className="shrink-0 rounded-full bg-case/10 px-2 py-0.5 text-[11px] font-semibold text-case">
                    {person.openCases} open
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {person.title || person.email || 'Contact'}
              </span>
              <span
                className="mt-1 flex items-center gap-2"
                title={`${person.totalCases} cases${person.lastCase ? `, last ${relativeTime(person.lastCase)}` : ''}`}
              >
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-ink/60"
                    style={{ width: `${(person.totalCases / max) * 100}%` }}
                  />
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {person.totalCases} cases
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AssetList({ assets }: { assets: AccountProfile['assets'] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="divide-y">
      {assets.map(asset => {
        const lapsed =
          asset.usageEndDate !== null && asset.usageEndDate < today;
        return (
          <li key={asset.id} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Package
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {asset.product || asset.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[
                  asset.status,
                  asset.serialNumber ? `SN ${asset.serialNumber}` : null,
                  asset.installDate
                    ? `installed ${formatDay(asset.installDate)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {asset.usageEndDate ? (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  lapsed
                    ? 'bg-negative/12 text-negative'
                    : 'bg-positive/12 text-positive'
                )}
                title={`Coverage ends ${formatDay(asset.usageEndDate)}`}
              >
                {lapsed ? 'Lapsed' : 'Covered'}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PipelineList({
  pipeline,
}: {
  pipeline: AccountProfile['pipeline'];
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-card px-3 py-2.5">
          <p className="font-display text-2xl leading-none font-semibold tabular-nums">
            {formatMoney(pipeline.openAmount)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            open · {pipeline.openCount} deal
            {pipeline.openCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="rounded-xl border bg-card px-3 py-2.5">
          <p className="font-display text-2xl leading-none font-semibold tabular-nums">
            {formatMoney(pipeline.wonLastYear)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            won · last 12 months
          </p>
        </div>
      </div>
      {pipeline.items.length ? (
        <ul className="space-y-2.5">
          {pipeline.items.map(opp => (
            <li key={opp.id} className="flex gap-2.5">
              <CalendarClock
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {opp.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatMoney(opp.amount)}
                  </span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[opp.stage, `closes ${formatDay(opp.closeDate)}`, opp.owner]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

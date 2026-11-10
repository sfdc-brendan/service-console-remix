import { useCallback } from 'react';
import { Link } from 'react-router';
import {
  Building2,
  ChevronRight,
  History,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from 'lucide-react';
import {
  getAccountCases,
  type CaseAccount,
  type CaseContact,
} from '@/api/console/recordService';
import { useCustomer360 } from '@/context/customer360Context';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/useResource';
import { relativeTime } from '@/lib/format';
import {
  FieldRow,
  Panel,
  PersonAvatar,
  PriorityBadge,
} from '@/components/console/primitives';

export function ContactCard({
  contact,
  account,
}: {
  contact: CaseContact | null;
  account: CaseAccount | null;
}) {
  const { openCustomer } = useCustomer360();
  return (
    <Panel
      title="Customer"
      icon={UserRound}
      action={
        contact ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openCustomer(contact.id, contact.name)}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-case transition-colors hover:bg-case/10"
            >
              360 view
            </button>
            <Link
              to={`/contact/${contact.id}`}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Profile
            </Link>
          </span>
        ) : null
      }
    >
      {contact ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => openCustomer(contact.id, contact.name)}
            className="group -m-1.5 flex w-[calc(100%+0.75rem)] items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Open Customer 360 for ${contact.name}`}
          >
            <PersonAvatar name={contact.name} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-lg leading-tight font-semibold group-hover:text-case">
                {contact.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[contact.title, account?.name].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
          <ul className="space-y-1.5 text-sm">
            {contact.email ? (
              <li className="flex items-center gap-2">
                <Mail
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <a
                  href={`mailto:${contact.email}`}
                  className="truncate hover:underline"
                >
                  {contact.email}
                </a>
              </li>
            ) : null}
            {contact.phone ? (
              <li className="flex items-center gap-2">
                <Phone
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-mono text-xs">{contact.phone}</span>
              </li>
            ) : null}
            {contact.city ? (
              <li className="flex items-center gap-2">
                <MapPin
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                {contact.city}
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No contact on this case.
        </p>
      )}
    </Panel>
  );
}

export function AccountCard({ account }: { account: CaseAccount | null }) {
  if (!account) {
    return null;
  }
  return (
    <Panel
      title="Account"
      icon={Building2}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to={`/account/${account.id}`}>Account 360</Link>
        </Button>
      }
    >
      <Link
        to={`/account/${account.id}`}
        className="mb-2 block font-semibold hover:underline"
      >
        {account.name}
      </Link>
      <dl className="divide-y">
        <FieldRow label="Industry">{account.industry}</FieldRow>
        <FieldRow label="Type">{account.type}</FieldRow>
        <FieldRow label="Rating">{account.rating}</FieldRow>
        <FieldRow label="Revenue">{account.annualRevenue}</FieldRow>
        <FieldRow label="Employees">
          {account.employees?.toLocaleString()}
        </FieldRow>
        <FieldRow label="City">{account.city}</FieldRow>
      </dl>
    </Panel>
  );
}

export function RelatedCases({
  accountId,
  caseId,
}: {
  accountId: string | null;
  caseId: string;
}) {
  const related = useResource(
    useCallback(
      () => getAccountCases(accountId as string, caseId),
      [accountId, caseId]
    ),
    accountId ? `${accountId}-${caseId}` : null
  );
  if (!accountId) {
    return null;
  }
  return (
    <Panel
      title="Account history"
      icon={History}
      action={
        <span className="text-xs text-muted-foreground">
          {related.data?.total ?? 0} other cases
        </span>
      }
      bodyClassName="px-2 pb-2"
    >
      {related.data?.cases.length ? (
        <ul>
          {related.data.cases.map(c => (
            <li key={c.id}>
              <Link
                to={`/case/${c.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {c.subject || c.caseNumber}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.caseNumber} · {c.status} · {relativeTime(c.createdDate)}
                  </span>
                </span>
                <PriorityBadge priority={c.priority} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 pb-2 text-sm text-muted-foreground">
          {related.loading ? 'Loading…' : 'First case for this account.'}
        </p>
      )}
    </Panel>
  );
}

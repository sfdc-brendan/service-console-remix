import { Link } from 'react-router';
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  Copy,
  Mail,
  MessageSquareText,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import type {
  CustomerInsight,
  CustomerProfile,
} from '@/api/console/consoleApi';
import type { Resource } from '@/hooks/useResource';
import {
  useCustomerInsight,
  useCustomerProfile,
} from '@/hooks/useCustomerProfile';
import { copyText } from '@/lib/clipboard';
import { formatMinutes, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ErrorNote,
  Panel,
  PersonAvatar,
  ShimmerLines,
} from '@/components/console/primitives';
import {
  BriefingPanel,
  ChannelMix,
  ContactFacts,
  customerHealth,
  HealthRing,
  InteractionTimeline,
  OpenCasesList,
  RELATIONSHIP_TONE,
  SentimentMix,
  StatTile,
} from './CustomerBlocks';

function ProfileBody({
  profile,
  insight,
  onNavigate,
}: {
  profile: CustomerProfile;
  insight: Resource<CustomerInsight>;
  onNavigate: () => void;
}) {
  const { contact, account, stats } = profile;
  const relationship = insight.data?.relationship;
  const health = customerHealth(profile, relationship);

  return (
    <>
      <header className="ink-panel relative overflow-hidden px-6 pt-6 pb-5">
        <div
          className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full border border-white/10"
          aria-hidden="true"
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
          Customer 360
        </p>
        <div className="mt-3 flex items-center gap-4">
          <PersonAvatar
            name={contact.name}
            size="lg"
            className="[&>span]:size-14"
          />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate font-display text-2xl font-semibold text-white">
              {contact.name}
            </SheetTitle>
            <SheetDescription className="truncate text-sm text-white/65">
              {[contact.title, contact.department, account?.name]
                .filter(Boolean)
                .join(' · ') || 'Customer'}
            </SheetDescription>
          </div>
          <HealthRing health={health} className="hidden sm:flex" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {relationship ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 font-semibold ring-1',
                RELATIONSHIP_TONE[relationship]
              )}
              title={insight.data?.relationshipReason}
            >
              {relationship} relationship
            </span>
          ) : null}
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">
            Customer since {new Date(contact.customerSince).getFullYear()}
          </span>
          {stats.lastContact ? (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">
              Last contact {relativeTime(stats.lastContact)}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            asChild
            size="sm"
            className="bg-white text-ink hover:bg-white/90"
          >
            <Link to={`/contact/${contact.id}`} onClick={onNavigate}>
              <ArrowUpRight className="size-3.5" aria-hidden="true" /> Open full
              profile
            </Link>
          </Button>
          {contact.email ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <a href={`mailto:${contact.email}`}>
                <Mail className="size-3.5" aria-hidden="true" /> Email
              </a>
            </Button>
          ) : null}
          {contact.phone ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <a href={`tel:${contact.phone}`}>
                <Phone className="size-3.5" aria-hidden="true" /> Call
              </a>
            </Button>
          ) : null}
          {contact.email ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => void copyText(contact.email ?? '', 'Email')}
            >
              <Copy className="size-3.5" aria-hidden="true" /> Copy email
            </Button>
          ) : null}
        </div>
      </header>

      <div className="stagger space-y-5 px-6 py-5">
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          aria-label="Customer stats"
        >
          <StatTile label="Open cases" value={stats.openCases} />
          <StatTile
            label="Total cases"
            value={stats.totalCases}
            hint={stats.escalated ? `${stats.escalated} escalated` : undefined}
          />
          <StatTile
            label="Avg resolution"
            value={
              stats.avgResolutionMinutes === null
                ? '–'
                : formatMinutes(stats.avgResolutionMinutes * 60)
            }
          />
          <StatTile
            label="Last 30 days"
            value={stats.interactions30d}
            hint="interactions"
          />
        </section>

        <BriefingPanel insight={insight} />

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <SentimentMix sentiment={profile.sentiment} />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <ChannelMix channelMix={profile.channelMix} />
          </div>
        </section>

        {profile.openCases.length ? (
          <Panel title="Open cases" icon={Briefcase} bodyClassName="px-0 pb-1">
            <OpenCasesList cases={profile.openCases} onNavigate={onNavigate} />
          </Panel>
        ) : null}

        <Panel title="Interaction timeline" icon={MessageSquareText}>
          <InteractionTimeline
            items={profile.timeline}
            onNavigate={onNavigate}
            limit={12}
          />
        </Panel>

        <Panel title="Contact & account" icon={Building2}>
          <ContactFacts profile={profile} />
        </Panel>
      </div>
    </>
  );
}

export function Customer360Sheet({
  recordId,
  name,
  onClose,
}: {
  recordId: string | null;
  name: string | null;
  onClose: () => void;
}) {
  const profile = useCustomerProfile(recordId);
  const insight = useCustomerInsight(profile.data?.contact.id ?? null);
  const title = name ?? 'Customer';

  return (
    <Sheet
      open={recordId !== null}
      onOpenChange={open => (open ? null : onClose())}
    >
      <SheetContent
        side="right"
        className={cn(
          'w-full gap-0 overflow-y-auto bg-background p-0 sm:max-w-xl',
          profile.data &&
            '[&>[data-slot=sheet-close]]:text-white [&>button:last-child]:text-white'
        )}
      >
        {profile.error ? (
          <div className="space-y-3 p-6">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="sr-only">
              Customer 360 could not load
            </SheetDescription>
            <ErrorNote
              message={profile.error}
              onRetry={() => void profile.refresh()}
            />
          </div>
        ) : !profile.data ? (
          <div className="space-y-4 p-6" aria-busy="true">
            <SheetTitle className="font-display text-2xl">{title}</SheetTitle>
            <SheetDescription>Loading Customer 360…</SheetDescription>
            <ShimmerLines lines={10} />
          </div>
        ) : (
          <ProfileBody
            profile={profile.data}
            insight={insight}
            onNavigate={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

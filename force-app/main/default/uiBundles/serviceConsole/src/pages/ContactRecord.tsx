import { Link, useLocation, useParams } from 'react-router';
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Contact,
  Copy,
  GaugeCircle,
  History,
  Mail,
  Phone,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTabTitle } from '@/context/consoleContext';
import {
  useCustomerInsight,
  useCustomerProfile,
} from '@/hooks/useCustomerProfile';
import { copyText } from '@/lib/clipboard';
import { formatMinutes, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CONTACT_LAYOUT } from '@/layout/pageSpecs';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import {
  ErrorNote,
  Panel,
  PersonAvatar,
  ShimmerLines,
} from '@/components/console/primitives';
import {
  ActivityChart,
  BriefingPanel,
  ChannelMix,
  Colleagues,
  ContactFacts,
  customerHealth,
  HealthRing,
  InteractionTimeline,
  OpenCasesList,
  RELATIONSHIP_TONE,
  SentimentMix,
  StatTile,
} from '@/components/customer/CustomerBlocks';

export default function ContactRecord() {
  const { recordId = '' } = useParams();
  const location = useLocation();
  const profile = useCustomerProfile(recordId || null);
  const data = profile.data;
  const insight = useCustomerInsight(data?.contact.id ?? null);
  const relationship = insight.data?.relationship;

  useTabTitle(location.pathname, data?.contact.name ?? null);

  const positivePct = data
    ? (() => {
        const total =
          data.sentiment.Positive +
          data.sentiment.Neutral +
          data.sentiment.Negative;
        return total
          ? `${Math.round((data.sentiment.Positive / total) * 100)}%`
          : '–';
      })()
    : '–';

  return (
    <div className="space-y-5">
      <section className="ink-panel animate-rise relative overflow-hidden rounded-2xl p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border border-white/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -top-10 right-10 size-40 rounded-full border border-white/10"
          aria-hidden="true"
        />
        {profile.error ? (
          <ErrorNote
            message={profile.error}
            onRetry={() => void profile.refresh()}
          />
        ) : !data ? (
          <ShimmerLines lines={3} className="[&>div]:bg-white/15" />
        ) : (
          <div className="relative flex flex-wrap items-center gap-6">
            <PersonAvatar
              name={data.contact.name}
              size="lg"
              className="[&>span]:size-20 [&>span]:text-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Customer 360
              </p>
              <h1 className="mt-1 truncate text-3xl font-semibold lg:text-4xl">
                {data.contact.name}
              </h1>
              <p className="mt-1 truncate text-white/70">
                {[data.contact.title, data.contact.department]
                  .filter(Boolean)
                  .join(' · ') || (data.account ? '' : 'Customer')}
                {data.account ? (
                  <>
                    {data.contact.title || data.contact.department ? ' · ' : ''}
                    <Link
                      to={`/account/${data.account.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {data.account.name}
                    </Link>
                  </>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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
                  Customer since{' '}
                  {new Date(data.contact.customerSince).getFullYear()}
                </span>
                {data.stats.lastContact ? (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">
                    Last contact {relativeTime(data.stats.lastContact)}
                  </span>
                ) : null}
                {data.stats.openCases ? (
                  <span className="rounded-full bg-voice/25 px-2.5 py-1 font-medium text-white">
                    {data.stats.openCases} open case
                    {data.stats.openCases === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col items-start gap-4 sm:items-end">
              <HealthRing health={customerHealth(data, relationship)} />
              <div className="flex flex-wrap gap-2">
                {data.contact.email ? (
                  <Button
                    asChild
                    size="sm"
                    className="bg-white text-ink hover:bg-white/90"
                  >
                    <a href={`mailto:${data.contact.email}`}>
                      <Mail className="size-3.5" aria-hidden="true" /> Email
                    </a>
                  </Button>
                ) : null}
                {data.contact.phone ? (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                  >
                    <a href={`tel:${data.contact.phone}`}>
                      <Phone className="size-3.5" aria-hidden="true" /> Call
                    </a>
                  </Button>
                ) : null}
                {data.contact.email ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={() =>
                      void copyText(data.contact.email ?? '', 'Email')
                    }
                  >
                    <Copy className="size-3.5" aria-hidden="true" /> Copy email
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>

      {data ? (
        <LayoutCanvas
          spec={CONTACT_LAYOUT}
          slots={{
            stats: (
              <Panel title="Key metrics" icon={BarChart3}>
                <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-6">
                  <StatTile label="Open cases" value={data.stats.openCases} />
                  <StatTile label="Total cases" value={data.stats.totalCases} />
                  <StatTile label="Escalated" value={data.stats.escalated} />
                  <StatTile
                    label="Avg resolution"
                    value={
                      data.stats.avgResolutionMinutes === null
                        ? '–'
                        : formatMinutes(data.stats.avgResolutionMinutes * 60)
                    }
                  />
                  <StatTile
                    label="Last 30 days"
                    value={data.stats.interactions30d}
                    hint="interactions"
                  />
                  <StatTile
                    label="Positive"
                    value={positivePct}
                    hint="conversations"
                  />
                </div>
              </Panel>
            ),
            activity: (
              <Panel
                title="Engagement"
                icon={Activity}
                action={
                  <span className="text-xs text-muted-foreground">
                    Last 12 months
                  </span>
                }
              >
                <ActivityChart months={data.activity.months} />
              </Panel>
            ),
            timeline: (
              <Panel title="Interaction timeline" icon={History}>
                <InteractionTimeline items={data.timeline} filterable />
              </Panel>
            ),
            briefing: <BriefingPanel insight={insight} />,
            openCases: (
              <Panel
                title="Open cases"
                icon={Briefcase}
                action={
                  <span className="text-xs text-muted-foreground">
                    {data.stats.openCases}
                  </span>
                }
                bodyClassName="px-0 pb-1"
              >
                <OpenCasesList cases={data.openCases} />
              </Panel>
            ),
            sentiment: (
              <Panel
                title="Sentiment & channels"
                icon={GaugeCircle}
                bodyClassName="space-y-5"
              >
                <SentimentMix sentiment={data.sentiment} />
                <ChannelMix channelMix={data.channelMix} />
              </Panel>
            ),
            details: (
              <Panel title="Contact details" icon={Contact}>
                <ContactFacts profile={data} />
              </Panel>
            ),
            colleagues: data.account ? (
              <Panel
                title={`People at ${data.account.name}`}
                icon={Users}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/account/${data.account.id}`}>
                      <Building2 className="size-3.5" aria-hidden="true" />{' '}
                      Account
                    </Link>
                  </Button>
                }
                bodyClassName="px-0 pb-1"
              >
                <Colleagues colleagues={data.colleagues} />
              </Panel>
            ) : null,
          }}
        />
      ) : null}
    </div>
  );
}

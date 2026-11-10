import { Link, useLocation, useParams } from 'react-router';
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Copy,
  GaugeCircle,
  Globe,
  History,
  Layers,
  LayoutList,
  Phone,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTabTitle } from '@/context/consoleContext';
import {
  useAccountInsight,
  useAccountProfile,
} from '@/hooks/useCustomerProfile';
import { copyText } from '@/lib/clipboard';
import { formatMinutes, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ACCOUNT_LAYOUT } from '@/layout/pageSpecs';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import {
  ErrorNote,
  Panel,
  ShimmerLines,
} from '@/components/console/primitives';
import {
  ActivityChart,
  BriefingPanel,
  ChannelMix,
  HealthRing,
  InteractionTimeline,
  RELATIONSHIP_TONE,
  SentimentMix,
  StatTile,
} from '@/components/customer/CustomerBlocks';
import {
  AccountFacts,
  AccountOpenCases,
  AccountPeople,
  accountHealth,
  AssetList,
  CaseBreakdown,
  PipelineList,
  ServiceLevels,
} from '@/components/account/AccountBlocks';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(word => /^[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('');
}

export default function AccountRecord() {
  const { recordId = '' } = useParams();
  const location = useLocation();
  const profile = useAccountProfile(recordId || null);
  const data = profile.data;
  const insight = useAccountInsight(data?.account.id ?? null);
  const relationship = insight.data?.relationship;

  useTabTitle(location.pathname, data?.account.name ?? null);

  const website = data?.account.website
    ? data.account.website.startsWith('http')
      ? data.account.website
      : `https://${data.account.website}`
    : null;

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
            <span
              className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-white/12 font-display text-2xl font-semibold ring-1 ring-white/20"
              aria-hidden="true"
            >
              {initials(data.account.name) || <Building2 className="size-8" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Account 360
              </p>
              <h1 className="mt-1 truncate text-3xl font-semibold lg:text-4xl">
                {data.account.name}
              </h1>
              <p className="mt-1 truncate text-white/70">
                {[
                  data.account.industry,
                  data.account.type,
                  data.account.location,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Customer account'}
                {data.account.parent ? (
                  <>
                    {' · part of '}
                    <Link
                      to={`/account/${data.account.parent.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {data.account.parent.name}
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
                  {new Date(data.account.customerSince).getFullYear()}
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">
                  {data.stats.contacts} contact
                  {data.stats.contacts === 1 ? '' : 's'}
                </span>
                {data.stats.lastContact ? (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">
                    Last activity {relativeTime(data.stats.lastContact)}
                  </span>
                ) : null}
                {data.stats.urgentOpen ? (
                  <span className="rounded-full bg-voice/25 px-2.5 py-1 font-medium text-white">
                    {data.stats.urgentOpen} urgent open
                  </span>
                ) : null}
                {data.service.breachedOpen ? (
                  <span className="rounded-full bg-negative/30 px-2.5 py-1 font-medium text-white">
                    {data.service.breachedOpen} SLA breached
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col items-start gap-4 sm:items-end">
              <HealthRing health={accountHealth(data, relationship)} />
              <div className="flex flex-wrap gap-2">
                {data.account.phone ? (
                  <Button
                    asChild
                    size="sm"
                    className="bg-white text-ink hover:bg-white/90"
                  >
                    <a href={`tel:${data.account.phone}`}>
                      <Phone className="size-3.5" aria-hidden="true" /> Call
                    </a>
                  </Button>
                ) : null}
                {website ? (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-white/10 hover:text-white"
                  >
                    <a href={website} target="_blank" rel="noreferrer">
                      <Globe className="size-3.5" aria-hidden="true" /> Website
                    </a>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    void copyText(data.account.name, 'Account name')
                  }
                >
                  <Copy className="size-3.5" aria-hidden="true" /> Copy name
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {data ? (
        <LayoutCanvas
          spec={ACCOUNT_LAYOUT}
          slots={{
            stats: (
              <Panel title="Account metrics" icon={BarChart3}>
                <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-6">
                  <StatTile label="Open cases" value={data.stats.openCases} />
                  <StatTile
                    label="Urgent open"
                    value={data.stats.urgentOpen}
                    hint="high, critical, or escalated"
                  />
                  <StatTile label="Total cases" value={data.stats.totalCases} />
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
                    value={data.stats.opened30d}
                    hint="new cases"
                  />
                  <StatTile
                    label="SLA met"
                    value={
                      data.service.metPct === null
                        ? '–'
                        : `${data.service.metPct}%`
                    }
                    hint="last 90 days"
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
                    Last 12 months · all contacts
                  </span>
                }
              >
                <ActivityChart months={data.activity.months} />
              </Panel>
            ),
            caseMix: (
              <Panel title="Case breakdown" icon={Layers}>
                <CaseBreakdown
                  caseMix={data.caseMix}
                  totalCases={data.stats.sampled}
                />
              </Panel>
            ),
            timeline: (
              <Panel title="Account timeline" icon={History}>
                <InteractionTimeline items={data.timeline} filterable />
              </Panel>
            ),
            briefing: <BriefingPanel insight={insight} />,
            service: (
              <Panel title="Entitlements & SLA" icon={Timer}>
                <ServiceLevels service={data.service} />
              </Panel>
            ),
            openCases: (
              <Panel
                title="Open cases"
                icon={Briefcase}
                action={
                  <span className="text-xs text-muted-foreground">
                    {data.stats.openCases > data.openCases.length
                      ? `${data.openCases.length} of ${data.stats.openCases}`
                      : data.stats.openCases}
                  </span>
                }
                bodyClassName="px-0 pb-1"
              >
                <AccountOpenCases cases={data.openCases} />
              </Panel>
            ),
            pipeline:
              data.pipeline.openCount || data.pipeline.wonLastYear ? (
                <Panel title="Open opportunities" icon={Trophy}>
                  <PipelineList pipeline={data.pipeline} />
                </Panel>
              ) : null,
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
              <Panel title="Account details" icon={Building2}>
                <AccountFacts profile={data} />
              </Panel>
            ),
            contacts: (
              <Panel
                title="People"
                icon={Users}
                action={
                  <span className="text-xs text-muted-foreground">
                    {data.stats.contacts}
                  </span>
                }
                bodyClassName="px-0 pb-1"
              >
                <AccountPeople contacts={data.contacts} />
              </Panel>
            ),
            assets: data.assets.length ? (
              <Panel title="Assets" icon={LayoutList} bodyClassName="px-0 pb-1">
                <AssetList assets={data.assets} />
              </Panel>
            ) : null,
          }}
        />
      ) : null}
    </div>
  );
}

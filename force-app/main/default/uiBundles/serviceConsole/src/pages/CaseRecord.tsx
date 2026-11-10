import { useCallback, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { FileText, UserRoundCog } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type CaseStatus } from '@/api/console/consoleApi';
import { getCaseDetail, updateCase } from '@/api/console/recordService';
import { useConsole, useTabTitle } from '@/context/consoleContext';
import { useLayout } from '@/context/layoutContext';
import { useResource } from '@/hooks/useResource';
import {
  STICKY_BAR_TOP,
  scrollToTop,
  useScrolledPast,
} from '@/hooks/useScrolledPast';
import {
  CaseHeaderActions,
  CompactCaseBar,
  EscalatedBadge,
  LiveWorkLink,
} from '@/components/case/CaseHeader';
import { formatDateTime, relativeTime, workPath } from '@/lib/format';
import { CASE_LAYOUT } from '@/layout/pageSpecs';
import { LayoutCanvas } from '@/components/layout/LayoutCanvas';
import { CaseSummaryCard } from '@/components/ai/CaseSummaryCard';
import { NextBestActions } from '@/components/ai/NextBestActions';
import { KnowledgePanel } from '@/components/ai/KnowledgePanel';
import { ServiceAssistant } from '@/components/ai/ServiceAssistant';
import { RoutingPanel } from '@/components/routing/RoutingPanel';
import { CaseSlaPanel } from '@/components/insights/SlaPanels';
import {
  CustomerHistoryPanel,
  SimilarCasesPanel,
} from '@/components/insights/RecordInsights';
import { CaseFeed } from '@/components/case/CaseFeed';
import { StatusPath } from '@/components/case/StatusPath';
import {
  AccountCard,
  ContactCard,
  RelatedCases,
} from '@/components/case/CustomerPanel';
import {
  ErrorNote,
  FieldRow,
  Panel,
  PriorityBadge,
  ShimmerLines,
} from '@/components/console/primitives';
import NotFound from './NotFound';

export default function CaseRecord() {
  const { recordId = '' } = useParams();
  const location = useLocation();
  const { omni } = useConsole();
  const record = useResource(
    useCallback(() => getCaseDetail(recordId), [recordId]),
    recordId || null,
    30000
  );
  const [saving, setSaving] = useState(false);
  const { editing } = useLayout();
  const headerRef = useRef<HTMLElement>(null);
  const data = record.data;
  const scrolledPast = useScrolledPast(headerRef, data !== null && !editing);
  const { refresh } = record;

  useTabTitle(
    location.pathname,
    data ? `${data.caseNumber} · ${data.subject}` : null
  );

  const liveWork = omni?.active.find(
    w => w.caseId === recordId && w.channel !== 'Case'
  );
  const livePath = liveWork ? workPath(liveWork) : null;

  const save = useCallback(
    async (fields: { Status?: string; Priority?: string }, message: string) => {
      setSaving(true);
      try {
        await updateCase(recordId, fields);
        toast.success(message);
        await refresh();
      } catch (err) {
        toast.error('Could not update case', {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setSaving(false);
      }
    },
    [recordId, refresh]
  );

  const escalate = async () => {
    setSaving(true);
    try {
      const result = await consoleApi.executeAction(recordId, {
        type: 'escalate',
        payload: { reason: 'Escalated by agent from the Service Console.' },
      });
      toast.success(result.message);
      await refresh();
    } catch (err) {
      toast.error('Could not escalate', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const setPriority = (priority: string) =>
    void save({ Priority: priority }, `Priority set to ${priority}`);
  const setStatus = (status: CaseStatus) =>
    void save({ Status: status }, `Status set to ${status}`);

  const onChanged = useCallback(() => void refresh(), [refresh]);

  if (!record.loading && !data && !record.error) {
    return <NotFound />;
  }

  return (
    <div className="space-y-5">
      <section
        ref={headerRef}
        className="animate-rise rounded-2xl border bg-card p-5 lg:p-6"
      >
        {record.error ? (
          <ErrorNote message={record.error} onRetry={() => void refresh()} />
        ) : null}
        {!data ? (
          <ShimmerLines lines={3} />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start gap-4">
              <span className="flex size-12 items-center justify-center rounded-xl bg-case text-white">
                <FileText className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-case">
                    Case {data.caseNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{data.origin ?? 'Unknown'} origin</span>
                  <span aria-hidden="true">·</span>
                  <span>Opened {relativeTime(data.createdDate)}</span>
                </p>
                <h1 className="mt-1 text-2xl leading-tight font-semibold text-balance lg:text-3xl">
                  {data.subject || '(no subject)'}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={data.priority} />
                  {data.isEscalated ? <EscalatedBadge /> : null}
                  {data.contact ? (
                    <span className="text-sm text-muted-foreground">
                      for {data.contact.name}
                    </span>
                  ) : null}
                  {liveWork && livePath ? (
                    <LiveWorkLink work={liveWork} path={livePath} />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CaseHeaderActions
                  data={data}
                  saving={saving}
                  onPriority={setPriority}
                  onEscalate={() => void escalate()}
                />
              </div>
            </div>

            <StatusPath
              status={data.status}
              disabled={saving}
              onSelect={setStatus}
            />
          </div>
        )}
      </section>
      <div className="sticky z-10 mb-0 h-0" style={{ top: STICKY_BAR_TOP }}>
        {data && scrolledPast ? (
          <CompactCaseBar
            className="animate-rise absolute inset-x-0 top-0"
            data={data}
            saving={saving}
            onPriority={setPriority}
            onEscalate={() => void escalate()}
            onStatus={setStatus}
            liveWork={liveWork}
            livePath={livePath}
            onExpand={scrollToTop}
          />
        ) : null}
      </div>

      {data ? (
        <LayoutCanvas
          spec={CASE_LAYOUT}
          slots={{
            contact: (
              <ContactCard contact={data.contact} account={data.account} />
            ),
            details: (
              <Panel title="Details" icon={UserRoundCog}>
                <dl className="divide-y">
                  <FieldRow label="Owner">{data.ownerName}</FieldRow>
                  <FieldRow label="Type">{data.type}</FieldRow>
                  <FieldRow label="Reason">{data.reason}</FieldRow>
                  <FieldRow label="Created">
                    {formatDateTime(data.createdDate)}
                  </FieldRow>
                  <FieldRow label="Modified">
                    {formatDateTime(data.lastModifiedDate)}
                  </FieldRow>
                  {data.closedDate ? (
                    <FieldRow label="Closed">
                      {formatDateTime(data.closedDate)}
                    </FieldRow>
                  ) : null}
                </dl>
                {data.description ? (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Description
                    </p>
                    <p className="text-sm whitespace-pre-line">
                      {data.description}
                    </p>
                  </div>
                ) : null}
              </Panel>
            ),
            account: <AccountCard account={data.account} />,
            related: (
              <RelatedCases
                accountId={data.account?.id ?? null}
                caseId={data.id}
              />
            ),
            summary: <CaseSummaryCard caseId={data.id} />,
            feed: <CaseFeed record={data} onChanged={onChanged} />,
            assistant: (
              <ServiceAssistant
                caseId={data.id}
                workId={liveWork?.id ?? null}
                onChanged={onChanged}
              />
            ),
            actions: <NextBestActions caseId={data.id} onChanged={onChanged} />,
            knowledge: (
              <KnowledgePanel caseId={data.id} onChanged={onChanged} />
            ),
            sla: <CaseSlaPanel caseId={data.id} />,
            routing: <RoutingPanel caseId={data.id} />,
            similar: <SimilarCasesPanel caseId={data.id} />,
            history: data.contact ? (
              <CustomerHistoryPanel recordId={data.contact.id} />
            ) : null,
          }}
        />
      ) : null}
    </div>
  );
}

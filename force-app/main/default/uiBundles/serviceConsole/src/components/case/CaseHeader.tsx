import { Link } from 'react-router';
import { AlertOctagon, ArrowRight, ChevronsDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CASE_STATUSES,
  PRIORITIES,
  type CaseStatus,
  type WorkItem,
} from '@/api/console/consoleApi';
import type { CaseRecord } from '@/api/console/recordService';
import { CHANNEL_META, PriorityBadge } from '@/components/console/primitives';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function isCaseStatus(value: string): value is CaseStatus {
  return CASE_STATUSES.some(status => status === value);
}

export interface CaseHeaderActionProps {
  data: CaseRecord;
  saving: boolean;
  onPriority: (priority: string) => void;
  onEscalate: () => void;
  size?: 'default' | 'sm';
}

/** Priority picker and Escalate button, shared by the full header and the compact bar. */
export function CaseHeaderActions({
  data,
  saving,
  onPriority,
  onEscalate,
  size = 'default',
}: CaseHeaderActionProps) {
  const compact = size === 'sm';
  return (
    <>
      <Select
        value={data.priority || 'Medium'}
        onValueChange={onPriority}
        disabled={saving}
      >
        <SelectTrigger
          size={size}
          className={compact ? 'w-32 text-xs' : 'w-36'}
          aria-label="Priority"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map(p => (
            <SelectItem key={p} value={p}>
              {p} priority
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size={compact ? 'sm' : 'default'}
        disabled={saving || data.isEscalated || data.isClosed}
        onClick={onEscalate}
      >
        <AlertOctagon
          className={compact ? 'size-3.5' : 'size-4'}
          aria-hidden="true"
        />{' '}
        Escalate
      </Button>
    </>
  );
}

export function EscalatedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-negative/10 px-2 py-0.5 text-[11px] font-semibold text-negative">
      <AlertOctagon className="size-3" aria-hidden="true" /> Escalated
    </span>
  );
}

/** Pill linking to the voice call or chat that is live on this case. */
export function LiveWorkLink({ work, path }: { work: WorkItem; path: string }) {
  const meta = CHANNEL_META[work.channel];
  return (
    <Link
      to={path}
      className={cn(
        'group inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        meta.soft,
        meta.text
      )}
      title={`Open the live ${meta.label.toLowerCase()} with ${work.customerName ?? 'the customer'}`}
    >
      <span className="relative flex size-1.5" aria-hidden="true">
        <span
          className={cn(
            'absolute inset-0 animate-ping rounded-full opacity-60',
            meta.bg
          )}
        />
        <span className={cn('relative size-1.5 rounded-full', meta.bg)} />
      </span>
      Live {meta.label.toLowerCase()}
      <ArrowRight
        className="size-3 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

/** One-row version of the case header shown once the full header scrolls away. */
export function CompactCaseBar({
  data,
  saving,
  onPriority,
  onEscalate,
  onStatus,
  liveWork,
  livePath,
  onExpand,
  className,
}: CaseHeaderActionProps & {
  onStatus: (status: CaseStatus) => void;
  liveWork: WorkItem | undefined;
  livePath: string | null;
  onExpand: () => void;
  className?: string;
}) {
  const meta = [
    `Case ${data.caseNumber}`,
    `${data.origin ?? 'Unknown'} origin`,
    data.createdDate ? `Opened ${relativeTime(data.createdDate)}` : null,
    data.contact ? `for ${data.contact.name}` : null,
  ].filter(Boolean);
  return (
    <section
      aria-label={`Case ${data.caseNumber}`}
      className={cn(
        'flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card/95 px-3 py-2 shadow-xl backdrop-blur',
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-case text-white">
        <FileText className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-48 flex-1">
        <p
          className="truncate text-sm leading-tight font-semibold"
          title={data.subject || undefined}
        >
          {data.subject || '(no subject)'}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          <span className="font-mono font-medium text-case">{meta[0]}</span>
          {meta.length > 1 ? ` · ${meta.slice(1).join(' · ')}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <PriorityBadge priority={data.priority} />
        {data.isEscalated ? <EscalatedBadge /> : null}
        {liveWork && livePath ? (
          <LiveWorkLink work={liveWork} path={livePath} />
        ) : null}
        <Select
          value={data.status}
          onValueChange={value => {
            if (isCaseStatus(value) && value !== data.status) {
              onStatus(value);
            }
          }}
          disabled={saving}
        >
          <SelectTrigger size="sm" className="w-40 text-xs" aria-label="Status">
            <span className="text-muted-foreground">Status:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CASE_STATUSES.map(status => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CaseHeaderActions
          data={data}
          saving={saving}
          onPriority={onPriority}
          onEscalate={onEscalate}
          size="sm"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onExpand}
          aria-label="Show the full case header"
          title="Show the full case header"
        >
          <ChevronsDown className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

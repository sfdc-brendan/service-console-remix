import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Loader2, Route, Sparkles } from 'lucide-react';
import { consoleApi, type RoutingFeed } from '@/api/console/consoleApi';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { relativeTime, workPath } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ChannelIcon,
  EmptyState,
  ErrorNote,
  Panel,
  PriorityBadge,
  ShimmerLines,
} from '@/components/console/primitives';
import { SkillMatch } from './RoutingBlocks';
import { RoutingPanel } from './RoutingPanel';

type FeedItem = RoutingFeed['items'][number];

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', tone)} aria-hidden="true" />
      <span className="font-mono tabular-nums">{value}</span> {label}
    </span>
  );
}

/** Command Center view of routing decisions as they happen, newest first. */
export function RoutingFeedPanel() {
  const feed = useResource(consoleApi.routingFeed, 'routing-feed', 4000, {
    keepPrevious: true,
  });
  const now = useNow(5000);
  const [open, setOpen] = useState<FeedItem | null>(null);
  const data = feed.data;

  return (
    <Panel
      title="Live routing"
      icon={Route}
      action={
        data ? (
          <div className="flex gap-3 text-xs text-muted-foreground">
            <Counter label="analyzing" value={data.analyzing} tone="bg-ai" />
            <Counter label="queued" value={data.queued} tone="bg-warning" />
            <Counter label="offered" value={data.offered} tone="bg-case" />
          </div>
        ) : null
      }
      bodyClassName="px-0 pb-1"
    >
      {feed.error && !data ? (
        <div className="px-4 pb-3">
          <ErrorNote message={feed.error} onRetry={() => void feed.refresh()} />
        </div>
      ) : !data ? (
        <div className="px-4 pb-3">
          <ShimmerLines lines={4} />
        </div>
      ) : !data.items.length ? (
        <div className="px-4 pb-3">
          <EmptyState
            icon={Route}
            title="Nothing routed yet"
            detail="New cases, calls, and chats appear here as AI triages and routes them."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {data.items.map(item => {
            const analyzing = item.work.status === 'Analyzing';
            const last = item.lastEvent;
            return (
              <li key={item.work.id}>
                <button
                  type="button"
                  onClick={() => setOpen(item)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <ChannelIcon channel={item.work.channel} />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.work.subject || 'Untitled work'}
                      </span>
                      <PriorityBadge priority={item.work.priority} />
                    </span>
                    {analyzing ? (
                      <span className="flex items-center gap-1.5 text-xs text-ai">
                        <Loader2
                          className="size-3 animate-spin"
                          aria-hidden="true"
                        />
                        AI is reading the case
                      </span>
                    ) : item.intent ? (
                      <span className="flex items-center gap-1.5 text-xs text-foreground/80">
                        <Sparkles
                          className="size-3 shrink-0 text-ai"
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.intent}</span>
                      </span>
                    ) : null}
                    <SkillMatch
                      skills={item.skills}
                      matched={item.offer?.matched}
                      levels={item.offer?.levels}
                    />
                    {last ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {last.title}
                        {last.type === 'offered' && last.score !== undefined
                          ? ` · match ${last.score}`
                          : ''}
                        {' · '}
                        {relativeTime(last.at, now)}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={open !== null} onOpenChange={next => !next && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <div className="space-y-4 p-4">
              <div>
                <SheetTitle className="font-display text-lg font-semibold">
                  {open.work.subject || 'Routing trace'}
                </SheetTitle>
                <SheetDescription>
                  {[
                    open.work.customerName,
                    open.work.caseNumber ? `#${open.work.caseNumber}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {workPath(open.work) ? (
                    <>
                      {' · '}
                      <Link
                        to={workPath(open.work) ?? '/'}
                        onClick={() => setOpen(null)}
                        className="font-medium text-case hover:underline"
                      >
                        Open record
                      </Link>
                    </>
                  ) : null}
                </SheetDescription>
              </div>
              <RoutingPanel workId={open.work.id} title="Routing trace" />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Panel>
  );
}

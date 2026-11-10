import { useEffect, useState } from 'react';
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Maximize2,
  Radio,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConsole } from '@/context/consoleContext';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils';
import type { WorkItem } from '@/api/console/consoleApi';
import {
  CHANNEL_META,
  ChannelIcon,
  CountdownRing,
  PriorityBadge,
  SentimentBadge,
} from './primitives';
import { SkillMatch } from '@/components/routing/RoutingBlocks';

function useRemaining(work: WorkItem, timeout: number) {
  const { clockSkew } = useConsole();
  const now = useNow(500) + clockSkew;
  const offeredAt = work.offeredAt ? new Date(work.offeredAt).getTime() : now;
  return Math.max(0, timeout - (now - offeredAt) / 1000);
}

function useOfferActions(work: WorkItem) {
  const { acceptWork, declineWork } = useConsole();
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const act = async (kind: 'accept' | 'decline') => {
    setPending(kind);
    try {
      await (kind === 'accept' ? acceptWork(work) : declineWork(work));
    } finally {
      setPending(null);
    }
  };
  return { pending, act };
}

function OfferRow({ work, timeout }: { work: WorkItem; timeout: number }) {
  const remaining = useRemaining(work, timeout);
  const { pending, act } = useOfferActions(work);
  const meta = CHANNEL_META[work.channel];
  const customer = work.customerName ?? 'Customer';
  return (
    <article
      className="ink-panel pointer-events-auto flex items-center gap-2.5 overflow-hidden rounded-r-xl py-2 pr-2 pl-3 shadow-xl ring-1 ring-white/10"
      aria-label={`Incoming ${meta.label} work from ${customer}`}
      title={work.subject ?? undefined}
    >
      <ChannelIcon channel={work.channel} solid className="size-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-semibold">
          {customer}
        </p>
        <p className="truncate text-[11px] text-white/60">
          {work.caseNumber ? `#${work.caseNumber} · ` : ''}
          {work.subject}
        </p>
      </div>
      <span
        className={cn(
          'w-7 shrink-0 text-right font-mono text-xs tabular-nums',
          remaining < timeout * 0.3 ? 'text-negative' : 'text-white/70'
        )}
        aria-label={`${Math.ceil(remaining)} seconds left`}
      >
        {Math.ceil(remaining)}s
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
        disabled={pending !== null}
        onClick={() => void act('decline')}
        aria-label={`Decline work from ${customer}`}
        title="Decline"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
      <Button
        size="sm"
        className={cn('h-8 shrink-0 font-semibold text-white hover:opacity-90', meta.bg)}
        disabled={pending !== null}
        onClick={() => void act('accept')}
      >
        <Check className="size-3.5" aria-hidden="true" />{' '}
        {pending === 'accept' ? '…' : 'Accept'}
      </Button>
    </article>
  );
}

function OfferCard({ work, timeout }: { work: WorkItem; timeout: number }) {
  const remaining = useRemaining(work, timeout);
  const { pending, act } = useOfferActions(work);
  const meta = CHANNEL_META[work.channel];

  return (
    <article
      className="ink-panel animate-slide-in-left pointer-events-auto flex overflow-hidden rounded-r-2xl shadow-2xl ring-1 ring-white/10"
      aria-label={`Incoming ${meta.label} work from ${work.customerName ?? 'customer'}`}
    >
      <div className={cn('w-1.5 shrink-0', meta.bg)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3 p-4">
          <span className="animate-ring-pulse rounded-lg">
            <ChannelIcon channel={work.channel} solid className="size-10" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
              {meta.label} · {work.queue ?? 'General'}
            </p>
            <p className="mt-1 truncate font-display text-lg leading-tight font-semibold">
              {work.customerName ?? 'Customer'}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-white/75">
              {work.subject}
            </p>
            {work.routing?.intent ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-white/85">
                <Sparkles
                  className="mt-0.5 size-3 shrink-0 text-ai"
                  aria-hidden="true"
                />
                <span className="line-clamp-2">{work.routing.intent}</span>
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PriorityBadge priority={work.priority} />
              <SentimentBadge
                sentiment={work.sentiment}
                className="text-white/70"
              />
              {work.caseNumber ? (
                <span className="font-mono text-[11px] text-white/50">
                  #{work.caseNumber}
                </span>
              ) : null}
            </div>
          </div>
          <CountdownRing remaining={remaining} total={timeout} />
        </div>
        {work.routing?.skills.length ? (
          <div className="mx-4 mb-3 rounded-lg bg-white/6 p-2.5 ring-1 ring-white/10">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
              <span>Why you</span>
              {work.routing.score !== null ? (
                <span className="rounded-full bg-white/12 px-1.5 py-0.5 font-mono text-[10px] text-white normal-case tracking-normal">
                  match {work.routing.score}
                </span>
              ) : null}
            </div>
            <SkillMatch
              skills={work.routing.skills}
              matched={work.routing.matched}
              tone="dark"
            />
            {work.routing.relaxed ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-warning">
                <Maximize2 className="size-3" aria-hidden="true" /> No
                specialist free, so the search was widened
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <Button
            variant="ghost"
            className="h-10 text-white/80 hover:bg-white/10 hover:text-white"
            disabled={pending !== null}
            onClick={() => void act('decline')}
          >
            <X className="size-4" aria-hidden="true" /> Decline
          </Button>
          <Button
            className={cn(
              'h-10 font-semibold text-white hover:opacity-90',
              meta.bg
            )}
            disabled={pending !== null}
            onClick={() => void act('accept')}
          >
            <Check className="size-4" aria-hidden="true" />{' '}
            {pending === 'accept' ? 'Connecting…' : 'Accept'}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Routed-work tray docked to the utility rail on the left edge. */
function useOfferTitle(count: number) {
  useEffect(() => {
    if (!count) {
      return;
    }
    const original = document.title;
    let flip = false;
    const timer = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? `(${count}) New work for you` : original;
    }, 1200);
    return () => {
      window.clearInterval(timer);
      document.title = original;
    };
  }, [count]);
}

export function OfferStack() {
  const { omni, offersMinimized, setOffersMinimized } = useConsole();
  const offers = omni?.offers ?? [];
  const timeout = omni?.offerTimeoutSeconds ?? 30;
  useOfferTitle(offers.length);
  const ToggleIcon = offersMinimized ? ChevronsUpDown : ChevronsDownUp;
  return (
    <section
      className={cn(
        'pointer-events-none fixed top-3 bottom-3 left-16 z-50 flex flex-col overflow-y-auto pr-3',
        offersMinimized ? 'w-[21rem] gap-1.5' : 'w-[23rem] gap-3',
        offers.length === 0 && 'hidden'
      )}
      aria-live="assertive"
      aria-label="Routed work"
    >
      {offers.length ? (
        <button
          type="button"
          onClick={() => setOffersMinimized(!offersMinimized)}
          aria-expanded={!offersMinimized}
          title={offersMinimized ? 'Show full offer details' : 'Minimize offers'}
          className="ink-panel animate-slide-in-left pointer-events-auto flex w-fit items-center gap-2 rounded-r-full py-1.5 pr-3 pl-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 shadow-lg transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
        >
          <Radio className="size-3.5 text-voice" aria-hidden="true" />
          Routed to you · {offers.length}
          <span className="ml-1 flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 tracking-normal normal-case">
            <ToggleIcon className="size-3.5" aria-hidden="true" />
            {offersMinimized ? 'Expand' : 'Minimize'}
          </span>
        </button>
      ) : null}
      {offers.map(offer =>
        offersMinimized ? (
          <OfferRow key={offer.id} work={offer} timeout={timeout} />
        ) : (
          <OfferCard key={offer.id} work={offer} timeout={timeout} />
        )
      )}
    </section>
  );
}

function RailOffer({ work, timeout }: { work: WorkItem; timeout: number }) {
  const remaining = useRemaining(work, timeout);
  const meta = CHANNEL_META[work.channel];
  return (
    <li
      className="relative"
      title={`Incoming ${meta.label}: ${work.customerName ?? 'Customer'}`}
    >
      <span className="animate-ring-pulse block rounded-lg">
        <ChannelIcon channel={work.channel} solid className="size-9" />
      </span>
      <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-ink px-1 font-mono text-[10px] font-semibold text-white ring-1 ring-white/20">
        {Math.ceil(remaining)}
      </span>
    </li>
  );
}

/** Compact pulse markers shown inside the rail so routed work is visible even while scrolling. */
export function RailOffers() {
  const { omni } = useConsole();
  const offers = omni?.offers ?? [];
  if (!offers.length) {
    return null;
  }
  return (
    <ul
      className="mt-2 flex flex-col items-center gap-3 border-t border-white/10 pt-4"
      aria-label="Incoming work"
    >
      {offers.map(offer => (
        <RailOffer
          key={offer.id}
          work={offer}
          timeout={omni?.offerTimeoutSeconds ?? 30}
        />
      ))}
    </ul>
  );
}

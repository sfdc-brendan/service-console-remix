import { Link } from 'react-router';
import { Headphones, Inbox, Megaphone, PauseCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConsole } from '@/context/consoleContext';
import { useNow } from '@/hooks/useNow';
import {
  formatDuration,
  relativeTime,
  secondsSince,
  workPath,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { PRESENCE_STATUSES } from '@/api/console/consoleApi';
import { SkillChip } from '@/components/routing/RoutingBlocks';
import {
  ChannelIcon,
  EmptyState,
  ErrorNote,
  PRESENCE_META,
  PresenceDot,
  RatioMeter,
} from './primitives';

export function OmniDock() {
  const { omni, omniError, omniOpen, setOmniOpen, setPresence, refreshOmni } =
    useConsole();
  const now = useNow();

  if (!omniOpen) {
    return null;
  }
  const presence = omni?.presence;

  return (
    <>
      <button
        type="button"
        aria-label="Close Omni-Channel"
        className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-[1px] lg:hidden"
        onClick={() => setOmniOpen(false)}
      />
      <aside
        className="animate-rise fixed top-0 bottom-0 left-16 z-40 flex w-[min(22rem,calc(100vw-4rem))] flex-col border-r bg-card shadow-2xl"
        aria-label="Omni-Channel"
      >
        <header className="ink-panel flex items-center gap-3 px-4 py-4">
          <Headphones className="size-5 text-voice" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="text-base font-semibold">Omni-Channel</h2>
            <p className="text-xs text-white/60">
              {omni
                ? `${omni.queued} waiting across all queues`
                : 'Connecting to routing…'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setOmniOpen(false)}
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {omniError ? (
            <ErrorNote message={omniError} onRetry={() => void refreshOmni()} />
          ) : null}

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              My status
            </p>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Presence status"
            >
              {PRESENCE_STATUSES.map(status => {
                const active = presence?.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void setPresence(status)}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
                      active
                        ? cn(
                            'border-ink bg-ink text-white ring-2',
                            PRESENCE_META[status].ring
                          )
                        : 'hover:bg-accent'
                    )}
                  >
                    <PresenceDot status={status} />
                    {PRESENCE_META[status].label}
                  </button>
                );
              })}
            </div>
            {presence ? (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Capacity</span>
                  <span className="font-mono">
                    {presence.usedCapacity}/{presence.capacity}
                  </span>
                </div>
                <RatioMeter
                  value={presence.usedCapacity}
                  max={presence.capacity}
                />
                <p className="text-xs text-muted-foreground">
                  Channels:{' '}
                  {presence.skills
                    .filter(skill => !(skill in presence.skillLevels))
                    .join(' · ')}{' '}
                  · in {PRESENCE_META[presence.status].label.toLowerCase()} for{' '}
                  {formatDuration(secondsSince(presence.statusChangedAt, now))}
                </p>
                {Object.keys(presence.skillLevels).length ? (
                  <div className="pt-1">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Routing skills
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(presence.skillLevels)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, level]) => (
                          <SkillChip
                            key={name}
                            name={name}
                            proficiency={level}
                            title={`${name} · level ${level} of 10`}
                          />
                        ))}
                    </div>
                  </div>
                ) : null}
                {omni?.analyzing ? (
                  <p className="text-xs text-ai">
                    {omni.analyzing} new{' '}
                    {omni.analyzing === 1 ? 'item is' : 'items are'} being
                    triaged by AI
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          {presence?.whisper ? (
            <section className="rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Megaphone className="size-3.5" aria-hidden="true" /> Supervisor
                whisper
                <span className="ml-auto font-normal text-muted-foreground">
                  {relativeTime(presence.whisperAt, now)}
                </span>
              </p>
              <p className="mt-1 text-sm">{presence.whisper}</p>
            </section>
          ) : null}

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              My work · {omni?.active.length ?? 0}
            </p>
            {omni?.active.length ? (
              <ul className="space-y-2">
                {omni.active.map(work => {
                  const path = workPath(work);
                  const body = (
                    <>
                      <ChannelIcon channel={work.channel} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {work.customerName ?? work.subject}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {work.subject}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="font-mono text-xs tabular-nums">
                          {formatDuration(secondsSince(work.acceptedAt, now))}
                        </span>
                        {work.onHold ? (
                          <PauseCircle
                            className="size-3.5 text-warning"
                            aria-label="On hold"
                          />
                        ) : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={work.id}>
                      {path ? (
                        <Link
                          to={path}
                          onClick={() => setOmniOpen(false)}
                          className="flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border p-2.5">
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Inbox}
                title={
                  presence?.status === 'Online'
                    ? 'Waiting for work'
                    : 'Go available to receive work'
                }
                detail="Offers appear in the corner with a 30-second timer."
              />
            )}
          </section>
        </div>
      </aside>
    </>
  );
}

import { Link } from 'react-router';
import { ArrowRightLeft, Bot, Eye, Megaphone, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRESENCE_STATUSES, type AgentPresence, type PresenceStatus, type WorkItem } from '@/api/console/consoleApi';
import { formatDuration, secondsSince, workPath } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CHANNEL_META, ChannelIcon, PersonAvatar, PRESENCE_META, PresenceDot, SentimentBadge } from '@/components/console/primitives';

const STATUS_BORDER: Record<PresenceStatus, string> = {
  Online: 'border-t-positive',
  Busy: 'border-t-voice',
  Break: 'border-t-warning',
  Offline: 'border-t-muted-foreground/30',
};

export function AgentCard({
  agent,
  now,
  onStatus,
  onWhisper,
  onReassign,
}: {
  agent: AgentPresence;
  now: number;
  onStatus: (agent: AgentPresence, status: PresenceStatus) => void;
  onWhisper: (agent: AgentPresence) => void;
  onReassign: (work: WorkItem) => void;
}) {
  const full = agent.usedCapacity >= agent.capacity;
  return (
    <article className={cn('flex flex-col rounded-xl border border-t-4 bg-card p-4', STATUS_BORDER[agent.status], agent.status === 'Offline' && 'opacity-70')}>
      <header className="flex items-start gap-3">
        <PersonAvatar name={agent.name} photoUrl={agent.photoUrl} status={agent.status} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {agent.name}
            {agent.virtual ? <Bot className="size-3.5 text-muted-foreground" aria-label="Simulated agent" /> : null}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PresenceDot status={agent.status} className="size-2" />
            {PRESENCE_META[agent.status].label} · {formatDuration(secondsSince(agent.statusChangedAt, now))}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${agent.name}`}>
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onWhisper(agent)}>
              <Megaphone className="size-4" aria-hidden="true" /> Whisper
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Set status</DropdownMenuLabel>
            {PRESENCE_STATUSES.filter(s => s !== agent.status).map(status => (
              <DropdownMenuItem key={status} onSelect={() => onStatus(agent, status)}>
                <PresenceDot status={status} /> {PRESENCE_META[status].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mt-3 flex items-center gap-1" aria-label={`Capacity ${agent.usedCapacity} of ${agent.capacity}`}>
        {Array.from({ length: agent.capacity }, (_, i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-full', i < agent.usedCapacity ? (full ? 'bg-voice' : 'bg-case') : 'bg-muted')}
          />
        ))}
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          {agent.usedCapacity}/{agent.capacity}
        </span>
      </div>

      <ul className="mt-3 flex-1 space-y-1.5">
        {agent.work.length ? (
          agent.work.map(work => {
            const path = workPath(work);
            const waiting = work.status === 'Offered';
            return (
              <li key={work.id} className={cn('flex items-center gap-2 rounded-lg p-1.5', CHANNEL_META[work.channel].soft)}>
                <ChannelIcon channel={work.channel} className="size-6 [&>svg]:size-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{work.customerName ?? work.subject}</span>
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">
                      {waiting ? 'ringing' : formatDuration(secondsSince(work.acceptedAt, now))}
                    </span>
                    <SentimentBadge sentiment={work.sentiment} className="text-[11px]" />
                  </span>
                </span>
                {path && !waiting ? (
                  <Button variant="ghost" size="icon" className="size-7" asChild>
                    <Link to={path} aria-label={`Monitor ${work.name}`}>
                      <Eye className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" className="size-7" onClick={() => onReassign(work)} aria-label={`Reassign ${work.name}`}>
                  <ArrowRightLeft className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            );
          })
        ) : (
          <li className="py-2 text-center text-xs text-muted-foreground">
            {agent.status === 'Online' ? 'Idle — ready for work' : 'No active work'}
          </li>
        )}
      </ul>

      <footer className="mt-3 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
        <span>{agent.skills.join(' · ')}</span>
        <span>
          <span className="font-mono font-semibold text-foreground">{agent.closedToday ?? 0}</span> closed today
        </span>
      </footer>
    </article>
  );
}

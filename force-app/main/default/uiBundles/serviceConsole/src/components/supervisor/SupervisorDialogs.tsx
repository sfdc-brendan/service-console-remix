import { useState } from 'react';
import { ArrowRightLeft, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type AgentPresence, type WorkItem } from '@/api/console/consoleApi';
import { cn } from '@/lib/utils';
import { PersonAvatar, PRESENCE_META, RatioMeter, Textarea } from '@/components/console/primitives';

const WHISPER_PRESETS = [
  'Great empathy on that last call — keep it up.',
  'Queue is building. Aim to wrap up within 2 minutes.',
  'Offer the loyalty credit if they mention cancelling.',
];

export function WhisperDialog({ agent, onClose, onDone }: { agent: AgentPresence | null; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  if (!agent) {
    return null;
  }
  const send = async () => {
    setSending(true);
    try {
      await consoleApi.whisper(agent.userId, text.trim());
      toast.success(`Whisper sent to ${agent.name}`);
      setText('');
      onDone();
      onClose();
    } catch (err) {
      toast.error('Could not send whisper', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog open onOpenChange={open => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-5 text-warning" aria-hidden="true" /> Whisper to {agent.name}
          </DialogTitle>
          <DialogDescription>Only the agent sees this. It pops up in their console instantly.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {WHISPER_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setText(preset)}
                className="rounded-full border px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent"
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea rows={4} value={text} onChange={event => setText(event.target.value)} placeholder="Coaching note…" aria-label="Whisper" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!text.trim() || sending} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send whisper'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReassignDialog({
  work,
  agents,
  onClose,
  onDone,
}: {
  work: WorkItem | null;
  agents: AgentPresence[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!work) {
    return null;
  }
  const candidates = agents.filter(a => a.userId !== work.agentId && a.status === 'Online');
  const reassign = async () => {
    if (!target) {
      return;
    }
    setBusy(true);
    try {
      await consoleApi.reassign(work.id, target);
      toast.success('Work re-offered', { description: `${work.name} is now offered to ${agents.find(a => a.userId === target)?.name}` });
      onDone();
      onClose();
    } catch (err) {
      toast.error('Could not reassign', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={open => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{work.agentId ? 'Reassign' : 'Assign'} {work.name}</DialogTitle>
          <DialogDescription>
            {work.customerName} · {work.subject}
          </DialogDescription>
        </DialogHeader>
        {candidates.length ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Target agent">
            {candidates.map(agent => (
              <li key={agent.userId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={target === agent.userId}
                  onClick={() => setTarget(agent.userId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
                    target === agent.userId ? 'border-ink ring-2 ring-ink/15' : 'hover:bg-accent'
                  )}
                >
                  <PersonAvatar name={agent.name} photoUrl={agent.photoUrl} status={agent.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{agent.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {PRESENCE_META[agent.status].label} · {agent.skills.join(', ')}
                    </span>
                    <RatioMeter value={agent.usedCapacity} max={agent.capacity} className="mt-1.5" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {agent.usedCapacity}/{agent.capacity}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No other agents are available right now.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!target || busy} onClick={() => void reassign()}>
            <ArrowRightLeft className="size-4" aria-hidden="true" /> {busy ? 'Reassigning…' : 'Offer to agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

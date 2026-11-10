import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useConsole } from '@/context/consoleContext';
import { cn } from '@/lib/utils';
import { PRIORITIES, type Channel, type Priority } from '@/api/console/consoleApi';
import { CHANNEL_META, ChannelIcon, Textarea } from './primitives';

const CHANNELS: Channel[] = ['Voice', 'Messaging', 'Case'];

export function SimulateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { simulate } = useConsole();
  const location = useLocation();
  const currentCaseId = location.pathname.match(/^\/case\/(\w{15,18})/)?.[1] ?? null;
  const [channel, setChannel] = useState<Channel>('Voice');
  const [priority, setPriority] = useState<Priority | 'auto'>('auto');
  const [brief, setBrief] = useState('');
  const [attach, setAttach] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const work = await simulate({
        channel,
        brief: brief.trim() || undefined,
        priority: priority === 'auto' ? undefined : priority,
        caseId: attach && currentCaseId ? currentCaseId : undefined,
      });
      toast.success(`${CHANNEL_META[channel].label} queued`, {
        description: `${work.customerName ?? 'A customer'} · ${work.subject ?? ''}`,
      });
      setBrief('');
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not create inbound work', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={event => void handleSubmit(event)} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Simulate inbound work</DialogTitle>
            <DialogDescription>
              AI writes a realistic customer, creates the Case and channel record, and routes it through Omni-Channel.
            </DialogDescription>
          </DialogHeader>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Channel</legend>
            <div className="grid grid-cols-3 gap-2">
              {CHANNELS.map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={channel === option}
                  onClick={() => setChannel(option)}
                  className={cn(
                    'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all',
                    channel === option ? 'border-ink bg-ink/[0.03] ring-2 ring-ink/15' : 'hover:bg-accent'
                  )}
                >
                  <ChannelIcon channel={option} solid={channel === option} />
                  {CHANNEL_META[option].label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="sim-brief">Scenario (optional)</Label>
            <Textarea
              id="sim-brief"
              rows={3}
              value={brief}
              onChange={event => setBrief(event.target.value)}
              placeholder="e.g. Frustrated customer double-charged after upgrading their plan"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={value => setPriority(value as Priority | 'auto')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Let AI decide</SelectItem>
                  {PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {currentCaseId ? (
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={attach} onChange={event => setAttach(event.target.checked)} className="size-4 accent-ink" />
                Attach to the open case
              </label>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              <Sparkles className="size-4" aria-hidden="true" />
              {submitting ? 'Writing scenario…' : 'Send to queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

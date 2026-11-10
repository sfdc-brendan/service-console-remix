import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { consoleApi, QUEUES, type WorkItem } from '@/api/console/consoleApi';
import { useConsole } from '@/context/consoleContext';

export function TransferDialog({ work, open, onOpenChange }: { work: WorkItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { refreshOmni } = useConsole();
  const [queue, setQueue] = useState<string>(QUEUES[2]);
  const [skill, setSkill] = useState('');
  const [busy, setBusy] = useState(false);

  const transfer = async () => {
    setBusy(true);
    try {
      await consoleApi.transfer(work.id, queue, skill.trim() || undefined);
      toast.success(`Transferred to ${queue}`, { description: 'Omni-Channel will route it to the next available agent.' });
      await refreshOmni();
      onOpenChange(false);
      navigate('/');
    } catch (err) {
      toast.error('Could not transfer', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer {work.channel === 'Voice' ? 'call' : 'conversation'}</DialogTitle>
          <DialogDescription>Send this work back to routing with a new queue and an optional required skill.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Queue</Label>
            <Select value={queue} onValueChange={setQueue}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUEUES.map(q => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-skill">Required skill (optional)</Label>
            <Input id="transfer-skill" value={skill} onChange={event => setSkill(event.target.value)} placeholder="e.g. Billing" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void transfer()}>
            <ArrowRightLeft className="size-4" aria-hidden="true" /> {busy ? 'Transferring…' : 'Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

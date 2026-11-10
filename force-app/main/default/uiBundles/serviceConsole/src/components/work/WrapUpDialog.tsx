import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { CASE_STATUSES, consoleApi, type CaseStatus, type Sentiment, type WorkItem } from '@/api/console/consoleApi';
import { useConsole } from '@/context/consoleContext';
import { useResource } from '@/hooks/useResource';
import { ErrorNote, ShimmerLines, Textarea } from '@/components/console/primitives';

const SENTIMENTS: Sentiment[] = ['Positive', 'Neutral', 'Negative'];

export function WrapUpDialog({ work, open, onOpenChange }: { work: WorkItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { refreshOmni } = useConsole();
  const draft = useResource(useCallback(() => consoleApi.wrapUp(work.id), [work.id]), open ? `wrap-${work.id}` : null);
  const [summary, setSummary] = useState('');
  const [caseStatus, setCaseStatus] = useState<CaseStatus>('Working');
  const [sentiment, setSentiment] = useState<Sentiment>('Neutral');
  const [followUps, setFollowUps] = useState<{ text: string; checked: boolean }[]>([]);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const data = draft.data;
    if (!data) {
      return;
    }
    setSummary([data.summary, data.resolution ? `Resolution: ${data.resolution}` : '', data.disposition ? `Disposition: ${data.disposition}` : '']
      .filter(Boolean)
      .join('\n\n'));
    setCaseStatus(data.caseStatus);
    setSentiment(data.sentiment);
    setFollowUps(data.followUps.map(text => ({ text, checked: true })));
  }, [draft.data]);

  const finish = async () => {
    setClosing(true);
    try {
      if (work.caseId) {
        for (const task of followUps.filter(f => f.checked)) {
          await consoleApi.executeAction(work.caseId, { type: 'createTask', payload: { subject: task.text, dueInDays: 1 } });
        }
      }
      await consoleApi.close(work.id, summary, caseStatus, sentiment);
      toast.success(`${work.name} wrapped up`, { description: `Case set to ${caseStatus}` });
      await refreshOmni();
      onOpenChange(false);
      navigate(work.caseId ? `/case/${work.caseId}` : '/');
    } catch (err) {
      toast.error('Could not complete wrap-up', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setClosing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Sparkles className="size-5 text-ai" aria-hidden="true" /> Wrap-up
          </DialogTitle>
          <DialogDescription>AI drafted this from the full transcript. Review, adjust, and close the work.</DialogDescription>
        </DialogHeader>
        {draft.error ? (
          <ErrorNote message={draft.error} onRetry={() => void draft.refresh()} />
        ) : !draft.data ? (
          <ShimmerLines lines={6} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wrap-summary">Summary</Label>
              <Textarea id="wrap-summary" rows={8} value={summary} onChange={event => setSummary(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Case status</Label>
                <Select value={caseStatus} onValueChange={value => setCaseStatus(value as CaseStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer sentiment</Label>
                <Select value={sentiment} onValueChange={value => setSentiment(value as Sentiment)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENTIMENTS.map(s => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {followUps.length ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Create follow-up tasks</legend>
                {followUps.map((item, index) => (
                  <label key={item.text} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-ink"
                      checked={item.checked}
                      onChange={event =>
                        setFollowUps(prev => prev.map((f, i) => (i === index ? { ...f, checked: event.target.checked } : f)))
                      }
                    />
                    {item.text}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep working
          </Button>
          <Button disabled={closing || !draft.data || !summary.trim()} onClick={() => void finish()}>
            <CheckCircle2 className="size-4" aria-hidden="true" /> {closing ? 'Closing…' : 'Complete & close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

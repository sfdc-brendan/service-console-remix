import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type WorkItem } from '@/api/console/consoleApi';
import { useResource } from './useResource';

/** Cached AI analysis for a closed conversation, plus a way to re-run it. */
export function useConversationAnalysis(work: WorkItem | null) {
  const workId = work?.status === 'Closed' ? work.id : null;
  const analysis = useResource(
    useCallback(() => consoleApi.analysis(workId ?? ''), [workId]),
    workId ? `analysis-${workId}` : null
  );
  const [regenerating, setRegenerating] = useState(false);
  const { setData } = analysis;
  const regenerate = useCallback(async () => {
    if (!workId) {
      return;
    }
    setRegenerating(true);
    try {
      setData(await consoleApi.analysis(workId, true));
    } catch (err) {
      toast.error('Could not re-run the analysis', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRegenerating(false);
    }
  }, [workId, setData]);
  return { analysis, regenerate, regenerating };
}

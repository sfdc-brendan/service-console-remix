import { useCallback } from 'react';
import { getWorkIdBySource } from '@/api/console/recordService';
import { useConsole } from '@/context/consoleContext';
import { useResource } from './useResource';

/** Resolves the routed work item behind a VoiceCall or MessagingSession. */
export function useWorkForSource(sourceRecordId: string | null) {
  const { omni } = useConsole();
  const live =
    omni?.active.find(w => w.sourceRecordId === sourceRecordId)?.id ?? null;
  const lookup = useResource(
    useCallback(
      () => getWorkIdBySource(sourceRecordId as string),
      [sourceRecordId]
    ),
    sourceRecordId && !live ? sourceRecordId : null
  );
  return { workId: live ?? lookup.data, loading: !live && lookup.loading };
}

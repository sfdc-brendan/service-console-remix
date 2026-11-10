import { useCallback, useState } from 'react';
import { consoleApi, type Conversation } from '@/api/console/consoleApi';
import { useResource } from './useResource';

const POLL_MS = 3500;

function awaitingCustomer(conversation: Conversation | null): boolean {
  if (!conversation) {
    return false;
  }
  const { work, messages } = conversation;
  const last = messages[messages.length - 1];
  return (
    work.simulated &&
    work.status === 'Accepted' &&
    !work.onHold &&
    last?.sender === 'Agent'
  );
}

/**
 * Live transcript for a work item. While the simulated customer owes a reply, polling
 * asks the server to `tick` the simulation; otherwise it just re-reads the thread.
 */
export function useConversation(workId: string | null) {
  const [sending, setSending] = useState(false);
  const resource = useResource<Conversation>(
    async () => {
      const current = await consoleApi.conversation(workId as string);
      return awaitingCustomer(current)
        ? consoleApi.tick(workId as string)
        : current;
    },
    workId,
    POLL_MS
  );
  const { setData } = resource;

  const send = useCallback(
    async (body: string) => {
      if (!workId || !body.trim()) {
        return;
      }
      setSending(true);
      try {
        setData(await consoleApi.send(workId, body.trim()));
      } finally {
        setSending(false);
      }
    },
    [workId, setData]
  );

  return {
    ...resource,
    sending,
    customerTyping: awaitingCustomer(resource.data),
    send,
  };
}

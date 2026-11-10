import { useCallback } from 'react';
import {
  consoleApi,
  type AccountProfile,
  type CustomerInsight,
  type CustomerProfile,
} from '@/api/console/consoleApi';
import { useResource, type Resource } from '@/hooks/useResource';

const TTL_MS = 30_000;
const profiles = new Map<
  string,
  { at: number; promise: Promise<CustomerProfile> }
>();
const insights = new Map<
  string,
  { at: number; promise: Promise<CustomerInsight> }
>();
const accounts = new Map<
  string,
  { at: number; promise: Promise<AccountProfile> }
>();
const accountInsights = new Map<
  string,
  { at: number; promise: Promise<CustomerInsight> }
>();

function cached<T>(
  store: Map<string, { at: number; promise: Promise<T> }>,
  key: string,
  load: () => Promise<T>,
  fresh: boolean
): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
    return hit.promise;
  }
  const promise = load();
  store.set(key, { at: Date.now(), promise });
  promise.catch(() => store.delete(key));
  return promise;
}

/** Several panels on one page read the same customer; share one request between them. */
export function useCustomerProfile(
  recordId: string | null
): Resource<CustomerProfile> {
  return useResource(
    useCallback(
      () =>
        cached(
          profiles,
          recordId ?? '',
          () => consoleApi.customer(recordId ?? ''),
          false
        ),
      [recordId]
    ),
    recordId
  );
}

function useInsight(
  store: Map<string, { at: number; promise: Promise<CustomerInsight> }>,
  load: (id: string) => Promise<CustomerInsight>,
  id: string | null
): Resource<CustomerInsight> {
  const resource = useResource(
    useCallback(
      () => cached(store, id ?? '', () => load(id ?? ''), false),
      [store, load, id]
    ),
    id
  );
  const { refresh: reload } = resource;
  const refresh = useCallback(async () => {
    if (id) {
      store.delete(id);
    }
    await reload();
  }, [store, id, reload]);
  return { ...resource, refresh };
}

export function useCustomerInsight(
  contactId: string | null
): Resource<CustomerInsight> {
  return useInsight(insights, consoleApi.customerInsight, contactId);
}

export function useAccountProfile(
  recordId: string | null
): Resource<AccountProfile> {
  return useResource(
    useCallback(
      () =>
        cached(
          accounts,
          recordId ?? '',
          () => consoleApi.account(recordId ?? ''),
          false
        ),
      [recordId]
    ),
    recordId
  );
}

export function useAccountInsight(
  accountId: string | null
): Resource<CustomerInsight> {
  return useInsight(accountInsights, consoleApi.accountInsight, accountId);
}

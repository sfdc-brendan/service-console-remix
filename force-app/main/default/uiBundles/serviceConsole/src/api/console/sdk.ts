import { createDataSDK, type DataSDK, type QueryOptions } from '@salesforce/platform-sdk';

type CacheControl = NonNullable<QueryOptions['cacheControl']>;

let sdkPromise: Promise<DataSDK> | null = null;

export function getSdk(): Promise<DataSDK> {
  sdkPromise ??= createDataSDK();
  return sdkPromise;
}

function joinErrors(errors: { message: string }[] | undefined): string | null {
  return errors?.length ? errors.map(e => e.message).join('; ') : null;
}

export async function runQuery<TData, TVariables>(
  query: string,
  variables: TVariables,
  cacheControl: CacheControl = 'no-cache'
): Promise<TData> {
  const sdk = await getSdk();
  if (!sdk.graphql) {
    throw new Error('Salesforce data is not available on this surface.');
  }
  const result = await sdk.graphql.query<TData, TVariables>({ query, variables, cacheControl });
  const error = joinErrors(result.errors);
  if (error) {
    throw new Error(error);
  }
  if (!result.data) {
    throw new Error('Salesforce returned no data.');
  }
  return result.data;
}

export async function runMutation<TData, TVariables>(
  mutation: string,
  variables: TVariables
): Promise<TData> {
  const sdk = await getSdk();
  if (!sdk.graphql) {
    throw new Error('Salesforce data is not available on this surface.');
  }
  const result = await sdk.graphql.mutate<TData, TVariables>({ mutation, variables });
  const error = joinErrors(result.errors);
  if (error) {
    throw new Error(error);
  }
  if (!result.data) {
    throw new Error('Salesforce returned no data.');
  }
  return result.data;
}

export async function apexRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const sdk = await getSdk();
  if (!sdk.fetch) {
    throw new Error('Salesforce APIs are not available on this surface.');
  }
  const response = await sdk.fetch(`/services/apexrest/slkconsole/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed ? String((parsed as { error: unknown }).error) : null;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return parsed as T;
}

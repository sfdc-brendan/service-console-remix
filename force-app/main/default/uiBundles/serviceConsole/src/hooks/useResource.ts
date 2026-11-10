import { useCallback, useEffect, useRef, useState } from 'react';

function isUpdater<T>(
  value: T | ((prev: T | null) => T | null)
): value is (prev: T | null) => T | null {
  return typeof value === 'function';
}

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Loads `loader` whenever `key` changes and, when `intervalMs` is set, re-runs it on
 * that interval while the tab is visible. Pass `key = null` to skip loading.
 */
export function useResource<T>(
  loader: () => Promise<T>,
  key: string | null,
  intervalMs: number | null = null,
  options: { keepPrevious?: boolean } = {}
): Resource<T> {
  const keepPrevious = options.keepPrevious === true;
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const loaderRef = useRef(loader);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    loaderRef.current = loader;
  });

  const run = useCallback(async (gen: number) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const result = await loaderRef.current();
      if (gen === generation.current) {
        setDataState(result);
        setError(null);
      }
    } catch (err) {
      if (gen === generation.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      inFlight.current = false;
      if (gen === generation.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const gen = ++generation.current;
    inFlight.current = false;
    if (!keepPrevious) {
      setDataState(null);
    }
    setError(null);
    if (key === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void run(gen);
    if (!intervalMs) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void run(gen);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [key, intervalMs, run, keepPrevious]);

  const refresh = useCallback(() => run(generation.current), [run]);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState(prev => (isUpdater(updater) ? updater(prev) : updater));
  }, []);

  return { data, error, loading, refresh, setData };
}

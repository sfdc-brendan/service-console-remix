import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from '@/components/ui/sonner';
import {
  consoleApi,
  type Me,
  type OmniState,
  type PresenceStatus,
  type SimulateRequest,
  type WorkItem,
} from '@/api/console/consoleApi';
import { workPath } from '@/lib/format';
import {
  notifyOffer,
  playOfferChime,
  requestOfferNotifications,
} from '@/lib/offerAlerts';
import {
  ConsoleContext,
  type ConsoleContextValue,
  type TabKind,
  type WorkspaceTab,
} from './consoleContext';

const OMNI_POLL_MS = 4000;
const TAB_STORAGE_KEY = 'slk-console-tabs';

function tabFor(pathname: string): WorkspaceTab {
  const [, first] = pathname.split('/');
  const kinds: Record<string, { kind: TabKind; label: string }> = {
    '': { kind: 'home', label: 'Home' },
    case: { kind: 'case', label: 'Case' },
    voice: { kind: 'voice', label: 'Voice call' },
    messaging: { kind: 'messaging', label: 'Messaging' },
    supervisor: { kind: 'supervisor', label: 'Command Center' },
    search: { kind: 'search', label: 'Search' },
    contact: { kind: 'contact', label: 'Contact' },
    account: { kind: 'account', label: 'Account' },
  };
  const match = kinds[first ?? ''] ?? { kind: 'other' as const, label: 'Page' };
  return { path: pathname, ...match };
}

function loadTabs(): WorkspaceTab[] {
  try {
    const raw = sessionStorage.getItem(TAB_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (t): t is WorkspaceTab =>
          typeof t === 'object' &&
          t !== null &&
          'path' in t &&
          'label' in t &&
          'kind' in t
      );
    }
  } catch {
    // ignore corrupt session state
  }
  return [];
}

const PINNED = new Set(['/', '/supervisor']);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [omni, setOmni] = useState<OmniState | null>(null);
  const [omniError, setOmniError] = useState<string | null>(null);
  const [clockSkew, setClockSkew] = useState(0);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(loadTabs);
  const [omniOpen, setOmniOpen] = useState(false);
  const syncing = useRef(false);
  const lastWhisperAt = useRef<string | null | undefined>(undefined);
  const seenOffers = useRef<Set<string> | null>(null);

  const applyOmni = useCallback((state: OmniState) => {
    setOmni(state);
    setOmniError(null);
    setClockSkew(new Date(state.serverTime).getTime() - Date.now());
    const fresh = state.offers.filter(
      offer => seenOffers.current && !seenOffers.current.has(offer.id)
    );
    seenOffers.current = new Set(state.offers.map(offer => offer.id));
    if (fresh.length) {
      playOfferChime();
      fresh.forEach(offer => notifyOffer(offer, () => setOmniOpen(false)));
    }
    const { whisper, whisperAt } = state.presence;
    if (
      lastWhisperAt.current !== undefined &&
      whisperAt &&
      whisperAt !== lastWhisperAt.current &&
      whisper
    ) {
      toast.info('Whisper from your supervisor', {
        description: whisper,
        duration: 12000,
      });
    }
    lastWhisperAt.current = whisperAt;
  }, []);

  const refreshOmni = useCallback(async () => {
    if (syncing.current) {
      return;
    }
    syncing.current = true;
    try {
      applyOmni(await consoleApi.sync());
    } catch (err) {
      setOmniError(err instanceof Error ? err.message : String(err));
    } finally {
      syncing.current = false;
    }
  }, [applyOmni]);

  useEffect(() => {
    consoleApi
      .me()
      .then(setMe)
      .catch((err: unknown) =>
        setOmniError(err instanceof Error ? err.message : String(err))
      );
    void refreshOmni();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshOmni();
      }
    }, OMNI_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshOmni]);

  useEffect(() => {
    const path = location.pathname;
    setTabs(prev =>
      prev.some(t => t.path === path) ? prev : [...prev, tabFor(path)]
    );
  }, [location.pathname]);

  useEffect(() => {
    sessionStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const setTabLabel = useCallback((path: string, label: string) => {
    setTabs(prev =>
      prev.map(t =>
        t.path === path && t.label !== label ? { ...t, label } : t
      )
    );
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      const index = tabs.findIndex(t => t.path === path);
      const next = tabs.filter(t => t.path !== path);
      setTabs(next);
      if (path === location.pathname) {
        navigate(next[Math.max(0, index - 1)]?.path ?? '/');
      }
    },
    [tabs, location.pathname, navigate]
  );

  const setPresence = useCallback(
    async (status: PresenceStatus) => {
      if (status === 'Online') {
        requestOfferNotifications();
      }
      try {
        applyOmni(await consoleApi.setPresence(status));
      } catch (err) {
        toast.error('Could not change status', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [applyOmni]
  );

  const acceptWork = useCallback(
    async (work: WorkItem) => {
      try {
        const accepted = await consoleApi.accept(work.id);
        const path = workPath(accepted);
        await refreshOmni();
        if (path) {
          navigate(path);
        }
        setOmniOpen(false);
      } catch (err) {
        toast.error('Could not accept work', {
          description: err instanceof Error ? err.message : String(err),
        });
        await refreshOmni();
      }
    },
    [navigate, refreshOmni]
  );

  const declineWork = useCallback(
    async (work: WorkItem) => {
      try {
        await consoleApi.decline(work.id);
      } catch (err) {
        toast.error('Could not decline work', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
      await refreshOmni();
    },
    [refreshOmni]
  );

  const simulate = useCallback(
    async (request: SimulateRequest) => {
      const work = await consoleApi.simulate(request);
      await refreshOmni();
      return work;
    },
    [refreshOmni]
  );

  const value = useMemo<ConsoleContextValue>(
    () => ({
      me,
      omni,
      omniError,
      clockSkew,
      setPresence,
      acceptWork,
      declineWork,
      refreshOmni,
      simulate,
      tabs: [...tabs].sort(
        (a, b) => Number(PINNED.has(b.path)) - Number(PINNED.has(a.path))
      ),
      setTabLabel,
      closeTab,
      omniOpen,
      setOmniOpen,
    }),
    [
      me,
      omni,
      omniError,
      clockSkew,
      setPresence,
      acceptWork,
      declineWork,
      refreshOmni,
      simulate,
      tabs,
      setTabLabel,
      closeTab,
      omniOpen,
    ]
  );

  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

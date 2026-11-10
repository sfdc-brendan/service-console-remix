import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { consoleApi, type LayoutsResponse } from '@/api/console/consoleApi';
import { useResource } from '@/hooks/useResource';
import {
  normalizeLayout,
  sameLayout,
  type LayoutSpec,
  type PageKey,
  type PageLayout,
} from '@/layout/layoutModel';
import {
  LayoutContext,
  type LayoutContextValue,
  type SavedMeta,
} from './layoutContext';

const HISTORY_LIMIT = 50;

interface EditState {
  drafts: Partial<Record<PageKey, PageLayout>>;
  history: Partial<Record<PageKey, PageLayout[]>>;
}

const EMPTY_EDIT: EditState = { drafts: {}, history: {} };

function withoutPage<T>(
  record: Partial<Record<PageKey, T>>,
  page: PageKey
): Partial<Record<PageKey, T>> {
  const next = { ...record };
  delete next[page];
  return next;
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const remote = useResource<LayoutsResponse>(consoleApi.layouts, 'layouts');
  const [specs, setSpecs] = useState<Partial<Record<PageKey, LayoutSpec>>>({});
  const [activePage, setActivePage] = useState<PageKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const { setData: setRemote } = remote;
  const saved = remote.data?.layouts;
  const canEdit = remote.data?.canEdit === true;

  const savedLayout = useCallback(
    (spec: LayoutSpec) => normalizeLayout(saved?.[spec.page]?.config, spec),
    [saved]
  );

  const layoutFor = useCallback(
    (spec: LayoutSpec) => edit.drafts[spec.page] ?? savedLayout(spec),
    [edit.drafts, savedLayout]
  );

  const register = useCallback((spec: LayoutSpec) => {
    setSpecs(prev =>
      prev[spec.page] === spec ? prev : { ...prev, [spec.page]: spec }
    );
    setActivePage(spec.page);
    return () =>
      setActivePage(current => (current === spec.page ? null : current));
  }, []);

  const update = useCallback(
    (page: PageKey, change: (layout: PageLayout) => PageLayout) => {
      const spec = specs[page];
      if (!spec) {
        return;
      }
      setEdit(prev => {
        const base = prev.drafts[page] ?? savedLayout(spec);
        const next = change(base);
        if (sameLayout(base, next)) {
          return prev;
        }
        const history = [...(prev.history[page] ?? []), base].slice(
          -HISTORY_LIMIT
        );
        return {
          drafts: { ...prev.drafts, [page]: next },
          history: { ...prev.history, [page]: history },
        };
      });
    },
    [specs, savedLayout]
  );

  const undo = useCallback((page: PageKey) => {
    setEdit(prev => {
      const history = prev.history[page] ?? [];
      const previous = history[history.length - 1];
      if (!previous) {
        return prev;
      }
      return {
        drafts: { ...prev.drafts, [page]: previous },
        history: { ...prev.history, [page]: history.slice(0, -1) },
      };
    });
  }, []);

  const dirtyPages = useMemo(
    () =>
      (Object.keys(edit.drafts) as PageKey[]).filter(page => {
        const spec = specs[page];
        const draft = edit.drafts[page];
        return spec && draft ? !sameLayout(draft, savedLayout(spec)) : false;
      }),
    [edit.drafts, specs, savedLayout]
  );

  const isDirty = useCallback(
    (page: PageKey) => dirtyPages.includes(page),
    [dirtyPages]
  );
  const canUndo = useCallback(
    (page: PageKey) => (edit.history[page]?.length ?? 0) > 0,
    [edit.history]
  );

  const persist = useCallback(
    async (page: PageKey) => {
      const draft = edit.drafts[page];
      if (!draft) {
        return;
      }
      const result = await consoleApi.saveLayout(page, draft);
      setRemote(prev =>
        prev
          ? {
              ...prev,
              layouts: {
                ...prev.layouts,
                [page]: {
                  config: draft,
                  updatedAt: result.updatedAt,
                  updatedBy: result.updatedBy,
                },
              },
            }
          : prev
      );
      setEdit(prev => ({
        drafts: withoutPage(prev.drafts, page),
        history: withoutPage(prev.history, page),
      }));
    },
    [edit.drafts, setRemote]
  );

  const save = useCallback(
    async (page: PageKey) => {
      setSaving(true);
      try {
        await persist(page);
        toast.success(`${specs[page]?.label ?? 'Page'} layout saved`, {
          description: 'Everyone using the console now sees this layout.',
        });
      } catch (err) {
        toast.error('Could not save layout', {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setSaving(false);
      }
    },
    [persist, specs]
  );

  const resetToDefault = useCallback(
    async (page: PageKey) => {
      setSaving(true);
      try {
        await consoleApi.resetLayout(page);
        setRemote(prev =>
          prev
            ? { ...prev, layouts: { ...prev.layouts, [page]: undefined } }
            : prev
        );
        setEdit(prev => ({
          drafts: withoutPage(prev.drafts, page),
          history: withoutPage(prev.history, page),
        }));
        toast.success(
          `${specs[page]?.label ?? 'Page'} layout reset to the default`
        );
      } catch (err) {
        toast.error('Could not reset layout', {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setSaving(false);
      }
    },
    [setRemote, specs]
  );

  const savedMeta = useCallback(
    (page: PageKey): SavedMeta | null => {
      const entry = saved?.[page];
      return entry
        ? { updatedAt: entry.updatedAt, updatedBy: entry.updatedBy }
        : null;
    },
    [saved]
  );

  const exitNow = useCallback(() => {
    setEdit(EMPTY_EDIT);
    setEditing(false);
    setConfirmExit(false);
  }, []);

  const requestExit = useCallback(() => {
    if (dirtyPages.length) {
      setConfirmExit(true);
    } else {
      exitNow();
    }
  }, [dirtyPages.length, exitNow]);

  const saveAllAndExit = async () => {
    setSaving(true);
    try {
      for (const page of dirtyPages) {
        await persist(page);
      }
      toast.success('Layouts saved', {
        description: 'Everyone using the console now sees these layouts.',
      });
      exitNow();
    } catch (err) {
      toast.error('Could not save layouts', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirtyPages.length) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyPages.length]);

  const value = useMemo<LayoutContextValue>(
    () => ({
      ready: remote.data !== null || remote.error !== null,
      canEdit,
      editing: editing && canEdit,
      startEditing: () => setEditing(true),
      requestExit,
      activeSpec: activePage ? (specs[activePage] ?? null) : null,
      register,
      layoutFor,
      update,
      undo,
      canUndo,
      isDirty,
      dirtyPages,
      save,
      resetToDefault,
      savedMeta,
      saving,
    }),
    [
      remote.data,
      remote.error,
      canEdit,
      editing,
      requestExit,
      activePage,
      specs,
      register,
      layoutFor,
      update,
      undo,
      canUndo,
      isDirty,
      dirtyPages,
      save,
      resetToDefault,
      savedMeta,
      saving,
    ]
  );

  const dirtyLabels = dirtyPages
    .map(page => specs[page]?.label ?? page)
    .join(', ');

  return (
    <LayoutContext.Provider value={value}>
      {children}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save your layout changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes on {dirtyLabels}. Saved layouts apply to
              everyone using the console.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              className="text-negative hover:text-negative"
              onClick={exitNow}
              disabled={saving}
            >
              Discard changes
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmExit(false)}
                disabled={saving}
              >
                Keep editing
              </Button>
              <Button onClick={() => void saveAllAndExit()} disabled={saving}>
                {saving ? 'Saving…' : 'Save & exit'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutContext.Provider>
  );
}

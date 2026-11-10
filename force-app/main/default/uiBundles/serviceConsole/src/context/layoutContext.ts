import { createContext, useContext } from 'react';
import type { LayoutSpec, PageKey, PageLayout } from '@/layout/layoutModel';

export interface SavedMeta {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface LayoutContextValue {
  ready: boolean;
  canEdit: boolean;
  editing: boolean;
  startEditing: () => void;
  /** Leaves edit mode; asks first when there are unsaved drafts. */
  requestExit: () => void;
  activeSpec: LayoutSpec | null;
  register: (spec: LayoutSpec) => () => void;
  layoutFor: (spec: LayoutSpec) => PageLayout;
  update: (page: PageKey, change: (layout: PageLayout) => PageLayout) => void;
  undo: (page: PageKey) => void;
  canUndo: (page: PageKey) => boolean;
  isDirty: (page: PageKey) => boolean;
  dirtyPages: PageKey[];
  save: (page: PageKey) => Promise<void>;
  resetToDefault: (page: PageKey) => Promise<void>;
  savedMeta: (page: PageKey) => SavedMeta | null;
  saving: boolean;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
  const value = useContext(LayoutContext);
  if (!value) {
    throw new Error('useLayout must be used inside LayoutProvider');
  }
  return value;
}

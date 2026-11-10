import { createContext, useContext, useEffect } from 'react';
import type { Me, OmniState, PresenceStatus, SimulateRequest, WorkItem } from '@/api/console/consoleApi';

export type TabKind = 'home' | 'case' | 'voice' | 'messaging' | 'supervisor' | 'search' | 'contact' | 'account' | 'other';

export interface WorkspaceTab {
  path: string;
  label: string;
  kind: TabKind;
}

export interface ConsoleContextValue {
  me: Me | null;
  omni: OmniState | null;
  omniError: string | null;
  /** Server clock minus local clock, in ms, for accurate offer countdowns. */
  clockSkew: number;
  setPresence: (status: PresenceStatus) => Promise<void>;
  acceptWork: (work: WorkItem) => Promise<void>;
  declineWork: (work: WorkItem) => Promise<void>;
  refreshOmni: () => Promise<void>;
  simulate: (request: SimulateRequest) => Promise<WorkItem>;
  tabs: WorkspaceTab[];
  setTabLabel: (path: string, label: string) => void;
  closeTab: (path: string) => void;
  omniOpen: boolean;
  setOmniOpen: (open: boolean) => void;
}

export const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (!value) {
    throw new Error('useConsole must be used inside ConsoleProvider');
  }
  return value;
}

/** Names the current workspace tab once the record has loaded. */
export function useTabTitle(path: string, label: string | null | undefined): void {
  const { setTabLabel } = useConsole();
  useEffect(() => {
    if (label) {
      setTabLabel(path, label);
    }
  }, [path, label, setTabLabel]);
}

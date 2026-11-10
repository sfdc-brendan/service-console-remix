import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Briefcase, Building2, CircleUserRound, Headphones, Home, LayoutDashboard, MessageSquareText, PanelsTopLeft, Phone, Plus, Search as SearchIcon, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { GlobalSearchBox } from '@/features/search';
import { ConsoleProvider } from '@/context/ConsoleProvider';
import { useConsole, type TabKind } from '@/context/consoleContext';
import { OfferStack, RailOffers } from '@/components/console/OfferStack';
import { LayoutEditorBar } from '@/components/layout/LayoutEditorBar';
import { LayoutProvider } from '@/context/LayoutProvider';
import { Customer360Provider } from '@/context/Customer360Provider';
import { useLayout } from '@/context/layoutContext';
import { useHostChrome } from '@/hooks/useHostChrome';
import { OmniDock } from '@/components/console/OmniDock';
import { SimulateDialog } from '@/components/console/SimulateDialog';
import { PersonAvatar, PresenceDot } from '@/components/console/primitives';
import { cn } from '@/lib/utils';

const TAB_ICONS: Record<TabKind, LucideIcon> = {
  home: Home,
  case: Briefcase,
  voice: Phone,
  messaging: MessageSquareText,
  supervisor: LayoutDashboard,
  search: SearchIcon,
  contact: CircleUserRound,
  account: Building2,
  other: Briefcase,
};

const TAB_ACCENT: Record<TabKind, string> = {
  home: 'text-ink',
  case: 'text-case',
  voice: 'text-voice',
  messaging: 'text-messaging',
  supervisor: 'text-ai',
  search: 'text-muted-foreground',
  contact: 'text-case',
  account: 'text-ink',
  other: 'text-muted-foreground',
};

function RailLink({ to, icon: Icon, label, end }: { to: string; icon: LucideIcon; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        cn(
          'group relative flex size-11 items-center justify-center rounded-xl text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-white',
          isActive && 'bg-sidebar-accent text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute top-2 bottom-2 -left-2.5 w-1 rounded-r-full bg-voice" aria-hidden="true" /> : null}
          <Icon className="size-5" aria-hidden="true" />
        </>
      )}
    </NavLink>
  );
}

function UtilityRail({ onSimulate }: { onSimulate: () => void }) {
  const { me, omni, omniOpen, setOmniOpen } = useConsole();
  const status = omni?.presence.status ?? 'Offline';
  const activeCount = omni?.active.length ?? 0;
  return (
    <nav className="ink-panel fixed top-0 bottom-0 left-0 z-40 flex w-16 flex-col items-center gap-2 py-3" aria-label="Console">
      <Link to="/" className="mb-3 flex size-10 items-center justify-center rounded-xl bg-voice font-display text-lg font-bold text-white" aria-label="Service Console home">
        S
      </Link>
      <RailLink to="/" end icon={Home} label="Home" />
      <RailLink to="/supervisor" icon={LayoutDashboard} label="Command Center" />
      <RailLink to="/search" icon={SearchIcon} label="Search" />
      <RailOffers />
      <div className="flex-1" />
      <button
        type="button"
        onClick={onSimulate}
        title="Simulate inbound work"
        aria-label="Simulate inbound work"
        className="flex size-11 items-center justify-center rounded-xl border border-dashed border-white/25 text-white/70 transition-colors hover:border-voice hover:text-voice"
      >
        <Plus className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setOmniOpen(!omniOpen)}
        aria-label={`Omni-Channel, ${status}`}
        aria-expanded={omniOpen}
        title="Omni-Channel"
        className={cn(
          'relative flex size-11 items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent',
          omniOpen ? 'bg-sidebar-accent text-white' : 'text-white/80'
        )}
      >
        <Headphones className="size-5" aria-hidden="true" />
        <PresenceDot status={status} className="absolute top-1.5 right-1.5 ring-2 ring-ink" />
        {activeCount ? (
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-voice font-mono text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>
      <span className="mt-2" title={me?.name}>
        <PersonAvatar name={me?.name} photoUrl={me?.presence.photoUrl} size="sm" />
      </span>
    </nav>
  );
}

function WorkspaceTabs() {
  const { tabs, closeTab } = useConsole();
  const location = useLocation();
  return (
    <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto" role="tablist" aria-label="Workspace tabs">
      {tabs.map(tab => {
        const Icon = TAB_ICONS[tab.kind];
        const active = tab.path === location.pathname;
        const pinned = tab.path === '/';
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            className={cn(
              'group flex h-10 max-w-56 shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm transition-colors',
              active ? 'bg-background font-medium' : 'border-transparent text-muted-foreground hover:bg-background/60'
            )}
          >
            <Link to={tab.path} className="flex min-w-0 items-center gap-2">
              <Icon className={cn('size-4 shrink-0', TAB_ACCENT[tab.kind])} aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
            </Link>
            {pinned ? null : (
              <button
                type="button"
                onClick={() => closeTab(tab.path)}
                aria-label={`Close ${tab.label}`}
                className="rounded p-0.5 opacity-50 hover:bg-muted hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomizeButton() {
  const { canEdit, editing, activeSpec, startEditing, requestExit } = useLayout();
  if (!canEdit) {
    return null;
  }
  return (
    <Button
      size="sm"
      variant={editing ? 'default' : 'ghost'}
      className={cn('mb-2 hidden gap-1.5 sm:inline-flex', editing && 'bg-ai text-white hover:bg-ai/90')}
      aria-pressed={editing}
      disabled={!editing && !activeSpec}
      title={activeSpec ? `Customize the ${activeSpec.label} layout` : 'This page has no customizable layout'}
      onClick={editing ? requestExit : startEditing}
    >
      <PanelsTopLeft className="size-3.5" aria-hidden="true" /> {editing ? 'Editing layout' : 'Customize'}
    </Button>
  );
}

/** Publishes the sticky console header's height as `--console-header-h` so page-level sticky bars sit below it. */
function useHeaderHeightVar() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    if (!header) {
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--console-header-h', `${header.offsetHeight}px`));
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--console-header-h');
    };
  }, []);
  return ref;
}

function ConsoleShell() {
  const [simulateOpen, setSimulateOpen] = useState(false);
  const { editing } = useLayout();
  const headerRef = useHeaderHeightVar();
  useHostChrome();
  return (
    <div className="paper-grain min-h-full pl-16">
      <UtilityRail onSimulate={() => setSimulateOpen(true)} />
      <header ref={headerRef} className="sticky top-0 z-20 flex items-end gap-4 border-b bg-card/85 px-4 pt-2 backdrop-blur">
        <div className="hidden pb-2.5 md:block">
          <p className="font-display text-base leading-none font-semibold">Service Console</p>
          <p className="text-[11px] text-muted-foreground">Service Cloud</p>
        </div>
        <WorkspaceTabs />
        <GlobalSearchBox className="hidden w-72 pb-1.5 xl:block" placeholder="Search cases, contacts…" submitLabel="Go" />
        <CustomizeButton />
        <Button size="sm" variant="outline" className="mb-2 hidden gap-1.5 sm:inline-flex" onClick={() => setSimulateOpen(true)}>
          <Plus className="size-3.5" aria-hidden="true" /> Inbound
        </Button>
      </header>
      <main className={cn('mx-auto max-w-[1600px] p-4 lg:p-6', editing && 'pb-32 lg:pb-32')}>
        <Outlet />
      </main>
      <OmniDock />
      <OfferStack />
      <LayoutEditorBar />
      <SimulateDialog open={simulateOpen} onOpenChange={setSimulateOpen} />
      <Toaster />
    </div>
  );
}

export default function AppLayout() {
  return (
    <ConsoleProvider>
      <LayoutProvider>
        <Customer360Provider>
          <ConsoleShell />
        </Customer360Provider>
      </LayoutProvider>
    </ConsoleProvider>
  );
}

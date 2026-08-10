// Alma — the university side of Scout (the Jill to Scout's Jack).
//
// Flow (PRD): a university representative lands on the program selection
// dashboard right after login; picking a program opens the program-scoped
// three-column interface — left collapsible navigation, middle agentic AI
// chat, right dynamic content (Recommendations / Shortlist / Documents /
// Profile), with the right panel persistent and width-adjustable.

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Inbox, Landmark, Loader2, LogOut, MessageCircle, Star, User } from 'lucide-react';
import { cn, typography } from '../../lib/colors';
import { logoutUser } from '../../components/AppProfileMenu';
import { useSpaceRuntime } from '../../SpaceRuntimeContext';
import AlmaChat from './alma-chat';
import AlmaDocuments from './alma-documents';
import AlmaNav, { TAB_DEFS, UniversityAvatar } from './alma-nav';
import AlmaPrograms from './alma-programs';
import AlmaProfile from './alma-profile';
import AlmaRecommendations from './alma-recommendations';
import AlmaShortlist from './alma-shortlist';
import { AlmaContext, AlmaContextValue, useAlmaStore } from './alma-store';
import { TabId } from './alma-types';

const RIGHT_FRACTION_KEY = 'alma_right_fraction';
const PREVIEW_SOURCE_VERSION = 'alma-cache-pruned-2026-07-28-sync-r1';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function loadRightFraction(): number {
  try {
    const parsed = Number(localStorage.getItem(RIGHT_FRACTION_KEY));
    if (parsed >= 0.28 && parsed <= 0.62) return parsed;
  } catch {
    // default below
  }
  return 0.46;
}

function RightPanel({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'shortlist':
      return <AlmaShortlist />;
    case 'documents':
      return <AlmaDocuments />;
    case 'profile':
      return <AlmaProfile />;
    default:
      return <AlmaRecommendations />;
  }
}

// Jill-style tab row across the top of the right column — mirrors (and stays
// in sync with) the left navigation, which remains the primary launcher.
function RightPanelTabs({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (t: TabId) => void }) {
  return (
    <div className="flex-shrink-0 h-12 flex items-center gap-0.5 px-2.5 border-b border-[var(--space-border-default)] overflow-x-auto">
      {TAB_DEFS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'text-[var(--space-text-primary)] bg-[var(--space-surface-muted)]'
                : 'text-[var(--space-text-muted)] hover:text-[var(--space-text-secondary)]'
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// On mobile there is no nav column, so the brand + university component
// (Sign Out) live in a slim top bar instead.
function MobileHeader({
  institutionName,
  email,
  onSignOut,
  onBackToPrograms,
}: {
  institutionName: string;
  email: string;
  onSignOut: () => void;
  onBackToPrograms?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--space-border-default)] bg-white">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center">
          <Landmark className="w-4 h-4" />
        </div>
        <span className={`text-base font-semibold ${typography.color.primary}`}>Alma</span>
        {onBackToPrograms && (
          <button
            type="button"
            onClick={onBackToPrograms}
            className={`ml-1 px-2 py-1 rounded-lg text-xs font-medium border border-[var(--space-border-default)] hover:bg-[var(--space-surface-muted)] transition-colors ${typography.color.secondary}`}
          >
            All programs
          </button>
        )}
      </div>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="University menu" aria-expanded={open}>
          <UniversityAvatar email={email} institution={institutionName} size="sm" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-50 py-1 overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--space-border-default)]">
              <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{institutionName}</p>
              <p className={`text-xs truncate ${typography.color.muted}`}>{email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const MOBILE_TABS: { id: 'chat' | TabId; label: string; icon: any }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'recommendations', label: 'For you', icon: Inbox },
  { id: 'shortlist', label: 'Shortlist', icon: Star },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function AlmaApp(_props: { appConfig?: unknown; dataFile?: string }) {
  const store = useAlmaStore();
  const { spaceId, setSessionId } = useSpaceRuntime();
  const isMobile = useIsMobile();

  // "Recommendations" is the default sub-section shown on entry (PRD).
  const [activeTab, setActiveTabRaw] = useState<TabId>('recommendations');
  const [mobileView, setMobileView] = useState<'chat' | TabId>('chat');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [modalCandidateId, setModalCandidateId] = useState<number | null>(null);
  const [rightFraction, setRightFraction] = useState(loadRightFraction);
  const [newProgramIntent, setNewProgramIntent] = useState(false);

  const layoutRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ startX: number; startFraction: number } | null>(null);

  const setActiveTab = useCallback(
    (tab: TabId) => {
      setActiveTabRaw(tab);
      if (isMobile) setMobileView(tab);
    },
    [isMobile]
  );

  // Entering a different program resets the panel to its default sub-section.
  useEffect(() => {
    setActiveTabRaw('recommendations');
    setMobileView('chat');
    setModalCandidateId(null);
  }, [store.activeProgramId]);

  const signOut = useCallback(() => {
    logoutUser(spaceId, setSessionId);
  }, [spaceId, setSessionId]);

  // "New program" from the in-program nav: back to the dashboard with the
  // creation modal already open.
  const requestNewProgram = useCallback(() => {
    setNewProgramIntent(true);
    store.openProgram(null);
  }, [store.openProgram]);
  const clearNewProgramIntent = useCallback(() => setNewProgramIntent(false), []);

  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { startX: e.clientX, startFraction: rightFraction };
    const onMove = (ev: MouseEvent) => {
      const ctx = resizing.current;
      const container = layoutRef.current;
      if (!ctx || !container) return;
      const total = container.getBoundingClientRect().width || 1;
      // Dragging left grows the right panel.
      const next = Math.min(0.62, Math.max(0.28, ctx.startFraction + (ctx.startX - ev.clientX) / total));
      setRightFraction(next);
    };
    const onUp = () => {
      resizing.current = null;
      setRightFraction((current) => {
        try {
          localStorage.setItem(RIGHT_FRACTION_KEY, String(current));
        } catch {
          // widths just won't persist
        }
        return current;
      });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const value: AlmaContextValue = {
    ...store,
    activeTab,
    setActiveTab,
    navCollapsed,
    setNavCollapsed,
    modalCandidateId,
    setModalCandidateId,
    signOut,
    isMobile,
    newProgramIntent,
    requestNewProgram,
    clearNewProgramIntent,
  };

  if (!store.ready) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[var(--space-surface-page)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center">
            <Landmark className="w-6 h-6" />
          </div>
          <div className={`flex items-center gap-2 text-sm ${typography.color.secondary}`}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Setting up Alma…
          </div>
        </div>
      </div>
    );
  }

  // Program selection dashboard first; the three-column interface is
  // program-specific and only opens once a program is picked (PRD).
  if (store.activeProgramId == null || !store.activeProgram) {
    return (
      <AlmaContext.Provider value={value}>
        <div className="w-full h-[100dvh] flex flex-col overflow-hidden">
          <AlmaPrograms />
        </div>
      </AlmaContext.Provider>
    );
  }

  if (!store.programReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[var(--space-surface-page)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center">
            <Landmark className="w-6 h-6" />
          </div>
          <div className={`flex items-center gap-2 text-sm ${typography.color.secondary}`}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Opening {store.activeProgram.name}…
          </div>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <AlmaContext.Provider value={value}>
        <div className="w-full h-[100dvh] flex flex-col bg-[var(--space-surface-page)] overflow-hidden">
          <MobileHeader
            institutionName={store.institutionName}
            email={store.email}
            onSignOut={signOut}
            onBackToPrograms={() => store.openProgram(null)}
          />
          <div className="flex-1 min-h-0">{mobileView === 'chat' ? <AlmaChat /> : <RightPanel tab={mobileView} />}</div>
          <div className="flex-shrink-0 flex items-stretch border-t border-[var(--space-border-default)] bg-white safe-bottom">
            {MOBILE_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = mobileView === tab.id;
              const badge = tab.id === 'recommendations' && store.recommended.length > 0 ? store.recommended.length : null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMobileView(tab.id);
                    if (tab.id !== 'chat') setActiveTabRaw(tab.id);
                  }}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                    active ? 'text-[var(--space-text-primary)]' : 'text-[var(--space-text-muted)]'
                  )}
                >
                  <span className="relative">
                    <Icon className="w-5 h-5" />
                    {badge != null && (
                      <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] text-[9px] font-semibold flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </AlmaContext.Provider>
    );
  }

  return (
    <AlmaContext.Provider value={value}>
      <div
        ref={layoutRef}
        data-preview-source={PREVIEW_SOURCE_VERSION}
        className="w-full h-[100dvh] min-h-0 flex bg-[var(--space-surface-page)] overflow-hidden"
      >
        {/* Left — collapsible navigation */}
        <AlmaNav />

        {/* Middle — agentic AI chat */}
        <div className="flex-1 min-w-0 h-full">
          <AlmaChat />
        </div>

        {/* Divider — drag to resize the right panel */}
        <div
          onMouseDown={onDividerDown}
          className="w-[5px] h-full flex-shrink-0 cursor-col-resize group flex items-center justify-center bg-transparent"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize content panel"
        >
          <div className="w-[3px] h-14 rounded-full bg-[var(--space-border-default)] group-hover:bg-[var(--space-brand-primary)] transition-colors" />
        </div>

        {/* Right — persistent dynamic content. The panel is width-adjustable
            via the divider and scrolls horizontally when narrower than its
            content (PRD). */}
        <div
          className="h-full flex-shrink-0 border-l border-[var(--space-border-default)] bg-white min-w-[300px] overflow-x-auto"
          style={{ width: `${rightFraction * 100}%` }}
        >
          <div className="h-full min-w-[360px] flex flex-col">
            <RightPanelTabs activeTab={activeTab} setActiveTab={setActiveTab} />
            <div className="flex-1 min-h-0">
              <RightPanel tab={activeTab} />
            </div>
          </div>
        </div>
      </div>
    </AlmaContext.Provider>
  );
}

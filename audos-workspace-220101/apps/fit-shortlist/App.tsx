// Scout — three-column agentic interface (Jack-style):
// left collapsible navigation, middle agentic AI chat, right dynamic content
// (Recommendations / Shortlist / Documents / Profile), with the right panel
// persistent and width-adjustable.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FileText, GraduationCap, Inbox, Landmark, Loader2, LogOut, Mail, MapPin, MessageCircle, Star, User } from 'lucide-react';
import { cn, typography } from '../../lib/colors';
import { logoutUser } from '../../components/AppProfileMenu';
import { useSpaceRuntime } from '../../SpaceRuntimeContext';
import ScoutChat from './scout-chat';
import ScoutNav from './scout-nav';
import { generateProfileBio, profileSummaryFailureCode } from './scout-agent';
import { ScoutContext, ScoutContextValue, ScoutStore, useScout, useScoutStore } from './scout-store';
import { InvitationRow, TabId, getInitials, relativeStamp, tileColor } from './scout-types';

// Secondary panels are intentionally split out of Scout's entry chunk. Mobile
// visitors start in chat and should not parse every panel before first input;
// desktop only fetches the default Recommendations panel during initial render.
const ScoutDocuments = lazy(() => import('./scout-documents'));
const ScoutProfile = lazy(() => import('./scout-profile'));
const ScoutRecommendations = lazy(() => import('./scout-recommendations'));
const ScoutShortlist = lazy(() => import('./scout-shortlist'));

const RIGHT_FRACTION_KEY = 'scout_right_fraction';
const SCOUT_UTM_STORAGE_KEY = 'scout_utm_params';
const SCOUT_LEAD_REGISTERED_KEY = 'scout_lead_registered';
const SCOUT_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
type ScoutUtmKey = (typeof SCOUT_UTM_KEYS)[number];
type ScoutUtmParams = Record<ScoutUtmKey, string | null>;
const scoutLeadRegistrationsInFlight = new Set<string>();
const APP_ROOT_HASH = '#fit-shortlist';
const TAB_HASHES: Record<TabId, string> = {
  recommendations: '#recommendations',
  invitations: '#invitations',
  shortlist: '#shortlist',
  documents: '#documents',
  profile: '#profile',
};

function tabFromHash(hash: string): TabId | null {
  const match = (Object.entries(TAB_HASHES) as [TabId, string][]).find(([, tabHash]) => tabHash === hash);
  return match?.[0] ?? null;
}

function pushHash(hash: string) {
  if (typeof window !== 'undefined' && window.location.hash !== hash) {
    window.history.pushState(null, '', hash);
  }
}

function scoutUtmParamsFromUrl(): ScoutUtmParams {
  const search = new URLSearchParams(window.location.search);
  const params = {} as ScoutUtmParams;
  for (const key of SCOUT_UTM_KEYS) params[key] = search.get(key);
  return params;
}

function captureScoutUtmParams(): ScoutUtmParams {
  const current = scoutUtmParamsFromUrl();
  try {
    const stored = sessionStorage.getItem(SCOUT_UTM_STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as Partial<ScoutUtmParams>;
      const params = {} as ScoutUtmParams;
      for (const key of SCOUT_UTM_KEYS) params[key] = typeof parsed?.[key] === 'string' ? parsed[key]! : null;
      return params;
    }
    sessionStorage.setItem(SCOUT_UTM_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return current;
}

async function registerScoutLead(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail === 'preview@scout.local') return;

  try {
    if (sessionStorage.getItem(SCOUT_LEAD_REGISTERED_KEY) !== null) return;
  } catch {
    // Continue without persistence when sessionStorage is unavailable.
  }
  if (scoutLeadRegistrationsInFlight.has(normalizedEmail)) return;

  scoutLeadRegistrationsInFlight.add(normalizedEmail);
  try {
    const utm = captureScoutUtmParams();
    const response = await fetch('/api/workspaces/bce7db44-7049-40fa-80a1-1dacb4302c83/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-DB-Token': (window as any).__workspaceDb?.token || '',
      },
      body: JSON.stringify({ email: normalizedEmail, source: 'chatgpt_ads', ...utm }),
    });

    if (response.ok || response.status === 409) {
      try {
        sessionStorage.setItem(SCOUT_LEAD_REGISTERED_KEY, 'true');
      } catch {
        // The contact is registered even if the browser cannot persist the flag.
      }
      return;
    }

    console.warn('[Scout] Contact registration failed', response.status);
  } catch (error) {
    console.warn('[Scout] Contact registration failed', error);
  } finally {
    scoutLeadRegistrationsInFlight.delete(normalizedEmail);
  }
}

function useBioGenerationCoordinator(store: ScoutStore) {
  const revision = store.profile.bioGeneration?.revision;
  const status = store.profile.bioGeneration?.status;

  useEffect(() => {
    if (!store.ready || !revision || status !== 'pending') return;
    let cancelled = false;
    const profile = store.profile;
    const intake = store.intake;
    const timer = window.setTimeout(async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const bio = await generateProfileBio(profile, intake);
          if (!cancelled) await store.commitGeneratedBio(revision, bio);
          return;
        } catch (error) {
          lastError = error;
        }
      }
      if (cancelled) return;
      const errorCode = profileSummaryFailureCode(lastError);
      console.error('[Scout Bio] generation failed', { revision, errorCode });
      await store.failGeneratedBio(revision, errorCode);
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    store.ready,
    revision,
    status,
    store.commitGeneratedBio,
    store.failGeneratedBio,
  ]);
}

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

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--space-brand-primary-700)] break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function levelLabel(level?: string | null): string {
  const t = (level || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function InvitationCard({ invitation, isNew }: { invitation: InvitationRow; isNew: boolean }) {
  const rawName = (invitation.university_name || '').trim();
  const university = /^your university$/i.test(rawName) ? 'A university' : rawName || 'A university';
  const message = (invitation.message || '').trim();
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4',
        isNew ? 'border-[var(--space-brand-primary-200)] shadow-sm' : 'border-[var(--space-border-default)]'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0 text-white"
          style={{ backgroundColor: tileColor(university) }}
        >
          {university === 'A university' ? <Landmark className="w-5 h-5" /> : getInitials(university)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${typography.color.primary}`}>{university}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isNew && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] text-[10px] font-semibold uppercase tracking-wide">
                  New
                </span>
              )}
              <span className={`text-[11px] ${typography.color.muted}`}>
                {relativeStamp(invitation.sent_at || invitation.created_at)}
              </span>
            </div>
          </div>
          <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>
            invites you to apply{invitation.program_name ? ` to ${invitation.program_name}` : ''}
          </p>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
            {levelLabel(invitation.program_level) && (
              <span className={`inline-flex items-center gap-1 text-xs ${typography.color.muted}`}>
                <GraduationCap className="w-3.5 h-3.5" />
                {levelLabel(invitation.program_level)}
              </span>
            )}
            {invitation.campus_location && (
              <span className={`inline-flex items-center gap-1 text-xs ${typography.color.muted}`}>
                <MapPin className="w-3.5 h-3.5" />
                {invitation.campus_location}
              </span>
            )}
          </div>
        </div>
      </div>
      {message && (
        <div className="mt-3 rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] px-3.5 py-3">
          <p className={`text-sm leading-relaxed whitespace-pre-line ${typography.color.secondary}`}>
            <Linkify text={message} />
          </p>
        </div>
      )}
    </div>
  );
}

function ScoutInvitations() {
  const { invitations, markInvitationsRead } = useScout();
  const newAtOpen = useRef<Set<number>>(new Set());

  useEffect(() => {
    const unread = invitations.filter((i) => i.status !== 'read').map((i) => Number(i.id));
    if (!unread.length) return;
    unread.forEach((id) => newAtOpen.current.add(id));
    markInvitationsRead(unread).catch(() => undefined);
  }, [invitations, markInvitationsRead]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--space-border-default)]">
        <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Invitations</h1>
        {invitations.length > 0 && (
          <span className={`text-xs ${typography.color.muted}`}>
            {invitations.length} invitation{invitations.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {invitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-16 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] flex items-center justify-center mb-3">
              <Mail className="w-6 h-6 text-[var(--space-text-muted)]" />
            </div>
            <p className={`text-sm font-medium ${typography.color.primary}`}>No invitations yet</p>
            <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>
              When a university invites you to apply to one of its programs, the invitation shows up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
                isNew={newAtOpen.current.has(Number(invitation.id)) || invitation.status !== 'read'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="h-full min-h-0 flex items-center justify-center bg-white">
      <span className={`flex items-center gap-2 text-sm ${typography.color.secondary}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading section…
      </span>
    </div>
  );
}

function RightPanel({ tab }: { tab: TabId }) {
  if (tab === 'invitations') return <ScoutInvitations />;

  const panel = (() => {
    switch (tab) {
      case 'shortlist':
        return <ScoutShortlist />;
      case 'documents':
        return <ScoutDocuments />;
      case 'profile':
        return <ScoutProfile />;
      default:
        return <ScoutRecommendations />;
    }
  })();

  return <Suspense fallback={<PanelLoading />}>{panel}</Suspense>;
}

// On mobile there is no nav column, so the brand + user component (Sign Out)
// live in a slim top bar instead.
function MobileHeader({ displayName, email, onSignOut }: { displayName: string; email: string; onSignOut: () => void }) {
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
          <GraduationCap className="w-4 h-4" />
        </div>
        <span className={`text-base font-semibold ${typography.color.primary}`}>Scout</span>
      </div>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-8 h-8 rounded-lg bg-[var(--space-brand-primary-900)] text-white flex items-center justify-center text-xs font-semibold"
          aria-label="User menu"
          aria-expanded={open}
        >
          {getInitials(displayName)}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-50 py-1 overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--space-border-default)]">
              <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{displayName}</p>
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
  { id: 'invitations', label: 'Invites', icon: Mail },
  { id: 'shortlist', label: 'Shortlist', icon: Star },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
];
const SCOUT_SOURCE_VERSION = 'scout-invitations-inline-2026-07-28-r2';

export default function ScoutApp(_props: { appConfig?: unknown; dataFile?: string }) {
  const store = useScoutStore();
  useBioGenerationCoordinator(store);
  const { spaceId, setSessionId } = useSpaceRuntime();
  const isMobile = useIsMobile();

  // "Recommendations" is the default view upon login (PRD), unless the URL deep-links to a section.
  const [activeTab, setActiveTabRaw] = useState<TabId>(() =>
    typeof window === 'undefined' ? 'recommendations' : tabFromHash(window.location.hash) ?? 'recommendations'
  );
  const [mobileView, setMobileView] = useState<'chat' | TabId>(() =>
    typeof window === 'undefined' ? 'chat' : tabFromHash(window.location.hash) ?? 'chat'
  );
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [modalProgramId, setModalProgramId] = useState<number | null>(null);
  const [rightFraction, setRightFraction] = useState(loadRightFraction);

  useEffect(() => {
    captureScoutUtmParams();
  }, []);

  useEffect(() => {
    if (!store.ready) return;
    void registerScoutLead(store.email);
  }, [store.ready, store.email]);

  const layoutRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ startX: number; startFraction: number; containerWidth: number } | null>(null);

  const setActiveTab = useCallback(
    (tab: TabId) => {
      setActiveTabRaw(tab);
      if (isMobile) setMobileView(tab);
      pushHash(TAB_HASHES[tab]);
    },
    [isMobile]
  );

  const openProgramModal = useCallback(
    (id: number) => {
      // Recent-programs click: land on the Shortlist and open that program's modal.
      setActiveTabRaw('shortlist');
      if (isMobile) setMobileView('shortlist');
      setModalProgramId(id);
      pushHash(TAB_HASHES.shortlist);
    },
    [isMobile]
  );

  useEffect(() => {
    const syncViewFromHash = () => {
      const tab = tabFromHash(window.location.hash);
      if (tab) {
        setActiveTabRaw(tab);
        if (isMobile) setMobileView(tab);
        setModalProgramId(null);
      } else if (window.location.hash === APP_ROOT_HASH) {
        setActiveTabRaw('recommendations');
        if (isMobile) setMobileView('chat');
        setModalProgramId(null);
      }
    };

    window.addEventListener('popstate', syncViewFromHash);
    window.addEventListener('hashchange', syncViewFromHash);
    return () => {
      window.removeEventListener('popstate', syncViewFromHash);
      window.removeEventListener('hashchange', syncViewFromHash);
    };
  }, [isMobile]);

  const signOut = useCallback(() => {
    logoutUser(spaceId, setSessionId);
  }, [spaceId, setSessionId]);

  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = layoutRef.current;
    if (!container) return;

    // Measure once before any resize writes. Reading the container on every
    // mousemove after React changed the panel width forced a synchronous layout.
    resizing.current = {
      startX: e.clientX,
      startFraction: rightFraction,
      containerWidth: container.getBoundingClientRect().width || 1,
    };

    let pendingClientX = e.clientX;
    let animationFrame: number | null = null;
    const fractionAt = (clientX: number, ctx: NonNullable<typeof resizing.current>) =>
      Math.min(0.62, Math.max(0.28, ctx.startFraction + (ctx.startX - clientX) / ctx.containerWidth));

    const onMove = (ev: MouseEvent) => {
      pendingClientX = ev.clientX;
      if (animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const ctx = resizing.current;
        if (ctx) setRightFraction(fractionAt(pendingClientX, ctx));
      });
    };
    const onUp = (ev: MouseEvent) => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      const ctx = resizing.current;
      if (ctx) {
        const finalFraction = fractionAt(ev.clientX, ctx);
        setRightFraction(finalFraction);
        try {
          localStorage.setItem(RIGHT_FRACTION_KEY, String(finalFraction));
        } catch {
          // widths just won't persist
        }
      }
      resizing.current = null;
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

  const value: ScoutContextValue = {
    ...store,
    activeTab,
    setActiveTab,
    navCollapsed,
    setNavCollapsed,
    modalProgramId,
    setModalProgramId,
    openProgramModal,
    signOut,
    isMobile,
  };

  if (!store.ready) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[var(--space-surface-page)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className={`flex items-center gap-2 text-sm ${typography.color.secondary}`}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Setting up Scout…
          </div>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <ScoutContext.Provider value={value}>
        <div
          data-scout-source={SCOUT_SOURCE_VERSION}
          className="w-full h-[100dvh] flex flex-col bg-[var(--space-surface-page)] overflow-hidden"
        >
          <MobileHeader displayName={store.displayName} email={store.email} onSignOut={signOut} />
          <div className="flex-1 min-h-0">
            {mobileView === 'chat' ? <ScoutChat /> : <RightPanel tab={mobileView} />}
          </div>
          <div className="flex-shrink-0 flex items-stretch border-t border-[var(--space-border-default)] bg-white safe-bottom">
            {MOBILE_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = mobileView === tab.id;
              const badge =
                tab.id === 'recommendations' && store.recommended.length > 0
                  ? store.recommended.length
                  : tab.id === 'invitations' && store.unreadInvitationCount > 0
                    ? store.unreadInvitationCount
                    : null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'chat') {
                      setMobileView('chat');
                      pushHash(APP_ROOT_HASH);
                    } else {
                      setActiveTab(tab.id);
                    }
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
      </ScoutContext.Provider>
    );
  }

  return (
    <ScoutContext.Provider value={value}>
      <div
        ref={layoutRef}
        data-scout-source={SCOUT_SOURCE_VERSION}
        className="w-full h-[100dvh] min-h-0 flex bg-[var(--space-surface-page)] overflow-hidden"
      >
        {/* Left — collapsible navigation */}
        <ScoutNav />

        {/* Middle — agentic AI chat */}
        <div className="flex-1 min-w-0 h-full">
          <ScoutChat />
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

        {/* Right — persistent dynamic content */}
        <div
          className="h-full flex-shrink-0 border-l border-[var(--space-border-default)] bg-white min-w-[340px]"
          style={{ width: `${rightFraction * 100}%` }}
        >
          <RightPanel tab={activeTab} />
        </div>
      </div>
    </ScoutContext.Provider>
  );
}

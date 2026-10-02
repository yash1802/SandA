import { useState, Suspense, LazyExoticComponent, ComponentType, useEffect, useLayoutEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Bot, Folder, X, Minus, Activity, Moon, Heart, Calendar, Users, FileText, BarChart, Settings as SettingsIcon, ArrowUp, MessageCircle, ChevronUp, Plane, TrendingUp, LineChart, Dumbbell, Brain, Target, Zap, Star, Clock, CheckCircle, List, BookOpen, Coffee, Music, Camera, MapPin, Wallet, ShoppingCart, Gift, Lightbulb, Sparkles, Rocket, Home, Building, Globe, Mail, Phone, Video, Mic, Image, Play, Pause, Volume2, Wifi, Cloud, Sun, Umbrella, Thermometer, Wind, Droplets, Leaf, Flower2, Mountain, Waves, Compass, Map, Navigation, Car, Bike, Ship, Award, Trophy, Medal, Crown, Diamond, Gem, Key, Lock, Unlock, Shield, Eye, Search, Filter, SortAsc, Download, Upload, Share2, Link, ExternalLink, Copy, Clipboard, ClipboardList, Trash2, Edit, Pencil, PenTool, Scissors, Bookmark, Flag, Bell, AlertCircle, Info, HelpCircle, XCircle, CheckCircle2, Circle, Square, Triangle, Hexagon, Octagon, Hash, AtSign, DollarSign, Percent, Calculator, Code, Terminal, Database, Server, Cpu, Monitor, Smartphone, Tablet, Laptop, Watch, Headphones, Speaker, Radio, Tv, Printer, Scan, QrCode, Barcode, CreditCard, Receipt, Banknote, PiggyBank, TrendingDown, AreaChart, PieChart, GraduationCap, Radar } from 'lucide-react';
import type { SpaceConfig, DesktopBranding, DesktopThemeTokens } from './types';
import { useSpaceRuntime } from './SpaceRuntimeContext';
import AgentChat from './components/AgentChat';
import FileBrowser from './components/FileBrowser';
import EmailGate from './components/EmailGate';
import Settings from './components/Settings';
import SupportWidget from './components/SupportWidget';
import { tw } from './lib/colors';

// Role-based app visibility. Students and universities get COMPLETELY separate
// experiences — each role only ever sees, lands in, and can open its own app.
// Anything not listed for a role is invisible AND unreachable (dock, launcher,
// deep links / URL hashes are all gated against this map).
const ROLE_APP_IDS: Record<string, string[]> = {
  student: ['fit-shortlist'],
  university: ['prospect-radar'],
  company: ['prospect-radar'],
};
const VALID_ROLES = Object.keys(ROLE_APP_IDS);
const PUBLIC_SURVEY_APP_IDS = new Set(['student-survey', 'university-survey']);

const DESKTOP_VERSION = 4;

// Hook to detect mobile vs desktop using JS (prevents double-mounting of components)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768; // md breakpoint
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    // Set initial value
    setIsMobile(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

interface AppErrorBoundaryProps {
  appName?: string;
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[AppErrorBoundary] App "${this.props.appName || 'unknown'}" crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#1a202c' }}>
            {this.props.appName ? `"${this.props.appName}" failed to load` : 'App failed to load'}
          </h2>
          <p style={{ fontSize: '14px', color: '#718096', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
            {this.state.error?.message || 'An unexpected error occurred while loading this app.'}
          </p>
          <button
            onClick={() => {
              this.setState((prev) => ({ hasError: false, error: null, retryKey: prev.retryKey + 1 }));
            }}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            ↻ Retry
          </button>
        </div>
      );
    }
    return <div key={this.state.retryKey} className="h-full min-h-0 flex flex-col flex-1">{this.props.children}</div>;
  }
}

function buildFontFamily(fontName?: string): string {
  if (!fontName) {
    return '"Sora", system-ui, -apple-system, sans-serif';
  }

  return `"${fontName}", system-ui, -apple-system, sans-serif`;
}

function sanitizeLegacyBrandName(_name?: string | null): string {
  return 'Scout & Alma';
}

function sanitizeLegacyTagline(_tagline?: string | null): string {
  return 'Scout helps students find their fit. Alma helps universities reach matched prospects.';
}

function resolveGenesisRuntimeTheme(config: SpaceConfig) {
  const branding = (config.desktop?.branding || {}) as DesktopBranding;
  const themeTokens = (config.desktop?.themeTokens || {}) as DesktopThemeTokens;
  const headingFont =
    themeTokens.typography?.headingFont ||
    branding.headingFont ||
    'Sora';
  const bodyFont =
    themeTokens.typography?.bodyFont ||
    branding.bodyFont ||
    headingFont;

  return {
    branding: {
      name: sanitizeLegacyBrandName(branding.name || config.name),
      tagline: sanitizeLegacyTagline(branding.tagline),
      logoUrl:
        branding.logoUrl ||
        (config as any).iconUrl ||
        (config as any).logoUrl,
    },
    themeTokens: {
      palette: themeTokens.palette || branding.palette || branding.colors,
      typography: {
        headingFont,
        bodyFont,
        fontFamily:
          themeTokens.typography?.fontFamily || buildFontFamily(headingFont),
      },
      shell: themeTokens.shell,
      cssVariables: themeTokens.cssVariables || {},
    },
  };
}

// Icon mapping for app icons - supports both PascalCase and lowercase
const baseIconMap: Record<string, ComponentType<any>> = {
  Activity, Moon, Heart, Calendar, Users, FileText, BarChart, Bot, Folder,
  Plane, TrendingUp, LineChart, Dumbbell, Brain, Target, Zap, Star, Clock,
  CheckCircle, List, BookOpen, Coffee, Music, Camera, MapPin, Wallet,
  ShoppingCart, Gift, Lightbulb, Sparkles, Rocket, Home, Building, Globe,
  Mail, Phone, Video, Mic, Image, Play, Pause, Volume2, Wifi, Cloud, Sun,
  Umbrella, Thermometer, Wind, Droplets, Leaf, Mountain, Waves, Compass,
  Map, Navigation, Car, Bike, Ship, Award, Trophy, Medal, Crown, Diamond,
  Gem, Key, Lock, Unlock, Shield, Eye, Search, Filter, SortAsc, Download,
  Upload, Share2, Link, ExternalLink, Copy, Clipboard, ClipboardList, Trash2, Edit, Pencil,
  PenTool, Scissors, Bookmark, Flag, Bell, AlertCircle, Info, HelpCircle,
  XCircle, CheckCircle2, Circle, Square, Triangle, Hexagon, Octagon, Hash,
  AtSign, DollarSign, Percent, Calculator, Code, Terminal, Database, Server,
  Cpu, Monitor, Smartphone, Tablet, Laptop, Watch, Headphones, Speaker,
  Radio, Tv, Printer, Scan, QrCode, Barcode, CreditCard, Receipt, Banknote,
  PiggyBank, TrendingDown, AreaChart, PieChart, Flower2, GraduationCap, Radar,
};

// Create case-insensitive lookup with common aliases
const iconMap: Record<string, ComponentType<any>> = {};
Object.entries(baseIconMap).forEach(([key, value]) => {
  iconMap[key] = value;
  iconMap[key.toLowerCase()] = value;
  // Handle kebab-case (e.g., "line-chart" -> LineChart)
  const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  iconMap[kebabKey] = value;
});
// Common aliases
iconMap['chart'] = BarChart;
iconMap['graph'] = LineChart;
iconMap['workout'] = Dumbbell;
iconMap['fitness'] = Dumbbell;
iconMap['gym'] = Dumbbell;
iconMap['stock'] = TrendingUp;
iconMap['stocks'] = TrendingUp;
iconMap['trip'] = Plane;
iconMap['travel'] = Plane;
iconMap['flight'] = Plane;
iconMap['money'] = Wallet;
iconMap['finance'] = DollarSign;
iconMap['health'] = Heart;
iconMap['wellness'] = Heart;
iconMap['notes'] = FileText;
iconMap['note'] = FileText;
iconMap['log'] = List;
iconMap['tracker'] = Activity;
iconMap['tracking'] = Activity;
iconMap['ai'] = Sparkles;
iconMap['smart'] = Brain;
iconMap['idea'] = Lightbulb;
iconMap['ideas'] = Lightbulb;
iconMap['time'] = Clock;
iconMap['schedule'] = Calendar;
iconMap['event'] = Calendar;
iconMap['events'] = Calendar;
iconMap['people'] = Users;
iconMap['team'] = Users;
iconMap['community'] = Users;
iconMap['book'] = BookOpen;
iconMap['read'] = BookOpen;
iconMap['reading'] = BookOpen;
iconMap['shop'] = ShoppingCart;
iconMap['shopping'] = ShoppingCart;
iconMap['cart'] = ShoppingCart;
iconMap['location'] = MapPin;
iconMap['place'] = MapPin;
iconMap['weather'] = Cloud;
iconMap['photo'] = Camera;
iconMap['photos'] = Camera;
iconMap['video'] = Video;
iconMap['movie'] = Play;
iconMap['audio'] = Music;
iconMap['sound'] = Volume2;
iconMap['call'] = Phone;
iconMap['email'] = Mail;
iconMap['message'] = MessageCircle;
iconMap['messages'] = MessageCircle;
iconMap['chat'] = MessageCircle;
iconMap['settings'] = SettingsIcon;
iconMap['config'] = SettingsIcon;
iconMap['gear'] = SettingsIcon;

interface SpaceDesktopProps {
  mode: 'entrepreneur' | 'customer';
  spaceId: string;
  sessionId?: string;
  config: SpaceConfig;
  apps: Record<string, LazyExoticComponent<any>>;
  LoadingSpinner: ComponentType;
  initialAppId?: string | null;
}

type WindowId = 'files' | 'agent' | 'settings' | string; // string for app IDs

interface FileAccessLog {
  timestamp: number;
  path: string;
  action: 'read' | 'write';
  tool: string;
}

export default function SpaceDesktop({
  mode,
  spaceId,
  sessionId: _unusedProp, // Ignore prop, read from context instead
  config,
  apps,
  LoadingSpinner,
  initialAppId
}: SpaceDesktopProps) {
  const { sessionId, isBootstrappingSession, trackEvent, subscriptionReady, setSessionId } = useSpaceRuntime();
  const isMobile = useIsMobile(); // JS-based media query to prevent double-mounting AgentChat

  // The compiled space HTML is platform-generated, so set the root document
  // language at runtime for screen readers and browser language features.
  useEffect(() => {
    document.documentElement.lang = 'en';
  }, []);

  // ── Role-based segregation ──────────────────────────────────────────────
  // The user's role (student vs. university) is chosen at sign-up (EmailGate)
  // and persisted in localStorage. It determines which app they land on and
  // is the single gate for everything they can see/open.
  const roleStorageKey = `space_role_${spaceId}`;
  const [userRole, setUserRole] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const r = localStorage.getItem(`space_role_${spaceId}`);
      return r && VALID_ROLES.includes(r) ? r : null;
    } catch {
      return null;
    }
  });
  const selectRole = (r: string) => {
    if (!VALID_ROLES.includes(r)) return;
    try { localStorage.setItem(roleStorageKey, r); } catch {}
    setUserRole(r);
  };
  // EmailGate writes the role to localStorage just before the session is
  // established; mirror it whenever the session changes (this component
  // instance stays mounted across the gate, so the lazy useState initializer
  // alone would miss it). localStorage is ALWAYS authoritative: a stale
  // in-memory role from a previous login in the same tab must never win over
  // the role the user just picked ("I'm a Student" → Scout, "I'm a
  // University" → Alma, strictly).
  useEffect(() => {
    try {
      const r = localStorage.getItem(roleStorageKey);
      const stored = r && VALID_ROLES.includes(r) ? r : null;
      if (stored !== userRole) setUserRole(stored);
    } catch {}
  }, [sessionId, roleStorageKey, userRole]);

  // Logout (session cleared in customer mode) fully resets the shell so the
  // next login re-routes from the freshly chosen role instead of reusing the
  // previous login's window/init state.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (mode !== 'customer') return;
    if (sessionId) {
      wasSignedIn.current = true;
      return;
    }
    if (!wasSignedIn.current) return;
    wasSignedIn.current = false;
    hasInitialized.current = false;
    hasNormalizedPostAuthHistory.current = false;
    hasTrackedSpaceEntry.current = false;
    setActiveWindowId(null);
    setIsAgentMinimized(true);
    setViewingLanding(false);
  }, [mode, sessionId]);

  // Bypass email gate and role assignment for public survey deep links.
  const publicAppBypass = (() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const requestedAppId = params.get('app') || (window as any).__DEEP_LINK_APP_ID__ || initialAppId;
    if (!requestedAppId) return false;
    const matchingApp = config.apps.find(a => a.id.toLowerCase() === String(requestedAppId).toLowerCase());
    return !!matchingApp && ((matchingApp as any).public === true || PUBLIC_SURVEY_APP_IDS.has(matchingApp.id));
  })();

  // Ephemeral session for anonymous public survey respondents (no login required).
  useEffect(() => {
    if (!publicAppBypass || sessionId) return;
    setSessionId(`survey_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`);
  }, [publicAppBypass, sessionId, setSessionId]);

  // Role is chosen at sign-up (EmailGate) and stored in localStorage — never auto-assign.

  // Entrepreneur preview sees everything. Customers only ever see the apps
  // mapped to their role.
  const allowedAppIds: string[] | null =
    mode === 'customer' ? (userRole ? (ROLE_APP_IDS[userRole] || []) : []) : null;
  const isAppAllowed = (appId: string) => {
    if (allowedAppIds === null) return true;
    if (PUBLIC_SURVEY_APP_IDS.has(appId)) return true;
    const app = config.apps.find((a) => a.id === appId);
    if ((app as any)?.public === true) return true;
    return allowedAppIds.includes(appId);
  };
  const visibleApps =
    allowedAppIds === null
      ? config.apps
      : config.apps.filter((a) => allowedAppIds.includes(a.id));

  // Timeout guard: if subscriptionReady stays false for too long, unblock the UI
  // so the user isn't stuck on an infinite spinner (fixes EmailGate hang bug).
  const [subscriptionTimedOut, setSubscriptionTimedOut] = useState(false);
  useEffect(() => {
    if (subscriptionReady) return;
    if (!sessionId) return;
    const timer = setTimeout(() => setSubscriptionTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [subscriptionReady, sessionId]);

  // Show email gate for customer mode if no session (from context)
  // Suppress gate while post-checkout auto-session bootstrap is in flight to avoid flashing EmailGate
  // Also bypass when the URL targets a public app (e.g. tokenised PhotoUpload deep-link from email):
  // the public app validates the token itself, so the EmailGate is not needed.
  const showEmailGate = mode === 'customer' && !sessionId && !isBootstrappingSession && !publicAppBypass;

  // Browser back from Scout/Alma lands on a dedicated landing history entry.
  const [viewingLanding, setViewingLanding] = useState(() => {
    if (typeof window === 'undefined') return false;
    const state = window.history.state as { view?: string } | null;
    return !window.location.hash && state?.view === 'landing';
  });

  const [activeWindowId, setActiveWindowId] = useState<WindowId | null>(null);
  const [isAgentMinimized, setIsAgentMinimized] = useState(true); // Start minimized for launcher view

  // Determine if we're in "launcher" mode (empty desktop state on desktop)
  const isLauncherMode = activeWindowId === null && isAgentMinimized;
  // Entrepreneur preview root shows the same marketing landing as customer mode.
  const showMarketingLanding = mode === 'entrepreneur' && isLauncherMode && !publicAppBypass;

  // Lock body/html scroll on mobile to prevent iOS Safari from scrolling
  // the page when the keyboard opens or the address bar animates.
  // Skip while EmailGate is visible — the sign-in page must remain scrollable.
  // The requestAnimationFrame flush forces Android Chrome to discard stale
  // compositor tiles that may linger from the initial paint (before position
  // switches to fixed), preventing GPU tile corruption artifacts.
  useEffect(() => {
    if (!isMobile || showEmailGate || viewingLanding || showMarketingLanding) return;
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.top = '0';
    body.style.left = '0';
    const raf = requestAnimationFrame(() => {
      body.style.opacity = '0.999';
      requestAnimationFrame(() => { body.style.opacity = ''; });
    });
    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = '';
      html.style.height = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.width = '';
      body.style.height = '';
      body.style.top = '';
      body.style.left = '';
    };
  }, [isMobile, showEmailGate, viewingLanding, showMarketingLanding]);
  const [fileAccessLogs, setFileAccessLogs] = useState<FileAccessLog[]>([]);
  const [launcherMessage, setLauncherMessage] = useState(''); // Message typed in launcher input
  const [pendingAgentMessage, setPendingAgentMessage] = useState<string | null>(null); // Message to send when agent opens
  const [hasChatHistory, setHasChatHistory] = useState<boolean | null>(null); // Track if user has chat history

  // Track whether hash change was triggered internally (to avoid minimizing agent on UI navigation)
  const isInternalHashChange = useRef(false);
  // Preserve a valid URL deep link while the customer session and role are restored.
  const pendingDeepLink = useRef<string | null>(null);
  // Track if initial window setup has been done (to prevent deep link handler from re-running)
  const hasInitialized = useRef(false);
  // Track if space_entered has been tracked to avoid duplicates
  const hasTrackedSpaceEntry = useRef(false);

  const openApp = (appId: string) => {
    // Never open an app the current role isn't allowed to see.
    if (!isAppAllowed(appId)) return;
    const app = config.apps.find(a => a.id === appId);
    if (app) {
      trackEvent('app_opened', { appId, appName: app.name });
    }
    setViewingLanding(false);
    setActiveWindowId(appId);
  };

  // Track space_entered when session becomes available (first entry after email gate)
  useEffect(() => {
    if (sessionId && !hasTrackedSpaceEntry.current) {
      hasTrackedSpaceEntry.current = true;
      trackEvent('space_entered', {
        referrer: document.referrer || null,
        url: window.location.href,
      });
    }
  }, [sessionId, trackEvent]);

  // Check for chat history when session becomes available
  useEffect(() => {
    const checkChatHistory = async () => {
      // Build request params - prioritize sessionId from context (authoritative)
      // Fall back to localStorage only for email (needed for legacy compatibility)
      const params = new URLSearchParams();

      // sessionId from context is always authoritative (set by EmailGate)
      if (sessionId && sessionId.startsWith('wses_')) {
        params.set('sessionId', sessionId);
        console.log('[Desktop] Checking chat history with sessionId:', sessionId);
      }

      // Also include email from localStorage as fallback
      const sessionKey = `space_session_${spaceId}`;
      const stored = localStorage.getItem(sessionKey);
      if (stored) {
        try {
          const session = JSON.parse(stored);
          if (session.email) {
            params.set('email', session.email);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Need at least sessionId or email
      if (!params.has('sessionId') && !params.has('email')) {
        setHasChatHistory(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/space/${spaceId}/chat/history?${params.toString()}`
        );

        if (response.ok) {
          const data = await response.json();
          setHasChatHistory(data.hasHistory === true && data.messageCount > 0);
        } else {
          setHasChatHistory(false);
        }
      } catch (e) {
        console.error('[Desktop] Failed to check chat history:', e);
        setHasChatHistory(false);
      }
    };

    if (sessionId) {
      checkChatHistory();
    }
  }, [sessionId, spaceId]);

  // Handle URL hash-based deep linking and set default window (ONLY on initial mount)
  useEffect(() => {
    // Cache a valid hash before any session/role guard can return. Post-auth
    // history normalization rewrites the URL, so the hash cannot be recovered later.
    const hash = window.location.hash.slice(1).toLowerCase();
    const matchingDeepLinkedApp = hash
      ? config.apps.find(
          app => app.id.toLowerCase() === hash || app.name.toLowerCase() === hash
        )
      : undefined;
    if (matchingDeepLinkedApp) {
      pendingDeepLink.current = matchingDeepLinkedApp.id;
    }

    if (hasInitialized.current) return;
    if (!sessionId && !publicAppBypass) return;
    if (viewingLanding) return;
    // Public research surveys open without a role or session.
    const requestedPublicSurvey = (() => {
      const urlAppParam = new URLSearchParams(window.location.search).get('app') || (window as any).__DEEP_LINK_APP_ID__ || initialAppId;
      const deepLinkId = hash || urlAppParam?.toLowerCase() || '';
      return PUBLIC_SURVEY_APP_IDS.has(deepLinkId);
    })();
    if (mode === 'customer' && !userRole && !requestedPublicSurvey) return;

    hasInitialized.current = true;

    const urlAppParam = new URLSearchParams(window.location.search).get('app') || (window as any).__DEEP_LINK_APP_ID__ || initialAppId;

    const deepLinkId = hash || urlAppParam?.toLowerCase() || '';

    if (deepLinkId) {
      const matchingApp = config.apps.find(
        app => app.id.toLowerCase() === deepLinkId || app.name.toLowerCase() === deepLinkId
      );

      // Only honour the deep link if this role is allowed to open that app.
      if (matchingApp && isAppAllowed(matchingApp.id)) {
        setActiveWindowId(matchingApp.id);
        setIsAgentMinimized(true);
        return;
      }

      if (deepLinkId === 'files' || deepLinkId === 'memory') {
        setActiveWindowId('files');
        setIsAgentMinimized(true);
        return;
      }

      if (deepLinkId === 'settings') {
        setActiveWindowId('settings');
        setIsAgentMinimized(true);
        return;
      }
    }

    // Land each role directly in their own app: students → Scout,
    // universities → Alma. Falls back to the first visible app.
    const defaultApp = visibleApps[0] || config.apps[0];
    if (defaultApp) {
      setActiveWindowId(defaultApp.id);
      setIsAgentMinimized(true);
      return;
    }
  }, [sessionId, config.apps, isMobile, userRole, mode]);

  // Update URL hash when active window changes (mark as internal to prevent agent minimizing)
  useEffect(() => {
    if (activeWindowId && activeWindowId !== 'agent') {
      const currentHash = window.location.hash.slice(1);
      if (currentHash !== activeWindowId) {
        isInternalHashChange.current = true;
        window.location.hash = activeWindowId;
        // Reset flag after hash update completes
        setTimeout(() => {
          isInternalHashChange.current = false;
        }, 0);
      }
    } else if (activeWindowId === 'agent' || activeWindowId === null) {
      // Clear hash for both agent and null (empty desktop)
      if (window.location.hash) {
        isInternalHashChange.current = true;
        window.location.hash = '';
        setTimeout(() => {
          isInternalHashChange.current = false;
        }, 0);
      }
    }
  }, [activeWindowId]);

  // After login, replace auth history entries so browser back from Scout/Alma
  // lands on a fresh landing page load — not a stale bfcache snapshot.
  const hasNormalizedPostAuthHistory = useRef(false);
  useEffect(() => {
    if (!sessionId || !userRole || hasNormalizedPostAuthHistory.current) return;
    if (mode !== 'customer') return;

    const pendingAppId = pendingDeepLink.current;
    const pendingApp = pendingAppId
      ? config.apps.find((app) => app.id === pendingAppId)
      : undefined;
    const canOpenPendingApp = !!pendingApp && isAppAllowed(pendingApp.id);
    const appId = canOpenPendingApp ? pendingApp.id : visibleApps[0]?.id;
    if (!appId) return;

    hasNormalizedPostAuthHistory.current = true;
    const cleanPath = window.location.pathname.split('#')[0] || '/';
    const bust = `v=${DESKTOP_VERSION}`;
    const landingUrl = `${cleanPath}?${bust}`;
    const appUrl = `${cleanPath}?${bust}#${appId}`;
    window.history.replaceState({ view: 'landing', v: DESKTOP_VERSION }, '', landingUrl);
    isInternalHashChange.current = true;
    window.history.pushState({ view: 'app', appId, v: DESKTOP_VERSION }, '', appUrl);
    if (canOpenPendingApp && pendingApp) {
      setViewingLanding(false);
      setActiveWindowId(pendingApp.id);
      setIsAgentMinimized(true);
    }
    pendingDeepLink.current = null;
    setTimeout(() => { isInternalHashChange.current = false; }, 0);
  }, [sessionId, userRole, mode, visibleApps]);

  // Reload when Safari/Firefox restore a stale bfcache snapshot (old landing page).
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // popstate: back from app hash → landing history entry (live marketing page).
  useEffect(() => {
    const handlePopState = () => {
      const state = window.history.state as { view?: string; appId?: string } | null;
      const hash = window.location.hash.slice(1).toLowerCase();

      if (!hash && state?.view === 'landing') {
        setViewingLanding(true);
        setActiveWindowId(null);
        setIsAgentMinimized(true);
        return;
      }

      if (state?.view === 'app' || hash) {
        setViewingLanding(false);
        if (hash) {
          const matchingApp = config.apps.find(
            app => app.id.toLowerCase() === hash || app.name.toLowerCase() === hash
          );
          if (matchingApp && isAppAllowed(matchingApp.id)) {
            setActiveWindowId(matchingApp.id);
            setIsAgentMinimized(true);
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [config.apps, userRole, mode]);

  // Listen for browser back/forward navigation via hash changes
  useEffect(() => {
    const handleHashChange = () => {
      // Skip if this was an internal hash change (UI navigation)
      if (isInternalHashChange.current) {
        return;
      }

      const hash = window.location.hash.slice(1).toLowerCase();

      if (!hash) {
        // Browser back from Scout/Alma — show the current landing page in-app.
        if (mode === 'customer' && sessionId) {
          setViewingLanding(true);
          setActiveWindowId(null);
          setIsAgentMinimized(true);
          return;
        }
        setActiveWindowId(null);
        setIsAgentMinimized(true);
        return;
      }

      // Try to find matching app
      const matchingApp = config.apps.find(
        app => app.id.toLowerCase() === hash || app.name.toLowerCase() === hash
      );

      // Gate against role: ignore hashes pointing at apps this role can't see.
      if (matchingApp && isAppAllowed(matchingApp.id)) {
        setActiveWindowId(matchingApp.id);
        // Only minimize agent for external hash changes (deep links, browser history)
        setIsAgentMinimized(true);
        return;
      }
      if (matchingApp && !isAppAllowed(matchingApp.id)) {
        // Not allowed for this role — bounce back to their own app.
        setActiveWindowId(visibleApps[0]?.id ?? null);
        setIsAgentMinimized(true);
        return;
      }

      // Check for special windows
      if (hash === 'files' || hash === 'memory') {
        setActiveWindowId('files');
        setIsAgentMinimized(true);
        return;
      }

      if (hash === 'settings') {
        setActiveWindowId('settings');
        setIsAgentMinimized(true);
        return;
      }

      // Invalid hash - return to launcher mode
      setActiveWindowId(null);
      setIsAgentMinimized(true);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [config.apps, userRole, mode, sessionId, spaceId]);

  // Listen for app deep-link events from agent chat
  useEffect(() => {
    const handleOpenApp = (event: CustomEvent) => {
      const { appId } = event.detail;
      if (appId && isAppAllowed(appId)) {
        setActiveWindowId(appId);
        setIsAgentMinimized(false); // Show agent in split view if minimized
      }
    };

    window.addEventListener('openApp', handleOpenApp as EventListener);
    return () => window.removeEventListener('openApp', handleOpenApp as EventListener);
  }, [userRole, mode]);

  // Listen for closeApp events dispatched by mini-apps (e.g. VoiceBuddy)
  useEffect(() => {
    const handleCloseApp = () => {
      setActiveWindowId(null);
      setIsAgentMinimized(true);
    };

    window.addEventListener('closeApp', handleCloseApp as EventListener);
    return () => window.removeEventListener('closeApp', handleCloseApp as EventListener);
  }, []);

  // Keyboard shortcut: Cmd+M (Mac) / Ctrl+M (Windows) to toggle Memory window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (activeWindowId === 'files') {
          setActiveWindowId(null);
        } else {
          setActiveWindowId('files');
          setIsAgentMinimized(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWindowId]);

  const handleFileAccess = (log: FileAccessLog) => {
    setFileAccessLogs(prev => [...prev, log]);
  };

  // Get current app config and component if viewing an app
  const isAppWindow = activeWindowId && !['files', 'agent'].includes(activeWindowId);
  const currentAppConfig = isAppWindow ? config.apps.find(app => app.id === activeWindowId) : null;
  const CurrentApp = isAppWindow && activeWindowId ? apps[activeWindowId] : null;

  const isStudentImmersive =
    activeWindowId === 'fit-shortlist' &&
    (mode === 'entrepreneur' || (mode === 'customer' && userRole === 'student')) &&
    !!CurrentApp &&
    !!currentAppConfig;

  const isUniversityImmersive =
    activeWindowId === 'prospect-radar' &&
    (mode === 'entrepreneur' || (mode === 'customer' && (userRole === 'university' || userRole === 'company'))) &&
    !!CurrentApp &&
    !!currentAppConfig;

  const agentDisplayName = userRole === 'university' || userRole === 'company' ? 'Alma' : 'Scout';

  const isPublicSurveyImmersive =
    !!activeWindowId &&
    PUBLIC_SURVEY_APP_IDS.has(activeWindowId) &&
    !!CurrentApp &&
    !!currentAppConfig;

  const runtimeTheme = resolveGenesisRuntimeTheme(config);
  const themeVariables = (runtimeTheme.themeTokens.cssVariables || {}) as Record<string, string>;
  const rootStyle = {
    ...themeVariables,
    ['--space-font-family' as any]:
      runtimeTheme.themeTokens.typography?.fontFamily ||
      `"${runtimeTheme.themeTokens.typography?.headingFont || 'Sora'}", system-ui, -apple-system, sans-serif`,
    fontFamily:
      runtimeTheme.themeTokens.typography?.fontFamily ||
      `"${runtimeTheme.themeTokens.typography?.headingFont || 'Sora'}", system-ui, -apple-system, sans-serif`,
    background:
      runtimeTheme.themeTokens.shell?.pageBackground ||
      `linear-gradient(135deg, var(--space-surface-gradient-from), var(--space-surface-gradient-via), var(--space-surface-gradient-to))`,
  } as React.CSSProperties;

  const brandFontName =
    runtimeTheme.themeTokens.typography?.bodyFont ||
    runtimeTheme.themeTokens.typography?.headingFont ||
    'Sora';
  const brandFontFamily =
    runtimeTheme.themeTokens.typography?.fontFamily || buildFontFamily(brandFontName);

  useLayoutEffect(() => {
    // The generated document preloads Google Fonts with display=optional. On a
    // cold production visit that is allowed to keep the system fallback for the
    // whole page. Promote the same built font request to display=swap and bind
    // it at document level so the gate, shell, Scout, and form controls all use
    // the configured family after one normal build (no Tailwind runtime CDN).
    document.documentElement.style.setProperty('--space-font-family', brandFontFamily);
    document.body.style.fontFamily = brandFontFamily;
  }, [brandFontFamily]);

  // Show brief loading indicator while post-checkout auto-session is being established
  if (isBootstrappingSession) {
    return (
      <div
        style={{ background: `linear-gradient(135deg, var(--space-surface-gradient-from), var(--space-surface-gradient-via), var(--space-surface-gradient-to))` } as React.CSSProperties}
        className="fixed inset-0 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 opacity-70">
          {LoadingSpinner ? <LoadingSpinner /> : <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />}
          <span className="text-sm" style={{ color: 'var(--space-text-secondary)' }}>Setting up your account…</span>
        </div>
      </div>
    );
  }

  // Signed-in user pressed back — show the live marketing landing (not a stale snapshot).
  if (mode === 'customer' && sessionId && viewingLanding) {
    return (
      <EmailGate
        spaceId={spaceId}
        branding={runtimeTheme.branding}
        themeTokens={runtimeTheme.themeTokens}
      />
    );
  }

  // Show email gate if no session in customer mode
  if (showEmailGate) {
    return (
      <EmailGate
        spaceId={spaceId}
        branding={runtimeTheme.branding}
        themeTokens={runtimeTheme.themeTokens}
      />
    );
  }

  // Block rendering until subscription status resolves to prevent
  // flashing protected dashboard content before the access check redirects.
  // Falls through after 8s timeout to prevent infinite spinner.
  if (mode === 'customer' && sessionId && !subscriptionReady && !subscriptionTimedOut && !publicAppBypass) {
    return (
      <div
        style={{ background: `linear-gradient(135deg, var(--space-surface-gradient-from), var(--space-surface-gradient-via), var(--space-surface-gradient-to))` } as React.CSSProperties}
        className="fixed inset-0 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 opacity-70">
          {LoadingSpinner ? <LoadingSpinner /> : <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />}
        </div>
      </div>
    );
  }

  // Immersive public survey mode: full-viewport research forms with zero desktop chrome.
  if (isPublicSurveyImmersive && CurrentApp && currentAppConfig) {
    return (
      <>
        <div className="h-screen w-full flex flex-col" style={rootStyle}>
          <div className="flex-1 min-h-0 flex flex-col">
            <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
              <Suspense fallback={<LoadingSpinner />}>
                <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
              </Suspense>
            </AppErrorBoundary>
          </div>
        </div>
        <SupportWidget appId={currentAppConfig.id} appName={currentAppConfig.name} />
      </>
    );
  }

  // Immersive student mode: full-viewport Scout with zero desktop chrome.
  if (isStudentImmersive && CurrentApp && currentAppConfig) {
    return (
      <>
        <div className="h-screen w-full flex flex-col" style={rootStyle}>
          <div className="flex-1 min-h-0 flex flex-col">
            <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
              <Suspense fallback={<LoadingSpinner />}>
                <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
              </Suspense>
            </AppErrorBoundary>
          </div>
        </div>
        <SupportWidget appId={currentAppConfig.id} appName={currentAppConfig.name} />
      </>
    );
  }

  // Immersive university mode: full-viewport Alma with zero desktop chrome.
  if (isUniversityImmersive && CurrentApp && currentAppConfig) {
    return (
      <>
        <div className="h-screen w-full flex flex-col" style={rootStyle}>
          <div className="flex-1 min-h-0 flex flex-col">
            <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
              <Suspense fallback={<LoadingSpinner />}>
                <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
              </Suspense>
            </AppErrorBoundary>
          </div>
        </div>
        <SupportWidget appId={currentAppConfig.id} appName={currentAppConfig.name} />
      </>
    );
  }

  // Entrepreneur preview at root: same marketing landing as customer/space view.
  if (showMarketingLanding) {
    return (
      <EmailGate
        spaceId={spaceId}
        branding={runtimeTheme.branding}
        themeTokens={runtimeTheme.themeTokens}
      />
    );
  }

  return (
    <>
      {/* Brand fonts are loaded once by the platform-generated document head. */}

      <div 
        className="min-h-screen"
        style={rootStyle}
      >
        {/* Left Dock - Desktop Only - Animates away in launcher mode */}
      <div className={`hidden md:flex fixed top-1/2 -translate-y-1/2 ${tw.dock.glass} p-4 z-50 transition-all duration-500 ease-in-out ${
        isLauncherMode
          ? '-left-24 opacity-0'
          : 'left-4 opacity-100'
      }`}>
        <div className="flex flex-col gap-3">
          {/* Memory Icon - Hidden in customer mode (use Cmd+M to access for debugging) */}
          {mode === 'entrepreneur' && (
            <button
              onClick={() => setActiveWindowId('files')}
              className={`p-3 rounded-xl transition-all ${
                activeWindowId === 'files' ? tw.dock.active : tw.dock.inactive
              }`}
              title="Memory"
            >
              <Folder className="w-6 h-6" />
            </button>
          )}

          {/* App Icons */}
          {visibleApps.map(app => {
            const isActive = activeWindowId === app.id;
            const IconComponent = app.icon && iconMap[app.icon] ? iconMap[app.icon] : Activity;
            return (
              <button
                key={app.id}
                onClick={() => openApp(app.id)}
                className={`p-3 rounded-xl transition-all ${
                  isActive ? tw.dock.active : tw.dock.inactive
                }`}
                title={app.name}
              >
                <IconComponent className="w-6 h-6" />
              </button>
            );
          })}

          {/* Settings — entrepreneur preview only */}
          {mode === 'entrepreneur' && (
            <>
              <div className="h-px bg-[var(--space-border-strong)] my-1"></div>
              <button
                onClick={() => setActiveWindowId('settings')}
                className={`p-3 rounded-xl transition-all ${
                  activeWindowId === 'settings' ? tw.dock.active : tw.dock.inactive
                }`}
                title="Settings"
              >
                <SettingsIcon className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Desktop: Main Content Area */}
      <div className="hidden md:block py-16 min-h-screen">
        {/* App Launcher Grid - Shows when in launcher mode */}
        {isLauncherMode && (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] px-6 animate-in fade-in duration-500">
            {/* Branding */}
            {runtimeTheme.branding.name && (
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-[var(--space-text-brand)] mb-2">
                  {runtimeTheme.branding.name}
                </h1>
                {runtimeTheme.branding.tagline && (
                  <p className="text-lg text-[var(--space-text-secondary)]">
                    {runtimeTheme.branding.tagline}
                  </p>
                )}
              </div>
            )}

            {/* App Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-4xl">
              {/* App Cards */}
              {visibleApps.map(app => {
                const IconComponent = app.icon && iconMap[app.icon] ? iconMap[app.icon] : Activity;
                return (
                  <button
                    key={app.id}
                    onClick={() => {
                      openApp(app.id);
                      setIsAgentMinimized(true);
                    }}
                    className="group flex flex-col items-center p-6 bg-[var(--space-surface-panel)] backdrop-blur-md rounded-2xl border border-[var(--space-border-default)] shadow-[0_14px_34px_var(--space-shell-shadow)] hover:bg-[var(--space-surface-panel-strong)] hover:shadow-[0_18px_44px_var(--space-shell-shadow-strong)] hover:scale-105 transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-16 h-16 flex items-center justify-center bg-[var(--space-surface-accent-soft)] rounded-2xl mb-4 group-hover:brightness-95 transition-colors">
                      <IconComponent className={`w-8 h-8 ${tw.appIcon.active}`} />
                    </div>
                    <h3 className="text-base font-semibold text-[var(--space-text-primary)] mb-1">{app.name}</h3>
                    <p className="text-xs text-[var(--space-text-secondary)] text-center line-clamp-2">
                      {app.description || `Open ${app.name}`}
                    </p>
                  </button>
                );
              })}

              {/* Memory Card - Hidden in customer mode (use Cmd+M to access for debugging) */}
              {mode === 'entrepreneur' && (
                <button
                  onClick={() => {
                    setActiveWindowId('files');
                    setIsAgentMinimized(true);
                  }}
                  className="group flex flex-col items-center p-6 bg-[var(--space-surface-panel)] backdrop-blur-md rounded-2xl border border-[var(--space-border-default)] shadow-[0_14px_34px_#b3eaf4] hover:bg-[var(--space-surface-panel-strong)] hover:shadow-[0_18px_44px_#8fe0ee] hover:scale-105 transition-all duration-300 cursor-pointer"
                >
                  <div className="w-16 h-16 flex items-center justify-center bg-[var(--space-surface-accent-soft)] rounded-2xl mb-4 group-hover:brightness-95 transition-colors">
                    <Folder className={`w-8 h-8 ${tw.appIcon.files}`} />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--space-text-primary)] mb-1">Memory</h3>
                  <p className="text-xs text-[var(--space-text-secondary)] text-center line-clamp-2">
                    Browse files and data
                  </p>
                </button>
              )}

              {/* Settings Card — entrepreneur preview only. Customers reach
                  settings via the small dock icon so it isn't a prominent tile. */}
              {mode === 'entrepreneur' && (
                <button
                  onClick={() => {
                    setActiveWindowId('settings');
                    setIsAgentMinimized(true);
                  }}
                  className="group flex flex-col items-center p-6 bg-[var(--space-surface-panel)] backdrop-blur-md rounded-2xl border border-[var(--space-border-default)] shadow-[0_14px_34px_#b3eaf4] hover:bg-[var(--space-surface-panel-strong)] hover:shadow-[0_18px_44px_#8fe0ee] hover:scale-105 transition-all duration-300 cursor-pointer"
                >
                  <div className="w-16 h-16 flex items-center justify-center bg-[var(--space-surface-muted)] rounded-2xl mb-4 group-hover:brightness-95 transition-colors">
                    <SettingsIcon className={`w-8 h-8 ${tw.appIcon.settings}`} />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--space-text-primary)] mb-1">Settings</h3>
                  <p className="text-xs text-[var(--space-text-secondary)] text-center line-clamp-2">
                    Configure your workspace
                  </p>
                </button>
              )}
            </div>

            {/* Floating Chat Input - ChatGPT style */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
              <div className="flex flex-col items-center gap-3">
                {/* View Chat Button - positioned above input with upward arrow only */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveWindowId('agent');
                    setIsAgentMinimized(false);
                  }}
                  className={`p-3 ${tw.agent.fab} rounded-full shadow-[0_14px_34px_#b3eaf4] hover:shadow-[0_18px_44px_#8fe0ee] hover:scale-110 active:scale-95 transition-all duration-300 ease-out`}
                  title="View conversation"
                >
                  <ChevronUp className="w-5 h-5 transition-transform duration-300 group-hover:-translate-y-0.5" />
                </button>

                {/* Main input form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (launcherMessage.trim()) {
                      setPendingAgentMessage(launcherMessage.trim());
                      setLauncherMessage('');
                      setActiveWindowId('agent');
                      setIsAgentMinimized(false);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 bg-[var(--space-surface-panel-strong)] backdrop-blur-md rounded-2xl border border-[var(--space-border-default)] shadow-[0_18px_44px_#8fe0ee] hover:shadow-[0_22px_56px_var(--space-shell-shadow-strong)] hover:brightness-95 transition-all duration-300"
                >
                  <Bot className={`w-5 h-5 ${tw.agent.icon} flex-shrink-0`} />
                  <input
                    type="text"
                    value={launcherMessage}
                    onChange={(e) => setLauncherMessage(e.target.value)}
                    placeholder={hasChatHistory ? "Continue your conversation..." : "Ask me anything..."}
                    className="flex-1 bg-transparent text-sm text-[var(--space-text-primary)] placeholder:text-[var(--space-text-muted)] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!launcherMessage.trim()}
                    className={`p-2 rounded-lg transition-all ${
                      launcherMessage.trim()
                        ? `${tw.button.brand}`
                        : 'bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] cursor-not-allowed'
                    }`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Normal window layout */}
        {!isLauncherMode && (
        <>
        <div className="flex items-center justify-center gap-6 px-6">
          {/* App Window - LEFT side, slides in when selected */}
          {activeWindowId && activeWindowId !== 'agent' && (
            <div
              className={`min-w-0 h-[calc(100vh-8rem)] transition-all duration-500 ease-in-out ${
                isAgentMinimized
                  ? 'w-full max-w-3xl'
                  : 'w-full max-w-xl'
              }`}
            >
              <div className="w-full h-full flex flex-col bg-[var(--space-surface-card)] rounded-2xl shadow-[0_22px_56px_#8fe0ee] overflow-hidden">
                {/* App Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--space-border-default)]">
                  <div className="flex items-center gap-2">
                    {activeWindowId === 'files' && (
                      <>
                        <Folder className={`w-4 h-4 ${tw.icon.primary}`} />
                        <span className="text-sm font-semibold text-[var(--space-text-primary)]">Memory</span>
                      </>
                    )}
                    {activeWindowId === 'settings' && (
                      <>
                        <SettingsIcon className={`w-4 h-4 ${tw.icon.neutral}`} />
                        <span className="text-sm font-semibold text-[var(--space-text-primary)]">Settings</span>
                      </>
                    )}
                    {isAppWindow && currentAppConfig && (
                      <>
                        {(() => {
                          const IconComponent = currentAppConfig.icon && iconMap[currentAppConfig.icon] ? iconMap[currentAppConfig.icon] : Activity;
                          return <IconComponent className={`w-4 h-4 ${tw.icon.accent}`} />;
                        })()}
                        <span className="text-sm font-semibold text-[var(--space-text-primary)]">{currentAppConfig.name}</span>
                      </>
                    )}
                  </div>
                  {mode === 'entrepreneur' && (
                    <button
                      onClick={() => {
                        // When closing window, show empty desktop
                        setActiveWindowId(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)] rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  )}
                </div>
                {/* App Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {activeWindowId === 'files' && (
                    <FileBrowser fileAccessLogs={fileAccessLogs} />
                  )}
                  {activeWindowId === 'settings' && (
                    <Settings spaceId={spaceId} />
                  )}
                  {isAppWindow && CurrentApp && currentAppConfig && (
                    <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
                      <Suspense fallback={<LoadingSpinner />}>
                        <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
                      </Suspense>
                    </AppErrorBoundary>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Agent Window - RIGHT side, always visible unless minimized */}
          {/* Only render on desktop (not mobile) to prevent double-mounting */}
          {!isAgentMinimized && !isMobile && (
            <div
              className={`min-w-0 h-[calc(100vh-8rem)] transition-all duration-500 ease-in-out ${
                activeWindowId && activeWindowId !== 'agent'
                  ? 'w-full max-w-xl'
                  : 'w-full max-w-3xl'
              }`}
            >
              <div className="w-full h-full flex flex-col bg-[var(--space-surface-card)] rounded-2xl shadow-[0_22px_56px_#8fe0ee] overflow-hidden">
                {/* Agent Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--space-border-default)]">
                  <div className="flex items-center gap-2">
                    <Bot className={`w-4 h-4 ${tw.icon.accent}`} />
                    <span className="text-sm font-semibold text-[var(--space-text-primary)]">{agentDisplayName}</span>
                  </div>
                  <button
                    onClick={() => setIsAgentMinimized(true)}
                    className="p-1.5 hover:bg-[var(--space-surface-muted)] rounded-lg transition-colors"
                    title="Minimize"
                  >
                    <Minus className="w-4 h-4 text-[var(--space-text-secondary)]" />
                  </button>
                </div>
                {/* Agent Content */}
                <div className="flex-1 overflow-hidden">
                  <AgentChat
                  spaceId={spaceId}
                  onFileAccess={handleFileAccess}
                  pendingMessage={pendingAgentMessage}
                  onPendingMessageConsumed={() => setPendingAgentMessage(null)}
                />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Restore Agent Button - entrepreneur preview only */}
        {isAgentMinimized && mode === 'entrepreneur' && (
          <button
            onClick={() => setIsAgentMinimized(false)}
            className={`fixed bottom-8 right-8 flex items-center gap-2 px-4 py-3 ${tw.agent.fab} rounded-full shadow-[0_14px_34px_#b3eaf4] transition-all hover:scale-105 z-50`}
          >
            <Bot className="w-5 h-5" />
            <span className="text-sm font-medium">Chat with {agentDisplayName}</span>
          </button>
        )}
        </>
        )}
      </div>

      {/* Mobile: Vertical Stack Layout */}
      <div className="md:hidden fixed inset-0 flex flex-col pb-16 overflow-hidden">
        {/* Main Content - Agent or App */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Agent View */}
          {/* Only render on mobile to prevent double-mounting */}
          {(!activeWindowId || activeWindowId === 'agent') && isMobile && mode === 'entrepreneur' && (
            <div className="h-full flex flex-col bg-[var(--space-surface-card)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--space-border-default)]">
                <div className="flex items-center gap-2">
                  <Bot className={`w-4 h-4 ${tw.agent.headerIcon}`} />
                  <span className="text-sm font-semibold text-[var(--space-text-primary)]">{agentDisplayName}</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <AgentChat
                  spaceId={spaceId}
                  onFileAccess={handleFileAccess}
                  pendingMessage={pendingAgentMessage}
                  onPendingMessageConsumed={() => setPendingAgentMessage(null)}
                />
              </div>
            </div>
          )}

          {/* App View */}
          {activeWindowId && activeWindowId !== 'agent' && (
            <div className="h-full flex flex-col bg-[var(--space-surface-card)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--space-border-default)]">
                <div className="flex items-center gap-2">
                  {activeWindowId === 'files' && (
                    <>
                      <Folder className={`w-4 h-4 ${tw.appIcon.files}`} />
                      <span className="text-sm font-semibold text-[var(--space-text-primary)]">Memory</span>
                    </>
                  )}
                  {activeWindowId === 'settings' && (
                    <>
                      <SettingsIcon className={`w-4 h-4 ${tw.appIcon.settings}`} />
                      <span className="text-sm font-semibold text-[var(--space-text-primary)]">Settings</span>
                    </>
                  )}
                  {isAppWindow && currentAppConfig && (
                    <>
                      {(() => {
                        const IconComponent = currentAppConfig.icon && iconMap[currentAppConfig.icon] ? iconMap[currentAppConfig.icon] : Activity;
                        return <IconComponent className={`w-4 h-4 ${tw.appIcon.active}`} />;
                      })()}
                      <span className="text-sm font-semibold text-[var(--space-text-primary)]">{currentAppConfig.name}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {activeWindowId === 'files' && (
                  <FileBrowser fileAccessLogs={fileAccessLogs} />
                )}
                {activeWindowId === 'settings' && (
                  <Settings spaceId={spaceId} />
                )}
                {isAppWindow && CurrentApp && currentAppConfig && (
                  <AppErrorBoundary key={currentAppConfig.id} appName={currentAppConfig.name}>
                    <Suspense fallback={<LoadingSpinner />}>
                      <CurrentApp appConfig={currentAppConfig} dataFile={currentAppConfig.dataFile || ''} />
                    </Suspense>
                  </AppErrorBoundary>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Dock - Fixed to bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--space-surface-card)] border-t border-[var(--space-border-default)] px-3 py-2 safe-bottom">
          <div className="flex items-center justify-center gap-1">
            {/* Files Icon - Hidden in customer mode (use Cmd+M to access for debugging) */}
            {mode === 'entrepreneur' && (
              <button
                onClick={() => setActiveWindowId('files')}
                className={`p-2.5 rounded-xl transition-all ${
                  activeWindowId === 'files'
                    ? 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]'
                    : 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                }`}
              >
                <Folder className="w-5 h-5" />
              </button>
            )}

            {/* App Icons */}
            {visibleApps.map(app => {
              const isActive = activeWindowId === app.id;
              const IconComponent = app.icon && iconMap[app.icon] ? iconMap[app.icon] : Activity;
              return (
                <button
                  key={app.id}
                  onClick={() => openApp(app.id)}
                  className={`p-2.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-[var(--space-brand-primary)] text-[var(--space-shell-dock-text)]'
                      : 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                  }`}
                >
                  <IconComponent className="w-5 h-5" />
                </button>
              );
            })}

            {/* Settings — entrepreneur preview only */}
            {mode === 'entrepreneur' && (
              <button
                onClick={() => setActiveWindowId('settings')}
                className={`p-2.5 rounded-xl transition-all ${
                  activeWindowId === 'settings'
                    ? 'bg-[var(--space-brand-primary)] text-[var(--space-shell-dock-text)]'
                    : 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                }`}
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            )}

            {/* Spacer to push chat to the right */}
            <div className="flex-1"></div>

            {/* Agent chat — entrepreneur preview only; customers use Scout/Alma apps */}
            {mode === 'entrepreneur' && (
              <button
                onClick={() => {
                  setActiveWindowId('agent');
                  setIsAgentMinimized(false);
                }}
                className={`p-2.5 rounded-xl transition-all ${
                  (!activeWindowId || activeWindowId === 'agent')
                    ? tw.agent.dockActive
                    : tw.agent.dockInactive
                }`}
              >
                <Bot className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
      {currentAppConfig && CurrentApp && (
        <SupportWidget appId={currentAppConfig.id} appName={currentAppConfig.name} />
      )}
    </>
  );
}

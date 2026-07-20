import { useState, useEffect, useRef } from 'react';
import { Menu, X, ArrowRight, GraduationCap, Radar, CheckCircle2 } from 'lucide-react';
import { useSpaceRuntime } from '../SpaceRuntimeContext';
import type { DesktopThemeTokens } from '../types';

// Version marker for auto-upgrade detection
// Increment this when making breaking changes that stale copies need
export const EMAIL_GATE_VERSION = 119; // v119: removed Advisor or Parent role — student + university only

type GateStep = 'loading' | 'landing' | 'code' | 'complete';
type AuthMode = 'login' | 'signup';
type AuthRoute =
  | '/auth'
  | '/student/signin'
  | '/student/signup'
  | '/university/signin'
  | '/university/signup';

const AUTH_ROUTES: AuthRoute[] = [
  '/auth',
  '/student/signin',
  '/student/signup',
  '/university/signin',
  '/university/signup',
];

function getWorkspaceBasePath(): string {
  if (typeof window === 'undefined') return '';
  let path = window.location.pathname.replace(/\/$/, '') || '';
  for (const route of AUTH_ROUTES) {
    if (path.endsWith(route)) {
      path = path.slice(0, -route.length) || '';
      break;
    }
  }
  return path;
}

function parseAuthRouteFromLocation(): AuthRoute | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  for (const route of AUTH_ROUTES) {
    if (path.endsWith(route)) return route;
  }
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  const auth = params.get('auth');
  if (role === 'student' && auth === 'login') return '/student/signin';
  if (role === 'student' && auth === 'signup') return '/student/signup';
  if (role === 'university' && auth === 'login') return '/university/signin';
  if (role === 'university' && auth === 'signup') return '/university/signup';
  if (auth === 'login' || auth === 'signup') return '/auth';
  return null;
}

function buildAuthUrl(route: AuthRoute | '/'): string {
  const base = getWorkspaceBasePath();
  const url = new URL(window.location.href);
  url.pathname = route === '/' ? (base || '/') : `${base}${route}`;
  url.searchParams.delete('role');
  url.searchParams.delete('auth');
  url.hash = '';
  return url.pathname + url.search;
}

function navigateGateRoute(route: AuthRoute | '/', replace = false) {
  const url = buildAuthUrl(route);
  const state = { gateRoute: route, gateVersion: EMAIL_GATE_VERSION };
  if (replace) {
    window.history.replaceState(state, '', url);
  } else {
    window.history.pushState(state, '', url);
  }
}

function routeToRole(route: AuthRoute): 'student' | 'university' | null {
  if (route.startsWith('/student')) return 'student';
  if (route.startsWith('/university')) return 'university';
  return null;
}

function routeToAuthMode(route: AuthRoute): AuthMode {
  return route.endsWith('/signup') ? 'signup' : 'login';
}

type ParsedResponseBody = { data: unknown; rawText: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Parses a fetch Response body safely so a 5xx HTML page (proxy timeout,
// memory-crash restart, etc.) does not throw inside `response.json()` and
// get swallowed into the generic "Connection error" copy. Always returns
// an object instead of throwing — callers inspect `response.ok` themselves.
async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    return { data: null, rawText: '' };
  }

  if (!rawText) {
    return { data: null, rawText: '' };
  }

  try {
    return { data: JSON.parse(rawText) as unknown, rawText };
  } catch {
    return { data: null, rawText };
  }
}

// Pick the most informative error message we can show to the user given
// what came back over the wire. Server-provided `error` always wins; for
// unparseable / non-JSON responses we expose the HTTP status so the bug
// is debuggable instead of being hidden behind "Connection error".
function describeResponseFailure(
  response: Response,
  body: unknown,
  rawText: string,
  fallback: string,
): string {
  if (isRecord(body)) {
    const errField = body.error;
    if (typeof errField === 'string' && errField.trim()) return errField;
    const msgField = body.message;
    if (typeof msgField === 'string' && msgField.trim()) return msgField;
  }

  const status = response.status;
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is temporarily unavailable. Please try again in a moment.';
  }
  if (status >= 500) return `Server error (${status}). Please try again.`;
  if (status === 404) return 'This space could not be found. Please contact support.';
  if (status === 403) return 'This email is not authorized to access this space.';
  if (status === 400 && rawText) {
    // Sometimes the server returns a plain text 400; surface a trimmed copy
    const snippet = rawText.trim().slice(0, 140);
    if (snippet) return snippet;
  }

  return fallback;
}

// Snapshot of the JSON envelope returned by /api/space/:spaceId/register.
// All fields are optional because the server has historically added/removed
// keys; the client narrows individually before use.
interface SpaceRegisterResponseBody {
  success?: boolean;
  workspaceSessionId?: string;
  contactId?: string;
  email?: string;
  isReturningUser?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  visitorId?: string | null;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

// Snapshot of the JSON envelope returned by /api/auth/otp/space/{send,verify}.
interface OtpResponseBody {
  success?: boolean;
  resendCooldown?: number;
  attemptsRemaining?: number;
  expiresIn?: number;
}

interface EmailGateProps {
  spaceId: string;
  branding?: {
    name?: string;
    tagline?: string;
    logoUrl?: string;
  };
  themeTokens?: DesktopThemeTokens;
}

// Landing page always shows Scout & Alma branding (student Scout · university Alma).
const LANDING_BRAND_NAME = 'Scout & Alma';
const LANDING_PRODUCT_LINE = 'Scout for students · Alma for universities';
const LANDING_TAGLINE =
  'Scout helps students find their fit. Alma helps universities reach matched prospects.';

function sanitizeLegacyBrandName(_name?: string | null): string {
  return LANDING_BRAND_NAME;
}

function sanitizeLegacyTagline(_tagline?: string | null): string {
  return LANDING_TAGLINE;
}

// Roles a visitor can sign up as. Stored under `space_role_<spaceId>` and read
// by the Desktop shell to drive the completely separate student / university
// experiences.
const ROLE_OPTIONS = [
  {
    id: 'student',
    title: "I’m a Student",
    desc: 'Find universities that fit your goals, budget, and plans',
    emoji: '🎓',
  },
  {
    id: 'university',
    title: "I’m a University",
    desc: 'Discover and reach students who match your programs',
    emoji: '📡',
  },
] as const;

type WaitlistRole = 'student' | 'university';

const WAITLIST_TAG_BY_ROLE: Record<WaitlistRole, string> = {
  student: 'waitlist-student',
  university: 'waitlist-university',
};

const VALID_WAITLIST_ROLES = new Set<string>(Object.keys(WAITLIST_TAG_BY_ROLE));

// Apply the waitlist segment tag to a newly created contact so CRM boosters
// route the correct welcome sequence. Best-effort — signup must not fail if tagging does.
async function applyWaitlistTag(
  contactId: string | null | undefined,
  selectedRole: string | null,
  wsId: string | null,
): Promise<void> {
  if (!contactId || !wsId || !selectedRole || !VALID_WAITLIST_ROLES.has(selectedRole)) return;

  const tagName = WAITLIST_TAG_BY_ROLE[selectedRole as WaitlistRole];
  try {
    const tagsRes = await fetch(`/api/workspace-tags/${wsId}`);
    if (!tagsRes.ok) {
      console.warn('[EmailGate] Failed to list workspace tags for waitlist tagging', tagsRes.status);
      return;
    }
    const tagsBody = await tagsRes.json();
    const tags: Array<{ id: string; name: string }> = Array.isArray(tagsBody.tags) ? tagsBody.tags : [];
    let tagId = tags.find((t) => t.name === tagName)?.id;

    if (!tagId) {
      const createRes = await fetch(`/api/workspace-tags/${wsId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tagName, color: '#00b8d9' }),
      });
      if (!createRes.ok) {
        console.warn('[EmailGate] Failed to create waitlist tag', tagName, createRes.status);
        return;
      }
      const createBody = await createRes.json();
      tagId = createBody?.tag?.id;
    }

    if (!tagId) return;

    const applyRes = await fetch(
      `/api/entity-tags/contacts/${contactId}/tags?workspaceId=${encodeURIComponent(wsId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, propagateToSessions: true }),
      },
    );
    if (!applyRes.ok) {
      console.warn('[EmailGate] Failed to apply waitlist tag', tagName, applyRes.status);
    } else {
      console.log('[EmailGate] Applied waitlist tag', tagName, 'to contact', contactId);
    }
  } catch (err) {
    console.warn('[EmailGate] Waitlist tag application error:', err);
  }
}

function openPublicSurvey(appId: 'student-survey' | 'university-survey') {
  const url = new URL(window.location.href);
  url.searchParams.set('app', appId);
  window.location.href = url.toString();
}

// Derive a usable color set from a single hex primary color
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export default function EmailGate({
  spaceId,
  branding,
  themeTokens,
}: EmailGateProps) {
  const { setSessionId } = useSpaceRuntime();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<GateStep>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [contactName, setContactName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [authRoute, setAuthRoute] = useState<AuthRoute | null>(() => parseAuthRouteFromLocation());
  const [authIntent, setAuthIntent] = useState<AuthMode>(() => {
    const route = parseAuthRouteFromLocation();
    if (route && route !== '/auth') return routeToAuthMode(route);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('auth') === 'signup' ? 'signup' : 'login';
  });
  const authMode: AuthMode = authRoute && authRoute !== '/auth' ? routeToAuthMode(authRoute) : authIntent;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const roleStorageKey = `space_role_${spaceId}`;
  const [role, setRole] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(`space_role_${spaceId}`); } catch { return null; }
  });

  // The first thing a new visitor does is tell us who they are. We persist it
  // immediately so the Desktop shell can route them to the right (and only the
  // right) experience after sign-in.
  const chooseRole = (r: string) => {
    try { localStorage.setItem(roleStorageKey, r); } catch {}
    setRole(r);
  };

  const goToLanding = (replace = false) => {
    setAuthRoute(null);
    setError('');
    setStep('landing');
    setMobileNavOpen(false);
    navigateGateRoute('/', replace);
  };

  const goToRoleSelect = (replace = false, intent?: AuthMode) => {
    if (intent) setAuthIntent(intent);
    setError('');
    setAuthRoute('/auth');
    setStep('landing');
    setMobileNavOpen(false);
    navigateGateRoute('/auth', replace);
  };

  const goToAuthRoute = (route: AuthRoute, replace = false) => {
    const routeRole = routeToRole(route);
    if (routeRole) chooseRole(routeRole);
    setAuthRoute(route);
    setError('');
    setPassword('');
    setConfirmPassword('');
    if (route.endsWith('/signin')) {
      setFullName('');
      setInstitutionName('');
      setContactName('');
      setFirstName('');
      setLastName('');
    }
    setStep('landing');
    setMobileNavOpen(false);
    navigateGateRoute(route, replace);
  };

  const openAuth = (mode: AuthMode, selectedRole?: 'student' | 'university') => {
    setAuthIntent(mode);
    if (selectedRole) {
      const route = (mode === 'signup' ? `/${selectedRole}/signup` : `/${selectedRole}/signin`) as AuthRoute;
      goToAuthRoute(route);
      return;
    }
    goToRoleSelect(false, mode);
  };

  const pickRoleAndContinue = (selectedRole: 'student' | 'university') => {
    const route = (authIntent === 'signup' ? `/${selectedRole}/signup` : `/${selectedRole}/signin`) as AuthRoute;
    goToAuthRoute(route);
  };

  // Ensure marketing/auth pages can always scroll on mobile and desktop.
  // Besides html/body, release the #root mount node (and any wrapper between it
  // and <body>): a root/wrapper with overflow:hidden or a fixed 100vh height is
  // the classic scroll-killer that keeps getting reintroduced, and html/body
  // tweaks alone can’t override it. Everything is snapshotted and restored on
  // cleanup so the locked immersive app views are unaffected.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const releaseNodes: HTMLElement[] = [];
    let node: HTMLElement | null = document.getElementById('root');
    while (node && node !== body) {
      releaseNodes.push(node);
      node = node.parentElement;
    }
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyHeight = body.style.height;
    const prevBodyWidth = body.style.width;
    const prevBodyTop = body.style.top;
    const prevNodeStyles = releaseNodes.map((el) => ({
      overflow: el.style.overflow,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
      position: el.style.position,
    }));
    html.style.overflow = 'auto';
    html.style.height = 'auto';
    body.style.overflow = 'auto';
    body.style.position = 'static';
    body.style.width = 'auto';
    body.style.height = 'auto';
    body.style.top = '';
    releaseNodes.forEach((el) => {
      el.style.overflow = 'visible';
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
      if (el.style.position === 'fixed') el.style.position = 'static';
    });
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.height = prevBodyHeight;
      body.style.width = prevBodyWidth;
      body.style.top = prevBodyTop;
      releaseNodes.forEach((el, i) => {
        el.style.overflow = prevNodeStyles[i].overflow;
        el.style.height = prevNodeStyles[i].height;
        el.style.maxHeight = prevNodeStyles[i].maxHeight;
        el.style.position = prevNodeStyles[i].position;
      });
    };
  }, [step, authRoute]);

  // Sync auth route from URL on load and browser back/forward.
  useEffect(() => {
    const applyRouteFromLocation = () => {
      const route = parseAuthRouteFromLocation();
      setAuthRoute(route);
      if (route) {
        const routeRole = routeToRole(route);
        if (routeRole) chooseRole(routeRole);
        setStep('landing');
      } else if (step !== 'loading' && step !== 'complete' && step !== 'code') {
        setStep('landing');
      }
    };

    applyRouteFromLocation();

    const handlePopState = () => {
      applyRouteFromLocation();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      const stateVersion = (event.state as { gateVersion?: number } | null)?.gateVersion;
      if (event.persisted && stateVersion !== EMAIL_GATE_VERSION) {
        window.location.reload();
        return;
      }
      applyRouteFromLocation();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // Get workspaceId from window context
  const workspaceId = (window as any).__WORKSPACE_ID__ || null;
  const gdprEnabled = !!(window as any).__GDPR_ENABLED__;
  const guestModeEnabled = !!(window as any).__GUEST_MODE_ENABLED__;
  const rawSocialProviders = (window as any).__SOCIAL_PROVIDERS__;
  const socialProviders: string[] = Array.isArray(rawSocialProviders) ? rawSocialProviders : [];

  useEffect(() => {
    storeAttribution();
    checkExistingSession();
  }, [spaceId]);

  // Ensure browser tab shows Scout & Alma on the landing gate.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = LANDING_BRAND_NAME;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  // Pre-fill email from localStorage when loaded inside the onboarding walkthrough
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('walkthrough') === 'true') {
      const storedEmail = localStorage.getItem('user_email');
      if (storedEmail) setEmail(storedEmail);
    }
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const checkExistingSession = async () => {
    const sessionKey = `space_session_${spaceId}`;
    const existingSession = localStorage.getItem(sessionKey);

    if (existingSession) {
      try {
        const session = JSON.parse(existingSession);
        const effectiveSessionId = session.workspaceSessionId || session.id;

        if (effectiveSessionId) {
          const authRouteNow = parseAuthRouteFromLocation();
          const hashNow = typeof window !== 'undefined' ? window.location.hash : '';
          const historyView = (typeof window !== 'undefined'
            ? (window.history.state as { view?: string } | null)?.view
            : null);
          const onMarketingLanding = !authRouteNow && !hashNow && historyView === 'landing';
          if (onMarketingLanding) {
            setStep('landing');
            return;
          }

          if (workspaceId) {
            try {
              const configRes = await fetch(`/api/auth/otp/space/config/${workspaceId}`);
              const configData = await configRes.json();
              const otpConfig = configData.config || configData;

              if (otpConfig.enabled) {
                setOtpEnabled(true);
                const checkRes = await fetch(`/api/auth/otp/space/check-session?workspaceId=${workspaceId}&sessionUuid=${encodeURIComponent(effectiveSessionId)}`, {
                  credentials: 'include'
                });
                const checkData = await checkRes.json();

                if (checkData.verified) {
                  setSessionId(effectiveSessionId);
                  setStep('complete');
                  return;
                } else {
                  const storedRole = (() => {
                    try { return localStorage.getItem(roleStorageKey); } catch { return null; }
                  })();
                  const signinRoute = (
                    storedRole === 'university'
                      ? '/university/signin'
                      : '/student/signin'
                  ) as AuthRoute;
                  goToAuthRoute(signinRoute, true);
                  return;
                }
              }
            } catch (e) {
              console.log('[EmailGate] OTP config check failed, using simple mode');
            }
          }

          setSessionId(effectiveSessionId);
          setStep('complete');
          return;
        }
      } catch (e) {
        console.error('Failed to parse session:', e);
      }
    }

    if (workspaceId) {
      try {
        const configRes = await fetch(`/api/auth/otp/space/config/${workspaceId}`);
        const configData = await configRes.json();
        const otpConfig = configData.config || configData;
        setOtpEnabled(otpConfig.enabled || false);
      } catch (e) {
        setOtpEnabled(false);
      }
    }

    setStep('landing');
  };

  const buildSignupMetadata = () => {
    if (role === 'student') {
      const trimmed = fullName.trim();
      const parts = trimmed.split(/\s+/).filter(Boolean);
      const signupFirst = parts[0] || '';
      const signupLast = parts.length > 1 ? parts.slice(1).join(' ') : '';
      return { firstName: signupFirst, lastName: signupLast, fullName: trimmed };
    }
    if (role === 'university') {
      return {
        institutionName: institutionName.trim(),
        contactName: contactName.trim(),
        firstName: contactName.trim(),
        lastName: institutionName.trim(),
      };
    }
    return {};
  };

  const finalizeSessionEntry = () => {
    setAuthRoute(null);
    const landingUrl = buildAuthUrl('/');
    const appHash = role === 'university' ? 'alma' : 'scout';
    window.history.replaceState({ view: 'landing', gateVersion: EMAIL_GATE_VERSION }, '', landingUrl);
    window.history.pushState(
      { view: 'app', gateVersion: EMAIL_GATE_VERSION, app: appHash },
      '',
      landingUrl + '#' + appHash,
    );
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (authMode === 'signup') {
      if (role === 'student' && !fullName.trim()) {
        setError('Please enter your full name');
        return;
      }
      if (role === 'university') {
        if (!institutionName.trim()) {
          setError('Please enter your institution name');
          return;
        }
        if (!contactName.trim()) {
          setError('Please enter a contact name');
          return;
        }
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    if (!role || !VALID_WAITLIST_ROLES.has(role)) {
      setError('Please go back and choose your role');
      return;
    }

    // Persist role for returning login if already chosen
    if (role) {
      try { localStorage.setItem(roleStorageKey, role); } catch {}
    }

    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();

      if (otpEnabled && workspaceId) {
        const attribution = getAttribution();
        const visitorId = getVisitorId();
        const sessionId = `csess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        const registerRes = await fetch(`/api/space/${spaceId}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            sessionId,
            visitorId,
            attribution,
            metadata: role
              ? {
                  role,
                  ...(authMode === 'signup' ? buildSignupMetadata() : {}),
                }
              : {},
            workspaceId,
            marketingConsent,
          }),
        });

        const { data: registerResult, rawText: registerRawText } =
          await parseResponseBody(registerRes);

        if (!registerRes.ok) {
          console.error('[EmailGate] register failed', {
            status: registerRes.status,
            body: registerResult ?? registerRawText.slice(0, 200),
          });
          setError(
            describeResponseFailure(
              registerRes,
              registerResult,
              registerRawText,
              'Failed to create session. Please try again.',
            ),
          );
          setLoading(false);
          return;
        }

        if (!isRecord(registerResult)) {
          console.error('[EmailGate] register returned an unparseable body', {
            status: registerRes.status,
            rawText: registerRawText.slice(0, 200),
          });
          setError('The server returned an unexpected response. Please try again.');
          setLoading(false);
          return;
        }

        const registerBody = registerResult as SpaceRegisterResponseBody;
        const wsSessionId = registerBody.workspaceSessionId;
        setPendingSessionId(wsSessionId);

        if (typeof (window as any).fbq === 'function' && (window as any).__META_PIXEL_ID__) {
          (window as any).fbq('init', (window as any).__META_PIXEL_ID__, { em: normalizedEmail.toLowerCase().trim() });
        }
        fireLeadEventWithRetry(normalizedEmail);

        if (authMode === 'signup' && registerBody.isReturningUser === false) {
          await applyWaitlistTag(registerBody.contactId, role, workspaceId);
        }

        const sessionKey = `space_session_${spaceId}`;
        const pendingSession = {
          id: wsSessionId,
          workspaceSessionId: wsSessionId,
          email: normalizedEmail,
          contactId: registerResult.contactId || null,
          timestamp: Date.now(),
          verified: registerResult.isReturningUser === false,
          isReturningUser: !!registerResult.isReturningUser,
          metadata: registerResult.metadata || {},
        };
        localStorage.setItem(sessionKey, JSON.stringify(pendingSession));

        if (registerResult.isReturningUser === false) {
          try {
            window.dispatchEvent(new CustomEvent('audos:session-established', {
              detail: { workspaceSessionId: wsSessionId, email: normalizedEmail },
            }));
          } catch (e) {}

          setSessionId(wsSessionId);
          finalizeSessionEntry();
          setStep('complete');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/auth/otp/space/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: normalizedEmail, workspaceId, sessionUuid: wsSessionId }),
        });

        const { data: otpResult, rawText: otpRawText } = await parseResponseBody(response);

        if (!response.ok) {
          console.error('[EmailGate] otp send failed', {
            status: response.status,
            body: otpResult ?? otpRawText.slice(0, 200),
          });
          setError(
            describeResponseFailure(
              response,
              otpResult,
              otpRawText,
              'Failed to send code. Please try again.',
            ),
          );
          setLoading(false);
          return;
        }

        const otpBody: OtpResponseBody = isRecord(otpResult) ? otpResult : {};
        setResendCooldown(otpBody.resendCooldown ?? 60);
        setStep('code');
      } else {
        await registerSession();
      }
    } catch (err) {
      console.error('[EmailGate] Network error in handleEmailSubmit:', err);
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (code.length !== 4) {
      setError('Please enter the 4-digit code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (!pendingSessionId) {
        setError('Session expired. Please start over.');
        const fallbackRoute = (
          role === 'university'
            ? '/university/signin'
            : '/student/signin'
        ) as AuthRoute;
        goToAuthRoute(fallbackRoute, true);
        setLoading(false);
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const response = await fetch('/api/auth/otp/space/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, code, workspaceId, sessionUuid: pendingSessionId }),
      });

      const { data: verifyResult, rawText: verifyRawText } = await parseResponseBody(response);
      const verifyBody: OtpResponseBody = isRecord(verifyResult) ? verifyResult : {};

      if (!response.ok || !verifyBody.success) {
        console.error('[EmailGate] otp verify failed', {
          status: response.status,
          body: verifyResult ?? verifyRawText.slice(0, 200),
        });
        if (typeof verifyBody.attemptsRemaining === 'number') {
          setError(`Invalid code. ${verifyBody.attemptsRemaining} attempts remaining.`);
        } else {
          setError(
            describeResponseFailure(
              response,
              verifyResult,
              verifyRawText,
              'Invalid code. Please try again.',
            ),
          );
        }
        setLoading(false);
        return;
      }

      await completeVerifiedSession();
    } catch (err) {
      console.error('[EmailGate] Network error in handleCodeSubmit:', err);
      setError('Connection error. Please check your internet connection and try again.');
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !pendingSessionId) return;

    setLoading(true);
    setError('');

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const response = await fetch('/api/auth/otp/space/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalizedEmail, workspaceId, sessionUuid: pendingSessionId }),
      });

      const { data: resendResult, rawText: resendRawText } = await parseResponseBody(response);

      if (response.ok) {
        const resendBody: OtpResponseBody = isRecord(resendResult) ? resendResult : {};
        setResendCooldown(resendBody.resendCooldown ?? 60);
        setCode('');
      } else {
        console.error('[EmailGate] otp resend failed', {
          status: response.status,
          body: resendResult ?? resendRawText.slice(0, 200),
        });
        setError(
          describeResponseFailure(
            response,
            resendResult,
            resendRawText,
            'Failed to resend code. Please try again.',
          ),
        );
      }
    } catch (err) {
      console.error('[EmailGate] Network error in handleResendCode:', err);
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const completeVerifiedSession = async () => {
    const sessionKey = `space_session_${spaceId}`;
    const normalizedEmail = email.toLowerCase().trim();
    let verifiedMetadata: Record<string, unknown> = {};
    try {
      const existingSession = localStorage.getItem(sessionKey);
      if (existingSession) {
        const parsed = JSON.parse(existingSession);
        if (parsed.metadata) verifiedMetadata = parsed.metadata;
      }
    } catch {}
    const session = {
      id: pendingSessionId,
      workspaceSessionId: pendingSessionId,
      email: normalizedEmail,
      timestamp: Date.now(),
      verified: true,
      isReturningUser: true,
      metadata: verifiedMetadata,
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));

    try {
      window.dispatchEvent(new CustomEvent('audos:session-established', {
        detail: {
          workspaceSessionId: pendingSessionId,
          email: normalizedEmail,
        }
      }));
    } catch (e) {}

    setSessionId(pendingSessionId!);
    finalizeSessionEntry();
    setStep('complete');
    setLoading(false);
  };

  const registerSession = async () => {
    const normalizedEmail = email.toLowerCase().trim();
    const attribution = getAttribution();
    const visitorId = getVisitorId();
    const sessionId = `csess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const response = await fetch(`/api/space/${spaceId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        sessionId,
        visitorId,
        attribution,
        metadata: role
          ? {
              role,
              ...(authMode === 'signup' ? buildSignupMetadata() : {}),
            }
          : {},
        workspaceId,
        marketingConsent,
      }),
    });

    const { data: registerResult, rawText: registerRawText } = await parseResponseBody(response);

    if (!response.ok) {
      console.error('[EmailGate] registerSession failed', {
        status: response.status,
        body: registerResult ?? registerRawText.slice(0, 200),
      });
      setError(
        describeResponseFailure(
          response,
          registerResult,
          registerRawText,
          'Registration failed. Please try again.',
        ),
      );
      setLoading(false);
      return;
    }

    if (!isRecord(registerResult)) {
      console.error('[EmailGate] registerSession returned an unparseable body', {
        status: response.status,
        rawText: registerRawText.slice(0, 200),
      });
      setError('The server returned an unexpected response. Please try again.');
      setLoading(false);
      return;
    }

    const registerBody = registerResult as SpaceRegisterResponseBody;
    const effectiveSessionId =
      registerBody.workspaceSessionId ||
      `anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const sessionKey = `space_session_${spaceId}`;
    const session = {
      id: effectiveSessionId,
      workspaceSessionId: registerBody.workspaceSessionId || effectiveSessionId,
      email: normalizedEmail,
      contactId: registerBody.contactId || null,
      timestamp: Date.now(),
      isReturningUser: !!registerBody.isReturningUser,
      metadata: registerBody.metadata || {},
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));

    try {
      window.dispatchEvent(new CustomEvent('audos:session-established', {
        detail: {
          workspaceSessionId: registerBody.workspaceSessionId,
          email: normalizedEmail,
        }
      }));
    } catch (e) {}

    if (typeof (window as any).fbq === 'function' && (window as any).__META_PIXEL_ID__) {
      (window as any).fbq('init', (window as any).__META_PIXEL_ID__, { em: normalizedEmail.toLowerCase().trim() });
    }
    fireLeadEventWithRetry(normalizedEmail);

    if (authMode === 'signup' && registerBody.isReturningUser === false) {
      await applyWaitlistTag(registerBody.contactId, role, workspaceId);
    }

    setSessionId(effectiveSessionId);
    finalizeSessionEntry();
    setStep('complete');
    setLoading(false);
  };

  const handleGuestMode = async () => {
    setError('');
    setLoading(true);

    try {
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const sessionKey = `space_session_${spaceId}`;
      const guestSession = {
        id: guestId,
        workspaceSessionId: guestId,
        email: null,
        isGuest: true,
        timestamp: Date.now(),
        verified: true,
        metadata: {},
      };
      localStorage.setItem(sessionKey, JSON.stringify(guestSession));

      try {
        window.dispatchEvent(new CustomEvent('audos:session-established', {
          detail: { workspaceSessionId: guestId, isGuest: true },
        }));
      } catch (e) {}

      setSessionId(guestId);
      setStep('complete');
    } catch (err) {
      setError('Could not continue as guest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    const returnUrl = encodeURIComponent(window.location.href);
    const url = workspaceId
      ? `/api/auth/social/${provider}?workspaceId=${workspaceId}&spaceId=${spaceId}&returnUrl=${returnUrl}`
      : `/api/auth/social/${provider}?spaceId=${spaceId}&returnUrl=${returnUrl}`;
    window.location.href = url;
  };

  function getVisitorId(): string {
    const key = 'audos_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `v_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  function getAttrCookie(): Record<string, string> | null {
    try {
      const raw = localStorage.getItem('audos_attribution');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setAttrCookie(jsonStr: string) {
    const ATTR_COOKIE_NAME = 'audos_attr';
    const MULTI_LEVEL_TLDS = ['co.uk','co.za','co.in','co.jp','co.kr','co.nz','com.au','com.br','com.cn','com.mx','com.sg','com.hk','com.tw','com.ar','com.co','com.eg','com.my','com.ng','com.pe','com.ph','com.pk','com.tr','com.ua','com.vn','org.uk','org.au','net.au','net.uk','ac.uk','gov.uk','gov.au','edu.au','ne.jp','or.jp'];
    const hostname = window.location.hostname;
    const platformDomains = [
      'replit.dev', 'replit.app', 'repl.co',
      'github.io', 'herokuapp.com', 'netlify.app', 'vercel.app',
      'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
      'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
      'ngrok.io', 'ngrok.app', 'railway.app', 'render.com',
      'fly.dev', 'deno.dev', 'glitch.me'
    ];
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
    const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    let isPlatform = false;
    for (let i = 0; i < platformDomains.length; i++) {
      if (hostname.endsWith('.' + platformDomains[i]) || hostname === platformDomains[i]) {
        isPlatform = true;
        break;
      }
    }
    let domainPart = '';
    if (!isLocalhost && !isIP && !isPlatform) {
      const parts = hostname.split('.');
      const lastTwo = parts.slice(-2).join('.');
      if (MULTI_LEVEL_TLDS.indexOf(lastTwo) !== -1 && parts.length >= 3) {
        domainPart = '; domain=.' + parts.slice(-3).join('.');
      } else if (parts.length >= 2) {
        domainPart = '; domain=.' + parts.slice(-2).join('.');
      }
    }
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? '; Secure' : '';
    document.cookie = ATTR_COOKIE_NAME + '=' + encodeURIComponent(jsonStr) + '; max-age=86400; path=/' + domainPart + '; SameSite=Lax' + secureFlag;
  }

  function storeAttribution() {
    const params = new URLSearchParams(window.location.search);
    const hasUtm = params.has('utm_source') || params.has('utm_medium') || params.has('utm_campaign') || params.has('fbclid') || params.has('gclid') || params.has('ref');
    if (!hasUtm) return;

    const attr: Record<string, string> = { capturedAt: Date.now().toString() };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'].forEach(p => {
      const v = params.get(p);
      if (v) attr[p === 'ref' ? 'referrer' : p.replace('utm_', 'utm').replace('_', '')] = v;
    });
    if (document.referrer) attr.httpReferrer = document.referrer;

    try {
      localStorage.setItem('audos_attribution', JSON.stringify(attr));
    } catch {}

    const cookieAttr: Record<string, string> = { capturedAt: new Date().toISOString() };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'].forEach(p => {
      const v = params.get(p);
      if (v) cookieAttr[p] = v;
    });
    if (document.referrer) cookieAttr.httpReferrer = document.referrer;
    try {
      setAttrCookie(JSON.stringify(cookieAttr));
      console.log('[EmailGate] Attribution stored in cookie:', cookieAttr);
    } catch {}
  }

  async function fireLeadEventWithRetry(emailAddr: string, attempt = 0) {
    const normalizedEmail = emailAddr.toLowerCase().trim();
    // Task #1480: stable conversion id used for both client-side rdt('track','Lead', …)
    // and server-side Reddit CAPI so they dedupe.
    const conversionId = `lead_${spaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const tryFireFbq = (): boolean => {
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'Lead', {
          content_name: 'Email Capture',
          content_category: 'space',
        }, {
          em: normalizedEmail
        });
        console.log('[EmailGate] Meta Pixel Lead event fired for:', emailAddr);
        return true;
      }
      return false;
    };

    if (!tryFireFbq()) {
      console.log('[EmailGate] fbq not ready, will retry with exponential backoff...');
      const maxRetries = 5;
      const delays = [100, 200, 400, 800, 1600];

      const retryWithBackoff = (retryAttempt: number) => {
        if (retryAttempt >= maxRetries) {
          console.warn('[EmailGate] Failed to fire Lead event - fbq never loaded after 5 retries');
          return;
        }
        setTimeout(() => {
          if (tryFireFbq()) {
            console.log(`[EmailGate] Lead event fired after ${retryAttempt + 1} retries`);
          } else {
            retryWithBackoff(retryAttempt + 1);
          }
        }, delays[retryAttempt]);
      };

      retryWithBackoff(0);
    }

    // Task #1480: Reddit Pixel Lead (parallel to Meta). We call window.rdt
    // directly — the queue stub installed by the injected PageVisit snippet
    // (Task #1456, already live) handles late pixel.js loads, so we don’t
    // need the exponential-backoff retry the Meta path uses. Re-running
    // rdt('init', …, { email, externalId }) propagates advanced matching for
    // the subsequent Lead event (Reddit "Step 3: Set up match keys").
    try {
      const rdt = (window as any).rdt;
      const pixelId = (window as any).__REDDIT_PIXEL_ID__;
      if (typeof rdt === 'function') {
        if (pixelId) {
          rdt('init', pixelId, { email: normalizedEmail, externalId: getVisitorId() });
        }
        rdt('track', 'Lead', { conversionId });
        console.log('[EmailGate] Reddit Pixel Lead event fired (conversionId=' + conversionId + ')');
      }
    } catch (e) {
      console.warn('[EmailGate] Reddit Pixel Lead failed:', e);
    }

    if (!workspaceId) return;
    try {
      await fetch(`/api/space/${spaceId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'lead',
          sessionId: `lead_${Date.now()}`,
          visitorId: getVisitorId(),
          // Task #1480: include conversionId so server-side Reddit CAPI dedupes
          // with the client-side rdt('track','Lead',…) fired above.
          conversionId,
          metadata: { email: emailAddr, conversionId, ...getAttribution() },
          workspaceId,
        }),
      });
    } catch {
      if (attempt < 2) setTimeout(() => fireLeadEventWithRetry(emailAddr, attempt + 1), 2000);
    }
  }

  const getAttribution = () => {
    const params = new URLSearchParams(window.location.search);

    const urlAttribution: Record<string, string | null> = {};
    if (params.get('utm_source')) urlAttribution.utmSource = params.get('utm_source');
    if (params.get('utm_medium')) urlAttribution.utmMedium = params.get('utm_medium');
    if (params.get('utm_campaign')) urlAttribution.utmCampaign = params.get('utm_campaign');
    if (params.get('utm_content')) urlAttribution.utmContent = params.get('utm_content');
    if (params.get('utm_term')) urlAttribution.utmTerm = params.get('utm_term');
    if (params.get('fbclid')) urlAttribution.fbclid = params.get('fbclid');
    if (params.get('gclid')) urlAttribution.gclid = params.get('gclid');
    if (params.get('ref')) urlAttribution.referrer = params.get('ref');
    if (document.referrer) urlAttribution.httpReferrer = document.referrer;

    const storedAttr = getAttrCookie();

    const merged: Record<string, string | null> = {};
    if (storedAttr) {
      for (const [key, value] of Object.entries(storedAttr)) {
        if (value && key !== 'capturedAt') merged[key] = value;
      }
    }
    for (const [key, value] of Object.entries(urlAttribution)) {
      if (value) merged[key] = value;
    }

    return Object.keys(merged).length > 0 ? merged : null;
  };

  // Prefer the expanded palette when available, but keep the old primary-only fallback for older spaces.
  const palette = themeTokens?.palette || {};
  const primaryColor = palette?.primary || '#1e293b';
  const highlightColor = palette?.highlight || primaryColor;
  const brandName = LANDING_BRAND_NAME;
  const tagline = LANDING_TAGLINE;
  const productLine = LANDING_PRODUCT_LINE;
  const logoUrl = branding?.logoUrl;
  const bgLight = palette?.surfaces?.page || colorWithAlpha(primaryColor, 0.04);
  const bgMedium = palette?.surfaces?.accentSoft || colorWithAlpha(primaryColor, 0.08);
  const borderColor = palette?.surfaces?.border || colorWithAlpha(primaryColor, 0.15);
  const panelColor = themeTokens?.shell?.panelBackground || palette?.surfaces?.panel || '#ffffff';
  const panelStrongColor =
    themeTokens?.shell?.panelStrongBackground || palette?.surfaces?.panelStrong || '#ffffff';
  const pageBackground = themeTokens?.shell?.pageBackground || palette?.surfaces?.page || '#ffffff';
  const sectionBackground = palette?.surfaces?.muted || '#f9fafb';
  const gateGradient =
    themeTokens?.shell?.gateBackground ||
    `linear-gradient(180deg, ${
      palette?.surfaces?.gradientFrom || bgLight
    } 0%, ${
      palette?.surfaces?.gradientVia || '#ffffff'
    } 55%, ${
      palette?.surfaces?.gradientTo || '#ffffff'
    } 100%)`;
  const textPrimary = palette?.text?.brand || primaryColor;
  const textMuted = palette?.text?.secondary || colorWithAlpha(primaryColor, 0.55);
  const textSubtle = palette?.text?.muted || colorWithAlpha(primaryColor, 0.35);
  const onPrimary = palette?.text?.onPrimary || '#00343d';
  const onHighlight = palette?.text?.onHighlight || onPrimary;
  const onContrast = palette?.text?.onContrast || textPrimary;
  const dangerColor = palette?.semantic?.danger || '#dc2626';
  const fontFamily = themeTokens?.typography?.fontFamily || '"Space Grotesk", system-ui, -apple-system, sans-serif';
  const heroTextPrimary = palette?.text?.primary || textPrimary;
  const heroTextMuted = palette?.text?.secondary || textMuted;

  const isStudentRole = role === 'student';
  const isUniversityRole = role === 'university';
  const roleAccentColor = isUniversityRole ? highlightColor : primaryColor;
  const roleOnAccent = isUniversityRole ? onHighlight : onPrimary;
  const roleProductName = isUniversityRole ? 'Alma' : 'Scout';
  const roleProductTagline = isUniversityRole
    ? 'Reach students who are actively deciding on their next step.'
    : 'Find universities that genuinely fit your goals and budget.';
  const interFontFamily = '"Inter", system-ui, -apple-system, sans-serif';
  const gatePageStyle = {
    fontFamily: interFontFamily,
    backgroundColor: '#F9F9F9',
    WebkitOverflowScrolling: 'touch' as const,
  };

  // Brand logo mark
  const BrandMark = ({ size = 40 }: { size?: number }) => {
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={brandName}
          style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8 }}
        />
      );
    }
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.25,
          backgroundColor: primaryColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: onPrimary,
          fontWeight: 700,
          fontSize: size * 0.4,
          fontFamily,
          flexShrink: 0,
        }}
      >
        {brandName.charAt(0).toUpperCase()}
      </div>
    );
  };

  if (step === 'loading' || step === 'complete') {
    return null;
  }

  // Shared nav for landing + auth
  const NavBar = () => (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b" style={{ borderColor }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <button type="button" onClick={() => goToLanding()} className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="font-semibold text-base" style={{ color: textPrimary }}>{brandName}</span>
        </button>

        <nav className="hidden md:flex items-center gap-8">
          <button type="button" onClick={() => document.getElementById('students-section')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: textMuted }}>Students</button>
          <button type="button" onClick={() => document.getElementById('universities-section')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: textMuted }}>Universities</button>
          <button type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: textMuted }}>How it works</button>
          <button type="button" onClick={() => document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: textMuted }}>FAQ</button>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button type="button" onClick={() => goToRoleSelect(false, 'login')} className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors" style={{ borderColor, color: textPrimary }} data-testid="nav-login">Log In</button>
          <button type="button" onClick={() => openAuth('signup')} className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors" style={{ backgroundColor: primaryColor, color: onPrimary }} data-testid="nav-signup">Sign Up</button>
        </div>

        <button type="button" className="md:hidden p-2 rounded-lg" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Menu">
          {mobileNavOpen ? <X className="w-5 h-5" style={{ color: textPrimary }} /> : <Menu className="w-5 h-5" style={{ color: textPrimary }} />}
        </button>
      </div>

      {mobileNavOpen && (
        <div className="md:hidden border-t px-4 py-4 space-y-3" style={{ borderColor, backgroundColor: 'white' }}>
          <button type="button" onClick={() => { document.getElementById('students-section')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); }} className="block w-full text-left py-2 text-sm font-medium" style={{ color: textPrimary }}>Students</button>
          <button type="button" onClick={() => { document.getElementById('universities-section')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); }} className="block w-full text-left py-2 text-sm font-medium" style={{ color: textPrimary }}>Universities</button>
          <button type="button" onClick={() => { document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); }} className="block w-full text-left py-2 text-sm font-medium" style={{ color: textPrimary }}>How it works</button>
          <button type="button" onClick={() => { document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); }} className="block w-full text-left py-2 text-sm font-medium" style={{ color: textPrimary }}>FAQ</button>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => goToRoleSelect(false, 'login')} className="flex-1 py-2.5 text-sm font-medium rounded-lg border" style={{ borderColor, color: textPrimary }}>Log In</button>
            <button type="button" onClick={() => openAuth('signup')} className="flex-1 py-2.5 text-sm font-semibold rounded-lg" style={{ backgroundColor: primaryColor, color: onPrimary }}>Sign Up</button>
          </div>
        </div>
      )}
    </header>
  );

  const Footer = () => (
    <footer className="border-t py-12 px-4" style={{ borderColor, backgroundColor: sectionBackground }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BrandMark size={28} />
              <span className="font-semibold" style={{ color: textPrimary }}>{brandName}</span>
            </div>
            <p className="text-sm max-w-xs" style={{ color: textMuted }}>{tagline}</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm" style={{ color: textMuted }}>
            <button type="button" onClick={() => document.getElementById('students-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:opacity-70">Students</button>
            <button type="button" onClick={() => document.getElementById('universities-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:opacity-70">Universities</button>
            <button type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="hover:opacity-70">How it works</button>
            <button type="button" onClick={() => document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:opacity-70">FAQ</button>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
        <p className="text-xs mt-8" style={{ color: textSubtle }}>© {new Date().getFullYear()} Scout & Alma. All rights reserved.</p>
      </div>
    </footer>
  );

  // OTP Code verification screen
  if (step === 'code') {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ fontFamily, backgroundColor: sectionBackground }}
      >
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="text-center mb-10">
              <div className="flex justify-center mb-4">
                <BrandMark size={48} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: textPrimary }}>
                Check your inbox
              </h1>
              <p className="mt-2 text-sm" style={{ color: textMuted }}>
                We sent a 4-digit code to<br />
                <span className="font-medium" style={{ color: textPrimary }}>{email}</span>
              </p>
              <p className="mt-3 text-xs" style={{ color: textSubtle }}>
                can’t find it? Check your spam or junk folder.
              </p>
            </div>

            <form onSubmit={handleCodeSubmit} className="space-y-5">
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setCode(val);
                    setError('');
                  }}
                  placeholder="0000"
                  className="w-full px-4 py-3.5 text-center text-2xl tracking-[0.5em] font-mono rounded-xl focus:outline-none transition-all"
                  style={{
                    backgroundColor: panelColor,
                    border: `2px solid ${error ? dangerColor : borderColor}`,
                    color: textPrimary,
                  }}
                  disabled={loading}
                  autoFocus
                  data-testid="input-code"
                />
                {error && (
                  <p className="mt-2 text-xs" style={{ color: dangerColor }} data-testid="text-error">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 4}
                className="w-full py-3.5 rounded-xl font-semibold text-base transition-all"
                style={{
                  backgroundColor: loading || code.length !== 4 ? colorWithAlpha(primaryColor, 0.3) : primaryColor,
                  color: onPrimary,
                  cursor: loading || code.length !== 4 ? 'not-allowed' : 'pointer',
                }}
                data-testid="button-verify"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>

            <div className="text-center mt-6 space-x-4">
              <button
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                className="text-sm transition-colors"
                style={{ color: resendCooldown > 0 ? textSubtle : textPrimary }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
              <span style={{ color: textSubtle }}>|</span>
              <button
                onClick={() => {
                  const fallbackRoute = (
          role === 'university'
            ? '/university/signin'
            : '/student/signin'
        ) as AuthRoute;
                  goToAuthRoute(fallbackRoute, true);
                  setCode('');
                  setError('');
                }}
                className="text-sm transition-colors"
                style={{ color: textMuted }}
              >
                Change email
              </button>
            </div>
          </div>
        </div>

        <div className="pb-8 text-center">
          <p className="text-xs" style={{ color: textSubtle }}>
            Your data is private and secure
          </p>
        </div>
      </div>
    );
  }

  // Role selector gateway (J&J-style — pick student vs university before credentials)
  if (authRoute === '/auth') {
    return (
      <div className="min-h-screen" style={gatePageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div className="flex items-center justify-center px-4 py-10 sm:py-16 min-h-screen">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl border shadow-sm px-6 py-8 sm:px-8 sm:py-10" style={{ borderColor }}>
              <div className="flex flex-col items-center text-center mb-8">
                <BrandMark size={44} />
                <h1 className="mt-4 text-2xl font-bold tracking-tight" style={{ color: heroTextPrimary }}>
                  Welcome to {brandName}
                </h1>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: textMuted }}>
                  {authIntent === 'signup'
                    ? 'Create your account — choose the option that fits you'
                    : 'Sign in — choose the option that fits you'}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => goToAuthRoute(authIntent === 'signup' ? '/student/signup' : '/student/signin')}
                  className="w-full p-4 rounded-xl border text-left transition-all hover:shadow-sm"
                  style={{ borderColor, backgroundColor: 'white' }}
                  data-testid="role-select-student"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colorWithAlpha(primaryColor, 0.12), color: primaryColor }}
                    >
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>I&apos;m a student</p>
                      <p className="text-xs mt-1 leading-snug" style={{ color: textMuted }}>
                        Sign in to Scout — find universities that fit you
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 ml-auto mt-1 flex-shrink-0" style={{ color: textSubtle }} />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => goToAuthRoute(authIntent === 'signup' ? '/university/signup' : '/university/signin')}
                  className="w-full p-4 rounded-xl border text-left transition-all hover:shadow-sm"
                  style={{ borderColor, backgroundColor: 'white' }}
                  data-testid="role-select-university"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colorWithAlpha(highlightColor, 0.12), color: highlightColor }}
                    >
                      <Radar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>I&apos;m a university</p>
                      <p className="text-xs mt-1 leading-snug" style={{ color: textMuted }}>
                        Sign in to Alma — reach matched student prospects
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 ml-auto mt-1 flex-shrink-0" style={{ color: textSubtle }} />
                  </div>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => goToLanding()}
              className="block w-full text-center mt-6 text-sm"
              style={{ color: textSubtle }}
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Separate sign-in / sign-up pages per role (genuinely different routes)
  if (authRoute && authRoute !== '/auth' && (isStudentRole || isUniversityRole)) {
    const RoleIcon = isUniversityRole ? Radar : GraduationCap;
    const isSignup = authRoute.endsWith('/signup');
    const isSignin = authRoute.endsWith('/signin');
    const alternateRoute = (isSignup
      ? authRoute.replace('/signup', '/signin')
      : authRoute.replace('/signin', '/signup')) as AuthRoute;

    return (
      <div className="min-h-screen" style={gatePageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div className="flex items-center justify-center px-4 py-10 sm:py-16 min-h-screen">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor }}>
              <div className="h-1.5 w-full" style={{ backgroundColor: roleAccentColor }} />
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex flex-col items-center text-center mb-8">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: colorWithAlpha(roleAccentColor, 0.12), color: roleAccentColor }}
                  >
                    <RoleIcon className="w-6 h-6" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: textSubtle }}>
                    {roleProductName}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight" style={{ color: heroTextPrimary }}>
                    {isSignup ? 'Create your account' : 'Welcome back'}
                  </h1>
                </div>

                {error && (
                  <p className="mb-4 text-sm text-center" style={{ color: dangerColor }} data-testid="text-error">
                    {error}
                  </p>
                )}

                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  {isSignup && isStudentRole && (
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); setError(''); }}
                      placeholder="Full name"
                      className="w-full px-4 py-3.5 text-base rounded-xl focus:outline-none focus:ring-2"
                      style={{ backgroundColor: 'white', border: '1px solid ' + borderColor, color: textPrimary }}
                      disabled={loading}
                      required
                      autoComplete="name"
                      data-testid="input-full-name"
                    />
                  )}
                  {isSignup && isUniversityRole && (
                    <>
                      <input
                        type="text"
                        value={institutionName}
                        onChange={(e) => { setInstitutionName(e.target.value); setError(''); }}
                        placeholder="Institution name"
                        className="w-full px-4 py-3.5 text-base rounded-xl focus:outline-none focus:ring-2"
                        style={{ backgroundColor: 'white', border: '1px solid ' + borderColor, color: textPrimary }}
                        disabled={loading}
                        required
                        autoComplete="organization"
                        data-testid="input-institution-name"
                      />
                      <input
                        type="text"
                        value={contactName}
                        onChange={(e) => { setContactName(e.target.value); setError(''); }}
                        placeholder="Contact name"
                        className="w-full px-4 py-3.5 text-base rounded-xl focus:outline-none focus:ring-2"
                        style={{ backgroundColor: 'white', border: '1px solid ' + borderColor, color: textPrimary }}
                        disabled={loading}
                        required
                        autoComplete="name"
                        data-testid="input-contact-name"
                      />
                    </>
                  )}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder={isUniversityRole ? 'Work email' : 'Email'}
                    className="w-full px-4 py-3.5 text-base rounded-xl focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'white',
                      border: '1px solid ' + (error ? dangerColor : borderColor),
                      color: textPrimary,
                    }}
                    disabled={loading}
                    required
                    autoComplete="email"
                    data-testid="input-email"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="Password"
                    className="w-full px-4 py-3.5 text-base rounded-xl focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'white',
                      border: '1px solid ' + (error ? dangerColor : borderColor),
                      color: textPrimary,
                    }}
                    disabled={loading}
                    required
                    minLength={8}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    data-testid="input-password"
                  />
                  {isSignup && (
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                      placeholder="Confirm password"
                      className="w-full px-4 py-3.5 text-base rounded-xl focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid ' + (error ? dangerColor : borderColor),
                        color: textPrimary,
                      }}
                      disabled={loading}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      data-testid="input-confirm-password"
                    />
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl font-semibold text-base transition-all"
                    style={{
                      backgroundColor: loading ? colorWithAlpha(roleAccentColor, 0.35) : roleAccentColor,
                      color: roleOnAccent,
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                    data-testid="button-continue"
                  >
                    {loading ? 'Just a moment...' : isSignup ? 'Create account' : 'Sign in'}
                  </button>
                </form>

                <p className="text-center mt-6 text-sm" style={{ color: textMuted }}>
                  {isSignin ? (
                    <>Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => goToAuthRoute(alternateRoute)}
                        className="font-semibold underline"
                        style={{ color: roleAccentColor }}
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => goToAuthRoute(alternateRoute)}
                        className="font-semibold underline"
                        style={{ color: roleAccentColor }}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => goToRoleSelect()}
              className="block w-full text-center mt-6 text-sm"
              style={{ color: textSubtle }}
            >
              ← Choose a different role
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Marketing landing page
  if (step === 'landing' && !authRoute) {
  return (
    <div className="min-h-screen" style={{ fontFamily: '"Inter", ' + fontFamily, backgroundColor: '#F9F9F9' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <NavBar />

      {/* Hero */}
      <section className="px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]" style={{ color: heroTextPrimary }}>
            Find the university that&apos;s genuinely right for you
          </h1>
          <p className="mt-6 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: heroTextMuted }}>
            Conversational AI that understands your goals, budget, and priorities — then matches you with universities that actually fit.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button type="button" onClick={() => openAuth('signup', 'student')} className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all hover:opacity-90" style={{ backgroundColor: primaryColor, color: onPrimary }} data-testid="cta-student">
              I&apos;m a Student <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => openAuth('signup', 'university')} className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 border transition-all hover:bg-white" style={{ borderColor, color: textPrimary, backgroundColor: 'white' }} data-testid="cta-university">
              I&apos;m a University <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Scout section */}
      <section id="students-section" className="px-4 sm:px-6 py-20 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(primaryColor, 0.1), color: primaryColor }}>
              <GraduationCap className="w-3.5 h-3.5" /> For Students
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: heroTextPrimary }}>Meet Scout — conversational AI for university research</h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: heroTextMuted }}>Personalised university matching with Dream, Target, and Safe tiering. Conversational — not forms. A persistent chat that learns what matters to you.</p>
            <ul className="mt-6 space-y-3">
              {['Personalised university matching', 'Dream / Target / Safe tiering', 'Conversational intake — not forms', 'Persistent chat that remembers your goals'].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm" style={{ color: textMuted }}><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: primaryColor }} />{item}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => openPublicSurvey('student-survey')} className="px-6 py-3 rounded-xl font-semibold text-sm border" style={{ borderColor, color: textPrimary }} data-testid="button-student-survey">Take the student survey</button>
              <button type="button" onClick={() => openAuth('signup', 'student')} className="px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2" style={{ backgroundColor: primaryColor, color: onPrimary }}>Start with Scout <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="rounded-2xl border p-6 shadow-sm" style={{ borderColor, backgroundColor: sectionBackground }}>
            <div className="space-y-3">
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white border" style={{ borderColor, color: textPrimary }}>Hi there — I&apos;m Scout. What subjects or fields excite you most?</div>
              <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm ml-8" style={{ backgroundColor: primaryColor, color: onPrimary }}>Computer science and environmental studies — ideally somewhere with strong research opportunities.</div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white border" style={{ borderColor, color: textPrimary }}>Great choices. I&apos;m building your shortlist — 3 universities matched so far…</div>
            </div>
          </div>
        </div>
      </section>

      {/* Alma section */}
      <section id="universities-section" className="px-4 sm:px-6 py-20" style={{ backgroundColor: sectionBackground }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 rounded-2xl border p-6 shadow-sm bg-white" style={{ borderColor }}>
            <div className="space-y-3">
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm border" style={{ borderColor, color: textPrimary }}>Hi — I&apos;m Alma. Which programs are you actively trying to fill?</div>
              <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm ml-8" style={{ backgroundColor: highlightColor, color: onHighlight }}>Postgraduate STEM programs — targeting students from Southeast Asia and India.</div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm border" style={{ borderColor, color: textPrimary }}>I&apos;ve found 5 intent-qualified prospects matched to your programs…</div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(highlightColor, 0.12), color: highlightColor }}>
              <Radar className="w-3.5 h-3.5" /> For Universities
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: heroTextPrimary }}>Meet Alma — reach students who are actively deciding</h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: heroTextMuted }}>Access intent-qualified student profiles matched to your programs. Data consent built in from day one.</p>
            <ul className="mt-6 space-y-3">
              {['Intent-qualified student profiles', 'Matched to your specific programs', 'Data consent built in', 'Personalised outreach strategies'].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm" style={{ color: textMuted }}><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: highlightColor }} />{item}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => openPublicSurvey('university-survey')} className="px-6 py-3 rounded-xl font-semibold text-sm border bg-white" style={{ borderColor, color: textPrimary }} data-testid="button-university-survey">Take the university survey</button>
              <button type="button" onClick={() => openAuth('signup', 'university')} className="px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2" style={{ backgroundColor: highlightColor, color: onHighlight }}>Get started with Alma <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="px-4 sm:px-6 py-16 bg-white text-center">
        <p className="text-sm font-medium uppercase tracking-wide" style={{ color: textSubtle }}>Trusted by students exploring universities worldwide</p>
        <p className="mt-3 text-2xl font-semibold" style={{ color: heroTextPrimary }}>Join students from 40+ countries</p>
        <p className="mt-2 text-sm" style={{ color: textMuted }}>Making better university decisions with AI-powered matching</p>
      </section>

      {/* How it works — Scout AND Alma */}
      <section id="how-it-works" className="px-4 sm:px-6 py-20" style={{ backgroundColor: sectionBackground }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold" style={{ color: heroTextPrimary }}>How it works</h2>
            <p className="mt-3 text-base max-w-2xl mx-auto" style={{ color: textMuted }}>
              One platform, two experiences — Scout for students discovering their fit, Alma for universities reaching aligned prospects.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-6 rounded-2xl bg-white border" style={{ borderColor }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(primaryColor, 0.1), color: primaryColor }}>
                <GraduationCap className="w-3.5 h-3.5" /> Scout — for students
              </div>
              <ol className="space-y-4">
                {[
                  { title: 'Tell Scout what matters', desc: 'A short conversational intake about your goals, budget, locations, and priorities — not a long form.' },
                  { title: 'Get a ranked shortlist', desc: 'Universities matched to your profile with honest reasoning behind each recommendation.' },
                  { title: 'Refine and decide', desc: 'Keep chatting with Scout to compare options until you are confident in your choice.' },
                ].map((item, i) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: colorWithAlpha(primaryColor, 0.12), color: primaryColor }}>{i + 1}</span>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: textPrimary }}>{item.title}</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: textMuted }}>{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="p-6 rounded-2xl bg-white border" style={{ borderColor }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ backgroundColor: colorWithAlpha(highlightColor, 0.12), color: highlightColor }}>
                <Radar className="w-3.5 h-3.5" /> Alma — for universities
              </div>
              <ol className="space-y-4">
                {[
                  { title: 'Share your recruiting brief', desc: 'Tell Alma which programs you are filling, target regions, and enrollment priorities.' },
                  { title: 'Review matched prospects', desc: 'Access student profiles aligned to your programs — with fit scores and clear reasoning.' },
                  { title: 'Connect with confidence', desc: 'Reach out to intent-qualified students with personalised outreach, consent built in.' },
                ].map((item, i) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: colorWithAlpha(highlightColor, 0.12), color: highlightColor }}>{i + 1}</span>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: textPrimary }}>{item.title}</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: textMuted }}>{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq-section" className="px-4 sm:px-6 py-20 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: heroTextPrimary }}>Frequently asked questions</h2>

          <h3 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: textSubtle }}>FAQ: For Students</h3>
          <div className="space-y-4 mb-10">
            {[
              { q: 'What is Scout?', a: "Scout is a conversational AI — like ChatGPT, but built specifically for university search. You tell Scout your goals, budget, location preferences, program interests, and must-haves. It builds you a personalised shortlist of universities that genuinely fit — including ones you’ve never heard of that might be the best match for your specific program." },
              { q: 'Is Scout free?', a: 'Yes — completely free for every student, everywhere, always. No subscriptions, no unlocks, no hidden fees.' },
              { q: 'How is this different from rankings and university directories?', a: "Rankings tell you who’s well-known. Scout tells you who’s the best fit for YOU — including universities that are world-class for a specific program but not globally famous. It also surfaces your profile strengths and weaknesses so you know where you stand." },
              { q: 'What if I already have universities in mind?', a: "Great — Scout works with your existing list. Mark schools as Dream, Target, or Safe and Scout will help you build around them, filling gaps and flagging better-fit options you might have missed." },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border p-5" style={{ borderColor }}>
                <summary className="font-semibold text-sm cursor-pointer list-none flex items-center justify-between gap-4" style={{ color: textPrimary }}>
                  {item.q}
                  <span className="text-lg leading-none group-open:rotate-45 transition-transform" style={{ color: textSubtle }}>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: textMuted }}>{item.a}</p>
              </details>
            ))}
          </div>

          <h3 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: textSubtle }}>FAQ: For Universities</h3>
          <div className="space-y-4">
            {[
              { q: 'What is Alma?', a: 'Alma gives universities access to students who are actively searching right now. Instead of broad recruitment campaigns, you see matched profiles of students whose goals, program interests, budget, and preferences genuinely align with what you offer.' },
              { q: 'How do universities pay?', a: 'Universities pay a monthly or annual subscription for access to matched student profiles. You can start with departmental access (one program or department) or go full-university (all departments, at a discount).' },
              { q: 'What makes this different from university fairs or social ads?', a: "University fairs are expensive and broad. Social ads can’t target students at the moment of decision — students don’t publicly signal intent on LinkedIn or Instagram. Every student on Scout is actively deciding right now. That intent signal is something no other channel can replicate." },
              { q: 'Is student data handled with consent?', a: 'Yes. Students explicitly opt in for their profiles to be visible to universities. No student data is shared without their permission.' },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border p-5" style={{ borderColor }}>
                <summary className="font-semibold text-sm cursor-pointer list-none flex items-center justify-between gap-4" style={{ color: textPrimary }}>
                  {item.q}
                  <span className="text-lg leading-none group-open:rotate-45 transition-transform" style={{ color: textSubtle }}>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: textMuted }}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
  }

  return null;
}

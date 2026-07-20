import { useState, useRef, useEffect } from 'react';
import { User, Settings, HelpCircle, LogOut } from 'lucide-react';
import { useSpaceRuntime } from '../SpaceRuntimeContext';

interface AppProfileMenuProps {
  roleLabel?: string;
}

export function logoutUser(spaceId: string, setSessionId: (id: string | null) => void) {
  try {
    localStorage.removeItem(`space_session_${spaceId}`);
    localStorage.removeItem(`space_role_${spaceId}`);
  } catch {}
  setSessionId(null as unknown as string);
  const url = new URL(window.location.href);
  url.searchParams.delete('app');
  url.hash = '';
  let path = url.pathname.replace(/\/$/, '') || '';
  const authSuffixes = ['/auth', '/student/signin', '/student/signup', '/university/signin', '/university/signup'];
  for (const suffix of authSuffixes) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length) || '';
      break;
    }
  }
  url.pathname = path || '/';
  url.searchParams.set('_v', String(Date.now()));
  window.history.replaceState({ view: 'landing', gateVersion: 114 }, '', url.pathname + url.search);
}

export default function AppProfileMenu({ roleLabel }: AppProfileMenuProps) {
  const { spaceId, setSessionId } = useSpaceRuntime();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logoutUser(spaceId, setSessionId);
  };

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-full hover:bg-[var(--space-surface-muted)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Profile menu"
        aria-expanded={open}
        data-testid="button-profile-menu"
      >
        <User className="w-5 h-5 text-[var(--space-text-secondary)]" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-50 py-1 overflow-hidden">
          {roleLabel && (
            <div className="px-4 py-2 border-b border-[var(--space-border-default)]">
              <p className="text-xs text-[var(--space-text-muted)]">Signed in as</p>
              <p className="text-sm font-medium text-[var(--space-text-primary)] truncate">{roleLabel}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)] transition-colors text-left"
          >
            <Settings className="w-4 h-4 text-[var(--space-text-muted)]" />
            Profile settings
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-muted)] transition-colors text-left"
          >
            <HelpCircle className="w-4 h-4 text-[var(--space-text-muted)]" />
            Help
          </button>
          <div className="h-px bg-[var(--space-border-default)] my-1" />
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] transition-colors text-left"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// Scout — left column: collapsible navigation bar (Jack-style).

import { useEffect, useRef, useState } from 'react';
import {
  ChevronsUpDown,
  FileText,
  GraduationCap,
  Inbox,
  LogOut,
  PanelLeft,
  Star,
  User,
} from 'lucide-react';
import { cn, typography } from '../../lib/colors';
import { useScout } from './scout-store';
import { TabId, getInitials } from './scout-types';

const NAV_TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'recommendations', label: 'Recommendations', icon: Inbox },
  { id: 'shortlist', label: 'Shortlist', icon: Star },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function ScoutNav() {
  const {
    activeTab,
    setActiveTab,
    navCollapsed,
    setNavCollapsed,
    recommended,
    recentPrograms,
    openProgramModal,
    displayName,
    email,
    signOut,
  } = useScout();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div
      className={cn(
        'h-full flex flex-col flex-shrink-0 bg-[var(--space-surface-page)] border-r border-[var(--space-border-default)] transition-[width] duration-200',
        navCollapsed ? 'w-[64px]' : 'w-[248px]'
      )}
    >
      {/* Brand header */}
      <div className={cn('flex items-center gap-2.5 px-3 pt-4 pb-3 flex-shrink-0', navCollapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-lg bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-[18px] h-[18px]" />
        </div>
        {!navCollapsed && <span className={`text-lg font-semibold flex-1 truncate ${typography.color.primary}`}>Scout</span>}
        {!navCollapsed && (
          <button
            type="button"
            onClick={() => setNavCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] transition-colors"
            aria-label="Collapse navigation"
          >
            <PanelLeft className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>
      {navCollapsed && (
        <button
          type="button"
          onClick={() => setNavCollapsed(false)}
          className="mx-auto mb-1 p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] transition-colors"
          aria-label="Expand navigation"
        >
          <PanelLeft className="w-[18px] h-[18px]" />
        </button>
      )}

      {/* Primary tabs */}
      <nav className={cn('flex flex-col gap-0.5 px-2 flex-shrink-0', navCollapsed && 'items-center px-0')}>
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const badge = tab.id === 'recommendations' && recommended.length > 0 ? recommended.length : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={cn(
                'flex items-center gap-3 rounded-xl text-sm font-medium transition-colors',
                navCollapsed ? 'p-2.5 justify-center' : 'px-3 py-2.5 w-full text-left',
                active
                  ? 'bg-[var(--space-surface-card-hover)] text-[var(--space-text-primary)] ring-1 ring-[var(--space-border-default)]'
                  : 'text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]'
              )}
            >
              <span className="relative flex-shrink-0">
                <Icon className="w-[18px] h-[18px]" />
                {navCollapsed && badge != null && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] text-[10px] font-semibold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {!navCollapsed && <span className="flex-1 truncate">{tab.label}</span>}
              {!navCollapsed && badge != null && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] text-xs font-semibold">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Recent programs — the 5 most recently shortlisted */}
      {!navCollapsed && (
        <div className="mt-5 px-2 flex-1 min-h-0 overflow-y-auto">
          <div className="border-t border-[var(--space-border-default)] pt-4">
            <p className={`px-3 text-xs font-medium mb-1.5 ${typography.color.tertiary}`}>Recent programs</p>
            {recentPrograms.length === 0 ? (
              <p className={`px-3 text-xs leading-relaxed ${typography.color.muted}`}>Programs you shortlist will show up here.</p>
            ) : (
              recentPrograms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProgramModal(p.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-[var(--space-surface-muted)] transition-colors"
                >
                  <Star className="w-3.5 h-3.5 flex-shrink-0 fill-current text-[var(--space-text-primary)]" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className={typography.color.primary}>{p.university}</span>
                    <span className={typography.color.muted}> · {p.program_name}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {navCollapsed && <div className="flex-1" />}

      {/* User component */}
      <div className="relative flex-shrink-0 p-2 border-t border-[var(--space-border-default)]" ref={menuRef}>
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-50 py-1 overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--space-border-default)]">
              <p className={`text-xs ${typography.color.muted}`}>Signed in as</p>
              <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-xl hover:bg-[var(--space-surface-muted)] transition-colors',
            navCollapsed ? 'justify-center p-2' : 'px-2 py-2 text-left'
          )}
          aria-expanded={menuOpen}
          aria-label="User menu"
        >
          <div className="w-9 h-9 rounded-lg bg-[var(--space-brand-primary-900)] text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {getInitials(displayName)}
          </div>
          {!navCollapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{displayName}</p>
                <p className={`text-xs truncate ${typography.color.muted}`}>{email}</p>
              </div>
              <ChevronsUpDown className="w-4 h-4 flex-shrink-0 text-[var(--space-text-muted)]" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

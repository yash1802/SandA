// Alma — left column: collapsible navigation bar, modeled on Jill's sidebar.
// Flat primary tabs launch sub-sections in the right column; a Programs list
// (Jill's Pinned/Recent roles) switches programs in place; "All programs" and
// "New program" mirror Jill's "All roles" / "New role"; the university
// component sits at the very bottom with a sign-out menu overlay (PRD).

import { useEffect, useRef, useState } from 'react';
import {
  ChevronsUpDown,
  FileText,
  Inbox,
  Landmark,
  LayoutGrid,
  LogOut,
  PanelLeft,
  Plus,
  Star,
  User,
} from 'lucide-react';
import { cn, typography } from '../../lib/colors';
import { institutionLogoUrl, useAlma } from './alma-store';
import { ProgramRow, TabId, getInitials } from './alma-types';

// Shared with the right column's Jill-style tab row (App.tsx).
export const TAB_DEFS: { id: TabId; label: string; icon: any }[] = [
  { id: 'recommendations', label: 'Recommendations', icon: Inbox },
  { id: 'shortlist', label: 'Shortlist', icon: Star },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
];

export function UniversityAvatar({ email, institution, size = 'md' }: { email: string; institution: string; size?: 'sm' | 'md' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoUrl = !imageFailed ? institutionLogoUrl(email) : '';
  const dims = size === 'sm' ? 'w-8 h-8 rounded-lg text-xs' : 'w-9 h-9 rounded-lg text-xs';
  return (
    <div
      className={cn(dims, 'flex items-center justify-center font-semibold flex-shrink-0 overflow-hidden border border-[var(--space-border-default)]')}
      style={logoUrl ? { backgroundColor: 'white' } : { backgroundColor: 'var(--space-brand-primary-900)', color: 'white', borderColor: 'transparent' }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-2/3 h-2/3 object-contain" onError={() => setImageFailed(true)} />
      ) : (
        getInitials(institution)
      )}
    </div>
  );
}

// Colored status dot per program (Jill's role list dots) — keyed on level.
function ProgramDot({ program }: { program: ProgramRow }) {
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full flex-shrink-0',
        program.level === 'graduate' ? 'bg-emerald-500' : 'bg-amber-500'
      )}
    />
  );
}

const MAX_LISTED_PROGRAMS = 8;

export default function AlmaNav() {
  const {
    activeTab,
    setActiveTab,
    navCollapsed,
    setNavCollapsed,
    recommended,
    programs,
    activeProgram,
    openProgram,
    requestNewProgram,
    institutionName,
    email,
    signOut,
  } = useAlma();

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

  const listedPrograms = programs.slice(0, MAX_LISTED_PROGRAMS);
  const overflowCount = programs.length - listedPrograms.length;

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center gap-3 rounded-lg text-sm transition-colors',
      navCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2 w-full text-left',
      active
        ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)] font-medium'
        : 'text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]/70 hover:text-[var(--space-text-primary)]'
    );

  return (
    <div
      className={cn(
        'h-full flex flex-col flex-shrink-0 bg-[var(--space-surface-page)] border-r border-[var(--space-border-default)] transition-[width] duration-200',
        navCollapsed ? 'w-[60px]' : 'w-[248px]'
      )}
    >
      {/* Brand header — avatar + name + collapse toggle (Jill's header row) */}
      <div className={cn('h-12 flex items-center gap-2.5 flex-shrink-0', navCollapsed ? 'justify-center px-0' : 'px-3')}>
        <div className="w-7 h-7 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center flex-shrink-0">
          <Landmark className="w-4 h-4" />
        </div>
        {!navCollapsed && <span className={`text-[15px] font-semibold flex-1 truncate ${typography.color.primary}`}>Alma</span>}
        {!navCollapsed && (
          <button
            type="button"
            onClick={() => setNavCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] transition-colors"
            aria-label="Collapse navigation"
          >
            <PanelLeft className="w-4 h-4" />
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
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* Primary tabs — launchers for the right column (PRD) */}
      <nav className={cn('flex flex-col gap-0.5 pt-2 flex-shrink-0', navCollapsed ? 'items-center px-1.5' : 'px-2.5')}>
        {TAB_DEFS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const badge = tab.id === 'recommendations' && recommended.length > 0 ? recommended.length : null;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} title={tab.label} className={itemClass(active)}>
              <span className="relative flex-shrink-0">
                <Icon className="w-[18px] h-[18px]" />
                {navCollapsed && badge != null && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] text-[9px] font-semibold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {!navCollapsed && <span className="flex-1 truncate">{tab.label}</span>}
              {!navCollapsed && badge != null && (
                <span className="min-w-[20px] px-1.5 py-0.5 rounded-full bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] text-[11px] font-semibold text-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}

        {/* All programs / New program — Jill's "All roles" / "New role" */}
        <button type="button" onClick={() => openProgram(null)} title="All programs" className={itemClass(false)}>
          <LayoutGrid className="w-[18px] h-[18px] flex-shrink-0" />
          {!navCollapsed && <span className="flex-1 truncate">All programs</span>}
        </button>
        <button type="button" onClick={requestNewProgram} title="New program" className={itemClass(false)}>
          <span className="w-[18px] h-[18px] rounded border border-[var(--space-border-strong)] flex items-center justify-center flex-shrink-0">
            <Plus className="w-3 h-3" />
          </span>
          {!navCollapsed && <span className="flex-1 truncate">New program</span>}
        </button>
      </nav>

      {/* Programs list — Jill's pinned/recent roles, with the active one highlighted */}
      {!navCollapsed ? (
        <div className="mt-5 px-2.5 flex-1 min-h-0 overflow-y-auto">
          <div className="border-t border-[var(--space-border-default)] pt-3">
            <p className={`px-2.5 text-xs font-medium mb-1 ${typography.color.muted}`}>Programs</p>
            {listedPrograms.map((p) => {
              const active = activeProgram?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProgram(p.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors',
                    active
                      ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)] font-medium'
                      : 'text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]/70'
                  )}
                >
                  <ProgramDot program={p} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </button>
              );
            })}
            {overflowCount > 0 && (
              <button
                type="button"
                onClick={() => openProgram(null)}
                className={`w-full px-2.5 py-2 rounded-lg text-left text-sm hover:bg-[var(--space-surface-muted)]/70 transition-colors ${typography.color.muted}`}
              >
                Show all… ({programs.length})
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* University component (very bottom, PRD) */}
      <div className="relative flex-shrink-0 p-2 border-t border-[var(--space-border-default)]" ref={menuRef}>
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-50 py-1 overflow-hidden min-w-[200px]">
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
              Sign out
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
          aria-label="University menu"
        >
          <UniversityAvatar email={email} institution={institutionName} />
          {!navCollapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{institutionName}</p>
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

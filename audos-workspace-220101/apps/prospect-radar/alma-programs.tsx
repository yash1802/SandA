// Alma — program selection dashboard.
// Universities operate at the department level: one account, many programs.
// Shown right after login; each card displays the program name, its level
// tag, and the live count of candidates sitting in Recommendations (PRD).
// The "New program" card launches the creation modal.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FileText, GraduationCap, Landmark, LogOut, Plus, Users, X } from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { UniversityAvatar } from './alma-nav';
import { db, uploadFile, useAlma } from './alma-store';
import { INTAKE_TERMS, ProgramLevel, asArr, isPdfFile } from './alma-types';

// Starter choices for the campus-location dropdown; locations already used by
// this account's other programs are merged in, and "Add a new location…"
// reveals a free-text input.
const COMMON_LOCATIONS = [
  'Main campus',
  'Boston, USA',
  'New York, USA',
  'San Francisco, USA',
  'Chicago, USA',
  'London, UK',
  'Toronto, Canada',
  'Singapore',
  'Sydney, Australia',
  'Dubai, UAE',
];

const ADD_NEW = '__add_new__';

function CreateProgramModal({ onClose }: { onClose: () => void }) {
  const { createProgram, programs, email } = useAlma();
  const [name, setName] = useState('');
  const [level, setLevel] = useState<ProgramLevel | ''>('');
  const [terms, setTerms] = useState<string[]>([]);
  const [locationChoice, setLocationChoice] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [brochure, setBrochure] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const locationOptions = useMemo(() => {
    const used = programs.map((p) => (p.campus_location || '').trim()).filter(Boolean);
    const merged: string[] = [];
    for (const loc of [...used, ...COMMON_LOCATIONS]) {
      if (!merged.some((x) => x.toLowerCase() === loc.toLowerCase())) merged.push(loc);
    }
    return merged;
  }, [programs]);

  const toggleTerm = (term: string) =>
    setTerms((prev) => (prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term]));

  const resolvedLocation = locationChoice === ADD_NEW ? customLocation.trim() : locationChoice;
  // All fields are compulsory except the brochure (PRD).
  const valid = !!name.trim() && !!level && terms.length > 0 && !!resolvedLocation;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      let brochureUrl = '';
      let brochureName = '';
      if (brochure) {
        const up = await uploadFile(brochure);
        brochureUrl = up.url;
        brochureName = brochure.name;
      }
      const created = await createProgram({
        name: name.trim(),
        level: level as ProgramLevel,
        intakes: INTAKE_TERMS.filter((t) => terms.includes(t)),
        campus_location: resolvedLocation,
        brochure_url: brochureUrl || undefined,
        brochure_name: brochureName || undefined,
      });
      // The brochure lands in the program's Documents no matter the upload
      // path (PRD); Alma parses it into the Profile on first open.
      if (brochureUrl) {
        await db('alma_documents')
          .insert({
            user_email: email,
            program_id: created.id,
            name: brochureName,
            kind: 'brochure',
            url: brochureUrl,
            content_type: 'application/pdf',
            size_bytes: brochure ? brochure.size : null,
            uploaded_via: 'creation',
            text_content: null,
          })
          .catch(() => undefined);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The program couldn't be created — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-lg max-h-full overflow-y-auto rounded-2xl bg-white shadow-2xl border border-[var(--space-border-default)] p-5 sm:p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className={`text-lg font-semibold ${typography.color.primary}`}>Create a new program</h3>
          <button type="button" onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)]" aria-label="Close">
            <X className="w-4 h-4 text-[var(--space-text-muted)]" />
          </button>
        </div>
        <p className={`text-sm mb-4 ${typography.color.secondary}`}>
          Alma runs candidate search separately for each program in your department.
        </p>

        <div className="space-y-4">
          <label className="block">
            <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>Name of the program *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MSc in Data Science"
              className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2.5')}
            />
          </label>

          <div>
            <span className={`block text-xs font-medium mb-1.5 ${typography.color.secondary}`}>Program level *</span>
            <div className="grid grid-cols-2 gap-2">
              {(['undergraduate', 'graduate'] as ProgramLevel[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLevel(option)}
                  className={cn(
                    'px-3 py-2.5 rounded-xl border text-sm font-medium capitalize transition-colors',
                    level === option
                      ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                      : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                  )}
                  aria-pressed={level === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={`block text-xs font-medium mb-1.5 ${typography.color.secondary}`}>When does the program start? * (select all that apply)</span>
            <div className="grid grid-cols-3 gap-2">
              {INTAKE_TERMS.map((term) => {
                const active = terms.includes(term);
                return (
                  <button
                    key={term}
                    type="button"
                    onClick={() => toggleTerm(term)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                      active
                        ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                        : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                    )}
                    aria-pressed={active}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                    {term}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>Campus location *</span>
            <div className="relative">
              <select
                value={locationChoice}
                onChange={(e) => setLocationChoice(e.target.value)}
                className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2.5 appearance-none pr-10')}
              >
                <option value="" disabled>
                  Select where the program is run…
                </option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value={ADD_NEW}>Add a new location…</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--space-text-muted)]" />
            </div>
            {locationChoice === ADD_NEW && (
              <input
                type="text"
                autoFocus
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="e.g. Munich, Germany"
                className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2.5 mt-2')}
              />
            )}
          </label>

          <div>
            <span className={`block text-xs font-medium mb-1.5 ${typography.color.secondary}`}>Prospectus / brochure (PDF, optional)</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setBrochure(f && isPdfFile(f.type || f.name) ? f : null);
                if (f && !isPdfFile(f.type || f.name)) setError('The brochure must be a PDF.');
                else setError('');
              }}
            />
            {brochure ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] px-3 py-2.5">
                <FileText className="w-4 h-4 flex-shrink-0 text-[var(--space-text-secondary)]" />
                <span className={`text-sm truncate flex-1 ${typography.color.primary}`}>{brochure.name}</span>
                <button type="button" onClick={() => setBrochure(null)} className="p-1 rounded hover:bg-white" aria-label="Remove brochure">
                  <X className="w-3.5 h-3.5 text-[var(--space-text-muted)]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--space-border-strong)] text-sm hover:border-[var(--space-brand-primary)] transition-colors',
                  typography.color.secondary
                )}
              >
                <Plus className="w-4 h-4" />
                Attach the program brochure
              </button>
            )}
            <p className={`text-[11px] mt-1.5 ${typography.color.muted}`}>Alma reads the brochure to build the program's profile automatically.</p>
          </div>
        </div>

        {error && <p className={`text-xs mt-3 ${typography.color.danger}`}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={submitting} className={cn('flex-1 px-4 py-2.5 rounded-xl text-sm', tw.button.secondary, submitting && tw.button.disabled)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || submitting}
            className={cn('flex-1 px-4 py-2.5 rounded-xl text-sm', tw.button.primary, (!valid || submitting) && tw.button.disabled)}
          >
            {submitting ? 'Creating…' : 'Create program'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AlmaPrograms() {
  const { programs, candidateCounts, openProgram, institutionName, email, signOut, newProgramIntent, clearNewProgramIntent } = useAlma();
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Arriving via the nav's "New program" opens the creation modal directly.
  useEffect(() => {
    if (!newProgramIntent) return;
    clearNewProgramIntent();
    setCreating(true);
  }, [newProgramIntent, clearNewProgramIntent]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--space-surface-page)] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 sm:px-8 py-3.5 border-b border-[var(--space-border-default)] bg-white/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center">
            <Landmark className="w-[18px] h-[18px]" />
          </div>
          <span className={`text-lg font-semibold ${typography.color.primary}`}>Alma</span>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-[var(--space-surface-muted)] transition-colors"
            aria-expanded={menuOpen}
            aria-label="University menu"
          >
            <UniversityAvatar email={email} institution={institutionName} size="sm" />
            <span className="hidden sm:block text-left min-w-0">
              <span className={`block text-sm font-medium truncate max-w-[200px] ${typography.color.primary}`}>{institutionName}</span>
              <span className={`block text-xs truncate max-w-[200px] ${typography.color.muted}`}>{email}</span>
            </span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-50 py-1 overflow-hidden">
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
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <h1 className={`text-2xl font-semibold ${typography.color.primary}`}>Your programs</h1>
          <p className={`text-sm mt-1 ${typography.color.secondary}`}>
            Pick a program to work on, or onboard a new one. Each program gets its own recommendations, shortlist, documents, and chat.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {programs.map((p) => {
              const count = candidateCounts[p.id] || 0;
              const intakes = asArr<string>(p.intakes as any);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProgram(p.id)}
                  className="group rounded-2xl border border-[var(--space-border-default)] bg-white p-5 text-left shadow-sm hover:shadow-md hover:border-[var(--space-border-strong)] transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[var(--space-brand-primary-50)] border border-[var(--space-brand-primary-200)] flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-5 h-5 text-[var(--space-text-brand)]" />
                    </div>
                    <span
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize border',
                        p.level === 'graduate'
                          ? 'bg-[var(--space-brand-primary-50)] border-[var(--space-brand-primary-200)] text-[var(--space-text-brand)]'
                          : 'bg-[var(--space-surface-accent-soft)] border-[var(--space-border-default)] text-[var(--space-text-accent)]'
                      )}
                    >
                      {String(p.level || 'program')}
                    </span>
                  </div>
                  <p className={`text-base font-semibold leading-snug mt-3.5 line-clamp-2 ${typography.color.primary}`}>{p.name}</p>
                  <p className={`text-xs mt-1 truncate ${typography.color.muted}`}>
                    {[p.campus_location, intakes.length ? intakes.join(' · ') : ''].filter(Boolean).join(' — ')}
                  </p>
                  <div className={`flex items-center gap-1.5 mt-4 pt-3.5 border-t border-[var(--space-border-default)] text-sm ${typography.color.secondary}`}>
                    <Users className="w-4 h-4" />
                    <span>
                      <span className={`font-semibold ${typography.color.primary}`}>{count}</span> candidate{count === 1 ? '' : 's'} in
                      Recommendations
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Create (onboard) a new program */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-2xl border-2 border-dashed border-[var(--space-border-strong)] p-5 text-left flex flex-col items-center justify-center min-h-[180px] gap-2.5 hover:border-[var(--space-brand-primary)] hover:bg-white/60 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-white border border-[var(--space-border-default)] flex items-center justify-center">
                <Plus className="w-5 h-5 text-[var(--space-text-secondary)]" />
              </div>
              <span className={`text-sm font-semibold ${typography.color.primary}`}>Create a new program</span>
              <span className={`text-xs text-center max-w-[220px] ${typography.color.muted}`}>
                Onboard another program from your department
              </span>
            </button>
          </div>

          {programs.length === 0 && (
            <p className={`text-center mt-8 text-sm ${typography.color.muted}`}>
              No programs yet — create your first one to start finding candidates.
            </p>
          )}
        </div>
      </div>

      {creating && <CreateProgramModal onClose={() => setCreating(false)} />}
    </div>
  );
}

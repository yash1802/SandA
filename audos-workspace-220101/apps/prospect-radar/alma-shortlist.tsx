// Alma — right column: Shortlist sub-section.
// Two resizable columns (Saved / Contacted), a candidate modal with a
// Saved/Skip dropdown plus the "Request to apply" flow, and the hard rule
// that Contacted is irreversible (PRD).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown, Mail, Send, Star, X } from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { pushApplicationRequestToScout } from './alma-scout-bridge';
import { useAlma } from './alma-store';
import { CandidateDetailBody, CandidateTile, MatchBadge, SkipFeedbackModal } from './alma-recommendations';
import { CandidateRow, SHORTLIST_COLUMNS, STATUS_LABELS, relativeStamp } from './alma-types';

const WIDTHS_KEY = 'alma_shortlist_widths';
const MIN_FRACTION = 0.25;

function loadWidths(): number[] {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => typeof n === 'number' && n > 0)) {
        const sum = parsed.reduce((a, b) => a + b, 0);
        return parsed.map((n) => n / sum);
      }
    }
  } catch {
    // fall through to defaults
  }
  return [0.5, 0.5];
}

// ---------------------------------------------------------------------------
// Request-to-apply modal

function RequestToApplyModal({
  candidate,
  onCancel,
  onSent,
}: {
  candidate: CandidateRow;
  onCancel: () => void;
  onSent: () => void;
}) {
  const { defaultMessage, email, institutionName, activeProgram, setStatus } = useAlma();
  // Pre-populated with the default message from Documents when one exists;
  // otherwise the placeholder nudges — but sending empty is allowed (PRD).
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (sending || !activeProgram) return;
    setSending(true);
    setError('');
    try {
      // Push the request into the candidate's Scout account first — only a
      // successfully delivered request moves them to Contacted (irreversible).
      await pushApplicationRequestToScout({
        studentEmail: candidate.student_email || '',
        universityEmail: email,
        universityName: institutionName,
        programId: activeProgram.id,
        programName: activeProgram.name,
        programLevel: String(activeProgram.level || ''),
        campusLocation: String(activeProgram.campus_location || ''),
        message: message.trim(),
      });
      await setStatus(candidate.id, 'contacted');
      onSent();
    } catch {
      setError("The request couldn't be sent — please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-[var(--space-border-default)] p-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className={`text-base font-semibold ${typography.color.primary}`}>Request to apply</h3>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)]" aria-label="Close">
            <X className="w-4 h-4 text-[var(--space-text-muted)]" />
          </button>
        </div>
        <p className={`text-sm mb-3 ${typography.color.secondary}`}>
          {candidate.name || 'This candidate'} will see this in Scout as an invitation to apply to {activeProgram?.name}. Once sent, it can't
          be undone.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="Adding a message makes the candidates more likely to engage"
          className={cn(tw.input.base, tw.input.default, 'text-sm rounded-xl resize-none')}
        />
        {error && <p className={`text-xs mt-2 ${typography.color.danger}`}>{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} disabled={sending} className={cn('flex-1 px-4 py-2.5 rounded-xl text-sm', tw.button.secondary, sending && tw.button.disabled)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className={cn('flex-1 px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2', tw.button.primary, sending && tw.button.disabled)}
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidate modal (Saved/Skip dropdown + Request to apply)

function ShortlistCandidateModal({ candidate, onClose }: { candidate: CandidateRow; onClose: () => void }) {
  const { setStatus } = useAlma();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipFor, setSkipFor] = useState<CandidateRow | null>(null);
  const [requesting, setRequesting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const contacted = candidate.status === 'contacted';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !requesting && !skipFor) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, requesting, skipFor]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const moveToSaved = async () => {
    setMenuOpen(false);
    if (busy || candidate.status === 'saved') return;
    setBusy(true);
    try {
      await setStatus(candidate.id, 'saved');
    } finally {
      setBusy(false);
    }
  };

  const submitSkip = async (reasons: string[], note: string) => {
    if (!skipFor || busy) return;
    setBusy(true);
    try {
      // Skipping from the shortlist moves the candidate to the Skipped
      // sub-column under Recommendations — close so the user isn't staring at
      // a candidate that no longer lives here.
      await setStatus(skipFor.id, 'skipped', { reasons, note });
      setSkipFor(null);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-8">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-full flex flex-col rounded-2xl bg-[var(--space-surface-page)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pt-4">
          <div className="flex items-center gap-2">
            {/* Move dropdown — hidden for Contacted (irreversible, PRD) */}
            {contacted ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[var(--space-brand-primary-50)] border border-[var(--space-brand-primary-200)] text-[var(--space-text-brand)]">
                <CheckCircle2 className="w-4 h-4" />
                Contacted
              </span>
            ) : (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={busy}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white border border-[var(--space-border-default)] hover:border-[var(--space-border-strong)] transition-colors',
                    typography.color.primary,
                    busy && 'opacity-60 cursor-wait'
                  )}
                  aria-expanded={menuOpen}
                >
                  {STATUS_LABELS[candidate.status]}
                  <ChevronDown className="w-4 h-4 text-[var(--space-text-muted)]" />
                </button>
                {menuOpen && (
                  <div className="absolute left-0 top-full mt-1 w-44 rounded-xl border border-[var(--space-border-default)] bg-white shadow-lg z-20 py-1 overflow-hidden">
                    <button
                      type="button"
                      onClick={moveToSaved}
                      className={cn(
                        'w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--space-surface-muted)] transition-colors',
                        candidate.status === 'saved' ? 'font-semibold text-[var(--space-text-primary)]' : 'text-[var(--space-text-secondary)]'
                      )}
                    >
                      Saved{candidate.status === 'saved' ? ' ✓' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setSkipFor(candidate);
                      }}
                      className="w-full px-4 py-2.5 text-sm text-left text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] transition-colors border-t border-[var(--space-border-default)] mt-1"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-[var(--space-border-default)] flex items-center justify-center hover:bg-[var(--space-surface-muted)] transition-colors"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px] text-[var(--space-text-primary)]" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7 pt-4">
          <CandidateDetailBody candidate={candidate} />
        </div>
        {/* Request to apply */}
        <div className="flex-shrink-0 border-t border-[var(--space-border-default)] bg-white px-5 py-3.5">
          {contacted ? (
            <div className={`flex items-center justify-center gap-2 text-sm font-medium ${typography.color.secondary}`}>
              <Mail className="w-4 h-4" />
              Application request sent{candidate.contacted_at ? ` · ${relativeStamp(candidate.contacted_at)}` : ''}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRequesting(true)}
              disabled={busy}
              className={cn('w-full px-5 py-3 rounded-xl text-sm flex items-center justify-center gap-2', tw.button.primary, busy && tw.button.disabled)}
            >
              <Send className="w-4 h-4" />
              Request to apply
            </button>
          )}
        </div>
      </div>

      {skipFor && <SkipFeedbackModal candidate={skipFor} onCancel={() => setSkipFor(null)} onSubmit={submitSkip} busy={busy} />}
      {requesting && (
        <RequestToApplyModal
          candidate={candidate}
          onCancel={() => setRequesting(false)}
          onSent={() => setRequesting(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board card

function BoardCard({ candidate, onOpen }: { candidate: CandidateRow; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className="rounded-xl border border-[var(--space-border-default)] bg-white shadow-sm hover:shadow-md cursor-pointer transition-all select-none"
    >
      <div className="flex items-start gap-2.5 p-3">
        <CandidateTile name={candidate.name || candidate.student_email || '?'} size="sm" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-snug line-clamp-2 ${typography.color.primary}`}>
            {candidate.name || candidate.student_email}
          </p>
          <p className={`text-xs mt-0.5 truncate ${typography.color.muted}`}>
            {[candidate.target_major, candidate.gpa ? `GPA ${candidate.gpa}` : ''].filter(Boolean).join(' · ') || '—'}
          </p>
          <div className="mt-1.5">
            <MatchBadge score={candidate.match_score} size="sm" />
          </div>
        </div>
      </div>
      <div className={`flex items-center gap-1.5 px-3 py-2 border-t border-[var(--space-border-default)] text-xs ${typography.color.muted}`}>
        <Calendar className="w-3.5 h-3.5" />
        {relativeStamp(
          candidate.status === 'contacted' ? candidate.contacted_at || candidate.updated_at : candidate.shortlisted_at || candidate.updated_at
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-section

export default function AlmaShortlist() {
  const { savedList, contactedList, candidates, modalCandidateId, setModalCandidateId } = useAlma();
  const [widths, setWidths] = useState<number[]>(loadWidths);
  const boardRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ startX: number; startWidths: number[] } | null>(null);

  const modalCandidate = useMemo(
    () => (modalCandidateId != null ? candidates.find((c) => c.id === modalCandidateId) || null : null),
    [modalCandidateId, candidates]
  );

  const lists: Record<'saved' | 'contacted', CandidateRow[]> = { saved: savedList, contacted: contactedList };

  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { startX: e.clientX, startWidths: [...widths] };
    const onMove = (ev: MouseEvent) => {
      const ctx = resizing.current;
      const container = boardRef.current;
      if (!ctx || !container) return;
      const total = container.getBoundingClientRect().width || 1;
      const delta = (ev.clientX - ctx.startX) / total;
      const left = ctx.startWidths[0] + delta;
      const right = ctx.startWidths[1] - delta;
      if (left < MIN_FRACTION || right < MIN_FRACTION) return;
      setWidths([left, right]);
    };
    const onUp = () => {
      if (resizing.current) {
        setWidths((current) => {
          try {
            localStorage.setItem(WIDTHS_KEY, JSON.stringify(current));
          } catch {
            // widths just won't persist
          }
          return current;
        });
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

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      {/* Slim toolbar — the right-column tab bar already names this section */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--space-border-default)]">
        <p className={`text-xs ${typography.color.muted}`}>
          Shortlisted candidates land in Saved; sending a request to apply moves them to Contacted — permanently.
        </p>
        <p className={`text-xs hidden lg:block flex-shrink-0 ${typography.color.muted}`}>Drag the divider to resize</p>
      </div>

      {/* Horizontal scroll keeps both columns reachable at any panel width. */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden bg-[var(--space-surface-page)]/50">
        <div ref={boardRef} className="h-full flex min-w-[460px] p-3 gap-0">
          {SHORTLIST_COLUMNS.map((col, i) => {
            const items = lists[col.key];
            return (
              <div key={col.key} className="h-full flex" style={{ width: `${widths[i] * 100}%`, minWidth: 210 }}>
                <div className="flex-1 min-w-0 h-full flex flex-col rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-muted)]/70">
                  <div className="flex-shrink-0 flex items-center gap-2 px-3.5 py-3">
                    {col.key === 'saved' ? (
                      <Star className={cn('w-4 h-4 fill-current', col.accentClass)} />
                    ) : (
                      <Mail className={cn('w-4 h-4', col.accentClass)} />
                    )}
                    <span className={`text-sm font-semibold ${typography.color.primary}`}>{col.label}</span>
                    <span className={`min-w-[22px] px-1.5 py-0.5 rounded-full bg-white border border-[var(--space-border-default)] text-[11px] font-medium text-center ${typography.color.muted}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5 space-y-2.5">
                    {items.length === 0 ? (
                      <div className={`h-full min-h-[160px] flex items-center justify-center text-sm ${typography.color.muted}`}>
                        No candidates
                      </div>
                    ) : (
                      items.map((c) => <BoardCard key={c.id} candidate={c} onOpen={() => setModalCandidateId(c.id)} />)
                    )}
                  </div>
                </div>
                {i < SHORTLIST_COLUMNS.length - 1 && (
                  <div
                    onMouseDown={onDividerDown}
                    className="w-2 h-full flex-shrink-0 cursor-col-resize group flex items-center justify-center"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize columns"
                  >
                    <div className="w-[3px] h-16 rounded-full bg-[var(--space-border-default)] group-hover:bg-[var(--space-brand-primary)] transition-colors" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalCandidate && <ShortlistCandidateModal candidate={modalCandidate} onClose={() => setModalCandidateId(null)} />}
    </div>
  );
}

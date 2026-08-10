// Alma — right column: Recommendations sub-section (Jill's Candidates panel).
// A searchable two-column grid of candidate cards — avatar, name, target
// major, GPA, and a "94% · Excellent" match badge — with two toggleable
// views (Recommendations / Skipped), quick actions on each card, a "Rerun
// search" that re-runs discovery from saved preferences, and the horizontal
// carousel modal with its Skip / Shortlist action bottom bar (PRD).

import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  GraduationCap,
  Inbox,
  Loader2,
  MapPin,
  PartyPopper,
  RefreshCw,
  Search,
  ThumbsDown,
  X,
} from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { AgentDeps, discoverCandidates } from './alma-agent';
import { distillCitizenship, distillTests } from './alma-scout-bridge';
import { useAlma } from './alma-store';
import {
  CandidateRow,
  FitReason,
  SKIP_OPTIONS,
  StudentSnapshot,
  asArr,
  asObj,
  getInitials,
  gpaShortContext,
  matchTier,
  tileColor,
} from './alma-types';

type ViewKey = 'recommendations' | 'skipped';

// Circular monogram avatar (Jill uses round headshots; students have no photos).
export function CandidateTile({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-14 h-14 text-lg' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={cn(dims, 'rounded-full flex items-center justify-center font-semibold flex-shrink-0 overflow-hidden text-white')}
      style={{ backgroundColor: tileColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

// "94% · Exceptional" — match score percentage (PRD) plus a tier word.
export function MatchBadge({ score, size = 'md' }: { score?: number | null; size?: 'sm' | 'md' }) {
  const tier = matchTier(score);
  if (!tier) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-semibold flex-shrink-0 whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        tier.chipClass
      )}
    >
      {Math.round(score!)}%&nbsp;·&nbsp;{tier.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skip feedback modal (multiple-choice checkboxes + free-form note, PRD)

export function SkipFeedbackModal({
  candidate,
  onCancel,
  onSubmit,
  busy,
}: {
  candidate: CandidateRow;
  onCancel: () => void;
  onSubmit: (reasons: string[], note: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const canSubmit = (selected.length > 0 || note.trim().length > 0) && !busy;

  const toggle = (option: string) =>
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-[var(--space-border-default)] p-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className={`text-base font-semibold ${typography.color.primary}`}>Skipping this candidate</h3>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)]" aria-label="Close">
            <X className="w-4 h-4 text-[var(--space-text-muted)]" />
          </button>
        </div>
        <p className={`text-sm mb-4 ${typography.color.secondary}`}>
          Why isn't {candidate.name || 'this candidate'} a fit? This sharpens future recommendations.
        </p>
        <div className="space-y-2 mb-4">
          {SKIP_OPTIONS.map((option) => {
            const active = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors',
                  active
                    ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                    : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                )}
                aria-pressed={active}
              >
                <span
                  className={cn(
                    'w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0',
                    active ? 'bg-[var(--space-brand-primary)] border-[var(--space-brand-primary)]' : 'border-[var(--space-border-strong)]'
                  )}
                >
                  {active && <Check className="w-3 h-3 text-[var(--space-text-on-primary)]" />}
                </span>
                {option}
              </button>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Anything else? Tell Alma in your own words… (optional)"
          className={cn(tw.input.base, tw.input.default, 'text-sm rounded-xl resize-none')}
        />
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className={cn('flex-1 px-4 py-2.5 rounded-xl text-sm', tw.button.secondary)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit(selected, note.trim())}
            disabled={!canSubmit}
            className={cn('flex-1 px-4 py-2.5 rounded-xl text-sm', tw.button.primary, !canSubmit && tw.button.disabled)}
          >
            {busy ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared candidate detail body (used by the carousel and the shortlist modal)

function DetailSection({ icon: Icon, title, children }: { icon: any; title: string; children: any }) {
  return (
    <div className="mt-6">
      <h3 className={`flex items-center gap-2 text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>
        <Icon className="w-4 h-4 text-[var(--space-text-secondary)]" />
        {title}
      </h3>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

export function CandidateDetailBody({ candidate }: { candidate: CandidateRow }) {
  const student = asObj<StudentSnapshot | null>(candidate.student_json as any, null);
  const fitReasons = asArr<FitReason>(candidate.fit_reasons as any);
  const name = candidate.name || student?.name || candidate.student_email || 'Candidate';

  const facts: { label: string; value?: string | null }[] = [
    { label: 'Target major', value: candidate.target_major },
    { label: 'GPA', value: candidate.gpa ? `${candidate.gpa}${student?.gpaContext ? ` (${student.gpaContext})` : ''}` : '' },
    { label: 'Seeking', value: student?.level ? `${student.level} programs` : '' },
    { label: 'Location', value: student?.location },
    // Distilled at render too, so snapshots stored verbatim by older versions
    // ("im an indian citizen") display as clean keywords ("Indian").
    { label: 'Citizenship', value: distillCitizenship(student?.citizenship) },
    { label: 'Tests', value: distillTests(student?.tests) },
  ];
  const knownFacts = facts.filter((f) => f.value && String(f.value).trim());

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-4">
        <CandidateTile name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className={`text-xl font-semibold leading-snug ${typography.color.primary}`}>{name}</h2>
            <MatchBadge score={candidate.match_score} />
          </div>
          <div className={`flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-sm ${typography.color.secondary}`}>
            {candidate.target_major && <span className="font-medium">{candidate.target_major}</span>}
            {student?.location && (
              <>
                {candidate.target_major && <span className="opacity-40">•</span>}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {student.location}
                </span>
              </>
            )}
          </div>
          {student?.headline && <p className={`text-sm mt-1 ${typography.color.muted}`}>{student.headline}</p>}
        </div>
      </div>

      {student?.lookingFor && (
        <p className={`mt-4 text-[15px] leading-relaxed whitespace-pre-line ${typography.color.primary}`}>{student.lookingFor}</p>
      )}

      {/* Candidate facts */}
      {knownFacts.length > 0 && (
        <div className="mt-6">
          <h3 className={`text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>Candidate</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3">
            {knownFacts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={typography.color.muted}>{f.label}</span>
                <span className={`text-right font-medium ${typography.color.primary}`}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fit section — why this candidate fits the program (PRD) */}
      <div className="mt-6">
        <h3 className={`text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>
          Why they fit your program
        </h3>
        {fitReasons.length === 0 ? (
          <p className={`mt-3 text-sm ${typography.color.muted}`}>Alma hasn't written fit notes for this candidate.</p>
        ) : (
          <div className="space-y-2.5 mt-3">
            {fitReasons.map((reason, i) => (
              <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--space-semantic-success)] flex-shrink-0" />
                  <p className={`text-sm font-semibold ${typography.color.primary}`}>{reason.title}</p>
                </div>
                <p className={`text-sm mt-1.5 leading-relaxed whitespace-pre-line ${typography.color.secondary}`}>{reason.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Background from the student's Scout profile */}
      {student && student.education.length > 0 && (
        <DetailSection icon={GraduationCap} title="Education">
          {student.education.map((e, i) => (
            <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3.5">
              <p className={`text-sm font-semibold ${typography.color.primary}`}>
                {[e.degree, e.field].filter(Boolean).join(' — ')}
              </p>
              <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>
                {e.institute}
                {e.grade ? ` · ${e.grade}` : ''}
                {e.inProgress ? ' · in progress' : ''}
              </p>
            </div>
          ))}
        </DetailSection>
      )}
      {student && student.work.length > 0 && (
        <DetailSection icon={Briefcase} title="Work experience">
          {student.work.map((w, i) => (
            <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3.5">
              <p className={`text-sm font-semibold ${typography.color.primary}`}>
                {[w.title, w.company].filter(Boolean).join(' @ ')}
              </p>
              {w.description && <p className={`text-sm mt-1 leading-relaxed line-clamp-3 ${typography.color.secondary}`}>{w.description}</p>}
            </div>
          ))}
        </DetailSection>
      )}
      {student && student.research.length > 0 && (
        <DetailSection icon={FlaskConical} title="Research">
          {student.research.map((r, i) => (
            <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3.5">
              <p className={`text-sm font-semibold ${typography.color.primary}`}>{r.title}</p>
              {r.venue && <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>{r.venue}</p>}
            </div>
          ))}
        </DetailSection>
      )}
      {student && student.extracurriculars.length > 0 && (
        <DetailSection icon={Award} title="Extracurriculars & leadership">
          {student.extracurriculars.map((e, i) => (
            <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3.5">
              <p className={`text-sm font-semibold ${typography.color.primary}`}>{e.title}</p>
              {e.description && <p className={`text-sm mt-1 leading-relaxed line-clamp-3 ${typography.color.secondary}`}>{e.description}</p>}
            </div>
          ))}
        </DetailSection>
      )}
      {student && student.skills.length > 0 && (
        <DetailSection icon={BookOpen} title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {student.skills.map((skill, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-xs text-[var(--space-text-primary)]"
              >
                {skill}
              </span>
            ))}
          </div>
        </DetailSection>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Carousel modal + action bottom bar

function CandidateCarousel({
  pool,
  startId,
  onClose,
}: {
  pool: CandidateRow[];
  startId: number;
  onClose: () => void;
}) {
  const { setStatus } = useAlma();
  const startIndex = Math.max(0, pool.findIndex((c) => c.id === startId));
  const [index, setIndex] = useState(startIndex);
  const [busy, setBusy] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<CandidateRow | null>(null);

  // When an item leaves the pool the same index now points at the next
  // candidate; when the last item leaves, loop back to the first remaining one.
  useEffect(() => {
    if (pool.length > 0 && index >= pool.length) setIndex(0);
  }, [pool.length, index]);

  const current = pool.length > 0 ? pool[Math.min(index, pool.length - 1)] : null;
  const alreadySkipped = current?.status === 'skipped';

  const shortlist = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      // Shortlisting adds to Saved; the carousel auto-advances because the
      // candidate leaves the pool and this index now points at the next one.
      await setStatus(current.id, 'saved');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (feedbackFor) return;
      if (e.key === 'Escape') onClose();
      if (!pool.length) return;
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % pool.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + pool.length) % pool.length);
      if ((e.key === 's' || e.key === 'S') && current && current.status !== 'skipped' && !busy) setFeedbackFor(current);
      if ((e.key === 't' || e.key === 'T') && current && !busy) shortlist();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length, feedbackFor, onClose, current?.id, busy]);

  const submitFeedback = async (reasons: string[], note: string) => {
    if (!feedbackFor || busy) return;
    setBusy(true);
    try {
      await setStatus(feedbackFor.id, 'skipped', { reasons, note });
      setFeedbackFor(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      {/* Dots + close (top of the carousel, per the reference modal) */}
      <div className="relative flex items-center justify-center pt-4 pb-2 px-14 z-10">
        {pool.length > 0 && pool.length <= 12 ? (
          <div className="flex items-center gap-2">
            {pool.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  i === Math.min(index, pool.length - 1) ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70'
                )}
                aria-label={`Go to candidate ${i + 1}`}
              />
            ))}
          </div>
        ) : pool.length > 12 ? (
          <span className="text-white/90 text-sm font-medium">
            {Math.min(index, pool.length - 1) + 1} / {pool.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-3 w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-[var(--space-surface-muted)] transition-colors"
          aria-label="Close"
        >
          <X className="w-[18px] h-[18px] text-[var(--space-text-primary)]" />
        </button>
      </div>

      {/* Card + edge arrows */}
      <div className="relative flex-1 min-h-0 flex items-stretch justify-center px-3 sm:px-16 pb-2 z-10">
        {pool.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + pool.length) % pool.length)}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white shadow-lg items-center justify-center hover:scale-105 transition-transform"
            aria-label="Previous candidate"
          >
            <ChevronLeft className="w-5 h-5 text-[var(--space-text-primary)]" />
          </button>
        )}

        <div className="w-full max-w-2xl h-full">
          {current ? (
            <div
              key={current.id}
              className="h-full rounded-2xl bg-[var(--space-surface-page)] shadow-2xl overflow-y-auto p-5 sm:p-7 animate-in fade-in slide-in-from-right-4 duration-200"
            >
              {alreadySkipped && (
                <div className="mb-4 -mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--space-surface-accent-soft)] border border-[var(--space-border-default)] text-xs font-medium text-[var(--space-text-accent)]">
                  You skipped this candidate — you can still shortlist them.
                </div>
              )}
              <CandidateDetailBody candidate={current} />
            </div>
          ) : (
            <div className="h-full rounded-2xl bg-[var(--space-surface-page)] shadow-2xl flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-200">
              <div className="w-14 h-14 rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center mb-4">
                <PartyPopper className="w-7 h-7" />
              </div>
              <p className={`text-xl font-semibold ${typography.color.primary}`}>All caught up!</p>
              <p className={`text-sm mt-2 max-w-xs ${typography.color.secondary}`}>
                You've reviewed everything here. Ask Alma in the chat to find more candidates.
              </p>
              <button type="button" onClick={onClose} className={cn('mt-5 px-5 py-2.5 rounded-xl text-sm', tw.button.secondary)}>
                Close
              </button>
            </div>
          )}
        </div>

        {pool.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % pool.length)}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white shadow-lg items-center justify-center hover:scale-105 transition-transform"
            aria-label="Next candidate"
          >
            <ChevronRight className="w-5 h-5 text-[var(--space-text-primary)]" />
          </button>
        )}
      </div>

      {/* Action bottom bar (Skip / Shortlist) with keyboard hints */}
      <div className="relative z-10 bg-white border-t border-[var(--space-border-default)] px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => current && setFeedbackFor(current)}
            disabled={!current || alreadySkipped || busy}
            className={cn(
              'flex-1 max-w-[220px] px-5 py-3 rounded-xl text-sm font-semibold',
              tw.button.secondary,
              (!current || alreadySkipped || busy) && tw.button.disabled
            )}
            title={alreadySkipped ? 'Already skipped' : 'Skip'}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={shortlist}
            disabled={!current || busy}
            className={cn('flex-1 max-w-[220px] px-5 py-3 rounded-xl text-sm', tw.button.primary, (!current || busy) && tw.button.disabled)}
          >
            {busy ? 'Saving…' : 'Shortlist'}
          </button>
        </div>
        <div className={`hidden sm:flex items-center justify-center gap-4 mt-2.5 text-[11px] ${typography.color.muted}`}>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] font-sans">←</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] font-sans">→</kbd> Navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] font-sans">S</kbd> Skip
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] font-sans">T</kbd> Shortlist
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] font-sans">Esc</kbd> Close
          </span>
        </div>
      </div>

      {feedbackFor && (
        <SkipFeedbackModal candidate={feedbackFor} onCancel={() => setFeedbackFor(null)} onSubmit={submitFeedback} busy={busy} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jill-style candidate card

function CandidateCard({
  candidate,
  onOpen,
  onSkip,
  onShortlist,
  busy,
}: {
  candidate: CandidateRow;
  onOpen: () => void;
  onSkip: () => void;
  onShortlist: () => void;
  busy: boolean;
}) {
  const student = asObj<StudentSnapshot | null>(candidate.student_json as any, null);
  const name = candidate.name || candidate.student_email || 'Candidate';
  const skipped = candidate.status === 'skipped';
  const description =
    student?.headline ||
    asArr<FitReason>(candidate.fit_reasons as any)[0]?.detail ||
    student?.lookingFor ||
    '';
  const gpaLevel = gpaShortContext(student?.gpaContext);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 flex flex-col cursor-pointer hover:shadow-md hover:border-[var(--space-border-strong)] transition-all"
    >
      <div className="flex items-start gap-3">
        <CandidateTile name={name} />
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-semibold truncate ${typography.color.primary}`}>{name}</p>
          <p className={`text-[13px] truncate ${typography.color.secondary}`}>{candidate.target_major || student?.location || '—'}</p>
        </div>
        <MatchBadge score={candidate.match_score} size="sm" />
      </div>

      {description && (
        <p className={`mt-3 text-sm leading-relaxed line-clamp-3 flex-1 ${typography.color.secondary}`}>{description}</p>
      )}

      {/* PRD card schema: the GPA of the highest education level, labeled */}
      {candidate.gpa && (
        <p className={`mt-3 text-xs ${typography.color.muted}`}>
          GPA <span className={`font-semibold ${typography.color.primary}`}>{candidate.gpa}</span>
          {gpaLevel ? ` · ${gpaLevel}` : ''}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!skipped && !busy) onSkip();
          }}
          disabled={skipped || busy}
          className={cn(
            'p-2 rounded-lg border border-transparent text-[var(--space-text-muted)] transition-colors',
            skipped || busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--space-surface-muted)] hover:text-[var(--space-text-primary)]'
          )}
          aria-label={skipped ? 'Already skipped' : 'Skip candidate'}
          title={skipped ? 'Already skipped' : 'Skip'}
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!busy) onShortlist();
          }}
          disabled={busy}
          className={cn(
            'px-3 py-1.5 rounded-lg border border-[var(--space-border-default)] bg-white text-sm font-medium transition-colors',
            typography.color.primary,
            busy ? 'opacity-50 cursor-wait' : 'hover:bg-[var(--space-surface-muted)] hover:border-[var(--space-border-strong)]'
          )}
        >
          {busy ? 'Saving…' : 'Shortlist'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-section

export default function AlmaRecommendations() {
  const store = useAlma();
  const { recommended, skippedList, candidates, activeProgram, setStatus, appendLocalMessage, persistMessage } = store;
  const [view, setView] = useState<ViewKey>('recommendations');
  const [query, setQuery] = useState('');
  const [carousel, setCarousel] = useState<{ view: ViewKey; startId: number } | null>(null);
  const [skipTarget, setSkipTarget] = useState<CandidateRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');

  const list = view === 'recommendations' ? recommended : skippedList;
  const carouselPool = carousel ? (carousel.view === 'recommendations' ? recommended : skippedList) : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.target_major, c.gpa, c.student_email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [list, query]);

  const shortlist = async (c: CandidateRow) => {
    setBusyId(c.id);
    try {
      await setStatus(c.id, 'saved');
    } finally {
      setBusyId(null);
    }
  };

  const submitSkip = async (reasons: string[], note: string) => {
    const target = skipTarget;
    if (!target) return;
    setBusyId(target.id);
    try {
      await setStatus(target.id, 'skipped', { reasons, note });
      setSkipTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  // "Rerun search" — re-runs candidate discovery from the program's saved
  // preferences (same pipeline the chat uses) and leaves a note in the chat.
  const rerunSearch = async () => {
    if (searching || !activeProgram) return;
    setSearching(true);
    setSearchNote('');
    try {
      const deps: AgentDeps = { ...store, program: activeProgram, setWorking: () => undefined };
      const result = await discoverCandidates({}, deps);
      const note =
        result.added > 0
          ? `I searched again and added ${result.added} new candidate${result.added === 1 ? '' : 's'} to your Recommendations.`
          : `I searched again but found no new candidates — ${result.reason || 'try once more students have opted in on Scout'}.`;
      setSearchNote(note);
      appendLocalMessage({ role: 'assistant', content: note, actions: ['Reran the candidate search from your saved preferences'] });
      persistMessage({ role: 'assistant', content: note, actions: ['Reran the candidate search from your saved preferences'] }).catch(
        () => undefined
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      {/* Toolbar — search, view toggle, rerun (Jill's Candidates toolbar) */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2.5 border-b border-[var(--space-border-default)] space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--space-text-muted)] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--space-border-default)] bg-white text-sm outline-none focus:border-[var(--space-border-strong)] text-[var(--space-text-primary)] placeholder:text-[var(--space-text-muted)]"
            />
          </div>
          <button
            type="button"
            onClick={rerunSearch}
            disabled={searching}
            className={cn(
              'h-9 flex items-center gap-1.5 px-3 rounded-lg border border-[var(--space-border-default)] bg-white text-sm font-medium whitespace-nowrap transition-colors',
              typography.color.primary,
              searching ? 'opacity-60 cursor-wait' : 'hover:bg-[var(--space-surface-muted)] hover:border-[var(--space-border-strong)]'
            )}
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {searching ? 'Searching…' : 'Rerun search'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          {/* The two mutually exclusive sub-columns (PRD): Recommendations / Skipped */}
          <div className="flex items-center rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] p-0.5">
            {(['recommendations', 'skipped'] as ViewKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                  view === key
                    ? 'bg-white shadow-sm text-[var(--space-text-primary)] ring-1 ring-[var(--space-border-default)]'
                    : 'text-[var(--space-text-muted)] hover:text-[var(--space-text-secondary)]'
                )}
              >
                {key === 'recommendations'
                  ? `Recommendations${recommended.length ? ` · ${recommended.length}` : ''}`
                  : `Skipped${skippedList.length ? ` · ${skippedList.length}` : ''}`}
              </button>
            ))}
          </div>
          {searchNote && <p className={`text-xs truncate ${typography.color.muted}`}>{searchNote}</p>}
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-[var(--space-surface-page)]/40">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6">
            <Inbox className={cn('w-10 h-10 mb-3', tw.icon.muted)} />
            {query.trim() ? (
              <>
                <p className={`font-medium ${typography.color.primary}`}>No matches</p>
                <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>No candidates match "{query.trim()}".</p>
              </>
            ) : view === 'recommendations' ? (
              candidates.length === 0 ? (
                <>
                  <p className={`font-medium ${typography.color.primary}`}>No recommendations yet</p>
                  <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>
                    Chat with Alma — once it knows what you're looking for, candidates from Scout's opted-in students will land here.
                  </p>
                </>
              ) : (
                <>
                  <p className={`font-medium ${typography.color.primary}`}>All caught up!</p>
                  <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>
                    You've reviewed every recommendation. Ask Alma to find more candidates, or rerun the search above.
                  </p>
                </>
              )
            ) : (
              <>
                <p className={`font-medium ${typography.color.primary}`}>Nothing skipped</p>
                <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>
                  Candidates you pass on will be kept here in case you change your mind.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {filtered.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                busy={busyId === c.id}
                onOpen={() => setCarousel({ view, startId: c.id })}
                onSkip={() => setSkipTarget(c)}
                onShortlist={() => shortlist(c)}
              />
            ))}
          </div>
        )}
      </div>

      {carousel && <CandidateCarousel pool={carouselPool} startId={carousel.startId} onClose={() => setCarousel(null)} />}
      {skipTarget && (
        <SkipFeedbackModal
          candidate={skipTarget}
          onCancel={() => setSkipTarget(null)}
          onSubmit={submitSkip}
          busy={busyId === skipTarget.id}
        />
      )}
    </div>
  );
}

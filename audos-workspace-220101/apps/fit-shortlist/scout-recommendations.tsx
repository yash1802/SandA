// Scout — right column: Recommendations sub-section.
// Two toggleable views (Recommendations / Skipped), Jack-style grouped list,
// horizontal carousel modal with an action bottom bar, and the Not-for-me
// feedback modal.

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Inbox,
  Loader2,
  PartyPopper,
  X,
} from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { researchProgramDetails } from './scout-agent';
import { fetchProgramDetails, persistProgramDetails, useScout } from './scout-store';
import {
  FitReason,
  NOT_FOR_ME_OPTIONS,
  ProgramDetails,
  ProgramRow,
  asArr,
  dayLabel,
  getInitials,
  relativeStamp,
  tileColor,
} from './scout-types';

type ViewKey = 'recommendations' | 'skipped';

function universityLogoUrl(website?: string | null): string {
  if (!website) return '';
  try {
    const host = new URL(website).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return '';
  }
}

export function ProgramTile({ university, website, size = 'md' }: { university: string; website?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const dims = size === 'lg' ? 'w-14 h-14 rounded-xl text-lg' : size === 'sm' ? 'w-9 h-9 rounded-lg text-xs' : 'w-11 h-11 rounded-lg text-sm';
  const logoUrl = !imageFailed ? universityLogoUrl(website) : '';
  return (
    <div
      className={cn(dims, 'flex items-center justify-center font-semibold flex-shrink-0 overflow-hidden border border-[var(--space-border-default)] bg-white')}
      style={logoUrl ? undefined : { backgroundColor: tileColor(university), color: 'white' }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-2/3 h-2/3 object-contain" onError={() => setImageFailed(true)} />
      ) : (
        getInitials(university)
      )}
    </div>
  );
}

function cleanDisplayFact(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/\b(est|estimate|estimated|approx|approximately|around|check website|see website|visit website|varies|not specified|unknown|n\/a|tbd)\b/i.test(text)) return '';
  if (/^3\.0(?:\s+or\s+higher)?\s+recommended$/i.test(text)) return '';
  if (/^(sat\/act|sat or act)\s+optional$/i.test(text)) return '';
  return text;
}

// Compact verified-fact chips for list rows (only facts that survived the
// evidence checks are stored, so whatever exists here is safe to show).
function ProgramFactChips({ program }: { program: ProgramRow }) {
  const chips = [
    program.degree_type,
    cleanDisplayFact(program.duration),
    cleanDisplayFact(program.tuition),
    cleanDisplayFact(program.deadline) ? `Apply by ${cleanDisplayFact(program.deadline)}` : '',
  ]
    .map((c) => (c || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {chips.map((chip, i) => (
        <span
          key={i}
          className={`inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-[11px] font-medium max-w-[190px] truncate ${typography.color.secondary}`}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function LinkText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//i.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all hover:text-[var(--space-text-primary)]">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Not-for-me feedback modal (stacked above the carousel)

export function NotForMeModal({
  program,
  onCancel,
  onSubmit,
  busy,
}: {
  program: ProgramRow;
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
          <h3 className={`text-base font-semibold ${typography.color.primary}`}>Not for you — got it</h3>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)]" aria-label="Close">
            <X className="w-4 h-4 text-[var(--space-text-muted)]" />
          </button>
        </div>
        <p className={`text-sm mb-4 ${typography.color.secondary}`}>
          Why isn't {program.university} — {program.program_name} a fit? This sharpens future recommendations.
        </p>
        <div className="space-y-2 mb-4">
          {NOT_FOR_ME_OPTIONS.map((option) => {
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
          placeholder="Anything else? Tell Scout in your own words… (optional)"
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
// Verified details — deep-dive researched live from the university's own
// pages the first time a program is reviewed, then cached permanently.

const detailsCache = new Map<number, ProgramDetails>();
const detailsInFlight = new Map<number, Promise<ProgramDetails | null>>();

function loadDetails(email: string, program: ProgramRow): Promise<ProgramDetails | null> {
  const cached = detailsCache.get(program.id);
  if (cached) return Promise.resolve(cached);
  const inFlight = detailsInFlight.get(program.id);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const stored = await fetchProgramDetails(email, program.id);
    if (stored) return stored;
    const fresh = await researchProgramDetails(program);
    if (fresh) persistProgramDetails(email, program.id, fresh).catch(() => undefined);
    return fresh;
  })()
    .then((details) => {
      if (details) detailsCache.set(program.id, details);
      return details;
    })
    .finally(() => detailsInFlight.delete(program.id));
  detailsInFlight.set(program.id, promise);
  return promise;
}

function VerifiedDetails({ program }: { program: ProgramRow }) {
  const { email } = useScout();
  const [details, setDetails] = useState<ProgramDetails | null>(() => detailsCache.get(program.id) || null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loading = !details && !failed;

  useEffect(() => {
    let cancelled = false;
    setDetails(detailsCache.get(program.id) || null);
    setFailed(false);
    loadDetails(email, program)
      .then((d) => {
        if (cancelled) return;
        if (d) setDetails(d);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id, email, attempt]);

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-[var(--space-border-default)]">
        <h3 className={`text-sm font-semibold ${typography.color.primary}`}>Verified details</h3>
        <span className={`text-[11px] ${typography.color.muted}`}>from the university's website</span>
      </div>
      {loading && (
        <div className={`flex items-center gap-2 mt-3 text-sm ${typography.color.muted}`}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Checking {program.university}'s official pages…</span>
        </div>
      )}
      {failed && (
        <p className={`mt-3 text-sm ${typography.color.muted}`}>
          Couldn't verify extra details from the university's pages right now.{' '}
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="underline hover:text-[var(--space-text-primary)]"
          >
            Try again
          </button>
        </p>
      )}
      {details && (
        <>
          {details.sections.map((section) => (
            <div key={section.title} className="mt-3.5">
              <p className={`text-[13px] font-semibold ${typography.color.primary}`}>{section.title}</p>
              <ul className="mt-1.5 pl-5 space-y-1.5" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
                {section.bullets.map((bullet, i) => (
                  <li key={i} className={`text-sm leading-relaxed ${typography.color.secondary}`} style={{ display: 'list-item' }}>
                    {bullet.text}
                    {bullet.source && (
                      <a
                        href={bullet.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex ml-1.5 align-baseline text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)]"
                        aria-label="Source page"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {details.missing && <p className={`mt-3 text-[13px] italic ${typography.color.muted}`}>{details.missing}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
            <span className={`text-[11px] ${typography.color.muted}`}>Sources:</span>
            {details.sources.slice(0, 4).map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-[11px] max-w-[200px] hover:border-[var(--space-border-strong)] transition-colors ${typography.color.secondary}`}
              >
                <Globe className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{src.title}</span>
              </a>
            ))}
            <span className={`text-[11px] ${typography.color.muted}`}>· Checked {relativeStamp(details.generatedAt)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared program detail body (used by the carousel and the shortlist modal)

export function ProgramDetailBody({ program }: { program: ProgramRow }) {
  const fitReasons = asArr<FitReason>(program.fit_reasons as any);
  const facts: { label: string; value?: string | null }[] = [
    { label: 'Degree', value: program.degree_type },
    { label: 'Duration', value: cleanDisplayFact(program.duration) },
    { label: 'Tuition', value: cleanDisplayFact(program.tuition) },
    { label: 'Application deadline', value: cleanDisplayFact(program.deadline) },
    { label: 'Tests', value: cleanDisplayFact(program.tests) },
    { label: 'GPA threshold', value: cleanDisplayFact(program.gpa) },
  ];
  const knownFacts = facts.filter((f) => f.value && String(f.value).trim());
  const displayTuition = cleanDisplayFact(program.tuition);

  return (
    <>
      {/* Header card */}
      <div className="flex items-start gap-4">
        <ProgramTile university={program.university} website={program.website} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className={`text-xl font-semibold leading-snug ${typography.color.primary}`}>{program.program_name}</h2>
          <div className={`flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-sm ${typography.color.secondary}`}>
            <span className="font-medium">{program.university}</span>
            {program.location && (
              <>
                <span className="opacity-40">•</span>
                <span>{program.location}</span>
              </>
            )}
            {displayTuition && (
              <>
                <span className="opacity-40">•</span>
                <span>{displayTuition}</span>
              </>
            )}
            {program.website && (
              <>
                <span className="opacity-40">•</span>
                <a
                  href={program.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline hover:text-[var(--space-text-primary)]"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Program page
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {program.summary && (
        <p className={`mt-4 text-[15px] leading-relaxed whitespace-pre-line ${typography.color.primary}`}>
          <LinkText text={program.summary} />
        </p>
      )}

      {/* Program section */}
      <div className="mt-6">
        <h3 className={`text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>Program</h3>
        {knownFacts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3">
            {knownFacts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={typography.color.muted}>{f.label}</span>
                <span className={`text-right font-medium ${typography.color.primary}`}>{f.value}</span>
              </div>
            ))}
          </div>
        )}
        {program.website && (
          <a
            href={program.website}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--space-border-default)] bg-white hover:bg-[var(--space-surface-muted)] transition-colors',
              typography.color.primary
            )}
          >
            View program page
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Verified deep-dive details */}
      <VerifiedDetails program={program} />

      {/* Fit section */}
      <div className="mt-6">
        <h3 className={`text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>Fit</h3>
        {fitReasons.length === 0 ? (
          <p className={`mt-3 text-sm ${typography.color.muted}`}>Scout hasn't written fit notes for this program.</p>
        ) : (
          <div className="space-y-2.5 mt-3">
            {fitReasons.map((reason, i) => (
              <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--space-semantic-success)] flex-shrink-0" />
                  <p className={`text-sm font-semibold ${typography.color.primary}`}>{reason.title}</p>
                </div>
                <p className={`text-sm mt-1.5 leading-relaxed whitespace-pre-line ${typography.color.secondary}`}>
                  <LinkText text={reason.detail} />
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Carousel modal + action bottom bar

function ProgramCarousel({
  pool,
  startId,
  onClose,
}: {
  pool: ProgramRow[];
  startId: number;
  onClose: () => void;
}) {
  const { setStatus } = useScout();
  const startIndex = Math.max(0, pool.findIndex((p) => p.id === startId));
  const [index, setIndex] = useState(startIndex);
  const [busy, setBusy] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<ProgramRow | null>(null);

  // When an item leaves the pool the same index now points at the next program;
  // when the last item leaves, loop back to the first remaining one.
  useEffect(() => {
    if (pool.length > 0 && index >= pool.length) setIndex(0);
  }, [pool.length, index]);

  const current = pool.length > 0 ? pool[Math.min(index, pool.length - 1)] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (feedbackFor) return;
      if (e.key === 'Escape') onClose();
      if (!pool.length) return;
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % pool.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + pool.length) % pool.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pool.length, feedbackFor, onClose]);

  const shortlist = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await setStatus(current.id, 'saved');
    } finally {
      setBusy(false);
    }
  };

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

  const alreadySkipped = current?.status === 'skipped';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      {/* Dots + close */}
      <div className="relative flex items-center justify-center pt-4 pb-2 px-14 z-10">
        {pool.length > 0 && pool.length <= 12 ? (
          <div className="flex items-center gap-2">
            {pool.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setIndex(i)}
                className={cn('w-2 h-2 rounded-full transition-all', i === Math.min(index, pool.length - 1) ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70')}
                aria-label={`Go to program ${i + 1}`}
              />
            ))}
          </div>
        ) : pool.length > 12 ? (
          <span className="text-white/90 text-sm font-medium">{Math.min(index, pool.length - 1) + 1} / {pool.length}</span>
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

      {/* Card + arrows */}
      <div className="relative flex-1 min-h-0 flex items-stretch justify-center px-3 sm:px-16 pb-2 z-10">
        {pool.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + pool.length) % pool.length)}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white shadow-lg items-center justify-center hover:scale-105 transition-transform"
            aria-label="Previous program"
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
                  You skipped this program — you can still shortlist it.
                </div>
              )}
              <ProgramDetailBody program={current} />
            </div>
          ) : (
            <div className="h-full rounded-2xl bg-[var(--space-surface-page)] shadow-2xl flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-200">
              <div className="w-14 h-14 rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center mb-4">
                <PartyPopper className="w-7 h-7" />
              </div>
              <p className={`text-xl font-semibold ${typography.color.primary}`}>All caught up!</p>
              <p className={`text-sm mt-2 max-w-xs ${typography.color.secondary}`}>
                You've reviewed everything here. Ask Scout in the chat to find more programs.
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
            aria-label="Next program"
          >
            <ChevronRight className="w-5 h-5 text-[var(--space-text-primary)]" />
          </button>
        )}
      </div>

      {/* Action bottom bar */}
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
            title={alreadySkipped ? 'Already skipped' : 'Not for me'}
          >
            Not for me
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
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] font-sans">Esc</kbd> Close
          </span>
        </div>
      </div>

      {feedbackFor && (
        <NotForMeModal program={feedbackFor} onCancel={() => setFeedbackFor(null)} onSubmit={submitFeedback} busy={busy} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-section

export default function ScoutRecommendations() {
  const { recommended, skippedList, programs, unreadInvitationCount, setActiveTab } = useScout();
  const [view, setView] = useState<ViewKey>('recommendations');
  const [carousel, setCarousel] = useState<{ view: ViewKey; startId: number } | null>(null);

  const list = view === 'recommendations' ? recommended : skippedList;
  const carouselPool = carousel ? (carousel.view === 'recommendations' ? recommended : skippedList) : [];

  const groups = useMemo(() => {
    const byDay: { label: string; items: ProgramRow[] }[] = [];
    for (const p of list) {
      const label = dayLabel(view === 'recommendations' ? p.recommended_at || p.created_at : p.updated_at);
      const last = byDay[byDay.length - 1];
      if (last && last.label === label) last.items.push(p);
      else byDay.push({ label, items: [p] });
    }
    return byDay;
  }, [list, view]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--space-border-default)]">
        <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Recommendations</h1>
        <div className="flex items-center rounded-full border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] p-0.5">
          {(['recommendations', 'skipped'] as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium capitalize transition-colors',
                view === key ? 'bg-white shadow-sm text-[var(--space-text-primary)] ring-1 ring-[var(--space-border-default)]' : 'text-[var(--space-text-muted)] hover:text-[var(--space-text-secondary)]'
              )}
            >
              {key === 'recommendations' ? 'Recommendations' : `Skipped${skippedList.length ? ` · ${skippedList.length}` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {/* Unseen university invitations surface on the default view too */}
        {unreadInvitationCount > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('invitations')}
            className="w-full flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl border border-[var(--space-brand-primary-200)] bg-[var(--space-brand-primary-50)] text-left hover:brightness-[0.98] transition-all"
          >
            <span className="w-9 h-9 rounded-xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] flex items-center justify-center flex-shrink-0">
              <PartyPopper className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-semibold ${typography.color.primary}`}>
                {unreadInvitationCount === 1
                  ? 'A university invited you to apply!'
                  : `${unreadInvitationCount} universities invited you to apply!`}
              </span>
              <span className={`block text-xs mt-0.5 ${typography.color.secondary}`}>Open your Invitations to see the details.</span>
            </span>
            <ArrowRight className="w-4 h-4 flex-shrink-0 text-[var(--space-text-secondary)]" />
          </button>
        )}
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6">
            <Inbox className={cn('w-10 h-10 mb-3', tw.icon.muted)} />
            {view === 'recommendations' ? (
              programs.length === 0 ? (
                <>
                  <p className={`font-medium ${typography.color.primary}`}>No recommendations yet</p>
                  <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>
                    Chat with Scout — once it knows what you're looking for, web-sourced programs will land here.
                  </p>
                </>
              ) : (
                <>
                  <p className={`font-medium ${typography.color.primary}`}>All caught up!</p>
                  <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>
                    You've reviewed every recommendation. Ask Scout to find more programs.
                  </p>
                </>
              )
            ) : (
              <>
                <p className={`font-medium ${typography.color.primary}`}>Nothing skipped</p>
                <p className={`text-sm mt-1 max-w-xs ${typography.color.secondary}`}>Programs you pass on will be kept here in case you change your mind.</p>
              </>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="flex items-baseline gap-2 mb-2 px-0.5">
                <p className={`text-sm font-semibold ${typography.color.primary}`}>{group.label}</p>
                <p className={`text-xs ${typography.color.muted}`}>
                  {group.items.length} item{group.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--space-border-default)] bg-white divide-y divide-[var(--space-border-default)] overflow-hidden">
                {group.items.map((p) => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setCarousel({ view, startId: p.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setCarousel({ view, startId: p.id });
                    }}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-[var(--space-surface-muted)]/60 cursor-pointer transition-colors"
                  >
                    <ProgramTile university={p.university} website={p.website} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[15px] font-medium truncate ${typography.color.primary}`}>{p.program_name}</p>
                      <p className={`text-sm truncate ${typography.color.muted}`}>
                        {p.university}
                        {p.location ? ` · ${p.location}` : ''}
                      </p>
                      <ProgramFactChips program={p} />
                    </div>
                    <span
                      className={cn(
                        'hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium flex-shrink-0 border border-[var(--space-border-default)] bg-white',
                        typography.color.primary
                      )}
                    >
                      Review program
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {carousel && <ProgramCarousel pool={carouselPool} startId={carousel.startId} onClose={() => setCarousel(null)} />}
    </div>
  );
}

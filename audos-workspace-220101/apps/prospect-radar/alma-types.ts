// Alma — shared types, constants, and pure helpers for the university-side
// three-column interface (the counterpart of Scout, modeled on Jill).

export type CandidateStatus = 'recommended' | 'skipped' | 'saved' | 'contacted';
export type TabId = 'recommendations' | 'shortlist' | 'documents' | 'profile';
export type ProgramLevel = 'undergraduate' | 'graduate';

export const INTAKE_TERMS = ['Fall', 'Spring', 'Summer'] as const;

// ---------------------------------------------------------------------------
// Rows

export interface ProgramRow {
  id: number;
  user_email: string;
  name: string;
  level?: ProgramLevel | string | null;
  intakes?: string[] | string | null;
  campus_location?: string | null;
  brochure_url?: string | null;
  brochure_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FitReason {
  title: string;
  detail: string;
}

export interface SkipFeedback {
  reasons: string[];
  note: string;
}

// Snapshot of the Scout student's data that Alma renders in cards and modals.
export interface StudentSnapshot {
  email: string;
  name: string;
  headline: string;
  location: string;
  citizenship: string;
  citizenshipCountries?: Array<{ country_code: string; country_name: string; status: 'citizen' | 'permanent_resident' | 'neither' }>;
  programmeInterests?: string[];
  apprenticeshipOptIn?: boolean;
  apprenticeshipEligibleCountries?: string[];
  internationalOnly?: boolean;
  level: string; // the level of study the student is seeking
  gpaContext: string; // e.g. "MSc Management — London Business School"
  education: { institute: string; degree: string; field: string; grade: string; inProgress: boolean }[];
  work: { company: string; title: string; description: string }[];
  research: { title: string; venue: string }[];
  skills: string[];
  extracurriculars: { title: string; description: string }[];
  lookingFor: string;
  tests: string;
  budget: string;
}

export interface CandidateRow {
  id: number;
  user_email: string;
  program_id: number;
  student_email?: string | null;
  name?: string | null;
  target_major?: string | null;
  gpa?: string | null;
  match_score?: number | null;
  fit_reasons?: FitReason[] | string | null;
  student_json?: StudentSnapshot | string | null;
  status: CandidateStatus;
  skip_feedback?: SkipFeedback | string | null;
  recommended_at?: string | null;
  shortlisted_at?: string | null;
  contacted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type DocumentKind = 'brochure' | 'default_message' | 'upload';

export interface DocumentRow {
  id: number;
  user_email: string;
  program_id: number;
  name: string;
  kind: DocumentKind;
  url?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  uploaded_via?: string | null;
  text_content?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MessageAttachment {
  name: string;
  url: string;
}

export interface MessageRow {
  id: number;
  user_email: string;
  program_id: number;
  role: 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[] | string | null;
  actions?: string[] | string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Program profile (right column → Profile sub-section)

export type RankingSource = 'THE' | 'QS' | 'ARWU' | 'FT';

export interface RankingItem {
  source: RankingSource;
  scope: 'program' | 'university';
  rank: string;
  year: string;
}

export const CAPSTONE_OPTIONS = ['Project', 'Internship or Co-op', 'Thesis/Dissertation', 'Coursework only'] as const;

export interface ProgramOutcomes {
  placement3m: string;
  placement6m: string;
  employers: string[];
}

export interface ProgramProfile {
  // AI-generated fields (not manually editable per the PRD)
  summary: string;
  admissionsLookingFor: string;
  // Structured, manually editable fields
  city: string;
  country: string;
  rankings: RankingItem[];
  tuitionAnnual: string;
  durationMonths: string;
  intakes: string[];
  uniqueFeatures: string[];
  capstone: string;
  outcomes: ProgramOutcomes;
  scholarships: string;
  // Raw text of the most recently parsed brochure, kept so Alma can answer
  // from the prospectus in chat and re-derive profile sections on demand.
  brochureText?: string;
  brochureSourceUrl?: string;
  brochureParsedAt?: string;
  rankingsCheckedAt?: string;
}

export function emptyProfile(): ProgramProfile {
  return {
    summary: '',
    admissionsLookingFor: '',
    city: '',
    country: '',
    rankings: [],
    tuitionAnnual: '',
    durationMonths: '',
    intakes: [],
    uniqueFeatures: [],
    capstone: '',
    outcomes: { placement3m: '', placement6m: '', employers: [] },
    scholarships: '',
  };
}

const RANKING_SOURCES: RankingSource[] = ['THE', 'QS', 'ARWU', 'FT'];

export function normalizeProfile(raw: any): ProgramProfile {
  const base = emptyProfile();
  if (!raw || typeof raw !== 'object') return base;
  const str = (v: unknown, max = 400) => (v == null ? '' : String(v)).trim().slice(0, max);
  base.summary = str(raw.summary, 2000);
  base.admissionsLookingFor = str(raw.admissionsLookingFor, 1400);
  base.city = str(raw.city, 120);
  base.country = str(raw.country, 120);
  if (Array.isArray(raw.rankings)) {
    base.rankings = raw.rankings
      .map((r: any): RankingItem => ({
        source: RANKING_SOURCES.includes(r?.source) ? r.source : 'QS',
        scope: r?.scope === 'program' ? 'program' : 'university',
        rank: str(r?.rank, 60),
        year: str(r?.year, 12),
      }))
      .filter((r: RankingItem) => r.rank)
      .slice(0, 8);
  }
  base.tuitionAnnual = str(raw.tuitionAnnual, 200);
  base.durationMonths = str(raw.durationMonths, 80);
  if (Array.isArray(raw.intakes)) {
    base.intakes = raw.intakes.map((x: any) => str(x, 20)).filter(Boolean).slice(0, 4);
  }
  if (Array.isArray(raw.uniqueFeatures)) {
    base.uniqueFeatures = raw.uniqueFeatures.map((x: any) => str(x, 300)).filter(Boolean).slice(0, 12);
  }
  base.capstone = str(raw.capstone, 80);
  if (raw.outcomes && typeof raw.outcomes === 'object') {
    base.outcomes = {
      placement3m: str(raw.outcomes.placement3m, 120),
      placement6m: str(raw.outcomes.placement6m, 120),
      employers: Array.isArray(raw.outcomes.employers)
        ? raw.outcomes.employers.map((x: any) => str(x, 80)).filter(Boolean).slice(0, 15)
        : [],
    };
  }
  base.scholarships = str(raw.scholarships, 600);
  if (raw.brochureText) base.brochureText = String(raw.brochureText).slice(0, 15000);
  if (raw.brochureSourceUrl) base.brochureSourceUrl = str(raw.brochureSourceUrl, 400);
  if (raw.brochureParsedAt) base.brochureParsedAt = str(raw.brochureParsedAt, 40);
  if (raw.rankingsCheckedAt) base.rankingsCheckedAt = str(raw.rankingsCheckedAt, 40);
  return base;
}

// True when a brochure exists but its substance never made it into the
// profile — the signal to (re-)run the brochure parsing pipeline.
export function profileMissingBrochureSubstance(profile: ProgramProfile): boolean {
  return !profile.brochureParsedAt;
}

// "London, UK" → { city: "London", country: "UK" }. The campus location the
// representative gives at program creation seeds the profile's Location
// section. Single-token answers land in city; the last comma-separated part
// is treated as the country.
export function parseCampusLocation(campus?: string | null): { city: string; country: string } {
  const parts = String(campus || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return { city: '', country: '' };
  if (parts.length === 1) return { city: parts[0], country: '' };
  return { city: parts.slice(0, -1).join(', '), country: parts[parts.length - 1] };
}

// ---------------------------------------------------------------------------
// Search Brief — the factors Alma tracks when searching for candidates.
// Each factor has four fit buckets, editable both by Alma and manually.

export type BucketKey = 'excellent' | 'good' | 'borderline' | 'notAFit';
export type FactorKey = 'geography' | 'gpa' | 'extracurriculars' | 'research' | 'work' | 'leadership';
export type FactorBuckets = Record<BucketKey, string[]>;
export type BriefFactors = Record<FactorKey, FactorBuckets>;

export interface BriefData {
  factors: BriefFactors;
  updatedAt?: string;
}

export const FACTOR_DEFS: { key: FactorKey; label: string }[] = [
  { key: 'geography', label: 'Geographic region' },
  { key: 'gpa', label: 'GPA' },
  { key: 'extracurriculars', label: 'Extracurriculars' },
  { key: 'research', label: 'Research experience' },
  { key: 'work', label: 'Work experience' },
  { key: 'leadership', label: 'Leadership experience' },
];

// Bucket rows follow the Search-brief screenshot: colored label text on the
// left, tinted signal chips, and a dashed tinted "+ Add signal" per bucket.
export const BUCKET_DEFS: {
  key: BucketKey;
  label: string;
  dotClass: string;
  labelClass: string;
  chipClass: string;
  addClass: string;
}[] = [
  {
    key: 'excellent',
    label: 'Excellent Fit',
    dotClass: 'bg-emerald-500',
    labelClass: 'text-emerald-700',
    chipClass: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    addClass: 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-400 text-emerald-700',
  },
  {
    key: 'good',
    label: 'Good Fit',
    dotClass: 'bg-lime-500',
    labelClass: 'text-lime-700',
    chipClass: 'bg-lime-50 border-lime-100 text-lime-900',
    addClass: 'border-lime-200 bg-lime-50/40 hover:border-lime-400 text-lime-700',
  },
  {
    key: 'borderline',
    label: 'Borderline',
    dotClass: 'bg-amber-500',
    labelClass: 'text-amber-700',
    chipClass: 'bg-amber-50 border-amber-100 text-amber-900',
    addClass: 'border-amber-200 bg-amber-50/40 hover:border-amber-400 text-amber-700',
  },
  {
    key: 'notAFit',
    label: 'Not a Fit',
    dotClass: 'bg-slate-400',
    labelClass: 'text-[var(--space-text-primary)]',
    chipClass: 'bg-white border-[var(--space-border-default)] text-[var(--space-text-primary)] shadow-sm',
    addClass: 'border-[var(--space-border-strong)] hover:border-[var(--space-text-muted)] text-[var(--space-text-muted)]',
  },
];

export function emptyBuckets(): FactorBuckets {
  return { excellent: [], good: [], borderline: [], notAFit: [] };
}

export function emptyBrief(): BriefData {
  return {
    factors: {
      geography: emptyBuckets(),
      gpa: emptyBuckets(),
      extracurriculars: emptyBuckets(),
      research: emptyBuckets(),
      work: emptyBuckets(),
      leadership: emptyBuckets(),
    },
  };
}

export function normalizeBrief(raw: any): BriefData {
  const base = emptyBrief();
  const factors = raw && typeof raw === 'object' ? raw.factors : null;
  if (factors && typeof factors === 'object') {
    for (const def of FACTOR_DEFS) {
      const f = factors[def.key];
      if (!f || typeof f !== 'object') continue;
      for (const bucket of BUCKET_DEFS) {
        const list = f[bucket.key];
        if (Array.isArray(list)) {
          base.factors[def.key][bucket.key] = list
            .map((x: any) => String(x).trim())
            .filter(Boolean)
            .slice(0, 12);
        }
      }
    }
  }
  if (raw?.updatedAt) base.updatedAt = String(raw.updatedAt);
  return base;
}

export function briefIsEmpty(brief: BriefData): boolean {
  return FACTOR_DEFS.every((f) => BUCKET_DEFS.every((b) => brief.factors[f.key][b.key].length === 0));
}

// Conversational-reference detection: answers like "i already replied above"
// or "see my earlier message" carry no content of their own and must never be
// stored as an intake answer or filed into the brief. An answer counts as a
// non-answer when EVERY word in it is reference/filler vocabulary.
const REFERENCE_FILLER_TOKENS = new Set([
  'i', 'ive', 'im', 'we', 'weve', 'you', 'u', 'ur', 'me', 'my', 'mine', 'our', 'your',
  'have', 'has', 'had', 'did', 'do', 'done', 'can', 'could', 'will', 'would',
  'already', 'previously', 'earlier', 'before', 'above', 'below', 'prior', 'again',
  'replied', 'reply', 'answered', 'answer', 'answers', 'responded', 'response',
  'said', 'told', 'mentioned', 'stated', 'shared', 'gave', 'given', 'wrote', 'written', 'typed',
  'covered', 'explained', 'provided', 'know', 'knows',
  'see', 'check', 'refer', 'look', 'read', 'find', 'per',
  'as', 'like', 'same', 'it', 'this', 'that', 'them', 'there',
  'the', 'a', 'an', 'to', 'at', 'in', 'on', 'of', 'and', 'so', 'just', 'please', 'pls',
  'message', 'messages', 'msg', 'chat', 'conversation', 'question', 'questions',
  'text', 'thread', 'previous', 'last', 'earlier', 'up', 'scroll',
]);

export function isNonAnswerText(raw: string): boolean {
  const text = (raw || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 90) return false;
  const words = text.split(' ');
  if (/^(same as (above|before|earlier|previously|previous)|as (above|before|earlier)|ditto)$/.test(text)) return true;
  // Reference phrases pair a "said/replied/see" verb with a backwards pointer
  // ("above", "already", "earlier", "my previous message"...): require both so
  // ordinary short answers built from common words never match.
  const hasVerb = words.some((w) =>
    ['replied', 'reply', 'answered', 'answer', 'answers', 'responded', 'said', 'told', 'mentioned', 'stated', 'wrote', 'written', 'typed', 'covered', 'explained', 'see', 'check', 'refer', 'look', 'read', 'know', 'knows', 'gave', 'shared', 'provided'].includes(w)
  );
  const hasPointer = words.some((w) =>
    ['above', 'before', 'earlier', 'previously', 'already', 'previous', 'prior', 'last', 'same', 'up'].includes(w)
  );
  return hasVerb && hasPointer && words.every((w) => REFERENCE_FILLER_TOKENS.has(w));
}

// A brief entry must read like a keyword signal (1-5 words), never a sentence.
// Conservative on purpose: it only rejects clear garbage — reference filler,
// sentence-length text, fragments that end like prose, or entries that open
// with conversational lead-ins ("we are looking for...", "In addition to...").
const CHIP_LEADIN_RE = /^(i|i'm|im|i've|ive|we|we're|my|our|you|your|this|that|these|those|there|and|but|or|so|also|additionally|moreover|besides|in addition|as well)\s/i;

export function isKeywordChip(raw: string): boolean {
  const entry = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!entry || entry.length > 60) return false;
  const words = entry.split(' ');
  if (words.length > 5) return false;
  if (isNonAnswerText(entry)) return false;
  if (CHIP_LEADIN_RE.test(entry)) return false;
  // Prose fragments end with sentence punctuation; short abbreviations stay valid.
  if (words.length >= 3 && /[.!?]$/.test(entry)) return false;
  return true;
}

// Cleans a brief before every save: entries are trimmed and clipped to short
// keyword length, non-keyword entries (verbatim sentences, conversational
// filler) are dropped, and each factor is deduped case-insensitively ACROSS
// its four buckets (the higher-priority bucket keeps the entry), so the same
// signal can never appear twice in one section.
export function sanitizeBrief(brief: BriefData): BriefData {
  const next = normalizeBrief(JSON.parse(JSON.stringify(brief)));
  for (const factor of FACTOR_DEFS) {
    const seen = new Set<string>();
    for (const bucket of BUCKET_DEFS) {
      const cleaned: string[] = [];
      for (const raw of next.factors[factor.key][bucket.key]) {
        const entry = String(raw).replace(/\s+/g, ' ').trim().slice(0, 90);
        const key = entry.toLowerCase();
        if (!entry || seen.has(key) || !isKeywordChip(entry)) continue;
        seen.add(key);
        cleaned.push(entry);
      }
      next.factors[factor.key][bucket.key] = cleaned;
    }
  }
  if (brief.updatedAt) next.updatedAt = brief.updatedAt;
  return next;
}

export function briefHasInvalidEntries(brief: BriefData): boolean {
  return FACTOR_DEFS.some((f) =>
    BUCKET_DEFS.some((b) => brief.factors[f.key][b.key].some((entry) => !isKeywordChip(entry)))
  );
}

// ---------------------------------------------------------------------------
// Intake question checklist (state machine persisted in alma_state_snapshots)

// Pending tuition computation: the representative gave a per-credit price but
// the total credits (or the duration) needed for the formula is still missing.
export interface TuitionPending {
  perCredit?: number;
  totalCredits?: number;
  currency?: string;
}

export interface IntakeData {
  answers: Record<string, string>;
  tuitionPending?: TuitionPending | null;
  // Set once initial candidate discovery has been attempted for this program,
  // so an empty student pool doesn't retrigger discovery forever.
  discoveryRanAt?: string;
  completed?: boolean;
}

export function emptyIntake(): IntakeData {
  return { answers: {}, tuitionPending: null, completed: false };
}

export interface IntakeQuestion {
  id: string;
  text: string;
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'qualities',
    text: 'What are the most important things that you are looking for in a candidate (Examples: scholastic aptitude, extracurriculars, sports, leadership qualities, prior work experience, etc)?',
  },
  { id: 'regions', text: 'Are there any countries/regions that the program wants to primarily target?' },
  {
    id: 'thresholds',
    text: 'Are there any minimum thresholds for GPA or standardized tests? If yes, please state the thresholds for each.',
  },
  // Duration is asked BEFORE tuition on purpose — the annual-fee computation
  // rules need the program duration (PRD tuition logic).
  { id: 'duration', text: "Assuming full-time continuous enrollment, what is the program's duration (in years)?" },
  { id: 'tuition', text: "What is your program's annual tuition fee?" },
  { id: 'scholarships', text: 'Are there any scholarships available?' },
  {
    id: 'attractive',
    text: 'What makes this program attractive to students (Examples: prestige, ranking, exchange-student opportunities, study-abroad, co-op opportunities, being able to double major, etc)?',
  },
  { id: 'expectations', text: 'What can students expect to get out of the program? Please be as specific as possible.' },
];

// Follow-up asked only while an annual-fee computation is blocked on the
// total number of credits (PRD: ask the representative, never look it up).
export const TUITION_CREDITS_QUESTION: IntakeQuestion = {
  id: 'tuitionCredits',
  text: 'How many total credits does the program require? I need that to compute the annual tuition fee from the per-credit price.',
};

export function nextIntakeQuestion(intake: IntakeData): IntakeQuestion | null {
  const pending = intake.tuitionPending;
  if (pending?.perCredit && !pending.totalCredits && !intake.answers.tuition?.trim()) {
    return TUITION_CREDITS_QUESTION;
  }
  for (const q of INTAKE_QUESTIONS) {
    if (intake.answers[q.id]?.trim()) continue;
    return q;
  }
  return null;
}

export function intakeCompleted(intake: IntakeData): boolean {
  return INTAKE_QUESTIONS.every((q) => !!intake.answers[q.id]?.trim());
}

export function parseDurationYears(text: string): number {
  const t = (text || '').toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/);
  if (m) return parseFloat(m[1]);
  const monthMatch = t.match(/(\d+(?:\.\d+)?)\s*month/);
  if (monthMatch) return parseFloat(monthMatch[1]) / 12;
  const bare = t.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (bare) return parseFloat(bare[1]);
  return 0;
}

// ---------------------------------------------------------------------------
// Skip feedback options (multiple choice with checkboxes, PRD)

export const SKIP_OPTIONS = [
  "Candidate doesn't meet academic requirements",
  'Motivation misaligned',
  "Geographic region doesn't match our target",
  'Insufficient relevant experience',
];

// ---------------------------------------------------------------------------
// Shortlist columns (Saved is the default landing column; Contacted is final)

export const SHORTLIST_COLUMNS: { key: 'saved' | 'contacted'; label: string; accentClass: string }[] = [
  { key: 'saved', label: 'Saved', accentClass: 'text-amber-500' },
  { key: 'contacted', label: 'Contacted', accentClass: 'text-emerald-600' },
];

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  recommended: 'Recommended',
  skipped: 'Skipped',
  saved: 'Saved',
  contacted: 'Contacted',
};

// ---------------------------------------------------------------------------
// JSON helpers

export function asObj<T>(value: T[] | T | string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function asArr<T>(value: T[] | string | null | undefined): T[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

export function extractJson(content: string): any | null {
  if (!content) return null;
  const cleaned = content.replace(/```json|```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

// Rescue the human-readable reply out of a malformed {"reply": "..."} payload.
export function rescueReply(content: string): string | null {
  const m = content.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

// ---------------------------------------------------------------------------
// Display helpers

// Jill-style match badge: "94% · Exceptional" — the percentage (PRD) plus a
// tier word, tinted like the reference cards (violet for the top tier, amber
// for excellent, cooler tones below).
export function matchTier(score?: number | null): { label: string; chipClass: string } | null {
  if (score == null) return null;
  if (score >= 90)
    return { label: 'Exceptional', chipClass: 'bg-violet-50 border-violet-200 text-violet-700' };
  if (score >= 75) return { label: 'Excellent', chipClass: 'bg-amber-50 border-amber-200 text-amber-800' };
  if (score >= 60) return { label: 'Good', chipClass: 'bg-sky-50 border-sky-200 text-sky-800' };
  return {
    label: 'Possible',
    chipClass: 'bg-[var(--space-surface-muted)] border-[var(--space-border-default)] text-[var(--space-text-secondary)]',
  };
}

// Short education-level tag for the card's GPA ("MSc Management — LBS" → "MSc Management").
export function gpaShortContext(gpaContext?: string | null): string {
  return (gpaContext || '').split(' — ')[0].trim();
}

export function getInitials(label: string): string {
  const parts = (label || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

const TILE_COLORS = ['#0f172a', '#7c3aed', '#0ea5e9', '#16a34a', '#ea580c', '#db2777', '#4f46e5', '#0d9488'];

export function tileColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < (label || '').length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function daysAgo(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000));
}

// Jill-style date separators: "Today", "Yesterday", "Tuesday, Jul 7", "Jun 20".
export function dayLabel(iso?: string | null): string {
  if (!iso) return 'Today';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Today';
  const diff = daysAgo(iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// Compact relative stamp for cards: "Today", "Yesterday", "4d ago", then dates.
export function relativeStamp(iso?: string | null): string {
  if (!iso) return '—';
  const diff = daysAgo(iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  return dayLabel(iso);
}

// "Updated 10h ago" style stamp for document cards.
export function timeAgo(iso?: string | null): string {
  if (!iso) return 'just now';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 60000) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dayLabel(iso);
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTextFile(nameOrType: string): boolean {
  return /(^text\/)|(\.txt$)|(\.md$)/i.test(nameOrType || '');
}

export function isPdfFile(nameOrType: string): boolean {
  return /(application\/pdf)|(\.pdf$)/i.test(nameOrType || '');
}

// ---------------------------------------------------------------------------
// Injected WorkspaceDB SDK globals (provided by the platform at compile time)

declare global {
  interface Window {
    __workspaceDb: any;
    __APP_ID__?: string;
    __WORKSPACE_ID__?: string;
  }
}

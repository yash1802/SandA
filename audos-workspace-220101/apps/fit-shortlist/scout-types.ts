// Scout — shared types, constants, and pure helpers for the Jack-style interface.

export type ProgramStatus = 'recommended' | 'skipped' | 'saved' | 'safe' | 'target' | 'dream';
export type BoardStatus = 'saved' | 'safe' | 'target' | 'dream';
export type TabId = 'recommendations' | 'shortlist' | 'documents' | 'profile';

export const BOARD_STATUSES: BoardStatus[] = ['saved', 'safe', 'target', 'dream'];

export function isBoardStatus(status: string): status is BoardStatus {
  return (BOARD_STATUSES as string[]).includes(status);
}

export interface FitReason {
  title: string;
  detail: string;
}

export interface SkipFeedback {
  reasons: string[];
  note: string;
}

export interface ProgramRow {
  id: number;
  user_email: string;
  university: string;
  program_name: string;
  degree_type?: string | null;
  location?: string | null;
  tuition?: string | null;
  deadline?: string | null;
  tests?: string | null;
  gpa?: string | null;
  duration?: string | null;
  website?: string | null;
  summary?: string | null;
  fit_reasons?: FitReason[] | string | null;
  status: ProgramStatus;
  skip_feedback?: SkipFeedback | string | null;
  recommended_at?: string | null;
  shortlisted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentRow {
  id: number;
  user_email: string;
  name: string;
  kind: 'resume' | 'upload';
  url?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  uploaded_via?: string | null;
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
  role: 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[] | string | null;
  actions?: string[] | string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Profile

export interface EducationItem {
  institute: string;
  degree: string;
  field: string;
  grade: string;
  startYear: string;
  endYear: string;
  inProgress: boolean;
  aiSummary: string;
}

export interface WorkItem {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  aiSummary: string;
}

export interface ResearchItem {
  title: string;
  venue: string;
  date: string;
  url: string;
  aiSummary: string;
}

export interface ExtraItem {
  title: string;
  description: string;
  aiSummary: string;
}

export interface MiscItem {
  title: string;
  detail: string;
}

export interface ProfileData {
  name: string;
  headline: string;
  location: string;
  visible: boolean;
  bio: string;
  lookingFor: string;
  education: EducationItem[];
  work: WorkItem[];
  research: ResearchItem[];
  skills: string[];
  skillsSummary: string;
  extracurriculars: ExtraItem[];
  misc: MiscItem[];
}

export function emptyProfile(name = ''): ProfileData {
  return {
    name,
    headline: '',
    location: '',
    visible: false,
    bio: '',
    lookingFor: '',
    education: [],
    work: [],
    research: [],
    skills: [],
    skillsSummary: '',
    extracurriculars: [],
    misc: [],
  };
}

// ---------------------------------------------------------------------------
// Search Brief

export type BucketKey = 'excellent' | 'good' | 'borderline' | 'notAFit';
export type FactorKey = 'majors' | 'ranking' | 'location' | 'budget' | 'postStudyRole';
export type FactorBuckets = Record<BucketKey, string[]>;
export type BriefFactors = Record<FactorKey, FactorBuckets>;

export interface BriefData {
  factors: BriefFactors;
  updatedAt?: string;
}

export const FACTOR_DEFS: { key: FactorKey; label: string }[] = [
  { key: 'majors', label: 'Majors' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'location', label: 'Location' },
  { key: 'budget', label: 'Budget' },
  { key: 'postStudyRole', label: 'Post-study job role' },
];

export const BUCKET_DEFS: { key: BucketKey; label: string; dotClass: string }[] = [
  { key: 'excellent', label: 'Excellent fit', dotClass: 'bg-emerald-500' },
  { key: 'good', label: 'Good fit', dotClass: 'bg-sky-500' },
  { key: 'borderline', label: 'Borderline', dotClass: 'bg-amber-500' },
  { key: 'notAFit', label: 'Not a fit', dotClass: 'bg-red-500' },
];

export function emptyBuckets(): FactorBuckets {
  return { excellent: [], good: [], borderline: [], notAFit: [] };
}

export function emptyBrief(): BriefData {
  return {
    factors: {
      majors: emptyBuckets(),
      ranking: emptyBuckets(),
      location: emptyBuckets(),
      budget: emptyBuckets(),
      postStudyRole: emptyBuckets(),
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
  return FACTOR_DEFS.every((f) =>
    BUCKET_DEFS.every((b) => brief.factors[f.key][b.key].length === 0)
  );
}

// ---------------------------------------------------------------------------
// Intake question checklist (state machine persisted in scout_user_state.intake_json)

export interface IntakeData {
  answers: Record<string, string>;
  programLevel?: 'undergraduate' | 'graduate' | '';
  completed?: boolean;
}

export function emptyIntake(): IntakeData {
  return { answers: {}, programLevel: '', completed: false };
}

export interface IntakeQuestion {
  id: string;
  text: string;
  gradOnly?: boolean;
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { id: 'majors', text: 'What majors are you interested in?' },
  { id: 'level', text: 'Are you interested in undergraduate or graduate programs?' },
  {
    id: 'motivations',
    text: 'What are your primary reasons for pursuing higher education (Universities often want to know what motivated an applicant)?',
    gradOnly: true,
  },
  { id: 'locations', text: 'What locations are you keen on (cities, countries, regions, etc)?' },
  { id: 'budget', text: 'What is your budget for tuition (in USD)?' },
  {
    id: 'tests',
    text: 'Have you taken any standardized tests (SAT, ACT, TOEFL, IELTS, GRE, GMAT, etc)? If yes, which ones and what was your score? If not, then are you planning to take any?',
  },
  {
    id: 'citizenship',
    text: 'What countries are you a citizen of (This helps us pitch you better to universities that are looking for international students, if applicable)?',
  },
  {
    id: 'outcomes',
    text: 'What are you expecting to get out of your education (Examples: employment, entrepreneurship, family business, research and academia, preparation for further studies, etc)?',
  },
  {
    id: 'priorities',
    text: 'What are the most important things that you are looking for in a university program (Examples: prestige, ranking, exchange-student opportunities, study-abroad, co-op opportunities, being able to double major, etc)?',
  },
  { id: 'existingShortlist', text: 'Have you already shortlisted any programs? If yes, please tell us what they are.' },
  {
    id: 'visibility',
    text: "We must ask this for privacy compliance, would you like us to make your profile visible to universities on our platform? Be advised that if visibility is turned off, universities on our platform won't be able to reach out to you.",
  },
];

export function questionApplies(q: IntakeQuestion, intake: IntakeData): boolean {
  if (!q.gradOnly) return true;
  // Grad-only questions are skipped for undergraduates; still pending while level is unknown.
  return intake.programLevel !== 'undergraduate';
}

export function nextIntakeQuestion(intake: IntakeData): IntakeQuestion | null {
  for (const q of INTAKE_QUESTIONS) {
    if (intake.answers[q.id]?.trim()) continue;
    if (q.gradOnly) {
      // Only ask motivations once we know the student wants graduate programs.
      if (intake.programLevel === 'graduate') return q;
      continue;
    }
    return q;
  }
  return null;
}

export function intakeCompleted(intake: IntakeData): boolean {
  return INTAKE_QUESTIONS.every((q) => {
    if (q.gradOnly && intake.programLevel !== 'graduate') return true;
    return !!intake.answers[q.id]?.trim();
  });
}

export function sniffProgramLevel(text: string): 'undergraduate' | 'graduate' | '' {
  const t = (text || '').toLowerCase();
  const grad = /(graduate|grad school|master|msc|m\.s|mba|phd|doctora|postgrad)/.test(t);
  const undergrad = /(undergrad|bachelor|b\.s|bsc|ba\b|freshman|high school)/.test(t);
  if (grad && !undergrad) return 'graduate';
  if (undergrad && !grad) return 'undergraduate';
  return '';
}

// ---------------------------------------------------------------------------
// "Not for me" feedback options (PRD-verbatim)

export const NOT_FOR_ME_OPTIONS = [
  "University doesn't match my expectations",
  "The program doesn't match my expectations",
  "Location doesn't work for me",
  'The Tuition is out of my budget',
];

// ---------------------------------------------------------------------------
// Shortlist board columns

export const BOARD_COLUMNS: { key: BoardStatus; label: string; accentClass: string }[] = [
  { key: 'saved', label: 'Saved', accentClass: 'text-amber-500' },
  { key: 'safe', label: 'Safe', accentClass: 'text-emerald-600' },
  { key: 'target', label: 'Target', accentClass: 'text-sky-600' },
  { key: 'dream', label: 'Dream', accentClass: 'text-violet-600' },
];

export const STATUS_LABELS: Record<ProgramStatus, string> = {
  recommended: 'Recommended',
  skipped: 'Skipped',
  saved: 'Saved',
  safe: 'Safe',
  target: 'Target',
  dream: 'Dream',
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

// Jack-style date separators: "Today", "Yesterday", "Tuesday, Jul 7", "Jun 20".
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

// ---------------------------------------------------------------------------
// Injected WorkspaceDB SDK globals (provided by the platform at compile time)

declare global {
  interface Window {
    __workspaceDb: any;
    __APP_ID__?: string;
    __WORKSPACE_ID__?: string;
  }
}

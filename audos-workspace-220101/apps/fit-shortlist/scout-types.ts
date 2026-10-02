// Scout — shared types, constants, and pure helpers for the Jack-style interface.

export type ProgramStatus = 'recommended' | 'skipped' | 'saved' | 'safe' | 'target' | 'dream';
export type BoardStatus = 'saved' | 'safe' | 'target' | 'dream';
export type TabId = 'recommendations' | 'shortlist' | 'documents' | 'profile' | 'invitations';

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
  program_type?: 'undergrad' | 'masters' | 'apprenticeship' | string | null;
  country_code?: string | null;
  country_name?: string | null;
  company_name?: string | null;
  eligibility_notes?: string | null;
  active_status?: 'active' | 'uncertain' | 'inactive' | string | null;
  last_seen_active?: string | null;
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

// Versioning contract for uploads: a new document of the SAME category
// replaces the previous one (a fresh resume supersedes the old resume), while
// different categories (resume vs. GMAT report) live side by side. Category
// is derived from the stored kind plus filename signals; unrecognized files
// fall back to their normalized filename, so unrelated uploads never collide.
export function documentCategory(name: string, kind: string): string {
  if (kind === 'resume') return 'resume';
  const n = ` ${(name || '').toLowerCase().replace(/[_\-.]+/g, ' ').trim()} `;
  if (/\b(resume|cv|curriculum vitae)\b/.test(n)) return 'resume';
  // One score report per test: a GMAT retake replaces the old GMAT file, but
  // never touches GRE/TOEFL/... files. Docs that can legitimately exist in
  // multiples (transcripts, SOPs, recommendation letters) are NOT collapsed —
  // they replace only when the filename is the same document re-uploaded.
  for (const test of ['gmat', 'gre', 'toefl', 'ielts', 'sat', 'act', 'pte', 'duolingo', 'lsat', 'mcat']) {
    if (n.includes(` ${test} `)) return `test:${test}`;
  }
  if (/\bpassport\b/.test(n)) return 'passport';
  const base = n.replace(/ (pdf|doc|docx|txt|png|jpg|jpeg)\s*$/i, '').replace(/\s*\(?\d+\)?\s*$/, '').trim();
  return `file:${base || n.trim()}`;
}

// Newest-per-category view of the raw rows (rows must arrive newest-first).
// A kept row claims BOTH its category and its exact filename, so a re-upload
// of the same file always supersedes even when the two rows carry different
// kinds (e.g. an old resume-tagged row vs. a fresh plain upload of it).
export function dedupeDocumentsByCategory(rows: DocumentRow[]): DocumentRow[] {
  const seen = new Set<string>();
  const out: DocumentRow[] = [];
  for (const row of rows) {
    const name = (row.name || '').trim().toLowerCase();
    const nameKey = name ? `name:${name}` : '';
    const catKey = `cat:${documentCategory(row.name, row.kind)}`;
    if ((nameKey && seen.has(nameKey)) || seen.has(catKey)) continue;
    if (nameKey) seen.add(nameKey);
    seen.add(catKey);
    out.push(row);
  }
  return out;
}

// One "invitation to apply" pushed from a university's Alma account into this
// student's Scout account (rows live in scout_application_requests).
export interface InvitationRow {
  id: number;
  student_email: string;
  university_email?: string | null;
  university_name?: string | null;
  program_id?: number | null;
  program_name?: string | null;
  program_level?: string | null;
  campus_location?: string | null;
  message?: string | null;
  status?: string | null; // sent | read
  sent_at?: string | null;
  created_at?: string;
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

export type BioGenerationStatus = 'pending' | 'ready' | 'failed';

export interface BioGenerationState {
  revision: string;
  status: BioGenerationStatus;
  attemptedAt?: string;
  completedAt?: string;
  errorCode?: string;
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
  // Durable status for the factual Profile revision that owns the Bio.
  // Kept inside profile_json so interrupted generation is observable on reload.
  bioGeneration?: BioGenerationState;
  // Raw text of the most recently parsed resume, kept so Scout can always
  // answer from the resume in chat and re-derive profile sections on demand.
  resumeText?: string;
  resumeSourceUrl?: string;
  resumeParsedAt?: string;
}

// Canonical source facts that determine the Bio. Visibility, search preferences,
// AI summaries, and resume bookkeeping are deliberately excluded so those
// changes never create an unnecessary generation request.
export function profileFactsForBio(profile: ProfileData) {
  return {
    name: profile.name,
    headline: profile.headline,
    location: profile.location,
    education: profile.education.map(({ aiSummary: _aiSummary, ...item }) => item),
    work: profile.work.map(({ aiSummary: _aiSummary, ...item }) => item),
    research: profile.research.map(({ aiSummary: _aiSummary, ...item }) => item),
    skills: profile.skills,
    extracurriculars: profile.extracurriculars.map(({ aiSummary: _aiSummary, ...item }) => item),
    misc: profile.misc,
  };
}

export function profileFactsKey(profile: ProfileData): string {
  return JSON.stringify(profileFactsForBio(profile));
}

export function profileHasBioFacts(profile: ProfileData): boolean {
  return !!(
    profile.headline.trim() ||
    profile.location.trim() ||
    profile.education.length ||
    profile.work.length ||
    profile.research.length ||
    profile.skills.length ||
    profile.extracurriculars.length ||
    profile.misc.length
  );
}

// True when a resume exists but its substance never made it into the profile
// (e.g. only education was captured) — the signal to re-run resume parsing.
export function profileMissingResumeSubstance(profile: ProfileData): boolean {
  return profile.work.length === 0 && profile.skills.length === 0 && profile.extracurriculars.length === 0;
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

// chipClass/addClass power the manually editable brief rows (tinted signal
// chips and the dashed "+ Add" per bucket, matching Alma's Search-brief UI).
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
    label: 'Excellent fit',
    dotClass: 'bg-emerald-500',
    labelClass: 'text-emerald-700',
    chipClass: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    addClass: 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-400 text-emerald-700',
  },
  {
    key: 'good',
    label: 'Good fit',
    dotClass: 'bg-sky-500',
    labelClass: 'text-sky-700',
    chipClass: 'bg-sky-50 border-sky-100 text-sky-900',
    addClass: 'border-sky-200 bg-sky-50/40 hover:border-sky-400 text-sky-700',
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
    label: 'Not a fit',
    dotClass: 'bg-red-500',
    labelClass: 'text-red-700',
    chipClass: 'bg-red-50 border-red-100 text-red-900',
    addClass: 'border-red-200 bg-red-50/40 hover:border-red-400 text-red-700',
  },
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

// A brief entry must read like a keyword chip (1-5 words), never a sentence.
// Conservative on purpose: it only rejects clear garbage — reference filler,
// sentence-length text, fragments that end like prose, or entries that open
// with conversational lead-ins ("I am open to...", "In addition to...").
const CHIP_LEADIN_RE = /^(i|i'm|im|i've|ive|we|we're|my|our|you|your|this|that|these|those|there|and|but|or|so|also|additionally|moreover|besides|in addition|as well)\s/i;

export function isKeywordChip(raw: string): boolean {
  const entry = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!entry || entry.length > 60) return false;
  const words = entry.split(' ');
  if (words.length > 5) return false;
  if (isNonAnswerText(entry)) return false;
  if (CHIP_LEADIN_RE.test(entry)) return false;
  // "MS in Management programs as well." — prose fragments end with sentence
  // punctuation; short abbreviations ("U.S.") stay valid.
  if (words.length >= 3 && /[.!?]$/.test(entry)) return false;
  return true;
}

// Cleans a brief before every save: entries are trimmed and clipped to short
// keyword length, non-keyword entries (verbatim sentences, conversational
// filler) are dropped, and each factor is deduped case-insensitively ACROSS
// its four buckets (the higher-priority bucket keeps the entry), so the same
// keyword can never appear twice in one section.
export function sanitizeBrief(brief: BriefData): BriefData {
  const next = normalizeBrief(JSON.parse(JSON.stringify(brief)));
  for (const factor of FACTOR_DEFS) {
    const seen = new Set<string>();
    for (const bucket of BUCKET_DEFS) {
      const cleaned: string[] = [];
      for (const raw of next.factors[factor.key][bucket.key]) {
        const entry = String(raw).replace(/\s+/g, ' ').trim().slice(0, 80);
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
// Intake question checklist (state machine persisted in scout_user_state.intake_json)

export type ResidencyStatus = 'citizen' | 'permanent_resident' | 'neither';

export interface CountryResidency {
  country_code: string;
  country_name: string;
  status: ResidencyStatus;
}

export interface IntakeData {
  answers: Record<string, string>;
  programLevel?: 'undergraduate' | 'graduate' | '';
  programmeInterests?: Array<'undergrad' | 'masters' | 'apprenticeships'>;
  citizenshipCountries?: CountryResidency[];
  apprenticeshipOptIn?: boolean;
  apprenticeshipEligibleCountries?: string[];
  internationalOnly?: boolean;
  completed?: boolean;
  // Ids of scout_application_requests rows the student has already seen.
  // Kept in the durable state snapshot because in-place row updates proved
  // unreliable across sessions.
  readInvitationIds?: number[];
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
  { id: 'majors', text: 'What subjects or career areas are you interested in?' },
  {
    id: 'level',
    text: "Which routes would you like Scout to explore? Choose any combination: undergraduate programmes, master's programmes, and apprenticeships.",
  },
  {
    id: 'motivations',
    text: 'What are your primary reasons for pursuing higher education? For example: changing careers into a new industry, deepening technical expertise, qualifying for a professional designation like the CFA, gaining international experience, or following a specific research interest.',
    gradOnly: true,
  },
  { id: 'locations', text: 'What locations are you keen on (cities, countries, regions, etc)?' },
  { id: 'budget', text: 'What is your annual tuition budget (in USD)?' },
  {
    id: 'tests',
    text: 'Have you taken any standardized tests (SAT, ACT, TOEFL, IELTS, GRE, GMAT, etc)? If yes, which ones and what was your score? If not, then are you planning to take any?',
  },
  {
    id: 'citizenship',
    text: 'Tell me every country that applies to you and your status in each one: citizen, permanent resident, or neither. You can list as many as needed — for example, “UK citizen; US permanent resident; Canada neither”. This determines which local apprenticeship schemes you may be eligible for.',
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

const COUNTRY_ALIASES: Array<{ code: string; name: string; re: RegExp }> = [
  { code: 'GB', name: 'United Kingdom', re: /\b(uk|u\.k\.|united kingdom|britain|british|england|scotland|wales)\b/i },
  { code: 'US', name: 'United States', re: /\b(us|u\.s\.|usa|u\.s\.a\.|united states|american)\b/i },
  { code: 'CA', name: 'Canada', re: /\b(canada|canadian)\b/i },
  { code: 'AU', name: 'Australia', re: /\b(australia|australian)\b/i },
  { code: 'NZ', name: 'New Zealand', re: /\b(new zealand|kiwi)\b/i },
  { code: 'IE', name: 'Ireland', re: /\b(ireland|irish)\b/i },
  { code: 'DE', name: 'Germany', re: /\b(germany|german)\b/i },
  { code: 'FR', name: 'France', re: /\b(france|french)\b/i },
  { code: 'NL', name: 'Netherlands', re: /\b(netherlands|dutch)\b/i },
  { code: 'CH', name: 'Switzerland', re: /\b(switzerland|swiss)\b/i },
  { code: 'AT', name: 'Austria', re: /\b(austria|austrian)\b/i },
  { code: 'ES', name: 'Spain', re: /\b(spain|spanish)\b/i },
  { code: 'IT', name: 'Italy', re: /\b(italy|italian)\b/i },
  { code: 'SE', name: 'Sweden', re: /\b(sweden|swedish)\b/i },
  { code: 'NO', name: 'Norway', re: /\b(norway|norwegian)\b/i },
  { code: 'DK', name: 'Denmark', re: /\b(denmark|danish)\b/i },
  { code: 'FI', name: 'Finland', re: /\b(finland|finnish)\b/i },
  { code: 'IN', name: 'India', re: /\b(india|indian)\b/i },
  { code: 'SG', name: 'Singapore', re: /\b(singapore|singaporean)\b/i },
  { code: 'ZA', name: 'South Africa', re: /\b(south africa|south african)\b/i },
  { code: 'AE', name: 'United Arab Emirates', re: /\b(uae|united arab emirates|emirati)\b/i },
  { code: 'BR', name: 'Brazil', re: /\b(brazil|brazilian)\b/i },
  { code: 'MX', name: 'Mexico', re: /\b(mexico|mexican)\b/i },
];

export function parseProgrammeInterests(raw: string): Array<'undergrad' | 'masters' | 'apprenticeships'> {
  const text = String(raw || '').toLowerCase();
  const out: Array<'undergrad' | 'masters' | 'apprenticeships'> = [];
  if (/undergrad|bachelor|university/.test(text)) out.push('undergrad');
  if (/master|graduate|postgrad|mba|msc/.test(text)) out.push('masters');
  if (/apprenti|degree\s+apprentice|earn\s+and\s+learn/.test(text)) out.push('apprenticeships');
  return out;
}

export function parseCountryResidencies(raw: string): CountryResidency[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  const segments = text.split(/\s*(?:;|,|\band\b|\balso\b)\s*/i).filter(Boolean);
  const matches: Array<CountryResidency & { index: number }> = [];
  for (const country of COUNTRY_ALIASES) {
    const match = country.re.exec(text);
    if (!match) continue;
    const segment = segments.find((part) => country.re.test(part)) || text.slice(match.index, match.index + match[0].length + 24);
    const status: ResidencyStatus = /\b(permanent\s+resident|permanent\s+residency|green\s+card|pr)\b/i.test(segment)
      ? 'permanent_resident'
      : /\b(neither|no\s+(?:citizenship|status|residency)|international(?:\s+only)?)\b/i.test(segment)
        ? 'neither'
        : 'citizen';
    matches.push({ country_code: country.code, country_name: country.name, status, index: match.index });
  }
  return matches.sort((a, b) => a.index - b.index).map(({ index: _index, ...entry }) => entry);
}

export function normalizeIntakeEligibility(intake: IntakeData): IntakeData {
  const programmeRaw = intake.answers.programmeTypes || intake.answers.level || '';
  const citizenshipRaw = intake.answers.citizenshipResidency || intake.answers.citizenship || '';
  const programmeInterests = parseProgrammeInterests(programmeRaw);
  const citizenshipCountries = parseCountryResidencies(citizenshipRaw);
  const apprenticeshipEligibleCountries = citizenshipCountries
    .filter((entry) => entry.status === 'citizen' || entry.status === 'permanent_resident')
    .map((entry) => entry.country_code);
  return {
    ...intake,
    programmeInterests,
    citizenshipCountries,
    apprenticeshipOptIn: programmeInterests.includes('apprenticeships'),
    apprenticeshipEligibleCountries: Array.from(new Set(apprenticeshipEligibleCountries)),
    internationalOnly:
      apprenticeshipEligibleCountries.length === 0 &&
      (citizenshipCountries.length > 0 || /\b(international\s+only|no\s+(?:citizenship|permanent\s+residency|local\s+status)|neither\s+anywhere|none)\b/i.test(citizenshipRaw)),
  };
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
// Verified program deep-dive details (researched from the university's own
// pages when a student reviews a program; every bullet is evidence-checked)

export interface DetailBullet {
  text: string;
  source?: string; // URL of the official page that supports this bullet
}

export interface DetailSection {
  title: string;
  bullets: DetailBullet[];
}

export interface ProgramDetails {
  sections: DetailSection[];
  sources: { title: string; url: string }[];
  missing?: string; // honest note about what the university's pages don't state
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Display helpers

export function toTitleCaseName(label: string): string {
  return (label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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

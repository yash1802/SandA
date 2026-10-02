// Alma — agentic engine.
//
// Reliability model (mirrors Scout): anything that MUST happen — capturing
// answers, the annual-tuition computation, updating the brief, parsing the
// brochure, running candidate searches — is done deterministically in code
// around the LLM, not by hoping the chat model emits the right action. The
// chat model writes the human reply and may emit supplementary actions; a
// deterministic extraction pre-pass captures state from every user message
// first, and guards catch "hold on…" style stalls.

import {
  BUCKET_DEFS,
  BriefData,
  CAPSTONE_OPTIONS,
  CandidateRow,
  CandidateStatus,
  DocumentRow,
  FACTOR_DEFS,
  FactorKey,
  FitReason,
  INTAKE_QUESTIONS,
  IntakeData,
  MessageRow,
  ProgramProfile,
  ProgramRow,
  RankingItem,
  SkipFeedback,
  StudentSnapshot,
  TuitionPending,
  asArr,
  briefHasInvalidEntries,
  extractJson,
  intakeCompleted,
  isKeywordChip,
  isNonAnswerText,
  nextIntakeQuestion,
  normalizeBrief,
  normalizeProfile,
  parseCampusLocation,
  parseDurationYears,
  rescueReply,
  sanitizeBrief,
} from './alma-types';
import { NewCandidate, analyzeDocument, db, llmChat, webSearch } from './alma-store';
import { SourcedStudent, fetchOptedInScoutStudents } from './alma-scout-bridge';

export interface AgentDeps {
  email: string;
  displayName: string;
  institutionName: string;
  program: ProgramRow;
  intake: IntakeData;
  brief: BriefData;
  profile: ProgramProfile;
  candidates: CandidateRow[];
  documents: DocumentRow[];
  messages: MessageRow[];
  saveIntake: (next: IntakeData) => Promise<void>;
  saveBrief: (next: BriefData) => Promise<void>;
  saveProfile: (next: ProgramProfile) => Promise<void>;
  setStatus: (id: number, next: CandidateStatus, feedback?: SkipFeedback) => Promise<boolean>;
  addCandidates: (items: NewCandidate[]) => Promise<number>;
  reloadCandidates: () => Promise<void>;
  setWorking: (label: string | null) => void;
  onCandidatesDiscovered?: () => void;
}

const s = (v: unknown, max = 400): string => (v == null ? '' : String(v)).trim().slice(0, max);

// Per-turn flags so deterministic steps and model-emitted actions don't double up.
interface TurnFlags {
  capturedKeys: string[];
  searchRan: boolean;
  brochureParsed: boolean;
  profileChanged: boolean;
  summaryRefreshed: boolean;
}

function newTurnFlags(): TurnFlags {
  return { capturedKeys: [], searchRan: false, brochureParsed: false, profileChanged: false, summaryRefreshed: false };
}

// ---------------------------------------------------------------------------
// System prompt

function describeIntake(intake: IntakeData): string {
  const lines = INTAKE_QUESTIONS.map((q) => {
    const answer = intake.answers[q.id];
    return `- ${q.id} — ${answer ? `ANSWERED: "${s(answer, 200)}"` : 'NOT ANSWERED YET'} — "${q.text}"`;
  });
  const pending = intake.tuitionPending;
  if (pending?.perCredit && !intake.answers.tuition?.trim()) {
    lines.push(
      `TUITION COMPUTATION PENDING: the representative gave a per-credit price (${pending.currency || 'USD'} ${pending.perCredit}/credit)${
        pending.totalCredits ? ` and ${pending.totalCredits} total credits` : ' but NOT the total credits required'
      }. ${pending.totalCredits ? 'The program duration is still needed for the formula.' : 'Ask for the total number of credits — NEVER look this up yourself.'}`
    );
  }
  const next = nextIntakeQuestion(intake);
  lines.push(next ? `NEXT QUESTION TO ASK: ${next.id} — "${next.text}"` : 'CHECKLIST COMPLETE — no intake questions left to ask.');
  return lines.join('\n');
}

function describeCandidates(candidates: CandidateRow[]): string {
  if (!candidates.length) return '(none yet)';
  return candidates
    .slice(0, 60)
    .map((c) => `#${c.id} | ${c.name || c.student_email} | major: ${c.target_major || '—'} | GPA: ${c.gpa || '—'} | match: ${c.match_score ?? '—'}% | status: ${c.status}`)
    .join('\n');
}

function profileForPrompt(profile: ProgramProfile): string {
  return JSON.stringify({ ...profile, brochureText: undefined, brochureSourceUrl: undefined, brochureParsedAt: undefined, rankingsCheckedAt: undefined });
}

function buildSystemPrompt(deps: AgentDeps): string {
  const { intake, brief, profile, candidates, documents, program, displayName, institutionName } = deps;
  const brochureSection = profile.brochureText
    ? `\nBROCHURE ON FILE (parsed text of the program's uploaded prospectus — you HAVE full access to this):\n"""${s(profile.brochureText, 2600)}"""\n`
    : '';
  return `You are Alma, an agentic AI recruitment partner who helps university representatives find candidates that fit their program. You are talking to ${displayName || 'a representative'} from ${institutionName}, about ONE specific program: "${program.name}" (${s(program.level, 20) || 'level unknown'}${program.campus_location ? `, ${s(program.campus_location, 80)}` : ''}). Candidates come from Scout — the student side of this platform — and only include students who opted in to being visible to universities. Today's date: ${new Date().toDateString()}.

You can EXECUTE ACTIONS, not just chat. Respond with ONLY a valid JSON object (no markdown fences, no text outside the JSON):
{"reply": "<your markdown message to the representative>", "actions": [ ...zero or more of the actions below... ]}

AVAILABLE ACTIONS:
1. {"type":"save_intake_answers","answers":{"<questionId>":"<answer in the representative's words>"}}
   If the representative points back at something they said earlier ("I already replied above", "see my earlier message"), find that earlier message in this conversation and save ITS substance as the answer — NEVER save the pointing phrase itself.
   Record answers to intake checklist questions whenever the representative answers one OR volunteers the information unprompted. Include only the keys that apply.
2. {"type":"update_profile","profile":{...}}
   Use when the representative asks to change the program profile or shares new program facts (location, tuition, duration, intakes, unique features, capstone requirements, outcomes, scholarships, rankings). Include ONLY the fields you want to change; the rest are preserved. You can NEVER write "summary" or "admissionsLookingFor" — those are regenerated automatically. Never invent facts.
3. {"type":"update_brief","factors":{"geography":{"excellent":[],"good":[],"borderline":[],"notAFit":[]},"gpa":{...},"extracurriculars":{...},"research":{...},"work":{...},"leadership":{...}}}
   The Search Brief is your internal document of candidate-search preferences, bucketed by fit. Include ONLY the factors you want to change — factors you leave out (or leave with all-empty buckets) are preserved. Never emptied to "clear" unless explicitly asked.
   BRIEF ENTRY RULES: every entry is a concise KEYWORD of 1-4 words in Title Case (e.g. "Leadership", "India", "GPA 3.0+") — NEVER the representative's full sentence. Use ALL FOUR buckets when their words support it: excellent = clearly wanted, good = nice-to-have, borderline = weak preference, notAFit = explicit disqualifiers. Never repeat an entry anywhere within the same factor.
4. {"type":"search_candidates","criteria":{"focus":"<what to look for>","regions":"<countries/regions>","minGpa":"<threshold>","notes":"<other constraints>","count":6}}
   Search Scout's opted-in students for candidates matching this program. Found candidates are added to Recommendations automatically. Include only relevant criteria keys; omit "criteria" entirely to search from the program's saved preferences.
5. {"type":"set_candidate_status","candidateId":<id>,"status":"saved"|"skipped"}
   Manage the shortlist: move a candidate to Saved (shortlist them, or bring a skipped candidate back) or to Skipped. Contacted candidates can NEVER be moved — contacting is irreversible. Moving a candidate to Contacted only happens through the Request-to-apply flow in the Shortlist panel, never through you.

CRITICAL RULES:
- NOTHING RUNS IN THE BACKGROUND. Work happens ONLY through actions in THIS response, and system notes tell you what already happened this turn. NEVER say "hold on", "one moment", "please wait", or promise results "shortly". If something already ran (see system notes), report its outcome in past tense.
- PREFERENCE CHANGES ARE SAVED AUTOMATICALLY. When the representative states or changes an answer/preference, the system captures it before you reply — the system note lists what was saved. NEVER re-confirm; acknowledge the change as done.
- ONE QUESTION AT A TIME. Work through the intake checklist below in order, weaving exactly one unanswered question naturally into each reply (after addressing whatever the representative said). NEVER re-ask an ANSWERED question. If the representative proactively gave information answering a later question, skip it and move to the next unanswered one.
- TUITION RULES: the annual tuition question comes AFTER the duration question. If tuition was given per credit, the annual fee = (price per credit) × (total credits ÷ program duration in years); if the total credits were not given, ASK for them — never research or guess them. If tuition was given per semester, annual fee = fee per semester × 2. The system computes these automatically when the numbers are available (see system notes) — report the computed figure.
- SEARCH BRIEF PROTECTION: when the representative asks for a candidate search WITH specific criteria, those criteria are NOT saved to the Search Brief — they may just be exploring. If the system note says a criteria search ran, briefly ask whether they'd like those criteria saved to their search preferences; only emit update_brief AFTER they say yes. If they say no, leave the brief untouched.
- CLARIFY BEFORE ACTING. If a requested action is ambiguous (e.g. a candidate reference that matches nothing in CANDIDATES), ask a clarifying question and emit NO action for it.
- If the representative asks you to find candidates, the system usually runs the search before you reply (see system notes). Only emit search_candidates yourself if no search ran this turn and they clearly want one.
- BROCHURE ACCESS: if a BROCHURE ON FILE section appears below, you have the prospectus's full text — answer questions about it directly and NEVER say you cannot access it. Profile updates from the brochure happen automatically.
- Answer questions about current recommendations, the shortlist, profile, brief, or documents directly from the state below — no action needed for reading.
- Be warm, professional, and concise. Refer to candidates by name. Never fabricate candidates, scores, or facts.

INTAKE CHECKLIST STATE:
${describeIntake(intake)}

CURRENT SEARCH BRIEF (factors → fit buckets):
${JSON.stringify(brief.factors)}

CURRENT PROGRAM PROFILE:
${profileForPrompt(profile)}
${brochureSection}
CANDIDATES (id | name | major | GPA | match | status):
${describeCandidates(candidates)}

DOCUMENTS: ${documents.length ? documents.map((d) => `${d.name} (${d.kind})`).join(', ') : '(none)'}
`;
}

// ---------------------------------------------------------------------------
// Profile patch validation (model-supplied partial → safe merge)

interface RawAction {
  type?: string;
  [key: string]: any;
}

function normalizeFitReasons(raw: any): FitReason[] {
  return asArr<any>(raw)
    .map((r) => ({ title: s(r?.title, 80) || 'Why they fit', detail: s(r?.detail, 400) }))
    .filter((r) => r.detail)
    .slice(0, 5);
}

// Applies a partial profile patch. Summary and admissionsLookingFor are
// AI-owned and cannot be set through this path (PRD: AI summary not editable).
export function applyProfilePatch(raw: any, current: ProgramProfile): { next: ProgramProfile; changed: boolean } {
  if (!raw || typeof raw !== 'object') return { next: current, changed: false };
  const incoming = normalizeProfile({ ...current, ...raw, summary: current.summary, admissionsLookingFor: current.admissionsLookingFor });
  incoming.brochureText = current.brochureText;
  incoming.brochureSourceUrl = current.brochureSourceUrl;
  incoming.brochureParsedAt = current.brochureParsedAt;
  incoming.rankingsCheckedAt = current.rankingsCheckedAt;
  const changed = JSON.stringify({ ...incoming }) !== JSON.stringify({ ...current });
  return { next: incoming, changed };
}

// ---------------------------------------------------------------------------
// Search Brief ↔ intake answers reconciliation

function splitList(v: string): string[] {
  return v
    .split(/,|;| and /i)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && x.length < 80);
}

function briefChanged(a: BriefData, b: BriefData): boolean {
  return JSON.stringify(a.factors) !== JSON.stringify(b.factors);
}

// Keyword routing for the "qualities" answer → which factors it seeds (used
// by the deterministic fallback when the distiller is unreachable).
const QUALITY_FACTOR_HINTS: { factor: FactorKey; re: RegExp }[] = [
  { factor: 'leadership', re: /(leader|captain|president|founder|initiative)/i },
  { factor: 'work', re: /(work experience|professional|internship|job|industry|career)/i },
  { factor: 'research', re: /(research|publication|paper|academic project|thesis)/i },
  { factor: 'extracurriculars', re: /(extracurricular|sport|club|volunteer|society|activit|art|music)/i },
  { factor: 'gpa', re: /(gpa|grade|scholastic|academic (excellence|aptitude|record)|test score)/i },
];

const QUALITY_FACTORS: FactorKey[] = ['leadership', 'work', 'research', 'extracurriculars', 'gpa'];

// LLM distillation: turns the representative's raw conversational answers into
// short keyword signals filed across ALL FOUR fit buckets ("prefer India,
// Vietnam is fine too, nobody below 3.0" → geography excellent: India, good:
// Vietnam; gpa notAFit: Below 3.0 GPA) — never verbatim sentences.
async function distillAlmaBrief(
  answers: Record<string, string>,
  factors: FactorKey[]
): Promise<Partial<Record<FactorKey, Record<string, string[]>>> | null> {
  const wantsQualities = factors.some((f) => QUALITY_FACTORS.includes(f));
  const sourceLines = [
    factors.includes('geography')
      ? `- regions answer (→ factor "geography"; countries/regions to target): "${s(answers.regions, 300)}"`
      : '',
    factors.includes('gpa')
      ? `- thresholds answer (→ factor "gpa"; GPA/test minimums, e.g. "GPA 3.0+", "GMAT 650+"): "${s(answers.thresholds, 300)}"`
      : '',
    wantsQualities
      ? `- qualities answer (→ route each quality to the factor it belongs to: "leadership", "work", "research", "extracurriculars"; academic-excellence signals go to "gpa"): "${s(
          answers.qualities,
          400
        )}"`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          "You maintain the fit buckets of a university program's candidate Search Brief. You convert a representative's raw conversational answers into SHORT keyword signals. Return ONLY valid JSON. Never invent preferences they did not state.",
      },
      {
        role: 'user',
        content: `Convert the answers below into keyword signals for these factors: ${factors.join(', ')}.

${sourceLines}

Bucket meanings:
- "excellent": signals they clearly want in candidates (stated preferences, must-haves)
- "good": nice-to-have alternatives they also mentioned
- "borderline": hedged or weak preferences ("ideally", "would be a plus but not required")
- "notAFit": explicit disqualifiers ("no candidates from X", "below the threshold", "don't want")

Rules:
- Each signal is a concise keyword or phrase of 1-4 words in Title Case — NEVER a sentence ("we want people with leadership qualities" → "Leadership").
- Split multi-item answers into separate signals.
- Thresholds stay compact ("minimum gpa of 3 and gmat above 650" → gpa excellent: "GPA 3.0+", "GMAT 650+").
- Use ONLY what the answers say. Leave buckets empty when nothing was said for them; answers like "no preference" or "none" mean the factor stays empty.
- If an answer is only conversational filler or a pointer to an earlier message ("i already replied above", "see my previous answer", "same as before"), it contains NO preference: leave that factor out entirely. Never turn filler into a signal.
- No duplicate signals within a factor.

Return ONLY JSON:
{"factors":{"<factorKey>":{"excellent":[],"good":[],"borderline":[],"notAFit":[]}}}
Include only factors from the list above that actually have signals.`,
      },
    ],
    { temperature: 0, maxTokens: 700 }
  );
  const parsed = extractJson(res.content);
  const raw = parsed?.factors;
  if (!raw || typeof raw !== 'object') return null;
  const out: Partial<Record<FactorKey, Record<string, string[]>>> = {};
  for (const factor of factors) {
    const buckets = raw[factor];
    if (!buckets || typeof buckets !== 'object') continue;
    const clean: Record<string, string[]> = {};
    let any = false;
    for (const bucket of BUCKET_DEFS) {
      const list = Array.isArray(buckets[bucket.key]) ? buckets[bucket.key] : [];
      clean[bucket.key] = list.map((x: any) => s(x, 90)).filter(Boolean).slice(0, 12);
      if (clean[bucket.key].length) any = true;
    }
    if (any) out[factor] = clean;
  }
  return Object.keys(out).length ? out : null;
}

// The representative's stated answers are authoritative for their factors:
// rebuild a factor when its source answer changed this turn, and seed it
// whenever it is empty while an answer exists (self-heal for wiped briefs).
// Distillation extracts keywords across all buckets; the deterministic
// splitter is only the emergency fallback. A factor is never emptied here.
async function reconcileBriefWithAnswers(deps: AgentDeps, changedKeys: Set<string>): Promise<boolean> {
  const answers = deps.intake.answers || {};
  const factorEmpty = (factor: FactorKey) => BUCKET_DEFS.every((b) => deps.brief.factors[factor][b.key].length === 0);
  // Factors holding non-keyword garbage (verbatim sentences from old sessions)
  // are eligible for a rebuild even when their answer didn't change.
  const factorInvalid = (factor: FactorKey) =>
    BUCKET_DEFS.some((b) => deps.brief.factors[factor][b.key].some((e) => !isKeywordChip(e)));
  // "i already replied above"-style pointers carry no preference — never
  // rebuild a factor from them.
  const usable = (v?: string) => {
    const t = (v || '').trim();
    return t && !isNonAnswerText(t) ? t : '';
  };

  const regions = usable(answers.regions);
  const thresholds = usable(answers.thresholds);
  const qualities = usable(answers.qualities);

  const eligible = new Set<FactorKey>();
  if (regions && (changedKeys.has('regions') || factorEmpty('geography') || factorInvalid('geography'))) eligible.add('geography');
  if (thresholds && (changedKeys.has('thresholds') || factorEmpty('gpa') || factorInvalid('gpa'))) eligible.add('gpa');
  if (qualities) {
    for (const factor of QUALITY_FACTORS) {
      if (changedKeys.has('qualities') || factorEmpty(factor) || factorInvalid(factor)) eligible.add(factor);
    }
  }
  if (!eligible.size) return false;

  let distilled: Partial<Record<FactorKey, Record<string, string[]>>> | null = null;
  try {
    distilled = await distillAlmaBrief(answers, [...eligible]);
  } catch {
    distilled = null;
  }

  const next = normalizeBrief(JSON.parse(JSON.stringify(deps.brief)));
  let touched = false;

  if (distilled) {
    for (const factor of eligible) {
      const buckets = distilled[factor];
      if (!buckets) continue;
      next.factors[factor] = {
        excellent: buckets.excellent || [],
        good: buckets.good || [],
        borderline: buckets.borderline || [],
        notAFit: buckets.notAFit || [],
      };
      touched = true;
    }
  }

  if (!touched) {
    const apply = (factor: FactorKey, values: string[]) => {
      // The fallback never files anything that doesn't read like a keyword —
      // a sentence-shaped answer waits for the distiller instead.
      const chips = values.filter(isKeywordChip);
      if (!chips.length || !eligible.has(factor)) return;
      next.factors[factor].excellent = chips.slice(0, 8);
      touched = true;
    };
    if (regions && !/^(no|none|nope|anywhere|no preference|worldwide|global)/i.test(regions)) {
      apply('geography', splitList(regions));
    }
    if (thresholds && !/^(no|none|nope)\b/i.test(thresholds)) {
      apply('gpa', [thresholds.slice(0, 90)]);
    }
    if (qualities) {
      const chips = splitList(qualities);
      for (const hint of QUALITY_FACTOR_HINTS) {
        apply(hint.factor, chips.filter((c) => hint.re.test(c)));
      }
    }
  }

  const cleaned = sanitizeBrief(next);
  if (!touched || !briefChanged(deps.brief, cleaned)) return false;
  await deps.saveBrief(cleaned);
  deps.brief = cleaned;
  return true;
}

// ---------------------------------------------------------------------------
// Tuition capture + computation (the PRD's exact formulas, done in code)

export interface TuitionCapture {
  kind: 'annual' | 'perCredit' | 'perSemester' | '';
  amount: number;
  totalCredits: number | null;
  currency: string;
}

function fmtMoney(amount: number, currency: string): string {
  const cur = (currency || 'USD').toUpperCase();
  const rounded = Math.round(amount * 100) / 100;
  const text = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return /^(usd|\$)$/i.test(cur) ? `$${text}` : `${cur} ${text}`;
}

// Attempts the annual-fee computation with whatever is known. Returns the
// answer text when computable; otherwise records what is still missing in
// intake.tuitionPending (so the state machine asks the right follow-up).
export function settleTuition(intake: IntakeData, capture: TuitionCapture | null): { answerText: string; pendingChanged: boolean } {
  const pending: TuitionPending = { ...(intake.tuitionPending || {}) };
  let pendingChanged = false;

  if (capture && capture.kind === 'annual' && capture.amount > 0) {
    intake.tuitionPending = null;
    return { answerText: `${fmtMoney(capture.amount, capture.currency)} per year`, pendingChanged: true };
  }
  if (capture && capture.kind === 'perSemester' && capture.amount > 0) {
    // Annual tuition fee = (fee per semester) * 2
    intake.tuitionPending = null;
    return {
      answerText: `${fmtMoney(capture.amount * 2, capture.currency)} per year (computed as ${fmtMoney(capture.amount, capture.currency)} per semester × 2)`,
      pendingChanged: true,
    };
  }
  if (capture && capture.kind === 'perCredit' && capture.amount > 0) {
    pending.perCredit = capture.amount;
    pending.currency = capture.currency || pending.currency || 'USD';
    if (capture.totalCredits && capture.totalCredits > 0) pending.totalCredits = capture.totalCredits;
    pendingChanged = true;
  } else if (capture && capture.totalCredits && capture.totalCredits > 0) {
    // A bare credits count answers the pending follow-up question.
    pending.totalCredits = capture.totalCredits;
    pendingChanged = true;
  }

  const durationYears = parseDurationYears(intake.answers.duration || '');
  if (pending.perCredit && pending.totalCredits && durationYears > 0) {
    // Annual tuition fee = (price per credit) * ((total credits) / (duration in years))
    const annual = pending.perCredit * (pending.totalCredits / durationYears);
    const text = `${fmtMoney(annual, pending.currency || 'USD')} per year (computed as ${fmtMoney(pending.perCredit, pending.currency || 'USD')} per credit × ${pending.totalCredits} credits ÷ ${durationYears} year${durationYears === 1 ? '' : 's'})`;
    intake.tuitionPending = null;
    return { answerText: text, pendingChanged: true };
  }

  if (pendingChanged) intake.tuitionPending = pending;
  return { answerText: '', pendingChanged };
}

// ---------------------------------------------------------------------------
// Deterministic state capture (runs on EVERY user message, before the reply)

interface SearchCriteria {
  focus?: string;
  regions?: string;
  minGpa?: string;
  notes?: string;
  count?: number;
}

interface CapturedState {
  answers: Record<string, string>;
  tuition: TuitionCapture | null;
  wantsSearch: boolean;
  searchCriteria: SearchCriteria | null;
  wantsBrochureRebuild: boolean;
  briefConsent: 'yes' | 'no' | null;
}

async function extractStateUpdates(userText: string, deps: AgentDeps): Promise<CapturedState | null> {
  if (!userText.trim()) return null;
  const lastAssistant = [...deps.messages].reverse().find((m) => m.role === 'assistant');
  const questionLines = INTAKE_QUESTIONS.map((q) => {
    const current = deps.intake.answers[q.id];
    return `- ${q.id}: "${q.text}"${current ? ` — current answer: "${s(current, 160)}"` : ' — unanswered'}`;
  }).join('\n');
  const pendingBrief = (deps.intake as any).pendingBriefCriteria
    ? `\nThe assistant previously asked whether ad-hoc search criteria should be saved to the Search Brief. If this message answers that (yes/no), set briefConsent.`
    : '';

  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          'You extract structured data from ONE message a university representative sent in a candidate-recruitment chat. Return ONLY valid JSON. Never invent information the representative did not state in this message.',
      },
      {
        role: 'user',
        content: `Intake checklist questions (with current answers):
${questionLines}

Assistant's last message (what the representative is replying to):
"${s(lastAssistant?.content || '', 500) || '(none)'}"
${pendingBrief}
Representative's new message:
"${s(userText, 900)}"

Return ONLY JSON:
{"answers": {"<questionId>": "<answer in the representative's words>"},
 "tuition": {"kind":"annual"|"perCredit"|"perSemester"|"", "amount":<number>, "totalCredits":<number or null>, "currency":"USD"} | null,
 "wantsSearch": true | false,
 "searchCriteria": {"focus":"","regions":"","minGpa":"","notes":"","count":6} | null,
 "wantsBrochureRebuild": true | false,
 "briefConsent": "yes" | "no" | null}

Rules:
- "answers": include a questionId ONLY if this message answers it for the first time OR changes the existing answer. Use the representative's own words. Short confirmations ("yes", "correct") answer whatever the assistant's last message asked — resolve them into the actual answer. Do NOT put tuition figures into answers.tuition when they need computation — use the "tuition" object instead (only a plain stated ANNUAL fee may also go into answers.tuition).
- If the message only points at an earlier reply ("I already replied above", "see my previous message", "same as before") WITHOUT restating the information, do NOT include that questionId at all — the pointing phrase is not an answer.
- "tuition": fill when this message states tuition pricing: kind "annual" for a yearly fee, "perCredit" for a per-credit price (include totalCredits ONLY if stated), "perSemester" for a per-semester fee. A bare number of credits (answering "how many total credits") → {"kind":"", "amount":0, "totalCredits":<n>, "currency":"USD"}. Otherwise null.
- "wantsSearch": true when the representative asks to find / search / look for / source candidates or students now.
- "searchCriteria": only when wantsSearch is true and ONLY with constraints stated in THIS message; otherwise null.
- "wantsBrochureRebuild": true when they ask to (re)build the profile from the brochure/prospectus, or complain it wasn't parsed.
- "briefConsent": "yes"/"no" ONLY when this message answers the save-criteria-to-preferences question; otherwise null.`,
      },
    ],
    { temperature: 0, maxTokens: 600 }
  );

  const parsed = extractJson(res.content);
  if (!parsed || typeof parsed !== 'object') return null;
  const answers: Record<string, string> = {};
  if (parsed.answers && typeof parsed.answers === 'object') {
    for (const [k, v] of Object.entries(parsed.answers)) {
      if (typeof v === 'string' && v.trim()) answers[k] = s(v, 500);
    }
  }
  const rawTuition = parsed.tuition && typeof parsed.tuition === 'object' ? parsed.tuition : null;
  const tuition: TuitionCapture | null = rawTuition
    ? {
        kind: ['annual', 'perCredit', 'perSemester'].includes(rawTuition.kind) ? rawTuition.kind : '',
        amount: Number(rawTuition.amount) > 0 ? Number(rawTuition.amount) : 0,
        totalCredits: Number(rawTuition.totalCredits) > 0 ? Number(rawTuition.totalCredits) : null,
        currency: s(rawTuition.currency, 8) || 'USD',
      }
    : null;
  const criteria = parsed.searchCriteria && typeof parsed.searchCriteria === 'object' ? parsed.searchCriteria : null;
  return {
    answers,
    tuition: tuition && (tuition.kind || tuition.totalCredits) ? tuition : null,
    wantsSearch: !!parsed.wantsSearch,
    searchCriteria: criteria,
    wantsBrochureRebuild: !!parsed.wantsBrochureRebuild,
    briefConsent: parsed.briefConsent === 'yes' ? 'yes' : parsed.briefConsent === 'no' ? 'no' : null,
  };
}

// Apply captured state to intake/brief/profile. Shared by the deterministic
// pre-pass and the model's save_intake_answers action (idempotent merges).
async function applyStateCapture(cap: CapturedState, deps: AgentDeps, turn: TurnFlags): Promise<string[]> {
  const lines: string[] = [];
  const validIds = new Set(INTAKE_QUESTIONS.map((q) => q.id));
  const captured: Record<string, string> = {};
  for (const [key, value] of Object.entries(cap.answers || {})) {
    if (!validIds.has(key) || typeof value !== 'string' || !value.trim()) continue;
    const next = s(value, 500);
    // Never store conversational pointers ("i already replied above") as an
    // answer — they'd poison the checklist and the Search Brief downstream.
    if (isNonAnswerText(next)) continue;
    if ((deps.intake.answers[key] || '').trim().toLowerCase() === next.toLowerCase()) continue;
    captured[key] = next;
  }

  const nextIntake: IntakeData = {
    ...deps.intake,
    answers: { ...deps.intake.answers, ...captured },
    tuitionPending: deps.intake.tuitionPending || null,
  };

  // Tuition math (PRD formulas) runs after answers merge so a duration given
  // in the same message is available to the computation.
  let tuitionLine = '';
  if (cap.tuition || nextIntake.tuitionPending?.perCredit) {
    const settled = settleTuition(nextIntake, cap.tuition);
    if (settled.answerText) {
      captured.tuition = settled.answerText;
      nextIntake.answers.tuition = settled.answerText;
      tuitionLine = `Recorded the annual tuition fee: ${settled.answerText}`;
    } else if (settled.pendingChanged && nextIntake.tuitionPending?.perCredit && !nextIntake.tuitionPending.totalCredits) {
      tuitionLine = 'Noted the per-credit price — waiting on the total credits to compute the annual fee';
    }
  }

  if (Object.keys(captured).length || tuitionLine) {
    nextIntake.completed = intakeCompleted(nextIntake);
    await deps.saveIntake(nextIntake);
    deps.intake = nextIntake;
    const count = Object.keys(captured).filter((k) => k !== 'tuition').length;
    if (count) lines.push(count === 1 ? 'Saved your answer to the program setup' : `Saved ${count} answers to the program setup`);
    if (tuitionLine) lines.push(tuitionLine);
    turn.capturedKeys.push(...Object.keys(captured));
  }

  if (await reconcileBriefWithAnswers(deps, new Set(turn.capturedKeys))) {
    lines.push('Updated the Search Brief');
  }

  // Answers that describe the program itself flow into the profile fields.
  const profilePatch: Record<string, any> = {};
  if (captured.tuition) profilePatch.tuitionAnnual = captured.tuition;
  if (captured.duration) {
    const years = parseDurationYears(captured.duration);
    if (years > 0) profilePatch.durationMonths = `${Math.round(years * 12)} months`;
  }
  if (captured.scholarships) profilePatch.scholarships = captured.scholarships;
  if (Object.keys(profilePatch).length) {
    const { next, changed } = applyProfilePatch(profilePatch, deps.profile);
    if (changed) {
      await deps.saveProfile(next);
      deps.profile = next;
      turn.profileChanged = true;
    }
  }
  if (['qualities', 'regions', 'thresholds'].some((k) => captured[k])) {
    turn.profileChanged = true; // admissionsLookingFor + summary refresh below
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Constraint-protection state for ad-hoc search criteria

function pendingBriefCriteria(intake: IntakeData): SearchCriteria | null {
  const raw = (intake as any).pendingBriefCriteria;
  return raw && typeof raw === 'object' ? (raw as SearchCriteria) : null;
}

async function setPendingBriefCriteria(deps: AgentDeps, criteria: SearchCriteria | null): Promise<void> {
  const next: IntakeData = { ...deps.intake } as IntakeData;
  (next as any).pendingBriefCriteria = criteria;
  await deps.saveIntake(next);
  deps.intake = next;
}

// Consent granted: fold the remembered ad-hoc criteria into the brief's
// excellent buckets (geography ← regions, gpa ← minGpa, focus → qualities-style routing).
async function applyCriteriaToBrief(deps: AgentDeps, criteria: SearchCriteria): Promise<boolean> {
  const next = normalizeBrief(JSON.parse(JSON.stringify(deps.brief)));
  const merge = (factor: FactorKey, values: string[]) => {
    if (!values.length) return;
    const bucket = next.factors[factor].excellent;
    for (const v of values) {
      if (!bucket.some((x) => x.toLowerCase() === v.toLowerCase())) bucket.push(v);
    }
    next.factors[factor].excellent = bucket.slice(0, 12);
  };
  if (criteria.regions) merge('geography', splitList(s(criteria.regions, 200)));
  if (criteria.minGpa) merge('gpa', [s(criteria.minGpa, 90)]);
  if (criteria.focus) {
    const chips = splitList(s(criteria.focus, 240));
    for (const hint of QUALITY_FACTOR_HINTS) merge(hint.factor, chips.filter((c) => hint.re.test(c)));
  }
  if (!briefChanged(deps.brief, next)) return false;
  await deps.saveBrief(next);
  deps.brief = next;
  return true;
}

// ---------------------------------------------------------------------------
// Candidate discovery — Scout's opted-in students, scored against THIS program

function candidateLevelMatches(programLevel: string, studentLevel: string): boolean {
  if (!programLevel || !studentLevel) return true;
  return programLevel === studentLevel;
}

function regionMatches(regions: string, student: StudentSnapshot): boolean {
  const tokens = splitList(regions.toLowerCase()).flatMap((t) => t.split(/\s+/)).filter((t) => t.length > 2);
  if (!tokens.length) return true;
  const blob = `${student.citizenship} ${student.location}`.toLowerCase();
  return tokens.some((t) => blob.includes(t));
}

function parseGpaNumber(text: string): number {
  const m = (text || '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return v > 0 && v <= 10 ? v : 0; // GPA-like scales only; percentages left to the LLM
}

function compactStudent(sourced: SourcedStudent, index: number): any {
  const st = sourced.snapshot;
  return {
    index,
    name: st.name,
    targetMajor: sourced.targetMajor,
    seekingLevel: st.level || 'unknown',
    gpa: sourced.gpa,
    gpaContext: st.gpaContext,
    location: st.location,
    citizenship: st.citizenship,
    headline: st.headline,
    education: st.education.map((e) => `${e.degree} ${e.field} @ ${e.institute} (${e.grade}${e.inProgress ? ', in progress' : ''})`),
    work: st.work.map((w) => `${w.title} @ ${w.company}`),
    research: st.research.map((r) => r.title),
    skills: st.skills.slice(0, 12),
    extracurriculars: st.extracurriculars.map((e) => e.title),
    lookingFor: st.lookingFor,
    tests: st.tests,
  };
}

// Heuristic scoring used only when the LLM scorer is unreachable, so discovery
// still works. Scores derive from brief-factor overlaps.
function heuristicScore(sourced: SourcedStudent, deps: AgentDeps): { score: number; reasons: FitReason[] } {
  const st = sourced.snapshot;
  let score = 62;
  const reasons: FitReason[] = [];
  const geo = deps.brief.factors.geography.excellent.join(' ').toLowerCase();
  if (geo && `${st.citizenship} ${st.location}`.toLowerCase().split(/\s+/).some((w) => w.length > 3 && geo.includes(w))) {
    score += 10;
    reasons.push({ title: 'In a target region', detail: `Based in ${st.location || st.citizenship} — inside the regions this program targets.` });
  }
  const gpaNum = parseGpaNumber(sourced.gpa);
  const thresholdNum = parseGpaNumber(deps.brief.factors.gpa.excellent.join(' '));
  if (gpaNum && thresholdNum && gpaNum >= thresholdNum) {
    score += 12;
    reasons.push({ title: 'Meets the academic bar', detail: `GPA ${sourced.gpa} is at or above the stated threshold.` });
  }
  if (st.work.length && deps.brief.factors.work.excellent.length) {
    score += 6;
    reasons.push({ title: 'Relevant work experience', detail: `${st.work.length} work item(s), including ${st.work[0].title} at ${st.work[0].company}.` });
  }
  if (st.research.length && deps.brief.factors.research.excellent.length) score += 5;
  if (st.extracurriculars.length && deps.brief.factors.extracurriculars.excellent.length) score += 5;
  if (!reasons.length) {
    reasons.push({ title: 'Opted-in prospect', detail: 'This student opted in to hearing from universities and broadly matches the program profile.' });
  }
  return { score: Math.max(40, Math.min(95, score)), reasons };
}

// Two discoveries for the same program must never run concurrently — a
// double-mounted chat once ran startup discovery twice within a second and
// inserted every student twice with different scores.
const discoveryInFlight = new Set<string>();

export async function discoverCandidates(
  criteria: SearchCriteria,
  deps: AgentDeps
): Promise<{ added: number; reason?: string }> {
  const lockKey = `${deps.email}:${deps.program.id}`;
  if (discoveryInFlight.has(lockKey)) {
    return { added: 0, reason: 'a candidate search for this program is already running' };
  }
  discoveryInFlight.add(lockKey);
  try {
    return await discoverCandidatesInner(criteria, deps);
  } finally {
    discoveryInFlight.delete(lockKey);
  }
}

async function discoverCandidatesInner(
  criteria: SearchCriteria,
  deps: AgentDeps
): Promise<{ added: number; reason?: string }> {
  deps.setWorking('Searching opted-in Scout students…');
  let students: SourcedStudent[] = [];
  try {
    students = await fetchOptedInScoutStudents();
  } catch {
    return { added: 0, reason: "Scout's student database was unreachable" };
  }
  if (!students.length) {
    return { added: 0, reason: 'no Scout students have opted in to university visibility yet' };
  }

  // Students already in this program's candidate list are excluded — from a
  // FRESH read of the table, not just the in-memory list, so a discovery that
  // raced a previous one (or ran with stale deps) can never re-add someone.
  const existing = new Set(
    deps.candidates.map((c) => (c.student_email || '').toLowerCase()).filter(Boolean)
  );
  try {
    const { data } = await db('alma_candidates')
      .eq('user_email', deps.email)
      .eq('program_id', deps.program.id)
      .orderBy('id', 'desc')
      .limit(500)
      .get();
    for (const row of Array.isArray(data) ? data : []) {
      const em = String(row?.student_email || '').toLowerCase();
      if (em) existing.add(em);
    }
  } catch {
    // fresh read failed — the in-memory list still guards the common case
  }
  let pool = students.filter((st) => !existing.has(st.snapshot.email.toLowerCase()));
  if (!pool.length) {
    return { added: 0, reason: 'every opted-in student is already in your candidate list for this program' };
  }

  // Deterministic pre-filters: program level and any stated ad-hoc region.
  const programLevel = s(deps.program.level, 20);
  pool = pool.filter((st) => candidateLevelMatches(programLevel, st.snapshot.level));
  if (criteria.regions) pool = pool.filter((st) => regionMatches(s(criteria.regions, 200), st.snapshot));
  if (!pool.length) {
    return {
      added: 0,
      reason: criteria.regions
        ? `no opted-in students matched the requested region (${s(criteria.regions, 80)})`
        : `no opted-in students are looking for ${programLevel || 'this'} programs`,
    };
  }

  const count = Math.min(Math.max(Number(criteria.count) || 6, 1), 12);
  const batch = pool.slice(0, 25);

  deps.setWorking('Scoring candidates against your program…');
  const criteriaBlock = [
    criteria.focus ? `Focus: ${s(criteria.focus, 200)}` : '',
    criteria.regions ? `Regions (STRICT): ${s(criteria.regions, 160)}` : '',
    criteria.minGpa ? `Minimum GPA/tests (STRICT): ${s(criteria.minGpa, 120)}` : '',
    criteria.notes ? `Other constraints: ${s(criteria.notes, 240)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let scored: Map<number, { include: boolean; score: number; targetMajor: string; reasons: FitReason[] }> | null = null;
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content:
            'You score student candidates for fit against ONE university program. Judge only from the provided data. Return ONLY valid JSON. Never invent facts about a student.',
        },
        {
          role: 'user',
          content: `PROGRAM: "${deps.program.name}" — ${programLevel || 'level unknown'}${deps.program.campus_location ? `, campus: ${s(deps.program.campus_location, 100)}` : ''}
Program profile: ${profileForPrompt(deps.profile)}
Search Brief (what the admissions team wants, by fit bucket): ${JSON.stringify(deps.brief.factors)}
What the representative said they look for: ${s(deps.intake.answers.qualities, 300) || '—'}
Minimum thresholds: ${s(deps.intake.answers.thresholds, 200) || '—'}
Target regions: ${s(deps.intake.answers.regions, 200) || '—'}
${criteriaBlock ? `\nAD-HOC SEARCH CRITERIA for THIS search only (students failing a STRICT criterion must be excluded):\n${criteriaBlock}\n` : ''}
STUDENTS (opted-in Scout users):
${JSON.stringify(batch.map(compactStudent))}

Return ONLY JSON:
{"candidates":[{"index":0,"include":true,"matchScore":87,"targetMajor":"<their target major, cleaned up>","fitReasons":[{"title":"","detail":""},{"title":"","detail":""}],"excludeReason":""}]}

Rules: one entry per student index. matchScore is 0-100 fit against the PROGRAM's own preferences (brief + profile + stated qualities) — ad-hoc criteria decide inclusion, not the score. include=false (with a short excludeReason) for students who clearly don't fit the program level, thresholds, or a STRICT criterion. fitReasons: 2-4 specific bullets grounded in the student's actual data explaining why they fit THIS program — never generic filler.`,
        },
      ],
      { temperature: 0.2, maxTokens: 2600 }
    );
    const parsed = extractJson(res.content);
    const list = asArr<any>(parsed?.candidates);
    if (list.length) {
      scored = new Map();
      for (const item of list) {
        const idx = Number(item?.index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length) continue;
        scored.set(idx, {
          include: item?.include !== false,
          score: Math.max(0, Math.min(100, Math.round(Number(item?.matchScore) || 0))),
          targetMajor: s(item?.targetMajor, 120),
          reasons: normalizeFitReasons(item?.fitReasons),
        });
      }
    }
  } catch {
    scored = null;
  }

  const items: NewCandidate[] = [];
  for (let i = 0; i < batch.length && items.length < count; i++) {
    const sourced = batch[i];
    const st = sourced.snapshot;
    if (scored) {
      const verdict = scored.get(i);
      if (!verdict || !verdict.include || verdict.score <= 0) continue;
      items.push({
        student_email: st.email,
        name: st.name,
        target_major: verdict.targetMajor || sourced.targetMajor,
        gpa: sourced.gpa,
        match_score: verdict.score,
        fit_reasons: verdict.reasons.length ? verdict.reasons : heuristicScore(sourced, deps).reasons,
        student_json: st,
      });
    } else {
      const h = heuristicScore(sourced, deps);
      items.push({
        student_email: st.email,
        name: st.name,
        target_major: sourced.targetMajor,
        gpa: sourced.gpa,
        match_score: h.score,
        fit_reasons: h.reasons,
        student_json: st,
      });
    }
  }

  if (!items.length) {
    return { added: 0, reason: 'no opted-in students scored as a fit for this program' + (criteriaBlock ? ' with those criteria' : '') };
  }
  items.sort((a, b) => b.match_score - a.match_score);
  const added = await deps.addCandidates(items);
  return { added };
}

// ---------------------------------------------------------------------------
// Brochure/prospectus parsing pipeline → program profile

const BROCHURE_TEXT_PROMPT =
  'Transcribe the complete text content of this document, preserving section headings and bullet items as plain lines. Output ONLY the transcribed text with no commentary, no analysis, no markdown fences. If the document contains no readable text, output exactly NO_TEXT.';

const BROCHURE_JSON_SHAPE = `{"is_program_document": true|false,
 "program_name": "", "university": "",
 "city": "city where the program is conducted", "country": "",
 "tuition_annual": "annual tuition fee exactly as stated (compute per-year only if the document states the basis)",
 "duration_months": "program length in months, e.g. \\"24 months\\"",
 "intakes": ["Fall"|"Spring"|"Summer"],
 "unique_features": ["things about the program not covered by the other fields"],
 "capstone": {"required": "project" | "internship or co-op" | "thesis/dissertation" | "coursework only" | "", "optional_components": ["major components that exist but are NOT required for graduation"]},
 "outcomes": {"placement_3m": "placement % within 3 months of graduation", "placement_6m": "placement % within 6 months", "employers": ["popular employers"]},
 "scholarships": "",
 "rankings": [{"source":"THE"|"QS"|"ARWU"|"FT","scope":"program"|"university","rank":"","year":""}]}`;

const BROCHURE_PROMPT = `You are parsing a document that may be a university program brochure/prospectus. Return ONLY valid JSON, no other text:
${BROCHURE_JSON_SHAPE}
If the document is NOT about a university program, return {"is_program_document": false}. Fill fields ONLY with information the document actually states — never estimate or use outside knowledge. capstone.required: pick a value ONLY when the document says that component is mandatory for graduation; if graduation is coursework-based, use "coursework only"; components that exist but are optional go into capstone.optional_components (NOT into required). rankings: only rankings the document itself cites from Times Higher Education (THE), QS, ARWU/Shanghai, or Financial Times (FT).`;

async function structuredBrochureExtract(text: string): Promise<any | null> {
  const ask = async (extra: string) => {
    const res = await llmChat(
      [
        { role: 'system', content: 'You parse university program brochure text into structured JSON. Return ONLY valid JSON, nothing else.' },
        { role: 'user', content: `Brochure text:\n"""${text.slice(0, 12000)}"""\n\n${BROCHURE_PROMPT}${extra}` },
      ],
      { temperature: 0, maxTokens: 2200 }
    );
    return extractJson(res.content);
  };
  let parsed = await ask('');
  if (!parsed) parsed = await ask('\n\nIMPORTANT: your previous output was not valid JSON. Return ONLY the JSON object.');
  return parsed;
}

function mapCapstone(raw: string): string {
  const t = (raw || '').toLowerCase();
  if (/project/.test(t)) return CAPSTONE_OPTIONS[0];
  if (/intern|co-?op/.test(t)) return CAPSTONE_OPTIONS[1];
  if (/thes[ie]s|dissertation/.test(t)) return CAPSTONE_OPTIONS[2];
  if (/course\s?work/.test(t)) return CAPSTONE_OPTIONS[3];
  return '';
}

export function isBusinessProgram(program: ProgramRow, profile: ProgramProfile): boolean {
  const blob = `${program.name} ${profile.summary} ${profile.uniqueFeatures.join(' ')}`.toLowerCase();
  return /(business|management|mba|finance|accounting|marketing|economics|commerce)/.test(blob);
}

// Live ranking lookup. The PRD calls for an integrated ranking API when one
// exists; this workspace has none, so rankings are web-scraped at profile
// generation time from the three required sources (+ FT for business programs)
// and every accepted rank must literally appear in the search evidence.
export async function fetchProgramRankings(
  university: string,
  programName: string,
  business: boolean
): Promise<RankingItem[]> {
  const year = new Date().getFullYear();
  const queries: { source: RankingItem['source']; scope: RankingItem['scope']; q: string }[] = [
    { source: 'THE', scope: 'university', q: `"${university}" Times Higher Education world university rankings ${year}` },
    { source: 'QS', scope: 'university', q: `"${university}" QS World University Rankings ${year}` },
    { source: 'ARWU', scope: 'university', q: `"${university}" ARWU Shanghai Ranking academic ranking world universities ${year}` },
    { source: 'THE', scope: 'program', q: `"${university}" ${programName} Times Higher Education subject ranking ${year}` },
    { source: 'QS', scope: 'program', q: `"${university}" ${programName} QS rankings by subject ${year}` },
  ];
  if (business) {
    queries.push({ source: 'FT', scope: 'program', q: `"${university}" ${programName} Financial Times ranking ${year}` });
  }

  const evidence: { source: RankingItem['source']; scope: RankingItem['scope']; text: string }[] = [];
  for (const item of queries) {
    try {
      const hits = await webSearch(item.q, 5);
      const text = hits.map((h) => `${s(h.title, 140)} — ${s(h.snippet, 240)}`).join('\n');
      if (text.trim()) evidence.push({ source: item.source, scope: item.scope, text });
    } catch {
      // skip this source
    }
  }
  if (!evidence.length) return [];

  const blob = evidence.map((e) => e.text).join(' ').toLowerCase().replace(/,/g, '');
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content:
            'You extract university/program ranking positions STRICTLY from the provided search snippets. Only THE, QS, ARWU, FT. Prefer the most recent year visible. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `University: ${university}\nProgram: ${programName}\n\nEvidence snippets grouped by source:\n${evidence
            .map((e) => `[${e.source} / ${e.scope}]\n${e.text}`)
            .join('\n\n')}\n\nReturn ONLY JSON: {"rankings":[{"source":"THE"|"QS"|"ARWU"|"FT","scope":"program"|"university","rank":"e.g. #47 or 101-150","year":"e.g. ${year}"}]}\nRules: include a ranking ONLY when the rank figure appears verbatim in the snippets for that source; use the LATEST year visible per source+scope; never estimate or use outside knowledge; at most one entry per source+scope combination.`,
        },
      ],
      { temperature: 0, maxTokens: 700 }
    );
    const parsed = extractJson(res.content);
    const out: RankingItem[] = [];
    for (const raw of asArr<any>(parsed?.rankings)) {
      const source = ['THE', 'QS', 'ARWU', 'FT'].includes(raw?.source) ? (raw.source as RankingItem['source']) : null;
      const rank = s(raw?.rank, 40);
      const yearText = s(raw?.year, 12);
      if (!source || !rank) continue;
      // Evidence check: the numeric part of the rank must appear in the snippets.
      const nums = rank.replace(/,/g, '').match(/\d+/g) || [];
      if (nums.length && !nums.some((n) => blob.includes(n))) continue;
      const scope = raw?.scope === 'program' ? 'program' : 'university';
      if (out.some((r) => r.source === source && r.scope === scope)) continue;
      out.push({ source, scope, rank, year: yearText });
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

// Merge freshly scraped rankings into the profile: program-scope entries are
// prioritized (PRD), and a new entry replaces an older one for the same
// source+scope.
function mergeRankings(current: RankingItem[], incoming: RankingItem[]): RankingItem[] {
  const out = [...current];
  for (const item of incoming) {
    const idx = out.findIndex((r) => r.source === item.source && r.scope === item.scope);
    if (idx >= 0) out[idx] = item;
    else out.push(item);
  }
  return out
    .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'program' ? -1 : 1))
    .slice(0, 8);
}

export async function parseBrochurePdf(url: string, fileName: string, deps: AgentDeps, sourceFile?: File): Promise<string | null> {
  deps.setWorking(`Reading ${fileName}…`);
  let text = '';
  try {
    text = s(await analyzeDocument(url, BROCHURE_TEXT_PROMPT, sourceFile), 15000);
  } catch {
    text = '';
  }
  if (/^NO_TEXT/i.test(text)) text = '';

  let parsed: any = null;
  if (text) {
    parsed = await structuredBrochureExtract(text).catch(() => null);
  }
  if (!parsed) {
    try {
      parsed = extractJson(await analyzeDocument(url, BROCHURE_PROMPT, sourceFile));
    } catch {
      return null;
    }
  }
  if (!parsed || parsed.is_program_document === false) return null;

  const current = deps.profile;
  const next = normalizeProfile({ ...current });
  const fill = (key: 'city' | 'country' | 'tuitionAnnual' | 'durationMonths' | 'scholarships', value: string) => {
    if (value && !next[key]) next[key] = value;
  };
  fill('city', s(parsed.city, 120));
  fill('country', s(parsed.country, 120));
  fill('tuitionAnnual', s(parsed.tuition_annual, 200));
  fill('durationMonths', s(parsed.duration_months, 80));
  fill('scholarships', s(parsed.scholarships, 600));
  const intakes = asArr<any>(parsed.intakes).map((x) => s(x, 20)).filter(Boolean);
  if (intakes.length && !next.intakes.length) next.intakes = intakes.slice(0, 4);

  // Capstone: only graduation-required components count; optional components
  // are folded into unique features instead (PRD).
  const required = mapCapstone(s(parsed?.capstone?.required, 80));
  if (required && !next.capstone) next.capstone = required;
  const optional = asArr<any>(parsed?.capstone?.optional_components).map((x) => s(x, 200)).filter(Boolean);
  const features = [...asArr<any>(parsed.unique_features).map((x) => s(x, 300)).filter(Boolean), ...optional.map((o) => `Optional: ${o}`)];
  for (const f of features) {
    if (next.uniqueFeatures.length >= 12) break;
    if (!next.uniqueFeatures.some((x) => x.toLowerCase() === f.toLowerCase())) next.uniqueFeatures.push(f);
  }

  const outcomes = parsed.outcomes && typeof parsed.outcomes === 'object' ? parsed.outcomes : {};
  if (!next.outcomes.placement3m) next.outcomes.placement3m = s(outcomes.placement_3m, 120);
  if (!next.outcomes.placement6m) next.outcomes.placement6m = s(outcomes.placement_6m, 120);
  const employers = asArr<any>(outcomes.employers).map((x) => s(x, 80)).filter(Boolean);
  for (const e of employers) {
    if (next.outcomes.employers.length >= 15) break;
    if (!next.outcomes.employers.some((x) => x.toLowerCase() === e.toLowerCase())) next.outcomes.employers.push(e);
  }

  const brochureRankings: RankingItem[] = asArr<any>(parsed.rankings)
    .map((r: any): RankingItem | null => {
      const source = ['THE', 'QS', 'ARWU', 'FT'].includes(r?.source) ? (r.source as RankingItem['source']) : null;
      const rank = s(r?.rank, 40);
      if (!source || !rank) return null;
      return { source, scope: r?.scope === 'program' ? 'program' : 'university', rank, year: s(r?.year, 12) };
    })
    .filter((r): r is RankingItem => !!r);

  // Live ranking lookup (the internet is authoritative for "latest"; brochure
  // rankings fill any source the scrape couldn't verify).
  deps.setWorking('Checking the latest rankings…');
  const university = s(parsed.university, 140) || deps.institutionName;
  const scraped = await fetchProgramRankings(university, deps.program.name, isBusinessProgram(deps.program, next)).catch(() => []);
  next.rankings = mergeRankings(mergeRankings(next.rankings, brochureRankings), scraped);
  next.rankingsCheckedAt = new Date().toISOString();

  if (text) {
    next.brochureText = text;
    next.brochureSourceUrl = url;
  }
  next.brochureParsedAt = new Date().toISOString();

  deps.setWorking('Building the program profile…');
  const withSummary = await regenerateSummary(next, deps);
  await deps.saveProfile(withSummary);
  deps.profile = withSummary;
  return `Parsed ${fileName} and updated the program Profile`;
}

// ---------------------------------------------------------------------------
// AI-generated profile fields

// The program summary is regenerated whenever any part of the profile changes
// (PRD update logic). Never user-editable.
export async function regenerateSummary(profile: ProgramProfile, deps: AgentDeps): Promise<ProgramProfile> {
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content:
            'You are Alma, a university recruitment assistant. Write a crisp program summary grounded ONLY in the provided data. Return ONLY valid JSON like {"summary":"..."}.',
        },
        {
          role: 'user',
          content: `Program: "${deps.program.name}" (${s(deps.program.level, 20) || 'level unknown'})${
            deps.program.campus_location ? ` at ${s(deps.program.campus_location, 100)}` : ''
          }, intakes: ${asArr<string>(deps.program.intakes as any).join(', ') || '—'}.\nProfile data:\n${JSON.stringify({
            ...profile,
            summary: undefined,
            brochureText: undefined,
            brochureSourceUrl: undefined,
          })}\n\nWrite a 4-6 sentence summary of this program for internal recruitment use — what it is, where it runs, cost/duration/intakes if known, its standout features, capstone requirements, and outcomes. Only use the data above; skip anything unknown without calling it missing. Return ONLY {"summary":"..."}.`,
        },
      ],
      { temperature: 0.4, maxTokens: 500 }
    );
    const parsed = extractJson(res.content);
    if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
      return { ...profile, summary: s(parsed.summary, 2000) };
    }
    return profile;
  } catch {
    return profile;
  }
}

// "What the admissions committee is looking for" — generated from what the
// representative has shared in the chat (PRD).
export async function regenerateAdmissionsLookingFor(profile: ProgramProfile, intake: IntakeData): Promise<string> {
  const relevant = ['qualities', 'regions', 'thresholds', 'attractive', 'expectations']
    .map((k) => (intake.answers[k] ? `${k}: ${s(intake.answers[k], 240)}` : ''))
    .filter(Boolean)
    .join('\n');
  if (!relevant) return '';
  try {
    const res = await llmChat(
      [
        { role: 'system', content: 'You are Alma, a university recruitment assistant. Return ONLY valid JSON like {"lookingFor":"..."}.' },
        {
          role: 'user',
          content: `Based on what this program's representative has shared in our chat:\n${relevant}\n\nWrite 2-4 sentences describing what the admissions committee is looking for in candidates — qualities, academic thresholds, and target regions. Return ONLY {"lookingFor":"..."}.`,
        },
      ],
      { temperature: 0.4, maxTokens: 320 }
    );
    const parsed = extractJson(res.content);
    return typeof parsed?.lookingFor === 'string' ? s(parsed.lookingFor, 1400) : '';
  } catch {
    return '';
  }
}

// Shared by manual Profile edits: persists the change, then refreshes the AI
// summary so it reflects the edit (PRD update logic).
export async function saveProfileWithSummaryRefresh(next: ProgramProfile, deps: AgentDeps): Promise<void> {
  await deps.saveProfile(next);
  deps.profile = next;
  const withSummary = await regenerateSummary(next, deps);
  if (withSummary.summary !== next.summary) {
    await deps.saveProfile(withSummary);
    deps.profile = withSummary;
  }
}

// ---------------------------------------------------------------------------
// Action execution

async function executeAction(action: RawAction, deps: AgentDeps, turn: TurnFlags): Promise<string[]> {
  switch (action.type) {
    case 'save_intake_answers': {
      const answers = action.answers && typeof action.answers === 'object' ? action.answers : {};
      const captured: Record<string, string> = {};
      const validIds = new Set(INTAKE_QUESTIONS.map((q) => q.id));
      for (const [key, value] of Object.entries(answers)) {
        if (validIds.has(key) && typeof value === 'string' && value.trim()) captured[key] = s(value, 500);
      }
      if (!Object.keys(captured).length) return [];
      return applyStateCapture(
        { answers: captured, tuition: null, wantsSearch: false, searchCriteria: null, wantsBrochureRebuild: false, briefConsent: null },
        deps,
        turn
      );
    }

    case 'update_profile': {
      const { next, changed } = applyProfilePatch(action.profile, deps.profile);
      if (!changed) return [];
      await deps.saveProfile(next);
      deps.profile = next;
      turn.profileChanged = true;
      return ['Updated the program Profile'];
    }

    case 'update_brief': {
      if (!action.factors || typeof action.factors !== 'object') return [];
      // Merge per factor: only factors the model populated replace current
      // ones; everything else is preserved (prevents accidental brief wipes).
      const incoming = normalizeBrief({ factors: action.factors });
      const next = normalizeBrief(JSON.parse(JSON.stringify(deps.brief)));
      let changed = false;
      for (const def of FACTOR_DEFS) {
        const buckets = incoming.factors[def.key];
        const hasContent = BUCKET_DEFS.some((b) => buckets[b.key].length > 0);
        if (!hasContent) continue;
        next.factors[def.key] = buckets;
        changed = true;
      }
      if (!changed || !briefChanged(deps.brief, next)) return [];
      await deps.saveBrief(next);
      deps.brief = next;
      return ['Updated the Search Brief'];
    }

    case 'set_candidate_status': {
      const id = Number(action.candidateId);
      const status = String(action.status || '') as CandidateStatus;
      const candidate = deps.candidates.find((c) => c.id === id);
      if (!candidate || !['saved', 'skipped'].includes(status)) {
        return ["Couldn't find that candidate — no changes made"];
      }
      const name = candidate.name || candidate.student_email || 'the candidate';
      if (candidate.status === 'contacted') {
        return [`${name} has already been contacted — that's irreversible, so no changes were made`];
      }
      const feedback =
        status === 'skipped'
          ? { reasons: [], note: s(action.reason, 240) || 'Skipped from the chat' }
          : undefined;
      const ok = await deps.setStatus(id, status, feedback);
      if (!ok) return ["Couldn't move that candidate — no changes made"];
      if (status === 'skipped') return [`Moved ${name} to Skipped`];
      return candidate.status === 'skipped' ? [`Moved ${name} back to your Shortlist (Saved)`] : [`Added ${name} to your Shortlist (Saved)`];
    }

    case 'search_candidates': {
      if (turn.searchRan) return [];
      const criteria: SearchCriteria = action.criteria && typeof action.criteria === 'object' ? action.criteria : {};
      const result = await discoverCandidates(criteria, deps);
      turn.searchRan = true;
      if (result.added > 0) {
        deps.onCandidatesDiscovered?.();
        return [`Searched Scout's opted-in students and added ${result.added} candidate${result.added === 1 ? '' : 's'} to your Recommendations`];
      }
      return [`Search finished — no matching candidates found${result.reason ? ` (${result.reason})` : ''}`];
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Turn-level intent helpers

function wantsCandidateSearch(userText: string): boolean {
  const text = userText.toLowerCase();
  return (
    /\b(find|search|look for|source|discover|recommend|suggest|get|scout)\b/.test(text) &&
    /\b(candidate|candidates|student|students|applicant|applicants|prospect|prospects|talent)\b/.test(text)
  );
}

function wantsBrochureRebuildText(userText: string): boolean {
  const text = userText.toLowerCase();
  if (!/\b(brochure|prospectus)\b/.test(text) && !/\bprofile\b/.test(text)) return false;
  return (
    (/\b(brochure|prospectus)\b/.test(text) && /\b(parse|read|extract|use|process|from|didn'?t|did not|failed|ignore)/.test(text)) ||
    (/\bprofile\b/.test(text) && /\b(incomplete|missing|empty|not (?:complete|updated|filled)|didn'?t|did not|still)\b/.test(text))
  );
}

function promisesBackgroundWork(reply: string): boolean {
  return /\b(please )?(hold on|hang on|hang tight|bear with me|one moment|just a moment|a moment while|give me a (?:moment|minute|second)|please wait|while i (?:process|gather|search|look|compile|pull|work)|i(?:'|’)ll (?:now )?(?:start|begin) (?:search|process|gather)ing)\b/i.test(
    reply
  );
}

function latestBrochureDoc(documents: DocumentRow[]): DocumentRow | null {
  return (
    documents.find((d) => d.url && d.kind === 'brochure') ||
    documents.find((d) => d.url && /brochure|prospectus/i.test(d.name)) ||
    documents.find((d) => d.url && d.content_type === 'application/pdf') ||
    null
  );
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = l.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackReply(deps: AgentDeps, actionLines: string[]): string {
  const next = nextIntakeQuestion(deps.intake);
  if (actionLines.length) {
    return `Here's what I just did:\n${actionLines.map((l) => `- ${l}`).join('\n')}${next ? `\n\nNext up: ${next.text}` : ''}`;
  }
  return next
    ? `I couldn't finish that one — could you rephrase it? In the meantime: ${next.text}`
    : "I couldn't finish that one — could you rephrase it?";
}

async function rewriteStalledReply(draft: string, actionLines: string[]): Promise<string> {
  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          'You fix an assistant reply that wrongly promised background work. Nothing runs in the background: whatever is listed as done is ALL that happened. Return ONLY JSON like {"reply":"..."}.',
      },
      {
        role: 'user',
        content: `Draft reply (it promises work that will never run — do not repeat that):\n"""${s(draft, 700)}"""\n\nActually completed this turn:\n${
          actionLines.length ? actionLines.map((l) => `- ${l}`).join('\n') : '- nothing'
        }\n\nRewrite the reply: state plainly what was done (or that it could not be done), with no promises of future or background work and no "hold on"/"one moment" phrasing. If information is needed from the representative, ask for it directly. Warm tone, at most 3 sentences. Return ONLY {"reply":"..."}.`,
      },
    ],
    { temperature: 0.2, maxTokens: 400 }
  );
  const parsed = extractJson(res.content);
  return typeof parsed?.reply === 'string' ? parsed.reply.trim() : '';
}

// ---------------------------------------------------------------------------
// The agent turn

export interface AgentTurnResult {
  reply: string;
  actionLines: string[];
}

export async function runAgentTurn(userText: string, attachmentNote: string, deps: AgentDeps): Promise<AgentTurnResult> {
  const turn = newTurnFlags();
  turn.brochureParsed = /parsed as a program brochure/i.test(attachmentNote);
  const actionLines: string[] = [];
  const notes: string[] = [];

  // 1) Deterministic capture: answers/tuition math are saved no matter what
  //    the chat model later does or fails to do.
  let cap: CapturedState | null = null;
  try {
    cap = await extractStateUpdates(userText, deps);
  } catch {
    cap = null;
  }
  if (cap) {
    try {
      const lines = await applyStateCapture(cap, deps, turn);
      actionLines.push(...lines);
      if (lines.length) notes.push(`Already saved this turn (state is updated — never ask permission or re-confirm): ${lines.join('; ')}.`);
    } catch {
      // saving failed; the responder can still handle the message
    }
    if (deps.intake.tuitionPending?.perCredit && !deps.intake.tuitionPending.totalCredits && !deps.intake.answers.tuition) {
      notes.push(
        'The tuition was given per credit but the TOTAL CREDITS are missing. Ask for the total number of credits (never research it yourself); the system will compute the annual fee once provided.'
      );
    }
  }

  // 1b) Constraint protection: resolve a pending "save criteria to brief?" question.
  const pendingCriteria = pendingBriefCriteria(deps.intake);
  if (pendingCriteria && cap?.briefConsent) {
    if (cap.briefConsent === 'yes') {
      const changed = await applyCriteriaToBrief(deps, pendingCriteria);
      if (changed) {
        actionLines.push('Updated the Search Brief with the criteria from your last search');
        notes.push('The representative agreed to save the earlier ad-hoc search criteria — the Search Brief was JUST updated with them.');
      }
    } else {
      notes.push('The representative declined saving the earlier ad-hoc criteria — the Search Brief was left untouched. Do not bring it up again.');
    }
    await setPendingBriefCriteria(deps, null);
  }

  // 2) Brochure → profile rebuild, run deterministically when asked.
  if ((cap?.wantsBrochureRebuild || wantsBrochureRebuildText(userText)) && !turn.brochureParsed) {
    const doc = latestBrochureDoc(deps.documents);
    if (doc?.url) {
      const line = await parseBrochurePdf(doc.url, doc.name, deps).catch(() => null);
      if (line) {
        actionLines.push(line);
        turn.brochureParsed = true;
        turn.summaryRefreshed = true;
        notes.push(`You JUST re-read the program brochure (${doc.name}) and updated the program Profile from it. Tell them what was filled in.`);
      } else {
        notes.push(`You tried to re-read ${doc.name} just now but could not extract program details from it. Say that honestly and ask them to re-upload the brochure PDF here in chat.`);
      }
    } else {
      notes.push('The representative references a brochure but none is on file. Ask them to attach the prospectus PDF here in chat.');
    }
  }

  // 3) Candidate search — runs BEFORE the reply so the reply reports real results.
  const searchAsked = !!cap?.wantsSearch || wantsCandidateSearch(userText);
  if (searchAsked && !turn.searchRan) {
    const criteria: SearchCriteria = cap?.searchCriteria && typeof cap.searchCriteria === 'object' ? cap.searchCriteria : {};
    const hasCriteria = !!(s(criteria.focus, 200) || s(criteria.regions, 200) || s(criteria.minGpa, 120) || s(criteria.notes, 240));
    let result: { added: number; reason?: string };
    try {
      result = await discoverCandidates(criteria, deps);
    } catch {
      result = { added: 0, reason: 'the candidate search failed unexpectedly' };
    }
    turn.searchRan = true;
    if (result.added > 0) {
      deps.onCandidatesDiscovered?.();
      actionLines.push(`Searched Scout's opted-in students and added ${result.added} candidate${result.added === 1 ? '' : 's'} to your Recommendations`);
      notes.push(
        `A candidate search JUST COMPLETED and added ${result.added} candidate(s) to Recommendations (right panel). Report this in past tense and invite them to review.`
      );
    } else {
      actionLines.push(`Searched Scout's opted-in students — no new matching candidates found${result.reason ? ` (${result.reason})` : ''}`);
      notes.push(
        `A candidate search just completed but added nothing new${result.reason ? ` — reason: ${result.reason}` : ''}. Say that plainly, including the reason (never pretend results are coming).`
      );
    }
    // Constraint protection (PRD): ad-hoc criteria are NEVER saved to the
    // Search Brief without explicit consent — remember them and ask.
    if (hasCriteria) {
      await setPendingBriefCriteria(deps, {
        focus: s(criteria.focus, 200),
        regions: s(criteria.regions, 200),
        minGpa: s(criteria.minGpa, 120),
        notes: s(criteria.notes, 240),
      });
      notes.push(
        'This search used AD-HOC criteria which were NOT saved to the Search Brief. In your reply, briefly ask whether they want those criteria saved to their search preferences. Do NOT emit update_brief now.'
      );
    }
  }

  // 4) The reply.
  deps.setWorking('Thinking…');
  const history = deps.messages.slice(-16).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: s(m.content, 900),
  }));
  const noteBlock = notes.length
    ? `\n\n[System notes — true facts about THIS turn, invisible to the representative:\n${notes.map((n) => `- ${n}`).join('\n')}]`
    : '';
  const userContent = (attachmentNote ? `${userText}\n\n[System note: ${attachmentNote}]` : userText) + noteBlock;

  let content = '';
  try {
    const res = await llmChat(
      [
        { role: 'system', content: buildSystemPrompt(deps) },
        ...history,
        { role: 'user', content: userContent },
      ],
      { temperature: 0.4, maxTokens: 1800 }
    );
    content = res.content;
  } catch {
    // The deterministic work above already happened; report it honestly.
    return { reply: fallbackReply(deps, dedupeLines(actionLines)), actionLines: dedupeLines(actionLines) };
  }

  const parsed = extractJson(content);
  let reply = '';
  let actions: RawAction[] = [];
  if (parsed && typeof parsed.reply === 'string') {
    reply = parsed.reply;
    actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : [];
  } else {
    reply = rescueReply(content) || content.replace(/```json|```/g, '').trim();
  }

  for (const action of actions) {
    if (!action || typeof action.type !== 'string') continue;
    try {
      const lines = await executeAction(action, deps, turn);
      actionLines.push(...lines);
    } catch {
      actionLines.push(`Couldn't complete an action (${String(action.type).replace(/_/g, ' ')}) — please try again`);
    } finally {
      deps.setWorking('Thinking…');
    }
  }

  // 5) Any profile change this turn refreshes the AI-generated fields (PRD:
  //    edits must update the AI summary).
  if (turn.profileChanged && !turn.summaryRefreshed) {
    turn.summaryRefreshed = true;
    try {
      deps.setWorking('Refreshing the program summary…');
      let refreshed = await regenerateSummary(deps.profile, deps);
      const lookingFor = await regenerateAdmissionsLookingFor(refreshed, deps.intake);
      if (lookingFor) refreshed = { ...refreshed, admissionsLookingFor: lookingFor };
      if (refreshed.summary !== deps.profile.summary || refreshed.admissionsLookingFor !== deps.profile.admissionsLookingFor) {
        await deps.saveProfile(refreshed);
        deps.profile = refreshed;
        actionLines.push('Refreshed the AI summary on the program Profile');
      }
    } catch {
      // summary refresh is best-effort
    }
  }

  // 6) Stall guard: a reply that promises background work while nothing ran is
  //    rewritten once, then replaced with a deterministic honest reply.
  const finalLines = dedupeLines(actionLines);
  if (promisesBackgroundWork(reply) && !turn.searchRan && !turn.brochureParsed) {
    let rewritten = '';
    try {
      rewritten = await rewriteStalledReply(reply, finalLines);
    } catch {
      rewritten = '';
    }
    reply = rewritten || fallbackReply(deps, finalLines);
  }
  if (!reply.trim()) reply = fallbackReply(deps, finalLines);

  return { reply, actionLines: finalLines };
}

// ---------------------------------------------------------------------------
// Startup maintenance
//
// Runs once per program open: recovers chat-stated answers that were never
// saved, parses a brochure that has not fed the profile yet, and runs the
// first candidate discovery for a fresh program.

async function recoverIntakeFromHistory(deps: AgentDeps): Promise<Record<string, string> | null> {
  const unanswered = INTAKE_QUESTIONS.filter((q) => !(deps.intake.answers[q.id] || '').trim());
  const userMessages = deps.messages.filter((m) => m.role === 'user');
  if (!unanswered.length || userMessages.length < 3) return null;
  const transcript = deps.messages
    .slice(-40)
    .map((m) => `${m.role === 'assistant' ? 'Alma' : 'Representative'}: ${s(m.content, 220)}`)
    .join('\n');
  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          "You recover a university representative's already-given answers from a chat transcript. Return ONLY valid JSON. Only use answers they explicitly gave — never infer or invent.",
      },
      {
        role: 'user',
        content: `Unanswered intake questions:\n${unanswered.map((q) => `- ${q.id}: "${q.text}"`).join('\n')}\n\nChat transcript (oldest first):\n${transcript}\n\nReturn ONLY JSON: {"answers":{"<questionId>":"<their answer, in their words>"}}\nInclude a questionId ONLY if the representative clearly answered that question somewhere in the transcript. Use their most recent answer when they changed it. Do not include questions they never answered.`,
      },
    ],
    { temperature: 0, maxTokens: 700 }
  );
  const parsed = extractJson(res.content);
  if (!parsed?.answers || typeof parsed.answers !== 'object') return null;
  const validIds = new Set(unanswered.map((q) => q.id));
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.answers)) {
    if (validIds.has(k) && typeof v === 'string' && v.trim()) answers[k] = s(v, 500);
  }
  return Object.keys(answers).length ? answers : null;
}

export async function runStartupMaintenance(deps: AgentDeps): Promise<string[]> {
  const lines: string[] = [];
  const turn = newTurnFlags();

  // Purge stored placeholder answers ("i already replied above") left behind
  // by older sessions: they are not real answers, block the checklist from
  // re-asking, and poison the Search Brief when factors reseed from them.
  try {
    const answers = deps.intake.answers || {};
    const junkKeys = Object.keys(answers).filter((k) => isNonAnswerText(answers[k] || ''));
    if (junkKeys.length) {
      const nextAnswers = { ...answers };
      for (const k of junkKeys) delete nextAnswers[k];
      const nextIntake: IntakeData = { ...deps.intake, answers: nextAnswers };
      await deps.saveIntake(nextIntake);
      deps.intake = { ...nextIntake, completed: intakeCompleted(nextIntake) };
      lines.push('Cleared placeholder answers from your program setup so I can ask again properly');
    }
  } catch {
    // cleanup is best-effort
  }

  // The campus location given at program creation is authoritative for the
  // profile's Location section — seed it whenever city/country are empty so
  // the profile never shows "Not set yet" for a location the representative
  // already provided.
  try {
    if (!deps.profile.city && !deps.profile.country && (deps.program.campus_location || '').trim()) {
      const campus = parseCampusLocation(deps.program.campus_location);
      if (campus.city || campus.country) {
        const { next, changed } = applyProfilePatch({ city: campus.city, country: campus.country }, deps.profile);
        if (changed) {
          await deps.saveProfile(next);
          deps.profile = next;
        }
      }
    }
  } catch {
    // seeding is best-effort
  }

  try {
    const recovered = await recoverIntakeFromHistory(deps);
    if (recovered) {
      lines.push(
        ...(await applyStateCapture(
          { answers: recovered, tuition: null, wantsSearch: false, searchCriteria: null, wantsBrochureRebuild: false, briefConsent: null },
          deps,
          turn
        ))
      );
    }
  } catch {
    // recovery is best-effort
  }

  // A brochure that exists but never fed the profile gets parsed now (covers
  // the brochure submitted at program creation).
  try {
    if (!deps.profile.brochureParsedAt) {
      const doc = latestBrochureDoc(deps.documents);
      if (doc?.url) {
        const line = await parseBrochurePdf(doc.url, doc.name, deps).catch(() => null);
        if (line) lines.push(line);
      }
    }
  } catch {
    // parsing is best-effort
  }

  // First-open discovery: populate Recommendations from Scout's opted-in pool
  // exactly once; an empty pool doesn't retrigger on every visit.
  try {
    if (!deps.candidates.length && !deps.intake.discoveryRanAt) {
      const result = await discoverCandidates({}, deps);
      const stamped: IntakeData = { ...deps.intake, discoveryRanAt: new Date().toISOString() };
      deps.intake = stamped;
      // Persisting the discovery marker and refreshing the newly inserted
      // candidates are independent, so neither request should block the other.
      await Promise.all([deps.saveIntake(stamped), deps.reloadCandidates()]);
      if (result.added > 0) {
        deps.onCandidatesDiscovered?.();
        lines.push(`Added ${result.added} recommended candidate${result.added === 1 ? '' : 's'} from Scout's opted-in students`);
      }
    }
  } catch {
    // discovery is best-effort
  }

  // Heal briefs polluted with verbatim sentences or filler signals: rebuild
  // the affected factors from their stored answers via keyword distillation,
  // then strip whatever garbage remains.
  try {
    if (briefHasInvalidEntries(deps.brief)) {
      const before = JSON.stringify(deps.brief.factors);
      await reconcileBriefWithAnswers(deps, new Set());
      const cleaned = sanitizeBrief(deps.brief);
      if (briefChanged(deps.brief, cleaned)) {
        await deps.saveBrief(cleaned);
        deps.brief = cleaned;
      }
      if (JSON.stringify(deps.brief.factors) !== before) lines.push('Rebuilt your Search Brief with clean keywords');
    }
  } catch {
    // healing is best-effort
  }

  return dedupeLines(lines);
}

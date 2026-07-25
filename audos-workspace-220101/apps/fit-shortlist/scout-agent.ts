// Scout — agentic engine.
//
// Reliability model: anything that MUST happen (capturing answers, updating the
// brief, re-parsing the resume, running searches after preference changes) is
// done deterministically in code around the LLM, not by hoping the chat model
// emits the right action. The chat model writes the human reply and may emit
// supplementary actions; a deterministic extraction pre-pass captures state
// from every user message first, and guards catch "hold on…" style stalls.

import {
  BUCKET_DEFS,
  BriefData,
  DetailBullet,
  DetailSection,
  DocumentRow,
  EducationItem,
  ExtraItem,
  FACTOR_DEFS,
  FactorKey,
  FitReason,
  INTAKE_QUESTIONS,
  IntakeData,
  MessageRow,
  MiscItem,
  ProfileData,
  ProgramDetails,
  ProgramRow,
  ProgramStatus,
  ResearchItem,
  STATUS_LABELS,
  SkipFeedback,
  WorkItem,
  asArr,
  emptyProfile,
  extractJson,
  intakeCompleted,
  isBoardStatus,
  nextIntakeQuestion,
  normalizeBrief,
  questionApplies,
  rescueReply,
  sniffProgramLevel,
} from './scout-types';
import { NewProgram, analyzeDocument, llmChat, webSearch } from './scout-store';

export interface AgentDeps {
  email: string;
  displayName: string;
  intake: IntakeData;
  brief: BriefData;
  profile: ProfileData;
  programs: ProgramRow[];
  documents: DocumentRow[];
  messages: MessageRow[];
  saveIntake: (next: IntakeData) => Promise<void>;
  saveBrief: (next: BriefData) => Promise<void>;
  saveProfile: (next: ProfileData) => Promise<void>;
  setStatus: (id: number, next: ProgramStatus, feedback?: SkipFeedback) => Promise<void>;
  updateProgram: (id: number, patch: Record<string, any>) => Promise<void>;
  addPrograms: (items: NewProgram[]) => Promise<number>;
  setWorking: (label: string | null) => void;
  onProgramsDiscovered?: () => void;
}

const s = (v: unknown, max = 400): string => (v == null ? '' : String(v)).trim().slice(0, max);

// Per-turn flags so deterministic steps and model-emitted actions don't double up.
interface TurnFlags {
  capturedKeys: string[];
  lookingForRefreshed: boolean;
  searchRan: boolean;
  resumeParsed: boolean;
}

function newTurnFlags(): TurnFlags {
  return { capturedKeys: [], lookingForRefreshed: false, searchRan: false, resumeParsed: false };
}

// ---------------------------------------------------------------------------
// System prompt

function describeIntake(intake: IntakeData): string {
  const lines = INTAKE_QUESTIONS.map((q) => {
    if (q.gradOnly && intake.programLevel !== 'graduate') {
      return `- ${q.id} — (only asked for graduate students${intake.programLevel === 'undergraduate' ? '; SKIPPED for this student' : '; pending until level is known'})`;
    }
    const answer = intake.answers[q.id];
    return `- ${q.id} — ${answer ? `ANSWERED: "${s(answer, 200)}"` : 'NOT ANSWERED YET'} — "${q.text}"`;
  });
  const next = nextIntakeQuestion(intake);
  lines.push(next ? `NEXT QUESTION TO ASK: ${next.id} — "${next.text}"` : 'CHECKLIST COMPLETE — no intake questions left to ask.');
  return lines.join('\n');
}

function describePrograms(programs: ProgramRow[]): string {
  if (!programs.length) return '(none yet)';
  return programs
    .slice(0, 60)
    .map((p) => `#${p.id} | ${p.university} — ${p.program_name} | status: ${p.status}`)
    .join('\n');
}

function profileForPrompt(profile: ProfileData): string {
  // The raw resume text has its own prompt section; keep it out of the JSON dump.
  return JSON.stringify({ ...profile, resumeText: undefined, resumeSourceUrl: undefined, resumeParsedAt: undefined });
}

function buildSystemPrompt(deps: AgentDeps): string {
  const { intake, brief, profile, programs, documents, displayName } = deps;
  const resumeSection = profile.resumeText
    ? `\nRESUME ON FILE (parsed text of the student's uploaded resume — you HAVE full access to this):\n"""${s(profile.resumeText, 2800)}"""\n`
    : '';
  return `You are Scout, an agentic AI advisor who helps students discover and shortlist university programs. You are talking to ${displayName || 'a student'}. Today's date: ${new Date().toDateString()}.

You can EXECUTE ACTIONS, not just chat. Respond with ONLY a valid JSON object (no markdown fences, no text outside the JSON):
{"reply": "<your markdown message to the student>", "actions": [ ...zero or more of the actions below... ]}

AVAILABLE ACTIONS:
1. {"type":"save_intake_answers","answers":{"<questionId>":"<answer in the student's words>"},"programLevel":"undergraduate"|"graduate","profileVisible":true|false}
   Record answers to intake checklist questions whenever the student answers one OR volunteers the information unprompted. Include only the keys that apply.
2. {"type":"update_profile","profile":{...}}
   Use when the student asks to change their profile or shares new profile-relevant facts (work, research, academics, skills, extracurriculars, location). Start from CURRENT PROFILE below and return the COMPLETE updated object (sections you omit stay untouched). Preserve items you are not changing exactly as they are, including their "aiSummary". Never invent facts.
3. {"type":"update_brief","factors":{"majors":{"excellent":[],"good":[],"borderline":[],"notAFit":[]},"ranking":{...},"location":{...},"budget":{...},"postStudyRole":{...}}}
   The Search Brief is your internal document of the student's search preferences, bucketed by fit. Include ONLY the factors you want to change — factors you leave out (or leave with all-empty buckets) are preserved as they are. Never return an emptied factor to "clear" it unless the student explicitly asked to remove those preferences.
4. {"type":"search_programs","criteria":{"focus":"<what to look for>","university":"<limit to one university>","locations":"<where>","level":"<undergraduate/graduate/degree type>","budget":"<constraint>","count":5}}
   Trigger a live web search for real university programs. Found programs are added to the student's Recommendations automatically. Include only relevant criteria keys; omit "criteria" entirely to search from the student's saved preferences.
5. {"type":"set_program_status","programId":<id>,"status":"saved"|"safe"|"target"|"dream"|"skipped"}
   Manage the shortlist: move a program between shortlist columns (saved/safe/target/dream), skip one the student no longer wants, or bring a skipped program back (use "saved").

CRITICAL RULES:
- NOTHING RUNS IN THE BACKGROUND. Work happens ONLY through actions in THIS response, and system notes tell you what already happened this turn. NEVER say "hold on", "one moment", "please wait", "while I process/gather", or promise results "shortly". If something already ran (see system notes), report its outcome in past tense. If you cannot do something, say so plainly and ask for what you need.
- PREFERENCE CHANGES ARE SAVED AUTOMATICALLY. When the student states or changes a preference (budget, locations, majors, level, goals), the system captures it before you reply — the system note lists what was saved. NEVER ask "would you like me to proceed with this update?" or re-confirm; acknowledge the change as done.
- ONE QUESTION AT A TIME. Work through the intake checklist below in order, weaving exactly one unanswered question naturally into each reply (after addressing whatever the student said). NEVER re-ask an ANSWERED question — a changed answer (e.g. new budget) does not reset the checklist; continue from the next UNANSWERED question only.
- The "motivations" question is ONLY for students interested in graduate programs. Skip it for undergraduates.
- CLARIFY BEFORE ACTING. If a requested action is ambiguous (e.g. "remove a skill" without naming it, or a program reference that matches nothing in PROGRAMS), ask a clarifying question and emit NO action for it.
- If the student asks you to find/recommend programs, the system usually runs the search before you reply (see system notes). Only emit search_programs yourself if no search ran this turn and the student clearly wants one.
- RESUME ACCESS: if a RESUME ON FILE section appears below, you have the resume's full text — answer questions about it directly and NEVER say you cannot access the resume. Profile updates from the resume happen automatically; if the student says their profile is incomplete, the system re-parses the resume this turn (see system notes) — report what was filled in.
- If CURRENT PROFILE shows a completed or in-progress master's, MBA, MPhil, doctorate, or other postgraduate education, treat the student as looking for graduate/postgraduate opportunities unless they explicitly ask for a bachelor's/undergraduate search.
- Answer questions about their current recommendations, shortlist, profile, brief, or documents directly from the state below — no action needed for reading.
- Be warm, personal, and concise. Refer to programs by name. Never fabricate programs, scores, or facts.

INTAKE CHECKLIST STATE:
${describeIntake(intake)}

CURRENT SEARCH BRIEF (factors → fit buckets):
${JSON.stringify(brief.factors)}

CURRENT PROFILE:
${profileForPrompt(profile)}
${resumeSection}
PROGRAMS (id | university — program | status):
${describePrograms(programs)}

DOCUMENTS: ${documents.length ? documents.map((d) => `${d.name} (${d.kind})`).join(', ') : '(none)'}
`;
}

// ---------------------------------------------------------------------------
// Profile patch validation

interface RawAction {
  type?: string;
  [key: string]: any;
}

function normalizeFitReasons(raw: any): FitReason[] {
  return asArr<any>(raw)
    .map((r) => ({ title: s(r?.title, 80) || 'Why it fits', detail: s(r?.detail, 400) }))
    .filter((r) => r.detail)
    .slice(0, 5);
}

function normalizeProfilePatch(raw: any, current: ProfileData): ProfileData {
  const next: ProfileData = { ...current };
  if (!raw || typeof raw !== 'object') return next;
  if (typeof raw.name === 'string') next.name = s(raw.name, 80);
  if (typeof raw.headline === 'string') next.headline = s(raw.headline, 160);
  if (typeof raw.location === 'string') next.location = s(raw.location, 120);
  if (typeof raw.visible === 'boolean') next.visible = raw.visible;
  if (typeof raw.bio === 'string') next.bio = s(raw.bio, 1200);
  if (typeof raw.lookingFor === 'string') next.lookingFor = s(raw.lookingFor, 1200);
  if (Array.isArray(raw.education)) {
    next.education = raw.education
      .slice(0, 12)
      .map((e: any): EducationItem => {
        if (typeof e === 'string') {
          return {
            institute: '',
            degree: s(e, 140),
            field: '',
            grade: '',
            startYear: '',
            endYear: '',
            inProgress: false,
            aiSummary: '',
          };
        }
        return {
          institute: s(e?.institute, 140),
          degree: s(e?.degree, 100),
          field: s(e?.field, 120),
          grade: s(e?.grade, 60),
          startYear: s(e?.startYear, 20),
          endYear: s(e?.endYear, 20),
          inProgress: !!e?.inProgress,
          aiSummary: s(e?.aiSummary, 400),
        };
      })
      .filter((e) => e.institute || e.degree || e.field);
  }
  if (Array.isArray(raw.work)) {
    next.work = raw.work
      .slice(0, 15)
      .map((w: any): WorkItem => ({
        company: s(w?.company, 140),
        title: s(w?.title, 140),
        startDate: s(w?.startDate, 40),
        endDate: s(w?.endDate, 40),
        current: !!w?.current,
        description: s(w?.description, 2000),
        aiSummary: s(w?.aiSummary, 400),
      }))
      .filter((w) => w.company || w.title || w.description);
  }
  if (Array.isArray(raw.research)) {
    next.research = raw.research
      .slice(0, 12)
      .map((r: any): ResearchItem => ({
        title: s(r?.title, 200),
        venue: s(r?.venue, 140),
        date: s(r?.date, 40),
        url: s(r?.url, 300),
        aiSummary: s(r?.aiSummary, 400),
      }))
      .filter((r) => r.title || r.venue);
  }
  if (Array.isArray(raw.skills)) {
    next.skills = raw.skills.map((x: any) => s(x, 60)).filter(Boolean).slice(0, 40);
  }
  if (typeof raw.skillsSummary === 'string') next.skillsSummary = s(raw.skillsSummary, 400);
  if (Array.isArray(raw.extracurriculars)) {
    next.extracurriculars = raw.extracurriculars
      .slice(0, 12)
      .map((e: any): ExtraItem => ({
        title: s(e?.title, 140),
        description: s(e?.description, 800),
        aiSummary: s(e?.aiSummary, 400),
      }))
      .filter((e) => e.title || e.description);
  }
  if (Array.isArray(raw.misc)) {
    next.misc = raw.misc
      .slice(0, 12)
      .map((m: any): MiscItem => ({ title: s(m?.title, 140), detail: s(m?.detail, 800) }))
      .filter((m) => m.title || m.detail);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Search Brief ↔ intake answers reconciliation

function splitList(v: string): string[] {
  return v
    .split(/,|;| and /i)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && x.length < 80);
}

function titleCase(x: string): string {
  return x.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function locationChips(answer: string): string[] {
  const chips = [...prefCountries(answer).map(displayCountry), ...prefCities(answer).map(titleCase)];
  return chips.length ? chips : splitList(answer);
}

const ANSWER_FACTOR_MAP: { answer: string; factor: FactorKey; single?: boolean; chips?: (v: string) => string[] }[] = [
  { answer: 'majors', factor: 'majors' },
  { answer: 'locations', factor: 'location', chips: locationChips },
  { answer: 'budget', factor: 'budget', single: true },
  { answer: 'outcomes', factor: 'postStudyRole' },
  { answer: 'priorities', factor: 'ranking' },
];

function briefChanged(a: BriefData, b: BriefData): boolean {
  return JSON.stringify(a.factors) !== JSON.stringify(b.factors);
}

// The student's stated answers are authoritative for the "excellent" bucket:
// replace it when the answer changed this turn, and seed it whenever it is
// empty while an answer exists (self-heal for briefs that were wiped).
async function reconcileBriefWithAnswers(deps: AgentDeps, changedKeys: Set<string>): Promise<boolean> {
  const answers = deps.intake.answers || {};
  const next = normalizeBrief(JSON.parse(JSON.stringify(deps.brief)));
  for (const map of ANSWER_FACTOR_MAP) {
    const answer = (answers[map.answer] || '').trim();
    if (!answer) continue;
    const changedNow = changedKeys.has(map.answer);
    const empty = next.factors[map.factor].excellent.length === 0;
    if (!changedNow && !empty) continue;
    const values = (map.single ? [answer.slice(0, 80)] : (map.chips ? map.chips(answer) : splitList(answer))).slice(0, 8);
    if (!values.length) continue;
    next.factors[map.factor].excellent = values;
  }
  if (!briefChanged(deps.brief, next)) return false;
  await deps.saveBrief(next);
  deps.brief = next;
  return true;
}

// ---------------------------------------------------------------------------
// Profile-derived search signals

function educationText(profile: ProfileData): string {
  return profile.education.map((e) => `${e.degree} ${e.field} ${e.institute}`.trim()).join(' ');
}

function inferProfileSearchLevel(profile: ProfileData): 'graduate' | 'undergraduate' | '' {
  const text = educationText(profile).toLowerCase();
  if (/(phd|ph\.d|doctorate|doctoral|master|msc|m\.sc|ms\b|m\.s\b|ma\b|m\.a\b|mba|mres|mphil|postgraduate|post-graduate)/.test(text)) {
    return 'graduate';
  }
  // A completed/ongoing bachelor's means the next degree is a graduate one.
  if (/(bachelor|b\.sc|bsc|bs\b|b\.s\b|ba\b|b\.a\b|bcom|b\.com|undergraduate)/.test(text)) return 'graduate';
  return '';
}

function inferAcademicFocus(profile: ProfileData): string[] {
  const ignore = new Set([
    'bachelor',
    'bachelors',
    'master',
    'masters',
    'science',
    'arts',
    'degree',
    'university',
    'college',
  ]);
  const chunks = profile.education
    .flatMap((e) => [e.field, e.degree])
    .concat(profile.skills.slice(0, 10))
    .map((x) => x.replace(/\b(bachelor|master|science|arts|degree|of|in|with|and)\b/gi, ' '))
    .join(',')
    .split(/,|\/|;|\band\b/i)
    .map((x) => x.trim().replace(/\s+/g, ' '))
    .filter((x) => x.length > 2 && x.length < 80 && !ignore.has(x.toLowerCase()));
  const seen = new Set<string>();
  return chunks.filter((x) => {
    const key = x.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function programLevelText(program: ProgramRow): string {
  return `${program.program_name} ${program.degree_type || ''} ${program.summary || ''}`.toLowerCase();
}

async function moveUndergraduateProgramsOutOfActiveList(deps: AgentDeps): Promise<number> {
  const stalePrograms = deps.programs.filter((program) => {
    if (program.status === 'skipped') return false;
    const text = programLevelText(program);
    return isUndergraduateText(text) && !isGraduateText(text);
  });
  for (const program of stalePrograms) {
    await deps.setStatus(program.id, 'skipped', {
      reasons: ["The program doesn't match my expectations"],
      note: 'Moved automatically after the resume indicated a postgraduate search.',
    });
  }
  return stalePrograms.length;
}

async function applyResumeSearchSignals(profile: ProfileData, deps: AgentDeps): Promise<string[]> {
  const lines: string[] = [];
  const level = inferProfileSearchLevel(profile);
  if (level) {
    const currentLevel = deps.intake.programLevel || sniffProgramLevel(deps.intake.answers?.level || '');
    if (currentLevel !== level) {
      const nextIntake: IntakeData = {
        ...deps.intake,
        programLevel: level,
        answers: {
          ...deps.intake.answers,
          level: level === 'graduate' ? 'graduate/postgraduate programs' : 'undergraduate programs',
        },
      };
      nextIntake.completed = intakeCompleted(nextIntake);
      await deps.saveIntake(nextIntake);
      deps.intake = nextIntake;
      lines.push(level === 'graduate' ? 'Set your search level to postgraduate' : 'Set your search level to undergraduate');
    }
    if (level === 'graduate') {
      const moved = await moveUndergraduateProgramsOutOfActiveList(deps);
      if (moved) lines.push(`Moved ${moved} undergraduate recommendation${moved === 1 ? '' : 's'} out of your active shortlist`);
    }
  }

  // Seed majors from the resume only if the student hasn't stated majors.
  if (!(deps.intake.answers?.majors || '').trim() && deps.brief.factors.majors.excellent.length === 0) {
    const focus = inferAcademicFocus(profile).slice(0, 5);
    if (focus.length) {
      const next = normalizeBrief(JSON.parse(JSON.stringify(deps.brief)));
      next.factors.majors.excellent = focus;
      await deps.saveBrief(next);
      deps.brief = next;
      lines.push('Updated your Search Brief from your resume');
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Action execution

async function executeAction(action: RawAction, deps: AgentDeps, turn: TurnFlags): Promise<string[]> {
  switch (action.type) {
    case 'save_intake_answers': {
      const answers = action.answers && typeof action.answers === 'object' ? action.answers : {};
      const validIds = new Set(INTAKE_QUESTIONS.map((q) => q.id));
      const captured: Record<string, string> = {};
      for (const [key, value] of Object.entries(answers)) {
        if (validIds.has(key) && typeof value === 'string' && value.trim()) captured[key] = s(value, 500);
      }
      const hasLevel = action.programLevel === 'undergraduate' || action.programLevel === 'graduate';
      const hasVisibility = typeof action.profileVisible === 'boolean';
      if (!Object.keys(captured).length && !hasLevel && !hasVisibility) return [];
      return applyStateCapture(
        {
          answers: captured,
          programLevel: hasLevel ? (action.programLevel as 'undergraduate' | 'graduate') : '',
          profileVisible: hasVisibility ? !!action.profileVisible : null,
          wantsSearch: false,
          wantsProfileRebuild: false,
          searchCriteria: null,
        },
        deps,
        turn
      );
    }

    case 'update_profile': {
      if (!action.profile || typeof action.profile !== 'object') return [];
      const next = normalizeProfilePatch(action.profile, deps.profile);
      await deps.saveProfile(next);
      deps.profile = next;
      return ['Updated your Profile'];
    }

    case 'update_brief': {
      if (!action.factors || typeof action.factors !== 'object') return [];
      // Merge per factor: only factors the model populated replace current
      // ones; everything else is preserved. This prevents brief wipes when the
      // model sends a partial object (the old replace-all behavior blanked
      // every factor the model left out).
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
      return ['Updated your Search Brief'];
    }

    case 'set_program_status': {
      const id = Number(action.programId);
      const status = String(action.status || '') as ProgramStatus;
      const valid: ProgramStatus[] = ['saved', 'safe', 'target', 'dream', 'skipped'];
      const program = deps.programs.find((p) => p.id === id);
      if (!program || !valid.includes(status)) return ["Couldn't find that program — no changes made"];
      await deps.setStatus(id, status);
      const name = `${program.university} — ${program.program_name}`;
      if (status === 'skipped') return [`Moved ${name} to Skipped`];
      if (isBoardStatus(program.status)) return [`Moved ${name} to ${STATUS_LABELS[status]}`];
      return [`Added ${name} to your shortlist (${STATUS_LABELS[status]})`];
    }

    case 'search_programs': {
      if (turn.searchRan) return [];
      deps.setWorking('Searching the web for programs…');
      const result = await discoverPrograms(action.criteria || {}, deps);
      turn.searchRan = true;
      if (result.added > 0) {
        deps.onProgramsDiscovered?.();
        return [`Searched the web and added ${result.added} program${result.added === 1 ? '' : 's'} to your Recommendations`];
      }
      return [`Search finished — no matching programs found${result.reason ? ` (${result.reason})` : ''}`];
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Deterministic state capture (runs on EVERY user message, before the reply)

interface CapturedState {
  answers: Record<string, string>;
  programLevel: 'undergraduate' | 'graduate' | '';
  profileVisible: boolean | null;
  wantsSearch: boolean;
  wantsProfileRebuild: boolean;
  searchCriteria: SearchCriteria | null;
}

async function extractStateUpdates(userText: string, deps: AgentDeps): Promise<CapturedState | null> {
  if (!userText.trim()) return null;
  const lastAssistant = [...deps.messages].reverse().find((m) => m.role === 'assistant');
  const questionLines = INTAKE_QUESTIONS.map((q) => {
    const current = deps.intake.answers[q.id];
    return `- ${q.id}: "${q.text}"${current ? ` — current answer: "${s(current, 160)}"` : ' — unanswered'}`;
  }).join('\n');

  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          'You extract structured data from ONE student message in a university-search chat. Return ONLY valid JSON. Never invent information the student did not state in this message.',
      },
      {
        role: 'user',
        content: `Intake checklist questions (with current answers):
${questionLines}

Assistant's last message (what the student is replying to):
"${s(lastAssistant?.content || '', 500) || '(none)'}"

Student's new message:
"${s(userText, 900)}"

Return ONLY JSON:
{"answers": {"<questionId>": "<answer in the student's own words>"},
 "programLevel": "undergraduate" | "graduate" | "",
 "profileVisible": true | false | null,
 "wantsSearch": true | false,
 "wantsProfileRebuild": true | false,
 "searchCriteria": {"focus":"","locations":"","level":"","budget":"","university":"","count":5} | null}

Rules:
- "answers": include a questionId ONLY if this message answers it for the first time OR changes the existing answer. Use the student's own words. Do NOT repeat unchanged current answers. Short confirmations ("yes", "sure", "go ahead") answer whatever the assistant's last message asked or proposed — resolve them into the actual answer.
- "programLevel": fill only when this message makes the level clear (a stated master's/MBA/PhD goal means "graduate").
- "profileVisible": true/false only when this message answers the profile-visibility question; otherwise null.
- "wantsSearch": true when the student asks to find / search / recommend / suggest programs or universities now.
- "wantsProfileRebuild": true when the student asks to build, update, or fix their profile from their resume/CV, or complains that the resume was not parsed or their profile is incomplete.
- "searchCriteria": only when wantsSearch is true and ONLY with constraints stated in THIS message; otherwise null.`,
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
  const criteria = parsed.searchCriteria && typeof parsed.searchCriteria === 'object' ? parsed.searchCriteria : null;
  return {
    answers,
    programLevel: parsed.programLevel === 'undergraduate' || parsed.programLevel === 'graduate' ? parsed.programLevel : '',
    profileVisible: typeof parsed.profileVisible === 'boolean' ? parsed.profileVisible : null,
    wantsSearch: !!parsed.wantsSearch,
    wantsProfileRebuild: !!parsed.wantsProfileRebuild,
    searchCriteria: criteria,
  };
}

// Apply captured state to intake/profile/brief. Shared by the deterministic
// pre-pass and the model's save_intake_answers action (idempotent merges).
async function applyStateCapture(cap: CapturedState, deps: AgentDeps, turn: TurnFlags): Promise<string[]> {
  const lines: string[] = [];
  const validIds = new Set(INTAKE_QUESTIONS.map((q) => q.id));
  const captured: Record<string, string> = {};
  for (const [key, value] of Object.entries(cap.answers || {})) {
    if (!validIds.has(key) || typeof value !== 'string' || !value.trim()) continue;
    const next = s(value, 500);
    if ((deps.intake.answers[key] || '').trim().toLowerCase() === next.toLowerCase()) continue;
    captured[key] = next;
  }
  const hasLevel = cap.programLevel === 'undergraduate' || cap.programLevel === 'graduate';
  if (hasLevel && !captured.level && !(deps.intake.answers.level || '').trim()) {
    captured.level = cap.programLevel === 'graduate' ? 'graduate/postgraduate programs' : 'undergraduate programs';
  }
  if (typeof cap.profileVisible === 'boolean' && !captured.visibility && !(deps.intake.answers.visibility || '').trim()) {
    captured.visibility = cap.profileVisible ? 'Yes — profile visible to universities' : 'No — keep my profile hidden';
  }

  const levelChanged = hasLevel && deps.intake.programLevel !== cap.programLevel;
  if (Object.keys(captured).length || levelChanged) {
    const nextIntake: IntakeData = {
      ...deps.intake,
      answers: { ...deps.intake.answers, ...captured },
      programLevel: hasLevel
        ? (cap.programLevel as 'undergraduate' | 'graduate')
        : deps.intake.programLevel || sniffProgramLevel(captured.level || ''),
    };
    nextIntake.completed = intakeCompleted(nextIntake);
    await deps.saveIntake(nextIntake);
    deps.intake = nextIntake;
    const count = Object.keys(captured).length;
    if (count) lines.push(count === 1 ? 'Saved your answer to your search setup' : `Saved ${count} answers to your search setup`);
    turn.capturedKeys.push(...Object.keys(captured));
    if (levelChanged && !captured.level) turn.capturedKeys.push('level');
  }

  if (typeof cap.profileVisible === 'boolean' && cap.profileVisible !== deps.profile.visible) {
    const nextProfile = { ...deps.profile, visible: cap.profileVisible };
    await deps.saveProfile(nextProfile);
    deps.profile = nextProfile;
    lines.push(cap.profileVisible ? 'Made your profile visible to universities' : 'Kept your profile hidden from universities');
  }

  if (await reconcileBriefWithAnswers(deps, new Set(turn.capturedKeys))) {
    lines.push('Updated your Search Brief');
  }

  if (
    !turn.lookingForRefreshed &&
    ['majors', 'outcomes', 'priorities', 'motivations', 'level'].some((k) => captured[k])
  ) {
    turn.lookingForRefreshed = true;
    const lookingFor = await regenerateLookingFor(deps.intake, deps.profile);
    if (lookingFor) {
      const nextProfile = { ...deps.profile, lookingFor };
      await deps.saveProfile(nextProfile);
      deps.profile = nextProfile;
      lines.push('Refreshed "What you\'re looking for" on your Profile');
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Turn-level intent helpers

function wantsProgramSearch(userText: string): boolean {
  const text = userText.toLowerCase();
  return (
    /\b(find|search|recommend|suggest|show|look for|gather)\b/.test(text) &&
    /\b(program|programs|course|courses|degree|degrees|universit|college|school|options|opportunities)\b/.test(text)
  );
}

function wantsResumeRebuild(userText: string): boolean {
  const text = userText.toLowerCase();
  if (!/\b(resume|cv)\b/.test(text) && !/\bprofile\b/.test(text)) return false;
  return (
    (/\b(resume|cv)\b/.test(text) && /\b(parse|read|extract|use|process|from|didn'?t|did not|failed|ignore)/.test(text)) ||
    (/\bprofile\b/.test(text) && /\b(incomplete|missing|empty|not (?:complete|updated|filled)|didn'?t|did not|still)\b/.test(text))
  );
}

function promisesBackgroundWork(reply: string): boolean {
  return /\b(please )?(hold on|hang on|hang tight|bear with me|one moment|just a moment|a moment while|give me a (?:moment|minute|second)|please wait|while i (?:process|gather|search|look|compile|pull|work)|i(?:'|’)ll (?:now )?(?:start|begin) (?:search|process|gather)ing)\b/i.test(
    reply
  );
}

function latestResumeDoc(documents: DocumentRow[]): DocumentRow | null {
  return (
    documents.find((d) => d.url && d.kind === 'resume') ||
    documents.find((d) => d.url && /resume|cv/i.test(d.name)) ||
    documents.find((d) => d.url && d.content_type === 'application/pdf') ||
    null
  );
}

const PREF_KEYS = ['majors', 'level', 'locations', 'budget', 'outcomes', 'priorities'];

function knownMajors(deps: AgentDeps): string {
  return (
    (deps.intake.answers.majors || '').trim() ||
    deps.brief.factors.majors.excellent.join(', ') ||
    inferAcademicFocus(deps.profile).slice(0, 5).join(', ')
  );
}

function knownLevel(deps: AgentDeps): 'graduate' | 'undergraduate' | '' {
  return (
    deps.intake.programLevel ||
    sniffProgramLevel(deps.intake.answers.level || '') ||
    inferProfileSearchLevel(deps.profile)
  );
}

function knownLocations(deps: AgentDeps): string {
  return (deps.intake.answers.locations || '').trim() || deps.brief.factors.location.excellent.join(', ');
}

function knownBudget(deps: AgentDeps): string {
  return (deps.intake.answers.budget || '').trim() || deps.brief.factors.budget.excellent.join(', ');
}

function searchReadiness(deps: AgentDeps): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!knownMajors(deps)) missing.push('what they want to study');
  if (!knownLevel(deps)) missing.push('undergraduate vs graduate');
  if (!knownLocations(deps)) missing.push('their preferred locations');
  return { ok: missing.length === 0, missing };
}

function haveCoreFour(deps: AgentDeps): boolean {
  return !!(knownMajors(deps) && knownLevel(deps) && knownLocations(deps) && knownBudget(deps));
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

async function rewriteStalledReply(draft: string, actionLines: string[], deps: AgentDeps): Promise<string> {
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
        }\n\nRewrite the reply: state plainly what was done (or that it could not be done), with no promises of future or background work and no "hold on"/"one moment" phrasing. If information is needed from the student, ask for it directly. Warm tone, at most 3 sentences. Return ONLY {"reply":"..."}.`,
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
  turn.resumeParsed = /parsed as a resume/i.test(attachmentNote);
  const actionLines: string[] = [];
  const notes: string[] = [];

  // 1) Deterministic capture: answers/preferences are saved no matter what the
  //    chat model later does or fails to do.
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
  }

  // 2) Resume → profile rebuild, run deterministically when asked or complained about.
  if ((cap?.wantsProfileRebuild || wantsResumeRebuild(userText)) && !turn.resumeParsed) {
    const doc = latestResumeDoc(deps.documents);
    if (doc?.url) {
      deps.setWorking(`Re-reading ${doc.name}…`);
      const line = await parseResumePdf(doc.url, doc.name, deps).catch(() => null);
      if (line) {
        actionLines.push(line);
        turn.resumeParsed = true;
        const p = deps.profile;
        notes.push(
          `You JUST re-read the student's resume (${doc.name}) and updated their Profile from it. It now has ${p.education.length} education item(s), ${p.work.length} work item(s), ${p.skills.length} skill(s), ${p.research.length} research item(s), ${p.extracurriculars.length} extracurricular(s). Tell them what was filled in — do NOT apologize about resume access.`
        );
      } else {
        notes.push(
          `You tried to re-read ${doc.name} just now but could not extract details from it. Say that honestly and ask the student to re-upload their resume PDF here in chat.`
        );
      }
    } else {
      notes.push('The student references a resume but none is on file. Ask them to attach their resume PDF here in chat.');
    }
  }

  // 3) Program search — runs BEFORE the reply so the reply reports real results.
  //    Triggers: an explicit ask, or a preference change once search-ready.
  const readiness = searchReadiness(deps);
  const searchAsked = !!cap?.wantsSearch || wantsProgramSearch(userText);
  const prefsChanged = turn.capturedKeys.some((k) => PREF_KEYS.includes(k));
  const hasActivePrograms = deps.programs.some((p) => p.status !== 'skipped');

  // Changed preferences immediately re-filter existing recommendations.
  if (prefsChanged) {
    try {
      const enforced = await enforcePreferencesOnPrograms(deps);
      if (enforced.length) {
        actionLines.push(...enforced);
        notes.push(
          'Recommendations that no longer matched the updated preferences were ALREADY moved to Skipped automatically — mention it briefly.'
        );
      }
    } catch {
      // enforcement is best-effort
    }
  }
  const autoSearch = prefsChanged && readiness.ok && (hasActivePrograms || haveCoreFour(deps));
  if (searchAsked || autoSearch) {
    if (readiness.ok || s(cap?.searchCriteria?.university, 120)) {
      deps.setWorking('Searching the web for programs…');
      let result: { added: number; reason?: string };
      try {
        result = await discoverPrograms(cap?.searchCriteria || {}, deps);
      } catch {
        result = { added: 0, reason: 'the search service was unreachable' };
      }
      turn.searchRan = true;
      if (result.added > 0) {
        deps.onProgramsDiscovered?.();
        actionLines.push(`Searched the web and added ${result.added} new program${result.added === 1 ? '' : 's'} to your Recommendations`);
        notes.push(
          `A live web search JUST COMPLETED and added ${result.added} new program(s) to the student's Recommendations (right panel). Report this in past tense and invite them to review — do not say a search is starting.`
        );
      } else {
        actionLines.push(`Searched the web — no new matching programs found${result.reason ? ` (${result.reason})` : ''}`);
        notes.push(
          `A live web search just completed but added nothing new${result.reason ? ` — reason: ${result.reason}` : ''}. Say that plainly and suggest ONE concrete way to widen the search (never pretend results are coming).`
        );
      }
    } else {
      notes.push(
        `The student wants program recommendations, but required information is missing: ${readiness.missing.join(', ')}. DO NOT claim a search is running or coming. Ask for the missing information (one question).`
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
    ? `\n\n[System notes — true facts about THIS turn, invisible to the student:\n${notes.map((n) => `- ${n}`).join('\n')}]`
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

  // 5) Stall guard: a reply that promises background work while nothing ran is
  //    rewritten once, then replaced with a deterministic honest reply.
  const finalLines = dedupeLines(actionLines);
  if (promisesBackgroundWork(reply) && !turn.searchRan && !turn.resumeParsed) {
    let rewritten = '';
    try {
      rewritten = await rewriteStalledReply(reply, finalLines, deps);
    } catch {
      rewritten = '';
    }
    reply = rewritten || fallbackReply(deps, finalLines);
  }
  if (!reply.trim()) reply = fallbackReply(deps, finalLines);

  return { reply, actionLines: finalLines };
}

// ---------------------------------------------------------------------------
// Startup maintenance: transcript answer recovery + preference enforcement.
// Older Scout versions could lose stated answers and keep recommendations that
// violate the student's preferences. These converge saved state with reality:
// recovery runs once on app open; enforcement also re-runs after preference
// changes so stale recommendations move to Skipped with an honest note.

function violationFor(
  p: ProgramRow,
  c: { targetCountries: string[]; targetCities: string[]; budgetMax: number; level: string }
): { option: string; note: string } | null {
  const text = programLevelText(p);
  if (c.level === 'graduate' && isUndergraduateText(text) && !isGraduateText(text)) {
    return {
      option: "The program doesn't match my expectations",
      note: 'Moved automatically: undergraduate program while your search level is postgraduate.',
    };
  }
  if (c.level === 'undergraduate' && isGraduateText(text) && !isUndergraduateText(text)) {
    return {
      option: "The program doesn't match my expectations",
      note: 'Moved automatically: graduate program while your search level is undergraduate.',
    };
  }
  const pCountry = canonicalCountry(p.location || '') || countryFromHost(hostOf(p.website || ''));
  if (c.targetCountries.length && pCountry && !c.targetCountries.includes(pCountry)) {
    return {
      option: "Location doesn't work for me",
      note: `Moved automatically: ${p.location || displayCountry(pCountry)} is outside your preferred locations.`,
    };
  }
  if (c.targetCities.length && p.location && !cityMatches(normText(p.location), c.targetCities)) {
    return {
      option: "Location doesn't work for me",
      note: `Moved automatically: ${p.location} is not in your preferred cities (${c.targetCities.map(titleCase).join(', ')}).`,
    };
  }
  if (c.budgetMax) {
    const amounts = parseTuitionUsd(p.tuition || '');
    if (amounts.length && Math.min(...amounts) > c.budgetMax * 1.05) {
      return {
        option: 'The Tuition is out of my budget',
        note: `Moved automatically: listed tuition (${p.tuition}) is above your budget.`,
      };
    }
  }
  if (deadlineStatus(p.deadline || '') === 'past') {
    return {
      option: "The program doesn't match my expectations",
      note: `Moved automatically: the application deadline (${p.deadline}) has already passed.`,
    };
  }
  return null;
}

export async function enforcePreferencesOnPrograms(deps: AgentDeps): Promise<string[]> {
  const locations = knownLocations(deps);
  const constraints = {
    targetCountries: prefCountries(locations),
    targetCities: prefCities(locations),
    budgetMax: parseBudgetMaxUsd(knownBudget(deps)),
    level: knownLevel(deps),
  };
  let moved = 0;
  for (const p of deps.programs) {
    // Banned links (social media, forums, listicles) are scrubbed everywhere.
    if (p.website && isBannedHost(p.website)) {
      try {
        await deps.updateProgram(p.id, { website: null });
      } catch {
        // scrub is best-effort
      }
      p.website = null;
    }
    if (p.status !== 'recommended') continue;
    const violation = violationFor(p, constraints);
    if (!violation) continue;
    try {
      await deps.setStatus(p.id, 'skipped', { reasons: [violation.option], note: violation.note });
      moved++;
    } catch {
      // keep checking the rest
    }
  }
  return moved ? [`Moved ${moved} recommendation${moved === 1 ? '' : 's'} that no longer match your preferences to Skipped`] : [];
}

// Answers the student already gave in chat but that never got saved (an old
// bug) are recovered from the transcript — restricted to still-unanswered
// questions so newer saved answers can never be overwritten by old messages.
async function recoverIntakeFromHistory(deps: AgentDeps): Promise<CapturedState | null> {
  const unanswered = INTAKE_QUESTIONS.filter(
    (q) => questionApplies(q, deps.intake) && !(deps.intake.answers[q.id] || '').trim()
  );
  const userMessages = deps.messages.filter((m) => m.role === 'user');
  if (!unanswered.length || userMessages.length < 3) return null;
  const transcript = deps.messages
    .slice(-40)
    .map((m) => `${m.role === 'assistant' ? 'Scout' : 'Student'}: ${s(m.content, 220)}`)
    .join('\n');
  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          "You recover a student's already-given answers from a chat transcript. Return ONLY valid JSON. Only use answers the student explicitly gave — never infer or invent.",
      },
      {
        role: 'user',
        content: `Unanswered intake questions:\n${unanswered.map((q) => `- ${q.id}: "${q.text}"`).join('\n')}\n\nChat transcript (oldest first):\n${transcript}\n\nReturn ONLY JSON: {"answers":{"<questionId>":"<the student's answer, in their words>"}}\nInclude a questionId ONLY if the student clearly answered that question somewhere in the transcript (a short reply like "no" or "yes" counts when it directly follows Scout asking that question). Use their most recent answer when they changed it. Do not include questions they never answered.`,
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
  if (!Object.keys(answers).length) return null;
  return { answers, programLevel: '', profileVisible: null, wantsSearch: false, wantsProfileRebuild: false, searchCriteria: null };
}

export async function runStartupMaintenance(deps: AgentDeps): Promise<string[]> {
  const lines: string[] = [];
  const turn = newTurnFlags();
  // Profile writes at startup belong to the resume pipeline; keep recovery off it.
  turn.lookingForRefreshed = true;
  try {
    const recovered = await recoverIntakeFromHistory(deps);
    if (recovered) lines.push(...(await applyStateCapture(recovered, deps, turn)));
  } catch {
    // recovery is best-effort
  }
  try {
    lines.push(...(await enforcePreferencesOnPrograms(deps)));
  } catch {
    // enforcement is best-effort
  }
  return dedupeLines(lines);
}

// ---------------------------------------------------------------------------
// Location / budget / deadline / domain constraint helpers

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  'united states': ['usa', 'us', 'u s', 'u s a', 'united states', 'united states of america', 'america', 'american', 'the states', 'states'],
  'united kingdom': ['uk', 'u k', 'united kingdom', 'britain', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  canada: ['canada', 'canadian'],
  australia: ['australia', 'australian'],
  germany: ['germany', 'german'],
  france: ['france', 'french'],
  netherlands: ['netherlands', 'holland', 'dutch'],
  singapore: ['singapore'],
  'hong kong': ['hong kong'],
  japan: ['japan', 'japanese'],
  china: ['china', 'chinese'],
  india: ['india', 'indian'],
  ireland: ['ireland', 'irish'],
  switzerland: ['switzerland', 'swiss'],
  sweden: ['sweden', 'swedish'],
  denmark: ['denmark', 'danish'],
  norway: ['norway', 'norwegian'],
  finland: ['finland', 'finnish'],
  italy: ['italy', 'italian'],
  spain: ['spain', 'spanish'],
  'new zealand': ['new zealand'],
  'united arab emirates': ['uae', 'united arab emirates', 'dubai', 'abu dhabi'],
  'south korea': ['south korea', 'korea', 'korean'],
};

const SINGLE_WORD_COUNTRY_TOKENS = new Set(
  Object.values(COUNTRY_SYNONYMS)
    .flat()
    .filter((syn) => !syn.includes(' '))
);

function normText(x: string): string {
  return (x || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function prefCountries(text: string): string[] {
  const t = ` ${normText(text)} `;
  const out: string[] = [];
  for (const [canon, syns] of Object.entries(COUNTRY_SYNONYMS)) {
    if (syns.some((syn) => t.includes(` ${syn} `))) out.push(canon);
  }
  return out;
}

function canonicalCountry(raw: string): string {
  const t = ` ${normText(raw)} `;
  if (!t.trim()) return '';
  for (const [canon, syns] of Object.entries(COUNTRY_SYNONYMS)) {
    if (syns.some((syn) => t.includes(` ${syn} `))) return canon;
  }
  return '';
}

const DISPLAY_COUNTRY: Record<string, string> = {
  'united states': 'USA',
  'united kingdom': 'UK',
  'united arab emirates': 'UAE',
};

function displayCountry(canon: string): string {
  return DISPLAY_COUNTRY[canon] || titleCase(canon);
}

const CITY_ALIASES: Record<string, string> = {
  la: 'los angeles',
  sf: 'san francisco',
  ny: 'new york',
  nyc: 'new york',
  'new york city': 'new york',
  dc: 'washington dc',
  philly: 'philadelphia',
};

const LOCATION_NOISE = new Set([
  'only', 'big', 'cities', 'city', 'preferably', 'prefer', 'preferred', 'mainly', 'ideally', 'etc',
  'area', 'areas', 'major', 'metro', 'in', 'the', 'and', 'or', 'of', 'to', 'around', 'near', 'like',
  'somewhere', 'anywhere', 'region', 'regions', 'country', 'countries',
]);

function prefCities(text: string): string[] {
  const lower = (text || '').toLowerCase();
  if (/\b(anywhere|any city|any cities|no preference|flexible|open to any)\b/.test(lower)) return [];
  const chunks = lower
    .split(/[,;/\n]|\band\b|\bor\b|\s[-–—]\s/)
    .map((c) => c.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    const words = chunk
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !LOCATION_NOISE.has(w) && !SINGLE_WORD_COUNTRY_TOKENS.has(w));
    if (!words.length) continue;
    let name = words.join(' ');
    name = CITY_ALIASES[name] || name;
    if (name.length < 2 || name.length > 40) continue;
    if (canonicalCountry(name)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out.slice(0, 8);
}

// Well-known suburb → hub-city hints so "Cambridge" counts as Boston, etc.
const METRO_HINTS: Record<string, string> = {
  cambridge: 'boston', somerville: 'boston', medford: 'boston', waltham: 'boston',
  berkeley: 'san francisco', 'palo alto': 'san francisco', stanford: 'san francisco',
  'mountain view': 'san francisco', 'san jose': 'san francisco', oakland: 'san francisco', 'santa clara': 'san francisco',
  pasadena: 'los angeles', 'long beach': 'los angeles', irvine: 'los angeles', fullerton: 'los angeles', malibu: 'los angeles',
  evanston: 'chicago', hoboken: 'new york', newark: 'new york', 'jersey city': 'new york', 'new brunswick': 'new york',
  bethesda: 'washington dc', arlington: 'washington dc', 'college park': 'washington dc',
};

function cityMatches(cityBlob: string, targetCities: string[]): boolean {
  if (!targetCities.length) return true;
  if (targetCities.some((c) => cityBlob.includes(c))) return true;
  return Object.entries(METRO_HINTS).some(([suburb, hub]) => cityBlob.includes(suburb) && targetCities.includes(hub));
}

function parseBudgetMaxUsd(text: string): number {
  const t = (text || '').toLowerCase().replace(/,/g, '');
  const amounts: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(k\b|thousand\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let v = parseFloat(m[1]);
    if (m[2]) v *= 1000;
    if (v >= 900 && v <= 1000000) amounts.push(v);
  }
  return amounts.length ? Math.max(...amounts) : 0;
}

function parseTuitionUsd(text: string): number[] {
  const raw = text || '';
  // Only trust explicitly USD-marked figures; skip strings marked as another currency.
  if (/\b(cad|aud|sgd|nzd|hkd|eur|gbp|inr|chf)\b|c\$|a\$|s\$|£|€|₹/i.test(raw) && !/\busd\b/i.test(raw)) return [];
  const t = raw.replace(/,/g, '');
  const out: number[] = [];
  const re = /(?:\$|usd\s?)\s?(\d+(?:\.\d+)?)\s*(k\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let v = parseFloat(m[1]);
    if (m[2]) v *= 1000;
    if (v >= 900 && v <= 1000000) out.push(v);
  }
  return out;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const SEASON_MONTH: Record<string, number> = { spring: 2, summer: 5, fall: 8, autumn: 8, winter: 0 };

export function deadlineStatus(text: string, now = new Date()): 'future' | 'past' | 'unknown' {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return 'unknown';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dates: number[] = [];
  let sawExplicit = false;

  const pushMonthDay = (monthName: string, dayStr: string, yearStr?: string) => {
    const m = MONTH_INDEX[monthName.slice(0, 3)];
    const d = parseInt(dayStr, 10);
    if (m == null || !(d >= 1 && d <= 31)) return;
    if (yearStr) {
      dates.push(new Date(parseInt(yearStr, 10), m, d).getTime());
    } else {
      // No year stated → the next occurrence of that month/day (upcoming cycle).
      const cand = new Date(now.getFullYear(), m, d);
      if (cand.getTime() < today) cand.setFullYear(now.getFullYear() + 1);
      dates.push(cand.getTime());
    }
    sawExplicit = true;
  };

  let m: RegExpExecArray | null;
  const mdy = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?/gi;
  while ((m = mdy.exec(t))) pushMonthDay(m[1], m[2], m[3]);
  const dmy = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:[,\s]+(\d{4}))?/gi;
  while ((m = dmy.exec(t))) pushMonthDay(m[2], m[1], m[3]);
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(t))) {
    dates.push(new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getTime());
    sawExplicit = true;
  }
  const slash = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  while ((m = slash.exec(t))) {
    dates.push(new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10)).getTime());
    sawExplicit = true;
  }
  const season = /(fall|autumn|spring|summer|winter)\s*(?:of\s*)?(\d{4})/gi;
  while ((m = season.exec(t))) {
    dates.push(new Date(parseInt(m[2], 10), SEASON_MONTH[m[1]] ?? 8, 1).getTime());
    sawExplicit = true;
  }
  if (!sawExplicit) {
    const yearOnly = /\b(20\d{2})\b/g;
    while ((m = yearOnly.exec(t))) dates.push(new Date(parseInt(m[1], 10), 11, 31).getTime());
  }
  if (!dates.length) return 'unknown';
  return dates.some((d) => d >= today) ? 'future' : 'past';
}

// Hosts that are NEVER acceptable as a program link (social, forums, video,
// blogs, Q&A, scholarship listicles) — the Facebook-group incident class.
const BANNED_HOST_RE =
  /(facebook\.|fb\.com|instagram\.|twitter\.|(^|\.)x\.com|linkedin\.|reddit\.|quora\.|youtube\.|youtu\.be|tiktok\.|medium\.com|wikipedia\.|wikihow\.|blogspot\.|wordpress\.|tumblr\.|pinterest\.|whatsapp\.|telegram\.|discord\.|scholarship|essay|coursehero|chegg|studocu|slideshare|scribd|yelp\.|glassdoor|indeed\.|apply\s?board|applyboard|yocket|shiksha|collegedunia|leverageedu|idp\.com|timeshighereducation)/i;

function isBannedHost(url: string): boolean {
  const host = hostOf(url);
  return !!host && BANNED_HOST_RE.test(host);
}

const UNIVERSITY_NAME_STOPWORDS = new Set([
  'university', 'college', 'institute', 'institution', 'school', 'state', 'the', 'of', 'and', 'for', 'at', 'in',
]);

// A program link must live on the university's own web estate: academic TLDs
// (.edu, .ac.xx, .edu.xx) or a host that carries the university's name/acronym.
function isAcademicHost(host: string, university: string): boolean {
  if (!host) return false;
  if (/\.edu$|\.edu\.[a-z]{2,3}$|\.ac\.[a-z]{2,3}$/.test(host)) return true;
  const words = normText(university)
    .split(' ')
    .filter((w) => w.length > 1 && !UNIVERSITY_NAME_STOPWORDS.has(w));
  if (words.some((w) => w.length >= 4 && host.includes(w))) return true;
  const significant = normText(university)
    .split(' ')
    .filter((w) => w.length > 2 && w !== 'of' && w !== 'the' && w !== 'and' && w !== 'for');
  const acronym = significant.map((w) => w[0]).join('');
  if (acronym.length >= 3 && host.split('.')[0].includes(acronym)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Web-sourced program discovery

interface SearchCriteria {
  focus?: string;
  university?: string;
  locations?: string;
  level?: string;
  budget?: string;
  count?: number;
}

type ProgramHit = { title?: string; link?: string; snippet?: string };

function normalizeSearchLevel(raw: string): 'graduate' | 'undergraduate' | '' {
  const sniffed = sniffProgramLevel(raw);
  if (sniffed) return sniffed;
  const t = raw.toLowerCase();
  if (/(postgraduate|post-grad|masters?|mba|msc|m\.sc|phd|doctorate)/.test(t)) return 'graduate';
  if (/(bachelors?|undergraduate|under-grad)/.test(t)) return 'undergraduate';
  return '';
}

function resolveSearchLevel(criteria: SearchCriteria, deps: AgentDeps): 'graduate' | 'undergraduate' | '' {
  const criteriaLevel = normalizeSearchLevel(s(criteria.level, 80));
  const profileLevel = inferProfileSearchLevel(deps.profile);
  if (profileLevel === 'graduate' && criteriaLevel === 'undergraduate') return 'graduate';
  if (criteriaLevel) return criteriaLevel;
  const intakeLevel = normalizeSearchLevel(deps.intake.programLevel || deps.intake.answers?.level || '');
  if (intakeLevel) return intakeLevel;
  return profileLevel;
}

function levelQuery(level: string): string {
  if (level === 'graduate') return 'masters MSc MBA graduate postgraduate';
  if (level === 'undergraduate') return 'bachelor undergraduate';
  return '';
}

function isGraduateText(text: string): boolean {
  return /\b(master|masters|msc|m\.sc|ms\b|m\.s\b|mba|ma\b|m\.a\b|mres|mphil|llm|phd|ph\.d|doctorate|doctoral|graduate|postgraduate|post-grad)\b/i.test(text);
}

function isUndergraduateText(text: string): boolean {
  return /\b(bachelor|bachelors|undergraduate|under-grad|bsc|b\.sc|bs\b|b\.s\b|ba\b|b\.a\b|bba|bcom|b\.com)\b/i.test(text);
}

function hitText(hit: ProgramHit): string {
  return `${hit.title || ''} ${hit.snippet || ''} ${hit.link || ''}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

const TLD_COUNTRY: Record<string, string> = {
  edu: 'united states', ca: 'canada', uk: 'united kingdom', au: 'australia', de: 'germany', fr: 'france',
  nl: 'netherlands', sg: 'singapore', hk: 'hong kong', jp: 'japan', cn: 'china', in: 'india', ie: 'ireland',
  ch: 'switzerland', se: 'sweden', dk: 'denmark', no: 'norway', fi: 'finland', it: 'italy', es: 'spain',
  nz: 'new zealand', ae: 'united arab emirates', kr: 'south korea',
};

function countryFromHost(host: string): string {
  const parts = host.split('.');
  return TLD_COUNTRY[parts[parts.length - 1]] || '';
}

function sameSite(a: string, b: string): boolean {
  const ha = hostOf(a);
  const hb = hostOf(b);
  return !!ha && !!hb && (ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`));
}

function normalizedUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
}

function isAggregatorUrl(url: string): boolean {
  const host = hostOf(url);
  return /(mastersportal|bachelorsportal|studyportals|educations\.com|topuniversities|usnews|niche|collegefactual|petersons|hotcourses|findamasters|masterstudies|bachelorstudies)/i.test(host);
}

function isCatalogUrl(hit: ProgramHit): boolean {
  const text = hitText(hit).toLowerCase();
  return /\b(catalog|catalogue|course catalog|course catalogue|bulletin|module catalogue|academic catalog|courses? list)\b/.test(text);
}

function meaningfulProgramTokens(name: string): string[] {
  const stop = new Set(['and', 'the', 'for', 'with', 'program', 'degree', 'master', 'masters', 'bachelor', 'science', 'arts']);
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((x) => x.length > 2 && !stop.has(x))
    .slice(0, 8);
}

function isLikelyProgramPageHit(hit: ProgramHit, raw: any, level: string): boolean {
  const url = s(hit.link, 300);
  if (!/^https?:\/\//i.test(url) || /\.pdf(?:$|[?#])/i.test(url)) return false;
  if (isBannedHost(url) || isAggregatorUrl(url) || isCatalogUrl(hit)) return false;
  const text = hitText(hit).toLowerCase();
  const tokens = meaningfulProgramTokens(s(raw?.program_name, 180));
  const tokenMatches = tokens.filter((token) => text.includes(token)).length;
  if (tokens.length > 0 && tokenMatches === 0) return false;
  if (level === 'graduate' && !isGraduateText(text)) return false;
  if (level === 'undergraduate' && isGraduateText(text) && !isUndergraduateText(text)) return false;
  return true;
}

function findHitForUrl(url: string, hits: ProgramHit[]): ProgramHit | null {
  const target = normalizedUrl(url);
  if (!target) return null;
  return hits.find((h) => normalizedUrl(s(h.link, 300)) === target) || null;
}

function findProgramPageHit(raw: any, hits: ProgramHit[], level: string): ProgramHit | null {
  const rawWebsite = s(raw?.website, 300);
  const exact = findHitForUrl(rawWebsite, hits);
  if (exact && isLikelyProgramPageHit(exact, raw, level)) return exact;
  const uni = s(raw?.university, 140);
  return (
    hits.find((h) => isLikelyProgramPageHit(h, raw, level) && isAcademicHost(hostOf(s(h.link, 300)), uni)) || null
  );
}

function hasNumberSupport(value: string, evidence: string): boolean {
  const numbers = value.match(/\d+(?:[.,]\d+)?/g) || [];
  if (!numbers.length) return false;
  return numbers.some((n) => evidence.includes(n.replace(',', '')) || evidence.includes(n));
}

function hasFactCue(evidence: string, kind: 'tuition' | 'deadline' | 'tests' | 'gpa' | 'duration'): boolean {
  if (kind === 'tuition') return /\b(tuition|fee|fees|cost|costs|funding|scholarship|financial aid|per year|annual)\b/i.test(evidence);
  if (kind === 'gpa') return /\b(gpa|grade point|minimum grade|minimum requirement|academic requirement)\b/i.test(evidence);
  if (kind === 'duration') return /\b(duration|full-time|part-time|year|years|month|months|semester|semesters|credits)\b/i.test(evidence);
  if (kind === 'deadline') return /\b(deadline|apply by|application|applications|admission|admissions)\b/i.test(evidence);
  return true;
}

function cleanSourcedFact(value: unknown, evidence: string, kind: 'tuition' | 'deadline' | 'tests' | 'gpa' | 'duration'): string {
  const text = s(value, kind === 'tests' ? 160 : 120);
  if (!text) return '';
  if (/\b(est|estimate|estimated|approx|approximately|around|check website|see website|visit website|varies|not specified|unknown|n\/a|tbd)\b/i.test(text)) return '';
  if (kind === 'tuition' || kind === 'gpa' || kind === 'duration') {
    return hasNumberSupport(text, evidence) && hasFactCue(evidence, kind) ? text : '';
  }
  if (kind === 'tests') {
    const tests = text.match(/\b(GRE|GMAT|TOEFL|IELTS|SAT|ACT|Duolingo)\b/gi) || [];
    return tests.length && tests.some((test) => evidence.includes(test.toLowerCase())) ? text : '';
  }
  const hasDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|fall|spring|summer|winter|\d{1,2}\/\d{1,2}|\d{4})\b/i.test(text);
  return hasDate && hasFactCue(evidence, kind) && text.toLowerCase().split(/\s+/).some((token) => token.length > 3 && evidence.includes(token))
    ? text
    : '';
}

interface PendingProgram {
  university: string;
  program_name: string;
  degree_type: string;
  city: string;
  country: string;
  location: string;
  website: string;
  summaryFallback: string;
  fit_reasons: FitReason[];
  hit: ProgramHit;
  extra: ProgramHit[];
}

function ownSiteHits(p: PendingProgram, pool: ProgramHit[]): ProgramHit[] {
  const all = [p.hit, ...pool.filter((h) => h.link && sameSite(p.website, h.link)), ...p.extra];
  const seen = new Set<string>();
  const out: ProgramHit[] = [];
  for (const h of all) {
    if (!h) continue;
    const key = normalizedUrl(s(h.link, 300)) || s(h.title, 140);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(h);
  }
  return out;
}

function ownSiteEvidence(p: PendingProgram, pool: ProgramHit[]): string {
  return ownSiteHits(p, pool).map(hitText).join(' ').toLowerCase();
}

// Targeted site-scoped searches so tuition/deadline/duration facts have real
// evidence to be verified against (snippets from generic queries rarely do).
async function expandProgramEvidence(pending: PendingProgram[]): Promise<void> {
  const year = new Date().getFullYear();
  await Promise.all(
    pending.slice(0, 6).map(async (p) => {
      const host = hostOf(p.website);
      if (!host) return;
      const tokens = meaningfulProgramTokens(p.program_name).slice(0, 4).join(' ');
      try {
        const [fees, deadlines] = await Promise.all([
          webSearch(`site:${host} ${tokens} tuition fees cost`, 5),
          webSearch(`site:${host} ${tokens} application deadline admissions ${year}`, 5),
        ]);
        p.extra = [...fees, ...deadlines].filter((h) => h.link && sameSite(p.website, h.link));
      } catch {
        p.extra = [];
      }
    })
  );
}

async function extractProgramFacts(
  pending: PendingProgram[],
  pool: ProgramHit[]
): Promise<Record<number, { tuition: string; deadline: string; tests: string; gpa: string; duration: string; summary: string }>> {
  const blocks = pending
    .map((p, i) => {
      const lines = ownSiteHits(p, pool)
        .slice(0, 10)
        .map((h, j) => `${j + 1}. ${s(h.title, 140)} — ${s(h.snippet, 260)}`)
        .join('\n');
      return `PROGRAM ${i} — ${p.university} | ${p.program_name}\nEvidence from the university's own pages:\n${lines || '(no additional evidence)'}`;
    })
    .join('\n\n');

  const res = await llmChat(
    [
      {
        role: 'system',
        content:
          "You extract university program facts STRICTLY from each program's own evidence snippets. Never guess, estimate, or carry facts across programs. Return ONLY valid JSON.",
      },
      {
        role: 'user',
        content: `Today's date: ${new Date().toDateString()}.\n\n${blocks}\n\nReturn ONLY JSON:\n{"programs":[{"index":0,"tuition":"","deadline":"","tests":"","gpa":"","duration":"","summary":""}]}\n\nRules per program: fill a field ONLY when the exact value appears in THAT program's evidence, else leave it "". tuition/gpa/duration must quote the exact figures. deadline: only an application deadline for an UPCOMING intake (in the future relative to today) — if the only deadlines visible are already past, leave "". tests: only test names explicitly mentioned (GRE, GMAT, TOEFL, IELTS, Duolingo, SAT, ACT), including waiver notes. summary: 3-4 informative sentences about the program using only sourced facts (what it covers, format, department, outcomes) — no placeholders like "check website".`,
      },
    ],
    { temperature: 0.1, maxTokens: 2400 }
  );
  const parsed = extractJson(res.content);
  const out: Record<number, { tuition: string; deadline: string; tests: string; gpa: string; duration: string; summary: string }> = {};
  for (const item of asArr<any>(parsed?.programs)) {
    const idx = Number(item?.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= pending.length) continue;
    out[idx] = {
      tuition: s(item?.tuition, 120),
      deadline: s(item?.deadline, 120),
      tests: s(item?.tests, 160),
      gpa: s(item?.gpa, 120),
      duration: s(item?.duration, 120),
      summary: s(item?.summary, 620),
    };
  }
  return out;
}

export async function discoverPrograms(criteria: SearchCriteria, deps: AgentDeps): Promise<{ added: number; reason?: string }> {
  const answers = deps.intake.answers || {};
  const majors = s(criteria.focus, 160) || knownMajors(deps);
  const level = resolveSearchLevel(criteria, deps);
  const locations = s(criteria.locations, 160) || knownLocations(deps);
  const budgetPref = s(criteria.budget, 80) || knownBudget(deps);
  const university = s(criteria.university, 120);
  const count = Math.min(Math.max(Number(criteria.count) || 5, 1), 8);

  if (!majors && !university) {
    return { added: 0, reason: 'I need at least a field of study or a university to search for' };
  }
  if (!university && !locations) {
    return { added: 0, reason: 'I need your preferred locations first' };
  }

  const today = new Date();
  const year = today.getFullYear();
  const targetCountries = prefCountries(locations);
  const targetCities = prefCities(locations);
  const budgetMax = parseBudgetMaxUsd(budgetPref);
  const levelTerms = levelQuery(level);
  const cityText = targetCities.length ? targetCities.slice(0, 4).join(' OR ') : locations;

  const queries = university
    ? [
        `${university} ${majors} ${levelTerms} official program page admission requirements`,
        `${university} ${majors} ${levelTerms} degree tuition deadline ${year}`,
      ]
    : [
        `${majors} ${levelTerms} official university program page ${cityText} admission requirements`,
        `${majors} ${levelTerms} university program ${locations} tuition application deadline ${year}`,
        ...(targetCountries.includes('united states') ? [`${majors} ${levelTerms} program site:.edu ${cityText}`] : []),
      ];

  const hits: ProgramHit[] = [];
  for (const q of queries) {
    const results = await webSearch(q, 8);
    for (const r of results) {
      if (r.link && !hits.some((h) => h.link === r.link)) hits.push(r);
    }
  }
  if (!hits.length) {
    return { added: 0, reason: 'I could not find reliable web results for that search' };
  }

  const evidence = hits
    .slice(0, 20)
    .map((h, i) => `${i + 1}. ${s(h.title, 140)} — ${s(h.snippet, 240)} [${s(h.link, 200)}]`)
    .join('\n');

  const existing = deps.programs.map((p) => `${p.university} — ${p.program_name}`).join('; ');
  const prefs = [
    `Majors/focus: ${majors || '—'}`,
    `Level: ${level || '—'}`,
    `Locations (stated): ${locations || '—'}`,
    targetCountries.length ? `Allowed countries (STRICT): ${targetCountries.map(displayCountry).join(', ')}` : '',
    targetCities.length ? `Preferred cities/metros (STRICT): ${targetCities.map(titleCase).join(', ')}` : '',
    budgetMax ? `Max tuition budget (STRICT): $${budgetMax.toLocaleString()} USD per year` : `Budget: ${budgetPref || '—'}`,
    university ? `Restrict to university: ${university}` : '',
    `Other priorities: ${answers.priorities || '—'}`,
    `Post-study goals: ${answers.outcomes || '—'}`,
    `Student profile highlights: ${s(deps.profile.bio, 300) || s(deps.profile.headline, 150) || '—'}`,
    `Education from profile: ${educationText(deps.profile) || '—'}`,
  ]
    .filter(Boolean)
    .join('\n');

  let parsed: any = null;
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content:
            'You turn live web search results into structured university program candidates for a specific student. Only include programs directly supported by the provided search results. Never invent programs or facts. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Today's date: ${today.toDateString()}.\n\nStudent preferences:\n${prefs}\n\nLive web search results:\n${evidence}\n\nAlready recommended to this student (do NOT repeat any of these):\n${existing || '(none)'}\n\nReturn ONLY JSON:\n{"programs":[{"university":"","program_name":"","degree_type":"","city":"","country":"","metro_area":"","website":"https://official-university-program-page","summary":"1-2 sentence description from the search results","fit_reasons":[{"title":"","detail":""},{"title":"","detail":""}]}],"reason":"fill ONLY if programs is empty — a short plain-language reason why nothing matched"}\n\nRules: up to ${count + 3} candidates, best fit first. The website field MUST be an official university program page URL copied exactly from the search results — never a course catalogue, aggregator, PDF, social media page, forum, or news article. "country" is the campus country. If allowed countries are listed, EVERY candidate must be in one of them — no exceptions. If preferred cities are listed, only include programs whose campus is in or immediately around one of those cities, and set "metro_area" to that city (e.g. Cambridge → metro_area "Boston"; Stanford → metro_area "San Francisco"); otherwise leave metro_area "". If the requested level is graduate/postgraduate, omit bachelor/undergraduate programs (and vice versa). If a max budget is listed, omit programs whose tuition is known to exceed it. Omit programs whose application deadlines for the upcoming intake have already passed. fit_reasons must reference THIS student's stated goals, preferences, or profile, and must not mention affordability, GPA, tests, or deadlines.`,
        },
      ],
      { temperature: 0.2, maxTokens: 2400 }
    );
    parsed = extractJson(res.content);
  } catch {
    return { added: 0, reason: 'the search service was unreachable' };
  }

  const rawPrograms = asArr<any>(parsed?.programs);
  const existingKeys = new Set(deps.programs.map((p) => `${p.university}|${p.program_name}`.toLowerCase()));
  const pending: PendingProgram[] = [];

  for (const raw of rawPrograms) {
    const uni = s(raw?.university, 140);
    const name = s(raw?.program_name, 180);
    if (!uni || !name) continue;

    // Link policy: must be a real hit, on the university's own academic host.
    const programHit = findProgramPageHit(raw, hits, level);
    if (!programHit?.link) continue;
    const website = s(programHit.link, 300);
    const host = hostOf(website);
    if (isBannedHost(website) || !isAcademicHost(host, uni)) continue;

    // Level policy.
    const levelEvidence = `${name} ${s(raw?.degree_type, 80)} ${hitText(programHit)}`;
    if (level === 'graduate' && (!isGraduateText(levelEvidence) || (isUndergraduateText(levelEvidence) && !isGraduateText(`${name} ${s(raw?.degree_type, 80)}`)))) continue;
    if (level === 'undergraduate' && isGraduateText(levelEvidence) && !isUndergraduateText(levelEvidence)) continue;

    // Country policy (deterministic): candidate country → location text → host TLD.
    const candCountry = canonicalCountry(s(raw?.country, 60)) || canonicalCountry(`${s(raw?.city, 80)} ${s(raw?.country, 60)}`) || countryFromHost(host);
    if (targetCountries.length && (!candCountry || !targetCountries.includes(candCountry))) continue;

    // City policy: when the student named cities, the campus must be in/around one.
    if (targetCities.length) {
      const cityBlob = normText(`${s(raw?.city, 80)} ${s(raw?.metro_area, 80)}`);
      if (!cityMatches(cityBlob, targetCities)) continue;
    }

    const key = `${uni}|${name}`.toLowerCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    const city = titleCase(s(raw?.city, 80));
    const country = candCountry ? displayCountry(candCountry) : s(raw?.country, 60);
    pending.push({
      university: uni,
      program_name: name,
      degree_type: s(raw?.degree_type, 60),
      city,
      country,
      location: [city, country].filter(Boolean).join(', '),
      website,
      summaryFallback: s(raw?.summary, 400),
      fit_reasons: normalizeFitReasons(raw?.fit_reasons),
      hit: programHit,
      extra: [],
    });
    if (pending.length >= count + 2) break;
  }

  if (!pending.length) {
    return { added: 0, reason: s(parsed?.reason, 240) || 'no real programs matched those criteria' };
  }

  // Enrich: site-scoped evidence → verified facts (richer cards, no guesses).
  deps.setWorking('Checking fees, deadlines, and details…');
  await expandProgramEvidence(pending);
  let facts: Awaited<ReturnType<typeof extractProgramFacts>> = {};
  try {
    facts = await extractProgramFacts(pending, hits);
  } catch {
    facts = {};
  }

  const items: NewProgram[] = [];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const f = facts[i];
    const ev = ownSiteEvidence(p, hits);
    const tuition = cleanSourcedFact(f?.tuition, ev, 'tuition');
    const gpa = cleanSourcedFact(f?.gpa, ev, 'gpa');
    const tests = cleanSourcedFact(f?.tests, ev, 'tests');
    let deadline = cleanSourcedFact(f?.deadline, ev, 'deadline');
    const duration = cleanSourcedFact(f?.duration, ev, 'duration');

    // Fresh-programs policy: a verified deadline that has already passed
    // disqualifies the program; an unknown deadline is allowed.
    const status = deadlineStatus(deadline, today);
    if (status === 'past') continue;
    if (status === 'unknown' && deadline && !/\d/.test(deadline)) deadline = '';

    // Budget policy: verified tuition above the stated budget disqualifies.
    if (budgetMax) {
      const amounts = parseTuitionUsd(tuition);
      if (amounts.length && Math.min(...amounts) > budgetMax * 1.05) continue;
    }

    const fitReasons = p.fit_reasons.filter((reason) => {
      const detail = `${reason.title} ${reason.detail}`.toLowerCase();
      if (!tuition && /\b(tuition|budget|afford|cost|fee|scholarship)\b/.test(detail)) return false;
      if (!gpa && /\b(gpa|grade)\b/.test(detail)) return false;
      if (!tests && /\b(gre|gmat|toefl|ielts|sat|act|test)\b/.test(detail)) return false;
      return true;
    });

    items.push({
      university: p.university,
      program_name: p.program_name,
      degree_type: p.degree_type,
      location: p.location,
      tuition,
      deadline,
      tests,
      gpa,
      duration,
      website: p.website,
      summary: s(f?.summary, 620) || p.summaryFallback,
      fit_reasons: fitReasons,
    });
    if (items.length >= count) break;
  }

  if (!items.length) {
    return { added: 0, reason: s(parsed?.reason, 240) || 'no programs passed your location, budget, and deadline requirements' };
  }

  const added = await deps.addPrograms(items);
  return { added };
}

// ---------------------------------------------------------------------------
// Verified program deep-dive (the "review program" details view)
//
// Facts come ONLY from live search snippets of the university's own web
// estate. The extractor organizes them into bullet sections, and every bullet
// then has to survive a deterministic evidence check — numbers, dates, and
// test names must literally appear in the snippets — so the view is rich
// without a single invented claim (the failure mode of the first version).

// Numbers, currency figures, and test names in a bullet must literally appear
// in the evidence; prose bullets need meaningful word overlap with it.
function bulletSupported(text: string, evidenceBlob: string): boolean {
  const t = text.toLowerCase();
  const numbers = t.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || [];
  for (const n of numbers) {
    if (!evidenceBlob.includes(n)) return false;
  }
  const tests = t.match(/\b(gre|gmat|toefl|ielts|duolingo|sat|act)\b/g) || [];
  for (const test of tests) {
    if (!evidenceBlob.includes(test)) return false;
  }
  const words = t
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  if (!words.length) return false;
  const matched = words.filter((w) => evidenceBlob.includes(w)).length;
  return matched >= Math.max(2, Math.ceil(words.length * 0.35));
}

export async function researchProgramDetails(program: ProgramRow): Promise<ProgramDetails | null> {
  const uni = s(program.university, 140);
  const host = hostOf(program.website || '');
  const tokens = meaningfulProgramTokens(s(program.program_name, 180)).slice(0, 5).join(' ');
  const year = new Date().getFullYear();
  const scope = host ? `site:${host}` : `"${uni}"`;
  const queries = [
    `${scope} ${tokens} program overview curriculum courses structure`,
    `${scope} ${tokens} admission entry requirements`,
    `${scope} ${tokens} tuition fees funding scholarships`,
    `${scope} ${tokens} application deadline intake ${year}`,
    `${scope} ${tokens} graduate careers outcomes employment`,
  ];

  const hits: ProgramHit[] = [];
  const seenHits = new Set<string>();
  const keepHit = (h: ProgramHit) => {
    const url = s(h.link, 300);
    if (!url || isBannedHost(url)) return;
    const key = normalizedUrl(url) || url;
    if (seenHits.has(key)) return;
    // Official-estate policy: the program page's own site, or an academic host
    // carrying the university's name. Nothing third-party feeds this view.
    const onOwnSite = program.website ? sameSite(program.website, url) : false;
    if (!onOwnSite && !isAcademicHost(hostOf(url), uni)) return;
    seenHits.add(key);
    hits.push(h);
  };
  // The program page itself is always evidence.
  if (program.website) {
    keepHit({ title: `${uni} — ${s(program.program_name, 180)}`, link: program.website, snippet: s(program.summary, 300) });
  }
  for (const q of queries) {
    const results = await webSearch(q, 6);
    for (const r of results) keepHit(r);
  }
  if (hits.length < 2) return null;

  const pool = hits.slice(0, 24);
  const evidence = pool
    .map((h, i) => `[${i + 1}] ${s(h.title, 140)} — ${s(h.snippet, 280)} (${s(h.link, 200)})`)
    .join('\n');

  let parsed: any = null;
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content:
            'You organize verified facts about ONE university program into clean bullet-point sections. Use ONLY the numbered evidence snippets provided — never outside knowledge, never estimates. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Program: ${uni} — ${s(program.program_name, 180)}${program.degree_type ? ` (${s(program.degree_type, 60)})` : ''}${
            program.location ? `, ${s(program.location, 100)}` : ''
          }
Today's date: ${new Date().toDateString()}.

Evidence snippets from the university's own web pages:
${evidence}

Return ONLY JSON:
{"sections":[{"title":"<one of: About the program | Curriculum & structure | Admission requirements | Tuition & funding | Dates & deadlines | Careers & outcomes>","bullets":[{"text":"<one clear, specific sentence>","ref":<number of the snippet that states it>}]}],
 "missing":"<one short sentence naming important things these pages do NOT state (e.g. exact tuition), or \\"\\" >"}

Rules:
- 2-5 bullets per section. Include a section ONLY if the evidence genuinely covers it; skip sections with nothing real to say.
- Every bullet must restate information from ONE snippet, with "ref" set to that snippet's number. Copy figures, dates, GPA/test values, and durations EXACTLY as written — never round, convert, or estimate.
- No filler ("check the website", "information available online"), no advice, no repeating the same fact in two sections.
- Write bullets that are useful on their own: "Tuition is $32,400 per year for the 2026 intake", not "Tuition information is provided".`,
        },
      ],
      { temperature: 0.1, maxTokens: 2000 }
    );
    parsed = extractJson(res.content);
  } catch {
    return null;
  }

  const blob = pool.map(hitText).join(' ').toLowerCase().replace(/,/g, '');
  const allowedTitles = new Set([
    'about the program',
    'curriculum & structure',
    'admission requirements',
    'tuition & funding',
    'dates & deadlines',
    'careers & outcomes',
  ]);
  const sections: DetailSection[] = [];
  for (const rawSection of asArr<any>(parsed?.sections)) {
    const title = s(rawSection?.title, 60);
    if (!title || !allowedTitles.has(title.toLowerCase())) continue;
    if (sections.some((sec) => sec.title.toLowerCase() === title.toLowerCase())) continue;
    const bullets: DetailBullet[] = [];
    for (const rawBullet of asArr<any>(rawSection?.bullets).slice(0, 6)) {
      const text = s(typeof rawBullet === 'string' ? rawBullet : rawBullet?.text, 280);
      if (!text || !bulletSupported(text, blob)) continue;
      const refIndex = Number(typeof rawBullet === 'object' && rawBullet ? rawBullet.ref : NaN);
      const source =
        Number.isInteger(refIndex) && refIndex >= 1 && refIndex <= pool.length ? s(pool[refIndex - 1].link, 300) : '';
      bullets.push(source ? { text, source } : { text });
      if (bullets.length >= 5) break;
    }
    if (bullets.length) sections.push({ title, bullets });
  }
  const totalBullets = sections.reduce((n, sec) => n + sec.bullets.length, 0);
  if (!sections.length || totalBullets < 3) return null;

  const sources: { title: string; url: string }[] = [];
  const seenSources = new Set<string>();
  for (const h of pool) {
    const url = s(h.link, 300);
    const key = normalizedUrl(url) || url;
    if (!url || seenSources.has(key)) continue;
    seenSources.add(key);
    sources.push({ title: s(h.title, 110) || hostOf(url) || 'University page', url });
    if (sources.length >= 5) break;
  }

  return {
    sections,
    sources,
    missing: s(parsed?.missing, 300) || undefined,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Resume parsing → profile pipeline

const RESUME_TEXT_PROMPT =
  'Transcribe the complete text content of this document, preserving section headings and bullet items as plain lines. Output ONLY the transcribed text with no commentary, no analysis, no markdown fences. If the document contains no readable text, output exactly NO_TEXT.';

const RESUME_JSON_SHAPE = `{"is_resume": true|false,
 "name": "candidate full name",
 "location": "city/country where they are based, if stated",
 "headline": "one-line professional headline built from the resume",
 "education": [{"institute":"institution name","degree":"exact degree title, e.g. Master of Science, MSc Management, Bachelor of Commerce","field":"field of study/major/concentration","grade":"GPA/grade/percentage exactly in the scale the institution uses","startYear":"","endYear":"","inProgress":true|false}],
 "work": [{"company":"","title":"","startDate":"","endDate":"leave empty if current","current":true|false,"description":"the FULL description text the candidate wrote for this position"}],
 "research": [{"title":"","venue":"journal/publication location","date":"","url":""}],
 "skills": ["core and technical skills"],
 "extracurriculars": [{"title":"","description":""}],
 "misc": [{"title":"","detail":"any professional details that do not fit the categories above"}]}`;

const RESUME_PROMPT = `You are parsing a document that may be a resume/CV. Return ONLY valid JSON, no other text:
${RESUME_JSON_SHAPE}
If the document is NOT a resume/CV, return {"is_resume": false}. Extract EVERY section present — education, work experience, skills, research/publications, extracurriculars/volunteering/leadership, certifications (use misc). Mark degrees still being earned with inProgress=true and endYear as the expected year. Do not invent missing grades, test scores, dates, employers, or fields.`;

async function structuredResumeExtract(resumeText: string): Promise<any | null> {
  const ask = async (extra: string) => {
    const res = await llmChat(
      [
        { role: 'system', content: 'You parse resume text into structured JSON. Return ONLY valid JSON, nothing else.' },
        {
          role: 'user',
          content: `Resume text:\n"""${resumeText.slice(0, 12000)}"""\n\n${RESUME_PROMPT}${extra}`,
        },
      ],
      { temperature: 0, maxTokens: 2600 }
    );
    return extractJson(res.content);
  };
  let parsed = await ask('');
  if (!parsed) parsed = await ask('\n\nIMPORTANT: your previous output was not valid JSON. Return ONLY the JSON object.');
  return parsed;
}

export async function parseResumePdf(url: string, fileName: string, deps: AgentDeps, sourceFile?: File): Promise<string | null> {
  // Step 1 — get the document's full text (kept so Scout can always use it).
  let text = '';
  try {
    text = s(await analyzeDocument(url, RESUME_TEXT_PROMPT, sourceFile), 15000);
  } catch {
    text = '';
  }
  if (/^NO_TEXT/i.test(text)) text = '';

  // Step 2 — structured extraction (from the text when available; otherwise
  // fall back to one-shot document analysis like before).
  let parsed: any = null;
  if (text) {
    parsed = await structuredResumeExtract(text).catch(() => null);
  }
  if (!parsed) {
    try {
      parsed = extractJson(await analyzeDocument(url, RESUME_PROMPT, sourceFile));
    } catch {
      return null;
    }
  }
  if (!parsed || parsed.is_resume === false) return null;

  const incoming = normalizeProfilePatch(parsed, emptyProfile());
  const merged = mergeResumeIntoProfile(deps.profile, incoming);
  if (text) {
    merged.resumeText = text;
    merged.resumeSourceUrl = url;
    merged.resumeParsedAt = new Date().toISOString();
  }

  deps.setWorking('Building your profile…');
  const withSummaries = await generateProfileSummaries(merged, deps.intake);
  await deps.saveProfile(withSummaries);
  deps.profile = withSummaries;
  const lines = await applyResumeSearchSignals(withSummaries, deps);
  return lines.length
    ? `Parsed ${fileName}, updated your Profile, and refreshed your search setup`
    : `Parsed ${fileName} and updated your Profile`;
}

// Resume data augments the profile; manual/chat edits already present are
// kept. Re-parsing the same resume is idempotent: items that match an existing
// entry replace it (fuller data wins) instead of duplicating it.
function mergeResumeIntoProfile(current: ProfileData, incoming: ProfileData): ProfileData {
  const next: ProfileData = { ...current };
  if (!next.name && incoming.name) next.name = incoming.name;
  if (!next.headline && incoming.headline) next.headline = incoming.headline;
  if (!next.location && incoming.location) next.location = incoming.location;

  const norm = (x: string) => normText(x);
  function upsert<T extends { aiSummary?: string }>(mine: T[], theirs: T[], keyOf: (item: T) => string): T[] {
    const out = [...mine];
    for (const item of theirs) {
      const key = norm(keyOf(item));
      if (!key) continue;
      const idx = out.findIndex((m) => {
        const k = norm(keyOf(m));
        return !!k && (k === key || k.includes(key) || key.includes(k));
      });
      if (idx >= 0) out[idx] = { ...item, aiSummary: (item.aiSummary || (out[idx] as any).aiSummary || '') as string } as T;
      else out.push(item);
    }
    return out;
  }

  const degLevel = (d: string) => (isGraduateText(d) ? 'g' : isUndergraduateText(d) ? 'u' : '');
  next.education = upsert(current.education, incoming.education, (e) => `${e.institute} ${degLevel(e.degree)}`).slice(0, 12);
  next.work = upsert(current.work, incoming.work, (w) => `${w.company} ${w.title}`).slice(0, 15);
  next.research = upsert(current.research, incoming.research, (r) => r.title).slice(0, 12);
  next.extracurriculars = upsert(current.extracurriculars, incoming.extracurriculars, (e) => e.title).slice(0, 12);
  next.misc = upsert(current.misc as any, incoming.misc as any, (m: any) => m.title).slice(0, 12) as MiscItem[];
  const skillSet = new Set(current.skills.map((x) => x.toLowerCase()));
  next.skills = [...current.skills, ...incoming.skills.filter((x) => !skillSet.has(x.toLowerCase()))].slice(0, 40);
  return next;
}

// Generate the bio, "what you're looking for", and per-item Scout summaries.
export async function generateProfileSummaries(profile: ProfileData, intake: IntakeData): Promise<ProfileData> {
  const answered = Object.entries(intake.answers || {})
    .map(([k, v]) => `${k}: ${s(v, 200)}`)
    .join('\n');
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content:
            'You are Scout, a university-application advisor. Write crisp, specific, third-person-free summaries grounded ONLY in the provided data. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Profile data:\n${JSON.stringify({ ...profile, bio: undefined, lookingFor: undefined, resumeText: undefined, resumeSourceUrl: undefined, resumeParsedAt: undefined })}\n\nWhat the student has shared in chat so far:\n${answered || '(nothing yet)'}\n\nReturn ONLY JSON:\n{"bio":"4-6 sentence bio built from their work experience, academics, skills, research and extracurriculars",\n "lookingFor":"2-4 sentences on what they seem to be looking for from higher education, based on what they've shared in chat (if they've shared nothing, infer cautiously from the resume trajectory)",\n "educationSummaries":["one 1-2 sentence highlight per education item, same order"],\n "workSummaries":["one per work item, same order"],\n "researchSummaries":["one per research item, same order"],\n "skillsSummary":"1-2 sentences on their most valuable skills",\n "extracurricularSummaries":["one per extracurricular item, same order"]}`,
        },
      ],
      { temperature: 0.4, maxTokens: 1800 }
    );
    const parsed = extractJson(res.content);
    if (!parsed) return profile;
    const next: ProfileData = { ...profile };
    if (typeof parsed.bio === 'string' && parsed.bio.trim()) next.bio = s(parsed.bio, 1200);
    if (typeof parsed.lookingFor === 'string' && parsed.lookingFor.trim()) next.lookingFor = s(parsed.lookingFor, 1200);
    if (typeof parsed.skillsSummary === 'string') next.skillsSummary = s(parsed.skillsSummary, 400);
    function apply<T extends { aiSummary: string }>(items: T[], summaries: any): T[] {
      return items.map((item, i) => ({
        ...item,
        aiSummary: typeof summaries?.[i] === 'string' && summaries[i].trim() ? s(summaries[i], 400) : item.aiSummary,
      }));
    }
    next.education = apply(next.education, parsed.educationSummaries);
    next.work = apply(next.work, parsed.workSummaries);
    next.research = apply(next.research, parsed.researchSummaries);
    next.extracurriculars = apply(next.extracurriculars, parsed.extracurricularSummaries);
    return next;
  } catch {
    return profile;
  }
}

// Rebuild the "What you're looking for" summary from the chat-stated answers.
async function regenerateLookingFor(intake: IntakeData, profile: ProfileData): Promise<string> {
  const answered = Object.entries(intake.answers || {})
    .map(([k, v]) => `${k}: ${s(v, 220)}`)
    .join('\n');
  if (!answered) return '';
  try {
    const res = await llmChat(
      [
        { role: 'system', content: 'You are Scout, a university-application advisor. Return ONLY valid JSON like {"lookingFor":"..."}.' },
        {
          role: 'user',
          content: `Based on what this student has shared in our chat:\n${answered}\n\nProfile headline: ${s(profile.headline, 150) || '—'}\n\nWrite 2-4 sentences describing what they are looking for from higher education — level, fields, locations, budget posture, and what matters most to them. Return ONLY {"lookingFor":"..."}.`,
        },
      ],
      { temperature: 0.4, maxTokens: 320 }
    );
    const parsed = extractJson(res.content);
    return typeof parsed?.lookingFor === 'string' ? s(parsed.lookingFor, 1200) : '';
  } catch {
    return '';
  }
}

// Refresh one item's Scout summary after a manual edit (PRD: edits must update the AI summary).
export async function regenerateItemSummary(
  section: 'education' | 'work' | 'research' | 'extracurriculars' | 'skills',
  item: unknown,
  profile: ProfileData
): Promise<string> {
  try {
    const res = await llmChat(
      [
        {
          role: 'system',
          content: 'You are Scout, a university-application advisor. Return ONLY valid JSON like {"summary":"..."}.',
        },
        {
          role: 'user',
          content:
            section === 'skills'
              ? `The student's skills are now: ${JSON.stringify(profile.skills)}. Write a 1-2 sentence Scout summary of their most valuable skills. Return ONLY {"summary":"..."}.`
              : `This ${section} item on the student's profile was just edited:\n${JSON.stringify(item)}\n\nWrite a fresh 1-2 sentence Scout summary highlighting what matters most about it for university applications. Return ONLY {"summary":"..."}.`,
        },
      ],
      { temperature: 0.4, maxTokens: 220 }
    );
    const parsed = extractJson(res.content);
    return typeof parsed?.summary === 'string' ? s(parsed.summary, 400) : '';
  } catch {
    return '';
  }
}

// Exposed for tests/diagnostics: the pure parsing helpers that gate search
// results (no side effects, safe to import anywhere).
export const __scoutParsers = {
  prefCountries,
  prefCities,
  parseBudgetMaxUsd,
  parseTuitionUsd,
  canonicalCountry,
  countryFromHost,
  isBannedHost,
  isAcademicHost,
  cityMatches,
  locationChips,
  displayCountry,
  titleCase,
};

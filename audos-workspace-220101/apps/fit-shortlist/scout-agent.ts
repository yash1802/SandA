// Scout — agentic engine. One LLM turn returns {reply, actions[]}; this module
// validates and executes those actions (profile/preferences, shortlist,
// web-sourced program discovery) and reports human-readable action lines.

import {
  BriefData,
  DocumentRow,
  EducationItem,
  ExtraItem,
  FitReason,
  INTAKE_QUESTIONS,
  IntakeData,
  MessageRow,
  MiscItem,
  ProfileData,
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
  addPrograms: (items: NewProgram[]) => Promise<number>;
  setWorking: (label: string | null) => void;
  onProgramsDiscovered?: () => void;
}

const s = (v: unknown, max = 400): string => (v == null ? '' : String(v)).trim().slice(0, max);

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

function buildSystemPrompt(deps: AgentDeps): string {
  const { intake, brief, profile, programs, documents, displayName } = deps;
  return `You are Scout, an agentic AI advisor who helps students discover and shortlist university programs. You are talking to ${displayName || 'a student'}. Today's date: ${new Date().toDateString()}.

You can EXECUTE ACTIONS, not just chat. Respond with ONLY a valid JSON object (no markdown fences, no text outside the JSON):
{"reply": "<your markdown message to the student>", "actions": [ ...zero or more of the actions below... ]}

AVAILABLE ACTIONS:
1. {"type":"save_intake_answers","answers":{"<questionId>":"<answer in the student's words>"},"programLevel":"undergraduate"|"graduate","profileVisible":true|false}
   Record answers to intake checklist questions whenever the student answers one OR volunteers the information unprompted. "programLevel" whenever it becomes known; "profileVisible" when they answer the visibility question. Include only the keys that apply.
2. {"type":"update_profile","profile":{...}}
   Use when the student asks to change their profile or shares new profile-relevant facts (work, research, academics, skills, extracurriculars, location). Start from CURRENT PROFILE below and return the COMPLETE updated object (all sections you change must be complete; sections you omit stay untouched). Preserve items you are not changing exactly as they are, including their "aiSummary". For items you add or change, write/refresh a 1–2 sentence "aiSummary" highlighting what matters most. Never invent facts.
3. {"type":"update_brief","factors":{"majors":{"excellent":[],"good":[],"borderline":[],"notAFit":[]},"ranking":{...},"location":{...},"budget":{...},"postStudyRole":{...}}}
   The Search Brief is your internal document of the student's search preferences, bucketed by fit. Return the complete factors object. Use it when the student's PREFERENCES genuinely change or they explicitly confirm a preference update.
4. {"type":"search_programs","criteria":{"focus":"<what to look for>","university":"<limit to one university>","locations":"<where>","level":"<undergraduate/graduate/degree type>","budget":"<constraint>","count":5}}
   Trigger a live web search for real university programs. Found programs are added to the student's Recommendations automatically. Include only relevant criteria keys; omit "criteria" entirely to search from the student's saved preferences.
5. {"type":"set_program_status","programId":<id>,"status":"saved"|"safe"|"target"|"dream"|"skipped"}
   Manage the shortlist: move a program between shortlist columns (saved/safe/target/dream), skip one the student no longer wants, or bring a skipped program back (use "saved").

CRITICAL RULES:
- ONE QUESTION AT A TIME. Work through the intake checklist below in order, weaving exactly one unanswered question naturally into each reply (after addressing whatever the student said). NEVER re-ask an answered question. If the student's message answers any pending questions (even out of order), record them ALL via save_intake_answers and move to the next unanswered one.
- The "motivations" question is ONLY for students interested in graduate programs. Skip it for undergraduates.
- CLARIFY BEFORE ACTING. If a requested action is ambiguous (e.g. "remove a skill" without naming it, or a program reference that matches nothing in PROGRAMS), ask a clarifying question and emit NO action for it.
- SEARCH ≠ PREFERENCE CHANGE. When the student asks to search with specific criteria, emit search_programs with those criteria but DO NOT emit update_brief — they may just be exploring. If the criteria differ from their Search Brief, ask afterwards in your reply whether they'd like their preferences updated too; only emit update_brief after they explicitly say yes.
- Genuine preference statements ("I'm also interested in fintech now", "actually my budget is $30k") SHOULD be recorded: use save_intake_answers (merge with prior answers) and update_brief.
- When using search_programs, phrase your reply as *starting* the search (results appear in Recommendations momentarily) — never claim specific results or counts; the app reports them.
- If the student asks you to find/recommend programs, emit search_programs. Do not say you are gathering information unless you also trigger the action.
- If an uploaded resume has been parsed in the system note or CURRENT PROFILE contains resume-derived details, treat that information as available. Do not apologize that you cannot access the resume.
- If CURRENT PROFILE shows a completed or in-progress master's, MBA, MPhil, doctorate, or other postgraduate education, treat the student as looking for graduate/postgraduate opportunities unless they explicitly ask for a bachelor's/undergraduate search.
- Once you know at least majors, level, locations, and budget, and the student has no recommendations yet, offer to run a search (or just run it if they ask).
- Answer questions about their current recommendations, shortlist, profile, brief, or documents directly from the state below — no action needed for reading.
- Be warm, personal, and concise. Refer to programs by name. Never fabricate programs, scores, or facts.

INTAKE CHECKLIST STATE:
${describeIntake(intake)}

CURRENT SEARCH BRIEF (factors → fit buckets):
${JSON.stringify(brief.factors)}

CURRENT PROFILE:
${JSON.stringify(profile)}

PROGRAMS (id | university — program | status):
${describePrograms(programs)}

DOCUMENTS: ${documents.length ? documents.map((d) => `${d.name} (${d.kind})`).join(', ') : '(none)'}
`;
}

// ---------------------------------------------------------------------------
// Action validation + execution

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

function addToBucket(brief: BriefData, factor: keyof BriefData['factors'], value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const bucket = brief.factors[factor].excellent;
  const exists = Object.values(brief.factors[factor]).some((list) =>
    list.some((x) => x.toLowerCase() === trimmed.toLowerCase())
  );
  if (!exists) bucket.push(trimmed.slice(0, 80));
}

// Seed the Search Brief from freshly captured intake answers (Scout's own doc —
// this is Scout maintaining its brief from stated preferences, not an ad-hoc search).
function seedBriefFromAnswers(brief: BriefData, answers: Record<string, string>): BriefData {
  const next = normalizeBrief(JSON.parse(JSON.stringify(brief)));
  const split = (v: string) => v.split(/,|;| and /i).map((x) => x.trim()).filter((x) => x.length > 1 && x.length < 80);
  if (answers.majors) split(answers.majors).slice(0, 6).forEach((m) => addToBucket(next, 'majors', m));
  if (answers.locations) split(answers.locations).slice(0, 6).forEach((l) => addToBucket(next, 'location', l));
  if (answers.budget) addToBucket(next, 'budget', answers.budget.slice(0, 80));
  if (answers.outcomes) split(answers.outcomes).slice(0, 4).forEach((o) => addToBucket(next, 'postStudyRole', o));
  if (answers.priorities) split(answers.priorities).slice(0, 5).forEach((p) => addToBucket(next, 'ranking', p));
  return next;
}

function briefChanged(a: BriefData, b: BriefData): boolean {
  return JSON.stringify(a.factors) !== JSON.stringify(b.factors);
}

function educationText(profile: ProfileData): string {
  return profile.education
    .map((e) => `${e.degree} ${e.field} ${e.institute}`.trim())
    .join(' ');
}

function inferProfileSearchLevel(profile: ProfileData): 'graduate' | 'undergraduate' | '' {
  const text = educationText(profile).toLowerCase();
  if (/(phd|ph\.d|doctorate|doctoral|master|msc|m\.sc|ms\b|m\.s\b|ma\b|m\.a\b|mba|mres|mphil|postgraduate|post-graduate)/.test(text)) {
    return 'graduate';
  }
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

function seedBriefFromProfile(brief: BriefData, profile: ProfileData): BriefData {
  const next = normalizeBrief(JSON.parse(JSON.stringify(brief)));
  inferAcademicFocus(profile).slice(0, 5).forEach((focus) => addToBucket(next, 'majors', focus));
  return next;
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

  const seeded = seedBriefFromProfile(deps.brief, profile);
  if (briefChanged(deps.brief, seeded)) {
    await deps.saveBrief(seeded);
    deps.brief = seeded;
    lines.push('Updated your Search Brief from your resume');
  }

  return lines;
}

async function executeAction(action: RawAction, deps: AgentDeps): Promise<string[]> {
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

      const nextIntake: IntakeData = {
        ...deps.intake,
        answers: { ...deps.intake.answers, ...captured },
        programLevel: hasLevel
          ? (action.programLevel as 'undergraduate' | 'graduate')
          : deps.intake.programLevel || sniffProgramLevel(captured.level || ''),
      };
      nextIntake.completed = intakeCompleted(nextIntake);
      await deps.saveIntake(nextIntake);
      deps.intake = nextIntake;

      const lines: string[] = [];
      const count = Object.keys(captured).length;
      if (count) lines.push(`Saved ${count} answer${count === 1 ? '' : 's'} to your intake checklist`);

      if (hasVisibility) {
        const nextProfile = { ...deps.profile, visible: !!action.profileVisible };
        await deps.saveProfile(nextProfile);
        deps.profile = nextProfile;
        lines.push(action.profileVisible ? 'Made your profile visible to universities' : 'Kept your profile hidden from universities');
      }

      // Keep the Search Brief in sync with newly stated preferences.
      if (captured.majors || captured.locations || captured.budget || captured.outcomes || captured.priorities) {
        const seeded = seedBriefFromAnswers(deps.brief, captured);
        await deps.saveBrief(seeded);
        deps.brief = seeded;
        lines.push('Updated your Search Brief');
      }

      // "What you're looking for" is generated from what the student shares in
      // chat — refresh it as the substantive answers accumulate.
      if (captured.majors || captured.outcomes || captured.priorities || captured.motivations || captured.level) {
        const lookingFor = await regenerateLookingFor(nextIntake, deps.profile);
        if (lookingFor) {
          const nextProfile = { ...deps.profile, lookingFor };
          await deps.saveProfile(nextProfile);
          deps.profile = nextProfile;
          lines.push('Refreshed "What you\'re looking for" on your Profile');
        }
      }
      return lines;
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
      const next = normalizeBrief({ factors: action.factors });
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
      deps.setWorking('Searching the web for programs…');
      const result = await discoverPrograms(action.criteria || {}, deps);
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
// The agent turn

export interface AgentTurnResult {
  reply: string;
  actionLines: string[];
}

function wantsProgramSearch(userText: string): boolean {
  const text = userText.toLowerCase();
  return (
    /\b(find|search|recommend|suggest|show|look for|gather)\b/.test(text) &&
    /\b(program|programs|course|courses|degree|degrees|universit|college|school|options|opportunities)\b/.test(text)
  );
}

export async function runAgentTurn(userText: string, attachmentNote: string, deps: AgentDeps): Promise<AgentTurnResult> {
  const history = deps.messages.slice(-16).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: s(m.content, 900),
  }));

  const userContent = attachmentNote ? `${userText}\n\n[System note: ${attachmentNote}]` : userText;

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
    return {
      reply: "I hit a snag reaching my reasoning service just now — please try that again in a moment.",
      actionLines: [],
    };
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
  if (!reply.trim()) reply = 'Got it.';

  if (!actions.some((a) => a?.type === 'search_programs') && wantsProgramSearch(userText)) {
    actions.push({ type: 'search_programs' });
  }

  const actionLines: string[] = [];
  for (const action of actions) {
    if (!action || typeof action.type !== 'string') continue;
    try {
      const lines = await executeAction(action, deps);
      actionLines.push(...lines);
    } catch (err) {
      actionLines.push(`Couldn't complete an action (${action.type.replace(/_/g, ' ')}) — please try again`);
    } finally {
      deps.setWorking('Thinking…');
    }
  }

  return { reply, actionLines };
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
  if (profileLevel) return profileLevel;
  return normalizeSearchLevel(deps.intake.programLevel || deps.intake.answers?.level || '');
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
  if (isAggregatorUrl(url) || isCatalogUrl(hit)) return false;
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
  return hits.find((h) => isLikelyProgramPageHit(h, raw, level)) || null;
}

function relevantEvidenceFor(url: string, hits: ProgramHit[]): string {
  return hits
    .filter((h) => h.link && sameSite(url, h.link))
    .map(hitText)
    .join(' ')
    .toLowerCase();
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
  return hasDate && hasFactCue(evidence, kind) && text.toLowerCase().split(/\s+/).some((token) => token.length > 3 && evidence.includes(token)) ? text : '';
}

function supportingLinks(raw: any, hits: ProgramHit[], mainUrl: string): { label: string; url: string }[] {
  const fromModel = asArr<any>(raw?.supporting_links)
    .map((l) => ({ label: s(l?.label, 60) || 'Supporting link', url: s(l?.url, 300) }))
    .filter((l) => /^https?:\/\//i.test(l.url));
  const rawWebsite = s(raw?.website, 300);
  const rawHit = findHitForUrl(rawWebsite, hits);
  if (rawHit && isCatalogUrl(rawHit)) {
    fromModel.push({ label: 'Course catalogue', url: rawWebsite });
  }
  const seen = new Set([normalizedUrl(mainUrl)]);
  return fromModel
    .filter((l) => {
      const key = normalizedUrl(l.url);
      if (!key || seen.has(key) || !findHitForUrl(l.url, hits)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function appendSupportingLinks(summary: string, links: { label: string; url: string }[]): string {
  if (!links.length) return summary;
  const suffix = `Additional information:\n${links.map((l) => `- ${l.label}: ${l.url}`).join('\n')}`;
  return s(summary ? `${summary}\n\n${suffix}` : suffix, 700);
}

export async function discoverPrograms(criteria: SearchCriteria, deps: AgentDeps): Promise<{ added: number; reason?: string }> {
  const { intake, brief } = deps;
  const answers = intake.answers || {};
  const majors = s(criteria.focus, 160) || answers.majors || brief.factors.majors.excellent.join(', ') || inferAcademicFocus(deps.profile).join(', ');
  const level = resolveSearchLevel(criteria, deps);
  const locations = s(criteria.locations, 120) || answers.locations || brief.factors.location.excellent.join(', ');
  const budget = s(criteria.budget, 80) || answers.budget || '';
  const university = s(criteria.university, 120);
  const count = Math.min(Math.max(Number(criteria.count) || 5, 1), 8);

  if (!majors && !university) {
    return { added: 0, reason: 'I need at least a field of study or a university to search for' };
  }

  const year = new Date().getFullYear();
  const levelTerms = levelQuery(level);
  const queries = university
    ? [
        `${university} ${majors} ${levelTerms} official program page admission requirements`,
        `${university} ${majors} ${levelTerms} degree tuition deadline ${year}`,
      ]
    : [
        `${majors} ${levelTerms} university official program page ${locations} admission requirements`,
        `${majors} ${levelTerms} university programs ${locations} tuition deadline ${year}`,
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
    .slice(0, 18)
    .map((h, i) => `${i + 1}. ${s(h.title, 140)} — ${s(h.snippet, 240)} [${s(h.link, 200)}]`)
    .join('\n');

  const existing = deps.programs.map((p) => `${p.university} — ${p.program_name}`).join('; ');
  const prefs = [
    `Majors/focus: ${majors || '—'}`,
    `Level: ${level || '—'}`,
    `Locations: ${locations || '—'}`,
    `Budget (USD tuition): ${budget || '—'}`,
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
            'You turn live web search results into structured university program recommendations for a specific student. Only include programs directly supported by the provided search results. Never invent programs, facts, fees, GPA thresholds, or admission requirements. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Student preferences:\n${prefs}\n\nLive web search results:\n${evidence}\n\nAlready recommended to this student (do NOT repeat any of these):\n${existing || '(none)'}\n\nReturn ONLY JSON:\n{"programs":[{"university":"","program_name":"","degree_type":"","location":"City, Country","tuition":"","deadline":"","tests":"","gpa":"","duration":"","website":"https://official-university-program-page","supporting_links":[{"label":"Course catalogue","url":"https://..."}],"summary":"2-3 sentence description using only sourced facts","fit_reasons":[{"title":"","detail":""},{"title":"","detail":""},{"title":"","detail":""}]}],"reason":"fill ONLY if programs is empty — a short plain-language reason why nothing matched"}\n\nRules: at most ${count} programs, ranked best fit first. Every program must match the search constraints${university ? ` and belong to ${university}` : ''}. The website field MUST be an official university program page URL copied from the search results. A course catalogue, academic catalogue, third-party listing, PDF, department homepage, or broad admissions page is NOT a program page; put course/catalogue links in supporting_links only. If you cannot identify an official program page in the search results, omit that program. If the requested level is graduate/postgraduate, omit bachelor/undergraduate programs. Leave tuition, GPA, tests, deadline, and duration blank unless the exact value is stated in the provided search result text. Do not estimate, convert currencies, or write placeholders such as "check website". fit_reasons must reference THIS student's stated goals, preferences, or profile, and must not mention affordability, GPA, tests, or deadlines unless those facts are sourced.`,
        },
      ],
      { temperature: 0.2, maxTokens: 2600 }
    );
    parsed = extractJson(res.content);
  } catch {
    return { added: 0, reason: 'the search service was unreachable' };
  }

  const rawPrograms = asArr<any>(parsed?.programs);
  const existingKeys = new Set(deps.programs.map((p) => `${p.university}|${p.program_name}`.toLowerCase()));
  const items: NewProgram[] = [];
  for (const raw of rawPrograms) {
    const uni = s(raw?.university, 140);
    const name = s(raw?.program_name, 180);
    if (!uni || !name) continue;
    const programHit = findProgramPageHit(raw, hits, level);
    if (!programHit?.link) continue;
    const levelEvidence = `${name} ${s(raw?.degree_type, 80)} ${hitText(programHit)}`;
    if (level === 'graduate' && (!isGraduateText(levelEvidence) || (isUndergraduateText(levelEvidence) && !isGraduateText(`${name} ${s(raw?.degree_type, 80)}`)))) continue;
    if (level === 'undergraduate' && isGraduateText(levelEvidence) && !isUndergraduateText(levelEvidence)) continue;

    const key = `${uni}|${name}`.toLowerCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const website = s(programHit.link, 300);
    const evidenceText = relevantEvidenceFor(website, hits);
    const tuition = cleanSourcedFact(raw?.tuition, evidenceText, 'tuition');
    const gpa = cleanSourcedFact(raw?.gpa, evidenceText, 'gpa');
    const tests = cleanSourcedFact(raw?.tests, evidenceText, 'tests');
    const deadline = cleanSourcedFact(raw?.deadline, evidenceText, 'deadline');
    const duration = cleanSourcedFact(raw?.duration, evidenceText, 'duration');
    const links = supportingLinks(raw, hits, website);
    const fitReasons = normalizeFitReasons(raw?.fit_reasons).filter((reason) => {
      const detail = `${reason.title} ${reason.detail}`.toLowerCase();
      if (!tuition && /\b(tuition|budget|afford|cost|fee|scholarship)\b/.test(detail)) return false;
      if (!gpa && /\b(gpa|grade)\b/.test(detail)) return false;
      if (!tests && /\b(gre|gmat|toefl|ielts|sat|act|test)\b/.test(detail)) return false;
      return true;
    });
    items.push({
      university: uni,
      program_name: name,
      degree_type: s(raw?.degree_type, 60),
      location: s(raw?.location, 120),
      tuition,
      deadline,
      tests,
      gpa,
      duration,
      website,
      summary: appendSupportingLinks(s(raw?.summary, 520), links),
      fit_reasons: fitReasons,
    });
    if (items.length >= count) break;
  }

  if (!items.length) {
    return { added: 0, reason: s(parsed?.reason, 240) || 'no real programs matched those criteria' };
  }

  const added = await deps.addPrograms(items);
  return { added };
}

// ---------------------------------------------------------------------------
// Resume parsing → profile pipeline

const RESUME_PROMPT = `You are parsing a document that may be a resume/CV. Return ONLY valid JSON, no other text:
{"is_resume": true|false,
 "name": "candidate full name",
 "location": "city/country where they are based, if stated",
 "headline": "one-line professional headline built from the resume",
 "education": [{"institute":"institution name","degree":"exact degree title, e.g. Master of Science, MSc Management, Bachelor of Commerce","field":"field of study/major/concentration","grade":"GPA/grade/percentage exactly in the scale the institution uses","startYear":"","endYear":"","inProgress":true|false}],
 "work": [{"company":"","title":"","startDate":"","endDate":"leave empty if current","current":true|false,"description":"the FULL description text the candidate wrote for this position"}],
 "research": [{"title":"","venue":"journal/publication location","date":"","url":""}],
 "skills": ["core and technical skills"],
 "extracurriculars": [{"title":"","description":""}],
 "misc": [{"title":"","detail":"any professional details that do not fit the categories above"}]}
If the document is NOT a resume/CV, return {"is_resume": false}. Mark degrees still being earned with inProgress=true and endYear as the expected year. Do not invent missing grades, test scores, dates, employers, or fields.`;

export async function parseResumePdf(url: string, fileName: string, deps: AgentDeps, sourceFile?: File): Promise<string | null> {
  let parsed: any = null;
  try {
    const analysis = await analyzeDocument(url, RESUME_PROMPT, sourceFile);
    parsed = extractJson(analysis);
  } catch {
    return null;
  }
  if (!parsed || parsed.is_resume === false) return null;

  const incoming = normalizeProfilePatch(parsed, emptyProfile());
  const merged = mergeResumeIntoProfile(deps.profile, incoming);

  deps.setWorking('Building your profile…');
  const withSummaries = await generateProfileSummaries(merged, deps.intake);
  await deps.saveProfile(withSummaries);
  deps.profile = withSummaries;
  const lines = await applyResumeSearchSignals(withSummaries, deps);
  return lines.length
    ? `Parsed ${fileName}, updated your Profile, and refreshed your search setup`
    : `Parsed ${fileName} and updated your Profile`;
}

// Resume data augments the profile; manual/chat edits already present are kept.
function mergeResumeIntoProfile(current: ProfileData, incoming: ProfileData): ProfileData {
  const next: ProfileData = { ...current };
  if (!next.name && incoming.name) next.name = incoming.name;
  if (!next.headline && incoming.headline) next.headline = incoming.headline;
  if (!next.location && incoming.location) next.location = incoming.location;

  function mergeList<T>(mine: T[], theirs: T[], keyOf: (item: T) => string): T[] {
    const seen = new Set(mine.map((i) => keyOf(i).toLowerCase()));
    const additions = theirs.filter((i) => {
      const key = keyOf(i).toLowerCase();
      if (!key.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...mine, ...additions];
  }

  next.education = mergeList(current.education, incoming.education, (e) => `${e.institute}|${e.degree}`);
  next.work = mergeList(current.work, incoming.work, (w) => `${w.company}|${w.title}`);
  next.research = mergeList(current.research, incoming.research, (r) => r.title);
  next.extracurriculars = mergeList(current.extracurriculars, incoming.extracurriculars, (e) => e.title);
  next.misc = mergeList(current.misc, incoming.misc, (m) => m.title);
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
          content: `Profile data:\n${JSON.stringify({ ...profile, bio: undefined, lookingFor: undefined })}\n\nWhat the student has shared in chat so far:\n${answered || '(nothing yet)'}\n\nReturn ONLY JSON:\n{"bio":"4-6 sentence bio built from their work experience, academics, skills, research and extracurriculars",\n "lookingFor":"2-4 sentences on what they seem to be looking for from higher education, based on what they've shared in chat (if they've shared nothing, infer cautiously from the resume trajectory)",\n "educationSummaries":["one 1-2 sentence highlight per education item, same order"],\n "workSummaries":["one per work item, same order"],\n "researchSummaries":["one per research item, same order"],\n "skillsSummary":"1-2 sentences on their most valuable skills",\n "extracurricularSummaries":["one per extracurricular item, same order"]}`,
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

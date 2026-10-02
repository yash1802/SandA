// Alma ↔ Scout bridge.
//
// This module is Alma's ONLY integration surface with Scout's data:
//
// 1. Candidate sourcing — reads Scout's registered student state and returns
//    ONLY the students who explicitly opted in to being visible to
//    universities (profile.visible === true). Everything else about a student
//    who has not opted in stays invisible to Alma.
//
// 2. Application requests — pushes an application-request message to the
//    candidate's Scout account through the platform data API endpoint
//    (POST /workspaces/{workspaceId}/data/scout_application_requests). Scout's
//    "Application Requests" sub-section reads these rows for the signed-in
//    student, so requests sent here populate there seamlessly.

import { StudentSnapshot } from './alma-types';

function db(table: string) {
  return (window as any).__workspaceDb.from(table, { shared: true });
}

const s = (v: unknown, max = 300): string => (v == null ? '' : String(v)).trim().slice(0, max);

function asObj<T>(value: unknown, fallback: T): T {
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

const ts = (v: unknown): number => {
  const t = new Date(String(v || '')).getTime();
  return Number.isFinite(t) ? t : 0;
};

// ---------------------------------------------------------------------------
// Answer distillation — students answer Scout conversationally ("im an indian
// citizen", "yes u can look it in my resume"), but candidate cards must show
// clean keywords. These are deterministic so they also clean up snapshots that
// were stored verbatim by older versions.

const COUNTRY_DEMONYMS: [RegExp, string][] = [
  [/\bindian?\b/i, 'Indian'],
  [/\b(usa|u\.s\.a\.?|u\.s\.?|united states|american)\b/i, 'American'],
  [/\b(uk|u\.k\.?|united kingdom|british|britain|england|english|scottish|welsh)\b/i, 'British'],
  [/\b(canada|canadian)\b/i, 'Canadian'],
  [/\b(china|chinese)\b/i, 'Chinese'],
  [/\b(nigeria|nigerian)\b/i, 'Nigerian'],
  [/\b(pakistan|pakistani)\b/i, 'Pakistani'],
  [/\b(bangladesh|bangladeshi)\b/i, 'Bangladeshi'],
  [/\b(vietnam|vietnamese)\b/i, 'Vietnamese'],
  [/\b(indonesia|indonesian)\b/i, 'Indonesian'],
  [/\b(philippines|filipino|filipina)\b/i, 'Filipino'],
  [/\b(south korea|korea|korean)\b/i, 'Korean'],
  [/\b(japan|japanese)\b/i, 'Japanese'],
  [/\b(germany|german)\b/i, 'German'],
  [/\b(france|french)\b/i, 'French'],
  [/\b(spain|spanish)\b/i, 'Spanish'],
  [/\b(italy|italian)\b/i, 'Italian'],
  [/\b(brazil|brazilian)\b/i, 'Brazilian'],
  [/\b(mexico|mexican)\b/i, 'Mexican'],
  [/\b(australia|australian)\b/i, 'Australian'],
  [/\b(nepal|nepalese|nepali)\b/i, 'Nepali'],
  [/\b(sri lanka|sri lankan)\b/i, 'Sri Lankan'],
  [/\b(turkey|turkish)\b/i, 'Turkish'],
  [/\b(iran|iranian)\b/i, 'Iranian'],
  [/\b(egypt|egyptian)\b/i, 'Egyptian'],
  [/\b(kenya|kenyan)\b/i, 'Kenyan'],
  [/\b(ghana|ghanaian)\b/i, 'Ghanaian'],
  [/\b(south africa|south african)\b/i, 'South African'],
  [/\b(saudi arabia|saudi)\b/i, 'Saudi'],
  [/\b(united arab emirates|uae|emirati)\b/i, 'Emirati'],
  [/\b(singapore|singaporean)\b/i, 'Singaporean'],
  [/\b(malaysia|malaysian)\b/i, 'Malaysian'],
  [/\b(thailand|thai)\b/i, 'Thai'],
  [/\b(russia|russian)\b/i, 'Russian'],
  [/\b(ukraine|ukrainian)\b/i, 'Ukrainian'],
  [/\b(poland|polish)\b/i, 'Polish'],
  [/\b(netherlands|dutch)\b/i, 'Dutch'],
  [/\b(ireland|irish)\b/i, 'Irish'],
  [/\b(colombia|colombian)\b/i, 'Colombian'],
  [/\b(argentina|argentinian|argentine)\b/i, 'Argentinian'],
  [/\b(chile|chilean)\b/i, 'Chilean'],
  [/\b(peru|peruvian)\b/i, 'Peruvian'],
];

// "im an indian citizen" → "Indian"; dual citizens list every match.
export function distillCitizenship(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const found: string[] = [];
  for (const [re, label] of COUNTRY_DEMONYMS) {
    if (re.test(text) && !found.includes(label)) found.push(label);
  }
  if (found.length) return found.join(', ');
  // Unknown country: keep the raw answer only when it already reads like a
  // keyword (short, no sentence filler) — garbage sentences are hidden.
  if (text.length <= 30 && !/\b(i|i'm|im|my|am|a|is|are|the|yes|no|citizen)\b/i.test(text)) return text;
  return '';
}

const TEST_NAMES = ['SAT', 'ACT', 'TOEFL', 'IELTS', 'GRE', 'GMAT', 'PTE', 'Duolingo', 'LSAT', 'MCAT'] as const;

function looksLikeYear(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value);
}

// "yes u can look it in my resume" + resume text "GRE: 322 · TOEFL 109"
// → "GRE 322 · TOEFL 109". Scores are parsed from the answer first, then the
// resume fills in whatever the answer didn't state.
export function distillTests(rawAnswer?: string | null, resumeText?: string | null): string {
  const answer = String(rawAnswer || '').trim();
  const negative = /^(no|none|nope|not yet|haven'?t|havent|n\/a|na)\b/i.test(answer);
  const chips: string[] = [];
  const seen = new Set<string>();

  const scan = (text: string, allowNameOnly: boolean) => {
    if (!text) return;
    for (const name of TEST_NAMES) {
      if (seen.has(name)) continue;
      const patterns = [
        // "GRE: 322" / "GRE score of 322"
        new RegExp(`\\b${name}\\b[^0-9\\n]{0,20}?(\\d{1,4}(?:\\.\\d)?)`, 'i'),
        // "322 GRE" / "322 · GRE"
        new RegExp(`(\\d{1,4}(?:\\.\\d)?)[^a-zA-Z\\n]{0,10}\\b${name}\\b`, 'i'),
        // "1490 on the SAT" / "7.5 in IELTS"
        new RegExp(`(\\d{1,4}(?:\\.\\d)?)\\s+(?:on|in|at|for)\\s+(?:the\\s+)?${name}\\b`, 'i'),
      ];
      let score = '';
      for (const re of patterns) {
        const m = text.match(re);
        if (m && !looksLikeYear(m[1])) {
          score = m[1];
          break;
        }
      }
      if (score) {
        seen.add(name);
        chips.push(`${name} ${score}`);
      } else if (allowNameOnly && new RegExp(`\\b${name}\\b`, 'i').test(text)) {
        // The test was named without a score (e.g. "planning to take the GRE").
        seen.add(name);
        chips.push(name);
      }
    }
  };

  if (!negative) scan(answer, true);
  scan(String(resumeText || ''), false); // resume: only scored mentions count

  if (chips.length) return chips.join(' · ');
  if (negative) return 'None yet';
  return '';
}

// ---------------------------------------------------------------------------
// Candidate sourcing (Scout → Alma)

// Education-level rank so "GPA of the highest education level completed or in
// progress" picks the right entry (PRD card schema).
function educationLevelRank(degree: string): number {
  const d = (degree || '').toLowerCase();
  if (/(phd|ph\.d|doctor)/.test(d)) return 5;
  if (/(master|msc|m\.sc|mba|m\.a\b|ma\b|mphil|mres|llm|postgrad)/.test(d)) return 4;
  if (/(bachelor|bsc|b\.sc|b\.a\b|ba\b|bba|bcom|b\.com|undergrad)/.test(d)) return 3;
  if (/(diploma|associate)/.test(d)) return 2;
  return 1;
}

function highestGpa(education: any[]): { gpa: string; context: string } {
  let best: any = null;
  let bestRank = -1;
  for (const e of education || []) {
    const grade = s(e?.grade, 60);
    if (!grade) continue;
    const rank = educationLevelRank(s(e?.degree, 100));
    if (rank > bestRank) {
      bestRank = rank;
      best = e;
    }
  }
  if (!best) return { gpa: '', context: '' };
  return {
    gpa: s(best.grade, 60),
    context: [s(best.degree, 100), s(best.institute, 120)].filter(Boolean).join(' — '),
  };
}

function sniffSeekingLevel(intake: any, education: any[]): string {
  const level = s(intake?.programLevel, 20) || s(intake?.answers?.level, 120);
  if (/grad/i.test(level) && !/undergrad/i.test(level)) return 'graduate';
  if (/undergrad|bachelor/i.test(level)) return 'undergraduate';
  const text = (education || []).map((e: any) => `${s(e?.degree, 80)}`).join(' ').toLowerCase();
  if (/(master|msc|mba|phd|doctor|postgrad)/.test(text)) return 'graduate';
  if (/(bachelor|bsc|ba\b|undergrad)/.test(text)) return 'graduate'; // a finished bachelor's implies a graduate search
  return '';
}

function targetMajorOf(intake: any, brief: any, education: any[]): string {
  const stated = s(intake?.answers?.majors, 160);
  if (stated) return stated;
  const excellent = brief?.factors?.majors?.excellent;
  if (Array.isArray(excellent) && excellent.length) return excellent.map((x: any) => s(x, 60)).filter(Boolean).slice(0, 3).join(', ');
  const field = (education || []).map((e: any) => s(e?.field, 80)).find(Boolean);
  return field || '';
}

export interface SourcedStudent {
  snapshot: StudentSnapshot;
  targetMajor: string;
  gpa: string;
}

// Reads Scout's student database and returns the students who opted in to
// university visibility. Newest state per student wins; students whose latest
// state predates their own Scout data-reset are excluded.
export async function fetchOptedInScoutStudents(): Promise<SourcedStudent[]> {
  const [snapRes, legacyRes, resetRes] = await Promise.all([
    db('scout_state_snapshots').orderBy('id', 'desc').limit(400).get().catch(() => ({ data: [] })),
    db('scout_user_state').orderBy('updated_at', 'desc').limit(200).get().catch(() => ({ data: [] })),
    db('scout_resets').orderBy('id', 'desc').limit(200).get().catch(() => ({ data: [] })),
  ]);

  const resetCutoff = new Map<string, number>();
  for (const row of Array.isArray(resetRes.data) ? resetRes.data : []) {
    const email = s(row?.user_email, 200).toLowerCase();
    if (!email || resetCutoff.has(email)) continue;
    resetCutoff.set(email, ts(row.reset_at) || ts(row.created_at));
  }

  // Newest snapshot per student; legacy scout_user_state rows only fill in
  // students who never got a snapshot.
  const newestByEmail = new Map<string, any>();
  for (const row of Array.isArray(snapRes.data) ? snapRes.data : []) {
    const email = s(row?.user_email, 200).toLowerCase();
    if (!email || newestByEmail.has(email)) continue;
    newestByEmail.set(email, row);
  }
  for (const row of Array.isArray(legacyRes.data) ? legacyRes.data : []) {
    const email = s(row?.user_email, 200).toLowerCase();
    if (!email || newestByEmail.has(email)) continue;
    newestByEmail.set(email, row);
  }

  const out: SourcedStudent[] = [];
  for (const [email, row] of newestByEmail) {
    const cutoff = resetCutoff.get(email) || 0;
    if (cutoff && Math.max(ts(row.created_at), ts(row.updated_at)) <= cutoff) continue;

    const profile = asObj<any>(row.profile_json, null);
    if (!profile || profile.visible !== true) continue; // explicit opt-in only
    const intake = asObj<any>(row.intake_json, {});
    const brief = asObj<any>(row.brief_json, {});
    const education = Array.isArray(profile.education) ? profile.education : [];
    const { gpa, context } = highestGpa(education);

    const snapshot: StudentSnapshot = {
      email,
      name: s(profile.name, 90) || email.split('@')[0],
      headline: s(profile.headline, 160),
      location: s(profile.location, 120),
      citizenship: distillCitizenship(s(intake?.answers?.citizenship, 160)),
      citizenshipCountries: Array.isArray(intake?.citizenshipCountries) ? intake.citizenshipCountries : [],
      programmeInterests: Array.isArray(intake?.programmeInterests) ? intake.programmeInterests : [],
      apprenticeshipOptIn: intake?.apprenticeshipOptIn === true,
      apprenticeshipEligibleCountries: Array.isArray(intake?.apprenticeshipEligibleCountries)
        ? intake.apprenticeshipEligibleCountries
        : [],
      internationalOnly: intake?.internationalOnly === true,
      level: sniffSeekingLevel(intake, education),
      gpaContext: context,
      education: education.slice(0, 6).map((e: any) => ({
        institute: s(e?.institute, 120),
        degree: s(e?.degree, 100),
        field: s(e?.field, 100),
        grade: s(e?.grade, 60),
        inProgress: !!e?.inProgress,
      })),
      work: (Array.isArray(profile.work) ? profile.work : []).slice(0, 6).map((w: any) => ({
        company: s(w?.company, 120),
        title: s(w?.title, 120),
        description: s(w?.description, 400),
      })),
      research: (Array.isArray(profile.research) ? profile.research : []).slice(0, 6).map((r: any) => ({
        title: s(r?.title, 160),
        venue: s(r?.venue, 120),
      })),
      skills: (Array.isArray(profile.skills) ? profile.skills : []).map((x: any) => s(x, 50)).filter(Boolean).slice(0, 20),
      extracurriculars: (Array.isArray(profile.extracurriculars) ? profile.extracurriculars : [])
        .slice(0, 8)
        .map((e: any) => ({ title: s(e?.title, 120), description: s(e?.description, 300) })),
      // Preserve Scout's complete eight-part profile summary for Alma instead
      // of truncating away later constraints such as visa or language needs.
      lookingFor: s(profile.lookingFor, 1400),
      // Test scores come from the stated answer, with the parsed resume text
      // filling in scores the student deferred to it ("check my resume").
      tests: distillTests(s(intake?.answers?.tests, 300), String(profile.resumeText || '').slice(0, 15000)),
      budget: s(intake?.answers?.budget, 120),
    };

    out.push({ snapshot, targetMajor: targetMajorOf(intake, brief, education), gpa });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Application requests (Alma → Scout)

export interface ApplicationRequestPayload {
  studentEmail: string;
  universityEmail: string;
  universityName: string;
  programId: number;
  programName: string;
  programLevel: string;
  campusLocation: string;
  message: string;
}

// Pushes one application request into Scout's data plane. The insert below is
// the authenticated client of the platform's data API endpoint for the
// scout_application_requests table; rows land in the student's account keyed
// by their email, ready for Scout's "Application Requests" sub-section.
export async function pushApplicationRequestToScout(payload: ApplicationRequestPayload): Promise<void> {
  await db('scout_application_requests').insert({
    student_email: payload.studentEmail.toLowerCase(),
    university_email: payload.universityEmail.toLowerCase(),
    university_name: payload.universityName,
    program_id: payload.programId,
    program_name: payload.programName,
    program_level: payload.programLevel,
    campus_location: payload.campusLocation,
    message: payload.message,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });
}

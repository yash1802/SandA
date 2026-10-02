// Alma — data store: identity, WorkspaceDB persistence, and the shared app
// context. Mirrors Scout's durability model: state saves are append-only
// snapshots (newest row wins) and candidate status changes are insert-only
// events overlaid on base rows, because in-place row updates proved unreliable
// across sessions.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefData,
  CandidateRow,
  CandidateStatus,
  DocumentKind,
  DocumentRow,
  FitReason,
  IntakeData,
  MessageAttachment,
  MessageRow,
  ProgramProfile,
  ProgramRow,
  SkipFeedback,
  StudentSnapshot,
  TabId,
  asObj,
  emptyBrief,
  emptyIntake,
  emptyProfile,
  intakeCompleted,
  normalizeBrief,
  normalizeProfile,
  sanitizeBrief,
} from './alma-types';

// All reads/writes bypass session scoping and key on user_email (+ program_id),
// so a representative's data survives logout/login (session ids change; the
// email does not).
export function db(table: string) {
  return (window as any).__workspaceDb.from(table, { shared: true });
}

function analyticsDb(table: string) {
  return (window as any).__workspaceDb.from(table);
}

export interface SessionIdentity {
  email: string;
  name: string;
  institution: string;
}

function readAlmaActorType(): 'institution' | 'company' {
  if (typeof window === 'undefined') return 'institution';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('space_role_') && localStorage.getItem(key) === 'company') return 'company';
    }
  } catch {
    // default below
  }
  return 'institution';
}

export function readSessionIdentity(): SessionIdentity {
  const identity: SessionIdentity = { email: '', name: '', institution: '' };
  if (typeof window === 'undefined') return identity;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('space_session_')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (typeof session?.email === 'string' && session.email.trim()) {
        identity.email = session.email.trim();
        const meta = session.metadata && typeof session.metadata === 'object' ? session.metadata : {};
        if (typeof meta.contactName === 'string' && meta.contactName.trim()) identity.name = meta.contactName.trim();
        else if (typeof session.name === 'string' && session.name.trim()) identity.name = session.name.trim();
        if (typeof meta.institutionName === 'string' && meta.institutionName.trim()) {
          identity.institution = meta.institutionName.trim();
        }
        return identity;
      }
    }
  } catch {
    // ignore parse errors
  }
  return identity;
}

// The nav's university component wants the department/university logo. There
// is no uploaded logo asset, so a real university email domain gives us the
// institution's favicon; generic mail providers fall back to a monogram.
const GENERIC_MAIL_HOSTS =
  /(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me\.com|aol|proton|pm\.me|zoho|gmx|mail\.com|yandex)/i;

export function institutionLogoUrl(email: string): string {
  const domain = (email.split('@')[1] || '').trim().toLowerCase();
  if (!domain || GENERIC_MAIL_HOSTS.test(domain)) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

// ---------------------------------------------------------------------------
// Platform service helpers (same endpoints Scout uses)

export interface UploadResult {
  url: string;
  contentType: string;
  bytes: number;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  if (window.__WORKSPACE_ID__) fd.append('workspaceId', window.__WORKSPACE_ID__);
  fd.append('folder', 'alma-documents');
  const res = await fetch('/api/upload/file', {
    method: 'POST',
    headers: { 'X-App-Id': window.__APP_ID__ || '' },
    body: fd,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new Error(data?.error || 'Upload failed');
  return { url: data.url, contentType: data.contentType || file.type, bytes: data.bytes || file.size };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file data'));
    reader.readAsDataURL(blob);
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

// The analyzer accepts either a fetchable URL or inlined data-URL bytes; each
// path can fail on its own, so analysis tries every representation available.
async function analysisCandidates(documentUrl: string, sourceFile?: File): Promise<string[]> {
  if (sourceFile) {
    const out = [await fileToDataUrl(sourceFile)];
    if (/^https?:\/\//i.test(documentUrl)) out.push(documentUrl);
    return out;
  }
  if (/^https?:\/\//i.test(documentUrl) && /\.pdf(?:$|[?#])/i.test(documentUrl)) {
    const out = [documentUrl];
    try {
      const res = await fetch(documentUrl);
      if (res.ok) out.push(await blobToDataUrl(await res.blob()));
    } catch {
      // URL-only it is
    }
    return out;
  }
  return [documentUrl];
}

export async function analyzeDocument(documentUrl: string, analysisPrompt: string, sourceFile?: File): Promise<string> {
  const candidates = await analysisCandidates(documentUrl, sourceFile);
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || '' },
        body: JSON.stringify({ documentUrl: candidate, analysisPrompt, documentType: 'pdf' }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.analysis) return String(data.analysis);
      lastError = new Error(data?.error || 'Document analysis failed');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Document analysis failed');
    }
  }
  throw lastError || new Error('Document analysis failed');
}

export interface SearchHit {
  title?: string;
  link?: string;
  snippet?: string;
}

export async function webSearch(query: string, num = 8): Promise<SearchHit[]> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, searchType: 'web', num, language: 'en' }),
    });
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

export interface LlmResult {
  content: string;
}

export async function llmChat(
  messages: { role: string; content: string }[],
  opts: { temperature?: number; maxTokens?: number; model?: string } = {}
): Promise<LlmResult> {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
    .join('\n\n');
  const conversation: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const content = String(message.content || '').trim();
    if (!content) continue;
    const role = message.role as 'user' | 'assistant';
    const previous = conversation[conversation.length - 1];
    if (previous?.role === role) previous.content += `\n\n${content}`;
    else conversation.push({ role, content });
  }
  // Anthropic conversations begin with a user turn. Preserve a leading
  // assistant greeting as context without dropping it.
  if (conversation[0]?.role === 'assistant') {
    conversation.unshift({ role: 'user', content: 'Conversation context follows.' });
  }

  const res = await fetch('/proxy/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-DB-Token': (window as any).__workspaceDb?.token || '',
    },
    body: JSON.stringify({
      model: opts.model || 'claude-sonnet-5',
      max_tokens: opts.maxTokens ?? 1400,
      thinking: { type: 'disabled' },
      ...(system ? { system } : {}),
      messages: conversation,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `AI request failed (${res.status})`);
  }
  return {
    content: (Array.isArray(data?.content) ? data.content : [])
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => String(block.text || ''))
      .join(''),
  };
}

// ---------------------------------------------------------------------------
// Candidate status transitions (single place the rules live)
//
// IMPORTANT (PRD): once a candidate is Contacted the move is irreversible —
// they can never be skipped or moved back to Saved.

export function statusPatch(current: CandidateRow, next: CandidateStatus, feedback?: SkipFeedback): Record<string, any> | null {
  if (current.status === 'contacted') return null;
  const now = new Date().toISOString();
  if (next === 'saved') {
    return { status: 'saved', shortlisted_at: current.shortlisted_at || now, skip_feedback: null };
  }
  if (next === 'contacted') {
    return { status: 'contacted', contacted_at: now, shortlisted_at: current.shortlisted_at || now };
  }
  if (next === 'skipped') {
    const sf = feedback ?? asObj<SkipFeedback | null>(current.skip_feedback as any, null);
    return { status: 'skipped', skip_feedback: sf ? JSON.stringify(sf) : null, shortlisted_at: null };
  }
  return { status: next };
}

export interface NewCandidate {
  student_email: string;
  name: string;
  target_major: string;
  gpa: string;
  match_score: number;
  fit_reasons: FitReason[];
  student_json: StudentSnapshot;
}

// A double-discovery race once stored the same student twice (with different
// scores) for one program. The winner per (program, student) is the row the
// university acted on; among equals, the newest row. Applied at read time so
// historical duplicates disappear without touching the database.
const CANDIDATE_STATUS_PRIORITY: Record<string, number> = { contacted: 4, saved: 3, skipped: 2, recommended: 1 };

function dedupeCandidateRows(rows: CandidateRow[]): CandidateRow[] {
  const winners = new Map<string, CandidateRow>();
  for (const row of rows) {
    const em = (row.student_email || '').toLowerCase();
    if (!em) continue;
    const key = `${row.program_id}:${em}`;
    const prev = winners.get(key);
    if (!prev) {
      winners.set(key, row);
      continue;
    }
    const a = CANDIDATE_STATUS_PRIORITY[prev.status] || 0;
    const b = CANDIDATE_STATUS_PRIORITY[row.status] || 0;
    if (b > a || (b === a && row.id > prev.id)) winners.set(key, row);
  }
  const keep = new Set([...winners.values()].map((r) => r.id));
  return rows.filter((row) => {
    const em = (row.student_email || '').toLowerCase();
    return !em || keep.has(row.id);
  });
}

export interface NewProgramInput {
  name: string;
  level: 'undergraduate' | 'graduate';
  intakes: string[];
  campus_location: string;
  brochure_url?: string;
  brochure_name?: string;
}

// ---------------------------------------------------------------------------
// The store hook — one source of truth for the dashboard and all three columns.

export interface AlmaStore {
  email: string;
  displayName: string;
  institutionName: string;
  ready: boolean;
  loadError: string;
  programs: ProgramRow[];
  candidateCounts: Record<number, number>; // program_id → count in Recommendations
  activeProgramId: number | null;
  activeProgram: ProgramRow | null;
  programReady: boolean;
  openProgram: (id: number | null) => void;
  createProgram: (input: NewProgramInput) => Promise<ProgramRow>;
  updateProgram: (id: number, patch: Partial<NewProgramInput>) => Promise<void>;
  reloadPrograms: () => Promise<void>;

  candidates: CandidateRow[];
  documents: DocumentRow[];
  messages: MessageRow[];
  intake: IntakeData;
  brief: BriefData;
  profile: ProgramProfile;
  recommended: CandidateRow[];
  skippedList: CandidateRow[];
  savedList: CandidateRow[];
  contactedList: CandidateRow[];
  defaultMessage: string;
  trackActivity: (
    eventType: string,
    details?: { studentId?: string | null; candidateId?: number | null; metadata?: Record<string, any> }
  ) => Promise<void>;

  setStatus: (id: number, next: CandidateStatus, feedback?: SkipFeedback) => Promise<boolean>;
  addCandidates: (items: NewCandidate[]) => Promise<number>;
  saveIntake: (next: IntakeData) => Promise<void>;
  saveBrief: (next: BriefData) => Promise<void>;
  saveProfile: (next: ProgramProfile) => Promise<void>;
  addDocument: (doc: {
    name: string;
    kind: DocumentKind;
    url: string;
    content_type: string;
    size_bytes: number;
    uploaded_via: 'chat' | 'manual' | 'creation';
    text_content?: string;
  }) => Promise<void>;
  setDocumentKind: (docId: number, kind: DocumentKind) => Promise<void>;
  appendLocalMessage: (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => void;
  persistMessage: (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => Promise<void>;
  reloadCandidates: () => Promise<void>;
  reloadDocuments: () => Promise<void>;
  reloadMessages: () => Promise<void>;
  hasPersistedMessages: () => Promise<boolean | null>;
}

let tempId = -1;

export function useAlmaStore(): AlmaStore {
  const identity = useMemo(readSessionIdentity, []);
  const actorType = useMemo(readAlmaActorType, []);
  // Founder previews may not carry a customer session; fall back to a stable key.
  const email = identity.email || 'preview@alma.local';

  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [allCandidates, setAllCandidates] = useState<CandidateRow[]>([]);
  const [activeProgramId, setActiveProgramId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  // Which program's scoped data (messages/documents/state) is currently in the
  // React state. `programReady` is DERIVED from it, so the moment a different
  // program becomes active, readiness flips false in the same render — there
  // is no window where a consumer can see programReady=true beside another
  // program's (or boot-time empty) data. A boolean set from an effect had
  // exactly that window, and it caused duplicate login greetings and even
  // empty-state snapshots that wiped saved answers.
  const [loadedProgramKey, setLoadedProgramKey] = useState('');
  // Which program's canonical state snapshot has actually been READ from the
  // DB — snapshot writes are forbidden until then (see writeSnapshot).
  const [stateLoadedKey, setStateLoadedKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const keyOf = (id: number | null) => (id == null ? 'none' : String(id));
  const programReady = loadedProgramKey === keyOf(activeProgramId);

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [intake, setIntake] = useState<IntakeData>(emptyIntake());
  const [brief, setBrief] = useState<BriefData>(emptyBrief());
  const [profile, setProfile] = useState<ProgramProfile>(emptyProfile());

  const trackActivity = useCallback(
    async (
      eventType: string,
      details: { studentId?: string | null; candidateId?: number | null; metadata?: Record<string, any> } = {}
    ) => {
      await analyticsDb('inbox_alma_activity').insert({
        actor_id: email,
        actor_type: actorType,
        institution_name: identity.institution || 'Your institution',
        program_id: activeProgramId,
        student_id: details.studentId || null,
        candidate_id: details.candidateId || null,
        event_type: eventType,
        metadata_json: details.metadata || {},
        occurred_at: new Date().toISOString(),
      });
    },
    [email, actorType, identity.institution, activeProgramId]
  );

  const candidatesRef = useRef(allCandidates);
  candidatesRef.current = allCandidates;

  // Persistence is append-only: every save INSERTS a full-state snapshot row
  // for (user, program) and loads read the newest one. `latest` is kept in
  // sync synchronously so each snapshot is complete.
  const latest = useRef({ intake: emptyIntake(), brief: emptyBrief(), profile: emptyProfile() });
  const snapshotDirty = useRef(false);
  const stateWriteQueue = useRef<Promise<any>>(Promise.resolve());

  const reloadPrograms = useCallback(async () => {
    const { data } = await db('alma_programs').eq('user_email', email).orderBy('id', 'desc').limit(100).get();
    setPrograms(Array.isArray(data) ? (data as ProgramRow[]) : []);
  }, [email]);

  // Loads every candidate for this account (all programs) so the dashboard can
  // show live counts, then overlays durable status events (oldest → newest).
  const reloadCandidates = useCallback(async () => {
    const [candRes, eventRes] = await Promise.all([
      db('alma_candidates').eq('user_email', email).orderBy('id', 'desc').limit(500).get(),
      db('alma_candidate_events')
        .eq('user_email', email)
        .orderBy('id', 'asc')
        .limit(2000)
        .get()
        .catch(() => ({ data: [] })),
    ]);
    const rows = Array.isArray(candRes.data) ? (candRes.data as CandidateRow[]) : [];
    const byId = new Map<number, CandidateRow>(rows.map((r) => [r.id, r]));
    for (const ev of Array.isArray(eventRes.data) ? eventRes.data : []) {
      const target = byId.get(Number(ev.candidate_id));
      const patch = asObj<Record<string, any> | null>(ev.patch_json, null);
      if (target && patch && typeof patch === 'object') Object.assign(target, patch);
    }
    setAllCandidates(dedupeCandidateRows(rows));
  }, [email]);

  const reloadDocuments = useCallback(async () => {
    if (activeProgramId == null) {
      setDocuments([]);
      return;
    }
    const { data } = await db('alma_documents')
      .eq('user_email', email)
      .eq('program_id', activeProgramId)
      .orderBy('id', 'desc')
      .limit(200)
      .get();
    const rows = Array.isArray(data) ? (data as DocumentRow[]) : [];
    // Same-kind uploads supersede: only one brochure and one default message
    // are live at a time (a new brochure replaces the old one regardless of
    // filename), while generic uploads replace only on the same name. A kept
    // row claims BOTH keys so a brochure also hides the plain upload row the
    // chat inserted for the same file before tagging it.
    const seen = new Set<string>();
    const deduped: DocumentRow[] = [];
    for (const row of rows) {
      const name = (row.name || '').trim().toLowerCase();
      const nameKey = name ? `name:${name}` : '';
      const kindKey = row.kind === 'brochure' || row.kind === 'default_message' ? `kind:${row.kind}` : '';
      if (!nameKey && !kindKey) continue;
      if ((nameKey && seen.has(nameKey)) || (kindKey && seen.has(kindKey))) continue;
      if (nameKey) seen.add(nameKey);
      if (kindKey) seen.add(kindKey);
      deduped.push(row);
    }
    setDocuments(deduped);
  }, [email, activeProgramId]);

  const reloadMessages = useCallback(async () => {
    if (activeProgramId == null) {
      setMessages([]);
      return;
    }
    const { data } = await db('alma_messages')
      .eq('user_email', email)
      .eq('program_id', activeProgramId)
      .orderBy('created_at', 'desc')
      .limit(200)
      .get();
    const rows = (Array.isArray(data) ? data : []).reverse();
    // Sessions that raced the history load once persisted duplicate intro
    // greetings (and doubled maintenance notes); render only the oldest
    // greeting and collapse identical back-to-back assistant rows so old
    // accounts get a clean transcript (the agent prompt reads it too).
    let greetingSeen = false;
    const cleaned: typeof rows = [];
    for (const row of rows) {
      if (row.role === 'assistant' && /^Hi\b[^\n]*I'm Alma — I help you find candidates/.test(row.content || '')) {
        if (greetingSeen) continue;
        greetingSeen = true;
      }
      const prev = cleaned[cleaned.length - 1];
      if (
        prev &&
        prev.role === 'assistant' &&
        row.role === 'assistant' &&
        (prev.content || '') === (row.content || '') &&
        JSON.stringify(prev.actions || []) === JSON.stringify(row.actions || []) &&
        Math.abs(new Date(row.created_at || 0).getTime() - new Date(prev.created_at || 0).getTime()) < 60000
      ) {
        continue;
      }
      cleaned.push(row);
    }
    setMessages(cleaned);
  }, [email, activeProgramId]);

  // Authoritative "does this program have chat history?" check for greeting
  // logic: the in-memory list can be transiently empty while loads settle, so
  // the greeting must confirm emptiness against the database itself. Returns
  // null when the check fails — callers must treat that as "unknown", not "no".
  const hasPersistedMessages = useCallback(async (): Promise<boolean | null> => {
    if (activeProgramId == null) return null;
    try {
      const { data } = await db('alma_messages')
        .eq('user_email', email)
        .eq('program_id', activeProgramId)
        .limit(1)
        .get();
      return Array.isArray(data) && data.length > 0;
    } catch {
      return null;
    }
  }, [email, activeProgramId]);

  const applyState = useCallback((nextIntake: IntakeData, nextBrief: BriefData, nextProfile: ProgramProfile) => {
    latest.current = { intake: nextIntake, brief: nextBrief, profile: nextProfile };
    setIntake(nextIntake);
    setBrief(nextBrief);
    setProfile(nextProfile);
  }, []);

  const reloadState = useCallback(async () => {
    if (activeProgramId == null) {
      applyState(emptyIntake(), emptyBrief(), emptyProfile());
      setStateLoadedKey('none');
      return;
    }
    const { data } = await db('alma_state_snapshots')
      .eq('user_email', email)
      .eq('program_id', activeProgramId)
      .orderBy('id', 'desc')
      .limit(1)
      .get();
    const row = Array.isArray(data) && data.length ? data[0] : null;
    if (!row) {
      applyState(emptyIntake(), emptyBrief(), emptyProfile());
      setStateLoadedKey(String(activeProgramId)); // genuinely fresh program — writes allowed
      return;
    }
    const nextIntake = asObj<IntakeData>(row.intake_json, emptyIntake());
    if (!nextIntake.answers || typeof nextIntake.answers !== 'object') nextIntake.answers = {};
    applyState(nextIntake, normalizeBrief(asObj<any>(row.brief_json, null)), normalizeProfile(asObj<any>(row.profile_json, null)));
    setStateLoadedKey(String(activeProgramId));
  }, [email, activeProgramId, applyState]);

  // Boot: programs + all candidates (for dashboard counts).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([reloadPrograms(), reloadCandidates()]);
        trackActivity('app_open', { metadata: { surface: 'alma' } }).catch(() => undefined);
        if (!cancelled) setLoadError('');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your data.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadPrograms, reloadCandidates]);

  // Entering (or leaving) a program loads its scoped state. Readiness is
  // derived (loadedProgramKey vs activeProgramId), so no reset is needed here:
  // changing programs invalidates readiness synchronously during render.
  useEffect(() => {
    let cancelled = false;
    const key = keyOf(activeProgramId);
    (async () => {
      try {
        await Promise.all([reloadDocuments(), reloadMessages(), reloadState()]);
      } catch {
        // per-program load errors surface as empty panels; chat still works,
        // and snapshot writes stay locked until the state load succeeds.
      } finally {
        if (!cancelled) setLoadedProgramKey(key);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProgramId, reloadDocuments, reloadMessages, reloadState]);

  // Serialize snapshot writes so rapid successive saves can't interleave; the
  // dirty flag coalesces back-to-back saves into one insert of the same state.
  const writeSnapshot = useCallback(() => {
    const programId = activeProgramId;
    if (programId == null) return Promise.resolve();
    // Never persist state that was never loaded — an "empty" snapshot written
    // before/instead of the real load becomes the newest row and wipes the
    // program's saved answers (append-only model — newest row wins). This
    // exact failure erased a representative's intake on 2026-08-02.
    if (stateLoadedKey !== String(programId)) return Promise.resolve();
    snapshotDirty.current = true;
    const run = async () => {
      if (!snapshotDirty.current) return;
      snapshotDirty.current = false;
      try {
        await db('alma_state_snapshots').insert({
          user_email: email,
          program_id: programId,
          intake_json: latest.current.intake,
          brief_json: latest.current.brief,
          profile_json: latest.current.profile,
          source: 'app',
        });
      } catch (err) {
        snapshotDirty.current = true; // the next save retries this state
        throw err;
      }
    };
    const next = stateWriteQueue.current.then(run, run);
    stateWriteQueue.current = next;
    return next;
  }, [email, activeProgramId, stateLoadedKey]);

  const saveIntake = useCallback(
    async (next: IntakeData) => {
      const withCompleted = { ...next, completed: intakeCompleted(next) };
      latest.current.intake = withCompleted;
      setIntake(withCompleted);
      await writeSnapshot();
    },
    [writeSnapshot]
  );

  const saveBrief = useCallback(
    async (next: BriefData) => {
      // Every write path (agent actions, answer reconciliation, manual chip
      // edits) goes through here, so dedupe/cleanup happens exactly once.
      const stamped = { ...sanitizeBrief(next), updatedAt: new Date().toISOString() };
      latest.current.brief = stamped;
      setBrief(stamped);
      await writeSnapshot();
    },
    [writeSnapshot]
  );

  const saveProfile = useCallback(
    async (next: ProgramProfile) => {
      latest.current.profile = next;
      setProfile(next);
      await writeSnapshot();
    },
    [writeSnapshot]
  );

  const setStatus = useCallback(
    async (id: number, next: CandidateStatus, feedback?: SkipFeedback): Promise<boolean> => {
      const current = candidatesRef.current.find((c) => c.id === id);
      if (!current || current.status === next) return false;
      const patch = statusPatch(current, next, feedback);
      if (!patch) return false; // contacted candidates never move (PRD rule)
      // Optimistic: the carousel/board advance immediately; the reload trues things up.
      setAllCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      try {
        // The event insert is what makes the change durable; the direct row
        // update is best-effort so the base table stays readable on its own.
        await db('alma_candidate_events').insert({ user_email: email, candidate_id: id, patch_json: patch });
        await trackActivity(next === 'saved' || next === 'contacted' ? 'expressed_interest' : 'candidate_status', {
          studentId: current.student_email || null,
          candidateId: id,
          metadata: { previous_status: current.status, next_status: next, feedback: feedback || null, patch },
        });
        db('alma_candidates')
          .update(id, patch)
          .catch(() => undefined);
      } finally {
        reloadCandidates().catch(() => undefined);
      }
      return true;
    },
    [email, reloadCandidates]
  );

  const addCandidates = useCallback(
    async (items: NewCandidate[]) => {
      const programId = activeProgramId;
      if (!items.length || programId == null) return 0;
      const base = Date.now();
      const rows = items.map((item, i) => ({
        user_email: email,
        program_id: programId,
        student_email: item.student_email,
        name: item.name,
        target_major: item.target_major || null,
        gpa: item.gpa || null,
        match_score: Math.max(0, Math.min(100, Math.round(item.match_score || 0))),
        fit_reasons: JSON.stringify(item.fit_reasons || []),
        student_json: JSON.stringify(item.student_json || {}),
        status: 'recommended',
        // Stagger stamps so reverse-chron keeps the AI's fit order within a batch.
        recommended_at: new Date(base - i * 1000).toISOString(),
      }));
      await db('alma_candidates').bulkInsert(rows);
      await trackActivity('search', {
        metadata: { result_count: rows.length, source: 'scout_opted_in_students', program_id: programId },
      });
      return rows.length;
    },
    [email, activeProgramId]
  );

  const addDocument = useCallback(
    async (doc: {
      name: string;
      kind: DocumentKind;
      url: string;
      content_type: string;
      size_bytes: number;
      uploaded_via: 'chat' | 'manual' | 'creation';
      text_content?: string;
    }) => {
      const programId = activeProgramId;
      if (programId == null) return;
      // Replace-on-same-name (PRD): the loader keeps the newest row per name;
      // deleting the older rows is best-effort cleanup.
      const stale = documents.filter((d) => d.name.trim().toLowerCase() === doc.name.trim().toLowerCase());
      await db('alma_documents').insert({
        user_email: email,
        program_id: programId,
        name: doc.name,
        kind: doc.kind,
        url: doc.url,
        content_type: doc.content_type,
        size_bytes: doc.size_bytes,
        uploaded_via: doc.uploaded_via,
        text_content: doc.text_content || null,
      });
      for (const old of stale) {
        db('alma_documents')
          .delete(old.id)
          .catch(() => undefined);
      }
      await reloadDocuments();
    },
    [email, activeProgramId, documents, reloadDocuments]
  );

  const setDocumentKind = useCallback(
    async (docId: number, kind: DocumentKind) => {
      const doc = documents.find((d) => d.id === docId);
      if (!doc || doc.kind === kind) return;
      // Re-insert (newest row per name wins) so the kind change is durable
      // even where row updates aren't; then best-effort remove the old row.
      await db('alma_documents').insert({
        user_email: email,
        program_id: doc.program_id,
        name: doc.name,
        kind,
        url: doc.url || null,
        content_type: doc.content_type || null,
        size_bytes: doc.size_bytes || null,
        uploaded_via: doc.uploaded_via || 'manual',
        text_content: doc.text_content || null,
      });
      db('alma_documents')
        .delete(doc.id)
        .catch(() => undefined);
      await reloadDocuments();
    },
    [email, documents, reloadDocuments]
  );

  const appendLocalMessage = useCallback(
    (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: tempId--,
          user_email: email,
          program_id: activeProgramId ?? 0,
          role: m.role,
          content: m.content,
          attachments: m.attachments || [],
          actions: m.actions || [],
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [email, activeProgramId]
  );

  const persistMessage = useCallback(
    async (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => {
      if (activeProgramId == null) return;
      await Promise.all([
        db('alma_messages').insert({
          user_email: email,
          program_id: activeProgramId,
          role: m.role,
          content: m.content,
          attachments: JSON.stringify(m.attachments || []),
          actions: JSON.stringify(m.actions || []),
        }),
        trackActivity('message', {
          metadata: { role: m.role, content: m.content, attachments: m.attachments || [], actions: m.actions || [] },
        }),
      ]);
    },
    [email, activeProgramId]
  );

  const createProgram = useCallback(
    async (input: NewProgramInput): Promise<ProgramRow> => {
      await db('alma_programs').insert({
        user_email: email,
        name: input.name,
        level: input.level,
        intakes: JSON.stringify(input.intakes),
        campus_location: input.campus_location,
        brochure_url: input.brochure_url || null,
        brochure_name: input.brochure_name || null,
      });
      await trackActivity('programme_create', { metadata: input });
      // The SDK insert doesn't return the row — reload and find the newest match.
      const { data } = await db('alma_programs').eq('user_email', email).orderBy('id', 'desc').limit(20).get();
      const rows = Array.isArray(data) ? (data as ProgramRow[]) : [];
      setPrograms(rows);
      const created = rows.find((p) => p.name === input.name) || rows[0];
      if (!created) throw new Error('The program was not saved — please try again.');
      return created;
    },
    [email]
  );

  // Program identity edits (name, level, intakes, campus) from the Profile
  // header. Programs are the one table where in-place updates are required —
  // re-inserting would change the id every other table keys on.
  const updateProgram = useCallback(
    async (id: number, patch: Partial<NewProgramInput>) => {
      const row: Record<string, any> = {};
      if (patch.name != null && patch.name.trim()) row.name = patch.name.trim();
      if (patch.level != null) row.level = patch.level;
      if (patch.intakes != null) row.intakes = JSON.stringify(patch.intakes);
      if (patch.campus_location != null) row.campus_location = patch.campus_location;
      if (!Object.keys(row).length) return;
      await db('alma_programs').update(id, row);
      await trackActivity('programme_update', { metadata: { program_id: id, patch: row } });
      await reloadPrograms();
    },
    [reloadPrograms]
  );

  const openProgram = useCallback((id: number | null) => {
    setActiveProgramId(id);
  }, []);

  const programCandidates = useMemo(
    () => (activeProgramId == null ? [] : allCandidates.filter((c) => c.program_id === activeProgramId)),
    [allCandidates, activeProgramId]
  );

  const recommended = useMemo(
    () =>
      programCandidates
        .filter((c) => c.status === 'recommended')
        .sort((a, b) => {
          const scoreDiff = (b.match_score || 0) - (a.match_score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return (b.recommended_at || b.created_at || '').localeCompare(a.recommended_at || a.created_at || '');
        }),
    [programCandidates]
  );

  const skippedList = useMemo(
    () => programCandidates.filter((c) => c.status === 'skipped').sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    [programCandidates]
  );

  const savedList = useMemo(
    () =>
      programCandidates
        .filter((c) => c.status === 'saved')
        .sort((a, b) => (b.shortlisted_at || b.updated_at || '').localeCompare(a.shortlisted_at || a.updated_at || '')),
    [programCandidates]
  );

  const contactedList = useMemo(
    () =>
      programCandidates
        .filter((c) => c.status === 'contacted')
        .sort((a, b) => (b.contacted_at || b.updated_at || '').localeCompare(a.contacted_at || a.updated_at || '')),
    [programCandidates]
  );

  const candidateCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const c of allCandidates) {
      if (c.status !== 'recommended') continue;
      counts[c.program_id] = (counts[c.program_id] || 0) + 1;
    }
    return counts;
  }, [allCandidates]);

  const defaultMessage = useMemo(() => {
    const doc = documents.find((d) => d.kind === 'default_message');
    return (doc?.text_content || '').trim();
  }, [documents]);

  const activeProgram = useMemo(
    () => (activeProgramId == null ? null : programs.find((p) => p.id === activeProgramId) || null),
    [programs, activeProgramId]
  );

  const displayName = identity.name || (identity.email ? identity.email.split('@')[0] : 'Representative');
  const institutionName = identity.institution || (actorType === 'company' ? 'Your company' : 'Your university');

  return {
    email,
    displayName,
    institutionName,
    ready,
    loadError,
    programs,
    candidateCounts,
    activeProgramId,
    activeProgram,
    programReady,
    openProgram,
    createProgram,
    updateProgram,
    reloadPrograms,
    candidates: programCandidates,
    documents,
    messages,
    intake,
    brief,
    profile,
    recommended,
    skippedList,
    savedList,
    contactedList,
    defaultMessage,
    trackActivity,
    setStatus,
    addCandidates,
    saveIntake,
    saveBrief,
    saveProfile,
    addDocument,
    setDocumentKind,
    appendLocalMessage,
    persistMessage,
    reloadCandidates,
    reloadDocuments,
    reloadMessages,
    hasPersistedMessages,
  };
}

// ---------------------------------------------------------------------------
// Shared context (store + UI controls), provided by App.tsx

export interface AlmaUiControls {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  navCollapsed: boolean;
  setNavCollapsed: (v: boolean) => void;
  modalCandidateId: number | null;
  setModalCandidateId: (id: number | null) => void;
  signOut: () => void;
  isMobile: boolean;
  // "New program" in the nav routes back to the dashboard with the creation
  // modal pre-opened (Jill's "New role").
  newProgramIntent: boolean;
  requestNewProgram: () => void;
  clearNewProgramIntent: () => void;
}

export type AlmaContextValue = AlmaStore & AlmaUiControls;

export const AlmaContext = createContext<AlmaContextValue | null>(null);

export function useAlma(): AlmaContextValue {
  const ctx = useContext(AlmaContext);
  if (!ctx) throw new Error('useAlma must be used within AlmaContext');
  return ctx;
}

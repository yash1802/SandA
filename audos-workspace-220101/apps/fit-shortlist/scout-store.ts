// Scout — data store: identity, WorkspaceDB persistence, and the shared app context.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_STATUSES,
  BoardStatus,
  BriefData,
  DocumentRow,
  IntakeData,
  InvitationRow,
  MessageAttachment,
  MessageRow,
  ProfileData,
  ProgramDetails,
  ProgramRow,
  ProgramStatus,
  SkipFeedback,
  TabId,
  asObj,
  dedupeDocumentsByCategory,
  emptyBrief,
  emptyIntake,
  emptyProfile,
  intakeCompleted,
  isBoardStatus,
  normalizeBrief,
  normalizeIntakeEligibility,
  nextIntakeQuestion,
  profileFactsKey,
  profileHasBioFacts,
  sanitizeBrief,
  toTitleCaseName,
} from './scout-types';

// All reads/writes bypass session scoping and key on user_email instead, so the
// student's data survives logout/login (session ids change; the email does not).
export function db(table: string) {
  return (window as any).__workspaceDb.from(table, { shared: true });
}

function analyticsDb(table: string) {
  return (window as any).__workspaceDb.from(table);
}

export interface SessionIdentity {
  email: string;
  name: string;
}

export function readSessionIdentity(): SessionIdentity {
  const identity: SessionIdentity = { email: '', name: '' };
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
        if (typeof session?.name === 'string' && session.name.trim()) {
          identity.name = session.name.trim();
        }
        return identity;
      }
    }
  } catch {
    // ignore parse errors
  }
  return identity;
}

export interface UploadResult {
  url: string;
  contentType: string;
  bytes: number;
}

export async function uploadPdf(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  if (window.__WORKSPACE_ID__) fd.append('workspaceId', window.__WORKSPACE_ID__);
  fd.append('folder', 'scout-documents');
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
    reader.onerror = () => reject(new Error('Could not read PDF data'));
    reader.readAsDataURL(blob);
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

// The analyzer accepts either a fetchable URL or inlined data-URL bytes; each
// path can fail on its own (URL fetch restrictions vs. request-size limits),
// so analysis tries every representation we can produce before giving up.
async function analysisCandidates(documentUrl: string, sourceFile?: File): Promise<string[]> {
  if (sourceFile) {
    // Freshly attached file: its bytes are local (the stored URL can lag right
    // after upload). Keep the stored URL as a server-side fallback.
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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ query, searchType: 'web', num, language: 'en' }),
    });
  } catch (error) {
    const timedOut =
      !!error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError';
    throw new AgentApiError(
      timedOut ? 'timeout' : 'network',
      timedOut ? 'The search request timed out.' : 'The search service could not be reached.'
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AgentApiError('http', `Search request failed (${res.status})`, res.status);
  return Array.isArray(data?.results) ? data.results : [];
}

export interface LlmResult {
  content: string;
}

export type AgentApiErrorKind = 'network' | 'timeout' | 'http';

export class AgentApiError extends Error {
  readonly name = 'AgentApiError';

  constructor(
    readonly kind: AgentApiErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export function isAgentApiError(error: unknown): error is AgentApiError {
  return error instanceof AgentApiError;
}

export async function llmChat(
  messages: { role: string; content: string }[],
  opts: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
    onDelta?: (chunk: string, accumulated: string) => void;
  } = {}
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

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch('/proxy/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-DB-Token': (window as any).__workspaceDb?.token || '',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model || 'claude-sonnet-5',
        max_tokens: opts.maxTokens ?? 1400,
        thinking: { type: 'disabled' },
        ...(system ? { system } : {}),
        messages: conversation,
        stream: !!opts.onDelta,
      }),
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    const timedOut =
      !!error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError';
    throw new AgentApiError(
      timedOut ? 'timeout' : 'network',
      timedOut ? 'The AI request timed out.' : 'The AI service could not be reached.'
    );
  }

  try {
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new AgentApiError('http', data?.error?.message || `AI request failed (${res.status})`, res.status);
    }

    if (!opts.onDelta) {
      const data = await res.json().catch(() => null);
      if (data?.error) throw new AgentApiError('http', data.error.message || 'AI request failed', res.status);
      return {
        content: (Array.isArray(data?.content) ? data.content : [])
          .filter((block: any) => block?.type === 'text')
          .map((block: any) => String(block.text || ''))
          .join(''),
      };
    }

    if (!res.body) throw new AgentApiError('network', 'The AI streaming response had no body.');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let completed = false;

    const consumeLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const raw = line.slice(5).trim();
      if (!raw) return;
      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        throw new AgentApiError('network', 'The AI stream returned an invalid event.');
      }
      if (event?.type === 'error') {
        throw new AgentApiError('http', event.error?.message || 'AI streaming failed.');
      }
      if (event?.type === 'message_stop') {
        completed = true;
        return;
      }
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const chunk = String(event.delta.text || '');
        if (!chunk) return;
        content += chunk;
        opts.onDelta?.(chunk, content);
      }
    };

    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    for (const line of buffer.split('\n')) consumeLine(line);
    if (!completed) throw new AgentApiError('network', 'The AI stream ended before completion.');
    return { content };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Program status transitions (the single place timestamp rules live)

export function statusPatch(current: ProgramRow, next: ProgramStatus, feedback?: SkipFeedback): Record<string, any> {
  const now = new Date().toISOString();
  if (isBoardStatus(next)) {
    if (isBoardStatus(current.status)) {
      // Re-bucketing within the shortlist: keep shortlisted_at so "Recent programs" stays stable.
      return { status: next };
    }
    return { status: next, shortlisted_at: now, skip_feedback: null };
  }
  if (next === 'skipped') {
    const sf = feedback ?? asObj<SkipFeedback | null>(current.skip_feedback as any, null);
    return {
      status: 'skipped',
      skip_feedback: sf ? JSON.stringify(sf) : null,
      shortlisted_at: null,
    };
  }
  return { status: next };
}

export interface NewProgram {
  university: string;
  program_name: string;
  degree_type?: string;
  program_type?: 'undergrad' | 'masters' | 'apprenticeship';
  country_code?: string;
  country_name?: string;
  company_name?: string;
  eligibility_notes?: string;
  active_status?: 'active' | 'uncertain' | 'inactive';
  last_seen_active?: string;
  location?: string;
  tuition?: string;
  deadline?: string;
  tests?: string;
  gpa?: string;
  duration?: string;
  website?: string;
  summary?: string;
  fit_reasons?: { title: string; detail: string }[];
}

// ---------------------------------------------------------------------------
// Verified program details — append-only cache (newest row per program wins),
// so a program is researched once and the result survives across sessions.

export async function fetchProgramDetails(email: string, programId: number): Promise<ProgramDetails | null> {
  try {
    const { data } = await db('scout_program_details')
      .eq('user_email', email)
      .eq('program_id', programId)
      .orderBy('id', 'desc')
      .limit(1)
      .get();
    const row = Array.isArray(data) && data.length ? data[0] : null;
    const details = row ? asObj<ProgramDetails | null>(row.details_json, null) : null;
    return details && Array.isArray(details.sections) && details.sections.length ? details : null;
  } catch {
    return null;
  }
}

export async function persistProgramDetails(email: string, programId: number, details: ProgramDetails): Promise<void> {
  await db('scout_program_details').insert({ user_email: email, program_id: programId, details_json: details });
}

// ---------------------------------------------------------------------------
// The store hook — one source of truth for all three columns.

export interface ScoutStatePatch {
  intake?: IntakeData;
  brief?: BriefData;
  profile?: ProfileData;
}

export interface ProfileSaveOptions {
  bioAlreadyGenerated?: boolean;
  expectedFactsKey?: string;
}

export interface ProfileSaveReceipt {
  revision: string;
  profile: ProfileData;
}

export type ProfileSummarySection = 'education' | 'work' | 'research' | 'extracurriculars' | 'skills';

export interface ScoutStore {
  email: string;
  displayName: string;
  ready: boolean;
  loadError: string;
  programs: ProgramRow[];
  documents: DocumentRow[];
  messages: MessageRow[];
  intake: IntakeData;
  brief: BriefData;
  profile: ProfileData;
  recommended: ProgramRow[];
  skippedList: ProgramRow[];
  board: Record<BoardStatus, ProgramRow[]>;
  recentPrograms: ProgramRow[];
  invitations: InvitationRow[];
  unreadInvitationCount: number;
  markInvitationsRead: (ids: number[]) => Promise<void>;
  reloadInvitations: () => Promise<void>;
  setStatus: (id: number, next: ProgramStatus, feedback?: SkipFeedback) => Promise<void>;
  updateProgram: (id: number, patch: Record<string, any>) => Promise<void>;
  addPrograms: (items: NewProgram[]) => Promise<number>;
  saveState: (next: ScoutStatePatch) => Promise<void>;
  saveIntake: (next: IntakeData) => Promise<void>;
  saveBrief: (next: BriefData) => Promise<void>;
  hasPersistedMessages: () => Promise<boolean | null>;
  saveProfile: (next: ProfileData, options?: ProfileSaveOptions) => Promise<ProfileSaveReceipt>;
  commitGeneratedBio: (revision: string, bio: string) => Promise<boolean>;
  failGeneratedBio: (revision: string, errorCode: string) => Promise<boolean>;
  commitProfileItemSummary: (
    revision: string,
    section: ProfileSummarySection,
    index: number | null,
    summary: string
  ) => Promise<boolean>;
  addDocument: (doc: {
    name: string;
    kind: 'resume' | 'upload';
    url: string;
    content_type: string;
    size_bytes: number;
    uploaded_via: 'chat' | 'manual' | 'signup';
  }) => Promise<void>;
  markDocumentAsResume: (url: string) => Promise<void>;
  appendLocalMessage: (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => void;
  persistMessage: (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => Promise<void>;
  reloadPrograms: () => Promise<void>;
  reloadMessages: () => Promise<void>;
}

let tempId = -1;

const ts = (v: unknown): number => {
  const t = new Date(String(v || '')).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function useScoutStore(): ScoutStore {
  const identity = useMemo(readSessionIdentity, []);
  // Founder previews may not carry a customer session; fall back to a stable key.
  const email = identity.email || 'preview@scout.local';

  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [intake, setIntake] = useState<IntakeData>(emptyIntake());
  const [brief, setBrief] = useState<BriefData>(emptyBrief());
  const [profile, setProfile] = useState<ProfileData>(emptyProfile(identity.name));
  const [invitationRows, setInvitationRows] = useState<InvitationRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const programsRef = useRef(programs);
  programsRef.current = programs;
  // Persistence is append-only: every save INSERTS a full-state snapshot row
  // and loads read the newest one. In-place row updates are never relied on
  // for correctness — they proved to silently stop persisting across sessions
  // (a user's scout_user_state row stopped accepting writes after the session
  // that created it ended, losing answers/brief/resume), while inserts always
  // land. `latest` is kept in sync synchronously so each snapshot is complete.
  const latest = useRef({ intake: emptyIntake(), brief: emptyBrief(), profile: emptyProfile(identity.name) });
  const profileRevisionRef = useRef(crypto.randomUUID());
  const snapshotDirty = useRef(false);
  const stateWriteQueue = useRef<Promise<any>>(Promise.resolve());
  // Snapshot inserts are forbidden until the canonical DB state has actually
  // been READ once: a save issued while `latest` still holds boot-time empty
  // state would become the newest snapshot and wipe the account (append-only
  // model — newest row wins).
  const stateLoadedRef = useRef(false);
  // Program status events are immutable between writes. Cache the initial read
  // so chat renders and message sends can refresh programs without repeatedly
  // downloading the same event history.
  const programEventsRef = useRef<any[] | null>(null);
  const programEventsRequestRef = useRef<Promise<any[]> | null>(null);
  // Rows written at or before the user's latest reset are treated as wiped.
  const resetCutoffRef = useRef(0);

  const loadResetCutoff = useCallback(async (): Promise<number> => {
    let cutoff = 0;
    try {
      const { data } = await db('scout_resets').eq('user_email', email).orderBy('id', 'desc').limit(1).get();
      const row = Array.isArray(data) && data.length ? data[0] : null;
      cutoff = row ? ts(row.reset_at) || ts(row.created_at) : 0;
    } catch {
      cutoff = 0;
    }
    resetCutoffRef.current = cutoff;
    return cutoff;
  }, [email]);

  const afterReset = useCallback(<T extends { created_at?: string }>(rows: T[], cutoff = resetCutoffRef.current): T[] => {
    if (!cutoff) return rows;
    return rows.filter((r) => ts(r.created_at) > cutoff);
  }, []);

  const loadProgramEvents = useCallback((force = false): Promise<any[]> => {
    if (!force && programEventsRef.current !== null) {
      return Promise.resolve(programEventsRef.current);
    }
    if (!force && programEventsRequestRef.current) {
      return programEventsRequestRef.current;
    }

    let request: Promise<any[]>;
    request = db('scout_program_events')
      .eq('user_email', email)
      .orderBy('id', 'asc')
      .limit(1000)
      .get()
      .then(({ data }: any) => {
        const rows = Array.isArray(data) ? data : [];
        programEventsRef.current = rows;
        return rows;
      })
      // Do not cache a failed request as an authoritative empty history.
      .catch(() => [])
      .finally(() => {
        if (programEventsRequestRef.current === request) {
          programEventsRequestRef.current = null;
        }
      });
    programEventsRequestRef.current = request;
    return request;
  }, [email]);

  const reloadPrograms = useCallback(async (resetReady?: Promise<number>, refreshEvents = false) => {
    const [progRes, events, cutoff] = await Promise.all([
      db('scout_programs').eq('user_email', email).orderBy('updated_at', 'desc').limit(300).get(),
      loadProgramEvents(refreshEvents),
      resetReady ?? Promise.resolve(resetCutoffRef.current),
    ]);
    const rows = afterReset(Array.isArray(progRes.data) ? (progRes.data as ProgramRow[]) : [], cutoff);
    // Overlay durable status events (oldest → newest) onto the base rows.
    const byId = new Map<number, ProgramRow>(rows.map((r) => [r.id, r]));
    for (const ev of events) {
      const target = byId.get(Number(ev.program_id));
      const patch = asObj<Record<string, any> | null>(ev.patch_json, null);
      if (target && patch && typeof patch === 'object') Object.assign(target, patch);
    }
    setPrograms(rows);
  }, [email, afterReset, loadProgramEvents]);

  const reloadDocuments = useCallback(async (resetReady?: Promise<number>) => {
    const [{ data }, cutoff] = await Promise.all([
      db('scout_documents').eq('user_email', email).orderBy('created_at', 'desc').limit(100).get(),
      resetReady ?? Promise.resolve(resetCutoffRef.current),
    ]);
    // Same-kind uploads supersede: only the newest document per category is
    // live (a re-uploaded resume replaces the old one; a GMAT report and a
    // resume coexist). Older versions stay in the table as history only.
    setDocuments(dedupeDocumentsByCategory(afterReset(Array.isArray(data) ? data : [], cutoff)));
  }, [email, afterReset]);

  const reloadMessages = useCallback(async (resetReady?: Promise<number>) => {
    const [{ data }, cutoff] = await Promise.all([
      db('scout_messages').eq('user_email', email).orderBy('created_at', 'desc').limit(200).get(),
      resetReady ?? Promise.resolve(resetCutoffRef.current),
    ]);
    const rows = afterReset(Array.isArray(data) ? data : [], cutoff).reverse();
    // Sessions that raced the history load once persisted duplicate intro
    // greetings; keep only the oldest so old accounts render (and prompt the
    // agent with) a clean transcript.
    let greetingSeen = false;
    const cleaned = rows.filter((row) => {
      if (row.role === 'assistant' && /^Hi\b[^\n]*I'm Scout — I help you discover/.test(row.content || '')) {
        if (greetingSeen) return false;
        greetingSeen = true;
      }
      return true;
    });
    setMessages(cleaned);
  }, [email, afterReset]);

  // Authoritative "does this account have chat history?" check for greeting
  // logic: the in-memory list can be transiently empty while loads settle, so
  // the greeting must confirm emptiness against the database itself. Returns
  // null when the check fails — callers must treat that as "unknown", not "no".
  const hasPersistedMessages = useCallback(async (): Promise<boolean | null> => {
    try {
      const { data } = await db('scout_messages').eq('user_email', email).orderBy('created_at', 'desc').limit(5).get();
      return afterReset(Array.isArray(data) ? data : []).length > 0;
    } catch {
      return null;
    }
  }, [email, afterReset]);

  // Invitations pushed by universities from Alma ("Request to apply") land in
  // scout_application_requests keyed by the student's email. They are messages
  // FROM universities, so a student data-reset does not hide them.
  const reloadInvitations = useCallback(async () => {
    try {
      const { data } = await db('scout_application_requests')
        .eq('student_email', email.toLowerCase())
        .orderBy('id', 'desc')
        .limit(100)
        .get();
      setInvitationRows(Array.isArray(data) ? (data as InvitationRow[]) : []);
    } catch {
      setInvitationRows([]);
    }
  }, [email]);

  const applyState = useCallback((nextIntake: IntakeData, nextBrief: BriefData, nextProfile: ProfileData) => {
    latest.current = { intake: nextIntake, brief: nextBrief, profile: nextProfile };
    profileRevisionRef.current = nextProfile.bioGeneration?.revision || crypto.randomUUID();
    setIntake(nextIntake);
    setBrief(nextBrief);
    setProfile(nextProfile);
  }, []);

  const reloadState = useCallback(async (resetReady?: Promise<number>) => {
    // Fetch both stores immediately. Snapshots remain authoritative when both
    // contain a valid row; the legacy store is only a read-only fallback.
    const [snapshotResult, legacyResult, cutoff] = await Promise.all([
      db('scout_state_snapshots')
        .eq('user_email', email)
        .orderBy('id', 'desc')
        .limit(1)
        .get()
        .then(({ data }: any) => ({ data, error: null }))
        .catch((error: unknown) => ({ data: [], error })),
      db('scout_user_state')
        .eq('user_email', email)
        .orderBy('updated_at', 'desc')
        .limit(1)
        .get()
        .then(({ data }: any) => ({ data, error: null }))
        .catch((error: unknown) => ({ data: [], error })),
      resetReady ?? Promise.resolve(resetCutoffRef.current),
    ]);
    const snap = Array.isArray(snapshotResult.data) && snapshotResult.data.length ? snapshotResult.data[0] : null;
    const legacy = Array.isArray(legacyResult.data) && legacyResult.data.length ? legacyResult.data[0] : null;
    const validSnapshot = snap && (!cutoff || ts(snap.created_at) > cutoff) ? snap : null;
    const validLegacy =
      legacy && (!cutoff || Math.max(ts(legacy.updated_at), ts(legacy.created_at)) > cutoff) ? legacy : null;
    const row = validSnapshot || validLegacy;
    if (!row && (snapshotResult.error || legacyResult.error)) {
      throw snapshotResult.error || legacyResult.error;
    }
    if (!row) {
      applyState(emptyIntake(), emptyBrief(), emptyProfile(identity.name));
      stateLoadedRef.current = true; // genuinely fresh account — writes allowed
      return;
    }
    const nextIntake = asObj<IntakeData>(row.intake_json, emptyIntake());
    if (!nextIntake.answers || typeof nextIntake.answers !== 'object') nextIntake.answers = {};
    const prof = asObj<ProfileData | null>(row.profile_json, null);
    applyState(
      normalizeIntakeEligibility(nextIntake),
      normalizeBrief(asObj<any>(row.brief_json, null)),
      prof && typeof prof === 'object' ? { ...emptyProfile(identity.name), ...prof } : emptyProfile(identity.name)
    );
    stateLoadedRef.current = true;
  }, [email, identity.name, applyState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resetReady = loadResetCutoff();
        await Promise.all([
          resetReady,
          reloadPrograms(resetReady),
          reloadDocuments(resetReady),
          reloadMessages(resetReady),
          reloadState(resetReady),
          reloadInvitations(),
        ]);
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
  }, [loadResetCutoff, reloadPrograms, reloadDocuments, reloadMessages, reloadState, reloadInvitations]);

  // Serialize snapshot writes so rapid successive saves can't interleave; the
  // dirty flag coalesces back-to-back saves into one insert of the same state.
  const writeSnapshot = useCallback(() => {
    // Never persist state that was never loaded — an "empty" snapshot written
    // before/instead of the real load would clobber the account's answers.
    if (!stateLoadedRef.current) return Promise.resolve();
    snapshotDirty.current = true;
    const run = async () => {
      if (!snapshotDirty.current) return;
      snapshotDirty.current = false;
      try {
        await db('scout_state_snapshots').insert({
          user_email: email,
          intake_json: latest.current.intake,
          brief_json: latest.current.brief,
          profile_json: latest.current.profile,
          source: 'app',
        });
        const normalized = normalizeIntakeEligibility(latest.current.intake);
        await analyticsDb('inbox_student_profile_snapshots').insert({
          student_id: email,
          intake_json: normalized,
          profile_json: latest.current.profile,
          citizenship_countries: normalized.citizenshipCountries || [],
          international_only: !!normalized.internationalOnly,
          programme_interests: normalized.programmeInterests || [],
          apprenticeship_opt_in: !!normalized.apprenticeshipOptIn,
          apprenticeship_eligible_countries: normalized.apprenticeshipEligibleCountries || [],
          academic_level: normalized.programLevel || normalized.answers.level || null,
          subject_interests: String(normalized.answers.majors || '')
            .split(/[,;|]/)
            .map((value) => value.trim())
            .filter(Boolean),
          last_active: new Date().toISOString(),
          source: 'scout',
        });
      } catch (err) {
        snapshotDirty.current = true; // the next save retries this state
        throw err;
      }
    };
    const next = stateWriteQueue.current.then(run, run);
    stateWriteQueue.current = next;
    return next;
  }, [email]);

  const applyProfileSave = useCallback(
    (next: ProfileData, options?: ProfileSaveOptions): ProfileSaveReceipt => {
      const current = latest.current.profile;
      if (options?.expectedFactsKey && profileFactsKey(current) !== options.expectedFactsKey) {
        throw new Error('stale_profile_revision');
      }
      const factsChanged = profileFactsKey(next) !== profileFactsKey(current);
      let revision = current.bioGeneration?.revision || profileRevisionRef.current;
      let prepared: ProfileData;

      if (options?.bioAlreadyGenerated) {
        revision = crypto.randomUUID();
        prepared = {
          ...next,
          bioGeneration: {
            revision,
            status: 'ready',
            completedAt: new Date().toISOString(),
          },
        };
      } else if (factsChanged) {
        revision = crypto.randomUUID();
        prepared = profileHasBioFacts(next)
          ? {
              ...next,
              bio: '',
              bioGeneration: {
                revision,
                status: 'pending',
                attemptedAt: new Date().toISOString(),
              },
            }
          : {
              ...next,
              bio: '',
              bioGeneration: {
                revision,
                status: 'ready',
                completedAt: new Date().toISOString(),
              },
            };
      } else {
        // A derived or operational save must never restore an older Bio or its
        // status from a stale caller snapshot.
        prepared = {
          ...next,
          bio: current.bio,
          bioGeneration: current.bioGeneration,
        };
      }

      profileRevisionRef.current = revision;
      latest.current.profile = prepared;
      setProfile(prepared);
      return { revision, profile: prepared };
    },
    []
  );

  const saveState = useCallback(
    async (next: ScoutStatePatch) => {
      if (!next.intake && !next.brief && !next.profile) return;

      if (next.intake) {
        // Callers (agent turns) may hold a stale intake copy; invitation read
        // receipts recorded meanwhile must never be un-read by their save.
        const readIds = Array.from(
          new Set(
            [...(latest.current.intake.readInvitationIds || []), ...(next.intake.readInvitationIds || [])].map(Number)
          )
        );
        const withCompleted: IntakeData = normalizeIntakeEligibility({
          ...next.intake,
          ...(readIds.length ? { readInvitationIds: readIds } : {}),
          completed: intakeCompleted(next.intake),
        });
        latest.current.intake = withCompleted;
        setIntake(withCompleted);
      }

      if (next.brief) {
        // Every write path (agent actions, answer reconciliation, manual chip
        // edits) goes through here, so dedupe/cleanup happens exactly once.
        const stamped = { ...sanitizeBrief(next.brief), updatedAt: new Date().toISOString() };
        latest.current.brief = stamped;
        setBrief(stamped);
      }

      if (next.profile) {
        // saveState's current profile caller is deterministic intake capture,
        // which owns only visibility and lookingFor. Rebase those fields onto
        // the latest facts so an older agent turn cannot restore stale arrays.
        applyProfileSave({
          ...latest.current.profile,
          visible: next.profile.visible,
          lookingFor: next.profile.lookingFor,
        });
      }

      // All supplied mutations are now reflected in `latest`, so this insert
      // persists one complete snapshot regardless of how many slices changed.
      await writeSnapshot();
    },
    [applyProfileSave, writeSnapshot]
  );

  const saveIntake = useCallback(
    async (next: IntakeData) => {
      await saveState({ intake: next });
    },
    [saveState]
  );

  const saveBrief = useCallback(
    async (next: BriefData) => {
      await saveState({ brief: next });
    },
    [saveState]
  );

  const saveProfile = useCallback(
    async (next: ProfileData, options?: ProfileSaveOptions): Promise<ProfileSaveReceipt> => {
      const receipt = applyProfileSave(next, options);
      await writeSnapshot();
      return receipt;
    },
    [applyProfileSave, writeSnapshot]
  );

  const commitGeneratedBio = useCallback(
    async (revision: string, bio: string): Promise<boolean> => {
      const value = bio.trim().slice(0, 1200);
      const current = latest.current.profile;
      if (!value) throw new Error('Cannot commit an empty generated Bio.');
      if (profileRevisionRef.current !== revision || current.bioGeneration?.revision !== revision) return false;
      if (current.bioGeneration.status !== 'pending') return false;

      const next: ProfileData = {
        ...current,
        bio: value,
        bioGeneration: {
          revision,
          status: 'ready',
          completedAt: new Date().toISOString(),
        },
      };
      latest.current.profile = next;
      setProfile(next);
      await writeSnapshot();
      return true;
    },
    [writeSnapshot]
  );

  const failGeneratedBio = useCallback(
    async (revision: string, errorCode: string): Promise<boolean> => {
      const current = latest.current.profile;
      if (profileRevisionRef.current !== revision || current.bioGeneration?.revision !== revision) return false;
      if (current.bioGeneration.status !== 'pending') return false;

      const next: ProfileData = {
        ...current,
        bio: '',
        bioGeneration: {
          revision,
          status: 'failed',
          attemptedAt: current.bioGeneration.attemptedAt,
          completedAt: new Date().toISOString(),
          errorCode: errorCode.slice(0, 80),
        },
      };
      latest.current.profile = next;
      setProfile(next);
      await writeSnapshot();
      return true;
    },
    [writeSnapshot]
  );

  const commitProfileItemSummary = useCallback(
    async (
      revision: string,
      section: ProfileSummarySection,
      index: number | null,
      summary: string
    ): Promise<boolean> => {
      const value = summary.trim().slice(0, 400);
      if (!value || profileRevisionRef.current !== revision) return false;
      const current = latest.current.profile;
      let next: ProfileData;

      if (section === 'skills') {
        next = { ...current, skillsSummary: value };
      } else {
        if (index == null || !current[section][index]) return false;
        const items = current[section].map((item, itemIndex) =>
          itemIndex === index ? { ...item, aiSummary: value } : item
        );
        next = { ...current, [section]: items } as ProfileData;
      }

      latest.current.profile = next;
      setProfile(next);
      await writeSnapshot();
      return true;
    },
    [writeSnapshot]
  );

  const setStatus = useCallback(
    async (id: number, next: ProgramStatus, feedback?: SkipFeedback) => {
      const current = programsRef.current.find((p) => p.id === id);
      if (!current || current.status === next) return;
      const patch = statusPatch(current, next, feedback);
      let eventWritten = false;
      // Optimistic: the carousel/board advance immediately; the reload trues things up.
      setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      try {
        // The event insert is what makes the change durable; the direct row
        // update is best-effort so the base table stays readable on its own.
        await db('scout_program_events').insert({ user_email: email, program_id: id, patch_json: patch });
        const programKey = current.website || `${current.university}:${current.program_name}`.toLowerCase();
        await analyticsDb('inbox_student_program_interactions').insert({
          student_id: email,
          program_key: programKey,
          program_id: id,
          program_name: current.program_name,
          interaction_type: next,
          program_type: current.program_type || null,
          country_code: current.country_code || null,
          metadata_json: { patch, feedback: feedback || null, institution: current.university },
          occurred_at: new Date().toISOString(),
        });
        eventWritten = true;
        db('scout_programs')
          .update(id, patch)
          .catch(() => undefined);
      } finally {
        // Refresh event history only when the durable insert succeeded.
        reloadPrograms(undefined, eventWritten).catch(() => undefined);
      }
    },
    [email, reloadPrograms]
  );

  const updateProgram = useCallback(
    async (id: number, patch: Record<string, any>) => {
      if (!patch || !Object.keys(patch).length) return;
      let eventWritten = false;
      setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      try {
        await db('scout_program_events').insert({ user_email: email, program_id: id, patch_json: patch });
        eventWritten = true;
        db('scout_programs')
          .update(id, patch)
          .catch(() => undefined);
      } finally {
        // Refresh event history only when the durable insert succeeded.
        reloadPrograms(undefined, eventWritten).catch(() => undefined);
      }
    },
    [email, reloadPrograms]
  );

  const addPrograms = useCallback(
    async (items: NewProgram[]) => {
      if (!items.length) return 0;
      const base = Date.now();
      const rows = items.map((item, i) => ({
        user_email: email,
        university: item.university,
        program_name: item.program_name,
        degree_type: item.degree_type || null,
        location: item.location || null,
        tuition: item.tuition || null,
        deadline: item.deadline || null,
        tests: item.tests || null,
        gpa: item.gpa || null,
        duration: item.duration || null,
        website: item.website || null,
        summary: item.summary || null,
        program_type: item.program_type || (latest.current.intake.programLevel === 'graduate' ? 'masters' : 'undergrad'),
        country_code: item.country_code || null,
        country_name: item.country_name || null,
        company_name: item.company_name || null,
        eligibility_notes: item.eligibility_notes || null,
        active_status: item.active_status || 'active',
        last_seen_active: item.last_seen_active || new Date().toISOString(),
        fit_reasons: JSON.stringify(item.fit_reasons || []),
        status: 'recommended',
        // Stagger stamps so reverse-chron keeps the AI's fit order within a batch.
        recommended_at: new Date(base - i * 1000).toISOString(),
      }));
      await db('scout_programs').bulkInsert(rows);
      await Promise.all(
        rows.map(async (row) => {
          const programKey = row.website || `${row.university}:${row.program_name}`.toLowerCase();
          await Promise.all([
            analyticsDb('inbox_program_catalog_events').insert({
              student_id: email,
              program_key: programKey,
              institution_name: row.program_type === 'apprenticeship' ? null : row.university,
              company_name: row.company_name || (row.program_type === 'apprenticeship' ? row.university : null),
              program_name: row.program_name,
              program_type: row.program_type,
              country_code: row.country_code,
              country_name: row.country_name,
              eligibility_notes: row.eligibility_notes,
              source_url: row.website,
              active_status: row.active_status,
              first_discovered: row.recommended_at,
              last_seen_active: row.last_seen_active,
              programme_json: row,
            }),
            analyticsDb('inbox_student_program_interactions').insert({
              student_id: email,
              program_key: programKey,
              program_id: null,
              program_name: row.program_name,
              interaction_type: 'recommended',
              program_type: row.program_type,
              country_code: row.country_code,
              metadata_json: { institution: row.university, source_url: row.website },
              occurred_at: row.recommended_at,
            }),
          ]);
        })
      );
      await reloadPrograms();
      return rows.length;
    },
    [email, reloadPrograms]
  );

  const addDocument = useCallback(
    async (doc: {
      name: string;
      kind: 'resume' | 'upload';
      url: string;
      content_type: string;
      size_bytes: number;
      uploaded_via: 'chat' | 'manual' | 'signup';
    }) => {
      await db('scout_documents').insert({
        user_email: email,
        name: doc.name,
        kind: doc.kind,
        url: doc.url,
        content_type: doc.content_type,
        size_bytes: doc.size_bytes,
        uploaded_via: doc.uploaded_via,
      });
      await reloadDocuments();
    },
    [email, reloadDocuments]
  );

  const markDocumentAsResume = useCallback(
    async (url: string) => {
      const { data } = await db('scout_documents').eq('user_email', email).eq('url', url).limit(1).get();
      const row = Array.isArray(data) && data.length ? data[0] : null;
      if (row && row.kind !== 'resume') {
        await db('scout_documents').update(row.id, { kind: 'resume' });
        await reloadDocuments();
      }
    },
    [email, reloadDocuments]
  );

  const appendLocalMessage = useCallback(
    (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: tempId--,
          user_email: email,
          role: m.role,
          content: m.content,
          attachments: m.attachments || [],
          actions: m.actions || [],
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [email]
  );

  const persistMessage = useCallback(
    async (m: Pick<MessageRow, 'role' | 'content'> & { attachments?: MessageAttachment[]; actions?: string[] }) => {
      const pendingField = m.role === 'user' ? nextIntakeQuestion(latest.current.intake)?.id || null : null;
      await Promise.all([
        db('scout_messages').insert({
          user_email: email,
          role: m.role,
          content: m.content,
          attachments: JSON.stringify(m.attachments || []),
          actions: JSON.stringify(m.actions || []),
        }),
        analyticsDb('inbox_student_interactions').insert({
          student_id: email,
          event_type: m.role === 'user' ? 'conversation_answer' : 'assistant_reply',
          field_name: pendingField,
          answer_text: m.content,
          metadata_json: { attachments: m.attachments || [], actions: m.actions || [] },
          occurred_at: new Date().toISOString(),
        }),
      ]);
    },
    [email]
  );

  // Read state overlays the durable snapshot list onto the raw rows (rows the
  // direct status update reached are honored too).
  const invitations = useMemo(() => {
    const readIds = new Set((intake.readInvitationIds || []).map(Number));
    return invitationRows.map((row) =>
      readIds.has(Number(row.id)) && row.status !== 'read' ? { ...row, status: 'read' } : row
    );
  }, [invitationRows, intake]);

  const unreadInvitationCount = useMemo(
    () => invitations.filter((i) => i.status !== 'read').length,
    [invitations]
  );

  const markInvitationsRead = useCallback(
    async (ids: number[]) => {
      const current = new Set((latest.current.intake.readInvitationIds || []).map(Number));
      const fresh = ids.map(Number).filter((id) => Number.isFinite(id) && !current.has(id));
      if (!fresh.length) return;
      fresh.forEach((id) => current.add(id));
      const nextIntake: IntakeData = { ...latest.current.intake, readInvitationIds: [...current] };
      latest.current.intake = nextIntake;
      setIntake(nextIntake);
      await writeSnapshot();
      // Direct row updates are best-effort; the snapshot above is what makes
      // the read state durable.
      for (const id of fresh) {
        db('scout_application_requests')
          .update(id, { status: 'read' })
          .catch(() => undefined);
      }
    },
    [writeSnapshot]
  );

  const recommended = useMemo(
    () =>
      programs
        .filter((p) => p.status === 'recommended')
        .sort((a, b) => (b.recommended_at || b.created_at || '').localeCompare(a.recommended_at || a.created_at || '')),
    [programs]
  );

  const skippedList = useMemo(
    () => programs.filter((p) => p.status === 'skipped').sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    [programs]
  );

  const board = useMemo(() => {
    const cols = { saved: [], safe: [], target: [], dream: [] } as Record<BoardStatus, ProgramRow[]>;
    for (const p of programs) {
      if (isBoardStatus(p.status)) cols[p.status].push(p);
    }
    for (const key of BOARD_STATUSES) {
      cols[key].sort((a, b) => (b.shortlisted_at || b.updated_at || '').localeCompare(a.shortlisted_at || a.updated_at || ''));
    }
    return cols;
  }, [programs]);

  const recentPrograms = useMemo(
    () =>
      programs
        .filter((p) => isBoardStatus(p.status))
        .sort((a, b) => (b.shortlisted_at || '').localeCompare(a.shortlisted_at || ''))
        .slice(0, 5),
    [programs]
  );

  const displayName = toTitleCaseName(
    profile.name?.trim() || identity.name || (identity.email ? identity.email.split('@')[0] : 'Student')
  );

  return {
    email,
    displayName,
    ready,
    loadError,
    programs,
    documents,
    messages,
    intake,
    brief,
    profile,
    recommended,
    skippedList,
    board,
    recentPrograms,
    invitations,
    unreadInvitationCount,
    markInvitationsRead,
    reloadInvitations,
    setStatus,
    updateProgram,
    addPrograms,
    saveState,
    saveIntake,
    saveBrief,
    saveProfile,
    commitGeneratedBio,
    failGeneratedBio,
    commitProfileItemSummary,
    addDocument,
    markDocumentAsResume,
    appendLocalMessage,
    persistMessage,
    reloadPrograms,
    reloadMessages,
    hasPersistedMessages,
  };
}

// ---------------------------------------------------------------------------
// Shared context (store + UI controls), provided by App.tsx

export interface ScoutUiControls {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  navCollapsed: boolean;
  setNavCollapsed: (v: boolean) => void;
  modalProgramId: number | null;
  setModalProgramId: (id: number | null) => void;
  openProgramModal: (id: number) => void;
  signOut: () => void;
  isMobile: boolean;
}

export type ScoutContextValue = ScoutStore & ScoutUiControls;

export const ScoutContext = createContext<ScoutContextValue | null>(null);

export function useScout(): ScoutContextValue {
  const ctx = useContext(ScoutContext);
  if (!ctx) throw new Error('useScout must be used within ScoutContext');
  return ctx;
}

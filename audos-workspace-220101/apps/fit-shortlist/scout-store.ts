// Scout — data store: identity, WorkspaceDB persistence, and the shared app context.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_STATUSES,
  BoardStatus,
  BriefData,
  DocumentRow,
  IntakeData,
  MessageAttachment,
  MessageRow,
  ProfileData,
  ProgramRow,
  ProgramStatus,
  SkipFeedback,
  TabId,
  asObj,
  emptyBrief,
  emptyIntake,
  emptyProfile,
  intakeCompleted,
  isBoardStatus,
  normalizeBrief,
} from './scout-types';

// All reads/writes bypass session scoping and key on user_email instead, so the
// student's data survives logout/login (session ids change; the email does not).
export function db(table: string) {
  return (window as any).__workspaceDb.from(table, { shared: true });
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

async function documentUrlForAnalysis(documentUrl: string, sourceFile?: File): Promise<string> {
  if (sourceFile) return fileToDataUrl(sourceFile);
  if (!/^https?:\/\//i.test(documentUrl) || !/\.pdf(?:$|[?#])/i.test(documentUrl)) return documentUrl;
  const res = await fetch(documentUrl);
  if (!res.ok) throw new Error('Could not fetch PDF for analysis');
  return blobToDataUrl(await res.blob());
}

export async function analyzeDocument(documentUrl: string, analysisPrompt: string, sourceFile?: File): Promise<string> {
  const analyzerUrl = await documentUrlForAnalysis(documentUrl, sourceFile);
  const res = await fetch('/api/analyze-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || '' },
    body: JSON.stringify({ documentUrl: analyzerUrl, analysisPrompt, documentType: 'pdf' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.analysis) throw new Error(data?.error || 'Document analysis failed');
  return String(data.analysis);
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
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model || 'gpt-4o-mini',
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1400,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const data = await res.json();
  return { content: String(data?.choices?.[0]?.message?.content || '') };
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
// The store hook — one source of truth for all three columns.

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
  setStatus: (id: number, next: ProgramStatus, feedback?: SkipFeedback) => Promise<void>;
  addPrograms: (items: NewProgram[]) => Promise<number>;
  saveIntake: (next: IntakeData) => Promise<void>;
  saveBrief: (next: BriefData) => Promise<void>;
  saveProfile: (next: ProfileData) => Promise<void>;
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

export function useScoutStore(): ScoutStore {
  const identity = useMemo(readSessionIdentity, []);
  // Founder previews may not carry a customer session; fall back to a stable key.
  const email = identity.email || 'preview@scout.local';

  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [stateRowId, setStateRowId] = useState<number | null>(null);
  const [intake, setIntake] = useState<IntakeData>(emptyIntake());
  const [brief, setBrief] = useState<BriefData>(emptyBrief());
  const [profile, setProfile] = useState<ProfileData>(emptyProfile(identity.name));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const programsRef = useRef(programs);
  programsRef.current = programs;
  const stateRowIdRef = useRef<number | null>(null);
  const ensuringState = useRef(false);
  const stateWriteQueue = useRef<Promise<any>>(Promise.resolve());

  const reloadPrograms = useCallback(async () => {
    const { data } = await db('scout_programs').eq('user_email', email).orderBy('updated_at', 'desc').limit(300).get();
    setPrograms(Array.isArray(data) ? data : []);
  }, [email]);

  const reloadDocuments = useCallback(async () => {
    const { data } = await db('scout_documents').eq('user_email', email).orderBy('created_at', 'desc').limit(100).get();
    setDocuments(Array.isArray(data) ? data : []);
  }, [email]);

  const reloadMessages = useCallback(async () => {
    const { data } = await db('scout_messages').eq('user_email', email).orderBy('created_at', 'desc').limit(200).get();
    const rows = Array.isArray(data) ? [...data].reverse() : [];
    setMessages(rows);
  }, [email]);

  const applyStateRow = useCallback(
    (row: any | null) => {
      if (!row) return;
      setStateRowId(row.id);
      stateRowIdRef.current = row.id;
      const nextIntake = asObj<IntakeData>(row.intake_json, emptyIntake());
      if (!nextIntake.answers || typeof nextIntake.answers !== 'object') nextIntake.answers = {};
      setIntake(nextIntake);
      setBrief(normalizeBrief(asObj<any>(row.brief_json, null)));
      const prof = asObj<ProfileData | null>(row.profile_json, null);
      setProfile(prof && typeof prof === 'object' ? { ...emptyProfile(identity.name), ...prof } : emptyProfile(identity.name));
    },
    [identity.name]
  );

  const reloadState = useCallback(async () => {
    const { data } = await db('scout_user_state').eq('user_email', email).limit(1).get();
    const row = Array.isArray(data) && data.length ? data[0] : null;
    if (row) {
      applyStateRow(row);
    } else if (!ensuringState.current) {
      ensuringState.current = true;
      try {
        await db('scout_user_state').insert({
          user_email: email,
          intake_json: emptyIntake(),
          brief_json: emptyBrief(),
          profile_json: emptyProfile(identity.name),
        });
        const retry = await db('scout_user_state').eq('user_email', email).limit(1).get();
        if (Array.isArray(retry.data) && retry.data.length) applyStateRow(retry.data[0]);
      } catch {
        // A concurrent tab may have inserted first; re-read below on next reload.
      }
    }
  }, [email, identity.name, applyStateRow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([reloadPrograms(), reloadDocuments(), reloadMessages(), reloadState()]);
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
  }, [reloadPrograms, reloadDocuments, reloadMessages, reloadState]);

  // Serialize scout_user_state writes so rapid successive saves can't interleave.
  const writeState = useCallback(
    (patch: Record<string, any>) => {
      const run = async () => {
        if (stateRowIdRef.current == null) await reloadState();
        if (stateRowIdRef.current == null) return;
        await db('scout_user_state').update(stateRowIdRef.current, patch);
      };
      const next = stateWriteQueue.current.then(run, run);
      stateWriteQueue.current = next;
      return next;
    },
    [reloadState]
  );

  const saveIntake = useCallback(
    async (next: IntakeData) => {
      const withCompleted = { ...next, completed: intakeCompleted(next) };
      setIntake(withCompleted);
      await writeState({ intake_json: withCompleted });
    },
    [writeState]
  );

  const saveBrief = useCallback(
    async (next: BriefData) => {
      const stamped = { ...next, updatedAt: new Date().toISOString() };
      setBrief(stamped);
      await writeState({ brief_json: stamped });
    },
    [writeState]
  );

  const saveProfile = useCallback(
    async (next: ProfileData) => {
      setProfile(next);
      await writeState({ profile_json: next });
    },
    [writeState]
  );

  const setStatus = useCallback(
    async (id: number, next: ProgramStatus, feedback?: SkipFeedback) => {
      const current = programsRef.current.find((p) => p.id === id);
      if (!current || current.status === next) return;
      const patch = statusPatch(current, next, feedback);
      // Optimistic: the carousel/board advance immediately; the reload trues things up.
      setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      try {
        await db('scout_programs').update(id, patch);
      } finally {
        reloadPrograms().catch(() => undefined);
      }
    },
    [reloadPrograms]
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
        fit_reasons: JSON.stringify(item.fit_reasons || []),
        status: 'recommended',
        // Stagger stamps so reverse-chron keeps the AI's fit order within a batch.
        recommended_at: new Date(base - i * 1000).toISOString(),
      }));
      await db('scout_programs').bulkInsert(rows);
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
      await db('scout_messages').insert({
        user_email: email,
        role: m.role,
        content: m.content,
        attachments: JSON.stringify(m.attachments || []),
        actions: JSON.stringify(m.actions || []),
      });
    },
    [email]
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

  const displayName = profile.name?.trim() || identity.name || (identity.email ? identity.email.split('@')[0] : 'Student');

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
    setStatus,
    addPrograms,
    saveIntake,
    saveBrief,
    saveProfile,
    addDocument,
    markDocumentAsResume,
    appendLocalMessage,
    persistMessage,
    reloadPrograms,
    reloadMessages,
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

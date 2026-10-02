// Alma — middle column: the agentic AI chat interface (Jill-style).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Send,
  X,
} from 'lucide-react';
import ReactMarkdown from 'https://esm.sh/react-markdown@9.0.1?external=react';
import type { Components } from 'https://esm.sh/react-markdown@9.0.1?external=react';
import remarkGfm from 'https://esm.sh/remark-gfm@4.0.0';
import { cn, typography } from '../../lib/colors';
import { AgentDeps, parseBrochurePdf, runAgentTurn, runStartupMaintenance } from './alma-agent';
import { uploadFile, useAlma } from './alma-store';
import {
  MessageAttachment,
  MessageRow,
  asArr,
  dayLabel,
  isPdfFile,
  isTextFile,
  nextIntakeQuestion,
} from './alma-types';

const MAX_FILES = 5;

// Hardened URL handling mirrored from the workspace chat presentation layer.
const SAFE_PROTOCOLS = /^(https?|mailto|tel):/i;
const markdownUrlTransform = (value: string): string => {
  if (typeof value === 'string' && SAFE_PROTOCOLS.test(value)) return value;
  const colon = value.indexOf(':');
  const slash = value.indexOf('/');
  const question = value.indexOf('?');
  const hash = value.indexOf('#');
  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (question !== -1 && colon > question) ||
    (hash !== -1 && colon > hash)
  ) {
    return value;
  }
  return '';
};

const markdownComponents: Components = {
  p({ node: _node, children, ...props }) {
    return (
      <p className="my-2 leading-relaxed" {...props}>
        {children}
      </p>
    );
  },
  ul({ node: _node, children, ...props }) {
    return (
      <ul className="my-2 pl-5 space-y-1" style={{ listStyleType: 'disc', listStylePosition: 'outside' }} {...props}>
        {children}
      </ul>
    );
  },
  ol({ node: _node, children, ...props }) {
    return (
      <ol className="my-2 pl-5 space-y-1" style={{ listStyleType: 'decimal', listStylePosition: 'outside' }} {...props}>
        {children}
      </ol>
    );
  },
  li({ node: _node, children, ...props }) {
    return (
      <li style={{ display: 'list-item' }} {...props}>
        {children}
      </li>
    );
  },
  strong({ node: _node, children, ...props }) {
    return (
      <strong className="font-semibold" {...props}>
        {children}
      </strong>
    );
  },
  code({ node: _node, children, className, ...props }) {
    return (
      <code className="bg-[var(--space-surface-muted)] px-1.5 py-0.5 rounded text-[13px] break-all" {...props}>
        {children}
      </code>
    );
  },
  a({ node: _node, href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--space-brand-primary-700)] underline break-all">
        {children}
      </a>
    );
  },
};

function ActionLines({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  if (lines.length <= 2) {
    return (
      <div className="space-y-1 mb-2">
        {lines.map((line, i) => (
          <div key={i} className={`flex items-start gap-1.5 text-[13px] ${typography.color.muted}`}>
            <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{line}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-[13px] hover:text-[var(--space-text-secondary)] transition-colors ${typography.color.muted}`}
      >
        Performed {lines.length} actions
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="space-y-1 mt-1.5">
          {lines.map((line, i) => (
            <div key={i} className={`flex items-start gap-1.5 text-[13px] ${typography.color.muted}`}>
              <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentChips({ attachments }: { attachments: MessageAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
      {attachments.map((a, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-xs text-[var(--space-text-secondary)]"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="max-w-[180px] truncate">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

function MessageBlock({ message }: { message: MessageRow }) {
  const attachments = asArr<MessageAttachment>(message.attachments as any);
  const actions = asArr<string>(message.actions as any);
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] rounded-2xl bg-white border border-[var(--space-border-default)] shadow-sm px-4 py-3 text-[15px] leading-relaxed text-[var(--space-text-primary)] whitespace-pre-wrap">
          {message.content}
        </div>
        <AttachmentChips attachments={attachments} />
      </div>
    );
  }
  return (
    <div className="max-w-[94%]">
      <ActionLines lines={actions} />
      <div className={`text-[15px] ${typography.color.primary}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={markdownUrlTransform}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  'Find candidates for this program',
  'Update my search preferences',
  'Review my shortlist',
  'Help with the program profile',
];

// Session-level guards shared across remounts: one greeting attempt and one
// maintenance run per (account, program), even if the chat mounts twice.
const greetedPrograms = new Set<string>();
const maintainedPrograms = new Set<string>();

export default function AlmaChat() {
  const store = useAlma();
  const {
    programReady,
    activeProgram,
    messages,
    displayName,
    email,
    appendLocalMessage,
    persistMessage,
    hasPersistedMessages,
    reloadCandidates,
    addDocument,
    setActiveTab,
    intake,
  } = store;

  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState('');
  const [showJump, setShowJump] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);

  const buildDeps = useCallback(
    (workingSetter: (label: string | null) => void): AgentDeps => ({
      ...store,
      program: activeProgram!,
      setWorking: workingSetter,
      onCandidatesDiscovered: () => {
        if (!store.isMobile) setActiveTab('recommendations');
      },
    }),
    [store, activeProgram, setActiveTab]
  );

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' }));
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [programReady]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, working, scrollToBottom]);

  // First-run greeting. The in-memory message list can be transiently empty
  // (slow or failed history load), so the greeting only posts after the
  // DATABASE confirms this program truly has no chat history — otherwise a
  // duplicate intro would greet the representative on every login, restarting
  // onboarding they already finished.
  useEffect(() => {
    if (!programReady || greeted.current || messages.length > 0 || !activeProgram) return;
    const guardKey = `${email}:${activeProgram.id}`;
    if (greetedPrograms.has(guardKey)) return;
    greeted.current = true;
    greetedPrograms.add(guardKey);
    const programName = activeProgram.name;
    (async () => {
      const hasHistory = await hasPersistedMessages();
      if (hasHistory !== false) return; // history exists (or unknown) — never re-greet
      const name = displayName ? ` ${displayName.split(' ')[0]}` : '';
      const answered = Object.values(intake.answers || {}).some((v) => (v || '').trim());
      const firstQuestion = nextIntakeQuestion(intake);
      const greeting = answered
        ? `Welcome back${name}! Your setup for ${programName} is saved — ask me to find candidates, refine your Search Brief, or update the program profile anytime.${
            firstQuestion ? `\n\nOne thing still open from your setup: ${firstQuestion.text}` : ''
          }`
        : `Hi${name}, I'm Alma — I help you find candidates who genuinely fit ${programName}, and keep your shortlist organized while you decide who to reach out to.\n\nA few things you can do here: chat with me to search Scout's opted-in students, upload your program brochure (PDF) and I'll build the program profile, or attach a default message (text file) for application requests.\n\nTo get started: ${
            firstQuestion ? firstQuestion.text : 'tell me a little about your program.'
          }`;
      appendLocalMessage({ role: 'assistant', content: greeting });
      persistMessage({ role: 'assistant', content: greeting }).catch(() => undefined);
    })();
  }, [programReady, messages.length, email, displayName, intake, activeProgram, hasPersistedMessages, appendLocalMessage, persistMessage]);

  // One-time startup maintenance per (account, program) and session: recover
  // chat-stated answers, parse a brochure that never fed the profile (e.g. the
  // one submitted at program creation), and run the first candidate discovery.
  // The guard lives at module level so a remount can't double-run it.
  useEffect(() => {
    if (!programReady || !activeProgram) return;
    const guardKey = `${email}:${activeProgram.id}`;
    if (maintainedPrograms.has(guardKey)) return;
    maintainedPrograms.add(guardKey);
    (async () => {
      try {
        const lines = await runStartupMaintenance(buildDeps(() => undefined));
        if (lines.length) {
          appendLocalMessage({ role: 'assistant', content: 'While you were away I tidied things up.', actions: lines });
          persistMessage({ role: 'assistant', content: 'While you were away I tidied things up.', actions: lines }).catch(() => undefined);
        }
      } catch {
        // maintenance is best-effort
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programReady, activeProgram?.id]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const accepted = incoming.filter((f) => isPdfFile(f.type || f.name) || isTextFile(f.type || f.name));
    let note = '';
    if (accepted.length < incoming.length) note = 'Only PDF and text files can be attached.';
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of accepted) {
        if (merged.length >= MAX_FILES) {
          note = `You can attach up to ${MAX_FILES} files per message.`;
          break;
        }
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged;
    });
    setFileNote(note);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const send = async (textOverride?: string) => {
    if (working || !activeProgram) return;
    const text = (textOverride ?? draft).trim();
    const pending = files;
    if (!text && !pending.length) return;

    setDraft('');
    setFiles([]);
    setFileNote('');
    setWorking('Thinking…');

    const preLines: string[] = [];
    const attachments: MessageAttachment[] = [];
    const sourceFiles = new Map<string, File>();

    try {
      // 1) Upload attachments — every upload lands in Documents regardless of path.
      for (const file of pending) {
        setWorking(`Uploading ${file.name}…`);
        try {
          const textual = isTextFile(file.type || file.name);
          const textContent = textual ? (await file.text()).slice(0, 8000) : '';
          const up = await uploadFile(file);
          attachments.push({ name: file.name, url: up.url });
          if (!textual) sourceFiles.set(up.url, file);
          await addDocument({
            name: file.name,
            kind: textual ? (/message/i.test(file.name) ? 'default_message' : 'upload') : 'upload',
            url: up.url,
            content_type: up.contentType,
            size_bytes: up.bytes,
            uploaded_via: 'chat',
            text_content: textContent,
          });
          preLines.push(
            textual && /message/i.test(file.name)
              ? `Added ${file.name} to Documents as your default application-request message`
              : `Added ${file.name} to Documents`
          );
        } catch {
          preLines.push(`Couldn't upload ${file.name} — please try again`);
        }
      }

      // 2) Show + persist the user's message (awaited before the final reload
      // so the server copy is in place when local temps get replaced).
      const userContent = text || `Shared ${attachments.map((a) => a.name).join(', ')}`;
      appendLocalMessage({ role: 'user', content: userContent, attachments });
      const userPersist = persistMessage({ role: 'user', content: userContent, attachments }).catch(() => undefined);

      // 3) Any attached PDF that turns out to be a program brochure feeds the
      // Profile pipeline (PRD: the pipeline runs for every upload path).
      const deps = buildDeps(setWorking);
      const parsedNotes: string[] = [];
      for (const [url, file] of sourceFiles) {
        const line = await parseBrochurePdf(url, file.name, deps, file).catch(() => null);
        if (line) {
          preLines.push(line);
          parsedNotes.push(`${file.name} was parsed as a program brochure and the program Profile has been updated with it.`);
          // Replace the plain upload row with a brochure-tagged one.
          await addDocument({
            name: file.name,
            kind: 'brochure',
            url,
            content_type: 'application/pdf',
            size_bytes: file.size,
            uploaded_via: 'chat',
          }).catch(() => undefined);
        } else if (/brochure|prospectus/i.test(file.name)) {
          preLines.push(`Saved ${file.name}, but couldn't extract program details from it`);
        }
      }

      // 4) The agentic turn.
      setWorking('Thinking…');
      const attachmentNote = attachments.length
        ? `The representative attached ${attachments.map((a) => a.name).join(', ')} (saved to Documents). ${parsedNotes.join(' ')}`
        : '';
      const result = await runAgentTurn(userContent, attachmentNote, deps);

      const actionLines = [...preLines, ...result.actionLines];
      appendLocalMessage({ role: 'assistant', content: result.reply, actions: actionLines });
      await userPersist;
      await persistMessage({ role: 'assistant', content: result.reply, actions: actionLines }).catch(() => undefined);
    } finally {
      setWorking(null);
      reloadCandidates().catch(() => undefined);
    }
  };

  // Group messages by calendar day for Jill-style separators.
  const grouped = useMemo(() => {
    const groups: { label: string; items: MessageRow[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
    return groups;
  }, [messages]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--space-surface-page)]/60 relative">
      {/* Header — program name + status chip (Jill's "Founding Designer · Hiring") */}
      <div className="flex-shrink-0 h-12 flex items-center gap-2.5 px-4 sm:px-6 border-b border-[var(--space-border-default)]">
        <h1 className={`text-[15px] font-semibold truncate ${typography.color.primary}`}>{activeProgram?.name || 'Program'}</h1>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-xs font-medium text-[var(--space-text-secondary)] flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Recruiting
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 pt-4 pb-2">
        <div className="max-w-[720px] mx-auto">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-[var(--space-border-default)]" />
                <span className={`text-xs ${typography.color.muted}`}>{group.label}</span>
                <div className="flex-1 h-px bg-[var(--space-border-default)]" />
              </div>
              <div className="space-y-5">
                {group.items.map((m) => (
                  <MessageBlock key={m.id} message={m} />
                ))}
              </div>
            </div>
          ))}
          {working && (
            <div className="flex items-center gap-2 mt-5">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--space-border-default)] rounded-full shadow-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--space-brand-primary-700)]" />
                <span className={`text-xs font-medium ${typography.color.secondary}`}>{working}</span>
              </div>
            </div>
          )}
          <div ref={endRef} className="h-4" />
        </div>
      </div>

      {/* Jump to latest */}
      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-[132px] left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white border border-[var(--space-border-default)] shadow-md flex items-center justify-center text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors z-10"
          aria-label="Jump to latest"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Composer */}
      <div className="flex-shrink-0 px-4 sm:px-8 pb-4 pt-1">
        <div className="max-w-[720px] mx-auto">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={!!working}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] transition-colors',
                  working && 'opacity-50 cursor-not-allowed'
                )}
              >
                {q}
              </button>
            ))}
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white border border-[var(--space-border-default)] text-xs text-[var(--space-text-secondary)]"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-0.5 rounded hover:bg-[var(--space-surface-muted)]"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {fileNote && <p className={`text-xs mb-2 ${typography.color.danger}`}>{fileNote}</p>}

          <div className="flex items-end gap-2 rounded-[26px] bg-white border border-[var(--space-border-default)] shadow-sm px-2.5 py-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt,.md"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!working || files.length >= MAX_FILES}
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors',
                (working || files.length >= MAX_FILES) && 'opacity-50 cursor-not-allowed'
              )}
              aria-label="Attach PDF or text files"
              title={`Attach PDFs or text files (up to ${MAX_FILES})`}
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>
            <textarea
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Alma anything…"
              className="flex-1 resize-none [field-sizing:content] bg-transparent outline-none text-[15px] leading-6 py-1.5 max-h-[140px] overflow-y-auto text-[var(--space-text-primary)] placeholder:text-[var(--space-text-muted)]"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!!working || (!draft.trim() && !files.length)}
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] transition-all hover:brightness-95',
                (working || (!draft.trim() && !files.length)) && 'opacity-50 cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

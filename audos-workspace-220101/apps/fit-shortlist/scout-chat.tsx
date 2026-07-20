// Scout — middle column: the agentic AI chat interface (Jack-style).

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
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn, typography } from '../../lib/colors';
import { runAgentTurn, parseResumePdf, AgentDeps } from './scout-agent';
import { useScout, uploadPdf } from './scout-store';
import { MessageAttachment, MessageRow, asArr, dayLabel, nextIntakeQuestion } from './scout-types';

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
  'Find programs for me',
  'Update my preferences',
  'Review my shortlist',
  'Help with my profile',
];

export default function ScoutChat() {
  const store = useScout();
  const {
    ready,
    messages,
    displayName,
    appendLocalMessage,
    persistMessage,
    reloadMessages,
    reloadPrograms,
    addDocument,
    markDocumentAsResume,
    setActiveTab,
    intake,
    documents,
    profile,
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
  const autoParsedDocs = useRef<Set<string>>(new Set());
  const autoParsing = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' }));
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [ready]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, working, scrollToBottom]);

  // First-run greeting — persisted so it never repeats across sessions.
  useEffect(() => {
    if (!ready || greeted.current || messages.length > 0) return;
    greeted.current = true;
    const firstQuestion = nextIntakeQuestion(intake);
    const greeting = `Hi${displayName ? ` ${displayName.split(' ')[0]}` : ''}, I'm Scout — I help you discover university programs that genuinely fit you, and keep your shortlist organized while you decide.\n\nA few things you can do here: chat with me to search for programs, upload your resume (PDF) and I'll build your profile, or just tell me what you're looking for.\n\nTo get started: ${firstQuestion ? firstQuestion.text : 'tell me a little about what you want to study.'}`;
    appendLocalMessage({ role: 'assistant', content: greeting });
    persistMessage({ role: 'assistant', content: greeting }).catch(() => undefined);
  }, [ready, messages.length, displayName, intake, appendLocalMessage, persistMessage]);

  useEffect(() => {
    if (!ready || working || autoParsing.current) return;
    const hasProfileData =
      !!profile.name ||
      !!profile.headline ||
      !!profile.bio ||
      profile.education.length > 0 ||
      profile.work.length > 0 ||
      profile.skills.length > 0;
    if (hasProfileData) return;
    const doc =
      documents.find((d) => d.url && /resume|cv/i.test(d.name)) ||
      documents.find((d) => d.url && d.content_type === 'application/pdf');
    if (!doc?.url || autoParsedDocs.current.has(doc.url)) return;
    autoParsedDocs.current.add(doc.url);

    autoParsing.current = true;
    (async () => {
      setWorking(`Reading ${doc.name}…`);
      try {
        const deps: AgentDeps = {
          ...store,
          setWorking,
          onProgramsDiscovered: () => {
            if (!store.isMobile) setActiveTab('recommendations');
          },
        };
        const line = await parseResumePdf(doc.url || '', doc.name, deps).catch(() => null);
        if (line) await markDocumentAsResume(doc.url || '').catch(() => undefined);
      } finally {
        autoParsing.current = false;
        setWorking(null);
      }
    })();
  }, [ready, working, documents, profile, store, markDocumentAsResume, setActiveTab]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    let note = '';
    if (pdfs.length < incoming.length) note = 'Only PDF files can be attached.';
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of pdfs) {
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
    if (working) return;
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
          const up = await uploadPdf(file);
          attachments.push({ name: file.name, url: up.url });
          sourceFiles.set(up.url, file);
          await addDocument({
            name: file.name,
            kind: 'upload',
            url: up.url,
            content_type: up.contentType,
            size_bytes: up.bytes,
            uploaded_via: 'chat',
          });
          preLines.push(`Added ${file.name} to Documents`);
        } catch {
          preLines.push(`Couldn't upload ${file.name} — please try again`);
        }
      }

      // 2) Show + persist the user's message (awaited before the final reload
      // so the server copy is in place when local temps get replaced).
      const userContent = text || `Shared ${attachments.map((a) => a.name).join(', ')}`;
      appendLocalMessage({ role: 'user', content: userContent, attachments });
      const userPersist = persistMessage({ role: 'user', content: userContent, attachments }).catch(() => undefined);

      // 3) Parse any attached PDFs that turn out to be resumes → Profile pipeline.
      const deps: AgentDeps = {
        ...store,
        setWorking,
        // Surface fresh recommendations in the right panel — but never yank a
        // mobile user out of the chat mid-conversation.
        onProgramsDiscovered: () => {
          if (!store.isMobile) setActiveTab('recommendations');
        },
      };
      const parsedNotes: string[] = [];
      for (const att of attachments) {
        setWorking(`Reading ${att.name}…`);
        const line = await parseResumePdf(att.url, att.name, deps, sourceFiles.get(att.url)).catch(() => null);
        if (line) {
          preLines.push(line);
          parsedNotes.push(`${att.name} was parsed as a resume and the student's profile has been updated with it.`);
          markDocumentAsResume(att.url).catch(() => undefined);
        } else if (/resume|cv/i.test(att.name)) {
          preLines.push(`Saved ${att.name}, but couldn't extract profile details from it`);
        }
      }

      // 4) The agentic turn.
      setWorking('Thinking…');
      const attachmentNote = attachments.length
        ? `The student attached ${attachments.map((a) => a.name).join(', ')} (saved to their Documents). ${parsedNotes.join(' ')}`
        : '';
      const result = await runAgentTurn(userContent, attachmentNote, deps);

      const actionLines = [...preLines, ...result.actionLines];
      appendLocalMessage({ role: 'assistant', content: result.reply, actions: actionLines });
      await userPersist;
      await persistMessage({ role: 'assistant', content: result.reply, actions: actionLines }).catch(() => undefined);
    } finally {
      setWorking(null);
      reloadPrograms().catch(() => undefined);
    }
  };

  // Group messages by calendar day for Jack-style separators.
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

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--space-surface-page)]/60 relative">
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
              accept="application/pdf,.pdf"
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
              aria-label="Attach PDF files"
              title={`Attach PDFs (up to ${MAX_FILES})`}
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                autoGrow();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Scout anything…"
              className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-6 py-1.5 max-h-[140px] text-[var(--space-text-primary)] placeholder:text-[var(--space-text-muted)]"
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

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
import ReactMarkdown from 'https://esm.sh/react-markdown@9.0.1?external=react';
import type { Components } from 'https://esm.sh/react-markdown@9.0.1?external=react';
import remarkGfm from 'https://esm.sh/remark-gfm@4.0.0';
import { cn, typography } from '../../lib/colors';
import { runAgentTurn, parseResumePdf, runStartupMaintenance, AgentDeps } from './scout-agent';
import { discoverEligibleApprenticeships } from './scout-apprenticeships';
import { isAgentApiError, useScout, uploadPdf } from './scout-store';
import { MessageAttachment, MessageRow, asArr, dayLabel, nextIntakeQuestion, profileMissingResumeSubstance } from './scout-types';

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
  'Find more programmes',
  'Update my preferences',
  'Review my shortlist',
  'Help with my profile',
];

// Session-level guard shared across remounts: one greeting attempt per
// account, even if the chat component mounts twice in quick succession.
const greetedAccounts = new Set<string>();

export default function ScoutChat() {
  const store = useScout();
  const {
    ready,
    email,
    messages,
    displayName,
    appendLocalMessage,
    persistMessage,
    hasPersistedMessages,
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
  const [streamingReply, setStreamingReply] = useState('');
  const [fileNote, setFileNote] = useState('');
  const [showJump, setShowJump] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);
  const autoParsedDocs = useRef<Set<string>>(new Set());
  const autoParsing = useRef(false);
  const maintained = useRef(false);
  const [maintenanceDone, setMaintenanceDone] = useState(false);
  const retryTextRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const chatScroller = scrollRef.current;
      if (!chatScroller) return;
      chatScroller.scrollTo({
        top: chatScroller.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [ready]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, working, streamingReply, scrollToBottom]);

  // First-run greeting. The in-memory message list can be transiently empty
  // (slow or failed history load), so the greeting only posts after the
  // DATABASE confirms this account truly has no chat history — otherwise a
  // duplicate intro would greet the student on every login.
  useEffect(() => {
    if (!ready || greeted.current || messages.length > 0) return;
    if (greetedAccounts.has(email)) return;
    greeted.current = true;
    greetedAccounts.add(email);
    (async () => {
      const hasHistory = await hasPersistedMessages();
      if (hasHistory !== false) return; // history exists (or unknown) — never re-greet
      const name = displayName ? ` ${displayName.split(' ')[0]}` : '';
      const answered = Object.values(intake.answers || {}).some((v) => (v || '').trim());
      const firstQuestion = nextIntakeQuestion(intake);
      const greeting = answered
        ? `Welcome back${name}! Your search setup is saved — ask me to find programs, adjust your preferences, or review your shortlist anytime.${
            firstQuestion ? `\n\nOne thing still open from your setup: ${firstQuestion.text}` : ''
          }`
        : `Hi${name}, I'm Scout — I help you discover university programmes and eligible apprenticeships that genuinely fit you, and keep your shortlist organized while you decide.\n\nA few things you can do here: chat with me to run a live programme search, upload your resume (PDF) and I'll build your profile, or tell me every country where you are a citizen or permanent resident so apprenticeship results stay relevant.\n\nTo get started: ${
            firstQuestion ? firstQuestion.text : 'tell me a little about what you want to study.'
          }`;
      appendLocalMessage({ role: 'assistant', content: greeting });
      persistMessage({ role: 'assistant', content: greeting }).catch(() => undefined);
    })();
  }, [ready, messages.length, email, displayName, intake, hasPersistedMessages, appendLocalMessage, persistMessage]);

  // One-time startup maintenance: recover chat-stated answers older versions
  // failed to save, and move recommendations that violate the student's
  // saved preferences (location/budget/level/deadline) to Skipped.
  useEffect(() => {
    if (!ready || maintained.current) return;
    maintained.current = true;
    (async () => {
      try {
        const deps: AgentDeps = { ...store, setWorking: () => undefined };
        await runStartupMaintenance(deps);
      } catch {
        // maintenance is best-effort
      } finally {
        setMaintenanceDone(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Auto-(re)parse the resume whenever it hasn't been fully absorbed yet:
  // a new/unparsed resume URL, or a profile still missing the resume's
  // substance (work, skills, extracurriculars). Runs once per URL per session,
  // after startup maintenance so it works from recovered state.
  useEffect(() => {
    if (!ready || !maintenanceDone || working || autoParsing.current) return;
    const doc =
      documents.find((d) => d.url && d.kind === 'resume') ||
      documents.find((d) => d.url && /resume|cv/i.test(d.name)) ||
      documents.find((d) => d.url && d.content_type === 'application/pdf');
    if (!doc?.url || autoParsedDocs.current.has(doc.url)) return;
    const unparsedUrl = profile.resumeSourceUrl !== doc.url;
    const needsEducationDateRepair = profile.education.some((item) => item.inProgress && !!item.endYear);
    if (!unparsedUrl && !profileMissingResumeSubstance(profile) && !needsEducationDateRepair) return;
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
        const result = await parseResumePdf(doc.url || '', doc.name, deps);
        if (result.status === 'complete' || result.status === 'partial') {
          await markDocumentAsResume(doc.url || '').catch(() => undefined);
          if (result.status === 'partial') setFileNote(result.message);
        } else if (result.status === 'failure' && /resume|cv/i.test(doc.name)) {
          setFileNote(`${result.message}. Please try uploading the PDF again.`);
        }
      } finally {
        autoParsing.current = false;
        setWorking(null);
      }
    })();
  }, [ready, maintenanceDone, working, documents, profile, store, markDocumentAsResume, setActiveTab]);

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
    setStreamingReply('');
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
      const isRetry = !attachments.length && retryTextRef.current === userContent;
      if (isRetry) retryTextRef.current = null;
      else appendLocalMessage({ role: 'user', content: userContent, attachments });
      const userPersist = isRetry
        ? Promise.resolve()
        : persistMessage({ role: 'user', content: userContent, attachments }).catch(() => undefined);

      // 3) Parse any attached PDFs that turn out to be resumes → Profile pipeline.
      const deps: AgentDeps = {
        ...store,
        retryingConnectionIssue: isRetry,
        setWorking,
        // Surface fresh recommendations in the right panel — but never yank a
        // mobile user out of the chat mid-conversation.
        onProgramsDiscovered: () => {
          if (!store.isMobile) setActiveTab('recommendations');
        },
        onReplyDelta: (reply) => {
          setStreamingReply(reply);
          setWorking('Writing…');
        },
      };
      const parsedNotes: string[] = [];
      for (const att of attachments) {
        setWorking(`Reading ${att.name}…`);
        const result = await parseResumePdf(att.url, att.name, deps, sourceFiles.get(att.url));
        if (result.status === 'complete' || result.status === 'partial') {
          preLines.push(result.message);
          parsedNotes.push(
            result.status === 'complete'
              ? `${att.name} was parsed as a resume and the student's profile has been updated with it.`
              : result.stage === 'bio'
                ? `${att.name} was parsed as a resume and its factual Profile details were saved, but the Bio refresh is still pending.`
                : `${att.name} was parsed as a resume and the Profile was updated, but the search setup refresh failed.`
          );
          markDocumentAsResume(att.url).catch(() => undefined);
        } else if (result.status === 'failure') {
          preLines.push(`${result.message} — please try uploading the PDF again`);
        } else if (/resume|cv/i.test(att.name)) {
          preLines.push(`Saved ${att.name}, but it doesn't appear to contain a resume`);
        }
      }

      // 4) The agentic turn.
      setWorking('Thinking…');
      const attachmentNote = attachments.length
        ? `The student attached ${attachments.map((a) => a.name).join(', ')} (saved to their Documents). ${parsedNotes.join(' ')}`
        : '';
      let result;
      try {
        result = await runAgentTurn(userContent, attachmentNote, deps);
      } catch (error) {
        if (!isAgentApiError(error)) throw error;
        const connectionMessage =
          'It looks like there was a connection issue — please check your internet and try sending your answer again.';
        retryTextRef.current = userContent;
        setDraft(userContent);
        appendLocalMessage({ role: 'assistant', content: connectionMessage, actions: preLines });
        await userPersist;
        await persistMessage({ role: 'assistant', content: connectionMessage, actions: preLines }).catch(() => undefined);
        return;
      }

      // University discovery is handled by Scout's existing live-search agent.
      // When the student opted into apprenticeships, add a second live search
      // across every country where they hold citizenship or permanent residency.
      try {
        const apprenticeship = await discoverEligibleApprenticeships(userContent, store);
        if (apprenticeship.attempted && apprenticeship.note) {
          result.reply = `${result.reply}\n\n${apprenticeship.note}`;
          if (apprenticeship.added > 0) {
            result.actionLines.push(`Added ${apprenticeship.added} live apprenticeship recommendation${apprenticeship.added === 1 ? '' : 's'} from eligible countries`);
          }
        }
      } catch {
        result.reply = `${result.reply}\n\nI couldn't complete the apprenticeship part of the live search just now, so I haven't shown unverified schemes. You can ask me to search again.`;
      }

      const deliveredRecommendations = result.actionLines.some((line) =>
        /added \d+ (?:new program|live apprenticeship recommendation)/i.test(line)
      );
      if (deliveredRecommendations) {
        result.reply = `${result.reply}\n\nEnjoyed using Scout? We'd love your feedback — it takes about 5 minutes and directly shapes what we build next: [Share your feedback](https://tally.so/r/QKLEZp)`;
      }

      const actionLines = [...preLines, ...result.actionLines];
      appendLocalMessage({ role: 'assistant', content: result.reply, actions: actionLines });
      setStreamingReply('');
      // Preserve transcript ordering, then overlap the independent assistant
      // insert and program refresh instead of paying their latency in sequence.
      await userPersist;
      await Promise.all([
        persistMessage({ role: 'assistant', content: result.reply, actions: actionLines }).catch(() => undefined),
        reloadPrograms().catch(() => undefined),
      ]);
    } finally {
      setStreamingReply('');
      setWorking(null);
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
          {streamingReply && (
            <div className="max-w-[94%] mt-5" aria-live="polite" aria-label="Scout is responding">
              <div className={`text-[15px] ${typography.color.primary}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={markdownUrlTransform}>
                  {streamingReply}
                </ReactMarkdown>
                <span className="inline-block w-1.5 h-4 ml-0.5 align-middle rounded-sm bg-[var(--space-brand-primary)] animate-pulse" />
              </div>
            </div>
          )}
          {working && (
            <div className="flex items-center gap-2 mt-5" role="status" aria-live="polite">
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
          className="absolute bottom-[152px] left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white border border-[var(--space-border-default)] shadow-md flex items-center justify-center text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)] transition-colors z-10"
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
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Scout anything…"
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

// Alma — right column: Documents sub-section, matching the reference
// screenshots: a searchable library with filter chips, grid/list toggle, and
// an "Add file" button; documents open inside the panel under a
// "Documents › name" breadcrumb; the Search Brief renders each factor with
// four tinted fit buckets ("Excellent Fit" → "Not a Fit") whose signals are
// editable right there (PRD). Uploads keep replace-on-same-name semantics and
// PDFs run through the brochure→profile pipeline no matter the upload path.

import { useMemo, useRef, useState } from 'react';
import {
  Award,
  Briefcase,
  Calendar,
  ChevronRight,
  ExternalLink,
  FileText,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  List,
  Loader2,
  MailPlus,
  MapPin,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { cn, typography } from '../../lib/colors';
import { AgentDeps, parseBrochurePdf } from './alma-agent';
import { uploadFile, useAlma } from './alma-store';
import {
  BUCKET_DEFS,
  BucketKey,
  DocumentRow,
  FACTOR_DEFS,
  FactorKey,
  briefIsEmpty,
  isPdfFile,
  isTextFile,
  normalizeBrief,
  timeAgo,
} from './alma-types';

// Files are referenced by name (not row id): replace-on-same-name re-inserts
// rows, and the name is the stable identity across replacements.
type DocView = { kind: 'grid' } | { kind: 'brief' } | { kind: 'file'; name: string };
type LayoutMode = 'grid' | 'list';
type FilterKey = 'all' | 'brochure' | 'default_message' | 'upload' | 'internal';

const MAX_FILES = 5;

const KIND_LABEL: Record<string, string> = {
  brochure: 'Brochure',
  default_message: 'Default message',
  upload: 'File',
};

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All files' },
  { key: 'brochure', label: 'Brochures' },
  { key: 'default_message', label: 'Messages' },
  { key: 'upload', label: 'Files' },
  { key: 'internal', label: 'Alma internal' },
];

const FACTOR_ICONS: Record<FactorKey, any> = {
  geography: MapPin,
  gpa: GraduationCap,
  extracurriculars: Award,
  research: FlaskConical,
  work: Briefcase,
  leadership: Users,
};

// "Documents › Search brief" breadcrumb row (per the opened-document screenshots).
function Breadcrumb({ current, onRoot, actions }: { current: string; onRoot: () => void; actions?: any }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--space-border-default)]">
      <button
        type="button"
        onClick={onRoot}
        className={`text-sm font-medium hover:text-[var(--space-text-primary)] transition-colors ${typography.color.muted}`}
      >
        Documents
      </button>
      <ChevronRight className="w-4 h-4 text-[var(--space-text-muted)] flex-shrink-0" />
      <p className={`flex-1 min-w-0 truncate text-sm font-semibold ${typography.color.primary}`}>{current}</p>
      {actions}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search Brief — viewable AND manually editable (PRD)

function BriefView({ onBack }: { onBack: () => void }) {
  const { brief, saveBrief } = useAlma();
  const [draft, setDraft] = useState<{ factor: FactorKey; bucket: BucketKey } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);
  const empty = briefIsEmpty(brief);

  const mutate = async (fn: (next: ReturnType<typeof normalizeBrief>) => void) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = normalizeBrief(JSON.parse(JSON.stringify(brief)));
      fn(next);
      await saveBrief(next);
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = (factor: FactorKey, bucket: BucketKey, index: number) =>
    mutate((next) => {
      next.factors[factor][bucket] = next.factors[factor][bucket].filter((_, i) => i !== index);
    });

  const addEntry = async () => {
    const target = draft;
    const value = draftText.trim();
    if (!target || !value) {
      setDraft(null);
      setDraftText('');
      return;
    }
    await mutate((next) => {
      const bucket = next.factors[target.factor][target.bucket];
      if (!bucket.some((x) => x.toLowerCase() === value.toLowerCase())) bucket.push(value.slice(0, 90));
    });
    setDraft(null);
    setDraftText('');
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <Breadcrumb current="Search brief" onRoot={onBack} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-[var(--space-surface-page)]/40">
        <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-5 sm:p-6">
          <p className={`text-xs ${typography.color.muted}`}>
            Alma's internal working document for candidate search — it files your preferences into fit buckets and you can edit
            any of them directly.{brief.updatedAt ? ` Updated ${timeAgo(brief.updatedAt)}.` : ''}
          </p>

          {empty && (
            <div className={`mt-4 rounded-xl border border-dashed border-[var(--space-border-strong)] p-5 text-center text-sm ${typography.color.secondary}`}>
              Nothing here yet. As you answer Alma's questions in the chat, your candidate preferences land in these buckets —
              or add signals manually below.
            </div>
          )}

          <div className="mt-2 space-y-8">
            {FACTOR_DEFS.map((factor) => {
              const Icon = FACTOR_ICONS[factor.key];
              return (
                <div key={factor.key}>
                  <h3 className={`flex items-center gap-2.5 text-lg font-semibold ${typography.color.primary}`}>
                    <Icon className="w-5 h-5 text-[var(--space-text-secondary)]" />
                    {factor.label}
                  </h3>
                  <div className="mt-3 space-y-3">
                    {BUCKET_DEFS.map((bucket) => {
                      const entries = brief.factors[factor.key][bucket.key];
                      const editingHere = draft?.factor === factor.key && draft?.bucket === bucket.key;
                      return (
                        <div key={bucket.key} className="flex items-start gap-3">
                          <span className={cn('w-24 sm:w-28 flex-shrink-0 pt-2 text-[13px] font-medium', bucket.labelClass)}>
                            {bucket.label}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            {entries.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {entries.map((entry, i) => (
                                  <span
                                    key={`${entry}-${i}`}
                                    className={cn(
                                      'group inline-flex items-center gap-1.5 pl-3 pr-1.5 py-2 rounded-lg border text-sm',
                                      bucket.chipClass
                                    )}
                                  >
                                    {entry}
                                    <button
                                      type="button"
                                      onClick={() => removeEntry(factor.key, bucket.key, i)}
                                      disabled={saving}
                                      className="p-0.5 rounded opacity-40 hover:opacity-100 hover:bg-white/70 transition-all"
                                      aria-label={`Remove ${entry}`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            {editingHere ? (
                              <input
                                autoFocus
                                type="text"
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addEntry();
                                  if (e.key === 'Escape') {
                                    setDraft(null);
                                    setDraftText('');
                                  }
                                }}
                                onBlur={addEntry}
                                placeholder="Type a signal and press Enter"
                                className="w-full px-3.5 py-2 rounded-lg border border-dashed border-[var(--space-brand-primary)] bg-white text-sm outline-none text-[var(--space-text-primary)]"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDraft({ factor: factor.key, bucket: bucket.key });
                                  setDraftText('');
                                }}
                                disabled={saving}
                                className={cn(
                                  'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors',
                                  bucket.addClass
                                )}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add signal
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opened document (PDF in an iframe; text files render their content)

function FileView({ doc, onBack }: { doc: DocumentRow; onBack: () => void }) {
  const { setDocumentKind } = useAlma();
  const [marking, setMarking] = useState(false);
  const textual = isTextFile(doc.content_type || doc.name) || (!!doc.text_content && !isPdfFile(doc.content_type || doc.name));

  const markAsDefaultMessage = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await setDocumentKind(doc.id, 'default_message');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <Breadcrumb
        current={doc.name}
        onRoot={onBack}
        actions={
          <div className="flex items-center gap-3 flex-shrink-0">
            {textual && doc.kind !== 'default_message' && (
              <button
                type="button"
                onClick={markAsDefaultMessage}
                disabled={marking}
                className={`flex items-center gap-1.5 text-sm hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
                title="Use this text as the default message for application requests"
              >
                <MailPlus className="w-4 h-4" />
                {marking ? 'Saving…' : 'Use as default message'}
              </button>
            )}
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 text-sm hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
              >
                Open
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        }
      />
      {textual ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-[var(--space-surface-page)]/40">
          {doc.kind === 'default_message' && (
            <p className={`text-xs mb-3 ${typography.color.muted}`}>
              This is the default message pre-filled when you send a candidate a request to apply.
            </p>
          )}
          <pre className={`whitespace-pre-wrap font-sans text-sm leading-relaxed rounded-2xl border border-[var(--space-border-default)] bg-white p-4 ${typography.color.primary}`}>
            {doc.text_content || 'This text file has no readable content.'}
          </pre>
        </div>
      ) : doc.url ? (
        <iframe src={doc.url} title={doc.name} className="flex-1 w-full min-h-0 bg-[var(--space-surface-muted)]" />
      ) : (
        <div className={`flex-1 flex items-center justify-center text-sm ${typography.color.muted}`}>This file has no preview.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library cards

function DocIcon({ internal }: { internal?: boolean }) {
  return (
    <div className="w-10 h-10 rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] flex items-center justify-center flex-shrink-0">
      {internal ? (
        <Search className="w-5 h-5 text-[var(--space-text-secondary)]" />
      ) : (
        <FileText className="w-5 h-5 text-[var(--space-text-secondary)]" />
      )}
    </div>
  );
}

function KindPill({ kind }: { kind: string }) {
  const highlighted = kind === 'brochure' || kind === 'default_message' || kind === 'internal';
  return (
    <span
      className={cn(
        'inline-block px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap',
        highlighted
          ? 'border-[var(--space-brand-primary-200)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]'
          : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)]'
      )}
    >
      {kind === 'internal' ? 'Alma internal' : KIND_LABEL[kind] || 'File'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The sub-section

export default function AlmaDocuments() {
  const store = useAlma();
  const { documents, brief, addDocument } = store;
  const [view, setView] = useState<DocView>({ kind: 'grid' });
  const [layout, setLayout] = useState<LayoutMode>('grid');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list || uploading) return;
    const accepted = Array.from(list)
      .filter((f) => isPdfFile(f.type || f.name) || isTextFile(f.type || f.name))
      .slice(0, MAX_FILES);
    setNote(accepted.length < list.length ? 'Only PDF and text files are supported.' : '');
    if (fileInputRef.current) fileInputRef.current.value = '';

    for (const file of accepted) {
      setUploading(`Uploading ${file.name}…`);
      try {
        const textual = isTextFile(file.type || file.name);
        const textContent = textual ? (await file.text()).slice(0, 8000) : '';
        const up = await uploadFile(file);
        const baseDoc = {
          name: file.name,
          url: up.url,
          content_type: up.contentType,
          size_bytes: up.bytes,
          uploaded_via: 'manual' as const,
          text_content: textContent,
        };
        await addDocument({
          ...baseDoc,
          kind: textual ? (/message/i.test(file.name) ? 'default_message' : 'upload') : 'upload',
        });
        // The brochure pipeline runs for every PDF upload path, including
        // manual adds — a prospectus updates the Profile no matter how it
        // arrived (PRD upload rule).
        if (!textual) {
          setUploading(`Analyzing ${file.name}…`);
          const deps: AgentDeps = { ...store, program: store.activeProgram!, setWorking: () => undefined };
          const parsed = await parseBrochurePdf(up.url, file.name, deps, file).catch(() => null);
          if (parsed) {
            // Re-adding under the same name replaces the row, now tagged as
            // the program brochure.
            await addDocument({ ...baseDoc, kind: 'brochure' }).catch(() => undefined);
          } else if (/brochure|prospectus/i.test(file.name)) {
            setNote(`Saved ${file.name}, but couldn't extract program details from it.`);
          }
        }
      } catch {
        setNote(`Couldn't upload ${file.name} — please try again.`);
      }
    }
    setUploading(null);
  };

  const q = query.trim().toLowerCase();
  const showBriefCard =
    (filter === 'all' || filter === 'internal') && (!q || 'search brief'.includes(q) || 'alma internal'.includes(q));
  const visibleDocs = useMemo(() => {
    if (filter === 'internal') return [];
    return documents.filter((d) => {
      if (filter !== 'all' && d.kind !== filter) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, filter, q]);

  if (view.kind === 'brief') {
    return (
      <div className="h-full min-h-0 flex flex-col bg-white">
        <BriefView onBack={() => setView({ kind: 'grid' })} />
      </div>
    );
  }

  if (view.kind === 'file') {
    const doc = documents.find((d) => d.name.trim().toLowerCase() === view.name.trim().toLowerCase());
    if (doc) {
      return (
        <div className="h-full min-h-0 flex flex-col bg-white">
          <FileView doc={doc} onBack={() => setView({ kind: 'grid' })} />
        </div>
      );
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      {/* Toolbar — search, view toggle, Add file (per the Documents screenshot) */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2.5 border-b border-[var(--space-border-default)] space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--space-text-muted)] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--space-border-default)] bg-white text-sm outline-none focus:border-[var(--space-border-strong)] text-[var(--space-text-primary)] placeholder:text-[var(--space-text-muted)]"
            />
          </div>
          <div className="flex items-center rounded-lg border border-[var(--space-border-default)] p-0.5">
            {(['grid', 'list'] as LayoutMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setLayout(mode)}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  layout === mode
                    ? 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                    : 'text-[var(--space-text-muted)] hover:text-[var(--space-text-secondary)]'
                )}
                aria-label={mode === 'grid' ? 'Grid view' : 'List view'}
                aria-pressed={layout === mode}
              >
                {mode === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,text/plain,.txt,.md"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!uploading}
            className={cn(
              'h-9 flex items-center gap-1.5 px-3 rounded-lg border border-[var(--space-border-default)] bg-white text-sm font-medium whitespace-nowrap transition-colors',
              typography.color.primary,
              uploading ? 'opacity-60 cursor-wait' : 'hover:bg-[var(--space-surface-muted)] hover:border-[var(--space-border-strong)]'
            )}
          >
            <Upload className="w-4 h-4" />
            Add file
          </button>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={cn(
                'px-3 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors',
                filter === chip.key
                  ? 'border-[var(--space-border-strong)] bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]'
                  : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              )}
              aria-pressed={filter === chip.key}
            >
              {chip.label}
            </button>
          ))}
          {uploading && (
            <span className={`flex items-center gap-1.5 text-xs whitespace-nowrap ml-auto ${typography.color.secondary}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {uploading}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-[var(--space-surface-page)]/40">
        {note && <p className={`text-xs mb-3 ${typography.color.danger}`}>{note}</p>}

        {layout === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {/* Alma's internal Search Brief */}
            {showBriefCard && (
              <button
                type="button"
                onClick={() => setView({ kind: 'brief' })}
                className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 text-left hover:shadow-md hover:border-[var(--space-border-strong)] transition-all"
              >
                <div className="flex items-start gap-3">
                  <DocIcon internal />
                  <p className={`text-sm font-medium leading-snug ${typography.color.primary}`}>Search brief</p>
                </div>
                <div className="mt-3">
                  <KindPill kind="internal" />
                </div>
                <div className={`flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--space-border-default)] text-[11px] ${typography.color.muted}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  {brief.updatedAt ? `Updated ${timeAgo(brief.updatedAt)}` : 'Not started yet'}
                </div>
              </button>
            )}

            {visibleDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setView({ kind: 'file', name: doc.name })}
                className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 text-left hover:shadow-md hover:border-[var(--space-border-strong)] transition-all"
              >
                <div className="flex items-start gap-3">
                  <DocIcon />
                  <p className={`text-sm font-medium leading-snug break-words line-clamp-2 ${typography.color.primary}`}>{doc.name}</p>
                </div>
                <div className="mt-3">
                  <KindPill kind={doc.kind} />
                </div>
                <div className={`flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--space-border-default)] text-[11px] ${typography.color.muted}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  Updated {timeAgo(doc.updated_at || doc.created_at)}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--space-border-default)] bg-white divide-y divide-[var(--space-border-default)] overflow-hidden">
            {showBriefCard && (
              <button
                type="button"
                onClick={() => setView({ kind: 'brief' })}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--space-surface-muted)]/60 transition-colors"
              >
                <DocIcon internal />
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${typography.color.primary}`}>Search brief</span>
                <KindPill kind="internal" />
                <span className={`hidden sm:block text-[11px] whitespace-nowrap ${typography.color.muted}`}>
                  {brief.updatedAt ? `Updated ${timeAgo(brief.updatedAt)}` : 'Not started yet'}
                </span>
              </button>
            )}
            {visibleDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setView({ kind: 'file', name: doc.name })}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--space-surface-muted)]/60 transition-colors"
              >
                <DocIcon />
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${typography.color.primary}`}>{doc.name}</span>
                <KindPill kind={doc.kind} />
                <span className={`hidden sm:block text-[11px] whitespace-nowrap ${typography.color.muted}`}>
                  Updated {timeAgo(doc.updated_at || doc.created_at)}
                </span>
              </button>
            ))}
            {!showBriefCard && visibleDocs.length === 0 && (
              <p className={`px-4 py-8 text-sm text-center ${typography.color.muted}`}>No files match this view.</p>
            )}
          </div>
        )}

        {documents.length === 0 && filter === 'all' && !q && (
          <p className={`text-sm mt-5 text-center ${typography.color.muted}`}>
            Upload the program brochure, a default application-request message (text file), or other documents here — files attached in the
            chat land in this library too.
          </p>
        )}
        {layout === 'grid' && !showBriefCard && visibleDocs.length === 0 && (documents.length > 0 || q || filter !== 'all') && (
          <p className={`text-sm mt-5 text-center ${typography.color.muted}`}>No files match this view.</p>
        )}
      </div>
    </div>
  );
}

// Scout — right column: Documents sub-section.
// Houses user uploads (resume + other PDFs, from any upload path) plus Scout's
// internal Search Brief. PDFs open inside the panel; the brief renders its
// factor buckets. Includes the "Add File" manual upload.

import { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Calendar, ExternalLink, FileText, Loader2, Plus, Search, Upload, X } from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { AgentDeps, parseResumePdf } from './scout-agent';
import { uploadPdf, useScout } from './scout-store';
import {
  BUCKET_DEFS,
  BucketKey,
  DocumentRow,
  FACTOR_DEFS,
  FactorKey,
  briefIsEmpty,
  normalizeBrief,
  timeAgo,
} from './scout-types';

type DocView = { kind: 'grid' } | { kind: 'brief' } | { kind: 'pdf'; doc: DocumentRow };

const MAX_FILES = 5;

function BriefView({ onBack }: { onBack: () => void }) {
  const { brief, saveBrief } = useScout();
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
      if (!bucket.some((x) => x.toLowerCase() === value.toLowerCase())) bucket.push(value.slice(0, 80));
    });
    setDraft(null);
    setDraftText('');
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <button
        type="button"
        onClick={onBack}
        className={`flex items-center gap-1.5 text-sm mb-4 hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
      >
        <ArrowLeft className="w-4 h-4" />
        All documents
      </button>
      <div className="flex items-center gap-3 mb-1.5">
        <div className="w-10 h-10 rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] flex items-center justify-center">
          <Search className="w-5 h-5 text-[var(--space-text-secondary)]" />
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${typography.color.primary}`}>Search brief</h2>
          <p className={`text-xs ${typography.color.muted}`}>
            Scout files your preferences into fit buckets — edit any of them directly here, or ask Scout in the chat.
            {brief.updatedAt ? ` Updated ${timeAgo(brief.updatedAt)}.` : ''}
          </p>
        </div>
      </div>

      {empty && (
        <div className={`mt-6 rounded-2xl border border-dashed border-[var(--space-border-strong)] p-6 text-center text-sm ${typography.color.secondary}`}>
          Nothing here yet. As you answer Scout's questions in the chat, it files your preferences into fit buckets for each search factor — or add them manually below.
        </div>
      )}

      <div className="mt-5 space-y-4">
        {FACTOR_DEFS.map((factor) => (
          <div key={factor.key} className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4">
            <p className={`text-sm font-semibold mb-3 ${typography.color.primary}`}>{factor.label}</p>
            <div className="space-y-2.5">
              {BUCKET_DEFS.map((bucket) => {
                const entries = brief.factors[factor.key][bucket.key];
                const editingHere = draft?.factor === factor.key && draft?.bucket === bucket.key;
                return (
                  <div key={bucket.key} className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 w-28 flex-shrink-0 pt-2">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', bucket.dotClass)} />
                      <span className={cn('text-xs font-medium', bucket.labelClass)}>{bucket.label}</span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {entries.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {entries.map((entry, i) => (
                            <span
                              key={`${entry}-${i}`}
                              className={cn('group inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full border text-xs', bucket.chipClass)}
                            >
                              {entry}
                              <button
                                type="button"
                                onClick={() => removeEntry(factor.key, bucket.key, i)}
                                disabled={saving}
                                className="p-0.5 rounded-full opacity-40 hover:opacity-100 hover:bg-white/70 transition-all"
                                aria-label={`Remove ${entry}`}
                              >
                                <X className="w-3 h-3" />
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
                          placeholder="Type a preference and press Enter"
                          className="w-full px-3 py-1.5 rounded-lg border border-dashed border-[var(--space-brand-primary)] bg-white text-xs outline-none text-[var(--space-text-primary)]"
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
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed text-xs transition-colors',
                            bucket.addClass
                          )}
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PdfView({ doc, onBack }: { doc: DocumentRow; onBack: () => void }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-[var(--space-border-default)]">
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-1.5 text-sm hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
        >
          <ArrowLeft className="w-4 h-4" />
          All documents
        </button>
        <p className={`flex-1 min-w-0 truncate text-sm font-medium text-center ${typography.color.primary}`}>{doc.name}</p>
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
      {doc.url ? (
        <iframe src={doc.url} title={doc.name} className="flex-1 w-full min-h-0 bg-[var(--space-surface-muted)]" />
      ) : (
        <div className={`flex-1 flex items-center justify-center text-sm ${typography.color.muted}`}>This file has no preview.</div>
      )}
    </div>
  );
}

export default function ScoutDocuments() {
  const store = useScout();
  const { documents, brief, addDocument, markDocumentAsResume } = store;
  const [view, setView] = useState<DocView>({ kind: 'grid' });
  const [uploading, setUploading] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list || uploading) return;
    const files = Array.from(list);
    const supportedFiles = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    const pdfs = supportedFiles.slice(0, MAX_FILES);
    const hasUnsupportedFile = supportedFiles.length < files.length;
    setNote(hasUnsupportedFile ? 'Only PDF files are supported. Please select a PDF file.' : '');
    if (fileInputRef.current) fileInputRef.current.value = '';

    for (const file of pdfs) {
      setUploading(`Uploading ${file.name}…`);
      try {
        const up = await uploadPdf(file);
        await addDocument({
          name: file.name,
          kind: 'upload',
          url: up.url,
          content_type: up.contentType,
          size_bytes: up.bytes,
          uploaded_via: 'manual',
        });
        // The resume pipeline runs for every upload path, including manual adds.
        setUploading(`Analyzing ${file.name}…`);
        const deps: AgentDeps = { ...store, setWorking: () => undefined };
        const result = await parseResumePdf(up.url, file.name, deps, file);
        if (result.status === 'complete' || result.status === 'partial') {
          await markDocumentAsResume(up.url).catch(() => undefined);
          if (result.status === 'partial') setNote(`${result.message}.`);
        } else if (result.status === 'failure') {
          setNote(`${result.message}. Please try uploading the PDF again.`);
        } else if (/resume|cv/i.test(file.name)) {
          setNote(`Saved ${file.name}, but it doesn't appear to contain a resume.`);
        }
      } catch {
        setNote(`Couldn't upload ${file.name} — please try again.`);
      }
    }
    setUploading(null);
  };

  if (view.kind === 'brief') {
    return (
      <div className="h-full min-h-0 flex flex-col bg-white">
        <div className="flex-shrink-0 flex items-center px-5 py-3.5 border-b border-[var(--space-border-default)]">
          <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Documents</h1>
        </div>
        <BriefView onBack={() => setView({ kind: 'grid' })} />
      </div>
    );
  }

  if (view.kind === 'pdf') {
    return (
      <div className="h-full min-h-0 flex flex-col bg-white">
        <div className="flex-shrink-0 flex items-center px-5 py-3.5 border-b border-[var(--space-border-default)]">
          <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Documents</h1>
        </div>
        <PdfView doc={view.doc} onBack={() => setView({ kind: 'grid' })} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--space-border-default)]">
        <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Documents</h1>
        <div className="flex items-center gap-2">
          {uploading && (
            <span className={`flex items-center gap-1.5 text-xs ${typography.color.secondary}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {uploading}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!uploading}
            className={cn('flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm', tw.button.secondary, uploading && tw.button.disabled)}
          >
            <Upload className="w-4 h-4" />
            Add file
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {note && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-[var(--space-semantic-danger)] bg-[color-mix(in_srgb,var(--space-semantic-danger)_10%,transparent)] px-3.5 py-3"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--space-semantic-danger)]" />
            <p className={`flex-1 text-sm font-medium ${typography.color.danger}`}>{note}</p>
            <button
              type="button"
              onClick={() => setNote('')}
              className="rounded-md p-0.5 text-[var(--space-semantic-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--space-semantic-danger)_15%,transparent)]"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {/* Scout's internal Search Brief is always present */}
          <button
            type="button"
            onClick={() => setView({ kind: 'brief' })}
            className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 text-left hover:shadow-md hover:border-[var(--space-border-strong)] transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] flex items-center justify-center flex-shrink-0">
                <Search className="w-5 h-5 text-[var(--space-text-secondary)]" />
              </div>
              <p className={`text-sm font-medium leading-snug ${typography.color.primary}`}>Search brief</p>
            </div>
            <span className="inline-block mt-3 px-2.5 py-1 rounded-full border border-[var(--space-border-default)] text-[11px] font-medium text-[var(--space-text-secondary)]">
              Scout internal
            </span>
            <div className={`flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--space-border-default)] text-[11px] ${typography.color.muted}`}>
              <Calendar className="w-3.5 h-3.5" />
              {brief.updatedAt ? `Updated ${timeAgo(brief.updatedAt)}` : 'Not started yet'}
            </div>
          </button>

          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setView({ kind: 'pdf', doc })}
              className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 text-left hover:shadow-md hover:border-[var(--space-border-strong)] transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-[var(--space-text-secondary)]" />
                </div>
                <p className={`text-sm font-medium leading-snug break-words line-clamp-2 ${typography.color.primary}`}>{doc.name}</p>
              </div>
              <span
                className={cn(
                  'inline-block mt-3 px-2.5 py-1 rounded-full border text-[11px] font-medium',
                  doc.kind === 'resume'
                    ? 'border-[var(--space-brand-primary-200)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]'
                    : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)]'
                )}
              >
                {doc.kind === 'resume' ? 'Resume' : 'PDF'}
              </span>
              <div className={`flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--space-border-default)] text-[11px] ${typography.color.muted}`}>
                <Calendar className="w-3.5 h-3.5" />
                Updated {timeAgo(doc.updated_at || doc.created_at)}
              </div>
            </button>
          ))}
        </div>

        {documents.length === 0 && (
          <p className={`text-sm mt-5 text-center ${typography.color.muted}`}>
            Upload your resume or other PDFs here, or attach them in the chat — everything lands in this library.
          </p>
        )}
      </div>
    </div>
  );
}

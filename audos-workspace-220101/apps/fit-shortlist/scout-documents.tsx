// Scout — right column: Documents sub-section.
// Houses user uploads (resume + other PDFs, from any upload path) plus Scout's
// internal Search Brief. PDFs open inside the panel; the brief renders its
// factor buckets. Includes the "Add File" manual upload.

import { useRef, useState } from 'react';
import { ArrowLeft, Calendar, ExternalLink, FileText, Loader2, Search, Upload } from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { AgentDeps, parseResumePdf } from './scout-agent';
import { uploadPdf, useScout } from './scout-store';
import { BUCKET_DEFS, DocumentRow, FACTOR_DEFS, briefIsEmpty, timeAgo } from './scout-types';

type DocView = { kind: 'grid' } | { kind: 'brief' } | { kind: 'pdf'; doc: DocumentRow };

const MAX_FILES = 5;

function BriefView({ onBack }: { onBack: () => void }) {
  const { brief } = useScout();
  const empty = briefIsEmpty(brief);
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
            Scout's internal working document — it evolves as your preferences do.
            {brief.updatedAt ? ` Updated ${timeAgo(brief.updatedAt)}.` : ''}
          </p>
        </div>
      </div>

      {empty ? (
        <div className={`mt-6 rounded-2xl border border-dashed border-[var(--space-border-strong)] p-6 text-center text-sm ${typography.color.secondary}`}>
          Nothing here yet. As you answer Scout's questions in the chat, it files your preferences into fit buckets for each search factor.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {FACTOR_DEFS.map((factor) => (
            <div key={factor.key} className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4">
              <p className={`text-sm font-semibold mb-3 ${typography.color.primary}`}>{factor.label}</p>
              <div className="space-y-2.5">
                {BUCKET_DEFS.map((bucket) => {
                  const entries = brief.factors[factor.key][bucket.key];
                  return (
                    <div key={bucket.key} className="flex items-start gap-3">
                      <div className="flex items-center gap-1.5 w-28 flex-shrink-0 pt-0.5">
                        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', bucket.dotClass)} />
                        <span className={`text-xs font-medium ${typography.color.secondary}`}>{bucket.label}</span>
                      </div>
                      {entries.length === 0 ? (
                        <span className={`text-xs pt-0.5 ${typography.color.muted}`}>—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {entries.map((entry, i) => (
                            <span
                              key={`${entry}-${i}`}
                              className="px-2.5 py-1 rounded-full bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-xs text-[var(--space-text-primary)]"
                            >
                              {entry}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
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
    const pdfs = Array.from(list)
      .filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .slice(0, MAX_FILES);
    setNote(pdfs.length < list.length ? 'Only PDF files are supported.' : '');
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
        const parsed = await parseResumePdf(up.url, file.name, deps, file).catch(() => null);
        if (parsed) {
          await markDocumentAsResume(up.url).catch(() => undefined);
        } else if (/resume|cv/i.test(file.name)) {
          setNote(`Saved ${file.name}, but couldn't extract profile details from it.`);
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
        {note && <p className={`text-xs mb-3 ${typography.color.danger}`}>{note}</p>}
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

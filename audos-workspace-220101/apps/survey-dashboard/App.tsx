import { useMemo, useState } from 'react';
import {
  BarChart3,
  GraduationCap,
  Building2,
  Inbox,
  RefreshCw,
  Download,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Users,
} from 'lucide-react';
import { tw, typography, cn } from '../../lib/colors';

/**
 * Research Surveys dashboard.
 *
 * Persistence has been migrated from the legacy Space JSON-file API
 * to the Workspace Database SDK. All reads
 * now flow through the `useWorkspaceDB` hook and all mutations through
 * `window.__workspaceDb`. The dashboard aggregates submissions from the
 * student and university research surveys plus any general research-survey
 * responses, so the data persists on the server and is queryable and
 * shareable across devices and team members.
 */

declare global {
  interface Window {
    useWorkspaceDB: <T = any>(
      table: string,
      options?: {
        shared?: boolean;
        limit?: number;
        offset?: number;
        orderBy?: { column: string; direction: 'asc' | 'desc' };
        filters?: Array<{ column: string; operator: string; value: any }>;
      }
    ) => { data: T[]; loading: boolean; error: Error | null; total: number; refresh: () => void };
    __workspaceDb: any;
  }
}

type SurveyRow = Record<string, any> & {
  id: number;
  session_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type AccentKey = 'primary' | 'highlight' | 'contrast';

interface SurveySource {
  key: string;
  table: string;
  label: string;
  blurb: string;
  Icon: typeof GraduationCap;
  accent: AccentKey;
}

const SURVEY_SOURCES: SurveySource[] = [
  {
    key: 'students',
    table: 'survey_students',
    label: 'Student Survey',
    blurb: 'Prospective students sharing what they want from a university.',
    Icon: GraduationCap,
    accent: 'primary',
  },
  {
    key: 'universities',
    table: 'survey_universities',
    label: 'University Survey',
    blurb: 'Universities describing the applicants they want to reach.',
    Icon: Building2,
    accent: 'highlight',
  },
  {
    key: 'responses',
    table: 'survey_responses',
    label: 'General Survey',
    blurb: 'Other research-survey submissions collected across Scout & Alma.',
    Icon: Inbox,
    accent: 'contrast',
  },
];

const SYSTEM_COLUMNS = new Set(['id', 'session_id', 'created_at', 'updated_at']);

const ACCENT_VAR: Record<AccentKey, string> = {
  primary: 'var(--space-brand-primary)',
  highlight: 'var(--space-brand-highlight)',
  contrast: 'var(--space-brand-contrast)',
};

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bjson\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(value?: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function maybeParseJson(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function valueToText(value: any): string {
  const parsed = maybeParseJson(value);
  if (parsed === null || parsed === undefined) return '';
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof parsed === 'object') {
    return Object.entries(parsed)
      .map(([k, v]) => `${humanizeKey(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  }
  return String(parsed);
}

function getRespondentLabel(row: SurveyRow): string {
  const candidateKeys = ['respondent_name', 'name', 'student_label', 'student_name', 'university', 'institution', 'email', 'respondent_email'];
  for (const key of candidateKeys) {
    const raw = row[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return `Response #${row.id}`;
}

function getDisplayFields(row: SurveyRow): Array<{ key: string; label: string; value: string }> {
  return Object.keys(row)
    .filter((key) => !SYSTEM_COLUMNS.has(key))
    .map((key) => ({ key, label: humanizeKey(key), value: valueToText(row[key]) }))
    .filter((field) => field.value.length > 0);
}

function StatCard({ source, count, active, onClick }: { source: SurveySource; count: number; active: boolean; onClick: () => void }) {
  const { Icon } = source;
  const color = ACCENT_VAR[source.accent];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 min-w-[150px] text-left rounded-2xl border p-4 transition-all min-h-[88px]',
        active
          ? 'bg-white shadow-[0_10px_30px_var(--space-shell-shadow)] border-transparent ring-2'
          : 'bg-white/70 border-[var(--space-border-default)] hover:bg-white hover:shadow-sm'
      )}
      style={active ? ({ ['--tw-ring-color' as any]: color, borderColor: color } as any) : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon className="w-5 h-5" />
        </span>
        <span className="text-2xl font-bold" style={{ color }}>
          {count}
        </span>
      </div>
      <p className={cn('mt-2 text-sm font-semibold', typography.color.primary)}>{source.label}</p>
      <p className={cn('text-xs mt-0.5 leading-snug', typography.color.tertiary)}>{source.blurb}</p>
    </button>
  );
}

function ResponseCard({
  row,
  accent,
  expanded,
  onToggle,
  onDelete,
  deleting,
}: {
  row: SurveyRow;
  accent: AccentKey;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const fields = getDisplayFields(row);
  const color = ACCENT_VAR[accent];
  const visibleFields = expanded ? fields : fields.slice(0, 3);
  return (
    <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('font-semibold text-base leading-snug truncate', typography.color.primary)}>
            {getRespondentLabel(row)}
          </h3>
          <p className={cn('flex items-center gap-1.5 text-xs mt-1', typography.color.tertiary)}>
            <Clock className="w-3.5 h-3.5" />
            {formatTimestamp(row.created_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete response"
          className={cn(
            'flex-shrink-0 p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center',
            'text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)]',
            deleting && 'opacity-50 cursor-not-allowed'
          )}
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {fields.length === 0 ? (
        <p className={cn('text-sm mt-3', typography.color.tertiary)}>No answer fields recorded.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {visibleFields.map((field) => (
            <div key={field.key} className="rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
                {field.label}
              </p>
              <p className={cn('text-sm mt-0.5 break-words', typography.color.secondary)}>{field.value}</p>
            </div>
          ))}
        </div>
      )}

      {fields.length > 3 && (
        <button
          type="button"
          onClick={onToggle}
          className={cn('mt-3 inline-flex items-center gap-1 text-xs font-medium', typography.color.brand)}
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Show all {fields.length} answers <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

function toCsv(rows: SurveyRow[]): string {
  if (rows.length === 0) return '';
  const columns = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((key) => {
        if (!SYSTEM_COLUMNS.has(key)) set.add(key);
      });
      return set;
    }, new Set<string>())
  );
  const header = ['Submitted', ...columns.map(humanizeKey)];
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const lines = rows.map((row) => {
    const cells = [formatTimestamp(row.created_at), ...columns.map((col) => valueToText(row[col]))];
    return cells.map((cell) => escape(String(cell ?? ''))).join(',');
  });
  return [header.map(escape).join(','), ...lines].join('\n');
}

export default function ResearchSurveysApp() {
  const studentsQuery = window.useWorkspaceDB<SurveyRow>('survey_students', {
    shared: true,
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });
  const universitiesQuery = window.useWorkspaceDB<SurveyRow>('survey_universities', {
    shared: true,
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });
  const responsesQuery = window.useWorkspaceDB<SurveyRow>('survey_responses', {
    shared: true,
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });

  const queries = useMemo(
    () => ({
      students: studentsQuery,
      universities: universitiesQuery,
      responses: responsesQuery,
    }),
    [studentsQuery, universitiesQuery, responsesQuery]
  );

  const [activeKey, setActiveKey] = useState<string>('students');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const activeSource = SURVEY_SOURCES.find((s) => s.key === activeKey) || SURVEY_SOURCES[0];
  const activeQuery = queries[activeKey as keyof typeof queries];
  const rows = activeQuery.data || [];

  const totalCount =
    (studentsQuery.total || studentsQuery.data?.length || 0) +
    (universitiesQuery.total || universitiesQuery.data?.length || 0) +
    (responsesQuery.total || responsesQuery.data?.length || 0);

  const anyLoading = studentsQuery.loading || universitiesQuery.loading || responsesQuery.loading;

  const refreshAll = () => {
    studentsQuery.refresh();
    universitiesQuery.refresh();
    responsesQuery.refresh();
  };

  const handleDelete = async (row: SurveyRow) => {
    setActionError('');
    setDeletingId(row.id);
    try {
      await window.__workspaceDb.from(activeSource.table).delete(row.id);
      activeQuery.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete this response.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = () => {
    const csv = toCsv(rows);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeSource.table}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const accentColor = ACCENT_VAR[activeSource.accent];

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-[var(--space-surface-page)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-7">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]">
              <BarChart3 className="w-6 h-6" />
            </span>
            <div>
              <h1 className={cn('text-xl sm:text-2xl font-bold', typography.color.brand)}>Research Surveys</h1>
              <p className={cn('text-sm flex items-center gap-1.5', typography.color.tertiary)}>
                <Users className="w-3.5 h-3.5" />
                {totalCount} {totalCount === 1 ? 'response' : 'responses'} collected
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className={cn('inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm min-h-[44px]', tw.button.secondary)}
          >
            <RefreshCw className={cn('w-4 h-4', anyLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Stat / source selector cards */}
        <div className="mt-5 flex flex-wrap gap-3">
          {SURVEY_SOURCES.map((source) => {
            const q = queries[source.key as keyof typeof queries];
            return (
              <StatCard
                key={source.key}
                source={source}
                count={q.total || q.data?.length || 0}
                active={source.key === activeKey}
                onClick={() => {
                  setActiveKey(source.key);
                  setExpandedId(null);
                  setActionError('');
                }}
              />
            );
          })}
        </div>

        {/* Active survey toolbar */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className={cn('text-base font-semibold', typography.color.primary)}>{activeSource.label}</h2>
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium min-h-[40px]',
              tw.button.secondary,
              rows.length === 0 && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {actionError && (
          <p className={cn('mt-3 flex items-center gap-2 text-sm', typography.color.danger)}>
            <AlertCircle className="w-4 h-4" />
            {actionError}
          </p>
        )}

        {activeQuery.error && (
          <p className={cn('mt-3 flex items-center gap-2 text-sm', typography.color.danger)}>
            <AlertCircle className="w-4 h-4" />
            {activeQuery.error.message || 'Could not load responses.'}
          </p>
        )}

        {/* Responses */}
        <div className="mt-4 space-y-3 pb-8">
          {activeQuery.loading && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: accentColor }} />
              <p className={cn('text-sm mt-3', typography.color.secondary)}>Loading responses…</p>
            </div>
          )}

          {!activeQuery.loading && rows.length === 0 && !activeQuery.error && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4 rounded-2xl border border-dashed border-[var(--space-border-strong)] bg-white/60">
              <activeSource.Icon className="w-10 h-10 mb-3" style={{ color: accentColor }} />
              <p className={cn('font-medium', typography.color.primary)}>No responses yet</p>
              <p className={cn('text-sm mt-1 max-w-sm', typography.color.secondary)}>
                Submissions to the {activeSource.label.toLowerCase()} will appear here as soon as people complete it.
              </p>
            </div>
          )}

          {rows.map((row) => (
            <ResponseCard
              key={`${activeSource.table}-${row.id}`}
              row={row}
              accent={activeSource.accent}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
              onDelete={() => handleDelete(row)}
              deleting={deletingId === row.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

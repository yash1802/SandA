import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  GraduationCap,
  Building2,
  Mail,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { tw, typography, cn } from '../../lib/colors';
import { STUDENT_SURVEY, UNIVERSITY_SURVEY, SURVEY_LABELS } from '../../lib/surveyDefinitions';
import { buildPermalinkSurveySource } from '../../lib/permalinkSurveyBuilder';
import { PERMALINK_SLUGS, SURVEY_HOOK_CODE, type SurveyResponseRow } from '../../lib/surveySubmit';

const WORKSPACE_ID = 'workspace-220101';

interface PermalinkPage {
  id: string;
  slug: string;
  title: string;
  publicUrl?: string;
}

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
  }
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAnswer(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}

function ResponseCard({ row }: { row: SurveyResponseRow }) {
  const [expanded, setExpanded] = useState(false);
  const answers = useMemo(() => {
    try {
      return JSON.parse(row.responses_json || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [row.responses_json]);

  const preview = Object.entries(answers).slice(0, 1);

  return (
    <div className={cn(tw.card.flat, 'overflow-hidden')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-[var(--space-surface-card-hover)] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={cn(tw.badge.default, row.survey_type === 'university' ? tw.badge.accent : tw.badge.primary)}>
              {SURVEY_LABELS[row.survey_type] || row.survey_type}
            </span>
            <span className={cn('text-xs', typography.color.tertiary)}>{formatDate(row.created_at)}</span>
            {row.source && <span className={cn('text-xs', typography.color.tertiary)}>via {row.source}</span>}
            {row.contact_email && (
              <span className={cn('inline-flex items-center gap-1 text-xs', typography.color.secondary)}>
                <Mail className="w-3 h-3" />
                {row.contact_email}
              </span>
            )}
          </div>
          {!expanded && preview.length > 0 && (
            <p className={cn('text-sm line-clamp-2', typography.color.secondary)}>
              {preview.map(([k, v]) => `${k}: ${formatAnswer(v)}`).join(' · ')}
            </p>
          )}
        </div>
        {expanded ? <ChevronUp className={cn('w-5 h-5 flex-shrink-0', tw.icon.muted)} /> : <ChevronDown className={cn('w-5 h-5 flex-shrink-0', tw.icon.muted)} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--space-border-default)]">
          {Object.entries(answers).map(([key, value]) => (
            <div key={key} className="pt-3">
              <p className={cn('text-xs font-medium mb-1', typography.color.tertiary)}>{key}</p>
              <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', typography.color.primary)}>{formatAnswer(value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PermalinkLinkCard({
  label,
  slug,
  Icon,
  accent,
  pageExists,
  url,
  copied,
  onCopy,
  subtitle,
}: {
  label: string;
  slug: string;
  Icon: typeof GraduationCap;
  accent: 'primary' | 'highlight';
  pageExists?: boolean;
  url: string;
  copied: boolean;
  onCopy: () => void;
  subtitle?: string;
}) {
  const disabled = pageExists === false;
  return (
    <div className={cn(tw.card.flat, 'p-4')}>
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center',
            accent === 'highlight'
              ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)]'
              : 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h3 className={cn('text-sm font-semibold', typography.color.primary)}>{label}</h3>
          <p className={cn('text-xs', typography.color.tertiary)}>{subtitle || 'Standalone public link — no login required'}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={disabled ? 'Click "Create public links" above first' : url}
          className={cn(tw.input.base, tw.input.default, 'rounded-xl text-xs flex-1')}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" onClick={onCopy} disabled={disabled} className={cn('px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium', tw.button.secondary, disabled && tw.button.disabled)}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        {!disabled && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={cn('px-3 py-2 rounded-xl flex items-center', tw.button.primary)} title="Open survey">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function SurveyResponsesApp() {
  const [filter, setFilter] = useState<'all' | 'student' | 'university'>('all');
  const [pages, setPages] = useState<PermalinkPage[]>([]);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupNotice, setSetupNotice] = useState('');
  const [copiedSlug, setCopiedSlug] = useState('');

  const filters = filter === 'all' ? [] : [{ column: 'survey_type', operator: 'eq', value: filter }];

  const { data, loading, error, total, refresh } = window.useWorkspaceDB<SurveyResponseRow>('survey_responses', {
    shared: true,
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
    filters,
  });

  const studentCount = (data || []).filter((r) => r.survey_type === 'student').length;
  const universityCount = (data || []).filter((r) => r.survey_type === 'university').length;

  const loadPages = async () => {
    try {
      const res = await fetch(`/api/workspaces/${WORKSPACE_ID}/permalink-pages`);
      if (!res.ok) return;
      const result = await res.json();
      setPages(Array.isArray(result) ? result : []);
    } catch {
      // ignore
    }
  };

  const ensureHook = async () => {
    const listRes = await fetch(`/api/workspaces/${WORKSPACE_ID}/hooks`);
    const hooks = listRes.ok ? await listRes.json() : [];
    const existing = Array.isArray(hooks) ? hooks.find((h: { name: string; id: string }) => h.name === 'submit-survey-response') : null;
    if (existing) {
      await fetch(`/api/workspaces/${WORKSPACE_ID}/hooks/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: SURVEY_HOOK_CODE, enabled: true }),
      });
      return;
    }
    await fetch(`/api/workspaces/${WORKSPACE_ID}/hooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'submit-survey-response',
        description: 'Stores survey responses from public permalink pages',
        code: SURVEY_HOOK_CODE,
        enabled: true,
      }),
    });
  };

  const upsertPermalink = async (surveyType: 'student' | 'university') => {
    const slug = PERMALINK_SLUGS[surveyType];
    const title = surveyType === 'student' ? STUDENT_SURVEY.title : UNIVERSITY_SURVEY.title;
    const tsxSource = buildPermalinkSurveySource(surveyType);
    const existing = pages.find((p) => p.slug === slug);

    if (existing) {
      const res = await fetch(`/api/workspaces/${WORKSPACE_ID}/permalink-pages/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, tsxSource, isPublic: true }),
      });
      if (!res.ok) throw new Error('Failed to update permalink');
      return res.json();
    }

    const res = await fetch(`/api/workspaces/${WORKSPACE_ID}/permalink-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title, tsxSource, isPublic: true, metadata: { surveyType } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.details || 'Failed to create permalink');
    }
    return res.json();
  };

  const setupPublicLinks = async () => {
    setSetupBusy(true);
    setSetupNotice('');
    try {
      await ensureHook();
      await upsertPermalink('student');
      await upsertPermalink('university');
      await loadPages();
      setSetupNotice('Public survey links are ready to share.');
    } catch (err) {
      setSetupNotice(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSetupBusy(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const getAppUrl = (appId: string) => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('app', appId);
    return url.toString();
  };

  const getPageUrl = (slug: string) => {
    const page = pages.find((p) => p.slug === slug);
    const path = page?.publicUrl || `/p/${WORKSPACE_ID}/${slug}`;
    return path.startsWith('http') ? path : `${window.location.origin}${path}`;
  };

  const handleCopy = async (key: string, url?: string) => {
    const text = url || getPageUrl(key);
    await navigator.clipboard.writeText(text);
    setCopiedSlug(key);
    setTimeout(() => setCopiedSlug(''), 2000);
  };

  return (
    <div className="min-h-full bg-[var(--space-surface-page)]">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--space-brand-contrast)] text-[var(--space-text-on-contrast)] flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className={cn('text-lg sm:text-xl font-bold', typography.color.brand)}>Research Surveys</h1>
            <p className={cn('text-sm mt-0.5', typography.color.secondary)}>Share survey links and review submissions.</p>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className={cn('text-sm font-semibold flex items-center gap-1.5', typography.color.primary)}>
            <Link2 className="w-4 h-4" /> Workspace survey links
          </h2>
          <p className={cn('text-xs leading-relaxed', typography.color.tertiary)}>
            Share these links on your live workspace — respondents skip login and land directly in the survey.
          </p>
          <PermalinkLinkCard
            label={SURVEY_LABELS.student}
            slug="student-survey"
            Icon={GraduationCap}
            accent="primary"
            url={getAppUrl('student-survey')}
            copied={copiedSlug === 'app:student-survey'}
            onCopy={() => handleCopy('app:student-survey', getAppUrl('student-survey'))}
            subtitle="Workspace link — ?app=student-survey"
          />
          <PermalinkLinkCard
            label={SURVEY_LABELS.university}
            slug="university-survey"
            Icon={Building2}
            accent="highlight"
            url={getAppUrl('university-survey')}
            copied={copiedSlug === 'app:university-survey'}
            onCopy={() => handleCopy('app:university-survey', getAppUrl('university-survey'))}
            subtitle="Workspace link — ?app=university-survey"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className={cn('text-sm font-semibold flex items-center gap-1.5', typography.color.primary)}>
              <Link2 className="w-4 h-4" /> Public survey links
            </h2>
            <button
              type="button"
              onClick={setupPublicLinks}
              disabled={setupBusy}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5', tw.button.primary, setupBusy && tw.button.disabled)}
            >
              {setupBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {pages.length ? 'Refresh links' : 'Create public links'}
            </button>
          </div>
          {setupNotice && <p className={cn('text-xs', setupNotice.includes('failed') || setupNotice.includes('Failed') ? typography.color.danger : typography.color.secondary)}>{setupNotice}</p>}
          <p className={cn('text-xs leading-relaxed', typography.color.tertiary)}>
            Each link opens a standalone mobile-friendly survey. Part 1 collects experience insights with no product mention; respondents then see the transition and Part 2 product reaction in the same flow.
          </p>
          <PermalinkLinkCard
            label={SURVEY_LABELS.student}
            slug={PERMALINK_SLUGS.student}
            Icon={GraduationCap}
            accent="primary"
            pageExists={pages.some((p) => p.slug === PERMALINK_SLUGS.student)}
            url={getPageUrl(PERMALINK_SLUGS.student)}
            copied={copiedSlug === PERMALINK_SLUGS.student}
            onCopy={() => handleCopy(PERMALINK_SLUGS.student)}
          />
          <PermalinkLinkCard
            label={SURVEY_LABELS.university}
            slug={PERMALINK_SLUGS.university}
            Icon={Building2}
            accent="highlight"
            pageExists={pages.some((p) => p.slug === PERMALINK_SLUGS.university)}
            url={getPageUrl(PERMALINK_SLUGS.university)}
            copied={copiedSlug === PERMALINK_SLUGS.university}
            onCopy={() => handleCopy(PERMALINK_SLUGS.university)}
          />
        </section>

        <section>
          <h2 className={cn('text-sm font-semibold mb-3', typography.color.primary)}>Responses</h2>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(
              [
                { id: 'all' as const, label: `All (${total})` },
                { id: 'student' as const, label: `Students (${studentCount})` },
                { id: 'university' as const, label: `Universities (${universityCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                  filter === tab.id
                    ? 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] border-[var(--space-brand-primary)]'
                    : 'bg-white text-[var(--space-text-primary)] border-[var(--space-border-default)]'
                )}
              >
                {tab.label}
              </button>
            ))}
            <button type="button" onClick={() => refresh()} className={cn('ml-auto px-3 py-2 rounded-xl text-xs font-medium', tw.button.ghost)}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-16">
              <Loader2 className={cn('w-8 h-8 animate-spin', tw.icon.primary)} />
              <p className={cn('text-sm mt-3', typography.color.secondary)}>Loading responses…</p>
            </div>
          ) : error ? (
            <div className={cn(tw.card.flat, 'p-6 text-center')}>
              <p className={cn('text-sm', typography.color.danger)}>{error.message}</p>
            </div>
          ) : !data?.length ? (
            <div className={cn(tw.card.flat, 'p-8 text-center')}>
              <ClipboardList className={cn('w-10 h-10 mx-auto mb-3', tw.icon.muted)} />
              <p className={cn('font-medium', typography.color.primary)}>No responses yet</p>
              <p className={cn('text-sm mt-1', typography.color.secondary)}>Share the public links above to start collecting research data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((row) => (
                <ResponseCard key={row.id} row={row} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Bug, CheckCircle2, Loader2, Send, X } from 'lucide-react';

interface SupportWidgetProps {
  appId?: string;
  appName?: string;
}

function getReporterEmail(): string | null {
  try {
    const runtimeSpaceId = (window as any).__SPACE_ID__ || 'workspace-220101';
    const raw = localStorage.getItem(`space_session_${runtimeSpaceId}`);
    if (!raw) return null;
    const email = JSON.parse(raw)?.email;
    return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

async function sendBugReportEmail({
  description,
  appId,
  appName,
}: {
  description: string;
  appId?: string;
  appName?: string;
}) {
  const workspaceId =
    (window as any).__WORKSPACE_ID__ || (window as any).__SPACE_ID__ || 'workspace-220101';
  const reporterEmail = getReporterEmail();
  const resolvedAppId = appId || (window as any).__APP_ID__ || 'unknown';
  const body = [
    description,
    '',
    'Reporter context',
    `App: ${appName || 'Unknown'} (${resolvedAppId})`,
    `Reporter email: ${reporterEmail || 'Not available'}`,
    `Page: ${window.location.href.slice(0, 2000)}`,
    `Submitted: ${new Date().toISOString()}`,
    `User agent: ${navigator.userAgent.slice(0, 1000)}`,
  ].join('\n');

  const response = await fetch('/api/app-skills/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify({
      to: 'hello@scoutandalma.com',
      subject: 'Scout Bug Report',
      text: body,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.error || 'Your report was saved, but its email notification could not be sent. Please try again.'
    );
  }
}

export default function SupportWidget({ appId, appName }: SupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketSaved, setTicketSaved] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setError('');
    if (submitted) {
      setSubmitted(false);
      setTicketSaved(false);
      setIssue('');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const description = issue.trim();
    if (description.length < 10) {
      setError('Please add a little more detail so we can investigate.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const workspaceDb = (window as any).__workspaceDb;
      if (!workspaceDb) throw new Error('Support is temporarily unavailable.');
      if (!ticketSaved) {
        await workspaceDb.from('inbox_support_tickets').insert({
          app_id: appId || (window as any).__APP_ID__ || 'unknown',
          app_name: appName || null,
          issue: description.slice(0, 2000),
          page_url: window.location.href.slice(0, 2000),
          reporter_email: getReporterEmail(),
          user_agent: navigator.userAgent.slice(0, 1000),
        });
        setTicketSaved(true);
      }
      await sendBugReportEmail({ description: description.slice(0, 2000), appId, appName });
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not send your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[90]">
      {open && (
        <div
          className="absolute bottom-14 right-0 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--space-border-default)] bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-widget-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--space-border-default)] px-5 py-4">
            <div>
              <h2 id="support-widget-title" className="text-base font-semibold text-[var(--space-text-primary)]">
                Report a problem
              </h2>
              <p className="mt-1 text-xs text-[var(--space-text-muted)]">Tell the Scout & Alma team what went wrong.</p>
            </div>
            <button type="button" onClick={close} className="rounded-lg p-1.5 hover:bg-[var(--space-surface-muted)]" aria-label="Close support form">
              <X className="h-4 w-4 text-[var(--space-text-muted)]" />
            </button>
          </div>

          {submitted ? (
            <div className="px-5 py-7 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-[var(--space-semantic-success)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--space-text-primary)]">Report sent</p>
              <p className="mt-1 text-sm text-[var(--space-text-secondary)]">Thank you — the team will review it.</p>
              <button type="button" onClick={close} className="mt-5 rounded-xl bg-[var(--space-brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--space-text-on-primary)]">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 px-5 py-4">
              <label htmlFor="support-issue" className="block text-sm font-medium text-[var(--space-text-primary)]">
                What happened?
              </label>
              <textarea
                id="support-issue"
                value={issue}
                onChange={(event) => {
                  setIssue(event.target.value);
                  setError('');
                }}
                rows={5}
                maxLength={2000}
                autoFocus
                disabled={ticketSaved}
                placeholder="Briefly describe the issue and what you expected to happen…"
                className="w-full resize-none rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] px-3 py-2.5 text-sm text-[var(--space-text-primary)] outline-none placeholder:text-[var(--space-text-muted)] focus:border-[var(--space-brand-primary)]"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--space-text-muted)]">{issue.length}/2000</span>
                <button
                  type="submit"
                  disabled={submitting || issue.trim().length < 10}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--space-brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--space-text-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? 'Sending…' : ticketSaved ? 'Retry notification' : 'Send report'}
                </button>
              </div>
              {error && <p className="text-sm text-[var(--space-semantic-danger)]">{error}</p>}
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--space-border-default)] bg-white text-[var(--space-text-secondary)] shadow-lg transition hover:-translate-y-0.5 hover:text-[var(--space-text-primary)]"
        aria-label={open ? 'Close support form' : 'Report a problem'}
        aria-expanded={open}
        title="Report a problem"
      >
        <Bug className="h-5 w-5" />
      </button>
    </div>
  );
}

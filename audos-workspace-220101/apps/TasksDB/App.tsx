import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Check,
  List,
  GraduationCap,
  Calendar,
  FileText,
  PenLine,
  MessageCircle,
  Loader2,
  Sparkles,
  Filter,
} from 'lucide-react';
import { tw, typography, cn } from '../../lib/colors';

/**
 * Application Checklist — student journey task tracker for Scout & Alma.
 * Tracks documents, deadlines, essays, and follow-ups per shortlisted university.
 * Complements Scout (recommendations) with persistent action tracking.
 */

interface ApplicationTask {
  id: number;
  title: string;
  done: boolean;
  university?: string;
  category?: string;
  due_date?: string;
  notes?: string;
  created_at?: string;
}

interface ShortlistRow {
  id: number;
  student_label: string;
  summary: string;
  next_step: string;
  matches_json: string;
  status: string;
}

interface FitMatch {
  university: string;
  nextSteps?: string[];
}

type TaskCategory = 'document' | 'deadline' | 'essay' | 'interview' | 'other';

const CATEGORIES: { id: TaskCategory; label: string; icon: typeof FileText }[] = [
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'deadline', label: 'Deadlines', icon: Calendar },
  { id: 'essay', label: 'Essays & statements', icon: PenLine },
  { id: 'interview', label: 'Conversations', icon: MessageCircle },
  { id: 'other', label: 'Everything else', icon: List },
];

const QUICK_ADD = [
  { title: 'Request official transcripts', category: 'document' as TaskCategory },
  { title: 'Draft personal statement', category: 'essay' as TaskCategory },
  { title: 'Check scholarship deadlines', category: 'deadline' as TaskCategory },
  { title: 'Book an admissions conversation', category: 'interview' as TaskCategory },
];

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

function parseMatches(raw?: string): FitMatch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function categoryMeta(category?: string) {
  return CATEGORIES.find((c) => c.id === category) || CATEGORIES[4];
}

function formatDueDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(value?: string, done?: boolean) {
  if (!value || done) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
}

export default function ApplicationChecklist() {
  const { data: tasks, loading, error, refresh } = window.useWorkspaceDB<ApplicationTask>('tasks', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const { data: shortlists } = window.useWorkspaceDB<ShortlistRow>('fit_shortlists', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 5,
  });

  const [newTitle, setNewTitle] = useState('');
  const [newUniversity, setNewUniversity] = useState('');
  const [newCategory, setNewCategory] = useState<TaskCategory>('other');
  const [newDueDate, setNewDueDate] = useState('');
  const [filterUniversity, setFilterUniversity] = useState<string>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const autoImportRequested = useRef(false);

  const universities = useMemo(() => {
    const set = new Set<string>();
    (tasks || []).forEach((t) => { if (t.university?.trim()) set.add(t.university.trim()); });
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return (tasks || []).filter((task) => {
      if (!showCompleted && task.done) return false;
      if (filterUniversity !== 'all' && (task.university || 'General') !== filterUniversity) return false;
      return true;
    });
  }, [tasks, filterUniversity, showCompleted]);

  const doneCount = (tasks || []).filter((t) => t.done).length;
  const totalCount = tasks?.length || 0;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const latestShortlist = (shortlists || []).find((row) => row.status !== 'archived');

  const handleAdd = async (overrides?: Partial<{ title: string; university: string; category: TaskCategory; due_date: string }>) => {
    const title = (overrides?.title ?? newTitle).trim();
    if (!title) return;
    setBusy(true);
    try {
      const dueDate = overrides?.due_date ?? newDueDate;
      await window.__workspaceDb.from('tasks').insert({
        title,
        done: false,
        university: (overrides?.university ?? newUniversity).trim() || null,
        category: overrides?.category ?? newCategory,
        due_date: dueDate ? dueDate : null,
      });
      setNewTitle('');
      setNewDueDate('');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (task: ApplicationTask) => {
    await window.__workspaceDb.from('tasks').update(task.id, { done: !task.done });
    refresh();
  };

  const handleDelete = async (id: number) => {
    await window.__workspaceDb.from('tasks').delete(id);
    refresh();
  };

  const handleImportFromShortlist = async () => {
    if (!latestShortlist) {
      setImportNotice('No Scout shortlist found yet — build your shortlist first, then import next steps here.');
      return;
    }
    setBusy(true);
    setImportNotice('');
    try {
      const matches = parseMatches(latestShortlist.matches_json);
      const existingTitles = new Set((tasks || []).map((t) => t.title.toLowerCase()));
      let imported = 0;

      if (latestShortlist.next_step && !existingTitles.has(latestShortlist.next_step.toLowerCase())) {
        await window.__workspaceDb.from('tasks').insert({
          title: latestShortlist.next_step,
          done: false,
          university: null,
          category: 'other',
        });
        existingTitles.add(latestShortlist.next_step.toLowerCase());
        imported++;
      }

      for (const match of matches.slice(0, 5)) {
        for (const step of match.nextSteps || []) {
          const key = step.toLowerCase();
          if (existingTitles.has(key)) continue;
          const lower = step.toLowerCase();
          let category: TaskCategory = 'other';
          if (lower.includes('deadline')) category = 'deadline';
          else if (lower.includes('essay') || lower.includes('statement')) category = 'essay';
          await window.__workspaceDb.from('tasks').insert({
            title: step,
            done: false,
            university: match.university,
            category,
          });
          existingTitles.add(key);
          imported++;
        }
      }

      refresh();
      setImportNotice(imported > 0 ? `Added ${imported} task${imported === 1 ? '' : 's'} from your latest shortlist.` : 'Your shortlist next steps are already on the checklist.');
    } catch (err) {
      setImportNotice(err instanceof Error ? err.message : 'Could not import from Scout.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoImportRequested.current || loading) return;
    try {
      if (sessionStorage.getItem('scout:import-shortlist') !== '1') return;
      sessionStorage.removeItem('scout:import-shortlist');
    } catch {
      return;
    }
    if (!latestShortlist) return;
    autoImportRequested.current = true;
    handleImportFromShortlist();
  }, [loading, latestShortlist]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApplicationTask[]>();
    filteredTasks.forEach((task) => {
      const key = task.university?.trim() || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b);
    });
  }, [filteredTasks]);

  return (
    <div className="min-h-full flex flex-col w-full bg-transparent">
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ background: 'radial-gradient(circle at top left, var(--space-brand-contrast), transparent 28%), radial-gradient(circle at bottom right, var(--space-brand-primary-50), transparent 32%)' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--space-border-default)] bg-[var(--space-surface-card)]/90 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--space-brand-contrast)] text-[var(--space-text-on-contrast)] flex items-center justify-center flex-shrink-0 shadow-[0_8px_20px_var(--space-shell-shadow)]">
              <List className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className={cn('font-bold text-base sm:text-lg truncate', typography.color.brand)}>Application Checklist</h1>
              <p className={cn('text-xs sm:text-sm leading-snug', typography.color.secondary)}>Turn Scout matches into trackable next steps — one place for every deadline and follow-up.</p>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="text-right flex-shrink-0">
              <p className={cn('text-lg font-bold', typography.color.brand)}>{progressPct}%</p>
              <p className={cn('text-[10px] uppercase tracking-wide', typography.color.tertiary)}>{doneCount}/{totalCount} done</p>
            </div>
          )}
        </div>

        {totalCount > 0 && (
          <div className="px-4 pt-3 pb-1">
            <div className="h-2 rounded-full bg-[var(--space-surface-muted)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--space-brand-contrast)] transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="p-4 border-b border-[var(--space-border-default)] bg-[var(--space-surface-panel)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <button
              onClick={handleImportFromShortlist}
              disabled={busy}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium', tw.button.secondary, busy && tw.button.disabled)}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Import from Scout
            </button>
            {universities.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Filter className={cn('w-3.5 h-3.5', tw.icon.muted)} />
                <select
                  value={filterUniversity}
                  onChange={(e) => setFilterUniversity(e.target.value)}
                  className={cn('text-xs rounded-xl px-2 py-2 border border-[var(--space-border-default)] bg-[var(--space-surface-card)] w-full sm:w-auto', typography.color.primary)}
                >
                  <option value="all">Every university</option>
                  <option value="General">General</option>
                  {universities.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <label className={cn('flex items-center gap-1.5 text-xs sm:ml-auto', typography.color.secondary)}>
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="rounded" />
              Show completed tasks
            </label>
          </div>
          {importNotice && (
            <p className={cn('text-xs', importNotice.includes('No Scout') || importNotice.includes('Could not') ? typography.color.danger : typography.color.secondary)}>{importNotice}</p>
          )}

          <div className="space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="What is on your list? e.g. Request official transcripts"
              className={cn(tw.input.base, tw.input.default, 'rounded-xl text-sm')}
            />
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newUniversity}
                onChange={(e) => setNewUniversity(e.target.value)}
                placeholder="Which university? (optional)"
                className={cn(tw.input.base, tw.input.default, 'rounded-xl text-sm')}
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                className={cn(tw.input.base, tw.input.default, 'rounded-xl text-sm')}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className={cn(tw.input.base, tw.input.default, 'rounded-xl text-sm')}
              />
            </div>
            <button
              onClick={() => handleAdd()}
              disabled={busy || !newTitle.trim()}
              className={cn('w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5', tw.button.primary, (busy || !newTitle.trim()) && tw.button.disabled)}
            >
              <Plus className="w-4 h-4" /> Add to checklist
            </button>
          </div>

          {totalCount === 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <p className={cn('text-xs w-full', typography.color.tertiary)}>Common first steps — tap to add:</p>
              {QUICK_ADD.map((item) => (
                <button
                  key={item.title}
                  onClick={() => handleAdd({ title: item.title, category: item.category })}
                  disabled={busy}
                  className={cn('px-2.5 py-1.5 rounded-full text-xs border border-[var(--space-border-default)] bg-[var(--space-surface-card)] hover:bg-[var(--space-surface-card-hover)]', typography.color.secondary)}
                >
                  + {item.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className={cn('w-8 h-8 animate-spin', tw.icon.primary)} />
              <p className={cn('text-sm mt-3', typography.color.secondary)}>Loading your checklist…</p>
            </div>
          ) : error ? (
            <div className={cn('text-center py-12 text-sm', typography.color.danger)}>Error: {error.message}</div>
          ) : !tasks || tasks.length === 0 ? (
            <div className={cn(tw.card.flat, 'p-8 text-center max-w-md mx-auto')}>
              <GraduationCap className={cn('w-12 h-12 mx-auto mb-4', tw.icon.muted)} />
              <p className={cn('font-semibold', typography.color.primary)}>Nothing on your checklist yet</p>
              <p className={cn('text-sm mt-2 leading-relaxed', typography.color.secondary)}>
                Once Scout builds your shortlist, import its recommended next steps here — or add tasks as you work through each application.
              </p>
              {latestShortlist ? (
                <button onClick={handleImportFromShortlist} disabled={busy} className={cn('mt-5 px-4 py-2.5 rounded-xl text-sm', tw.button.primary)}>
                  Pull in Scout&apos;s next steps
                </button>
              ) : (
                <p className={cn('text-xs mt-4', typography.color.tertiary)}>Open Scout first — your checklist fills in from there.</p>
              )}
            </div>
          ) : filteredTasks.length === 0 ? (
            <p className={cn('text-center py-12 text-sm', typography.color.secondary)}>No tasks match your filters.</p>
          ) : (
            <div className="space-y-5 max-w-2xl mx-auto">
              {grouped.map(([university, items]) => (
                <div key={university}>
                  <div className="flex items-center gap-2 mb-2">
                    {university !== 'General' ? (
                      <GraduationCap className={cn('w-4 h-4', tw.icon.primary)} />
                    ) : (
                      <List className={cn('w-4 h-4', tw.icon.muted)} />
                    )}
                    <h2 className={cn('text-sm font-semibold', typography.color.primary)}>{university}</h2>
                    <span className={cn(tw.badge.default, tw.badge.neutral)}>{items.filter((t) => t.done).length}/{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((task) => {
                      const meta = categoryMeta(task.category);
                      const CatIcon = meta.icon;
                      const overdue = isOverdue(task.due_date, task.done);
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'p-3 rounded-2xl border flex items-start gap-3 transition-all',
                            task.done
                              ? 'bg-[var(--space-surface-muted)] border-[var(--space-border-default)] opacity-70'
                              : overdue
                                ? 'bg-[var(--space-surface-accent-soft)] border-[var(--space-brand-highlight-200)]'
                                : 'bg-[var(--space-surface-card)] border-[var(--space-border-default)]'
                          )}
                        >
                          <button
                            onClick={() => handleToggle(task)}
                            className={cn(
                              'w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center flex-shrink-0',
                              task.done ? 'bg-[var(--space-semantic-success)] border-[var(--space-semantic-success)] text-white' : 'border-[var(--space-border-strong)]'
                            )}
                            aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                          >
                            {task.done && <Check className="w-3 h-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn('text-sm', typography.color.primary, task.done && 'line-through')}>
                                {task.title}
                              </p>
                              <button onClick={() => handleDelete(task.id)} className={cn('p-1 flex-shrink-0', tw.button.ghost)} aria-label="Delete">
                                <Trash2 className={cn('w-4 h-4', tw.icon.muted)} />
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span className={cn(tw.badge.default, tw.badge.primary, 'flex items-center gap-1')}>
                                <CatIcon className="w-3 h-3" /> {meta.label}
                              </span>
                              {task.due_date && formatDueDate(task.due_date) && (
                                <span className={cn(tw.badge.default, overdue ? tw.badge.danger : tw.badge.neutral, 'flex items-center gap-1')}>
                                  <Calendar className="w-3 h-3" />
                                  {overdue ? 'Overdue: ' : 'Due '}{formatDueDate(task.due_date)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={cn('px-4 py-3 border-t border-[var(--space-border-default)] bg-[var(--space-surface-card)]/80 text-center')}>
          <p className={cn('text-[11px] leading-relaxed', typography.color.tertiary)}>
            Part of Scout &amp; Alma — students track applications here; universities manage outreach in Alma.
          </p>
        </div>
      </div>
    </div>
  );
}

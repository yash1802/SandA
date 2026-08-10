// Alma — right column: Profile sub-section, matching the reference Profile
// screenshot: a strength badge in the toolbar, a soft gradient header card
// (name, "Level | Intake | Campus" line, monogram, location + status), then
// Bio-style AI sections and the structured program facts. Every part is
// manually editable — including the header card — EXCEPT the AI-generated
// summary and admissions sections; any manual edit refreshes the AI summary
// (PRD update logic).

import { useState } from 'react';
import {
  AlertTriangle,
  Award,
  Banknote,
  Briefcase,
  CalendarClock,
  Check,
  CheckCircle2,
  Landmark,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { AgentDeps, saveProfileWithSummaryRefresh } from './alma-agent';
import { useAlma } from './alma-store';
import {
  CAPSTONE_OPTIONS,
  INTAKE_TERMS,
  ProgramLevel,
  ProgramProfile,
  RankingItem,
  asArr,
  getInitials,
  parseCampusLocation,
} from './alma-types';

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg resize-none py-2')}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2')}
        />
      )}
    </label>
  );
}

function SectionShell({
  icon: Icon,
  title,
  editing,
  onEdit,
  children,
}: {
  icon: any;
  title: string;
  editing?: boolean;
  onEdit?: () => void;
  children: any;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-[var(--space-border-default)]">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${typography.color.primary}`}>
          <Icon className="w-4 h-4 text-[var(--space-text-secondary)]" />
          {title}
        </h3>
        {onEdit && !editing && (
          <button
            type="button"
            onClick={onEdit}
            className={`flex items-center gap-1 text-xs font-medium hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function EditActions({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2 pt-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn('px-4 py-2 rounded-lg text-xs', tw.button.primary, saving && tw.button.disabled)}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={saving} className={cn('px-4 py-2 rounded-lg text-xs', tw.button.secondary)}>
        Cancel
      </button>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm py-1">
      <span className={typography.color.muted}>{label}</span>
      <span className={`text-right font-medium ${typography.color.primary}`}>{value}</span>
    </div>
  );
}

const RANKING_SOURCE_LABELS: Record<string, string> = {
  THE: 'Times Higher Education (THE)',
  QS: 'QS World University Rankings',
  ARWU: 'ARWU / Shanghai Ranking',
  FT: 'Financial Times',
};

// Profile strength (toolbar badge, per the reference screenshot): the share
// of profile parts that are filled in.
function profileStrength(profile: ProgramProfile, hasIntakes: boolean): { label: string; barClass: string; barWidth: string } {
  const parts = [
    !!profile.summary,
    !!profile.admissionsLookingFor,
    !!(profile.city || profile.country),
    profile.rankings.length > 0,
    !!profile.tuitionAnnual,
    !!profile.durationMonths,
    profile.intakes.length > 0 || hasIntakes,
    !!profile.capstone,
    profile.uniqueFeatures.length > 0,
    !!(profile.outcomes.placement3m || profile.outcomes.placement6m || profile.outcomes.employers.length),
    !!profile.scholarships,
  ];
  const filled = parts.filter(Boolean).length;
  const ratio = filled / parts.length;
  if (ratio < 0.4) return { label: 'Weak', barClass: 'bg-amber-500', barWidth: 'w-1/3' };
  if (ratio < 0.75) return { label: 'Fair', barClass: 'bg-yellow-400', barWidth: 'w-2/3' };
  return { label: 'Strong', barClass: 'bg-emerald-500', barWidth: 'w-full' };
}

// Header card edit form — program identity (name, level, intakes, campus).
function HeaderEditForm({ onDone }: { onDone: () => void }) {
  const { activeProgram, updateProgram } = useAlma();
  const [name, setName] = useState(activeProgram?.name || '');
  const [level, setLevel] = useState<ProgramLevel>((activeProgram?.level as ProgramLevel) || 'graduate');
  const [terms, setTerms] = useState<string[]>(asArr<string>(activeProgram?.intakes as any));
  const [campus, setCampus] = useState(activeProgram?.campus_location || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleTerm = (term: string) =>
    setTerms((prev) => (prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term]));

  const save = async () => {
    if (saving || !activeProgram) return;
    if (!name.trim()) {
      setError('The program needs a name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateProgram(activeProgram.id, {
        name: name.trim(),
        level,
        intakes: INTAKE_TERMS.filter((t) => terms.includes(t)),
        campus_location: campus.trim(),
      });
      onDone();
    } catch {
      setError("The changes couldn't be saved — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Name of the program" value={name} onChange={setName} placeholder="e.g. MSc in Data Science" />
      <div>
        <span className={`block text-xs font-medium mb-1.5 ${typography.color.secondary}`}>Program level</span>
        <div className="grid grid-cols-2 gap-2">
          {(['undergraduate', 'graduate'] as ProgramLevel[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLevel(option)}
              className={cn(
                'px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-colors',
                level === option
                  ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                  : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              )}
              aria-pressed={level === option}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className={`block text-xs font-medium mb-1.5 ${typography.color.secondary}`}>Intake terms</span>
        <div className="flex gap-2">
          {INTAKE_TERMS.map((term) => {
            const active = terms.includes(term);
            return (
              <button
                key={term}
                type="button"
                onClick={() => toggleTerm(term)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  active
                    ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                    : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                )}
                aria-pressed={active}
              >
                {active && <Check className="w-3 h-3" />}
                {term}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Campus location" value={campus} onChange={setCampus} placeholder="e.g. Boston, USA" />
      {error && <p className={`text-xs ${typography.color.danger}`}>{error}</p>}
      <EditActions saving={saving} onCancel={onDone} onSave={save} />
    </div>
  );
}

export default function AlmaProfile() {
  const store = useAlma();
  const { profile, activeProgram, intake } = store;
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [refreshingSummary, setRefreshingSummary] = useState(false);

  const startEdit = (key: string, initial: any) => {
    setEditing(key);
    setForm(initial);
  };
  const cancelEdit = () => {
    setEditing(null);
    setForm({});
  };

  // Every manual save also refreshes the AI summary so it reflects the change.
  const persist = async (next: ProgramProfile) => {
    if (!activeProgram) return;
    setSaving(true);
    try {
      const deps: AgentDeps = { ...store, program: activeProgram, setWorking: () => undefined };
      setEditing(null);
      setForm({});
      setRefreshingSummary(true);
      await saveProfileWithSummaryRefresh(next, deps);
    } finally {
      setSaving(false);
      setRefreshingSummary(false);
    }
  };

  const splitLines = (v: string): string[] =>
    v
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 15);

  const intakes = asArr<string>(activeProgram?.intakes as any);
  // Rankings display: program-scope entries take priority over university-wide
  // ones (PRD), which mergeRankings already ordered.
  const rankings = profile.rankings;
  const strength = profileStrength(profile, intakes.length > 0);
  const location = [profile.city, profile.country].filter(Boolean).join(', ') || activeProgram?.campus_location || '';
  const subtitle = [
    activeProgram?.level ? String(activeProgram.level).charAt(0).toUpperCase() + String(activeProgram.level).slice(1) : '',
    (profile.intakes.length ? profile.intakes : intakes).join(', '),
    activeProgram?.campus_location || '',
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      {/* Toolbar — profile strength badge (per the reference screenshot) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--space-border-default)]">
        {refreshingSummary ? (
          <span className={`flex items-center gap-1.5 text-xs ${typography.color.secondary}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Updating the AI summary…
          </span>
        ) : (
          <p className={`text-xs ${typography.color.muted}`}>Built from program creation, the brochure, and your chat with Alma.</p>
        )}
        <span className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--space-border-default)] bg-white text-xs font-medium overflow-hidden flex-shrink-0 text-[var(--space-text-primary)]">
          <AlertTriangle className={cn('w-3.5 h-3.5', strength.label === 'Weak' ? 'text-amber-500' : strength.label === 'Fair' ? 'text-yellow-500' : 'text-emerald-500')} />
          Profile strength: {strength.label}
          <span className={cn('absolute bottom-0 left-0 h-[3px] rounded-r-full', strength.barClass, strength.barWidth)} />
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {/* Header card — gradient, monogram, "Level | Intake | Campus" line */}
        <div className="rounded-2xl border border-[var(--space-border-default)] bg-gradient-to-br from-[var(--space-brand-primary-50)] via-white to-[var(--space-surface-muted)] p-5 sm:p-6">
          {editing === 'header' ? (
            <HeaderEditForm onDone={cancelEdit} />
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className={`text-2xl font-semibold leading-snug ${typography.color.primary}`}>{activeProgram?.name}</h2>
                  {subtitle && <p className={`text-[15px] mt-1.5 ${typography.color.secondary}`}>{subtitle}</p>}
                </div>
                <div className="w-14 h-14 rounded-full bg-[var(--space-brand-primary-900)] text-white flex items-center justify-center text-lg font-semibold flex-shrink-0 ring-4 ring-white/60">
                  {getInitials(activeProgram?.name || 'P')}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 mt-8">
                <div className={`flex items-center flex-wrap gap-x-3 gap-y-1 text-sm ${typography.color.secondary}`}>
                  {location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/80 border border-[var(--space-border-default)] text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Actively recruiting
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    startEdit('header', {})
                  }
                  className={`flex items-center gap-1 text-xs font-medium hover:text-[var(--space-text-primary)] transition-colors flex-shrink-0 ${typography.color.secondary}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            </>
          )}
        </div>

        {/* Summary — generated by Alma, not manually editable (PRD) */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[var(--space-border-default)]">
            <h3 className={`text-sm font-semibold ${typography.color.primary}`}>Summary</h3>
            <span className={`flex items-center gap-1 text-[11px] font-medium ${typography.color.brand}`}>
              <Sparkles className="w-3 h-3" />
              Generated by Alma
            </span>
          </div>
          {refreshingSummary ? (
            <p className={`flex items-center gap-1.5 text-sm mt-3 ${typography.color.muted}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Updating to reflect your changes…
            </p>
          ) : profile.summary ? (
            <p className={`text-sm mt-3 leading-relaxed whitespace-pre-line ${typography.color.secondary}`}>{profile.summary}</p>
          ) : (
            <p className={`text-sm mt-3 ${typography.color.muted}`}>
              Alma builds this summary from the program details, the brochure, and your chat — it updates automatically as they change.
            </p>
          )}
        </div>

        {/* What the admissions committee is looking for — AI-generated from chat */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[var(--space-border-default)]">
            <h3 className={`text-sm font-semibold ${typography.color.primary}`}>What the admissions committee is looking for</h3>
            <span className={`flex items-center gap-1 text-[11px] font-medium ${typography.color.accent}`}>
              <Sparkles className="w-3 h-3" />
              Generated by Alma
            </span>
          </div>
          {profile.admissionsLookingFor ? (
            <p className={`text-sm mt-3 leading-relaxed whitespace-pre-line ${typography.color.secondary}`}>{profile.admissionsLookingFor}</p>
          ) : (
            <p className={`text-sm mt-3 ${typography.color.muted}`}>
              Tell Alma in the chat what you look for in candidates and this section will write itself.
            </p>
          )}
        </div>

        {/* Location — falls back to the campus location given at program
            creation, so "London, UK" from the creation flow is never blank here */}
        <SectionShell
          icon={MapPin}
          title="Location"
          editing={editing === 'location'}
          onEdit={() => {
            const campus = parseCampusLocation(activeProgram?.campus_location);
            startEdit('location', {
              city: profile.city || campus.city,
              country: profile.country || campus.country,
            });
          }}
        >
          {editing === 'location' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              <Field label="City" value={form.city || ''} onChange={(v) => setForm({ ...form, city: v })} placeholder="e.g. Boston" />
              <Field label="Country" value={form.country || ''} onChange={(v) => setForm({ ...form, country: v })} placeholder="e.g. United States" />
              <EditActions saving={saving} onCancel={cancelEdit} onSave={() => persist({ ...profile, city: form.city.trim(), country: form.country.trim() })} />
            </div>
          ) : profile.city || profile.country || activeProgram?.campus_location ? (
            <p className={`text-sm ${typography.color.primary}`}>
              {[profile.city, profile.country].filter(Boolean).join(', ') || activeProgram?.campus_location}
            </p>
          ) : (
            <p className={`text-sm ${typography.color.muted}`}>Not set yet — upload the brochure or edit manually.</p>
          )}
        </SectionShell>

        {/* Rankings */}
        <SectionShell
          icon={Trophy}
          title="Rankings"
          editing={editing === 'rankings'}
          onEdit={() =>
            startEdit('rankings', {
              rankings: rankings.length ? rankings.map((r) => ({ ...r })) : [{ source: 'QS', scope: 'university', rank: '', year: '' }],
            })
          }
        >
          {editing === 'rankings' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              {(form.rankings || []).map((r: RankingItem, i: number) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>Source</span>
                    <select
                      value={r.source}
                      onChange={(e) => {
                        const next = [...form.rankings];
                        next[i] = { ...r, source: e.target.value };
                        setForm({ ...form, rankings: next });
                      }}
                      className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2 w-28')}
                    >
                      {['THE', 'QS', 'ARWU', 'FT'].map((sourceKey) => (
                        <option key={sourceKey} value={sourceKey}>
                          {sourceKey}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>Scope</span>
                    <select
                      value={r.scope}
                      onChange={(e) => {
                        const next = [...form.rankings];
                        next[i] = { ...r, scope: e.target.value };
                        setForm({ ...form, rankings: next });
                      }}
                      className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2 w-32')}
                    >
                      <option value="program">Program</option>
                      <option value="university">University</option>
                    </select>
                  </label>
                  <label className="block flex-1 min-w-[90px]">
                    <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>Rank</span>
                    <input
                      type="text"
                      value={r.rank}
                      onChange={(e) => {
                        const next = [...form.rankings];
                        next[i] = { ...r, rank: e.target.value };
                        setForm({ ...form, rankings: next });
                      }}
                      placeholder="#47"
                      className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2')}
                    />
                  </label>
                  <label className="block w-20">
                    <span className={`block text-xs font-medium mb-1 ${typography.color.secondary}`}>Year</span>
                    <input
                      type="text"
                      value={r.year}
                      onChange={(e) => {
                        const next = [...form.rankings];
                        next[i] = { ...r, year: e.target.value };
                        setForm({ ...form, rankings: next });
                      }}
                      placeholder="2026"
                      className={cn(tw.input.base, tw.input.default, 'text-sm rounded-lg py-2')}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, rankings: form.rankings.filter((_: any, j: number) => j !== i) })}
                    className="p-2 rounded-lg text-[var(--space-text-muted)] hover:text-[var(--space-semantic-danger)] hover:bg-[var(--space-surface-muted)] transition-colors"
                    aria-label="Remove ranking"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm({ ...form, rankings: [...(form.rankings || []), { source: 'QS', scope: 'university', rank: '', year: '' }] })}
                className={`flex items-center gap-1 text-xs font-medium hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
              >
                <Plus className="w-3.5 h-3.5" />
                Add ranking
              </button>
              <EditActions
                saving={saving}
                onCancel={cancelEdit}
                onSave={() => persist({ ...profile, rankings: (form.rankings || []).filter((r: RankingItem) => r.rank.trim()) })}
              />
            </div>
          ) : rankings.length ? (
            <div className="space-y-2">
              {rankings.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--space-border-default)] bg-white px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${typography.color.primary}`}>{RANKING_SOURCE_LABELS[r.source] || r.source}</p>
                    <p className={`text-xs ${typography.color.muted}`}>
                      {r.scope === 'program' ? 'Program ranking' : 'University ranking'}
                      {r.year ? ` · ${r.year}` : ''}
                    </p>
                  </div>
                  <span className={`text-base font-semibold flex-shrink-0 ${typography.color.primary}`}>{r.rank}</span>
                </div>
              ))}
              {profile.rankingsCheckedAt && (
                <p className={`text-[11px] ${typography.color.muted}`}>Checked against the latest published rankings.</p>
              )}
            </div>
          ) : (
            <p className={`text-sm ${typography.color.muted}`}>
              No verified rankings yet — they're pulled from THE, QS, and ARWU when the profile is generated (plus FT for business programs).
            </p>
          )}
        </SectionShell>

        {/* Key facts: tuition, duration, intake */}
        <SectionShell
          icon={Banknote}
          title="Tuition, duration & intake"
          editing={editing === 'facts'}
          onEdit={() =>
            startEdit('facts', { tuitionAnnual: profile.tuitionAnnual, durationMonths: profile.durationMonths, intakes: [...(profile.intakes.length ? profile.intakes : intakes)] })
          }
        >
          {editing === 'facts' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              <Field label="Annual tuition fee" value={form.tuitionAnnual || ''} onChange={(v) => setForm({ ...form, tuitionAnnual: v })} placeholder="e.g. $32,400 per year" />
              <Field label="Program duration (months)" value={form.durationMonths || ''} onChange={(v) => setForm({ ...form, durationMonths: v })} placeholder="e.g. 24 months" />
              <div>
                <span className={`block text-xs font-medium mb-1.5 ${typography.color.secondary}`}>Intake terms</span>
                <div className="flex gap-2">
                  {INTAKE_TERMS.map((term) => {
                    const active = (form.intakes || []).includes(term);
                    return (
                      <button
                        key={term}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            intakes: active ? form.intakes.filter((t: string) => t !== term) : [...(form.intakes || []), term],
                          })
                        }
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                          active
                            ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                            : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                        )}
                      >
                        {term}
                      </button>
                    );
                  })}
                </div>
              </div>
              <EditActions
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persist({
                    ...profile,
                    tuitionAnnual: form.tuitionAnnual.trim(),
                    durationMonths: form.durationMonths.trim(),
                    intakes: form.intakes || [],
                  })
                }
              />
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--space-border-default)] bg-white px-4 py-2">
              <FactRow label="Annual tuition" value={profile.tuitionAnnual} />
              <FactRow label="Duration" value={profile.durationMonths} />
              <FactRow label="Intake" value={(profile.intakes.length ? profile.intakes : intakes).join(', ')} />
              {!profile.tuitionAnnual && !profile.durationMonths && !profile.intakes.length && !intakes.length && (
                <p className={`text-sm py-1 ${typography.color.muted}`}>Not set yet — answer Alma's questions in chat or edit manually.</p>
              )}
            </div>
          )}
        </SectionShell>

        {/* Capstone requirements */}
        <SectionShell icon={CalendarClock} title="Capstone requirements" editing={editing === 'capstone'} onEdit={() => startEdit('capstone', { capstone: profile.capstone })}>
          {editing === 'capstone' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              <div className="flex flex-wrap gap-2">
                {CAPSTONE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setForm({ ...form, capstone: option })}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      form.capstone === option
                        ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                        : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                    )}
                  >
                    {option}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, capstone: '' })}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    !form.capstone
                      ? 'border-[var(--space-brand-primary)] bg-[var(--space-brand-primary-50)] text-[var(--space-text-primary)]'
                      : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                  )}
                >
                  Not set
                </button>
              </div>
              <EditActions saving={saving} onCancel={cancelEdit} onSave={() => persist({ ...profile, capstone: form.capstone })} />
            </div>
          ) : profile.capstone ? (
            <p className={`text-sm ${typography.color.primary}`}>
              {profile.capstone}
              <span className={`block text-xs mt-1 ${typography.color.muted}`}>
                {profile.capstone === 'Coursework only'
                  ? 'Graduation is based entirely on coursework.'
                  : 'Required for graduation. Optional components live under unique features.'}
              </span>
            </p>
          ) : (
            <p className={`text-sm ${typography.color.muted}`}>Not set yet — whether a project, internship/co-op, or thesis is required to graduate.</p>
          )}
        </SectionShell>

        {/* Unique features */}
        <SectionShell
          icon={Award}
          title="Unique features"
          editing={editing === 'features'}
          onEdit={() => startEdit('features', { text: profile.uniqueFeatures.join('\n') })}
        >
          {editing === 'features' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              <Field
                label="One feature per line"
                textarea
                value={form.text || ''}
                onChange={(v) => setForm({ ...form, text: v })}
                placeholder={'Exchange semester with partner universities\nOptional summer internship'}
              />
              <EditActions saving={saving} onCancel={cancelEdit} onSave={() => persist({ ...profile, uniqueFeatures: splitLines(form.text || '') })} />
            </div>
          ) : profile.uniqueFeatures.length ? (
            <ul className="space-y-1.5 pl-5" style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>
              {profile.uniqueFeatures.map((f, i) => (
                <li key={i} className={`text-sm leading-relaxed ${typography.color.secondary}`} style={{ display: 'list-item' }}>
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`text-sm ${typography.color.muted}`}>Nothing captured yet — the brochure and your chat with Alma fill this in.</p>
          )}
        </SectionShell>

        {/* Post-study outcomes */}
        <SectionShell
          icon={Briefcase}
          title="Post-study outcomes"
          editing={editing === 'outcomes'}
          onEdit={() =>
            startEdit('outcomes', {
              placement3m: profile.outcomes.placement3m,
              placement6m: profile.outcomes.placement6m,
              employers: profile.outcomes.employers.join('\n'),
            })
          }
        >
          {editing === 'outcomes' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              <Field label="Placement within 3 months" value={form.placement3m || ''} onChange={(v) => setForm({ ...form, placement3m: v })} placeholder="e.g. 87%" />
              <Field label="Placement within 6 months" value={form.placement6m || ''} onChange={(v) => setForm({ ...form, placement6m: v })} placeholder="e.g. 94%" />
              <Field label="Popular employers (one per line)" textarea value={form.employers || ''} onChange={(v) => setForm({ ...form, employers: v })} />
              <EditActions
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persist({
                    ...profile,
                    outcomes: {
                      placement3m: form.placement3m.trim(),
                      placement6m: form.placement6m.trim(),
                      employers: splitLines(form.employers || ''),
                    },
                  })
                }
              />
            </div>
          ) : profile.outcomes.placement3m || profile.outcomes.placement6m || profile.outcomes.employers.length ? (
            <div className="rounded-xl border border-[var(--space-border-default)] bg-white px-4 py-2">
              <FactRow label="Placed within 3 months" value={profile.outcomes.placement3m} />
              <FactRow label="Placed within 6 months" value={profile.outcomes.placement6m} />
              {profile.outcomes.employers.length > 0 && (
                <div className="py-1.5">
                  <span className={`block text-sm mb-1.5 ${typography.color.muted}`}>Popular employers</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.outcomes.employers.map((e, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-full bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-xs text-[var(--space-text-primary)]"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className={`text-sm ${typography.color.muted}`}>No outcome data yet — placement rates and popular employers show here.</p>
          )}
        </SectionShell>

        {/* Scholarships */}
        <SectionShell icon={Landmark} title="Scholarships" editing={editing === 'scholarships'} onEdit={() => startEdit('scholarships', { text: profile.scholarships })}>
          {editing === 'scholarships' ? (
            <div className="space-y-3 rounded-xl border border-[var(--space-border-default)] bg-white p-4">
              <Field label="Scholarships available" textarea value={form.text || ''} onChange={(v) => setForm({ ...form, text: v })} placeholder="e.g. Merit scholarships up to 40% of tuition" />
              <EditActions saving={saving} onCancel={cancelEdit} onSave={() => persist({ ...profile, scholarships: form.text.trim() })} />
            </div>
          ) : profile.scholarships ? (
            <p className={`text-sm leading-relaxed whitespace-pre-line ${typography.color.secondary}`}>{profile.scholarships}</p>
          ) : (
            <p className={`text-sm ${typography.color.muted}`}>Not set yet.</p>
          )}
        </SectionShell>

        <div className={`mt-8 pb-4 flex items-center gap-1.5 text-xs ${typography.color.muted}`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Signed in as {store.email} · Program answers captured in chat: {Object.keys(intake.answers).length}
        </div>
      </div>
    </div>
  );
}

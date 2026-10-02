// Scout — right column: Profile sub-section.
// Built from the parsed resume + what the student shares in chat. Every part is
// manually editable except the AI-generated summaries; manual edits trigger a
// refresh of the relevant Scout summary (per the update logic in the PRD).

import { useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Eye,
  EyeOff,
  FlaskConical,
  GraduationCap,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { cn, tw, typography } from '../../lib/colors';
import { regenerateItemSummary } from './scout-agent';
import { useScout } from './scout-store';
import { ProfileData, getInitials, toTitleCaseName } from './scout-types';

type SummarySection = 'education' | 'work' | 'research' | 'extracurriculars';

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

function ScoutSummary({ text, refreshing }: { text: string; refreshing?: boolean }) {
  if (!text && !refreshing) return null;
  return (
    <div className="mt-3 rounded-lg bg-[var(--space-surface-muted)] border-l-2 border-[var(--space-brand-primary)] px-3 py-2">
      <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${typography.color.brand}`}>
        <Sparkles className="w-3 h-3" />
        Scout's summary
      </p>
      {refreshing ? (
        <p className={`flex items-center gap-1.5 text-xs mt-1 ${typography.color.muted}`}>
          <Loader2 className="w-3 h-3 animate-spin" />
          Updating to reflect your edit…
        </p>
      ) : (
        <p className={`text-sm mt-1 leading-relaxed ${typography.color.secondary}`}>{text}</p>
      )}
    </div>
  );
}

function SectionShell({
  icon: Icon,
  title,
  onAdd,
  children,
}: {
  icon: any;
  title: string;
  onAdd?: () => void;
  children: any;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-[var(--space-border-default)]">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${typography.color.primary}`}>
          <Icon className="w-4 h-4 text-[var(--space-text-secondary)]" />
          {title}
        </h3>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className={`flex items-center gap-1 text-xs font-medium hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        )}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function ItemCard({
  onEdit,
  onDelete,
  children,
}: {
  onEdit: () => void;
  onDelete: () => void;
  children: any;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="group rounded-xl border border-[var(--space-border-default)] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="px-2 py-1 rounded-md text-xs font-medium text-white bg-[var(--space-semantic-danger)] hover:brightness-95"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={`px-2 py-1 rounded-md text-xs font-medium ${typography.color.secondary} hover:bg-[var(--space-surface-muted)]`}
              >
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="p-1.5 rounded-md text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)] transition-colors"
                aria-label="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="p-1.5 rounded-md text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)] hover:text-[var(--space-semantic-danger)] transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditActions({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn('px-4 py-2 rounded-lg text-xs', tw.button.primary, saving && tw.button.disabled)}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} className={cn('px-4 py-2 rounded-lg text-xs', tw.button.secondary)}>
        Cancel
      </button>
    </div>
  );
}

export default function ScoutProfile() {
  const { profile, saveProfile, commitProfileItemSummary, email } = useScout();
  const [editing, setEditing] = useState<string | null>(null); // e.g. "header" | "education-0" | "work-new"
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState('');
  const displayProfileName = toTitleCaseName(profile.name || email.split('@')[0]);

  const startEdit = (key: string, initial: any) => {
    setEditing(key);
    setForm(initial);
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({});
  };

  // The visibility control also persists the profile and closes the active
  // editor. Fold that editor's live form values into the save first so the
  // toggle cannot discard an entry the student is still composing.
  const mergePendingEdit = (base: ProfileData): ProfileData => {
    if (!editing) return base;

    if (editing === 'header') {
      return {
        ...base,
        name: form.name || '',
        headline: form.headline || '',
        location: form.location || '',
      };
    }

    if (editing === 'education-new') {
      return { ...base, education: [...base.education, { ...form, aiSummary: '' }] };
    }
    if (editing.startsWith('education-')) {
      const index = Number(editing.slice('education-'.length));
      if (Number.isInteger(index) && base.education[index]) {
        return {
          ...base,
          education: base.education.map((item, i) => (i === index ? { ...item, ...form } : item)),
        };
      }
    }

    if (editing === 'work-new') {
      return { ...base, work: [...base.work, { ...form, aiSummary: '' }] };
    }
    if (editing.startsWith('work-')) {
      const index = Number(editing.slice('work-'.length));
      if (Number.isInteger(index) && base.work[index]) {
        return {
          ...base,
          work: base.work.map((item, i) => (i === index ? { ...item, ...form } : item)),
        };
      }
    }

    if (editing === 'research-new') {
      return { ...base, research: [...base.research, { ...form, aiSummary: '' }] };
    }
    if (editing.startsWith('research-')) {
      const index = Number(editing.slice('research-'.length));
      if (Number.isInteger(index) && base.research[index]) {
        return {
          ...base,
          research: base.research.map((item, i) => (i === index ? { ...item, ...form } : item)),
        };
      }
    }

    if (editing === 'extra-new') {
      return {
        ...base,
        extracurriculars: [...base.extracurriculars, { ...form, aiSummary: '' }],
      };
    }
    if (editing.startsWith('extra-')) {
      const index = Number(editing.slice('extra-'.length));
      if (Number.isInteger(index) && base.extracurriculars[index]) {
        return {
          ...base,
          extracurriculars: base.extracurriculars.map((item, i) =>
            i === index ? { ...item, ...form } : item
          ),
        };
      }
    }

    if (editing === 'misc-new') {
      return {
        ...base,
        misc: [...base.misc, { title: form.title || '', detail: form.detail || '' }],
      };
    }
    if (editing.startsWith('misc-')) {
      const index = Number(editing.slice('misc-'.length));
      if (Number.isInteger(index) && base.misc[index]) {
        return {
          ...base,
          misc: base.misc.map((item, i) =>
            i === index ? { title: form.title || '', detail: form.detail || '' } : item
          ),
        };
      }
    }

    return base;
  };

  // Persist a profile change, then refresh the relevant Scout summary so it
  // reflects the edit (runs in the background; the UI shows a small indicator).
  const persistWithSummary = async (
    next: ProfileData,
    summaryTarget?: { section: SummarySection | 'skills'; index?: number }
  ) => {
    setSaving(true);
    try {
      let prepared = next;
      if (summaryTarget?.section === 'skills') {
        prepared = { ...next, skillsSummary: '' };
      } else if (summaryTarget) {
        const section = summaryTarget.section;
        const index = summaryTarget.index ?? 0;
        prepared = {
          ...next,
          [section]: (next[section] as any[]).map((item, itemIndex) =>
            itemIndex === index ? { ...item, aiSummary: '' } : item
          ),
        } as ProfileData;
      }
      const { revision } = await saveProfile(prepared);
      setEditing(null);
      setForm({});
      if (summaryTarget) {
        const key = summaryTarget.section === 'skills' ? 'skills' : `${summaryTarget.section}-${summaryTarget.index}`;
        setRefreshingKey(key);
        try {
          if (summaryTarget.section === 'skills') {
            const summary = await regenerateItemSummary('skills', null, prepared);
            if (summary) await commitProfileItemSummary(revision, 'skills', null, summary);
          } else {
            const idx = summaryTarget.index ?? 0;
            const list = prepared[summaryTarget.section] as any[];
            const item = list[idx];
            if (item) {
              const summary = await regenerateItemSummary(summaryTarget.section, item, prepared);
              if (summary) {
                await commitProfileItemSummary(revision, summaryTarget.section, idx, summary);
              }
            }
          }
        } finally {
          setRefreshingKey(null);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (section: SummarySection | 'misc', index: number) => {
    const list = (profile[section] as any[]).filter((_, i) => i !== index);
    persistWithSummary({ ...profile, [section]: list } as ProfileData);
  };

  const addSkill = () => {
    const skill = skillDraft.trim();
    if (!skill || profile.skills.some((x) => x.toLowerCase() === skill.toLowerCase())) {
      setSkillDraft('');
      return;
    }
    setSkillDraft('');
    persistWithSummary({ ...profile, skills: [...profile.skills, skill] }, { section: 'skills' });
  };

  const removeSkill = (skill: string) => {
    persistWithSummary({ ...profile, skills: profile.skills.filter((x) => x !== skill) }, { section: 'skills' });
  };

  const isEmpty =
    !profile.headline &&
    !profile.location &&
    !profile.bio &&
    profile.education.length === 0 &&
    profile.work.length === 0 &&
    profile.research.length === 0 &&
    profile.skills.length === 0 &&
    profile.extracurriculars.length === 0 &&
    profile.misc.length === 0;

  return (
    <div id="profile" className="h-full min-h-0 flex flex-col bg-white">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--space-border-default)]">
        <h1 className={`text-lg font-semibold ${typography.color.primary}`}>Profile</h1>
        <button
          type="button"
          onClick={() =>
            persistWithSummary({ ...mergePendingEdit(profile), visible: !profile.visible })
          }
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
            profile.visible
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-[var(--space-border-default)] bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]'
          )}
          title="Toggle whether universities on the platform can see your profile"
        >
          {profile.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {profile.visible ? 'Profile visible to universities' : 'Profile hidden'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {/* Header card */}
        <div className="rounded-2xl border border-[var(--space-border-default)] bg-gradient-to-br from-[var(--space-surface-muted)] to-white p-5">
          {editing === 'header' ? (
            <div className="space-y-3">
              <Field label="Name" value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} placeholder="Your full name" />
              <Field
                label="Headline"
                value={form.headline || ''}
                onChange={(v) => setForm({ ...form, headline: v })}
                placeholder="e.g. Economics undergrad | Debate captain | Aspiring analyst"
              />
              <Field label="Location (where you're based)" value={form.location || ''} onChange={(v) => setForm({ ...form, location: v })} placeholder="City, Country" />
              <EditActions
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persistWithSummary({ ...profile, name: form.name || '', headline: form.headline || '', location: form.location || '' })
                }
              />
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h2 className={`text-xl font-semibold ${typography.color.primary}`}>{displayProfileName}</h2>
                {profile.headline && <p className={`text-sm mt-1 ${typography.color.secondary}`}>{profile.headline}</p>}
                <p className={`flex items-center gap-1.5 text-sm mt-3 ${typography.color.muted}`}>
                  <MapPin className="w-4 h-4" />
                  {profile.location || 'Location not set'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="w-14 h-14 rounded-full bg-[var(--space-brand-primary-900)] text-white flex items-center justify-center text-lg font-semibold">
                  {getInitials(displayProfileName || email)}
                </div>
                <button
                  type="button"
                  onClick={() => startEdit('header', { name: profile.name, headline: profile.headline, location: profile.location })}
                  className={`flex items-center gap-1 text-xs hover:text-[var(--space-text-primary)] transition-colors ${typography.color.secondary}`}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>

        {isEmpty && (
          <div className={`mt-4 rounded-2xl border border-dashed border-[var(--space-border-strong)] p-5 text-sm text-center ${typography.color.secondary}`}>
            Your profile is empty so far. Upload your resume in the chat (or Documents → Add file) and Scout will build it out — or add entries manually below.
          </div>
        )}

        {/* Bio — AI generated, not manually editable */}
        <div className="mt-6">
          <h3 className={`text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>Bio</h3>
          {profile.bioGeneration?.status === 'pending' ? (
            <p className={`flex items-center gap-2 text-sm mt-3 ${typography.color.muted}`} role="status" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin" />
              Scout is updating your Bio to reflect the latest Profile changes…
            </p>
          ) : profile.bioGeneration?.status === 'failed' ? (
            <p className={`text-sm mt-3 leading-relaxed ${typography.color.danger}`} role="alert">
              Scout couldn't refresh your Bio just now. Your Profile changes are saved, and the Bio will retry after the next factual update or resume re-read.
            </p>
          ) : (
            <p className={`text-sm mt-3 leading-relaxed ${profile.bio ? typography.color.secondary : typography.color.muted}`}>
              {profile.bio || 'Scout writes your bio from your experience, academics, skills, research, and extracurriculars once it knows them.'}
            </p>
          )}
        </div>

        {/* What you're looking for — AI generated */}
        <div className="mt-6">
          <h3 className={`text-sm font-semibold pb-2 border-b border-[var(--space-border-default)] ${typography.color.primary}`}>
            What {profile.name ? displayProfileName.split(' ')[0] : 'you'} {profile.name ? 'is' : 'are'} looking for
          </h3>
          <p className={`text-sm mt-3 leading-relaxed ${profile.lookingFor ? typography.color.secondary : typography.color.muted}`}>
            {profile.lookingFor || 'This fills in from your conversation with Scout — what you want from your education, and what matters in a program.'}
          </p>
        </div>

        {/* Education */}
        <SectionShell
          icon={GraduationCap}
          title="Education"
          onAdd={() =>
            startEdit('education-new', { institute: '', degree: '', field: '', grade: '', startYear: '', endYear: '', inProgress: false })
          }
        >
          {editing === 'education-new' && (
            <EducationForm
              form={form}
              setForm={setForm}
              saving={saving}
              onCancel={cancelEdit}
              onSave={() =>
                persistWithSummary(
                  { ...profile, education: [...profile.education, { ...form, aiSummary: '' }] },
                  { section: 'education', index: profile.education.length }
                )
              }
            />
          )}
          {profile.education.length === 0 && editing !== 'education-new' && (
            <p className={`text-sm ${typography.color.muted}`}>No education added yet.</p>
          )}
          {profile.education.map((item, i) =>
            editing === `education-${i}` ? (
              <EducationForm
                key={i}
                form={form}
                setForm={setForm}
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persistWithSummary(
                    { ...profile, education: profile.education.map((it, idx) => (idx === i ? { ...it, ...form } : it)) },
                    { section: 'education', index: i }
                  )
                }
              />
            ) : (
              <ItemCard key={i} onEdit={() => startEdit(`education-${i}`, { ...item })} onDelete={() => removeItem('education', i)}>
                <p className={`text-sm font-semibold ${typography.color.primary}`}>{item.institute || 'Institution'}</p>
                <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>
                  {[item.degree, item.field].filter(Boolean).join(', ')}
                  {item.inProgress && !item.endYear && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)] text-[11px] font-medium">
                      In Progress
                    </span>
                  )}
                </p>
                <p className={`text-xs mt-1 ${typography.color.muted}`}>
                  {[item.startYear && `${item.startYear} – ${item.inProgress && !item.endYear ? 'present' : item.endYear || ''}`, item.grade && `Grade: ${item.grade}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <ScoutSummary
                  text={item.inProgress && item.endYear ? '' : item.aiSummary}
                  refreshing={refreshingKey === `education-${i}`}
                />
              </ItemCard>
            )
          )}
        </SectionShell>

        {/* Work experience */}
        <SectionShell
          icon={Briefcase}
          title="Work experience"
          onAdd={() => startEdit('work-new', { company: '', title: '', startDate: '', endDate: '', current: false, description: '' })}
        >
          {editing === 'work-new' && (
            <WorkForm
              form={form}
              setForm={setForm}
              saving={saving}
              onCancel={cancelEdit}
              onSave={() =>
                persistWithSummary(
                  { ...profile, work: [...profile.work, { ...form, aiSummary: '' }] },
                  { section: 'work', index: profile.work.length }
                )
              }
            />
          )}
          {profile.work.length === 0 && editing !== 'work-new' && <p className={`text-sm ${typography.color.muted}`}>No work experience added yet.</p>}
          {profile.work.map((item, i) =>
            editing === `work-${i}` ? (
              <WorkForm
                key={i}
                form={form}
                setForm={setForm}
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persistWithSummary(
                    { ...profile, work: profile.work.map((it, idx) => (idx === i ? { ...it, ...form } : it)) },
                    { section: 'work', index: i }
                  )
                }
              />
            ) : (
              <ItemCard key={i} onEdit={() => startEdit(`work-${i}`, { ...item })} onDelete={() => removeItem('work', i)}>
                <p className={`text-sm font-semibold ${typography.color.primary}`}>{item.title || 'Role'}</p>
                <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>{item.company}</p>
                <p className={`text-xs mt-1 ${typography.color.muted}`}>
                  {item.startDate}
                  {item.startDate && (item.current || item.endDate) ? ' – ' : ''}
                  {item.current ? 'present' : item.endDate}
                </p>
                {item.description && <p className={`text-sm mt-2 leading-relaxed whitespace-pre-wrap ${typography.color.secondary}`}>{item.description}</p>}
                <ScoutSummary text={item.aiSummary} refreshing={refreshingKey === `work-${i}`} />
              </ItemCard>
            )
          )}
        </SectionShell>

        {/* Research */}
        <SectionShell
          icon={FlaskConical}
          title="Research & publications"
          onAdd={() => startEdit('research-new', { title: '', venue: '', date: '', url: '' })}
        >
          {editing === 'research-new' && (
            <ResearchForm
              form={form}
              setForm={setForm}
              saving={saving}
              onCancel={cancelEdit}
              onSave={() =>
                persistWithSummary(
                  { ...profile, research: [...profile.research, { ...form, aiSummary: '' }] },
                  { section: 'research', index: profile.research.length }
                )
              }
            />
          )}
          {profile.research.length === 0 && editing !== 'research-new' && (
            <p className={`text-sm ${typography.color.muted}`}>No research or publications added yet.</p>
          )}
          {profile.research.map((item, i) =>
            editing === `research-${i}` ? (
              <ResearchForm
                key={i}
                form={form}
                setForm={setForm}
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persistWithSummary(
                    { ...profile, research: profile.research.map((it, idx) => (idx === i ? { ...it, ...form } : it)) },
                    { section: 'research', index: i }
                  )
                }
              />
            ) : (
              <ItemCard key={i} onEdit={() => startEdit(`research-${i}`, { ...item })} onDelete={() => removeItem('research', i)}>
                <p className={`text-sm font-semibold ${typography.color.primary}`}>{item.title || 'Publication'}</p>
                <p className={`text-xs mt-1 ${typography.color.muted}`}>{[item.venue, item.date].filter(Boolean).join(' · ')}</p>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--space-brand-primary-700)] underline break-all"
                  >
                    {item.url}
                  </a>
                )}
                <ScoutSummary text={item.aiSummary} refreshing={refreshingKey === `research-${i}`} />
              </ItemCard>
            )
          )}
        </SectionShell>

        {/* Skills */}
        <SectionShell icon={Award} title="Skills">
          <div className="rounded-xl border border-[var(--space-border-default)] bg-white p-4">
            {profile.skills.length === 0 ? (
              <p className={`text-sm ${typography.color.muted}`}>No skills yet — add your core and technical skills.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] text-sm text-[var(--space-text-primary)]"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="p-0.5 rounded-full hover:bg-white transition-colors"
                      aria-label={`Remove ${skill}`}
                    >
                      <X className="w-3 h-3 text-[var(--space-text-muted)]" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="Add a skill…"
                className={cn(tw.input.base, tw.input.default, 'flex-1 text-sm rounded-lg py-2')}
              />
              <button type="button" onClick={addSkill} disabled={!skillDraft.trim()} className={cn('px-4 rounded-lg text-xs', tw.button.secondary, !skillDraft.trim() && tw.button.disabled)}>
                Add
              </button>
            </div>
            <ScoutSummary text={profile.skillsSummary} refreshing={refreshingKey === 'skills'} />
          </div>
        </SectionShell>

        {/* Extracurriculars */}
        <SectionShell icon={BookOpen} title="Extracurriculars" onAdd={() => startEdit('extra-new', { title: '', description: '' })}>
          {editing === 'extra-new' && (
            <ExtraForm
              form={form}
              setForm={setForm}
              saving={saving}
              onCancel={cancelEdit}
              onSave={() =>
                persistWithSummary(
                  { ...profile, extracurriculars: [...profile.extracurriculars, { ...form, aiSummary: '' }] },
                  { section: 'extracurriculars', index: profile.extracurriculars.length }
                )
              }
            />
          )}
          {profile.extracurriculars.length === 0 && editing !== 'extra-new' && (
            <p className={`text-sm ${typography.color.muted}`}>No extracurricular or philanthropic activities added yet.</p>
          )}
          {profile.extracurriculars.map((item, i) =>
            editing === `extra-${i}` ? (
              <ExtraForm
                key={i}
                form={form}
                setForm={setForm}
                saving={saving}
                onCancel={cancelEdit}
                onSave={() =>
                  persistWithSummary(
                    { ...profile, extracurriculars: profile.extracurriculars.map((it, idx) => (idx === i ? { ...it, ...form } : it)) },
                    { section: 'extracurriculars', index: i }
                  )
                }
              />
            ) : (
              <ItemCard key={i} onEdit={() => startEdit(`extra-${i}`, { ...item })} onDelete={() => removeItem('extracurriculars', i)}>
                <p className={`text-sm font-semibold ${typography.color.primary}`}>{item.title || 'Activity'}</p>
                {item.description && <p className={`text-sm mt-1 leading-relaxed ${typography.color.secondary}`}>{item.description}</p>}
                <ScoutSummary text={item.aiSummary} refreshing={refreshingKey === `extracurriculars-${i}`} />
              </ItemCard>
            )
          )}
        </SectionShell>

        {/* Misc */}
        <SectionShell icon={Plus} title="More about you" onAdd={() => startEdit('misc-new', { title: '', detail: '' })}>
          {editing === 'misc-new' && (
            <div className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 space-y-3">
              <Field label="Title" value={form.title || ''} onChange={(v) => setForm({ ...form, title: v })} placeholder="e.g. Languages" />
              <Field label="Detail" value={form.detail || ''} onChange={(v) => setForm({ ...form, detail: v })} textarea placeholder="Anything else that builds out your baseline" />
              <EditActions
                saving={saving}
                onCancel={cancelEdit}
                onSave={() => persistWithSummary({ ...profile, misc: [...profile.misc, { title: form.title || '', detail: form.detail || '' }] })}
              />
            </div>
          )}
          {profile.misc.length === 0 && editing !== 'misc-new' && (
            <p className={`text-sm ${typography.color.muted}`}>Anything that doesn't fit above but should be part of your baseline.</p>
          )}
          {profile.misc.map((item, i) =>
            editing === `misc-${i}` ? (
              <div key={i} className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 space-y-3">
                <Field label="Title" value={form.title || ''} onChange={(v) => setForm({ ...form, title: v })} />
                <Field label="Detail" value={form.detail || ''} onChange={(v) => setForm({ ...form, detail: v })} textarea />
                <EditActions
                  saving={saving}
                  onCancel={cancelEdit}
                  onSave={() =>
                    persistWithSummary({ ...profile, misc: profile.misc.map((it, idx) => (idx === i ? { title: form.title, detail: form.detail } : it)) })
                  }
                />
              </div>
            ) : (
              <ItemCard key={i} onEdit={() => startEdit(`misc-${i}`, { ...item })} onDelete={() => removeItem('misc', i)}>
                <p className={`text-sm font-semibold ${typography.color.primary}`}>{item.title || 'Detail'}</p>
                {item.detail && <p className={`text-sm mt-1 leading-relaxed ${typography.color.secondary}`}>{item.detail}</p>}
              </ItemCard>
            )
          )}
        </SectionShell>

        <div className="h-8" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section edit forms

function EducationForm({ form, setForm, saving, onSave, onCancel }: any) {
  return (
    <div className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 space-y-3">
      <Field label="Institution" value={form.institute || ''} onChange={(v) => setForm({ ...form, institute: v })} placeholder="e.g. University of Toronto" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Degree" value={form.degree || ''} onChange={(v) => setForm({ ...form, degree: v })} placeholder="e.g. BSc" />
        <Field label="Major / field of study" value={form.field || ''} onChange={(v) => setForm({ ...form, field: v })} placeholder="e.g. Computer Science" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Start year" value={form.startYear || ''} onChange={(v) => setForm({ ...form, startYear: v })} placeholder="2021" />
        <Field label="End year" value={form.endYear || ''} onChange={(v) => setForm({ ...form, endYear: v })} placeholder="2025" />
        <Field label="GPA / grade / %" value={form.grade || ''} onChange={(v) => setForm({ ...form, grade: v })} placeholder="In the school's scale" />
      </div>
      <label className={`flex items-center gap-2 text-sm ${typography.color.secondary}`}>
        <input type="checkbox" checked={!!form.inProgress} onChange={(e) => setForm({ ...form, inProgress: e.target.checked })} className="w-4 h-4" />
        Still in progress (not yet graduated)
      </label>
      <EditActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </div>
  );
}

function WorkForm({ form, setForm, saving, onSave, onCancel }: any) {
  return (
    <div className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company" value={form.company || ''} onChange={(v) => setForm({ ...form, company: v })} />
        <Field label="Position title" value={form.title || ''} onChange={(v) => setForm({ ...form, title: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" value={form.startDate || ''} onChange={(v) => setForm({ ...form, startDate: v })} placeholder="e.g. Jun 2023" />
        <Field label="End date" value={form.endDate || ''} onChange={(v) => setForm({ ...form, endDate: v })} placeholder="Blank if current" />
      </div>
      <label className={`flex items-center gap-2 text-sm ${typography.color.secondary}`}>
        <input type="checkbox" checked={!!form.current} onChange={(e) => setForm({ ...form, current: e.target.checked })} className="w-4 h-4" />
        I currently work here
      </label>
      <Field label="Description" value={form.description || ''} onChange={(v) => setForm({ ...form, description: v })} textarea placeholder="What you did in this position — as written on your resume" />
      <EditActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </div>
  );
}

function ResearchForm({ form, setForm, saving, onSave, onCancel }: any) {
  return (
    <div className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 space-y-3">
      <Field label="Title of publication" value={form.title || ''} onChange={(v) => setForm({ ...form, title: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Journal / publication location" value={form.venue || ''} onChange={(v) => setForm({ ...form, venue: v })} />
        <Field label="Publication date" value={form.date || ''} onChange={(v) => setForm({ ...form, date: v })} placeholder="e.g. Mar 2025" />
      </div>
      <Field label="URL of online version" value={form.url || ''} onChange={(v) => setForm({ ...form, url: v })} placeholder="https://…" />
      <EditActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </div>
  );
}

function ExtraForm({ form, setForm, saving, onSave, onCancel }: any) {
  return (
    <div className="rounded-xl border border-[var(--space-border-default)] bg-white p-4 space-y-3">
      <Field label="Activity" value={form.title || ''} onChange={(v) => setForm({ ...form, title: v })} placeholder="e.g. Debate club president" />
      <Field label="Description" value={form.description || ''} onChange={(v) => setForm({ ...form, description: v })} textarea />
      <EditActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </div>
  );
}

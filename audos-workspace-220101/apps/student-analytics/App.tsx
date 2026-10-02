import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, BookOpen, Database, GraduationCap, RefreshCw, Search, Users } from 'lucide-react';

declare function useWorkspaceDB(table: string, options?: Record<string, any>): {
  data: any[];
  loading: boolean;
  error: Error | null;
  total: number;
  refresh: () => void;
};

type Tab = 'overview' | 'students' | 'programmes' | 'interactions' | 'raw';
type Range = 'all' | '30' | '7' | '1';

const tabs: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'programmes', label: 'Programme library', icon: BookOpen },
  { id: 'interactions', label: 'Interactions', icon: Activity },
  { id: 'raw', label: 'All fields', icon: Database },
];

const dateValue = (row: any) => new Date(row.occurred_at || row.last_active || row.last_seen_active || row.created_at || 0).getTime();
const inRange = (row: any, range: Range) => range === 'all' || dateValue(row) >= Date.now() - Number(range) * 86400000;
const list = (value: any): any[] => (Array.isArray(value) ? value : []);
const fmt = (value: any) => {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail?: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--space-text-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--space-text-primary)]">{value}</p>
          {detail && <p className="mt-1 text-xs text-[var(--space-text-secondary)]">{detail}</p>}
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function JsonBlock({ value }: { value: any }) {
  return <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--space-neutral-900)] p-3 text-[11px] leading-relaxed text-white">{JSON.stringify(value, null, 2)}</pre>;
}

export default function StudentAnalyticsApp() {
  const profilesDb = useWorkspaceDB('inbox_student_profile_snapshots', { shared: true, orderBy: { column: 'last_active', direction: 'desc' }, limit: 5000 });
  const catalogueDb = useWorkspaceDB('inbox_program_catalog_events', { shared: true, orderBy: { column: 'last_seen_active', direction: 'desc' }, limit: 5000 });
  const programmeEventsDb = useWorkspaceDB('inbox_student_program_interactions', { shared: true, orderBy: { column: 'occurred_at', direction: 'desc' }, limit: 5000 });
  const interactionsDb = useWorkspaceDB('inbox_student_interactions', { shared: true, orderBy: { column: 'occurred_at', direction: 'desc' }, limit: 5000 });
  const legacyProfilesDb = useWorkspaceDB('scout_state_snapshots', { shared: true, orderBy: { column: 'id', direction: 'desc' }, limit: 5000 });
  const legacyProgrammesDb = useWorkspaceDB('scout_programs', { shared: true, orderBy: { column: 'created_at', direction: 'desc' }, limit: 5000 });
  const legacyMessagesDb = useWorkspaceDB('scout_messages', { shared: true, orderBy: { column: 'created_at', direction: 'desc' }, limit: 5000 });
  const legacyProgrammeEventsDb = useWorkspaceDB('scout_program_events', { shared: true, orderBy: { column: 'created_at', direction: 'desc' }, limit: 5000 });
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('all');
  const [query, setQuery] = useState('');

  const refreshAll = () => [profilesDb, catalogueDb, programmeEventsDb, interactionsDb, legacyProfilesDb, legacyProgrammesDb, legacyMessagesDb, legacyProgrammeEventsDb].forEach((source) => source.refresh());
  useEffect(() => {
    const timer = window.setInterval(refreshAll, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const loading = profilesDb.loading || catalogueDb.loading || programmeEventsDb.loading || interactionsDb.loading || legacyProfilesDb.loading;
  const error = profilesDb.error || catalogueDb.error || programmeEventsDb.error || interactionsDb.error;
  const latestProfiles = useMemo(() => {
    const byStudent = new Map<string, any>();
    for (const row of profilesDb.data || []) {
      if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, row);
    }
    for (const row of legacyProfilesDb.data || []) {
      if (byStudent.has(row.user_email)) continue;
      const intake = row.intake_json || {};
      byStudent.set(row.user_email, {
        id: `legacy-${row.id}`,
        student_id: row.user_email,
        intake_json: intake,
        profile_json: row.profile_json,
        citizenship_countries: intake.citizenshipCountries || [],
        international_only: !!intake.internationalOnly,
        programme_interests: intake.programmeInterests || [],
        apprenticeship_opt_in: !!intake.apprenticeshipOptIn,
        apprenticeship_eligible_countries: intake.apprenticeshipEligibleCountries || [],
        academic_level: intake.programLevel || intake.answers?.level || null,
        subject_interests: intake.answers?.majors ? [intake.answers.majors] : [],
        last_active: row.created_at,
        source: 'legacy_scout_snapshot',
      });
    }
    return [...byStudent.values()].filter((row) => inRange(row, range));
  }, [profilesDb.data, legacyProfilesDb.data, range]);
  const programmes = useMemo(() => {
    const rows = [...(catalogueDb.data || [])];
    const known = new Set(rows.map((row) => `${row.student_id}:${row.source_url || row.program_key}`.toLowerCase()));
    for (const row of legacyProgrammesDb.data || []) {
      const key = `${row.user_email}:${row.website || `${row.university}:${row.program_name}`}`.toLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      rows.push({
        id: `legacy-${row.id}`,
        student_id: row.user_email,
        program_key: row.website || `${row.university}:${row.program_name}`.toLowerCase(),
        institution_name: row.program_type === 'apprenticeship' ? null : row.university,
        company_name: row.company_name || (row.program_type === 'apprenticeship' ? row.university : null),
        program_name: row.program_name,
        program_type: row.program_type || (/master|mba|msc|graduate/i.test(row.degree_type || '') ? 'masters' : 'undergrad'),
        country_code: row.country_code,
        country_name: row.country_name || row.location,
        eligibility_notes: row.eligibility_notes,
        source_url: row.website,
        active_status: row.active_status || 'historical',
        first_discovered: row.recommended_at || row.created_at,
        last_seen_active: row.last_seen_active || row.updated_at || row.created_at,
        programme_json: row,
      });
    }
    return rows.filter((row) => inRange(row, range));
  }, [catalogueDb.data, legacyProgrammesDb.data, range]);
  const programmeEvents = useMemo(() => (programmeEventsDb.data || []).filter((row) => inRange(row, range)), [programmeEventsDb.data, range]);
  const interactions = useMemo(() => (interactionsDb.data || []).filter((row) => inRange(row, range)), [interactionsDb.data, range]);

  const optIns = latestProfiles.filter((row) => row.apprenticeship_opt_in);
  const countryRows = useMemo(() => {
    const counts = new Map<string, { citizen: number; permanent_resident: number; neither: number; eligible: number }>();
    for (const profile of latestProfiles) {
      for (const country of list(profile.citizenship_countries)) {
        const name = country.country_name || country.country_code || 'Unknown';
        const current = counts.get(name) || { citizen: 0, permanent_resident: 0, neither: 0, eligible: 0 };
        const status = country.status as 'citizen' | 'permanent_resident' | 'neither';
        if (status in current) current[status] += 1;
        if (status === 'citizen' || status === 'permanent_resident') current.eligible += 1;
        counts.set(name, current);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1].eligible - a[1].eligible);
  }, [latestProfiles]);

  const interestSplit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of latestProfiles) {
      const key = list(profile.programme_interests).sort().join(' + ') || 'not captured';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [latestProfiles]);

  const topProgrammes = useMemo(() => {
    const counts = new Map<string, { count: number; row: any }>();
    for (const event of programmeEvents.filter((row) => row.interaction_type === 'recommended')) {
      const key = event.program_key || event.program_name;
      const current = counts.get(key) || { count: 0, row: event };
      current.count += 1;
      counts.set(key, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [programmeEvents]);

  const q = query.trim().toLowerCase();
  const matches = (row: any) => !q || JSON.stringify(row).toLowerCase().includes(q);
  const rawTables = [
    ['Structured student profile snapshots', profilesDb.data],
    ['Structured student conversation interactions', interactionsDb.data],
    ['Structured programme library events', catalogueDb.data],
    ['Structured student-programme interactions', programmeEventsDb.data],
    ['Historical Scout state snapshots', legacyProfilesDb.data],
    ['Historical Scout messages', legacyMessagesDb.data],
    ['Historical Scout programmes', legacyProgrammesDb.data],
    ['Historical Scout programme events', legacyProgrammeEventsDb.data],
  ] as const;

  return (
    <div className="h-full min-h-screen overflow-auto bg-[var(--space-surface-page)] text-[var(--space-text-primary)]">
      <header className="sticky top-0 z-20 border-b border-[var(--space-border-default)] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]"><GraduationCap className="h-6 w-6" /></span>
            <div><h1 className="text-xl font-semibold">Student Analytics</h1><p className="text-xs text-[var(--space-text-muted)]">Owner-only · live Scout data · refreshes every 15 seconds</p></div>
          </div>
          <div className="flex items-center gap-2">
            <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="h-9 rounded-xl border border-[var(--space-border-default)] bg-white px-3 text-sm">
              <option value="all">All time</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option><option value="1">Last 24 hours</option>
            </select>
            <button onClick={refreshAll} className="flex h-9 items-center gap-2 rounded-xl border border-[var(--space-border-default)] bg-white px-3 text-sm font-medium"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === item.id ? 'bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]' : 'text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 p-5">
        {error && <div className="rounded-2xl border border-[var(--space-semantic-danger-100)] bg-[var(--space-semantic-danger-50)] p-4 text-sm text-[var(--space-semantic-danger-700)]">Student analytics is restricted to the workspace owner. Sign in with the owner account to query this data. ({error.message})</div>}
        {tab !== 'overview' && <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--space-text-muted)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search every visible field…" className="h-11 w-full rounded-xl border border-[var(--space-border-default)] bg-white pl-10 pr-3 text-sm outline-none focus:border-[var(--space-brand-primary)]" /></div>}

        {tab === 'overview' && <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Students" value={latestProfiles.length} detail="Unique latest profiles" icon={Users} />
            <Stat label="Apprenticeship opt-in" value={`${latestProfiles.length ? Math.round(optIns.length / latestProfiles.length * 100) : 0}%`} detail={`${optIns.length} of ${latestProfiles.length}`} icon={GraduationCap} />
            <Stat label="Programmes surfaced" value={programmes.length} detail={`${new Set(programmes.map((row) => row.program_key)).size} unique`} icon={BookOpen} />
            <Stat label="Interactions" value={interactions.length + programmeEvents.length} detail="Conversation + programme events" icon={Activity} />
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><h2 className="font-semibold">Citizenship & residency</h2><div className="mt-3 space-y-2">{countryRows.length ? countryRows.map(([name, counts]) => <div key={name} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-[var(--space-surface-muted)] px-3 py-2 text-sm"><span className="font-medium">{name}</span><span className="text-[var(--space-text-secondary)]">{counts.citizen} citizen · {counts.permanent_resident} PR · {counts.neither} neither</span></div>) : <p className="text-sm text-[var(--space-text-muted)]">No structured country data yet.</p>}</div></div>
            <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><h2 className="font-semibold">Programme interest combinations</h2><div className="mt-3 space-y-2">{interestSplit.map(([name, count]) => <div key={name} className="flex items-center justify-between rounded-xl bg-[var(--space-surface-muted)] px-3 py-2 text-sm"><span className="capitalize">{name}</span><strong>{count}</strong></div>)}</div></div>
          </section>
          <section className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><h2 className="font-semibold">Top recommended programmes</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{topProgrammes.length ? topProgrammes.map(({ row, count }) => <div key={row.program_key} className="rounded-xl border border-[var(--space-border-default)] p-3"><div className="flex justify-between gap-3"><p className="font-medium">{row.program_name || row.program_key}</p><strong>{count}×</strong></div><p className="mt-1 text-xs text-[var(--space-text-muted)]">{row.program_type || 'unclassified'} · {row.country_code || 'country not captured'}</p></div>) : <p className="text-sm text-[var(--space-text-muted)]">No recommendation events yet.</p>}</div></section>
        </>}

        {tab === 'students' && <section className="grid gap-3 lg:grid-cols-2">{latestProfiles.filter(matches).map((row) => <article key={row.id} className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{row.student_id}</h2><p className="text-xs text-[var(--space-text-muted)]">Last active {fmt(row.last_active)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.apprenticeship_opt_in ? 'bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]' : 'bg-[var(--space-surface-muted)] text-[var(--space-text-muted)]'}`}>{row.apprenticeship_opt_in ? 'Apprenticeship opt-in' : 'University routes'}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[var(--space-surface-muted)] p-2"><span className="text-[var(--space-text-muted)]">Interests</span><p className="mt-1 font-medium">{list(row.programme_interests).join(', ') || '—'}</p></div><div className="rounded-lg bg-[var(--space-surface-muted)] p-2"><span className="text-[var(--space-text-muted)]">Eligible countries</span><p className="mt-1 font-medium">{list(row.apprenticeship_eligible_countries).join(', ') || '—'}</p></div></div><details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Every captured field</summary><div className="mt-2"><JsonBlock value={row} /></div></details></article>)}</section>}

        {tab === 'programmes' && <section className="overflow-hidden rounded-2xl border border-[var(--space-border-default)] bg-white"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--space-surface-muted)] text-xs uppercase text-[var(--space-text-muted)]"><tr>{['Programme','Provider','Type','Country','Eligibility','Source','Last active'].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{programmes.filter(matches).map((row) => <tr key={row.id} className="border-t border-[var(--space-border-default)] align-top"><td className="px-3 py-3 font-medium">{row.program_name}</td><td className="px-3 py-3">{row.company_name || row.institution_name || '—'}</td><td className="px-3 py-3">{row.program_type}</td><td className="px-3 py-3">{row.country_name || row.country_code || '—'}</td><td className="max-w-xs px-3 py-3 text-xs">{row.eligibility_notes || '—'}</td><td className="max-w-xs px-3 py-3">{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer" className="break-all text-[var(--space-brand-primary-700)] underline">Source</a> : '—'}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{fmt(row.last_seen_active)}</td></tr>)}</tbody></table></div></section>}

        {tab === 'interactions' && <section className="space-y-2">{[...programmeEvents, ...interactions].filter(matches).sort((a, b) => dateValue(b) - dateValue(a)).map((row) => <article key={`${row.event_type || row.interaction_type}-${row.id}-${row.student_id}`} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{row.event_type || row.interaction_type}</p><span className="text-xs text-[var(--space-text-muted)]">{fmt(row.occurred_at || row.created_at)}</span></div><p className="mt-1 text-sm text-[var(--space-text-secondary)]">{row.student_id}{row.program_name ? ` · ${row.program_name}` : ''}{row.field_name ? ` · ${row.field_name}` : ''}</p>{row.answer_text && <p className="mt-2 rounded-lg bg-[var(--space-surface-muted)] p-2 text-sm">{row.answer_text}</p>}</article>)}</section>}

        {tab === 'raw' && <section className="space-y-4">{rawTables.map(([name, rows]) => <details key={name} open className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><summary className="cursor-pointer font-semibold">{name} · {(rows || []).filter(matches).length} rows</summary><div className="mt-3 space-y-2">{(rows || []).filter(matches).map((row) => <JsonBlock key={row.id} value={row} />)}</div></details>)}</section>}
      </main>
    </div>
  );
}

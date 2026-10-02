import { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, Clock3, Database, Eye, RefreshCw, Search, Users } from 'lucide-react';

declare function useWorkspaceDB(table: string, options?: Record<string, any>): {
  data: any[];
  loading: boolean;
  error: Error | null;
  total: number;
  refresh: () => void;
};

type Range = 'all' | '30' | '7' | '1';
type Tab = 'overview' | 'organizations' | 'profiles' | 'timeline' | 'raw';
const fmt = (value: any) => { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(); };
const eventTime = (row: any) => new Date(row.occurred_at || row.created_at || 0).getTime();

function Card({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: any }) {
  return <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--space-text-muted)]">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-[var(--space-text-secondary)]">{detail}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]"><Icon className="h-5 w-5" /></span></div></div>;
}

export default function AlmaDataPanelApp() {
  const activityDb = useWorkspaceDB('inbox_alma_activity', { shared: true, orderBy: { column: 'occurred_at', direction: 'desc' }, limit: 5000 });
  const [range, setRange] = useState<Range>('all');
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  useEffect(() => { const timer = window.setInterval(activityDb.refresh, 15000); return () => window.clearInterval(timer); }, []);

  const rows = useMemo(() => (activityDb.data || []).filter((row) => range === 'all' || eventTime(row) >= Date.now() - Number(range) * 86400000), [activityDb.data, range]);
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  const profileViews = rows.filter((row) => row.event_type === 'profile_view');
  const organizations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string; views: number; events: number; lastActive: number }>();
    for (const row of rows) {
      const id = row.actor_id || 'unknown';
      const current = map.get(id) || { id, name: row.institution_name || id, type: row.actor_type || 'institution', views: 0, events: 0, lastActive: 0 };
      current.events += 1;
      if (row.event_type === 'profile_view') current.views += 1;
      current.lastActive = Math.max(current.lastActive, eventTime(row));
      map.set(id, current);
    }
    return [...map.values()].sort((a, b) => b.events - a.events);
  }, [rows]);
  const students = useMemo(() => {
    const map = new Map<string, { id: string; views: number; organizations: Set<string>; lastViewed: number }>();
    for (const row of profileViews) {
      if (!row.student_id) continue;
      const current = map.get(row.student_id) || { id: row.student_id, views: 0, organizations: new Set<string>(), lastViewed: 0 };
      current.views += 1;
      if (row.actor_id) current.organizations.add(row.actor_id);
      current.lastViewed = Math.max(current.lastViewed, eventTime(row));
      map.set(row.student_id, current);
    }
    return [...map.values()].sort((a, b) => b.views - a.views);
  }, [profileViews]);
  const eventTypes = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.event_type || 'unknown', (map.get(row.event_type || 'unknown') || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const tabs: Array<{ id: Tab; label: string; icon: any }> = [
    { id: 'overview', label: 'Overview', icon: Activity }, { id: 'organizations', label: 'Institutions & companies', icon: Building2 }, { id: 'profiles', label: 'Profile views', icon: Eye }, { id: 'timeline', label: 'Activity timeline', icon: Clock3 }, { id: 'raw', label: 'All fields', icon: Database },
  ];

  return <div className="h-full min-h-screen overflow-auto bg-[var(--space-surface-page)] text-[var(--space-text-primary)]">
    <header className="sticky top-0 z-20 border-b border-[var(--space-border-default)] bg-white/95 px-5 py-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)]"><Database className="h-6 w-6" /></span><div><h1 className="text-xl font-semibold">Alma Data Panel</h1><p className="text-xs text-[var(--space-text-muted)]">Owner-only · complete Alma activity · refreshes every 15 seconds</p></div></div><div className="flex gap-2"><select value={range} onChange={(e) => setRange(e.target.value as Range)} className="h-9 rounded-xl border border-[var(--space-border-default)] bg-white px-3 text-sm"><option value="all">All time</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option><option value="1">Last 24 hours</option></select><button onClick={activityDb.refresh} className="flex h-9 items-center gap-2 rounded-xl border border-[var(--space-border-default)] bg-white px-3 text-sm font-medium"><RefreshCw className={`h-4 w-4 ${activityDb.loading ? 'animate-spin' : ''}`} />Refresh</button></div></div>
      <div className="mt-4 flex gap-1 overflow-x-auto">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === item.id ? 'bg-[var(--space-brand-primary-50)] text-[var(--space-text-brand)]' : 'text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>
    </header>
    <main className="mx-auto max-w-7xl space-y-5 p-5">
      {activityDb.error && <div className="rounded-2xl border border-[var(--space-semantic-danger-100)] bg-[var(--space-semantic-danger-50)] p-4 text-sm text-[var(--space-semantic-danger-700)]">Alma interaction data is restricted to the workspace owner. Sign in with the owner account to query it. ({activityDb.error.message})</div>}
      {tab !== 'overview' && <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--space-text-muted)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search every captured field…" className="h-11 w-full rounded-xl border border-[var(--space-border-default)] bg-white pl-10 pr-3 text-sm outline-none focus:border-[var(--space-brand-primary)]" /></div>}
      {tab === 'overview' && <><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card label="Organizations" value={organizations.length} detail="Active institutions & companies" icon={Building2} /><Card label="Profile views" value={profileViews.length} detail="Every recorded view" icon={Eye} /><Card label="Students viewed" value={students.length} detail="Unique profiles" icon={Users} /><Card label="All activity" value={rows.length} detail="Every Alma event" icon={Activity} /></section><section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><h2 className="font-semibold">Activity by event</h2><div className="mt-3 space-y-2">{eventTypes.map(([name, count]) => <div key={name} className="flex justify-between rounded-xl bg-[var(--space-surface-muted)] px-3 py-2 text-sm"><span className="capitalize">{name.replace(/_/g, ' ')}</span><strong>{count}</strong></div>)}</div></div><div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><h2 className="font-semibold">Most viewed student profiles</h2><div className="mt-3 space-y-2">{students.slice(0, 10).map((student) => <div key={student.id} className="rounded-xl border border-[var(--space-border-default)] p-3"><div className="flex justify-between gap-3"><span className="truncate font-medium">{student.id}</span><strong>{student.views} views</strong></div><p className="mt-1 text-xs text-[var(--space-text-muted)]">{student.organizations.size} organization{student.organizations.size === 1 ? '' : 's'} · last {fmt(student.lastViewed)}</p></div>)}</div></div></section></>}
      {tab === 'organizations' && <section className="grid gap-3 md:grid-cols-2">{organizations.filter((org) => !q || JSON.stringify(org).toLowerCase().includes(q)).map((org) => <article key={org.id} className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{org.name}</h2><p className="text-xs text-[var(--space-text-muted)]">{org.id} · {org.type}</p></div><Building2 className="h-5 w-5 text-[var(--space-text-muted)]" /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl bg-[var(--space-surface-muted)] p-2"><strong className="block text-lg">{org.events}</strong><span className="text-xs text-[var(--space-text-muted)]">events</span></div><div className="rounded-xl bg-[var(--space-surface-muted)] p-2"><strong className="block text-lg">{org.views}</strong><span className="text-xs text-[var(--space-text-muted)]">views</span></div><div className="rounded-xl bg-[var(--space-surface-muted)] p-2"><strong className="block text-xs">{fmt(org.lastActive)}</strong><span className="text-xs text-[var(--space-text-muted)]">last active</span></div></div></article>)}</section>}
      {tab === 'profiles' && <section className="space-y-3">{students.filter((student) => !q || student.id.toLowerCase().includes(q)).map((student) => <article key={student.id} className="rounded-2xl border border-[var(--space-border-default)] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{student.id}</h2><p className="text-xs text-[var(--space-text-muted)]">Last viewed {fmt(student.lastViewed)}</p></div><div className="flex gap-2"><span className="rounded-full bg-[var(--space-brand-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--space-text-brand)]">{student.views} views</span><span className="rounded-full bg-[var(--space-surface-muted)] px-3 py-1 text-xs font-semibold">{student.organizations.size} organizations</span></div></div><div className="mt-3 space-y-1">{profileViews.filter((row) => row.student_id === student.id).map((row) => <div key={row.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-[var(--space-surface-muted)] px-3 py-2 text-xs"><span>{row.institution_name || row.actor_id}</span><span className="text-[var(--space-text-muted)]">{fmt(row.occurred_at)}</span></div>)}</div></article>)}</section>}
      {tab === 'timeline' && <section className="space-y-2">{filtered.map((row) => <article key={row.id} className="rounded-xl border border-[var(--space-border-default)] bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--space-brand-primary)]" /><p className="font-medium capitalize">{String(row.event_type || 'event').replace(/_/g, ' ')}</p></div><span className="text-xs text-[var(--space-text-muted)]">{fmt(row.occurred_at)}</span></div><p className="mt-1 text-sm text-[var(--space-text-secondary)]">{row.institution_name || row.actor_id}{row.student_id ? ` · ${row.student_id}` : ''}{row.program_id ? ` · programme ${row.program_id}` : ''}</p>{row.metadata_json && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Event details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--space-neutral-900)] p-3 text-[11px] text-white">{JSON.stringify(row.metadata_json, null, 2)}</pre></details>}</article>)}</section>}
      {tab === 'raw' && <section className="space-y-2">{filtered.map((row) => <pre key={row.id} className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--space-neutral-900)] p-3 text-[11px] leading-relaxed text-white">{JSON.stringify(row, null, 2)}</pre>)}</section>}
    </main>
  </div>;
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Radar,
  Send,
  MapPin,
  Loader2,
  Trash2,
  History,
  ShieldCheck,
  Star,
  Mail,
  Copy,
  Check,
  ArrowRight,
  BookOpen,
  Radio,
  X,
  Sparkles,
  Target,
  ChevronUp,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { tw, typography, cn } from '../../lib/colors';
import AppProfileMenu from '../../components/AppProfileMenu';

interface LeadMatch {
  label: string;
  region: string;
  fitScore: number;
  programInterest: string;
  alignmentSignals: string[];
  interestContext: string;
  suggestedStrategy: string;
  source: string;
  budgetFit?: string;
  academicFocus?: string;
}

interface StudentSignal {
  id: number;
  student_label: string;
  interests: string;
  career_goals: string;
  locations: string;
  budget_range: string;
  lifestyle: string;
  must_haves: string;
  summary: string;
  status: string;
  created_at?: string;
}

interface CampaignRow {
  id: number;
  university_name: string;
  target_profile: string;
  programs: string;
  priorities: string;
  strengths: string;
  regions: string;
  engagement_goals: string;
  summary: string;
  status: string;
  leads_json: string;
  created_at?: string;
}

interface SearchResult {
  title?: string;
  snippet?: string;
}

interface RadarProfile {
  institutionName: string;
  programTypes: string;
  academicLevel: string;
  studentInterests: string;
  studentGoals: string;
  regions: string;
  enrollmentPriorities: string;
}

interface ChatMessage {
  id: string;
  role: 'advisor' | 'user';
  content: string;
  stepId?: string;
}

type IntakeStepId =
  | 'welcome'
  | 'programTypes'
  | 'academicLevel'
  | 'studentInterests'
  | 'studentGoals'
  | 'regions'
  | 'enrollmentPriorities'
  | 'review';
type AppPhase = 'intake' | 'generating' | 'results' | 'history';

interface IntakeStep {
  id: IntakeStepId;
  label: string;
  advisorPrompt: string;
  placeholder: string;
  field?: keyof RadarProfile;
  chips?: string[];
  multiSelect?: boolean;
  optional?: boolean;
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
    __workspaceDb: any;
  }
}

const EMPTY_PROFILE: RadarProfile = {
  institutionName: '',
  programTypes: '',
  academicLevel: '',
  studentInterests: '',
  studentGoals: '',
  regions: '',
  enrollmentPriorities: '',
};

const INTAKE_STEPS: IntakeStep[] = [
  {
    id: 'welcome',
    label: 'Hello',
    advisorPrompt:
      "Hi — I'm Alma. I will ask a few focused questions about the students you want to reach, then surface genuinely matched prospects with clear reasoning behind each one. What institution are you recruiting for?",
    placeholder: 'Your university name, or skip if you prefer',
    field: 'institutionName',
    optional: true,
  },
  {
    id: 'programTypes',
    label: 'Programs',
    advisorPrompt:
      'Let us start with program type — which levels are you actively trying to fill? Pick every type that applies, and add your own if something is missing.',
    placeholder: 'Add a specific program type…',
    field: 'programTypes',
    chips: ['Undergraduate', 'Postgraduate / Masters', 'MBA', 'Research PhD', 'Foundation / pathway', 'Online / hybrid', 'Executive education'],
    multiSelect: true,
  },
  {
    id: 'academicLevel',
    label: 'Level',
    advisorPrompt:
      'What academic level should your ideal prospects be at today? This helps me filter for students who are ready for the programs you are filling — select all that apply.',
    placeholder: 'Describe the academic level you are targeting…',
    field: 'academicLevel',
    chips: ['Final-year high school', 'Gap year / recent graduate', 'Current undergraduate', 'Working professional', 'Career changer', 'Research-ready graduate'],
    multiSelect: true,
  },
  {
    id: 'studentInterests',
    label: 'Interests',
    advisorPrompt:
      'Now tell me about the student profile — what subjects or fields should your ideal prospects care about? Pick as many as fit, and add your own.',
    placeholder: 'Add another field of interest…',
    field: 'studentInterests',
    chips: ['STEM & engineering', 'Business & finance', 'Health sciences', 'Arts & humanities', 'Social sciences', 'Data & AI', 'Computer science', 'Law & policy', 'Environmental studies'],
    multiSelect: true,
  },
  {
    id: 'studentGoals',
    label: 'Goals',
    advisorPrompt:
      'Where should these students be headed after graduation? Choose every career direction that fits your enrollment strategy — or describe your own.',
    placeholder: 'Add another goal or career direction…',
    field: 'studentGoals',
    chips: ['Tech & product', 'Research & academia', 'Healthcare', 'Consulting & business', 'Creative industries', 'Public policy', 'Entrepreneurship', 'Local workforce development'],
    multiSelect: true,
  },
  {
    id: 'regions',
    label: 'Reach',
    advisorPrompt:
      'Where would you most like prospective students to come from? Choose every region you are targeting — or type your own. I will weigh geographic fit alongside academic alignment.',
    placeholder: 'Add another country or region…',
    field: 'regions',
    chips: ['India', 'Nigeria', 'Vietnam', 'GCC / Middle East', 'Southeast Asia', 'Latin America', 'Sub-Saharan Africa', 'Europe', 'North America'],
    multiSelect: true,
  },
  {
    id: 'enrollmentPriorities',
    label: 'Priorities',
    advisorPrompt:
      'Last question — what enrollment priorities are driving this search? Select everything that applies. These help me rank prospects by strategic fit, not just academic overlap.',
    placeholder: 'Add another enrollment priority…',
    field: 'enrollmentPriorities',
    chips: [
      'Diversify international cohort',
      'Scholarship-ready applicants',
      'High-yield conversion',
      'Research talent pipeline',
      'Industry-connected graduates',
      'Underrepresented regions',
      'Premium / full-pay segments',
      'Co-op & internship seekers',
    ],
    multiSelect: true,
  },
  {
    id: 'review',
    label: 'Review',
    advisorPrompt:
      'Here is the recruiting brief I have built. Take a quick look — when you are ready, I will scan live student signals and rank your best-matched prospects.',
    placeholder: '',
  },
];

const CHIP_PICKER_STEP_IDS = new Set<IntakeStepId>([
  'programTypes',
  'academicLevel',
  'studentInterests',
  'studentGoals',
  'regions',
  'enrollmentPriorities',
]);
const OTHER_CHIP = 'Other / write your own';

function stepUsesChipPicker(step: IntakeStep | undefined): boolean {
  return !!step?.chips?.length && CHIP_PICKER_STEP_IDS.has(step.id);
}

function parseLeads(raw?: string): LeadMatch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractJson(content: string): any | null {
  const cleaned = content.replace(/```json|```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

function profileToForm(profile: RadarProfile) {
  return {
    universityName: profile.institutionName || 'Your institution',
    programTypes: profile.programTypes,
    academicLevel: profile.academicLevel,
    studentInterests: profile.studentInterests,
    studentGoals: profile.studentGoals,
    locationPreferences: profile.regions,
    enrollmentPriorities: profile.enrollmentPriorities,
    academicFocus: profile.studentInterests,
    programInterest: profile.programTypes,
    budgetFit: profile.enrollmentPriorities,
    strengths: profile.enrollmentPriorities,
    engagementGoals: profile.enrollmentPriorities,
  };
}

function profileHasMeaningfulAnswers(profile: RadarProfile): boolean {
  return !!(profile.programTypes.trim() || profile.studentInterests.trim() || profile.regions.trim());
}

function scoreLead(profileText: string, campaignText: string, index: number) {
  const tokens = campaignText.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const profile = profileText.toLowerCase();
  const hits = tokens.reduce((count, token) => count + (profile.includes(token) ? 1 : 0), 0);
  return Math.max(64, Math.min(98, 76 + hits * 4 - index * 2));
}

function buildFallbackLeads(
  profile: RadarProfile,
  students: StudentSignal[],
  searchResults: SearchResult[]
): { summary: string; leads: LeadMatch[] } {
  const form = profileToForm(profile);
  const campaignText = `${form.programTypes} ${form.academicLevel} ${form.studentInterests} ${form.studentGoals} ${form.enrollmentPriorities} ${form.locationPreferences}`;
  const activeStudents = students.filter((student) => student.status !== 'archived').slice(0, 8);
  const liveLeads = activeStudents.map((student, index) => {
    const profileText = `${student.interests} ${student.career_goals} ${student.locations} ${student.lifestyle} ${student.must_haves}`;
    const score = scoreLead(profileText, campaignText, index);
    return {
      label: student.student_label || `Prospect ${student.id}`,
      region: student.locations || form.locationPreferences || 'Region flexible',
      fitScore: score,
      programInterest: student.interests || form.programTypes,
      academicFocus: student.interests,
      budgetFit: student.budget_range || 'To be confirmed',
      alignmentSignals: [
        student.career_goals ? `Career direction: ${student.career_goals}` : `Interested in ${form.programTypes}`,
        form.academicLevel ? `Level fit: ${form.academicLevel}` : 'Academic level to confirm',
        student.must_haves ? `Priorities: ${student.must_haves}` : `Enrollment focus: ${form.enrollmentPriorities || 'General fit'}`,
      ],
      interestContext:
        student.summary ||
        `This prospect aligns with your ${form.programTypes || 'program'} search — strong overlap in ${form.studentInterests || 'target interests'} and ${form.studentGoals || 'career goals'}.`,
      suggestedStrategy: `Lead with your ${form.enrollmentPriorities || 'strongest differentiators'}, then invite a program-specific conversation with admissions.`,
      source: 'Live student signal',
    };
  });

  if (liveLeads.length > 0) {
    return {
      summary: `${liveLeads.length} live student signals match your recruiting brief. Each is ranked by program fit, geographic reach, and enrollment priority alignment.`,
      leads: liveLeads.sort((a, b) => b.fitScore - a.fitScore).slice(0, 8),
    };
  }

  const marketSignal =
    searchResults[0]?.snippet || searchResults[0]?.title || 'international recruitment and enrollment strategy';
  const regions = form.locationPreferences.split(',').map((region) => region.trim()).filter(Boolean);
  const archetypes = [
    'Career-switching postgraduate explorer',
    'Scholarship-sensitive international applicant',
    'Research-oriented STEM prospect',
    'Community-first undergraduate planner',
    'Internship-driven business candidate',
  ];

  return {
    summary: `No live Scout student signals yet — so I have modeled high-intent prospect segments from your brief and current market context around ${marketSignal}.`,
    leads: archetypes.map((label, index) => ({
      label,
      region: regions[index] || regions[0] || 'Global',
      fitScore: 90 - index * 4,
      programInterest: form.programTypes || 'Priority programs',
      academicFocus: form.studentInterests || 'Broad academic interest',
      budgetFit: form.enrollmentPriorities.includes('Scholarship') ? 'Scholarship-focused' : 'Flexible',
      alignmentSignals: [
        `Program fit: ${form.programTypes || 'Motivated, internationally minded student'}`,
        `Academic level: ${form.academicLevel || 'Level to confirm'}`,
        `Geographic fit: ${regions[index] || regions[0] || 'Open to your regions'}`,
      ],
      interestContext: `This segment aligns with your ${form.programTypes || 'programs'} while weighing ${form.studentGoals || 'career goals'} and ${form.enrollmentPriorities || 'enrollment priorities'}.`,
      suggestedStrategy:
        'Send a value-led outreach note with one proof point about your institution, then invite a low-friction admissions conversation.',
      source: 'Market segment',
    })),
  };
}

async function searchRecruitmentSignals(profile: RadarProfile): Promise<SearchResult[]> {
  const form = profileToForm(profile);
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `${form.programTypes} ${form.studentInterests} student recruitment ${form.locationPreferences} ${form.enrollmentPriorities}`,
        searchType: 'web',
        num: 5,
        language: 'en',
      }),
    });
    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

async function generateRadarLeads(
  profile: RadarProfile,
  students: StudentSignal[],
  searchResults: SearchResult[]
): Promise<{ summary: string; leads: LeadMatch[] }> {
  const form = profileToForm(profile);
  const fallback = buildFallbackLeads(profile, students, searchResults);
  try {
    const activeStudents = students
      .filter((student) => student.status !== 'archived')
      .slice(0, 12)
      .map((student) => ({
        label: student.student_label,
        interests: student.interests,
        goals: student.career_goals,
        locations: student.locations,
        budget: student.budget_range,
        lifestyle: student.lifestyle,
        mustHaves: student.must_haves,
        summary: student.summary,
      }));
    const evidence = searchResults
      .slice(0, 5)
      .map((result, index) => `${index + 1}. ${result.title || 'Result'} — ${result.snippet || ''}`)
      .join('\n');
    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.38,
        max_tokens: 1400,
        messages: [
          {
            role: 'system',
            content:
              'You are Alma for Scout & Alma. Match prospective students or segments to a recruiting brief based on program type, academic level, interests, goals, geographic reach, and enrollment priorities — never sensitive traits. Return only valid JSON. Label live signals vs market segments clearly. Write interestContext like a knowledgeable recruiting partner explaining WHY each prospect fits THIS institution.',
          },
          {
            role: 'user',
            content: `Recruiting brief (each field may contain MULTIPLE comma-separated values — weigh all of them):\nInstitution: ${form.universityName}\nProgram types to fill: ${form.programTypes}\nTarget academic level: ${form.academicLevel}\nStudent interests: ${form.studentInterests}\nStudent career goals: ${form.studentGoals}\nGeographic reach: ${form.locationPreferences}\nEnrollment priorities: ${form.enrollmentPriorities}\n\nLive Scout student signals:\n${JSON.stringify(activeStudents)}\n\nMarket context:\n${evidence || 'No live web signals.'}\n\nReturn JSON exactly like: {"summary":"...","leads":[{"label":"...","region":"...","fitScore":88,"programInterest":"...","academicFocus":"...","budgetFit":"...","alignmentSignals":["..."],"interestContext":"...","suggestedStrategy":"...","source":"Live student signal or Market segment"}]}. Up to 8 leads, sorted by fitScore highest first. interestContext must clearly explain alignment reasoning.`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed || !Array.isArray(parsed.leads)) return fallback;
    const leads: LeadMatch[] = parsed.leads.slice(0, 8).map((item: any, index: number) => ({
      label: String(item.label || fallback.leads[index]?.label || `Prospect ${index + 1}`),
      region: String(item.region || fallback.leads[index]?.region || 'Global'),
      fitScore: Math.max(60, Math.min(99, Math.round(Number(item.fitScore) || 88 - index * 3))),
      programInterest: String(item.programInterest || fallback.leads[index]?.programInterest || form.programTypes),
      academicFocus: String(item.academicFocus || fallback.leads[index]?.academicFocus || form.studentInterests),
      budgetFit: String(item.budgetFit || fallback.leads[index]?.budgetFit || 'Flexible'),
      alignmentSignals: Array.isArray(item.alignmentSignals)
        ? item.alignmentSignals.map(String).slice(0, 4)
        : fallback.leads[index]?.alignmentSignals || [],
      interestContext: String(
        item.interestContext || fallback.leads[index]?.interestContext || 'Shows overlap with your recruiting brief.'
      ),
      suggestedStrategy: String(
        item.suggestedStrategy ||
          fallback.leads[index]?.suggestedStrategy ||
          'Start with a personalized proof point and a helpful program invitation.'
      ),
      source: String(item.source || fallback.leads[index]?.source || 'Market segment'),
    }));
    return { summary: String(parsed.summary || fallback.summary), leads: leads.length ? leads : fallback.leads };
  } catch {
    return fallback;
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function readSessionEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('space_session_')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (typeof session?.email === 'string' && session.email.trim()) {
        return session.email.trim();
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function getDisplayInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return 'U';
}

function AdvisorAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-4.5 h-4.5';
  return (
    <div className={cn(dim, 'rounded-full bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] flex items-center justify-center flex-shrink-0')}>
      <Radar className={icon} />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <AdvisorAvatar size="sm" />
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white border border-[var(--space-border-default)] shadow-sm">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-[var(--space-text-muted)] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isAdvisor = message.role === 'advisor';
  return (
    <div className={cn('flex items-end gap-2.5', isAdvisor ? 'justify-start' : 'justify-end')}>
      {isAdvisor && <AdvisorAvatar size="sm" />}
      <div
        className={cn(
          'max-w-[88%] px-4 py-3 text-[15px] leading-relaxed',
          isAdvisor
            ? 'rounded-2xl rounded-tl-sm bg-white border border-[var(--space-border-default)] text-[var(--space-text-primary)] shadow-sm'
            : 'rounded-2xl rounded-tr-sm bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]'
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function ChipPicker({
  chips,
  selectedChips,
  onChipPress,
  showOther,
  onOtherPress,
}: {
  chips: string[];
  selectedChips: string[];
  onChipPress: (chip: string) => void;
  showOther: boolean;
  onOtherPress: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {chips.map((chip) => {
        const active = selectedChips.includes(chip);
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onChipPress(chip)}
            aria-pressed={active}
            className={cn(
              'px-4 py-2.5 rounded-full text-sm font-medium transition-all border min-h-[44px]',
              active
                ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] border-[var(--space-brand-highlight)]'
                : 'bg-white text-[var(--space-text-primary)] border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
            )}
          >
            {active && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />}
            {chip}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOtherPress}
        aria-pressed={showOther}
        className={cn(
          'px-4 py-2.5 rounded-full text-sm font-medium transition-all border min-h-[44px]',
          showOther
            ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] border-[var(--space-brand-highlight)]'
            : 'bg-white text-[var(--space-text-primary)] border-dashed border-[var(--space-border-strong)] hover:border-[var(--space-brand-highlight)]'
        )}
      >
        {OTHER_CHIP}
      </button>
    </div>
  );
}

function ReviewSummary({ profile }: { profile: RadarProfile }) {
  const rows = [
    { label: 'Institution', value: profile.institutionName || 'Not shared' },
    { label: 'Program types', value: profile.programTypes },
    { label: 'Academic level', value: profile.academicLevel },
    { label: 'Student interests', value: profile.studentInterests },
    { label: 'Career goals', value: profile.studentGoals },
    { label: 'Geographic reach', value: profile.regions },
    { label: 'Enrollment priorities', value: profile.enrollmentPriorities },
  ];
  return (
    <div className="space-y-2 mt-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-[var(--space-surface-muted)] border border-[var(--space-border-default)]">
          <p className={`text-xs font-medium ${typography.color.tertiary}`}>{row.label}</p>
          <p className={`text-sm text-right ${typography.color.primary}`}>{row.value || '—'}</p>
        </div>
      ))}
    </div>
  );
}

function FitLevelBar({ score }: { score: number }) {
  const level = score >= 88 ? 'Excellent fit' : score >= 78 ? 'Strong fit' : 'Good fit';
  const color = score >= 88 ? 'var(--space-brand-highlight)' : score >= 78 ? 'var(--space-brand-primary)' : 'var(--space-brand-contrast)';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--space-surface-muted)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-medium whitespace-nowrap ${typography.color.secondary}`}>{level}</span>
    </div>
  );
}

function ProspectCard({
  lead,
  rank,
  isFlagged,
  isContacted,
  expanded,
  onFlag,
  onReachOut,
  onToggleExpand,
}: {
  lead: LeadMatch;
  rank: number;
  isFlagged: boolean;
  isContacted: boolean;
  expanded: boolean;
  onFlag: () => void;
  onReachOut: () => void;
  onToggleExpand: () => void;
}) {
  const isLive = lead.source.toLowerCase().includes('live');
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow',
        isFlagged ? 'border-[var(--space-border-strong)] ring-1 ring-[var(--space-brand-highlight-200)]' : 'border-[var(--space-border-default)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold',
              isLive ? 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]' : 'bg-[var(--space-surface-muted)] text-[var(--space-text-brand)]'
            )}
          >
            #{rank}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold text-base leading-snug ${typography.color.primary}`}>{lead.label}</h3>
              {isLive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--space-brand-primary-100)] text-[var(--space-brand-primary-700)] border border-[var(--space-brand-primary-200)]">
                  <Radio className="w-3 h-3 animate-pulse" /> Live
                </span>
              )}
              {isContacted && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--space-semantic-success)]/10 text-[var(--space-semantic-success)] border border-[var(--space-semantic-success)]/20">
                  Contacted
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] border border-[var(--space-border-default)]">
                <MapPin className="w-3 h-3" />
                {lead.region}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] border border-[var(--space-border-default)]">
                <BookOpen className="w-3 h-3" />
                {lead.programInterest}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onFlag}
          className={cn('p-2 rounded-lg transition-colors flex-shrink-0', isFlagged ? 'text-[var(--space-brand-highlight)]' : 'text-[var(--space-text-muted)] hover:bg-[var(--space-surface-muted)]')}
          aria-label={isFlagged ? 'Unflag' : 'Flag prospect'}
        >
          <Star className={cn('w-4 h-4', isFlagged && 'fill-current')} />
        </button>
      </div>

      <div className="mt-3">
        <FitLevelBar score={lead.fitScore} />
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl p-3 bg-[var(--space-surface-muted)] border border-[var(--space-border-default)]">
            <p className={`text-xs font-semibold mb-1 ${typography.color.primary}`}>Why they fit</p>
            <p className={`text-sm leading-relaxed ${typography.color.secondary}`}>{lead.interestContext}</p>
            <ul className={`mt-2 space-y-1 text-xs ${typography.color.secondary}`}>
              {lead.alignmentSignals.slice(0, 3).map((signal, i) => (
                <li key={i}>• {signal}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl p-3 bg-[var(--space-surface-accent-soft)] border border-[var(--space-border-default)]">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className={cn('w-3.5 h-3.5', tw.icon.accent)} />
              <p className={`text-xs font-semibold ${typography.color.primary}`}>Suggested outreach</p>
            </div>
            <p className={`text-xs leading-relaxed ${typography.color.secondary}`}>{lead.suggestedStrategy}</p>
          </div>
        </div>
      ) : (
        <p className={`text-sm mt-3 line-clamp-2 leading-relaxed ${typography.color.secondary}`}>{lead.interestContext}</p>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--space-border-default)]">
        <button onClick={onToggleExpand} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', tw.button.secondary)}>
          {expanded ? 'Less' : 'Why they fit'}
        </button>
        <div className="flex-1" />
        <button onClick={onReachOut} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', tw.button.accent)}>
          <Mail className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          Reach out
        </button>
      </div>
    </div>
  );
}

function ProspectPanel({
  leads,
  isUpdating,
  isGenerating,
  summary,
  institutionName,
  flagged,
  contacted,
  expandedId,
  onFlag,
  onReachOut,
  onToggleExpand,
  emptyMessage,
  liveSignalCount,
}: {
  leads: LeadMatch[];
  isUpdating: boolean;
  isGenerating: boolean;
  summary?: string;
  institutionName?: string;
  flagged: Set<string>;
  contacted: Set<string>;
  expandedId: string | null;
  onFlag: (label: string) => void;
  onReachOut: (lead: LeadMatch) => void;
  onToggleExpand: (id: string) => void;
  emptyMessage: string;
  liveSignalCount: number;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--space-border-default)] bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={`font-semibold text-base ${typography.color.brand}`}>
              {institutionName ? `Prospects for ${institutionName}` : 'Matched prospects'}
            </h2>
            {summary ? (
              <p className={`text-xs mt-0.5 line-clamp-2 ${typography.color.secondary}`}>{summary}</p>
            ) : liveSignalCount > 0 ? (
              <p className={`text-xs mt-0.5 ${typography.color.secondary}`}>{liveSignalCount} live student signals available</p>
            ) : null}
          </div>
          {(isUpdating || isGenerating) && (
            <div className="flex items-center gap-2 text-xs text-[var(--space-text-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{isGenerating ? 'Scanning…' : 'Updating…'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isGenerating && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--space-brand-highlight)] flex items-center justify-center mb-4">
              <Radar className="w-7 h-7 text-[var(--space-text-on-highlight)] animate-pulse" />
            </div>
            <p className={`font-medium ${typography.color.primary}`}>Scanning for matched prospects</p>
            <p className={`text-sm mt-1 ${typography.color.secondary}`}>Cross-referencing live signals against your recruiting brief…</p>
          </div>
        )}

        {!isGenerating && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Users className={cn('w-10 h-10 mb-3', tw.icon.muted)} />
            <p className={`text-sm ${typography.color.secondary}`}>{emptyMessage}</p>
          </div>
        )}

        {leads.map((lead, index) => {
          const id = `${lead.label}-${index}`;
          return (
            <ProspectCard
              key={id}
              lead={lead}
              rank={index + 1}
              isFlagged={flagged.has(lead.label)}
              isContacted={contacted.has(lead.label)}
              expanded={expandedId === id}
              onFlag={() => onFlag(lead.label)}
              onReachOut={() => onReachOut(lead)}
              onToggleExpand={() => onToggleExpand(id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function OutreachModal({
  lead,
  universityName,
  onClose,
  onMarkContacted,
}: {
  lead: LeadMatch;
  universityName: string;
  onClose: () => void;
  onMarkContacted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const message = `Hi ${lead.label.split(' ')[0] || 'there'},

I'm reaching out from ${universityName}'s admissions team. Based on your interest in ${lead.programInterest}, we think you'd be a strong fit for our programs — especially given your focus on ${lead.academicFocus || 'your academic goals'}.

${lead.suggestedStrategy}

Would you be open to a brief conversation about next steps?

Best regards,
${universityName} Admissions`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={cn(tw.card.elevated, 'w-full max-w-lg p-5 space-y-4')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${typography.color.tertiary}`}>Reach out</p>
            <h3 className={`text-lg font-bold ${typography.color.primary}`}>{lead.label}</h3>
            <p className={`text-sm ${typography.color.secondary}`}>{lead.programInterest} · {lead.region}</p>
          </div>
          <button onClick={onClose} className={cn('p-2 rounded-xl', tw.button.ghost)} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <textarea readOnly value={message} rows={10} className={cn(tw.input.base, tw.input.default, 'rounded-2xl resize-none text-sm leading-relaxed')} />
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={handleCopy} className={cn('flex-1 rounded-2xl px-4 py-3 flex items-center justify-center gap-2 min-h-[48px]', tw.button.secondary)}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy message'}
          </button>
          <button
            onClick={() => { onMarkContacted(); onClose(); }}
            className={cn('flex-1 rounded-2xl px-4 py-3 flex items-center justify-center gap-2 min-h-[48px]', tw.button.accent)}
          >
            <Send className="w-4 h-4" />
            Mark as contacted
          </button>
        </div>
      </div>
    </div>
  );
}

function UniversityProfileFooter({ institutionName, email }: { institutionName: string; email: string }) {
  const name = institutionName.trim() || (email ? email.split('@')[0] : 'Admissions team');
  const initials = getDisplayInitials(name);
  return (
    <div className="flex-shrink-0 border-t border-[var(--space-border-default)] bg-[var(--space-surface-muted)]/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{name}</p>
          <p className={`text-xs truncate ${typography.color.tertiary}`}>Admissions team</p>
        </div>
      </div>
    </div>
  );
}

function HistoryView({
  campaigns,
  loading,
  error,
  activeHistoryId,
  onLoad,
  onArchive,
  onDelete,
  onStartOver,
}: {
  campaigns: CampaignRow[] | undefined;
  loading: boolean;
  error: Error | null;
  activeHistoryId: number | null;
  onLoad: (row: CampaignRow) => void;
  onArchive: (row: CampaignRow) => void;
  onDelete: (id: number) => void;
  onStartOver: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <p className={`text-sm ${typography.color.secondary}`}>Your saved Alma runs — tap one to revisit matched prospects.</p>
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className={cn('w-6 h-6 animate-spin', tw.icon.muted)} />
        </div>
      )}
      {error && <p className={`text-sm ${typography.color.danger}`}>{error.message}</p>}
      {!loading && (!campaigns || campaigns.length === 0) && (
        <div className={cn(tw.card.flat, 'p-6 text-center')}>
          <Radar className={cn('w-10 h-10 mx-auto mb-3', tw.icon.muted)} />
          <p className={`font-medium ${typography.color.primary}`}>No saved Alma runs yet</p>
          <p className={`text-sm mt-1 ${typography.color.secondary}`}>Start a conversation to surface matched prospects.</p>
          <button onClick={onStartOver} className={cn('mt-4 px-4 py-2.5 rounded-xl text-sm min-h-[44px]', tw.button.accent)}>
            Start recruiting chat
          </button>
        </div>
      )}
      {campaigns?.map((row) => (
        <button
          key={row.id}
          onClick={() => onLoad(row)}
          className={cn(
            'w-full text-left p-4 rounded-2xl border transition-all',
            activeHistoryId === row.id
              ? 'bg-[var(--space-surface-panel-strong)] border-[var(--space-border-strong)] shadow-sm'
              : 'bg-white border-[var(--space-border-default)] hover:bg-[var(--space-surface-card-hover)]'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`font-semibold truncate ${typography.color.primary}`}>{row.university_name}</p>
              <p className={`text-xs mt-0.5 line-clamp-1 ${typography.color.secondary}`}>{row.programs} · {row.regions}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn(tw.badge.default, row.status === 'archived' ? tw.badge.neutral : tw.badge.accent)}>{row.status || 'active'}</span>
              <button onClick={(e) => { e.stopPropagation(); onArchive(row); }} className={cn('p-1.5 rounded-lg', tw.button.ghost)} aria-label="Archive">
                <History className={cn('w-4 h-4', tw.icon.muted)} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(row.id); }} className={cn('p-1.5 rounded-lg', tw.button.ghost)} aria-label="Delete">
                <Trash2 className={cn('w-4 h-4', tw.icon.danger)} />
              </button>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function AlmaApp() {
  const { data: campaigns, loading, error, refresh } = window.useWorkspaceDB<CampaignRow>('prospect_radar_campaigns', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 40,
  });
  const { data: studentSignals } = window.useWorkspaceDB<StudentSignal>('fit_shortlists', {
    shared: true,
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });

  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<AppPhase>('intake');
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<RadarProfile>(EMPTY_PROFILE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
  const [resultSummary, setResultSummary] = useState('');
  const [resultLeads, setResultLeads] = useState<LeadMatch[]>([]);
  const [previewLeads, setPreviewLeads] = useState<LeadMatch[]>([]);
  const [isUpdatingProspects, setIsUpdatingProspects] = useState(false);
  const [resultInstitution, setResultInstitution] = useState('Your institution');
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [contacted, setContacted] = useState<Set<string>>(new Set());
  const [outreachLead, setOutreachLead] = useState<LeadMatch | null>(null);
  const [mobileProspectsOpen, setMobileProspectsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState('');

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const initialized = useRef(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = INTAKE_STEPS[stepIndex];
  const isReview = currentStep?.id === 'review';
  const usesChipPicker = stepUsesChipPicker(currentStep);

  const liveSignalCount = (studentSignals || []).filter((s) => s.status !== 'archived').length;
  const displayLeads = phase === 'results' || phase === 'generating' ? resultLeads : previewLeads;
  const leadCount = displayLeads.length;
  const displayInstitution = phase === 'results' || phase === 'generating' ? resultInstitution : profile.institutionName;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }, []);

  const pushAdvisorMessage = useCallback((content: string, stepId?: string) => {
    setMessages((prev) => [...prev, { id: `a-${Date.now()}-${Math.random()}`, role: 'advisor', content, stepId }]);
    scrollToBottom();
  }, [scrollToBottom]);

  const pushUserMessage = useCallback((content: string, stepId?: string) => {
    setMessages((prev) => [...prev, { id: `u-${Date.now()}-${Math.random()}`, role: 'user', content, stepId }]);
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => { setSessionEmail(readSessionEmail()); }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setIsTyping(true);
    const timer = setTimeout(() => { setIsTyping(false); pushAdvisorMessage(INTAKE_STEPS[0].advisorPrompt, 'welcome'); }, 700);
    return () => clearTimeout(timer);
  }, [pushAdvisorMessage]);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    if (phase !== 'intake' || !profileHasMeaningfulAnswers(profile)) {
      if (phase === 'intake') setPreviewLeads([]);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setIsUpdatingProspects(true);
    previewTimer.current = setTimeout(() => {
      const preview = buildFallbackLeads(profile, studentSignals || [], []);
      setPreviewLeads(preview.leads);
      setIsUpdatingProspects(false);
    }, 450);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [profile, phase, studentSignals]);

  const handleChipPress = (chip: string) => {
    setSelectedChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  };

  const selectionCount = selectedChips.length + (otherText.trim() ? 1 : 0);

  const composeAnswer = () => {
    if (!usesChipPicker) return draft.trim();
    const parts = [...selectedChips];
    const other = otherText.trim();
    if (other) parts.push(other);
    return parts.join(', ');
  };

  const canAdvance = () => {
    if (!currentStep) return false;
    if (currentStep.optional || isReview) return true;
    return composeAnswer().length > 0;
  };

  const handleGenerate = async (sourceProfile: RadarProfile) => {
    setGenerating(true);
    setPhase('generating');
    setNotice('');
    pushAdvisorMessage('Give me a moment — I am scanning live student signals and ranking your strongest matches…');
    try {
      const searchResults = await searchRecruitmentSignals(sourceProfile);
      const radar = await generateRadarLeads(sourceProfile, studentSignals || [], searchResults);
      const institution = sourceProfile.institutionName.trim() || 'Your institution';
      await window.__workspaceDb.from('prospect_radar_campaigns').insert({
        university_name: institution,
        target_profile: `${sourceProfile.academicLevel} · ${sourceProfile.studentInterests}`,
        programs: sourceProfile.programTypes,
        priorities: sourceProfile.enrollmentPriorities,
        strengths: sourceProfile.enrollmentPriorities,
        regions: sourceProfile.regions,
        engagement_goals: sourceProfile.studentGoals,
        summary: radar.summary,
        status: 'active',
        leads_json: JSON.stringify(radar.leads),
      });
      setResultSummary(radar.summary);
      setResultLeads(radar.leads);
      setResultInstitution(institution);
      setFlagged(new Set());
      setContacted(new Set());
      setActiveHistoryId(null);
      setPhase('results');
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not build your prospect list. Please try again.');
      setPhase('intake');
    } finally {
      setGenerating(false);
      setIsTyping(false);
    }
  };

  const advanceStep = async (answerOverride?: string) => {
    if (!currentStep || generating) return;
    const finalAnswer = (answerOverride ?? composeAnswer()).trim();
    if (!currentStep.optional && !isReview && !finalAnswer) return;
    let nextProfile = profile;
    if (!isReview) {
      const displayAnswer = currentStep.id === 'welcome' && !finalAnswer ? 'I would rather not say' : finalAnswer;
      pushUserMessage(displayAnswer, currentStep.id);
      if (currentStep.field) {
        nextProfile = { ...profile, [currentStep.field]: currentStep.id === 'welcome' && !finalAnswer ? '' : finalAnswer };
        setProfile(nextProfile);
      }
    }
    setDraft('');
    setSelectedChips([]);
    setOtherText('');
    setShowOtherInput(false);
    if (isReview) { await handleGenerate(nextProfile); return; }
    const nextIndex = stepIndex + 1;
    if (nextIndex >= INTAKE_STEPS.length) return;
    setIsTyping(true);
    setStepIndex(nextIndex);
    setTimeout(() => { setIsTyping(false); pushAdvisorMessage(INTAKE_STEPS[nextIndex].advisorPrompt, INTAKE_STEPS[nextIndex].id); }, 600);
  };

  const startOver = () => {
    setPhase('intake');
    setStepIndex(0);
    setProfile(EMPTY_PROFILE);
    setMessages([]);
    setDraft('');
    setSelectedChips([]);
    setOtherText('');
    setShowOtherInput(false);
    setNotice('');
    setResultLeads([]);
    setPreviewLeads([]);
    setActiveHistoryId(null);
    setFlagged(new Set());
    setContacted(new Set());
    initialized.current = false;
    setTimeout(() => {
      initialized.current = true;
      setIsTyping(true);
      setTimeout(() => { setIsTyping(false); pushAdvisorMessage(INTAKE_STEPS[0].advisorPrompt, 'welcome'); }, 500);
    }, 50);
  };

  const loadHistoryItem = (row: CampaignRow) => {
    setActiveHistoryId(row.id);
    setResultSummary(row.summary);
    setResultInstitution(row.university_name);
    setResultLeads(parseLeads(row.leads_json));
    setFlagged(new Set());
    setContacted(new Set());
    setPhase('results');
  };

  const toggleFlag = (label: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const markContacted = (lead: LeadMatch) => {
    setContacted((prev) => new Set(prev).add(lead.label));
    setNotice(`Outreach logged for ${lead.label}.`);
  };

  const handleArchive = async (row: CampaignRow) => {
    await window.__workspaceDb.from('prospect_radar_campaigns').update(row.id, { status: row.status === 'archived' ? 'active' : 'archived' });
    refresh();
  };

  const handleDelete = async (id: number) => {
    await window.__workspaceDb.from('prospect_radar_campaigns').delete(id);
    if (activeHistoryId === id) setActiveHistoryId(null);
    refresh();
  };

  useEffect(() => { setSelectedChips([]); setOtherText(''); setShowOtherInput(false); }, [stepIndex]);

  const showChipsForCurrentStep = phase === 'intake' && !isTyping && !isReview && usesChipPicker;
  const showReview = phase === 'intake' && isReview && !isTyping;

  const inputPlaceholder = useMemo(() => {
    if (isReview) return '';
    if (usesChipPicker && showOtherInput) return currentStep?.placeholder || 'Type your answer…';
    if (usesChipPicker) return 'Or type a custom answer…';
    return currentStep?.placeholder || 'Type your answer…';
  }, [isReview, usesChipPicker, showOtherInput, currentStep]);

  const inputValue = usesChipPicker ? (showOtherInput ? otherText : draft) : draft;
  const setInputValue = (val: string) => {
    if (usesChipPicker && showOtherInput) setOtherText(val);
    else setDraft(val);
  };

  const prospectPanel = (
    <ProspectPanel
      leads={displayLeads}
      isUpdating={isUpdatingProspects}
      isGenerating={phase === 'generating'}
      summary={phase === 'results' ? resultSummary : undefined}
      institutionName={displayInstitution || undefined}
      flagged={flagged}
      contacted={contacted}
      expandedId={expandedId}
      onFlag={toggleFlag}
      onReachOut={setOutreachLead}
      onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
      emptyMessage="Answer a few questions and matched prospects will appear here as we learn your recruiting brief."
      liveSignalCount={liveSignalCount}
    />
  );

  if (phase === 'history') {
    return (
      <div className="h-full min-h-0 w-full overflow-hidden bg-[var(--space-surface-page)] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--space-border-default)] bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <AdvisorAvatar />
            <div className="min-w-0">
              <h1 className={`font-semibold text-base truncate ${typography.color.primary}`}>Saved Alma runs</h1>
              <p className={`text-xs truncate ${typography.color.tertiary}`}>Alma</p>
            </div>
          </div>
          <button
            onClick={() => setPhase(resultLeads.length ? 'results' : 'intake')}
            className={cn('px-3 py-2 rounded-full text-xs font-medium min-h-[44px]', tw.button.secondary)}
          >
            Back
          </button>
        </div>
        <HistoryView
          campaigns={campaigns}
          loading={loading}
          error={error}
          activeHistoryId={activeHistoryId}
          onLoad={loadHistoryItem}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onStartOver={startOver}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[var(--space-surface-page)] md:p-4 flex flex-col md:flex-row md:gap-4 md:min-h-0 md:h-full md:overflow-hidden">
      {/* LEFT — Conversational intake */}
      <div className="flex flex-col min-h-0 h-full flex-1 md:w-[40%] md:max-w-[40%] md:flex-none">
        <div className="flex flex-col min-h-0 h-full overflow-hidden md:rounded-2xl md:border md:border-[var(--space-border-default)] md:bg-white md:shadow-[0_8px_30px_rgba(0,0,0,0.06)] bg-white">
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--space-border-default)] bg-white">
            <AdvisorAvatar />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${typography.color.primary}`}>Alma</p>
              <p className={`text-xs ${typography.color.tertiary}`}>Prospect matching assistant</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setPhase('history')}
                className={cn('p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center', tw.button.ghost)}
                aria-label="Saved runs"
              >
                <History className="w-4 h-4" />
              </button>
              {(phase === 'results' || phase === 'generating') && (
                <button
                  onClick={startOver}
                  className={cn('px-3 py-2 rounded-full text-xs font-medium min-h-[44px]', tw.button.secondary)}
                >
                  New chat
                </button>
              )}
              <AppProfileMenu roleLabel="University" />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4 bg-[var(--space-surface-page)]/40 md:bg-[var(--space-surface-muted)]/30">
            {liveSignalCount > 0 && phase === 'intake' && (
              <p className={`text-xs flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[var(--space-border-default)] ${typography.color.secondary}`}>
                <Radio className={cn('w-3.5 h-3.5', tw.icon.primary)} />
                {liveSignalCount} live student signal{liveSignalCount === 1 ? '' : 's'} ready to match
              </p>
            )}
            {messages.map((msg, idx) => {
              const isLastAdvisor = msg.role === 'advisor' && idx === messages.length - 1 && !isTyping;
              const isCurrentStepMsg = isLastAdvisor && msg.stepId === currentStep?.id;
              return (
                <div key={msg.id}>
                  <ChatBubble message={msg} />
                  {isCurrentStepMsg && showChipsForCurrentStep && currentStep?.chips && (
                    <div className="ml-10">
                      <ChipPicker
                        chips={currentStep.chips}
                        selectedChips={selectedChips}
                        onChipPress={handleChipPress}
                        showOther={showOtherInput}
                        onOtherPress={() => setShowOtherInput((v) => !v)}
                      />
                      {selectionCount > 0 && (
                        <p className={`text-xs mt-2 ${typography.color.brand}`}>{selectionCount} selected — tap Continue when ready</p>
                      )}
                    </div>
                  )}
                  {isCurrentStepMsg && showReview && (
                    <div className="ml-10"><ReviewSummary profile={profile} /></div>
                  )}
                </div>
              );
            })}
            {isTyping && <TypingIndicator />}
            {notice && (
              <p className={`text-sm text-center ${notice.includes('Could not') ? typography.color.danger : typography.color.secondary}`}>{notice}</p>
            )}
            {phase === 'results' && (
              <div className="ml-10 rounded-2xl p-4 bg-white border border-[var(--space-border-default)] shadow-sm">
                <div className="flex items-start gap-2">
                  <ShieldCheck className={cn('w-4 h-4 flex-shrink-0 mt-0.5', tw.icon.primary)} />
                  <p className={`text-xs leading-relaxed ${typography.color.secondary}`}>
                    Matches are ranked by program fit, geographic reach, and enrollment priorities. Flag top picks and use Reach out to copy a personalized message.
                  </p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {!isTyping && phase !== 'results' && (
            <div className="flex-shrink-0 border-t border-[var(--space-border-default)] bg-white p-3 sm:p-4">
              {isReview ? (
                <button
                  onClick={() => advanceStep()}
                  disabled={generating}
                  className={cn('w-full rounded-full px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold min-h-[48px]', tw.button.accent, generating && tw.button.disabled)}
                >
                  {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radar className="w-5 h-5" />}
                  {generating ? 'Scanning prospects…' : 'Surface my matched prospects'}
                </button>
              ) : (
                <div className="flex gap-2 items-end">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canAdvance()) advanceStep(); } }}
                    placeholder={inputPlaceholder}
                    className={cn(tw.input.base, tw.input.default, 'rounded-full flex-1 text-base min-h-[48px] px-4')}
                  />
                  <button
                    onClick={() => advanceStep()}
                    disabled={!canAdvance() || generating}
                    className={cn('p-3 rounded-full flex-shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center', tw.button.accent, (!canAdvance() || generating) && tw.button.disabled)}
                    aria-label="Continue"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
              {currentStep?.optional && !isReview && (
                <button onClick={() => advanceStep('')} className={cn('w-full mt-2 py-2 text-xs', typography.color.tertiary, 'hover:underline')}>Skip for now</button>
              )}
            </div>
          )}

          {phase === 'results' && !isTyping && (
            <div className="flex-shrink-0 border-t border-[var(--space-border-default)] bg-white p-3 sm:p-4">
              <button onClick={startOver} className={cn('w-full rounded-full px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold min-h-[48px]', tw.button.secondary)}>
                <Target className="w-5 h-5" />
                Refine recruiting brief
              </button>
            </div>
          )}

          <UniversityProfileFooter institutionName={profile.institutionName || resultInstitution} email={sessionEmail} />
        </div>
      </div>

      {/* RIGHT — Live prospect panel (desktop) */}
      <div className="hidden md:flex md:w-[60%] md:flex-none min-h-0 h-full">
        <div className="flex flex-col min-h-0 h-full w-full rounded-2xl border border-[var(--space-border-default)] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden">
          {prospectPanel}
        </div>
      </div>

      {/* MOBILE — Floating prospects pill */}
      {isMobile && leadCount > 0 && !mobileProspectsOpen && (
        <button
          onClick={() => setMobileProspectsOpen(true)}
          className="md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] shadow-lg text-sm font-medium min-h-[48px]"
        >
          <Users className="w-4 h-4" />
          Matched prospects · {leadCount}
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {isMobile && leadCount === 0 && phase === 'intake' && profileHasMeaningfulAnswers(profile) && !mobileProspectsOpen && (
        <button
          onClick={() => setMobileProspectsOpen(true)}
          className="md:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--space-border-default)] text-[var(--space-text-primary)] shadow-lg text-sm font-medium min-h-[48px]"
        >
          <Loader2 className="w-4 h-4 animate-spin text-[var(--space-brand-highlight)]" />
          Updating prospects…
        </button>
      )}

      {/* MOBILE — Prospects drawer */}
      {isMobile && mobileProspectsOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileProspectsOpen(false)} />
          <div className="relative bg-[var(--space-surface-page)] rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-[var(--space-border-strong)]" />
            </div>
            <button onClick={() => setMobileProspectsOpen(false)} className="absolute top-3 right-3 p-2 rounded-full hover:bg-[var(--space-surface-muted)] min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close prospects">
              <X className="w-5 h-5 text-[var(--space-text-secondary)]" />
            </button>
            <div className="flex-1 min-h-0 overflow-hidden">{prospectPanel}</div>
          </div>
        </div>
      )}

      {outreachLead && (
        <OutreachModal
          lead={outreachLead}
          universityName={resultInstitution}
          onClose={() => setOutreachLead(null)}
          onMarkContacted={() => markContacted(outreachLead)}
        />
      )}
    </div>
  );
}

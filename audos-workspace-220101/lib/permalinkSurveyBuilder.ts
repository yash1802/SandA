import { STUDENT_SURVEY, UNIVERSITY_SURVEY, type SurveyConfig } from './surveyDefinitions';

const CONFIG_BY_TYPE: Record<'student' | 'university', SurveyConfig> = {
  student: STUDENT_SURVEY,
  university: UNIVERSITY_SURVEY,
};

/**
 * Builds a self-contained TSX permalink page for a survey.
 * Permalink pages cannot import workspace modules — all logic is inlined.
 * Part 1 and Part 2 each show all questions on one scrollable page.
 */
export function buildPermalinkSurveySource(surveyType: 'student' | 'university'): string {
  const config = CONFIG_BY_TYPE[surveyType];
  const accent = surveyType === 'university' ? 'highlight' : 'primary';
  const configJson = JSON.stringify(config);

  return `import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, ChevronRight, Loader2, ClipboardList } from 'lucide-react';

const SURVEY_CONFIG = ${configJson};
const SURVEY_TYPE = '${surveyType}';
const WORKSPACE_ID = (window as any).__PERMALINK_WORKSPACE_ID__ || 'workspace-220101';
const ACCENT = '${accent}';

function partQuestions(part) {
  return SURVEY_CONFIG.questions.filter((q) => q.part === part);
}

function otherKey(id) { return id + '__other'; }
function emailKey(id) { return id + '__email'; }

function isAnswered(q, answers) {
  const value = answers[q.id];
  if (value === undefined || value === null) return !q.required;
  if (q.type === 'text') return !q.required || (typeof value === 'string' && value.trim());
  if (q.type === 'scale') return typeof value === 'number' && value >= 1 && value <= 5;
  if (q.type === 'single') {
    const v = value || {};
    if (!v.value) return !q.required;
    const opt = q.options?.find((o) => o.value === v.value);
    if (opt?.hasFreeText && v.value !== 'prefer_not_say') return !q.required || !!(v.otherText && v.otherText.trim());
    return true;
  }
  if (q.type === 'multiselect') {
    const v = value || {};
    if (!v.selected?.length) return !q.required;
    if (v.selected.includes('other') && !v.otherText?.trim()) return false;
    return true;
  }
  if (q.type === 'email_opt_in') {
    const v = value || {};
    if (!v.choice) return !q.required;
    if (v.choice === 'yes') return !!(v.email && v.email.includes('@'));
    return true;
  }
  return true;
}

function partComplete(questions, answers) {
  return questions.every((q) => isAnswered(q, answers));
}

function normalizeAnswers(answers) {
  const normalized = {};
  for (const q of SURVEY_CONFIG.questions) {
    const value = answers[q.id];
    if (value === undefined || value === null) continue;
    if (q.type === 'multiselect' && value.selected) {
      normalized[q.id] = value.selected;
      if (value.otherText?.trim()) normalized[otherKey(q.id)] = value.otherText.trim();
    } else if (q.type === 'single' && value.value) {
      normalized[q.id] = value.value;
      if (value.otherText?.trim()) normalized[otherKey(q.id)] = value.otherText.trim();
    } else if (q.type === 'email_opt_in' && value.choice) {
      normalized[q.id] = value.choice;
      if (value.email?.trim()) normalized[emailKey(q.id)] = value.email.trim();
    } else {
      normalized[q.id] = value;
    }
  }
  return normalized;
}

function formatAnswers(normalized) {
  const formatted = {};
  for (const q of SURVEY_CONFIG.questions) {
    const raw = normalized[q.id];
    const key = 'Q' + q.number + '. ' + q.label;
    if (q.type === 'multiselect') {
      const selected = Array.isArray(raw) ? raw : [];
      formatted[key] = selected.map((v) => {
        const opt = q.options?.find((o) => o.value === v);
        if (v === 'other') return 'Other: ' + (normalized[otherKey(q.id)] || '');
        return opt?.label || v;
      });
    } else if (q.type === 'single') {
      const opt = q.options?.find((o) => o.value === raw);
      let label = opt?.label || raw;
      if (opt?.hasFreeText && normalized[otherKey(q.id)]) label += ': ' + normalized[otherKey(q.id)];
      formatted[key] = label;
    } else if (q.type === 'email_opt_in') {
      const opt = q.options?.find((o) => o.value === raw);
      formatted[key] = opt?.label || raw;
      if (raw === 'yes' && normalized[emailKey(q.id)]) formatted[key + ' (email)'] = normalized[emailKey(q.id)];
    } else {
      formatted[key] = raw;
    }
  }
  return formatted;
}

function extractEmail(normalized) {
  const q = SURVEY_CONFIG.questions.find((item) => item.type === 'email_opt_in');
  if (!q || normalized[q.id] !== 'yes') return null;
  const email = normalized[emailKey(q.id)];
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

function ScaleInput({ value, onChange, minLabel, maxLabel }) {
  const active = ACCENT === 'highlight'
    ? 'bg-[#ff5a5f] text-[#111827] border-[#ff5a5f]'
    : 'bg-[#00b8d9] text-[#111827] border-[#00b8d9]';
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        {[1,2,3,4,5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={'flex-1 min-h-[52px] rounded-xl text-base font-semibold border transition-all ' + (value === n ? active + ' shadow-sm' : 'bg-white text-[#00343d] border-[#c7eff7]')}>
            {n}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between gap-3 text-xs text-[#008198]">
          <span className="max-w-[45%]">{minLabel}</span>
          <span className="max-w-[45%] text-right">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function QuestionField({ question, value, onChange }) {
  const active = ACCENT === 'highlight'
    ? 'bg-[#ff5a5f] text-[#111827] border-[#ff5a5f]'
    : 'bg-[#00b8d9] text-[#111827] border-[#00b8d9]';

  if (question.type === 'text') {
    return (
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder} rows={4}
        className="w-full px-4 py-3 border border-[#c7eff7] rounded-xl text-base resize-y min-h-[120px]" />
    );
  }
  if (question.type === 'scale') {
    return <ScaleInput value={value} onChange={onChange} minLabel={question.scaleMinLabel} maxLabel={question.scaleMaxLabel} />;
  }
  if (question.type === 'single') {
    const current = value || { value: '' };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const isActive = current.value === opt.value;
          return (
            <div key={opt.value}>
              <button type="button" onClick={() => onChange({ value: opt.value, otherText: isActive ? current.otherText : '' })}
                className={'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium min-h-[48px] ' + (isActive ? active : 'bg-white text-[#00343d] border-[#c7eff7]')}>
                {isActive && '✓ '} {opt.label}
              </button>
              {isActive && opt.hasFreeText && (
                <input type="text" value={current.otherText || ''} onChange={(e) => onChange({ value: opt.value, otherText: e.target.value })}
                  placeholder="Tell us more…" className="w-full px-4 py-3 border border-[#c7eff7] rounded-xl mt-2 text-base" />
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (question.type === 'multiselect') {
    const current = value || { selected: [] };
    const toggle = (val) => {
      const selected = current.selected.includes(val) ? current.selected.filter((s) => s !== val) : [...current.selected, val];
      onChange({ selected, otherText: val === 'other' && !selected.includes('other') ? '' : current.otherText });
    };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const isActive = current.selected.includes(opt.value);
          return (
            <div key={opt.value}>
              <button type="button" onClick={() => toggle(opt.value)}
                className={'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium min-h-[48px] ' + (isActive ? active : 'bg-white text-[#00343d] border-[#c7eff7]')}>
                {isActive && '✓ '} {opt.label}
              </button>
              {isActive && opt.hasFreeText && (
                <input type="text" value={current.otherText || ''} onChange={(e) => onChange({ selected: current.selected, otherText: e.target.value })}
                  placeholder="Please specify…" className="w-full px-4 py-3 border border-[#c7eff7] rounded-xl mt-2 text-base" />
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (question.type === 'email_opt_in') {
    const current = value || { choice: '' };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const isActive = current.choice === opt.value;
          return (
            <div key={opt.value}>
              <button type="button" onClick={() => onChange({ choice: opt.value, email: opt.value === 'yes' ? current.email : undefined })}
                className={'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium min-h-[48px] ' + (isActive ? active : 'bg-white text-[#00343d] border-[#c7eff7]')}>
                {isActive && '✓ '} {opt.label}
              </button>
              {isActive && opt.value === 'yes' && (
                <input type="email" value={current.email || ''} onChange={(e) => onChange({ choice: 'yes', email: e.target.value })}
                  placeholder="your.email@university.ac.uk" className="w-full px-4 py-3 border border-[#c7eff7] rounded-xl mt-2 text-base" autoComplete="email" />
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

function SurveyPage() {
  const part1 = useMemo(() => partQuestions(1), []);
  const part2 = useMemo(() => partQuestions(2), []);
  const [phase, setPhase] = useState('part1');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const accentBtn = ACCENT === 'highlight'
    ? 'bg-[#ff5a5f] hover:brightness-95 text-[#111827]'
    : 'bg-[#00b8d9] hover:brightness-95 text-[#111827]';
  const accentBg = ACCENT === 'highlight' ? 'bg-[#ff5a5f]' : 'bg-[#00b8d9]';
  const progressBar = ACCENT === 'highlight' ? 'bg-[#ff5a5f]' : 'bg-[#00b8d9]';

  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const normalized = normalizeAnswers(answers);
      const formatted = formatAnswers(normalized);
      const contactEmail = extractEmail(normalized);
      const res = await fetch('/api/workspaces/' + WORKSPACE_ID + '/hooks/submit-survey-response/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyType: SURVEY_TYPE, responses: formatted, contactEmail, source: 'permalink' }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setPhase('complete');
    } catch (e) {
      setError(e?.message || 'Could not save your responses.');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f2fbfd] font-sans">
        <div className="max-w-md w-full p-8 text-center bg-white rounded-2xl shadow-sm border border-[#c7eff7]">
          <div className="w-14 h-14 rounded-2xl bg-[#20e3b2] text-[#111827] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[#00343d] mb-2">Thank you</h2>
          <p className="text-sm text-[#006375] leading-relaxed">Your responses have been recorded. We really appreciate you taking the time to share your perspective.</p>
        </div>
      </div>
    );
  }

  if (phase === 'transition') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f2fbfd] font-sans">
        <div className="max-w-lg w-full p-6 sm:p-8 bg-white rounded-2xl shadow-sm border border-[#c7eff7]">
          <p className="text-sm text-[#006375] leading-relaxed mb-4">{SURVEY_CONFIG.transitionCopy}</p>
          <div className="rounded-xl p-4 bg-[#fafefe] border border-[#c7eff7] mb-6">
            <p className="text-sm text-[#00343d] leading-relaxed">{SURVEY_CONFIG.productDescription}</p>
          </div>
          <button type="button" onClick={() => setPhase('part2')}
            className={'w-full rounded-xl px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold min-h-[48px] ' + accentBtn}>
            Continue to Part 2 <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  const activeQuestions = phase === 'part1' ? part1 : part2;
  const partNum = phase === 'part1' ? 1 : 2;
  const canContinue = partComplete(activeQuestions, answers);

  return (
    <div className="min-h-screen bg-[#f2fbfd] font-sans">
      <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 pb-28">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className={'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-[#111827] ' + accentBg}>
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#008198]">Part {partNum} of 2</p>
              <h1 className="text-lg sm:text-xl font-bold leading-snug text-[#00343d]">{SURVEY_CONFIG.title}</h1>
            </div>
          </div>
          {phase === 'part1' && (
            <p className="text-sm text-[#006375] leading-relaxed">{SURVEY_CONFIG.intro}</p>
          )}
          <div className="mt-4 h-1.5 rounded-full bg-[#fafefe] overflow-hidden">
            <div className={'h-full rounded-full transition-all duration-300 ' + progressBar} style={{ width: phase === 'part1' ? '50%' : '100%' }} />
          </div>
        </header>

        <div className="space-y-8">
          {activeQuestions.map((question) => (
            <section key={question.id} className="space-y-3">
              <label className="block text-sm sm:text-base font-medium leading-snug text-[#00343d]">
                <span className="text-[#008198] font-semibold mr-1.5">{question.number}.</span>
                {question.label}
                {!question.required && <span className="ml-1.5 text-xs font-normal text-[#008198]">(optional)</span>}
              </label>
              <QuestionField question={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
            </section>
          ))}
        </div>

        {error && <p className="mt-6 text-sm text-center text-[#dc2626]">{error}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[#c7eff7] bg-white/95 backdrop-blur-sm p-4">
        <div className="max-w-xl mx-auto">
          <button type="button" disabled={!canContinue || submitting}
            onClick={() => { if (phase === 'part1') setPhase('transition'); else handleSubmit(); }}
            className={'w-full rounded-xl px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold min-h-[48px] ' + accentBtn + ((!canContinue || submitting) ? ' opacity-50' : '')}>
            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</> : phase === 'part1' ? <>Continue <ChevronRight className="w-5 h-5" /></> : 'Submit survey'}
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<SurveyPage />);
`;
}

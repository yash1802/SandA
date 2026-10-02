import { useLayoutEffect, useState, useMemo } from 'react';
import { CheckCircle2, ChevronRight, Loader2, ClipboardList } from 'lucide-react';
import { tw, typography, cn } from '../lib/colors';
import type { SurveyConfig, SurveyQuestion, AnswerValue } from '../lib/surveyDefinitions';
import { normalizeSurveyAnswers, submitSurveyResponse } from '../lib/surveySubmit';

type Phase = 'part1' | 'transition' | 'part2' | 'complete';

interface ResearchSurveyFormProps {
  config: SurveyConfig;
  accent?: 'primary' | 'highlight';
}

function accentActiveClass(accent: 'primary' | 'highlight') {
  return accent === 'highlight'
    ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] border-[var(--space-brand-highlight)]'
    : 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] border-[var(--space-brand-primary)]';
}

function surveyBrandMeta(config: SurveyConfig) {
  if (config.id === 'university') {
    return {
      persona: 'Alma',
      tagline: 'University recruitment research',
      completeTitle: 'Thanks — that really helps',
      completeBody:
        'Your perspective shapes how Alma connects universities with students who genuinely fit. We appreciate you taking the time.',
    };
  }
  return {
    persona: 'Scout',
    tagline: 'Student university search research',
    completeTitle: 'Thanks — that really helps',
    completeBody:
      'Your experience shapes how Scout helps students find universities that actually fit. We appreciate you taking the time.',
  };
}

const SURVEY_GRADIENT =
  'radial-gradient(circle at top left, var(--space-brand-contrast), transparent 28%), radial-gradient(circle at bottom right, var(--space-brand-primary-50), transparent 32%), var(--space-surface-page)';

function getPartQuestions(config: SurveyConfig, part: 1 | 2) {
  return config.questions.filter((q) => q.part === part);
}

function isAnswered(question: SurveyQuestion, answers: Record<string, AnswerValue>): boolean {
  const value = answers[question.id];
  if (value === undefined || value === null) return !question.required;

  switch (question.type) {
    case 'text':
      return !question.required || (typeof value === 'string' && value.trim().length > 0);
    case 'scale':
      return typeof value === 'number' && value >= 1 && value <= 5;
    case 'single': {
      const v = value as { value: string; otherText?: string };
      if (!v?.value) return !question.required;
      const opt = question.options?.find((o) => o.value === v.value);
      if (opt?.hasFreeText && v.value !== 'prefer_not_say') {
        return !question.required || !!(v.otherText && v.otherText.trim());
      }
      return true;
    }
    case 'multiselect': {
      const v = value as { selected: string[]; otherText?: string };
      if (!v?.selected?.length) return !question.required;
      if (v.selected.includes('other') && !v.otherText?.trim()) return false;
      return true;
    }
    case 'email_opt_in': {
      const v = value as { choice: string; email?: string };
      if (!v?.choice) return !question.required;
      if (v.choice === 'yes') return !!(v.email && v.email.includes('@'));
      return true;
    }
    default:
      return true;
  }
}

function partIsComplete(questions: SurveyQuestion[], answers: Record<string, AnswerValue>) {
  return questions.every((q) => isAnswered(q, answers));
}

function ScaleInput({
  value,
  onChange,
  minLabel,
  maxLabel,
  accent = 'primary',
}: {
  value?: number;
  onChange: (n: number) => void;
  minLabel?: string;
  maxLabel?: string;
  accent?: 'primary' | 'highlight';
}) {
  const activeClass = accentActiveClass(accent);
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 min-h-[52px] rounded-xl text-base font-semibold border transition-all',
              value === n
                ? `${activeClass} shadow-sm`
                : 'bg-white text-[var(--space-text-primary)] border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
            )}
            aria-pressed={value === n}
          >
            {n}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between gap-3 text-xs text-[var(--space-text-muted)]">
          <span className="max-w-[45%]">{minLabel}</span>
          <span className="max-w-[45%] text-right">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  accent = 'primary',
}: {
  question: SurveyQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  accent?: 'primary' | 'highlight';
}) {
  const activeClass = accentActiveClass(accent);

  if (question.type === 'text') {
    return (
      <textarea
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        rows={4}
        className={cn(tw.input.base, tw.input.default, 'rounded-xl text-base resize-y min-h-[120px]')}
      />
    );
  }

  if (question.type === 'scale') {
    return (
      <ScaleInput
        value={value as number | undefined}
        onChange={onChange}
        minLabel={question.scaleMinLabel}
        maxLabel={question.scaleMaxLabel}
        accent={accent}
      />
    );
  }

  if (question.type === 'single') {
    const current = (value as { value: string; otherText?: string }) || { value: '' };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const active = current.value === opt.value;
          return (
            <div key={opt.value}>
              <button
                type="button"
                onClick={() => onChange({ value: opt.value, otherText: active ? current.otherText : '' })}
                className={cn(
                  'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition-all min-h-[48px]',
                  active
                    ? activeClass
                    : 'bg-white text-[var(--space-text-primary)] border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                )}
              >
                {active && <CheckCircle2 className="inline w-4 h-4 mr-2 -mt-0.5" />}
                {opt.label}
              </button>
              {active && opt.hasFreeText && (
                <input
                  type="text"
                  value={current.otherText || ''}
                  onChange={(e) => onChange({ value: opt.value, otherText: e.target.value })}
                  placeholder="Tell us more…"
                  className={cn(tw.input.base, tw.input.default, 'rounded-xl mt-2 text-base')}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (question.type === 'multiselect') {
    const current = (value as { selected: string[]; otherText?: string }) || { selected: [] };
    const toggle = (val: string) => {
      const selected = current.selected.includes(val)
        ? current.selected.length > 1 || !question.required
          ? current.selected.filter((s) => s !== val)
          : current.selected
        : [...current.selected, val];
      onChange({ selected, otherText: val === 'other' && !selected.includes('other') ? '' : current.otherText });
    };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const active = current.selected.includes(opt.value);
          return (
            <div key={opt.value}>
              <button
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition-all min-h-[48px]',
                  active
                    ? activeClass
                    : 'bg-white text-[var(--space-text-primary)] border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                )}
              >
                {active && <CheckCircle2 className="inline w-4 h-4 mr-2 -mt-0.5" />}
                {opt.label}
              </button>
              {active && opt.hasFreeText && (
                <input
                  type="text"
                  value={current.otherText || ''}
                  onChange={(e) => onChange({ selected: current.selected, otherText: e.target.value })}
                  placeholder="Please specify…"
                  className={cn(tw.input.base, tw.input.default, 'rounded-xl mt-2 text-base')}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (question.type === 'email_opt_in') {
    const current = (value as { choice: string; email?: string }) || { choice: '' };
    return (
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const active = current.choice === opt.value;
          return (
            <div key={opt.value}>
              <button
                type="button"
                onClick={() => onChange({ choice: opt.value, email: opt.value === 'yes' ? current.email : undefined })}
                className={cn(
                  'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition-all min-h-[48px]',
                  active
                    ? activeClass
                    : 'bg-white text-[var(--space-text-primary)] border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                )}
              >
                {active && <CheckCircle2 className="inline w-4 h-4 mr-2 -mt-0.5" />}
                {opt.label}
              </button>
              {active && opt.value === 'yes' && (
                <input
                  type="email"
                  value={current.email || ''}
                  onChange={(e) => onChange({ choice: 'yes', email: e.target.value })}
                  placeholder="your.email@university.ac.uk"
                  className={cn(tw.input.base, tw.input.default, 'rounded-xl mt-2 text-base')}
                  autoComplete="email"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

export default function ResearchSurveyForm({ config, accent = 'primary' }: ResearchSurveyFormProps) {
  const brand = surveyBrandMeta(config);
  const [phase, setPhase] = useState<Phase>('part1');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Public survey pages own their scrolling. Keeping the document itself
  // fixed prevents focus and late font swaps from moving the body viewport.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverflowAnchor: html.style.overflowAnchor,
      bodyOverflow: body.style.overflow,
      bodyOverflowAnchor: body.style.overflowAnchor,
    };

    html.style.overflow = 'hidden';
    html.style.overflowAnchor = 'none';
    body.style.overflow = 'hidden';
    body.style.overflowAnchor = 'none';
    html.scrollTop = 0;
    body.scrollTop = 0;

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.overflowAnchor = previous.htmlOverflowAnchor;
      body.style.overflow = previous.bodyOverflow;
      body.style.overflowAnchor = previous.bodyOverflowAnchor;
    };
  }, []);

  const part1Questions = useMemo(() => getPartQuestions(config, 1), [config]);
  const part2Questions = useMemo(() => getPartQuestions(config, 2), [config]);

  const setAnswer = (id: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const normalized = normalizeSurveyAnswers(config, answers);
      await submitSurveyResponse(config.id, config, normalized, 'app');
      setPhase('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save your responses — please try once more.');
    } finally {
      setSubmitting(false);
    }
  };

  const accentButton = accent === 'highlight' ? tw.button.accent : tw.button.primary;

  if (phase === 'complete') {
    return (
      <div className="min-h-full h-full overflow-y-auto overscroll-y-contain flex items-center justify-center p-6" style={{ background: SURVEY_GRADIENT }}>
        <div className={cn(tw.card.elevated, 'max-w-md w-full p-8 text-center')}>
          <div
            className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4',
              accent === 'highlight'
                ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)]'
                : 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]'
            )}
          >
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <p className={cn('text-xs font-medium uppercase tracking-wide mb-2', typography.color.tertiary)}>Scout &amp; Alma</p>
          <h2 className={cn('text-xl font-bold mb-2', typography.color.primary)}>{brand.completeTitle}</h2>
          <p className={cn('text-sm leading-relaxed', typography.color.secondary)}>{brand.completeBody}</p>
        </div>
      </div>
    );
  }

  if (phase === 'transition') {
    return (
      <div className="min-h-full h-full overflow-y-auto overscroll-y-contain flex items-center justify-center p-6" style={{ background: SURVEY_GRADIENT }}>
        <div className={cn(tw.card.elevated, 'max-w-lg w-full p-6 sm:p-8')}>
          <p className={cn('text-xs font-medium uppercase tracking-wide mb-3', typography.color.tertiary)}>{brand.persona} · Part 1 complete</p>
          <p className={cn('text-sm leading-relaxed mb-4', typography.color.secondary)}>{config.transitionCopy}</p>
          <div className="rounded-xl p-4 bg-[var(--space-surface-muted)] border border-[var(--space-border-default)] mb-6">
            <p className={cn('text-xs font-semibold mb-2', typography.color.brand)}>What we are building</p>
            <p className={cn('text-sm leading-relaxed', typography.color.primary)}>{config.productDescription}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPhase('part2');
              setStepIndex(0);
            }}
            className={cn('w-full rounded-xl px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold min-h-[48px]', accentButton)}
          >
            Share your reaction
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  const activeQuestions = phase === 'part1' ? part1Questions : part2Questions;
  const partNum = phase === 'part1' ? 1 : 2;
  const currentQuestion = activeQuestions[stepIndex];
  const canAdvance = currentQuestion ? isAnswered(currentQuestion, answers) : false;

  const goNext = () => {
    setError('');
    if (!currentQuestion || !canAdvance) {
      setError('A quick answer here helps us keep going — even a short one works.');
      return;
    }
    if (stepIndex < activeQuestions.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    if (phase === 'part1') {
      setPhase('transition');
      return;
    }
    handleSubmit();
  };

  const goBack = () => {
    setError('');
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      return;
    }
    if (phase === 'part2') {
      setPhase('transition');
    }
  };

  return (
    <div className="min-h-full h-full flex flex-col overflow-y-auto overscroll-y-contain" style={{ background: SURVEY_GRADIENT }}>
      <div className="flex-1 max-w-xl mx-auto w-full px-4 pt-6 sm:pt-10 pb-36">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0',
              accent === 'highlight'
                ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)]'
                : 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)]'
            )}>
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className={cn('text-xs font-medium uppercase tracking-wide', typography.color.tertiary)}>{brand.persona} · {brand.tagline}</p>
              <p className={cn('text-[11px] mt-0.5', typography.color.tertiary)}>Part {partNum} of 2 · about 3–4 minutes</p>
              <h1 className={cn('text-lg sm:text-xl font-bold leading-snug mt-1', typography.color.brand)}>{config.title}</h1>
            </div>
          </div>
          {phase === 'part1' && (
            <p className={cn('text-sm leading-relaxed', typography.color.secondary)}>{config.intro}</p>
          )}
          <div className="mt-4 h-1.5 rounded-full bg-[var(--space-surface-muted)] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                accent === 'highlight' ? 'bg-[var(--space-brand-highlight)]' : 'bg-[var(--space-brand-primary)]'
              )}
              style={{
                width:
                  phase === 'part1'
                    ? `${Math.round(((stepIndex + 1) / Math.max(part1Questions.length, 1)) * 50)}%`
                    : `${50 + Math.round(((stepIndex + 1) / Math.max(part2Questions.length, 1)) * 50)}%`,
              }}
            />
          </div>
        </header>

        <div className="space-y-8">
          {currentQuestion && (
            <section className="space-y-3">
              <label className={cn('block text-sm sm:text-base font-medium leading-snug', typography.color.primary)}>
                <span className="text-[var(--space-text-muted)] font-semibold mr-1.5">{currentQuestion.number}.</span>
                {currentQuestion.label}
                {!currentQuestion.required && (
                  <span className={cn('ml-1.5 text-xs font-normal', typography.color.tertiary)}>(optional)</span>
                )}
              </label>
              <QuestionField
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                onChange={(v) => setAnswer(currentQuestion.id, v)}
                accent={accent}
              />
            </section>
          )}
        </div>

        {error && <p className={cn('mt-6 text-sm text-center', typography.color.danger)}>{error}</p>}
      </div>

      <div className="flex-shrink-0 fixed bottom-0 left-0 right-0 border-t border-[var(--space-border-default)] bg-[var(--space-surface-card)]/95 backdrop-blur-sm p-4 safe-bottom">
        <div className="max-w-xl mx-auto flex gap-2">
          {stepIndex > 0 || phase === 'part2' ? (
            <button
              type="button"
              onClick={goBack}
              className={cn('px-4 py-3.5 rounded-xl text-sm font-medium min-h-[48px]', tw.button.secondary)}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canAdvance || submitting}
            onClick={goNext}
            className={cn(
              'flex-1 rounded-xl px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold min-h-[48px]',
              accentButton,
              (!canAdvance || submitting) && tw.button.disabled
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Submitting…
              </>
            ) : phase === 'part1' && stepIndex === part1Questions.length - 1 ? (
              <>
                Continue <ChevronRight className="w-5 h-5" />
              </>
            ) : phase === 'part2' && stepIndex === part2Questions.length - 1 ? (
              'Submit responses'
            ) : (
              <>
                Next <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

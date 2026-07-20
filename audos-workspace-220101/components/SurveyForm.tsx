import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { tw, typography, cn } from '../lib/colors';
import type { SurveyConfig, SurveyQuestion } from '../lib/surveyDefinitions';

type Answers = Record<string, unknown>;

type Phase = 'intro' | 'questions' | 'transition' | 'done';

interface SurveyFormProps {
  config: SurveyConfig;
  accent?: 'primary' | 'highlight';
  onSubmit: (answers: Answers) => Promise<void>;
}

function part1Questions(config: SurveyConfig): SurveyQuestion[] {
  return config.questions.filter((q) => q.part === 1);
}

function part2Questions(config: SurveyConfig): SurveyQuestion[] {
  return config.questions.filter((q) => q.part === 2);
}

function getOtherTextKey(questionId: string) {
  return `${questionId}__other`;
}

function getEmailKey(questionId: string) {
  return `${questionId}__email`;
}

function isAnswered(question: SurveyQuestion, answers: Answers): boolean {
  const value = answers[question.id];

  if (question.type === 'text') {
    if (!question.required) return true;
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (question.type === 'scale') {
    return typeof value === 'number' && value >= 1 && value <= 5;
  }

  if (question.type === 'single') {
    if (typeof value !== 'string' || !value) return false;
    const option = question.options?.find((o) => o.value === value);
    if (option?.hasFreeText) {
      const other = answers[getOtherTextKey(question.id)];
      return typeof other === 'string' && other.trim().length > 0;
    }
    return true;
  }

  if (question.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    if (question.required && selected.length === 0) return false;
    if (selected.includes('other')) {
      const other = answers[getOtherTextKey(question.id)];
      return typeof other === 'string' && other.trim().length > 0;
    }
    return !question.required || selected.length > 0;
  }

  if (question.type === 'email_opt_in') {
    if (typeof value !== 'string' || !value) return false;
    if (value === 'yes') {
      const email = answers[getEmailKey(question.id)];
      return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }
    return true;
  }

  return true;
}

function toggleMulti(values: string[], optionValue: string): string[] {
  return values.includes(optionValue)
    ? values.filter((v) => v !== optionValue)
    : [...values, optionValue];
}

export default function SurveyForm({ config, accent = 'primary', onSubmit }: SurveyFormProps) {
  const part1 = useMemo(() => part1Questions(config), [config]);
  const part2 = useMemo(() => part2Questions(config), [config]);

  const [phase, setPhase] = useState<Phase>('intro');
  const [currentPart, setCurrentPart] = useState<1 | 2>(1);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeQuestions = currentPart === 1 ? part1 : part2;
  const question = activeQuestions[stepIndex];
  const totalSteps = part1.length + part2.length;
  const completedSteps =
    currentPart === 1 ? stepIndex : part1.length + stepIndex;
  const progressPct = phase === 'intro' ? 0 : phase === 'done' ? 100 : Math.round(((completedSteps + 1) / totalSteps) * 100);

  const accentButton = accent === 'highlight' ? tw.button.accent : tw.button.primary;
  const accentChipActive =
    accent === 'highlight'
      ? 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)] border-[var(--space-brand-highlight)]'
      : 'bg-[var(--space-brand-primary)] text-[var(--space-text-on-primary)] border-[var(--space-brand-primary)]';

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const goNext = async () => {
    setError('');
    if (!question || !isAnswered(question, answers)) {
      setError('Please answer this question before continuing.');
      return;
    }

    if (stepIndex < activeQuestions.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }

    if (currentPart === 1) {
      setPhase('transition');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(answers);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your responses. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setError('');
    if (phase === 'transition') {
      setPhase('questions');
      setCurrentPart(1);
      setStepIndex(part1.length - 1);
      return;
    }
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      return;
    }
    if (currentPart === 2) {
      setPhase('transition');
      setStepIndex(0);
      return;
    }
    setPhase('intro');
  };

  const startSurvey = () => {
    setPhase('questions');
    setCurrentPart(1);
    setStepIndex(0);
  };

  const continueToPart2 = () => {
    setPhase('questions');
    setCurrentPart(2);
    setStepIndex(0);
  };

  const renderScale = (q: SurveyQuestion) => {
    const value = answers[q.id] as number | undefined;
    return (
      <div className="space-y-4">
        <div className="flex justify-between gap-2 text-xs text-[var(--space-text-muted)]">
          <span>{q.scaleMinLabel}</span>
          <span>{q.scaleMaxLabel}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAnswer(q.id, n)}
              className={cn(
                'min-h-[52px] rounded-xl border text-base font-semibold transition-all',
                value === n
                  ? accentChipActive
                  : 'bg-white border-[var(--space-border-default)] text-[var(--space-text-primary)] hover:border-[var(--space-border-strong)]'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMulti = (q: SurveyQuestion) => {
    const selected = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
    const otherKey = getOtherTextKey(q.id);
    const showOther = selected.includes('other');

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {q.options?.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setAnswer(q.id, toggleMulti(selected, option.value))}
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm font-medium border min-h-[48px] text-left transition-all',
                  active ? accentChipActive : 'bg-white border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
                )}
              >
                {active && <CheckCircle2 className="inline w-4 h-4 mr-1.5 -mt-0.5" />}
                {option.label}
              </button>
            );
          })}
        </div>
        {showOther && (
          <input
            type="text"
            value={(answers[otherKey] as string) || ''}
            onChange={(e) => setAnswer(otherKey, e.target.value)}
            placeholder="Please specify…"
            className={cn(tw.input.base, tw.input.default, 'rounded-xl')}
          />
        )}
      </div>
    );
  };

  const renderSingle = (q: SurveyQuestion) => {
    const value = answers[q.id] as string | undefined;
    const otherKey = getOtherTextKey(q.id);
    const selectedOption = q.options?.find((o) => o.value === value);

    return (
      <div className="space-y-2">
        {q.options?.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all min-h-[52px]',
              value === option.value
                ? 'border-[var(--space-border-strong)] bg-[var(--space-surface-muted)]'
                : 'border-[var(--space-border-default)] bg-white hover:bg-[var(--space-surface-card-hover)]'
            )}
          >
            <input
              type="radio"
              name={q.id}
              checked={value === option.value}
              onChange={() => setAnswer(q.id, option.value)}
              className="mt-1"
            />
            <span className={cn('text-sm leading-relaxed', typography.color.primary)}>{option.label}</span>
          </label>
        ))}
        {selectedOption?.hasFreeText && (
          <textarea
            value={(answers[otherKey] as string) || ''}
            onChange={(e) => setAnswer(otherKey, e.target.value)}
            placeholder="Tell us more…"
            rows={3}
            className={cn(tw.input.base, tw.input.default, 'rounded-xl resize-y')}
          />
        )}
      </div>
    );
  };

  const renderEmailOptIn = (q: SurveyQuestion) => {
    const value = answers[q.id] as string | undefined;
    const emailKey = getEmailKey(q.id);

    return (
      <div className="space-y-3">
        {q.options?.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex items-center gap-3 p-4 rounded-2xl border cursor-pointer min-h-[52px]',
              value === option.value
                ? 'border-[var(--space-border-strong)] bg-[var(--space-surface-muted)]'
                : 'border-[var(--space-border-default)] bg-white'
            )}
          >
            <input
              type="radio"
              name={q.id}
              checked={value === option.value}
              onChange={() => setAnswer(q.id, option.value)}
            />
            <span className={cn('text-sm', typography.color.primary)}>{option.label}</span>
          </label>
        ))}
        {value === 'yes' && (
          <input
            type="email"
            value={(answers[emailKey] as string) || ''}
            onChange={(e) => setAnswer(emailKey, e.target.value)}
            placeholder="your.email@university.ac.uk"
            className={cn(tw.input.base, tw.input.default, 'rounded-xl')}
            autoComplete="email"
          />
        )}
      </div>
    );
  };

  const renderQuestionBody = (q: SurveyQuestion) => {
    switch (q.type) {
      case 'scale':
        return renderScale(q);
      case 'multiselect':
        return renderMulti(q);
      case 'single':
        return renderSingle(q);
      case 'email_opt_in':
        return renderEmailOptIn(q);
      case 'text':
        return (
          <textarea
            value={(answers[q.id] as string) || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            placeholder={q.placeholder || 'Your answer…'}
            rows={4}
            className={cn(tw.input.base, tw.input.default, 'rounded-xl resize-y min-h-[120px]')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-full w-full flex flex-col bg-[var(--space-surface-page)]">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="h-1.5 rounded-full bg-[var(--space-surface-muted)] overflow-hidden max-w-lg mx-auto">
          <div
            className={cn('h-full rounded-full transition-all duration-300', accent === 'highlight' ? 'bg-[var(--space-brand-highlight)]' : 'bg-[var(--space-brand-primary)]')}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-lg mx-auto">
          {phase === 'intro' && (
            <div className="space-y-6 text-center py-8">
              <h1 className={cn('text-2xl sm:text-3xl font-bold leading-tight', typography.color.brand)}>{config.title}</h1>
              <p className={cn('text-base leading-relaxed', typography.color.secondary)}>{config.intro}</p>
              <button type="button" onClick={startSurvey} className={cn('w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-semibold min-h-[48px]', accentButton)}>
                Start survey
              </button>
            </div>
          )}

          {phase === 'transition' && (
            <div className="space-y-6 py-4">
              <p className={cn('text-base leading-relaxed', typography.color.primary)}>{config.transitionCopy}</p>
              <div className="rounded-2xl border border-[var(--space-border-default)] bg-white p-5 shadow-sm">
                <p className={cn('text-sm leading-relaxed', typography.color.secondary)}>{config.productDescription}</p>
              </div>
              <button type="button" onClick={continueToPart2} className={cn('w-full py-3.5 rounded-full text-sm font-semibold min-h-[48px]', accentButton)}>
                Continue
              </button>
            </div>
          )}

          {phase === 'questions' && question && (
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs text-[var(--space-text-muted)]">
                <span>Part {currentPart}</span>
                <span>
                  Question {question.number} of {config.questions.length}
                </span>
              </div>
              <h2 className={cn('text-lg sm:text-xl font-semibold leading-snug', typography.color.primary)}>{question.label}</h2>
              {question.required === false ? (
                <p className={cn('text-xs', typography.color.tertiary)}>Optional</p>
              ) : null}
              {renderQuestionBody(question)}
              {error && <p className={cn('text-sm', typography.color.danger)}>{error}</p>}
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center py-12 space-y-4">
              <CheckCircle2 className={cn('w-14 h-14 mx-auto', accent === 'highlight' ? 'text-[var(--space-brand-highlight)]' : 'text-[var(--space-brand-primary)]')} />
              <h2 className={cn('text-xl font-bold', typography.color.brand)}>Thank you!</h2>
              <p className={cn('text-sm leading-relaxed', typography.color.secondary)}>
                Your responses have been recorded. We really appreciate you taking the time.
              </p>
            </div>
          )}
        </div>
      </div>

      {phase === 'questions' && (
        <div className="flex-shrink-0 border-t border-[var(--space-border-default)] bg-white px-4 py-3 safe-bottom">
          <div className="max-w-lg mx-auto flex gap-2">
            <button
              type="button"
              onClick={goBack}
              className={cn('px-4 py-3 rounded-full text-sm font-medium min-h-[48px] flex items-center gap-1.5', tw.button.secondary)}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={submitting || (question && question.required !== false && !isReview && !isAnswered(question, answers))}
              className={cn('flex-1 py-3 rounded-full text-sm font-semibold min-h-[48px] flex items-center justify-center gap-1.5', accentButton, (submitting || (question && question.required !== false && !isReview && !isAnswered(question, answers))) && tw.button.disabled)}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : currentPart === 2 && stepIndex === part2.length - 1 ? (
                'Submit'
              ) : (
                <>
                  Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

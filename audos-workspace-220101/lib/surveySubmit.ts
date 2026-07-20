import type { AnswerValue, SurveyConfig } from './surveyDefinitions';

export type SurveyAnswers = Record<string, unknown>;

/** Converts ResearchSurveyForm answer shapes into the flat format used for storage. */
export function normalizeSurveyAnswers(
  config: SurveyConfig,
  answers: Record<string, AnswerValue>
): SurveyAnswers {
  const normalized: SurveyAnswers = {};

  for (const question of config.questions) {
    const value = answers[question.id];
    if (value === undefined || value === null) continue;

    if (question.type === 'multiselect' && typeof value === 'object' && 'selected' in value) {
      normalized[question.id] = value.selected;
      if (value.otherText?.trim()) {
        normalized[`${question.id}__other`] = value.otherText.trim();
      }
    } else if (question.type === 'single' && typeof value === 'object' && 'value' in value) {
      normalized[question.id] = value.value;
      if (value.otherText?.trim()) {
        normalized[`${question.id}__other`] = value.otherText.trim();
      }
    } else if (question.type === 'email_opt_in' && typeof value === 'object' && 'choice' in value) {
      normalized[question.id] = value.choice;
      if (value.email?.trim()) {
        normalized[`${question.id}__email`] = value.email.trim();
      }
    } else {
      normalized[question.id] = value;
    }
  }

  return normalized;
}

export interface SurveyResponseRow {
  id: number;
  survey_type: string;
  responses_json: string;
  contact_email?: string | null;
  source?: string | null;
  created_at?: string;
}

const WORKSPACE_ID = 'workspace-220101';

export function formatAnswersForStorage(config: SurveyConfig, answers: SurveyAnswers) {
  const formatted: Record<string, unknown> = {};

  for (const question of config.questions) {
    const raw = answers[question.id];
    const otherKey = `${question.id}__other`;
    const emailKey = `${question.id}__email`;

    const storageKey = `Q${question.number}. ${question.label}`;

    if (question.type === 'multiselect') {
      const selected = Array.isArray(raw) ? raw : [];
      const labels = selected.map((value) => {
        const option = question.options?.find((o) => o.value === value);
        if (value === 'other') {
          const otherText = answers[otherKey];
          return otherText ? `Other: ${otherText}` : 'Other';
        }
        return option?.label || value;
      });
      formatted[storageKey] = labels;
    } else if (question.type === 'single') {
      const option = question.options?.find((o) => o.value === raw);
      let label = option?.label || raw;
      if (option?.hasFreeText && answers[otherKey]) {
        label = `${label}: ${answers[otherKey]}`;
      }
      formatted[storageKey] = label;
    } else if (question.type === 'email_opt_in') {
      const option = question.options?.find((o) => o.value === raw);
      formatted[storageKey] = option?.label || raw;
      if (raw === 'yes' && answers[emailKey]) {
        formatted[`${storageKey} (email)`] = answers[emailKey];
      }
    } else if (question.type === 'scale') {
      formatted[storageKey] = raw;
    } else {
      formatted[storageKey] = raw;
    }
  }

  return formatted;
}

export function extractContactEmail(config: SurveyConfig, answers: SurveyAnswers): string | null {
  const emailQuestion = config.questions.find((q) => q.type === 'email_opt_in');
  if (!emailQuestion) return null;
  if (answers[emailQuestion.id] !== 'yes') return null;
  const email = answers[`${emailQuestion.id}__email`];
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

async function submitViaHook(
  surveyType: 'student' | 'university',
  formatted: Record<string, unknown>,
  contactEmail: string | null,
  source: 'app' | 'permalink'
) {
  const response = await fetch(`/api/workspaces/${WORKSPACE_ID}/hooks/submit-survey-response/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ surveyType, responses: formatted, contactEmail, source }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to submit survey');
  }
}

export async function submitSurveyResponse(
  surveyType: 'student' | 'university',
  config: SurveyConfig,
  answers: SurveyAnswers,
  source: 'app' | 'permalink' = 'app'
) {
  const formatted = formatAnswersForStorage(config, answers);
  const contactEmail = extractContactEmail(config, answers);
  const payload = {
    survey_type: surveyType,
    responses_json: JSON.stringify(formatted),
    contact_email: contactEmail,
    source,
  };

  if (source === 'permalink') {
    await submitViaHook(surveyType, formatted, contactEmail, source);
    return;
  }

  const db = (window as any).__workspaceDb;
  if (db?.from) {
    try {
      await db.from('survey_responses').insert(payload);
      return;
    } catch {
      // Anonymous public survey visitors may lack write access — fall back to hook.
    }
  }

  await submitViaHook(surveyType, formatted, contactEmail, source);
}

export const SURVEY_HOOK_CODE = `const { surveyType, responses, contactEmail, source } = request.body;

if (!surveyType || !responses) {
  respond(400, { error: 'surveyType and responses are required' });
} else {
  await db.insert('survey_responses', {
    survey_type: surveyType,
    responses_json: JSON.stringify(responses),
    contact_email: contactEmail || null,
    source: source || 'permalink',
  });
  respond(200, { success: true });
}`;

export const PERMALINK_SLUGS = {
  student: 'student-research-survey',
  university: 'university-recruitment-survey',
} as const;

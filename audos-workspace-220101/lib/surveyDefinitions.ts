/**
 * Research survey question definitions for Scout & Alma.
 * Part 1 questions are pure experience discovery — no product mention.
 */

export type QuestionType = 'multiselect' | 'scale' | 'text' | 'single' | 'email_opt_in';

export type AnswerValue =
  | string
  | number
  | string[]
  | { selected: string[]; otherText?: string }
  | { value: string; otherText?: string }
  | { choice: string; email?: string };

export interface SurveyOption {
  value: string;
  label: string;
  hasFreeText?: boolean;
}

export interface SurveyQuestion {
  id: string;
  part: 1 | 2;
  number: number;
  label: string;
  type: QuestionType;
  required?: boolean;
  options?: SurveyOption[];
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  placeholder?: string;
}

export interface SurveyConfig {
  id: 'student' | 'university';
  title: string;
  intro: string;
  transitionCopy: string;
  productDescription: string;
  questions: SurveyQuestion[];
}

export const STUDENT_SURVEY: SurveyConfig = {
  id: 'student',
  title: 'Your university search experience',
  intro:
    'We are learning how students actually find and choose universities — not what a form would ask, but what felt real to you. Takes about 3–4 minutes, and there are no right answers.',
  transitionCopy:
    'That gives us a clear picture of your experience. Next, we would like to show you something we are building and hear your honest reaction.',
  productDescription:
    'Scout is an AI advisor for students. It reads your LinkedIn profile or CV, then has a conversation with you about your goals, budget, location, lifestyle, and must-haves. It builds a personalised shortlist of universities with clear explanations of why each one fits — and you can keep coming back to refine it.',
  questions: [
    {
      id: 'q1_research_channels',
      part: 1,
      number: 1,
      label: 'How did you research universities when you were deciding where to apply?',
      type: 'multiselect',
      required: true,
      options: [
        { value: 'google', label: 'Google searches' },
        { value: 'websites', label: 'University websites' },
        { value: 'rankings', label: 'Rankings sites' },
        { value: 'friends_family', label: 'Talking to friends or family' },
        { value: 'fairs', label: 'University fairs' },
        { value: 'social_media', label: 'Social media' },
        { value: 'advisor', label: 'School/college advisor' },
        { value: 'other', label: 'Other', hasFreeText: true },
      ],
    },
    {
      id: 'q2_stress_level',
      part: 1,
      number: 2,
      label: 'How stressful did you find the university research process?',
      type: 'scale',
      required: true,
      scaleMinLabel: 'Not stressful at all',
      scaleMaxLabel: 'Extremely stressful',
    },
    {
      id: 'q3_hardest_part',
      part: 1,
      number: 3,
      label: 'What was the hardest part of finding the right university for you?',
      type: 'text',
      required: true,
      placeholder: 'What made it hardest — too many options, unclear fit, missing information…',
    },
    {
      id: 'q4_discovery_coverage',
      part: 1,
      number: 4,
      label:
        'Did you feel like you discovered all the universities you should have considered — or do you think there were good options you never came across?',
      type: 'single',
      required: true,
      options: [
        { value: 'found_everything', label: 'I found everything I needed' },
        { value: 'probably_missed', label: 'I probably missed some good options' },
        {
          value: 'definitely_missed',
          label: 'I definitely missed options that would have suited me better',
        },
      ],
    },
    {
      id: 'q5_research_duration',
      part: 1,
      number: 5,
      label: 'How long did the research process take you from start to having a final shortlist?',
      type: 'single',
      required: true,
      options: [
        { value: 'under_week', label: 'Less than a week' },
        { value: '1_4_weeks', label: '1–4 weeks' },
        { value: '1_3_months', label: '1–3 months' },
        { value: 'over_3_months', label: 'More than 3 months' },
      ],
    },
    {
      id: 'q6_one_change',
      part: 1,
      number: 6,
      label: 'If you could change one thing about how university discovery works, what would it be?',
      type: 'text',
      required: true,
      placeholder: 'One change that would have made the biggest difference…',
    },
    {
      id: 'q7_usefulness',
      part: 2,
      number: 7,
      label: 'How useful would Scout have been when you were researching universities?',
      type: 'scale',
      required: true,
      scaleMinLabel: 'Not useful at all',
      scaleMaxLabel: 'Extremely useful',
    },
    {
      id: 'q8_most_valuable',
      part: 2,
      number: 8,
      label: 'What part of Scout sounds most valuable to you?',
      type: 'multiselect',
      required: true,
      options: [
        { value: 'shortlist', label: 'The personalised shortlist' },
        { value: 'conversation', label: 'The AI conversation instead of filling out forms' },
        { value: 'explanations', label: 'Explanations of why each university fits' },
        { value: 'refine', label: 'Being able to come back and refine my list' },
        { value: 'compare', label: 'Comparing universities side by side' },
        { value: 'other', label: 'Other', hasFreeText: true },
      ],
    },
    {
      id: 'q9_trust',
      part: 2,
      number: 9,
      label: 'What would make you trust or distrust the shortlist it produces?',
      type: 'text',
      required: true,
      placeholder: 'What would make you trust the shortlist — or walk away?',
    },
    {
      id: 'q10_recommend',
      part: 2,
      number: 10,
      label: 'Would you recommend something like this to a friend currently choosing universities?',
      type: 'single',
      required: true,
      options: [
        { value: 'definitely_yes', label: 'Definitely yes' },
        { value: 'probably_yes', label: 'Probably yes' },
        { value: 'not_sure', label: 'Not sure' },
        { value: 'probably_not', label: 'Probably not' },
        { value: 'definitely_not', label: 'Definitely not' },
      ],
    },
    {
      id: 'q11_other_thoughts',
      part: 2,
      number: 11,
      label: 'Any other thoughts?',
      type: 'text',
      required: false,
      placeholder: 'Anything else on your mind — optional',
    },
  ],
};

export const UNIVERSITY_SURVEY: SurveyConfig = {
  id: 'university',
  title: 'Your student recruitment challenges',
  intro:
    'We are learning how universities actually attract and recruit students — what works, what does not, and where the gaps are. Takes about 3–4 minutes.',
  transitionCopy:
    'That helps us understand your world. Next, we would like to show you something we are building and hear your honest reaction.',
  productDescription:
    'Alma is a recruitment platform for universities. It surfaces students who are actively comparing options right now — with academic goals, budget, preferred locations, program interests, and must-haves, plus a fit score for your specific programs. Your team can browse matched profiles, run targeted outreach, and track engagement.',
  questions: [
    {
      id: 'q1_recruitment_channels',
      part: 1,
      number: 1,
      label: 'What channels does your university currently use to recruit prospective students?',
      type: 'multiselect',
      required: true,
      options: [
        { value: 'fairs', label: 'University fairs' },
        { value: 'paid_ads', label: 'Paid digital ads' },
        { value: 'social_media', label: 'Social media' },
        { value: 'agents', label: 'Agent networks' },
        { value: 'direct_outreach', label: 'Direct outreach' },
        { value: 'word_of_mouth', label: 'Word of mouth' },
        { value: 'rankings', label: 'Rankings and league tables' },
        { value: 'other', label: 'Other', hasFreeText: true },
      ],
    },
    {
      id: 'q2_enquiry_quality',
      part: 1,
      number: 2,
      label: 'How would you rate the quality of student enquiries you currently receive?',
      type: 'scale',
      required: true,
      scaleMinLabel: 'Very low quality / poorly matched',
      scaleMaxLabel: 'Very high quality / well matched',
    },
    {
      id: 'q3_biggest_challenge',
      part: 1,
      number: 3,
      label: 'What is the biggest challenge in your student recruitment process right now?',
      type: 'text',
      required: true,
      placeholder: 'The challenge that keeps your team up at night…',
    },
    {
      id: 'q4_reach_at_decision',
      part: 1,
      number: 4,
      label:
        'When students are actively comparing universities and deciding where to apply — how well can you reach them at that moment?',
      type: 'scale',
      required: true,
      scaleMinLabel: 'We have no way to reach them at that moment',
      scaleMaxLabel: 'We reach them very effectively at that moment',
    },
    {
      id: 'q5_recruitment_spend',
      part: 1,
      number: 5,
      label: 'Roughly how much does your university/department spend on student recruitment per academic year?',
      type: 'single',
      required: true,
      options: [
        { value: 'under_10k', label: 'Under £10k' },
        { value: '10k_50k', label: '£10k–£50k' },
        { value: '50k_100k', label: '£50k–£100k' },
        { value: '100k_250k', label: '£100k–£250k' },
        { value: 'over_250k', label: 'Over £250k' },
        { value: 'prefer_not_say', label: 'Prefer not to say' },
      ],
    },
    {
      id: 'q6_one_thing',
      part: 1,
      number: 6,
      label: 'If you could have one thing that would make recruitment more effective for your university, what would it be?',
      type: 'text',
      required: true,
      placeholder: 'What would help most?',
    },
    {
      id: 'q7_value',
      part: 2,
      number: 7,
      label: 'How valuable would Alma be for your recruitment team?',
      type: 'scale',
      required: true,
      scaleMinLabel: 'Not valuable',
      scaleMaxLabel: 'Extremely valuable',
    },
    {
      id: 'q8_trust_profiles',
      part: 2,
      number: 8,
      label: 'What would you need to see before trusting student profiles from a platform like this?',
      type: 'text',
      required: true,
      placeholder: 'Evidence, verification, data handling — what would you need to see?',
    },
    {
      id: 'q9_useful_features',
      part: 2,
      number: 9,
      label: 'What features of Alma sound most useful to your team?',
      type: 'multiselect',
      required: true,
      options: [
        { value: 'matched_profiles', label: 'Matched student profiles with fit scores' },
        { value: 'targeted_outreach', label: 'Ability to run targeted outreach' },
        { value: 'active_deciding', label: 'Seeing students who are actively deciding right now' },
        { value: 'program_filtering', label: 'Program-level filtering' },
        { value: 'engagement_tracking', label: 'Engagement tracking' },
        { value: 'other', label: 'Other', hasFreeText: true },
      ],
    },
    {
      id: 'q10_price_range',
      part: 2,
      number: 10,
      label: 'What price range would be reasonable for departmental access (one department/program) per year?',
      type: 'single',
      required: true,
      options: [
        { value: 'under_500', label: 'Under £500' },
        { value: '500_1500', label: '£500–£1,500' },
        { value: '1500_3000', label: '£1,500–£3,000' },
        { value: '3000_5000', label: '£3,000–£5,000' },
        { value: 'over_5000', label: 'Over £5,000' },
        { value: 'depends', label: 'It depends — tell us more', hasFreeText: true },
      ],
    },
    {
      id: 'q11_adoption_blockers',
      part: 2,
      number: 11,
      label: 'What would stop your university from adopting a platform like this?',
      type: 'text',
      required: true,
      placeholder: 'Budget, procurement, data concerns — what would block adoption?',
    },
    {
      id: 'q12_stay_informed',
      part: 2,
      number: 12,
      label: 'Would you like to be kept informed as this develops?',
      type: 'email_opt_in',
      required: true,
      options: [
        { value: 'yes', label: 'Yes — add me to the list' },
        { value: 'no', label: 'No thanks' },
      ],
    },
  ],
};

export const SURVEY_LABELS: Record<string, string> = {
  student: 'Student Survey — University Search',
  university: 'University Survey — Student Recruitment',
};

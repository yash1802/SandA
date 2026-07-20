import ResearchSurveyForm from '../../components/ResearchSurveyForm';
import { UNIVERSITY_SURVEY } from '../../lib/surveyDefinitions';

export default function UniversitySurveyApp() {
  return <ResearchSurveyForm config={UNIVERSITY_SURVEY} accent="highlight" />;
}

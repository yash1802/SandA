import ResearchSurveyForm from '../../components/ResearchSurveyForm';
import { STUDENT_SURVEY } from '../../lib/surveyDefinitions';

export default function StudentSurveyApp() {
  return <ResearchSurveyForm config={STUDENT_SURVEY} accent="primary" />;
}

import {
  AssessmentType as AssessmentTypeSchema,
  QuestionType as QuestionTypeSchema,
  type AssessmentType,
  type QuestionType,
} from '@tk/contracts';
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { AppShell } from './components/layout/app-shell';
import { Button } from './components/ui/button';
import { EmptyState, ErrorState } from './components/ui/primitives';
import { LoginPage } from './features/auth/login-page';
import { ForgotPasswordPage, SetPasswordPage } from './features/auth/password-pages';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { reportError } from './lib/monitoring';

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or was moved."
      action={
        <Button asChild variant="secondary">
          <Link to="/">Go to dashboard</Link>
        </Button>
      }
    />
  );
}

function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return <ErrorState error={error} onRetry={reset} />;
}

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (s: Record<string, unknown>): { next?: string; reset?: boolean } => ({
    next: typeof s['next'] === 'string' ? s['next'] : undefined,
    reset: s['reset'] === true || s['reset'] === 'true' ? true : undefined,
  }),
  component: LoginPage,
});

const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-password',
  validateSearch: (s: Record<string, unknown>): { email?: string; sent?: boolean } => ({
    email: typeof s['email'] === 'string' ? s['email'] : undefined,
    sent: s['sent'] === true || s['sent'] === 'true' ? true : undefined,
  }),
  component: SetPasswordPage,
});

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell });

const routes = [
  createRoute({ getParentRoute: () => appRoute, path: '/', component: DashboardPage }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/students',
    component: lazyRouteComponent(() => import('./features/students/students-pages'), 'StudentsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/students/$studentId',
    component: lazyRouteComponent(() => import('./features/students/students-pages'), 'StudentDetailPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/staff',
    component: lazyRouteComponent(() => import('./features/access/staff-page'), 'StaffPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/roles',
    component: lazyRouteComponent(() => import('./features/access/roles-pages'), 'RolesPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/roles/new',
    component: lazyRouteComponent(() => import('./features/access/roles-pages'), 'RoleEditorPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/roles/$roleId',
    component: lazyRouteComponent(() => import('./features/access/roles-pages'), 'RoleEditorPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/subjects',
    component: lazyRouteComponent(() => import('./features/content/subjects-page'), 'SubjectsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/subjects/$subjectId',
    component: lazyRouteComponent(() => import('./features/content/subject-page'), 'SubjectPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/topics/$topicId/new',
    validateSearch: (s: Record<string, unknown>): { type: 'note' | 'pdf' | 'video'; subjectId?: string } => ({
      type: s['type'] === 'pdf' || s['type'] === 'video' ? s['type'] : 'note',
      subjectId: typeof s['subjectId'] === 'string' ? s['subjectId'] : undefined,
    }),
    component: lazyRouteComponent(() => import('./features/content/item-editor-page'), 'NewItemPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/learning-items/$itemId',
    validateSearch: (s: Record<string, unknown>): { subjectId?: string } => ({
      subjectId: typeof s['subjectId'] === 'string' ? s['subjectId'] : undefined,
    }),
    component: lazyRouteComponent(() => import('./features/content/item-editor-page'), 'ItemPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/courses',
    component: lazyRouteComponent(() => import('./features/courses/courses-page'), 'CoursesPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/courses/$courseId',
    validateSearch: (
      s: Record<string, unknown>,
    ): { tab?: 'details' | 'pricing' | 'subjects' | 'links' | 'certificate' } => ({
      tab:
        s['tab'] === 'pricing' ||
        s['tab'] === 'subjects' ||
        s['tab'] === 'links' ||
        s['tab'] === 'details' ||
        s['tab'] === 'certificate'
          ? s['tab']
          : undefined,
    }),
    component: lazyRouteComponent(() => import('./features/courses/course-page'), 'CoursePage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/instructors',
    component: lazyRouteComponent(() => import('./features/courses/instructors-page'), 'InstructorsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/assessments',
    component: lazyRouteComponent(() => import('./features/assessments/assessments-page'), 'AssessmentsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/assessments/new',
    validateSearch: (s: Record<string, unknown>): { type: AssessmentType } => ({
      type: AssessmentTypeSchema.safeParse(s['type']).data ?? 'quiz',
    }),
    component: lazyRouteComponent(
      () => import('./features/assessments/assessment-editor-page'),
      'NewAssessmentPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/assessments/$assessmentId',
    component: lazyRouteComponent(
      () => import('./features/assessments/assessment-editor-page'),
      'AssessmentPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/assessments/$assessmentId/results',
    component: lazyRouteComponent(() => import('./features/grading/results-page'), 'ResultsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/attempts/$attemptId',
    component: lazyRouteComponent(() => import('./features/grading/attempt-page'), 'AttemptPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/certificates',
    component: lazyRouteComponent(
      () => import('./features/certificates/certificates-page'),
      'CertificatesPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/certificates/templates/new',
    component: lazyRouteComponent(
      () => import('./features/certificates/template-page'),
      'NewCertificateTemplatePage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/certificates/templates/$templateId',
    component: lazyRouteComponent(
      () => import('./features/certificates/template-page'),
      'CertificateTemplatePage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/grading',
    component: lazyRouteComponent(() => import('./features/grading/grading-page'), 'GradingPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/questions',
    component: lazyRouteComponent(() => import('./features/questions/questions-page'), 'QuestionsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/questions/import',
    component: lazyRouteComponent(() => import('./features/questions/import-page'), 'QuestionImportPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/questions/new',
    validateSearch: (s: Record<string, unknown>): { type: QuestionType } => ({
      type: QuestionTypeSchema.safeParse(s['type']).data ?? 'single_choice',
    }),
    component: lazyRouteComponent(
      () => import('./features/questions/question-editor-page'),
      'NewQuestionPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/questions/$questionId',
    component: lazyRouteComponent(() => import('./features/questions/question-editor-page'), 'QuestionPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/question-reports',
    component: lazyRouteComponent(() => import('./features/questions/reports-page'), 'QuestionReportsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/media',
    component: lazyRouteComponent(() => import('./features/media/media-page'), 'MediaPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/categories',
    component: lazyRouteComponent(() => import('./features/taxonomy/categories-page'), 'CategoriesPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/category-types',
    component: lazyRouteComponent(
      () => import('./features/taxonomy/category-types-page'),
      'CategoryTypesPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/papers',
    component: lazyRouteComponent(() => import('./features/taxonomy/papers-page'), 'PapersPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/education-levels',
    component: lazyRouteComponent(
      () => import('./features/config/education-levels-page'),
      'EducationLevelsPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/settings',
    component: lazyRouteComponent(() => import('./features/config/settings-page'), 'SettingsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/audit-log',
    component: lazyRouteComponent(() => import('./features/audit/audit-log-page'), 'AuditLogPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/account',
    component: lazyRouteComponent(() => import('./features/account/account-page'), 'AccountPage'),
  }),
];

const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotRoute,
  setPasswordRoute,
  appRoute.addChildren(routes),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: RouteError,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

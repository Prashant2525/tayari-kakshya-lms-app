/**
 * Permission catalog (D-036). Permissions are defined in code; roles that bundle them are data created by the
 * Super Admin. Each module appends its permissions here when it is implemented.
 */
export const PERMISSIONS = {
  'users:read': 'View students and their account details',
  'users:update': 'Edit student accounts',
  'users:suspend': 'Suspend or reactivate accounts and revoke sessions',
  'staff:read': 'View staff accounts',
  'staff:manage': 'Create staff accounts and assign roles',
  'roles:manage': 'Create, edit and delete roles and their permissions',
  'settings:read': 'View system settings',
  'settings:update': 'Change system settings',
  'audit:read': 'View the audit log',
  'education_levels:manage': 'Manage the education level options shown on student profiles',
  'media:manage': 'Upload, edit and remove files in the media library',
  'taxonomy:manage': 'Manage exam categories, posts and papers',
  'content:edit': 'Create and edit subjects, chapters, topics, notes, PDFs and videos (drafts)',
  'content:publish': 'Publish, schedule, archive and delete learning content',
  'courses:edit': 'Create and edit courses (drafts)',
  'courses:publish': 'Publish, schedule, archive and delete courses',
  'courses:pricing': 'Change course prices, sales and validity',
  'courses:notify': "Send course updates to the course's students (in-app, push and email)",
  'interests:manage':
    'See students on Apple devices who opened courses they cannot buy in the app, and email them',
  'instructors:manage': 'Manage public instructor profiles',
  'entitlements:grant': "Grant or revoke a student's access to courses",
  'questions:edit': 'Create and edit questions in the question bank (drafts), import questions',
  'questions:publish': 'Publish, archive and delete questions',
  'question_reports:manage': 'Review and resolve question reports from students',
  'assessments:edit': 'Create and edit quizzes, tests and mock exams (drafts)',
  'assessments:publish': 'Publish, schedule, archive and delete assessments; release results',
  'grading:manage': 'Grade subjective answers',
  'certificates:manage': 'Manage certificate templates; revoke and reinstate issued certificates',
  'plans:manage': 'Create, price and publish subscription plans and choose their courses',
  'coupons:manage': 'Create, change and switch off coupon codes',
  'refunds:request': 'Ask for a refund on a paid order, with the reason',
  'refunds:approve': 'Approve or reject refund requests and record refunds as sent',
  'notices:edit': 'Write and change notices (drafts)',
  'notices:publish': 'Publish, schedule and archive notices (sends them to students)',
  'articles:edit': 'Write and change articles — current affairs, Gorkhapatra, news, blog (drafts)',
  'articles:publish': 'Publish, schedule and archive articles (they go to the app and the website)',
  'pages:manage': 'Edit and publish the About, Terms, Privacy and Refund pages',
  'support:manage': 'Edit the FAQs and the contact options in Help & support',
  'banners:manage': 'Add, schedule and remove the promotional banners in the app and on the website',
  'discussions:moderate':
    'Answer doubts as a teacher, mark best answers, hide reported posts and stop a student posting',
  'reviews:moderate': 'Approve or reject course reviews before students and website visitors see them',
  'live:manage': 'Schedule live classes, start and end them, add recordings and see attendance',
  'orders:read': 'View orders, payments and what the payment gateways reported',
  'orders:manage': 'Check a payment again with its gateway',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

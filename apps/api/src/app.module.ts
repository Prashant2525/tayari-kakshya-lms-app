import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard, MaintenanceGuard, PermissionsGuard } from './common/auth/guards.js';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { FieldEncryption } from './common/security/field-encryption.js';
import { RateLimitGuard } from './common/security/rate-limit.js';
import { ENV, loadEnv, type Env } from './config/env.js';
import { MailService } from './infra/messaging/mail.service.js';
import { SmsService } from './infra/messaging/sms.service.js';
import { PrismaService } from './infra/prisma/prisma.service.js';
import { RedisService } from './infra/redis/redis.provider.js';
import { StorageService } from './infra/storage/storage.service.js';
import { AdminMediaController, PublicMediaController } from './modules/media/media.controller.js';
import { MediaService } from './modules/media/media.service.js';
import { AuditService } from './modules/audit/audit.service.js';
import { AccountDeletionService } from './modules/auth/account-deletion.service.js';
import { AdminAuthController } from './modules/auth/admin-auth.controller.js';
import { AuthCleanupService } from './modules/auth/auth-cleanup.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { GoogleAuthLibraryVerifier, GoogleVerifier } from './modules/auth/google-verifier.js';
import { MeController } from './modules/auth/me.controller.js';
import { AdminMfaController } from './modules/auth/admin-mfa.controller.js';
import { MfaService } from './modules/auth/mfa.service.js';
import { OtpService } from './modules/auth/otp.service.js';
import { PasswordService } from './modules/auth/password.service.js';
import { SessionService } from './modules/auth/session.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { AdminContentController } from './modules/content/admin-content.controller.js';
import { AdminCoursesController } from './modules/content/admin-courses.controller.js';
import { AdminTaxonomyController } from './modules/content/admin-taxonomy.controller.js';
import { CatalogController, LearningController } from './modules/content/catalog.controller.js';
import { PdfViewerController } from './modules/content/pdf-viewer/pdf-viewer.controller.js';
import { AdminAttemptsController } from './modules/attempts/admin-attempts.controller.js';
import { AdminAttemptsService } from './modules/attempts/admin-attempts.service.js';
import { AttemptsController } from './modules/attempts/attempts.controller.js';
import { AttemptsService } from './modules/attempts/attempts.service.js';
import { PracticeController } from './modules/content/practice.controller.js';
import { PracticeService } from './modules/content/practice.service.js';
import { CatalogService } from './modules/content/catalog.service.js';
import { ContentService } from './modules/content/content.service.js';
import { CoursesService } from './modules/content/courses.service.js';
import { EntitlementsService } from './modules/content/entitlements.service.js';
import { LearningItemsService } from './modules/content/learning-items.service.js';
import { ScopeService } from './modules/content/scope.service.js';
import { TaxonomyService } from './modules/content/taxonomy.service.js';
import { VideoService } from './modules/content/video.service.js';
import { AdminAssessmentsController } from './modules/assessments/assessments.controller.js';
import { AssessmentsService } from './modules/assessments/assessments.service.js';
import { HealthController } from './modules/health/health.controller.js';
import { QuestionImportService } from './modules/questions/question-import.service.js';
import { QuestionReportsService } from './modules/questions/question-reports.service.js';
import {
  AdminQuestionsController,
  QuestionReportsController,
} from './modules/questions/questions.controller.js';
import { QuestionsService } from './modules/questions/questions.service.js';
import { AdminAccessController } from './modules/rbac/admin-access.controller.js';
import { RbacService } from './modules/rbac/rbac.service.js';
import { StaffService } from './modules/rbac/staff.service.js';
import { AppConfigController } from './modules/settings/app-config.controller.js';
import { SettingsService } from './modules/settings/settings.service.js';
import { AdminOpsController } from './modules/users/admin-ops.controller.js';
import { AdminUsersService } from './modules/users/admin-users.service.js';
import {
  AdminEducationLevelsController,
  EducationLevelsController,
} from './modules/users/education-levels.controller.js';
import { EducationLevelsService } from './modules/users/education-levels.service.js';

/** Configuration and infrastructure shared by the API, the worker and the CLI. */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    PrismaService,
    RedisService,
    MailService,
    SmsService,
    StorageService,
  ],
  exports: [ENV, PrismaService, RedisService, MailService, SmsService, StorageService],
})
export class InfraModule {}

/** Domain services (no HTTP). Imported by the API and by the worker/CLI contexts. */
@Module({
  imports: [InfraModule],
  providers: [
    AuditService,
    SettingsService,
    RbacService,
    TokenService,
    PasswordService,
    SessionService,
    OtpService,
    AuthService,
    AccountDeletionService,
    AuthCleanupService,
    StaffService,
    AdminUsersService,
    FieldEncryption,
    MfaService,
    EducationLevelsService,
    MediaService,
    TaxonomyService,
    ContentService,
    LearningItemsService,
    VideoService,
    CoursesService,
    EntitlementsService,
    CatalogService,
    PracticeService,
    AttemptsService,
    AdminAttemptsService,
    ScopeService,
    QuestionsService,
    QuestionReportsService,
    QuestionImportService,
    AssessmentsService,
    { provide: GoogleVerifier, useClass: GoogleAuthLibraryVerifier },
  ],
  exports: [
    AuditService,
    SettingsService,
    RbacService,
    TokenService,
    PasswordService,
    SessionService,
    OtpService,
    AuthService,
    AccountDeletionService,
    AuthCleanupService,
    StaffService,
    AdminUsersService,
    FieldEncryption,
    MfaService,
    EducationLevelsService,
    MediaService,
    TaxonomyService,
    ContentService,
    LearningItemsService,
    VideoService,
    CoursesService,
    EntitlementsService,
    CatalogService,
    PracticeService,
    AttemptsService,
    AdminAttemptsService,
    ScopeService,
    QuestionsService,
    QuestionReportsService,
    QuestionImportService,
    AssessmentsService,
    GoogleVerifier,
  ],
})
export class DomainModule {}

@Module({
  imports: [
    InfraModule,
    DomainModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req) => String(req.headers['x-request-id'] ?? ''),
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            remove: true,
          },
          customProps: () => ({ service: 'api' }),
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [
    HealthController,
    AppConfigController,
    AuthController,
    MeController,
    AdminAuthController,
    AdminAccessController,
    AdminOpsController,
    AdminMfaController,
    EducationLevelsController,
    AdminEducationLevelsController,
    AdminMediaController,
    PublicMediaController,
    AdminTaxonomyController,
    AdminContentController,
    AdminCoursesController,
    CatalogController,
    LearningController,
    PdfViewerController,
    PracticeController,
    AttemptsController,
    AdminAttemptsController,
    AdminQuestionsController,
    QuestionReportsController,
    AdminAssessmentsController,
  ],
  providers: [
    // Order matters: rate limit → maintenance → authentication → permissions.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

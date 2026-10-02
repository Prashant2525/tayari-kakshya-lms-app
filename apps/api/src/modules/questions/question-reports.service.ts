import { Injectable } from '@nestjs/common';
import { ErrorCode, type LocalizedText, type QuestionContent } from '@tk/contracts';
import type { z } from 'zod';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stemPreview } from './questions.service.js';
import type { QuestionReportInput, ResolveReportInput } from '@tk/contracts';

/** Students flag problems in questions; content staff resolve or reject them. */
@Injectable()
export class QuestionReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async report(questionId: string, userId: string, input: z.infer<typeof QuestionReportInput>) {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, deletedAt: null, status: 'published' },
    });
    if (!question) throw Errors.notFound('Question');
    try {
      const report = await this.prisma.questionReport.create({
        data: { questionId, userId, reason: input.reason, message: input.message ?? null },
      });
      return { id: report.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          'You already reported this question. We are looking into it.',
        );
      }
      throw err;
    }
  }

  async list(status: 'open' | 'resolved' | 'rejected', cursor: string | undefined, limit: number) {
    const rows = await this.prisma.questionReport.findMany({
      where: { status, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: {
        question: {
          select: {
            id: true,
            type: true,
            subject: { select: { name: true } },
            currentVersion: { select: { content: true } },
          },
        },
        user: { select: { fullName: true } },
        resolvedBy: { select: { fullName: true } },
      },
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map((r) => ({
        id: r.id,
        reason: r.reason,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reporter: r.user.fullName,
        question: {
          id: r.question.id,
          type: r.question.type,
          preview: stemPreview(r.question.currentVersion?.content as QuestionContent | undefined),
          subject: r.question.subject.name as LocalizedText,
        },
        resolvedBy: r.resolvedBy?.fullName ?? null,
        resolutionNote: r.resolutionNote,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async resolve(
    id: string,
    input: z.infer<typeof ResolveReportInput>,
    actorUserId: string,
    client: ClientInfo,
  ) {
    const report = await this.prisma.questionReport.findUnique({ where: { id } });
    if (!report) throw Errors.notFound('Report');
    if (report.status !== 'open')
      throw new AppError(409, ErrorCode.CONFLICT, 'This report is already closed');
    await this.prisma.$transaction(async (tx) => {
      await tx.questionReport.update({
        where: { id },
        data: {
          status: input.status,
          resolutionNote: input.note ?? null,
          resolvedById: actorUserId,
          resolvedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: `question_report.${input.status}`,
          entityType: 'question_report',
          entityId: id,
          changes: { questionId: report.questionId, note: input.note ?? null },
          client,
        },
        tx,
      );
    });
  }
}

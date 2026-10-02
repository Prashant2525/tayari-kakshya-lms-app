import { Injectable } from '@nestjs/common';
import { ErrorCode, type EducationLevelInput, type LocalizedText } from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import type { EducationLevel } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const view = (l: EducationLevel) => ({
  id: l.id,
  name: l.name as LocalizedText,
  active: l.active,
  sortOrder: l.sortOrder,
});

/** CMS-managed options for the profile's "education level" field (D-031). */
@Injectable()
export class EducationLevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listActive() {
    const rows = await this.prisma.educationLevel.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((l) => ({ id: l.id, name: l.name as LocalizedText }));
  }

  async listAll() {
    const rows = await this.prisma.educationLevel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return rows.map((l) => ({ ...view(l), userCount: l._count.users }));
  }

  async create(input: EducationLevelInput, actorUserId: string, client: ClientInfo) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.educationLevel.aggregate({ _max: { sortOrder: true } });
      const level = await tx.educationLevel.create({
        data: { name: input.name, active: input.active, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'education_level.create',
          entityType: 'education_level',
          entityId: level.id,
          changes: { after: view(level) },
          client,
        },
        tx,
      );
      return view(level);
    });
  }

  async update(id: string, input: EducationLevelInput, actorUserId: string, client: ClientInfo) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.educationLevel.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('Education level');
      const level = await tx.educationLevel.update({
        where: { id },
        data: { name: input.name, active: input.active },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'education_level.update',
          entityType: 'education_level',
          entityId: id,
          changes: { before: view(before), after: view(level) },
          client,
        },
        tx,
      );
      return view(level);
    });
  }

  /** Only unused levels can be deleted; used ones should be deactivated so student profiles stay intact. */
  async remove(id: string, actorUserId: string, client: ClientInfo) {
    await this.prisma.$transaction(async (tx) => {
      const level = await tx.educationLevel.findUnique({
        where: { id },
        include: { _count: { select: { users: true } } },
      });
      if (!level) throw Errors.notFound('Education level');
      if (level._count.users > 0) {
        throw Errors.conflict(ErrorCode.CONFLICT, 'This level is used by students; deactivate it instead', {
          userCount: level._count.users,
        });
      }
      await tx.educationLevel.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          action: 'education_level.delete',
          entityType: 'education_level',
          entityId: id,
          changes: { before: view(level) },
          client,
        },
        tx,
      );
    });
  }

  async reorder(ids: string[], actorUserId: string, client: ClientInfo) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.educationLevel.findMany({ select: { id: true } });
      const all = new Set(existing.map((l) => l.id));
      if (ids.length !== all.size || new Set(ids).size !== ids.length || !ids.every((id) => all.has(id))) {
        throw Errors.validation([{ path: 'ids', message: 'Provide every education level exactly once' }]);
      }
      for (const [index, id] of ids.entries()) {
        await tx.educationLevel.update({ where: { id }, data: { sortOrder: index } });
      }
      await this.audit.record(
        {
          actorUserId,
          action: 'education_level.reorder',
          entityType: 'education_level',
          changes: { order: ids },
          client,
        },
        tx,
      );
    });
    return this.listAll();
  }
}

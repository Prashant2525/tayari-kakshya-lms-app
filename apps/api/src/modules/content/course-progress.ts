import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { liveWhere, publishedWhere } from './publishing.js';

export interface CourseProgress {
  completed: number;
  total: number;
}

/** Finished / total live items per course (subjects are shared, so an item counts in every course it is in). */
export async function courseProgress(
  prisma: PrismaService,
  userId: string,
  courseIds: string[],
): Promise<Map<string, CourseProgress>> {
  const links = await prisma.courseSubject.findMany({
    where: { courseId: { in: courseIds }, subject: publishedWhere },
    select: { courseId: true, subjectId: true },
  });
  const items = await prisma.learningItem.findMany({
    where: {
      ...liveWhere(),
      topic: {
        ...publishedWhere,
        chapter: { ...publishedWhere, subjectId: { in: [...new Set(links.map((l) => l.subjectId))] } },
      },
    },
    select: { id: true, topic: { select: { chapter: { select: { subjectId: true } } } } },
  });
  const done = new Set(
    (
      await prisma.learningProgress.findMany({
        where: { userId, completedAt: { not: null }, learningItemId: { in: items.map((i) => i.id) } },
        select: { learningItemId: true },
      })
    ).map((r) => r.learningItemId),
  );
  const result = new Map<string, CourseProgress>();
  for (const courseId of courseIds) {
    const subjects = new Set(links.filter((l) => l.courseId === courseId).map((l) => l.subjectId));
    const inCourse = items.filter((i) => subjects.has(i.topic.chapter.subjectId));
    result.set(courseId, {
      completed: inCourse.filter((i) => done.has(i.id)).length,
      total: inCourse.length,
    });
  }
  return result;
}

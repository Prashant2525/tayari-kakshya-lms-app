import { md } from './markdown.ts';
import type { Handout } from './pdf.ts';
import type { PackChapter, PackCourse } from './types.ts';
import { biology } from './content/biology.ts';
import { deepLearning } from './content/deep-learning.ts';
import { multimedia } from './content/multimedia.ts';
import { operatingSystems } from './content/operating-systems.ts';
import { softwareEngineering } from './content/software-engineering.ts';

/** The university content pack (D-071): the courses in the order they are imported. */
export const courses: PackCourse[] = [
  operatingSystems,
  softwareEngineering,
  deepLearning,
  biology,
  multimedia,
];

/** The chapter handout: every topic's note, then the chapter's key points. */
export function handoutFor(course: PackCourse, chapter: PackChapter): Handout {
  return {
    courseTitle: course.title.en,
    chapterLabel: `Chapter ${chapter.numberLabel}`,
    chapterTitle: chapter.title.en,
    sections: [
      ...chapter.topics.map((t) => ({ title: t.title.en, doc: md(t.note) })),
      { title: 'Key points', doc: md(chapter.revision) },
    ],
  };
}

/** File name of a chapter handout (also its name in the media library). */
export const handoutFile = (course: PackCourse, chapter: PackChapter) =>
  `${course.slug}-chapter-${chapter.numberLabel}.pdf`;

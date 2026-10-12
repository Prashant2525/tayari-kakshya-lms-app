import type { Doc } from './markdown.ts';

/** A name in English and Nepali (D-008); content packs write notes in English with Nepali names (D-071). */
export interface Names {
  en: string;
  ne: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A question as the question bank stores it (`QuestionContent` in @tk/contracts), with its difficulty. */
export interface PackQuestion {
  difficulty: Difficulty;
  /** Rich-text content per the question type (built by the helpers in questions.ts). */
  content: Record<string, unknown> & { type: string };
  tags?: string[];
}

export interface PackTopic {
  key: string;
  title: Names;
  estimatedMinutes: number;
  /** The topic's study note (Markdown dialect of markdown.ts). */
  note: string;
  questions: PackQuestion[];
}

export interface PackChapter {
  key: string;
  numberLabel: string;
  title: Names;
  description: string;
  topics: PackTopic[];
  /** Key points for the chapter's revision note (Markdown). */
  revision: string;
}

export interface PackCourse {
  key: string;
  slug: string;
  title: Names;
  shortDescription: Names;
  /** Course page description (Markdown). */
  description: string;
  /** The exam category (semester) the course is linked to. */
  semester: string;
  isFeatured: boolean;
  popularityRank: number;
  subject: { key: string; name: Names; summary: Names };
  chapters: PackChapter[];
}

/** A rendered note: a topic or revision note as rich text. */
export interface RenderedNote {
  title: Names;
  doc: Doc;
}

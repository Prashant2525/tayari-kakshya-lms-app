import ExcelJS from 'exceljs';
import { QuestionContent } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import { parseQuestionRow } from './import-row.js';
import {
  BASE_LISTS,
  buildQuestionTemplate,
  COLUMNS,
  EXAMPLE_ROWS,
  TEMPLATE_VERSION,
} from './import-template.js';

async function roundTrip(lists = BASE_LISTS) {
  const wb = await buildQuestionTemplate(lists);
  const buffer = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buffer);
  return back;
}

function rowsOf(sheet: ExcelJS.Worksheet): Array<Record<string, string>> {
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const out: Array<Record<string, string>> = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const values = (row.values as unknown[]).slice(1);
    out.push(
      Object.fromEntries(
        headers.map((h, i) => [h, values[i] === undefined || values[i] === null ? '' : String(values[i])]),
      ),
    );
  });
  return out;
}

describe('question import template', () => {
  it('has the documented sheets, the exact column keys and a version marker', async () => {
    const wb = await roundTrip();
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Instructions',
      'Questions',
      'Examples',
      'Passages',
      'Lists',
    ]);
    const header = (wb.getWorksheet('Questions')!.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(COLUMNS.map((c) => c.key));
    expect(new Set(header).size).toBe(header.length);
    expect(wb.getWorksheet('Instructions')!.getCell('B2').value).toBe(TEMPLATE_VERSION);
    // Every column is documented on the Instructions sheet.
    const documented = new Set<string>();
    wb.getWorksheet('Instructions')!.eachRow((row) => documented.add(String(row.getCell(1).value)));
    for (const c of COLUMNS) expect(documented.has(c.key), c.key).toBe(true);
  });

  it('adds dropdowns for fixed lists and live LMS lists', async () => {
    const wb = await roundTrip({
      ...BASE_LISTS,
      subjects: ['General Knowledge', 'Mathematics'],
      categories: ['Lok Sewa Aayog > Administration Service > Kharidar > Preliminary'],
      papers: ['Paper I'],
    });
    const sheet = wb.getWorksheet('Questions')!;
    const typeCol = sheet.getColumn(COLUMNS.findIndex((c) => c.key === 'type') + 1).letter;
    const dv = sheet.getCell(`${typeCol}2`).dataValidation;
    expect(dv?.type).toBe('list');
    expect(String(dv?.formulae?.[0])).toMatch(/^Lists!\$[A-Z]+\$2:\$[A-Z]+\$8$/);
    const lists = rowsOf(wb.getWorksheet('Lists')!);
    expect(lists.map((r) => r['types']).filter(Boolean)).toEqual(BASE_LISTS.types);
    expect(lists[0]?.['categories']).toBe('Lok Sewa Aayog > Administration Service > Kharidar > Preliminary');
    const yearCol = sheet.getColumn(COLUMNS.findIndex((c) => c.key === 'pyq_year_bs') + 1).letter;
    expect(sheet.getCell(`${yearCol}500`).dataValidation).toMatchObject({
      type: 'whole',
      formulae: [2000, 2100],
    });
  });

  it('every example row (one per question type) parses into valid question content', async () => {
    const wb = await roundTrip();
    const rows = rowsOf(wb.getWorksheet('Examples')!);
    expect(rows).toHaveLength(EXAMPLE_ROWS.length);
    expect(new Set(rows.map((r) => r['type']))).toEqual(new Set(BASE_LISTS.types));
    for (const row of rows) {
      const { value, problems } = parseQuestionRow(row);
      expect(problems, row['ref']).toEqual([]);
      expect(QuestionContent.safeParse(value?.content).success, row['ref']).toBe(true);
    }
  });
});

describe('row parser', () => {
  const base = {
    type: 'single_choice',
    subject: 'GK',
    difficulty: 'easy',
    marks: '1',
    access: 'free',
    question_en: 'Q?',
    option_a_en: 'A',
    option_b_en: 'B',
    correct: 'b',
  };

  it('builds bilingual rich text, keeps line breaks and reads the PYQ source path', () => {
    const { value, problems } = parseQuestionRow({
      ...base,
      question_en: 'Line one\nLine two',
      question_ne: 'नेपाली प्रश्न',
      pyq_category: ' Lok Sewa Aayog >  Kharidar > Preliminary ',
      pyq_year_bs: '2080',
      tags: 'a, b ,  c  d',
    });
    expect(problems).toEqual([]);
    expect(value?.content.stem.en).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Line one' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Line two' },
          ],
        },
      ],
    });
    expect(value?.content.stem.ne).toBeDefined();
    expect(value?.source).toEqual({
      categoryPath: ['Lok Sewa Aayog', 'Kharidar', 'Preliminary'],
      paper: null,
      yearBs: 2080,
      note: null,
    });
    expect(value?.tags).toEqual(['a', 'b', 'c d']);
    expect(value).toMatchObject({ status: 'draft', language: 'both', negativeMarks: 0 });
  });

  it('points at the exact column for each problem', () => {
    const cols = (row: Record<string, string>) => parseQuestionRow(row).problems.map((p) => p.column);
    expect(cols({ ...base, type: 'essay' })).toContain('type');
    expect(cols({ ...base, subject: '' })).toContain('subject');
    expect(cols({ ...base, correct: 'e' })).toContain('correct');
    expect(cols({ ...base, marks: 'two' })).toContain('marks');
    expect(cols({ ...base, negative_marks: '5' })).toContain('negative_marks');
    expect(cols({ ...base, topic: '1.1' })).toContain('chapter');
    expect(cols({ ...base, pyq_year_bs: '1999' })).toContain('pyq_year_bs');
    expect(cols({ ...base, question_en: '' })).toContain('question_en');
    expect(cols({ ...base, type: 'fill_blank', question_en: 'No blank', blank_answers: 'b1=x' })).toContain(
      'question_en',
    );
    expect(cols({ ...base, type: 'match', match_right_en: '1) X\n2) Y', match_pairs: 'a=9' })).toContain(
      'match_pairs',
    );
    expect(cols({ ...base, type: 'numeric', correct: 'abc' })).toContain('correct');
    expect(cols({ ...base, type: 'subjective' })).toContain('model_answer_en');
  });

  it('accepts Excel booleans and Nepali true/false', () => {
    const tf = { ...base, type: 'true_false' };
    expect(parseQuestionRow({ ...tf, correct: true as unknown as string }).value?.content).toMatchObject({
      correct: true,
    });
    expect(parseQuestionRow({ ...tf, correct: 'गलत' }).value?.content).toMatchObject({ correct: false });
  });
});

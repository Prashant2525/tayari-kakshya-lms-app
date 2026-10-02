import ExcelJS from 'exceljs';

/**
 * Question import spreadsheet (owner request 2026-10-03: one universal template for every PSC service, level, group,
 * post, exam stage, paper and subject). The column list below is the contract shared by the template generator and
 * the importer: never rename a key; add new columns at the end and bump TEMPLATE_VERSION.
 */
export const TEMPLATE_VERSION = 'tk-questions-v1';

export type ColumnGroup = 'core' | 'text' | 'answer' | 'extra' | 'source';

export interface TemplateColumn {
  key: string;
  group: ColumnGroup;
  required: 'always' | 'by type' | 'optional';
  appliesTo: string;
  format: string;
  example: string;
  width: number;
  list?: keyof TemplateLists;
}

export interface TemplateLists {
  types: string[];
  difficulty: string[];
  access: string[];
  language: string[];
  status: string[];
  /** From the LMS when downloaded from the admin panel; empty in the offline template. */
  subjects: string[];
  categories: string[];
  papers: string[];
}

const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const COLUMNS: TemplateColumn[] = [
  {
    key: 'ref',
    group: 'core',
    required: 'optional',
    appliesTo: 'all',
    format: 'Your own short ID, unique in this file (letters, digits, - _).',
    example: 'GK-0001',
    width: 12,
  },
  {
    key: 'type',
    group: 'core',
    required: 'always',
    appliesTo: 'all',
    format: 'One of the list values.',
    example: 'single_choice',
    width: 16,
    list: 'types',
  },
  {
    key: 'subject',
    group: 'core',
    required: 'always',
    appliesTo: 'all',
    format: 'Subject name exactly as in the LMS (English or Nepali).',
    example: 'General Knowledge',
    width: 24,
    list: 'subjects',
  },
  {
    key: 'chapter',
    group: 'core',
    required: 'optional',
    appliesTo: 'all',
    format: 'Chapter number or title inside the subject.',
    example: '1',
    width: 14,
  },
  {
    key: 'topic',
    group: 'core',
    required: 'optional',
    appliesTo: 'all',
    format: 'Topic number or title inside the chapter. Needs a chapter.',
    example: '1.1',
    width: 14,
  },
  {
    key: 'difficulty',
    group: 'core',
    required: 'always',
    appliesTo: 'all',
    format: 'easy, medium or hard.',
    example: 'medium',
    width: 11,
    list: 'difficulty',
  },
  {
    key: 'marks',
    group: 'core',
    required: 'always',
    appliesTo: 'all',
    format: 'Number, up to 2 decimals.',
    example: '1',
    width: 8,
  },
  {
    key: 'negative_marks',
    group: 'core',
    required: 'optional',
    appliesTo: 'all',
    format: 'Deducted when wrong. Blank = 0. Cannot exceed marks.',
    example: '0.2',
    width: 10,
  },
  {
    key: 'access',
    group: 'core',
    required: 'always',
    appliesTo: 'all',
    format: 'free or premium.',
    example: 'premium',
    width: 10,
    list: 'access',
  },
  {
    key: 'language',
    group: 'core',
    required: 'optional',
    appliesTo: 'all',
    format: 'en, ne or both. Blank = both.',
    example: 'both',
    width: 9,
    list: 'language',
  },
  {
    key: 'question_en',
    group: 'text',
    required: 'by type',
    appliesTo: 'all',
    format: 'Question in English. Fill-in-the-blank: mark blanks as [[b1]], [[b2]].',
    example: 'Which article of the Constitution guarantees the right to equality?',
    width: 48,
  },
  {
    key: 'question_ne',
    group: 'text',
    required: 'by type',
    appliesTo: 'all',
    format: 'Question in Nepali (Unicode, not Preeti). At least one language is required.',
    example: 'समानताको हक संविधानको कुन धारामा छ?',
    width: 48,
  },
  ...OPTION_LETTERS.flatMap((l, i): TemplateColumn[] => [
    {
      key: `option_${l}_en`,
      group: 'answer',
      required: i < 2 ? 'by type' : 'optional',
      appliesTo: 'single_choice, multiple_choice, match (left column)',
      format: `Option ${l.toUpperCase()} in English.`,
      example: i === 0 ? 'Article 16' : '',
      width: 20,
    },
    {
      key: `option_${l}_ne`,
      group: 'answer',
      required: 'optional',
      appliesTo: 'single_choice, multiple_choice, match (left column)',
      format: `Option ${l.toUpperCase()} in Nepali.`,
      example: i === 0 ? 'धारा १६' : '',
      width: 20,
    },
  ]),
  {
    key: 'correct',
    group: 'answer',
    required: 'by type',
    appliesTo: 'single_choice, multiple_choice, true_false, numeric',
    format:
      'single: one letter (c). multiple: letters separated by commas (a,c). true_false: TRUE or FALSE. numeric: the number.',
    example: 'c',
    width: 10,
  },
  {
    key: 'tolerance',
    group: 'answer',
    required: 'optional',
    appliesTo: 'numeric',
    format: 'Allowed difference (±). Blank = exact.',
    example: '0.05',
    width: 10,
  },
  {
    key: 'unit_en',
    group: 'answer',
    required: 'optional',
    appliesTo: 'numeric',
    format: 'Unit shown after the answer box.',
    example: 'm/s²',
    width: 10,
  },
  {
    key: 'unit_ne',
    group: 'answer',
    required: 'optional',
    appliesTo: 'numeric',
    format: 'Unit in Nepali.',
    example: '',
    width: 10,
  },
  {
    key: 'blank_answers',
    group: 'answer',
    required: 'by type',
    appliesTo: 'fill_blank',
    format:
      'b1=answer|other accepted answer; b2=answer. Case is ignored unless listed in case_sensitive_blanks.',
    example: 'b1=Kathmandu|काठमाडौं',
    width: 30,
  },
  {
    key: 'case_sensitive_blanks',
    group: 'answer',
    required: 'optional',
    appliesTo: 'fill_blank',
    format: 'Blank ids that must match capital letters exactly, comma separated.',
    example: 'b2',
    width: 12,
  },
  {
    key: 'match_right_en',
    group: 'answer',
    required: 'by type',
    appliesTo: 'match',
    format: 'Right column items, one per line, numbered 1), 2)… Extra items act as distractors.',
    example: '1) Kathmandu\n2) Pokhara',
    width: 28,
  },
  {
    key: 'match_right_ne',
    group: 'answer',
    required: 'optional',
    appliesTo: 'match',
    format: 'Right column in Nepali, same numbering.',
    example: '',
    width: 28,
  },
  {
    key: 'match_pairs',
    group: 'answer',
    required: 'by type',
    appliesTo: 'match',
    format: 'Left letter = right number, comma separated. Every left item needs a pair.',
    example: 'a=2, b=1',
    width: 14,
  },
  {
    key: 'model_answer_en',
    group: 'answer',
    required: 'by type',
    appliesTo: 'subjective',
    format: 'Model answer in English (or Nepali below).',
    example: '',
    width: 40,
  },
  {
    key: 'model_answer_ne',
    group: 'answer',
    required: 'optional',
    appliesTo: 'subjective',
    format: 'Model answer in Nepali.',
    example: '',
    width: 40,
  },
  {
    key: 'explanation_en',
    group: 'extra',
    required: 'optional',
    appliesTo: 'all',
    format: 'Shown to students after they submit.',
    example: 'Article 18 guarantees the right to equality.',
    width: 40,
  },
  {
    key: 'explanation_ne',
    group: 'extra',
    required: 'optional',
    appliesTo: 'all',
    format: 'Explanation in Nepali.',
    example: '',
    width: 40,
  },
  {
    key: 'tags',
    group: 'extra',
    required: 'optional',
    appliesTo: 'all',
    format: 'Comma separated, up to 30.',
    example: 'constitution, rights',
    width: 20,
  },
  {
    key: 'passage_ref',
    group: 'extra',
    required: 'optional',
    appliesTo: 'all',
    format: 'Ref of a passage on the Passages sheet (comprehension questions).',
    example: '',
    width: 12,
  },
  {
    key: 'pyq_category',
    group: 'source',
    required: 'optional',
    appliesTo: 'all',
    format:
      'Previous-year question: category path from the top, separated by " > " (any depth: authority > service > group > sub-group > post > exam stage).',
    example: 'Lok Sewa Aayog > Administration Service > Kharidar > Preliminary',
    width: 44,
    list: 'categories',
  },
  {
    key: 'pyq_paper',
    group: 'source',
    required: 'optional',
    appliesTo: 'all',
    format: 'Paper name or code as in the LMS.',
    example: 'Paper I',
    width: 16,
    list: 'papers',
  },
  {
    key: 'pyq_year_bs',
    group: 'source',
    required: 'optional',
    appliesTo: 'all',
    format: 'Year in Bikram Sambat (2000–2100).',
    example: '2080',
    width: 10,
  },
  {
    key: 'pyq_note',
    group: 'source',
    required: 'optional',
    appliesTo: 'all',
    format: 'e.g. question number in the original paper.',
    example: 'Q. 14',
    width: 14,
  },
  {
    key: 'status',
    group: 'core',
    required: 'optional',
    appliesTo: 'all',
    format: 'draft or in_review (blank = draft). Publish after checking in the LMS.',
    example: 'draft',
    width: 10,
    list: 'status',
  },
];

export const PASSAGE_COLUMNS = ['passage_ref', 'title', 'passage_en', 'passage_ne'] as const;

export const BASE_LISTS: TemplateLists = {
  types: ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'match', 'numeric', 'subjective'],
  difficulty: ['easy', 'medium', 'hard'],
  access: ['free', 'premium'],
  language: ['both', 'en', 'ne'],
  status: ['draft', 'in_review'],
  subjects: [],
  categories: [],
  papers: [],
};

const GROUP_COLOUR: Record<ColumnGroup, string> = {
  core: 'FF15234D',
  text: 'FF2563D6',
  answer: 'FF0F7B5F',
  extra: 'FF6B4FBB',
  source: 'FF9A5B00',
};

/** Dummy rows that cover every type (also used as test fixtures). All content is invented. */
export const EXAMPLE_ROWS: Array<Record<string, string>> = [
  {
    ref: 'EX-001',
    type: 'single_choice',
    subject: 'General Knowledge',
    chapter: '1',
    topic: '1.1',
    difficulty: 'easy',
    marks: '1',
    negative_marks: '0.2',
    access: 'free',
    language: 'both',
    question_en: 'Which article of the Constitution of Nepal guarantees the right to equality?',
    question_ne: 'नेपालको संविधानको कुन धाराले समानताको हकको प्रत्याभूति गरेको छ?',
    option_a_en: 'Article 16',
    option_a_ne: 'धारा १६',
    option_b_en: 'Article 17',
    option_b_ne: 'धारा १७',
    option_c_en: 'Article 18',
    option_c_ne: 'धारा १८',
    option_d_en: 'Article 19',
    option_d_ne: 'धारा १९',
    correct: 'c',
    explanation_en: '[DEMO] Article 18 covers the right to equality.',
    tags: 'constitution, rights',
    pyq_category: 'Lok Sewa Aayog > Administration Service > Kharidar > Preliminary',
    pyq_paper: 'Paper I',
    pyq_year_bs: '2079',
    pyq_note: 'Q. 12',
    status: 'draft',
  },
  {
    ref: 'EX-002',
    type: 'multiple_choice',
    subject: 'General Knowledge',
    difficulty: 'medium',
    marks: '2',
    negative_marks: '0',
    access: 'premium',
    language: 'en',
    question_en: '[DEMO] Which of these are provinces of Nepal? (choose all)',
    option_a_en: 'Koshi',
    option_b_en: 'Lumbini',
    option_c_en: 'Mechi',
    option_d_en: 'Karnali',
    correct: 'a,b,d',
    tags: 'geography',
  },
  {
    ref: 'EX-003',
    type: 'true_false',
    subject: 'General Knowledge',
    difficulty: 'easy',
    marks: '1',
    access: 'free',
    language: 'both',
    question_en: '[DEMO] Nepal is a landlocked country.',
    question_ne: '[DEMO] नेपाल भूपरिवेष्टित देश हो।',
    correct: 'TRUE',
  },
  {
    ref: 'EX-004',
    type: 'fill_blank',
    subject: 'General Knowledge',
    difficulty: 'easy',
    marks: '1',
    access: 'premium',
    language: 'both',
    question_en: '[DEMO] The capital of Nepal is [[b1]].',
    question_ne: '[DEMO] नेपालको राजधानी [[b1]] हो।',
    blank_answers: 'b1=Kathmandu|काठमाडौं',
  },
  {
    ref: 'EX-005',
    type: 'match',
    subject: 'General Knowledge',
    difficulty: 'medium',
    marks: '2',
    access: 'premium',
    language: 'en',
    question_en: '[DEMO] Match the province with its capital.',
    option_a_en: 'Gandaki',
    option_b_en: 'Bagmati',
    option_c_en: 'Karnali',
    match_right_en: '1) Hetauda\n2) Pokhara\n3) Birendranagar\n4) Dhangadhi',
    match_pairs: 'a=2, b=1, c=3',
  },
  {
    ref: 'EX-006',
    type: 'numeric',
    subject: 'Mathematics',
    difficulty: 'medium',
    marks: '2',
    negative_marks: '0.4',
    access: 'premium',
    language: 'en',
    question_en: '[DEMO] A shop gives 10% discount on Rs 2,500. What is the selling price (Rs)?',
    correct: '2250',
    tolerance: '0',
    unit_en: 'Rs',
  },
  {
    ref: 'EX-007',
    type: 'subjective',
    subject: 'General Knowledge',
    difficulty: 'hard',
    marks: '10',
    access: 'premium',
    language: 'both',
    question_en: '[DEMO] Explain the main features of federalism in Nepal.',
    model_answer_en: '[DEMO] Three levels of government; constitutional division of powers; …',
    passage_ref: '',
  },
  {
    ref: 'EX-008',
    type: 'single_choice',
    subject: 'English',
    difficulty: 'medium',
    marks: '1',
    access: 'premium',
    language: 'en',
    passage_ref: 'P-01',
    question_en: '[DEMO] According to the passage, why did the village build a school?',
    option_a_en: 'For tourism',
    option_b_en: 'So children need not walk far',
    option_c_en: 'To win a prize',
    correct: 'b',
  },
];

export const EXAMPLE_PASSAGES: Array<Record<string, string>> = [
  {
    passage_ref: 'P-01',
    title: '[DEMO] The village school',
    passage_en:
      '[DEMO] Children in the village used to walk three hours to the nearest school. In 2075 the villagers built their own school so that no child had to walk that far.',
    passage_ne: '',
  },
];

/** Range validations exist at runtime (`worksheet.dataValidations`) but exceljs' typings omit them. */
function validations(ws: ExcelJS.Worksheet) {
  return (ws as unknown as { dataValidations: { add(range: string, rule: ExcelJS.DataValidation): void } })
    .dataValidations;
}

function styleHeader(row: ExcelJS.Row, colours: string[]) {
  row.height = 30;
  row.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colours[i - 1] ?? GROUP_COLOUR.core } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

function addSheetRows(
  sheet: ExcelJS.Worksheet,
  keys: readonly string[],
  rows: Array<Record<string, string>>,
) {
  for (const r of rows) {
    const row = sheet.addRow(keys.map((k) => r[k] ?? ''));
    row.alignment = { vertical: 'top', wrapText: true };
  }
}

/**
 * Builds the workbook. Pass live lists (subjects, categories, papers) when downloading from the admin panel so the
 * dropdowns match the LMS; without them those columns accept free text.
 */
export async function buildQuestionTemplate(lists: TemplateLists = BASE_LISTS): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tayari Kakshya LMS';
  wb.title = 'Question import template';
  wb.description = TEMPLATE_VERSION;

  const keys = COLUMNS.map((c) => c.key);
  const colours = COLUMNS.map((c) => GROUP_COLOUR[c.group]);

  // ── Instructions ──
  const help = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: GROUP_COLOUR.core } } });
  help.columns = [{ width: 24 }, { width: 14 }, { width: 34 }, { width: 70 }, { width: 40 }];
  help.addRow(['Tayari Kakshya — question import template']).font = { bold: true, size: 16 };
  help.addRow(['Template version', TEMPLATE_VERSION]);
  help.addRow([]);
  const rules = [
    'How to use',
    '1. Fill the "Questions" sheet: one question per row, starting at row 2. Do not change, reorder or rename the header row.',
    '2. Comprehension passages go on the "Passages" sheet; link questions to them with passage_ref.',
    '3. The "Examples" sheet shows one filled row for every question type. Copy rows from there if helpful (remove "[DEMO]").',
    '4. Required columns: type, subject, difficulty, marks, access, and the question in English or Nepali. Other columns depend on the type (see the table below).',
    '5. Subjects, chapters, topics, exam categories and papers must already exist in the LMS. Download this template from the admin panel (Question bank → Import) to get dropdowns with your current lists.',
    '6. Category paths work for any structure: Authority > Level > Service > Group > Sub-group > Post > Exam stage — include only the levels your exam has, separated by " > ".',
    '7. Type Nepali in Unicode (e.g. Google Input Tools / Nepali Unicode keyboard). Preeti and other legacy fonts are not supported.',
    '8. Text only: images, formulas as images and tables are added afterwards in the question editor. Line breaks inside a cell are kept.',
    '9. Imported questions are saved as drafts (or "in review"). Check them in the Question bank before publishing.',
    '10. On upload the LMS shows a preview with every problem (row and column) before anything is saved. Nothing is imported until you confirm.',
    '11. Up to 2,000 rows per file. Save as .xlsx.',
  ];
  for (const [i, line] of rules.entries()) {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 13 };
    help.mergeCells(row.number, 1, row.number, 5);
    row.alignment = { wrapText: true, vertical: 'top' };
    if (i > 0) row.height = 30;
  }
  help.addRow([]);
  const legend = help.addRow([
    'Colour key: navy = basic details · blue = question text · green = answers · purple = extras · amber = previous-year source',
  ]);
  help.mergeCells(legend.number, 1, legend.number, 5);
  help.addRow([]);
  styleHeader(
    help.addRow(['Column', 'Required?', 'Used for question types', 'How to fill it', 'Example']),
    Array(5).fill(GROUP_COLOUR.core),
  );
  for (const c of COLUMNS) {
    const row = help.addRow([c.key, c.required, c.appliesTo, c.format, c.example]);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).font = { bold: true, color: { argb: GROUP_COLOUR[c.group] } };
  }
  help.addRow([]);
  styleHeader(help.addRow(['Question type', 'Columns to fill']), Array(2).fill(GROUP_COLOUR.answer));
  for (const [type, cols] of [
    ['single_choice', 'option_a… (2–6 options), correct = one letter'],
    ['multiple_choice', 'option_a… (2–6 options), correct = letters separated by commas'],
    ['true_false', 'correct = TRUE or FALSE'],
    ['fill_blank', 'question text with [[b1]]…, blank_answers, optional case_sensitive_blanks'],
    ['match', 'option_a… = left column, match_right_en = right column, match_pairs'],
    ['numeric', 'correct = the number, optional tolerance and unit'],
    ['subjective', 'model_answer_en or model_answer_ne'],
  ]) {
    const row = help.addRow([type, cols]);
    help.mergeCells(row.number, 2, row.number, 5);
  }

  // ── Questions (to fill) ──
  const sheet = wb.addWorksheet('Questions', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    properties: { tabColor: { argb: GROUP_COLOUR.text } },
  });
  sheet.columns = COLUMNS.map((c) => ({ header: c.key, key: c.key, width: c.width }));
  styleHeader(sheet.getRow(1), colours);
  COLUMNS.forEach((c, i) => {
    sheet.getRow(1).getCell(i + 1).note =
      `${c.required === 'always' ? 'Required. ' : c.required === 'by type' ? 'Required for some types. ' : 'Optional. '}${c.format}${c.example ? `\nExample: ${c.example}` : ''}`;
  });

  // ── Examples ──
  const examples = wb.addWorksheet('Examples', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    properties: { tabColor: { argb: GROUP_COLOUR.answer } },
  });
  examples.columns = COLUMNS.map((c) => ({ header: c.key, key: c.key, width: c.width }));
  styleHeader(examples.getRow(1), colours);
  addSheetRows(examples, keys, EXAMPLE_ROWS);

  // ── Passages ──
  const passages = wb.addWorksheet('Passages', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: GROUP_COLOUR.extra } },
  });
  passages.columns = [
    { header: 'passage_ref', key: 'passage_ref', width: 14 },
    { header: 'title', key: 'title', width: 30 },
    { header: 'passage_en', key: 'passage_en', width: 70 },
    { header: 'passage_ne', key: 'passage_ne', width: 70 },
  ];
  styleHeader(passages.getRow(1), Array(4).fill(GROUP_COLOUR.extra));
  addSheetRows(passages, PASSAGE_COLUMNS, EXAMPLE_PASSAGES);

  // ── Lists (dropdown sources) ──
  const listSheet = wb.addWorksheet('Lists', { properties: { tabColor: { argb: 'FF888888' } } });
  const listKeys = Object.keys(lists) as Array<keyof TemplateLists>;
  listSheet.columns = listKeys.map((k) => ({ header: k, key: k, width: k === 'categories' ? 60 : 24 }));
  styleHeader(listSheet.getRow(1), Array(listKeys.length).fill('FF555555'));
  const longest = Math.max(...listKeys.map((k) => lists[k].length), 1);
  for (let r = 0; r < longest; r++) listSheet.addRow(listKeys.map((k) => lists[k][r] ?? ''));

  // ── Validation (rows 2–2001 of Questions and Examples) ──
  const LAST = 2001;
  const colLetter = (n: number) => listSheet.getColumn(n).letter;
  for (const target of [sheet, examples]) {
    COLUMNS.forEach((c, i) => {
      const letter = target.getColumn(i + 1).letter;
      const range = `${letter}2:${letter}${LAST}`;
      if (c.list && lists[c.list].length) {
        const li = listKeys.indexOf(c.list) + 1;
        const ref = `Lists!$${colLetter(li)}$2:$${colLetter(li)}$${lists[c.list].length + 1}`;
        // Free-text lists (subjects, categories, papers) warn instead of blocking, so new names can be typed.
        const strict = !['subjects', 'categories', 'papers'].includes(c.list);
        validations(target).add(range, {
          type: 'list',
          allowBlank: true,
          formulae: [ref],
          showErrorMessage: true,
          errorStyle: strict ? 'stop' : 'warning',
          errorTitle: c.key,
          error: strict
            ? `Choose a value from the list for ${c.key}.`
            : `Not in the LMS list yet — check the spelling.`,
        });
      } else if (c.key === 'marks' || c.key === 'negative_marks' || c.key === 'tolerance') {
        validations(target).add(range, {
          type: 'decimal',
          operator: 'between',
          allowBlank: true,
          formulae: [0, 9999.99],
          showErrorMessage: true,
          errorTitle: c.key,
          error: 'Enter a number from 0 to 9999.99 (up to 2 decimals).',
        });
      } else if (c.key === 'pyq_year_bs') {
        validations(target).add(range, {
          type: 'whole',
          operator: 'between',
          allowBlank: true,
          formulae: [2000, 2100],
          showErrorMessage: true,
          errorTitle: 'Year (BS)',
          error: 'Enter a Bikram Sambat year between 2000 and 2100, e.g. 2080.',
        });
      } else if (c.key === 'ref' || c.key === 'passage_ref') {
        validations(target).add(range, {
          type: 'textLength',
          operator: 'lessThanOrEqual',
          allowBlank: true,
          formulae: [40],
          showErrorMessage: true,
          error: 'Use at most 40 characters.',
        });
      }
    });
  }

  wb.views = [
    { x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' },
  ];
  return wb;
}

import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildQuestionTemplate,
  COLUMNS,
  EXAMPLE_PASSAGES,
  EXAMPLE_ROWS,
} from '../src/modules/questions/import-template.js';
import { publisher } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  multipart,
  setSetting,
  staffLogin,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A filled template: the example rows (all 7 types) plus optional extra rows. */
async function workbook(rows: Array<Record<string, string>> = EXAMPLE_ROWS, passages = EXAMPLE_PASSAGES) {
  const wb = await buildQuestionTemplate();
  const sheet = wb.getWorksheet('Questions')!;
  for (const r of rows) sheet.addRow(COLUMNS.map((c) => r[c.key] ?? ''));
  const p = wb.getWorksheet('Passages')!;
  p.spliceRows(2, p.rowCount);
  for (const r of passages) p.addRow([r['passage_ref'], r['title'], r['passage_en'], r['passage_ne']]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(token: string, data: Buffer, name = 'questions.xlsx', contentType = XLSX) {
  const { payload, headers } = multipart({ name, contentType, data });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/admin/question-imports',
    payload,
    headers: { ...headers, authorization: `Bearer ${token}` },
  });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

/** Creates everything the example rows refer to: subjects, chapter 1 / topic 1.1, the PSC path and Paper I. */
async function referenceData(token: string) {
  const subject = async (name: string) =>
    (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: name } } })).body.id as string;
  const gk = await subject('General Knowledge');
  await subject('Mathematics');
  await subject('English');
  const chapter = (
    await call(ctx, 'POST', `/admin/subjects/${gk}/chapters`, {
      token,
      body: { numberLabel: '1', title: { en: 'Constitution' } },
    })
  ).body;
  const topic = (
    await call(ctx, 'POST', `/admin/chapters/${chapter.id}/topics`, {
      token,
      body: { numberLabel: '1.1', title: { en: 'Rights' } },
    })
  ).body;
  const node = async (parentId: string | null, nodeType: string, name: string, slug: string) =>
    (
      await call(ctx, 'POST', '/admin/exam-nodes', {
        token,
        body: { parentId, nodeType, name: { en: name }, slug },
      })
    ).body.id as string;
  const psc = await node(null, 'authority', 'Lok Sewa Aayog', 'psc');
  const service = await node(psc, 'service', 'Administration Service', 'admin-service');
  const post = await node(service, 'post', 'Kharidar', 'kharidar');
  const stage = await node(post, 'exam_stage', 'Preliminary', 'kharidar-preliminary');
  await call(ctx, 'POST', '/admin/papers', { token, body: { name: { en: 'Paper I' }, postIds: [stage] } });
  return { gk, topicId: topic.id as string, stage };
}

describe('Excel question import', () => {
  it('previews the template examples, then creates all 8 questions and the passage as drafts', async () => {
    const token = await publisher(ctx);
    const ref = await referenceData(token);
    const preview = await upload(token, await workbook());
    expect(preview.status).toBe(201);
    expect(preview.body.summary).toEqual({ rows: 8, valid: 8, invalid: 0, warnings: 0, passages: 1 });
    expect(preview.body.rows.every((r: { problems: unknown[] }) => r.problems.length === 0)).toBe(true);
    expect(await ctx.prisma.question.count()).toBe(0); // nothing saved before confirming

    const commit = await call(ctx, 'POST', `/admin/question-imports/${preview.body.id}/commit`, { token });
    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({ created: 8, passages: 1 });

    const questions = await ctx.prisma.question.findMany({
      include: { currentVersion: true, sources: true, tags: { include: { tag: true } } },
    });
    expect(questions).toHaveLength(8);
    expect(new Set(questions.map((q) => q.type)).size).toBe(7);
    expect(questions.every((q) => q.status === 'draft' && q.currentVersion?.versionNo === 1)).toBe(true);
    const ex1 = questions.find((q) => q.searchText.includes('right to equality'))!;
    expect(ex1).toMatchObject({
      subjectId: ref.gk,
      topicId: ref.topicId,
      isPyq: true,
      difficulty: 'easy',
      accessLevel: 'free',
    });
    expect(Number(ex1.defaultNegativeMarks)).toBe(0.2);
    expect(ex1.sources[0]).toMatchObject({ examNodeId: ref.stage, yearBs: 2079, note: 'Q. 12' });
    expect(ex1.tags.map((t) => t.tag.name).sort()).toEqual(['constitution', 'rights']);
    const comprehension = questions.find((q) => q.searchText.includes('build a school'))!;
    expect(comprehension.groupId).not.toBeNull();

    // Confirming twice is refused; the record keeps the result.
    expect(
      (await call(ctx, 'POST', `/admin/question-imports/${preview.body.id}/commit`, { token })).status,
    ).toBe(409);
    const history = await call(ctx, 'GET', '/admin/question-imports', { token });
    expect(history.body[0]).toMatchObject({
      status: 'committed',
      createdCount: 8,
      fileName: 'questions.xlsx',
    });
    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'question_import.commit' } });
    expect(audit?.changes).toMatchObject({ created: 8, passages: 1 });

    // Uploading the same file again warns about duplicates but does not block.
    const again = await upload(token, await workbook());
    expect(again.body.summary).toMatchObject({ valid: 8, warnings: 8 });
    expect(again.body.rows[0].warnings).toContain(
      'A question with the same text already exists in this subject',
    );
  });

  it('reports every problem by row and column, and imports only the valid rows', async () => {
    const token = await publisher(ctx);
    await referenceData(token);
    await setSetting(ctx, 'questions.types', {
      enabled: ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'match', 'subjective'],
      labels: {},
    });
    const ok = EXAMPLE_ROWS[2]!; // true/false, valid
    const rows = [
      ok,
      { ...ok, ref: 'EX-003' }, // duplicate ref
      { ...ok, ref: 'R-3', subject: 'Unknown Subject' },
      { ...ok, ref: 'R-4', pyq_category: 'Lok Sewa Aayog > Nonexistent Post' },
      { ...ok, ref: 'R-5', pyq_paper: 'Paper Z' },
      { ...EXAMPLE_ROWS[5]!, ref: 'R-6' }, // numeric: switched off
      { ...ok, ref: 'R-7', chapter: '9', topic: '9.9', subject: 'General Knowledge' },
      { ...ok, ref: 'R-8', passage_ref: 'P-404' },
      { ...ok, ref: 'R-9', correct: 'maybe' },
    ];
    const res = await upload(token, await workbook(rows));
    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({ rows: 9, valid: 1, invalid: 8 });
    const byRef = Object.fromEntries(
      res.body.rows.map(
        (r: { ref: string; row: number; problems: Array<{ column: string; message: string }> }) => [
          `${r.row}`,
          r.problems.map((p) => `${p.column}: ${p.message}`),
        ],
      ),
    );
    // Excel rows start at 2 (row 1 is the header).
    expect(byRef['2']).toEqual([]);
    expect(byRef['3']).toEqual(['ref: ref "EX-003" is used on an earlier row']);
    expect(byRef['4']).toEqual(['subject: No subject called "Unknown Subject"']);
    expect(byRef['5']).toEqual(['pyq_category: No category "Nonexistent Post" under "Lok Sewa Aayog"']);
    expect(byRef['6']).toEqual(['pyq_paper: No paper "Paper Z"']);
    expect(byRef['7']).toEqual(['type: This question type is turned off in System settings']);
    expect(byRef['8']).toEqual(['chapter: No chapter "9" in General Knowledge']);
    expect(byRef['9']).toEqual(['passage_ref: No passage "P-404" on the Passages sheet']);
    expect(byRef['10']).toEqual(['correct: Enter TRUE or FALSE']);

    const commit = await call(ctx, 'POST', `/admin/question-imports/${res.body.id}/commit`, { token });
    expect(commit.body).toMatchObject({ created: 1, passages: 0 });
    expect(await ctx.prisma.question.count()).toBe(1);
  });

  it('rejects unreadable files and changed references, and keeps imports private to their uploader', async () => {
    const token = await publisher(ctx);
    const ref = await referenceData(token);
    expect((await upload(token, Buffer.from('not a spreadsheet'), 'x.xlsx')).status).toBe(400);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['hello']);
    const noSheet = await upload(token, Buffer.from(await wb.xlsx.writeBuffer()));
    expect(noSheet.status).toBe(400);
    expect(JSON.stringify(noSheet.body)).toContain('No \\"Questions\\" sheet');

    const preview = await upload(token, await workbook([EXAMPLE_ROWS[0]!]));
    expect(preview.body.summary.valid).toBe(1);
    // Someone else cannot confirm it.
    await createStaff(ctx, 'other@example.com', { permissions: ['questions:edit'] });
    const other = (await staffLogin(ctx, 'other@example.com')).token;
    expect(
      (await call(ctx, 'POST', `/admin/question-imports/${preview.body.id}/commit`, { token: other })).status,
    ).toBe(404);
    // The topic disappears between preview and confirm: nothing is created.
    await ctx.prisma.topic.update({ where: { id: ref.topicId }, data: { deletedAt: new Date() } });
    const commit = await call(ctx, 'POST', `/admin/question-imports/${preview.body.id}/commit`, { token });
    expect(commit.status).toBe(409);
    expect(await ctx.prisma.question.count()).toBe(0);

    // Without questions:edit the import is not available.
    await createStaff(ctx, 'viewer@example.com', { permissions: ['assessments:edit'] });
    const viewer = (await staffLogin(ctx, 'viewer@example.com')).token;
    expect((await upload(viewer, await workbook())).status).toBe(403);
  });

  it('only matches subjects inside a scoped editor’s subjects', async () => {
    const token = await publisher(ctx);
    await referenceData(token);
    const english = await ctx.prisma.subject.findFirstOrThrow({
      where: { name: { path: ['en'], equals: 'English' } },
    });
    const scoped = await createStaff(ctx, 'scoped@example.com', { permissions: ['questions:edit'] });
    await ctx.prisma.staffScope.create({
      data: { userId: scoped.id, scopeType: 'subject', scopeId: english.id },
    });
    const t = (await staffLogin(ctx, 'scoped@example.com')).token;
    const res = await upload(t, await workbook([EXAMPLE_ROWS[0]!, EXAMPLE_ROWS[7]!]));
    expect(res.body.summary).toMatchObject({ valid: 1, invalid: 1 });
    expect(res.body.rows[0].problems[0].message).toBe('No subject called "General Knowledge"');
  });
});

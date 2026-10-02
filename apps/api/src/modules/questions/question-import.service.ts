import { Injectable } from '@nestjs/common';
import { ErrorCode, QuestionInput, type LocalizedText } from '@tk/contracts';
import ExcelJS from 'exceljs';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ScopeService, type ContentActor } from '../content/scope.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { parseQuestionRow, textDoc, type RowProblem } from './import-row.js';
import { COLUMNS, PASSAGE_COLUMNS, TEMPLATE_VERSION } from './import-template.js';
import { QuestionsService, searchTextOf, stemPreview } from './questions.service.js';

export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 2000, previewHours: 24 } as const;

/** A checked row waiting for confirmation. */
interface PendingRow {
  row: number;
  input: QuestionInput;
  status: 'draft' | 'in_review';
  passageRef: string | null;
}
interface Payload {
  rows: PendingRow[];
  passages: Record<string, { title: LocalizedText | null; passage: Record<string, unknown> }>;
}

export interface PreviewRow {
  row: number;
  ref: string | null;
  type: string;
  preview: string;
  problems: RowProblem[];
  warnings: string[];
}

const REQUIRED_HEADERS = ['type', 'subject', 'difficulty', 'marks', 'access', 'question_en', 'question_ne'];
const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const names = (v: unknown) => {
  const l = (v ?? {}) as LocalizedText;
  return [l.en, l.ne].filter((x): x is string => Boolean(x)).map(norm);
};

/** Cell value → text: formulas give their result, rich text is joined, hyperlinks give their text. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText))
      return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellText((value.result ?? null) as ExcelJS.CellValue);
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('error' in value) return '';
  }
  return String(value);
}

function sheetRows(sheet: ExcelJS.Worksheet): {
  headers: string[];
  rows: Array<{ n: number; values: Record<string, string> }>;
} {
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (c, i) => (headers[i - 1] = norm(cellText(c.value))));
  const rows: Array<{ n: number; values: Record<string, string> }> = [];
  sheet.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) values[h] = cellText(row.getCell(i + 1).value).trim();
    });
    if (Object.values(values).some((v) => v !== '')) rows.push({ n, values });
  });
  return { headers, rows };
}

/** Excel question import (D-046): upload → preview with row/column problems → confirm → drafts. */
@Injectable()
export class QuestionImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly settings: SettingsService,
    private readonly questions: QuestionsService,
  ) {}

  async preview(file: { buffer: Buffer; filename: string }, actor: ContentActor) {
    if (file.buffer.length > IMPORT_LIMITS.maxBytes) {
      throw new AppError(
        413,
        ErrorCode.VALIDATION_FAILED,
        'The file is larger than 5 MB. Split it into smaller files.',
      );
    }
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw Errors.validation([
        { path: 'file', message: 'This is not a readable .xlsx file. Save it as Excel Workbook (.xlsx).' },
      ]);
    }
    const sheet = wb.getWorksheet('Questions');
    if (!sheet) {
      throw Errors.validation([
        { path: 'file', message: 'No "Questions" sheet. Use the template from the Question bank.' },
      ]);
    }
    const { headers, rows } = sheetRows(sheet);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw Errors.validation([
        { path: 'file', message: `Missing column(s): ${missing.join(', ')}. Do not rename the header row.` },
      ]);
    }
    if (rows.length === 0)
      throw Errors.validation([{ path: 'file', message: 'The Questions sheet has no rows.' }]);
    if (rows.length > IMPORT_LIMITS.maxRows) {
      throw Errors.validation([
        { path: 'file', message: `${rows.length} rows: the limit is ${IMPORT_LIMITS.maxRows} per file.` },
      ]);
    }
    const unknownColumns = headers.filter((h) => h && !COLUMNS.some((c) => c.key === h));

    // ── Passages sheet ──
    const passages: Payload['passages'] = {};
    const passageProblems: string[] = [];
    const passageSheet = wb.getWorksheet('Passages');
    if (passageSheet) {
      for (const { n, values } of sheetRows(passageSheet).rows) {
        const ref = values[PASSAGE_COLUMNS[0]] ?? '';
        const en = textDoc(values['passage_en']);
        const ne = textDoc(values['passage_ne']);
        if (!ref) passageProblems.push(`Passages row ${n}: passage_ref is empty`);
        else if (!en && !ne)
          passageProblems.push(`Passages row ${n}: write the passage in English or Nepali`);
        else if (passages[ref]) passageProblems.push(`Passages row ${n}: passage_ref "${ref}" is used twice`);
        else {
          const title = values['title'] ? { en: values['title'] } : null;
          passages[ref] = { title, passage: { ...(en ? { en } : {}), ...(ne ? { ne } : {}) } };
        }
      }
    }

    // ── Reference data for name resolution (scoped staff only see their subjects) ──
    const allowed = await this.scope.allowedSubjectIds(actor);
    const [subjects, nodes, papers, { enabled }] = await Promise.all([
      this.prisma.subject.findMany({
        where: { deletedAt: null, ...(allowed ? { id: { in: [...allowed] } } : {}) },
        select: {
          id: true,
          name: true,
          chapters: {
            where: { deletedAt: null },
            select: {
              id: true,
              numberLabel: true,
              title: true,
              topics: { where: { deletedAt: null }, select: { id: true, numberLabel: true, title: true } },
            },
          },
        },
      }),
      this.prisma.examNode.findMany({
        where: { deletedAt: null },
        select: { id: true, parentId: true, name: true, slug: true },
      }),
      this.prisma.paper.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, code: true },
      }),
      this.settings.get('questions.types'),
    ]);
    const matches = <T>(list: T[], key: string, keysOf: (x: T) => string[]) =>
      list.filter((x) => keysOf(x).includes(norm(key)));
    const outline = (x: { numberLabel: string | null; title: unknown }) => [
      ...names(x.title),
      ...(x.numberLabel ? [norm(x.numberLabel)] : []),
    ];

    const preview: PreviewRow[] = [];
    const pending: PendingRow[] = [];
    const seenRefs = new Set<string>();
    for (const { n, values } of rows) {
      const { value, problems } = parseQuestionRow(values);
      const warnings: string[] = [];
      const ref = values['ref'] || null;
      if (ref) {
        if (seenRefs.has(ref))
          problems.push({ column: 'ref', message: `ref "${ref}" is used on an earlier row` });
        seenRefs.add(ref);
      }
      let input: QuestionInput | null = null;
      if (value) {
        if (!enabled.includes(value.content.type)) {
          problems.push({ column: 'type', message: 'This question type is turned off in System settings' });
        }
        const subject = matches(subjects, value.subject, (s) => names(s.name));
        if (subject.length !== 1) {
          problems.push({
            column: 'subject',
            message: subject.length
              ? 'Two subjects have this name; rename one in the LMS'
              : `No subject called "${value.subject}"`,
          });
        }
        let topicId: string | null = null;
        const s = subject.length === 1 ? subject[0] : undefined;
        if (s && value.chapter) {
          const chapter = matches(s.chapters, value.chapter, outline);
          if (chapter.length !== 1) {
            problems.push({
              column: 'chapter',
              message: chapter.length
                ? 'More than one chapter matches'
                : `No chapter "${value.chapter}" in ${value.subject}`,
            });
          } else if (value.topic) {
            const topic = matches(chapter[0]!.topics, value.topic, outline);
            if (topic.length !== 1) {
              problems.push({
                column: 'topic',
                message: topic.length
                  ? 'More than one topic matches'
                  : `No topic "${value.topic}" in that chapter`,
              });
            } else topicId = topic[0]!.id;
          } else {
            warnings.push('Chapter given without a topic: the question is linked to the whole subject');
          }
        }
        // Category path: walk from the top, matching each level by name (en/ne) or URL name.
        let examNodeId: string | null = null;
        if (value.source?.categoryPath.length) {
          let parent: string | null = null;
          for (const [depth, part] of value.source.categoryPath.entries()) {
            const found = nodes.filter(
              (nd) => nd.parentId === parent && [...names(nd.name), norm(nd.slug)].includes(norm(part)),
            );
            if (found.length !== 1) {
              problems.push({
                column: 'pyq_category',
                message: found.length
                  ? `"${part}" matches more than one category`
                  : `No category "${part}"${depth ? ` under "${value.source.categoryPath[depth - 1]}"` : ' at the top level'}`,
              });
              parent = null;
              break;
            }
            parent = found[0]!.id;
          }
          examNodeId = parent;
        }
        let paperId: string | null = null;
        if (value.source?.paper) {
          const paper = papers.filter((p) =>
            [...names(p.name), ...(p.code ? [norm(p.code)] : [])].includes(norm(value.source!.paper!)),
          );
          if (paper.length !== 1)
            problems.push({
              column: 'pyq_paper',
              message: paper.length ? 'More than one paper matches' : `No paper "${value.source.paper}"`,
            });
          else paperId = paper[0]!.id;
        }
        if (value.passageRef && !passages[value.passageRef]) {
          problems.push({
            column: 'passage_ref',
            message: `No passage "${value.passageRef}" on the Passages sheet`,
          });
        }
        if (!problems.length && s) {
          const candidate = QuestionInput.safeParse({
            subjectId: s.id,
            topicId,
            groupId: null,
            difficulty: value.difficulty,
            defaultMarks: value.marks,
            defaultNegativeMarks: value.negativeMarks,
            language: value.language,
            accessLevel: value.accessLevel,
            tags: value.tags,
            sources: value.source
              ? [{ examNodeId, paperId, yearBs: value.source.yearBs, note: value.source.note }]
              : [],
            content: value.content,
          });
          if (candidate.success) input = candidate.data;
          else
            for (const issue of candidate.error.issues)
              problems.push({ column: String(issue.path[0] ?? 'type'), message: issue.message });
        }
      }
      preview.push({
        row: n,
        ref,
        type: values['type'] ?? '',
        preview: value
          ? stemPreview(value.content).slice(0, 140)
          : (values['question_en'] || values['question_ne'] || '').slice(0, 140),
        problems,
        warnings,
      });
      if (input && value) pending.push({ row: n, input, status: value.status, passageRef: value.passageRef });
    }

    // Possible duplicates of questions already in the bank (same text, same subject): warn, do not block.
    if (pending.length) {
      const texts = pending.map((p) => searchTextOf(p.input.content));
      const existing = await this.prisma.question.findMany({
        where: { deletedAt: null, searchText: { in: [...new Set(texts)] } },
        select: { searchText: true, subjectId: true },
      });
      const known = new Set(existing.map((e) => `${e.subjectId}|${e.searchText}`));
      pending.forEach((p, i) => {
        if (known.has(`${p.input.subjectId}|${texts[i]}`)) {
          preview
            .find((r) => r.row === p.row)
            ?.warnings.push('A question with the same text already exists in this subject');
        }
      });
    }

    const summary = {
      rows: rows.length,
      valid: pending.length,
      invalid: rows.length - pending.length,
      warnings: preview.filter((r) => r.warnings.length).length,
      passages: Object.keys(passages).length,
    };
    const record = await this.prisma.questionImport.create({
      data: {
        fileName: file.filename.slice(0, 200),
        summary,
        payload: { rows: pending, passages } satisfies Payload as unknown as Prisma.InputJsonValue,
        createdById: actor.userId,
      },
    });
    return {
      id: record.id,
      fileName: record.fileName,
      templateVersion: TEMPLATE_VERSION,
      summary,
      fileProblems: [
        ...passageProblems,
        ...(unknownColumns.length ? [`Ignored unknown column(s): ${unknownColumns.join(', ')}`] : []),
      ],
      rows: preview,
    };
  }

  /** Creates the checked rows (and their passages) as drafts in one transaction. Only the uploader can confirm. */
  async commit(id: string, actor: ContentActor) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM question_imports WHERE id = ${id}::uuid FOR UPDATE`;
        const record = await tx.questionImport.findUnique({ where: { id } });
        if (!record || record.createdById !== actor.userId) throw Errors.notFound('Import');
        if (record.status !== 'previewed')
          throw new AppError(409, ErrorCode.CONFLICT, 'This import was already confirmed');
        if (Date.now() - record.createdAt.getTime() > IMPORT_LIMITS.previewHours * 3600_000) {
          await tx.questionImport.update({
            where: { id },
            data: { status: 'expired', payload: Prisma.DbNull },
          });
          throw new AppError(
            409,
            ErrorCode.CONFLICT,
            'This preview is older than 24 hours. Upload the file again.',
          );
        }
        const payload = record.payload as unknown as Payload;
        if (!payload.rows.length)
          throw Errors.validation([{ path: 'rows', message: 'No valid rows to import' }]);
        await this.assertReferencesStillExist(tx, payload, actor);

        const groupIds = new Map<string, string>();
        for (const ref of new Set(
          payload.rows.map((r) => r.passageRef).filter((r): r is string => Boolean(r)),
        )) {
          const passage = payload.passages[ref];
          if (!passage) continue;
          const group = await tx.questionGroup.create({
            data: {
              title: (passage.title ?? Prisma.DbNull) as Prisma.InputJsonValue,
              passage: passage.passage as Prisma.InputJsonValue,
              createdById: actor.userId,
              updatedById: actor.userId,
            },
          });
          groupIds.set(ref, group.id);
        }
        const createdIds: string[] = [];
        for (const row of payload.rows) {
          const input = {
            ...row.input,
            groupId: row.passageRef ? (groupIds.get(row.passageRef) ?? null) : null,
          };
          createdIds.push(
            await this.questions.insert(tx, input, actor, { status: row.status, importId: id }),
          );
        }
        await tx.questionImport.update({
          where: { id },
          data: {
            status: 'committed',
            committedAt: new Date(),
            createdCount: createdIds.length,
            payload: Prisma.DbNull,
          },
        });
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: 'question_import.commit',
            entityType: 'question_import',
            entityId: id,
            changes: { fileName: record.fileName, created: createdIds.length, passages: groupIds.size },
            client: actor.client,
          },
          tx,
        );
        return { created: createdIds.length, passages: groupIds.size };
      },
      { timeout: 180_000, maxWait: 10_000 },
    );
    return { id, ...result };
  }

  async history(actor: ContentActor) {
    const rows = await this.prisma.questionImport.findMany({
      where: { createdById: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        summary: true,
        createdAt: true,
        committedAt: true,
        createdCount: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      committedAt: r.committedAt?.toISOString() ?? null,
    }));
  }

  /** Subjects, topics, categories or papers may have been deleted (or the scope changed) since the preview. */
  private async assertReferencesStillExist(
    tx: Prisma.TransactionClient,
    payload: Payload,
    actor: ContentActor,
  ) {
    const subjectIds = [...new Set(payload.rows.map((r) => r.input.subjectId))];
    const topicIds = [
      ...new Set(payload.rows.map((r) => r.input.topicId).filter((x): x is string => Boolean(x))),
    ];
    const nodeIds = [
      ...new Set(
        payload.rows
          .flatMap((r) => r.input.sources.map((s) => s.examNodeId))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const paperIds = [
      ...new Set(
        payload.rows
          .flatMap((r) => r.input.sources.map((s) => s.paperId))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const [s, t, n, p] = await Promise.all([
      tx.subject.count({ where: { id: { in: subjectIds }, deletedAt: null } }),
      tx.topic.count({ where: { id: { in: topicIds }, deletedAt: null } }),
      tx.examNode.count({ where: { id: { in: nodeIds }, deletedAt: null } }),
      tx.paper.count({ where: { id: { in: paperIds }, deletedAt: null } }),
    ]);
    if (s !== subjectIds.length || t !== topicIds.length || n !== nodeIds.length || p !== paperIds.length) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'Some subjects, topics, categories or papers changed since the preview. Upload the file again.',
      );
    }
    for (const subjectId of subjectIds) await this.scope.assertSubject(actor, subjectId);
    const { enabled } = await this.settings.get('questions.types');
    if (payload.rows.some((r) => !enabled.includes(r.input.content.type))) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'A question type was turned off since the preview. Upload the file again.',
      );
    }
  }
}

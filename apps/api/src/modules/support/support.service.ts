import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  PageSlug,
  type ContactOptionInput,
  type FaqInput,
  type LocalizedText,
  type PageInput,
} from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma, type Platform } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { mediaIdsIn } from '../content/practice-view.js';
import type { ContentActor } from '../content/scope.service.js';
import { MediaService } from '../media/media.service.js';
import { plainLocalized } from '../notifications/plain-text.js';
import { DRAFT_LINE, pageDraft } from './page-drafts.js';

/** The iPhone app shows no refund policy: it sells nothing (D-027). */
const hiddenOnIos = new Set<PageSlug>(['refund']);

/** What still marks a page as an unfinished draft: placeholders in [[…]] or the DRAFT line (D-038). */
export function draftProblems(title: unknown, body: unknown): string[] {
  const text = [
    ...Object.values((title ?? {}) as Record<string, string>),
    ...Object.values(plainLocalized(body as Partial<Record<'en' | 'ne', unknown>>)),
  ].join('\n');
  const problems: string[] = [];
  if (text.includes(DRAFT_LINE.slice(0, 20))) problems.push('Delete the DRAFT line at the top');
  // The DRAFT line itself mentions [[…]]; it is reported on its own.
  const placeholders = [
    ...new Set(
      text
        .split(DRAFT_LINE)
        .join('')
        .match(/\[\[[^\]]*\]\]/g) ?? [],
    ),
  ];
  if (placeholders.length) problems.push(`Fill in or remove: ${placeholders.slice(0, 5).join(', ')}`);
  return problems;
}

/**
 * Help & support (D-034, D-064) and the static pages (D-038). Pages are edited as a working copy and published as
 * numbered versions that are kept for good; readers always get the last published version.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  // ───────────── Readers ─────────────

  /** Published pages (for footers and the Profile menu). */
  async publishedPages(platform: Platform) {
    const rows = await this.prisma.$queryRaw<
      Array<{ slug: PageSlug; title: LocalizedText; version: number }>
    >`
      SELECT DISTINCT ON (slug) slug, title, version FROM static_page_versions ORDER BY slug, version DESC`;
    return rows
      .filter((r) => !(platform === 'ios' && hiddenOnIos.has(r.slug)))
      .sort((a, b) => PageSlug.options.indexOf(a.slug) - PageSlug.options.indexOf(b.slug))
      .map((r) => ({ slug: r.slug, title: r.title }));
  }

  async page(slug: PageSlug, platform: Platform) {
    if (platform === 'ios' && hiddenOnIos.has(slug)) throw Errors.notFound('Page');
    const v = await this.prisma.staticPageVersion.findFirst({
      where: { slug },
      orderBy: { version: 'desc' },
    });
    if (!v) throw Errors.notFound('Page');
    return {
      slug,
      title: v.title as LocalizedText,
      body: v.body,
      media: await this.media.publicImageUrls([...mediaIdsIn(v.body)]),
      version: v.version,
      publishedAt: v.publishedAt.toISOString(),
    };
  }

  async faqs(platform: Platform) {
    const rows = await this.prisma.faq.findMany({
      where: { active: true, ...(platform === 'ios' ? { hideOnIos: false } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((f) => ({
      id: f.id,
      question: f.question as LocalizedText,
      answer: f.answer as LocalizedText,
    }));
  }

  async contacts() {
    const rows = await this.prisma.contactOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label as LocalizedText,
      value: c.value,
      note: (c.note as LocalizedText | null) ?? null,
    }));
  }

  // ───────────── CMS: pages ─────────────

  /** The four pages; a missing one starts from its draft (D-038). */
  async adminPages() {
    await this.ensureDrafts();
    const [pages, versions] = await Promise.all([
      this.prisma.staticPage.findMany(),
      this.prisma.staticPageVersion.findMany({ orderBy: { version: 'desc' } }),
    ]);
    return PageSlug.options.map((slug) => {
      const p = pages.find((x) => x.slug === slug)!;
      const latest = versions.find((v) => v.slug === slug) ?? null;
      return {
        slug,
        title: p.title as LocalizedText,
        version: latest?.version ?? null,
        publishedAt: latest?.publishedAt.toISOString() ?? null,
        unpublishedChanges: !latest || !sameContent(p, latest),
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async adminPage(slug: PageSlug) {
    await this.ensureDrafts();
    const p = await this.prisma.staticPage.findUniqueOrThrow({ where: { slug } });
    const versions = await this.prisma.staticPageVersion.findMany({
      where: { slug },
      orderBy: { version: 'desc' },
      take: 50,
    });
    const names = await this.staffNames(versions.map((v) => v.publishedById));
    return {
      slug,
      title: p.title as LocalizedText,
      body: p.body,
      media: await this.media.publicImageUrls([...mediaIdsIn(p.body)]),
      problems: draftProblems(p.title, p.body),
      unpublishedChanges: !versions[0] || !sameContent(p, versions[0]),
      updatedAt: p.updatedAt.toISOString(),
      versions: versions.map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt.toISOString(),
        publishedBy: names.get(v.publishedById) ?? null,
      })),
    };
  }

  async savePage(slug: PageSlug, input: PageInput, actor: ContentActor) {
    await this.ensureDrafts();
    await this.prisma.$transaction(async (tx) => {
      await tx.staticPage.update({
        where: { slug },
        data: {
          title: input.title as Prisma.InputJsonValue,
          body: input.body as Prisma.InputJsonValue,
          updatedById: actor.userId,
        },
      });
      await this.log(tx, actor, 'page.save', slug, { title: input.title });
    });
    return this.adminPage(slug);
  }

  /** A new numbered version; refused while the text is still a draft or nothing changed. */
  async publishPage(slug: PageSlug, actor: ContentActor) {
    await this.ensureDrafts();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`page:${slug}`}))`;
      const p = await tx.staticPage.findUniqueOrThrow({ where: { slug } });
      const problems = draftProblems(p.title, p.body);
      if (problems.length) {
        throw Errors.validation(problems.map((message) => ({ path: 'body', message })));
      }
      const latest = await tx.staticPageVersion.findFirst({ where: { slug }, orderBy: { version: 'desc' } });
      if (latest && sameContent(p, latest)) {
        throw Errors.conflict(ErrorCode.CONFLICT, 'Nothing has changed since the last published version');
      }
      const version = (latest?.version ?? 0) + 1;
      await tx.staticPageVersion.create({
        data: {
          slug,
          version,
          title: p.title as Prisma.InputJsonValue,
          body: p.body as Prisma.InputJsonValue,
          publishedById: actor.userId,
        },
      });
      await this.log(tx, actor, 'page.publish', slug, { version });
    });
    return this.adminPage(slug);
  }

  // ───────────── CMS: FAQs and contact options ─────────────

  async adminFaqs() {
    const rows = await this.prisma.faq.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((f) => ({
      id: f.id,
      question: f.question as LocalizedText,
      answer: f.answer as LocalizedText,
      sortOrder: f.sortOrder,
      active: f.active,
      hideOnIos: f.hideOnIos,
    }));
  }

  async saveFaq(id: string | null, input: FaqInput, actor: ContentActor) {
    const data = {
      question: input.question as Prisma.InputJsonValue,
      answer: input.answer as Prisma.InputJsonValue,
      sortOrder: input.sortOrder,
      active: input.active,
      hideOnIos: input.hideOnIos,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      if (id && !(await tx.faq.findUnique({ where: { id } }))) throw Errors.notFound('FAQ');
      const saved = id ? await tx.faq.update({ where: { id }, data }) : await tx.faq.create({ data });
      await this.log(
        tx,
        actor,
        id ? 'faq.update' : 'faq.create',
        saved.id,
        { question: input.question },
        'faq',
      );
      return saved;
    });
    return { id: row.id };
  }

  async removeFaq(id: string, actor: ContentActor) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.faq.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('FAQ');
      await tx.faq.delete({ where: { id } });
      await this.log(tx, actor, 'faq.delete', id, { question: before.question }, 'faq');
    });
  }

  async adminContacts() {
    const rows = await this.prisma.contactOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label as LocalizedText,
      value: c.value,
      note: (c.note as LocalizedText | null) ?? null,
      sortOrder: c.sortOrder,
      active: c.active,
    }));
  }

  async saveContact(id: string | null, input: ContactOptionInput, actor: ContentActor) {
    const data = {
      type: input.type,
      label: input.label as Prisma.InputJsonValue,
      value: input.value,
      note: (input.note ?? Prisma.DbNull) as Prisma.InputJsonValue,
      sortOrder: input.sortOrder,
      active: input.active,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      if (id && !(await tx.contactOption.findUnique({ where: { id } })))
        throw Errors.notFound('Contact option');
      const saved = id
        ? await tx.contactOption.update({ where: { id }, data })
        : await tx.contactOption.create({ data });
      await this.log(
        tx,
        actor,
        id ? 'contact.update' : 'contact.create',
        saved.id,
        { type: input.type },
        'contact',
      );
      return saved;
    });
    return { id: row.id };
  }

  async removeContact(id: string, actor: ContentActor) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.contactOption.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('Contact option');
      await tx.contactOption.delete({ where: { id } });
      await this.log(tx, actor, 'contact.delete', id, { type: before.type, value: before.value }, 'contact');
    });
  }

  // ───────────── helpers ─────────────

  private async ensureDrafts() {
    await this.prisma.staticPage.createMany({
      data: PageSlug.options.map((slug) => {
        const d = pageDraft(slug);
        return { slug, title: d.title as Prisma.InputJsonValue, body: d.body as Prisma.InputJsonValue };
      }),
      skipDuplicates: true,
    });
  }

  private async staffNames(ids: string[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: ContentActor,
    action: string,
    entityId: string,
    changes: unknown,
    entityType = 'page',
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType,
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}

function sameContent(a: { title: unknown; body: unknown }, b: { title: unknown; body: unknown }) {
  return (
    JSON.stringify(a.title) === JSON.stringify(b.title) && JSON.stringify(a.body) === JSON.stringify(b.body)
  );
}

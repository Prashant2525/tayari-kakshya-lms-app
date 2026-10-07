import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContactOptionInput, FaqInput, PageInput, PageSlug } from '@tk/contracts';
import { Audiences, Public, RequirePermissions } from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import type { Platform } from '../../generated/prisma/client.js';
import { ClientPlatform, StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { SupportService } from './support.service.js';

const uuid = () => new ParseUUIDPipe();
const slugOf = (value: string) => {
  const parsed = PageSlug.safeParse(value);
  if (!parsed.success) throw Errors.notFound('Page');
  return parsed.data;
};

/** Help & support and the static pages, for everyone (app and website, signed in or not). */
@ApiTags('support')
@Public()
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('pages')
  pages(@ClientPlatform() platform: Platform) {
    return this.support.publishedPages(platform);
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string, @ClientPlatform() platform: Platform) {
    return this.support.page(slugOf(slug), platform);
  }

  @Get('faqs')
  faqs(@ClientPlatform() platform: Platform) {
    return this.support.faqs(platform);
  }

  @Get('contact-options')
  contacts() {
    return this.support.contacts();
  }
}

@ApiTags('admin-support')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('pages')
  @RequirePermissions('pages:manage')
  pages() {
    return this.support.adminPages();
  }

  @Get('pages/:slug')
  @RequirePermissions('pages:manage')
  page(@Param('slug') slug: string) {
    return this.support.adminPage(slugOf(slug));
  }

  @Put('pages/:slug')
  @RequirePermissions('pages:manage')
  @ApiZodBody(PageInput)
  save(@Param('slug') slug: string, @ZodBody(PageInput) body: PageInput, @StaffActor() a: ContentActor) {
    return this.support.savePage(slugOf(slug), body, a);
  }

  @Post('pages/:slug/publish')
  @HttpCode(200)
  @RequirePermissions('pages:manage')
  publish(@Param('slug') slug: string, @StaffActor() a: ContentActor) {
    return this.support.publishPage(slugOf(slug), a);
  }

  @Get('faqs')
  @RequirePermissions('support:manage')
  faqs() {
    return this.support.adminFaqs();
  }

  @Post('faqs')
  @RequirePermissions('support:manage')
  @ApiZodBody(FaqInput)
  createFaq(@ZodBody(FaqInput) body: FaqInput, @StaffActor() a: ContentActor) {
    return this.support.saveFaq(null, body, a);
  }

  @Put('faqs/:id')
  @RequirePermissions('support:manage')
  @ApiZodBody(FaqInput)
  updateFaq(
    @Param('id', uuid()) id: string,
    @ZodBody(FaqInput) body: FaqInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.support.saveFaq(id, body, a);
  }

  @Delete('faqs/:id')
  @HttpCode(204)
  @RequirePermissions('support:manage')
  async removeFaq(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.support.removeFaq(id, a);
  }

  @Get('contact-options')
  @RequirePermissions('support:manage')
  contacts() {
    return this.support.adminContacts();
  }

  @Post('contact-options')
  @RequirePermissions('support:manage')
  @ApiZodBody(ContactOptionInput)
  createContact(@ZodBody(ContactOptionInput) body: ContactOptionInput, @StaffActor() a: ContentActor) {
    return this.support.saveContact(null, body, a);
  }

  @Put('contact-options/:id')
  @RequirePermissions('support:manage')
  @ApiZodBody(ContactOptionInput)
  updateContact(
    @Param('id', uuid()) id: string,
    @ZodBody(ContactOptionInput) body: ContactOptionInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.support.saveContact(id, body, a);
  }

  @Delete('contact-options/:id')
  @HttpCode(204)
  @RequirePermissions('support:manage')
  async removeContact(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.support.removeContact(id, a);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { themes } from '@tk/design-tokens';
import { ENV, type Env } from '../../config/env.js';
import { SettingsService } from '../settings/settings.service.js';

type Locale = 'en' | 'ne';

/** An email body ready to send: plain text, and HTML when there is something to format. */
export interface ComposedEmail {
  text: string;
  html?: string;
}

const colors = themes.light;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escaped text with its web addresses as links. */
const linked = (s: string) =>
  escapeHtml(s).replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/g,
    (url) => `<a href="${url}" style="color:${colors.link};font-weight:700">${url}</a>`,
  );

/** Paragraphs split on blank lines; single line breaks kept. */
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linked(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

/**
 * The "how to get courses" box (D-061) under student emails: iPhone users are told, outside the app (App Review
 * 3.1.3), to buy on the website with the same account; Android users that they can buy in the app or on the website.
 * Text from the CMS (`emails.buyingGuide`); the iPhone line is highlighted. Not used for security codes or receipts.
 */
@Injectable()
export class BuyingGuideService {
  constructor(
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Pick<Env, 'PUBLIC_WEB_URL'>,
  ) {}

  /** The message with the box under it (or unchanged when the box is off or the website is not set). */
  async compose(message: string, locale: Locale): Promise<ComposedEmail> {
    const website = this.env.PUBLIC_WEB_URL?.replace(/\/+$/, '');
    const guide = await this.settings.get('emails.buyingGuide');
    if (!guide.enabled || !website) return { text: message };
    const fill = (s: string) => s.replace(/\{website\}/g, website);
    const title = guide.title[locale];
    const iphone = fill(guide.iphone[locale]);
    const android = fill(guide.android[locale]);
    const already = guide.alreadyBought[locale];

    const text = [message, '', `— ${title} —`, `* ${iphone}`, `* ${android}`, already].join('\n');
    const link = linked;
    const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:${colors.bg};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:${colors.text}">
<div style="max-width:560px;margin:0 auto;background:${colors.surface};border:1px solid ${colors.border};border-radius:12px;padding:24px">
${paragraphs(message)}
<div style="margin-top:8px;padding:16px;border:2px solid ${colors.primary};border-radius:12px;background:${colors.primarySoft}">
<p style="margin:0 0 10px;font-weight:700;font-size:16px;color:${colors.onPrimarySoft}">${escapeHtml(title)}</p>
<p style="margin:0 0 10px;font-weight:700;color:${colors.onPrimarySoft}">${link(iphone)}</p>
<p style="margin:0 0 10px">${link(android)}</p>
<p style="margin:0;font-size:13px;color:${colors.textSecondary}">${escapeHtml(already)}</p>
</div>
</div>
</body></html>`;
    return { text, html };
  }
}

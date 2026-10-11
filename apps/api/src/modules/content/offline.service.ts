import { Injectable } from '@nestjs/common';
import { ErrorCode, type OfflineLicence } from '@tk/contracts';
import { AppError } from '../../common/errors/app-error.js';
import { SettingsService } from '../settings/settings.service.js';
import { CatalogService, type Viewer } from './catalog.service.js';

const DAY_MS = 86_400_000;
const notAvailable = (message: string) => new AppError(403, ErrorCode.FORBIDDEN, message);

/**
 * Offline lessons (S11, D-067, T-069). A download is the lesson as it is opened online (the same access rules) plus a
 * licence: the app may open its copy without internet until `expiresAt` (CMS `offline.rules.days`, default 7). Online,
 * the app renews its licences; a lesson the student can no longer open — or every lesson, once staff switch offline
 * off — is revoked and the app deletes its copy. Notes for now; PDFs follow, videos later (D-067).
 */
@Injectable()
export class OfflineService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
  ) {}

  async download(itemId: string, viewer: Viewer, now = new Date()) {
    const rules = await this.settings.get('offline.rules');
    if (!rules.enabled) throw notAvailable('Downloads are switched off');
    const item = await this.catalog.itemContent(itemId, viewer);
    if (item.type !== 'note') throw notAvailable('Only notes can be downloaded for now');
    return { ...item, expiresAt: this.expiry(now, rules.days), serverTime: now.toISOString() };
  }

  async refresh(itemIds: string[], viewer: Viewer, now = new Date()) {
    const rules = await this.settings.get('offline.rules');
    const licences: OfflineLicence[] = [];
    for (const id of new Set(itemIds)) {
      if (!rules.enabled) {
        licences.push({ id, expiresAt: null, version: null });
        continue;
      }
      try {
        const item = await this.catalog.itemContent(id, viewer);
        licences.push(
          item.type === 'note'
            ? { id, expiresAt: this.expiry(now, rules.days), version: item.version }
            : { id, expiresAt: null, version: null },
        );
      } catch (err) {
        // Access ended or the lesson is gone: revoke. Anything else (e.g. the database) is not the student's doing.
        if (err instanceof AppError && err.status >= 400 && err.status < 500) {
          licences.push({ id, expiresAt: null, version: null });
        } else {
          throw err;
        }
      }
    }
    return { licences, serverTime: now.toISOString() };
  }

  private expiry(now: Date, days: number) {
    return new Date(now.getTime() + days * DAY_MS).toISOString();
  }
}

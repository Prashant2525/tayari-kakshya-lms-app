import { z } from 'zod';

/**
 * Offline lessons (S11, D-067): a downloaded lesson opens without internet until its licence expires; the app renews
 * licences when it is online, and the server can revoke them (access ended, lesson unpublished, offline switched off).
 */
export const OfflineRefreshInput = z.object({ itemIds: z.array(z.uuid()).max(200) });
export type OfflineRefreshInput = z.infer<typeof OfflineRefreshInput>;

export const OfflineLicence = z.object({
  id: z.string(),
  /** Null when revoked: the app deletes its copy. */
  expiresAt: z.string().nullable(),
  /** The lesson's last change: a different value means the saved copy is out of date. */
  version: z.string().nullable(),
});
export type OfflineLicence = z.infer<typeof OfflineLicence>;

import type { OfflineLicence } from '@tk/contracts';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { api } from '@/api/client';
import type { ItemContent } from '@/api/learning';
import { useSession } from '@/state/session';
import { usable, withLocalMedia, type OfflineEntry } from './offline-rules';

/**
 * Offline lessons (S11, D-067, T-069): notes saved in the app's private storage with their pictures, opened without
 * internet until their licence expires. Online, the licences are renewed (or revoked: the copy is deleted). Everything
 * is deleted when the student signs out. Not on the web.
 */
export const offlineSupported = Platform.OS !== 'web';

interface Index {
  items: Record<string, OfflineEntry>;
  /** The last time the server reported (guards against a clock set back). */
  serverTime: string | null;
}
type Downloaded = ItemContent & { expiresAt: string; serverTime: string; version: string };

const root = () => new Directory(Paths.document, 'offline');
const indexFile = () => new File(root(), 'index.json');
const contentFile = (id: string) => new File(root(), `${id}.json`);
const mediaDir = () => new Directory(root(), 'media');

function ensureDirs() {
  if (!root().exists) root().create({ intermediates: true });
  if (!mediaDir().exists) mediaDir().create({ intermediates: true });
}

function readIndex(): Index {
  try {
    const file = indexFile();
    return file.exists ? (JSON.parse(file.textSync()) as Index) : { items: {}, serverTime: null };
  } catch {
    return { items: {}, serverTime: null };
  }
}

function writeIndex(index: Index) {
  ensureDirs();
  const file = indexFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(index));
}

function deleteFiles(id: string) {
  const content = contentFile(id);
  if (content.exists) content.delete();
  if (mediaDir().exists) {
    for (const entry of mediaDir().list()) if (entry.name.startsWith(`${id}-`)) entry.delete();
  }
}

interface OfflineState extends Index {
  loaded: boolean;
  busy: Record<string, boolean>;
  load(): void;
  download(item: ItemContent, where: { courseId?: string; subjectId?: string; slug?: string }): Promise<void>;
  remove(id: string): void;
  clear(): void;
  refresh(): Promise<void>;
}

export const useOffline = create<OfflineState>((set, get) => ({
  items: {},
  serverTime: null,
  loaded: false,
  busy: {},

  load() {
    if (!offlineSupported || get().loaded) return;
    set({ ...readIndex(), loaded: true });
  },

  async download(item, where) {
    if (!offlineSupported) return;
    set((s) => ({ busy: { ...s.busy, [item.id]: true } }));
    try {
      const saved = await api.post<Downloaded>(`/learning-items/${item.id}/offline`);
      ensureDirs();
      // Pictures go with the note, so it reads the same without internet.
      const files: Record<string, string> = {};
      for (const [mediaId, m] of Object.entries(saved.media ?? {})) {
        const ext = /\.(\w{3,4})(?:\?|$)/.exec(m.url)?.[1] ?? 'img';
        const target = new File(mediaDir(), `${item.id}-${mediaId}.${ext}`);
        if (target.exists) target.delete();
        try {
          await File.downloadFileAsync(m.url, target);
          files[mediaId] = target.uri;
        } catch {
          // A picture that cannot be fetched shows its web address (and nothing offline); the text still saves.
        }
      }
      const content = contentFile(item.id);
      if (!content.exists) content.create();
      content.write(JSON.stringify({ ...saved, media: withLocalMedia(saved.media ?? {}, files) }));
      const entry: OfflineEntry = {
        id: item.id,
        type: 'note',
        title: saved.title,
        version: saved.version,
        expiresAt: saved.expiresAt,
        savedAt: new Date().toISOString(),
        premium: saved.accessLevel === 'premium',
        ...where,
      };
      const index = { items: { ...get().items, [item.id]: entry }, serverTime: saved.serverTime };
      writeIndex(index);
      set(index);
    } finally {
      set((s) => ({ busy: { ...s.busy, [item.id]: false } }));
    }
  },

  remove(id) {
    if (!offlineSupported) return;
    deleteFiles(id);
    const items = { ...get().items };
    delete items[id];
    const index = { items, serverTime: get().serverTime };
    writeIndex(index);
    set(index);
  },

  clear() {
    if (!offlineSupported) return;
    if (root().exists) root().delete();
    set({ items: {}, serverTime: null });
  },

  async refresh() {
    const ids = Object.keys(get().items);
    if (!offlineSupported || !ids.length || !useSession.getState().tokens) return;
    const res = await api.post<{ licences: OfflineLicence[]; serverTime: string }>('/me/offline/refresh', {
      itemIds: ids,
    });
    const items = { ...get().items };
    const outdated: OfflineEntry[] = [];
    for (const l of res.licences) {
      const entry = items[l.id];
      if (!entry) continue;
      if (!l.expiresAt) {
        deleteFiles(l.id);
        delete items[l.id];
      } else {
        items[l.id] = { ...entry, expiresAt: l.expiresAt };
        if (l.version && l.version !== entry.version) outdated.push(entry);
      }
    }
    const index = { items, serverTime: res.serverTime };
    writeIndex(index);
    set(index);
    // Changed lessons are saved again (best effort: the old copy stays until the new one is in).
    for (const entry of outdated) {
      await get()
        .download({ id: entry.id } as ItemContent, {
          courseId: entry.courseId,
          subjectId: entry.subjectId,
          slug: entry.slug,
        })
        .catch(() => undefined);
    }
  },
}));

/** The saved copy of a lesson, when it may be opened now. */
export function savedLesson(id: string): (ItemContent & { expiresAt: string }) | null {
  const { items, serverTime } = useOffline.getState();
  const entry = items[id];
  if (!offlineSupported || !entry || !usable(entry, Date.now(), serverTime)) return null;
  try {
    return JSON.parse(contentFile(id).textSync()) as ItemContent & { expiresAt: string };
  } catch {
    return null;
  }
}

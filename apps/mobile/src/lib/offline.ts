import type { OfflineLicence } from '@tk/contracts';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { api } from '@/api/client';
import type { ItemContent } from '@/api/learning';
import { useSession } from '@/state/session';
import { env } from './env';
import { usable, withLocalMedia, type OfflineEntry } from './offline-rules';

/**
 * Offline lessons (S11, D-067, T-069): notes (with their pictures) and PDFs saved in the app's private storage,
 * opened without internet until their licence expires. A PDF is the student's own watermarked copy, read in a saved
 * offline reader page. Online, the licences are renewed (or revoked: the copy is deleted). Everything is deleted when
 * the student signs out. Not on the web.
 */
export const offlineSupported = Platform.OS !== 'web';

interface Index {
  items: Record<string, OfflineEntry>;
  /** The last time the server reported (guards against a clock set back). */
  serverTime: string | null;
  /** The saved offline PDF reader's version (one reader serves every saved PDF). */
  reader?: string;
}
type Downloaded = ItemContent & {
  expiresAt: string;
  serverTime: string;
  version: string;
  readerVersion?: string;
};

const root = () => new Directory(Paths.document, 'offline');
const indexFile = () => new File(root(), 'index.json');
const contentFile = (id: string) => new File(root(), `${id}.json`);
const mediaDir = () => new Directory(root(), 'media');
const pdfFile = (id: string) => new File(root(), `${id}.pdf`);
const readerFile = (version: string) => new File(root(), `reader-${version}.html`);

const authorization = () => ({ Authorization: `Bearer ${useSession.getState().tokens?.accessToken ?? ''}` });

/** Downloads to a temporary file first, so a failed download keeps the copy already saved. */
async function fetchTo(url: string, target: File, headers: Record<string, string>) {
  const part = new File(root(), `${target.name}.part`);
  if (part.exists) part.delete();
  try {
    await File.downloadFileAsync(url, part, { headers, idempotent: true });
  } catch (err) {
    // Android may leave a partly written file behind.
    if (part.exists) part.delete();
    throw err;
  }
  if (target.exists) target.delete();
  await part.move(target);
}

/** The student's watermarked PDF, and the offline reader when this version is not saved yet (older ones go). */
async function savePdf(id: string, readerVersion: string) {
  await fetchTo(`${env.apiBaseUrl}/learning-items/${id}/pdf`, pdfFile(id), authorization());
  const reader = readerFile(readerVersion);
  if (!reader.exists) {
    await fetchTo(`${env.apiBaseUrl}/viewer/pdf-offline`, reader, {});
    for (const entry of root().list()) {
      if (entry.name.startsWith('reader-') && entry.name !== reader.name) entry.delete();
    }
  }
}

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
  const pdf = pdfFile(id);
  if (pdf.exists) pdf.delete();
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
      if (saved.type === 'pdf') await savePdf(item.id, saved.readerVersion ?? 'current');
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
        type: saved.type === 'pdf' ? 'pdf' : 'note',
        title: saved.title,
        version: saved.version,
        expiresAt: saved.expiresAt,
        savedAt: new Date().toISOString(),
        premium: saved.accessLevel === 'premium',
        ...where,
      };
      const index: Index = {
        items: { ...get().items, [item.id]: entry },
        serverTime: saved.serverTime,
        reader: saved.readerVersion ?? get().reader,
      };
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
    const index = { items, serverTime: get().serverTime, reader: get().reader };
    writeIndex(index);
    set(index);
  },

  clear() {
    if (!offlineSupported) return;
    if (root().exists) root().delete();
    set({ items: {}, serverTime: null, reader: undefined });
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
    const index = { items, serverTime: res.serverTime, reader: get().reader };
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

/** The offline reader page, and the saved PDF in base64, when a saved PDF lesson may be opened now. */
export async function savedPdf(id: string): Promise<{ readerHtml: string; base64: string } | null> {
  const { reader } = useOffline.getState();
  if (!savedLesson(id) || !reader) return null;
  try {
    return { readerHtml: readerFile(reader).textSync(), base64: await pdfFile(id).base64() };
  } catch {
    return null;
  }
}

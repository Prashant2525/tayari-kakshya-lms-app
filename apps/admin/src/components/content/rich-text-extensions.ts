import type { AnyExtension } from '@tiptap/react';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

/**
 * Images reference media-library assets by id (`mediaId`), never by URL, so stored notes cannot hotlink or carry
 * untrusted sources. Pasted images without a media id are dropped.
 */
export const MediaImage = Image.extend({
  addAttributes() {
    return {
      mediaId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-media-id'),
        renderHTML: (attrs) => ({ 'data-media-id': attrs['mediaId'] as string | null }),
      },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute('alt'),
        renderHTML: (attrs) => (attrs['alt'] ? { alt: attrs['alt'] as string } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-media-id]' }];
  },
});

/** Editor schema; must stay within the server's allow-list (`validateRichDoc` in @tk/contracts). */
export function richTextExtensions(image: AnyExtension = MediaImage): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => SAFE_LINK.test(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    Highlight,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: false } }),
    image,
  ];
}

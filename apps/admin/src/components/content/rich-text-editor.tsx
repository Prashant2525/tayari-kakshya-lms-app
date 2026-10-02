import { useQuery } from '@tanstack/react-query';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { imageVariant, type MediaView } from '@/lib/content';
import { toStoredDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Input } from '../ui/form';
import { MediaPickerDialog } from './media-picker';
import { MediaImage, richTextExtensions } from './rich-text-extensions';

function ImageView({ node, selected }: NodeViewProps) {
  const mediaId = node.attrs['mediaId'] as string | null;
  const media = useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => api.get<MediaView>(`/admin/media/${mediaId}`),
    enabled: Boolean(mediaId),
  });
  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      {media.data ? (
        <img
          src={imageVariant(media.data, 640)}
          alt={(node.attrs['alt'] as string | null) ?? ''}
          className={cn('max-h-96 rounded-sm', selected && 'outline outline-2 outline-primary')}
        />
      ) : (
        <div className="grid h-24 place-items-center rounded-sm bg-surface-muted text-xs text-text-muted">
          {media.isError ? 'Image not found in the media library' : 'Loading image…'}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const EditorImage = MediaImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

function ToolButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-sm text-text-secondary transition-colors hover:bg-surface-muted hover:text-text disabled:opacity-40',
        active && 'bg-primary-soft text-on-primary-soft',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = (editor.getAttributes('link')['href'] as string | undefined) ?? '';
  const [href, setHref] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const withProtocol = /^[a-z]+:/i.test(value) ? value : `https://${value}`;
    if (!/^(https?:\/\/|mailto:)/i.test(withProtocol)) {
      setError('Links must start with http://, https:// or mailto:');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: withProtocol }).run();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={current ? 'Edit link' : 'Add link'}
      description="Leave empty to remove the link."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </>
      }
    >
      <Field label="Web address" error={error ?? undefined}>
        {(a) => (
          <Input
            {...a}
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
            placeholder="https://"
          />
        )}
      </Field>
    </Dialog>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      sub: e.isActive('subscript'),
      sup: e.isActive('superscript'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const sep = <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-muted/50 px-2 py-1.5"
    >
      <ToolButton icon={Undo2} label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()} />
      <ToolButton icon={Redo2} label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()} />
      {sep}
      <ToolButton
        icon={Heading2}
        label="Heading"
        active={s.h2}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        icon={Heading3}
        label="Subheading"
        active={s.h3}
        onClick={() => c().toggleHeading({ level: 3 }).run()}
      />
      {sep}
      <ToolButton icon={Bold} label="Bold" active={s.bold} onClick={() => c().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()} />
      <ToolButton
        icon={Underline}
        label="Underline"
        active={s.underline}
        onClick={() => c().toggleUnderline().run()}
      />
      <ToolButton
        icon={Strikethrough}
        label="Strikethrough"
        active={s.strike}
        onClick={() => c().toggleStrike().run()}
      />
      <ToolButton
        icon={Highlighter}
        label="Highlight"
        active={s.highlight}
        onClick={() => c().toggleHighlight().run()}
      />
      <ToolButton icon={Code} label="Inline code" active={s.code} onClick={() => c().toggleCode().run()} />
      <ToolButton
        icon={Subscript}
        label="Subscript"
        active={s.sub}
        onClick={() => c().toggleSubscript().run()}
      />
      <ToolButton
        icon={Superscript}
        label="Superscript"
        active={s.sup}
        onClick={() => c().toggleSuperscript().run()}
      />
      <ToolButton icon={Link2} label="Link" active={s.link} onClick={() => setLinkOpen(true)} />
      {sep}
      <ToolButton
        icon={List}
        label="Bulleted list"
        active={s.bullet}
        onClick={() => c().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label="Numbered list"
        active={s.ordered}
        onClick={() => c().toggleOrderedList().run()}
      />
      <ToolButton icon={Quote} label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
      <ToolButton icon={Minus} label="Divider" onClick={() => c().setHorizontalRule().run()} />
      {sep}
      <ToolButton icon={AlignLeft} label="Align left" onClick={() => c().unsetTextAlign().run()} />
      <ToolButton
        icon={AlignCenter}
        label="Align centre"
        active={s.center}
        onClick={() => c().setTextAlign('center').run()}
      />
      <ToolButton
        icon={AlignRight}
        label="Align right"
        active={s.right}
        onClick={() => c().setTextAlign('right').run()}
      />
      {sep}
      <ToolButton icon={ImagePlus} label="Insert image" onClick={() => setImageOpen(true)} />
      <ToolButton
        icon={Table}
        label={s.table ? 'Delete table' : 'Insert table'}
        active={s.table}
        onClick={() =>
          s.table ? c().deleteTable().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
      {s.table ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().addRowAfter().run()}
          >
            + Row
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().addColumnAfter().run()}
          >
            + Column
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().deleteRow().run()}
          >
            − Row
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().deleteColumn().run()}
          >
            − Column
          </Button>
        </>
      ) : null}
      {linkOpen ? <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} /> : null}
      {imageOpen ? (
        <MediaPickerDialog
          kind="image"
          title="Insert an image"
          onClose={() => setImageOpen(false)}
          onSelect={(m) => {
            setImageOpen(false);
            c()
              .insertContent({
                type: 'image',
                attrs: { mediaId: m.id, alt: m.altText?.en ?? m.altText?.ne ?? null },
              })
              .run();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Note editor (TipTap). Emits the stored rich-text shape on every change; images come from the media library.
 * `lang` sets spell-checking and font selection for Nepali.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
  lang,
  invalid,
}: {
  value: JsonNode | null;
  onChange: (doc: JsonNode) => void;
  label: string;
  lang?: 'en' | 'ne';
  invalid?: boolean;
}) {
  const editor = useEditor({
    extensions: richTextExtensions(EditorImage),
    content: value ?? '',
    immediatelyRender: true,
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        lang: lang ?? 'en',
        class: 'tk-prose min-h-64 px-4 py-3 focus:outline-none',
      },
    },
    onUpdate: ({ editor: e }) => onChange(toStoredDoc(e.getJSON() as JsonNode)),
  });
  return (
    <div
      className={cn(
        'overflow-hidden rounded-sm border border-border-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-focus',
        invalid && 'border-danger',
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

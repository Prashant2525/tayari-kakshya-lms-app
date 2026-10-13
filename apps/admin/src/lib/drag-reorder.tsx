import { GripVertical } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { cn } from './utils';

/** The order after moving `from` onto `to`'s place (before it when moving up, after it when moving down). */
export function moveTo(ids: string[], from: string, to: string): string[] {
  const fromIndex = ids.indexOf(from);
  const toIndex = ids.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || from === to) return ids;
  const next = ids.filter((id) => id !== from);
  next.splice(toIndex, 0, from);
  return next;
}

/**
 * Drag-to-reorder for the CMS's ordered lists (KI-024, FEATURE_SPECIFICATION "drag-reorder"), on the browser's own
 * drag and drop. One per page; `bind(scope, ids, id, onReorder)` gives a row its handlers. A drag only lands in its
 * own list (`scope`), so a lesson never drops among chapters. Keyboard users keep the "Move up / Move down" actions.
 */
export function useDragReorder() {
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  return function bind(
    scope: string,
    ids: string[],
    id: string,
    onReorder: (next: string[]) => void,
    enabled = true,
  ) {
    if (!enabled || ids.length < 2) return {};
    const type = `application/x-tk-reorder-${scope.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    const key = `${scope}:${id}`;
    const ours = (e: DragEvent) => e.dataTransfer.types.includes(type);
    return {
      draggable: true,
      'data-dragging': dragging === key ? 'true' : undefined,
      'data-drop-target': over === key && dragging !== key ? 'true' : undefined,
      onDragStart: (e: DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.setData(type, id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(key);
      },
      onDragOver: (e: DragEvent) => {
        if (!ours(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (over !== key) setOver(key);
      },
      onDragLeave: (e: DragEvent) => {
        if (over === key && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      },
      onDrop: (e: DragEvent) => {
        if (!ours(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const from = e.dataTransfer.getData(type);
        setOver(null);
        setDragging(null);
        const next = moveTo(ids, from, id);
        if (next !== ids) onReorder(next);
      },
      onDragEnd: () => {
        setOver(null);
        setDragging(null);
      },
    };
  };
}

/** The visible grip on a draggable row (decorative: the row itself is what is dragged). */
export function DragHandle({ className }: { className?: string }) {
  return (
    <GripVertical
      aria-hidden
      className={cn('size-4 shrink-0 cursor-grab text-text-muted active:cursor-grabbing', className)}
    />
  );
}

/** Classes for a draggable row: dimmed while dragged, a line above the place it would drop. */
export const dragRowClass =
  'data-[dragging=true]:opacity-50 data-[drop-target=true]:shadow-[inset_0_2px_0_0_var(--color-primary)]';

import { useState } from 'react';
import { Input } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/primitives';

/** A filterable list of checkboxes (exams, instructors, courses…). */
export function CheckList({
  items,
  selected,
  onToggle,
  disabled,
  empty,
}: {
  items: Array<{ id: string; label: string; hint?: string }>;
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
  disabled: boolean;
  empty: string;
}) {
  const [filter, setFilter] = useState('');
  const visible = items.filter((i) => i.label.toLowerCase().includes(filter.trim().toLowerCase()));
  if (items.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter"
        aria-label="Filter"
        className="mb-2 h-9"
      />
      <ul className="max-h-72 overflow-y-auto">
        {visible.map((i) => {
          const id = `chk-${i.id}`;
          return (
            <li key={i.id} className="flex items-center gap-2 py-1.5">
              <Checkbox
                id={id}
                checked={selected.includes(i.id)}
                disabled={disabled}
                onCheckedChange={(on) => onToggle(i.id, on)}
                describedBy={i.hint ? `${id}-hint` : undefined}
              />
              <label htmlFor={id} className="text-sm text-text">
                {i.label}
              </label>
              {i.hint ? (
                <span id={`${id}-hint`} className="text-xs text-text-muted">
                  {i.hint}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

import { useId, useState } from 'react';
import type { HolderKind } from '../../engine';
import { uid } from '../../lib/id';
import { useStore } from '../../state/store';

/**
 * Pick a holder by typing its name. An unknown name creates a new holder, so
 * adding an investor never requires leaving the row.
 */
export function HolderInput({
  holderId,
  onChange,
  kind = 'investor',
  ariaLabel = 'Holder',
}: {
  holderId: string;
  onChange: (holderId: string) => void;
  kind?: HolderKind;
  ariaLabel?: string;
}) {
  const holders = useStore((s) => s.deal.holders);
  const update = useStore((s) => s.update);
  const listId = useId();
  const current = holders.find((h) => h.id === holderId);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft == null) return;
    const name = draft.trim();
    setDraft(null);
    if (!name || name === current?.name) return;
    const match = holders.find((h) => h.name.toLowerCase() === name.toLowerCase());
    if (match) {
      onChange(match.id);
      return;
    }
    const id = uid('holder');
    update((d) => void d.holders.push({ id, name, kind }));
    onChange(id);
  };

  return (
    <div className="control">
      <input
        list={listId}
        aria-label={ariaLabel}
        value={draft ?? current?.name ?? ''}
        placeholder="Investor name"
        onFocus={() => setDraft(current?.name ?? '')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <datalist id={listId}>
        {holders
          .filter((h) => h.kind !== 'founder')
          .map((h) => (
            <option key={h.id} value={h.name} />
          ))}
      </datalist>
    </div>
  );
}

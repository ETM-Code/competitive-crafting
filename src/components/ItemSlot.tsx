import { useState } from 'react';
import { itemById } from '../shared/catalogue';
export function ItemImage({ id, className = '' }: { id: string; className?: string }) {
  const item = itemById[id];
  const [failed, setFailed] = useState<string | null>(null);
  return item && failed !== id ? (
    <img
      className={`item-image ${className}`}
      src={item.icon}
      alt={item.name}
      width="256"
      height="256"
      draggable={false}
      onError={() => setFailed(id)}
    />
  ) : (
    <span className="missing-item" role="img" aria-label={`${item?.name || id}: image unavailable`}>
      Image unavailable
    </span>
  );
}
export function ItemSlot({
  id,
  label,
  selected = false,
  disabled = false,
  onClick,
  onPlace,
  onInteract,
  testId,
  children,
}: {
  id?: string | null;
  label?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onPlace?: (id: string) => void;
  onInteract?: () => void;
  testId?: string;
  children?: React.ReactNode;
}) {
  const name = id ? itemById[id]?.name || id : 'Empty slot';
  return (
    <button
      type="button"
      className={`slot ${selected ? 'selected' : ''}`}
      title={label || name}
      aria-label={label || name}
      aria-pressed={selected}
      disabled={disabled}
      data-testid={testId}
      data-item-id={id || undefined}
      draggable={!!id && !disabled}
      onClick={onClick}
      onDragStart={(event) => {
        if (id) {
          onInteract?.();
          event.dataTransfer.setData('application/x-crafting-item', id);
          event.dataTransfer.effectAllowed = 'copy';
        }
      }}
      onDragOver={(event) => {
        if (onPlace && !disabled) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const value = event.dataTransfer.getData('application/x-crafting-item');
        if (value && !disabled) onPlace?.(value);
      }}
      onContextMenu={(event) => {
        if (onPlace) {
          event.preventDefault();
          onPlace('');
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Delete' || event.key === 'Backspace') && onPlace) {
          event.preventDefault();
          onPlace('');
        }
      }}
    >
      {id && <ItemImage key={id} id={id} />}
      {children}
    </button>
  );
}

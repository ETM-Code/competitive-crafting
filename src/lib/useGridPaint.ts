import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface Point {
  x: number;
  y: number;
}
interface CellBounds {
  index: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Intersect the actual pointer segment so a fast sweep cannot skip a cell.
export function crossedCells(from: Point, to: Point, cells: CellBounds[]): number[] {
  return cells
    .flatMap((cell) => {
      let entry = 0;
      let exit = 1;
      for (const [start, delta, min, max] of [
        [from.x, to.x - from.x, cell.left, cell.right],
        [from.y, to.y - from.y, cell.top, cell.bottom],
      ]) {
        if (delta === 0) {
          if (start < min || start > max) return [];
        } else {
          const a = (min - start) / delta;
          const b = (max - start) / delta;
          entry = Math.max(entry, Math.min(a, b));
          exit = Math.min(exit, Math.max(a, b));
          if (entry > exit) return [];
        }
      }
      return [{ index: cell.index, entry }];
    })
    .sort((a, b) => a.entry - b.entry)
    .map((cell) => cell.index);
}

export function useGridPaint({
  roundId,
  disabled,
  selected,
  erase,
  onPlace,
}: {
  roundId: string;
  disabled: boolean;
  selected: string | null;
  erase: boolean;
  onPlace: (index: number, item: string | null) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const options = useRef({ disabled, selected, erase, onPlace });
  options.current = { disabled, selected, erase, onPlace };
  const gesture = useRef<{
    pointerId: number;
    button: number;
    item: string | null;
    last: Point;
    visited: Set<number>;
  } | null>(null);
  const suppressClick = useRef(false);
  const stop = () => {
    const active = gesture.current;
    gesture.current = null;
    if (active && grid.current?.hasPointerCapture(active.pointerId))
      grid.current.releasePointerCapture(active.pointerId);
  };
  useEffect(() => {
    stop();
  }, [roundId, disabled]);
  useEffect(() => {
    const up = (event: PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) stop();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', stop);
      stop();
    };
  }, []);
  const paint = (indices: number[]) => {
    const active = gesture.current;
    if (!active || options.current.disabled) return;
    for (const index of indices) {
      if (active.visited.has(index)) continue;
      active.visited.add(index);
      options.current.onPlace(index, active.item);
    }
  };
  return {
    ref: grid,
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      suppressClick.current = false;
      if (event.pointerType !== 'mouse' || ![0, 2].includes(event.button)) return;
      const cell = (event.target as Element).closest<HTMLElement>('[data-grid-index]');
      if (!cell || options.current.disabled) return;
      const item = event.button === 2 || options.current.erase ? null : options.current.selected;
      if (event.button === 0 && !options.current.erase && !item) return;
      event.preventDefault();
      cell.focus({ preventScroll: true });
      suppressClick.current = true;
      gesture.current = {
        pointerId: event.pointerId,
        button: event.button,
        item,
        last: { x: event.clientX, y: event.clientY },
        visited: new Set(),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      paint([Number(cell.dataset.gridIndex)]);
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      if (options.current.disabled || !(event.buttons & (active.button === 2 ? 2 : 1))) {
        stop();
        return;
      }
      const next = { x: event.clientX, y: event.clientY };
      const cells = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-grid-index]')].map(
        (cell) => {
          const { left, right, top, bottom } = cell.getBoundingClientRect();
          return { index: Number(cell.dataset.gridIndex), left, right, top, bottom };
        },
      );
      paint(crossedCells(active.last, next, cells));
      active.last = next;
    },
    onLostPointerCapture: stop,
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
      if (suppressClick.current && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onContextMenu(event: React.MouseEvent<HTMLDivElement>) {
      event.preventDefault();
    },
  };
}

import { describe, expect, it } from 'vitest';
import { crossedCells } from '../../src/lib/useGridPaint';

const cells = Array.from({ length: 9 }, (_, index) => ({
  index,
  left: (index % 3) * 54,
  right: (index % 3) * 54 + 48,
  top: Math.floor(index / 3) * 54,
  bottom: Math.floor(index / 3) * 54 + 48,
}));

describe('pointer paint hit testing', () => {
  it('finds every crossed slot even when the browser emits one fast movement', () => {
    expect(crossedCells({ x: 24, y: 24 }, { x: 140, y: 24 }, cells)).toEqual([0, 1, 2]);
    expect(crossedCells({ x: 140, y: 24 }, { x: 24, y: 24 }, cells)).toEqual([2, 1, 0]);
  });
  it('supports a stationary initial press, diagonal sweeps, and gaps', () => {
    expect(crossedCells({ x: 24, y: 24 }, { x: 24, y: 24 }, cells)).toEqual([0]);
    expect(crossedCells({ x: 24, y: 24 }, { x: 140, y: 140 }, cells)).toEqual([0, 4, 8]);
    expect(crossedCells({ x: 51, y: 0 }, { x: 51, y: 150 }, cells)).toEqual([]);
  });
  it('does not invent cells outside the board', () => {
    expect(crossedCells({ x: -20, y: -20 }, { x: -10, y: 140 }, cells)).toEqual([]);
    expect(crossedCells({ x: -20, y: 24 }, { x: 24, y: 24 }, cells)).toEqual([0]);
  });
});

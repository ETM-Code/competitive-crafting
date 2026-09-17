import { useMemo, useState } from 'react';
import { items, itemById } from '../shared/catalogue';
import type { Category } from '../shared/types';
import { ItemSlot } from './ItemSlot';
const categories: (Category | 'all')[] = [
  'all',
  'building',
  'ingredients',
  'equipment',
  'redstone',
  'nature',
  'other',
];
export function Inventory({
  palette,
  creative,
  selected,
  recent,
  disabled,
  onSelect,
  onInteract,
}: {
  palette: string[];
  creative: boolean;
  selected: string | null;
  recent: string[];
  disabled: boolean;
  onSelect: (id: string) => void;
  onInteract: () => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState<Category | 'all'>('all'),
    [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      (creative ? items : palette.map((id) => itemById[id]).filter(Boolean)).filter(
        (item) =>
          (category === 'all' || item.category === category) &&
          item.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [palette, creative, query, category],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pages = Math.max(1, Math.ceil(filtered.length / 36)),
    current = Math.min(page, pages - 1);
  return (
    <section className="inventory" aria-label="Ingredient inventory">
      <div className="section-line">
        <h2>{creative ? 'Creative inventory' : 'Your ingredients'}</h2>
        <span className="small">Unlimited supply</span>
      </div>
      <div className="inventory-tools">
        <label className="search">
          <span className="sr-only">Search ingredients</span>
          <input
            data-testid="inventory-search"
            type="search"
            placeholder="Search ingredients…"
            value={query}
            disabled={disabled}
            onFocus={onInteract}
            onChange={(event) => {
              onInteract();
              setQuery(event.target.value);
              setPage(0);
            }}
          />
          <span aria-hidden="true">⌕</span>
        </label>
        {creative && (
          <button
            className="button compact inventory-filter-toggle"
            aria-label="Filter inventory by category"
            aria-expanded={filtersOpen}
            aria-controls="inventory-categories"
            disabled={disabled}
            onClick={() => {
              onInteract();
              setFiltersOpen((value) => !value);
            }}
          >
            Filter
          </button>
        )}
      </div>
      {creative && (
        <div
          id="inventory-categories"
          className={`category-tabs ${filtersOpen ? 'filters-open' : ''}`}
          aria-label="Item categories"
        >
          {categories.map((value) => (
            <button
              key={value}
              disabled={disabled}
              data-testid={`category-${value}`}
              aria-pressed={category === value}
              onClick={() => {
                onInteract();
                setCategory(value);
                setPage(0);
              }}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      <div className="inventory-content">
        <div className="inventory-slots" data-testid="inventory">
          {filtered.slice(current * 36, current * 36 + 36).map((item) => (
            <ItemSlot
              key={item.id}
              id={item.id}
              selected={selected === item.id}
              disabled={disabled}
              testId={`ingredient-${item.id}`}
              onInteract={onInteract}
              onClick={() => {
                onSelect(item.id);
                if (
                  window.matchMedia('(pointer: coarse)').matches &&
                  document.activeElement instanceof HTMLInputElement
                ) {
                  document.activeElement.blur();
                }
              }}
            />
          ))}
        </div>
        {!filtered.length && <p className="empty">No ingredients found. Try another search.</p>}
        {pages > 1 && (
          <div className="pagination">
            <button
              className="button compact"
              disabled={disabled || !current}
              onClick={() => {
                onInteract();
                setPage(current - 1);
              }}
              aria-label="Previous inventory page"
            >
              ←
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              className="button compact"
              disabled={disabled || current + 1 >= pages}
              onClick={() => {
                onInteract();
                setPage(current + 1);
              }}
              aria-label="Next inventory page"
            >
              →
            </button>
          </div>
        )}
        {creative && recent.length > 0 && (
          <>
            <h3 className="small">Recently used</h3>
            <div className="hotbar">
              {recent.map((id) => (
                <ItemSlot
                  key={id}
                  id={id}
                  disabled={disabled}
                  selected={selected === id}
                  onInteract={onInteract}
                  onClick={() => onSelect(id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <p className="inventory-help">
        Select an ingredient, then place it in the grid. Desktop: drag to place · Right-click or
        Delete to remove.
      </p>
    </section>
  );
}

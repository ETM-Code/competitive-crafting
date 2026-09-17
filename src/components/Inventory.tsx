import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { itemById } from '../shared/catalogue';
import creativeData from '../data/creative-tabs.json' with { type: 'json' };
import { ItemImage, ItemSlot } from './ItemSlot';

export function Inventory({
  palette,
  creative,
  selected,
  recent,
  disabled,
  onSelect,
  onSearchModeChange,
}: {
  palette: string[];
  creative: boolean;
  selected: string | null;
  recent: string[];
  disabled: boolean;
  onSelect: (id: string) => void;
  onSearchModeChange: (searching: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(creativeData.tabs[0]?.id ?? 'search');
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [keyboard, setKeyboard] = useState(
    document.documentElement.dataset.keyboardOpen === 'true',
  );
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const tabs = useRef<HTMLDivElement>(null);
  const key = `${tab}:${query}`;
  const rememberScroll = () => {
    if (scroller.current) positions.current.set(key, scroller.current.scrollTop);
  };
  const chooseTab = (id: string) => {
    rememberScroll();
    setTab(id);
    setQuery('');
  };
  useEffect(() => {
    if (keyboard && focused) setSearching(true);
  }, [keyboard, focused]);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setKeyboard(document.documentElement.dataset.keyboardOpen === 'true'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-keyboard-open'],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => onSearchModeChange(searching), [searching, onSearchModeChange]);
  const filtered = useMemo(() => {
    const ids = !creative
      ? palette
      : query.trim() || tab === 'search'
        ? creativeData.search
        : (creativeData.tabs.find((entry) => entry.id === tab)?.items ?? []);
    const text = query.trim().toLocaleLowerCase();
    return ids
      .map((id) => itemById[id])
      .filter((item) => item && (!text || item.name.toLocaleLowerCase().includes(text)));
  }, [creative, palette, query, tab]);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = positions.current.get(key) ?? 0;
  }, [key]);
  return (
    <section
      className={`ingredient-panel ${searching ? 'search-mode' : ''}`}
      aria-label="Ingredient inventory"
    >
      <div className="ingredient-search-row">
        <label className="ingredient-search">
          <span className="sr-only">Search ingredients</span>
          <input
            ref={input}
            id="inventory-search"
            data-testid="inventory-search"
            type="search"
            placeholder={creative ? 'Search every item…' : 'Search ingredients…'}
            value={query}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              rememberScroll();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                input.current?.blur();
                setSearching(false);
              }
            }}
          />
        </label>
        <button
          className="button ingredient-search-done"
          data-testid="inventory-search-done"
          onClick={() => {
            input.current?.blur();
            setFocused(false);
            setSearching(false);
          }}
          hidden={!searching}
        >
          Done
        </button>
      </div>
      {creative && (
        <div
          ref={tabs}
          className="creative-tabs"
          role="tablist"
          aria-label="Creative inventory categories"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
            ];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
                    buttons.length;
            buttons[next].focus();
            buttons[next].click();
          }}
        >
          {creativeData.tabs.map((entry) => (
            <button
              key={entry.id}
              className="creative-tab"
              role="tab"
              aria-selected={tab === entry.id && !query}
              tabIndex={tab === entry.id && !query ? 0 : -1}
              aria-controls="creative-items"
              aria-label={entry.label}
              title={entry.label}
              disabled={disabled}
              data-testid={`category-${entry.id}`}
              onClick={() => chooseTab(entry.id)}
            >
              <ItemImage id={entry.icon} />
              <span>{entry.label}</span>
            </button>
          ))}
          <button
            className="creative-tab"
            role="tab"
            aria-selected={tab === 'search' || !!query}
            tabIndex={tab === 'search' || query ? 0 : -1}
            aria-controls="creative-items"
            aria-label="All items"
            title="All items"
            disabled={disabled}
            data-testid="category-search"
            onClick={() => chooseTab('search')}
          >
            <span aria-hidden="true">⌕</span>
            <span>All items</span>
          </button>
        </div>
      )}
      <div
        className="ingredient-scroll inventory-content"
        id="creative-items"
        role={creative ? 'tabpanel' : undefined}
        ref={scroller}
        tabIndex={0}
        aria-label="Scrollable ingredients"
        onScroll={(event) => positions.current.set(key, event.currentTarget.scrollTop)}
      >
        <div className="ingredient-slots" data-testid="inventory">
          {filtered.map((item) => (
            <ItemSlot
              key={item.id}
              id={item.id}
              selected={selected === item.id}
              disabled={disabled}
              lazy
              testId={`ingredient-${item.id}`}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>
        {!filtered.length && (
          <p className="ingredient-empty">No ingredients found. Try another search.</p>
        )}
        {creative && recent.length > 0 && (
          <div className="ingredient-recent">
            <h3>Recently used</h3>
            <div className="ingredient-slots">
              {recent.map((id) => (
                <ItemSlot
                  key={id}
                  id={id}
                  selected={selected === id}
                  disabled={disabled}
                  lazy
                  onClick={() => onSelect(id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

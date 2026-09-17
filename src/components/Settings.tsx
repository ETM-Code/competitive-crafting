import { PRESETS } from '../shared/rules';
import type { Settings as GameSettings, Preset } from '../shared/types';
export function Settings({
  value,
  disabled,
  onChange,
}: {
  value: GameSettings;
  disabled: boolean;
  onChange: (value: GameSettings) => void;
}) {
  const update = <K extends keyof GameSettings>(key: K, next: GameSettings[K]) =>
    onChange({ ...value, [key]: next });
  const base = PRESETS[value.preset];
  const custom = (Object.keys(base) as (keyof GameSettings)[]).some(
    (key) => base[key] !== value[key],
  );
  return (
    <fieldset className="settings" disabled={disabled}>
      <legend>World rules</legend>
      <div className="preset-tabs">
        {(['classic', 'blitz', 'all-finish'] as Preset[]).map((preset) => (
          <button
            type="button"
            className={`button ${!custom && value.preset === preset ? 'active' : ''}`}
            data-testid={`preset-${preset}`}
            key={preset}
            aria-pressed={!custom && value.preset === preset}
            onClick={() => onChange({ ...PRESETS[preset] })}
          >
            {preset.replace('-', ' ')}
          </button>
        ))}
      </div>
      {custom && (
        <p className="small custom-rules" role="status">
          Custom rules · based on {value.preset.replace('-', ' ')}
        </p>
      )}
      <div className="settings-fields">
        <label>
          Inventory
          <select
            data-testid="setting-inventory"
            value={value.inventory}
            onChange={(e) => update('inventory', e.target.value as GameSettings['inventory'])}
          >
            <option value="constrained">Supplies</option>
            <option value="creative">Creative</option>
          </select>
        </label>
        <label>
          Difficulty
          <select
            data-testid="setting-difficulty"
            value={value.difficulty}
            onChange={(e) => update('difficulty', e.target.value as GameSettings['difficulty'])}
          >
            <option value="progressive">Progressive</option>
            <option value="easy">Familiar</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        <label>
          Rounds
          <input
            data-testid="setting-rounds"
            type="number"
            min="3"
            max="10"
            value={value.rounds}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 3 && n <= 10) update('rounds', n);
            }}
          />
        </label>
        <label>
          Base timer · seconds
          <input
            data-testid="setting-seconds"
            type="number"
            min="15"
            max="180"
            value={value.seconds}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 15 && n <= 180) update('seconds', n);
            }}
          />
        </label>
        {value.inventory === 'constrained' && (
          <label>
            Distractor ingredients
            <input
              data-testid="setting-distractors"
              type="number"
              min="0"
              max="24"
              value={value.distractors}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 24) update('distractors', n);
              }}
            />
          </label>
        )}
        <label>
          Scoring
          <select
            data-testid="setting-scoring"
            value={value.scoring}
            onChange={(e) => update('scoring', e.target.value as GameSettings['scoring'])}
          >
            <option value="winner">First finish</option>
            <option value="all-finish">All finish</option>
          </select>
        </label>
      </div>
      <label className="checkbox">
        <input
          data-testid="setting-hints"
          type="checkbox"
          checked={value.hints}
          onChange={(e) => update('hints', e.target.checked)}
        />{' '}
        Show recipe hints
      </label>
      <p className="small">
        {value.scoring === 'winner'
          ? 'The first valid craft collected wins the round.'
          : 'Finishers earn 100%, 75%, 50%, then 45%, 40%… (minimum 20%) of the round points.'}{' '}
        Harder rounds are worth more.{' '}
        {value.inventory === 'creative'
          ? 'Creative adds 2 seconds per occupied recipe slot to the base timer.'
          : 'Recipe supplies use the base timer with no extra time.'}{' '}
        Overclock halves that total time for 1.5× points. The server receives and orders all crafts.
      </p>
    </fieldset>
  );
}

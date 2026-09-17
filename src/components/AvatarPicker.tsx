import { useId, useRef } from 'react';
import { Avatar, AVATARS, AVATAR_NAMES } from './Scoreboard';
import '../styles/avatar-picker.css';

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const description = useId();
  const selected = AVATARS.includes(value) ? value : 'creeper';

  return (
    <div className="avatar-choice">
      <button
        ref={trigger}
        type="button"
        className="avatar-choice-trigger"
        data-testid="avatar-picker-trigger"
        aria-label={`Choose avatar, current: ${AVATAR_NAMES[selected]}`}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          const choice = dialog.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
          choice?.focus({ preventScroll: true });
          choice?.scrollIntoView({ block: 'nearest' });
        }}
      >
        <Avatar value={selected} />
        <span>
          <small>Your avatar</small>
          <strong>{AVATAR_NAMES[selected]}</strong>
        </span>
        <span className="avatar-choice-change" aria-hidden="true">
          Change →
        </span>
      </button>
      <dialog
        ref={dialog}
        className="avatar-choice-dialog"
        data-testid="avatar-picker-dialog"
        aria-labelledby={heading}
        aria-describedby={description}
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          // Safari can omit buttons from native tab order; keep every dialog action reachable.
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
          );
          const index = buttons.findIndex((button) => button === document.activeElement);
          const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
          event.preventDefault();
          buttons[next]?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            event.currentTarget.close();
        }}
      >
        <header className="avatar-choice-heading">
          <div>
            <span className="eyebrow">Make an entrance</span>
            <h2 id={heading}>Choose your face</h2>
          </div>
          <button
            type="button"
            className="button avatar-choice-close"
            data-testid="close-avatar-picker"
            aria-label="Close avatar picker"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="avatar-choice-grid" role="group" aria-label="Player avatars">
          {AVATARS.map((avatar) => (
            <button
              type="button"
              key={avatar}
              className="avatar-choice-option"
              aria-label={`${avatar.replaceAll('_', ' ')} avatar`}
              aria-pressed={selected === avatar}
              onClick={() => {
                onChange(avatar);
                dialog.current?.close();
              }}
            >
              <Avatar value={avatar} />
              <span>{AVATAR_NAMES[avatar]}</span>
              {selected === avatar && (
                <span className="avatar-choice-tick" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
        <p id={description} className="avatar-choice-note">
          Twelve faces for your party. Herobrine is a fan-made Steve homage.
        </p>
      </dialog>
    </div>
  );
}

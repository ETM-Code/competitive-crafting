import { useRef } from 'react';
import '../styles/room-qr.css';

export function RoomQr({ src, code }: { src: string; code: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="room-qr-trigger"
        data-testid="expand-room-qr"
        aria-label={`Show larger QR code for room ${code}`}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <img
          className="qr"
          data-testid="room-qr"
          src={src}
          width="144"
          height="144"
          alt={`Scan to join room ${code}`}
        />
        <span aria-hidden="true">Tap to enlarge ↗</span>
      </button>
      <dialog
        ref={dialog}
        className="room-qr-dialog"
        data-testid="room-qr-dialog"
        aria-labelledby="room-qr-heading"
        aria-describedby="room-qr-instructions"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
          }
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
        <header>
          <span className="eyebrow">Bring your party</span>
          <h2 id="room-qr-heading">
            Join room <strong>{code}</strong>
          </h2>
          <p id="room-qr-instructions">Scan with your phone camera.</p>
        </header>
        <img
          className="room-qr-large"
          data-testid="expanded-room-qr"
          src={src}
          width="768"
          height="768"
          alt={`Scan to join room ${code}`}
        />
        <button
          type="button"
          className="button primary"
          data-testid="close-room-qr"
          onClick={() => dialog.current?.close()}
          autoFocus
        >
          Back to lobby
        </button>
      </dialog>
    </>
  );
}

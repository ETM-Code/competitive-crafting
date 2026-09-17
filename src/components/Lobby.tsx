import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { copyText } from '../lib/clipboard';
import type { ClientMessage, RoomSnapshot, Session } from '../shared/types';
import { Settings } from './Settings';
import { Scoreboard } from './Scoreboard';
import { ItemImage } from './ItemSlot';
import { RoomQr } from './RoomQr';
export function Lobby({
  room,
  session,
  send,
  connected,
}: {
  room: RoomSnapshot;
  session: Session;
  send: (message: ClientMessage) => boolean;
  connected: boolean;
}) {
  const [qr, setQr] = useState(''),
    [copied, setCopied] = useState(''),
    [panel, setPanel] = useState<'party' | 'rules'>('party');
  const url = `${location.origin}/join/${room.code}`;
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, {
      width: 768,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#202725', light: '#f2eddc' },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [url]);
  const me = room.players.find((p) => p.id === session.playerId),
    host = room.hostId === session.playerId;
  const activePlayers = room.players.filter((p) => p.connected && !p.spectator);
  const ready = activePlayers.filter((p) => p.ready).length;
  const copy = async (value: string, label: string) => {
    const success = await copyText(value);
    setCopied(
      success ? `${label} copied` : 'Copy unavailable. Select and copy the room link below.',
    );
    if (!success) {
      const link = document.getElementById('room-link') as HTMLInputElement | null;
      link?.focus();
      link?.select();
    }
  };
  return (
    <div className="window lobby-window" data-testid="lobby">
      <header className="window-heading">
        <ItemImage id="crafting_table" />
        <div>
          <span className="eyebrow">
            {room.practice ? 'A little practice goes a long way' : 'Good company. Great crafting.'}
          </span>
          <h1>{room.practice ? 'Your practice world' : 'The crafting lobby'}</h1>
          <p>Gather your friends. Put your crafting knowledge to the test.</p>
        </div>
      </header>
      <nav className="lobby-panel-tabs" aria-label="Lobby panels">
        <button
          className={`button ${panel === 'party' ? 'active' : ''}`}
          data-testid="lobby-party-tab"
          aria-pressed={panel === 'party'}
          onClick={() => setPanel('party')}
        >
          Party & invite
        </button>
        <button
          className={`button ${panel === 'rules' ? 'active' : ''}`}
          data-testid="lobby-rules-tab"
          aria-pressed={panel === 'rules'}
          onClick={() => setPanel('rules')}
        >
          World rules
        </button>
      </nav>
      <div className="lobby-columns" data-panel={panel}>
        <div className="lobby-party-panel">
          <Scoreboard players={room.players} me={session.playerId} hostId={room.hostId} lobby />
          {!room.practice && (
            <section className="invite">
              <div>
                <span className="eyebrow">Invite your party</span>
                <button
                  className="room-code"
                  data-testid="copy-code"
                  onClick={() => void copy(room.code, 'Room code')}
                  aria-label={`Copy room code ${room.code}`}
                >
                  {room.code}
                </button>
                <label className="sr-only" htmlFor="room-link">
                  Room invitation link
                </label>
                <input
                  id="room-link"
                  data-testid="room-link"
                  value={url}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="button"
                  data-testid="copy-link"
                  onClick={() => void copy(url, 'Invite link')}
                >
                  Copy invite link
                </button>
              </div>
              {qr && <RoomQr src={qr} code={room.code} />}
              <p className="small" role="status" data-testid="copy-status">
                {copied || 'Join with the code, link, or QR.'}
              </p>
            </section>
          )}
        </div>
        <div className="lobby-rules-panel">
          <Settings
            value={room.settings}
            disabled={!host || !connected}
            onChange={(settings) => send({ type: 'settings', settings })}
          />
        </div>
      </div>
      <footer className="lobby-actions">
        <p>
          {host
            ? `${ready} ready · ${room.practice ? '1 crafter' : '2 connected, ready crafters'} needed to start`
            : 'The host will start when everyone is ready.'}
        </p>
        <button
          className={`button ${me?.ready ? '' : 'primary'}`}
          data-testid="ready-button"
          disabled={!connected || me?.spectator}
          onClick={() => send({ type: 'ready', ready: !me?.ready })}
        >
          {me?.ready ? 'Not ready' : 'Ready to craft'}
        </button>
        {host && (
          <button
            className="button primary"
            data-testid="start-button"
            disabled={
              !connected || ready < (room.practice ? 1 : 2) || ready !== activePlayers.length
            }
            onClick={() => send({ type: 'start' })}
          >
            Start {room.practice ? 'practice' : 'match'} <span aria-hidden="true">→</span>
          </button>
        )}
      </footer>
    </div>
  );
}

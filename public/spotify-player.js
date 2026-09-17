// Spotify's current official API bundle uses eval. Its policy is isolated to this document.
(() => {
  const channel = 'crafting-spotify';
  let controller;
  let enabled = true;
  let initialized = false;
  let timeout;
  const send = (type, data = {}) => parent.postMessage({ channel, type, ...data }, location.origin);
  const fail = () => {
    clearTimeout(timeout);
    send('error');
  };
  const validURI = (value) =>
    typeof value === 'string' && /^spotify:track:[A-Za-z0-9]{22}$/.test(value);

  window.addEventListener('message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.channel !== channel
    )
      return;
    const message = event.data;
    if (message.type === 'init' && !initialized && validURI(message.uri)) {
      initialized = true;
      enabled = message.enabled === true;
      timeout = setTimeout(fail, 10000);
      window.onSpotifyIframeApiReady = (api) => {
        try {
          api.createController(
            document.getElementById('player'),
            { uri: message.uri, width: '100%', height: 152 },
            (embed) => {
              controller = embed;
              // The SDK defaults to lazy loading; hidden menus must still prepare the player.
              document.querySelectorAll('iframe').forEach((frame) => {
                frame.loading = 'eager';
              });
              embed.addListener('ready', () => {
                clearTimeout(timeout);
                if (!enabled) embed.pause();
                send('ready');
              });
              embed.addListener('playback_update', (event) => {
                if (!enabled && !event.data.isPaused) {
                  embed.pause();
                  return;
                }
                send('playback', {
                  isPaused: event.data.isPaused,
                  isBuffering: event.data.isBuffering,
                  playingURI:
                    typeof event.data.playingURI === 'string' ? event.data.playingURI : undefined,
                });
              });
            },
          );
        } catch {
          fail();
        }
      };
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      script.onerror = fail;
      document.head.appendChild(script);
    } else if (message.type === 'sound') {
      enabled = message.enabled === true;
      if (!enabled) controller?.pause();
    } else if (message.type === 'play' && enabled) {
      controller?.play();
    } else if (message.type === 'pause') {
      controller?.pause();
    } else if (message.type === 'load' && validURI(message.uri)) {
      controller?.loadUri(message.uri);
    }
  });
  send('loaded');
})();

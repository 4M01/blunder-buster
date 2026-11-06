/* Blunder Buster - install / offline support */
(function () {
  'use strict';
  const BB = window.BB;
  const isHttp = /^https?:$/.test(location.protocol);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  const hidden = () => { try { return localStorage.getItem('bb.pwaHide') === '1'; } catch (e) { return false; } };

  // Anonymous usage counting (GoatCounter: no cookies, no IP storage, country-level only).
  // Counts visits plus one "active-minute" event per minute someone is really using the app.
  // Skipped on localhost / file:// and when the browser sends Do Not Track.
  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (isHttp && !localHost && !dnt) {
    const gc = document.createElement('script');
    gc.async = true;
    gc.src = 'https://gc.zgo.at/count.js';
    gc.setAttribute('data-goatcounter', 'https://blunder-buster.goatcounter.com/count');
    document.head.appendChild(gc);
  }
  BB.heartbeat = () => {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'active-minute', title: 'Active minute', event: true }); } catch (e) { /* ignore */ }
    try { if (window.posthog && window.posthog.capture) window.posthog.capture('active_minute'); } catch (e) { /* ignore */ }
  };

  // Offline support (needs https or localhost; does nothing when opened as a plain file)
  if (isHttp && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) BB.toast('✨ Updated! Reload to get the newest version.');
          });
        });
      }).catch(() => { /* offline mode is optional */ });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show(); });
  window.addEventListener('appinstalled', () => { deferred = null; const c = document.getElementById('pwaCard'); if (c) c.remove(); BB.toast('📲 Installed! Find Blunder Buster on your home screen.'); });

  function show() {
    if (standalone() || hidden() || !document.querySelector('.hero') || document.getElementById('pwaCard')) return;
    if (!deferred && !ios()) return;
    const card = document.createElement('div');
    card.className = 'card quest'; card.id = 'pwaCard'; card.style.marginBottom = '16px';
    card.innerHTML = deferred
      ? `<div><h3>📲 Install Blunder Buster</h3><div style="color:var(--muted)">Add it to your home screen. It opens full-screen and works without internet.</div></div>
         <div class="controls"><button class="big green" data-act="pwainstall">Install</button><button class="ghost" data-act="pwahide">Not now</button></div>`
      : `<div><h3>📲 Add to your home screen</h3><div style="color:var(--muted)">Tap the <b>Share</b> button (square with an arrow), then <b>Add to Home Screen</b>. It will work without internet.</div></div>
         <div class="controls"><button class="ghost" data-act="pwahide">Got it</button></div>`;
    document.getElementById('app').insertBefore(card, document.getElementById('app').firstChild);
  }
  BB.afterHome = show;
  BB.handlers.pwainstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) { /* ignore */ }
    deferred = null;
    const c = document.getElementById('pwaCard'); if (c) c.remove();
  };
  BB.handlers.pwahide = () => {
    try { localStorage.setItem('bb.pwaHide', '1'); } catch (e) { /* ignore */ }
    const c = document.getElementById('pwaCard'); if (c) c.remove();
  };
  show();
})();

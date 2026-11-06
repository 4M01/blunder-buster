/* Blunder Buster - Phase 3: Mistakes Vault, Be the Opponent, game import */
(function () {
  'use strict';
  const C = window.Chess, BB = window.BB, PGN = window.PGN;
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const S = () => BB.S();
  const H = BB.handlers;
  const { pn, cap } = BB;
  const DAY = 864e5, GAP = [0, 1, 2, 4, 8, 16, 30]; // days until a vault position returns, by box

  const KIND = {
    moved: 'moved a piece to a square where it could be captured',
    ignored: 'ignored a threat to one of your pieces',
    weakened: 'left a piece unprotected',
    mate: 'missed a checkmate threat',
    fork: 'walked into a fork',
    pin: 'allowed a pin',
    skewer: 'allowed a skewer',
    discovered: 'allowed a discovered attack',
    double: 'allowed a double threat',
  };

  let V = null; // current practice screen
  const leave = () => { V = null; BB.sq = null; };
  const prevLeave = BB.onLeave;
  BB.onLeave = () => { if (prevLeave) prevLeave(); V = null; };

  // ---------------- shared helpers ----------------
  function dangerHTML(d) {
    const b = d.after.b, rows = [];
    const li = (arr) => (arr.length ? arr.map((i) => pn(b[i], i)).join(', ') : 'nobody');
    for (const h of d.hang) {
      rows.push(`${pn(b[h.sq], h.sq)} is attacked by ${li(h.attackers)} and protected by ${h.defenders.length ? li(h.defenders) : 'nobody'}. ${h.defenders.length ? `That wins ${h.gain} point${h.gain > 1 ? 's' : ''} in the trade.` : 'It can be taken for free!'}`);
    }
    if (d.mateThreat) rows.push('There is a <b>checkmate</b> threat!');
    return (rows.length ? `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>` : '') + BB.tacticHTML(d);
  }

  // Full screen: board on the left, panel on the right.
  function layout(o) {
    app.innerHTML = `
      <div class="game">
        <div class="boardcol"><div id="boardWrap"></div></div>
        <div class="panel">
          <div class="card"><div class="mascot-row"><div class="mascot" id="mascot">${o.icon || '🐴'}</div><div class="bubble" id="bubble">${o.say || ''}</div></div></div>
          <div class="qhead"><span>${o.title}</span><span>${o.progress || ''}</span></div>
          <div class="question card">${o.question}</div>
          ${o.explain ? `<div class="explain">${o.explain}</div>` : ''}
          <div class="controls">${o.buttons || ''}</div>
        </div>
      </div>`;
    paint();
  }
  function paint() {
    if (!V) return;
    const marks = Object.assign({}, V.marks || {}), sel = new Set();
    if (!V.locked && V.sel != null) {
      sel.add(V.sel);
      for (const d of V.dests) marks[d] = (V.st.b[d] ? 'ring' : 'dot') + (marks[d] ? ' ' + marks[d] : '');
    }
    const el = $('#boardWrap');
    if (el) el.innerHTML = BB.boardHTML(V.view || V.st, { marks, sel, flip: V.flip, clickable: !V.locked });
  }
  function squareClick(i) {
    if (!V || V.locked || !V.onMove) return true;
    const legal = C.legalMoves(V.st);
    if (V.sel != null) {
      const m = legal.find((x) => x.from === V.sel && x.to === i);
      if (m) { V.sel = null; V.dests = []; V.onMove(m); return true; }
    }
    const ch = V.st.b[i];
    if (ch && C.colorOf(ch) === V.st.turn) {
      V.sel = V.sel === i ? null : i;
      V.dests = V.sel == null ? [] : legal.filter((x) => x.from === i).map((x) => x.to);
    } else { V.sel = null; V.dests = []; }
    paint();
    return true;
  }
  function say(msg, mood) {
    const b = $('#bubble'); if (b) b.innerHTML = msg;
    const m = $('#mascot'); if (m) { m.className = 'mascot'; void m.offsetWidth; if (mood) m.classList.add(mood); }
  }
  function reward(xp) { const s = S(); s.xp += xp; BB.save(); BB.renderHeader(); }

  // ---------------- Mistakes Vault ----------------
  const isDue = (e) => !(e.due > Date.now());
  const mastered = (e) => (e.box || 0) >= 4;

  function vaultHome() {
    leave();
    const s = S(), v = s.vault, due = v.filter(isDue);
    const recent = v.slice(-6).reverse();
    app.innerHTML = `
      <div class="card"><div class="mascot-row"><div class="mascot">🏦</div><div class="bubble">Welcome to the <b>Mistakes Vault</b>! Every blunder you make in a game goes in here. Solve each one safely and it goes away for longer and longer. Beat your old mistakes!</div></div></div>
      <div class="grid2 mt">
        <div class="card"><h3>Saved</h3><div style="font-size:2rem;font-weight:800">${v.length}</div></div>
        <div class="card"><h3>Due now</h3><div style="font-size:2rem;font-weight:800;color:${due.length ? 'var(--warn)' : 'var(--good)'}">${due.length}</div></div>
        <div class="card"><h3>Mastered</h3><div style="font-size:2rem;font-weight:800;color:var(--good)">${v.filter(mastered).length}</div></div>
      </div>
      <div class="controls mt">
        ${due.length ? `<button class="big green" data-act="vpractice">Practise ${Math.min(due.length, 8)} now ▶</button>` : (v.length ? '<button class="big green" data-act="vpractice" data-any="1">Nothing due. Practise anyway ▶</button>' : '')}
        <button class="big amber" data-act="importgames">📥 Import real games</button><button class="ghost" data-act="home">Home</button>
      </div>
      ${recent.length ? `<h2 class="mt">Latest mistakes</h2><div class="card">${recent.map((e) => `<div style="padding:5px 0">${e.src === 'chess.com' ? '🌐' : '🎮'} Move ${e.no || '?'}: <b>${e.san}</b> <span style="color:var(--muted)">${e.kind ? KIND[e.kind] : 'let the opponent win material'}${e.punished === false ? ' (the opponent missed it!)' : ''}</span> ${'●'.repeat(Math.min(e.box || 0, 6))}${'○'.repeat(6 - Math.min(e.box || 0, 6))}</div>`).join('')}</div>` : '<div class="card mt">The vault is empty. Play the bot or import a game to fill it!</div>'}`;
  }
  H.vault = vaultHome;

  H.vpractice = (t) => {
    const s = S();
    let q = s.vault.filter(isDue);
    if (!q.length || (t && t.dataset.any)) q = s.vault.slice();
    q.sort((a, b) => (a.box || 0) - (b.box || 0) || (a.due || 0) - (b.due || 0));
    q = q.slice(0, 8);
    if (!q.length) return vaultHome();
    V = { kind: 'vault', queue: q, qi: 0, ok: 0, xp: 0 };
    BB.sq = squareClick;
    vaultItem();
  };

  function vaultItem() {
    const e = V.queue[V.qi];
    const st = C.fromFEN(e.fen);
    Object.assign(V, { e, st, view: null, marks: {}, sel: null, dests: [], locked: false, tries: 0, flip: st.turn === 'b', onMove: vaultTry });
    layout({
      icon: '🏦', title: '🏦 Mistakes Vault', progress: `${V.qi + 1} / ${V.queue.length}`,
      say: 'Think like the opponent before you move!',
      question: `Move ${e.no || '?'}: you once played <b>${e.san}</b> here, and it ${e.kind ? KIND[e.kind] : 'let the opponent win material'}. Find a move that is <b>safe</b>. ${st.turn === 'b' ? '<br><small>You are Black. The board is turned so your pieces are at the bottom.</small>' : ''}`,
    });
  }

  function vaultTry(m) {
    const e = V.e, before = V.st;
    const d = C.dangerAfter(before, m);
    const sameBad = m.from === e.from && m.to === e.to;
    V.tries++;
    V.locked = true; V.view = d.after;
    V.marks = { [m.from]: 'from', [m.to]: 'to' };
    if (!d.squares.length) {
      const first = V.tries === 1;
      const xp = first ? 12 : 6;
      e.box = first ? Math.min(6, (e.box || 0) + 1) : e.box || 0;
      e.due = Date.now() + (first ? GAP[e.box] : 1) * DAY;
      V.ok++; V.xp += xp; S().vaultDone++; reward(xp); BB.sndGood(); BB.logAnswer(true);
      if (e.box >= 4 && first) BB.confetti();
      layout({ icon: '🏦', title: '🏦 Mistakes Vault', progress: `${V.qi + 1} / ${V.queue.length}`, say: BB.rnd(BB.MSG.ok),
        question: `Safe! <b>${C.san(before, m)}</b> works.`,
        explain: `✅ Nothing can be won after that move. +${xp} XP<div class="tip">${first ? (e.box >= 4 ? 'This mistake is mastered! It will rarely come back.' : `You will see this one again in ${GAP[e.box]} day${GAP[e.box] > 1 ? 's' : ''}.`) : 'You needed a second try, so it comes back tomorrow.'}</div>`,
        buttons: vaultNextBtn() });
    } else {
      BB.sndBad(); if (V.tries === 1) BB.logAnswer(false);
      for (const q of d.squares) V.marks[q] = 'miss';
      const final = V.tries >= 2;
      let tip = '';
      if (final) {
        e.box = 0; e.due = Date.now() + DAY;
        const safe = C.candidateMoves(before).find((x) => !C.dangerAfter(before, x).squares.length);
        tip = safe ? `<div class="tip">A safe idea was <b>${C.san(before, safe)}</b>. It comes back tomorrow.</div>` : '<div class="tip">It comes back tomorrow.</div>';
      }
      layout({ icon: '🏦', title: '🏦 Mistakes Vault', progress: `${V.qi + 1} / ${V.queue.length}`, say: final ? 'That one is tough. We will practise it again!' : 'Careful! Look at the red squares.',
        question: sameBad ? 'That is the same move that went wrong in your game!' : `<b>${C.san(before, m)}</b> still lets the opponent win something.`,
        explain: `❌ ${dangerHTML(d)}${tip}`,
        buttons: final ? vaultNextBtn() : '<button class="big green" data-act="vretry">↩ Try again</button>' });
    }
    BB.save();
  }
  const vaultNextBtn = () => `<button class="big green" data-act="vnext">${V.qi + 1 >= V.queue.length ? 'Finish ▶' : 'Next ▶'}</button>`;
  H.vretry = () => {
    const e = V.e, st = V.st;
    Object.assign(V, { view: null, marks: {}, locked: false, sel: null, dests: [] });
    layout({ icon: '🏦', title: '🏦 Mistakes Vault', progress: `${V.qi + 1} / ${V.queue.length}`, say: 'One more try. Ask: what can they capture?',
      question: `Move ${e.no || '?'}: find a <b>safe</b> move. (One more try!)` });
  };
  H.vnext = () => {
    V.qi++;
    if (V.qi >= V.queue.length) {
      const done = V;
      BB.sq = null; V = null; BB.awardBadges();
      app.innerHTML = `<div class="card center"><div class="mascot" style="margin:auto">🏦</div><h1>Vault session done!</h1>
        <p style="font-size:1.2rem">You solved <b>${done.ok}</b> of <b>${done.queue.length}</b> safely and earned <b>+${done.xp} XP</b>.</p>
        <div class="controls" style="justify-content:center"><button class="big green" data-act="vault">Back to the vault</button><button class="ghost" data-act="home">Home</button></div></div>`;
      return;
    }
    vaultItem();
  };

  // ---------------- Be the Opponent ----------------
  H.oppstart = () => { BB.sq = squareClick; oppItem(); };
  function oppItem() {
    let item = null;
    for (let k = 0; k < 5 && !item; k++) item = C.gen.safe(C.mulberry32(C.hashStr(`${Date.now()}:${Math.random()}`)));
    const j = item.judged, after = j.after;
    V = { kind: 'opp', item, st: after, view: null, marks: { [item.move.from]: 'from', [item.move.to]: 'to' }, sel: null, dests: [], locked: false, tries: 0, flip: false, onMove: oppTry };
    layout({ icon: '🥷', title: '🥷 Be the Opponent', progress: `🔥 ${S().row} in a row`, say: 'Switch sides! Now YOU are Black.',
      question: `<span class="sidepieces"><b>White</b> just played ${C.san(item.st, item.move)} (${C.NAME[C.typeOf(item.st.b[item.move.from])]} to ${C.sqName(item.move.to)}).</span><br>You are <b>Black</b>. Can you <b>win material</b>? Make the capture, or press the button if there is nothing to win.`,
      buttons: '<button class="big amber" data-act="onothing">✋ Nothing to win</button>' });
  }
  function oppEnd(correct, explain, replay) {
    const s = S(), st = s.stats.opp; st.a++;
    let xp = 3;
    if (correct) { st.c++; s.row++; if (s.row > s.bestRow) s.bestRow = s.row; xp = 10 + Math.min(s.row, 5) * 2; } else s.row = 0;
    s.xp += xp; BB.logAnswer(correct); BB.save(); BB.renderHeader(); BB.awardBadges();
    if (correct) BB.sndGood(); else BB.sndBad();
    V.locked = true;
    layout({ icon: '🥷', title: '🥷 Be the Opponent', progress: `🔥 ${s.row} in a row`, say: correct ? BB.rnd(BB.MSG.ok) : BB.rnd(BB.MSG.no),
      question: `${correct ? '✅ Correct!' : '❌ Not quite.'} +${xp} XP`, explain: explain + '<div class="tip">Habit: after your move, imagine the opponent doing exactly this!</div>',
      buttons: '<button class="big green" data-act="oppstart">Next ▶</button><button class="ghost" data-act="home">Home</button>' });
  }
  function oppReveal() {
    const j = V.item.judged, r = j.refute;
    if (!j.blunder) return `Nothing could be won here: every white piece was safe.`;
    const rm = C.legalMoves(V.st).find((x) => x.from === r.move.from && x.to === r.move.to);
    if (rm) { V.view = C.applyMove(V.st, rm); V.marks = { [rm.from]: 'from', [rm.to]: 'target' }; }
    return `The winning idea: ${pn(r.mover, r.move.from)} captures ${pn(r.victim, r.victimSq)}. ${r.defenders ? 'It was protected, but the trade still wins material.' : 'It was not protected at all!'}`;
  }
  function oppTry(m) {
    const j = V.item.judged;
    V.tries++;
    const capture = !!V.st.b[m.to] || m.ep;
    const pv = capture ? C.pvLine(V.st.b, m.to, 'b', m.from) : null;
    if (j.blunder && pv && pv.net > 0) {
      V.view = C.applyMove(V.st, m); V.marks = { [m.from]: 'from', [m.to]: 'to' };
      const r = j.refute;
      return oppEnd(true, `You win ${pv.net} point${pv.net > 1 ? 's' : ''} with that capture! ${pn(r.victim, r.victimSq)} ${r.defenders ? 'was protected, but the trade still wins material' : 'was not protected at all'}.`);
    }
    if (V.tries < 2 && j.blunder) {
      V.sel = null; V.dests = []; BB.sndBad();
      say(capture ? 'That capture loses material. Count attackers and defenders!' : 'That does not win anything yet. Look for an unprotected piece.', 'sad');
      paint(); return;
    }
    const why = j.blunder ? (capture ? 'That capture does not come out ahead.' : 'That move does not win anything.') : 'There was nothing to win here, so moving was a gamble.';
    oppEnd(false, `${why} ${oppReveal()}`);
  }
  H.onothing = () => {
    if (!V || V.kind !== 'opp' || V.locked) return;
    const j = V.item.judged;
    if (!j.blunder) oppEnd(true, 'Right! Every white piece was safe. Knowing when there is nothing to win is a skill too.');
    else oppEnd(false, `There WAS something to win. ${oppReveal()}`);
  };

  // ---------------- Import games ----------------
  H.importgames = () => {
    leave();
    app.innerHTML = `
      <div class="card"><div class="mascot-row"><div class="mascot">📥</div><div class="bubble">Let us find where pieces were lost in <b>real games</b>! Type your chess.com name and fetch your latest games, or paste PGN from any game.</div></div></div>
      <div class="card mt"><h3>Option 1 · chess.com</h3>
        <div class="controls"><input id="impUser" placeholder="chess.com username" value="${(S().username || '').replace(/"/g, '')}" style="font:inherit;padding:10px 14px;border-radius:12px;border:2px solid #cfd4ee;min-width:220px">
        <button class="big green" data-act="impfetch">Fetch my latest games</button></div>
        <div style="color:var(--muted);margin-top:6px;font-size:.9rem">Uses chess.com's public game list. Only the name you type is sent. If it does not work, use option 2.</div></div>
      <div class="card mt"><h3>Option 2 · paste PGN</h3>
        <textarea id="impPgn" rows="7" placeholder="Paste one or more games in PGN format here..." style="width:100%;font:inherit;border-radius:12px;border:2px solid #cfd4ee;padding:10px"></textarea>
        <div class="controls mt"><label>If my name is not in the game I played: <select id="impSide" style="font:inherit;padding:6px"><option value="w">White</option><option value="b">Black</option></select></label>
        <button class="big" data-act="imprun">Find my mistakes 🔎</button></div>
        <label style="display:block;margin-top:10px"><input type="checkbox" id="impRescan"> Re-check games I already imported <span style="color:var(--muted)">(use after turning the Advanced mistake catcher on)</span></label>
        <div style="margin-top:6px;color:var(--muted);font-size:.9rem">Advanced mistake catcher: <b>${S().advanced ? 'ON 🧠' : 'OFF'}</b> (change it in the Parent area)</div></div>
      <div id="impOut" class="mt"></div>
      <div class="controls mt"><button class="ghost" data-act="vault">⬅ Vault</button><button class="ghost" data-act="home">Home</button></div>`;
  };

  H.impfetch = async () => {
    const user = ($('#impUser').value || '').trim();
    const out = $('#impOut');
    if (!user) { out.innerHTML = '<div class="card">Type your chess.com username first.</div>'; return; }
    S().username = user; BB.save();
    out.innerHTML = '<div class="card">Fetching games... ⏳</div>';
    try {
      const u = encodeURIComponent(user.toLowerCase());
      const arch = await (await fetchOk(`https://api.chess.com/pub/player/${u}/games/archives`)).json();
      const urls = (arch.archives || []).slice(-2);
      if (!urls.length) throw new Error('no games');
      let games = [];
      for (const url of urls) { const j = await (await fetchOk(url)).json(); games = games.concat((j.games || []).filter((g) => g.rules === 'chess' && g.pgn)); }
      games = games.slice(-15);
      if (!games.length) throw new Error('no games');
      $('#impPgn').value = games.map((g) => g.pgn).join('\n\n');
      await runImport();
    } catch (err) {
      out.innerHTML = `<div class="card">😕 Could not get games from chess.com (wrong name, no internet, or the site blocked it). You can paste a PGN below instead.<br><small style="color:var(--muted)">${String(err.message || err)}</small></div>`;
    }
  };
  async function fetchOk(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r; }
  H.imprun = () => runImport();

  async function runImport() {
    const out = $('#impOut'), s = S();
    const user = ($('#impUser').value || '').trim(); s.username = user;
    const fallback = $('#impSide').value;
    const games = PGN.splitGames($('#impPgn').value);
    if (!games.length) { out.innerHTML = '<div class="card">I could not find any games. Paste PGN text that starts with [Event "..."].</div>'; return; }
    const rescan = !!($('#impRescan') && $('#impRescan').checked);
    const known = new Set(rescan ? [] : s.imports.map((g) => g.key));
    const lines = [], kinds = {}; let totalM = 0, newGames = 0, added = 0;
    for (let gi = 0; gi < games.length; gi++) {
      out.innerHTML = `<div class="card">Analysing game ${gi + 1} of ${games.length}... ⏳</div>`;
      await new Promise((r) => setTimeout(r, 20));
      const g = games[gi], h = g.headers;
      const key = (h.Link || `${h.Date || ''}|${h.White}|${h.Black}|${h.StartTime || ''}`) + '|' + g.tokens.length;
      if (known.has(key)) { lines.push(`<li>↩ ${h.White || '?'} vs ${h.Black || '?'}: already imported</li>`); continue; }
      const rp = PGN.replay(g);
      if (!rp.plies.length) { lines.push(`<li>⚠️ Could not read ${h.White || '?'} vs ${h.Black || '?'}</li>`); continue; }
      const side = PGN.sideFor(h, user) || fallback;
      const mist = PGN.analyze(rp.plies, side);
      const res = PGN.resultFor(h, side);
      const opp = side === 'w' ? h.Black : h.White;
      mist.sort((a, b) => (b.punished - a.punished) || (b.gain - a.gain));
      for (const m of mist) kinds[m.kind] = (kinds[m.kind] || 0) + 1;
      for (const m of mist.slice(0, 5)) {
        const old = s.vault.find((v) => v.fen === m.fen && v.from === m.from && v.to === m.to);
        if (old) { if (!old.kind) { old.kind = m.kind; old.tactic = m.tactic; } continue; }
        s.vault.push({ t: Date.now(), src: 'chess.com', box: 0, due: 0, fen: m.fen, from: m.from, to: m.to, san: m.san, no: m.no, squares: m.squares, reply: m.reply, side: m.side, kind: m.kind, tactic: m.tactic, punished: m.punished });
        added++;
      }
      while (s.vault.length > 200) s.vault.shift();
      if (rescan) { const ix = s.imports.findIndex((x) => x.key === key); if (ix >= 0) s.imports.splice(ix, 1); }
      s.imports.push({ key, t: Date.now(), res, blunders: mist.length, moves: Math.ceil(rp.plies.length / 2), side, opp });
      newGames++; totalM += mist.length;
      const pun = mist.filter((m) => m.punished).length;
      lines.push(`<li>${{ win: '🏆', loss: '💔', draw: '🤝' }[res]} vs <b>${opp || '?'}</b> (as ${side === 'w' ? 'White' : 'Black'}): ${mist.length ? `<b>${mist.length}</b> mistake${mist.length > 1 ? 's' : ''}, ${pun} punished. First: ${mist.slice().sort((a, b) => a.ply - b.ply)[0].san} (move ${mist.slice().sort((a, b) => a.ply - b.ply)[0].no})` : 'no hanging pieces found. Clean!'}${rp.error ? ' <small>(stopped early: ' + rp.error + ')</small>' : ''}</li>`);
    }
    if (s.imports.length > 60) s.imports.splice(0, s.imports.length - 60);
    reward(newGames * 10); BB.awardBadges(); BB.save();
    const kl = Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a]).map((k) => `<li><b>${kinds[k]}</b> × ${KIND[k]}</li>`).join('');
    out.innerHTML = `<div class="card"><h3>📊 Results</h3><ul>${lines.join('')}</ul>
      ${newGames ? `<div><b>${totalM}</b> mistakes found, <b>${added}</b> new positions saved to your vault. +${newGames * 10} XP</div>${kl ? `<div class="mt">What kind of mistakes:<ul>${kl}</ul></div>` : ''}
      <div class="controls mt"><button class="big green" data-act="vpractice" data-any="1">Practise them now ▶</button></div>` : ''}</div>`;
  }
})();

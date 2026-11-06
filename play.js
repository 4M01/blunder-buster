/* Blunder Buster - Phase 2: play the bot with the Safety Gate + Moment of Truth review */
(function () {
  'use strict';
  const C = window.Chess, BB = window.BB;
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const S = () => BB.S();
  const { pn, list, cap } = BB;

  const BOTS = {
    friendly: { name: 'Friendly Fred', e: '🐣', d: 'Plays fast and a bit careless, but never ignores a free piece.' },
    tricky: { name: 'Tricky Tina', e: '🦊', d: 'Sees tactics a couple of moves deep. Watch your pieces!' },
    sharp: { name: 'Sharp Sam', e: '🦈', d: 'Thinks 3 moves ahead. Very hard to fool.' },
  };
  const GATES = [
    { k: 'A', name: 'Tap the danger', d: 'Tap every piece the bot could win. Full training wheels.' },
    { k: 'B', name: 'Safe or Unsafe?', d: 'Decide if your move is safe. Less help.' },
    { k: 'C', name: 'Checklist', d: 'Tick LOOK, ASK, CHECK yourself. No help.' },
    { k: 'D', name: 'Free flight', d: 'No gate. The review afterwards shows your slips.' },
  ];
  let P = null, R = null, timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  BB.onLeave = () => { clearTimers(); P = null; R = null; };

  const lastOf = (a) => a[a.length - 1];
  const snap = (st) => C.toFEN(st);

  // ---------------- Setup ----------------
  function setup() {
    BB.setIdle(); clearTimers(); P = null; R = null;
    const s = S();
    app.innerHTML = `
      <div class="card"><div class="mascot-row"><div class="mascot">🐴</div><div class="bubble">Time for a real game! You play <b>White</b>. Before each move the <b>Safety Gate</b> stops you for a moment. That is where champions are made. 🛡️</div></div></div>
      <h2 class="mt">1 · Pick your opponent</h2>
      <div class="grid2">${Object.keys(BOTS).map((k) => `<button class="lvl ${s.botLevel === k ? 'on' : ''}" data-act="pickbot" data-v="${k}"><div class="ico">${BOTS[k].e}</div><h3>${BOTS[k].name}</h3><div style="color:var(--muted)">${BOTS[k].d}</div></button>`).join('')}</div>
      <h2 class="mt">2 · Safety Gate</h2>
      <div class="card"><div style="margin-bottom:10px">Your gate level is <b>${GATES[s.gate.level].k}: ${GATES[s.gate.level].name}</b>. ${s.gate.auto ? 'It moves up automatically when you get 85% right over 10 checks.' : ''}</div>
        <div class="controls"><button class="chipbtn ${s.gate.auto ? 'on' : ''}" data-act="gateauto">Auto</button>${GATES.map((g, i) => `<button class="chipbtn ${!s.gate.auto && s.gate.level === i ? 'on' : ''}" data-act="gatepick" data-v="${i}">${g.k}</button>`).join('')}</div>
        <div style="margin-top:8px;color:var(--muted)">${GATES.map((g) => `<b>${g.k}</b> ${g.d}`).join(' · ')}</div></div>
      <div class="center mt"><button class="big green" data-act="playstart">Start the game ▶</button> <button class="ghost" data-act="home">Home</button></div>`;
  }
  const H = BB.handlers;
  H.playsetup = setup;
  H.pickbot = (t) => { S().botLevel = t.dataset.v; BB.save(); setup(); };
  H.gateauto = () => { S().gate.auto = true; BB.save(); setup(); };
  H.gatepick = (t) => { const s = S(); s.gate.auto = false; s.gate.level = +t.dataset.v; s.gate.recent = []; BB.save(); setup(); };

  // ---------------- Game ----------------
  H.playstart = () => {
    clearTimers();
    const st = C.fromFEN(C.START_FULL);
    P = { st, keys: [C.posKey(st)], hist: [], bot: S().botLevel, gateLevel: S().gate.level, sel: null, dests: [], pending: null,
      over: false, thinking: false, blunders: 0, moments: [], gateOk: 0, gateN: 0, last: null, saved: false };
    P.legal = C.legalMoves(st);
    BB.sq = playSquare;
    renderPlay();
  };

  function material() {
    const v = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let d = 0;
    for (const ch of P.st.b) if (ch) d += (C.colorOf(ch) === 'w' ? 1 : -1) * v[C.typeOf(ch)];
    return d;
  }
  function movesText() {
    let out = '';
    P.hist.forEach((h, i) => { if (i % 2 === 0) out += `${i / 2 + 1}. `; out += h.san + ' '; });
    return out || 'Moves will appear here.';
  }

  function renderPlay() {
    app.innerHTML = `
      <div class="game">
        <div class="boardcol"><div id="boardWrap"></div><div class="legend" id="legend"></div></div>
        <div class="panel">
          <div class="card"><div class="mascot-row"><div class="mascot" id="mascot">🐴</div><div class="bubble" id="bubble"></div></div></div>
          <div class="qhead"><span>${BOTS[P.bot].e} vs ${BOTS[P.bot].name}</span><span>🚪 Gate ${GATES[P.gateLevel].k}</span><span id="mat"></span></div>
          <div class="status" id="status"></div>
          <div id="gate"></div>
          <div class="moves" id="moves"></div>
          <div class="controls"><button class="ghost" data-act="resign">🏳️ Resign</button><button class="ghost" data-act="home">Home</button></div>
        </div>
      </div>`;
    say(P.hist.length ? '' : 'You are White. Make your first move! Remember: LOOK · ASK · CHECK.');
    draw();
  }
  function say(msg, mood) {
    const b = $('#bubble'); if (!b) return;
    if (msg !== '') b.innerHTML = msg;
    const m = $('#mascot'); m.className = 'mascot'; void m.offsetWidth; if (mood) m.classList.add(mood);
  }

  function draw() {
    if (!P) return;
    const view = P.pending ? P.pending.d.after : P.st;
    const marks = {}, sel = new Set();
    const lm = P.pending ? P.pending.m : P.last;
    if (lm) { marks[lm.from] = 'from'; marks[lm.to] = 'to'; }
    if (!P.pending) {
      if (P.sel != null) { sel.add(P.sel); for (const d of P.dests) marks[d] = (P.st.b[d] ? 'ring' : 'dot') + (marks[d] ? ' ' + marks[d] : ''); }
      if (C.inCheck(P.st.b, P.st.turn)) { const k = P.st.b.indexOf(P.st.turn === 'w' ? 'K' : 'k'); marks[k] = (marks[k] ? marks[k] + ' ' : '') + 'check'; }
    } else {
      const g = P.pending;
      if (g.marks) Object.assign(marks, g.marks);
      if (g.stage === 'ask' && g.level === 0) for (const s of g.taps) sel.add(s);
    }
    $('#boardWrap').innerHTML = BB.boardHTML(view, { marks, sel, clickable: !P.over && !P.thinking });
    const mt = material();
    $('#mat').textContent = mt === 0 ? 'Material: even' : mt > 0 ? `You: +${mt}` : `Bot: +${-mt}`;
    $('#moves').textContent = movesText();
    $('#moves').scrollTop = 9999;
    const stEl = $('#status');
    if (P.over) stEl.textContent = 'Game over';
    else if (P.thinking) stEl.textContent = `${BOTS[P.bot].e} ${BOTS[P.bot].name} is thinking...`;
    else if (P.pending) stEl.textContent = '🛑 Safety Gate: your move is not played yet';
    else stEl.textContent = (C.inCheck(P.st.b, 'w') ? '⚠️ You are in CHECK! ' : '') + 'Your move (White)';
    renderGate();
  }

  function playSquare(i) {
    if (!P || P.over) return true;
    if (P.thinking) return true;
    if (P.pending) return gateSquare(i);
    const ch = P.st.b[i];
    if (P.sel != null) {
      const m = P.legal.find((x) => x.from === P.sel && x.to === i);
      if (m) { startGate(m); return true; }
    }
    if (ch && C.colorOf(ch) === 'w') {
      P.sel = P.sel === i ? null : i;
      P.dests = P.sel == null ? [] : P.legal.filter((x) => x.from === i).map((x) => x.to);
    } else { P.sel = null; P.dests = []; }
    draw();
    return true;
  }

  // ---------------- Safety Gate ----------------
  function startGate(m) {
    const d = C.dangerAfter(P.st, m);
    P.sel = null; P.dests = [];
    P.pending = { m, d, level: P.gateLevel, stage: 'ask', taps: new Set(), ticks: [false, false, false], marks: null, correct: null };
    if (P.gateLevel === 3) { commit(); return; }
    draw();
    say(P.gateLevel === 2 ? 'Take a breath. Tick each step honestly!' : 'PAUSE! Your piece has not moved yet. Imagine you are the bot. What would you do next?', '');
  }

  function dangerHTML(d) {
    const b = d.after.b, rows = [];
    for (const h of d.hang) {
      rows.push(`${pn(b[h.sq], h.sq)} is attacked by ${list(h.attackers, b)} and protected by ${h.defenders.length ? list(h.defenders, b) : 'nobody'}. ${h.defenders.length ? `The bot wins ${h.gain} point${h.gain > 1 ? 's' : ''} in the trade.` : 'It can be taken for free!'}`);
    }
    if (d.mateThreat) rows.push('The bot threatens <b>checkmate</b> next move!');
    return (rows.length ? `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>` : '') + BB.tacticHTML(d);
  }

  function renderGate() {
    const el = $('#gate'); if (!el) return;
    const g = P.pending;
    if (!g) { el.innerHTML = ''; return; }
    const danger = g.d.simple.length > 0, tacticOnly = !danger && g.d.tactics.length > 0;
    let h = '<div class="gate">';
    if (g.stage === 'ask') {
      if (g.level === 0) {
        h += `<h3>🛑 Safety Gate A</h3><div>After this move, which of <b>your white pieces</b> could the bot capture and win material? Tap them on the board. Tap your <b>King</b> if checkmate is threatened.</div>
          <div class="controls"><button class="big" data-act="gcheck">Check ✔</button><button class="big amber" data-act="gsafe">✋ All safe</button><button class="ghost" data-act="gcancel">↩ Other move</button></div>`;
      } else if (g.level === 1) {
        h += `<h3>🛑 Safety Gate B</h3><div>Imagine you are the bot. After this move, can you win something?</div>
          <div class="controls"><button class="big green" data-act="gsafe">✅ Safe</button><button class="big red" data-act="gunsafe">⚠️ Unsafe</button><button class="ghost" data-act="gcancel">↩ Other move</button></div>`;
      } else {
        const L = ['LOOK: what did the bot\'s last move do or threaten?', 'ASK: what does the bot want to do next?', 'CHECK: after my move, is everything protected?'];
        h += `<h3>🛑 Safety Gate C</h3>${L.map((t, i) => `<button class="tick ${g.ticks[i] ? 'on' : ''}" data-act="gtick" data-i="${i}">${g.ticks[i] ? '✅' : '⬜'} ${t}</button>`).join('')}
          <div class="controls"><button class="big green" data-act="gplay" ${g.ticks.every(Boolean) ? '' : 'disabled style="opacity:.5"'}>Play the move ▶</button><button class="ghost" data-act="gcancel">↩ Other move</button></div>`;
      }
    } else {
      h += `<h3>${g.correct ? '✅ Good checking!' : '❌ Not quite.'}</h3>`;
      if (danger) h += `<div>The move <b>is unsafe</b>:</div>${dangerHTML(g.d)}`;
      else if (tacticOnly) h += `<div>Nothing can be captured right away, <b>but there is a trap</b>:</div>${dangerHTML(g.d)}`;
      else h += `<div>The move is <b>safe</b>. Nothing of yours can be won.</div>`;
      h += `<div class="controls">${danger || tacticOnly ? '<button class="big green" data-act="gcancel">↩ Pick a better move</button><button class="big red" data-act="gplay">Play it anyway</button>' : '<button class="big green" data-act="gplay">Play the move ▶</button><button class="ghost" data-act="gcancel">↩ Other move</button>'}</div>`;
    }
    el.innerHTML = h + '</div>';
  }

  function gateSquare(i) {
    const g = P.pending;
    if (g.stage !== 'ask' || g.level !== 0) return true;
    const ch = g.d.after.b[i];
    if (!ch || C.colorOf(ch) !== 'w') { say('Tap one of <b>your</b> white pieces.'); return true; }
    if (g.taps.has(i)) g.taps.delete(i); else g.taps.add(i);
    draw();
    return true;
  }

  function gateResult(correct) {
    const g = P.pending, s = S();
    g.stage = 'result'; g.correct = correct;
    P.gateN++; if (correct) { P.gateOk++; s.xp += 5; }
    BB.logAnswer(correct);
    pushGate(correct ? 1 : 0);
    const marks = { [g.m.from]: 'from', [g.m.to]: 'to' };
    const dset = new Set(g.d.simple);
    if (g.level === 0) {
      for (const q of dset) marks[q] = g.taps.has(q) ? 'good' : 'miss';
      for (const q of g.taps) if (!dset.has(q)) marks[q] = 'false';
    } else for (const q of dset) marks[q] = 'miss';
    g.marks = marks;
    BB.save(); BB.renderHeader();
    if (correct) BB.sndGood(); else BB.sndBad();
    say(correct ? (g.d.tactics.length ? 'Good! But a clever opponent has a trick here...' : BB.rnd(BB.MSG.ok)) : (g.d.simple.length ? 'Look at the red squares: the bot could win those!' : 'That move was actually fine. Check before you worry!'), correct ? 'happy' : 'sad');
    draw();
  }

  function pushGate(score) {
    const s = S(), gt = s.gate;
    gt.recent.push(score); if (gt.recent.length > 10) gt.recent.shift();
    if (!gt.auto || gt.recent.length < 10) return;
    const avg = gt.recent.reduce((a, b) => a + b, 0) / 10;
    if (avg >= 0.85 && gt.level < 3) { gt.level++; gt.recent = []; s.gateEver = true; BB.toast(`🚪 Gate up! You reached Level ${GATES[gt.level].k}: ${GATES[gt.level].name}`); }
    else if (avg < 0.5 && gt.level > 0) { gt.level--; gt.recent = []; BB.toast(`🚪 Let us practise more at Level ${GATES[gt.level].k}.`); }
  }

  H.gcheck = () => {
    const g = P.pending; if (!g || g.stage !== 'ask') return;
    const dset = new Set(g.d.simple);
    gateResult(dset.size === g.taps.size && [...dset].every((q) => g.taps.has(q)));
  };
  H.gsafe = () => { const g = P.pending; if (g && g.stage === 'ask') gateResult(g.d.simple.length === 0); };
  H.gunsafe = () => { const g = P.pending; if (g && g.stage === 'ask') gateResult(g.d.simple.length > 0); };
  H.gtick = (t) => { const g = P.pending; if (!g) return; g.ticks[+t.dataset.i] = !g.ticks[+t.dataset.i]; renderGate(); };
  H.gcancel = () => { if (!P) return; P.pending = null; say('Good idea to think again! Pick another move.'); draw(); };
  H.gplay = () => {
    const g = P && P.pending; if (!g) return;
    if (g.stage === 'result' || (g.level === 2 && g.ticks.every(Boolean))) commit();
  };

  // ---------------- Moves ----------------
  function commit() {
    const g = P.pending, m = g.m, before = P.st, d = g.d;
    const san = C.san(before, m);
    if (g.level >= 2) {
      // Levels C/D are scored on the real result: did the move leave something hanging?
      pushGate(d.squares.length ? 0 : 1);
      if (g.level === 2) { P.gateN++; if (!d.squares.length) { P.gateOk++; S().xp += 5; } }
    }
    if (d.squares.length) {
      P.blunders++;
      const tac = d.tactics && d.tactics[0];
      const reply = d.hang.length
        ? { from: d.hang[0].legal[0], to: d.hang[0].sq }
        : d.mateMove ? { from: d.mateMove.from, to: d.mateMove.to } : tac ? { from: tac.move.from, to: tac.move.to } : null;
      const kind = tac && !d.hang.length && !d.mateMove ? tac.type : undefined;
      const mo = { fen: snap(before), from: m.from, to: m.to, san, no: Math.floor(P.hist.length / 2) + 1, squares: d.squares.slice(), reply, gain: d.hang.length ? d.hang[0].gain : tac ? tac.gain : 9, kind, tactic: !!kind };
      P.moments.push(mo);
      const v = S().vault; v.push({ t: Date.now(), fen: mo.fen, from: mo.from, to: mo.to, san, squares: mo.squares, reply, kind: mo.kind, tactic: mo.tactic }); if (v.length > 60) v.shift();
    }
    P.hist.push({ san, by: 'w' });
    BB.beep(P.st.b[m.to] ? [330, 200] : [440], 0.08);
    P.st = d.after; P.keys.push(C.posKey(P.st)); P.last = m; P.pending = null;
    BB.save(); BB.renderHeader();
    if (g.level === 3 && d.squares.length) say('Hmm, the bot may be able to win something now. We will review it after the game!', 'sad');
    nextTurn();
  }

  function nextTurn() {
    const status = C.gameStatus(P.st, P.keys);
    if (status) return endGame(status);
    if (P.st.turn === 'b') {
      P.thinking = true; draw();
      later(() => {
        if (!P) return;
        const m = C.botMove(P.st, P.bot);
        const san = C.san(P.st, m), cap = !!P.st.b[m.to];
        BB.beep(cap ? [260, 180] : [370], 0.08);
        P.hist.push({ san, by: 'b' });
        P.st = C.applyMove(P.st, m); P.keys.push(C.posKey(P.st)); P.last = m; P.thinking = false;
        P.legal = C.legalMoves(P.st);
        const status2 = C.gameStatus(P.st, P.keys);
        if (status2) { draw(); return endGame(status2); }
        draw();
        botComment(san, cap);
      }, 450 + Math.random() * 450);
    } else {
      P.legal = C.legalMoves(P.st); draw();
    }
  }

  function botComment(san, cap) {
    let msg = `${BOTS[P.bot].name} played <b>${san}</b>.`;
    if (P.gateLevel <= 1) {
      const threats = C.hangingPieces(P.st, 'w');
      msg += threats.length ? ' 👀 That move creates a threat. Can you find it?' : ' Nothing of yours is in danger right now.';
    }
    if (cap) msg += ' It captured one of your pieces!';
    if (C.inCheck(P.st.b, 'w')) msg += ' CHECK!';
    say(msg, cap ? 'sad' : '');
  }

  H.resign = () => { if (P && !P.over && confirm('Resign this game?')) endGame('resign'); };

  // ---------------- End of game ----------------
  function endGame(status) {
    clearTimers();
    P.over = true; P.thinking = false; P.pending = null;
    let res = 'draw', why = '';
    if (status === 'mate') { res = P.st.turn === 'b' ? 'win' : 'loss'; why = 'checkmate'; }
    else if (status === 'resign') { res = 'loss'; why = 'resignation'; }
    else why = { stalemate: 'stalemate', insufficient: 'not enough pieces', fifty: '50-move rule', repetition: 'repeating the position' }[status];
    const s = S(), moves = P.hist.filter((h) => h.by === 'w').length;
    let xp = res === 'win' ? 40 : res === 'draw' ? 20 : 10, bonus = '';
    if (P.blunders === 0 && moves >= 10) { xp += 30; bonus = ' + 30 for a clean game!'; }
    if (!P.saved) {
      P.saved = true;
      s.xp += xp;
      s.games.push({ t: Date.now(), res, level: P.bot, moves, blunders: P.blunders, gate: P.gateLevel });
      if (s.games.length > 30) s.games.shift();
      BB.save(); BB.renderHeader(); BB.awardBadges();
    }
    BB.sq = null;
    const title = res === 'win' ? '🏆 You won!' : res === 'draw' ? '🤝 Draw' : '💔 You lost this one';
    const worst = P.moments.length;
    app.innerHTML = `
      <div class="card center"><div class="mascot" style="margin:auto">${res === 'win' ? '🏆' : res === 'draw' ? '🤝' : '🐴'}</div>
        <h1>${title}</h1><div style="color:var(--muted)">by ${why} · ${moves} moves · vs ${BOTS[P.bot].name}</div>
        <div class="grid2 mt" style="text-align:left">
          <div class="card"><h3>Blunders</h3><div style="font-size:2rem;font-weight:800;color:${P.blunders ? 'var(--warn)' : 'var(--good)'}">${P.blunders}</div><div>${P.blunders ? 'Moves that let the bot win material.' : 'Zero! Great safety checking!'}</div></div>
          <div class="card"><h3>Safety checks</h3><div style="font-size:2rem;font-weight:800">${P.gateN ? P.gateOk + ' / ' + P.gateN : '–'}</div><div>${P.gateLevel === 3 ? 'Free flight: no gate.' : 'Correct at Gate ' + GATES[P.gateLevel].k}</div></div>
          <div class="card"><h3>XP earned</h3><div style="font-size:2rem;font-weight:800">+${xp}</div><div>${bonus || 'Plus +5 for each correct gate check.'}</div></div>
        </div>
        <div class="controls mt" style="justify-content:center">
          ${worst ? `<button class="big amber" data-act="review">🔎 Moment of Truth (${Math.min(worst, 5)})</button>` : ''}
          <button class="big green" data-act="playsetup">Play again</button><button class="ghost" data-act="home">Home</button></div>
      </div>`;
    if (res === 'win') setTimeout(BB.confetti, 250);
    saveReport = P;
  }
  let saveReport = null;

  // ---------------- Moment of Truth ----------------
  H.review = () => {
    const src = saveReport; if (!src || !src.moments.length) return;
    const picks = src.moments.slice().sort((a, b) => b.gain - a.gain).slice(0, 5).sort((a, b) => a.no - b.no);
    R = { list: picks, i: 0, stage: 'find', taps: new Set(), tries: 0, ok: 0, xp: 0 };
    BB.sq = reviewSquare;
    renderReview();
  };

  function momentStates(mo) {
    const before = C.fromFEN(mo.fen);
    const m = C.legalMoves(before).find((x) => x.from === mo.from && x.to === mo.to);
    return { before, m, after: C.applyMove(before, m) };
  }

  function renderReview(feedback) {
    const mo = R.list[R.i], { before, m, after } = momentStates(mo);
    const find = R.stage === 'find';
    const view = find ? after : (R.view || before);
    const marks = R.marks || {};
    const sel = new Set(find ? R.taps : []);
    if (!R.marks) { if (find) { marks[mo.from] = 'from'; marks[mo.to] = 'to'; } else if (R.sel != null) { sel.add(R.sel); for (const d of R.dests) marks[d] = view.b[d] ? 'ring' : 'dot'; } }
    app.innerHTML = `
      <div class="game">
        <div class="boardcol"><div id="boardWrap">${BB.boardHTML(view, { marks, sel, clickable: !R.locked })}</div></div>
        <div class="panel">
          <div class="card"><div class="mascot-row"><div class="mascot" id="mascot">🔎</div><div class="bubble" id="bubble">${feedback ? feedback.say : 'Let us go back to the moments where a piece was in danger. Everyone learns from these!'}</div></div></div>
          <div class="qhead"><span>🔎 Moment of Truth</span><span>${R.i + 1} / ${R.list.length}</span></div>
          <div class="question card">${find
            ? `Move ${mo.no}: you played <b>${mo.san}</b>. After that, the bot could win something! Tap the piece that was in danger (tap your King if checkmate was coming).`
            : `Same position, your move again! Find a move that does <b>not</b> let the bot win anything. Click a piece, then its destination.`}</div>
          ${feedback && feedback.html ? `<div class="explain">${feedback.html}</div>` : ''}
          <div class="controls">${feedback && feedback.buttons ? feedback.buttons : (find ? '<button class="big" data-act="rfind">Check ✔</button>' : '')}</div>
        </div>
      </div>`;
  }

  function reviewSquare(i) {
    if (!R || R.locked) return true;
    const mo = R.list[R.i], { before, after } = momentStates(mo);
    if (R.stage === 'find') {
      const ch = after.b[i];
      if (!ch || C.colorOf(ch) !== 'w') return true;
      if (R.taps.has(i)) R.taps.delete(i); else R.taps.add(i);
      renderReview(); return true;
    }
    // stage fix: click-to-move on the position before the mistake
    const legal = C.legalMoves(before);
    if (R.sel != null) {
      const m = legal.find((x) => x.from === R.sel && x.to === i);
      if (m) { tryFix(m); return true; }
    }
    const ch = before.b[i];
    if (ch && C.colorOf(ch) === 'w') { R.sel = R.sel === i ? null : i; R.dests = R.sel == null ? [] : legal.filter((x) => x.from === i).map((x) => x.to); }
    else { R.sel = null; R.dests = []; }
    renderReview(); return true;
  }

  H.rfind = () => {
    if (!R || R.stage !== 'find') return;
    const mo = R.list[R.i], { before, m, after } = momentStates(mo);
    const dset = new Set(mo.squares);
    const ok = mo.tactic ? (R.taps.size > 0 && [...R.taps].every((q) => dset.has(q))) : (dset.size === R.taps.size && [...dset].every((q) => R.taps.has(q)));
    const d = C.dangerAfter(before, m);
    const marks = {};
    for (const q of dset) marks[q] = R.taps.has(q) ? 'good' : 'miss';
    for (const q of R.taps) if (!dset.has(q)) marks[q] = 'false';
    R.marks = marks; R.locked = true;
    const s = S(); if (ok) { s.xp += 5; R.xp += 5; BB.sndGood(); } else BB.sndBad(); BB.save(); BB.renderHeader();
    renderReview({ say: ok ? 'You spotted it! 🌟' : 'Now you can see it!', html: `${ok ? '✅ Yes!' : '❌ Here is what the bot could do:'}${dangerHTML(d)}`, buttons: '<button class="big amber" data-act="rwatch">▶ Watch what the bot does</button><button class="big green" data-act="rfix">Find a better move ▶</button>' });
  };

  H.rwatch = () => {
    const mo = R.list[R.i]; if (!mo.reply) return;
    const { after } = momentStates(mo);
    const rm = C.legalMoves(after).find((x) => x.from === mo.reply.from && x.to === mo.reply.to);
    if (!rm) return;
    const next = C.applyMove(after, rm);
    $('#boardWrap').innerHTML = BB.boardHTML(next, { marks: { [rm.from]: 'from', [rm.to]: 'target' } });
    BB.sndBad(); const mm = $('#mascot'); if (mm) mm.className = 'mascot sad';
  };

  H.rfix = () => {
    R.stage = 'fix'; R.marks = null; R.locked = false; R.sel = null; R.dests = []; R.tries = 0; R.view = null;
    renderReview();
  };

  function tryFix(m) {
    const mo = R.list[R.i], { before } = momentStates(mo);
    const d = C.dangerAfter(before, m);
    R.tries++;
    if (!d.squares.length) {
      const bonus = R.tries === 1 ? 15 : 10;
      R.ok++; R.xp += bonus; S().xp += bonus; BB.save(); BB.renderHeader(); BB.sndGood();
      R.view = d.after; R.marks = { [m.from]: 'from', [m.to]: 'to' }; R.locked = true;
      renderReview({ say: BB.rnd(BB.MSG.ok), html: `✅ <b>${C.san(before, m)}</b> is safe. Nothing can be won. +${bonus} XP<div class="tip">This is exactly what the Safety Gate is for!</div>`, buttons: nextBtn() });
    } else {
      BB.sndBad();
      const after = d.after;
      const reply = d.hang.length ? { from: d.hang[0].legal[0], to: d.hang[0].sq } : null;
      const marks = { [m.from]: 'from', [m.to]: 'to' }; for (const q of d.squares) marks[q] = 'miss';
      R.sel = null; R.dests = [];
      if (R.tries >= 2) {
        const safe = C.candidateMoves(before).find((x) => !C.dangerAfter(before, x).squares.length);
        R.locked = true; R.view = after; R.marks = marks;
        renderReview({ say: 'Not this time, and that is okay!', html: `❌ That still lets the bot win something.${dangerHTML(d)}${safe ? `<div class="tip">A safe idea was <b>${C.san(before, safe)}</b>.</div>` : ''}`, buttons: nextBtn() });
      } else {
        R.view = after; R.marks = marks; R.locked = true;
        renderReview({ say: 'Careful! Try one more time.', html: `❌ That still lets the bot win something.${dangerHTML(d)}`, buttons: '<button class="big green" data-act="rretry">↩ Try again</button>' });
      }
    }
  }
  const nextBtn = () => `<button class="big green" data-act="rnext">${R.i + 1 >= R.list.length ? 'Finish ▶' : 'Next moment ▶'}</button>`;
  H.rretry = () => { R.marks = null; R.locked = false; R.view = null; R.sel = null; renderReview(); };
  H.rnext = () => {
    R.i++;
    if (R.i >= R.list.length) return reviewDone();
    R.stage = 'find'; R.taps = new Set(); R.marks = null; R.locked = false; R.view = null; R.sel = null;
    renderReview();
  };

  function reviewDone() {
    BB.sq = null;
    app.innerHTML = `<div class="card center"><div class="mascot" style="margin:auto">🎓</div><h1>Review complete!</h1>
      <p style="font-size:1.2rem">You found a safe move in <b>${R.ok} of ${R.list.length}</b> moments and earned <b>+${R.xp} XP</b>.</p>
      <p>These positions are saved in your Mistakes Vault so we can practise them again later.</p>
      <div class="controls" style="justify-content:center"><button class="big green" data-act="playsetup">Play again</button><button class="ghost" data-act="home">Home</button></div></div>`;
  }
})();

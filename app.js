/* Blunder Buster - Phase 1 UI */
(function () {
  'use strict';
  const C = window.Chess;
  const $ = (s) => document.querySelector(s);
  const app = $('#app');

  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const glyph = (t) => GLYPH[t] + '︎';
  const QUEST_LEN = 8;
  const QUEST_MODES = ['spot', 'trade', 'safe', 'pick', 'spot', 'safe', 'trade', 'pick'];
  const RANKS = [
    { name: 'Pawn Scout', at: 0, e: '♟️' }, { name: 'Knight Guardian', at: 150, e: '🐴' },
    { name: 'Bishop Sentinel', at: 400, e: '⛪' }, { name: 'Rook Fortress', at: 800, e: '🏰' },
    { name: 'Queen Guardian', at: 1500, e: '👑' },
  ];
  const MODES = {
    spot: { icon: '🔍', title: 'Spot the Danger', blurb: 'Find the pieces that could be captured for free. Train your eyes!' },
    trade: { icon: '⚖️', title: 'Trade Check', blurb: 'Count attackers and defenders. Does the capture win, lose, or break even?' },
    safe: { icon: '🛡️', title: 'Safe or Blunder?', blurb: 'Judge a move BEFORE it is played. What can the opponent do next?' },
    pick: { icon: '🎯', title: 'Pick the Safe Move', blurb: 'Three moves, only one is safe. Lock in the right one.' },
    opp: { icon: '🥷', title: 'Be the Opponent', blurb: 'Switch sides! Find the move that wins material, or spot that there is none.', custom: true },
  };
  const BADGES = [
    { id: 'eagle', e: '🦅', n: 'Eagle Eye', d: '10 correct in Spot the Danger', test: (s) => s.stats.spot.c >= 10 },
    { id: 'trader', e: '⚖️', n: 'Trade Master', d: '10 correct in Trade Check', test: (s) => s.stats.trade.c >= 10 },
    { id: 'shield', e: '🛡️', n: 'Shield Bearer', d: '10 correct in Safe or Blunder', test: (s) => s.stats.safe.c >= 10 },
    { id: 'sniper', e: '🎯', n: 'Safe Sniper', d: '10 correct in Pick the Safe Move', test: (s) => s.stats.pick.c >= 10 },
    { id: 'hot', e: '🔥', n: 'On Fire', d: '5 correct in a row', test: (s) => s.bestRow >= 5 },
    { id: 'quest', e: '📜', n: 'Quest Complete', d: 'Finish a Daily Quest', test: (s) => s.questsDone >= 1 },
    { id: 'perfect', e: '💎', n: 'Perfect Quest', d: '8 out of 8 in a Daily Quest', test: (s) => s.perfectQuests >= 1 },
    { id: 'streak3', e: '📅', n: '3-Day Streak', d: 'Play 3 days in a row', test: (s) => s.streak >= 3 },
    { id: 'botwin', e: '🤖', n: 'Bot Buster', d: 'Beat the bot', test: (s) => s.games.some((g) => g.res === 'win') },
    { id: 'clean', e: '✨', n: 'Clean Game', d: 'A game of 10+ moves with zero blunders', test: (s) => s.games.some((g) => g.moves >= 10 && g.blunders === 0) },
    { id: 'opp10', e: '🥷', n: 'Opponent Whisperer', d: '10 correct in Be the Opponent', test: (s) => s.stats.opp.c >= 10 },
    { id: 'vault5', e: '🏦', n: 'Vault Keeper', d: 'Master 5 positions in the Mistakes Vault', test: (s) => s.vault.filter((v) => (v.box || 0) >= 4).length >= 5 },
    { id: 'import', e: '📥', n: 'Game Detective', d: 'Import a real game and find your mistakes', test: (s) => s.imports.length >= 1 },
    { id: 'gate', e: '🚪', n: 'Gate Climber', d: 'Move up a Safety Gate level', test: (s) => s.gate.level >= 1 || s.gateEver },
  ];

  // ---------------- Save data ----------------
  const KEY = 'blunderBuster.v1';
  const fresh = () => ({
    xp: 0, streak: 0, lastDay: 0, row: 0, bestRow: 0, questsDone: 0, perfectQuests: 0, sound: true,
    stats: { spot: { a: 0, c: 0 }, trade: { a: 0, c: 0 }, safe: { a: 0, c: 0 }, pick: { a: 0, c: 0 }, opp: { a: 0, c: 0 } },
    imports: [], username: '', vaultDone: 0, daily: {}, time: {}, goalMin: 15, advanced: false,
    quest: { day: 0, idx: 0, correct: 0, results: [], done: false }, badges: {},
    gate: { level: 0, recent: [], auto: true }, games: [], vault: [], botLevel: 'friendly',
  });
  function load() {
    const base = fresh();
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) {
        const keys = Object.keys(base.stats);
        Object.assign(base, s);
        base.stats = {};
        for (const m of keys) base.stats[m] = Object.assign({ a: 0, c: 0 }, (s.stats || {})[m]);
        base.gate = Object.assign({ level: 0, recent: [], auto: true }, s.gate);
      }
    } catch (e) { /* ignore */ }
    return base;
  }
  let S = load();
  const applyAdvanced = () => { C.config.tactics = !!S.advanced; };
  applyAdvanced();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const today = () => dayKey(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  function ensureQuest() {
    if (S.quest.day !== today()) S.quest = { day: today(), idx: 0, correct: 0, results: [], done: false };
  }
  const rankOf = (xp) => { let r = RANKS[0]; for (const x of RANKS) if (xp >= x.at) r = x; return r; };

  // ---------------- Sound ----------------
  let actx = null;
  function beep(freqs, dur) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      let t = actx.currentTime;
      for (const f of freqs) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur); t += dur * 0.8;
      }
    } catch (e) { /* ignore */ }
  }
  const sndGood = () => beep([523, 659, 784], 0.14);
  const sndBad = () => beep([300, 220], 0.2);

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ---------------- Header ----------------
  function renderHeader() {
    const r = rankOf(S.xp);
    const next = RANKS.find((x) => x.at > S.xp);
    const pct = next ? ((S.xp - r.at) / (next.at - r.at)) * 100 : 100;
    $('#xpwrap').innerHTML =
      `<span class="rank">${r.e} ${r.name}</span><div class="xpbar"><i style="width:${pct}%"></i></div>` +
      `<span class="xpnum">${S.xp} XP${S.streak ? ' · 🔥' + S.streak : ''}</span>`;
    $('#soundBtn').textContent = S.sound ? '🔊' : '🔇';
  }

  // ---------------- Text helpers ----------------
  function pn(ch, sq) {
    const c = C.colorOf(ch), t = C.typeOf(ch);
    return `<span class="${c === 'w' ? 'pillw' : 'pillb'}">${C.colorWord(c)} ${C.NAME[t]} on ${C.sqName(sq)}</span>`;
  }
  const list = (arr, b) => arr.length ? arr.map((i) => pn(b[i], i)).join(', ') : 'nobody';
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const colored = (c) => `<b>${cap(C.colorWord(c))}</b>`;
  const moveText = (st, m) => {
    const ch = st.b[m.from], t = C.typeOf(ch);
    return `${glyph(t)} ${C.NAME[t]} ${C.sqName(m.from)} → ${C.sqName(m.to)}`;
  };
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const MSG = {
    ok: ['Brilliant! Nothing gets past you! 🌟', 'Knight-ly good work! 🐴', 'That is the Guardian spirit! 🛡️', 'Sharp eyes! Keep it going! 🔥', 'Yes! You looked at the whole board! 👏'],
    no: ['Close! Let us see what we missed.', 'Every master blunders first. Learn from it! 💪', 'Good try! Check the lesson below.', 'Oops! That is how we get stronger.', 'Ah, tricky one! Look at the colours on the board.'],
    hello: ['Before every move: LOOK, ASK, CHECK!', 'Ready to become a Guardian?', 'Remember: your opponent moves too!'],
  };

  // ---------------- Board ----------------
  function boardHTML(st, o) {
    o = o || {};
    const sel = o.sel || new Set(), marks = o.marks || {};
    let h = `<div class="board" id="board">`;
    for (let d = 0; d < 64; d++) {
      const i = o.flip ? 63 - d : d;
      const r = i >> 3, c = i & 7, ch = st.b[i];
      let cls = 'sq ' + ((r + c) % 2 ? 'd' : 'l');
      if (sel.has(i)) cls += ' sel';
      if (marks[i]) cls += ' ' + marks[i];
      if (o.clickable) cls += ' clickable';
      h += `<div class="${cls}" data-sq="${i}">` +
        ((d & 7) === 0 ? `<i class="rk">${8 - r}</i>` : '') + ((d >> 3) === 7 ? `<i class="fl">${C.FILES[c]}</i>` : '') +
        (ch ? `<span class="pc ${C.colorOf(ch)}">${glyph(C.typeOf(ch))}</span>` : '') + '</div>';
    }
    return h + '</div>';
  }

  // Explain a fork / pin / skewer / discovered attack found by the advanced catcher.
  function tacticHTML(d) {
    if (!d || !d.tactics || !d.tactics.length) return '';
    const t = d.tactics[0], b = C.applyMove(d.after, t.move).b;
    const P = (sq) => pn(b[sq], sq), L = (arr) => arr.map(P).join(' and ');
    const from = C.sqName(t.move.from), to = C.sqName(t.move.to);
    let s;
    if (t.type === 'fork') s = `<b>Fork!</b> If the opponent plays ${from} → ${to}, their ${P(t.mover)} attacks ${L(t.squares)} at the same time. You can only save one.`;
    else if (t.type === 'pin') s = `<b>Pin!</b> After ${from} → ${to}, ${P(t.pinner)} pins ${P(t.front)} against ${P(t.rear)}, so it cannot run away.`;
    else if (t.type === 'skewer') s = `<b>Skewer!</b> After ${from} → ${to}, ${P(t.pinner)} attacks ${P(t.front)}. When that moves, ${P(t.rear)} is captured.`;
    else if (t.type === 'discovered') s = `<b>Discovered attack!</b> If the opponent plays ${from} → ${to}, it uncovers ${P(t.slider)}, which attacks ${L(t.squares)}.`;
    else s = `<b>Double threat!</b> After ${from} → ${to} there are two threats at once against ${L(t.squares)}.`;
    return `<div class="tactic">🧠 ${s} Likely loss: about ${t.gain} point${t.gain > 1 ? 's' : ''}.</div>`;
  }

  // ---------------- Navigation ----------------
  let G = null; // current game session
  const BB = window.BB = {
    handlers: {}, sq: null, S: () => S, save, renderHeader, boardHTML, pn, list, cap, toast, sndGood, sndBad, beep,
    rnd, MSG, glyph, BADGES, setIdle: () => { G = null; BB.sq = null; }, home: () => home(),
    today, dayKey, MODES, RANKS, rankOf, fresh, load: () => { S = load(); save(); applyAdvanced(); renderHeader(); },
    setAdvanced: (v) => { S.advanced = !!v; applyAdvanced(); save(); },
    tacticHTML,
    logAnswer: (ok) => { const k = today(); const d = S.daily[k] || (S.daily[k] = { n: 0, c: 0 }); d.n++; if (ok) d.c++; },
    confetti: () => {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const box = document.createElement('div'); box.className = 'confetti';
      const cols = ['#5b4bdb', '#2fb36d', '#f5a524', '#e5484d', '#38bdf8'];
      for (let i = 0; i < 46; i++) {
        const p = document.createElement('i');
        p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.6 + Math.random()}s;transform:rotate(${Math.random() * 360}deg)`;
        box.appendChild(p);
      }
      document.body.appendChild(box); setTimeout(() => box.remove(), 3200);
    },
    awardBadges: () => {
      const nb = BADGES.filter((b) => !S.badges[b.id] && b.test(S));
      nb.forEach((b, i) => { S.badges[b.id] = today(); setTimeout(() => toast(`${b.e} New badge: ${b.n}!`), 800 + i * 3000); });
      save();
    },
  };
  $('#homeBtn').onclick = () => home();
  $('#soundBtn').onclick = () => { S.sound = !S.sound; save(); renderHeader(); };

  function home() {
    G = null; BB.sq = null; if (BB.onLeave) BB.onLeave(); ensureQuest(); save(); renderHeader();
    const q = S.quest;
    const dots = Array.from({ length: QUEST_LEN }, (_, i) =>
      `<i class="${q.results[i] === 1 ? 'ok' : q.results[i] === 0 ? 'no' : ''} ${i === q.idx && !q.done ? 'cur' : ''}"></i>`).join('');
    const qBtn = q.done
      ? `<button class="ghost" data-act="quest">Replay today's quest (practice)</button>`
      : `<button class="big green" data-act="quest">${q.idx ? 'Continue' : 'Start'} Daily Quest ▶</button>`;
    app.innerHTML = `
      <div class="hero">
        <div class="card"><div class="mascot-row"><div class="mascot">🐴</div>
          <div class="bubble">Hi! I am <b>Sir Blunder-Not</b>. I will help you stop giving pieces away and start winning them! ${rnd(MSG.hello)}
            <div class="chips"><span class="chip">1 · LOOK at what they did</span><span class="chip">2 · ASK what they want</span><span class="chip">3 · CHECK your move is safe</span></div>
          </div></div></div>
        <div class="card quest"><div><h2>📜 Daily Quest ${q.done ? '✅' : ''}</h2>
          <div class="dots">${dots}</div>
          <div style="color:var(--muted)">${q.done ? `Done! You got ${q.correct} out of ${QUEST_LEN}.` : `${QUEST_LEN} quick challenges. Finish for +50 XP bonus!`}</div></div>${qBtn}</div>
      </div>
      <div class="card quest" style="margin-bottom:18px;border-color:#2fb36d"><div><h2>♟️ Play the Bot</h2>
        <div style="color:var(--muted)">A real game! Before each move, the <b>Safety Gate</b> makes you check what your opponent can do. ${S.games.length ? `Games played: ${S.games.length}.` : ''}</div></div>
        <button class="big green" data-act="playsetup">Play a game ▶</button></div>
      <div class="modes" style="margin-top:0">
        <button class="mode" data-act="vault"><div class="ico">🏦</div><h3>Mistakes Vault</h3><p>Practise your own past blunders until they stop happening.</p><div class="acc">${S.vault.filter((v) => !(v.due > Date.now())).length} due now · ${S.vault.length} saved</div></button>
        <button class="mode" data-act="oppstart"><div class="ico">🥷</div><h3>Be the Opponent</h3><p>${MODES.opp.blurb}</p><div class="acc">${S.stats.opp.a ? Math.round((S.stats.opp.c / S.stats.opp.a) * 100) + '% correct' : 'Not played yet'}</div></button>
        <button class="mode" data-act="importgames"><div class="ico">📥</div><h3>Import real games</h3><p>Load games from chess.com and find where the pieces were lost.</p><div class="acc">${S.imports.length} imported</div></button>
      </div>
      <h2>Training games</h2>
      <div class="modes">${Object.keys(MODES).filter((k) => !MODES[k].custom).map((k) => {
        const m = MODES[k], st = S.stats[k], acc = st.a ? Math.round((st.c / st.a) * 100) + '% correct' : 'Not played yet';
        return `<button class="mode" data-act="mode" data-mode="${k}"><div class="ico">${m.icon}</div><h3>${m.title}</h3><p>${m.blurb}</p><div class="acc">${acc}</div></button>`;
      }).join('')}</div>
      <div class="center"><button class="ghost" data-act="progress">📊 My progress &amp; badges</button> <button class="ghost" data-act="parent">👨‍👩‍👦 Parent area</button></div>`;
    if (BB.afterHome) BB.afterHome();
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-sq]');
    if (!t) return;
    if (t.dataset.sq !== undefined) { if (BB.sq && BB.sq(+t.dataset.sq)) return; return onSquare(+t.dataset.sq); }
    const act = t.dataset.act;
    if (BB.handlers[act]) return BB.handlers[act](t);
    if (act === 'quest') startGame(null, true);
    else if (act === 'mode') startGame(t.dataset.mode, false);
    else if (act === 'progress') progress();
    else if (act === 'home') home();
    else if (act === 'next') next();
    else if (act === 'submit') submitSpot();
    else if (act === 'none') { G.sel.clear(); submitSpot(); }
    else if (act === 'ans') answerChoice(t.dataset.v);
    else if (act === 'opt') chooseOption(+t.dataset.i);
    else if (act === 'lock') lockOption();
    else if (act === 'watch') watch();
    else if (act === 'reset') resetAll();
    else if (act === 'again') startGame(G ? G.mode : null, false);
  });

  // ---------------- Game flow ----------------
  function startGame(mode, quest) {
    BB.sq = null; if (BB.onLeave) BB.onLeave();
    ensureQuest();
    G = { mode, quest, item: null, answered: false, sel: new Set(), pickIdx: null, replaySteps: null, timers: [] };
    if (quest) { G.mode = QUEST_MODES[S.quest.done ? 0 : S.quest.idx]; G.practice = S.quest.done; G.n = G.practice ? 0 : S.quest.idx; }
    loadItem();
  }
  function loadItem() {
    G.answered = false; G.sel = new Set(); G.pickIdx = null; G.replaySteps = null;
    const mode = G.mode;
    const seedStr = G.quest && !G.practice ? `${today()}:${S.quest.idx}:${mode}` : `${Date.now()}:${Math.random()}`;
    G.item = C.gen[mode](C.mulberry32(C.hashStr(seedStr)));
    if (!G.item) return toast('Could not make a puzzle. Try again!');
    renderGame();
  }
  function renderGame() {
    const it = G.item, m = MODES[G.mode];
    const qhead = G.quest && !G.practice ? `Quest ${S.quest.idx + 1} / ${QUEST_LEN}` : G.quest ? 'Practice' : 'Free play';
    app.innerHTML = `
      <div class="game">
        <div class="boardcol"><div id="boardWrap"></div><div class="legend" id="legend"></div></div>
        <div class="panel">
          <div class="card"><div class="mascot-row"><div class="mascot" id="mascot">🐴</div><div class="bubble" id="bubble">LOOK · ASK · CHECK</div></div></div>
          <div class="qhead"><span>${m.icon} ${m.title}</span><span>${qhead}</span><span>🔥 ${S.row} in a row</span></div>
          <div class="question card" id="question"></div>
          <div class="controls" id="controls"></div>
          <div id="feedback"></div>
        </div>
      </div>`;
    if (it.type === 'spot') {
      const side = C.colorWord(it.focus);
      $('#question').innerHTML = `Tap every <b>${side}</b> piece that the other side could capture <b>for free</b> (or win material by capturing). <br><small style="color:var(--muted)">There might be none! The board shows where the side to move is White.</small>`;
      $('#controls').innerHTML = `<button class="big" data-act="submit">Check my answer ✔</button><button class="big amber" data-act="none">✋ Nothing is in danger</button>`;
      setBoard(it.st, { clickable: true });
      legend([['var(--brand)', 'your tap']]);
    } else if (it.type === 'trade') {
      const m0 = it.move, ch = it.st.b[m0.from], vic = it.st.b[m0.to];
      $('#question').innerHTML = `<span class="sidepieces"><b>White</b> thinks about playing ${moveText(it.st, m0)}, <b>capturing</b> the ${C.colorWord('b')} ${C.NAME[C.typeOf(vic)]}.</span><br>Count the attackers and defenders. What happens to the material if both sides keep capturing on that square?`;
      $('#controls').innerHTML = `<button class="big green" data-act="ans" data-v="win">👍 Wins material</button><button class="big amber" data-act="ans" data-v="even">🤝 Even trade</button><button class="big red" data-act="ans" data-v="lose">👎 Loses material</button>`;
      setBoard(it.st, { marks: { [m0.from]: 'from', [m0.to]: 'target' } });
      legend([['#ffe66d', 'capturing piece'], ['#e5484d', 'target square']]);
    } else if (it.type === 'safe') {
      $('#question').innerHTML = `<span class="sidepieces"><b>White</b> wants to play ${moveText(it.st, it.move)}.</span><br>LOOK at the whole board. Is this move <b>safe</b>, or a <b>blunder</b> that loses material?`;
      $('#controls').innerHTML = `<button class="big green" data-act="ans" data-v="safe">✅ Safe</button><button class="big red" data-act="ans" data-v="blunder">❌ Blunder</button>`;
      setBoard(it.st, { marks: { [it.move.from]: 'from', [it.move.to]: 'to' } });
      legend([['#ffe66d', 'from'], ['#7bd88f', 'to']]);
    } else {
      $('#question').innerHTML = `<b>White</b> to move. Only <b>one</b> of these three moves is safe. Tap a card to preview it on the board, then lock it in.`;
      $('#controls').innerHTML = it.options.map((o, i) =>
        `<button class="opt" data-act="opt" data-i="${i}" id="opt${i}"><span class="sidepieces">${'ABC'[i]} · ${moveText(it.st, o.m)}</span></button>`).join('') +
        `<button class="big" data-act="lock" id="lockBtn" disabled style="opacity:.5">Lock it in 🔒</button>`;
      setBoard(it.st, {});
      legend([['#ffe66d', 'from'], ['#7bd88f', 'to']]);
    }
  }
  function setBoard(st, o) { $('#boardWrap').innerHTML = boardHTML(st, o); }
  function legend(items) { $('#legend').innerHTML = items.map(([c, t]) => `<span style="--c:${c}">${t}</span>`).join(''); }
  function say(msg, mood) {
    $('#bubble').innerHTML = msg;
    const m = $('#mascot'); m.className = 'mascot'; void m.offsetWidth; if (mood) m.classList.add(mood);
  }

  function onSquare(i) {
    if (!G || G.answered || G.item.type !== 'spot') return;
    const ch = G.item.st.b[i];
    if (!ch || C.colorOf(ch) !== G.item.focus || C.typeOf(ch) === 'k') { say('Tap one of the <b>' + C.colorWord(G.item.focus) + '</b> pieces (not the king).'); return; }
    if (G.sel.has(i)) G.sel.delete(i); else G.sel.add(i);
    setBoard(G.item.st, { sel: G.sel, clickable: true });
  }

  // ---- Spot the Danger ----
  function submitSpot() {
    if (G.answered) return;
    const it = G.item, ans = new Set(it.hang.map((h) => h.sq));
    const marks = {}, rows = [];
    let correct = true;
    for (const h of it.hang) {
      const picked = G.sel.has(h.sq);
      if (!picked) correct = false;
      marks[h.sq] = picked ? 'good' : 'miss';
      const e = C.other(it.focus), b = it.st.b;
      rows.push(`${picked ? '✅' : '❌ Missed:'} ${pn(b[h.sq], h.sq)} is attacked by ${list(h.attackers, b)} and protected by ${h.defenders.length ? list(h.defenders, b) : 'nobody'}. ${h.defenders.length ? `${cap(C.colorWord(e))} wins ${h.gain} point${h.gain > 1 ? 's' : ''} in the trade.` : 'It can be taken for free!'}`);
    }
    for (const sq of G.sel) {
      if (ans.has(sq)) continue;
      correct = false; marks[sq] = 'false';
      const b = it.st.b, att = C.attackersOf(b, sq, C.other(it.focus));
      rows.push(`⚠️ ${pn(b[sq], sq)} is fine: ${att.length ? `it is attacked by ${list(att, b)}, but protected well enough that capturing would lose material.` : 'nobody is attacking it.'}`);
    }
    if (!it.hang.length && correct) rows.push('✅ Nothing can be captured for profit. It is good to know when you are safe too!');
    G.answered = true;
    setBoard(it.st, { marks });
    legend([['#2fb36d', 'found it'], ['#e5484d', 'missed'], ['#f5a524', 'false alarm']]);
    finish(correct, `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul><div class="tip">Habit: for every piece, ask "who attacks it? who protects it?"</div>`);
  }

  // ---- Trade / Safe ----
  function answerChoice(v) {
    if (G.answered) return;
    const it = G.item;
    G.answered = true;
    if (it.type === 'trade') {
      const correct = v === it.kind;
      const steps = it.pv.steps.map((s) => `${cap(C.colorWord(s.side))}'s ${C.NAME[C.typeOf(s.mover)]} takes the ${C.NAME[C.typeOf(s.victim)]} (${s.side === 'w' ? '+' : '−'}${s.value})`);
      const net = it.pv.net;
      const verdict = net > 0 ? `White comes out <b>${net} point${net > 1 ? 's' : ''} ahead</b>.` : net === 0 ? 'It is an <b>even trade</b>.' : `White ends up <b>${-net} point${net < -1 ? 's' : ''} behind</b>.`;
      setBoard(it.st, { marks: { [it.move.from]: 'from', [it.move.to]: 'target' } });
      finish(correct, `<div>Attackers: <b>${it.attackers}</b> · Defenders: <b>${it.defenders}</b></div><ul>${steps.map((s) => `<li>${s}</li>`).join('')}</ul><div>${verdict}</div><div class="tip">Habit: count attackers and defenders, then compare the piece values. Small pieces should take big ones!</div>`);
    } else {
      const j = it.judged, correct = (v === 'blunder') === j.blunder;
      G.replaySteps = null;
      let body;
      if (j.blunder) {
        const r = j.refute;
        body = `<div>This is a <b>blunder</b>. After the move, ${pn(r.victim, r.victimSq)} can be captured by ${pn(r.mover, r.move.from)}.</div><div>${r.movedPieceHangs ? 'The piece you moved lands on an attacked square.' : r.ignoredThreat ? 'That piece was already in danger, and the move did not fix it!' : 'The move left something unprotected.'} It is ${r.defenders ? 'protected, but you still lose material in the trade' : 'not protected at all'}.</div>`;
        G.replaySteps = [{ st: j.after, marks: { [it.move.from]: 'from', [it.move.to]: 'to' }, label: 'After White\'s move' },
          { st: C.applyMove(j.after, r.move), marks: { [r.move.from]: 'from', [r.move.to]: 'target' }, label: 'Black captures!' }];
      } else {
        body = `<div>This move is <b>safe</b>. After it, nothing of White's can be captured for a profit.</div>`;
      }
      setBoard(it.st, { marks: { [it.move.from]: 'from', [it.move.to]: 'to' } });
      finish(correct, body + `<div class="tip">Habit: after you pick a move, ask "what can they capture NOW?" before you let go.</div>`, !!G.replaySteps);
    }
  }

  // ---- Pick the safe move ----
  function chooseOption(i) {
    if (G.answered) return;
    G.pickIdx = i;
    const o = G.item.options[i];
    document.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    const lb = $('#lockBtn'); lb.disabled = false; lb.style.opacity = 1;
    setBoard(G.item.st, { marks: { [o.m.from]: 'from', [o.m.to]: 'to' } });
  }
  function lockOption() {
    if (G.answered || G.pickIdx === null) return;
    G.answered = true;
    const it = G.item, o = it.options[G.pickIdx], correct = !o.blunder;
    let replay = null;
    document.querySelectorAll('.opt').forEach((b, i) => {
      const op = it.options[i];
      b.disabled = true; b.classList.remove('on'); b.classList.add(op.blunder ? 'wrong' : 'right');
      if (op.blunder) {
        const r = op.refute;
        b.innerHTML += `<small>❌ Black plays ${pn(r.mover, r.move.from)} × ${pn(r.victim, r.victimSq)}.</small>`;
      } else b.innerHTML += `<small>✅ Safe: nothing of White's can be won.</small>`;
    });
    if (!correct) {
      const r = o.refute;
      G.replaySteps = [{ st: o.after, marks: { [o.m.from]: 'from', [o.m.to]: 'to' }, label: 'After your move' },
        { st: C.applyMove(o.after, r.move), marks: { [r.move.from]: 'from', [r.move.to]: 'target' }, label: 'Black captures!' }];
      replay = true;
    }
    $('#lockBtn').remove();
    finish(correct, `<div>${correct ? 'You found the safe move!' : 'That move allows a capture.'} Always imagine your opponent's best reply first.</div><div class="tip">Habit: test each candidate move: "if I go there, what can they take?"</div>`, replay);
  }

  // ---- Replay ----
  function watch() {
    if (!G || !G.replaySteps) return;
    G.timers.forEach(clearTimeout); G.timers = [];
    G.replaySteps.forEach((s, i) => {
      G.timers.push(setTimeout(() => { setBoard(s.st, { marks: s.marks }); say(s.label, i ? 'sad' : ''); if (i) sndBad(); }, i * 1300));
    });
  }

  // ---- Result handling ----
  function finish(correct, explainHTML, canWatch) {
    const st = S.stats[G.mode]; st.a++;
    let gain = 2;
    if (correct) { st.c++; S.row++; if (S.row > S.bestRow) S.bestRow = S.row; gain = 10 + Math.min(S.row, 5) * 2; } else S.row = 0;
    S.xp += gain; BB.logAnswer(correct);
    const t = today();
    if (S.lastDay !== t) { S.streak = S.lastDay === yesterday() ? S.streak + 1 : 1; S.lastDay = t; }
    let questMsg = '';
    if (G.quest && !G.practice) {
      ensureQuest();
      S.quest.results.push(correct ? 1 : 0); S.quest.idx++; if (correct) S.quest.correct++;
      if (S.quest.idx >= QUEST_LEN && !S.quest.done) {
        S.quest.done = true; S.xp += 50; S.questsDone++;
        if (S.quest.correct === QUEST_LEN) S.perfectQuests++;
        questMsg = ' · Quest complete! +50 XP 🎉'; setTimeout(BB.confetti, 300);
      }
    }
    const newBadges = BADGES.filter((b) => !S.badges[b.id] && b.test(S));
    newBadges.forEach((b) => { S.badges[b.id] = today(); });
    save(); renderHeader();
    if (correct) sndGood(); else sndBad();
    say(correct ? rnd(MSG.ok) : rnd(MSG.no), correct ? 'happy' : 'sad');
    const nextLabel = G.quest && !G.practice && S.quest.done && S.quest.idx >= QUEST_LEN ? 'See my quest result 🏆' : 'Next ▶';
    if (G.item.type !== 'pick') $('#controls').innerHTML = '';
    $('#feedback').innerHTML = `
      <div class="result ${correct ? 'ok' : 'no'}">${correct ? '✅ Correct!' : '❌ Not quite.'} +${gain} XP${questMsg}</div>
      <div class="explain mt">${explainHTML}</div>
      <div class="controls mt">${canWatch ? '<button class="big amber" data-act="watch">▶ Watch what happens</button>' : ''}<button class="big green" data-act="next">${nextLabel}</button><button class="ghost" data-act="home">Home</button></div>`;
    if (canWatch && !correct) setTimeout(watch, 600);
    newBadges.forEach((b, i) => setTimeout(() => toast(`${b.e} New badge: ${b.n}!`), 600 + i * 3000));
    $('#feedback').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function next() {
    if (!G) return home();
    G.timers.forEach(clearTimeout);
    if (G.quest && !G.practice && S.quest.done && S.quest.idx >= QUEST_LEN && !G.shownSummary) { G.shownSummary = true; return questSummary(); }
    if (G.quest) {
      if (G.practice) { G.n = (G.n + 1) % QUEST_LEN; G.mode = QUEST_MODES[G.n]; } else G.mode = QUEST_MODES[Math.min(S.quest.idx, QUEST_LEN - 1)];
    }
    loadItem();
  }

  function questSummary() {
    const q = S.quest;
    app.innerHTML = `<div class="card center"><div class="mascot" style="margin:auto">🏆</div><h1>Quest complete!</h1>
      <div class="dots" style="justify-content:center">${q.results.map((r) => `<i class="${r ? 'ok' : 'no'}"></i>`).join('')}</div>
      <p style="font-size:1.2rem">You got <b>${q.correct} out of ${QUEST_LEN}</b>. ${q.correct === QUEST_LEN ? 'PERFECT! 💎' : q.correct >= 6 ? 'Great Guardian work! 🛡️' : 'Every try makes you stronger. Come back tomorrow for a fresh quest!'}</p>
      <p>🔥 Day streak: <b>${S.streak}</b></p>
      <button class="big green" data-act="home">Back home</button></div>`;
  }

  // ---------------- Progress ----------------
  function progress() {
    G = null; BB.sq = null; if (BB.onLeave) BB.onLeave(); renderHeader();
    const r = rankOf(S.xp);
    const gm = S.games.slice(-10);
    const resIco = { win: '🏆', draw: '🤝', loss: '💔' };
    const total = Object.values(S.stats).reduce((a, s) => ({ a: a.a + s.a, c: a.c + s.c }), { a: 0, c: 0 });
    app.innerHTML = `
      <div class="card"><h2>${r.e} ${r.name} · ${S.xp} XP</h2>
        <div class="ranks">${RANKS.map((x) => `<span class="rankpill ${x.name === r.name ? 'cur' : ''}">${x.e} ${x.name} (${x.at})</span>`).join('')}</div>
        <p>🔥 Day streak: <b>${S.streak}</b> · Best run: <b>${S.bestRow}</b> in a row · Quests finished: <b>${S.questsDone}</b></p>
        <p>Overall: <b>${total.c}</b> correct out of <b>${total.a}</b> ${total.a ? '(' + Math.round((total.c / total.a) * 100) + '%)' : ''}</p></div>
      <h2 class="mt">Skills</h2>
      <div class="grid2">${Object.keys(MODES).map((k) => {
        const s = S.stats[k], p = s.a ? Math.round((s.c / s.a) * 100) : 0;
        return `<div class="card"><h3>${MODES[k].icon} ${MODES[k].title}</h3><div class="bar"><i style="width:${p}%"></i></div><div>${s.a ? `${s.c} / ${s.a} correct (${p}%)` : 'Not played yet'}</div></div>`;
      }).join('')}</div>
      <h2 class="mt">Games vs the bot</h2>
      <div class="card">${gm.length ? `<div>Blunders per game (oldest → newest):</div>
        <div style="display:flex;gap:6px;align-items:flex-end;height:90px;margin:10px 0">${gm.map((g) => `<div title="${g.res}, ${g.moves} moves" style="flex:1;text-align:center"><div style="background:${g.blunders ? 'var(--warn)' : 'var(--good)'};height:${6 + g.blunders * 14}px;border-radius:6px 6px 0 0"></div><small>${g.blunders}</small><div>${resIco[g.res] || ''}</div></div>`).join('')}</div>
        <div style="color:var(--muted)">Safety Gate level: <b>${'ABCD'[S.gate.level]}</b> · Mistakes saved for practice: <b>${S.vault.length}</b></div>` : 'No games yet. Play the bot to see your blunder trend here!'}</div>
      <div class="card mt">${S.imports.length ? `<b>Imported chess.com games:</b> ${S.imports.slice(-8).map((g) => `${resIco[g.res] || ''}${g.blunders}`).join(' · ')} <span style="color:var(--muted)">(blunders per game)</span>` : 'Import real games from the home screen to track blunders in his academy and chess.com games too.'}
        <div style="color:var(--muted);margin-top:6px">Vault: ${S.vault.length} saved · ${S.vault.filter((v) => (v.box || 0) >= 4).length} mastered</div></div>
      <h2 class="mt">Badges</h2>
      <div class="badges">${BADGES.map((b) => `<div class="badge ${S.badges[b.id] ? 'got' : ''}"><div class="e">${b.e}</div><b>${b.n}</b><small>${b.d}</small></div>`).join('')}</div>
      <div class="center mt"><button class="ghost" data-act="home">⬅ Home</button> <button class="ghost" data-act="reset">Reset all progress</button></div>`;
  }
  function resetAll() {
    if (!confirm('Erase all progress? This cannot be undone.')) return;
    S = fresh(); applyAdvanced(); save(); home();
  }

  // Count active minutes (tab visible and touched in the last minute).
  let lastInput = Date.now(), ticks = 0;
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (document.hidden || Date.now() - lastInput > 60000) return;
    const k = today(); S.time[k] = (S.time[k] || 0) + 10;
    if (++ticks % 3 === 0) save();
  }, 10000);

  home();
})();


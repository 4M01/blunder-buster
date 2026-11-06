/* Blunder Buster - Phase 4: parent dashboard */
(function () {
  'use strict';
  const BB = window.BB;
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const S = () => BB.S();
  const H = BB.handlers;
  const KEY = 'blunderBuster.v1';
  const DAY = 864e5;
  const KIND = { moved: 'Moved a piece into danger', ignored: 'Ignored a threat to a piece', weakened: 'Left a piece unprotected', mate: 'Missed a checkmate threat', fork: 'Walked into a fork', pin: 'Allowed a pin', skewer: 'Allowed a skewer', discovered: 'Allowed a discovered attack', double: 'Allowed a double threat' };
  const ADVICE = {
    spot: 'Spot the Danger: before each move, ask "which of my pieces are attacked, and who protects them?"',
    trade: 'Trade Check: practise counting attackers and defenders before capturing.',
    safe: 'Safe or Blunder: play it daily. It trains the "what can they do after my move?" habit.',
    pick: 'Pick the Safe Move: try each candidate move and ask what the opponent can capture.',
    opp: 'Be the Opponent: look at the board from the other side and find what you would capture.',
  };
  const key = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const lastDays = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d; });
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  H.parent = () => {
    BB.setIdle(); if (BB.onLeave) BB.onLeave();
    const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    app.innerHTML = `<div class="card center"><div class="mascot" style="margin:auto">👨‍👩‍👦</div><h2>Parent area</h2>
      <p>A quick question to keep little hands out: what is <b>${a} × ${b}</b>?</p>
      <input id="pq" inputmode="numeric" style="font:inherit;padding:10px 14px;border-radius:12px;border:2px solid #cfd4ee;width:120px;text-align:center">
      <div class="controls mt" style="justify-content:center"><button class="big green" id="pqgo">Open</button><button class="ghost" data-act="home">Back</button></div>
      <div id="pqmsg" style="color:var(--bad);margin-top:8px"></div></div>`;
    const go = () => { if (+$('#pq').value === a * b) dashboard(); else { $('#pqmsg').textContent = 'Not quite. Try again!'; } };
    $('#pqgo').onclick = go;
    $('#pq').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('#pq').focus();
  };

  function dashboard() {
    const s = S(), now = Date.now();
    const days = lastDays(14), week = days.slice(-7);
    // games: bot + imported, newest last
    const games = s.games.map((g) => ({ t: g.t, res: g.res, bl: g.blunders, src: 'bot', moves: g.moves }))
      .concat(s.imports.map((g) => ({ t: g.t, res: g.res, bl: g.blunders, src: 'real', moves: g.moves })))
      .sort((x, y) => x.t - y.t);
    const recent = games.slice(-12);
    const maxBl = Math.max(3, ...recent.map((g) => g.bl));
    // weekly numbers
    const wkMin = Math.round(week.reduce((n, d) => n + (s.time[key(d)] || 0), 0) / 60);
    const wkAns = week.reduce((n, d) => n + ((s.daily[key(d)] || {}).n || 0), 0);
    const wkOk = week.reduce((n, d) => n + ((s.daily[key(d)] || {}).c || 0), 0);
    const wkGames = games.filter((g) => g.t > now - 7 * DAY).length;
    const daysMet = week.filter((d) => (s.time[key(d)] || 0) >= s.goalMin * 60).length;
    // improvement
    let trend = 'Play a few more games to see a trend.';
    if (games.length >= 6) {
      const first = avg(games.slice(0, 3).map((g) => g.bl)), last = avg(games.slice(-3).map((g) => g.bl));
      const d = first - last;
      trend = d > 0.6 ? `📈 Improving: blunders per game fell from ${first.toFixed(1)} to ${last.toFixed(1)}.` : d < -0.6 ? `📉 Blunders per game rose from ${first.toFixed(1)} to ${last.toFixed(1)}. Keep the Safety Gate on for now.` : `➡️ Steady at about ${last.toFixed(1)} blunders per game.`;
    }
    // skills
    const modes = Object.keys(s.stats).map((k) => ({ k, a: s.stats[k].a, c: s.stats[k].c, p: s.stats[k].a ? s.stats[k].c / s.stats[k].a : null }));
    const ranked = modes.filter((m) => m.a >= 5).sort((x, y) => x.p - y.p);
    const weakest = ranked[0];
    // mistake kinds
    const kinds = {};
    for (const v of s.vault) if (v.kind) kinds[v.kind] = (kinds[v.kind] || 0) + 1;
    const kindTotal = Object.values(kinds).reduce((x, y) => x + y, 0);
    // advice
    const tips = [];
    if (!wkGames) tips.push('No games this week. Ask him to play one game vs the bot, with the Safety Gate on.');
    if (wkMin < s.goalMin * 3) tips.push(`Practice time is light (${wkMin} min this week). Aim for ${s.goalMin} minutes on most days. Short and often works best.`);
    if (weakest) tips.push(ADVICE[weakest.k]);
    const topKind = Object.keys(kinds).sort((x, y) => kinds[y] - kinds[x])[0];
    if (topKind) tips.push(`Most common real mistake: <b>${KIND[topKind].toLowerCase()}</b>. Ask him after each academy game: "which piece was in danger and did you notice?"`);
    if (s.vault.filter((v) => !(v.due > now)).length >= 5) tips.push('The Mistakes Vault has positions waiting. 5 minutes there is worth more than a new game.');
    if (!s.imports.length) tips.push('Import his chess.com games from the home screen to see which mistakes cost him pieces in real games.');
    tips.push('Off-screen habit: hands in his lap until he has asked "what does my opponent want?" before each move.');

    app.innerHTML = `
      <div class="card"><div class="mascot-row"><div class="mascot">📋</div><div class="bubble"><b>Parent dashboard</b> · ${rankLine(s)}<br><span style="font-weight:500">${trend}</span></div></div></div>
      <div class="grid2 mt">
        <div class="card"><h3>⏱ This week</h3><div style="font-size:2rem;font-weight:800">${wkMin} min</div><div>${daysMet} of 7 days reached ${s.goalMin} min</div></div>
        <div class="card"><h3>🧩 Challenges</h3><div style="font-size:2rem;font-weight:800">${wkAns}</div><div>${wkAns ? Math.round((wkOk / wkAns) * 100) + '% correct' : 'None yet'}</div></div>
        <div class="card"><h3>♟️ Games</h3><div style="font-size:2rem;font-weight:800">${wkGames}</div><div>${games.length} in total · 🔥 ${s.streak}-day streak</div></div>
        <div class="card"><h3>🚪 Safety Gate${s.advanced ? ' · 🧠' : ''}</h3><div style="font-size:2rem;font-weight:800">Level ${'ABCD'[s.gate.level]}</div><div>${s.gate.recent.length ? 'Last ' + s.gate.recent.length + ' checks: ' + Math.round(avg(s.gate.recent) * 100) + '% right' : 'No checks yet'}</div></div>
      </div>
      <h2 class="mt">Blunders per game</h2>
      <div class="card">${recent.length ? `<div style="display:flex;gap:6px;align-items:flex-end;height:120px">${recent.map((g) => `<div style="flex:1;text-align:center" title="${g.src === 'bot' ? 'vs bot' : 'real game'}, ${g.res}, ${g.moves} moves"><div style="background:${g.bl ? 'var(--warn)' : 'var(--good)'};height:${6 + (g.bl / maxBl) * 90}px;border-radius:6px 6px 0 0"></div><small>${g.bl}</small><div>${g.src === 'bot' ? '🎮' : '🌐'}</div></div>`).join('')}</div><small style="color:var(--muted)">🎮 vs bot · 🌐 real game · oldest → newest. Goal: a steady drop.</small>` : 'No games yet.'}</div>
      <h2 class="mt">Skills</h2>
      <div class="card">${modes.map((m) => `<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><span style="width:200px">${BB.MODES[m.k].icon} ${BB.MODES[m.k].title}</span><div class="bar" style="flex:1"><i style="width:${m.a ? Math.round(m.p * 100) : 0}%;background:${weakest && weakest.k === m.k ? 'var(--warn)' : 'var(--good)'}"></i></div><span style="width:90px;text-align:right">${m.a ? Math.round(m.p * 100) + '% (' + m.a + ')' : '–'}</span></div>`).join('')}
        ${weakest ? `<div class="tip" style="color:var(--brand);font-weight:700;margin-top:6px">Weakest so far: ${BB.MODES[weakest.k].title}</div>` : '<small style="color:var(--muted)">Needs 5+ attempts per game to rank.</small>'}</div>
      <h2 class="mt">Where his pieces get lost</h2>
      <div class="card">${kindTotal ? Object.keys(kinds).sort((x, y) => kinds[y] - kinds[x]).map((k) => `<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><span style="width:240px">${KIND[k]}</span><div class="bar" style="flex:1"><i style="width:${Math.round(kinds[k] / kindTotal * 100)}%;background:var(--warn)"></i></div><span>${kinds[k]}</span></div>`).join('') + `<small style="color:var(--muted)">From imported real games (${s.vault.length} saved vault positions, ${s.vault.filter((v) => (v.box || 0) >= 4).length} mastered).</small>` : 'Import real games to see this breakdown.'}</div>
      <h2 class="mt">Last 14 days</h2>
      <div class="card"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">${days.map((d) => {
        const k = key(d), n = (s.daily[k] || {}).n || 0, m = Math.round((s.time[k] || 0) / 60);
        const lvl = m >= s.goalMin || n >= 10 ? 3 : m >= 5 || n >= 4 ? 2 : m || n ? 1 : 0;
        return `<div title="${d.toDateString()}: ${m} min, ${n} challenges" style="text-align:center;padding:8px 2px;border-radius:10px;background:${['#eef0fb', '#c8f0d8', '#6fd29a', '#2fb36d'][lvl]};color:${lvl === 3 ? '#fff' : 'var(--ink)'}"><small>${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]}</small><div style="font-weight:800">${m}m</div></div>`;
      }).join('')}</div></div>
      <h2 class="mt">Suggestions</h2>
      <div class="card"><ul style="margin:0;padding-left:20px;line-height:1.6">${tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      <h2 class="mt noprint">Advanced mistake catcher</h2>
      <div class="card noprint" style="border:2px solid ${s.advanced ? 'var(--good)' : '#dfe3f5'}">
        <div class="controls" style="align-items:center"><button class="big ${s.advanced ? 'green' : 'amber'}" data-act="padv">${s.advanced ? '🧠 ON. Tap to turn off' : '🧠 OFF. Tap to turn on'}</button></div>
        <p style="margin:10px 0 0">When ON, besides pieces that can be taken right away, it also catches <b>forks</b> (one move attacks two pieces), <b>pins</b>, <b>skewers</b> and <b>discovered attacks</b>. It is used in the Safety Gate (as a warning), the post-game review, the Mistakes Vault, and imported games.</p>
        <p style="margin:6px 0 0;color:var(--muted);font-size:.92rem">Imported games are checked against the move the opponent actually played, so it only reports tactics that really happened. In bot games and the vault it checks every possible reply. Tip: after turning it on, open <b>Import real games</b> and tick "Re-check games I already imported".</p>
      </div>
      <h2 class="mt noprint">Settings</h2>
      <div class="card noprint">
        <div class="controls">Daily practice goal:
          ${[10, 15, 20, 30].map((m) => `<button class="chipbtn ${s.goalMin === m ? 'on' : ''}" data-act="pgoal" data-v="${m}">${m} min</button>`).join('')}</div>
        <div class="controls mt"><button class="ghost" data-act="pprint">🖨 Print / save as PDF</button><button class="ghost" data-act="pexport">⬇ Back up progress</button>
          <label class="ghost" style="cursor:pointer">⬆ Restore backup<input type="file" id="pfile" accept="application/json,.json" style="display:none"></label>
          <button class="ghost" data-act="reset">Reset everything</button></div>
        <div id="pmsg" style="margin-top:8px;color:var(--muted)">Progress lives in this browser only. Back it up now and then, especially before clearing browser data.</div>
      </div>
      <div class="center mt noprint"><button class="ghost" data-act="home">⬅ Home</button></div>`;
    const f = $('#pfile');
    if (f) f.onchange = restore;
  }
  const rankLine = (s) => `${BB.rankOf(s.xp).e} ${BB.rankOf(s.xp).name} · ${s.xp} XP`;

  H.padv = () => { BB.setAdvanced(!S().advanced); dashboard(); };
  H.pgoal = (t) => { S().goalMin = +t.dataset.v; BB.save(); dashboard(); };
  H.pprint = () => window.print();
  H.pexport = () => {
    const blob = new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blunder-buster-backup-${BB.today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('#pmsg').textContent = 'Backup file saved to your Downloads folder.';
  };
  function restore(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (!o || typeof o.xp !== 'number' || !o.stats) throw new Error('not a Blunder Buster backup');
        if (!confirm('Replace the current progress with this backup?')) return;
        localStorage.setItem(KEY, JSON.stringify(o));
        BB.load();
        dashboard();
        $('#pmsg').textContent = 'Backup restored. ✅';
      } catch (err) { $('#pmsg').textContent = 'That file could not be restored: ' + err.message; }
    };
    r.readAsText(file);
  }
})();

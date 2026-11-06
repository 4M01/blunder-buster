/* Tiny chess engine + puzzle generators for Blunder Buster.
   No dependencies. Works in the browser (window.Chess) and in Node (module.exports). */
(function (root) {
  'use strict';

  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const FILES = 'abcdefgh';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w';

  const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
  const colorOf = (ch) => (ch === ch.toUpperCase() ? 'w' : 'b');
  const typeOf = (ch) => ch.toLowerCase();
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const colorWord = (c) => (c === 'w' ? 'white' : 'black');

  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const START_FULL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  const sqIdx = (s) => (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);

  function fromFEN(fen) {
    const [pos, turn, cr, ep] = fen.split(' ');
    const b = [];
    for (const row of pos.split('/')) {
      for (const ch of row) {
        if (/\d/.test(ch)) for (let k = 0; k < +ch; k++) b.push(null);
        else b.push(ch);
      }
    }
    return { b, turn: turn || 'w', cr: cr && cr !== '-' ? cr : '', ep: ep && ep !== '-' ? sqIdx(ep) : -1, hm: 0 };
  }

  function toFEN(st) {
    let out = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let c = 0; c < 8; c++) {
        const ch = st.b[r * 8 + c];
        if (!ch) empty++;
        else { if (empty) { row += empty; empty = 0; } row += ch; }
      }
      if (empty) row += empty;
      out.push(row);
    }
    return out.join('/') + ' ' + st.turn + ' ' + (st.cr || '-') + ' ' + (st.ep >= 0 ? sqName(st.ep) : '-');
  }

  // Squares a piece "attacks" (includes squares holding its own pieces = defended).
  function attackSquares(b, i) {
    const ch = b[i], t = typeOf(ch), r = i >> 3, c = i & 7, out = [];
    if (t === 'p') {
      const dr = ch === 'P' ? -1 : 1;
      for (const dc of [-1, 1]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) out.push(nr * 8 + nc);
      }
      return out;
    }
    if (t === 'n' || t === 'k') {
      for (const [dr, dc] of (t === 'n' ? KN : KG)) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) out.push(nr * 8 + nc);
      }
      return out;
    }
    const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const j = nr * 8 + nc;
        out.push(j);
        if (b[j]) break;
        nr += dr; nc += dc;
      }
    }
    return out;
  }

  function attackersOf(b, sq, by) {
    const res = [];
    for (let i = 0; i < 64; i++) {
      const ch = b[i];
      if (!ch || colorOf(ch) !== by) continue;
      if (attackSquares(b, i).indexOf(sq) >= 0) res.push(i);
    }
    return res;
  }

  // Fast reverse lookup: is `sq` attacked by any piece of colour `by`?
  function isAttacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7, w = by === 'w';
    const pr = w ? r + 1 : r - 1, pch = w ? 'P' : 'p';
    if (pr >= 0 && pr < 8) {
      if (c > 0 && b[pr * 8 + c - 1] === pch) return true;
      if (c < 7 && b[pr * 8 + c + 1] === pch) return true;
    }
    const n = w ? 'N' : 'n', k = w ? 'K' : 'k';
    for (const [dr, dc] of KN) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === n) return true;
    }
    for (const [dr, dc] of KG) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === k) return true;
    }
    const bb = w ? 'B' : 'b', rr = w ? 'R' : 'r', qq = w ? 'Q' : 'q';
    for (const [dr, dc] of DIAG) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[nr * 8 + nc];
        if (p) { if (p === bb || p === qq) return true; break; }
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of ORTH) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[nr * 8 + nc];
        if (p) { if (p === rr || p === qq) return true; break; }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  function inCheck(b, color) {
    const ks = b.indexOf(color === 'w' ? 'K' : 'k');
    if (ks < 0) return false;
    return isAttacked(b, ks, other(color));
  }

  function pseudoMoves(st) {
    const b = st.b, color = st.turn, out = [];
    for (let i = 0; i < 64; i++) {
      const ch = b[i];
      if (!ch || colorOf(ch) !== color) continue;
      const t = typeOf(ch), r = i >> 3, c = i & 7;
      if (t === 'p') {
        const dr = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const lastRow = color === 'w' ? 0 : 7;
        const nr = r + dr;
        if (nr >= 0 && nr < 8 && !b[nr * 8 + c]) {
          out.push({ from: i, to: nr * 8 + c, promo: nr === lastRow });
          if (r === startRow && !b[(nr + dr) * 8 + c]) out.push({ from: i, to: (nr + dr) * 8 + c, dbl: true });
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc > 7 || nr < 0 || nr > 7) continue;
          const j = nr * 8 + nc;
          if (b[j] && colorOf(b[j]) !== color) out.push({ from: i, to: j, promo: nr === lastRow });
          else if (!b[j] && st.ep === j) out.push({ from: i, to: j, ep: true });
        }
      } else {
        for (const j of attackSquares(b, i)) {
          if (!b[j] || colorOf(b[j]) !== color) out.push({ from: i, to: j });
        }
      }
    }
    // Castling
    const cr = st.cr || '';
    if (cr) {
      const w = color === 'w', opp = other(color);
      const k0 = w ? 60 : 4, rook = w ? 'R' : 'r', king = w ? 'K' : 'k';
      if (b[k0] === king && !isAttacked(b, k0, opp)) {
        if (cr.indexOf(w ? 'K' : 'k') >= 0 && !b[k0 + 1] && !b[k0 + 2] && b[k0 + 3] === rook &&
          !isAttacked(b, k0 + 1, opp) && !isAttacked(b, k0 + 2, opp)) out.push({ from: k0, to: k0 + 2, castle: 'K' });
        if (cr.indexOf(w ? 'Q' : 'q') >= 0 && !b[k0 - 1] && !b[k0 - 2] && !b[k0 - 3] && b[k0 - 4] === rook &&
          !isAttacked(b, k0 - 1, opp) && !isAttacked(b, k0 - 2, opp)) out.push({ from: k0, to: k0 - 2, castle: 'Q' });
      }
    }
    return out;
  }

  const CR_LOSS = { 60: 'KQ', 63: 'K', 56: 'Q', 4: 'kq', 7: 'k', 0: 'q' };

  function applyMove(st, m) {
    const b = st.b.slice();
    let p = b[m.from];
    const wasPawn = typeOf(p) === 'p', wasCap = !!b[m.to] || m.ep;
    if (m.promo) p = colorOf(p) === 'w' ? 'Q' : 'q';
    b[m.to] = p;
    b[m.from] = null;
    if (m.ep) b[m.to + (colorOf(p) === 'w' ? 8 : -8)] = null;
    if (m.castle) {
      if (m.castle === 'K') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
      else { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    }
    let cr = st.cr || '';
    if (cr) {
      const lose = (CR_LOSS[m.from] || '') + (CR_LOSS[m.to] || '');
      for (const ch of lose) cr = cr.replace(ch, '');
    }
    return { b, turn: other(st.turn), cr, ep: m.dbl ? (m.from + m.to) >> 1 : -1, hm: wasPawn || wasCap ? 0 : (st.hm || 0) + 1 };
  }

  function legalMoves(st) {
    const out = [];
    for (const m of pseudoMoves(st)) {
      if (st.b[m.to] && typeOf(st.b[m.to]) === 'k') continue;
      const nb = applyMove(st, m);
      if (!inCheck(nb.b, st.turn)) out.push(m);
    }
    return out;
  }

  // ---------- Static exchange evaluation (with x-rays, by really removing pieces) ----------
  function cheapest(bb, sq, s) {
    let best = -1, bv = 1e9;
    for (const f of attackersOf(bb, sq, s)) {
      const v = VAL[typeOf(bb[f])];
      if (v < bv) { bv = v; best = f; }
    }
    return best;
  }

  function captureGain(bb, sq, s, from) {
    const victim = VAL[typeOf(bb[sq])];
    const mover = bb[from], saved = bb[sq];
    bb[sq] = mover; bb[from] = null;
    let g;
    if (typeOf(mover) === 'k' && attackersOf(bb, sq, other(s)).length) g = -1000;
    else g = victim - seeRec(bb, sq, other(s));
    bb[from] = mover; bb[sq] = saved;
    return g;
  }

  function seeRec(bb, sq, s) {
    const from = cheapest(bb, sq, s);
    if (from < 0) return 0;
    return Math.max(0, captureGain(bb, sq, s, from));
  }

  // Best net material gain for `side` capturing on sq (>= 0).
  function seeBest(b, sq, side) {
    if (!b[sq] || typeOf(b[sq]) === 'k') return 0;
    return seeRec(b.slice(), sq, side);
  }

  // The sequence of captures on sq, starting with `from`.
  function pvLine(b, sq, side, from) {
    const bb = b.slice();
    const steps = [];
    let s = side, f = from, net = 0, first = true;
    for (let guard = 0; guard < 20; guard++) {
      if (f == null || f < 0) break;
      if (!first && captureGain(bb, sq, s, f) <= 0) break;
      const victim = bb[sq], mover = bb[f];
      const val = VAL[typeOf(victim)];
      steps.push({ side: s, mover, victim, from: f, to: sq, value: val });
      net += s === side ? val : -val;
      bb[sq] = mover; bb[f] = null;
      s = other(s); f = cheapest(bb, sq, s); first = false;
    }
    return { steps, net };
  }

  // Pieces of `color` that the opponent could capture and come out ahead.
  function hangingPieces(st, color) {
    const b = st.b, e = other(color), out = [];
    for (let i = 0; i < 64; i++) {
      const ch = b[i];
      if (!ch || colorOf(ch) !== color || typeOf(ch) === 'k') continue;
      const att = attackersOf(b, i, e);
      if (!att.length) continue;
      const gain = seeBest(b, i, e);
      if (gain <= 0) continue;
      const legal = att.filter((f) => {
        const nb = b.slice(); nb[i] = nb[f]; nb[f] = null;
        return !inCheck(nb, e);
      });
      if (!legal.length) continue;
      legal.sort((x, y) => VAL[typeOf(b[x])] - VAL[typeOf(b[y])]);
      out.push({ sq: i, gain, attackers: att, defenders: attackersOf(b, i, color), legal });
    }
    out.sort((x, y) => y.gain - x.gain);
    return out;
  }

  // ---------- Random number helpers ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  // ---------- Position generator ----------
  function isSensible(st, m) {
    const after = applyMove(st, m);
    return seeBest(after.b, m.to, other(st.turn)) === 0;
  }

  // ---------- Opening book (common lines kids meet; used for puzzle positions and the bot) ----------
  const OPENINGS = [
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4 c3d4 c5b4',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5 d8e7',
    'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6 f1b5 f8b4 e1g1 e8g8',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8',
    'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 f8d6 f4g3 e8g8',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
    'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5',
    'e2e4 e7e5 b1c3 g8f6 f2f4 d7d5 f4e5 f6e4',
    'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5',
    'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 f2f3 f8g7 c1e3 e8g8',
    'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7 d2d4 e8g8',
    'e2e4 e7e5 f1c4 g8f6 d2d3 f8c5 g1f3 d7d6 c2c3 a7a6',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 c6a5 c4b5 c7c6',
  ].map((s) => s.split(' '));

  function uci(st, u) {
    const from = sqIdx(u.slice(0, 2)), to = sqIdx(u.slice(2, 4));
    return legalMoves(st).find((x) => x.from === from && x.to === to) || null;
  }
  function bookPosition(rng, plies) {
    const line = OPENINGS[Math.floor(rng() * OPENINGS.length)];
    const want = Math.min(plies, 4 + 2 * Math.floor(rng() * 5), line.length - (line.length % 2));
    let st = fromFEN(START);
    for (let i = 0; i < want; i++) {
      const m = uci(st, line[i]);
      if (!m) return null;
      st = applyMove(st, m);
    }
    return { st, used: want };
  }
  let BOOK = null;
  function bookMove(st, rng) {
    if (!BOOK) {
      BOOK = {};
      for (const line of OPENINGS) {
        let s = fromFEN(START_FULL);
        for (const u of line) {
          const m = uci(s, u);
          if (!m) break;
          const k = posKey(s);
          (BOOK[k] = BOOK[k] || []);
          if (BOOK[k].indexOf(u) < 0) BOOK[k].push(u);
          s = applyMove(s, m);
        }
      }
    }
    const arr = BOOK[posKey(st)];
    if (!arr) return null;
    return uci(st, arr[Math.floor(rng() * arr.length)]);
  }

  function randomPosition(rng, plies) {
    let st = fromFEN(START), startAt = 0;
    if (rng() < 0.65) {
      const bp = bookPosition(rng, plies);
      if (bp) { st = bp.st; startAt = bp.used; }
    }
    for (let i = startAt; i < plies; i++) {
      const moves = legalMoves(st);
      if (!moves.length) return null;
      let chosen = moves[Math.floor(rng() * moves.length)];
      if (rng() < 0.55) {
        for (let tries = 0; tries < 8; tries++) {
          const m = moves[Math.floor(rng() * moves.length)];
          if (isSensible(st, m)) { chosen = m; break; }
        }
      }
      st = applyMove(st, chosen);
    }
    if (st.turn !== 'w') return null;
    if (inCheck(st.b, 'w') || inCheck(st.b, 'b')) return null;
    let n = 0;
    for (const ch of st.b) if (ch) n++;
    if (n < 12) return null;
    return st;
  }

  function newPosition(rng, minPlies, maxPlies) {
    for (let k = 0; k < 200; k++) {
      const plies = 2 * (Math.floor(minPlies / 2) + Math.floor(rng() * ((maxPlies - minPlies) / 2 + 1)));
      const st = randomPosition(rng, plies);
      if (st) return st;
    }
    return fromFEN(START);
  }

  // ---------- Puzzle generators ----------
  function genSpot(rng) {
    const r = rng();
    const desired = r < 0.15 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3;
    const focus = rng() < 0.5 ? 'w' : 'b';
    let fallback = null;
    for (let k = 0; k < 400; k++) {
      const st = newPosition(rng, 10, 26);
      const hang = hangingPieces(st, focus);
      if (hang.length === desired) return { type: 'spot', st, focus, hang };
      if (!fallback && hang.length <= 3) fallback = { type: 'spot', st, focus, hang };
    }
    return fallback;
  }

  function genTrade(rng) {
    const want = pick(rng, ['win', 'even', 'lose']);
    let fallback = null;
    for (let k = 0; k < 400; k++) {
      const st = newPosition(rng, 8, 26);
      const caps = legalMoves(st).filter((m) => st.b[m.to]);
      if (!caps.length) continue;
      const m = pick(rng, caps);
      const pv = pvLine(st.b, m.to, 'w', m.from);
      const kind = pv.net > 0 ? 'win' : pv.net === 0 ? 'even' : 'lose';
      const item = {
        type: 'trade', st, move: m, pv, kind,
        attackers: attackersOf(st.b, m.to, 'w').length,
        defenders: attackersOf(st.b, m.to, 'b').length,
      };
      if (kind === want) return item;
      if (!fallback) fallback = item;
    }
    return fallback;
  }

  // Judge a single white move: does it leave something black can win?
  function judgeMove(st, m) {
    const after = applyMove(st, m);
    const hang = hangingPieces(after, 'w');
    const before = hangingPieces(st, 'w');
    let refute = null;
    if (hang.length) {
      const h = hang[0];
      refute = {
        victimSq: h.sq, victim: after.b[h.sq], gain: h.gain,
        move: { from: h.legal[0], to: h.sq },
        mover: after.b[h.legal[0]],
        defenders: h.defenders.length, attackers: h.attackers.length,
        ignoredThreat: before.some((x) => x.sq === h.sq && st.b[h.sq] === after.b[h.sq]),
        movedPieceHangs: h.sq === m.to,
      };
    }
    return { m, after, blunder: hang.length > 0, refute, hang };
  }

  function candidateMoves(st) {
    return legalMoves(st).filter((m) => typeOf(st.b[m.from]) !== 'k');
  }

  function genSafe(rng) {
    const wantBlunder = rng() < 0.5;
    let fallback = null;
    for (let k = 0; k < 300; k++) {
      const st = newPosition(rng, 8, 26);
      const moves = candidateMoves(st);
      if (!moves.length) continue;
      for (let t = 0; t < 6; t++) {
        const j = judgeMove(st, pick(rng, moves));
        const item = { type: 'safe', st, move: j.m, judged: j };
        if (j.blunder === wantBlunder) return item;
        if (!fallback) fallback = item;
      }
    }
    return fallback;
  }

  function genPick(rng) {
    for (let k = 0; k < 400; k++) {
      const st = newPosition(rng, 8, 26);
      const moves = candidateMoves(st);
      if (moves.length < 6) continue;
      const safe = [], bad = [];
      const order = moves.slice().sort(() => rng() - 0.5);
      for (const m of order) {
        const j = judgeMove(st, m);
        if (j.blunder) { if (bad.length < 2) bad.push(j); } else if (safe.length < 1) safe.push(j);
        if (safe.length === 1 && bad.length === 2) break;
      }
      if (safe.length === 1 && bad.length === 2) {
        const options = [safe[0], bad[0], bad[1]].sort(() => rng() - 0.5);
        return { type: 'pick', st, options };
      }
    }
    return null;
  }

  const gen = { spot: genSpot, trade: genTrade, safe: genSafe, pick: genPick };

  // ---------- Full-game helpers (Phase 2) ----------
  const posKey = (st) => st.b.map((x) => x || '.').join('') + st.turn + (st.cr || '') + (st.ep >= 0 ? st.ep : '');

  function gameStatus(st, keys) {
    const moves = legalMoves(st);
    if (!moves.length) return inCheck(st.b, st.turn) ? 'mate' : 'stalemate';
    const pcs = st.b.filter((x) => x && typeOf(x) !== 'k');
    if (!pcs.length || (pcs.length === 1 && 'nb'.indexOf(typeOf(pcs[0])) >= 0)) return 'insufficient';
    if ((st.hm || 0) >= 100) return 'fifty';
    if (keys) { const k = posKey(st); if (keys.filter((x) => x === k).length >= 3) return 'repetition'; }
    return null;
  }

  function san(st, m) {
    const ch = st.b[m.from], t = typeOf(ch);
    let s;
    if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O';
    else {
      const capture = !!st.b[m.to] || m.ep;
      if (t === 'p') s = (capture ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=Q' : '');
      else {
        let dis = '';
        const twins = legalMoves(st).filter((x) => x.to === m.to && x.from !== m.from && st.b[x.from] === ch);
        if (twins.length) dis = twins.some((x) => (x.from & 7) === (m.from & 7)) ? String(8 - (m.from >> 3)) : FILES[m.from & 7];
        s = t.toUpperCase() + dis + (capture ? 'x' : '') + sqName(m.to);
      }
    }
    const after = applyMove(st, m);
    if (inCheck(after.b, after.turn)) s += legalMoves(after).length ? '+' : '#';
    return s;
  }

  // ---------- Advanced mistake catcher: forks, pins, skewers, discovered attacks ----------
  const config = { tactics: false };

  // First two pieces met walking from square i in direction (dr, dc).
  function rayWalk(b, i, dr, dc) {
    const out = [];
    let r = (i >> 3) + dr, c = (i & 7) + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const j = r * 8 + c;
      if (b[j]) { out.push(j); if (out.length === 2) break; }
      r += dr; c += dc;
    }
    return out;
  }

  // Best net material (for V, negative = loss) once V has made its best reply in position `a` (V to move).
  function defenseOutcome(a, V) {
    const moves = legalMoves(a);
    if (!moves.length) return inCheck(a.b, V) ? -99 : 0;
    let best = -99;
    for (const K of orderMoves(a, moves)) {
      const cp = a.b[K.to];
      const gain = cp && typeOf(cp) !== 'k' ? VAL[typeOf(cp)] : 0;
      const rem = hangingPieces(applyMove(a, K), V);
      const net = gain - (rem.length ? rem[0].gain : 0);
      if (net > best) best = net;
      if (best >= -1) break; // adequately defended
    }
    return best;
  }

  // Name the pattern created by opponent move R (position `a` is after R).
  function classifyTactic(before, a, R, V, hang) {
    const b = a.b, opp = other(V), mover = b[R.to], mv = VAL[typeOf(mover)];
    const vic = (sq) => b[sq] && colorOf(b[sq]) === V;
    const hangSq = hang.map((h) => h.sq);
    const ks = b.indexOf(V === 'w' ? 'K' : 'k');
    const targets = [];
    for (const sq of attackSquares(b, R.to)) {
      if (!vic(sq)) continue;
      if (typeOf(b[sq]) === 'k') { targets.push(sq); continue; }
      if (attackersOf(b, sq, V).length === 0 || VAL[typeOf(b[sq])] > mv) targets.push(sq);
    }
    if (targets.length >= 2) return { type: 'fork', squares: targets, mover: R.to };
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== opp) continue;
      const t = typeOf(p);
      if (t !== 'b' && t !== 'r' && t !== 'q') continue;
      for (const [dr, dc] of (t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH))) {
        const h = rayWalk(b, i, dr, dc);
        if (h.length < 2 || !vic(h[0]) || !vic(h[1])) continue;
        const hb = before.b[i] === p ? rayWalk(before.b, i, dr, dc) : [];
        if (hb[0] === h[0] && hb[1] === h[1]) continue; // line already existed
        const [x, y] = h, xt = typeOf(b[x]), yt = typeOf(b[y]);
        if (xt === 'k') { if (yt !== 'k') return { type: 'skewer', squares: [y], pinner: i, front: x, rear: y, mover: R.to }; }
        else if (hangSq.indexOf(x) >= 0 && VAL[yt] > VAL[xt]) return { type: 'pin', squares: [x], pinner: i, front: x, rear: y, mover: R.to };
        else if (hangSq.indexOf(x) >= 0 && VAL[xt] > VAL[yt] && yt !== 'k') return { type: 'skewer', squares: [x, y], pinner: i, front: x, rear: y, mover: R.to };
      }
    }
    const newly = []; let slider = -1;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== opp || i === R.to || before.b[i] !== p) continue;
      const t = typeOf(p);
      if (t !== 'b' && t !== 'r' && t !== 'q') continue;
      const was = attackSquares(before.b, i);
      for (const sq of attackSquares(b, i)) {
        if (was.indexOf(sq) >= 0 || !vic(sq)) continue;
        if (typeOf(b[sq]) === 'k' || hangSq.indexOf(sq) >= 0) { newly.push(sq); slider = i; }
      }
    }
    if (newly.length) return { type: 'discovered', squares: newly, slider, mover: R.to };
    const sq2 = hangSq.slice();
    if (inCheck(b, V) && ks >= 0) sq2.push(ks);
    return { type: 'double', squares: sq2, mover: R.to };
  }

  // Is opponent move R (a quiet move) a tactic V cannot fully parry? `st` has the opponent to move.
  function tacticForMove(st, V, R) {
    if (st.b[R.to]) return null; // captures are covered by the hanging-piece check
    const a = applyMove(st, R);
    const hang = hangingPieces(a, V);
    if (!hang.length && !inCheck(a.b, V)) return null;
    const net = defenseOutcome(a, V);
    if (net > -2) return null;
    const info = classifyTactic(st, a, R, V, hang);
    info.gain = Math.min(-net, 9); info.move = { from: R.from, to: R.to, promo: R.promo };
    return info;
  }

  function findTactics(st, V) {
    const out = [];
    if (st.turn !== other(V)) return out;
    for (const R of legalMoves(st)) { const t = tacticForMove(st, V, R); if (t) out.push(t); }
    out.sort((x, y) => y.gain - x.gain);
    return out;
  }

  // What can the opponent do to `color` after this move? (used by the Safety Gate)
  function dangerAfter(st, m, opts) {
    const after = applyMove(st, m);
    const mover = st.turn, opp = other(mover);
    const hang = hangingPieces(after, mover);
    let mateThreat = false, mateMove = null;
    if (after.turn === opp) {
      for (const m2 of legalMoves(after)) {
        const a2 = applyMove(after, m2);
        if (inCheck(a2.b, mover) && legalMoves(a2).length === 0) { mateThreat = true; mateMove = m2; break; }
      }
    }
    const squares = hang.map((h) => h.sq);
    const ks = after.b.indexOf(mover === 'w' ? 'K' : 'k');
    if (mateThreat && ks >= 0) squares.push(ks);
    const simple = squares.slice();
    let tactics = [];
    const useT = opts && opts.tactics !== undefined ? opts.tactics : config.tactics;
    if (useT && !simple.length && after.turn === opp) {
      tactics = findTactics(after, mover);
      if (tactics.length) for (const q of tactics[0].squares) if (squares.indexOf(q) < 0) squares.push(q);
    }
    return { after, hang, mateThreat, mateMove, squares, simple, tactics };
  }

  // ---------- Simple bot ----------
  const PV = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  function evalW(st) {
    let s = 0;
    const b = st.b;
    for (let i = 0; i < 64; i++) {
      const ch = b[i];
      if (!ch) continue;
      const t = typeOf(ch), w = ch === ch.toUpperCase(), r = i >> 3, c = i & 7;
      let v = PV[t];
      const center = 3.5 - Math.abs(c - 3.5) + (3.5 - Math.abs(r - 3.5));
      if (t === 'p') { v += center * 3 + (w ? (6 - r) : (r - 1)) * 4; }
      else if (t === 'n' || t === 'b') { v += center * 6; if (r !== (w ? 7 : 0)) v += 12; }
      else if (t === 'q') { v += center * 1; }
      else if (t === 'k') { if ((w && r === 7 && (c === 6 || c === 2)) || (!w && r === 0 && (c === 6 || c === 2))) v += 35; }
      s += w ? v : -v;
    }
    return s;
  }
  const MATE = 100000;
  function orderMoves(st, moves) {
    return moves.map((m) => {
      const victim = st.b[m.to] ? PV[typeOf(st.b[m.to])] : 0;
      return { m, k: victim ? victim * 10 - PV[typeOf(st.b[m.from])] : 0 };
    }).sort((x, y) => y.k - x.k).map((x) => x.m);
  }
  function qsearch(st, alpha, beta, depth) {
    const sign = st.turn === 'w' ? 1 : -1;
    const stand = sign * evalW(st);
    if (depth <= 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const caps = orderMoves(st, legalMoves(st).filter((m) => st.b[m.to] || m.ep));
    for (const m of caps) {
      const sc = -qsearch(applyMove(st, m), -beta, -alpha, depth - 1);
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function search(st, depth, alpha, beta, ply) {
    const moves = legalMoves(st);
    if (!moves.length) return inCheck(st.b, st.turn) ? -MATE + ply : 0;
    if (depth <= 0) return qsearch(st, alpha, beta, 3);
    for (const m of orderMoves(st, moves)) {
      const sc = -search(applyMove(st, m), depth - 1, -beta, -alpha, ply + 1);
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  // level: 'friendly' | 'tricky' | 'sharp'
  function botMove(st, level, rng) {
    rng = rng || Math.random;
    const moves = legalMoves(st);
    if (!moves.length) return null;
    const me = st.turn, sign = me === 'w' ? 1 : -1;
    const bm = bookMove(st, rng);
    if (bm && rng() < 0.9) return bm;
    // Always take a mate in one.
    for (const m of moves) {
      const a = applyMove(st, m);
      if (inCheck(a.b, a.turn) && legalMoves(a).length === 0) return m;
    }
    if (level === 'friendly') {
      // Ruthless about free pieces (most of the time), otherwise a little careless.
      const free = hangingPieces(st, other(me));
      if (free.length && rng() < 0.92) {
        const cm = moves.find((m) => m.from === free[0].legal[0] && m.to === free[0].sq);
        if (cm) return cm;
      }
      let best = null, bs = -1e9;
      for (const m of moves) {
        const a = applyMove(st, m);
        let sc = sign * evalW(a) + (rng() - 0.5) * 140;
        if (rng() < 0.75) { const h = hangingPieces(a, me); if (h.length) sc -= h[0].gain * 100; }
        if (sc > bs) { bs = sc; best = m; }
      }
      return best;
    }
    const depth = level === 'sharp' ? 3 : 2, noise = level === 'sharp' ? 6 : 28;
    let best = null, bs = -1e9;
    for (const m of orderMoves(st, moves)) {
      const sc = -search(applyMove(st, m), depth - 1, -1e9, 1e9, 1) + (rng() - 0.5) * noise;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }

  const API = {
    VAL, NAME, FILES, START, START_FULL, sqName, sqIdx, colorOf, typeOf, other, colorWord,
    fromFEN, toFEN, attackSquares, attackersOf, isAttacked, inCheck, legalMoves, applyMove,
    seeBest, pvLine, hangingPieces, judgeMove, mulberry32, hashStr, gen, newPosition,
    posKey, gameStatus, san, dangerAfter, evalW, botMove, candidateMoves, OPENINGS, uci, bookMove,
    config, findTactics, tacticForMove,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Chess = API;
})(typeof window !== 'undefined' ? window : globalThis);

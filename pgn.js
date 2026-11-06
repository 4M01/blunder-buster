/* PGN reading + mistake finder for imported games (chess.com or any PGN). */
(function (root) {
  'use strict';
  const C = root.Chess || (typeof require !== 'undefined' ? require('./engine.js') : null);

  function splitGames(text) {
    text = String(text || '').replace(/\r/g, '');
    const parts = text.split(/(?=^\[Event\s+")/m).map((s) => s.trim()).filter(Boolean);
    return parts.map((p) => {
      const headers = {};
      p.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { headers[k] = v; return ''; });
      const body = p.replace(/^(\[[^\]]*\]\s*)+/, '');
      return { headers, tokens: tokenize(body) };
    }).filter((g) => g.tokens.length);
  }

  function tokenize(body) {
    let s = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    for (let i = 0; i < 6; i++) s = s.replace(/\([^()]*\)/g, ' ');
    s = s.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ');
    return s.split(/\s+/).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  }

  function resolveSAN(st, token) {
    const t = token.replace(/[+#!?]/g, '').replace(/0/g, 'O');
    const moves = C.legalMoves(st);
    if (t === 'O-O' || t === 'O-O-O') {
      const kind = t === 'O-O' ? 'K' : 'Q';
      return moves.find((m) => m.castle === kind) || null;
    }
    const r = /^([NBRQK])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([QRBN]))?$/.exec(t);
    if (!r) return null;
    const type = (r[1] || 'P').toLowerCase(), to = C.sqIdx(r[4]);
    const cands = moves.filter((m) => {
      if (m.to !== to || C.typeOf(st.b[m.from]) !== type) return false;
      if (r[2] && C.FILES[m.from & 7] !== r[2]) return false;
      if (r[3] && String(8 - (m.from >> 3)) !== r[3]) return false;
      return true;
    });
    if (r[5] && r[5] !== 'Q') return null; // under-promotion not supported
    return cands.length === 1 ? cands[0] : cands[0] || null;
  }

  // Replay a parsed game. Returns { ok, plies, error }.
  function replay(game) {
    let st = C.fromFEN(C.START_FULL);
    const plies = [];
    for (const tok of game.tokens) {
      const m = resolveSAN(st, tok);
      if (!m) return { ok: plies.length > 0, plies, error: `Could not read move "${tok}"` };
      plies.push({ before: st, m, san: C.san(st, m), mover: st.turn });
      st = C.applyMove(st, m);
    }
    return { ok: true, plies, end: st };
  }

  // Find the moves by `side` that let the opponent win something.
  function analyze(plies, side) {
    const out = [];
    plies.forEach((p, i) => {
      if (p.mover !== side) return;
      const d = C.dangerAfter(p.before, p.m, { tactics: false });
      const next = plies[i + 1];
      if (!d.squares.length) {
        // Advanced catcher: did the opponent's actual reply spring a fork / pin / skewer / discovered attack?
        const tac = C.config.tactics && next ? C.tacticForMove(next.before, side, next.m) : null;
        if (!tac) return;
        out.push({
          ply: i, no: Math.floor(i / 2) + 1, san: p.san, from: p.m.from, to: p.m.to, fen: C.toFEN(p.before), side,
          squares: tac.squares.slice(), kind: tac.type, tactic: true, punished: true,
          reply: { from: next.m.from, to: next.m.to }, gain: tac.gain,
        });
        return;
      }
      let punished = false;
      if (next) {
        if (d.hang.length) punished = d.hang.some((h) => next.m.to === h.sq && h.attackers.indexOf(next.m.from) >= 0);
        if (!punished && d.mateMove) punished = next.m.from === d.mateMove.from && next.m.to === d.mateMove.to;
      }
      const prior = C.hangingPieces(p.before, side);
      const ignored = d.hang.some((h) => prior.some((q) => q.sq === h.sq) && p.before.b[h.sq] === d.after.b[h.sq]);
      const kind = d.hang.length ? (d.squares.indexOf(p.m.to) >= 0 ? 'moved' : ignored ? 'ignored' : 'weakened') : 'mate';
      out.push({
        ply: i, no: Math.floor(i / 2) + 1, san: p.san, from: p.m.from, to: p.m.to, fen: C.toFEN(p.before), side,
        squares: d.squares.slice(), kind, punished,
        reply: d.hang.length ? { from: d.hang[0].legal[0], to: d.hang[0].sq } : d.mateMove ? { from: d.mateMove.from, to: d.mateMove.to } : null,
        gain: d.hang.length ? d.hang[0].gain : 9,
      });
    });
    return out;
  }

  // Which colour was the user? Returns 'w', 'b' or null.
  function sideFor(headers, username) {
    const u = (username || '').trim().toLowerCase();
    if (!u) return null;
    if ((headers.White || '').toLowerCase() === u) return 'w';
    if ((headers.Black || '').toLowerCase() === u) return 'b';
    return null;
  }

  function resultFor(headers, side) {
    const r = headers.Result;
    if (r === '1/2-1/2') return 'draw';
    if ((r === '1-0' && side === 'w') || (r === '0-1' && side === 'b')) return 'win';
    if (r === '1-0' || r === '0-1') return 'loss';
    return 'draw';
  }

  const API = { splitGames, tokenize, resolveSAN, replay, analyze, sideFor, resultFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PGN = API;
})(typeof window !== 'undefined' ? window : globalThis);

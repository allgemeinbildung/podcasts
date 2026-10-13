/* Podcast animation kit — shared by every episode.
 *
 * Look: simplified paper cut-out. Every element is a scissor-cut piece (irregular edge,
 * white rim, hard shadow, slight tilt), motion is stepped at 12 fps, annotations are
 * handwritten. An episode is data only: chapters → shots → one template per shot,
 * every beat with a resolved time `at` (the build turns word anchors into seconds).
 *
 * Templates: statement · icons · split · cycle · map (closing podcasts: a walk through the mindmap).
 * Kit.build(svg, episode) → { render, chapters }
 */
window.Kit = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#22252e', KRAFT = '#eadfc8', PAPER = '#fffdf6', GREY = '#767b88';
  const COL = { ink: INK, white: PAPER, red: '#d8483f', blue: '#2d6cb0', green: '#2e9a6a', yellow: '#f3b72e', grey: GREY };
  const SANS = "'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif";
  const HAND = "'Caveat', 'Segoe Print', cursive";
  const W = 1600, H = 900, AX0 = 60, AY1 = 860;
  let AX1 = 1240, ACX = 650; // scene area: left of the Merkzettel, or the full stage when an episode has none

  // ---------- small helpers ----------
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const outBackSoft = p => { const c1 = 1.1, c3 = c1 + 1, q = p - 1; return 1 + c3 * q * q * q + c1 * q * q; };
  const outCubic = p => 1 - Math.pow(1 - p, 3);
  const light = c => c === PAPER || c === COL.yellow;

  let STAGE, MEASURE, CUR, seedN, EP, MAPT;

  function txt(p, str, x, y, o) {
    o = o || {};
    const n = el('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-size': o.size || 40, fill: o.fill || INK, 'font-family': o.hand ? HAND : SANS, 'font-weight': o.weight || (o.hand ? 700 : 800) }, p);
    n.textContent = str;
    return n;
  }
  // real text width (the stage is rendered while building); falls back to an estimate
  function textW(str, size, hand) {
    const n = txt(MEASURE, str, 0, 0, { size, hand });
    let w = 0;
    try { w = n.getComputedTextLength(); } catch (e) { /* not rendered */ }
    MEASURE.removeChild(n);
    return w > 0 ? w : str.length * size * (hand ? 0.42 : 0.58);
  }
  function P(g, d, o) { o = o || {}; return el('path', { d, fill: o.fill || 'none', stroke: o.stroke === undefined ? INK : o.stroke, 'stroke-width': o.sw || 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g); }
  const L = (g, x1, y1, x2, y2, o) => P(g, 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2, o);
  const C = (g, cx, cy, r, o) => { o = o || {}; return el('circle', { cx, cy, r, fill: o.fill || 'none', stroke: o.stroke === undefined ? INK : o.stroke, 'stroke-width': o.sw || 6 }, g); };
  const R = (g, x, y, w, h, o) => { o = o || {}; return el('rect', { x, y, width: w, height: h, rx: o.rx || 0, fill: o.fill || 'none', stroke: o.stroke === undefined ? INK : o.stroke, 'stroke-width': o.sw || 6, 'stroke-linejoin': 'round' }, g); };

  // ---------- cut-out primitives ----------
  const poly = pts => 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') + ' Z';
  function sheetPts(w, h, r) { // a hand-cut rectangle
    const j = Math.min(7, h * 0.07), x = w / 2, y = h / 2, k = () => (r() - 0.5) * 2 * j;
    return [[-x + k(), -y + k()], [k() * 3, -y + k() * 0.5], [x + k(), -y + k()], [x + k() * 0.5, k() * 2], [x + k(), y + k()], [k() * 3, y + k() * 0.5], [-x + k(), y + k()], [-x + k() * 0.5, k() * 2]];
  }
  function blobPts(rad, r) { // a hand-cut disc
    const pts = [], n = 18;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, q = rad * (1 + (r() - 0.5) * 0.07); pts.push([Math.cos(a) * q, Math.sin(a) * q]); }
    return pts;
  }
  function piece(g, pts, fill, o) {
    o = o || {};
    const d = typeof pts === 'string' ? pts : poly(pts), rim = fill === PAPER ? 0 : (o.rim || 12);
    el('path', { d, fill: INK, stroke: INK, 'stroke-width': rim, 'stroke-linejoin': 'round', opacity: 0.2, transform: 'translate(5,8)' }, g);
    if (rim) el('path', { d, fill: PAPER, stroke: PAPER, 'stroke-width': rim, 'stroke-linejoin': 'round' }, g);
    return el('path', { d, fill }, g);
  }
  function tape(g, x, y, rot) { el('rect', { x: -44, y: -15, width: 88, height: 30, fill: '#f0d98a', opacity: 0.82, transform: 'translate(' + x + ',' + y + ') rotate(' + rot + ')' }, g); }

  // ---------- glyphs (centred on 0,0, about 110 px, drawn in ink on the paper disc) ----------
  const G = {
    coin(g, r) { r = r || 28; C(g, 0, 0, r, { fill: COL.yellow, sw: 5 }); C(g, 0, 0, r * 0.6, { stroke: '#c98d12', sw: 3 }); },
    payslip(g) { R(g, -36, -48, 72, 96, { rx: 6, fill: '#fff' }); L(g, -22, -26, 22, -26, { sw: 5 }); L(g, -22, -8, 10, -8, { sw: 5, stroke: GREY }); L(g, -22, 10, 22, 10, { sw: 5, stroke: GREY }); L(g, -22, 28, 4, 28, { sw: 5, stroke: COL.green }); },
    cart(g) { P(g, 'M-54,-36 h18 l14,50 h48 l12,-34 h-66'); C(g, -14, 34, 7, { fill: INK }); C(g, 28, 34, 7, { fill: INK }); },
    lamp(g) { C(g, 22, -26, 20, { fill: COL.yellow, stroke: 'none' }); L(g, -10, 54, -10, -30); P(g, 'M-10,-30 q0,-22 26,-22'); L(g, -28, 54, 8, 54); P(g, 'M8,-52 h28 l-6,14 h-16 z', { fill: INK }); },
    phone(g) { R(g, -26, -46, 52, 92, { rx: 10, fill: COL.blue }); R(g, -18, -34, 36, 58, { rx: 3, fill: '#fff', stroke: 'none' }); C(g, 0, 35, 4, { fill: '#fff', stroke: 'none' }); },
    gamepad(g) { R(g, -54, -28, 108, 56, { rx: 28, fill: COL.red }); L(g, -36, 0, -14, 0, { stroke: '#fff' }); L(g, -25, -11, -25, 11, { stroke: '#fff' }); C(g, 18, -8, 6, { fill: '#fff', stroke: 'none' }); C(g, 34, 8, 6, { fill: '#fff', stroke: 'none' }); },
    snack(g) { L(g, 6, -24, 20, -56); P(g, 'M-24,-24 h48 l-8,70 h-32 z', { fill: COL.yellow }); L(g, -31, -24, 31, -24); },
    pot(g) { const k = el('g', { transform: 'translate(0,-6) scale(.62)' }, g); P(k, 'M-78,-22 q-22,4 -22,24', { sw: 9 }); P(k, 'M78,-22 q22,4 22,24', { sw: 9 }); P(k, 'M-72,-20 q0,96 72,96 q72,0 72,-96 z', { fill: '#39404d', sw: 8 }); el('ellipse', { cx: 0, cy: -20, rx: 78, ry: 18, fill: '#566070', stroke: INK, 'stroke-width': 8 }, k); },
    person(g, color) { color = color || COL.blue; C(g, 0, -28, 16, { fill: color }); P(g, 'M-28,40 q0,-46 28,-46 q28,0 28,46 z', { fill: color }); },
    people(g) { G.person(el('g', { transform: 'translate(-34,6) scale(.78)' }, g), COL.green); G.person(el('g', { transform: 'translate(34,6) scale(.78)' }, g), COL.yellow); G.person(el('g', { transform: 'translate(0,2)' }, g), COL.blue); },
    state(g) { P(g, 'M-58,-18 L0,-56 L58,-18 z', { fill: '#fff' }); R(g, -58, -18, 116, 10, { fill: '#fff' }); [-38, -13, 13, 38].forEach(x => L(g, x, -4, x, 34)); R(g, -64, 34, 128, 12, { fill: '#fff' }); R(g, -9, -42, 18, 18, { fill: COL.red, stroke: 'none' }); L(g, 0, -38, 0, -28, { stroke: '#fff', sw: 4 }); L(g, -5, -33, 5, -33, { stroke: '#fff', sw: 4 }); },
    school(g) { R(g, -44, -10, 88, 56, { fill: '#fff' }); P(g, 'M-56,-10 L0,-50 L56,-10 z', { fill: COL.red }); R(g, -10, 16, 20, 30, { fill: COL.blue, sw: 4 }); R(g, -34, 2, 14, 14, { sw: 4 }); R(g, 20, 2, 14, 14, { sw: 4 }); },
    bus(g) { R(g, -58, -36, 116, 64, { rx: 12, fill: COL.blue }); [-48, -15, 18].forEach(x => R(g, x, -26, 28, 22, { fill: '#fff', stroke: 'none', rx: 3 })); C(g, -30, 30, 11, { fill: INK }); C(g, 30, 30, 11, { fill: INK }); },
    pool(g) { L(g, 8, -46, 8, 8); L(g, 30, -46, 30, 8); L(g, 8, -28, 30, -28, { sw: 4 }); L(g, 8, -10, 30, -10, { sw: 4 }); P(g, 'M-54,16 q13,-16 27,0 t27,0 t27,0 t27,0', { stroke: COL.blue }); P(g, 'M-54,40 q13,-16 27,0 t27,0 t27,0 t27,0', { stroke: COL.blue }); },
    ball(g) { C(g, 0, 0, 44, { fill: '#fff' }); P(g, 'M0,-16 L15,-5 L9,13 L-9,13 L-15,-5 z', { fill: INK, sw: 3 }); L(g, 0, -16, 0, -42, { sw: 4 }); L(g, 15, -5, 40, -14, { sw: 4 }); L(g, 9, 13, 25, 35, { sw: 4 }); L(g, -9, 13, -25, 35, { sw: 4 }); L(g, -15, -5, -40, -14, { sw: 4 }); },
    shield(g) { P(g, 'M0,-52 L44,-36 V4 Q44,38 0,56 Q-44,38 -44,4 V-36 z', { fill: COL.blue }); P(g, 'M-18,2 l13,15 l25,-30', { stroke: '#fff', sw: 8 }); },
    flame(g) { P(g, 'M0,-56 Q42,-8 30,24 Q22,54 0,54 Q-22,54 -30,24 Q-38,0 -12,-18 Q-8,-2 0,-6 Q-6,-30 0,-56 z', { fill: COL.red }); P(g, 'M0,8 Q16,24 10,38 Q6,48 0,48 Q-10,48 -12,36 Q-12,22 0,8 z', { fill: COL.yellow, stroke: 'none' }); },
    music(g) { L(g, -6, 30, -6, -40); L(g, 40, 18, 40, -50); P(g, 'M-6,-40 L40,-50', { sw: 13 }); el('ellipse', { cx: -20, cy: 32, rx: 15, ry: 11, fill: INK }, g); el('ellipse', { cx: 26, cy: 20, rx: 15, ry: 11, fill: INK }, g); },
    scale(g) { L(g, 0, -52, 0, 48); L(g, -32, 48, 32, 48); L(g, -54, -36, 54, -36); [-54, 54].forEach(x => { L(g, x, -36, x - 20, 4, { sw: 3 }); L(g, x, -36, x + 20, 4, { sw: 3 }); P(g, 'M' + (x - 22) + ',4 q22,24 44,0 z', { fill: COL.yellow, sw: 5 }); }); },
    question(g) { txt(g, '?', 0, 44, { size: 130, fill: COL.red }); },
    ballot(g) { P(g, 'M-16,-12 v-36 h32 v36', { fill: COL.yellow, sw: 5 }); R(g, -46, -12, 92, 64, { fill: '#fff' }); L(g, -24, -12, 24, -12, { sw: 9 }); P(g, 'M-14,22 l10,11 l19,-24', { stroke: COL.green, sw: 7 }); },
    bulb(g) { L(g, -56, -44, -46, -36, { sw: 5 }); L(g, 56, -44, 46, -36, { sw: 5 }); L(g, 0, -66, 0, -56, { sw: 5 }); C(g, 0, -12, 34, { fill: COL.yellow }); R(g, -14, 22, 28, 24, { rx: 4, fill: '#fff' }); L(g, -14, 34, 14, 34, { sw: 4 }); },
    stop(g) { P(g, 'M-22,-52 H22 L52,-22 V22 L22,52 H-22 L-52,22 V-22 z', { fill: COL.red }); R(g, -30, -10, 60, 20, { fill: '#fff', stroke: 'none', rx: 3 }); },
    sign(g) { R(g, -44, -48, 68, 92, { rx: 4, fill: '#fff' }); L(g, -32, -28, 10, -28, { sw: 4, stroke: GREY }); L(g, -32, -10, 10, -10, { sw: 4, stroke: GREY }); P(g, 'M-32,20 q7,-16 13,0 t13,0 t12,0', { stroke: COL.blue, sw: 4 }); P(g, 'M20,32 L50,-20 L62,-13 L32,39 L18,44 z', { fill: COL.yellow, sw: 4 }); },
    law(g) { R(g, -36, -48, 72, 96, { rx: 6, fill: '#fff' }); txt(g, '§', 0, 26, { size: 76 }); },
    book(g) { P(g, 'M0,-34 Q-28,-50 -56,-38 V36 Q-28,24 0,40 Q28,24 56,36 V-38 Q28,-50 0,-34 z', { fill: '#fff' }); L(g, 0, -34, 0, 40, { sw: 4 }); R(g, 18, -22, 20, 20, { fill: COL.red, stroke: 'none' }); L(g, 28, -18, 28, -6, { stroke: '#fff', sw: 4 }); L(g, 22, -12, 34, -12, { stroke: '#fff', sw: 4 }); L(g, -42, -18, -14, -22, { sw: 3, stroke: GREY }); L(g, -42, -2, -14, -6, { sw: 3, stroke: GREY }); },
    letter(g) { R(g, -54, -36, 108, 72, { rx: 4, fill: '#fff' }); P(g, 'M-54,-36 L0,8 L54,-36'); },
    megaphone(g) { R(g, -58, -14, 18, 28, { fill: '#fff', sw: 5 }); P(g, 'M-42,-16 L18,-46 V46 L-42,16 z', { fill: COL.yellow }); P(g, 'M32,-20 q14,20 0,40', { sw: 5 }); P(g, 'M46,-34 q24,34 0,68', { sw: 5 }); },
    leaf(g) { P(g, 'M-42,38 Q-46,-32 42,-46 Q46,32 -42,38 z', { fill: COL.green }); L(g, -42, 38, 16, -20, { sw: 4 }); },
    ear(g) { P(g, 'M-20,30 Q-34,-50 6,-50 Q40,-50 36,-10 Q34,10 16,20 Q6,28 8,44', { sw: 7 }); P(g, 'M-4,-8 Q-6,-28 8,-28 Q20,-28 18,-12', { sw: 5 }); },
  };

  // ---------- actors ----------
  function actor(parent, x, y, at, o, build) {
    o = o || {};
    const outer = el('g', { transform: 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')', style: 'display:none' }, parent), inner = el('g', {}, outer);
    build(inner);
    const a = { outer, inner, at: at == null ? (CUR.t0 === 0 ? -1 : CUR.t0) : at, out: o.out == null ? null : o.out, kind: o.kind || 'pop', bob: !!o.bob, rot: o.rot || 0, seed: (seedN++) * 1.7, pulses: o.pulse || [] };
    CUR.actors.push(a);
    return a;
  }
  function drawActor(a, t) {
    const lead = a.kind === 'pop' ? 0.12 : 0, p = (t - (a.at - lead)) / 0.42;
    if (p <= 0 || (a.out != null && t > a.out + 0.25)) { if (a.on !== false) { a.outer.style.display = 'none'; a.on = false; } return; }
    if (a.on !== true) { a.outer.style.display = ''; a.on = true; }
    const q = clamp(p, 0, 1);
    let op = Math.min(1, p * 4), s = 1, dy = 0, rot = a.rot;
    if (a.out != null && t > a.out) op *= 1 - (t - a.out) / 0.25;
    if (a.kind === 'pop') { s = outBackSoft(q); rot += (1 - q) * -7; }
    else if (a.kind === 'rise') dy = (1 - outCubic(q)) * 30;
    for (const pt of a.pulses) { const u = (t - pt + 0.1) / 0.6; if (u > 0 && u < 1) s *= 1 + 0.22 * Math.sin(Math.PI * u); }
    if (a.bob) { dy += Math.sin(t * 1.5 + a.seed) * 4; rot += Math.sin(t * 1.1 + a.seed) * 1.2; }
    a.inner.setAttribute('transform', 'translate(0,' + dy.toFixed(1) + ') rotate(' + rot.toFixed(2) + ') scale(' + s.toFixed(3) + ')');
    a.outer.setAttribute('opacity', clamp(op, 0, 1).toFixed(2));
  }

  // ---------- elements ----------
  // text on a cut paper strip; shrinks to maxW
  function strip(g, x, y, at, text, o) {
    o = o || {};
    let s = o.size || 54, w = textW(text, s) + s * 1.1;
    if (o.maxW && w > o.maxW) { s *= o.maxW / w; w = o.maxW; }
    const col = COL[o.color || 'ink'] || o.color, r = rng(hash(text));
    return actor(g, x, y, at, { rot: (r() - 0.5) * 3.6, out: o.out, pulse: o.pulse }, q => { piece(q, sheetPts(w, s * 1.6, r), col); txt(q, text, 0, s * 0.35, { size: s, fill: light(col) ? INK : PAPER }); });
  }
  function hand(g, x, y, at, text, o) {
    o = o || {};
    let s = o.size || 64; const w = textW(text, s, true);
    if (o.maxW && w > o.maxW) s *= o.maxW / w;
    const r = rng(hash(text));
    return actor(g, x, y, at, { rot: o.rot == null ? (r() - 0.5) * 5 - 1.5 : o.rot, out: o.out }, q => { txt(q, text, 0, s * 0.3, { hand: true, size: s, fill: COL[o.color || 'red'] }); });
  }
  function plain(g, x, y, at, text, o) {
    o = o || {};
    let s = o.size || 42; const w = textW(text, s);
    if (o.maxW && w > o.maxW) s *= o.maxW / w;
    return actor(g, x, y, at, { kind: 'rise', out: o.out }, q => { txt(q, text, 0, s * 0.35, { size: s, fill: COL[o.color || 'grey'], weight: 700 }); });
  }
  // icon on a cut paper disc with a handwritten label
  function disc(g, x, y, at, icon, label, o) {
    o = o || {};
    const sc = o.scale || 1, r = rng(hash(icon + (label || '') + x));
    return actor(g, x, y, at, { rot: (r() - 0.5) * 6, bob: o.bob !== false, out: o.out, pulse: o.pulse }, q => {
      const k = el('g', { transform: 'scale(' + sc + ')' }, q);
      piece(k, blobPts(96, r), PAPER);
      (G[icon] || G.question)(k);
      if (label) { let s = 50; const w = textW(label, s, true); if (o.maxW && w > o.maxW) s *= o.maxW / w; txt(q, label, 0, 96 * sc + 54, { hand: true, size: s }); }
    });
  }
  // line styles of a text stack
  const LS = {
    huge: { s: 150, h: 268, kind: 'strip' }, big: { s: 88, h: 150, kind: 'strip' }, strip: { s: 54, h: 104, kind: 'strip' },
    chip: { s: 40, h: 84, kind: 'strip' }, hand: { s: 64, h: 84, kind: 'hand' }, handS: { s: 48, h: 60, kind: 'hand' }, small: { s: 42, h: 66, kind: 'plain' },
  };
  const stackH = lines => lines.reduce((a, l) => a + LS[l.style || 'strip'].h, 0);
  function stack(g, cx, cy, lines, maxW) {
    let y = cy - stackH(lines) / 2;
    lines.forEach(l => {
      const st = LS[l.style || 'strip'], yy = y + st.h / 2, o = { size: st.s, color: l.color, maxW, out: l.out };
      y += st.h;
      if (st.kind === 'strip') strip(g, cx, yy, l.at, l.text, o);
      else if (st.kind === 'hand') hand(g, cx, yy, l.at, l.text, o);
      else plain(g, cx, yy, l.at, l.text, o);
    });
  }
  function coins(g, p0, pc, p1, t0, o) {
    o = o || {};
    const n = o.n || 6, per = o.period || 2.4, list = [];
    for (let i = 0; i < n; i++) { const c = el('g', { style: 'display:none' }, g); G.coin(c, o.r || 18); list.push(c); }
    CUR.updaters.push(t => {
      for (let i = 0; i < n; i++) {
        const c = list[i], raw = (t - t0) / per - i / n;
        if (t < t0 || raw < 0) { c.style.display = 'none'; continue; }
        const u = raw - Math.floor(raw), v = 1 - u;
        c.style.display = '';
        c.setAttribute('transform', 'translate(' + (v * v * p0[0] + 2 * u * v * pc[0] + u * u * p1[0]).toFixed(1) + ',' + (v * v * p0[1] + 2 * u * v * pc[1] + u * u * p1[1]).toFixed(1) + ')');
        c.setAttribute('opacity', Math.min(1, u * 6, v * 6).toFixed(2));
      }
    });
  }
  function drawOn(g, d, at, o) {
    const p = P(g, d, o); let len = 600;
    try { len = p.getTotalLength(); } catch (e) { /* keep estimate */ }
    p.setAttribute('stroke-dasharray', len); p.style.display = 'none';
    CUR.updaters.push(t => {
      if (t < at) { p.style.display = 'none'; return; }
      p.style.display = ''; p.setAttribute('stroke-dashoffset', (len * (1 - outCubic(clamp((t - at) / 0.7, 0, 1)))).toFixed(1));
    });
  }

  // ---------- props (the building blocks inside `split`) ----------
  const PROPS = {
    lines(g, cx, cy, d, maxW) { stack(g, cx, cy, d.lines, maxW); },
    icon(g, cx, cy, d, maxW) { disc(g, cx, cy - 30, d.at, d.icon, d.label, { scale: d.scale || 1.5, maxW }); },
    // payslip-style comparison: bars as shares of the first one, plus the dashed gap
    bars(g, cx, cy, d) {
      const w = 500, h = 150 + d.bars.length * 120 + (d.gap ? 70 : 0), r = rng(hash(d.title || 'bars')), x0 = -205, bw = 410;
      actor(g, cx, cy, d.at, { rot: -1.2, kind: 'pop' }, q => { piece(q, sheetPts(w, h, r), PAPER); tape(q, 0, -h / 2 + 4, -3); txt(q, d.title || '', 0, -h / 2 + 76, { size: 42 }); L(q, x0, -h / 2 + 100, x0 + bw, -h / 2 + 100, { sw: 3, stroke: GREY }); });
      const top = cy - h / 2 + 150;
      d.bars.forEach((b, i) => {
        const y = top + i * 120;
        actor(g, cx, y, b.at, { kind: 'rise' }, q => txt(q, b.label, x0, -12, { anchor: 'start', size: 34, weight: 700 }));
        const rect = R(g, cx + x0, y, 0, 50, { fill: COL[b.color || 'blue'], sw: 4, rx: 5 }); rect.style.display = 'none';
        CUR.updaters.push(t => { if (t < b.at) { rect.style.display = 'none'; return; } rect.style.display = ''; rect.setAttribute('width', (bw * b.value * outCubic(clamp((t - b.at) / 0.8, 0, 1))).toFixed(1)); });
      });
      if (d.gap) {
        const last = d.bars[d.bars.length - 1], y = top + (d.bars.length - 1) * 120, gx = x0 + bw * last.value + 4, gw = bw * (d.bars[0].value - last.value) - 4;
        actor(g, cx, y, d.gap.at, { kind: 'rise' }, q => el('rect', { x: gx, y: 0, width: gw, height: 50, rx: 5, fill: '#f7d3cf', stroke: COL.red, 'stroke-width': 4, 'stroke-dasharray': '10 8' }, q));
        actor(g, cx + gx + gw / 2, y + 25, d.gap.at, { out: d.gap.labelAt }, q => txt(q, '?', 0, 18, { hand: true, size: 60, fill: COL.red }));
        if (d.gap.label) hand(g, cx, y + 112, d.gap.labelAt, d.gap.label, { size: 52, maxW: w - 50, rot: -2 });
      }
    },
    receipt(g, cx, cy, d) {
      let z = ''; for (let i = 0; i < 10; i++) z += ' l-32,' + (i % 2 ? 20 : -20);
      actor(g, cx, cy, d.at, { rot: 2 }, q => {
        piece(q, 'M-160,-235 h320 v470' + z + ' z', PAPER); tape(q, 0, -232, 4);
        txt(q, d.shop || 'KIOSK', 0, -170, { size: 40 });
        [-120, -74, -28].forEach((y, i) => { L(q, -126, y, -126 + [150, 190, 120][i], y, { sw: 6, stroke: GREY }); L(q, 76, y, 126, y, { sw: 6, stroke: GREY }); });
        L(q, -126, 16, 126, 16, { sw: 3 }); txt(q, 'TOTAL', -126, 68, { anchor: 'start', size: 34 }); L(q, 46, 58, 126, 58, { sw: 8 });
      });
      if (d.highlight) strip(g, cx + 4, cy + 142, d.highlight.at, d.highlight.text, { size: 34, color: 'yellow', maxW: 300 });
    },
    price(g, cx, cy, d) {
      strip(g, cx, cy + 40, d.at, d.base || 'Preis', { size: 74, color: 'blue' });
      strip(g, cx, cy - 78, d.addAt, d.add || '+ MWST', { size: 46, color: 'red' });
    },
    net(g, cx, cy, d, maxW) {
      actor(g, cx, cy + 10, d.at, { kind: 'rise' }, q => {
        const k = el('g', { transform: 'scale(1.35)' }, q);
        P(k, 'M-170,0 Q0,120 170,0'); P(k, 'M-170,0 Q0,60 170,0', { sw: 3 });
        for (let i = -3; i <= 3; i++) { const x = i * 42; L(k, x, 14 + (1 - Math.abs(i) / 4) * 16, x, 30 + (1 - (i * i) / 16) * 30, { sw: 3 }); }
        L(k, -170, -40, -170, 6, { sw: 8 }); L(k, 170, -40, 170, 6, { sw: 8 });
      });
      actor(g, cx, cy - 60, d.personAt == null ? d.at : d.personAt, { bob: true }, q => G.person(el('g', { transform: 'scale(1.3)' }, q), COL.blue));
      if (d.label) hand(g, cx, cy + 190, d.at, d.label, { size: 64, maxW });
    },
    crowd(g, cx, cy, d, maxW) {
      actor(g, cx, cy - 20, d.at, { kind: 'rise' }, q => {
        const cols = [COL.blue, COL.green, COL.yellow, COL.red];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) G.person(el('g', { transform: 'translate(' + ((c - 2.5) * 70) + ',' + ((r - 1.5) * 84) + ') scale(.55)' }, q), cols[(r * 3 + c) % 4]);
      });
      if (d.label) hand(g, cx, cy + 190, d.at, d.label, { size: 56, color: 'ink', maxW });
    },
  };

  // ---------- templates ----------
  function heads(g, d) {
    const hs = !d.head ? [] : Array.isArray(d.head) ? d.head : [d.head];
    hs.forEach((h, i) => { const o = typeof h === 'string' ? { text: h } : h, nx = hs[i + 1]; strip(g, ACX, 168, o.at, o.text, { size: 50, maxW: AX1 - AX0 - 60, out: nx ? nx.at - 0.15 : null }); });
    return hs.length ? 232 : 120;
  }
  const TPL = {
    // centred lines, optionally under a big icon or inside a speech bubble
    statement(g, d) {
      const top = heads(g, d), cy = (top + AY1) / 2, ih = d.icon ? 250 : 0, total = ih + stackH(d.lines);
      if (d.bubble) actor(g, 0, 0, null, { kind: 'rise' }, q => piece(q, 'M110,150 h1080 q26,0 26,26 v480 q0,26 -26,26 h-640 l-110,96 l14,-96 h-344 q-26,0 -26,-26 v-480 q0,-26 26,-26 z', PAPER));
      const c = d.bubble ? 416 : cy;
      if (d.icon) disc(g, ACX, c - total / 2 + 112, d.iconAt, d.icon, '', { scale: 1.25 });
      stack(g, ACX, c - total / 2 + ih + stackH(d.lines) / 2, d.lines, d.bubble ? 980 : AX1 - AX0 - 40);
    },
    // a row (or two) of icons, each popping on its word
    icons(g, d) {
      const top = heads(g, d), n = d.items.length, rows = n > 5 ? 2 : 1, per = Math.ceil(n / rows), gap = Math.min(310, (AX1 - AX0) / per);
      const fh = d.foot ? stackH(d.foot) : 0, bottom = AY1 - fh, sc = rows === 1 && per <= 3 ? 1.2 : 1;
      d.items.forEach((it, i) => {
        const r = Math.floor(i / per), k = i % per, inRow = r === rows - 1 ? n - per * (rows - 1) : per;
        const x = ACX + (k - (inRow - 1) / 2) * gap, y = rows === 1 ? (top + bottom) / 2 - 36 : top + 106 + r * 292;
        disc(g, x, y, it.at, it.icon, it.label, { scale: sc, maxW: gap - 24, pulse: it.pulse });
      });
      if (d.foot) stack(g, ACX, AY1 - fh / 2, d.foot, AX1 - AX0 - 40);
    },
    // two props side by side, optionally with coins flowing left → right and a foot line
    split(g, d) {
      const top = heads(g, d), fh = d.foot ? stackH(d.foot) : 0, cy = (top + AY1 - fh) / 2, lx = AX0 + 290, rx = AX1 - 290, mw = 540;
      if (d.coins) coins(g, [lx + 150, cy - 10], [(lx + rx) / 2, cy - 330], [rx - 30, cy - 60], d.coins.at, { n: 7 });
      PROPS[d.left.prop](g, lx, cy, d.left, mw);
      PROPS[d.right.prop](g, rx, cy, d.right, mw);
      if (d.foot) stack(g, ACX, AY1 - fh / 2, d.foot, AX1 - AX0 - 40);
    },
    // three stations on a ring, arrows drawn on, coins going round
    cycle(g, d) {
      const top = heads(g, d), cx = ACX, cy = (top + AY1) / 2 + 6, r = 235, pt = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)], rad = x => x * Math.PI / 180;
      const arc = (a0, a1) => { const p = pt(rad(a0)), q = pt(rad(a1)); return 'M' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' A' + r + ',' + r + ' 0 0 1 ' + q[0].toFixed(1) + ',' + q[1].toFixed(1); };
      const AR = [[-60, 0, 'green', cx + 375, cy - 150, 8], [60, 120, 'blue', cx, cy + r + 56, 0], [180, 240, 'yellow', cx - 375, cy - 150, -8]];
      d.arrows.forEach((a, i) => { drawOn(g, arc(AR[i][0], AR[i][1]), a.at, { stroke: COL[AR[i][2]], sw: 13 }); hand(g, AR[i][3], AR[i][4], a.at, a.label, { size: 52, color: i === 2 ? 'ink' : AR[i][2], rot: AR[i][5], maxW: 330 }); });
      const layer = el('g', {}, g), n = 6, list = [], t0 = d.arrows[0].at;
      for (let i = 0; i < n; i++) { const c = el('g', { style: 'display:none' }, layer); G.coin(c, 16); list.push(c); }
      CUR.updaters.push(t => list.forEach((c, i) => {
        if (t < t0) { c.style.display = 'none'; return; }
        const p = pt(-Math.PI / 2 + ((t - t0) / 9 + i / n) * 2 * Math.PI);
        c.style.display = ''; c.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')'); c.setAttribute('opacity', Math.min(1, (t - t0) / 0.6).toFixed(2));
      }));
      [-90, 30, 150].forEach((deg, i) => { const p = pt(rad(deg)), nd = d.nodes[i]; disc(g, p[0], p[1], nd.at, nd.icon, '', { bob: false }); strip(g, p[0], p[1] + 100, nd.at, nd.label, { size: 32, color: 'ink' }); });
      if (d.center) stack(g, cx, cy + 8, d.center, 226);
    },
  };

  // ---------- closing podcasts: the mindmap on the left, a note card for the current node on the right ----------
  function wrap(str, max) {
    const out = []; let cur = '';
    str.split(' ').forEach(w => { if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) out.push(cur);
    return out;
  }
  TPL.map = function (g, d) {
    const M = EP.map, t0 = CUR.t0, rows = [];
    M.branches.forEach(b => b.nodes.forEach(n => rows.push({ b, n })));
    const y0 = 170, y1 = 830, step = (y1 - y0) / Math.max(rows.length - 1, 1), RX = 118, RY = 500, BX = 318, NX = 566;
    rows.forEach((r, i) => { r.y = y0 + i * step; });
    const state = id => (d.node === id ? 'now' : MAPT[id] != null && (MAPT[id] < t0 || d.node == null) ? 'done' : 'todo');
    const fit = (label, size, maxW) => { const w = textW(label, size); return w > maxW ? size * maxW / w : size; };
    const curve = (x1, y1_, x2, y2) => 'M' + x1 + ',' + y1_ + ' C' + ((x1 + x2) / 2) + ',' + y1_ + ' ' + ((x1 + x2) / 2) + ',' + y2 + ' ' + x2 + ',' + y2;
    // only what has been reached is on the map: finished nodes are static, the current branch and node come in on their cue
    const brAt = d.branchAt == null ? t0 : d.branchAt, later = [];
    M.branches.forEach(b => {
      const mine = rows.filter(r => r.b === b), col = COL[b.color];
      b.y = mine.reduce((a, r) => a + r.y, 0) / mine.length;
      b.seen = mine.some(r => state(r.n.id) === 'done'); b.now = mine.some(r => state(r.n.id) === 'now');
      if (b.seen) P(g, curve(RX, RY, BX, b.y), { stroke: col, sw: 7 });
      else if (b.now) drawOn(g, curve(RX, RY, BX, b.y), brAt, { stroke: col, sw: 7 });
      mine.forEach(r => {
        const st = state(r.n.id);
        if (st === 'done') P(g, curve(BX, b.y, NX - 40, r.y), { stroke: col, sw: 7 });
        else if (st === 'now') drawOn(g, curve(BX, b.y, NX - 40, r.y), d.titleAt - 0.4, { stroke: col, sw: 7 });
      });
    });
    // branch tags keep the full wording of the mindmap and break into two lines when long
    const tagPiece = (q, label, col, size) => { const ls = wrap(label, 16), w = Math.max.apply(null, ls.map(l => textW(l, size))) + size * 1.1, lh = size * 1.15; piece(q, sheetPts(w, size * 1.7 + (ls.length - 1) * lh, rng(hash(label))), col); ls.forEach((l, i) => txt(q, l, 0, size * 0.35 + (i - (ls.length - 1) / 2) * lh, { size, fill: light(col) ? INK : PAPER })); };
    const root = el('g', { transform: 'translate(' + RX + ',' + RY + ')' }, g);
    piece(root, blobPts(94, rng(5)), INK); const rl = wrap(M.root, 12), rs = Math.min.apply(null, rl.map(l => fit(l, 30, 158))); rl.forEach((l, i) => txt(root, l, 0, rs * 0.35 + (i - (rl.length - 1) / 2) * rs * 1.15, { size: rs, fill: PAPER }));
    M.branches.forEach(b => {
      if (b.seen) tagPiece(el('g', { transform: 'translate(' + BX + ',' + b.y + ') rotate(-2)' }, g), b.label, COL[b.color], 24);
      else if (b.now) actor(g, BX, b.y, brAt + 0.3, { rot: -2 }, q => tagPiece(q, b.label, COL[b.color], 24));
    });
    rows.forEach(r => {
      const st = state(r.n.id);
      if (st === 'todo') return;
      if (st === 'done') {
        const fs = fit(r.n.label, 24, 236), w = textW(r.n.label, fs) + 26; const q = el('g', { transform: 'translate(' + (NX - 40 + w / 2) + ',' + r.y + ')' }, g);
        piece(q, sheetPts(w, 42, rng(hash(r.n.label))), PAPER); txt(q, r.n.label, 0, fs * 0.36, { size: fs });
        P(g, 'M' + (NX - 40 + w + 10) + ',' + r.y + ' l8,9 l15,-19', { stroke: COL.green, sw: 6 });
        return;
      }
      const fs = fit(r.n.label, 28, 250), w = textW(r.n.label, fs) + 30;
      actor(g, NX - 40 + w / 2, r.y, d.titleAt, { rot: -2, pulse: [d.titleAt + 0.9] }, q => { piece(q, sheetPts(w, 50, rng(hash(r.n.label))), COL[r.b.color]); txt(q, r.n.label, 0, fs * 0.36, { size: fs, fill: light(COL[r.b.color]) ? INK : PAPER }); });
    });
    // the note card
    const CX = 1178, CW = 724, CH = 730, CY = 480, left = CX - CW / 2 + 44, cur = rows.find(r => r.n.id === d.node), col = cur ? cur.b.color : 'ink';
    const cardAt = Math.min(d.titleAt, d.lead ? d.lead.at : d.titleAt) - 0.5;
    actor(g, CX, CY, cardAt, { kind: 'rise', rot: 0.8 }, q => { piece(q, sheetPts(CW, CH, rng(hash('card' + (d.node || 'sum')))), PAPER); tape(q, 0, -CH / 2 + 2, -3); });
    if (cur) { const where = d.sub ? cur.b.label + ' › ' + cur.n.label : 'Hauptast: ' + cur.b.label; txt(actor(g, 0, 0, cardAt + 0.2, { kind: 'rise' }, () => {}).inner, where, left, CY - CH / 2 + 66, { size: fit(where, 28, d.lead ? 330 : CW - 90), fill: COL[col], anchor: 'start', weight: 700 }); }
    if (d.lead) hand(g, CX + 175, CY - CH / 2 + 56, d.lead.at, d.lead.text, { size: 46, maxW: 320, color: 'red' });
    strip(g, CX, CY - CH / 2 + 140, d.titleAt, d.title, { size: 50, color: col, maxW: CW - 70 });
    // facts: shrink type until the list fits between the title and the note strip
    const room = CH - 240 - (d.note ? 72 : 30), facts = d.facts || [];
    let k = 1, need = 0;
    for (; k > 0.62; k -= 0.04) { need = facts.reduce((a, f) => a + wrap(f.text, Math.round(34 / k)).length * 42 * k + 18 * k, 0); if (need <= room) break; }
    let y = CY - CH / 2 + 240;
    facts.forEach(f => {
      const lines = wrap(f.text, Math.round(34 / k)), yy = y;
      actor(g, 0, 0, f.at, { kind: 'rise' }, q => { C(q, left + 8, yy - 12 * k, 8 * k, { fill: COL[col], stroke: 'none' }); lines.forEach((ln, i) => txt(q, ln, left + 32, yy + i * 42 * k, { size: 34 * k, anchor: 'start', weight: 700 })); });
      y += (lines.length * 42 + 18) * k;
    });
    if (d.note) strip(g, CX, CY + CH / 2 - 8, d.note.at, 'Mindmap: ' + d.note.text, { size: 34, color: 'yellow', maxW: CW - 30 });
  };

  // ---------- stage, Merkzettel, build ----------
  function backdrop() {
    R(STAGE, 0, 0, W, H, { fill: KRAFT, stroke: 'none' });
    const r = rng(7);
    for (let i = 0; i < 5; i++) el('rect', { x: -180, y: -120, width: 360, height: 240, fill: i % 2 ? '#e2d5ba' : '#f1e8d6', opacity: 0.55, transform: 'translate(' + (r() * W).toFixed(0) + ',' + (r() * H).toFixed(0) + ') rotate(' + ((r() - 0.5) * 50).toFixed(0) + ')' }, STAGE);
    for (let i = 0; i < 260; i++) el('circle', { cx: (r() * W).toFixed(0), cy: (r() * H).toFixed(0), r: (0.8 + r() * 1.8).toFixed(1), fill: INK, opacity: (0.03 + r() * 0.05).toFixed(2) }, STAGE);
  }
  function merkzettel(terms) {
    const g = el('g', { transform: 'translate(1420,462) rotate(1.4)' }, STAGE), r = rng(99), w = 300, h = 150 + Math.max(terms.length, 8) * 60;
    piece(g, sheetPts(w, h, r), PAPER); tape(g, 0, -h / 2 + 2, -4);
    txt(g, 'Merkzettel', 0, -h / 2 + 78, { hand: true, size: 58 });
    for (let i = 0; i < Math.max(terms.length, 8); i++) L(g, -128, -h / 2 + 150 + i * 60, 128, -h / 2 + 150 + i * 60, { sw: 2, stroke: '#c9d6e8' });
    const rows = terms.map((tm, i) => {
      const y = -h / 2 + 140 + i * 60, row = el('g', { style: 'display:none' }, g);
      C(row, -116, y - 14, 6, { fill: COL.red, stroke: 'none' });
      let s = 42; const tw = textW(tm.text, s, true); if (tw > 226) s *= 226 / tw;
      txt(row, tm.text, -100, y, { hand: true, size: s, anchor: 'start' });
      return { row, at: tm.at };
    });
    return t => rows.forEach(x => {
      if (t < x.at) { if (x.on !== false) { x.row.style.display = 'none'; x.on = false; } return; }
      if (x.on !== true) { x.row.style.display = ''; x.on = true; }
      x.row.setAttribute('opacity', clamp((t - x.at) / 0.3, 0, 1).toFixed(2));
    });
  }

  function build(svg, ep) {
    STAGE = svg; seedN = 0; EP = ep; MAPT = {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    backdrop();
    MEASURE = el('g', { visibility: 'hidden' }, STAGE);
    const shots = [], chapters = [], side = ep.terms && ep.terms.length;
    AX1 = side ? 1240 : 1540; ACX = side ? 650 : 800;
    ep.chapters.forEach(ch => ch.shots.forEach(d => { if (d.tpl === 'map' && d.node && MAPT[d.node] == null) MAPT[d.node] = d.at; }));
    const notes = side ? merkzettel(ep.terms) : () => {};
    ep.chapters.forEach((ch, ci) => {
      chapters.push({ t: ch.shots[0].at, title: ch.title });
      ch.shots.forEach(d => {
        const s = { t0: d.at, t1: Infinity, g: el('g', {}, STAGE), actors: [], updaters: [], shown: true };
        if (shots.length) shots[shots.length - 1].t1 = s.t0;
        CUR = s; shots.push(s);
        strip(s.g, 0, 0, null, (ci + 1) + ' · ' + ch.title, { size: 28, color: 'yellow' }).outer.setAttribute('transform', 'translate(' + (AX0 + 20 + textW((ci + 1) + ' · ' + ch.title, 28) / 2 + 16) + ',64)');
        (TPL[d.tpl] || TPL.statement)(s.g, d);
      });
    });
    shots.forEach(s => { s.g.style.display = 'none'; s.shown = false; });
    function render(t) {
      const tq = Math.floor(t * 12 + 1e-6) / 12; // stop-motion: everything moves on a 12 fps grid
      for (const s of shots) {
        const vis = t >= s.t0 && t < s.t1;
        if (!vis) { if (s.shown) { s.g.style.display = 'none'; s.shown = false; } continue; }
        if (!s.shown) { s.g.style.display = ''; s.shown = true; }
        for (const a of s.actors) drawActor(a, tq);
        for (const u of s.updaters) u(tq);
      }
      notes(tq);
    }
    return { render, chapters };
  }

  return { build };
})();

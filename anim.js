'use strict';
/* Übungsanimationen als SVG: Figur mit Körperform (Gelenkkette + Konturen), Muskeln als Flächen,
   Gerät mit Polstern, Hebeln und mitlaufendem Gewichtsstapel. Zwei Posen je Übung, weich interpoliert.
   Ansichten: Seite (side), Vorderansicht (front) und Draufsicht (top). */

const ANIM = (() => {
  const L = { torso: 50, uarm: 27, farm: 25, thigh: 40, shin: 38, foot: 13 };
  const rad = (d) => (d * Math.PI) / 180;
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const mul = (p, k) => [p[0] * k, p[1] * k];
  const dirv = (ang) => [Math.cos(rad(ang)), Math.sin(rad(ang))];
  const step = (p, ang, len) => add(p, mul(dirv(ang), len));
  const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const lerp = (a, b, u) => a + (b - a) * u;
  const f = (n) => n.toFixed(1);
  const P = (p) => `${f(p[0])} ${f(p[1])}`;

  /* ---------- Formen ---------- */
  // Gliedmaße als Kapsel mit Muskelbauch: bf = Wölbung links der Laufrichtung, bb = rechts
  function limbPath(a, b, ra, rb, bf = 0, bb = 0) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const nf = [d[1], -d[0]], nb = [-d[1], d[0]];
    const m = mul(add(a, b), 0.5), r = (ra + rb) / 2;
    const A1 = add(a, mul(nf, ra)), B1 = add(b, mul(nf, rb)), B2 = add(b, mul(nb, rb)), A2 = add(a, mul(nb, ra));
    const C1 = add(m, mul(nf, r + 2 * bf)), C2 = add(m, mul(nb, r + 2 * bb));
    return `M${P(A1)} Q${P(C1)} ${P(B1)} A${f(rb)} ${f(rb)} 0 0 1 ${P(B2)} Q${P(C2)} ${P(A2)} A${f(ra)} ${f(ra)} 0 0 1 ${P(A1)}Z`;
  }
  // Muskelfläche auf Abschnitt [t0..t1] einer Gliedmaße; side +1 = links der Laufrichtung, -1 = rechts
  function musclePath(a, b, t0, t1, r, side, bulge) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], nf = [d[1], -d[0]];
    const p = (t) => add(a, mul(d, len * t));
    const off = mul(nf, side * r * 0.45);
    return side >= 0 ? limbPath(add(p(t0), off), add(p(t1), off), r * 0.55, r * 0.45, bulge, 0)
      : limbPath(add(p(t0), off), add(p(t1), off), r * 0.55, r * 0.45, 0, bulge);
  }
  // Geschlossene, glatte Kurve durch Punkte (Catmull-Rom → Bézier)
  function smooth(pts) {
    const n = pts.length; let s = `M${P(pts[0])}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      s += ` C${P(c1)} ${P(c2)} ${P(p2)}`;
    }
    return s + 'Z';
  }
  const mirrorX = (pts) => pts.map(([x, y]) => [-x, y]);
  const path = (cls, d) => `<path class="${cls}" d="${d}"/>`;
  const circ = (cls, c, r) => `<circle class="${cls}" cx="${f(c[0])}" cy="${f(c[1])}" r="${r}"/>`;

  /* ================= Seitenansicht ================= */
  // Rumpf in lokalen Koordinaten (s entlang Hüfte→Schulter, v nach vorne)
  const TORSO = [[0, -11], [5, -13], [16, -9], [32, -11], [45, -10], [52, -5], [53, 4], [47, 12], [37, 14], [28, 9], [15, 10], [3, 11]];
  const CHEST = [[30, 7], [37, 13], [46, 11], [46, 4], [36, 3]];
  const BACK = [[18, -8], [32, -10], [44, -9], [44, -2], [30, -3], [20, -3]];
  const ABS = [[13, 9], [22, 10], [33, 9], [33, 3], [14, 3]];
  const GLUTE = [[-1, -6], [4, -13], [12, -11], [11, -4], [3, -2]];
  const torsoPts = (hip, ang, pts) => { const u = dirv(ang), n = dirv(ang + 90); return pts.map(([s, v]) => add(hip, add(mul(u, s), mul(n, v)))); };

  function sideJ(p) {
    const hip = p.hip, sh = step(hip, p.torso, L.torso);
    const head = step(sh, p.torso + (p.neck || 0), 15);
    const el = p.elV ? add(sh, p.elV) : step(sh, p.uarm, L.uarm);
    const wr = p.wrV ? add(el, p.wrV) : step(el, p.farm, L.farm);
    const kn = step(hip, p.thigh, L.thigh), an = step(kn, p.shin, L.shin), toe = step(an, p.foot, L.foot);
    return { p, hip, sh, head, el, wr, kn, an, toe };
  }
  function sideMuscle(j, m) {
    switch (m) {
      case 'quad': return musclePath(j.hip, j.kn, 0.12, 0.85, 10, 1, 2.5);
      case 'ham': return musclePath(j.hip, j.kn, 0.15, 0.85, 10, -1, 2);
      case 'calf': return musclePath(j.kn, j.an, 0.08, 0.6, 7.5, -1, 2.5);
      case 'delt': return limbPath(add(j.sh, mul(dirv(j.p.torso), 2)), add(j.sh, mul(unit(sub(j.el, j.sh)), 11)), 7.5, 5, 1.5, 1.5);
      case 'tri': return musclePath(j.sh, j.el, 0.25, 0.9, 6.5, -1, 1.5);
      case 'bi': return musclePath(j.sh, j.el, 0.25, 0.9, 6.5, 1, 1.5);
      case 'chest': return smooth(torsoPts(j.hip, j.p.torso, CHEST));
      case 'back': return smooth(torsoPts(j.hip, j.p.torso, BACK));
      case 'abs': return smooth(torsoPts(j.hip, j.p.torso, ABS));
      case 'glute': return smooth(torsoPts(j.hip, j.p.torso, GLUTE));
      default: return '';
    }
  }
  function sideArm(j, o, cls) {
    const sh = add(j.sh, o), el = add(j.el, o), wr = add(j.wr, o);
    return path(cls, limbPath(sh, el, 6.5, 4.6, 1.6, 1.4)) + path(cls, limbPath(el, wr, 4.4, 3.2, 1.4, 0.6)) + circ(cls, wr, 4.2);
  }
  function sideLeg(j, o, cls) {
    const hip = add(j.hip, o), kn = add(j.kn, o), an = add(j.an, o), toe = add(j.toe, o);
    const heel = step(an, j.p.foot + 180, 3);
    return path(cls, limbPath(hip, kn, 10, 6.2, 2.4, 1.2)) + path(cls, limbPath(kn, an, 6, 3.8, 0.6, 2.4)) + path('shoe', limbPath(heel, toe, 4.2, 3.2, 0.8, 0));
  }
  function sideHair(j, r) {
    const ang = j.p.torso + (j.p.neck || 0), u = dirv(ang), n = dirv(ang - 90), c = j.head;
    const a1 = add(c, add(mul(u, 2), mul(n, r))), a2 = add(c, add(mul(u, r * 0.6), mul(n, -r * 0.75)));
    return `M${P(a1)} A${r} ${r} 0 0 1 ${P(a2)} Q${P(add(c, mul(u, 3)))} ${P(a1)}Z`;
  }
  function sideFigure(j, hot) {
    const back = [-3, -2], r = 9;
    const hm = (list) => list.filter((m) => hot.includes(m)).map((m) => path('musc', sideMuscle(j, m))).join('');
    return sideArm(j, back, 'far') + sideLeg(j, back, 'far') +
      path('skin', limbPath(j.sh, j.head, 3.6, 3.6)) + path('skin', smooth(torsoPts(j.hip, j.p.torso, TORSO))) +
      sideLeg(j, [0, 0], 'skin') + hm(['chest', 'back', 'abs', 'glute']) + hm(['quad', 'ham', 'calf']) +
      circ('skin', j.head, r) + path('hair', sideHair(j, r)) + sideArm(j, [0, 0], 'skin') + hm(['delt', 'tri', 'bi']);
  }

  /* ================= Vorderansicht ================= */
  // Rumpf relativ zur Beckenmitte; rechte Körperhälfte = +x (Figur schaut den Betrachter an)
  const TF = [[0, 6], [12, 3], [13, -10], [11, -24], [15, -38], [20, -48], [13, -54], [0, -55], [-13, -54], [-20, -48], [-15, -38], [-11, -24], [-13, -10], [-12, 3]];
  const PEC = [[2, -47], [14, -47], [16, -39], [4, -36]];
  const ABSF = [[-6, -32], [6, -32], [6, -6], [-6, -6]];
  const OBL = [[8, -30], [13, -26], [13, -8], [8, -10]];
  function frontJ(p) {
    const c = p.c, shY = c[1] - 50, m = (a) => 180 - a, mv = (v) => [-v[0], v[1]];
    const sR = [c[0] + 16, shY], sL = [c[0] - 16, shY];
    const elR = step(sR, p.uarm, L.uarm), wrR = step(elR, p.farm, L.farm);
    const elL = step(sL, m(p.uarm), L.uarm), wrL = step(elL, m(p.farm), L.farm);
    const hR = [c[0] + 9, c[1]], hL = [c[0] - 9, c[1]];
    const kR = p.kneeV ? add(hR, p.kneeV) : step(hR, p.thigh, L.thigh), kL = p.kneeV ? add(hL, mv(p.kneeV)) : step(hL, m(p.thigh), L.thigh);
    const aR = step(kR, p.shin, L.shin), aL = step(kL, m(p.shin), L.shin);
    return { p, c, shY, sR, sL, elR, wrR, elL, wrL, hR, hL, kR, kL, aR, aL, head: [c[0], shY - 15] };
  }
  function frontFigure(j, hot) {
    const c = j.c, T = (pts) => pts.map(([x, y]) => [c[0] + x, c[1] + y]);
    const hm = (m, d) => (hot.includes(m) ? path('musc', d) : '');
    const legs = [[j.hR, j.kR, j.aR, 1], [j.hL, j.kL, j.aL, -1]].map(([h, k, a, s]) =>
      path('skin', limbPath(h, k, 9.5, 6.5, 1.5, 1.5)) + path('skin', limbPath(k, a, 6, 4, 1.2, 1.2)) +
      path('shoe', limbPath(a, add(a, [s * 2, 6]), 4.6, 4.2)) +
      hm('add', musclePath(h, k, 0.1, 0.85, 9.5, s > 0 ? 1 : -1, 1.5))).join('');
    const arms = [[j.sR, j.elR, j.wrR], [j.sL, j.elL, j.wrL]].map(([s, e, w]) =>
      path('skin', limbPath(s, e, 6.5, 4.6, 1.4, 1.4)) + path('skin', limbPath(e, w, 4.4, 3.2, 1, 1)) + circ('skin', w, 4.2) +
      hm('delt', limbPath(add(s, [0, -1]), add(s, mul(unit(sub(e, s)), 11)), 7.5, 5, 1.2, 1.2))).join('');
    const h = j.head;
    return path('skin', smooth(T(TF))) +
      hm('chest', smooth(T(PEC)) + smooth(T(mirrorX(PEC))).replace('M', ' M')) +
      hm('abs', smooth(T(ABSF))) + hm('obl', smooth(T(OBL)) + ' ' + smooth(T(mirrorX(OBL)))) +
      hm('abd', limbPath([c[0] + 13, c[1] - 9], [c[0] + 15, c[1] + 3], 5, 4.5) + ' ' + limbPath([c[0] - 13, c[1] - 9], [c[0] - 15, c[1] + 3], 4.5, 5)) +
      legs + path('skin', limbPath([c[0], j.shY], h, 4, 4)) + circ('skin', h, 9) +
      path('hair', `M${f(h[0] - 9)} ${f(h[1] - 1)} A9 9 0 0 1 ${f(h[0] + 9)} ${f(h[1] - 1)} Q${f(h[0])} ${f(h[1] - 6)} ${f(h[0] - 9)} ${f(h[1] - 1)}Z`) +
      arms;
  }

  /* ================= Draufsicht ================= */
  // Figur von oben, Blickrichtung nach oben; rot = Drehung des Oberkörpers (Grad, im Uhrzeigersinn)
  function topJ(p) {
    const c = p.c, r = p.rot || 0, a = rad(r);
    const R = (v) => add(c, [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]);
    const sR = R([18, 0]), sL = R([-18, 0]);
    const elR = step(sR, p.uarm + r, L.uarm), wrR = step(elR, p.farm + r, L.farm);
    const elL = step(sL, 180 - p.uarm + r, L.uarm), wrL = step(elL, 180 - p.farm + r, L.farm);
    return { p, c, r, R, sR, sL, elR, wrR, elL, wrL };
  }
  function topFigure(j, hot) {
    const c = j.c, R = j.R, rot = (s) => `transform="rotate(${f(j.r)} ${f(c[0])} ${f(c[1])})"`;
    let s = '';
    if (j.p.seated) {
      s += [8, -8].map((x) => path('skin', limbPath([c[0] + x, c[1] + 2], [c[0] + x * 1.2, c[1] - 40], 9, 7, 1, 1)) + path('shoe', limbPath([c[0] + x * 1.2, c[1] - 44], [c[0] + x * 1.25, c[1] - 52], 4.2, 4))).join('');
      s += `<ellipse class="skin" cx="${f(c[0])}" cy="${f(c[1] + 2)}" rx="15" ry="10"/>`;
    }
    if (hot.includes('obl')) s += `<ellipse class="musc" cx="${f(c[0])}" cy="${f(c[1])}" rx="18" ry="11.5"/>`;
    const arm = ([sh, e, w]) => path('skin', limbPath(sh, e, 6.5, 4.6, 1.2, 1.2)) + path('skin', limbPath(e, w, 4.4, 3.2, 0.8, 0.8)) + circ('skin', w, 4.2);
    s += arm([j.sR, j.elR, j.wrR]) + arm([j.sL, j.elL, j.wrL]);
    s += `<ellipse class="skin" cx="${f(c[0])}" cy="${f(c[1])}" rx="21" ry="11" ${rot()}/>`;
    if (hot.includes('pec')) s += [-1, 1].map((k) => `<ellipse class="musc" cx="${f(c[0] + k * 9)}" cy="${f(c[1] - 5.5)}" rx="8" ry="4.2" ${rot()}/>`).join('');
    if (hot.includes('rear')) s += [-1, 1].map((k) => `<ellipse class="musc" cx="${f(c[0] + k * 13)}" cy="${f(c[1] + 4.5)}" rx="6.5" ry="4" ${rot()}/>`).join('') +
      `<ellipse class="musc" cx="${f(c[0])}" cy="${f(c[1] + 6)}" rx="6" ry="3.5" ${rot()}/>`;
    if (hot.includes('delt')) s += [j.sR, j.sL].map((q) => circ('musc', q, 6)).join('');
    s += circ('skin', R([0, -1]), 8.5) + circ('hair', R([0, 1]), 7.6) + circ('skin', R([0, -9]), 2.2);
    return s;
  }

  /* ---------- Geräte-Bausteine ---------- */
  const ln = (a, b, cls, w) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" class="${cls}" stroke-width="${w}"/>`;
  const pad = (a, b, w) => ln(a, b, 'pad', w) + ln(a, b, 'padhl', Math.max(1.5, w * 0.25));
  const grip = (p) => circ('grip', p, 3);
  // Gewichtsstapel: x = linke Säule, y = Boden, u = Bewegung (0..1); die oberen k Platten heben sich
  function stack(x, y, u, h = 74, n = 10, k = 4, lift = 18) {
    const w = 26, ph = 4.6, top = y - h;
    let s = ln([x, y], [x, top], 'frame', 3) + ln([x + w, y], [x + w, top], 'frame', 3) + ln([x - 2, top], [x + w + 2, top], 'frame', 4);
    s += `<circle cx="${x + w / 2}" cy="${top + 6}" r="4" class="pulley"/>`;
    let topY = y;
    for (let i = 0; i < n; i++) {
      const moving = i >= n - k, py = y - 2 - (i + 1) * (ph + 0.6) - (moving ? u * lift : 0);
      s += `<rect x="${x + 3}" y="${f(py)}" width="${w - 6}" height="${ph}" rx="1.2" class="${moving ? 'plateOn' : 'plateOff'}"/>`;
      topY = Math.min(topY, py);
    }
    return s + ln([x + w / 2, topY], [x + w / 2, top + 6], 'cable', 1.4);
  }
  const floor = (y) => ln([24, y], [236, y], 'floor', 3);
  const pulley = (p) => circ('pulley', p, 4);

  /* ---------- Übungen ---------- */
  const EX = {
    /* ----- Seitenansicht ----- */
    beinpresse: {
      muscles: 'Oberschenkel vorne (Quadrizeps), Gesäß',
      cue: 'Knie zeigen Richtung Fußspitzen, unterer Rücken bleibt am Polster',
      vb: '20 26 220 128',
      a: { hip: [92, 108], torso: -118, neck: 14, uarm: 52, farm: 46, thigh: -52, shin: 32, foot: -82 },
      b: { hip: [92, 108], torso: -118, neck: 14, uarm: 52, farm: 46, thigh: -14, shin: -3, foot: -82 },
      hot: ['quad', 'glute'],
      back: (j, u) => {
        const x = j.an[0] + 6, y = j.an[1];
        return floor(150) + stack(204, 148, u, 78) +
          ln([40, 146], [200, 146], 'frame', 5) + ln([88, 120], [88, 146], 'frame', 6) + ln([66, 120], [60, 146], 'frame', 5) +
          ln([128, 136], [204, 136], 'frame', 4) + ln([128, 136], [128, 146], 'frame', 4) + ln([104, 114], [104, 103], 'frame', 4) +
          pad([64, 116], [112, 116], 10) + pad([74, 108], [49, 48], 12) +
          ln([x + 4, y + 10], [x + 4, 136], 'frame', 5) + `<rect x="${f(x)}" y="133" width="18" height="6" rx="2" class="frameFill"/>` +
          ln([x + 18, 136], [217, 76], 'cable', 1.4) + pad([x, y - 30], [x, y + 14], 8);
      },
      front: (j) => grip(j.wr)
    },
    schulterpresse: {
      muscles: 'Schultern (vorderer + seitlicher Deltamuskel), Trizeps',
      cue: 'Rücken fest am Polster, kein Hohlkreuz, unten bis etwa Kinnhöhe',
      vb: '20 6 220 168',
      a: { hip: [110, 128], torso: -95, neck: 4, uarm: 75, farm: -85, thigh: 4, shin: 92, foot: 0 },
      b: { hip: [110, 128], torso: -95, neck: 4, uarm: -70, farm: -84, thigh: 4, shin: 92, foot: 0 },
      hot: ['delt', 'tri'],
      back: (j, u) => {
        const piv = [58, 50];
        return floor(172) + stack(22, 170, u, 92) +
          ln([58, 170], piv, 'frame', 6) + ln([40, 170], [150, 170], 'frame', 5) +
          ln([112, 138], [112, 170], 'frame', 6) + ln([140, 160], [148, 170], 'frame', 4) +
          pad([96, 135], [140, 135], 10) + pad([95, 128], [90, 60], 13) +
          ln(piv, j.wr, 'lever', 6) + pulley(piv) + ln([35, 84], [56, 54], 'cable', 1.4);
      },
      front: (j) => ln(add(j.wr, [-4, 0]), add(j.wr, [9, 0]), 'grip', 5)
    },
    brustpresse: {
      muscles: 'Brust, vordere Schulter, Trizeps',
      cue: 'Schulterblätter zusammen und unten, Griffe auf Brusthöhe, Arme nicht ganz durchdrücken',
      vb: '20 16 220 160',
      a: { hip: [96, 128], torso: -97, neck: 4, elV: [-14, 10], wrV: [21, -5], thigh: 2, shin: 90, foot: 0 },
      b: { hip: [96, 128], torso: -97, neck: 4, elV: [25, 3], wrV: [25, 0], thigh: 2, shin: 90, foot: 0 },
      hot: ['chest', 'delt', 'tri'],
      back: (j, u) => floor(172) + stack(204, 170, u, 110) +
        ln([60, 170], [150, 170], 'frame', 5) + ln([94, 138], [94, 170], 'frame', 6) +
        pad([80, 135], [124, 135], 10) + pad([80, 128], [72, 58], 13) +
        ln([j.sh[0] - 6, j.wr[1]], [178, j.wr[1]], 'lever', 4) + ln([178, 40], [178, 170], 'frame', 5) +
        ln([178, 44], [217, 64], 'cable', 1.4) + pulley([178, 44]),
      front: (j) => ln(add(j.wr, [0, -6]), add(j.wr, [0, 6]), 'grip', 5)
    },
    rudern_tief: {
      muscles: 'Rücken (Latissimus, mittlerer Rücken), Bizeps',
      cue: 'Brust raus, erst Schulterblätter nach hinten-unten, dann die Arme. Ellenbogen eng am Körper',
      vb: '20 20 220 136',
      a: { hip: [90, 120], torso: -80, neck: 6, uarm: 18, farm: 14, thigh: -8, shin: 30, foot: -62 },
      b: { hip: [90, 120], torso: -96, neck: 4, uarm: 112, farm: -8, thigh: -8, shin: 30, foot: -62 },
      hot: ['back', 'bi'],
      back: (j, u) => floor(152) + stack(206, 150, u, 80) +
        ln([50, 150], [200, 150], 'frame', 5) + pad([66, 127], [114, 127], 10) + ln([90, 130], [90, 150], 'frame', 6) +
        ln([j.toe[0] + 5, j.toe[1] - 14], [j.toe[0] + 5, 150], 'frame', 5) + pad([j.toe[0] + 4, j.toe[1] - 14], [j.toe[0] + 4, j.toe[1] + 12], 7) +
        pulley([196, 120]) + ln(j.wr, [196, 120], 'cable', 1.6) + ln([196, 120], [219, 76], 'cable', 1.4),
      front: (j) => ln(add(j.wr, [0, -5]), add(j.wr, [0, 5]), 'grip', 5)
    },
    rudern_eng: {
      muscles: 'Mittlerer Rücken, Latissimus, hintere Schulter, Bizeps',
      cue: 'Aufrecht sitzen, nicht mit dem Oberkörper schwingen, Griff Richtung Bauchnabel',
      vb: '20 20 220 136',
      a: { hip: [90, 120], torso: -92, neck: 4, uarm: 0, farm: 0, thigh: -8, shin: 30, foot: -62 },
      b: { hip: [90, 120], torso: -94, neck: 4, uarm: 122, farm: -12, thigh: -8, shin: 30, foot: -62 },
      hot: ['back', 'bi'],
      back: (j, u) => floor(152) + stack(206, 150, u, 112) +
        ln([50, 150], [200, 150], 'frame', 5) + pad([66, 127], [114, 127], 10) + ln([90, 130], [90, 150], 'frame', 6) +
        ln([j.toe[0] + 5, j.toe[1] - 14], [j.toe[0] + 5, 150], 'frame', 5) + pad([j.toe[0] + 4, j.toe[1] - 14], [j.toe[0] + 4, j.toe[1] + 12], 7) +
        pulley([196, 72]) + ln(j.wr, [196, 72], 'cable', 1.6) + ln([196, 72], [219, 44], 'cable', 1.4),
      front: (j) => ln(add(j.wr, [0, -5]), add(j.wr, [0, 5]), 'grip', 5)
    },
    preacher_curl: {
      muscles: 'Bizeps, Unterarm',
      cue: 'Oberarm bleibt auf dem Polster, unten nicht ganz fallen lassen',
      vb: '20 26 220 150',
      a: { hip: [84, 130], torso: -78, neck: 10, uarm: 38, farm: 32, thigh: 0, shin: 95, foot: 0 },
      b: { hip: [84, 130], torso: -78, neck: 10, uarm: 38, farm: -98, thigh: 0, shin: 95, foot: 0 },
      hot: ['bi'],
      back: (j, u) => {
        const d = unit(sub(j.el, j.sh)), nb = [-d[1], d[0]], p2 = add(add(j.el, mul(nb, 12)), mul(d, 4));
        return floor(172) + stack(206, 170, u, 110) + ln([50, 170], [190, 170], 'frame', 5) +
          pad([64, 137], [104, 137], 10) + ln([84, 140], [84, 170], 'frame', 6) +
          ln(add(p2, [-2, 4]), [128, 170], 'frame', 6) +
          ln(j.el, add(j.wr, mul(unit(sub(j.wr, j.el)), 4)), 'lever', 5) + pulley(j.el) +
          ln(add(j.el, [3, 2]), [219, 66], 'cable', 1.4);
      },
      front: (j) => { const d = unit(sub(j.el, j.sh)), nb = [-d[1], d[0]];
        return pad(add(add(j.sh, mul(nb, 12)), mul(d, 6)), add(add(j.el, mul(nb, 12)), mul(d, 4)), 10) + grip(j.wr); }
    },
    crunch_maschine: {
      muscles: 'Gerade Bauchmuskeln',
      cue: 'Oberkörper einrollen statt aus der Hüfte ziehen, beim Zusammenziehen ausatmen',
      vb: '20 20 220 156',
      a: { hip: [96, 132], torso: -96, neck: 4, uarm: 70, farm: -58, thigh: -4, shin: 94, foot: 0 },
      b: { hip: [96, 132], torso: -56, neck: 26, uarm: 108, farm: -18, thigh: -4, shin: 94, foot: 0 },
      hot: ['abs'],
      back: (j, u) => floor(172) + stack(206, 170, u, 120) + ln([50, 170], [190, 170], 'frame', 5) +
        pad([76, 139], [120, 139], 10) + ln([96, 142], [96, 170], 'frame', 6) + pad([78, 132], [72, 92], 12) +
        ln([j.an[0] + 9, j.an[1] - 4], [j.an[0] + 9, 170], 'frame', 4) + circ('pad', [j.an[0] + 9, j.an[1] - 6], 5),
      front: (j) => {
        const u = dirv(j.p.torso), n = dirv(j.p.torso + 90), c = add(add(j.hip, mul(u, 40)), mul(n, 18));
        return pad(add(c, mul(u, -9)), add(c, mul(u, 9)), 8) + ln(add(c, mul(u, 9)), add(add(c, mul(u, 22)), mul(n, 6)), 'lever', 5) +
          ln(add(add(c, mul(u, 22)), mul(n, 6)), [219, 56], 'cable', 1.4);
      }
    },
    beinbeuger_liegend: {
      muscles: 'Oberschenkel hinten (Beinbeuger), Waden',
      cue: 'Hüfte bleibt auf dem Polster, langsam ablassen',
      vb: '20 40 220 126',
      flipY: 100, // Figur in Rückenlage beschrieben und gespiegelt → Bauchlage
      a: { hip: [126, 100], torso: 180, neck: 0, uarm: -118, farm: -20, thigh: 2, shin: 0, foot: -78 },
      b: { hip: [126, 100], torso: 180, neck: 0, uarm: -118, farm: -20, thigh: 2, shin: 112, foot: 10 },
      hot: ['ham', 'calf'],
      back: (j, u) => {
        const d = unit(sub(j.an, j.kn)), roll = add(j.an, mul([d[1], -d[0]], 8)), piv = [j.kn[0] + 2, 126];
        return floor(158) + stack(206, 156, u, 80) + pad([36, 114], [166, 114], 10) +
          ln([60, 118], [60, 156], 'frame', 6) + ln([150, 118], [150, 156], 'frame', 6) + ln([40, 156], [200, 156], 'frame', 5) +
          ln([44, 118], [44, 140], 'frame', 4) +
          ln(piv, roll, 'lever', 5) + pulley(piv) + ln(add(piv, [4, 2]), [219, 82], 'cable', 1.4) +
          `<circle cx="${f(roll[0])}" cy="${f(roll[1])}" r="6.5" class="padc"/>`;
      },
      front: (j) => grip(j.wr)
    },
    wadenheben: {
      muscles: 'Waden',
      cue: 'Unten tief in die Dehnung, oben 1 s auf den Zehenspitzen halten, nicht federn',
      vb: '20 -24 220 206',
      a: { hip: [117.8, 86.4], torso: -90, neck: 2, uarm: 72, farm: -66, thigh: 90, shin: 90, foot: -20 },
      b: { hip: [120, 73.6], torso: -90, neck: 2, uarm: 72, farm: -66, thigh: 90, shin: 90, foot: 40 },
      hot: ['calf'],
      back: (j, u) => floor(178) + stack(200, 176, u, 150) +
        `<rect x="122" y="163" width="40" height="13" rx="2" class="frameFill"/>` + ln([166, 176], [166, 20], 'frame', 6),
      front: (j) => {
        const s = add(j.sh, [0, -7]);
        return pad(add(s, [-10, 0]), add(s, [12, 0]), 8) + ln(add(s, [12, 0]), [166, s[1]], 'lever', 5) +
          ln([166, s[1] - 2], [213, 34], 'cable', 1.4) + pulley([166, s[1]]);
      }
    },
    trizepsdruecken: {
      muscles: 'Trizeps (Oberarm hinten)',
      cue: 'Ellenbogen fest am Körper, nur der Unterarm bewegt sich, unten ganz strecken',
      vb: '20 6 220 172',
      a: { hip: [104, 94], torso: -84, neck: 8, uarm: 96, farm: -40, thigh: 92, shin: 88, foot: 0 },
      b: { hip: [104, 94], torso: -84, neck: 8, uarm: 96, farm: 88, thigh: 92, shin: 88, foot: 0 },
      hot: ['tri'],
      back: (j, u) => floor(174) + stack(196, 172, u, 156) + ln([150, 172], [150, 14], 'frame', 6) + ln([150, 16], [196, 16], 'frame', 5) +
        pulley([150, 22]) + ln([150, 22], [209, 22], 'cable', 1.4),
      front: (j) => ln(j.wr, [150, 22], 'cable', 1.6) + ln(add(j.wr, [-6, 0]), add(j.wr, [6, 0]), 'grip', 5)
    },

    /* ----- Vorderansicht ----- */
    adduktoren: {
      view: 'front',
      muscles: 'Oberschenkel innen (Adduktoren)',
      cue: 'Langsam und kontrolliert, kein Schwung aus dem Gewicht, 1 s zusammen halten',
      vb: '20 18 220 146',
      a: { c: [120, 100], uarm: 76, farm: 96, kneeV: [27, 13], shin: 92 },
      b: { c: [120, 100], uarm: 76, farm: 96, kneeV: [7, 13], shin: 92 },
      hot: ['add'],
      back: (j, u) => floor(162) + stack(206, 160, u, 90) + pad([j.c[0] - 26, j.c[1] - 6], [j.c[0] + 26, j.c[1] - 6], 1) +
        `<rect x="${j.c[0] - 24}" y="${j.shY - 4}" width="48" height="60" rx="8" class="padFill"/>` +
        pad([j.c[0] - 34, j.c[1] + 8], [j.c[0] + 34, j.c[1] + 8], 10) + ln([j.c[0], j.c[1] + 12], [j.c[0], 160], 'frame', 7) +
        ln([j.c[0] + 30, 160], [190, 160], 'frame', 4),
      front: (j) => [[j.kR, j.aR, -1], [j.kL, j.aL, 1]].map(([k, a, s]) => {
        const pdx = k[0] + s * 9;
        return pad([pdx, k[1] - 10], [pdx, k[1] + 8], 6) + ln([pdx, k[1] + 8], [j.c[0] + s * -4, 150], 'lever', 4) + pad(add(a, [-6, 7]), add(a, [6, 7]), 4);
      }).join('') + ln([j.c[0] + 4, 150], [219, 76], 'cable', 1.4)
    },
    abduktoren: {
      view: 'front',
      muscles: 'Hüfte außen / seitliches Gesäß (Abduktoren)',
      cue: 'Langsam und kontrolliert, kein Schwung aus dem Gewicht, 1 s offen halten',
      vb: '20 18 220 146',
      a: { c: [120, 100], uarm: 76, farm: 96, kneeV: [7, 13], shin: 92 },
      b: { c: [120, 100], uarm: 76, farm: 96, kneeV: [27, 13], shin: 92 },
      hot: ['abd'],
      back: (j, u) => floor(162) + stack(206, 160, u, 90) +
        `<rect x="${j.c[0] - 24}" y="${j.shY - 4}" width="48" height="60" rx="8" class="padFill"/>` +
        pad([j.c[0] - 34, j.c[1] + 8], [j.c[0] + 34, j.c[1] + 8], 10) + ln([j.c[0], j.c[1] + 12], [j.c[0], 160], 'frame', 7) +
        ln([j.c[0] + 30, 160], [190, 160], 'frame', 4),
      front: (j) => [[j.kR, j.aR, 1], [j.kL, j.aL, -1]].map(([k, a, s]) => {
        const pdx = k[0] + s * 9;
        return pad([pdx, k[1] - 10], [pdx, k[1] + 8], 6) + ln([pdx, k[1] + 8], [j.c[0] + s * 4, 150], 'lever', 4) + pad(add(a, [-6, 7]), add(a, [6, 7]), 4);
      }).join('') + ln([j.c[0] + 4, 150], [219, 76], 'cable', 1.4)
    },
    seitheben: {
      view: 'front',
      muscles: 'Seitliche Schulter (Deltamuskel)',
      cue: 'Nicht über Schulterhöhe, Schultern nicht hochziehen',
      vb: '20 26 220 146',
      a: { c: [118, 116], uarm: 82, farm: 92, kneeV: [13, 12], shin: 92 },
      b: { c: [118, 116], uarm: 2, farm: 22, kneeV: [13, 12], shin: 92 },
      hot: ['delt'],
      back: (j, u) => floor(168) + stack(206, 166, u, 100) +
        `<rect x="${j.c[0] - 24}" y="${j.shY - 2}" width="48" height="58" rx="8" class="padFill"/>` +
        pad([j.c[0] - 32, j.c[1] + 8], [j.c[0] + 32, j.c[1] + 8], 10) + ln([j.c[0], j.c[1] + 12], [j.c[0], 166], 'frame', 7) +
        ln([j.c[0], j.shY - 14], [219, 72], 'cable', 1.4) + ln([j.c[0], j.shY - 14], [j.c[0], j.shY - 2], 'frame', 4) + pulley([j.c[0], j.shY - 14]),
      front: (j) => [[j.sR, j.elR, 1], [j.sL, j.elL, -1]].map(([s, e, k]) => {
        const d = unit(sub(e, s)), n = k > 0 ? [d[1], -d[0]] : [-d[1], d[0]], c = add(e, mul(n, 7));
        return ln(add(s, [0, -2]), c, 'lever', 4) + pad(add(c, mul(d, -9)), add(c, mul(d, 2)), 7);
      }).join('')
    },

    /* ----- Draufsicht ----- */
    butterfly: {
      view: 'top',
      muscles: 'Brust, vordere Schulter',
      cue: 'Ellenbogen leicht gebeugt auf Schulterhöhe, in der Mitte kurz zusammendrücken',
      note: 'Ansicht von oben',
      vb: '20 26 220 120',
      a: { c: [118, 100], uarm: 12, farm: -70 },
      b: { c: [118, 100], uarm: -70, farm: -145 },
      hot: ['pec', 'delt'],
      back: (j, u) => stack(206, 140, u, 100) + pad([j.c[0] - 24, j.c[1] + 13], [j.c[0] + 24, j.c[1] + 13], 9) +
        [[j.sR, j.elR, j.wrR, 1], [j.sL, j.elL, j.wrL, -1]].map(([s, e, w, k]) => {
          const piv = add(s, [k * 3, -3]);
          return ln(piv, w, 'lever', 5) + pulley(piv);
        }).join(''),
      front: (j) => [[j.elR, j.wrR], [j.elL, j.wrL]].map(([e, w]) => pad(add(e, mul(unit(sub(w, e)), 6)), w, 7)).join('')
    },
    butterfly_reverse: {
      view: 'top',
      muscles: 'Hintere Schulter, oberer Rücken zwischen den Schulterblättern',
      cue: 'Arme leicht gebeugt, Bewegung aus der hinteren Schulter, Brust bleibt am Polster',
      note: 'Ansicht von oben',
      vb: '20 26 220 120',
      a: { c: [118, 104], uarm: -98, farm: -100 },
      b: { c: [118, 104], uarm: -6, farm: -4 },
      hot: ['rear'],
      back: (j, u) => stack(206, 144, u, 100) + pad([j.c[0] - 15, j.c[1] - 16], [j.c[0] + 15, j.c[1] - 16], 9) +
        [[j.sR, j.wrR, 1], [j.sL, j.wrL, -1]].map(([s, w, k]) => { const piv = add(s, [-k * 6, -12]); return ln(piv, w, 'lever', 5) + pulley(piv); }).join(''),
      front: (j) => grip(j.wrR) + grip(j.wrL)
    },
    rotation: {
      view: 'top',
      muscles: 'Seitliche Bauchmuskeln (schräge Bauchmuskeln)',
      cue: 'Langsam, Drehung aus dem Rumpf, Hüfte bleibt fest',
      note: 'Ansicht von oben',
      vb: '20 26 220 128',
      a: { c: [118, 106], rot: 0, uarm: -40, farm: -150, seated: true },
      b: { c: [118, 106], rot: 42, uarm: -40, farm: -150, seated: true },
      hot: ['obl'],
      back: (j, u) => stack(206, 148, u, 100) + circ('padc', j.c, 25) + pad([j.c[0] - 26, j.c[1] + 16], [j.c[0] + 26, j.c[1] + 16], 9),
      front: (j) => pad(j.R([-14, -16]), j.R([14, -16]), 7) + grip(j.wrR) + grip(j.wrL) + ln(j.R([0, -16]), j.R([0, -30]), 'lever', 4)
    }
  };
  const ALIAS = { beinpresse_a: 'beinpresse', beinpresse_b: 'beinpresse', butterfly_reverse_a: 'butterfly_reverse', butterfly_reverse_b: 'butterfly_reverse' };
  const get = (id) => EX[ALIAS[id] || id] || null;

  /* ---------- Abspielen ---------- */
  // Tempo: 1,2 s konzentrisch, 0,4 s halten, 1,8 s exzentrisch, 0,4 s halten
  function phase(t) {
    const T = 3.8, x = (t / 1000) % T, ease = (v) => (1 - Math.cos(Math.PI * v)) / 2;
    if (x < 1.2) return ease(x / 1.2);
    if (x < 1.6) return 1;
    if (x < 3.4) return 1 - ease((x - 1.6) / 1.8);
    return 0;
  }
  const VIEWS = { side: [sideJ, sideFigure], front: [frontJ, frontFigure], top: [topJ, topFigure] };
  function frame(ex, u) {
    const p = {};
    for (const k of Object.keys(ex.a)) {
      const a = ex.a[k], b = ex.b[k];
      p[k] = Array.isArray(a) ? [lerp(a[0], b[0], u), lerp(a[1], b[1], u)] : typeof a === 'number' ? lerp(a, b, u) : a;
    }
    const [J, FIG] = VIEWS[ex.view || 'side'];
    const j = J(p);
    let fig = FIG(j, ex.hot), jm = j;
    if (ex.flipY != null) {
      const y0 = ex.flipY, fl = (q) => [q[0], 2 * y0 - q[1]];
      fig = `<g transform="matrix(1 0 0 -1 0 ${2 * y0})">${fig}</g>`;
      jm = { p: j.p }; for (const k of Object.keys(j)) if (Array.isArray(j[k])) jm[k] = fl(j[k]);
    }
    return (ex.back ? ex.back(jm, u) : '') + fig + (ex.front ? ex.front(jm, u) : '');
  }
  function mount(el, id) {
    const ex = get(id); if (!ex) return null;
    el.innerHTML = `<svg viewBox="${ex.vb}" class="anim-svg" role="img" aria-label="Bewegungsablauf"><g class="anim-g"></g></svg>
      <div class="anim-info"><span class="anim-m">Arbeitet: ${ex.muscles}</span><span class="muted">${ex.cue}${ex.note ? ` · ${ex.note}` : ''}</span></div>`;
    const g = el.querySelector('.anim-g');
    let raf = 0, alive = true;
    const loop = (t) => { if (!alive) return; g.innerHTML = frame(ex, phase(t)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }
  return { mount, has: (id) => !!get(id), _frame: (id, u) => frame(get(id), u), _vb: (id) => get(id).vb, _ids: Object.keys(EX) };
})();

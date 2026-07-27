/* Age of Wars — monster/giant motion rig (window.KWMonsters).
 * Humanoid giants share the mechanical FK approach of the soldier rig but at
 * boss proportions. Non-humanoid monsters get their own draw fns later.
 * Self-contained (own draw helpers) so it doesn't depend on KWRig internals.
 *
 *   KWMonsters.draw(ctx, type, state, p, t, scale, team)
 *   type : 'cyclops'            (more added incrementally)
 *   state: 'idle'|'walk'|'slam'|'stomp'|'roar'|'die'
 *   p    : 0..1 progress within the state's cycle
 *   t    : seconds (for idle breathing / ambient)
 *   scale: pixels per rig-unit (giant is ~150 rig-units tall; try 1.0–2.2)
 */
window.KWMonsters = (function () {
  const DN = Math.PI / 2, UP = -Math.PI / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = amt < 0 ? 0 : 255, p = Math.abs(amt); r = Math.round(r + (f - r) * p); g = Math.round(g + (f - g) * p); b = Math.round(b + (f - b) * p); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
  function cyl(ctx, x0, x1, base, lit) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, shade(base, -.34)); g.addColorStop(.5, shade(base, lit == null ? .3 : lit)); g.addColorStop(1, shade(base, -.34)); return g; }
  function fk(p, a, l) { return [p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l]; }
  function limb(ctx, a, b, wa, wb, col) { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0] + nx * wa, a[1] + ny * wa); ctx.lineTo(b[0] + nx * wb, b[1] + ny * wb); ctx.lineTo(b[0] - nx * wb, b[1] - ny * wb); ctx.lineTo(a[0] - nx * wa, a[1] - ny * wa); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(a[0], a[1], wa, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(b[0], b[1], wb, 0, 7); ctx.fill(); }
  function poly(ctx, pts, fill, st, lw) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (st) { ctx.strokeStyle = st; ctx.lineWidth = lw || 1; ctx.stroke(); } }

  // ---- Cyclops palette ----
  const CYC = { skin: '#8a7350', skinDark: '#5f4d33', skinLit: '#a98d63', hair: '#33271a', horn: '#e0d4ba', eye: '#ffd23a', eyeGlow: 'rgba(255,190,60,.55)', loin: '#5a3d24', wood: '#6b4a2c', trim: '#2f2214', nail: '#d8ccae' };

  // Build the giant skeleton (rig-units; feet at y=0, body rises to negative y).
  function build(po) {
    const hipY = -(po.thigh + po.shin) + po.py;
    const pv = [po.px, hipY];
    const sh = fk(pv, UP + po.lean, po.spine);
    const nk = fk(sh, UP + po.lean, po.neck);
    const hd = fk(nk, UP + po.lean + po.headTilt, po.headR + 4);
    const legPts = (g) => { const hip = DN - g.fwd, kn = DN - g.fwd + g.bend; const p1 = fk(pv, hip, po.thigh), p2 = fk(p1, kn, po.shin), p3 = fk(p2, 0.05 + (g.tilt || 0), po.foot); return [pv, p1, p2, p3]; };
    const armPts = (a) => { const up = DN - a.fwd, fo = DN - a.fwd - a.bend; const e = fk(sh, up, po.uarm), h = fk(e, fo, po.farm); return [sh, e, h]; };
    return { pv, sh, nk, hd, legF: legPts(po.legF), legB: legPts(po.legB), armF: armPts(po.armF), armB: armPts(po.armB) };
  }

  // ---- Cyclops pose per state ----
  function cyclopsPose(state, p, t) {
    const po = { px: 0, py: 0, lean: 0, headTilt: 0, alpha: 1,
      spine: 46, neck: 8, headR: 16, thigh: 34, shin: 30, foot: 18, uarm: 40, farm: 36,
      lean: 0.14,                                    // permanent forward hunch toward the enemy
      legF: { fwd: 0.10, bend: 0.18, tilt: 0 }, legB: { fwd: -0.10, bend: 0.20, tilt: 0 },
      armF: { fwd: 0.30, bend: 1.05 }, armB: { fwd: 0.16, bend: 1.05 }, extra: {} };
    switch (state) {
      case 'idle': {
        const b = Math.sin(t * 1.25), b2 = Math.sin(t * 1.25 + 1.2), sway = Math.sin(t * 0.7);
        po.py = b * 1.9;                                    // chest breathing rise/fall
        po.lean = 0.14 + b * 0.025;                         // ribcage expand on inhale
        po.headTilt = sway * 0.07 + b * 0.025;              // head sway + slow nod
        po.armF = { fwd: 0.30 + b2 * 0.06, bend: 1.05 + b2 * 0.09 };   // near fist sways
        po.armB = { fwd: 0.16 + b * 0.05, bend: 1.05 + b * 0.07 };     // club arm swings with weight
        po.legF = { fwd: 0.10 + sway * 0.04, bend: 0.18 + Math.max(0, sway) * 0.05, tilt: 0 }; // weight shift
        po.legB = { fwd: -0.10 - sway * 0.04, bend: 0.20 + Math.max(0, -sway) * 0.05, tilt: 0 };
        po.extra.breathe = b; break;
      }
      case 'walk': { const s = Math.sin(p * Math.PI * 2); po.legF = { fwd: 0.34 * s, bend: 0.2 + Math.max(0, -s) * 0.7, tilt: Math.max(0, -s) * 0.4 }; po.legB = { fwd: -0.34 * s, bend: 0.2 + Math.max(0, s) * 0.7, tilt: Math.max(0, s) * 0.4 }; po.py = -Math.abs(Math.sin(p * Math.PI * 4)) * 2; po.lean = 0.16; break; }
      case 'slam': { const raise = ss(0, .45, p), down = ss(.45, .62, p), rec = ss(.62, 1, p); po.extra.club = 1; po.lean = -0.12 * raise + 0.28 * down - 0.2 * rec; po.armB = { fwd: lerp(0.1, -1.9, raise) * (1 - down) + down * 1.5, bend: lerp(1.0, 0.5, raise) }; po.extra.clubAng = lerp(-2.3, 0.9, down); po.extra.impact = down * (1 - rec); po.py = -raise * 4 + down * 4; break; }
      case 'stomp': { const lift = ss(0, .4, p), drop = ss(.4, .55, p), rec = ss(.55, 1, p); po.legF = { fwd: 0.1 + lift * 0.2, bend: 0.2 + lift * 1.4 - drop * 1.2, tilt: 0.6 * lift }; po.py = -lift * 6 + drop * 6; po.lean = 0.06 + lift * 0.05; po.extra.club = 1; po.extra.clubAng = -1.9; po.extra.quake = drop * (1 - rec); break; }
      case 'roar': { const open = ss(0, .3, p) * (1 - ss(.7, 1, p)); po.lean = -0.14 * open; po.headTilt = -0.5 * open; po.armF = { fwd: 0.4 + open * 0.6, bend: 1.1 - open * 0.4 }; po.armB = { fwd: 0.3 + open * 0.5, bend: 1.1 - open * 0.4 }; po.extra.club = 1; po.extra.clubAng = -1.9; po.extra.roar = open; break; }
      case 'die': { const fall = ss(0, .8, p); po.lean = -1.3 * fall; po.py = fall * 4; po.headTilt = 0.5 * fall; po.legF = { fwd: 0.3 * fall, bend: 0.3 + 0.4 * fall }; po.legB = { fwd: -0.2, bend: 0.3 }; po.armB = { fwd: 0.2, bend: 0.6 }; po.armF = { fwd: 0.2, bend: 0.6 }; po.alpha = 1 - ss(.8, 1, p) * 0.15; po.extra.club = p < .5 ? 1 : 0; po.extra.clubAng = -1.4; break; }
      default: po.py = Math.sin(t * 1.1) * 1.6;
    }
    return po;
  }

  function drawClub(ctx, hand, fore, ang, C) {
    const d = [Math.cos(ang), Math.sin(ang)], nx = -d[1], ny = d[0];
    const grip = 10, len = 62, headStart = len * 0.55;
    const base = [hand[0] - d[0] * grip, hand[1] - d[1] * grip];
    const tip = [hand[0] + d[0] * len, hand[1] + d[1] * len];
    // shaft
    ctx.strokeStyle = shade(C.wood, -.05); ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = shade(C.wood, .16); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(hand[0] + d[0] * headStart, hand[1] + d[1] * headStart); ctx.stroke(); // grain
    ctx.strokeStyle = C.trim; ctx.lineWidth = 3; for (let b = 0; b < 3; b++) { const gp = [hand[0] - d[0] * (grip - b * 5), hand[1] - d[1] * (grip - b * 5)]; ctx.beginPath(); ctx.moveTo(gp[0] + nx * 3, gp[1] + ny * 3); ctx.lineTo(gp[0] - nx * 3, gp[1] - ny * 3); ctx.stroke(); } // leather grip binding
    // bulbous head
    const hc = [hand[0] + d[0] * (headStart + 18), hand[1] + d[1] * (headStart + 18)];
    ctx.fillStyle = cyl(ctx, hc[0] - 16, hc[0] + 16, C.wood, .18);
    ctx.beginPath(); ctx.ellipse(hc[0], hc[1], 17, 14, ang, 0, 7); ctx.fill();
    // spikes
    ctx.fillStyle = C.horn;
    for (let i = 0; i < 6; i++) { const a = ang + i / 6 * Math.PI * 2; const sx = hc[0] + Math.cos(a) * 14, sy = hc[1] + Math.sin(a) * 12; poly(ctx, [[sx + Math.cos(a) * 8, sy + Math.sin(a) * 8], [sx + Math.cos(a + 1.6) * 4, sy + Math.sin(a + 1.6) * 4], [sx + Math.cos(a - 1.6) * 4, sy + Math.sin(a - 1.6) * 4]], C.horn, C.trim, 0.4); }
  }

  // PROFILE head — face toward +x (forward = the enemy), cranium/horns back (-x).
  function head(ctx, J, po, C) {
    const [hx, hy] = J.hd, r = po.headR;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(po.lean + po.headTilt);
    // skull silhouette in profile
    ctx.fillStyle = cyl(ctx, -r, r, C.skin, .2);
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.15);
    ctx.quadraticCurveTo(-r * 1.05, -r * 0.95, -r * 0.15, -r * 1.05); // crown
    ctx.quadraticCurveTo(r * 0.65, -r * 1.08, r * 0.98, -r * 0.32);   // forehead → heavy brow (forward)
    ctx.quadraticCurveTo(r * 1.18, r * 0.02, r * 0.9, r * 0.42);      // face / snout front
    ctx.quadraticCurveTo(r * 0.72, r * 0.98, r * 0.15, r * 0.9);      // jaw
    ctx.quadraticCurveTo(-r * 0.7, r * 0.85, -r * 0.95, -r * 0.15);   // back of jaw
    ctx.closePath(); ctx.fill();
    // heavy brow ridge shadow (forward)
    ctx.fillStyle = shade(C.skin, -.3); ctx.beginPath(); ctx.ellipse(r * 0.55, -r * 0.35, r * 0.5, r * 0.2, -.35, 0, 7); ctx.fill();
    // horns swept back + up
    ctx.fillStyle = C.horn;
    poly(ctx, [[-r * 0.25, -r * 0.9], [-r * 1.15, -r * 1.55], [-r * 0.5, -r * 0.7]], C.horn, C.trim, 0.5);
    poly(ctx, [[-r * 0.5, -r * 0.72], [-r * 1.3, -r * 1.05], [-r * 0.62, -r * 0.5]], C.horn, C.trim, 0.5);
    // single eye set forward under the brow, iris pushed toward the enemy (+x)
    ctx.fillStyle = C.eyeGlow; ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.03, r * 0.44, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.03, r * 0.31, 0, 7); ctx.fill();
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.arc(r * 0.63, -r * 0.03, r * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = '#201400'; ctx.beginPath(); ctx.arc(r * 0.70, -r * 0.03, r * 0.08, 0, 7); ctx.fill();
    // underbite jaw + tusk (front)
    ctx.fillStyle = shade(C.skin, -.12); ctx.beginPath(); ctx.ellipse(r * 0.5, r * 0.62, r * 0.5, r * 0.26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#efe6d0'; poly(ctx, [[r * 0.86, r * 0.5], [r * 0.98, r * 0.08], [r * 0.72, r * 0.46]], '#efe6d0', C.trim, 0.4);
    // brow line + mouth / roar
    if (po.extra.roar > 0.1) { ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.ellipse(r * 0.58, r * 0.5, r * 0.3, r * 0.28 * po.extra.roar + 2, 0, 0, 7); ctx.fill(); }
    else { ctx.strokeStyle = shade(C.skin, -.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.3, r * 0.62); ctx.lineTo(r * 0.8, r * 0.55); ctx.stroke(); }
    // shaggy beard hanging off the jaw (front + underside)
    ctx.fillStyle = C.hair;
    ctx.beginPath(); ctx.moveTo(r * 0.15, r * 0.75); ctx.quadraticCurveTo(r * 0.55, r * 0.7, r * 0.9, r * 0.5);
    ctx.quadraticCurveTo(r * 0.8, r * 1.35, r * 0.35, r * 1.55); ctx.quadraticCurveTo(r * 0.0, r * 1.4, -r * 0.35, r * 1.15);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.85, -r * 0.6, r * 0.5); ctx.quadraticCurveTo(-r * 0.2, r * 0.85, r * 0.15, r * 0.75); ctx.closePath(); ctx.fill();
    // hair on the crown/back
    ctx.beginPath(); ctx.moveTo(-r * 0.95, -r * 0.1); ctx.quadraticCurveTo(-r * 1.15, -r * 0.7, -r * 0.4, -r * 0.95);
    ctx.quadraticCurveTo(-r * 0.6, -r * 0.4, -r * 0.85, r * 0.1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCyclops(ctx, po, C) {
    const J = build(po), sk = C.skin, far = shade(sk, -.14);
    ctx.globalAlpha = po.alpha;
    // ground shadow + quake/impact fx
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(po.px, 0, 40, 8, 0, 0, 7); ctx.fill();
    if (po.extra.impact > 0.05 || po.extra.quake > 0.05) { const k = Math.max(po.extra.impact || 0, po.extra.quake || 0); ctx.strokeStyle = 'rgba(200,180,120,' + (0.5 * k) + ')'; ctx.lineWidth = 3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(po.px + s * 18, 0); ctx.lineTo(po.px + s * (18 + 40 * k), -6 - 8 * k); ctx.stroke(); } }
    // far leg + far arm
    limb(ctx, J.legB[0], J.legB[1], 12, 9, far); limb(ctx, J.legB[1], J.legB[2], 9, 6, far);
    ctx.fillStyle = far; ctx.beginPath(); ctx.ellipse(J.legB[3][0], J.legB[3][1] - 1, 10, 5, 0, 0, 7); ctx.fill();
    limb(ctx, J.armB[0], J.armB[1], 9, 7, far); limb(ctx, J.armB[1], J.armB[2], 7, 5, far);
    if (po.extra.club) drawClub(ctx, J.armB[2], J.armB[1], po.extra.clubAng != null ? po.extra.clubAng : -1.9, C);
    // torso (broad, hunched) + muscle shading
    limb(ctx, J.pv, J.sh, 15, 20, sk);
    const chest = [lerp(J.sh[0], J.pv[0], .34), lerp(J.sh[1], J.pv[1], .34)];
    const belly = [lerp(J.sh[0], J.pv[0], .72), lerp(J.sh[1], J.pv[1], .72)];
    ctx.fillStyle = shade(sk, .16); ctx.beginPath(); ctx.ellipse(chest[0] + 6, chest[1], 12, 14, po.lean, 0, 7); ctx.fill();  // lit chest/pec
    ctx.fillStyle = shade(sk, -.16); ctx.beginPath(); ctx.ellipse(chest[0] - 8, chest[1] + 2, 7, 12, po.lean, 0, 7); ctx.fill(); // shaded far pec
    ctx.fillStyle = shade(sk, .06); ctx.beginPath(); ctx.ellipse(belly[0] + 4, belly[1], 11, 12, po.lean, 0, 7); ctx.fill();    // gut mass
    ctx.strokeStyle = shade(sk, -.28); ctx.lineWidth = 1.4;                                                                     // ab / muscle creases
    for (let i = 0; i < 3; i++) { const yy = lerp(chest[1] + 8, belly[1] + 4, i / 2); ctx.beginPath(); ctx.moveTo(chest[0] - 4, yy); ctx.lineTo(chest[0] + 12, yy - 1); ctx.stroke(); }
    ctx.strokeStyle = shade(sk, -.3); ctx.beginPath(); ctx.moveTo(chest[0] + 2, chest[1] - 12); ctx.lineTo(chest[0] + 2, belly[1] + 6); ctx.stroke(); // sternum line
    // loincloth
    ctx.fillStyle = C.loin; poly(ctx, [[J.pv[0] - 15, J.pv[1] - 2], [J.pv[0] + 15, J.pv[1] - 2], [J.pv[0] + 12, J.pv[1] + 22], [J.pv[0] - 12, J.pv[1] + 22]], C.loin, C.trim, 1);
    // near leg + thigh/calf muscle
    limb(ctx, J.legF[0], J.legF[1], 12, 9, sk); limb(ctx, J.legF[1], J.legF[2], 9, 6, sk);
    ctx.fillStyle = shade(sk, .14); ctx.beginPath(); ctx.ellipse(lerp(J.legF[0][0], J.legF[1][0], .5), lerp(J.legF[0][1], J.legF[1][1], .5), 6, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(sk, .08); ctx.beginPath(); ctx.ellipse(lerp(J.legF[1][0], J.legF[2][0], .4), lerp(J.legF[1][1], J.legF[2][1], .4), 5, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = sk; ctx.beginPath(); ctx.ellipse(J.legF[3][0], J.legF[3][1] - 1, 10, 5, 0, 0, 7); ctx.fill();
    // neck + head
    limb(ctx, J.sh, J.nk, 8, 7, sk); head(ctx, J, po, C);
    // near arm + bicep/forearm highlight + fist
    limb(ctx, J.armF[0], J.armF[1], 9, 7, sk); limb(ctx, J.armF[1], J.armF[2], 7, 5, sk);
    ctx.fillStyle = shade(sk, .18); ctx.beginPath(); ctx.ellipse(lerp(J.armF[0][0], J.armF[1][0], .5), lerp(J.armF[0][1], J.armF[1][1], .5), 5, 4, 0, 0, 7); ctx.fill(); // bicep
    ctx.fillStyle = shade(sk, .08); ctx.beginPath(); ctx.arc(J.armF[2][0], J.armF[2][1], 6.5, 0, 7); ctx.fill();       // fist
    ctx.strokeStyle = shade(sk, -.3); ctx.lineWidth = 0.8; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(J.armF[2][0] - 4, J.armF[2][1] + i * 2.4); ctx.lineTo(J.armF[2][0] + 4, J.armF[2][1] + i * 2.4); ctx.stroke(); } // knuckles
    ctx.globalAlpha = 1;
  }

  // ---- extra palettes ----
  const BULL = { skin: '#6f5238', skinDark: '#4a3623', skinLit: '#8a6a45', hair: '#241a10', horn: '#efe6cf', metal: '#b5893c', eye: '#e23a24', eyeGlow: 'rgba(226,70,40,.5)', loin: '#4a3016', wood: '#5d3f22', trim: '#4a3116', nail: '#d8ccae' };
  const GOLEM = { skin: '#6b727a', skinDark: '#3c4147', skinLit: '#9aa2aa', metal: '#6b727a', horn: '#8a9199', eye: '#ff7a2a', eyeGlow: 'rgba(255,120,40,.55)', core: '#ff8a3a', coreGlow: 'rgba(255,120,40,.5)', loin: '#3c4147', wood: '#3c4147', trim: '#262a2e', nail: '#aab0b6' };

  function drawHammer(ctx, hand, fore, ang, C) {
    const d = [Math.cos(ang), Math.sin(ang)], nx = -d[1], ny = d[0]; const grip = 12, len = 72;
    const base = [hand[0] - d[0] * grip, hand[1] - d[1] * grip], tip = [hand[0] + d[0] * len, hand[1] + d[1] * len];
    ctx.strokeStyle = shade(C.wood, -.05); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.save(); ctx.translate(tip[0] - d[0] * 8, tip[1] - d[1] * 8); ctx.rotate(ang);
    ctx.fillStyle = cyl(ctx, -18, 18, C.metal, .32); ctx.strokeStyle = shade(C.metal, -.5); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.rect(-11, -17, 30, 34); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(C.metal, -.22); ctx.fillRect(-11, -17, 6, 34); ctx.fillStyle = shade(C.metal, .2); ctx.fillRect(13, -17, 6, 34); ctx.restore();
  }
  function headBull(ctx, J, po, C) {
    const [hx, hy] = J.hd, r = po.headR; ctx.save(); ctx.translate(hx, hy); ctx.rotate(po.lean + po.headTilt);
    ctx.fillStyle = cyl(ctx, -r, r, C.skin, .2);
    ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.1); ctx.quadraticCurveTo(-r * 1.0, -r * 0.9, -r * 0.1, -r * 0.95);
    ctx.quadraticCurveTo(r * 0.7, -r * 0.95, r * 1.05, -r * 0.2); ctx.quadraticCurveTo(r * 1.28, r * 0.25, r * 0.95, r * 0.58);
    ctx.quadraticCurveTo(r * 0.7, r * 0.9, r * 0.1, r * 0.8); ctx.quadraticCurveTo(-r * 0.7, r * 0.72, -r * 0.9, -r * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.metal; ctx.beginPath(); ctx.ellipse(-r * 0.05, -r * 0.6, r * 0.85, r * 0.32, 0, Math.PI, 0); ctx.fill(); // bronze helm band
    ctx.fillStyle = C.horn; poly(ctx, [[-r * 0.05, -r * 0.7], [r * 0.95, -r * 1.5], [r * 1.15, -r * 0.85], [r * 0.25, -r * 0.5]], C.horn, C.trim, 0.5);
    poly(ctx, [[-r * 0.3, -r * 0.72], [-r * 1.1, -r * 1.35], [-r * 0.55, -r * 0.5]], C.horn, C.trim, 0.5);
    ctx.fillStyle = C.eyeGlow; ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.08, r * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.arc(r * 0.48, -r * 0.08, r * 0.15, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a0000'; ctx.beginPath(); ctx.arc(r * 0.52, -r * 0.08, r * 0.06, 0, 7); ctx.fill();
    ctx.fillStyle = shade(C.skin, -.45); ctx.beginPath(); ctx.arc(r * 0.98, r * 0.4, r * 0.1, 0, 7); ctx.fill(); // nostril
    ctx.fillStyle = C.hair; ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.7); ctx.quadraticCurveTo(r * 0.4, r * 1.3, r * 0.0, r * 1.4); ctx.quadraticCurveTo(-r * 0.5, r * 1.1, -r * 0.55, r * 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function headGolem(ctx, J, po, C) {
    const [hx, hy] = J.hd, r = po.headR; ctx.save(); ctx.translate(hx, hy); ctx.rotate(po.lean + po.headTilt);
    ctx.fillStyle = cyl(ctx, -r, r, C.metal, .34); ctx.strokeStyle = shade(C.metal, -.5); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.7); ctx.lineTo(r * 0.85, -r * 0.72); ctx.lineTo(r * 1.05, r * 0.2); ctx.lineTo(r * 0.7, r * 0.9); ctx.lineTo(-r * 0.7, r * 0.85); ctx.lineTo(-r * 0.9, r * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.coreGlow; ctx.fillRect(r * 0.15, -r * 0.28, r * 0.9, r * 0.32);
    ctx.fillStyle = C.core; ctx.fillRect(r * 0.32, -r * 0.2, r * 0.68, r * 0.16);
    ctx.fillStyle = shade(C.metal, .22); for (const p of [[-r * 0.5, -r * 0.45], [r * 0.6, -r * 0.5], [-r * 0.45, r * 0.55], [r * 0.55, r * 0.6]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.7, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  // Shared giant body used by the newer bosses (parameterized material/weapon/head).
  function giantBody(ctx, po, C, opts) {
    const J = build(po), sk = C.skin, far = shade(sk, -.16), metal = opts.metal;
    ctx.globalAlpha = po.alpha;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(po.px, 0, 42, 8, 0, 0, 7); ctx.fill();
    if (po.extra.impact > 0.05 || po.extra.quake > 0.05) { const k = Math.max(po.extra.impact || 0, po.extra.quake || 0); ctx.strokeStyle = 'rgba(200,180,120,' + (0.5 * k) + ')'; ctx.lineWidth = 3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(po.px + s * 18, 0); ctx.lineTo(po.px + s * (18 + 44 * k), -6 - 9 * k); ctx.stroke(); } }
    const LW = metal ? [13, 10, 10, 7] : [12, 9, 9, 6];
    // far leg + far arm
    limb(ctx, J.legB[0], J.legB[1], LW[0], LW[1], far); limb(ctx, J.legB[1], J.legB[2], LW[2], LW[3], far);
    ctx.fillStyle = far; ctx.beginPath(); ctx.ellipse(J.legB[3][0], J.legB[3][1] - 1, 10, 5, 0, 0, 7); ctx.fill();
    limb(ctx, J.armB[0], J.armB[1], LW[2], LW[3] + 1, far); limb(ctx, J.armB[1], J.armB[2], LW[3] + 1, LW[3] - 1, far);
    if (opts.weapon && po.extra.club) opts.weapon(ctx, J.armB[2], J.armB[1], po.extra.clubAng != null ? po.extra.clubAng : -1.9, C);
    else if (!opts.weapon) { ctx.fillStyle = far; ctx.beginPath(); ctx.arc(J.armB[2][0], J.armB[2][1], 8, 0, 7); ctx.fill(); } // fist
    // torso
    limb(ctx, J.pv, J.sh, 15, 20, sk);
    const chest = [lerp(J.sh[0], J.pv[0], .34), lerp(J.sh[1], J.pv[1], .34)], belly = [lerp(J.sh[0], J.pv[0], .72), lerp(J.sh[1], J.pv[1], .72)];
    if (metal) {
      ctx.strokeStyle = shade(sk, -.4); ctx.lineWidth = 1.4; for (let i = 0; i < 3; i++) { const yy = lerp(chest[1], belly[1], i / 2); ctx.beginPath(); ctx.moveTo(chest[0] - 12, yy); ctx.lineTo(chest[0] + 12, yy); ctx.stroke(); } // plate seams
      if (opts.core) { ctx.fillStyle = C.coreGlow; ctx.beginPath(); ctx.arc(chest[0] + 4, lerp(chest[1], belly[1], .35), 9, 0, 7); ctx.fill(); ctx.fillStyle = C.core; ctx.beginPath(); ctx.arc(chest[0] + 4, lerp(chest[1], belly[1], .35), 5, 0, 7); ctx.fill(); }
      ctx.fillStyle = shade(sk, .2); for (const p of [[chest[0] - 9, chest[1]], [chest[0] + 9, belly[1]]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.8, 0, 7); ctx.fill(); } // rivets
    } else {
      ctx.fillStyle = shade(sk, .16); ctx.beginPath(); ctx.ellipse(chest[0] + 6, chest[1], 12, 14, po.lean, 0, 7); ctx.fill();
      ctx.fillStyle = shade(sk, -.16); ctx.beginPath(); ctx.ellipse(chest[0] - 8, chest[1] + 2, 7, 12, po.lean, 0, 7); ctx.fill();
      ctx.strokeStyle = shade(sk, -.28); ctx.lineWidth = 1.4; for (let i = 0; i < 3; i++) { const yy = lerp(chest[1] + 8, belly[1] + 4, i / 2); ctx.beginPath(); ctx.moveTo(chest[0] - 4, yy); ctx.lineTo(chest[0] + 12, yy - 1); ctx.stroke(); }
      if (opts.pauldron) { ctx.fillStyle = cyl(ctx, J.sh[0] - 12, J.sh[0] + 12, C.metal, .3); ctx.beginPath(); ctx.ellipse(J.sh[0], J.sh[1] + 2, 12, 9, po.lean, 0, 7); ctx.fill(); }
    }
    // loincloth / plate skirt
    ctx.fillStyle = C.loin; poly(ctx, [[J.pv[0] - 15, J.pv[1] - 2], [J.pv[0] + 15, J.pv[1] - 2], [J.pv[0] + 12, J.pv[1] + 22], [J.pv[0] - 12, J.pv[1] + 22]], C.loin, C.trim, 1);
    // near leg
    limb(ctx, J.legF[0], J.legF[1], LW[0], LW[1], sk); limb(ctx, J.legF[1], J.legF[2], LW[2], LW[3], sk);
    ctx.fillStyle = shade(sk, .14); ctx.beginPath(); ctx.ellipse(lerp(J.legF[0][0], J.legF[1][0], .5), lerp(J.legF[0][1], J.legF[1][1], .5), 5, 6, 0, 0, 7); ctx.fill(); // thigh
    ctx.fillStyle = shade(sk, .08); ctx.beginPath(); ctx.ellipse(lerp(J.legF[1][0], J.legF[2][0], .4), lerp(J.legF[1][1], J.legF[2][1], .4), 4, 5, 0, 0, 7); ctx.fill(); // calf
    ctx.fillStyle = sk; ctx.beginPath(); ctx.ellipse(J.legF[3][0], J.legF[3][1] - 1, 10, 5, 0, 0, 7); ctx.fill();
    // neck + head + near arm
    limb(ctx, J.sh, J.nk, 8, 7, sk); opts.head(ctx, J, po, C);
    limb(ctx, J.armF[0], J.armF[1], LW[2], LW[3] + 1, sk); limb(ctx, J.armF[1], J.armF[2], LW[3] + 1, LW[3] - 1, sk);
    ctx.fillStyle = shade(sk, .1); ctx.beginPath(); ctx.arc(J.armF[2][0], J.armF[2][1], metal ? 9 : 7, 0, 7); ctx.fill(); // near fist
    ctx.globalAlpha = 1;
  }
  function drawBull(ctx, po, C) { giantBody(ctx, po, C, { head: headBull, weapon: drawHammer, metal: false, pauldron: true }); }
  function drawGolem(ctx, po, C) { giantBody(ctx, po, C, { head: headGolem, weapon: null, metal: true, core: true }); }

  // Temple Colossus — bronze-and-stone temple guardian with glowing runes + ceremonial mace.
  const COLOSSUS = { skin: '#9a7b3c', skinDark: '#6b5426', skinLit: '#c2a15a', metal: '#9a7b3c', horn: '#c2a15a', eye: '#66f0ff', eyeGlow: 'rgba(90,220,255,.5)', core: '#66f0ff', coreGlow: 'rgba(90,220,255,.5)', loin: '#5a4a2a', wood: '#7a6a52', trim: '#4a3a1c', nail: '#c2a15a' };
  function drawColossus(ctx, po, C) { giantBody(ctx, po, C, { head: headGolem, weapon: drawClub, metal: true, core: true }); }

  const POSES = { cyclops: cyclopsPose, bull: cyclopsPose, golem: cyclopsPose, colossus: cyclopsPose };
  const DRAW = { cyclops: drawCyclops, bull: drawBull, golem: drawGolem, colossus: drawColossus };
  const PAL = { cyclops: CYC, bull: BULL, golem: GOLEM, colossus: COLOSSUS };

  function draw(ctx, type, state, p, t, scale, team) {
    const poseFn = POSES[type], drawFn = DRAW[type]; if (!poseFn) return false;
    const po = poseFn(state || 'idle', p || 0, t || 0); po._t = t;
    const C = PAL[type];
    ctx.save(); ctx.scale((team === 1 ? -1 : 1) * (scale || 1), (scale || 1)); drawFn(ctx, po, C); ctx.restore();
    return true;
  }

  return { draw, POSES, PAL, _helpers: { shade, cyl, limb, poly } };
})();

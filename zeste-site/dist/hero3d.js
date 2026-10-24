/* Zeste hero city — a burger diner at the heart of a little city, couriers streaming through
   the streets, and one building per promise: rentabilité, qualité, volume, 7j/7.
   Three.js r170 (MIT, vendored). If WebGL is unavailable the original 2D engine stays in place. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const engine = document.querySelector('.engine');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => reduced.matches || document.body.classList.contains('motion-paused');
const small = innerWidth < 760;
const HEX = { ink: 0x050706, mint: 0x8fd8bd, deep: 0x24644f, cream: 0xf3faf7, light: 0xd4f1e4, sage: 0xa9cbbb, amber: 0xe7aa50,
  asphalt: 0x1b2420, walk: 0xe9f4ef, bun: 0xd9913f, patty: 0x4a2a1a, cheese: 0xf2b630, tomato: 0xe0482f, lettuce: 0x3f9a4f, mauve: 0xb89ba5 };
const H = 9.6, ROAD = 8.6, STREET = 2.9, Y0 = 0.12;   // tile half-size, ring road, inner streets, block height

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dummy = new THREE.Object3D();
// Bake a transform into a non-indexed copy so every piece can be merged.
const place = (geo, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(dummy.matrix); g.clearGroups();
  return g;
};
const tint = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const keep = g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };

function init() {
  if (!engine) return;
  const wrap = document.createElement('div');
  wrap.className = 'scene3d'; wrap.setAttribute('aria-hidden', 'true');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return fallback(); }
  if (!renderer.getContext()) return fallback();
  // Resolution is capped (see resize): a hi-dpi desktop canvas would otherwise push ~3 million pixels a frame.
  let dprCap = Math.min(devicePixelRatio || 1, 1.5);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
  wrap.append(renderer.domElement); engine.prepend(wrap); engine.classList.add('is-3d');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(27, 1, 0.5, 300);
  const std = (hex, o = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0, ...o });
  const vcol = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 });
  const glowMat = hex => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.1, roughness: 0.4 });

  /* Lights: studio environment + a warm sun for crisp shadows */
  scene.add(new THREE.HemisphereLight(0xffffff, HEX.mint, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(9, 18, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; scene.add(sun);

  /* Static city: collected by colour, merged into a handful of meshes */
  const bucket = new Map();
  const add = (geo, hex) => { if (!bucket.has(hex)) bucket.set(hex, []); bucket.get(hex).push(keep(tint(geo, hex))); };

  // Base slab with rounded corners, asphalt, blocks (sidewalk curbs)
  add(place(new RoundedBoxGeometry(H * 2, 0.9, H * 2, 4, 0.5), 0, -0.45), HEX.ink);
  add(place(new THREE.BoxGeometry(H * 2 - 0.5, 0.02, H * 2 - 0.5), 0, 0.005), HEX.asphalt);
  add(place(new RoundedBoxGeometry(H * 2 + 0.12, 0.08, H * 2 + 0.12, 3, 0.04), 0, -0.62), HEX.mint);
  const blocks = [];
  [-5.75, 0, 5.75].forEach(bx => [-5.75, 0, 5.75].forEach(bz => {
    const s = bx === 0 && bz === 0 ? 4.3 : 4.2;
    add(place(new RoundedBoxGeometry(s, Y0, s, 2, 0.08), bx, Y0 / 2, bz), HEX.walk);
    blocks.push({ x: bx, z: bz, s });
  }));
  add(place(new THREE.BoxGeometry(H * 2 - 0.3, Y0, 0.5), 0, Y0 / 2, H - 0.25), HEX.walk);
  add(place(new THREE.BoxGeometry(H * 2 - 0.3, Y0, 0.5), 0, Y0 / 2, -H + 0.25), HEX.walk);
  add(place(new THREE.BoxGeometry(0.5, Y0, H * 2 - 0.3), H - 0.25, Y0 / 2, 0), HEX.walk);
  add(place(new THREE.BoxGeometry(0.5, Y0, H * 2 - 0.3), -H + 0.25, Y0 / 2, 0), HEX.walk);

  // Lane dashes and crosswalks
  const lines = [-ROAD, -STREET, STREET, ROAD];
  const dash = new THREE.BoxGeometry(0.42, 0.01, 0.07);
  lines.forEach(c => {
    for (let t = -ROAD + 0.9; t <= ROAD - 0.9; t += 0.85) {
      if (lines.some(l => Math.abs(t - l) < 0.95)) continue;
      add(place(dash, t, 0.02, c), HEX.cream); add(place(dash, c, 0.02, t, Math.PI / 2), HEX.cream);
    }
  });
  const zebra = new THREE.BoxGeometry(0.13, 0.012, 0.75);
  [-STREET, STREET].forEach(cx => [-STREET, STREET].forEach(cz => {
    for (let k = -3; k <= 3; k++) {
      add(place(zebra, cx + k * 0.2, 0.022, cz + 1.18 * Math.sign(cz)), HEX.cream);
      add(place(zebra, cx + 1.18 * Math.sign(cx), 0.022, cz + k * 0.2, Math.PI / 2), HEX.cream);
    }
  }));

  // Buildings with a window texture (UVs scaled to the building so windows stay the same size)
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2a3833'; g.beginPath(); g.roundRect(14, 12, 36, 38, 5); g.fill();
    g.fillStyle = 'rgba(200,239,223,.55)'; g.fillRect(17, 15, 9, 32);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const towers = new Map();
  function tower(x, z, w, h, d, hex, cap = HEX.ink) {
    const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv, M = 0.55;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k, su = f < 2 ? d : w, sv = f === 2 || f === 3 ? d : h;
      uv.setXY(i, uv.getX(i) * su / M, uv.getY(i) * sv / M);
    }
    const geo = place(g, x, Y0 + h / 2, z);
    if (!towers.has(hex)) towers.set(hex, []); towers.get(hex).push(geo);
    add(place(new RoundedBoxGeometry(w + 0.12, 0.14, d + 0.12, 2, 0.05), x, Y0 + h + 0.06, z), cap);
    if (h > 1.4 && rnd() > 0.35) add(place(new THREE.BoxGeometry(0.35, 0.22, 0.3), x + w * 0.2, Y0 + h + 0.24, z - d * 0.15), HEX.sage);
    if (h > 2.4 && rnd() > 0.5) add(place(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 12), x - w * 0.22, Y0 + h + 0.3, z + d * 0.18), HEX.cream);
    return Y0 + h + 0.13;
  }
  const palette = [HEX.cream, HEX.light, HEX.sage, HEX.cream, HEX.mint, HEX.deep];
  function fillBlock(b, minH, maxH, skip = []) {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([qx, qz], i) => {
      if (skip.includes(i)) return;
      const w = 1.55 + rnd() * 0.25, d = 1.55 + rnd() * 0.25, h = minH + rnd() * (maxH - minH);
      tower(b.x + qx * 1.02, b.z + qz * 1.02, w, h, d, palette[(rnd() * palette.length) | 0]);
    });
  }
  const B = (x, z) => blocks.find(b => b.x === x && b.z === z);
  fillBlock(B(0, 5.75), 0.7, 1.2, [0]);
  fillBlock(B(5.75, 0), 0.9, 1.6, [1, 3]);
  fillBlock(B(-5.75, 0), 0.9, 1.7, [2]);
  fillBlock(B(-5.75, 5.75), 0.8, 1.4, [1]);
  fillBlock(B(0, -5.75), 2.4, 3.8, [3]);
  fillBlock(B(5.75, -5.75), 2.8, 4.4, [2]);
  fillBlock(B(-5.75, -5.75), 2.6, 4.2, [0, 3]);

  // Park in the front-right block, trees along the ring road
  const park = B(5.75, 5.75);
  add(place(new RoundedBoxGeometry(3.7, 0.06, 3.7, 2, 0.05), park.x, Y0 + 0.03, park.z), HEX.mint);
  add(place(new THREE.CylinderGeometry(0.75, 0.8, 0.14, 32), park.x, Y0 + 0.1, park.z), HEX.cream);
  add(place(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32), park.x, Y0 + 0.17, park.z), 0x6fbfd0);
  const treeAt = (x, z, s = 1, cone = false) => {
    add(place(new THREE.CylinderGeometry(0.05, 0.07, 0.32, 8), x, Y0 + 0.16, z), HEX.ink);
    add(place(cone ? new THREE.ConeGeometry(0.34 * s, 0.85 * s, 10) : new THREE.SphereGeometry(0.33 * s, 14, 12), x, Y0 + (cone ? 0.7 : 0.58) * s, z), HEX.deep);
  };
  [[-1.3, -1.2], [1.3, -1.25], [-1.25, 1.3], [1.2, 1.2], [0, -1.45], [-1.5, 0.1]].forEach(([dx, dz], i) => treeAt(park.x + dx, park.z + dz, 1 + (i % 3) * 0.15, i % 2 === 1));
  for (let t = -7.4; t <= 7.4; t += 2.2) { treeAt(t, H - 0.25, 0.7, true); treeAt(H - 0.25, t, 0.7, false); }

  /* The diner: a burger joint with a neon zeste. sign and a giant burger on the roof */
  const D = { x: 0, z: 0.1 };
  add(place(new RoundedBoxGeometry(3.2, 1.45, 2.3, 4, 0.12), D.x, Y0 + 0.72, D.z - 0.35), HEX.cream);
  add(place(new RoundedBoxGeometry(3.26, 0.32, 2.36, 3, 0.1), D.x, Y0 + 0.16, D.z - 0.35), HEX.ink);
  add(place(new RoundedBoxGeometry(3.4, 0.2, 2.5, 3, 0.08), D.x, Y0 + 1.53, D.z - 0.35), HEX.ink);
  add(place(new RoundedBoxGeometry(0.62, 0.95, 0.1, 2, 0.04), D.x, Y0 + 0.62, D.z + 0.81), HEX.ink);
  for (let s = 0; s < 10; s++) add(place(new THREE.BoxGeometry(3.3 / 10, 0.05, 0.7), D.x - 1.65 + 0.165 + s * 0.33, Y0 + 1.22, D.z + 1.05, 0, 1, 1, 1, 0.45), s % 2 ? HEX.cream : HEX.deep);
  [[-1.55, 1.75], [1.55, 1.75]].forEach(([dx, dz]) => {   // terrace tables and umbrellas
    add(place(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), D.x + dx, Y0 + 0.42, D.z + dz), HEX.cream);
    add(place(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 8), D.x + dx, Y0 + 0.52, D.z + dz), HEX.ink);
    add(place(new THREE.ConeGeometry(0.62, 0.3, 12), D.x + dx, Y0 + 1.12, D.z + dz), HEX.mint);
  });
  const windows = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.55, 0.06), glowMat(0xbfeedd));
  windows.position.set(D.x, Y0 + 0.78, D.z + 0.81); scene.add(windows);
  const wordmark = document.querySelector('.hero-wordmark');
  function signTexture(bg, fg) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 300; const g = cv.getContext('2d');
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, 1024, 300, 60); g.fill();
    const paths = [...wordmark.querySelectorAll('path')].map(p => new Path2D(p.getAttribute('d')));
    const k = 1.15, ox = (1024 - 730 * k) / 2, oy = (300 - 195 * k) / 2;
    g.setTransform(0.2292 * k, 0, 0, -0.2292 * k, ox + 12 * k, oy + 168 * k); g.fillStyle = fg; paths.forEach(p => g.fill(p));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.67), new THREE.MeshStandardMaterial({ map: signTexture('#050706', '#8fd8bd'), emissive: 0xffffff, emissiveMap: signTexture('#000000', '#8fd8bd'), emissiveIntensity: 1.4, roughness: 0.4 }));
  neon.position.set(D.x, Y0 + 1.95, D.z + 0.62); scene.add(neon);
  add(place(new RoundedBoxGeometry(2.42, 0.78, 0.12, 2, 0.05), D.x, Y0 + 1.95, D.z + 0.55), HEX.ink);
  add(place(new THREE.BoxGeometry(0.08, 0.36, 0.08), D.x - 0.9, Y0 + 1.6, D.z + 0.55), HEX.ink);
  add(place(new THREE.BoxGeometry(0.08, 0.36, 0.08), D.x + 0.9, Y0 + 1.6, D.z + 0.55), HEX.ink);

  const burger = new THREE.Group();
  const lathe = (pts, hex) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40), std(hex, { roughness: 0.5 }));
  const bottomBun = lathe([[0, 0], [0.86, 0], [0.95, 0.08], [0.96, 0.2], [0.9, 0.27], [0, 0.27]], HEX.bun);
  const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.99, 0.99, 0.26, 40), std(HEX.patty, { roughness: 0.85 })); patty.position.y = 0.4;
  const cheese = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 1.72), std(HEX.cheese, { roughness: 0.35 })); cheese.position.y = 0.55; cheese.rotation.y = Math.PI / 4;
  const lettuceGeo = new THREE.CylinderGeometry(1.04, 1.04, 0.07, 48);
  { const p = lettuceGeo.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); if (Math.hypot(p.getX(i), p.getZ(i)) > 0.9) p.setY(i, p.getY(i) + Math.sin(a * 11) * 0.05); } lettuceGeo.computeVertexNormals(); }
  const lettuce = new THREE.Mesh(lettuceGeo, std(HEX.lettuce, { roughness: 0.6 })); lettuce.position.y = 0.62;
  const tomato = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.1, 40), std(HEX.tomato, { roughness: 0.4 })); tomato.position.y = 0.71;
  const topBun = lathe([[0, 0], [0.95, 0], [0.99, 0.12], [0.92, 0.38], [0.66, 0.6], [0.3, 0.7], [0, 0.72]], HEX.bun); topBun.position.y = 0.76;
  const seedGeo = new THREE.SphereGeometry(0.035, 8, 6); seedGeo.scale(1, 0.55, 1.7);
  const seeds = new THREE.InstancedMesh(seedGeo, std(0xfff4d6), 46);
  for (let i = 0; i < 46; i++) {
    const r = 0.15 + Math.sqrt(i / 46) * 0.72, a = i * 2.39996;
    dummy.position.set(Math.cos(a) * r, 0.72 * Math.cos((r / 0.99) * Math.PI / 2) ** 0.8, Math.sin(a) * r);
    dummy.rotation.set(0, a, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); seeds.setMatrixAt(i, dummy.matrix);
  }
  topBun.add(seeds);
  burger.add(bottomBun, patty, cheese, lettuce, tomato, topBun);
  burger.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const burgerBase = Y0 + 2.62;
  burger.position.set(D.x, burgerBase, D.z - 0.45); burger.scale.setScalar(1.3); scene.add(burger);
  add(place(new THREE.CylinderGeometry(0.06, 0.09, 0.62, 10), D.x, Y0 + 1.95, D.z - 0.45), HEX.ink);
  add(place(new THREE.CylinderGeometry(0.75, 0.85, 0.08, 32), D.x, Y0 + 1.66, D.z - 0.45), HEX.deep);

  /* Expertise labels: numbered pills (badge only on phones), clickable to open the detailed expertise */
  const labels = [];
  function label(num, text, x, y, z, dark = false) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    const draw = () => {
      const font = '700 44px "DM Sans", Arial, sans-serif', nfont = '700 34px "DM Sans", Arial, sans-serif';
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 132; cv.width = w; cv.height = 96;
      g.fillStyle = dark ? '#050706' : '#f3faf7'; g.beginPath(); g.roundRect(2, 2, w - 4, 92, 46); g.fill();
      g.lineWidth = 3; g.strokeStyle = dark ? '#8fd8bd55' : '#05070622'; g.stroke();
      g.fillStyle = dark ? '#8fd8bd' : '#050706'; g.beginPath(); g.arc(48, 48, 32, 0, Math.PI * 2); g.fill();
      g.font = nfont; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = dark ? '#050706' : '#8fd8bd'; g.fillText(num, 48, 50);
      g.font = font; g.textAlign = 'left'; g.fillStyle = dark ? '#f3faf7' : '#050706'; g.fillText(text, 96, 50);
      sprite.material.map?.dispose(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; sprite.material.map = t; sprite.material.needsUpdate = true;
      const k = small ? 1.55 : 0.9; sprite.userData.base = [(w / 96) * k, k]; sprite.scale.set((w / 96) * k, k, 1);
    };
    sprite.position.set(x, y, z); sprite.center.set(0.5, 0); sprite.renderOrder = 10; scene.add(sprite);
    sprite.userData.pillar = 'pillar-' + num;
    draw(); (document.fonts?.ready || Promise.resolve()).then(draw);
    labels.push({ sprite, y, phase: labels.length, hover: 0 });
  }
  const spot = (x, z, w, h, d, hex) => tower(x, z, w, h, d, hex);

  /* Rentabilité: rising bar chart and a spinning euro coin */
  const RB = B(5.75, -5.75), rTop = tower(RB.x - 1.0, RB.z + 1.0, 1.9, 3.1, 1.9, HEX.cream);
  const bars = [0.5, 0.8, 1.15, 1.55].map((h, i) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.32, 1, 0.32, 2, 0.05), std(i === 3 ? HEX.mint : HEX.deep));
    m.position.set(RB.x - 1.57 + i * 0.38, rTop, RB.z + 1.0); m.castShadow = true; m.userData.h = h; scene.add(m); return m;
  });
  const coinFace = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#e7aa50'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#b97b25'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#7a4c10'; g.font = '800 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('€', 128, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 40), [std(HEX.amber, { metalness: 0.5, roughness: 0.3 }), std(0xffffff, { map: coinFace, metalness: 0.4, roughness: 0.35 }), std(0xffffff, { map: coinFace, metalness: 0.4, roughness: 0.35 })]);
  coin.rotation.x = Math.PI / 2; coin.castShadow = true; coin.scale.setScalar(1.45);
  const coinPivot = new THREE.Group(); coinPivot.add(coin); coinPivot.position.set(RB.x - 0.45, rTop + 1.75, RB.z + 1.0); scene.add(coinPivot);
  label('02', 'Croissance rentable', RB.x + 0.2, rTop + 3.15, RB.z + 0.6);

  /* Contrôle qualité: shield with a check mark and five stars */
  const QB = B(-5.75, -5.75), qTop = tower(QB.x + 1.0, QB.z + 1.0, 1.9, 2.6, 1.9, HEX.light);
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(0, 0.62); shieldShape.quadraticCurveTo(0.32, 0.6, 0.52, 0.48); shieldShape.lineTo(0.5, 0.05);
  shieldShape.quadraticCurveTo(0.42, -0.42, 0, -0.62); shieldShape.quadraticCurveTo(-0.42, -0.42, -0.5, 0.05); shieldShape.lineTo(-0.52, 0.48); shieldShape.quadraticCurveTo(-0.32, 0.6, 0, 0.62);
  const shield = new THREE.Group();
  const sMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shieldShape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 }), std(HEX.mint, { roughness: 0.35 }));
  const tick = new THREE.Shape(); tick.moveTo(-0.28, 0.02); tick.lineTo(-0.1, -0.18); tick.lineTo(0.3, 0.24); tick.lineTo(0.22, 0.32); tick.lineTo(-0.1, -0.02); tick.lineTo(-0.2, 0.1);
  const tMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(tick, { depth: 0.08, bevelEnabled: false }), std(HEX.ink)); tMesh.position.z = 0.2;
  shield.add(sMesh, tMesh); shield.traverse(m => { if (m.isMesh) m.castShadow = true; });
  shield.position.set(QB.x + 1.0, qTop + 0.95, QB.z + 1.0); shield.scale.setScalar(1.15); scene.add(shield);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.09 : 0.21, a = Math.PI / 2 + (i * Math.PI) / 5; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  const stars = Array.from({ length: 5 }, (_, i) => {
    const s = new THREE.Mesh(starGeo, std(HEX.amber, { metalness: 0.3, roughness: 0.3 }));
    s.position.set(QB.x + 1.0 + (i - 2) * 0.42, qTop + 1.95 - Math.abs(i - 2) * 0.06, QB.z + 1.0); s.castShadow = true; scene.add(s); return s;
  });
  label('06', 'Avis & réputation', QB.x + 1.0, qTop + 2.35, QB.z + 1.0);

  /* Plus de volume: a stack of delivery boxes that keeps growing */
  const VB = { x: 5.75 + 2.04, z: 0 }, vTop = tower(VB.x - 1.0, VB.z - 1.0, 1.9, 2.0, 1.9, HEX.sage);
  const boxGeo = new RoundedBoxGeometry(0.42, 0.36, 0.42, 2, 0.05), boxMat = [std(HEX.mint), std(HEX.cream)];
  const slots = []; [0, 1, 2].forEach(l => { const n = 3 - l; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) slots.push([(i - (n - 1) / 2) * 0.46, l * 0.37, (j - (n - 1) / 2) * 0.46]); });
  const parcels = slots.map((s, i) => { const m = new THREE.Mesh(boxGeo, boxMat[i % 2]); m.castShadow = true; m.visible = false; scene.add(m); return { m, s, t: -1 }; });
  let stackT = 0, stackN = 0;
  label('09', 'Délégation', VB.x - 1.0, vTop + 1.45, VB.z - 1.0, true);

  /* 7j/7: clock tower with fast hands */
  const CB = B(-5.75, 5.75), cH = 3.6;
  tower(CB.x + 1.02, CB.z - 1.02, 1.2, cH, 1.2, HEX.cream);
  const face = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#f3faf7'; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill(); g.lineWidth = 12; g.strokeStyle = '#050706'; g.stroke();
    g.fillStyle = '#050706'; for (let i = 0; i < 12; i++) { g.save(); g.translate(128, 128); g.rotate((i * Math.PI) / 6); g.fillRect(-4, -104, 8, i % 3 ? 14 : 26); g.restore(); }
    g.fillStyle = '#24644f'; g.font = '700 34px "DM Sans", Arial'; g.textAlign = 'center'; g.fillText('7J/7', 128, 178);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const hands = [];
  [[0, 0.61, 0], [0.61, 0, Math.PI / 2]].forEach(([dx, dz, ry]) => {
    const g = new THREE.Group(); g.position.set(CB.x + 1.02 + dx, Y0 + cH - 0.65, CB.z - 1.02 + dz); g.rotation.y = ry;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.48, 40), std(0xffffff, { map: face, roughness: 0.5 })); disc.position.z = 0.005; g.add(disc);
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.02), std(HEX.ink)); hh.geometry.translate(0, 0.11, 0); hh.position.z = 0.03;
    const mh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.38, 0.02), std(HEX.deep)); mh.geometry.translate(0, 0.17, 0); mh.position.z = 0.045;
    g.add(hh, mh); scene.add(g); hands.push([hh, mh]);
  });
  add(place(new THREE.ConeGeometry(0.95, 0.7, 4), CB.x + 1.02, Y0 + cH + 0.5, CB.z - 1.02, Math.PI / 4), HEX.deep);
  label('10', 'Support 7j/7', small ? CB.x + 0.3 : CB.x + 1.02, Y0 + cH + (small ? 0.55 : 1.0), CB.z - 1.02, true);

  /* 04 Menu & conversion: the diner itself */
  label('04', 'Menu & conversion', D.x, burgerBase + 2.05, D.z - 0.45, true);

  /* 01 Business & data: a rooftop dashboard */
  const dTop = spot(1.02, -4.73, 1.8, 2.7, 1.8, HEX.deep);
  const dashTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 320; const g = c.getContext('2d');
    g.fillStyle = '#050706'; g.beginPath(); g.roundRect(0, 0, 512, 320, 28); g.fill();
    g.strokeStyle = '#24644f'; g.lineWidth = 2; for (let y = 70; y < 300; y += 55) { g.beginPath(); g.moveTo(30, y); g.lineTo(482, y); g.stroke(); }
    g.fillStyle = '#24644f'; [90, 140, 120, 190].forEach((h, i) => g.fillRect(50 + i * 110, 290 - h, 60, h));
    g.strokeStyle = '#8fd8bd'; g.lineWidth = 10; g.lineJoin = 'round'; g.beginPath(); [[40, 250], [140, 205], [250, 225], [350, 140], [470, 70]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.fillStyle = '#8fd8bd'; g.beginPath(); g.arc(470, 70, 16, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const screen = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map: dashTex, emissive: 0xffffff, emissiveMap: dashTex, emissiveIntensity: 0.7, roughness: 0.4 }));
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(1.72, 1.12, 0.08, 2, 0.04), std(HEX.ink)); bezel.position.z = -0.05;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), std(HEX.ink)); mast.position.y = -0.75;
  screen.add(bezel, panel, mast); screen.traverse(m => { if (m.isMesh) m.castShadow = true; });
  screen.position.set(1.02, dTop + 1.0, -4.73); screen.rotation.y = 0.68; scene.add(screen);
  label('01', 'Business & data', small ? -2.2 : 0.1, dTop + 1.6, small ? -4.9 : -4.3);

  /* 03 Unit economics: a spinning 3D pie of where each euro goes */
  const uTop = spot(-6.77, 1.02, 1.7, 1.9, 1.7, HEX.cream);
  const pie = new THREE.Group(), slices = [];
  [[0.32, HEX.ink], [0.25, HEX.deep], [0.1, HEX.amber], [0.15, HEX.mauve], [0.18, HEX.mint]].reduce((start, [part, hex], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, i === 4 ? 0.3 : 0.2, 32, 1, false, start * Math.PI * 2, part * Math.PI * 2), std(hex, { roughness: 0.45 }));
    m.castShadow = true; m.userData.mid = (start + part / 2) * Math.PI * 2; pie.add(m); slices.push(m); return start + part;
  }, 0);
  pie.position.set(-6.77, uTop + 0.55, 1.02); pie.rotation.x = 0.35; scene.add(pie);
  label('03', 'Unit economics', -6.77, uTop + (small ? 1.9 : 1.2), small ? 0.4 : 1.02);

  /* 05 Négociation: two speech bubbles talking */
  const nTop = spot(-1.02, 4.73, 1.6, 1.3, 1.6, HEX.light);
  const bubble = (hex, flip) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.48, 0.16, 3, 0.14), std(hex)); g.add(b);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), std(hex)); tail.position.set(flip * 0.22, -0.3, 0); tail.rotation.z = Math.PI + flip * 0.5; g.add(tail);
    [-0.2, 0, 0.2].forEach(dx => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std(hex === HEX.ink ? HEX.mint : HEX.ink)); d.position.set(dx, 0, 0.09); g.add(d); });
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.rotation.y = 0.68; scene.add(g); return g;
  };
  const talk = [bubble(HEX.cream, -1), bubble(HEX.ink, 1)];
  label('05', 'Négociation', -1.02, nTop + 1.55, 4.73);

  /* 07 Remboursements: a circular arrow bringing a coin back */
  const bTop = spot(6.77, 1.02, 1.6, 1.3, 1.6, HEX.cream);
  const refund = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 48, Math.PI * 1.55), std(HEX.deep));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 14), std(HEX.deep));
  head.position.set(Math.cos(Math.PI * 1.55) * 0.5, Math.sin(Math.PI * 1.55) * 0.5, 0); head.rotation.z = Math.PI * 1.55;
  const refundCoin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32), [std(HEX.amber, { metalness: 0.5, roughness: 0.3 }), std(0xffffff, { map: coinFace }), std(0xffffff, { map: coinFace })]);
  refundCoin.rotation.x = Math.PI / 2;
  refund.add(arc, head, refundCoin); refund.traverse(m => { if (m.isMesh) m.castShadow = true; });
  refund.position.set(6.77, bTop + 0.75, 1.02); refund.rotation.y = 0.68; scene.add(refund);
  label('07', 'Remboursements', 6.77, bTop + 1.45, 1.02);

  /* 08 Intelligence marché: a rotating radar dish with scan pulses */
  const iTop = spot(-6.77, -6.77, 1.6, 3.3, 1.6, HEX.sage);
  const radar = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), std(HEX.cream, { side: THREE.DoubleSide, roughness: 0.4 }));
  dish.rotation.x = Math.PI * 0.7; dish.position.y = 0.45;
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), std(HEX.ink)); horn.position.set(0, 0.55, 0.12); horn.rotation.x = Math.PI * 0.2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.45, 10), std(HEX.ink)); post.position.y = 0.2;
  radar.add(dish, horn, post); radar.traverse(m => { if (m.isMesh) m.castShadow = true; });
  radar.position.set(-6.77, iTop, -6.77); scene.add(radar);
  label('08', 'Intelligence marché', -6.77, iTop + 1.25, -6.77);
  let nextScan = 0;

  /* Vehicles follow rounded rectangle loops that all pass in front of the diner (z = +STREET) */
  function loop(x0, z0, x1, z1, r = 0.75) {
    const pts = [V(x0, 0, z0), V(x1, 0, z0), V(x1, 0, z1), V(x0, 0, z1)], n = 4, path = new THREE.CurvePath(), cs = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const a = p1.clone().sub(p0).normalize(), b = p2.clone().sub(p1).normalize();
      cs.push([p1.clone().addScaledVector(a, -r), p1, p1.clone().addScaledVector(b, r)]);
    }
    for (let i = 0; i < n; i++) { path.add(new THREE.QuadraticBezierCurve3(...cs[i])); path.add(new THREE.LineCurve3(cs[i][2], cs[(i + 1) % n][0])); }
    path.len = path.getLength(); return path;
  }
  const S = STREET, R = ROAD;
  const loops = [loop(-S, S, S, -S), loop(-S, R, S, S), loop(-R, S, S, -S), loop(-S, R, R, S), loop(-R, R, R, S), loop(-S, S, R, -R), loop(-R, S, R, -R), loop(-R, R, R, -R)];

  // Merged, vertex-coloured couriers and cars: one draw call each
  const bodyColors = [HEX.ink, HEX.deep, HEX.amber, HEX.ink, HEX.mauve];
  function scooterGeo(hex, withBox = true) {
    const parts = [
      tint(place(new RoundedBoxGeometry(0.34, 0.3, 0.92, 3, 0.1), 0, 0.32, 0), hex),
      tint(place(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14), 0, 0.17, 0.37, 0, 1, 1, 1, 0, Math.PI / 2), HEX.ink),
      tint(place(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14), 0, 0.17, -0.35, 0, 1, 1, 1, 0, Math.PI / 2), HEX.ink),
      tint(place(new THREE.CapsuleGeometry(0.13, 0.28, 4, 8), 0, 0.75, -0.06, 0, 1, 1, 1, 0.3), HEX.ink),
      tint(place(new THREE.SphereGeometry(0.15, 14, 10), 0, 1.08, 0.02), HEX.mint),
      tint(place(new THREE.BoxGeometry(0.44, 0.04, 0.04), 0, 0.72, 0.37), HEX.ink),
      tint(place(new THREE.SphereGeometry(0.06, 8, 8), 0, 0.46, 0.48), 0xfff3c4)
    ];
    if (withBox) parts.push(tint(place(new RoundedBoxGeometry(0.48, 0.44, 0.48, 2, 0.06), 0, 0.76, -0.43), HEX.mint), tint(place(new THREE.BoxGeometry(0.5, 0.06, 0.5), 0, 0.8, -0.43), HEX.ink));
    return mergeGeometries(parts.map(keep));
  }
  function carGeo(hex) {
    const parts = [
      tint(place(new RoundedBoxGeometry(0.7, 0.34, 1.3, 3, 0.12), 0, 0.3, 0), hex),
      tint(place(new RoundedBoxGeometry(0.62, 0.3, 0.7, 3, 0.1), 0, 0.58, -0.08), HEX.cream),
      tint(place(new THREE.BoxGeometry(0.64, 0.18, 0.5), 0, 0.6, -0.08), 0x2a3833),
      ...[[-0.33, 0.42], [0.33, 0.42], [-0.33, -0.42], [0.33, -0.42]].map(([x, z]) => tint(place(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12), x, 0.15, z, 0, 1, 1, 1, 0, Math.PI / 2), HEX.ink))
    ];
    return mergeGeometries(parts.map(keep));
  }
  const up = V(0, 1, 0), side = V(0, 0, 0), movers = [];
  function mover(geo, scale, speed, lane) {
    const lean = new THREE.Mesh(geo, vcol); lean.castShadow = true;
    const g = new THREE.Group(); g.add(lean); g.scale.setScalar(scale); scene.add(g);
    const m = { g, lean, speed, lane, path: null, u: 0, dir: 1, heading: null, roll: 0, boost: 0 };
    movers.push(m); return m;
  }
  const NC = small ? 12 : 18;
  for (let i = 0; i < NC; i++) {
    const m = mover(scooterGeo(bodyColors[i % bodyColors.length]), 0.62, 3.4 + rnd() * 1.4, 0.3);
    m.path = loops[i % loops.length]; m.u = rnd(); m.dir = i % 3 === 2 ? -1 : 1; m.courier = true;
  }
  [HEX.cream, HEX.amber, HEX.mauve, HEX.light].slice(0, small ? 2 : 4).forEach((hex, i) => {
    const m = mover(carGeo(hex), 0.78, 2.3, 0.36); m.path = loops[7 - (i % 2) * 3]; m.u = i / 4 + 0.1; m.dir = i % 2 ? -1 : 1;
  });
  [-0.95, -0.55, 0.55, 0.95].forEach((dx, i) => {   // parked scooters at the terrace
    const p = new THREE.Mesh(scooterGeo(bodyColors[i], i % 2 === 0), vcol); p.castShadow = true; p.scale.setScalar(0.55);
    p.position.set(D.x + dx, Y0, D.z + 2.15); p.rotation.y = Math.PI + (i % 2 ? 0.15 : -0.15); scene.add(p);
  });

  // Merge statics now that every builder has run
  bucket.forEach(geos => { const m = new THREE.Mesh(mergeGeometries(geos), vcol); m.castShadow = m.receiveShadow = true; scene.add(m); });
  towers.forEach((geos, hex) => { const m = new THREE.Mesh(mergeGeometries(geos), std(hex, { map: winTex, roughness: 0.5 })); m.castShadow = m.receiveShadow = true; scene.add(m); });

  // Soft shadow under the floating tile
  const blob = document.createElement('canvas'); blob.width = blob.height = 128;
  { const g = blob.getContext('2d'), gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(5,7,6,.4)'); gr.addColorStop(1, 'rgba(5,7,6,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.6; scene.add(ground);

  // Order pulses from the diner
  const rings = [];
  function ring(x, z, hex, s = 1) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, Y0 + 0.02, z); scene.add(r); rings.push({ r, life: 0, s });
  }

  /* Camera */
  const look = V(0, 0.9, 0.2);
  let mx = 0, my = 0, tx = 0, ty = 0;
  const art = document.querySelector('.hero-art');
  art.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = engine.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5; });
  art.addEventListener('pointerleave', () => { tx = ty = 0; });
  // Labels are clickable: pick them from the hero column (the canvas itself never blocks the page)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(labels.map(l => l.sprite), false)[0];
    return hit && labels.find(l => l.sprite === hit.object);
  }
  let hovered = null;
  art.addEventListener('pointermove', e => {
    const l = pick(e); if (l === hovered) return;
    if (hovered) hovered.hover = 0; hovered = l || null; if (hovered) hovered.hover = 1;
    art.style.cursor = hovered ? 'pointer' : ''; wake();
  });
  art.addEventListener('click', e => {
    const l = pick(e); if (!l) return;
    e.preventDefault();
    const id = l.sprite.userData.pillar, details = document.querySelector('.expertise-disclosure');
    if (details) details.open = true;
    history.replaceState(null, '', '#' + id);
    dispatchEvent(new HashChangeEvent('hashchange'));
    requestAnimationFrame(() => (document.querySelector('.expert-workspace') || document.getElementById(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
  function frameCamera(time) {
    mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
    const az = 0.68 + Math.sin(time * 0.00005) * 0.16 + mx * 0.4, el = (small ? 0.84 : 0.66) - my * 0.1, dist = small ? 55 : 59;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(look);
  }
  let ready = false;
  function resize() {
    const r = wrap.getBoundingClientRect(); if (!r.width) return;
    renderer.setPixelRatio(Math.min(dprCap, (small ? 900 : 1400) / r.width));
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    if (ready) render(performance.now(), 0);
  }
  new ResizeObserver(resize).observe(wrap);

  let kick = 0;
  addEventListener('zeste:pickup', () => { kick = 1; ring(D.x, D.z + 1.6, HEX.mint, 1.8); movers.forEach(m => { if (m.courier) m.boost = 1; }); });

  /* Frame */
  let nextRing = 0;
  function render(time, dt) {
    const s = dt / 1000;
    movers.forEach(m => {
      m.boost = Math.max(0, m.boost - s * 0.4);
      m.u = (m.u + (m.dir * (m.speed * (1 + m.boost * 0.8) * s)) / m.path.len + 1) % 1;
      const p = m.path.getPointAt(m.u), t = m.path.getTangentAt(m.u); if (m.dir < 0) t.negate();
      side.crossVectors(t, up).normalize().multiplyScalar(m.lane);
      m.g.position.set(p.x + side.x, 0.012, p.z + side.z);
      const h = Math.atan2(t.x, t.z);
      if (m.heading === null) m.heading = h;
      const dh = Math.atan2(Math.sin(h - m.heading), Math.cos(h - m.heading)); m.heading += dh;
      m.roll += ((s > 0 ? (-dh / s) * 0.07 : 0) - m.roll) * Math.min(1, s * 9);
      m.g.rotation.y = m.heading;
      m.lean.rotation.z = m.courier ? THREE.MathUtils.clamp(m.roll, -0.5, 0.5) : 0;
      m.lean.position.y = Math.abs(Math.sin(time * 0.025 + m.speed * 9)) * 0.012;
    });
    kick = Math.max(0, kick - s * 1.3);
    burger.rotation.y += s * 0.55;
    burger.position.y = burgerBase + Math.sin(time * 0.0018) * 0.06 + Math.sin((1 - kick) * Math.PI) * kick * 0.9;
    topBun.position.y = 0.76 + Math.max(0, Math.sin(time * 0.004)) * 0.04 + kick * 0.25;
    neon.material.emissiveIntensity = 1.25 + Math.sin(time * 0.006) * 0.12 + (Math.sin(time * 0.0217) > 0.985 ? -0.6 : 0);
    const cyc = (time % 4200) / 4200;
    bars.forEach((b, i) => { const k = THREE.MathUtils.smoothstep(cyc, i * 0.12, i * 0.12 + 0.3) - THREE.MathUtils.smoothstep(cyc, 0.86, 0.98); const h = b.userData.h * (0.25 + 0.75 * k); b.scale.y = h; b.position.y = rTop + h / 2; });
    coinPivot.rotation.y += s * 2.2; coinPivot.position.y = rTop + 1.75 + Math.sin(time * 0.002) * 0.1;
    shield.rotation.y = Math.sin(time * 0.0012) * 0.5;
    const sc = (time % 3600) / 3600;
    stars.forEach((st, i) => { const k = THREE.MathUtils.smoothstep(sc, i * 0.1, i * 0.1 + 0.12) - THREE.MathUtils.smoothstep(sc, 0.88, 0.98); st.scale.setScalar(0.35 + 0.75 * k); st.rotation.y = (1 - k) * 1.5; });
    stackT += s;
    if (stackT > 0.55) { stackT = 0; if (stackN < parcels.length) { parcels[stackN].t = 0; stackN++; } else { parcels.forEach(p => { p.t = -1; p.m.visible = false; }); stackN = 0; } }
    parcels.forEach(p => {
      const k = !dt ? 1 : p.t < 0 ? -1 : Math.min(1, (p.t += s) / 0.45);   // a still frame shows the full stack
      if (k < 0) { p.m.visible = false; return; }
      const e = 1 - Math.pow(1 - k, 3);
      p.m.visible = true; p.m.position.set(VB.x - 1.0 + p.s[0], vTop + 0.18 + p.s[1] + (1 - e) * 2.2, VB.z - 1.0 + p.s[2]); p.m.rotation.y = (1 - e) * 1.2;
    });
    hands.forEach(([hh, mh]) => { mh.rotation.z = -time * 0.0016; hh.rotation.z = -time * 0.00013; });
    labels.forEach(l => {
      l.sprite.position.y = l.y + Math.sin(time * 0.0016 + l.phase) * 0.06;
      const k = 1 + l.hover * 0.14, [bw, bh] = l.sprite.userData.base || [1, 1]; l.sprite.scale.set(bw * k, bh * k, 1);
    });
    screen.position.y = dTop + 1.0 + Math.sin(time * 0.0014) * 0.05; panel.material.emissiveIntensity = 0.6 + Math.sin(time * 0.004) * 0.12;
    pie.rotation.y += s * 0.6;
    const pop = Math.max(0, Math.sin(time * 0.0019)) ** 3; const m4 = slices[4], a4 = m4.userData.mid; m4.position.set(Math.sin(a4) * pop * 0.22, 0.05 * pop, Math.cos(a4) * pop * 0.22);
    talk.forEach((b, i) => { const ph = time * 0.003 + i * Math.PI; b.position.set(-1.02 + (i ? 0.38 : -0.38), nTop + 0.55 + i * 0.32 + Math.max(0, Math.sin(ph)) * 0.18, 4.73); b.scale.setScalar(0.9 + Math.max(0, Math.sin(ph)) * 0.15); });
    refund.rotation.z = -time * 0.0018;
    radar.rotation.y = time * 0.0011;
    if (time > nextScan) { ring(-6.77, -6.77, HEX.deep, 0.5); rings[rings.length - 1].r.position.y = iTop + 0.02; nextScan = time + 1700; }
    if (time > nextRing) { ring(D.x, D.z + 1.6, HEX.mint); nextRing = time + 2400; }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life += s / 1.7; r.r.scale.setScalar(r.s * (0.7 + r.life * 2.6)); r.r.material.opacity = 0.8 * (1 - r.life);
      if (r.life >= 1) { scene.remove(r.r); r.r.geometry.dispose(); r.r.material.dispose(); rings.splice(i, 1); }
    }
    frameCamera(time);
    renderer.render(scene, camera);
  }

  /* Struggling device? After ~1 s under ~45 fps, drop resolution, then shadows. */
  let slow = 0, frames = 0, level = 0, readyAt = Infinity;
  function adapt(dt) {
    if (level > 1 || !dt || performance.now() - readyAt < 2500) return;   // ignore the busy intro seconds
    frames++; if (dt > 22) slow++;
    if (frames < 60) return;
    if (slow > 30) {
      level++;
      if (level === 1) dprCap = Math.min(dprCap, 1);
      else { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
      resize();
    }
    frames = slow = 0;
  }

  /* Run only while visible and allowed; otherwise keep one still frame */
  let visible = true, last = performance.now(), raf = 0;
  function frame(now) {
    raf = 0; if (!visible || document.hidden || !ready) return;
    // 60 fps is plenty: 120/144 Hz desktop screens would otherwise double or triple the GPU work.
    if (now - last < 15.5 && !still()) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(50, now - last); last = now;
    render(now, still() ? 0 : dt); adapt(dt);
    if (!still()) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; wake(); }).observe(wrap);
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', wake);
  // Compile shaders off the main thread where supported (slow on Windows/ANGLE), then fade the city in.
  ring(D.x, D.z, HEX.mint); rings[rings.length - 1].life = 0.999;
  resize();
  const compiled = renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : Promise.resolve();
  compiled.then(() => requestAnimationFrame(() => { ready = true; readyAt = performance.now(); resize(); wrap.classList.add('on'); wake(); }));
}

// Without the 3D scene, bring back the 2D engine that index.html hid while waiting for it.
function fallback() { engine?.classList.remove('is-3d'); engine?.classList.add('no-3d'); document.querySelector('.scene3d')?.remove(); }
try { init(); } catch (e) { console.error(e); fallback(); }

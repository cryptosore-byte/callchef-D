/* Zeste hero diorama — a restaurant with the zeste. sign, couriers riding out on every road.
   Three.js (MIT, vendored). If WebGL is unavailable the original 2D engine stays in place. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const C = { ink: 0x050706, mint: 0x8fd8bd, deep: 0x24644f, cream: 0xf3faf7, top: 0xe2f4ec, light: 0xc8efdf, amber: 0xe7aa50, road: 0x141b18 };
const engine = document.querySelector('.engine');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => reduced.matches || document.body.classList.contains('motion-paused');
const ISLAND = 7, TOP = 0.25;

function init() {
  if (!engine) return;
  const wrap = document.createElement('div');
  wrap.className = 'scene3d';
  wrap.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  if (!renderer.getContext()) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.append(renderer.domElement);
  engine.prepend(wrap);
  engine.classList.add('is-3d');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...extra });
  const M = { ink: mat(C.ink), mint: mat(C.mint), deep: mat(C.deep), cream: mat(C.cream), road: mat(C.road, { roughness: 0.9 }), amber: mat(C.amber),
    glow: mat(C.light, { emissive: C.mint, emissiveIntensity: 0.55 }), lamp: mat(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 1.2 }) };
  const shadow = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  /* Lights */
  scene.add(new THREE.HemisphereLight(0xffffff, C.mint, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(7, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(innerWidth < 760 ? 1024 : 2048, innerWidth < 760 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  /* Floating island: cream top, ink rim, soft shadow underneath */
  const island = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND, ISLAND, 0.5, 96), [M.ink, mat(C.top), M.ink]);
  island.receiveShadow = true;
  scene.add(island);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(ISLAND, 0.06, 8, 120), M.mint);
  lip.rotation.x = Math.PI / 2; lip.position.y = TOP;
  scene.add(lip);
  const blob = document.createElement('canvas'); blob.width = blob.height = 128;
  const bctx = blob.getContext('2d'), grad = bctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(5,7,6,.38)'); grad.addColorStop(1, 'rgba(5,7,6,0)');
  bctx.fillStyle = grad; bctx.fillRect(0, 0, 128, 128);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.6;
  scene.add(ground);

  /* Roads: gentle S-curves from the shop front to the island edge */
  const ROADS = 7, roads = [];
  for (let i = 0; i < ROADS; i++) {
    const a = (i / ROADS) * Math.PI * 2 + 0.35, bend = (i % 2 ? 1 : -1) * 0.38;
    const pts = [0.9, 2.4, 4.0, 5.3, 6.15].map((r, k) => {
      const ang = a + Math.sin((k / 4) * Math.PI) * bend;
      return new THREE.Vector3(Math.cos(ang) * r, TOP + 0.012, Math.sin(ang) * r);
    });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    roads.push({ curve, len: curve.getLength(), angle: a });
    scene.add(ribbon(curve, 0.95, M.road));
    for (let u = 0.08; u < 0.98; u += 0.07) {
      const p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.22), M.mint);
      dash.position.copy(p).y += 0.008;
      dash.rotation.y = Math.atan2(t.x, t.z);
      scene.add(dash);
    }
  }
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(2.15, 64), M.road);
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = TOP + 0.01; plaza.receiveShadow = true;
  scene.add(plaza);

  function ribbon(curve, width, material) {
    const n = 80, pos = [], idx = [], up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u), side = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(width / 2);
      pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true;
    return mesh;
  }

  /* The restaurant */
  const shop = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.7, 1.55, 2.1, 4, 0.12), M.cream);
  body.position.y = TOP + 0.78; shop.add(body);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(3.0, 0.24, 2.4, 3, 0.08), M.ink);
  roof.position.y = TOP + 1.66; shop.add(roof);
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.95, 0.1, 2, 0.04), M.ink);
  door.position.set(0, TOP + 0.48, 1.06); shop.add(door);
  [-0.92, 0.92].forEach(x => {
    const w = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.55, 0.08, 2, 0.04), M.glow);
    w.position.set(x, TOP + 0.8, 1.06); shop.add(w);
  });
  for (let s = 0; s < 8; s++) { // striped awning
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.9 / 8, 0.05, 0.62), s % 2 ? M.cream : M.deep);
    stripe.position.set(-1.45 + 2.9 / 16 + (s * 2.9) / 8, TOP + 1.3, 1.32);
    stripe.rotation.x = 0.42; shop.add(stripe);
  }
  const sign = new THREE.Group();
  const signFace = signTexture();
  const panel = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.78, 0.14, 3, 0.06), [M.mint, M.mint, M.mint, M.mint, new THREE.MeshStandardMaterial({ map: signFace, roughness: 0.6 }), M.mint]);
  sign.add(panel);
  [-0.85, 0.85].forEach(x => { const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), M.ink); post.position.set(x, -0.55, 0); sign.add(post); });
  sign.position.set(0, TOP + 2.38, 0.55);
  shop.add(sign);
  const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), M.lamp); lampL.position.set(-0.5, TOP + 1.12, 1.15); shop.add(lampL);
  const lampR = lampL.clone(); lampR.position.x = 0.5; shop.add(lampR);
  shop.rotation.y = 0.42;
  scene.add(shadow(shop));

  function signTexture() {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 320;
    const g = cv.getContext('2d');
    g.fillStyle = '#8fd8bd'; g.fillRect(0, 0, cv.width, cv.height);
    const paths = [...document.querySelectorAll('.hero-wordmark path')].map(p => new Path2D(p.getAttribute('d')));
    // Same transform as the SVG wordmark (viewBox 0 115 730 195), fitted into the canvas.
    const k = 1.2, ox = (cv.width - 730 * k) / 2, oy = (cv.height - 195 * k) / 2;
    g.setTransform(0.2292 * k, 0, 0, -0.2292 * k, ox + 12 * k, oy + (283 - 115) * k);
    g.fillStyle = '#050706';
    paths.forEach(p => g.fill(p));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  /* Destinations: little houses with a pin at the end of each road */
  const pins = roads.map((r, i) => {
    const end = r.curve.getPointAt(1), dir = r.curve.getTangentAt(1);
    const house = new THREE.Group();
    const h = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.6, 0.75, 2, 0.05), M.cream);
    h.position.y = 0.3; house.add(h);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 4), i % 2 ? M.ink : M.deep);
    top.position.y = 0.81; top.rotation.y = Math.PI / 4; house.add(top);
    house.position.set(end.x + dir.x * 0.55, TOP, end.z + dir.z * 0.55);
    house.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(shadow(house));
    const pin = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), M.mint);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 16), M.mint);
    tip.rotation.x = Math.PI; tip.position.y = -0.2;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), M.ink); dot.position.z = 0.15;
    pin.add(head, tip, dot);
    pin.position.set(house.position.x, TOP + 1.65, house.position.z);
    scene.add(shadow(pin));
    return { pin, base: pin.position.y, phase: i * 0.9, hit: 0 };
  });

  /* A few trees */
  [[2.9, -2.4], [-3.1, -1.9], [-2.4, 3.2], [3.6, 2.6], [0.4, -3.6], [-4.6, 0.7]].forEach(([x, z], i) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 8), M.ink); trunk.position.y = 0.18;
    const crown = new THREE.Mesh(i % 2 ? new THREE.ConeGeometry(0.38, 0.85, 10) : new THREE.SphereGeometry(0.36, 14, 12), M.deep);
    crown.position.y = i % 2 ? 0.75 : 0.62;
    t.add(trunk, crown); t.position.set(x, TOP, z); t.scale.setScalar(0.9 + (i % 3) * 0.12);
    scene.add(shadow(t));
  });

  /* Signal rings: orders leaving the shop */
  const rings = [];
  function ring(x, z, color, scale = 1) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.02, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, TOP + 0.03, z);
    scene.add(r); rings.push({ r, life: 0, scale });
  }

  /* Couriers */
  const G = { body: new RoundedBoxGeometry(0.34, 0.3, 0.9, 3, 0.1), wheel: new THREE.CylinderGeometry(0.17, 0.17, 0.1, 18),
    torso: new THREE.CapsuleGeometry(0.13, 0.28, 4, 10), head: new THREE.SphereGeometry(0.15, 16, 12),
    box: new RoundedBoxGeometry(0.46, 0.42, 0.46, 3, 0.06), bar: new THREE.BoxGeometry(0.42, 0.04, 0.04), light: new THREE.SphereGeometry(0.06, 10, 10) };
  const bodies = [M.ink, M.deep, M.ink, M.amber];
  function courier(i) {
    const g = new THREE.Group(), lean = new THREE.Group();
    const b = new THREE.Mesh(G.body, bodies[i % bodies.length]); b.position.y = 0.32; lean.add(b);
    const wf = new THREE.Mesh(G.wheel, M.ink), wb = new THREE.Mesh(G.wheel, M.ink);
    [wf, wb].forEach((w, k) => { w.rotation.z = Math.PI / 2; w.position.set(0, 0.17, k ? -0.34 : 0.36); lean.add(w); });
    const torso = new THREE.Mesh(G.torso, M.cream); torso.position.set(0, 0.74, -0.08); torso.rotation.x = 0.25; lean.add(torso);
    const head = new THREE.Mesh(G.head, i % 2 ? M.mint : M.ink); head.position.set(0, 1.07, 0.0); lean.add(head);
    const bar = new THREE.Mesh(G.bar, M.ink); bar.position.set(0, 0.72, 0.36); lean.add(bar);
    const box = new THREE.Mesh(G.box, M.mint); box.position.set(0, 0.74, -0.42); lean.add(box);
    const lamp = new THREE.Mesh(G.light, M.lamp); lamp.position.set(0, 0.45, 0.47); lean.add(lamp);
    g.add(lean); g.scale.setScalar(0.78);
    scene.add(shadow(g));
    return { g, lean, wheels: [wf, wb], box, road: 0, u: 0, speed: 1, out: true, wait: 0, heading: 0, roll: 0 };
  }
  const COUNT = innerWidth < 760 ? 10 : 14;
  const riders = Array.from({ length: COUNT }, (_, i) => courier(i));
  function launch(c, u0 = 0) {
    c.road = (Math.random() * ROADS) | 0;
    c.out = Math.random() > 0.22;
    c.u = u0; c.speed = 1.05 + Math.random() * 0.6; c.wait = 0;
    c.box.visible = c.out;
  }
  riders.forEach(c => launch(c, Math.random()));

  /* Camera framing, pointer parallax, sizing */
  const look = new THREE.Vector3(0, 0.2, 0);
  let mx = 0, my = 0, tx = 0, ty = 0;
  document.querySelector('.hero-art').addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = engine.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5;
  });
  document.querySelector('.hero-art').addEventListener('pointerleave', () => { tx = ty = 0; });
  function frameCamera(time) {
    mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
    const az = 0.55 + Math.sin(time * 0.00006) * 0.12 + mx * 0.35, el = 0.8 - my * 0.12, dist = innerWidth < 760 ? 31 : 35;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(look);
  }
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    render(performance.now(), 0);
  }
  new ResizeObserver(resize).observe(wrap);

  /* Pickup from the hero "e": the sign jumps and a burst of couriers leaves */
  let signKick = 0;
  addEventListener('zeste:pickup', () => {
    signKick = 1; ring(0, 1.4, C.mint, 1.6);
    riders.filter(c => c.wait > 0 || c.u > 0.92).slice(0, 3).forEach(c => launch(c, 0));
  });

  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let nextRing = 0;
  function render(time, dt) {
    const s = dt / 1000;
    riders.forEach(c => {
      if (c.wait > 0) { c.wait -= s; c.g.visible = false; if (c.wait <= 0) launch(c, 0); return; }
      const road = roads[c.road];
      c.u += (c.speed * s) / road.len;
      if (c.u >= 1) {
        if (c.out) { const p = pins[c.road]; p.hit = 1; }
        c.wait = 0.4 + Math.random() * 1.6; c.g.visible = false; return;
      }
      const u = c.out ? c.u : 1 - c.u;
      const p = road.curve.getPointAt(u), t = road.curve.getTangentAt(u);
      if (!c.out) t.negate();
      side.crossVectors(t, up).normalize().multiplyScalar(0.22); // keep right
      c.g.position.copy(p).add(side); c.g.position.y = TOP + 0.01;
      const heading = Math.atan2(t.x, t.z);
      let dh = heading - c.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.heading += dh;
      c.roll += ((s > 0 ? -dh / s * 0.09 : 0) - c.roll) * 0.12;
      c.g.rotation.y = c.heading;
      c.lean.rotation.z = THREE.MathUtils.clamp(c.roll, -0.45, 0.45);
      c.lean.position.y = Math.sin(time * 0.02 + c.road) * 0.008;
      const grow = Math.min(1, c.u / 0.05, (1 - c.u) / 0.05);
      c.g.scale.setScalar(0.78 * Math.max(0.001, grow));
      c.wheels.forEach(w => { w.rotation.x += (c.speed * s) / 0.17; });
      c.g.visible = true;
    });
    pins.forEach(p => {
      p.hit = Math.max(0, p.hit - s * 1.6);
      p.pin.position.y = p.base + Math.sin(time * 0.0022 + p.phase) * 0.08 + Math.sin((1 - p.hit) * Math.PI) * p.hit * 0.9;
      p.pin.rotation.y += s * 0.9;
      if (p.hit > 0.98) { tmp.copy(p.pin.position); ring(tmp.x, tmp.z, C.deep, 0.45); }
    });
    if (time > nextRing) { ring(0, 1.4, C.mint); nextRing = time + 2600; }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life += s / 1.8;
      r.r.scale.setScalar(r.scale * (0.6 + r.life * 2.4));
      r.r.material.opacity = 0.85 * (1 - r.life);
      if (r.life >= 1) { scene.remove(r.r); r.r.geometry.dispose(); r.r.material.dispose(); rings.splice(i, 1); }
    }
    signKick = Math.max(0, signKick - s * 1.4);
    sign.position.y = TOP + 2.38 + Math.sin(time * 0.0016) * 0.04 + Math.sin((1 - signKick) * Math.PI * 2) * signKick * 0.25;
    sign.rotation.z = Math.sin(time * 0.0011) * 0.02;
    frameCamera(time);
    renderer.render(scene, camera);
  }

  /* Weak device? After ~2 s of slow frames, drop resolution, then shadows. */
  let slow = 0, frames = 0, level = 0;
  function adapt(dt) {
    if (level > 1 || !dt) return;
    frames++; if (dt > 30) slow++;
    if (frames < 90) return;
    if (slow > 45) {
      level++;
      if (level === 1) renderer.setPixelRatio(1);
      else { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
      resize();
    }
    frames = slow = 0;
  }

  /* Run only while visible and allowed; otherwise keep one still frame */
  let visible = true, last = performance.now(), raf = 0;
  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(50, now - last); last = now;
    render(now, still() ? 0 : dt);
    adapt(dt);
    if (!still()) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; kick(); }).observe(wrap);
  document.addEventListener('visibilitychange', kick);
  new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', kick);
  requestAnimationFrame(() => { resize(); wrap.classList.add('on'); kick(); });
}

try { init(); } catch (e) { engine && engine.classList.remove('is-3d'); document.querySelector('.scene3d')?.remove(); }

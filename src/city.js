/* One Portfolio: the Growth City. A neon 3D city drawn behind every screen.
   Four districts (mutual funds, stocks, bonds, abroad); one tower per holding: height follows its value, the roof
   glows with its gain, and a red beacon marks a loss. The camera flies to a district when its screen opens, the
   page scroll walks it down the streets, and a month slider replays how the towers grew.
   Loaded as an ES module (three.js from the import map); app.js talks to it through window.City. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = Math.min(innerWidth, innerHeight) < 700;
const DIST = { funds: [-17, -14], stocks: [17, -14], bonds: [-17, 18], abroad: [17, 18] };
const BLOCK = 26;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function windowsTexture(hex) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 128; const x = c.getContext("2d");
  x.fillStyle = "#05040a"; x.fillRect(0, 0, 64, 128);
  const col = new THREE.Color(hex);
  for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) {
    const lit = Math.random(); if (lit < 0.42) continue;
    const a = lit > 0.9 ? 1 : 0.35 + lit * 0.4, w = new THREE.Color(1, 0.93, 0.8).lerp(col, 0.55);
    x.fillStyle = `rgba(${(w.r * 255) | 0},${(w.g * 255) | 0},${(w.b * 255) | 0},${a})`; x.fillRect(6 + k * 14, 4 + r * 8, 8, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color("#05030f") }, mid: { value: new THREE.Color("#1a0b3a") }, glow: { value: new THREE.Color("#ff3d8b") }, glow2: { value: new THREE.Color("#ff9a3d") } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 glow; uniform vec3 glow2; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h)); c = mix(c, glow, smoothstep(0.18, -0.02, h) * 0.75); c = mix(c, glow2, smoothstep(0.03, -0.06, h) * 0.55); gl_FragColor = vec4(c, 1.0); }",
  });
}

class City {
  constructor(host) {
    this.host = host; this.towers = []; this.labels = []; this.focusId = "all"; this.scroll = 0; this.month = -1; this.months = [];
    this.pickCb = null; this.hoverCb = null; this.mouse = new THREE.Vector2(-9, -9); this.ray = new THREE.Raycaster(); this.hov = null;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !small, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.25 : 1.5)); r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(r.domElement);
    const s = (this.scene = new THREE.Scene()); s.fog = new THREE.FogExp2("#140a2a", 0.0105);
    this.cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 900);
    s.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMaterial()));
    // stars
    const n = small ? 500 : 1400, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.2, R = 420; sp[i * 3] = R * Math.cos(th) * Math.cos(ph); sp[i * 3 + 1] = 40 + R * Math.sin(ph); sp[i * 3 + 2] = R * Math.sin(th) * Math.cos(ph); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#cfd8ff", size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })); s.add(this.stars);
    // ground, grid and avenues
    const g = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: "#07060e", roughness: 0.55, metalness: 0.6 }));
    g.rotation.x = -Math.PI / 2; s.add(g);
    const grid = new THREE.GridHelper(400, 100, "#3b2a7a", "#1a1440"); grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.55; s.add(grid);
    this.trails = [];
    const road = (x1, z1, x2, z2, col) => {
      const len = Math.hypot(x2 - x1, z2 - z1), m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z2 - z1, x2 - x1); m.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2); s.add(m);
      if (!reduce) for (let k = 0; k < (small ? 4 : 9); k++) { const car = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.35), new THREE.MeshBasicMaterial({ color: k % 2 ? "#fff1c1" : "#ff4f6d" })); car.position.y = 0.2; s.add(car); this.trails.push({ car, x1, z1, x2, z2, t: Math.random(), v: 0.03 + Math.random() * 0.05, dir: k % 2 ? 1 : -1 }); }
    };
    road(-60, 2, 60, 2, "#22d3ee"); road(0, -45, 0, 50, "#c084fc"); road(-60, -34, 60, -34, "#2a2366"); road(-60, 38, 60, 38, "#2a2366");
    // light
    s.add(new THREE.HemisphereLight("#8f7dff", "#120820", 0.55));
    const moon = new THREE.DirectionalLight("#ffd2f0", 0.8); moon.position.set(-40, 80, 30); s.add(moon);
    this.cityGroup = new THREE.Group(); s.add(this.cityGroup);
    // post
    const comp = (this.composer = new EffectComposer(r)); comp.addPass(new RenderPass(s, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), small ? 0.8 : 1.0, 0.55, 0.12); comp.addPass(this.bloom); comp.addPass(new OutputPass());
    this.labelBox = document.createElement("div"); this.labelBox.className = "city-labels"; host.appendChild(this.labelBox);
    this.view = { pos: new THREE.Vector3(0, 70, 92), look: new THREE.Vector3(0, 0, 2) }; this.from = null; this.t0 = 0;
    this.cam.position.copy(this.view.pos); this.cam.lookAt(this.view.look); this.curLook = this.view.look.clone();
    addEventListener("resize", () => this.resize());
    // towers answer the pointer only where nothing of the page sits on top of the city
    addEventListener("pointermove", (e) => { if (e.target !== r.domElement) { this.mouse.set(-9, -9); return; } this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); this.px = e.clientX; this.py = e.clientY; }, { passive: true });
    r.domElement.addEventListener("click", (e) => { this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); this.ray.setFromCamera(this.mouse, this.cam); const hit = this.ray.intersectObjects(this.towers.map((x) => x.body), false)[0], tw = hit && this.towers.find((x) => x.body === hit.object); if (tw && this.pickCb) this.pickCb({ district: tw.district, id: tw.data.id }); });
    this.clock = new THREE.Clock(); this.running = true;
    document.addEventListener("visibilitychange", () => { this.running = !document.hidden; if (this.running) this.loop(); });
    this.loop();
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h); this.composer.setSize(w, h); this.bloom.setSize(w / 2, h / 2); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  clear() {
    for (const t of this.towers) { t.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); if (o.material.emissiveMap) o.material.emissiveMap.dispose(); o.material.dispose(); } }); this.cityGroup.remove(t.group); }
    this.cityGroup.clear(); this.towers = []; this.labelBox.innerHTML = ""; this.labels = [];
  }
  /* data: { months:[...], districts:[{ id, name, color, value, valueText, holdings:[{ id, name, value, gainPct, series:[...] }] }] } */
  setData(data) {
    this.clear(); this.months = data.months || [];
    const all = data.districts.flatMap((d) => d.holdings.map((h) => h.value)), vmax = Math.max(1, ...all);
    this.vmax = vmax;
    for (const d of data.districts) {
      const [cx, cz] = DIST[d.id] || [0, 0], col = new THREE.Color(d.color);
      // plaza with a glowing outline
      const plaza = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.3, BLOCK), new THREE.MeshStandardMaterial({ color: "#0b0918", roughness: 0.4, metalness: 0.7, emissive: col, emissiveIntensity: 0.04 }));
      plaza.position.set(cx, 0.15, cz); this.cityGroup.add(plaza);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BLOCK + 0.6, 0.32, BLOCK + 0.6)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
      edge.position.copy(plaza.position); this.cityGroup.add(edge);
      const hs = d.holdings.slice().sort((a, b) => b.value - a.value), n = Math.max(1, hs.length), gsz = Math.ceil(Math.sqrt(n)), cell = (BLOCK - 2) / gsz;
      const cells = []; for (let i = 0; i < gsz; i++) for (let j = 0; j < gsz; j++) cells.push([i, j, Math.hypot(i - (gsz - 1) / 2, j - (gsz - 1) / 2) + Math.random() * 0.01]);
      cells.sort((a, b) => a[2] - b[2]);
      hs.forEach((h, k) => {
        const [i, j] = cells[k], x = cx - (BLOCK - 2) / 2 + cell * (i + 0.5), z = cz - (BLOCK - 2) / 2 + cell * (j + 0.5);
        const w = Math.max(0.9, cell * (0.42 + 0.42 * Math.sqrt(h.value / vmax))), H = this.hOf(h.value);
        const grp = new THREE.Group(); grp.position.set(x, 0.3, z);
        const tex = windowsTexture(d.color); tex.repeat.set(1, Math.max(1, H / 3));
        const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#0c0b17", roughness: 0.35, metalness: 0.75, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.9 }));
        body.scale.set(w, H, w); body.position.y = H / 2; grp.add(body);
        const glow = Math.max(0.25, Math.min(2.2, 0.6 + (h.gainPct || 0) / 8)), loss = (h.gainPct || 0) < -0.5;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(loss ? 0.35 : glow) }));
        roof.scale.set(w * 1.04, 0.35, w * 1.04); roof.position.y = H + 0.17; grp.add(roof);
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 }));
        lines.scale.copy(body.scale); lines.position.y = H / 2; grp.add(lines);
        let beacon = null;
        if (loss) { beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: "#ff3b4e" })); beacon.position.y = H + 0.75; grp.add(beacon); }
        this.cityGroup.add(grp);
        this.towers.push({ group: grp, body, roof, lines, beacon, tex, w, H, h: H, target: H, data: h, district: d.id, color: col, grow: reduce ? 1 : 0, delay: k * 0.03 + Math.random() * 0.2 });
      });
      // district label
      const el = document.createElement("button"); el.type = "button"; el.className = "city-label"; el.style.setProperty("--c", d.color);
      el.innerHTML = `<b>${d.name}</b><span>${d.valueText || ""}</span>`; el.onclick = () => this.pickCb && this.pickCb({ district: d.id });
      this.labelBox.appendChild(el); this.labels.push({ el, pos: new THREE.Vector3(cx, 1, cz + BLOCK / 2 + 1.5), id: d.id });
    }
    this.t0 = this.clock.getElapsedTime();
    this.setMonth(this.month);
  }
  hOf(v) { return 1.2 + 30 * Math.sqrt(Math.max(0, v) / this.vmax); }
  /* month index into months[] (-1 = today) */
  setMonth(i) {
    this.month = i;
    for (const t of this.towers) { const s = t.data.series, v = i < 0 || !s || s[i] == null ? t.data.value : s[i]; t.target = v > 0 ? this.hOf(v) : 0.01; }
  }
  focus(id, instant) {
    this.focusId = id || "all"; const c = DIST[id];
    const pos = c ? new THREE.Vector3(c[0] + 10, 34, c[1] + 40) : new THREE.Vector3(0, 70, 92), look = c ? new THREE.Vector3(c[0], 4, c[1]) : new THREE.Vector3(0, 0, 2);
    if (instant || reduce) { this.view = { pos, look }; this.from = null; this.cam.position.copy(pos); this.curLook.copy(look); return; }
    this.from = { pos: this.cam.position.clone(), look: this.curLook.clone(), t: this.clock.getElapsedTime() }; this.view = { pos, look };
    for (const l of this.labels) l.el.classList.toggle("on", l.id === id);
  }
  setScroll(p) { this.scroll = Math.max(0, Math.min(1, p)); }
  onPick(cb) { this.pickCb = cb; }
  onHover(cb) { this.hoverCb = cb; }
  pick() { if (this.hov && this.pickCb) this.pickCb({ district: this.hov.district, id: this.hov.data.id }); }
  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const t = this.clock.getElapsedTime(), dt = Math.min(0.05, Math.max(0, t - (this.lastT ?? t))); this.lastT = t;
    // camera: flight to the chosen view, a slow orbit, and the page scroll lowering it towards the streets
    let base = this.view.pos.clone(), look = this.view.look.clone();
    const orbit = reduce ? 0 : Math.sin(t * 0.07) * 0.22, rel = base.clone().sub(look);
    rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit); base = look.clone().add(rel);
    base.y -= this.scroll * (this.focusId === "all" ? 38 : 22); base.z -= this.scroll * 14; look.y += this.scroll * 6;
    if (this.from) { const k = Math.min(1, (t - this.from.t) / 1.6), e = ease(k); this.cam.position.lerpVectors(this.from.pos, base, e); this.curLook.lerpVectors(this.from.look, look, e); if (k >= 1) this.from = null; }
    else { this.cam.position.lerp(base, 0.06); this.curLook.lerp(look, 0.06); }
    this.cam.lookAt(this.curLook);
    // towers rise into place, then follow the month slider
    for (const tw of this.towers) {
      if (tw.grow < 1) tw.grow = Math.min(1, Math.max(0, (t - this.t0 - tw.delay) / 1.4));
      tw.h += (tw.target - tw.h) * 0.08;
      const H = Math.max(0.01, tw.h * ease(tw.grow));
      tw.body.scale.y = H; tw.body.position.y = H / 2; tw.lines.scale.y = H; tw.lines.position.y = H / 2; tw.roof.position.y = H + 0.17; tw.tex.repeat.y = Math.max(1, H / 3);
      if (tw.beacon) { tw.beacon.position.y = H + 0.75; tw.beacon.scale.setScalar(reduce ? 1 : 0.8 + 0.35 * Math.sin(t * 4 + tw.delay * 9)); }
      const hl = tw === this.hov; tw.lines.material.opacity = hl ? 1 : 0.55; tw.body.material.emissiveIntensity = hl ? 1.6 : 0.9;
    }
    for (const c of this.trails) { c.t = (c.t + c.v * dt * c.dir + 1) % 1; c.car.position.set(c.x1 + (c.x2 - c.x1) * c.t, 0.2, c.z1 + (c.z2 - c.z1) * c.t + (c.dir > 0 ? 0.12 : -0.12)); c.car.rotation.y = -Math.atan2(c.z2 - c.z1, c.x2 - c.x1); }
    if (!reduce) this.stars.rotation.y = t * 0.004;
    // hover
    this.ray.setFromCamera(this.mouse, this.cam);
    const hits = this.ray.intersectObjects(this.towers.map((x) => x.body), false), hov = hits.length ? this.towers.find((x) => x.body === hits[0].object) : null;
    if (hov !== this.hov) { this.hov = hov; if (this.hoverCb) this.hoverCb(hov ? { ...hov.data, district: hov.district } : null, this.px, this.py); }
    else if (hov && this.hoverCb) this.hoverCb({ ...hov.data, district: hov.district }, this.px, this.py, true);
    // labels
    const v = new THREE.Vector3();
    for (const l of this.labels) { v.copy(l.pos).project(this.cam); const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; l.el.style.opacity = vis ? "1" : "0"; l.el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, 0)`; }
    this.composer.render();
  }
}

function hasGL() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
const host = document.getElementById("city");
if (host && hasGL()) {
  try { window.City = new City(host); document.documentElement.classList.add("has3d"); }
  catch (e) { document.documentElement.classList.add("no3d"); }
} else document.documentElement.classList.add("no3d");
window.dispatchEvent(new Event("city-ready"));

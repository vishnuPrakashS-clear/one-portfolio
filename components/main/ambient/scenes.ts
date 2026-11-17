/* Ambient 3D backgrounds: five minimal candidates, each one small three.js scene behind the page. Same interface for all,
   so they can be benchmarked side by side; the app ships the winner. Each takes a page palette (three colours) and a
   mood (how much it moves) and can change both on the fly, so the scene follows the page you're on. */

import * as THREE from "three";

export interface Look {
  /** three colours, light to deep */
  colors: [string, string, string];
  dark: boolean;
  /** 0 calm … 1 lively */
  mood: number;
  /** camera height: 0 looks across the waves, 1 looks down on them */
  tilt?: number;
}
export interface Ambient {
  render(t: number): void;
  resize(w: number, h: number): void;
  setLook(l: Look): void;
  dispose(): void;
  info(): { calls: number; triangles: number; points: number; lines: number };
}
export type SceneId = "drift" | "ribbons" | "orbs" | "terrain" | "blob";

const col = (c: string) => new THREE.Color(c);

function base(canvas: HTMLCanvasElement, fov = 45) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  return {
    renderer,
    scene,
    camera,
    resize(w: number, h: number) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    info: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
    }),
  };
}
// a blended colour uniform that eases toward its target, so page changes fade instead of jumping
function easing(u: { value: THREE.Color }[], target: THREE.Color[], k = 0.04) {
  u.forEach((x, i) => x.value.lerp(target[i], k));
}

/* A — drift: a soft field of points riding slow waves. One draw call. */
export function drift(canvas: HTMLCanvasElement, look: Look): Ambient {
  const B = base(canvas, 50);
  B.camera.position.set(0, 2.4, 7);
  B.camera.lookAt(0, 0, 0);
  const N = globalThis.innerWidth < 640 ? 70 : 110,
    pos = new Float32Array(N * N * 3);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const k = (i * N + j) * 3;
      pos[k] = (i / (N - 1) - 0.5) * 22;
      pos[k + 2] = (j / (N - 1) - 0.5) * 14;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const u = {
    t: { value: 0 },
    a: { value: col(look.colors[0]) },
    b: { value: col(look.colors[1]) },
    c: { value: col(look.colors[2]) },
    amp: { value: 0.5 },
    alpha: { value: look.dark ? 0.55 : 0.42 },
    size: { value: globalThis.innerWidth < 640 ? 2.8 : 2.2 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    vertexShader: `uniform float t; uniform float amp; uniform float size; varying float h; varying float d;
      void main(){ vec3 p=position; float w=sin(p.x*.45+t*.5)*.6+sin(p.z*.6+t*.35)*.5+sin((p.x+p.z)*.25+t*.25)*.7;
      p.y=w*amp; h=w; vec4 mv=modelViewMatrix*vec4(p,1.); d=-mv.z; gl_PointSize=(size+h*.6)*(14./d); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 a; uniform vec3 b; uniform vec3 c; uniform float alpha; varying float h; varying float d;
      void main(){ vec2 q=gl_PointCoord-.5; float r=dot(q,q); if(r>.25) discard; float s=smoothstep(.25,.0,r);
      vec3 k=mix(mix(c,b,smoothstep(-1.2,.2,h)),a,smoothstep(.2,1.4,h)); gl_FragColor=vec4(k, s*alpha*smoothstep(13.,6.5,d)); }`,
  });
  B.scene.add(new THREE.Points(g, m));
  let L = look,
    camY = 2.4;
  return {
    render(t) {
      u.t.value = t;
      u.amp.value += (0.35 + L.mood * 0.45 - u.amp.value) * 0.03;
      camY += (1.4 + (L.tilt ?? 0.4) * 3 - camY) * 0.02;
      B.camera.position.y = camY;
      B.camera.lookAt(0, 0, 0);
      easing([u.a, u.b, u.c], L.colors.map(col));
      B.renderer.render(B.scene, B.camera);
    },
    resize: B.resize,
    setLook(l) {
      L = l;
      u.alpha.value = l.dark ? 0.55 : 0.42;
    },
    dispose() {
      g.dispose();
      m.dispose();
      B.renderer.dispose();
    },
    info: B.info,
  };
}

/* B — ribbons: three soft translucent ribbons folding through space. Three draw calls. */
export function ribbons(canvas: HTMLCanvasElement, look: Look): Ambient {
  const B = base(canvas, 45);
  B.camera.position.set(0, 0, 9);
  const geo = new THREE.PlaneGeometry(26, 1.6, 220, 1);
  const mats: THREE.ShaderMaterial[] = [];
  const u0 = { t: { value: 0 }, amp: { value: 1 } };
  [0, 1, 2].forEach((i) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...u0, k: { value: col(look.colors[i]) }, off: { value: i * 2.1 }, alpha: { value: look.dark ? 0.32 : 0.26 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `uniform float t; uniform float off; uniform float amp; varying float e; varying vec2 vu;
        void main(){ vec3 p=position; float x=p.x*.22; p.y+=sin(x*1.3+t*.4+off)*1.6*amp+sin(x*.7-t*.25+off)*.8;
        p.z+=cos(x*1.1+t*.3+off)*1.4*amp; float tw=sin(x*.9+t*.35+off)*1.2; p.y+=position.y*cos(tw)-position.y; p.z+=position.y*sin(tw);
        vu=uv; e=1.-abs(uv.x-.5)*2.; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform vec3 k; uniform float alpha; varying float e; varying vec2 vu;
        void main(){ float edge=smoothstep(0.,.35,vu.y)*smoothstep(1.,.65,vu.y); gl_FragColor=vec4(k, alpha*edge*smoothstep(0.,.35,e)); }`,
    });
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.y = (i - 1) * 1.6;
    mesh.rotation.z = (i - 1) * 0.12;
    B.scene.add(mesh);
  });
  let L = look;
  return {
    render(t) {
      u0.t.value = t;
      u0.amp.value += (0.6 + L.mood * 0.6 - u0.amp.value) * 0.03;
      mats.forEach((m, i) => (m.uniforms.k.value as THREE.Color).lerp(col(L.colors[i]), 0.04));
      B.renderer.render(B.scene, B.camera);
    },
    resize: B.resize,
    setLook(l) {
      L = l;
      mats.forEach((m) => (m.uniforms.alpha.value = l.dark ? 0.32 : 0.26));
    },
    dispose() {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      B.renderer.dispose();
    },
    info: B.info,
  };
}

/* C — orbs: a few glossy spheres floating slowly under soft light. Six draw calls. */
export function orbs(canvas: HTMLCanvasElement, look: Look): Ambient {
  const B = base(canvas, 40);
  B.camera.position.set(0, 0, 12);
  B.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6);
  dl.position.set(4, 6, 8);
  B.scene.add(dl);
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const spots = [
    [-5.5, 2.4, -2, 1.5],
    [5.8, 1.6, -3, 2.1],
    [-3.2, -2.6, -1, 0.9],
    [3.6, -2.8, -2, 1.2],
    [0.4, 3.4, -5, 0.8],
    [7.2, -0.4, -6, 1.0],
  ];
  const mats = spots.map(
    (_, i) =>
      new THREE.MeshPhysicalMaterial({ color: col(look.colors[i % 3]), roughness: 0.35, clearcoat: 1, transparent: true, opacity: 0.85 }),
  );
  const meshes = spots.map(([x, y, z, r], i) => {
    const m = new THREE.Mesh(geo, mats[i]);
    m.position.set(x, y, z);
    m.scale.setScalar(r);
    B.scene.add(m);
    return m;
  });
  let L = look;
  return {
    render(t) {
      meshes.forEach((m, i) => {
        const [x, y] = spots[i];
        m.position.x = x + Math.sin(t * 0.2 + i) * (0.3 + L.mood * 0.5);
        m.position.y = y + Math.cos(t * 0.25 + i * 1.7) * (0.3 + L.mood * 0.5);
        mats[i].color.lerp(col(L.colors[i % 3]), 0.04);
      });
      B.renderer.render(B.scene, B.camera);
    },
    resize: B.resize,
    setLook(l) {
      L = l;
      mats.forEach((m) => (m.opacity = l.dark ? 0.75 : 0.85));
    },
    dispose() {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      B.renderer.dispose();
    },
    info: B.info,
  };
}

/* D — terrain: a fine wireframe landscape rolling toward the horizon. One draw call. */
export function terrain(canvas: HTMLCanvasElement, look: Look): Ambient {
  const B = base(canvas, 55);
  B.camera.position.set(0, 2.2, 6);
  B.camera.lookAt(0, 0.4, -4);
  const plane = new THREE.PlaneGeometry(30, 22, 60, 44);
  plane.rotateX(-Math.PI / 2);
  const geo = new THREE.WireframeGeometry(plane);
  const u = {
    t: { value: 0 },
    amp: { value: 0.6 },
    a: { value: col(look.colors[0]) },
    c: { value: col(look.colors[2]) },
    alpha: { value: look.dark ? 0.45 : 0.35 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    vertexShader: `uniform float t; uniform float amp; varying float h; varying float d;
      void main(){ vec3 p=position; float w=sin(p.x*.35+t*.4)*.7+sin(p.z*.5-t*.6)*.6+sin((p.x-p.z)*.18+t*.2)*.8;
      p.y=w*amp; h=w; vec4 mv=modelViewMatrix*vec4(p,1.); d=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 a; uniform vec3 c; uniform float alpha; varying float h; varying float d;
      void main(){ gl_FragColor=vec4(mix(c,a,smoothstep(-1.,1.2,h)), alpha*smoothstep(20.,4.,d)); }`,
  });
  B.scene.add(new THREE.LineSegments(geo, m));
  plane.dispose();
  let L = look;
  return {
    render(t) {
      u.t.value = t;
      u.amp.value += (0.4 + L.mood * 0.5 - u.amp.value) * 0.03;
      easing([u.a, u.c], [col(L.colors[0]), col(L.colors[2])]);
      B.renderer.render(B.scene, B.camera);
    },
    resize: B.resize,
    setLook(l) {
      L = l;
      u.alpha.value = l.dark ? 0.45 : 0.35;
    },
    dispose() {
      geo.dispose();
      m.dispose();
      B.renderer.dispose();
    },
    info: B.info,
  };
}

/* E — blob: one large softly morphing shape with a gradient rim, off to the side. One draw call. */
export function blob(canvas: HTMLCanvasElement, look: Look): Ambient {
  const B = base(canvas, 40);
  B.camera.position.set(0, 0, 10);
  const geo = new THREE.IcosahedronGeometry(2.6, 24);
  const u = {
    t: { value: 0 },
    amp: { value: 0.3 },
    a: { value: col(look.colors[0]) },
    b: { value: col(look.colors[1]) },
    c: { value: col(look.colors[2]) },
    alpha: { value: look.dark ? 0.55 : 0.45 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    vertexShader: `uniform float t; uniform float amp; varying vec3 n; varying vec3 v; varying float w;
      void main(){ vec3 p=position; float k=sin(p.x*1.1+t*.5)*sin(p.y*1.3+t*.4)*sin(p.z*1.2+t*.45); w=k;
      p+=normal*k*amp*1.6; vec4 mv=modelViewMatrix*vec4(p,1.); n=normalize(normalMatrix*normal); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 a; uniform vec3 b; uniform vec3 c; uniform float alpha; varying vec3 n; varying vec3 v; varying float w;
      void main(){ float f=pow(1.-max(dot(n,v),0.),2.2); vec3 k=mix(mix(a,b,n.y*.5+.5),c,f); gl_FragColor=vec4(k, alpha*(.35+f*.65)); }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  B.scene.add(mesh);
  let L = look;
  const place = () => mesh.position.set(B.camera.aspect > 1 ? 4.2 : 1.4, B.camera.aspect > 1 ? 1.2 : 3.2, -1);
  return {
    render(t) {
      u.t.value = t;
      u.amp.value += (0.18 + L.mood * 0.2 - u.amp.value) * 0.03;
      mesh.rotation.y = t * 0.05;
      easing([u.a, u.b, u.c], L.colors.map(col));
      place();
      B.renderer.render(B.scene, B.camera);
    },
    resize: B.resize,
    setLook(l) {
      L = l;
      u.alpha.value = l.dark ? 0.55 : 0.45;
    },
    dispose() {
      geo.dispose();
      m.dispose();
      B.renderer.dispose();
    },
    info: B.info,
  };
}

export const SCENES: Record<SceneId, { name: string; make: (c: HTMLCanvasElement, l: Look) => Ambient }> = {
  drift: { name: "Drift (point waves)", make: drift },
  ribbons: { name: "Ribbons", make: ribbons },
  orbs: { name: "Glossy orbs", make: orbs },
  terrain: { name: "Wireframe terrain", make: terrain },
  blob: { name: "Morphing blob", make: blob },
};

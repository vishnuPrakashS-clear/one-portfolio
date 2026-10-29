"use client";

/* The solar system behind every screen. The sun is your total; each category is a planet whose size follows its value; each
   holding is a moon (green glow = gain, red = loss). Home shows the whole system; a category screen flies to its planet. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { AdaptiveDpr, Billboard, Html, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { CatId } from "@/constants";
import { planetFragment, planetVertex, starFragment, starVertex, sunFragment } from "./shaders";

export interface SpaceMoon {
  id: string;
  name: string;
  value: number;
  gainPct: number | null;
  series: number[] | null;
  valueText: string;
}
export interface SpacePlanet {
  id: CatId;
  name: string;
  hex: string;
  hex2: string;
  value: number;
  valueText: string;
  series: number[] | null;
  moons: SpaceMoon[];
}
export interface HoverInfo {
  name: string;
  value: string;
  gain?: number;
  x: number;
  y: number;
}
export interface SceneProps {
  planets: SpacePlanet[];
  focus: CatId | "all";
  month: number;
  scroll: number;
  reduced: boolean;
  small: boolean;
  showLabels: boolean;
  /** home shows the whole system beside the headline; other screens keep it small in the distance */
  view: "home" | "other";
  onPlanet: (id: CatId) => void;
  onMoon: (cat: CatId, id: string) => void;
  onHover: (h: HoverInfo | null) => void;
}

const ORBIT: Record<CatId, { r: number; a0: number; speed: number; tilt: number }> = {
  funds: { r: 11, a0: 0.6, speed: 0.05, tilt: 0.03 },
  stocks: { r: 18, a0: 2.5, speed: 0.034, tilt: -0.04 },
  bonds: { r: 25, a0: 4.2, speed: 0.024, tilt: 0.05 },
  abroad: { r: 32, a0: 5.6, speed: 0.017, tilt: -0.03 },
};
const SUN_R = 2.6;
/** a small seeded generator, so the sky is the same on every render */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const up = new THREE.Vector3(0, 1, 0);

/** shared simulation clock, slowed while a planet is in focus and stopped for reduced motion */
function useSimClock(focus: CatId | "all", reduced: boolean) {
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!reduced) t.current += Math.min(dt, 0.05) * (focus === "all" ? 1 : 0.18);
  });
  return t;
}

function Stars({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null),
    mat = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const r = rng(7),
      pos = new Float32Array(count * 3),
      size = new Float32Array(count),
      phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const d = 90 + r() * 300,
        u = r() * 2 - 1,
        th = r() * Math.PI * 2,
        sq = Math.sqrt(1 - u * u);
      pos.set([d * sq * Math.cos(th), d * u, d * sq * Math.sin(th)], i * 3);
      size[i] = 0.5 + Math.pow(r(), 3) * 2.4;
      phase[i] = r() * 6.283;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    g.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
    return g;
  }, [count]);
  const uniforms = useMemo(() => ({ t: { value: 0 }, px: { value: 1 } }), []);
  useFrame((state, dt) => {
    if (mat.current) {
      mat.current.uniforms.t.value += dt;
      mat.current.uniforms.px.value = Math.min(2, state.viewport.dpr);
    }
    if (ref.current) {
      ref.current.rotation.x -= dt / 220;
      ref.current.rotation.y -= dt / 300;
    }
  });
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <points ref={ref} geometry={geo} frustumCulled={false}>
        <shaderMaterial
          ref={mat}
          vertexShader={starVertex}
          fragmentShader={starFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

/** the nebula is painted once into a small panorama texture (cheap on phones) rather than computed per pixel each frame */
function nebulaTexture() {
  const W = 1024,
    H = 512,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#030014";
  g.fillRect(0, 0, W, H);
  const r = rng(11),
    cols = ["82,32,158", "13,76,107", "128,20,72", "60,24,120", "20,90,120"];
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 46; i++) {
    const x = r() * W,
      y = H * (0.18 + r() * 0.64),
      rad = 60 + r() * 260,
      a = 0.05 + r() * 0.12,
      col = cols[Math.floor(r() * cols.length)];
    for (const dx of [-W, 0, W]) {
      // wrap around the seam
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      gr.addColorStop(0, `rgba(${col},${a})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function Nebula() {
  const tex = useMemo(() => nebulaTexture(), []);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!tex) return null;
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[420, 48, 32]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const GLOW_V = "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";
const GLOW_F =
  "varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.4); gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a * 1.4, a); }";
function Sun({ total }: { total: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null),
    ref = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({ t: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (mat.current) mat.current.uniforms.t.value += dt;
    if (ref.current) ref.current.rotation.y += dt * 0.05;
  });
  const s = total > 0 ? 1 + Math.min(0.35, Math.log10(1 + total / 1e5) * 0.12) : 1;
  return (
    <group scale={s}>
      <pointLight intensity={2.2} distance={0} decay={0} color="#ffd9a8" />
      <mesh ref={ref}>
        <sphereGeometry args={[SUN_R, 64, 48]} />
        <shaderMaterial ref={mat} vertexShader={planetVertex} fragmentShader={sunFragment} uniforms={uniforms} toneMapped={false} />
      </mesh>
      <Billboard>
        <mesh>
          <planeGeometry args={[SUN_R * 7, SUN_R * 7]} />
          <shaderMaterial
            vertexShader={GLOW_V}
            fragmentShader={GLOW_F}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

function OrbitRing({ r, hex, active }: { r: number; hex: string; active: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2}>
      <ringGeometry args={[r - 0.025, r + 0.025, 160]} />
      <meshBasicMaterial color={hex} transparent opacity={active ? 0.55 : 0.2} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

const moonGeo = new THREE.SphereGeometry(1, 18, 14);

function Planet({
  p,
  maxValue,
  clock,
  report,
  focus,
  month,
  showLabels,
  onPlanet,
  onMoon,
  onHover,
  seed,
}: {
  p: SpacePlanet;
  maxValue: number;
  clock: React.RefObject<number>;
  report: (id: CatId, pos: THREE.Vector3, r: number) => void;
  focus: CatId | "all";
  month: number;
  showLabels: boolean;
  seed: number;
  onPlanet: SceneProps["onPlanet"];
  onMoon: SceneProps["onMoon"];
  onHover: SceneProps["onHover"];
}) {
  const o = ORBIT[p.id];
  const group = useRef<THREE.Group>(null),
    body = useRef<THREE.Mesh>(null),
    moons = useRef<THREE.InstancedMesh>(null),
    mat = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const uniforms = useMemo(
    () => ({
      c1: { value: new THREE.Color(p.hex) },
      c2: { value: new THREE.Color(p.hex2) },
      t: { value: 0 },
      seed: { value: seed },
      glow: { value: 0.9 },
    }),
    [p.hex, p.hex2, seed],
  );
  const baseR = p.value > 0 ? 0.9 + 2.3 * Math.sqrt(p.value / maxValue) : 0.9;
  const moonsData = useMemo(() => {
    const vmax = Math.max(1, ...p.moons.map((m) => m.value));
    return p.moons.slice(0, 80).map((m, k) => {
      const shell = k % 3,
        gain = m.gainPct;
      const c =
        gain == null
          ? new THREE.Color("#cbd5e1").lerp(new THREE.Color(p.hex), 0.35)
          : gain > 0.02
            ? new THREE.Color("#34d399")
            : gain < -0.02
              ? new THREE.Color("#f87171")
              : new THREE.Color("#e2e8f0");
      return {
        m,
        shell,
        size: 0.07 + 0.3 * Math.sqrt(m.value / vmax),
        a0: (k * 2.399) % 6.283,
        speed: 0.35 - shell * 0.08 + (k % 7) * 0.012,
        incl: (shell - 1) * 0.35 + (k % 5) * 0.05,
        rr: 0.9 + shell * 0.7 + (k % 4) * 0.12,
        color: c.multiplyScalar(1.25),
      };
    });
  }, [p.moons, p.hex]);
  useEffect(() => {
    const im = moons.current;
    if (!im) return;
    moonsData.forEach((d, i) => im.setColorAt(i, d.color));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [moonsData]);
  useFrame((_, dt) => {
    const t = clock.current ?? 0,
      a = o.a0 + t * o.speed,
      tmp = new THREE.Object3D();
    const ratio = month >= 0 && p.series && p.value > 0 ? Math.max(0.05, p.series[month] / p.value) : 1;
    const R = baseR * (0.55 + 0.45 * Math.sqrt(ratio));
    const u = mat.current?.uniforms;
    if (u) {
      u.t.value += dt;
      u.glow.value = THREE.MathUtils.lerp(u.glow.value, hovered || focus === p.id ? 1.6 : 0.9, 0.08);
    }
    if (group.current) {
      group.current.position.set(Math.cos(a) * o.r, Math.sin(a * 2) * o.tilt * o.r, Math.sin(a) * o.r);
      report(p.id, group.current.position, R);
    }
    if (body.current) {
      body.current.scale.setScalar(R);
      body.current.rotation.y += dt * 0.12;
    }
    const im = moons.current;
    if (im) {
      moonsData.forEach((d, i) => {
        const r2 = month >= 0 && d.m.series && d.m.value > 0 ? Math.max(0, d.m.series[month] / d.m.value) : 1;
        const ang = d.a0 + t * d.speed * 4,
          rad = R + d.rr;
        tmp.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * Math.sin(d.incl), Math.sin(ang) * rad * Math.cos(d.incl));
        tmp.scale.setScalar(d.size * (r2 > 0 ? 0.4 + 0.6 * Math.sqrt(r2) : 0.001));
        tmp.updateMatrix();
        im.setMatrixAt(i, tmp.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });
  const moonEvent = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const d = e.instanceId != null ? moonsData[e.instanceId] : null;
    if (!d) return;
    document.body.style.cursor = "pointer";
    onHover({ name: d.m.name, value: d.m.valueText, gain: d.m.gainPct ?? undefined, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  return (
    <group ref={group}>
      <mesh
        ref={body}
        onClick={(e) => {
          e.stopPropagation();
          onPlanet(p.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
          onHover({ name: p.name, value: p.valueText, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
          onHover(null);
        }}
      >
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial ref={mat} vertexShader={planetVertex} fragmentShader={planetFragment} uniforms={uniforms} />
      </mesh>
      {p.id === "bonds" && (
        <mesh rotation={[-Math.PI / 2 + 0.42, 0, 0.2]} scale={baseR}>
          <ringGeometry args={[1.45, 2.15, 96]} />
          <meshBasicMaterial color={p.hex} transparent opacity={0.32} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
      {moonsData.length > 0 && (
        <instancedMesh
          ref={moons}
          args={[moonGeo, undefined, moonsData.length]}
          frustumCulled={false}
          onPointerMove={moonEvent}
          onPointerOut={() => {
            document.body.style.cursor = "";
            onHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            const d = e.instanceId != null ? moonsData[e.instanceId] : null;
            if (d) onMoon(p.id, d.m.id);
          }}
        >
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
      {showLabels && (
        <Html position={[0, baseR + 1.5, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "auto" }}>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onPlanet(p.id)}
            className="grid cursor-pointer justify-items-center gap-0.5 rounded-xl bg-[rgb(8_5_24/0.72)] px-3 py-1.5 text-center whitespace-nowrap backdrop-blur"
            style={{ boxShadow: `inset 0 0 0 1px ${p.hex}aa, 0 0 24px -6px ${p.hex}` }}
          >
            <b className="text-[12px] font-semibold" style={{ color: p.hex }}>
              {p.name}
            </b>
            <span className="num font-display text-[14px] font-bold text-white">{p.valueText}</span>
          </button>
        </Html>
      )}
    </group>
  );
}

function CameraRig({
  focus,
  scroll,
  small,
  view,
  positions,
}: {
  focus: CatId | "all";
  scroll: number;
  small: boolean;
  view: "home" | "other";
  positions: React.RefObject<Partial<Record<CatId, { pos: THREE.Vector3; r: number }>>>;
}) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 0)),
    want = useRef(new THREE.Vector3()),
    look = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.5) * 3.2); // settles in about a second whatever the frame rate
    const f = focus !== "all" ? positions.current[focus] : undefined;
    if (f) {
      // from above the orbit plane, a little outside the planet: neighbours stay small in the distance
      const P = f.pos,
        d = new THREE.Vector3(P.x, 0, P.z).normalize(),
        R = f.r;
      want.current
        .copy(P)
        .addScaledVector(d, R * 2.8 + 6)
        .addScaledVector(up, R * 2.6 + 7.5);
      const fwd = P.clone().sub(want.current).normalize(),
        right = new THREE.Vector3().crossVectors(fwd, up).normalize();
      look.current.copy(P);
      // keep the planet clear of the text: to the right on wide screens, near the top on phones
      if (small) look.current.addScaledVector(d, R * 2.4);
      else look.current.addScaledVector(right, -R * 2.3).addScaledVector(d, R * 1.9);
    } else if (view === "other") {
      // phones: pulled further back and aimed below the sun, so the system sits small above the page heading, not behind it
      want.current.set(small ? 0 : -34, small ? 130 : 70, small ? 170 : 118);
      look.current.set(small ? 0 : -40, small ? -104 : -30, 0);
    } else {
      const p = Math.min(1, Math.max(0, scroll));
      const x = small ? 0 : -13;
      want.current.set(x * (1 - p * 0.4), THREE.MathUtils.lerp(small ? 58 : 34, 12, p), THREE.MathUtils.lerp(small ? 80 : 62, 46, p));
      look.current.set(x * (1 - p * 0.4), small ? -9 : -3, 0);
    }
    camera.position.lerp(want.current, k);
    target.current.lerp(look.current, k);
    camera.lookAt(target.current);
  });
  return null;
}

function System(props: SceneProps) {
  const { planets, focus, month, scroll, reduced, small, showLabels } = props;
  const clock = useSimClock(focus, reduced);
  const positions = useRef<Partial<Record<CatId, { pos: THREE.Vector3; r: number }>>>({});
  const report = useCallback((id: CatId, pos: THREE.Vector3, r: number) => {
    positions.current[id] = { pos: pos.clone(), r };
  }, []);
  const maxValue = Math.max(1, ...planets.map((p) => p.value));
  const total = planets.reduce((a, p) => a + p.value, 0);
  return (
    <>
      <color attach="background" args={["#030014"]} />
      <ambientLight intensity={0.08} />
      <Nebula />
      <Stars count={small ? 2600 : 6500} />
      <Sun total={total} />
      {planets.map((p) => (
        <OrbitRing key={p.id + "o"} r={ORBIT[p.id].r} hex={p.hex} active={focus === p.id} />
      ))}
      {planets.map((p, i) => (
        <Planet
          key={p.id}
          p={p}
          seed={i * 3.7 + 1.3}
          maxValue={maxValue}
          clock={clock}
          report={report}
          focus={focus}
          month={month}
          showLabels={showLabels && focus === "all"}
          onPlanet={props.onPlanet}
          onMoon={props.onMoon}
          onHover={props.onHover}
        />
      ))}
      <CameraRig focus={focus} scroll={scroll} small={small} view={props.view} positions={positions} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={small ? 0.85 : 1.05} luminanceThreshold={0.22} luminanceSmoothing={0.25} resolutionScale={0.5} />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </>
  );
}

export default function SpaceScene(props: SceneProps) {
  const [dpr, setDpr] = useState(props.small ? 1.5 : 1.75);
  return (
    <Canvas
      camera={{ position: [-13, 34, 62], fov: 50, near: 0.1, far: 1200 }}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => props.onHover(null)}
    >
      {/* slower devices drop resolution instead of frames */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(props.small ? 1.5 : 1.75)} />
      <AdaptiveDpr pixelated={false} />
      <System {...props} />
    </Canvas>
  );
}

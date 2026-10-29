"use client";

/* The 3D heroes, drawn with React Three Fiber. Every screen gets its own scene about what that screen is for, built from
   your numbers: a dashboard (Home), a 3D bar chart (Mutual funds), a growth line (Stocks), coin stacks of coming payouts
   (Bonds), a globe with pins (Abroad), a staircase to a flag (Goals), a donut of the split (Plan), a calendar and hourglass
   (Tax), a clipboard (Checklist), chat bubbles (Ask) and a folder of statements (Upload).
   They share one stage: a glowing disc behind, a round podium below, soft lights, a gentle pull towards the pointer.
   Cheap on purpose: a few dozen meshes, no post-processing, and the scene only animates while it's on screen and the
   page isn't being scrolled. */

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import {
  drawBubble,
  drawCard,
  drawDisc,
  drawDoc,
  drawLabel,
  drawList,
  drawPhone,
  drawScreen,
  type CardSpec,
  type DashData,
} from "./textures";

type Acc = [string, string];
export interface Label {
  kicker: string;
  value: string;
  sub?: string;
  color?: string;
}
export type ArtData =
  | { scene: "dash"; accent: Acc; dash: DashData }
  | { scene: "bars"; accent: Acc; values: number[]; label: Label; coin: Label }
  | { scene: "line"; accent: Acc; values: number[]; tiles: Label[] }
  | { scene: "coins"; accent: Acc; stacks: number[]; label: Label; cal: { ym: string; marks: number[] } }
  | { scene: "globe"; accent: Acc; pins: { lat: number; lon: number; share: number; color: string }[]; label: Label }
  | { scene: "stairs"; accent: Acc; progress: number; label: Label }
  | { scene: "donut"; accent: Acc; parts: { color: string; share: number; fill: number }[]; label: Label }
  | { scene: "tax"; accent: Acc; cal: { ym: string; marks: number[] }; label: Label }
  | { scene: "list"; accent: Acc; rows: { text: string; done: boolean }[]; label: Label }
  | { scene: "chat"; accent: Acc; q: string; a: string }
  | { scene: "folder"; accent: Acc; docs: { ext: string; name: string; color: string }[] };

/* ---------- textures and materials ---------- */

type TexSpec =
  | { t: "label"; l: Label; a: Acc }
  | { t: "card"; c: CardSpec; a: Acc }
  | { t: "doc"; d: { ext: string; name: string; color: string } }
  | { t: "list"; rows: { text: string; done: boolean }[]; a: Acc }
  | { t: "bubble"; text: string; mine: boolean; a: Acc }
  | { t: "disc"; a: Acc }
  | { t: "screen"; d: DashData }
  | { t: "phone"; d: DashData };

function paint(s: TexSpec): HTMLCanvasElement {
  switch (s.t) {
    case "label":
      return drawLabel(s.l, s.a);
    case "card":
      return drawCard(s.c, s.a);
    case "doc":
      return drawDoc(s.d);
    case "list":
      return drawList(s.rows, s.a);
    case "bubble":
      return drawBubble(s.text, s.mine, s.a);
    case "disc":
      return drawDisc(s.a);
    case "screen":
      return drawScreen(s.d);
    case "phone":
      return drawPhone(s.d);
  }
}
/** a canvas texture for a spec, rebuilt only when the spec's content changes */
function useTex(spec: TexSpec) {
  const key = JSON.stringify(spec);
  const t = useMemo(() => {
    const x = new THREE.CanvasTexture(paint(JSON.parse(key) as TexSpec));
    x.colorSpace = THREE.SRGBColorSpace;
    x.anisotropy = 4;
    return x;
  }, [key]);
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

const MATS = new Map<string, THREE.Material>();
/** shared materials: dark device bodies, the podium, glossy colours, glowing accents and grid lines */
function mat(kind: "body" | "podium" | "glossy" | "glow" | "wire" | "paper", color = "#000000"): THREE.Material {
  const k = kind + color;
  let m = MATS.get(k);
  if (!m) {
    m =
      kind === "body"
        ? new THREE.MeshStandardMaterial({ color: "#0f1311", roughness: 0.38, metalness: 0.35 })
        : kind === "podium"
          ? new THREE.MeshStandardMaterial({ color: "#1d2320", roughness: 0.55, metalness: 0.2 })
          : kind === "glossy"
            ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 })
            : kind === "glow"
              ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 })
              : kind === "paper"
                ? new THREE.MeshStandardMaterial({ color: "#e9ede7", roughness: 0.7 })
                : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 });
    MATS.set(k, m);
  }
  return m;
}

/* ---------- shared pieces ---------- */

function Face({ spec, w, h, z }: { spec: TexSpec; w: number; h: number; z: number }) {
  const map = useTex(spec);
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}
/** a dark panel with a picture on its face, floating gently */
function Panel({
  spec,
  w,
  h,
  pos,
  rot = 0,
  speed = 1.6,
  still,
}: {
  spec: TexSpec;
  w: number;
  h: number;
  pos: [number, number, number];
  rot?: number;
  speed?: number;
  still?: boolean;
}) {
  const body = (
    <group position={pos} rotation={[0, rot, 0]}>
      <RoundedBox args={[w + 0.08, h + 0.08, 0.06]} radius={0.05} smoothness={3} material={mat("body")} />
      <Face spec={spec} w={w} h={h} z={0.032} />
    </group>
  );
  return still ? (
    body
  ) : (
    <Float speed={speed} rotationIntensity={0.25} floatIntensity={0.9} floatingRange={[-0.07, 0.07]}>
      {body}
    </Float>
  );
}
function Disc({ a }: { a: Acc }) {
  const map = useTex({ t: "disc", a });
  return (
    <mesh position={[0.35, 0.3, -1.4]}>
      <circleGeometry args={[2.55, 96]} />
      <meshBasicMaterial map={map} toneMapped={false} transparent />
    </mesh>
  );
}
function Podium({ a }: { a: Acc }) {
  return (
    <group position={[0.1, -2.05, 0.2]}>
      <mesh material={mat("podium")}>
        <cylinderGeometry args={[2.15, 2.3, 0.24, 96]} />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat("glow", a[1])}>
        <torusGeometry args={[2.16, 0.022, 12, 128]} />
      </mesh>
      <mesh position={[0, -0.28, 0]} material={mat("podium")}>
        <cylinderGeometry args={[2.6, 2.7, 0.14, 96]} />
      </mesh>
    </group>
  );
}
const TOP = -1.93; // the podium's top surface

function Rig({ children, animate }: { children: ReactNode; animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (!g.current || !animate) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3);
    g.current.rotation.y += (-0.16 + st.pointer.x * 0.18 - g.current.rotation.y) * k;
    g.current.rotation.x += (0.06 - st.pointer.y * 0.08 - g.current.rotation.x) * k;
  });
  return (
    <group ref={g} rotation={[0.06, -0.16, 0]} position={[0, 0.22, 0]} scale={0.93}>
      {children}
    </group>
  );
}
function Spin({ children, speed, animate }: { children: ReactNode; speed: number; animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current && animate) g.current.rotation.y += Math.min(dt, 0.1) * speed;
  });
  return <group ref={g}>{children}</group>;
}

/* ---------- the scenes ---------- */

function Dash({ d }: { d: DashData }) {
  const a = d.accent;
  return (
    <>
      <group position={[-0.15, 0.22, 0]}>
        <RoundedBox args={[3.6, 2.3, 0.14]} radius={0.07} smoothness={3} material={mat("body")} />
        <Face spec={{ t: "screen", d }} w={3.44} h={2.15} z={0.072} />
        <mesh position={[0, -1.42, -0.05]} material={mat("body")}>
          <boxGeometry args={[0.32, 0.55, 0.1]} />
        </mesh>
        <RoundedBox args={[1.3, 0.08, 0.62]} radius={0.03} position={[0, -1.72, 0.05]} material={mat("body")} />
      </group>
      <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.5} floatingRange={[-0.05, 0.05]}>
        <group position={[2.05, -0.55, 0.75]} rotation={[0, -0.35, 0]}>
          <RoundedBox args={[1.02, 2.0, 0.1]} radius={0.12} smoothness={4} material={mat("body")} />
          <Face spec={{ t: "phone", d }} w={0.9} h={1.82} z={0.052} />
        </group>
      </Float>
      <Panel spec={{ t: "card", c: d.cards[0], a }} w={1.3} h={0.86} pos={[-2.35, 0.95, 0.85]} rot={0.28} />
      <Panel spec={{ t: "card", c: d.cards[1], a }} w={1.3} h={0.86} pos={[-1.95, -0.85, 1.1]} rot={0.22} speed={1.3} />
      <Panel spec={{ t: "card", c: d.cards[2], a }} w={1.3} h={0.86} pos={[1.7, 1.5, 0.55]} rot={-0.2} speed={1.9} />
      {[0.85, 0.35, -0.15].map((y, i) => (
        <Float key={i} speed={2 + i * 0.3} floatIntensity={0.6} rotationIntensity={0.4}>
          <RoundedBox args={[0.3, 0.3, 0.1]} radius={0.06} position={[3.05, y, 0.4]} material={mat("glow", a[1])} />
        </Float>
      ))}
    </>
  );
}

/** Mutual funds: twelve month-end values as 3D bars, this month glowing */
function Bars({ values, label, coin, a }: { values: number[]; label: Label; coin: Label; a: Acc }) {
  const max = Math.max(1, ...values),
    n = values.length;
  return (
    <>
      {values.map((v, i) => {
        const h = 0.25 + 2.7 * (v / max),
          x = -2.05 + (i * 4.1) / Math.max(1, n - 1);
        return (
          <RoundedBox
            key={i}
            args={[0.27, h, 0.34]}
            radius={0.05}
            smoothness={3}
            position={[x, TOP + h / 2, 0.35]}
            material={
              i === n - 1
                ? mat("glow", a[1])
                : mat("glossy", "#" + new THREE.Color("#39413c").lerp(new THREE.Color(a[1]), 0.25 + (0.75 * i) / n).getHexString())
            }
          />
        );
      })}
      <Panel spec={{ t: "label", l: label, a }} w={1.6} h={0.94} pos={[-1.75, 1.45, 1.0]} rot={0.25} />
      <Float speed={2.2} rotationIntensity={1.2} floatIntensity={1}>
        <group position={[2.25, 1.55, 0.6]} rotation={[Math.PI / 2.4, 0, 0.3]}>
          <mesh material={mat("glossy", "#fbbf24")}>
            <cylinderGeometry args={[0.42, 0.42, 0.1, 48]} />
          </mesh>
        </group>
      </Float>
      <Panel spec={{ t: "label", l: coin, a }} w={1.3} h={0.76} pos={[2.15, 0.45, 1.0]} rot={-0.25} speed={1.3} />
    </>
  );
}

/** Stocks: the 12-month line as a glowing tube, with the biggest holdings as tiles */
function Line({ values, tiles, a }: { values: number[]; tiles: Label[]; a: Acc }) {
  const key = values.join(",");
  const geo = useMemo(() => {
    const vs = key.split(",").map(Number),
      lo = Math.min(...vs),
      hi = Math.max(...vs),
      span = hi - lo || 1;
    const pts = vs.map((v, i) => new THREE.Vector3(-2.3 + (i * 4.6) / Math.max(1, vs.length - 1), -1.25 + (2.4 * (v - lo)) / span, 0.3));
    return { tube: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.075, 14), pts };
  }, [key]);
  useEffect(() => () => geo.tube.dispose(), [geo]);
  const last = geo.pts[geo.pts.length - 1];
  return (
    <>
      <mesh geometry={geo.tube} material={mat("glow", a[1])} />
      {geo.pts.map((p, i) => (
        <mesh key={i} position={[p.x, (TOP + p.y) / 2, p.z - 0.05]} material={mat("glossy", "#46514b")}>
          <boxGeometry args={[0.03, p.y - TOP, 0.03]} />
        </mesh>
      ))}
      <mesh position={last} material={mat("glossy", a[0])}>
        <sphereGeometry args={[0.2, 32, 24]} />
      </mesh>
      {tiles.slice(0, 3).map((l, i) => (
        <Panel
          key={i}
          spec={{ t: "label", l, a }}
          w={1.45}
          h={0.85}
          pos={
            (
              [
                [-2.15, 1.5, 0.9],
                [0.05, 1.95, 0.5],
                [2.25, 0.95, 1.0],
              ] as [number, number, number][]
            )[i]
          }
          rot={[0.25, 0, -0.25][i]}
          speed={1.4 + i * 0.3}
        />
      ))}
    </>
  );
}

/** Bonds: a stack of coins for each coming month's payouts, and the payout calendar */
function Coins({ stacks, label, cal, a }: { stacks: number[]; label: Label; cal: { ym: string; marks: number[] }; a: Acc }) {
  const max = Math.max(1, ...stacks);
  return (
    <>
      {stacks.slice(0, 6).map((v, i) => {
        const n = Math.max(1, Math.round(2 + (10 * v) / max)),
          x = -2.0 + i * 0.82,
          z = i % 2 ? -0.1 : 0.45;
        return (
          <group key={i} position={[x, TOP, z]}>
            {Array.from({ length: n }, (_, k) => (
              <mesh
                key={k}
                position={[Math.sin(k * 1.7) * 0.03, 0.07 + k * 0.135, Math.cos(k * 1.3) * 0.03]}
                material={k === n - 1 && i === 0 ? mat("glow", a[1]) : mat("glossy", k % 2 ? a[1] : a[0])}
              >
                <cylinderGeometry args={[0.38, 0.38, 0.12, 40]} />
              </mesh>
            ))}
          </group>
        );
      })}
      <Panel spec={{ t: "card", c: { kind: "calendar", ...cal }, a }} w={1.5} h={1.0} pos={[1.85, 1.45, 0.7]} rot={-0.22} />
      <Panel spec={{ t: "label", l: label, a }} w={1.6} h={0.94} pos={[-1.8, 1.45, 0.95]} rot={0.25} speed={1.3} />
    </>
  );
}

function ll(lat: number, lon: number, r: number) {
  const phi = ((90 - lat) * Math.PI) / 180,
    th = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
/** Abroad: a globe with a pin on each market, sized by how much is there */
function Globe({
  pins,
  label,
  a,
  animate,
}: {
  pins: { lat: number; lon: number; share: number; color: string }[];
  label: Label;
  a: Acc;
  animate: boolean;
}) {
  return (
    <>
      <group position={[0, 0.15, 0]}>
        <Spin speed={0.22} animate={animate}>
          <group rotation={[0.35, 0.6, 0]}>
            <mesh material={mat("glossy", "#2f5fa8")}>
              <sphereGeometry args={[1.5, 64, 48]} />
            </mesh>
            {[-60, -30, 0, 30, 60].map((lat) => (
              <mesh
                key={"la" + lat}
                position={[0, 1.515 * Math.sin((lat * Math.PI) / 180), 0]}
                rotation={[Math.PI / 2, 0, 0]}
                material={mat("wire", "#dbeafe")}
              >
                <torusGeometry args={[1.515 * Math.cos((lat * Math.PI) / 180), 0.008, 6, 96]} />
              </mesh>
            ))}
            {[0, 30, 60, 90, 120, 150].map((lon) => (
              <mesh key={"lo" + lon} rotation={[0, (lon * Math.PI) / 180, 0]} material={mat("wire", "#dbeafe")}>
                <torusGeometry args={[1.515, 0.008, 6, 128]} />
              </mesh>
            ))}
            {pins.map((p, i) => {
              const s = 0.12 + 0.22 * Math.sqrt(p.share),
                at = ll(p.lat, p.lon, 1.5 + s * 0.9),
                base = ll(p.lat, p.lon, 1.5);
              return (
                <group key={i}>
                  <mesh position={at} material={mat("glow", p.color)}>
                    <sphereGeometry args={[s, 32, 24]} />
                  </mesh>
                  <mesh
                    position={base.clone().lerp(at, 0.5)}
                    material={mat("glossy", "#e5e7eb")}
                    quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize())}
                  >
                    <cylinderGeometry args={[0.02, 0.02, at.distanceTo(base), 8]} />
                  </mesh>
                </group>
              );
            })}
          </group>
        </Spin>
        <mesh rotation={[1.25, 0.2, 0]} material={mat("glow", a[1])}>
          <torusGeometry args={[2.05, 0.014, 8, 160]} />
        </mesh>
      </group>
      <Panel spec={{ t: "label", l: label, a }} w={1.6} h={0.94} pos={[-2.05, 1.5, 1.0]} rot={0.25} />
    </>
  );
}

/** Goals: a staircase to the goal's flag, lit as far as your likely path gets you */
function Stairs({ progress, label, a, animate }: { progress: number; label: Label; a: Acc; animate: boolean }) {
  const N = 7,
    lit = Math.max(1, Math.min(N, Math.round(progress * N)));
  const flag = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    if (flag.current && animate) flag.current.rotation.y = Math.sin(st.clock.elapsedTime * 2.2) * 0.25;
  });
  const top = TOP + N * 0.36,
    fx = -1.95 + (N - 1) * 0.62;
  return (
    <>
      {Array.from({ length: N }, (_, i) => {
        const h = (i + 1) * 0.36;
        return (
          <RoundedBox
            key={i}
            args={[0.6, h, 1.1]}
            radius={0.04}
            smoothness={3}
            position={[-1.95 + i * 0.62, TOP + h / 2, 0.25]}
            material={i < lit ? mat("glossy", i === lit - 1 ? a[1] : a[0]) : mat("glossy", "#2c3430")}
          />
        );
      })}
      <mesh position={[-1.95 + (lit - 1) * 0.62, TOP + lit * 0.36 + 0.2, 0.45]} material={mat("glossy", "#f3f6f1")}>
        <sphereGeometry args={[0.2, 32, 24]} />
      </mesh>
      <mesh position={[fx, top + 0.6, 0.25]} material={mat("glossy", "#e5e7eb")}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 12]} />
      </mesh>
      <mesh ref={flag} position={[fx + 0.02, top + 1.0, 0.25]} material={mat("glow", a[1])}>
        <boxGeometry args={[0.6, 0.36, 0.02]} />
      </mesh>
      <Panel spec={{ t: "label", l: label, a }} w={1.6} h={0.94} pos={[-1.75, 1.35, 1.05]} rot={0.25} />
    </>
  );
}

function Sector({ a0, a1, depth, color }: { a0: number; a1: number; depth: number; color: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 1.75, a0, a1, false);
    s.absarc(0, 0, 0.95, a1, a0, true);
    return new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 2,
      curveSegments: 32,
    });
  }, [a0, a1, depth]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat("glossy", color)} />;
}
/** Monthly plan: the abroad split as a 3D donut, each slice raised by how full it is against its target */
function Donut({ parts, label, a }: { parts: { color: string; share: number; fill: number }[]; label: Label; a: Acc }) {
  const tot = parts.reduce((x, p) => x + p.share, 0) || 1;
  const starts = parts.map((_, i) => Math.PI / 2 + (parts.slice(0, i).reduce((x, p) => x + p.share, 0) / tot) * Math.PI * 2);
  return (
    <>
      <group position={[0.35, -0.55, 0.3]} rotation={[-Math.PI / 2 + 0.62, 0, 0.4]}>
        {parts.map((p, i) => {
          const da = (p.share / tot) * Math.PI * 2;
          return (
            <Sector
              key={i}
              a0={starts[i] + 0.03}
              a1={starts[i] + da - 0.03}
              depth={0.2 + 0.7 * Math.max(0.1, Math.min(1.2, p.fill))}
              color={p.color}
            />
          );
        })}
      </group>
      <Panel spec={{ t: "label", l: label, a }} w={1.7} h={1.0} pos={[-1.7, 1.3, 1.0]} rot={0.25} />
    </>
  );
}

/** Sell & tax: the long-term date's month as a calendar block, an hourglass and the saving */
function Tax({ cal, label, a, animate }: { cal: { ym: string; marks: number[] }; label: Label; a: Acc; animate: boolean }) {
  return (
    <>
      <group position={[-0.25, -0.35, 0]} rotation={[0, 0.12, 0]}>
        <RoundedBox args={[2.5, 1.75, 0.35]} radius={0.08} smoothness={3} material={mat("body")} />
        <Face spec={{ t: "card", c: { kind: "calendar", ...cal }, a }} w={2.3} h={1.55} z={0.18} />
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, 0.95, 0.05]} material={mat("glow", a[1])}>
            <cylinderGeometry args={[0.07, 0.07, 0.35, 16]} />
          </mesh>
        ))}
      </group>
      <group position={[2.15, -0.6, 0.6]}>
        <Spin speed={0.5} animate={animate}>
          {[0.62, -0.62].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={mat("glossy", "#cbd5e1")}>
              <cylinderGeometry args={[0.42, 0.42, 0.08, 40]} />
            </mesh>
          ))}
          <mesh position={[0, 0.3, 0]} rotation={[Math.PI, 0, 0]} material={mat("glossy", a[0])}>
            <coneGeometry args={[0.36, 0.55, 40]} />
          </mesh>
          <mesh position={[0, -0.3, 0]} material={mat("glossy", a[1])}>
            <coneGeometry args={[0.36, 0.55, 40]} />
          </mesh>
          {[0, 2.1, 4.2].map((t) => (
            <mesh key={t} position={[Math.cos(t) * 0.4, 0, Math.sin(t) * 0.4]} material={mat("glossy", "#94a3b8")}>
              <cylinderGeometry args={[0.025, 0.025, 1.2, 8]} />
            </mesh>
          ))}
        </Spin>
      </group>
      <Panel spec={{ t: "label", l: label, a }} w={1.6} h={0.94} pos={[-2.0, 1.45, 1.0]} rot={0.25} />
    </>
  );
}

/** Checklist: a clipboard with this year's jobs */
function Clipboard({ rows, label, a }: { rows: { text: string; done: boolean }[]; label: Label; a: Acc }) {
  return (
    <>
      <group position={[0.1, 0.05, 0]} rotation={[0, -0.1, 0.04]}>
        <RoundedBox args={[2.3, 3.0, 0.1]} radius={0.1} smoothness={3} material={mat("glossy", "#3b2f22")} />
        <Face spec={{ t: "list", rows, a }} w={2.0} h={2.65} z={0.056} />
        <RoundedBox args={[0.9, 0.3, 0.16]} radius={0.06} smoothness={3} position={[0, 1.5, 0.05]} material={mat("glossy", "#cbd5e1")} />
      </group>
      <Panel spec={{ t: "label", l: label, a }} w={1.5} h={0.88} pos={[2.15, 1.2, 0.9]} rot={-0.25} />
      <Float speed={2} floatIntensity={0.8}>
        <mesh position={[-2.1, 1.0, 0.8]} material={mat("glow", a[1])}>
          <torusGeometry args={[0.32, 0.09, 16, 48]} />
        </mesh>
      </Float>
    </>
  );
}

/** Ask: your question and the helper's answer as chat bubbles */
function Chat({ q, ans, a }: { q: string; ans: string; a: Acc }) {
  return (
    <>
      <Float speed={1.4} floatIntensity={0.7} rotationIntensity={0.15}>
        <group position={[0.6, 0.95, 0.5]} rotation={[0, -0.18, 0]}>
          <RoundedBox args={[3.0, 1.2, 0.16]} radius={0.12} smoothness={4} material={mat("body")} />
          <Face spec={{ t: "bubble", text: q, mine: true, a }} w={2.8} h={1.04} z={0.082} />
          <mesh position={[1.2, -0.68, 0]} rotation={[0, 0, Math.PI]} material={mat("glow", a[1])}>
            <coneGeometry args={[0.16, 0.3, 3]} />
          </mesh>
        </group>
      </Float>
      <Float speed={1.1} floatIntensity={0.6} rotationIntensity={0.12}>
        <group position={[-0.55, -0.75, 0.8]} rotation={[0, 0.18, 0]}>
          <RoundedBox args={[3.0, 1.2, 0.16]} radius={0.12} smoothness={4} material={mat("body")} />
          <Face spec={{ t: "bubble", text: ans, mine: false, a }} w={2.8} h={1.04} z={0.082} />
          <mesh position={[-1.2, -0.68, 0]} rotation={[0, 0, Math.PI]} material={mat("body")}>
            <coneGeometry args={[0.16, 0.3, 3]} />
          </mesh>
        </group>
      </Float>
      {[
        [-2.4, 1.6, 0.3, 0.22],
        [2.6, -0.2, 0.6, 0.16],
        [-2.6, 0.0, 1.0, 0.12],
      ].map(([x, y, z, r], i) => (
        <Float key={i} speed={2.5} rotationIntensity={2} floatIntensity={1}>
          <mesh position={[x, y, z]} material={mat("glow", i ? a[0] : a[1])}>
            <octahedronGeometry args={[r]} />
          </mesh>
        </Float>
      ))}
    </>
  );
}

/** Upload: a folder with your statement files floating into it */
function Folder({ docs, a }: { docs: { ext: string; name: string; color: string }[]; a: Acc }) {
  return (
    <>
      <group position={[0, -0.7, 0]}>
        <RoundedBox args={[3.0, 2.0, 0.1]} radius={0.08} smoothness={3} position={[0, 0, -0.3]} material={mat("glossy", "#2c3430")} />
        <RoundedBox
          args={[1.1, 0.3, 0.1]}
          radius={0.06}
          smoothness={3}
          position={[-0.85, 1.05, -0.3]}
          material={mat("glossy", "#2c3430")}
        />
        {docs.slice(0, 3).map((d, i) => (
          <Float key={i} speed={1.5 + i * 0.4} floatIntensity={1.2} rotationIntensity={0.3}>
            <group position={[-0.9 + i * 0.9, 1.1 + (i % 2) * 0.35, -0.1 + i * 0.06]} rotation={[0, 0, (1 - i) * 0.12]}>
              <mesh material={mat("paper")}>
                <boxGeometry args={[0.95, 1.22, 0.02]} />
              </mesh>
              <Face spec={{ t: "doc", d }} w={0.93} h={1.19} z={0.012} />
            </group>
          </Float>
        ))}
        <RoundedBox
          args={[3.1, 1.6, 0.1]}
          radius={0.08}
          smoothness={3}
          position={[0, -0.22, 0.25]}
          rotation={[-0.18, 0, 0]}
          material={mat("glossy", a[1])}
        />
      </group>
      {[
        [2.5, 1.4, 0.4],
        [-2.5, 1.1, 0.6],
      ].map(([x, y, z], i) => (
        <Float key={i} speed={2.2} floatIntensity={0.8} rotationIntensity={0.6}>
          <RoundedBox args={[0.34, 0.34, 0.1]} radius={0.07} position={[x, y, z]} material={mat("glow", i ? a[0] : a[1])} />
        </Float>
      ))}
    </>
  );
}

export default function Art({ data, animate }: { data: ArtData; animate: boolean }) {
  const a = data.accent;
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={animate ? "always" : "demand"}
      camera={{ position: [0, 0.1, 7.9], fov: 36 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 6]} intensity={1.3} />
      <directionalLight position={[-4, 2, 3]} intensity={0.4} />
      <pointLight position={[0, 1, -2.5]} intensity={18} distance={9} color={a[1]} />
      <Rig animate={animate}>
        <Disc a={a} />
        <Podium a={a} />
        {data.scene === "dash" && <Dash d={data.dash} />}
        {data.scene === "bars" && <Bars values={data.values} label={data.label} coin={data.coin} a={a} />}
        {data.scene === "line" && <Line values={data.values} tiles={data.tiles} a={a} />}
        {data.scene === "coins" && <Coins stacks={data.stacks} label={data.label} cal={data.cal} a={a} />}
        {data.scene === "globe" && <Globe pins={data.pins} label={data.label} a={a} animate={animate} />}
        {data.scene === "stairs" && <Stairs progress={data.progress} label={data.label} a={a} animate={animate} />}
        {data.scene === "donut" && <Donut parts={data.parts} label={data.label} a={a} />}
        {data.scene === "tax" && <Tax cal={data.cal} label={data.label} a={a} animate={animate} />}
        {data.scene === "list" && <Clipboard rows={data.rows} label={data.label} a={a} />}
        {data.scene === "chat" && <Chat q={data.q} ans={data.a} a={a} />}
        {data.scene === "folder" && <Folder docs={data.docs} a={a} />}
      </Rig>
    </Canvas>
  );
}

"use client";

/* The checklist's year ring: twelve month tiles standing on a slowly turning ring. A tile rises as its jobs get done and
   glows when every job is done; months you invested in carry a small dot; the ring turns to bring the chosen month to
   the front. Drag to spin it, tap a tile to pick that month. The year's progress is an arc in the middle.
   It renders only while something moves, and holds still with reduced motion. The month buttons under it do the same
   job for keyboards and screen readers. */

import { useEffect, useRef } from "react";

export interface RingMonth {
  label: string;
  total: number;
  done: number;
  bought: boolean;
  current: boolean;
}

export function YearRing({
  months,
  selected,
  onSelect,
  progress,
  accent,
  dark,
}: {
  months: RingMonth[];
  selected: number;
  onSelect: (i: number) => void;
  progress: number;
  accent: string;
  dark: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ update: (m: RingMonth[], sel: number, p: number, accent: string, dark: boolean) => void } | null>(null);
  const pick = useRef(onSelect);
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true,
      cleanup = () => {};
    void (async () => {
      const THREE = await import("three");
      const { RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js");
      if (!alive) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      renderer.setClearColor(0, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab";
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.set(0, 6.2, 10.5);
      camera.lookAt(0, 0.3, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(3, 8, 6);
      scene.add(sun);

      const ring = new THREE.Group();
      scene.add(ring);
      const R = 4.1,
        geo = new RoundedBoxGeometry(1.3, 1, 0.9, 4, 0.14);
      // the floor: a thin disc under the tiles
      const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 1 });
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.2, R + 1.2, 0.08, 72), floorMat);
      floor.position.y = -0.05;
      ring.add(floor);
      // the year's progress: an arc in the middle
      const arcMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.25, roughness: 0.4 });
      const trackMat = new THREE.MeshStandardMaterial({ color: 0x999999, transparent: true, opacity: 0.25 });
      const track = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.09, 12, 96), trackMat);
      track.rotation.x = -Math.PI / 2;
      track.position.y = 0.3;
      scene.add(track);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 16, 96, 0.001), arcMat);
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.3;
      scene.add(arc);

      const tiles = Array.from({ length: 12 }, (_, i) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05 });
        const mesh = new THREE.Mesh(geo, mat);
        const a = (i / 12) * Math.PI * 2;
        mesh.position.set(Math.sin(a) * R, 0.5, Math.cos(a) * R);
        mesh.rotation.y = a;
        mesh.userData.i = i;
        // month name on the tile's face, as a small canvas texture
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 128;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        // the label lies on the tile's top face, reading upright from the front of the ring
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(1.15, 0.58),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
        );
        label.rotation.x = -Math.PI / 2;
        label.position.set(0, 0.505, 0.05);
        mesh.add(label);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: accent }));
        dot.position.set(0.45, 0.62, 0.3);
        mesh.add(dot);
        ring.add(mesh);
        return { mesh, mat, c, tex, dot, h: 0.3, lift: 0 };
      });

      const ray = new THREE.Raycaster(),
        ptr = new THREE.Vector2();
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let M: RingMonth[] = [],
        sel = 0,
        prog = 0,
        progShown = 0,
        acc = new THREE.Color(accent),
        isDark = dark,
        rot = 0,
        rotTo = 0,
        drag: { x: number; r: number; moved: boolean } | null = null,
        raf = 0,
        idleT = 0,
        arcBuilt = false;

      const paint = (t: (typeof tiles)[number], m: RingMonth, on: boolean) => {
        const g = t.c.getContext("2d")!;
        g.clearRect(0, 0, 256, 128);
        g.fillStyle = on ? "#ffffff" : isDark ? "#e8ece9" : "#1b2a22";
        g.font = "700 54px Inter, system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(m.label, 128, 62);
        g.font = "600 30px Inter, system-ui, sans-serif";
        g.globalAlpha = 0.8;
        g.fillText(m.total ? `${m.done}/${m.total}` : "—", 128, 108);
        g.globalAlpha = 1;
        t.tex.needsUpdate = true;
      };
      const apply = () => {
        const base = new THREE.Color(isDark ? 0x2a2d31 : 0xf3f6f4),
          quiet = new THREE.Color(isDark ? 0x1f2124 : 0xe6ece8);
        tiles.forEach((t, i) => {
          const m = M[i];
          if (!m) return;
          const f = m.total ? m.done / m.total : 0,
            on = i === sel;
          t.h = m.total ? 0.45 + f * 0.9 : 0.22;
          t.mat.color.copy(m.total ? base.clone().lerp(acc, 0.25 + f * 0.75) : quiet);
          if (on) t.mat.color.lerp(acc, 0.35);
          t.mat.emissive.copy(acc);
          t.mat.emissiveIntensity = f === 1 ? 0.35 : on ? 0.15 : 0;
          (t.dot.material as InstanceType<typeof THREE.MeshStandardMaterial>).color.copy(acc);
          t.dot.visible = m.bought;
          paint(t, m, on || f > 0.6);
        });
        floorMat.color.set(isDark ? 0x2a2d31 : 0xffffff);
        arcMat.color.copy(acc);
        arcMat.emissive.copy(acc);
      };
      const fit = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        // phones: a higher, steeper view so the ring fills the narrower frame
        if (w < 500) camera.position.set(0, 9.5, 11.5);
        else camera.position.set(0, 6.2, 10.5);
        camera.lookAt(0, w < 500 ? -0.2 : 0.3, 0);
        camera.updateProjectionMatrix();
        kick();
      };
      const frame = () => {
        raf = 0;
        let moving = false;
        const k = still ? 1 : 0.12;
        if (!drag) {
          const d = rotTo - rot;
          rot += d * k;
          if (Math.abs(d) > 0.001) moving = true;
        }
        ring.rotation.y = rot;
        tiles.forEach((t, i) => {
          const target = i === sel ? 0.35 : 0;
          t.lift += (target - t.lift) * (still ? 1 : 0.15);
          const sy = t.mesh.scale.y + (t.h - t.mesh.scale.y) * (still ? 1 : 0.12);
          t.mesh.scale.y = sy;
          t.mesh.position.y = sy / 2 + t.lift;
          // keep the dot round on a tile that changes height
          t.mesh.children[1].position.y = 0.5 + 0.12 / sy;
          t.mesh.children[1].scale.set(1, 1 / sy, 1);
          if (Math.abs(t.h - sy) > 0.002 || Math.abs(target - t.lift) > 0.002) moving = true;
        });
        const was = progShown;
        progShown += (prog - progShown) * (still ? 1 : 0.08);
        if (Math.abs(prog - progShown) > 0.001) moving = true;
        else progShown = prog;
        if (Math.abs(was - progShown) > 1e-4 || !arcBuilt) {
          arcBuilt = true;
          arc.geometry.dispose();
          arc.geometry = new THREE.TorusGeometry(1.7, 0.16, 16, 96, Math.max(0.001, progShown * Math.PI * 2));
        }
        renderer.render(scene, camera);
        if (moving || drag) kick();
        else if (!still) {
          // a very slow idle sway so the ring feels alive, at a few frames a second
          idleT = window.setTimeout(() => {
            rotTo += 0.0025 * Math.sin(performance.now() / 3000);
            kick();
          }, 120);
        }
      };
      const kick = () => {
        clearTimeout(idleT);
        if (!raf) raf = requestAnimationFrame(frame);
      };
      const face = (i: number) => {
        // the tile at angle a faces the camera when the ring is turned by −a; take the shortest way round
        const a = -(i / 12) * Math.PI * 2;
        let d = (a - rot) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        rotTo = rot + d;
      };
      const hit = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, camera);
        const h = ray.intersectObjects(
          tiles.map((t) => t.mesh),
          false,
        )[0];
        return h ? (h.object.userData.i as number) : null;
      };
      const down = (e: PointerEvent) => {
        drag = { x: e.clientX, r: rot, moved: false };
        renderer.domElement.style.cursor = "grabbing";
      };
      const move = (e: PointerEvent) => {
        if (drag) {
          const dx = e.clientX - drag.x;
          if (Math.abs(dx) > 4) drag.moved = true;
          rot = rotTo = drag.r + dx * 0.008;
          kick();
        } else renderer.domElement.style.cursor = hit(e) != null ? "pointer" : "grab";
      };
      const up = (e: PointerEvent) => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        renderer.domElement.style.cursor = "grab";
        if (moved) {
          // settle on the month that ended up in front
          const i = (((Math.round((-rot / (Math.PI * 2)) * 12) % 12) + 12) % 12) as number;
          pick.current(i);
        } else {
          const i = hit(e);
          if (i != null) pick.current(i);
        }
      };
      renderer.domElement.addEventListener("pointerdown", down);
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
      const ro = new ResizeObserver(fit);
      ro.observe(el);

      api.current = {
        update(m, s, p, a, dk) {
          const first = !M.length;
          M = m;
          if (s !== sel || first) face(s);
          sel = s;
          prog = p;
          acc = new THREE.Color(a);
          isDark = dk;
          apply();
          if (first) {
            rot = rotTo;
            tiles.forEach((t) => (t.mesh.scale.y = 0.01));
          }
          kick();
        },
      };
      fit();
      apply();
      cleanup = () => {
        cancelAnimationFrame(raf);
        clearTimeout(idleT);
        ro.disconnect();
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        tiles.forEach((t) => {
          t.mat.dispose();
          t.tex.dispose();
        });
        geo.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      el.dataset.ready = "1";
      el.dispatchEvent(new Event("ringready"));
    })();
    return () => {
      alive = false;
      api.current = null;
      cleanup();
    };
  }, [accent, dark]);

  useEffect(() => {
    const push = () => api.current?.update(months, selected, progress, accent, dark);
    push();
    const el = host.current;
    el?.addEventListener("ringready", push);
    return () => el?.removeEventListener("ringready", push);
  }, [months, selected, progress, accent, dark]);

  return <div ref={host} aria-hidden className="h-[340px] w-full max-sm:h-[250px]" />;
}

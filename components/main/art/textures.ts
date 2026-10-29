/* Draws the dashboard screens and floating cards of the 3D hero onto canvases, so the WebGL scene shows your real numbers.
   Each function returns a canvas; the scene turns it into a texture. Dark panels, light text, lime/category accents. */

export type CardSpec =
  | { kind: "ring"; title: string; pct: number; text: string }
  | { kind: "bars"; title: string; bars: number[]; color: string }
  | { kind: "calendar"; ym: string; marks: number[] }
  | { kind: "stat"; title: string; value: string; up: boolean | null };

export interface DashData {
  /** [light, strong] accent: the glow disc and highlights */
  accent: [string, string];
  screen: { kicker: string; value: string; bars: number[]; labels: string[]; split: { name: string; color: string; v: number }[] };
  phone: { kicker: string; value: string; ring: number; ringText: string; foot: string };
  cards: [CardSpec, CardSpec, CardSpec];
}

const BG = "#151917",
  PANEL = "#1f2421",
  INK = "#f3f6f1",
  MUTED = "#98a29a",
  LINE = "#2c332e";
const F = (w: number, size: number, display = false) => `${w} ${size}px ${display ? "Sora, Inter" : "Inter"}, system-ui, sans-serif`;

function make(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  return { c, g };
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
function grad(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, a: [string, string]) {
  const l = g.createLinearGradient(x0, y0, x1, y1);
  l.addColorStop(0, a[0]);
  l.addColorStop(1, a[1]);
  return l;
}
function ring(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, wdt: number, pct: number, a: [string, string]) {
  g.lineCap = "round";
  g.lineWidth = wdt;
  g.strokeStyle = LINE;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = grad(g, cx - r, cy - r, cx + r, cy + r, a);
  g.beginPath();
  g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, pct)));
  g.stroke();
}
function barsAt(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vals: number[], a: [string, string]) {
  const max = Math.max(1, ...vals),
    n = vals.length,
    gap = w / n,
    bw = gap * 0.58;
  vals.forEach((v, i) => {
    const bh = Math.max(4, (v / max) * h),
      bx = x + i * gap + (gap - bw) / 2;
    g.fillStyle = i === n - 1 ? grad(g, 0, y + h - bh, 0, y + h, a) : "rgba(243,246,241,0.18)";
    rr(g, bx, y + h - bh, bw, bh, Math.min(8, bw / 2));
    g.fill();
  });
}

/** the monitor: what it's worth, 12 month-end bars and the split */
export function drawScreen(d: DashData) {
  const W = 1024,
    H = 640,
    { c, g } = make(W, H),
    a = d.accent;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  ["#f87171", "#fbbf24", a[1]].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(44 + i * 26, 40, 8, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = MUTED;
  g.font = F(600, 26);
  g.fillText(fit(g, d.screen.kicker, 560), 44, 112);
  g.fillStyle = INK;
  g.font = F(700, 64, true);
  g.fillText(fit(g, d.screen.value, 600), 44, 186);
  // bars panel
  rr(g, 44, 230, 620, 370, 24);
  g.fillStyle = PANEL;
  g.fill();
  barsAt(g, 72, 262, 564, 270, d.screen.bars, a);
  g.fillStyle = MUTED;
  g.font = F(500, 20);
  const step = 564 / Math.max(1, d.screen.labels.length);
  d.screen.labels.forEach((l, i) => {
    if (i % 2 === 0 || i === d.screen.labels.length - 1) g.fillText(l, 72 + i * step + step / 2 - 14, 572);
  });
  // split panel
  rr(g, 692, 230, 288, 370, 24);
  g.fillStyle = PANEL;
  g.fill();
  const tot = d.screen.split.reduce((x, y) => x + y.v, 0) || 1;
  let ang = -Math.PI / 2;
  g.lineWidth = 30;
  g.lineCap = "butt";
  for (const p of d.screen.split) {
    const da = (p.v / tot) * Math.PI * 2;
    g.strokeStyle = p.color;
    g.beginPath();
    g.arc(836, 340, 74, ang + 0.03, ang + da - 0.03);
    g.stroke();
    ang += da;
  }
  g.font = F(600, 21);
  d.screen.split.slice(0, 4).forEach((p, i) => {
    const y = 466 + i * 34;
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(726, y - 7, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.fillText(fit(g, p.name, 150), 744, y);
    g.fillStyle = MUTED;
    g.textAlign = "right";
    g.fillText(`${Math.round((100 * p.v) / tot)}%`, 958, y);
    g.textAlign = "left";
  });
  return c;
}

/** the phone: one headline figure and a ring */
export function drawPhone(d: DashData) {
  const W = 400,
    H = 800,
    { c, g } = make(W, H),
    a = d.accent;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  rr(g, 150, 28, 100, 16, 8);
  g.fillStyle = LINE;
  g.fill();
  g.fillStyle = grad(g, 150, 90, 250, 190, a);
  g.beginPath();
  g.arc(200, 150, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#0d1a07";
  g.beginPath();
  g.arc(200, 136, 17, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(200, 182, 30, 18, 0, Math.PI, 0);
  g.fill();
  g.textAlign = "center";
  g.fillStyle = MUTED;
  g.font = F(600, 26);
  g.fillText(fit(g, d.phone.kicker, 340), 200, 254);
  g.fillStyle = INK;
  g.font = F(700, 46, true);
  g.fillText(fit(g, d.phone.value, 350), 200, 312);
  ring(g, 200, 470, 92, 24, d.phone.ring, a);
  g.fillStyle = INK;
  g.font = F(700, 44, true);
  g.fillText(d.phone.ringText, 200, 486);
  rr(g, 60, 640, 280, 70, 35);
  g.fillStyle = grad(g, 60, 0, 340, 0, a);
  g.fill();
  g.fillStyle = "#0d1a07";
  g.font = F(700, 26);
  g.fillText(fit(g, d.phone.foot, 250), 200, 684);
  g.textAlign = "left";
  return c;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** a floating card: a ring, mini bars, a month calendar or a single figure */
export function drawCard(s: CardSpec, a: [string, string]) {
  const W = 512,
    H = 340,
    { c, g } = make(W, H);
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  if (s.kind === "calendar") {
    const [y, m] = s.ym.split("-").map(Number),
      first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
      days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    g.fillStyle = INK;
    g.font = F(700, 30, true);
    g.textAlign = "center";
    g.fillText(MONTHS[m - 1], W / 2, 52);
    g.font = F(600, 19);
    "SMTWTFS".split("").forEach((ch, i) => {
      g.fillStyle = MUTED;
      g.fillText(ch, 66 + i * 63, 94);
    });
    for (let dd = 1; dd <= days; dd++) {
      const k = first + dd - 1,
        cx = 66 + (k % 7) * 63,
        cy = 132 + Math.floor(k / 7) * 40;
      if (s.marks.includes(dd)) {
        g.fillStyle = grad(g, cx - 18, cy - 18, cx + 18, cy + 18, a);
        g.beginPath();
        g.arc(cx, cy - 7, 17, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0d1a07";
      } else g.fillStyle = INK;
      g.fillText(String(dd), cx, cy);
    }
    g.textAlign = "left";
    return c;
  }
  g.fillStyle = MUTED;
  g.font = F(600, 26);
  g.fillText(fit(g, s.title, 440), 36, 58);
  if (s.kind === "ring") {
    ring(g, 132, 196, 78, 22, s.pct, a);
    g.fillStyle = INK;
    g.font = F(700, 38, true);
    g.textAlign = "center";
    g.fillText(`${Math.round(s.pct * 100)}%`, 132, 210);
    g.textAlign = "left";
    g.font = F(600, 26);
    g.fillStyle = INK;
    const words = s.text.split(" ");
    let line = "",
      yy = 170;
    for (const w of words) {
      if (g.measureText(line + w).width > 220 && line) {
        g.fillText(line.trim(), 254, yy);
        yy += 36;
        line = "";
      }
      line += w + " ";
    }
    g.fillText(line.trim(), 254, yy);
  } else if (s.kind === "bars") {
    barsAt(g, 36, 92, 440, 200, s.bars, [s.color, s.color]);
  } else {
    g.fillStyle = INK;
    g.font = F(700, 56, true);
    g.fillText(fit(g, s.value, 440), 36, 160);
    if (s.up != null) {
      g.fillStyle = s.up ? "#4ade80" : "#f87171";
      g.beginPath();
      const y0 = 250;
      if (s.up) {
        g.moveTo(36, y0 + 30);
        g.lineTo(66, y0 - 6);
        g.lineTo(96, y0 + 30);
      } else {
        g.moveTo(36, y0 - 6);
        g.lineTo(66, y0 + 30);
        g.lineTo(96, y0 - 6);
      }
      g.fill();
    }
    rr(g, 120, 236, 356, 22, 11);
    g.fillStyle = LINE;
    g.fill();
    rr(g, 120, 236, 240, 22, 11);
    g.fillStyle = grad(g, 120, 0, 360, 0, a);
    g.fill();
  }
  return c;
}

/** the big glow disc behind the scene */
export function drawDisc(a: [string, string]) {
  const { c, g } = make(512, 512);
  g.fillStyle = grad(g, 60, 40, 460, 470, a);
  g.beginPath();
  g.arc(256, 256, 250, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** a small label card: kicker, big value and a coloured sub line */
export function drawLabel(l: { kicker: string; value: string; sub?: string; color?: string }, a: [string, string]) {
  const W = 512,
    H = 300,
    { c, g } = make(W, H);
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = grad(g, 0, 0, W, 0, a);
  rr(g, 36, 34, 64, 10, 5);
  g.fill();
  g.fillStyle = MUTED;
  g.font = F(600, 27);
  g.fillText(fit(g, l.kicker, 440), 36, 96);
  g.fillStyle = INK;
  g.font = F(700, 64, true);
  g.fillText(fit(g, l.value, 440), 36, 176);
  if (l.sub) {
    g.fillStyle = l.color || a[0];
    g.font = F(700, 30);
    g.fillText(fit(g, l.sub, 440), 36, 240);
  }
  return c;
}

/** a statement file: a page with its type badge */
export function drawDoc(d: { ext: string; name: string; color: string }) {
  const W = 360,
    H = 460,
    { c, g } = make(W, H);
  g.fillStyle = "#f3f6f1";
  g.fillRect(0, 0, W, H);
  g.fillStyle = d.color;
  rr(g, 30, 30, 150, 64, 14);
  g.fill();
  g.fillStyle = "#0d1a07";
  g.font = F(800, 36, true);
  g.fillText(d.ext, 48, 76);
  g.fillStyle = "#151917";
  g.font = F(700, 30);
  g.fillText(fit(g, d.name, 300), 30, 150);
  g.fillStyle = "#c9cfc9";
  for (let i = 0; i < 6; i++) {
    rr(g, 30, 190 + i * 40, i % 3 === 2 ? 180 : 300, 16, 8);
    g.fill();
  }
  return c;
}

/** a checklist page: rows with ticks */
export function drawList(rows: { text: string; done: boolean }[], a: [string, string]) {
  const W = 512,
    H = 680,
    { c, g } = make(W, H);
  g.fillStyle = "#f3f6f1";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#151917";
  g.font = F(800, 36, true);
  g.fillText(`${rows.filter((r) => r.done).length} of ${rows.length} done`, 40, 80);
  rows.slice(0, 7).forEach((r, i) => {
    const y = 140 + i * 74;
    g.lineWidth = 5;
    if (r.done) {
      g.fillStyle = grad(g, 40, y, 84, y + 44, a);
      rr(g, 40, y, 44, 44, 12);
      g.fill();
      g.strokeStyle = "#0d1a07";
      g.beginPath();
      g.moveTo(51, y + 23);
      g.lineTo(60, y + 32);
      g.lineTo(75, y + 13);
      g.stroke();
    } else {
      g.strokeStyle = "#b9c1ba";
      rr(g, 42, y + 2, 40, 40, 11);
      g.stroke();
    }
    g.fillStyle = r.done ? "#7c857e" : "#151917";
    g.font = F(600, 25);
    g.fillText(fit(g, r.text, 380), 104, y + 31);
  });
  return c;
}

/** a chat bubble with wrapped text */
export function drawBubble(text: string, mine: boolean, a: [string, string]) {
  const W = 640,
    H = 260,
    { c, g } = make(W, H);
  g.fillStyle = mine ? grad(g, 0, 0, W, H, a) : BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = mine ? "#0d1a07" : INK;
  g.font = F(600, 32);
  const words = text.split(" ");
  let line = "",
    y = 70,
    n = 0;
  for (const w of words) {
    if (g.measureText(line + w).width > W - 80 && line) {
      g.fillText(line.trim(), 40, y);
      y += 46;
      line = "";
      if (++n === 4) break;
    }
    line += w + " ";
  }
  if (n < 4) g.fillText(line.trim(), 40, y);
  return c;
}

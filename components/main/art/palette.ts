/* Colours of the 3D heroes for the current theme. The hero sets the theme before its canvas mounts (the canvas is keyed
   by theme, so a switch rebuilds the scene and its textures with the new colours). */
export type ArtTheme = "light" | "dark";
const P = {
  light: {
    bg: "#ffffff",
    panel: "#f1f3f6",
    ink: "#121418",
    muted: "#687080",
    line: "#e2e5ea",
    faint: "rgba(18,20,24,0.12)",
    up: "#00a36c",
    down: "#e5484d",
    body: "#d5dae1",
    podium: "#e4e8ee",
    neutral: "#c9cfd8",
    neutral2: "#b7bec9",
    bright: "#ffffff",
  },
  dark: {
    bg: "#17181b",
    panel: "#1e2024",
    ink: "#eef0f3",
    muted: "#8f949e",
    line: "#2a2d33",
    faint: "rgba(238,240,243,0.18)",
    up: "#22c98a",
    down: "#ff6359",
    body: "#101114",
    podium: "#1c1e22",
    neutral: "#2c2f35",
    neutral2: "#3a3e45",
    bright: "#eef0f3",
  },
};
export const ART = { theme: "light" as ArtTheme, ...P.light };
export function setArtTheme(t: ArtTheme) {
  if (ART.theme === t) return;
  Object.assign(ART, P[t], { theme: t });
}
/** light pastel text tones (made for dark panels) as readable darker tones on light panels */
const DARKER: Record<string, string> = {
  "#86efac": "#067a4f",
  "#fca5a5": "#c4282d",
  "#fcd34d": "#9a5b00",
  "#fed7aa": "#c2410c",
  "#99f6e4": "#0f766e",
  "#f3f6f1": "#121418",
  "#c4f25a": "#0f7a4f",
  "#5fe37a": "#0f7a4f",
  "#8fe3c0": "#0f7a4f",
  "#7fe0c2": "#0f7a4f",
};
export const tone = (c: string) => (ART.theme === "light" ? DARKER[c.toLowerCase()] || c : c);

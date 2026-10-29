/* GLSL for the solar system: banded gas-giant planets lit by the sun, a boiling sun surface, a faint nebula and twinkling stars. */

const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
`;

export const planetVertex = /* glsl */ `
varying vec3 vN; varying vec3 vP; varying vec3 vL; varying vec3 vV;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vP = position;
  vL = normalize(-w.xyz);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const planetFragment = /* glsl */ `
uniform vec3 c1; uniform vec3 c2; uniform float t; uniform float seed; uniform float glow;
varying vec3 vN; varying vec3 vP; varying vec3 vL; varying vec3 vV;
${NOISE}
void main(){
  vec3 p = normalize(vP);
  float n = fbm(vec3(p.x * 2.2 + seed, p.y * 7.0, p.z * 2.2 + t * 0.03));
  float bands = sin(p.y * 11.0 + n * 4.0 + seed) * 0.5 + 0.5;
  float storms = smoothstep(0.62, 0.8, fbm(p * 5.0 + seed + t * 0.02));
  vec3 col = mix(c2, c1, bands);
  col = mix(col, vec3(1.0), storms * 0.25);
  float diff = max(dot(normalize(vN), normalize(vL)), 0.0);
  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.6);
  vec3 c = col * (0.16 + 0.95 * diff) + c1 * fres * glow;
  gl_FragColor = vec4(c, 1.0);
}`;

export const sunFragment = /* glsl */ `
uniform float t; varying vec3 vN; varying vec3 vP; varying vec3 vL; varying vec3 vV;
${NOISE}
void main(){
  vec3 p = normalize(vP);
  float n = fbm(p * 3.0 + vec3(t * 0.08, t * 0.05, 0.0));
  float m = fbm(p * 8.0 - vec3(0.0, t * 0.1, t * 0.06));
  vec3 hot = vec3(1.0, 0.92, 0.7), warm = vec3(1.0, 0.55, 0.18);
  vec3 col = mix(warm, hot, n * 0.8 + m * 0.4);
  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.6);
  gl_FragColor = vec4(col * (1.6 + fres * 1.4), 1.0);
}`;

export const starVertex = /* glsl */ `
attribute float size; attribute float phase; uniform float t; uniform float px; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA = 0.55 + 0.45 * sin(t * 1.6 + phase);
  gl_PointSize = size * px * (260.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
export const starFragment = /* glsl */ `
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(0.85, 0.88, 1.0) * a * vA * 1.4, a * vA);
}`;

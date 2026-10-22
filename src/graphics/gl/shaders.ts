/**
 * Shaders de la capa solar (GLSL ES 3.00 · WebGL2).
 *
 *  · MASK_*    máscara de sombras de edificios en pantalla: R = cobertura, G = distancia al borde
 *              del edificio que la proyecta (normalizada). Se dibuja con MSAA en calidad Alta.
 *  · GROUND_*  composición sobre el suelo: campo de luz (bicúbico), sombra de relieve, sombras de
 *              edificios con penumbra física, tono pizarra, sombra de contacto y velo de nubes.
 *  · ROOF_*    aristas de tejado en 3D (líneas con antialias, expandidas en pantalla).
 *  · STATS_*   reducción de la máscara a una rejilla pequeña para las estadísticas.
 */

export const MASK_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_pos;   // x, y (m locales), altura (m), k (0 base · 1 extremo)
uniform mat4 u_matrix;
uniform vec2 u_dir;                   // dirección de la sombra (este, sur), unitaria
uniform float u_perMeter;             // metros de sombra por metro de altura = 1 / tan(altitud)
uniform float u_maxLen;               // tope de la sombra (m)
out float v_dist;
void main() {
  float len = min(a_pos.z * u_perMeter, u_maxLen);
  float d = a_pos.w * len;
  v_dist = d;
  gl_Position = u_matrix * vec4(a_pos.xy + u_dir * d, 0.0, 1.0);
}`;

export const MASK_FS = `#version 300 es
precision highp float;
in float v_dist;
uniform float u_value;                // 1 sombra · 0 huella (tejado iluminado)
uniform float u_maxLen;
out vec4 o;
void main() {
  o = vec4(u_value, u_value * clamp(v_dist / u_maxLen, 0.0, 1.0), 0.0, 1.0);
}`;

export const GROUND_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;   // suelo, m locales desde el centro de la vista
uniform mat4 u_matrix;
out vec2 v_local;
void main() {
  v_local = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

export const GROUND_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_local;

uniform vec3 u_origin;      // ox, oy (Mercator) · metros por unidad
uniform float u_radius;     // radio dibujado (m): se desvanece en el borde
uniform sampler2D u_field;  // R luz directa · G sombra de relieve · B nubes
uniform vec4 u_fieldBox;    // oeste, sur, este, norte (grados)
uniform vec2 u_fieldSize;   // columnas, filas
uniform int u_smooth;       // 1 = bicúbico
uniform sampler2D u_ramp;   // escala de color (256 × 1, sin premultiplicar)
uniform vec4 u_light;       // dayK, shadeK, elev, amb
uniform vec4 u_light2;      // cap, cloudK, veilMax, nightK

uniform sampler2D u_mask;   // R cobertura · G distancia / maxLen
uniform vec2 u_buf;         // tamaño del búfer de dibujo (px)
uniform float u_bFade;      // sombras de edificios (interruptor × zoom × sol); 0 = sin máscara
uniform vec4 u_tone;        // tono pizarra rgb + alfa según zoom
uniform vec4 u_pen;         // tan(radio solar)/cos(alt), maxLen (m), suavizado (m), tope (px)
uniform float u_maxDist;    // distancia máxima posible al borde (m) en la vista
uniform vec2 u_contact;     // sombra de contacto: cantidad, metros
uniform int u_mode;         // 2 penumbra completa · 1 ligera · 0 solo antialias
uniform float u_opacity;    // aparición suave al cargar (0 → 1)

out vec4 o;

const float PI = 3.141592653589793;
const vec3 SHADE = vec3(36.0, 52.0, 94.0) / 255.0;

const vec2 RING[8] = vec2[8](
  vec2(1.0, 0.0), vec2(0.7071, 0.7071), vec2(0.0, 1.0), vec2(-0.7071, 0.7071),
  vec2(-1.0, 0.0), vec2(-0.7071, -0.7071), vec2(0.0, -1.0), vec2(0.7071, -0.7071));

// Disco de Poisson (radio 1).
const vec2 DISK[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

vec4 cubicWeights(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

// B-spline cúbico con 4 lecturas bilineales (Sigg y Hadwiger): continuidad C2, sin «diamantes».
vec4 bicubic(sampler2D tex, vec2 uv, vec2 size) {
  vec2 inv = 1.0 / size;
  vec2 tc = uv * size - 0.5;
  vec2 f = fract(tc);
  tc -= f;
  vec4 xc = cubicWeights(f.x);
  vec4 yc = cubicWeights(f.y);
  vec4 c = tc.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  vec4 s0 = textureLod(tex, off.xz, 0.0);
  vec4 s1 = textureLod(tex, off.yz, 0.0);
  vec4 s2 = textureLod(tex, off.xw, 0.0);
  vec4 s3 = textureLod(tex, off.yw, 0.0);
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

vec4 sampleField(vec2 merc) {
  float lng = merc.x * 360.0 - 180.0;
  float lat = degrees(2.0 * atan(exp(PI - 2.0 * PI * merc.y)) - 0.5 * PI);
  vec2 g = vec2((lng - u_fieldBox.x) / (u_fieldBox.z - u_fieldBox.x),
                (lat - u_fieldBox.y) / (u_fieldBox.w - u_fieldBox.y)) * (u_fieldSize - 1.0);
  vec2 uv = (clamp(g, vec2(0.0), u_fieldSize - 1.0) + 0.5) / u_fieldSize;
  return u_smooth == 1 ? bicubic(u_field, uv, u_fieldSize) : textureLod(u_field, uv, 0.0);
}

// Luz del sol + sombra de relieve + ambiente del atardecer (premultiplicado), igual que el canvas.
vec4 lightColor(vec3 f) {
  float d = f.b * u_light2.y;
  float intensity = min(u_light2.x, f.r * (1.0 - d) * u_light.z) * u_light.x;
  vec4 c = textureLod(u_ramp, vec2((clamp(intensity, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5), 0.0);
  float nT = f.g * 0.38 * u_light.y;
  float na = 1.0 - (1.0 - nT) * (1.0 - u_light.w);
  float wk = c.a * (1.0 - na);
  return vec4(SHADE * na + c.rgb * wk, na + wk);
}

vec4 cloudVeil(float cloud) {
  float d = cloud * u_light2.y;
  float core = d * d;
  float nk = u_light2.w;
  vec3 col = vec3(mix(201.0, 118.0, nk) - 20.0 * core,
                  mix(206.0, 130.0, nk) - 18.0 * core,
                  mix(214.0, 176.0, nk) - 10.0 * core) / 255.0;
  float a = u_light2.z * smoothstep(0.08, 0.9, d);
  return vec4(col * a, a);
}

// Cobertura de sombra con penumbra: el borde se difumina en proporción a la distancia al edificio
// que la proyecta (nítida al pie de la fachada, suave en la punta), como con un sol de 0,53°.
float shadowCoverage(vec2 uv, float mpp, out float distM) {
  vec4 c = textureLod(u_mask, uv, 0.0);
  distM = c.g * u_pen.y;
  if (u_mode == 0) return c.r;
  vec2 px = 1.0 / u_buf;
  float K = u_pen.x;
  float soft2 = u_pen.z * u_pen.z;
  float rMax = sqrt(u_maxDist * K * u_maxDist * K + soft2);
  float searchPx = clamp(rMax / mpp, 0.75, u_pen.w);
  int nRing = u_mode == 2 ? 8 : 4;
  float dmax = c.g;
  float rmin = c.r;
  float rmax = c.r;
  for (int i = 0; i < 8; i++) {
    if (i >= nRing) break;
    vec2 dir = u_mode == 2 ? RING[i] : RING[i * 2];
    vec4 s = textureLod(u_mask, uv + dir * searchPx * px, 0.0);
    dmax = max(dmax, s.g);
    rmin = min(rmin, s.r);
    rmax = max(rmax, s.r);
  }
  if (rmax - rmin < 0.004) return c.r;
  float dist = dmax * u_pen.y;
  float rPx = clamp(sqrt(dist * K * dist * K + soft2) / mpp, 0.6, u_pen.w);
  int nDisk = u_mode == 2 ? 12 : 6;
  float sum = c.r;
  for (int i = 0; i < 12; i++) {
    if (i >= nDisk) break;
    sum += textureLod(u_mask, uv + DISK[i] * rPx * px, 0.0).r;
  }
  return sum / float(nDisk + 1);
}

void main() {
  vec2 merc = u_origin.xy + v_local / u_origin.z;
  vec4 f = sampleField(merc);
  vec4 col = lightColor(f.rgb);

  if (u_bFade > 0.001) {
    vec2 dx = dFdx(v_local);
    vec2 dy = dFdy(v_local);
    float mpp = sqrt(max(length(dx) * length(dy), 1e-10));
    float distM;
    float m = shadowCoverage(gl_FragCoord.xy / u_buf, mpp, distM) * u_bFade;
    // Quita el sol bajo la sombra…
    col *= 1.0 - 0.95 * m;
    // …y pinta el tono pizarra (más denso al pie de las fachadas).
    float contact = u_contact.x * (1.0 - smoothstep(0.0, u_contact.y, distM)) * step(0.999, m / max(u_bFade, 1e-3));
    float a = clamp(u_tone.a * m * (1.0 + contact), 0.0, 1.0);
    col = vec4(u_tone.rgb * a, a) + col * (1.0 - a);
  }

  if (u_light2.y > 0.001) {
    vec4 veil = cloudVeil(f.b);
    col = veil + col * (1.0 - veil.a);
  }

  // Borde del área dibujada: se desvanece en vez de cortar en seco.
  col *= (1.0 - smoothstep(0.78 * u_radius, u_radius, length(v_local))) * u_opacity;
  o = col;
}`;

export const ROOF_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;  // x: extremo (0/1) · y: lado (−1/1)
layout(location = 1) in vec4 a_seg;     // ax, ay, bx, by (m locales)
layout(location = 2) in float a_h;      // altura del tejado (m)
uniform mat4 u_matrix;
uniform float u_extrude;                // 0-1: misma transición de altura que el mapa
uniform vec2 u_viewport;                // px del búfer
uniform float u_halfWidth;              // px
uniform float u_bias;                   // empuje hacia la cámara (NDC) para ganar al tejado
out float v_d;
void main() {
  float z = a_h * u_extrude;
  vec4 ca = u_matrix * vec4(a_seg.xy, z, 1.0);
  vec4 cb = u_matrix * vec4(a_seg.zw, z, 1.0);
  if (ca.w <= 1e-6 || cb.w <= 1e-6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_d = 0.0;
    return;
  }
  vec2 half_ = u_viewport * 0.5;
  vec2 sa = ca.xy / ca.w * half_;
  vec2 sb = cb.xy / cb.w * half_;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = u_halfWidth + 1.0;
  bool atB = a_corner.x > 0.5;
  vec4 c = atB ? cb : ca;
  vec2 s = (atB ? sb : sa) + nrm * a_corner.y * w + dir * (atB ? 0.5 : -0.5);
  gl_Position = vec4(s / half_ * c.w, c.z - u_bias * c.w, c.w);
  v_d = a_corner.y * w;
}`;

export const ROOF_FS = `#version 300 es
precision highp float;
in float v_d;
uniform vec4 u_color;                   // premultiplicado
uniform float u_halfWidth;
out vec4 o;
void main() {
  float a = clamp(u_halfWidth + 0.5 - abs(v_d), 0.0, 1.0);
  o = u_color * a;
}`;

export const STATS_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Cada píxel de salida promedia 4 × 4 lecturas bilineales de su trozo de máscara.
export const STATS_FS = `#version 300 es
precision highp float;
uniform sampler2D u_mask;
uniform vec2 u_out;
out vec4 o;
void main() {
  vec2 cell = 1.0 / u_out;
  vec2 base = (gl_FragCoord.xy - 0.5) * cell;
  float sum = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      sum += textureLod(u_mask, base + (vec2(float(i), float(j)) + 0.5) * 0.25 * cell, 0.0).r;
    }
  }
  o = vec4(sum / 16.0, 0.0, 0.0, 1.0);
}`;

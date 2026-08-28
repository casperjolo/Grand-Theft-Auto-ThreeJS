import * as THREE from 'three';

const cloudVert = `
uniform vec3 uCameraPos;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vLocalPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vLocalPos = position;
  vViewDir = normalize(worldPos.xyz - uCameraPos);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const cloudFrag = `
precision highp float;

uniform vec3 uCameraPos;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uCoverage;
uniform float uDensity;
uniform float uAbsorption;
uniform float uWindSpeed;
uniform float uEdgeSoftness;
uniform vec2 uWindDirection;
uniform float uCloudBottom;
uniform float uCloudTop;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec3 vLocalPos;

#define PI 3.14159265359

// --- Hash & Noise ---
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1,311.7,74.7)),
           dot(p, vec3(269.5,183.3,246.1)),
           dot(p, vec3(113.5,271.9,124.6)));
  return fract(sin(p) * 43758.5453123);
}

// Value noise
float valueNoise(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f*f*(3.0-2.0*f);
  float n = p.x + p.y*157.0 + 113.0*p.z;
  return mix(mix(mix(hash(n+0.0), hash(n+1.0), f.x),
                 mix(hash(n+157.0), hash(n+158.0), f.x), f.y),
             mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                 mix(hash(n+270.0), hash(n+271.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
  float f = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for(int i=0;i<5;i++) {
    f += valueNoise(p * freq) * amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return f;
}

// Worley noise
float worley(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float minDist = 1.0;
  for(int x=-1;x<=1;x++) {
    for(int y=-1;y<=1;y++) {
      for(int z=-1;z<=1;z++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash3(ip + neighbor);
        point = 0.5 + 0.5*sin(point*6.2831 + vec3(0.0,1.0,2.0));
        vec3 diff = neighbor + point - fp;
        float d = dot(diff,diff);
        minDist = min(minDist, d);
      }
    }
  }
  return 1.0 - minDist; // 0 at cell border, 1 at center
}

float worleyFbm(vec3 p) {
  return worley(p)*0.625 + worley(p*2.0)*0.25 + worley(p*4.0)*0.125;
}

// Perlin-Worley like
float perlinWorley(vec3 p) {
  float perlin = fbm(p);
  float worley = worleyFbm(p);
  // Remap: perlin-worley is combination
  float pw = mix(perlin, worley, 0.4);
  return pw;
}

float remap(float v, float a, float b, float c, float d) {
  return c + (v - a) * (d - c) / (b - a);
}

// Height gradient for clouds - defines where clouds exist vertically
float heightGradient(float heightFrac) {
  // heightFrac 0=bottom, 1=top
  float bottomFade = smoothstep(0.0, 0.15, heightFrac);
  float topFade = 1.0 - smoothstep(0.6, 1.0, heightFrac);
  // Slight anvil top
  float mid = smoothstep(0.2, 0.5, heightFrac) * 1.2;
  return bottomFade * topFade * mid;
}

// Cloud density sampling
float sampleCloudDensity(vec3 pos, float heightFrac, bool isLightRay) {
  // Wind offset
  float windTime = uTime * uWindSpeed * 0.06;
  vec3 windOffset = vec3(windTime * uWindDirection.x, 0.0, windTime * uWindDirection.y) * 100.0;

  vec3 p = pos + windOffset;

  // Scale positions for noise
  float baseScale = 0.00035;
  if(isLightRay) baseScale *= 1.2; // slightly lower freq for light ray for performance

  vec3 uv = p * baseScale;

  // Base shape
  float baseNoise = perlinWorley(uv);
  // Add larger scale variation for coverage
  float largeNoise = fbm(uv * 0.4) * 0.6 + 0.4;
  baseNoise = remap(baseNoise, 0.0, 1.0, largeNoise*0.4, 1.0);

  // Coverage control - remap
  float coverage = uCoverage;
  // Edge softness
  float softness = uEdgeSoftness;
  float low = 1.0 - coverage;
  low = mix(low, low*0.5, softness);
  float density = smoothstep(low, low + softness, baseNoise);

  // Height gradient
  float hGrad = heightGradient(heightFrac);
  density *= hGrad;

  // Erosion detail - subtract high freq worley
  if(density > 0.001 && !isLightRay) {
    vec3 detailPos = p * 0.0018;
    float detail = worleyFbm(detailPos * 2.5);
    detail = pow(detail, 0.8);
    // Erode more at top and edges
    float erosion = detail * 0.35 * (1.0 - heightFrac*0.3);
    density = max(0.0, density - erosion);
    // Additional curl noise for wispy tops
    float curl = fbm(detailPos * 6.0) * 0.15;
    density = max(0.0, density - curl * (heightFrac));
  }

  density *= uDensity * 1.5;

  // Clamp
  return clamp(density, 0.0, 1.0);
}

// Ray box intersection - robust
vec2 rayBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / max(abs(rd), vec3(0.0001)) * sign(rd);
  // Alternative safe
  vec3 t0 = (boxMin - ro) * invDir;
  vec3 t1 = (boxMax - ro) * invDir;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tNear = max(max(tmin.x, tmin.y), tmin.z);
  float tFar = min(min(tmax.x, tmax.y), tmax.z);
  return vec2(tNear, tFar);
}

// Henyey-Greenstein phase
float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g*g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0*g*cosTheta, 1.5));
}
float dualLobeHG(float cosTheta, float g0, float g1, float w) {
  return mix(henyeyGreenstein(cosTheta, g0), henyeyGreenstein(cosTheta, g1), w);
}

// Beer's law
float beer(float opticalDepth) {
  return exp(-opticalDepth);
}
float powder(float opticalDepth) {
  // Powder effect for silver lining
  return 1.0 - exp(-opticalDepth * 2.0);
}

// Light transmittance
float lightTransmittance(vec3 pos, vec3 sunDir) {
  float totalDensity = 0.0;
  float stepSize = 180.0;
  // March towards sun
  for(int i=0;i<6;i++) {
    pos += sunDir * stepSize;
    float heightFrac = (pos.y - uCloudBottom) / (uCloudTop - uCloudBottom);
    if(heightFrac < 0.0 || heightFrac > 1.0) continue;
    float d = sampleCloudDensity(pos, heightFrac, true);
    totalDensity += d * stepSize * 0.0006;
  }
  return beer(totalDensity * uAbsorption);
}

// Sky color for background and ambient
vec3 getSkyColor(vec3 rayDir, vec3 sunDir) {
  float y = max(rayDir.y, 0.0);
  vec3 top = vec3(0.15,0.35,0.85);
  vec3 mid = vec3(0.45,0.68,0.92);
  vec3 hor = vec3(0.78,0.85,0.95);
  vec3 sky = mix(hor, mid, pow(y,0.5));
  sky = mix(sky, top, pow(y,2.0));
  float sunDot = dot(rayDir, sunDir);
  float mie = pow(max(sunDot,0.0), 80.0)*0.4 + pow(max(sunDot,0.0), 600.0)*1.0;
  sky += mie * vec3(1.0,0.9,0.7);
  float sunDisk = smoothstep(0.9995,0.99985,sunDot);
  sky += sunDisk * uSunColor * 2.0;
  return sky;
}

void main() {
  vec3 ro = uCameraPos;
  vec3 rd = normalize(vWorldPos - uCameraPos);

  // If looking down too much, no clouds (or very faint)
  if(rd.y < -0.15) {
    discard;
  }

  // Box intersection - cloud layer box
  vec3 boxMin = uBoxMin;
  vec3 boxMax = uBoxMax;
  vec2 boxHit = rayBox(ro, rd, boxMin, boxMax);
  float tMin = max(boxHit.x, 0.0);
  float tMax = boxHit.y;

  if(tMax < tMin || tMax < 0.0) {
    discard;
  }

  // Limit far
  tMax = min(tMax, 30000.0);

  // Raymarch
  int steps = 48;
  float stepSize = (tMax - tMin) / float(steps);
  // Add jitter for noise reduction (temporal would be better, but simple)
  float jitter = hash(gl_FragCoord.xy) * stepSize;
  float t = tMin + jitter;

  vec3 col = vec3(0.0);
  float transmittance = 1.0;
  float totalAlpha = 0.0;

  float cosTheta = dot(rd, normalize(uSunDirection));
  float phase = dualLobeHG(cosTheta, 0.3, -0.2, 0.6);

  for(int i=0;i<48;i++) {
    if(i >= steps) break;
    if(transmittance < 0.01) break;
    vec3 pos = ro + rd * t;
    float heightFrac = (pos.y - uCloudBottom) / (uCloudTop - uCloudBottom);
    if(heightFrac < 0.0 || heightFrac > 1.0) {
      t += stepSize;
      continue;
    }

    float density = sampleCloudDensity(pos, heightFrac, false);
    if(density > 0.001) {
      // Light
      float lightTrans = lightTransmittance(pos, normalize(uSunDirection));
      float powderTerm = powder(density * 1.5);

      vec3 sunLight = uSunColor * lightTrans * phase * powderTerm;
      // Ambient - sky light
      vec3 ambient = getSkyColor(vec3(0.0,1.0,0.0), normalize(uSunDirection)) * 0.25 + vec3(0.4,0.6,0.8)*0.15;

      vec3 scattering = (ambient + sunLight * 2.0) * density;

      // Beer's law for view
      float opticalDepth = density * stepSize * 0.0007;
      float beerTrans = beer(opticalDepth);

      col += scattering * transmittance * stepSize * 0.008 * (1.0 - beerTrans * 0.8);
      transmittance *= beerTrans;

      // For alpha
      totalAlpha += (1.0 - beerTrans) * (1.0 - totalAlpha);
    }
    t += stepSize * (1.0 + density*0.3); // adaptive step - larger inside clouds
  }

  // If almost transparent, discard to show sky behind
  if(totalAlpha < 0.01) {
    discard;
  }

  // Add some aerial perspective fade at distance
  float dist = tMin;
  float fade = 1.0 - exp(-dist * 0.00002);
  vec3 skyCol = getSkyColor(rd, normalize(uSunDirection));
  col = mix(col, skyCol * 0.2, fade);

  // Tone mapping will be handled by renderer, output linear
  float alpha = 1.0 - transmittance;
  alpha = clamp(alpha, 0.0, 1.0);
  alpha *= smoothstep(0.0, 0.2, rd.y + 0.1); // fade at horizon

  gl_FragColor = vec4(col, alpha);
}
`;

export class VolumetricClouds {
  constructor() {
    const bottom = 1500;
    const top = 4000;
    const size = 60000;
    const height = top - bottom;
    // Box geometry covering cloud layer
    const geometry = new THREE.BoxGeometry(size, height, size);
    // Center at mid of cloud layer
    const midY = (bottom + top) * 0.5;

    const uniforms = {
      uCameraPos: { value: new THREE.Vector3() },
      uSunDirection: { value: new THREE.Vector3(0.3, 0.5, 0.2) },
      uSunColor: { value: new THREE.Color(1.0, 0.97, 0.9) },
      uTime: { value: 0 },
      uCoverage: { value: 0.52 },
      uDensity: { value: 0.85 },
      uAbsorption: { value: 0.85 },
      uWindSpeed: { value: 0.25 },
      uEdgeSoftness: { value: 0.45 },
      uWindDirection: { value: new THREE.Vector2(1, 0.4) },
      uCloudBottom: { value: bottom },
      uCloudTop: { value: top },
      uBoxMin: { value: new THREE.Vector3(-size/2, bottom, -size/2) },
      uBoxMax: { value: new THREE.Vector3(size/2, top, size/2) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = midY;
    this.mesh.frustumCulled = false;
    this.uniforms = uniforms;
    this.material = material;
    this.bottom = bottom;
    this.top = top;
    this.size = size;
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCameraPos.value.copy(camera.position);
    // Update box bounds based on mesh position (centered on camera XZ)
    const half = this.size * 0.5;
    const cx = this.mesh.position.x;
    const cz = this.mesh.position.z;
    this.uniforms.uBoxMin.value.set(cx - half, this.bottom, cz - half);
    this.uniforms.uBoxMax.value.set(cx + half, this.top, cz + half);
  }

  setSunDirection(dir) {
    this.uniforms.uSunDirection.value.copy(dir);
  }

  setCoverage(v) {
    this.uniforms.uCoverage.value = v;
  }
  setDensity(v) {
    this.uniforms.uDensity.value = v;
  }
  setSpeed(v) {
    this.uniforms.uWindSpeed.value = v;
  }
  setAbsorption(v) {
    this.uniforms.uAbsorption.value = v;
  }
  setEdgeSoftness(v) {
    this.uniforms.uEdgeSoftness.value = v;
  }
}

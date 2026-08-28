import * as THREE from 'three';

const oceanVert = `
uniform float uTime;
uniform float uWaveHeight;
uniform float uChoppiness;
uniform float uWindSpeed;
uniform vec2 uWindDirection;

varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vWaveHeight;
varying float vFoam;
varying vec3 vTangent;
varying vec3 vBinormal;

#define PI 3.14159265359

// Gerstner wave
struct Wave {
  vec2 dir;
  float steepness;
  float wavelength;
  float speed;
  float amplitude;
};

// Cheap hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 gerstnerWave(Wave w, vec3 p, inout vec3 tangent, inout vec3 binormal, inout float foamAccum) {
  float k = 2.0 * PI / w.wavelength;
  float c = sqrt(9.8 / k);
  float a = w.steepness / k; // amplitude from steepness
  // wind effect on amplitude
  a *= uWaveHeight;

  float f = k * dot(w.dir, p.xz) - c * uTime * w.speed * uWindSpeed;
  float cosF = cos(f);
  float sinF = sin(f);

  // displacement
  vec3 disp;
  disp.x = w.dir.x * a * cosF * uChoppiness;
  disp.z = w.dir.y * a * cosF * uChoppiness;
  disp.y = a * sinF;

  // derivatives for normal
  float dX = -k * w.dir.x * w.dir.x * a * sinF * uChoppiness;
  float dZ = -k * w.dir.y * w.dir.y * a * sinF * uChoppiness;
  float dYx = k * w.dir.x * a * cosF;
  float dYz = k * w.dir.y * a * cosF;

  tangent += vec3(dX, dYx, 0.0);
  binormal += vec3(0.0, dYz, dZ);

  // foam approx from Jacobian
  float J = (1.0 + dX) * (1.0 + dZ);
  foamAccum += max(0.0, 1.0 - J);

  return disp;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  vec3 displaced = vec3(0.0);
  float foam = 0.0;

  // Wind direction normalized
  vec2 windDir = normalize(uWindDirection);

  // Define wave spectrum - from large swell to small ripples
  // We use 16 waves for realistic ocean
  Wave waves[16];
  // Large swell
  waves[0] = Wave(windDir, 0.18, 180.0, 0.8, 1.0);
  waves[1] = Wave(vec2(windDir.x*0.9 - windDir.y*0.2, windDir.y*0.9 + windDir.x*0.2), 0.12, 120.0, 0.9, 1.0);
  waves[2] = Wave(vec2(windDir.x*0.8 + windDir.y*0.3, windDir.y*0.8 - windDir.x*0.3), 0.10, 90.0, 1.0, 1.0);
  // Medium waves
  waves[3] = Wave(vec2(windDir.x*0.7 - windDir.y*0.5, windDir.y*0.7 + windDir.x*0.5), 0.08, 60.0, 1.1, 1.0);
  waves[4] = Wave(vec2(windDir.x*0.6 + windDir.y*0.6, windDir.y*0.6 - windDir.x*0.6), 0.07, 45.0, 1.15, 1.0);
  waves[5] = Wave(vec2(-windDir.y*0.3 + windDir.x*0.8, windDir.x*0.3 + windDir.y*0.8), 0.06, 35.0, 1.2, 1.0);
  waves[6] = Wave(vec2(windDir.x*0.9 + windDir.y*0.2, windDir.y*0.9 - windDir.x*0.2), 0.05, 28.0, 1.25, 1.0);
  // Small chop
  waves[7] = Wave(vec2(windDir.x*0.5 - windDir.y*0.8, windDir.y*0.5 + windDir.x*0.8), 0.04, 18.0, 1.3, 1.0);
  waves[8] = Wave(vec2(windDir.x*0.4 + windDir.y*0.7, windDir.y*0.4 - windDir.x*0.7), 0.035, 14.0, 1.35, 1.0);
  waves[9] = Wave(vec2(windDir.x*0.3 - windDir.y*0.6, windDir.y*0.3 + windDir.x*0.6), 0.03, 11.0, 1.4, 1.0);
  waves[10] = Wave(vec2(windDir.y, -windDir.x), 0.025, 9.0, 1.45, 1.0);
  waves[11] = Wave(vec2(-windDir.x*0.2 + windDir.y*0.9, -windDir.y*0.2 - windDir.x*0.9), 0.02, 7.0, 1.5, 1.0);
  // Capillary
  waves[12] = Wave(vec2(windDir.x*0.9, windDir.y*0.9), 0.015, 5.0, 1.6, 1.0);
  waves[13] = Wave(vec2(windDir.x*0.2 + windDir.y*0.8, windDir.y*0.2 - windDir.x*0.8), 0.012, 3.5, 1.7, 1.0);
  waves[14] = Wave(vec2(-windDir.y, windDir.x), 0.01, 2.5, 1.8, 1.0);
  waves[15] = Wave(vec2(windDir.x, windDir.y), 0.008, 1.8, 1.9, 1.0);

  vec3 totalDisp = vec3(0.0);
  tangent = vec3(0.0);
  binormal = vec3(0.0);

  for(int i=0; i<16; i++) {
    vec3 d = gerstnerWave(waves[i], pos, tangent, binormal, foam);
    totalDisp += d;
  }

  // Build tangent frame
  tangent = normalize(vec3(1.0, 0.0, 0.0) + tangent);
  binormal = normalize(vec3(0.0, 0.0, 1.0) + binormal);

  pos += totalDisp;

  vPos = pos;
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  vTangent = tangent;
  vBinormal = binormal;
  vNormal = normalize(cross(binormal, tangent));
  vWaveHeight = totalDisp.y;
  vFoam = clamp(foam * 0.35, 0.0, 1.0);

  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`;

const oceanFrag = `
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uWaterColorDeep;
uniform vec3 uWaterColorShallow;
uniform vec3 uFoamColor;
uniform float uRoughness;
uniform float uTime;
uniform vec3 uCameraPos;

varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vWaveHeight;
varying float vFoam;
varying vec3 vTangent;
varying vec3 vBinormal;

#define PI 3.14159265359

// PBR helpers
float D_GGX(float NoH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float denom = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom);
}

float V_SmithGGXCorrelated(float NoV, float NoL, float roughness) {
  float a2 = roughness * roughness;
  // a2 = a2 * a2 for better tail
  float GGXV = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float GGXL = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / (GGXV + GGXL);
}

vec3 F_Schlick(vec3 F0, float VoH) {
  return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

float F_SchlickScalar(float F0, float VoH) {
  return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

// Sky color function - shared with sky shader
vec3 getSkyColor(vec3 rayDir, vec3 sunDir) {
  float sunDot = dot(rayDir, sunDir);
  float y = max(rayDir.y, 0.0);

  // Base sky gradient
  vec3 skyTop = vec3(0.15, 0.35, 0.85);
  vec3 skyMid = vec3(0.45, 0.68, 0.92);
  vec3 skyHorizon = vec3(0.78, 0.85, 0.95);
  vec3 skyColor = mix(skyHorizon, skyMid, pow(y, 0.5));
  skyColor = mix(skyColor, skyTop, pow(y, 2.0));

  // Sun elevation tint - warm near horizon sunset
  float sunElev = sunDir.y;
  float horizonWarm = smoothstep(0.0, 0.3, sunElev);
  vec3 warmTint = vec3(1.0, 0.6, 0.35) * (1.0 - horizonWarm) * 0.6;
  float horizonFactor = pow(1.0 - y, 4.0);
  skyColor += warmTint * horizonFactor;

  // Mie scattering halo around sun
  float mie = pow(max(sunDot, 0.0), 600.0) * 1.5;
  float mie2 = pow(max(sunDot, 0.0), 40.0) * 0.25;
  skyColor += (mie + mie2) * vec3(1.0, 0.9, 0.7) * 0.8;

  // Sun disk
  float sunDisk = smoothstep(0.9996, 0.99985, sunDot);
  skyColor += sunDisk * uSunColor * 2.0;

  return skyColor;
}

// Foam and detail normal
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 L = normalize(uSunDirection);
  vec3 H = normalize(V + L);

  float NoV = max(dot(N, V), 0.001);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float LoV = max(dot(L, V), 0.0);

  // Fresnel - water F0 = 0.02
  vec3 F0 = vec3(0.02);
  float F = F_SchlickScalar(0.02, NoV);
  vec3 F_full = F_Schlick(F0, VoH);

  // Roughness variation with foam and wave slope
  float roughness = uRoughness;
  roughness += vFoam * 0.4; // foam is rougher
  roughness = clamp(roughness, 0.02, 0.9);

  // Add micro facet detail from noise for capillary waves
  float detailNoise = noise(vWorldPos.xz * 0.05 + uTime * 0.1) * 0.5 + noise(vWorldPos.xz * 0.1 - uTime * 0.15) * 0.5;
  N = normalize(N + vec3(detailNoise*0.1-0.05, 0.0, detailNoise*0.1-0.05));
  // Recompute after perturbation
  NoV = max(dot(N, V), 0.001);
  NoL = max(dot(N, L), 0.0);
  NoH = max(dot(N, H), 0.0);

  // Specular PBR
  float D = D_GGX(NoH, roughness);
  float Vis = V_SmithGGXCorrelated(NoV, NoL, roughness);
  vec3 specular = vec3(D * Vis) * F_full * NoL;
  specular *= uSunColor * 2.5; // sun intensity

  // Reflection - sky
  vec3 R = reflect(-V, N);
  vec3 skyRefl = getSkyColor(R, L);
  // Modulate reflection by Fresnel and roughness
  float reflMip = roughness * 4.0;
  vec3 reflection = skyRefl * F;

  // Refraction / subsurface / water color
  float depthFactor = pow(1.0 - NoV, 1.5); // more shallow at grazing?
  // Actually water color based on wave height and view
  float heightFactor = smoothstep(-2.0, 3.0, vWaveHeight);
  vec3 waterColor = mix(uWaterColorDeep, uWaterColorShallow, heightFactor * 0.6 + depthFactor * 0.4);

  // Subsurface scattering - light passing through wave peaks
  float sss = pow(max(dot(V, -L) * 0.5 + 0.5, 0.0), 4.0) * max(0.0, vWaveHeight) * 0.3;
  sss *= (1.0 - NoV);
  waterColor += uWaterColorShallow * sss * 1.5;

  // Diffuse
  vec3 diffuse = waterColor * (1.0 - F) * NoL * 0.5;
  // Ambient from sky
  vec3 ambientSky = getSkyColor(N, L) * 0.3;
  vec3 ambient = waterColor * ambientSky * (1.0 - F) * 0.6;

  // Foam
  float foamThreshold = smoothstep(0.4, 0.9, vFoam + heightFactor*0.2);
  foamThreshold += smoothstep(1.5, 3.5, vWaveHeight) * 0.5;
  foamThreshold = clamp(foamThreshold, 0.0, 1.0);
  // Add foam pattern
  float foamNoise = noise(vWorldPos.xz * 0.08 + uTime * 0.05);
  foamThreshold *= (0.7 + foamNoise * 0.6);
  vec3 foamColor = uFoamColor * (0.8 + foamNoise*0.4);
  // Foam specular is more diffuse
  float foamRough = 0.7;

  // Final color mixing
  vec3 color = diffuse + ambient + specular + reflection * 0.8;
  color = mix(color, foamColor, foamThreshold);

  // Distance fog / atmospheric perspective - fade to sky at horizon
  float dist = length(vWorldPos.xz - uCameraPos.xz);
  float fogFactor = 1.0 - exp(-dist * 0.00006);
  vec3 fogColor = getSkyColor(normalize(vec3(0.0, 0.15, 1.0)), L);
  // Height fog - less fog when looking down
  fogFactor *= smoothstep(0.0, 0.3, V.y + 0.2);
  color = mix(color, fogColor, fogFactor * 0.7);

  // Tonemapping will be done by renderer, but add slight exposure
  // Gamma correction handled by renderer outputColorSpace

  gl_FragColor = vec4(color, 1.0);
  // For debugging foam: gl_FragColor = vec4(vec3(foamThreshold),1.0);
}
`;

export class Ocean {
  constructor() {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 900;
    const res = isMobile ? 256 : 512;
    const geometry = new THREE.PlaneGeometry(20000, 20000, res, res);
    // We'll keep plane horizontal, then rotate in shader? Actually PlaneGeometry is XY, we want XZ. Rotate -90 deg in geometry
    geometry.rotateX(-Math.PI / 2);

    const uniforms = {
      uTime: { value: 0 },
      uWaveHeight: { value: 1.1 },
      uChoppiness: { value: 1.3 },
      uWindSpeed: { value: 1.2 },
      uWindDirection: { value: new THREE.Vector2(1, 0.6) },
      uSunDirection: { value: new THREE.Vector3(0.3, 0.5, 0.2) },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uWaterColorDeep: { value: new THREE.Color(0x0a2a4a) },
      uWaterColorShallow: { value: new THREE.Color(0x1a7a8a) },
      uFoamColor: { value: new THREE.Color(0xe8f0f5) },
      uRoughness: { value: 0.25 },
      uCameraPos: { value: new THREE.Vector3() },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: oceanVert,
      fragmentShader: oceanFrag,
      uniforms,
      transparent: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.uniforms = uniforms;
    this.material = material;
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCameraPos.value.copy(camera.position);
  }

  setSunDirection(dir) {
    this.uniforms.uSunDirection.value.copy(dir);
  }

  setWindSpeed(v) {
    this.uniforms.uWindSpeed.value = v;
  }

  setWaveHeight(v) {
    this.uniforms.uWaveHeight.value = v;
  }

  setChoppiness(v) {
    this.uniforms.uChoppiness.value = v;
  }

  setRoughness(v) {
    this.uniforms.uRoughness.value = v;
  }

  onResize() {}
}

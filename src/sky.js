import * as THREE from 'three';

const skyVert = `
varying vec3 vWorldPosition;
varying vec3 vViewDirection;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vViewDirection = normalize(worldPos.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const skyFrag = `
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uTime;
uniform vec3 uCameraPos;

varying vec3 vWorldPosition;
varying vec3 vViewDirection;

#define PI 3.14159265359

vec3 getSkyColor(vec3 rayDir, vec3 sunDir, vec3 sunColor) {
  float sunDot = dot(rayDir, sunDir);
  float y = max(rayDir.y, 0.0);

  // Atmospheric scattering approx
  // Rayleigh + Mie
  float sunElev = sunDir.y;
  float rayleighFactor = pow(1.0 - max(0.0, dot(rayDir, vec3(0,1,0))), 2.0);

  // Base gradient
  vec3 top = vec3(0.08, 0.22, 0.65);
  vec3 mid = vec3(0.35, 0.60, 0.92);
  vec3 horizon = vec3(0.75, 0.85, 0.95);

  vec3 sky = mix(horizon, mid, pow(y, 0.45));
  sky = mix(sky, top, pow(y, 2.2));

  // Warm tint at sunset
  float sunset = 1.0 - smoothstep(0.0, 0.4, sunElev);
  vec3 sunsetCol = vec3(1.0, 0.45, 0.25) * sunset * 0.8;
  float horizonBlend = pow(1.0 - y, 5.0);
  sky += sunsetCol * horizonBlend;

  // Add slight desaturation near sun elevation low
  if(sunElev < 0.2) {
    float t = smoothstep(0.2, -0.1, sunElev);
    sky = mix(sky, vec3(1.0, 0.6, 0.4) * 0.9, t * horizonBlend * 0.5);
  }

  // Mie scattering around sun - large halo
  float mie1 = pow(max(sunDot, 0.0), 800.0) * 2.0;
  float mie2 = pow(max(sunDot, 0.0), 80.0) * 0.6;
  float mie3 = pow(max(sunDot, 0.0), 8.0) * 0.08;
  vec3 mieColor = vec3(1.0, 0.9, 0.75);
  sky += (mie1 + mie2) * mieColor * 0.9;
  sky += mie3 * vec3(0.8,0.85,1.0) * 0.3;

  // Sun disk
  float sunDisk = smoothstep(0.9995, 0.99985, sunDot);
  // Fade sun when below horizon
  float sunVisible = smoothstep(-0.1, 0.1, sunElev);
  sky += sunDisk * sunColor * 8.0 * sunVisible;

  // Stars at night - simple
  if(sunElev < 0.1) {
    float night = 1.0 - smoothstep(-0.1, 0.2, sunElev);
    // cheap star noise
    vec3 rd = rayDir;
    float starNoise = fract(sin(dot(floor(rd*400.0), vec2(12.9898,78.233))) * 43758.5453);
    float star = step(0.998, starNoise) * night * pow(y, 0.5);
    sky += star * vec3(1.0) * 2.0;
  }

  return sky;
}

void main() {
  vec3 viewDir = normalize(vWorldPosition - uCameraPos);
  // Ensure sky dome is always around camera
  vec3 sunDir = normalize(uSunDirection);
  vec3 color = getSkyColor(viewDir, sunDir, uSunColor);

  // Vignette subtle
  float vignette = 1.0 - dot(vViewDirection.xz, vViewDirection.xz) * 0.1;
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;

export class SkyDome {
  constructor() {
    const geometry = new THREE.SphereGeometry(40000, 32, 32);
    const uniforms = {
      uSunDirection: { value: new THREE.Vector3(0.3, 0.5, 0.2) },
      uSunColor: { value: new THREE.Color(1.0, 0.98, 0.9) },
      uTime: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.uniforms = uniforms;
  }

  setSunDirection(dir) {
    this.uniforms.uSunDirection.value.copy(dir);
  }

  update(time, camera) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCameraPos.value.copy(camera.position);
    this.mesh.position.copy(camera.position);
  }
}

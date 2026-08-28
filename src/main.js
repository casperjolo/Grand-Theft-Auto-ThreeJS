import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { Ocean } from './ocean.js';
import { SkyDome } from './sky.js';
import { VolumetricClouds } from './clouds.js';

const container = document.getElementById('canvas-container');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
container.appendChild(renderer.domElement);

// Scene
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8fa8c8, 0.00002);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 80000);
camera.position.set(0, 80, 350);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 5000;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minPolarAngle = 0.1;
controls.target.set(0, 30, 0);
controls.autoRotate = false;
controls.autoRotateSpeed = 0.15;
controls.update();

// Lighting
const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.set(300, 400, 175);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x8aa8d8, 0.35));

// Params
const params = {
  timeScale: 0.6,
  windSpeed: 1.2,
  waveHeight: 1.1,
  oceanRoughness: 0.25,
  choppiness: 1.3,
  sunElevation: 38,
  sunAzimuth: 135,
  cloudCoverage: 0.52,
  cloudDensity: 0.85,
  cloudSpeed: 0.25,
  cloudLightAbsorption: 0.85,
  cloudEdgeSoftness: 0.45,
  exposure: 0.85,
  autoRotate: false,
};

// Helpers to compute sun direction from angles
function updateSunPosition() {
  const phi = THREE.MathUtils.degToRad(90 - params.sunElevation);
  const theta = THREE.MathUtils.degToRad(params.sunAzimuth);
  const dir = new THREE.Vector3();
  dir.setFromSphericalCoords(1, phi, theta);
  sunLight.position.copy(dir).multiplyScalar(10000);
  return dir;
}
let sunDirection = updateSunPosition();

// Sky
const sky = new SkyDome();
scene.add(sky.mesh);

// Clouds
const clouds = new VolumetricClouds();
scene.add(clouds.mesh);

// Ocean
const ocean = new Ocean();
scene.add(ocean.mesh);

// GUI
const gui = new GUI({ title: 'Tech Demo Controls' });
const sunFolder = gui.addFolder('Sun / Atmosphere');
sunFolder.add(params, 'sunElevation', 0, 89, 0.5).name('Elevation').onChange((v) => {
  sunDirection = updateSunPosition();
  sky.setSunDirection(sunDirection);
  ocean.setSunDirection(sunDirection);
  clouds.setSunDirection(sunDirection);
});
sunFolder.add(params, 'sunAzimuth', 0, 360, 0.5).name('Azimuth').onChange(() => {
  sunDirection = updateSunPosition();
  sky.setSunDirection(sunDirection);
  ocean.setSunDirection(sunDirection);
  clouds.setSunDirection(sunDirection);
});
sunFolder.add(params, 'exposure', 0.2, 2.0, 0.01).name('Exposure').onChange(v => renderer.toneMappingExposure = v);

const oceanFolder = gui.addFolder('PBR Ocean');
oceanFolder.add(params, 'timeScale', 0, 2, 0.01).name('Time Scale');
oceanFolder.add(params, 'windSpeed', 0, 3, 0.01).name('Wind Speed').onChange(v => ocean.setWindSpeed(v));
oceanFolder.add(params, 'waveHeight', 0.1, 3, 0.01).name('Wave Height').onChange(v => ocean.setWaveHeight(v));
oceanFolder.add(params, 'choppiness', 0.1, 3, 0.01).name('Choppiness').onChange(v => ocean.setChoppiness(v));
oceanFolder.add(params, 'oceanRoughness', 0.01, 0.8, 0.01).name('Roughness').onChange(v => ocean.setRoughness(v));

const cloudFolder = gui.addFolder('Volumetric Clouds');
cloudFolder.add(params, 'cloudCoverage', 0, 1, 0.01).name('Coverage').onChange(v => clouds.setCoverage(v));
cloudFolder.add(params, 'cloudDensity', 0.1, 2, 0.01).name('Density').onChange(v => clouds.setDensity(v));
cloudFolder.add(params, 'cloudSpeed', 0, 2, 0.01).name('Wind Speed').onChange(v => clouds.setSpeed(v));
cloudFolder.add(params, 'cloudLightAbsorption', 0.1, 2, 0.01).name('Light Absorption').onChange(v => clouds.setAbsorption(v));
cloudFolder.add(params, 'cloudEdgeSoftness', 0.01, 1, 0.01).name('Edge Softness').onChange(v => clouds.setEdgeSoftness(v));

const camFolder = gui.addFolder('Camera');
camFolder.add(params, 'autoRotate').name('Auto Orbit').onChange(v => controls.autoRotate = v);

gui.close();

// Init uniforms
sky.setSunDirection(sunDirection);
ocean.setSunDirection(sunDirection);
clouds.setSunDirection(sunDirection);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  ocean.onResize();
});

// Time
const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsCount = 0;
let lastFpsUpdate = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  fpsAccum += delta;
  fpsCount++;
  if (elapsed - lastFpsUpdate > 0.5) {
    const fps = Math.round(fpsCount / (elapsed - lastFpsUpdate));
    document.getElementById('fps').textContent = `FPS: ${fps} | tris: ${(renderer.info.render.triangles / 1000).toFixed(0)}k | time: ${elapsed.toFixed(1)}s`;
    lastFpsUpdate = elapsed;
    fpsCount = 0;
  }

  controls.update();

  const t = elapsed * params.timeScale;

  // Keep ocean centered near camera for infinite feel
  ocean.mesh.position.x = camera.position.x;
  ocean.mesh.position.z = camera.position.z;
  // Keep clouds centered
  clouds.mesh.position.x = camera.position.x;
  clouds.mesh.position.z = camera.position.z;

  ocean.update(t, camera);
  clouds.update(t, camera);
  sky.update(t, camera);

  renderer.render(scene, camera);
}

animate();

// Initial sun set
updateSunPosition();

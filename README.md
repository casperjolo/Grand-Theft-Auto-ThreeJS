# Volumetric Clouds × PBR Ocean — Real-Time Tech Demo

Realistic **volumetric raymarched clouds** + **Gerstner-wave PBR ocean** in Three.js, built as a high-fidelity tech demo.

> Live: `npm run dev` → http://localhost:5173

## Features

### 🌊 PBR Ocean
- **16 summed Gerstner waves** — from 180m swell to 1.8m capillary ripples, with wind-driven direction spread and choppiness (horizontal displacement)
- **Analytical normals** via tangent/binormal Jacobian — no finite differences
- **Full GGX PBR**: Smith correlated visibility, GGX NDF, Schlick Fresnel (F0=0.02 for water)
- **PBR water shading**:
  - Deep vs shallow color based on wave height + Fresnel
  - Fresnel reflection of procedural sky (raytraced sky function shared between sky/ocean/clouds)
  - Subsurface scattering through wave peaks (light transmission)
  - Micro-facet detail noise for capillary waves
  - Jacobian-based foam — crest breaking when waves fold, with noise patterning
- **Infinite ocean** — plane follows camera, distance fog fades to atmospheric horizon
- **Performance**: 512×512 grid (262k verts), vertex displacement fully GPU-side

### ☁️ Volumetric Clouds
- **Raymarched in world space** inside a 60km × 2.5km thick box (1500–4000m altitude)
- **Noise stack**:
  - Value-noise FBM (5 octaves) for large structure
  - Worley FBM (cellular) for cauliflower detail — 27-cell search per sample
  - Perlin-Worley remapping (Unreal/Horizon approach)
  - Detail erosion: high-frequency Worley subtracted at cloud tops for wispy anvil
- **Physically based lighting**:
  - Beer's law extinction: `exp(-σ·d)`
  - Dual-lobe Henyey-Greenstein phase (g=0.3 forward, -0.2 back, 0.6 mix) for silver lining
  - Powder effect: `1 - exp(-2σ)` for bright edges
  - Light raymarch: 6 steps towards sun per sample to compute transmittance
- **Height gradient**: bottom/top fade + mid boost for flat cumulus base
- **Optimizations**: adaptive step size (bigger inside dense cloud), early exit when transmittance <1%, jittered start to reduce banding, half-res detail for light rays
- **Wind advection**: time-driven UV offset with configurable direction

### 🌤️ Atmospheric Sky
- Procedural sky dome (40km radius) with Rayleigh-like gradient + Mie halo
- Sun disk (0.9995–0.99985 smoothstep) with elevation-dependent warm tint for sunset
- Shared `getSkyColor(rayDir, sunDir)` function ensures consistent reflections in ocean & ambient for clouds
- Night stars when sun below horizon
- ACES Filmic tone mapping + sRGB output

### 🎛️ PBR Pipeline
- `ACESFilmicToneMapping`, exposure control
- Linear workflow, `SRGBColorSpace`
- OrbitControls with damping, auto-orbit option
- lil-gui for live tweaking: sun elevation/azimuth, wave height, choppiness, roughness, wind, cloud coverage/density/absorption/edge softness
- Stats overlay: FPS, triangle count, elapsed time

## Tech Stack
- Three.js r160, Vite 5, lil-gui
- Pure GLSL shaders — no textures, fully procedural
- WebGL2

## Controls
- Drag to orbit, scroll to zoom, right-drag to pan
- GUI (top-right) to tweak atmosphere, ocean, clouds

## How It Works (Brief)

**Ocean**: Vertex shader sums 16 Gerstner waves. Each wave defined by direction, steepness (converted to amplitude via `a = steepness/k`), wavelength, speed. Horizontal displacement scaled by `uChoppiness` for sharp crests. Tangent/binormal accumulated for correct normals. Foam from Jacobian `J = (1+dX)(1+dZ)` → `foam = 1-J`.

**Clouds**: Fragment shader ray-box intersects camera ray with cloud layer AABB. Then 48 steps from entry to exit. At each step sample density via `perlinWorley * heightGradient * coverage`. If density>0, march 6 steps to sun for light transmittance. Accumulate scattering `Σ (sun*phase*powder + ambient) * density * transmittance * step`. Front-to-back blending with Beer's law.

## Run

```bash
npm install
npm run dev
```

## Structure
```
src/
  main.js      — scene, camera, controls, GUI
  ocean.js     — PBR Gerstner ocean ShaderMaterial
  sky.js       — procedural atmosphere dome
  clouds.js    — volumetric raymarch box
```

## Future Improvements
- Temporal reprojection + blue-noise for cloud denoising
- FFT ocean (Tessendorf) for even more realism
- Shadow mapping from clouds onto ocean
- Volumetric god rays
- Half-res cloud render target + bilateral upsample

— Built as a PBR tech demo showcase.

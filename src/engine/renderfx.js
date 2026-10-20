/* =========================================================================
   MODULE: renderfx.js
   The engine's "photo" layer: an outdoor sky environment for reflections,
   ambient occlusion where walls meet slabs and eaves meet walls, and MSAA —
   all from three's own examples, no extra dependencies.

   Quality is tiered. Phones, native shells and weak machines get the plain
   renderer (still with the outdoor environment, which is free per frame);
   capable desktops get the post-processing chain. A frame-time guard drops a
   struggling machine back to the plain path at runtime, so nobody is stuck
   with a stuttering model.
   ========================================================================= */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/* "high" | "low" — decided once per engine from what the device can take. */
export function pickQuality(requested = "auto") {
  if (requested === "high" || requested === "low") return requested;
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const native = !!window.Capacitor?.isNativePlatform?.();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  return !coarse && !native && cores >= 6 && mem >= 4 ? "high" : "low";
}

/* A daylight sky to light the model with: blue zenith, hazy horizon, warm
   ground bounce and a hot sun disc where the key light is. Glass, Colorbond
   and glazed tiles reflect an outdoor sky instead of a studio box. */
export function skyEnvironment(renderer, sunDir) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x6f9fd0) },
        horizon: { value: new THREE.Color(0xe4ebee) },
        ground: { value: new THREE.Color(0x7a7262) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 sky = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55));
          vec3 col = y >= 0.0 ? sky : mix(horizon * 0.85, ground, clamp(-y * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(col * 1.15, 1.0);
        }`,
    })
  );
  scene.add(dome);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8), new THREE.MeshBasicMaterial());
  sun.material.color.setRGB(40, 36, 30); // HDR — PMREM keeps the highlight
  sun.position.copy(sunDir).normalize().multiplyScalar(44);
  scene.add(sun);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  dome.geometry.dispose(); dome.material.dispose();
  sun.geometry.dispose(); sun.material.dispose();
  return tex;
}

/* Post chain for the high tier: MSAA render → GTAO → tone map/sRGB output. */
export function createComposer(renderer, scene, camera, w, h) {
  const pr = Math.min(1.25, window.devicePixelRatio || 1);
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, w, h);
  ao.output = GTAOPass.OUTPUT.Default;
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return { composer, ao, rt };
}

/* Watches frame times while the model is moving; after a sustained run of
   slow frames it calls onSlow once. */
export function frameGuard(onSlow, { budgetMs = 30, window: n = 90 } = {}) {
  let last = 0, slow = 0, seen = 0, tripped = false;
  return {
    tick(now) {
      if (tripped) return;
      if (last) {
        const dt = now - last;
        if (dt < 250) { seen++; if (dt > budgetMs) slow++; } // ignore tab switches
        if (seen >= n) {
          if (slow / seen > 0.6) { tripped = true; onSlow(); }
          seen = 0; slow = 0;
        }
      }
      last = now;
    },
    reset() { last = 0; },
  };
}

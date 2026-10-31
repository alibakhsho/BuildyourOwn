/* =========================================================================
   MODULE: renderfx.js
   The engine's "photo" layer — the post chain that turns a shaded model into
   a rendering: multisampled HDR render → ground-truth ambient occlusion
   (contact shading where walls meet slabs and eaves meet walls) → a touch of
   bloom on sun-struck metal and glass → selection outlines → SMAA → tone
   mapping and sRGB output. All from three's own examples, no dependencies.

   Quality is tiered. Phones, native shells and weak machines get the plain
   renderer (still with the sky environment, which is free per frame);
   capable desktops get the chain. A frame-time guard drops a struggling
   machine back to the plain path at runtime, so nobody is stuck with a
   stuttering model.
   ========================================================================= */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/* "high" | "low" — decided once per engine from what the device can take. */
export function pickQuality(requested = "auto") {
  if (requested === "high" || requested === "low") return requested;
  if (typeof window === "undefined") return "low";
  // the user's own choice (Studio → Environment → Photo quality), or ?q3d=high|low
  try {
    const forced = new URLSearchParams(window.location.search).get("q3d") || localStorage.getItem("byo.3d.quality");
    if (forced === "high" || forced === "low") return forced;
  } catch { /* storage blocked */ }
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const native = !!window.Capacitor?.isNativePlatform?.();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  return !coarse && !native && cores >= 6 && mem >= 4 ? "high" : "low";
}

/* Post chain for the high tier. Returns the passes so the engine can tune
   them live (AO strength, bloom, outline colour) and resize them. */
export function createComposer(renderer, scene, camera, w, h) {
  const pr = Math.min(1.25, window.devicePixelRatio || 1);
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ao = new GTAOPass(scene, camera, w, h);
  ao.output = GTAOPass.OUTPUT.Default;
  ao.blendIntensity = 0.9;
  ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.0, scale: 1, samples: 14, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(ao);

  // only the very brightest pixels bloom: sun glints on glass, Colorbond and chrome
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.45, 0.92);
  composer.addPass(bloom);

  // selection / hover outlines (fed by the editor; off until something is selected)
  const outline = new OutlinePass(new THREE.Vector2(w, h), scene, camera);
  outline.edgeStrength = 4;
  outline.edgeThickness = 1.2;
  outline.edgeGlow = 0;
  outline.visibleEdgeColor.set(0xf5c518);
  outline.hiddenEdgeColor.set(0x8a6a00);
  outline.enabled = false;
  composer.addPass(outline);

  const smaa = new SMAAPass(w * pr, h * pr);
  composer.addPass(smaa);
  composer.addPass(new OutputPass());

  return {
    composer, rt, renderPass, ao, bloom, outline, smaa, pr,
    setSize(width, height) {
      composer.setSize(width, height);
      ao.setSize(width, height);
      bloom.setSize(width, height);
      outline.setSize(width, height);
      smaa.setSize(width * pr, height * pr);
    },
    dispose() {
      composer.dispose?.(); rt.dispose();
      ao.dispose?.(); bloom.dispose?.(); outline.dispose?.(); smaa.dispose?.();
    },
  };
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

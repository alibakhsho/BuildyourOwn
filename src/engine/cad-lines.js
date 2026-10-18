/* =========================================================================
   MODULE: cad-lines.js
   SketchUp/CAD-style linework over the shaded model. The scene's normals
   and depth are rendered to a texture; a screen pass finds every crease and
   silhouette (normal change or depth jump) and darkens those pixels. Works
   for instanced members, so all 20 000 pieces get crisp edges in one pass.
   ========================================================================= */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const EdgeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 500 },
    ortho: { value: 0 },
    strength: { value: 0.85 },
    lineColor: { value: new THREE.Color(0x14171a) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform sampler2D tDepth;
    uniform vec2 resolution; uniform float cameraNear; uniform float cameraFar; uniform float ortho;
    uniform float strength; uniform vec3 lineColor;
    varying vec2 vUv;
    float viewZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      if (ortho > 0.5) return -orthographicDepthToViewZ(d, cameraNear, cameraFar);
      return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 px = 1.0 / resolution;
      float dc = viewZ(vUv);
      float bg = texture2D(tDepth, vUv).x;
      vec3 nc = nrm(vUv);
      float edge = 0.0;
      vec2 offs[4];
      offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
      for (int i = 0; i < 4; i++) {
        vec2 uv = vUv + offs[i];
        float bd = texture2D(tDepth, uv).x;
        // silhouette against the sky / ground (nothing drawn in the normal pass)
        if ((bg >= 0.9999) != (bd >= 0.9999)) { edge = 1.0; continue; }
        if (bg >= 0.9999) continue;
        float dz = abs(viewZ(uv) - dc) / max(dc, 0.05);
        edge = max(edge, smoothstep(0.012, 0.035, dz));
        float nd = 1.0 - dot(nrm(uv), nc);
        edge = max(edge, smoothstep(0.12, 0.35, nd));
      }
      gl_FragColor = vec4(mix(base.rgb, lineColor, edge * strength), base.a);
    }`,
};

export class CadLines {
  constructor(renderer, scene, camera, isBuilding) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.isBuilding = isBuilding;            // (obj) => true for building meshes
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.normalTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.normalTarget.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.normalTarget.depthTexture.type = THREE.UnsignedIntType;
    this.normalMat = new THREE.MeshNormalMaterial();
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.edgePass = new ShaderPass(EdgeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.edgePass);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setCamera(camera) { this.camera = camera; this.renderPass.camera = camera; }

  setSize(w, h) {
    this.normalTarget.setSize(w, h);
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    this.edgePass.uniforms.resolution.value.set(w, h);
  }

  render() {
    const { renderer, scene, camera } = this;
    // 1. normals + depth of the building only (site, sky and fog excluded)
    const hidden = [];
    scene.traverse((o) => {
      if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.visible && !this.isBuilding(o)) { o.visible = false; hidden.push(o); }
    });
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null;
    // every building mesh draws its view-space normal; repeated cladding
    // (bricks, boards, tiles, sheets) draws its wall/roof plane's normal so
    // a wall of bricks reads as one surface and only real edges get lines
    const clip = renderer.__byoClip || null;
    this.normalMat.clippingPlanes = clip;
    const swapped = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible || !this.isBuilding(o)) return;
      swapped.push([o, o.material]);
      o.material = o.userData.flatAxis ? this.flatMat(o.userData.flatAxis, clip) : this.normalMat;
    });
    const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.normalTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevColor, prevAlpha);
    for (const [o, m] of swapped) o.material = m;
    scene.background = bg; scene.fog = fog;
    for (const o of hidden) o.visible = true;
    // 2. the normal shaded render, then edges, then tone mapping
    const u = this.edgePass.uniforms;
    u.tNormal.value = this.normalTarget.texture;
    u.tDepth.value = this.normalTarget.depthTexture;
    u.cameraNear.value = camera.near; u.cameraFar.value = camera.far;
    u.ortho.value = camera.isOrthographicCamera ? 1 : 0;
    this.composer.render();
  }

  /* A normal material that ignores the triangle and uses one axis of each
     instance's own frame (its wall / roof-plane normal). */
  flatMat(axis, clip) {
    this._flat = this._flat || {};
    let m = this._flat[axis];
    if (!m) {
      const v = { x: "vec3(1.0, 0.0, 0.0)", y: "vec3(0.0, 1.0, 0.0)", z: "vec3(0.0, 0.0, 1.0)" }[axis];
      m = new THREE.ShaderMaterial({
        vertexShader: /* glsl */`
          #include <common>
          #include <clipping_planes_pars_vertex>
          varying vec3 vN;
          void main() {
            mat4 im = mat4(1.0);
            #ifdef USE_INSTANCING
              im = instanceMatrix;
            #endif
            vN = normalize(normalMatrix * normalize(mat3(im) * ${v}));
            vec4 mvPosition = modelViewMatrix * im * vec4(position, 1.0);
            #include <clipping_planes_vertex>
            gl_Position = projectionMatrix * mvPosition;
          }`,
        fragmentShader: /* glsl */`
          #include <clipping_planes_pars_fragment>
          varying vec3 vN;
          void main() {
            #include <clipping_planes_fragment>
            vec3 n = normalize(vN);
            if (n.z < 0.0) n = -n;          // either face of the wall: same colour
            gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
          }`,
        clipping: true,
      });
      this._flat[axis] = m;
    }
    const had = !!(m.clippingPlanes && m.clippingPlanes.length);
    m.clippingPlanes = clip;
    if (had !== !!clip) m.needsUpdate = true;
    return m;
  }

  dispose() {
    this.normalTarget.dispose(); this.composer.dispose?.(); this.normalMat.dispose();
    for (const m of Object.values(this._flat || {})) m.dispose();
  }
}

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

import { buildEnvironment } from './environment'
import { createPrism, prismParts } from './prism'
import { createRay, createGlow } from './rays'
import { Studio } from './studio'
import { WAVELENGTHS } from '../data/scenes'

/* ═══════════════ cinematic grade ═══════════════ */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberration: { value: 0.0016 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.035 },
    uLift: { value: new THREE.Color('#0a1424') },
    uGain: { value: new THREE.Color('#fff8ee') },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec3  uLift;
    uniform vec3  uGain;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // ── chromatic aberration: radial, stronger at the edges ──
      float amt = uAberration * (0.25 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - c * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + c * amt).b;

      // ── lift / gain grade ──
      col = col * uGain + uLift * (1.0 - col);

      // ── contrast + saturation ──
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);

      // ── vignette ──
      float vig = smoothstep(0.95, 0.18, r2 * 1.55);
      col *= mix(1.0, vig, uVignette);

      // ── film grain ──
      float g = hash(uv * vec2(1024.0, 768.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (1.0 - l * 0.6);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

/* ═══════════════ scene choreography ═══════════════ */

/** Camera + object keyframes, one per act. Interpolated on scroll. */
type Keyframe = {
  camPos: THREE.Vector3
  camLook: THREE.Vector3
  prismPos: THREE.Vector3
  prismRot: THREE.Euler
  prismScale: number
  /** how far the input beam has travelled into the prism, 0..1 */
  inputProgress: number
  /** spread of the dispersed fan, 0..1 */
  dispersion: number
  /** convergence of the ordered beam, 0..1 */
  convergence: number
  /** overall energy of the scene */
  energy: number
  bloom: number
  accent: string
  fog: string
  key: string
  /** exposure of the whole frame */
  exposure: number
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

const KEYFRAMES: Keyframe[] = [
  {
    // ACT I — the noise. The beam is still arriving; the prism waits.
    camPos: V(1.5, 1.15, 6.4),
    camLook: V(0, -0.55, 0),
    prismPos: V(0.1, 0.62, 0),
    prismRot: new THREE.Euler(0.06, 0.16, 0.1),
    prismScale: 0.98,
    inputProgress: 0.34,
    dispersion: 0,
    convergence: 0,
    energy: 0.55,
    bloom: 0.4,
    accent: '#f0ede4',
    fog: '#060810',
    key: '#dbe7ff',
    exposure: 1.0,
  },
  {
    // ACT II — the refraction. The money shot: triangle face-on to camera,
    // white beam raking in from the left, spectrum bursting out the right.
    camPos: V(0.35, 0.42, 5.35),
    camLook: V(-0.5, -0.12, 0),
    prismPos: V(-1.05, 0.28, 0),
    prismRot: new THREE.Euler(0.05, 0.2, 0.34),
    prismScale: 1.12,
    inputProgress: 1,
    dispersion: 1,
    convergence: 0,
    energy: 1.15,
    bloom: 0.62,
    accent: '#7bdcff',
    fog: '#050a14',
    key: '#9fe8ff',
    exposure: 1.04,
  },
  {
    // ACT III — the spectrum. Pulled back, the fan is wide and legible.
    camPos: V(0.9, 1.05, 6.6),
    camLook: V(1.35, -0.15, 0),
    prismPos: V(1.3, 0.18, 0),
    prismRot: new THREE.Euler(-0.08, 0.26, -0.3),
    prismScale: 0.94,
    inputProgress: 1,
    dispersion: 1,
    convergence: 0,
    energy: 1.0,
    bloom: 0.6,
    accent: '#a78bfa',
    fog: '#0a0714',
    key: '#b9a4ff',
    exposure: 1.02,
  },
  {
    // ACT IV — risk. The cone widens, heat, low angle.
    camPos: V(1.2, -0.35, 5.1),
    camLook: V(-1.15, 0.05, 0),
    prismPos: V(-1.15, 0.15, 0),
    prismRot: new THREE.Euler(0.1, 0.14, 0.62),
    prismScale: 1.06,
    inputProgress: 1,
    dispersion: 1.3,
    convergence: 0,
    energy: 1.35,
    bloom: 0.78,
    accent: '#ff9d6b',
    fog: '#120a08',
    key: '#ffb98c',
    exposure: 1.03,
  },
  {
    // ACT V — execution. The fan collapses to a single ordered beam.
    camPos: V(-0.7, 0.3, 5.6),
    camLook: V(1.25, 0, 0),
    prismPos: V(1.25, 0.05, 0),
    prismRot: new THREE.Euler(-0.05, 0.22, -0.55),
    prismScale: 1.0,
    inputProgress: 1,
    dispersion: 1,
    convergence: 1,
    energy: 1.1,
    bloom: 0.68,
    accent: '#7dffb0',
    fog: '#04120c',
    key: '#9dffc8',
    exposure: 1.04,
  },
  {
    // ACT VI — proof. Calm, centred, resolved.
    camPos: V(0.9, 0.12, 6.0),
    camLook: V(-0.85, 0, 0),
    prismPos: V(-0.85, 0.05, 0),
    prismRot: new THREE.Euler(0.04, 0.18, 0.14),
    prismScale: 1.04,
    inputProgress: 1,
    dispersion: 0.7,
    convergence: 0.3,
    energy: 0.95,
    bloom: 0.55,
    accent: '#ffd166',
    fog: '#0e0b04',
    key: '#ffe3a3',
    exposure: 1.02,
  },
]

/** Deep clone that preserves Vector3 / Euler instances. */
function cloneKeyframe(k: Keyframe): Keyframe {
  return {
    camPos: k.camPos.clone(),
    camLook: k.camLook.clone(),
    prismPos: k.prismPos.clone(),
    prismRot: k.prismRot.clone(),
    prismScale: k.prismScale,
    inputProgress: k.inputProgress,
    dispersion: k.dispersion,
    convergence: k.convergence,
    energy: k.energy,
    bloom: k.bloom,
    accent: k.accent,
    fog: k.fog,
    key: k.key,
    exposure: k.exposure,
  }
}

/* ═══════════════ world ═══════════════ */

export class World {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private composer: EffectComposer
  private bloomPass: UnrealBloomPass
  private gradePass: ShaderPass
  private clock = new THREE.Clock()

  private prism: THREE.Group
  private parts: ReturnType<typeof prismParts>
  private inputRay: THREE.Mesh
  private inputGlow: THREE.Sprite
  private spectrumRays: THREE.Mesh[] = []
  private spectrumGlows: THREE.Sprite[] = []
  private orderRay: THREE.Mesh
  private orderGlow: THREE.Sprite
  /** the refracted core inside the glass */
  private coreRay: THREE.Mesh
  private motes!: THREE.Points
  private moteMat!: THREE.ShaderMaterial
  private keyLight: THREE.DirectionalLight
  private fillLight: THREE.PointLight
  private studio: Studio

  /** current interpolated state */
  private state: Keyframe = cloneKeyframe(KEYFRAMES[0])
  private tmpA = new THREE.Vector3()
  private colA = new THREE.Color()
  private colB = new THREE.Color()
  private colOut = new THREE.Color()

  /** pointer parallax target */
  private pointer = new THREE.Vector2()
  private pointerSmooth = new THREE.Vector2()
  private reducedMotion = false

  constructor(canvas: HTMLCanvasElement) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setClearColor(0x04060b, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.fog = new THREE.FogExp2(0x060810, 0.028)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)
    this.camera.position.copy(KEYFRAMES[0].camPos)
    this.camera.lookAt(KEYFRAMES[0].camLook)

    // ── environment ──
    const env = buildEnvironment(this.renderer)
    this.scene.environment = env
    this.scene.environmentIntensity = 1.0

    // ── the studio set: gives the glass something to transmit ──
    this.studio = new Studio()
    this.studio.addTo(this.scene)

    // ── lights ──
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
    this.keyLight.position.set(4, 6, 5)
    this.scene.add(this.keyLight)

    // Kept well off the subject: a point light near the glass floods its
    // interior and kills the dark-core / bright-edge read.
    this.fillLight = new THREE.PointLight(0x9fe8ff, 7, 26, 2)
    this.fillLight.position.set(-5.6, -3.4, -1.2)
    this.scene.add(this.fillLight)

    const rim = new THREE.DirectionalLight(0xff3ea5, 1.1)
    rim.position.set(-5, 2, -6)
    this.scene.add(rim)

    this.scene.add(new THREE.AmbientLight(0x1a2436, 0.5))

    // ── the prism ──
    this.prism = createPrism()
    this.parts = prismParts(this.prism)
    this.scene.add(this.prism)

    // ── input beam (white, strikes from -X) ──
    // The beam spans from the source to the prism's LEFT FACE. Its far end
    // must terminate at the glass, not run through it — otherwise the beam
    // sits on top of the object and blows the whole frame out.
    this.inputRay = createRay({
      color: '#ffffff',
      length: 5.78,
      radius: 0.062,
      opacity: 0.7,
      flicker: 0.25,
      travel: 0.55,
    })
    this.inputRay.rotation.z = -Math.PI / 2
    this.inputRay.position.set(-6.4, 0, 0)
    this.scene.add(this.inputRay)

    this.inputGlow = createGlow('#eaf2ff', 0.55)
    this.inputGlow.position.set(-6.2, 0, 0)
    this.scene.add(this.inputGlow)

    // ── the seven dispersed rays (fan out of +X face) ──
    WAVELENGTHS.forEach((w, i) => {
      const ray = createRay({
        color: w.hex,
        length: 9.5,
        radius: 0.075,
        opacity: 0.9,
        travel: 0.7,
        flicker: 0.08,
      })
      ray.rotation.z = -Math.PI / 2
      ray.position.set(0.75, 0, 0)
      ray.userData.index = i
      this.spectrumRays.push(ray)
      this.scene.add(ray)

      const glow = createGlow(w.hex, 0.9)
      glow.position.set(0.8, 0, 0)
      this.spectrumGlows.push(glow)
      this.scene.add(glow)
    })

    // ── the refracted core: spectral light crossing the glass ──
    this.coreRay = createRay({
      color: '#cfe6ff',
      length: 1.9,
      radius: 0.05,
      opacity: 0.9,
      travel: 1.2,
    })
    this.coreRay.rotation.z = -Math.PI / 2
    this.coreRay.position.set(0, 0, 0)
    this.scene.add(this.coreRay)

    // ── the ordered execution beam ──
    this.orderRay = createRay({
      color: '#eafff4',
      length: 10,
      radius: 0.085,
      opacity: 0,
      travel: 1.1,
    })
    this.orderRay.rotation.z = -Math.PI / 2
    this.orderRay.position.set(0.9, 0, 0)
    this.scene.add(this.orderRay)

    this.orderGlow = createGlow('#ffffff', 1.3)
    this.orderGlow.position.set(0.8, 0, 0)
    this.orderGlow.material.opacity = 0
    this.scene.add(this.orderGlow)

    this.buildMotes()

    // ── post ──
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.62, 0.78)
    this.composer.addPass(this.bloomPass)

    this.gradePass = new ShaderPass(GradeShader)
    this.composer.addPass(this.gradePass)

    this.composer.addPass(new OutputPass())

    this.resize()
    this.bindEvents()
  }

  /* ── ambient dust motes ── */
  private buildMotes() {
    const COUNT = 1400
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT)
    const size = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const r = 2.2 + Math.pow(Math.random(), 0.6) * 7.5
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.7
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
      seed[i] = Math.random() * 100
      size[i] = 0.4 + Math.random() * 1.6
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))

    this.moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#bcd8ff') },
        uOpacity: { value: 0.5 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vFade;
        void main() {
          vec3 p = position;
          float t = uTime * 0.12 + aSeed;
          p.x += sin(t * 1.3 + aSeed) * 0.4;
          p.y += cos(t * 0.9 + aSeed * 1.7) * 0.3;
          p.z += sin(t * 1.1 + aSeed * 0.6) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (26.0 / -mv.z);
          vFade = smoothstep(26.0, 4.0, -mv.z) * (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.1 + aSeed)));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4(uColor, a * vFade * uOpacity);
        }
      `,
    })
    this.motes = new THREE.Points(geo, this.moteMat)
    this.scene.add(this.motes)
  }

  /* ── events ── */
  private bindEvents() {
    window.addEventListener('pointermove', (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      )
    })
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.bloomPass.resolution.set(w, h)
    this.moteMat.uniforms.uPixelRatio.value = dpr
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ═══════════════ scroll → state ═══════════════ */

  /**
   * @param progress 0..1 across the whole journey
   */
  setProgress(progress: number) {
    const n = KEYFRAMES.length
    const scaled = progress * (n - 1)
    const i = Math.min(Math.floor(scaled), n - 2)
    const t = Math.max(0, Math.min(1, scaled - i))
    // smoothstep so scenes settle rather than slide linearly
    const e = t * t * (3 - 2 * t)
    const a = KEYFRAMES[i]
    const b = KEYFRAMES[i + 1]

    const s = this.state
    s.camPos.lerpVectors(a.camPos, b.camPos, e)
    s.camLook.lerpVectors(a.camLook, b.camLook, e)
    s.prismPos.lerpVectors(a.prismPos, b.prismPos, e)
    s.prismScale = a.prismScale + (b.prismScale - a.prismScale) * e
    s.inputProgress = a.inputProgress + (b.inputProgress - a.inputProgress) * e
    s.dispersion = a.dispersion + (b.dispersion - a.dispersion) * e
    s.convergence = a.convergence + (b.convergence - a.convergence) * e
    s.energy = a.energy + (b.energy - a.energy) * e
    s.bloom = a.bloom + (b.bloom - a.bloom) * e
    s.exposure = a.exposure + (b.exposure - a.exposure) * e

    s.prismRot.set(
      a.prismRot.x + (b.prismRot.x - a.prismRot.x) * e,
      a.prismRot.y + (b.prismRot.y - a.prismRot.y) * e,
      a.prismRot.z + (b.prismRot.z - a.prismRot.z) * e,
    )

    this.colA.set(a.accent)
    this.colB.set(b.accent)
    s.accent = '#' + this.colOut.copy(this.colA).lerp(this.colB, e).getHexString()
    this.colA.set(a.fog)
    this.colB.set(b.fog)
    s.fog = '#' + this.colOut.copy(this.colA).lerp(this.colB, e).getHexString()
    this.colA.set(a.key)
    this.colB.set(b.key)
    s.key = '#' + this.colOut.copy(this.colA).lerp(this.colB, e).getHexString()
  }

  /* ═══════════════ frame ═══════════════ */

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.getElapsedTime()
    const s = this.state

    // ── pointer parallax (damped) ──
    const pm = this.reducedMotion ? 0 : 1
    this.pointerSmooth.x += (this.pointer.x - this.pointerSmooth.x) * 0.045 * pm
    this.pointerSmooth.y += (this.pointer.y - this.pointerSmooth.y) * 0.045 * pm

    // ── camera: keyframe position + gentle parallax + idle drift ──
    this.camera.position.copy(s.camPos)
    this.camera.position.x += this.pointerSmooth.x * 0.42 * pm
    this.camera.position.y += -this.pointerSmooth.y * 0.3 * pm
    this.camera.position.y += Math.sin(t * 0.31) * 0.05 * pm
    this.camera.position.x += Math.sin(t * 0.19) * 0.05 * pm
    this.tmpA.copy(s.camLook)
    this.camera.lookAt(this.tmpA)

    // ── prism transform ──
    this.prism.position.copy(s.prismPos)
    this.prism.rotation.set(s.prismRot.x, s.prismRot.y, s.prismRot.z)
    // idle float + slow spin so it never looks frozen
    this.prism.position.y += Math.sin(t * 0.42) * 0.055 * pm
    this.prism.rotation.z += dt * 0.11 * pm
    this.prism.scale.setScalar(s.prismScale * (1 + Math.sin(t * 0.9) * 0.006 * pm))

    // ── material response ──
    const glass = this.parts.mesh.material as THREE.MeshPhysicalMaterial
    glass.envMapIntensity = 1.2 + s.energy * 0.55
    glass.dispersion = 3.5 + s.dispersion * 6.5
    glass.roughness = 0.055 - Math.min(s.dispersion, 1.2) * 0.012
    glass.iridescence = 0.55 + Math.min(s.dispersion, 1.4) * 0.4

    const coreMat = this.parts.core.material as THREE.ShaderMaterial
    coreMat.uniforms.uTime.value = t
    coreMat.uniforms.uIntensity.value = 0.16 + s.energy * 0.26
    ;(coreMat.uniforms.uColor.value as THREE.Color).set(s.key)

    const edgeMat = this.parts.edges.material as THREE.LineBasicMaterial
    edgeMat.opacity = 0.1 + s.energy * 0.1
    ;(edgeMat.color as THREE.Color).set(s.key)

    // ── input beam ──
    // The beam runs from the source at x=-5.5 toward the prism at x=0.
    // uHead/uTail carve the visible segment out of the full-length tube.
    const inMat = this.inputRay.userData.mat as THREE.ShaderMaterial
    inMat.uniforms.uTime.value = t
    // the beam is revealed along its length, and always ends at the glass
    inMat.uniforms.uHead.value = 0.04 + s.inputProgress * 1.0
    inMat.uniforms.uTail.value = 0.0
    inMat.uniforms.uOpacity.value = 0.3 + s.energy * 0.36
    // The beam is anchored to the prism: it always strikes the glass.
    this.inputRay.position.set(s.prismPos.x - 6.4, s.prismPos.y, 0)
    // The glow sits exactly on the beam's TIP — the contact point where
    // white light enters the prism. Put it behind the tip and the beam
    // appears to stop short of the glass.
    const beamTip = s.prismPos.x - 6.4 + s.inputProgress * 5.78
    this.inputGlow.position.set(beamTip, s.prismPos.y, 0)
    ;(this.inputGlow.material as THREE.SpriteMaterial).opacity = 0.12 + s.energy * 0.22

    // ── the refracted core inside the glass ──
    // It starts at the beam's contact point and crosses the glass, so the
    // path reads: white in → spectral core → dispersed fan out.
    const cMat = this.coreRay.userData.mat as THREE.ShaderMaterial
    cMat.uniforms.uTime.value = t
    cMat.uniforms.uOpacity.value = Math.min(1, s.dispersion) * 0.95
    cMat.uniforms.uHead.value = 0.1 + Math.min(1, s.dispersion) * 0.9
    cMat.uniforms.uTravel.value = 1.3
    this.coreRay.position.set(
      s.prismPos.x - 0.95,
      s.prismPos.y,
      0,
    )
    this.coreRay.rotation.z = -Math.PI / 2 + 0.06

    // ── dispersed spectrum ──
    const spread = s.dispersion
    this.spectrumRays.forEach((ray, i) => {
      const mat = ray.userData.mat as THREE.ShaderMaterial
      mat.uniforms.uTime.value = t
      const norm = (i - (WAVELENGTHS.length - 1) / 2) / ((WAVELENGTHS.length - 1) / 2)
      // The fan angle COLLAPSES as the edges converge. The seven rays
      // physically fold onto one axis — that is the execution beat.
      const angle = norm * 0.44 * spread * (1 - s.convergence * 0.94)
      ray.rotation.z = -Math.PI / 2 + angle
      // originate just outside the prism's right face
      ray.position.set(
        s.prismPos.x + 0.7 + Math.cos(angle) * 0.1,
        s.prismPos.y + Math.sin(angle) * 0.1,
        0,
      )
      mat.uniforms.uOpacity.value =
        Math.max(0, spread - 0.12) * (0.62 + s.convergence * 0.5) * (1 - s.convergence * 0.42)
      mat.uniforms.uHead.value = 0.15 + spread * 0.85
      mat.uniforms.uTravel.value = 0.5 + spread * 0.5

      const glow = this.spectrumGlows[i]
      const gx = s.prismPos.x + 0.78 + Math.cos(angle) * 0.35
      const gy = s.prismPos.y + Math.sin(angle) * 0.35
      glow.position.set(gx, gy, 0)
      ;(glow.material as THREE.SpriteMaterial).opacity = Math.max(0, spread - 0.2) * 0.9 * (1 - s.convergence * 0.9)
    })

    // ── ordered execution beam ──
    const oMat = this.orderRay.userData.mat as THREE.ShaderMaterial
    oMat.uniforms.uTime.value = t
    oMat.uniforms.uOpacity.value = s.convergence * 1.45
    oMat.uniforms.uHead.value = 0.2 + s.convergence * 0.8
    oMat.uniforms.uTravel.value = 1.4
    this.orderRay.position.x = s.prismPos.x + 0.74
    this.orderGlow.position.set(s.prismPos.x + 0.95 + s.convergence * 1.4, s.prismPos.y, 0)
    ;(this.orderGlow.material as THREE.SpriteMaterial).opacity = s.convergence * 0.95

    // ── studio ──
    this.studio.update(t, s.key, s.energy, Math.min(s.dispersion, 1.4))
    // the caustic pool follows the beam, so the light path reads as one
    // continuous run from source to spectrum to floor
    this.studio.caustic.position.x = s.prismPos.x + 6.4

    // ── motes ──
    this.moteMat.uniforms.uTime.value = t
    this.moteMat.uniforms.uOpacity.value = 0.3 + s.energy * 0.3
    ;(this.moteMat.uniforms.uColor.value as THREE.Color).set(s.key)

    // ── lights + fog + exposure ──
    this.keyLight.color.set(s.key)
    this.keyLight.intensity = 1.2 + s.energy * 0.9 + s.convergence * 0.8
    this.fillLight.color.set(s.accent)
    this.fillLight.intensity = 5 + s.energy * 7
    const fog = this.scene.fog as THREE.FogExp2
    fog.color.set(s.fog)
    fog.density = 0.03 - s.energy * 0.004
    this.renderer.setClearColor(new THREE.Color(s.fog), 1)
    this.renderer.toneMappingExposure = s.exposure

    // ── post ──
    this.bloomPass.strength = s.bloom
    this.gradePass.uniforms.uTime.value = t
    this.gradePass.uniforms.uAberration.value = 0.0011 + s.energy * 0.0016
    this.gradePass.uniforms.uSaturation.value = 1.02 + s.dispersion * 0.14

    this.composer.render(dt)
  }

  dispose() {
    this.renderer.dispose()
  }
}

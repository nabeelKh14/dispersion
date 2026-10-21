import * as THREE from 'three'

/**
 * The light system.
 *
 * Three families of rays:
 *   1. INPUT  — a single white beam striking the prism
 *   2. SPECTRUM — seven dispersed rays fanning out of the exit face
 *   3. ORDER   — a tight ordered beam used in the execution act
 *
 * All are built from a shared shader: a soft-edged tube whose intensity
 * falls off along its length and whose edges bloom into the core.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uHead;      // position of the leading edge, 0..1
  uniform float uTail;      // position of the trailing edge, 0..1
  uniform float uFlicker;
  uniform float uTravel;    // scrolling energy along the ray

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    // radial soft edge: brightest where we look straight down the tube
    float edge = 1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float body = pow(clamp(edge, 0.0, 1.0), 1.6);

    // longitudinal window
    float head = smoothstep(uHead, uHead - 0.16, vUv.y);
    float tail = smoothstep(uTail, uTail + 0.22, vUv.y);
    float win = head * tail;

    // energy packets travelling along the ray
    float flow = 0.0;
    if (uTravel > 0.0) {
      float p = fract(vUv.y * 3.0 - uTime * uTravel + vUv.x * 0.5);
      flow = pow(smoothstep(0.72, 1.0, p), 3.0) * 0.85;
    }

    float flick = 1.0 - uFlicker * 0.5 * (0.5 + 0.5 * sin(uTime * 31.0 + vUv.y * 12.0));

    float a = (body * 0.9 + flow) * win * uOpacity * flick;
    vec3 c = uColor * (1.0 + flow * 1.8);
    gl_FragColor = vec4(c * a, a);
  }
`

export type RayOptions = {
  color: string
  length: number
  radius?: number
  opacity?: number
  flicker?: number
  travel?: number
  segments?: number
}

export function createRay(opts: RayOptions): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(
    opts.radius ?? 0.055,
    (opts.radius ?? 0.055) * 0.35,
    opts.length,
    opts.segments ?? 20,
    1,
    true,
  )
  // cylinder runs along Y; shift so it starts at the origin and extends +Y
  geo.translate(0, opts.length / 2, 0)

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(opts.color) },
      uTime: { value: 0 },
      uOpacity: { value: opts.opacity ?? 1 },
      uHead: { value: 1 },
      uTail: { value: 0 },
      uFlicker: { value: opts.flicker ?? 0 },
      uTravel: { value: opts.travel ?? 0 },
    },
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.mat = mat
  return mesh
}

/**
 * A soft glow disc that sits at a ray's head — sells the "energy" without
 * needing a volumetric renderer.
 */
export function createGlow(color: string, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(color),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.setScalar(size)
  return sprite
}

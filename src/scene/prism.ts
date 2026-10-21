import * as THREE from 'three'

/**
 * The hero: a dispersion prism.
 *
 * Cut as a real triangular prism (the Newton instrument) rather than a
 * generic crystal, because the whole narrative is that this shape
 * separates light.
 *
 * Geometry: an equilateral triangle in the XY plane, apex up, extruded
 * along Z so the triangular cross-section faces the camera. The incoming
 * beam rakes in from the left and exits the right face.
 *
 * Material: a hyperglass — full transmission, high IOR, near-zero
 * roughness, thin-film iridescence and real chromatic dispersion, so the
 * exit face splits colour on its own.
 */
export function createPrism(): THREE.Group {
  const group = new THREE.Group()

  // ── geometry: triangular prism, apex up, extruded toward the camera ──
  const shape = new THREE.Shape()
  const R = 1.0
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
    const x = Math.cos(a) * R
    const y = Math.sin(a) * R
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.15,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.075,
    bevelOffset: 0,
    bevelSegments: 6,
    curveSegments: 32,
  })
  geo.center()
  geo.computeVertexNormals()

  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f2f8ff'),
    metalness: 0,
    roughness: 0.015,
    transmission: 1,
    thickness: 1.1,
    ior: 2.05,
    dispersion: 9,
    attenuationColor: new THREE.Color('#cfe4ff'),
    attenuationDistance: 8.0,
    clearcoat: 1,
    clearcoatRoughness: 0.012,
    iridescence: 1,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [180, 780],
    specularIntensity: 1,
    envMapIntensity: 2.1,
    side: THREE.DoubleSide,
  })

  const prism = new THREE.Mesh(geo, glass)
  prism.name = 'prism'
  group.add(prism)

  // ── fresnel edge shell: makes the silhouette read as glass, not plastic ──
  const edgeShell = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#dbeeff') },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vView = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 5.0);
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.6);
          float a = (f * 0.8 + rim * 0.04) * uIntensity;
          gl_FragColor = vec4(uColor * a * 1.05, a);
        }
      `,
    }),
  )
  edgeShell.name = 'edgeShell'
  edgeShell.scale.setScalar(1.012)
  group.add(edgeShell)

  // ── inner energy core: a soft glowing body suspended in the glass ──
  const coreGeo = new THREE.IcosahedronGeometry(0.17, 3)
  const coreMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#dcefff') },
      uIntensity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.2);
        float pulse = 0.75 + 0.25 * sin(uTime * 1.6);
        float a = f * pulse * uIntensity;
        gl_FragColor = vec4(uColor * a * 1.1, a);
      }
    `,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  core.name = 'core'
  group.add(core)

  // ── precision edge wireframe: reads as a cut instrument ──
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 14),
    new THREE.LineBasicMaterial({
      color: new THREE.Color('#cfe4ff'),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  edges.name = 'edges'
  group.add(edges)

  return group
}

/** Expose the pieces so the world can animate them individually. */
export function prismParts(group: THREE.Group) {
  return {
    mesh: group.getObjectByName('prism') as THREE.Mesh,
    core: group.getObjectByName('core') as THREE.Mesh,
    edges: group.getObjectByName('edges') as THREE.LineSegments,
    shell: group.getObjectByName('edgeShell') as THREE.Mesh,
  }
}

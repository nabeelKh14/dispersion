import * as THREE from 'three'

/**
 * Procedural environment.
 *
 * A dark void with a handful of bright emissive cards, baked to a PMREM cube.
 * The glass needs *something* to refract and to catch highlights from — a
 * black environment would make it look like a hole, and a bright studio
 * would kill the dark-room mood. So: near-black, with a few hot cards
 * placed at deliberate angles.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene()

  // ── ambient shell: a very dark blue-black dome ──
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#0a1020') },
        uBottom: { value: new THREE.Color('#01020a') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        varying vec3 vPos;
        void main() {
          float h = clamp(vPos.y / 60.0 * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(uBottom, uTop, pow(h, 1.5));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    }),
  )
  scene.add(shell)

  const card = (
    color: string,
    intensity: number,
    pos: [number, number, number],
    scale: [number, number],
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(scale[0], scale[1]),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    m.position.set(pos[0], pos[1], pos[2])
    m.lookAt(0, 0, 0)
    scene.add(m)
    return m
  }

  // key card — warm white, high and to the right. This is what draws the
  // bright edges of the glass; it must NOT sit in the transmission path.
  card('#fff4e2', 14.0, [7, 9, 6], [12, 12])
  // cold fill — deep blue, low left
  card('#4f7bff', 4.5, [-10, -3, 4], [14, 10])
  // rim — magenta accent behind and to the side
  card('#ff3ea5', 4.0, [-5, 4, -11], [10, 8])
  // ground bounce — subtle cyan from below
  card('#18d8ff', 2.4, [0, -8, 3], [16, 8])

  // NEGATIVE FILL — a black flag directly behind the subject, on the
  // camera's transmission path. Without it the glass transmits the lit
  // room and reads as a white blob. With it, the core goes dark and only
  // the edges catch light: the hyperglass signature.
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false }),
  )
  flag.name = 'Flag'
  flag.position.set(0, 0, -6)
  flag.lookAt(0, 0, 0)
  scene.add(flag)
  // a thin horizon sliver for a hard specular line across the glass edge
  const sliver = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 0.35),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#dfe9ff').multiplyScalar(6),
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )
  sliver.position.set(0, 2.2, -14)
  sliver.lookAt(0, 0, 0)
  scene.add(sliver)

  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const target = pmrem.fromScene(scene, 0.035, 0.1, 200)
  pmrem.dispose()

  shell.geometry.dispose()
  ;(shell.material as THREE.Material).dispose()
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== shell && o.name !== 'Flag') {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
  })

  return target.texture
}

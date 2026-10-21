import * as THREE from 'three'

/**
 * The studio.
 *
 * Transmissive glass is only as interesting as what is behind it: with an
 * empty black frame, a prism reads as a dark slab. So the scene needs a
 * physical set — a backdrop with a bright pool of light directly behind
 * the subject (so the glass has something to transmit), and a floor that
 * catches the beam and gives the object a place to stand.
 *
 * Everything stays dim enough to preserve the dark-room mood. The point is
 * to give the glass *gradients* to bend, not to light the room.
 */
export class Studio {
  readonly backdrop: THREE.Mesh
  readonly floor: THREE.Mesh
  readonly caustic: THREE.Mesh
  // (caustic is public so the world can keep it aligned with the beam)
  private backdropMat: THREE.ShaderMaterial
  private floorMat: THREE.ShaderMaterial
  private causticMat: THREE.ShaderMaterial

  constructor() {
    // ── backdrop: a dome with a bright pool behind the subject ──
    this.backdropMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: new THREE.Color('#9fe8ff') },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - vec2(0.5, 0.46);

          // A SMALL, tight pool behind the object. It has to be small: a
          // large luminous wall behind transmissive glass washes the whole
          // interior to white and destroys the material read. Small pool =
          // dark interior, brilliant edges — which is what hyperglass is.
          float pool = exp(-(p.x * p.x * 46.0 + p.y * p.y * 70.0));

          // a wide, low horizon band gives the glass a long specular streak
          float horizon = exp(-pow((vUv.y - 0.40) * 8.0, 2.0));

          // faint vertical falloff so the top of frame stays deep
          float top = smoothstep(0.42, 0.95, vUv.y);

          vec3 c = vec3(0.004, 0.006, 0.013);
          c += vec3(0.42, 0.60, 0.95) * pool * 0.30 * uIntensity;
          c += vec3(0.16, 0.24, 0.44) * horizon * 0.09 * uIntensity;
          c += uAccent * pool * 0.14 * uIntensity;
          c *= 1.0 - top * 0.62;

          gl_FragColor = vec4(c, 1.0);
        }
      `,
    })

    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(40, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.75),
      this.backdropMat,
    )
    this.backdrop.position.y = -8
    this.backdrop.renderOrder = -10

    // ── floor: a dark polished surface that catches the beam ──
    this.floorMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: new THREE.Color('#9fe8ff') },
        uEnergy: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent;
        uniform float uEnergy;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);

          // pool of light beneath the subject
          float pool = exp(-(p.x * p.x * 1.35 + p.y * p.y * 4.2) * 1.5);
          // tight contact glow right under the prism
          float contact = exp(-(p.x * p.x * 9.0 + p.y * p.y * 26.0) * 1.3);
          // a long specular streak running toward the light source
          float streak = exp(-p.y * p.y * 120.0) * exp(-(p.x + 0.55) * (p.x + 0.55) * 1.4);

          // measurement grid, very faint
          vec2 g = abs(fract(vUv * 20.0) - 0.5);
          float grid = smoothstep(0.46, 0.5, max(g.x, g.y));

          vec3 c = vec3(0.016, 0.021, 0.036);
          c += uAccent * pool * 0.17 * uEnergy;
          c += vec3(0.60, 0.75, 1.0) * contact * 0.13 * uEnergy;
          c += vec3(0.55, 0.70, 1.0) * streak * 0.16;
          c += vec3(0.35, 0.50, 0.85) * grid * 0.045;

          float a = smoothstep(1.0, 0.15, r);
          gl_FragColor = vec4(c, a);
        }
      `,
    })

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), this.floorMat)
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -1.9
    this.floor.renderOrder = -5

    // ── caustic pool: the dispersed light landing on the floor ──
    this.causticMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: 0 },
        uEnergy: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSpread;
        uniform float uEnergy;
        varying vec2 vUv;

        vec3 spectrum(float t) {
          return vec3(
            0.5 + 0.5 * sin(6.2831 * (t + 0.00)),
            0.5 + 0.5 * sin(6.2831 * (t + 0.33)),
            0.5 + 0.5 * sin(6.2831 * (t + 0.67))
          );
        }

        void main() {
          // A spectral BAND on the floor, running away from the prism —
          // which is what a real prism projects. The band's cross-section
          // is the spectrum: red low, violet high (or the reverse), and the
          // band widens with distance from the glass.
          vec2 p = vUv * 2.0 - 1.0;
          float along = p.x * 0.5 + 0.5;      // 0 at the glass, 1 far away
          float across = p.y;                   // -1..1 across the band

          // the band fans out as it travels
          float width = 0.10 + along * 0.42 * (0.4 + uSpread * 0.6);
          float band = exp(-(across * across) / (2.0 * width * width));

          // the spectral gradient across the band
          float t = clamp(across * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = spectrum(t);

          // energy falls off with distance from the glass
          float alongFade = exp(-along * 1.9) * smoothstep(0.0, 0.12, along);

          float a = band * alongFade * 0.5 * uEnergy;
          gl_FragColor = vec4(col * a * 2.6, a);
        }
      `,
    })

    this.caustic = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), this.causticMat)
    this.caustic.rotation.x = -Math.PI / 2
    this.caustic.position.set(3.2, -1.87, 0)
    this.caustic.renderOrder = -4
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.backdrop)
    scene.add(this.floor)
    scene.add(this.caustic)
  }

  update(t: number, accent: string, energy: number, spread: number) {
    this.backdropMat.uniforms.uTime.value = t
    ;(this.backdropMat.uniforms.uAccent.value as THREE.Color).set(accent)
    this.backdropMat.uniforms.uIntensity.value = 0.65 + energy * 0.55

    this.floorMat.uniforms.uTime.value = t
    ;(this.floorMat.uniforms.uAccent.value as THREE.Color).set(accent)
    this.floorMat.uniforms.uEnergy.value = 0.55 + energy * 0.7

    this.causticMat.uniforms.uTime.value = t
    this.causticMat.uniforms.uEnergy.value = energy * spread
    this.causticMat.uniforms.uSpread.value = spread
  }
}

import * as THREE from "three";
import type { Realm } from "./data";
import { seeded } from "./geography";

export type Lighting = "day" | "dusk" | "night";
export type TimeUniform = { value: number };

export function createWaterMaterial(
  time: TimeUniform,
  color: string,
  scale = 0.4,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.54,
    metalness: 0.08,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.atlasTime = time;
    shader.uniforms.atlasWaveScale = { value: scale };
    shader.vertexShader = "varying vec3 atlasWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\natlasWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    shader.fragmentShader =
      "varying vec3 atlasWorld;\nuniform float atlasTime;\nuniform float atlasWaveScale;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 p = atlasWorld.xz * atlasWaveScale;
      float swell = sin(p.x * 2.7 + p.y * 1.3 + atlasTime * .36);
      float ripple = sin(p.y * 9.0 - p.x * 2.2 - atlasTime * .6);
      float glint = pow(max(0.0, sin(p.x * 13.0 + p.y * 18.0 + atlasTime * .42) * sin(p.x * 7.0 - p.y * 11.0 - atlasTime * .3)), 14.0);
      diffuseColor.rgb *= .94 + swell * .034 + ripple * .018;
      diffuseColor.rgb += vec3(.025, .033, .028) * glint * (.3 + .7 * max(swell, 0.0));
    `,
    );
  };
  material.customProgramCacheKey = () => `atlas-water-${scale}`;
  return material;
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d")!,
    random = seeded(917);
  for (let i = 0; i < 36; i++) {
    const x = 90 + random() * 330,
      y = 90 + random() * 80,
      r = 30 + random() * 64;
    const gradient = c.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(250,249,229,.32)");
    gradient.addColorStop(0.5, "rgba(244,247,229,.16)");
    gradient.addColorStop(1, "rgba(244,247,229,0)");
    c.fillStyle = gradient;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildWeather(realm: Realm, time: TimeUniform) {
  const group = new THREE.Group();
  group.name = "clouds-and-weather";
  const texture = cloudTexture(),
    random = seeded(918);
  const clouds: {
    sprite: THREE.Sprite;
    x: number;
    z: number;
    phase: number;
  }[] = [];
  const count = realm === "human" ? 16 : 32;
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * 140,
      z = (random() - 0.5) * 100;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: realm === "human" ? 0.22 : 0.38,
        depthWrite: false,
        color: "#fff8e3",
      }),
    );
    sprite.position.set(x, realm === "human" ? 3 + random() * 4 : -1.3, z);
    const s = 11 + random() * 13;
    sprite.scale.set(s, s * 0.37, 1);
    group.add(sprite);
    clouds.push({ sprite, x, z, phase: random() * 6 });
  }
  if (realm === "human") {
    const positions: number[] = [];
    for (let i = 0; i < 260; i++)
      positions.push(
        -23 + random() * 43,
        4 + random() * 15,
        -36 + random() * 23,
      );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const snow = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { atlasTime: time },
        transparent: true,
        depthWrite: false,
        vertexShader: `uniform float atlasTime; void main(){vec3 p=position;p.y=2.0+mod(position.y-atlasTime*.55,17.0);p.x+=sin(atlasTime*.3+position.z)*.4;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=1.8;}`,
        fragmentShader: `void main(){float a=1.0-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.94,.97,.94,a*.48);}`,
      }),
    );
    group.add(snow);
  }
  return {
    group,
    tick: (t: number) =>
      clouds.forEach(({ sprite, x, z, phase }) => {
        sprite.position.x = x + Math.sin(t * 0.018 + phase) * 5;
        sprite.position.z = z + Math.cos(t * 0.012 + phase) * 1.8;
      }),
    lighting: (mode: Lighting) =>
      clouds.forEach(({ sprite }) => {
        (sprite.material as THREE.SpriteMaterial).color.set(
          mode === "night"
            ? "#8a9eac"
            : mode === "dusk"
              ? "#f4c6a0"
              : "#fff8e3",
        );
      }),
  };
}

export function makeSeaEye(time: TimeUniform) {
  const material = new THREE.ShaderMaterial({
    uniforms: { atlasTime: time },
    transparent: true,
    depthWrite: false,
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `varying vec2 vUv;uniform float atlasTime;
      void main(){vec2 p=vUv-.5;float r=length(p)*2.;float angle=atan(p.y,p.x);float spiral=sin(r*30.-angle*3.+atlasTime*.42);float rim=1.0-smoothstep(.7,1.,r);float ring=smoothstep(.4,.95,spiral)*.24;vec3 col=mix(vec3(.12,.28,.27),vec3(.52,.74,.66),ring+r*.45);gl_FragColor=vec4(col,rim*(.48+ring));}`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(-43, -0.62, 26);
  return mesh;
}

import * as THREE from "three";
import { places } from "./data";
import type { Realm } from "./data";
import { seeded } from "./geography";

type Surface = (x: number, z: number) => number;
type Part = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  transforms: THREE.Matrix4[];
  owners: string[];
};
export interface LandscapeBuild {
  buildings: THREE.Group;
  details: THREE.Group;
  waterways: THREE.Group;
  animated: { object: THREE.Object3D; tick: (time: number) => void }[];
  lights: THREE.MeshStandardMaterial[];
}

function roofGeometry() {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const segments = 8;
  for (let j = 0; j <= segments; j++)
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * 2 - 1,
        z = (j / segments) * 2 - 1;
      const y = (1 - Math.abs(z)) * 0.9 + Math.pow(Math.abs(x * z), 4) * 0.24;
      positions.push(x * 0.5, y, z * 0.5);
      uvs.push(i / segments, j / segments);
    }
  for (let j = 0; j < segments; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roofTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#dbdfce";
  c.fillRect(0, 0, 128, 128);
  c.strokeStyle = "#586e6070";
  c.lineWidth = 1;
  for (let x = 0; x <= 128; x += 8) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 128);
    c.stroke();
  }
  for (let y = 0; y < 128; y += 10) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(128, y);
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Building parts are batched by geometry/material. A whole city is only a few
 * draw calls; instance ownership lets the visible roofs themselves be clicked. */
class Builder {
  buildings = new THREE.Group();
  details = new THREE.Group();
  waterways = new THREE.Group();
  animated: LandscapeBuild["animated"] = [];
  private main = new Map<string, Part>();
  private fine = new Map<string, Part>();
  private geometries: Record<string, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
    rock: new THREE.IcosahedronGeometry(0.5, 0),
    roof: roofGeometry(),
    ring: new THREE.TorusGeometry(0.5, 0.07, 6, 32),
  };
  private materials: Record<string, THREE.MeshStandardMaterial> = {};
  private dummy = new THREE.Object3D();
  private owner = "";
  lights: THREE.MeshStandardMaterial[] = [];

  constructor(private surface: Surface) {
    const palette: Record<string, string> = {
      stone: "#a3a58e",
      pale: "#d7d0b4",
      dark: "#46514a",
      wall: "#e0d5b4",
      wood: "#78624b",
      roof: "#466d61",
      red: "#92594a",
      blue: "#566c78",
      gold: "#b39a5c",
      snow: "#dce5dc",
      sand: "#baad7c",
      field: "#8e9b55",
      crop: "#647f45",
      road: "#d0c09a",
      charcoal: "#59635a",
      jade: "#70a399",
      moss: "#839373",
      window: "#e8c885",
      water: "#518f8a",
    };
    const texture = roofTexture();
    for (const [name, color] of Object.entries(palette))
      this.materials[name] = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        side:
          name === "roof" || name === "red" || name === "blue"
            ? THREE.DoubleSide
            : THREE.FrontSide,
        map: ["roof", "red", "blue"].includes(name) ? texture : null,
      });
    this.materials.window.emissive = new THREE.Color("#ff9e31");
    this.materials.window.emissiveIntensity = 0.12;
    this.lights.push(this.materials.window);
    this.buildings.name = "landmark-architecture";
    this.details.name = "landmark-small-details";
    this.waterways.name = "local-waterways";
  }

  use(id: string) {
    this.owner = id;
  }
  private part(
    shape: string,
    mat: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation = 0,
    fine = false,
  ) {
    const batches = fine ? this.fine : this.main,
      key = `${shape}:${mat}`;
    if (!batches.has(key))
      batches.set(key, {
        geometry: this.geometries[shape],
        material: this.materials[mat],
        transforms: [],
        owners: [],
      });
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.rotation.set(0, rotation, 0);
    this.dummy.updateMatrix();
    const batch = batches.get(key)!;
    batch.transforms.push(this.dummy.matrix.clone());
    batch.owners.push(this.owner);
  }
  box(
    mat: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotation = 0,
    fine = false,
  ) {
    this.part("box", mat, x, y, z, w, h, d, rotation, fine);
  }
  rock(x: number, z: number, size: number, height: number, mat = "stone") {
    this.part(
      "rock",
      mat,
      x,
      this.surface(x, z) + height * 0.25,
      z,
      size,
      height,
      size,
      Math.sin(x) * 3,
    );
  }

  platform(
    x: number,
    z: number,
    w: number,
    d: number,
    height = 0.35,
    y = this.surface(x, z),
  ) {
    this.box("stone", x, y + height * 0.45, z, w, height, d);
    this.box("pale", x, y + height, z, w + 0.12, 0.12, d + 0.12);
    return y + height + 0.06;
  }

  house(
    x: number,
    z: number,
    w = 1.3,
    d = 1.05,
    roof = "roof",
    floors = 1,
    y = this.surface(x, z),
  ) {
    const base = this.platform(x, z, w + 0.25, d + 0.25, 0.22, y),
      h = 0.7 * floors;
    this.box("wall", x, base + h * 0.5, z, w, h, d);
    this.part("roof", roof, x, base + h - 0.02, z, w * 1.44, 0.58, d * 1.55);
    this.box(
      "wood",
      x,
      base + 0.25,
      z + d * 0.5 + 0.02,
      0.22,
      0.5,
      0.05,
      0,
      true,
    );
    for (const dx of [-w * 0.32, w * 0.32]) {
      this.box(
        "window",
        x + dx,
        base + 0.43,
        z + d * 0.5 + 0.03,
        0.18,
        0.23,
        0.045,
        0,
        true,
      );
      this.box(
        "wood",
        x + dx,
        base + 0.43,
        z + d * 0.5 + 0.065,
        0.025,
        0.25,
        0.025,
        0,
        true,
      );
    }
    this.box(
      "wood",
      x,
      base + 0.1,
      z + d * 0.65,
      w * 0.8,
      0.12,
      d * 0.2,
      0,
      true,
    );
    return base + h + 0.6;
  }

  pavilion(
    x: number,
    z: number,
    size = 1.8,
    roof = "roof",
    y = this.surface(x, z),
    floors = 1,
  ) {
    let base = this.platform(x, z, size * 1.35, size * 1.1, 0.4, y);
    for (let floor = 0; floor < floors; floor++) {
      const h = floor === 0 ? 1.1 : 0.85,
        ratio = 1 - floor * 0.09,
        s = size * ratio;
      this.box("wall", x, base + h * 0.42, z, s * 0.73, h * 0.8, s * 0.56);
      for (const dx of [-0.43, 0.43])
        for (const dz of [-0.33, 0.33])
          this.box(
            "wood",
            x + dx * s,
            base + h * 0.5,
            z + dz * s,
            0.11,
            h,
            0.11,
          );
      this.box("wood", x, base + h, z, s, 0.1, s * 0.8);
      this.part("roof", roof, x, base + h, z, s * 1.5, 0.75, s * 1.25);
      this.box(
        "window",
        x,
        base + h * 0.48,
        z + s * 0.3,
        s * 0.48,
        h * 0.4,
        0.05,
        0,
        true,
      );
      for (let i = -2; i <= 2; i++)
        this.box(
          "wood",
          x + i * s * 0.11,
          base + h * 0.48,
          z + s * 0.34,
          0.025,
          h * 0.44,
          0.025,
          0,
          true,
        );
      base += h + 0.5;
    }
    this.part("cone", "gold", x, base + 0.5, z, 0.14, 0.65, 0.14);
    return base;
  }

  pagoda(
    x: number,
    z: number,
    levels = 5,
    size = 1.7,
    mat = "roof",
    y = this.surface(x, z),
  ) {
    let base = this.platform(x, z, size * 1.4, size * 1.4, 0.45, y);
    for (let i = 0; i < levels; i++) {
      const s = size * (1 - i * 0.075),
        h = 0.67;
      this.part("cylinder", "wall", x, base + h * 0.5, z, s, h, s);
      this.part("roof", mat, x, base + h, z, s * 1.7, 0.5, s * 1.7);
      for (let a = 0; a < 4; a++) {
        const angle = (a * Math.PI) / 2;
        this.box(
          "window",
          x + Math.sin(angle) * s * 0.48,
          base + 0.36,
          z + Math.cos(angle) * s * 0.48,
          0.12,
          0.22,
          0.1,
          angle,
          true,
        );
      }
      base += 1.03;
    }
    this.part("cone", "gold", x, base + 0.55, z, 0.2, 1.1, 0.2);
  }

  gate(
    x: number,
    z: number,
    width = 2.1,
    roof = "roof",
    y = this.surface(x, z),
  ) {
    for (const dx of [-width * 0.36, width * 0.36])
      this.box("stone", x + dx, y + 0.8, z, width * 0.24, 1.6, 0.8);
    this.box("stone", x, y + 1.55, z, width, 0.3, 0.8);
    this.pavilion(x, z, width * 0.75, roof, y + 1.7);
    this.box("road", x, y + 0.1, z, width * 0.5, 0.14, 1.7);
  }

  wall(
    x: number,
    z: number,
    width: number,
    depth: number,
    roof = "roof",
    y = this.surface(x, z),
  ) {
    for (const side of [-1, 1]) {
      this.box("stone", x + side * width * 0.5, y + 0.58, z, 0.38, 1.16, depth);
      this.box(
        "pale",
        x + side * width * 0.5,
        y + 1.18,
        z,
        0.5,
        0.16,
        depth + 0.1,
      );
      for (let i = 0; i < Math.floor(depth / 0.55); i++)
        this.box(
          "stone",
          x + side * width * 0.5,
          y + 1.37,
          z - depth / 2 + i * 0.55,
          0.5,
          0.29,
          0.28,
          0,
          true,
        );
      this.box("stone", x, y + 0.58, z + side * depth * 0.5, width, 1.16, 0.38);
      for (let i = 0; i < Math.floor(width / 0.55); i++)
        this.box(
          "stone",
          x - width / 2 + i * 0.55,
          y + 1.35,
          z + side * depth * 0.5,
          0.28,
          0.26,
          0.5,
          0,
          true,
        );
      for (const dx of [-width * 0.5, width * 0.5])
        this.pavilion(x + dx, z + side * depth * 0.5, 0.82, roof, y + 1.15);
    }
    this.gate(x, z + depth * 0.5, 1.8, roof, y);
  }

  path(points: [number, number][], width = 0.22, mat = "road") {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    );
    const samples = curve
      .getPoints(90)
      .map((p) => new THREE.Vector3(p.x, this.surface(p.x, p.z) + 0.08, p.z));
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(samples),
        90,
        width,
        4,
        false,
      ),
      this.materials[mat],
    );
    mesh.userData.placeId = this.owner;
    mesh.receiveShadow = true;
    this.details.add(mesh);
  }

  steps(x: number, z: number, distance = 4, dir = 0) {
    for (let i = 0; i < 22; i++) {
      const px = x + ((Math.sin(dir) * i) / 22) * distance,
        pz = z + ((Math.cos(dir) * i) / 22) * distance;
      this.box(
        "pale",
        px,
        this.surface(px, pz) + 0.09,
        pz,
        0.82,
        0.18,
        0.32,
        dir,
        true,
      );
    }
  }

  bridge(
    x: number,
    z: number,
    length = 3,
    rotation = 0,
    y = this.surface(x, z) + 0.3,
  ) {
    for (let i = 0; i < 18; i++) {
      const t = i / 17 - 0.5,
        dx = Math.sin(rotation) * t * length,
        dz = Math.cos(rotation) * t * length;
      const h = y + Math.cos(t * Math.PI) * 0.45;
      this.box("wood", x + dx, h, z + dz, 0.95, 0.13, length / 16, rotation);
      if (i % 3 === 0)
        for (const s of [-1, 1])
          this.box(
            "wood",
            x + dx + Math.cos(rotation) * s * 0.48,
            h + 0.3,
            z + dz - Math.sin(rotation) * s * 0.48,
            0.065,
            0.63,
            0.065,
            rotation,
            true,
          );
    }
  }

  field(x: number, z: number, w: number, d: number, mat = "field") {
    const positions: number[] = [],
      colors: number[] = [];
    const color = new THREE.Color(this.materials[mat].color);
    const grid = 5;
    for (let i = 0; i < grid; i++)
      for (let j = 0; j < grid; j++) {
        const x0 = x - w * 0.5 + (i / grid) * w,
          z0 = z - d * 0.5 + (j / grid) * d,
          x1 = x0 + w / grid,
          z1 = z0 + d / grid;
        for (const [px, pz] of [
          [x0, z0],
          [x0, z1],
          [x1, z0],
          [x1, z0],
          [x0, z1],
          [x1, z1],
        ]) {
          positions.push(px, this.surface(px, pz) + 0.06, pz);
          colors.push(color.r, color.g, color.b);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    mesh.userData.placeId = this.owner;
    mesh.receiveShadow = true;
    this.buildings.add(mesh);
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 5; j++) {
        const px = x - w * 0.45 + (i / 8) * w * 0.9,
          pz = z - d * 0.4 + (j / 4) * d * 0.8;
        this.box(
          "crop",
          px,
          this.surface(px, pz) + 0.13,
          pz,
          w * 0.035,
          0.14,
          d * 0.11,
          0,
          true,
        );
      }
    this.path(
      [
        [x - w / 2, z - d / 2],
        [x + w / 2, z - d / 2],
        [x + w / 2, z + d / 2],
      ],
      0.065,
      "sand",
    );
  }

  ruin(x: number, z: number, radius = 2.5, seed = 4) {
    const random = seeded(seed);
    const y = this.surface(x, z);
    this.platform(x, z, radius * 2, radius * 1.5, 0.25, y);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2,
        px = x + Math.cos(a) * radius,
        pz = z + Math.sin(a) * radius * 0.65,
        h = 0.5 + random() * 2;
      this.part("cylinder", "stone", px, y + h * 0.5 + 0.3, pz, 0.3, h, 0.3);
      if (i % 3 === 0)
        this.box("pale", px + 0.4, y + h + 0.3, pz, 1, 0.2, 0.35, 0.15);
    }
    for (let i = 0; i < 22; i++)
      this.rock(
        x + (random() - 0.5) * radius * 2.7,
        z + (random() - 0.5) * radius * 2,
        0.25 + random() * 0.5,
        0.2 + random() * 0.4,
        "charcoal",
      );
    this.box(
      "stone",
      x - radius * 0.5,
      y + 0.8,
      z + radius * 0.8,
      radius * 0.7,
      1.5,
      0.3,
      0.2,
    );
  }

  well(x: number, z: number, radius = 1.4) {
    const y = this.surface(x, z);
    this.part(
      "cylinder",
      "charcoal",
      x,
      y + 0.1,
      z,
      radius * 1.75,
      0.15,
      radius * 1.75,
    );
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.box(
        "pale",
        x + Math.cos(a) * radius,
        y + 0.3,
        z + Math.sin(a) * radius,
        0.45,
        0.5,
        0.45,
        a,
      );
    }
    for (let i = 0; i < 6; i++)
      this.box(
        "stone",
        x - radius - i * 0.2,
        y + 0.15 - i * 0.04,
        z,
        0.3,
        0.2,
        0.7,
        0,
        true,
      );
  }

  waterfall(x: number, z: number, drop = 4, width = 0.65) {
    const y = this.surface(x, z);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, drop, 3, 12),
      new THREE.MeshStandardMaterial({
        color: "#b9e3db",
        transparent: true,
        opacity: 0.7,
        roughness: 0.22,
        emissive: "#74a8a1",
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.position.set(x, y - drop * 0.5, z);
    this.waterways.add(mesh);
    for (let i = 0; i < 6; i++) {
      const foam = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 4),
        new THREE.MeshBasicMaterial({
          color: "#e7f0d8",
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
      foam.position.set(x + ((i % 3) - 1) * 0.21, y - drop + 0.15, z);
      foam.scale.set(1, 0.28, 1);
      this.waterways.add(foam);
      this.animated.push({
        object: foam,
        tick: (t) => {
          foam.position.y = y - drop + 0.1 + Math.sin(t * 1.8 + i) * 0.08;
          foam.scale.x = 1 + Math.sin(t + i) * 0.4;
        },
      });
    }
  }

  wheel(x: number, z: number) {
    const y = this.surface(x, z) + 0.7,
      group = new THREE.Group();
    group.position.set(x, y, z);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.065, 5, 22),
      this.materials.wood,
    );
    group.add(rim);
    for (let i = 0; i < 8; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1.3, 0.1),
        this.materials.wood,
      );
      blade.rotation.z = (i / 8) * Math.PI;
      group.add(blade);
    }
    this.buildings.add(group);
    this.animated.push({
      object: group,
      tick: (t) => {
        group.rotation.z = t * 0.28;
      },
    });
  }

  boat(x: number, z: number, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, -0.45, z);
    group.scale.setScalar(scale);
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 5),
      this.materials.wood,
    );
    hull.scale.set(0.65, 0.36, 1.9);
    group.add(hull);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.08, 1.4),
      this.materials.sand,
    );
    deck.position.y = 0.16;
    group.add(deck);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 1.7, 5),
      this.materials.wood,
    );
    mast.position.y = 0.9;
    group.add(mast);
    const sailGeometry = new THREE.BufferGeometry();
    sailGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0.3, 0, 0, 1.7, 0, 0.7, 0.4, 0.12],
        3,
      ),
    );
    sailGeometry.computeVertexNormals();
    const sail = new THREE.Mesh(
      sailGeometry,
      new THREE.MeshStandardMaterial({
        color: "#f1e4bc",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    group.add(sail);
    this.waterways.add(group);
    this.animated.push({
      object: group,
      tick: (t) => {
        group.position.y = -0.45 + Math.sin(t * 0.8 + x) * 0.08;
        group.rotation.z = Math.sin(t * 0.7 + z) * 0.04;
        group.position.z = z + Math.sin(t * 0.08 + x) * 0.7;
      },
    });
  }

  finish(): LandscapeBuild {
    for (const [batches, parent] of [
      [this.main, this.buildings],
      [this.fine, this.details],
    ] as const)
      for (const batch of batches.values()) {
        if (!batch.transforms.length) continue;
        const mesh = new THREE.InstancedMesh(
          batch.geometry,
          batch.material,
          batch.transforms.length,
        );
        batch.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.userData.placeIds = batch.owners;
        mesh.castShadow = parent === this.buildings;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        parent.add(mesh);
      }
    return {
      buildings: this.buildings,
      details: this.details,
      waterways: this.waterways,
      animated: this.animated,
      lights: this.lights,
    };
  }
}

export function buildArchitecture(
  realm: Realm,
  surface: Surface,
): LandscapeBuild {
  const b = new Builder(surface);
  if (realm === "human") {
    b.use("qingniu");
    [
      [29.3, 9.1],
      [30.8, 8.8],
      [29.4, 10.7],
      [31.1, 11.5],
      [32.3, 10.6],
      [30, 12.4],
    ].forEach(([x, z], i) =>
      b.house(x, z, 0.92 + (i % 2) * 0.22, 0.85, i % 3 === 0 ? "red" : "roof"),
    );
    b.path(
      [
        [28, 8],
        [29.7, 9.5],
        [30.6, 11],
        [33.6, 12],
      ],
      0.15,
    );
    b.bridge(32.7, 10.3, 2.7, Math.PI / 2);
    b.wheel(32.6, 10.5);
    b.field(27.4, 11.6, 2.7, 1.7);
    b.field(28.2, 14, 3.1, 1.5, "sand");
    b.field(30.8, 14, 1.4, 1.6);
    b.well(28.7, 9.5, 0.3);
    b.use("kunlun");
    b.pavilion(-5, -1, 2.8, "roof", surface(-5, -1), 2);
    b.pavilion(-8.5, -0.2, 1.6);
    b.pavilion(-1.8, -1, 1.6);
    b.gate(-5, 3, 1.9);
    b.steps(-5, 1.3, 5);
    b.path(
      [
        [-8, -0.2],
        [-5, -1],
        [-2, -1],
      ],
      0.16,
    );
    b.use("lingxu");
    b.pavilion(22, 1, 2, "roof", surface(22, 1), 2);
    b.house(24, 1.4, 1.4);
    b.house(22.7, 3, 1.3);
    b.gate(20.7, 4.1, 1.7);
    b.steps(21.3, 2.5, 4);
    b.path(
      [
        [20, 7],
        [21, 4],
        [22, 1],
      ],
      0.15,
    );
    b.use("qingya");
    b.steps(21, -5, 3.5);
    b.rock(20, -6, 1.3, 2);
    b.pavilion(23, -5, 1.1);
    b.use("penglai");
    b.pagoda(57, -1, 5, 1.35);
    b.pavilion(55.5, 0.8, 1.2);
    b.house(58.3, 1.2, 1.1);
    b.steps(56.8, 1, 2.5);
    b.waterfall(58.5, 2.7, 3.4, 0.8);
    b.boat(55, 5.7, 0.9);
    b.use("tianji");
    b.rock(3, -12, 3.5, 5.8, "dark");
    b.pavilion(3, -12, 1.8, "blue", 4.2, 2);
    b.use("duanjian");
    b.pavilion(1, 27, 2.1, "blue", surface(1, 27), 2);
    b.rock(-1.5, 27, 1, 4, "dark");
    b.bridge(0, 28, 3.5, Math.PI / 2, surface(0, 28) + 0.7);
    b.steps(2, 28, 4);
    b.use("snow-pass");
    b.wall(-8, -19, 6.5, 3, "blue");
    b.house(-9, -19, 1, 1, "blue");
    b.house(-7, -19, 1, 1, "blue");
    b.path(
      [
        [-8, -22],
        [-8, -19],
        [-7, -15],
      ],
      0.2,
    );
    b.use("wanzang");
    b.gate(-26, -11, 1.6, "red");
    for (let i = 0; i < 5; i++)
      b.rock(
        -29 + i * 0.9,
        -12 + Math.sin(i) * 0.7,
        1.1,
        2.5 + (i % 2),
        "charcoal",
      );
    for (const [id, x, z, roof] of [
      ["taiyuan", 6, 11, "roof"],
      ["dayan", 11, 21.5, "red"],
      ["lian", 11, 39, "roof"],
      ["zhou", 40, 0, "blue"],
    ] as const) {
      b.use(id);
      const base = surface(x, z);
      b.platform(x, z, 6.4, 4.7, 0.24, base);
      b.wall(x, z, 6, 4.3, roof, base + 0.3);
      b.pavilion(x, z - 1, 1.7, roof, base + 0.4, id === "dayan" ? 2 : 1);
      for (const dx of [-1.7, 0, 1.7])
        for (const dz of [0.6, 1.6])
          b.house(x + dx, z + dz, 0.95, 0.72, roof, 1, base + 0.4);
      b.path(
        [
          [x, z + 4],
          [x, z + 1],
          [x, z - 1],
        ],
        0.18,
      );
      if (id !== "dayan") {
        b.field(x - 4, z + 3, 1.6, 2.2);
        b.field(x - 2, z + 4.5, 2, 1.4, "sand");
      }
    }
    b.use("shang");
    b.ruin(35, -10, 2.9, 41);
    b.path(
      [
        [32, -8],
        [35, -10],
        [38, -9],
      ],
      0.2,
      "stone",
    );
    b.use("kuchan");
    b.pavilion(44, -6, 2.1, "charcoal");
    b.pagoda(46, -7, 5, 1.2, "pale");
    b.gate(44, -3.7, 1.5, "charcoal");
    b.steps(44, -4, 2.5);
    b.use("su-valley");
    b.house(36.1, 18, 1.5);
    b.house(38.2, 18.7, 1.3);
    b.pavilion(37, 16.5, 1.2);
    b.bridge(37, 19.3, 2.2, Math.PI / 2);
    b.use("moyuan");
    b.well(-34, 10, 2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.rock(
        -34 + Math.cos(a) * 2.6,
        10 + Math.sin(a) * 2,
        1.1,
        2 + (i % 3),
        "charcoal",
      );
    }
    b.use("east-palace");
    b.platform(62, 12, 4.5, 3.7, 0.2, -0.6);
    b.pavilion(62, 12, 2.3, "jade", -0.3, 2);
    b.pavilion(59.7, 12.8, 1.1, "jade", -0.3);
    b.pavilion(64.3, 12.8, 1.1, "jade", -0.3);
    for (const [x, z, s] of [
      [-24, 24, 1],
      [24, 42, 1.1],
      [52, 9, 0.8],
      [33, 43, 1.3],
      [-49, 23, 0.9],
      [49, -17, 0.9],
      [61, -16, 1.1],
    ])
      b.boat(x, z, s);
  } else if (realm === "celestial") {
    b.use("tianque");
    for (const [i, [x, z]] of [
      [0, [0, 0]],
      [1, [-8, -4]],
      [2, [8, -5]],
      [3, [-7, 7]],
      [4, [7, 7]],
    ] as [number, [number, number]][]) {
      const y = surface(x, z);
      b.platform(x, z, 6.2, 5.4, 0.6, y);
      b.wall(x, z, 5.7, 4.8, "roof", y + 0.65);
      b.pavilion(
        x,
        z - 0.5,
        2.3,
        i === 0 ? "blue" : "roof",
        y + 0.7,
        i === 0 ? 3 : 2,
      );
      for (const dx of [-1.9, 1.9])
        b.house(x + dx, z + 1.2, 1.1, 0.9, "blue", 1, y + 0.7);
    }
    b.path(
      [
        [-8, -4],
        [0, 0],
        [8, -5],
      ],
      0.35,
    );
    b.path(
      [
        [-7, 7],
        [0, 0],
        [7, 7],
      ],
      0.35,
    );
    b.use("twelve");
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.pagoda(Math.cos(a) * 16, Math.sin(a) * 11.7, 4, 1.1, "blue");
    }
    b.use("qizheng");
    b.pavilion(-10, 5, 2, "blue", surface(-10, 5), 2);
    b.use("yuedu");
    const y = surface(-31, 4);
    b.platform(-31, 4, 8, 6, 0.4, y);
    b.wall(-31, 4, 7.8, 5.8, "blue", y + 0.45);
    for (let i = 0; i < 10; i++)
      b.house(
        -33.3 + (i % 4) * 1.5,
        2.7 + Math.floor(i / 4) * 1.5,
        1.1,
        0.9,
        "blue",
        1,
        y + 0.5,
      );
    b.pavilion(-31, 2, 1.8, "roof", y + 0.5, 2);
    b.use("zhaochuan");
    const base = surface(31, 17);
    b.platform(31, 18, 10, 7, 0.5, base);
    b.platform(31, 16.5, 7.8, 4.8, 1, base + 0.5);
    b.platform(31, 15.5, 5, 3.1, 1.15, base + 1.5);
    for (let i = 0; i < 13; i++)
      b.house(
        26.9 + (i % 7) * 1.35,
        19.1 + Math.floor(i / 7) * 1.3,
        0.95,
        0.8,
        "red",
        1,
        base + 0.55,
      );
    for (let i = 0; i < 6; i++)
      b.house(
        28.2 + (i % 3) * 2.7,
        16.3 + Math.floor(i / 3) * 1.4,
        1.2,
        0.9,
        "roof",
        1,
        base + 1.65,
      );
    b.pavilion(31, 15.3, 2.3, "blue", base + 2.8, 2);
    b.gate(31, 21.5, 2.2, "blue", base + 0.3);
    b.use("abandoned");
    b.ruin(-36, -18, 3.4, 21);
    b.path(
      [
        [-42, -18],
        [-37, -19],
        [-33, -16],
      ],
      0.16,
      "charcoal",
    );
    b.use("well");
    b.well(-27, -21, 1.8);
    b.use("jiutian");
    b.ruin(30, -21, 3.5, 32);
    b.gate(30, -23.5, 2.5, "charcoal");
  } else {
    for (const [i, place] of places
      .filter((p) => p.realm === "spirit")
      .entries()) {
      b.use(place.id);
      const [x, z] = place.position;
      if (i % 4 === 0) {
        b.pavilion(x, z, 1.2);
        b.waterfall(x + 2, z + 1.6, 4, 0.65);
      }
      if (i % 4 === 1) {
        b.rock(x, z, 1.6, 3, "snow");
        b.house(x - 1.7, z + 0.7, 0.8, 0.8, "blue");
      }
      if (i % 4 === 2) b.ruin(x, z, 1.5, 71 + i);
      if (i % 4 === 3) {
        b.house(x - 1, z, 1.1);
        b.house(x + 1.1, z + 0.3, 1);
        b.well(x, z + 1, 0.45);
      }
    }
  }
  return b.finish();
}

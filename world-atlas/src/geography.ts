import * as THREE from "three";
import type { Land, Point } from "./data";

export function seeded(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noise(x: number, z: number) {
  return (
    Math.sin(x * 0.71 + Math.cos(z * 0.43)) * 0.36 +
    Math.sin(z * 1.19 + x * 0.39) * 0.24 +
    Math.cos(x * 1.93 - z * 0.79) * 0.13
  );
}

export function inside(x: number, z: number, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}

export function edgeDistance(x: number, z: number, polygon: Point[]) {
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(
      ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz),
      0,
      1,
    );
    distance = Math.min(
      distance,
      Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz),
    );
  }
  return distance;
}

function rawHeight(x: number, z: number, land: Land) {
  let height = 0.63 + noise(x * 0.65, z * 0.65) * 0.31;
  for (const [px, pz, amplitude, width] of land.peaks) {
    const dx = x - px,
      dz = z - pz;
    const envelope = Math.exp(
      -(dx * dx * 0.8 + dz * dz * 1.4) / (width * width),
    );
    const ridge = 1 - Math.abs(noise(x * 1.7 + px, z * 1.7 + pz));
    height +=
      amplitude *
      envelope *
      (0.58 + ridge * 0.38 + noise(x * 3.1, z * 3.1) * 0.12);
  }
  return height;
}

const foundations: Record<string, [number, number, number][]> = {
  central: [
    [-5, -1, 2.7],
    [6, 11, 4],
  ],
  east: [
    [22, 1, 2.7],
    [31, 10, 3.6],
    [40, 0, 4],
    [44, -6, 2.5],
  ],
  north: [[-8, -19, 3.5]],
  south: [
    [1, 27, 2.6],
    [11, 21.5, 4],
    [11, 39, 4],
  ],
  penglai: [[57, -1, 1.8]],
  zhaochuan: [[31, 18, 5.8]],
  yuedu: [[-31, 4, 4.5]],
};

export function heightAt(
  x: number,
  z: number,
  land: Land,
  distance = edgeDistance(x, z, land.points),
) {
  let height = rawHeight(x, z, land);
  for (const [px, pz, radius] of foundations[land.id] ?? []) {
    const d = Math.hypot(x - px, z - pz);
    if (d < radius)
      height = THREE.MathUtils.lerp(
        rawHeight(px, pz, land),
        height,
        THREE.MathUtils.smoothstep(d, radius * 0.5, radius),
      );
  }
  if (land.id === "west") {
    const basin = Math.hypot((x + 36) / 0.74, z - 4);
    if (basin < 3.6)
      height = Math.min(height, 0.18 + Math.pow(basin / 3.6, 4) * 1.1);
  }
  return Math.max(0.14, height * THREE.MathUtils.smoothstep(distance, 0, 1.6));
}

export function smoothPolygon(points: Point[]): Point[] {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    "catmullrom",
    0.35,
  );
  return curve
    .getPoints(points.length * 5)
    .slice(0, -1)
    .map((p) => [p.x, p.z]);
}

export function makeGrainTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const random = seeded(1448);
  context.fillStyle = "#e9e9dc";
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    context.fillStyle = `rgba(${random() > 0.5 ? "255,255,242" : "53,62,39"},${random() * 0.13})`;
    context.fillRect(
      random() * 256,
      random() * 256,
      random() * 2 + 0.3,
      random() * 2 + 0.3,
    );
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

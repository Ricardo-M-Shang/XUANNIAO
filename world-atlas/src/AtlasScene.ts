import * as THREE from "three";
import Delaunator from "delaunator";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  celestialLands,
  connections,
  humanLands,
  places,
  regions,
  rivers,
} from "./data";
import type { Land, Place, Point, Realm } from "./data";
import {
  edgeDistance,
  heightAt,
  inside,
  makeGrainTexture,
  noise,
  seeded,
  smoothPolygon,
} from "./geography";
import { buildArchitecture } from "./architecture";
import type { LandscapeBuild } from "./architecture";
import { buildWeather, createWaterMaterial, makeSeaEye } from "./environment";
import type { Lighting } from "./environment";

export interface Layers {
  terrain: boolean;
  water: boolean;
  places: boolean;
  labels: boolean;
  connections: boolean;
  buildings: boolean;
  vegetation: boolean;
  atmosphere: boolean;
}
type Callbacks = {
  select: (id: string) => void;
  region: (id: string) => void;
  zoom: (value: number) => void;
  ready: () => void;
  viewport?: (points: Point[]) => void;
};
function line(
  points: THREE.Vector3[],
  color: THREE.ColorRepresentation,
  opacity = 1,
  dashed = false,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity,
        dashSize: 0.55,
        gapSize: 0.35,
      })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const mesh = new THREE.Line(geometry, material);
  if (dashed) mesh.computeLineDistances();
  return mesh;
}

export class AtlasScene {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-80, 80, 55, -55, 0.1, 1500);
  private renderer: THREE.WebGLRenderer;
  private labelRenderer = new CSS2DRenderer();
  private controls: OrbitControls;
  private terrain = new THREE.Group();
  private water = new THREE.Group();
  private trees = new THREE.Group();
  private annotations = new THREE.Group();
  private placeLabels = new THREE.Group();
  private routeLines = new THREE.Group();
  private structures = new THREE.Group();
  private details = new THREE.Group();
  private clouds = new THREE.Group();
  private coast = new THREE.Group();
  private landData: Land[] = [];
  private labels: {
    object: CSS2DObject;
    el: HTMLElement;
    place?: Place;
    regionId?: string;
    minor?: boolean;
  }[] = [];
  private observer: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private realm: Realm = "human";
  private layers: Layers = {
    terrain: true,
    water: true,
    places: true,
    labels: true,
    connections: false,
    buildings: true,
    vegetation: true,
    atmosphere: true,
  };
  private selected: string | null = null;
  private lastZoom = 0;
  private tween?: {
    start: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    zoom: number;
    targetZoom: number;
  };
  private cameraAngle = new THREE.Vector3(0, 115, 105);
  private selectionRing: THREE.Mesh;
  private previousTime = 0;
  private needsRender = true;
  private elapsed = 0;
  private motion = !window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private timeUniform = { value: 0 };
  private terrainTexture = makeGrainTexture();
  private architecture?: LandscapeBuild;
  private weather?: ReturnType<typeof buildWeather>;
  private sunlight = new THREE.DirectionalLight("#fff1d6", 2.4);
  private ambient = new THREE.AmbientLight("#e6efe0", 1.3);
  private fill = new THREE.DirectionalLight("#c7e5e1", 0.45);
  private ocean: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private lighting: Lighting = "day";
  private pointerStart = new THREE.Vector2();
  private lastViewportTime = 0;

  constructor(
    private host: HTMLElement,
    private callbacks: Callbacks,
    initialRealm: Realm = "human",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor("#b9d2ca");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = "atlas-canvas";
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可交互的三界立体地形地图。拖动平移，滚轮缩放，使用地点按钮查看详情。",
    );
    this.renderer.domElement.setAttribute("role", "img");
    host.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.className = "map-labels";
    host.appendChild(this.labelRenderer.domElement);
    this.camera.position.copy(this.cameraAngle);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 7;
    this.controls.zoomSpeed = 0.9;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener("start", () => {
      this.tween = undefined;
    });
    this.controls.addEventListener("change", this.handleChange);
    this.scene.add(this.ambient);
    const sunlight = this.sunlight;
    sunlight.position.set(-40, 85, -35);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -80;
    sunlight.shadow.camera.right = 80;
    sunlight.shadow.camera.top = 75;
    sunlight.shadow.camera.bottom = -75;
    sunlight.shadow.normalBias = 0.18;
    sunlight.shadow.bias = -0.001;
    sunlight.shadow.radius = 3;
    this.scene.add(sunlight);
    this.fill.position.set(50, 20, 50);
    this.scene.add(this.fill);
    const ocean = (this.ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      createWaterMaterial(this.timeUniform, "#76a99f", 0.31),
    ));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.8;
    ocean.receiveShadow = true;
    this.scene.add(ocean);
    this.drawGrid();
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.21, 64),
      new THREE.MeshBasicMaterial({
        color: "#a77b3e",
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 10;
    this.scene.add(this.selectionRing);
    for (const group of [
      this.terrain,
      this.water,
      this.trees,
      this.annotations,
      this.placeLabels,
      this.routeLines,
      this.structures,
      this.details,
      this.clouds,
      this.coast,
    ])
      this.scene.add(group);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.setRealm(initialRealm);
    this.resize();
    this.animate(0);
    window.setTimeout(() => {
      if (!this.disposed) callbacks.ready();
    }, 200);
  }

  private handleChange = () => {
    this.needsRender = true;
    if (Math.abs(this.camera.zoom - this.lastZoom) > 0.01) {
      this.lastZoom = this.camera.zoom;
      this.callbacks.zoom(this.camera.zoom);
      this.applyVisibility();
    }
    this.notifyViewport();
  };

  private notifyViewport(force = false) {
    if (
      !this.callbacks.viewport ||
      (!force && performance.now() - this.lastViewportTime < 100)
    )
      return;
    this.lastViewportTime = performance.now();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      caster = new THREE.Raycaster();
    const corners: Point[] = [];
    this.camera.updateMatrixWorld();
    for (const [x, y] of [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      caster.setFromCamera(new THREE.Vector2(x, y), this.camera);
      const hit = new THREE.Vector3();
      if (caster.ray.intersectPlane(plane, hit)) corners.push([hit.x, hit.z]);
    }
    this.callbacks.viewport(corners);
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointerStart.set(event.clientX, event.clientY);
  };
  private onPointerUp = (event: PointerEvent) => {
    if (
      this.pointerStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      ) > 6 ||
      !this.layers.buildings ||
      !this.layers.terrain
    )
      return;
    const rect = this.host.getBoundingClientRect(),
      caster = new THREE.Raycaster();
    caster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const targets = this.details.visible
      ? [...this.structures.children, ...this.details.children]
      : this.structures.children;
    for (const hit of caster.intersectObjects(targets, true)) {
      const id =
        hit.object.userData.placeId ??
        hit.object.userData.placeIds?.[hit.instanceId ?? -1];
      if (id && places.some((p) => p.id === id)) {
        this.callbacks.select(id);
        break;
      }
    }
  };

  private drawGrid() {
    const points: THREE.Vector3[] = [];
    for (let x = -150; x <= 150; x += 12)
      points.push(
        new THREE.Vector3(x, -0.75, -150),
        new THREE.Vector3(x, -0.75, 150),
      );
    for (let z = -150; z <= 150; z += 12)
      points.push(
        new THREE.Vector3(-150, -0.75, z),
        new THREE.Vector3(150, -0.75, z),
      );
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: "#648f82",
        transparent: true,
        opacity: 0.09,
      }),
    );
    this.scene.add(grid);
    // Dotted intersections evoke the registration marks of a printed atlas.
    const dots: number[] = [];
    for (let x = -150; x <= 150; x += 12)
      for (let z = -150; z <= 150; z += 12) dots.push(x, -0.7, z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dots, 3),
    );
    this.scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: "#4b8175",
          size: 0.15,
          transparent: true,
          opacity: 0.2,
        }),
      ),
    );
  }

  private clear(group: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    group.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove();
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        geometries.add(object.geometry);
      }
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points ||
        object instanceof THREE.Sprite
      )
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((material) => materials.add(material));
    });
    materials.forEach((material) => {
      const map = (material as THREE.MeshStandardMaterial).map;
      if (map && map !== this.terrainTexture) textures.add(map);
      material.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    group.clear();
  }

  setRealm(realm: Realm) {
    if (realm === this.realm && this.landData.length) return;
    this.tween = undefined;
    this.realm = realm;
    this.selected = null;
    this.selectionRing.visible = false;
    this.labels = [];
    this.architecture = undefined;
    this.weather = undefined;
    for (const group of [
      this.terrain,
      this.water,
      this.trees,
      this.annotations,
      this.placeLabels,
      this.routeLines,
      this.structures,
      this.details,
      this.clouds,
      this.coast,
    ])
      this.clear(group);
    if (realm === "human")
      this.landData = humanLands.map((land) => ({
        ...land,
        points: smoothPolygon(land.points),
      }));
    else if (realm === "celestial")
      this.landData = celestialLands.map((land) => ({
        ...land,
        points: smoothPolygon(land.points),
      }));
    else
      this.landData = places
        .filter((place) => place.realm === "spirit")
        .map((place, i) => {
          const [x, z] = place.position;
          const random = seeded(i + 43);
          const rx = 4 + random() * 2.5,
            rz = 2.9 + random() * 1.5;
          const polygon: Point[] = Array.from({ length: 10 }, (_, j) => {
            const a = (j / 10) * Math.PI * 2;
            const r = 0.8 + random() * 0.3;
            return [x + Math.cos(a) * rx * r, z + Math.sin(a) * rz * r];
          });
          return {
            id: place.id,
            region: i % 4 === 1 ? "north" : "caves",
            color: ["#91b197", "#c4d1c2", "#b4ae93", "#7e9d7e"][i % 4],
            points: smoothPolygon(polygon),
            peaks: [[x - 1, z - 1, 2.2 + random() * 4, 2]],
          };
        });
    this.landData.forEach((land, i) => this.buildLand(land, i));
    this.buildTrees();
    this.buildGeology();
    if (realm === "human") this.buildRivers();
    this.architecture = buildArchitecture(realm, (x, z) => this.surface(x, z));
    this.structures.add(this.architecture.buildings);
    this.details.add(this.architecture.details);
    this.water.add(this.architecture.waterways);
    this.weather = buildWeather(realm, this.timeUniform);
    this.clouds.add(this.weather.group);
    this.ocean.position.y = realm === "human" ? -0.8 : -6;
    this.setLighting(this.lighting);
    this.buildLabels();
    this.buildRoutes();
    this.applyVisibility();
    this.reset(true);
    this.renderer.shadowMap.needsUpdate = true;
  }

  private buildLand(land: Land, index: number) {
    const random = seeded(index * 673 + 144);
    const boundary = land.points;
    const vertices: Point[] = [...boundary];
    const minX = Math.min(...boundary.map((p) => p[0])),
      maxX = Math.max(...boundary.map((p) => p[0]));
    const minZ = Math.min(...boundary.map((p) => p[1])),
      maxZ = Math.max(...boundary.map((p) => p[1]));
    const spacing = this.realm === "spirit" ? 0.78 : 0.7;
    for (let x = minX; x < maxX; x += spacing)
      for (let z = minZ; z < maxZ; z += spacing) {
        const px = x + (random() - 0.5) * spacing * 0.7,
          pz = z + (random() - 0.5) * spacing * 0.7;
        if (inside(px, pz, boundary) && edgeDistance(px, pz, boundary) > 0.25)
          vertices.push([px, pz]);
      }
    const triangulation = Delaunator.from(vertices);
    const positions: number[] = [],
      colors: number[] = [],
      uvs: number[] = [];
    const triangles: THREE.Vector3[][] = [];
    const base = new THREE.Color(land.color);
    for (let t = 0; t < triangulation.triangles.length; t += 3) {
      const indices = [
        triangulation.triangles[t],
        triangulation.triangles[t + 1],
        triangulation.triangles[t + 2],
      ];
      const cx = indices.reduce((s, i) => s + vertices[i][0], 0) / 3,
        cz = indices.reduce((s, i) => s + vertices[i][1], 0) / 3;
      if (!inside(cx, cz, boundary)) continue;
      const tri = indices.map((i) => {
        const [x, z] = vertices[i];
        return new THREE.Vector3(
          x,
          i < boundary.length ? 0.16 : heightAt(x, z, land),
          z,
        );
      });
      const h = tri.reduce((s, v) => s + v.y, 0) / 3;
      const d = edgeDistance(cx, cz, boundary);
      const color = base.clone();
      const patch = noise(cx * 0.35, cz * 0.35);
      color.lerp(
        new THREE.Color(land.region === "west" ? "#b99963" : "#658c64"),
        Math.max(patch, 0) * 0.32,
      );
      if (d < 1.2) color.lerp(new THREE.Color("#e0cf9d"), 0.8 * (1 - d / 1.8));
      if (h > 2.7)
        color.lerp(
          new THREE.Color(this.realm === "celestial" ? "#bab8a0" : "#7b8b70"),
          Math.min((h - 2.7) / 7, 0.68),
        );
      if (h > 5)
        color.lerp(new THREE.Color("#7a8074"), Math.min((h - 5) / 6, 0.85));
      if (land.region === "north" && h > 3)
        color.lerp(new THREE.Color("#e3e9dd"), Math.min((h - 3) / 2.3, 1));
      if (h > 8.5) color.lerp(new THREE.Color("#e2e3d6"), 0.65);
      color.multiplyScalar(0.96 + random() * 0.08);
      // Delaunator winds clockwise in the X/Z plane; reverse for the upward face.
      for (const v of [tri[0], tri[2], tri[1]]) {
        positions.push(v.x, v.y, v.z);
        colors.push(color.r, color.g, color.b);
        uvs.push(v.x * 0.15, v.z * 0.15);
      }
      triangles.push(tri);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: this.terrainTexture,
        roughness: 1,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.terrain.add(mesh);

    const cliffPositions: number[] = [],
      cliffColors: number[] = [];
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i],
        b = boundary[(i + 1) % boundary.length];
      const depth = this.realm === "human" ? -1.5 : -4.8;
      const col = new THREE.Color(
        this.realm === "human" ? "#827e60" : "#989e90",
      ).multiplyScalar(0.86 + random() * 0.22);
      const taper = this.realm === "human" ? 1 : 0.67,
        cx = (minX + maxX) / 2,
        cz = (minZ + maxZ) / 2;
      const ax = cx + (a[0] - cx) * taper,
        az = cz + (a[1] - cz) * taper,
        bx = cx + (b[0] - cx) * taper,
        bz = cz + (b[1] - cz) * taper;
      for (const v of [
        [a[0], 0.16, a[1]],
        [b[0], 0.16, b[1]],
        [ax, depth, az],
        [b[0], 0.16, b[1]],
        [bx, depth, bz],
        [ax, depth, az],
      ]) {
        cliffPositions.push(...v);
        cliffColors.push(col.r, col.g, col.b);
      }
    }
    const cliffs = new THREE.BufferGeometry();
    cliffs.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(cliffPositions, 3),
    );
    cliffs.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(cliffColors, 3),
    );
    cliffs.computeVertexNormals();
    this.terrain.add(
      new THREE.Mesh(
        cliffs,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.coast.add(
      line(
        [...boundary, boundary[0]].map(
          ([x, z]) => new THREE.Vector3(x, 0.21, z),
        ),
        "#f0e3bd",
        0.9,
      ),
    );
    const center = new THREE.Vector2((minX + maxX) / 2, (minZ + maxZ) / 2);
    for (const expansion of [1.035, 1.075, 1.125]) {
      const points = [...boundary, boundary[0]].map(
        ([x, z]) =>
          new THREE.Vector3(
            center.x + (x - center.x) * expansion,
            -0.55,
            center.y + (z - center.y) * expansion,
          ),
      );
      this.water.add(line(points, "#eef0d5", expansion < 1.05 ? 0.53 : 0.24));
    }
    // Marching triangles: elevation contours follow the actual terrain surface.
    const contourPoints: THREE.Vector3[] = [];
    for (const level of [1.5, 2.8, 4.4, 6.5])
      for (const tri of triangles) {
        const crossings: THREE.Vector3[] = [];
        for (let i = 0; i < 3; i++) {
          const a = tri[i],
            b = tri[(i + 1) % 3];
          if ((a.y < level && b.y >= level) || (b.y < level && a.y >= level))
            crossings.push(
              a
                .clone()
                .lerp(b, (level - a.y) / (b.y - a.y))
                .add(new THREE.Vector3(0, 0.04, 0)),
            );
        }
        if (crossings.length === 2) contourPoints.push(...crossings);
      }
    this.terrain.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(contourPoints),
        new THREE.LineBasicMaterial({
          color: "#636c54",
          transparent: true,
          opacity: 0.11,
        }),
      ),
    );
  }

  private surface(x: number, z: number) {
    const land = this.landData.find((land) => inside(x, z, land.points));
    return land ? heightAt(x, z, land) : 0;
  }

  private buildTrees() {
    const random = seeded(4892),
      dummy = new THREE.Object3D();
    type Tree = {
      x: number;
      z: number;
      h: number;
      s: number;
      snow: boolean;
      color: THREE.Color;
    };
    const trees: Tree[] = [];
    for (const land of this.landData) {
      if (this.realm === "celestial" && land.id === "palace") continue;
      const minX = Math.min(...land.points.map((p) => p[0])),
        maxX = Math.max(...land.points.map((p) => p[0]));
      const minZ = Math.min(...land.points.map((p) => p[1])),
        maxZ = Math.max(...land.points.map((p) => p[1]));
      const attempts =
        this.realm === "spirit"
          ? 70
          : land.region === "west"
            ? 160
            : land.id === "east" || land.id === "south"
              ? 1300
              : 850;
      for (let i = 0; i < attempts; i++) {
        const x = minX + random() * (maxX - minX),
          z = minZ + random() * (maxZ - minZ);
        if (!inside(x, z, land.points) || edgeDistance(x, z, land.points) < 1.1)
          continue;
        const h = heightAt(x, z, land),
          cluster = noise(x * 0.26 + 2, z * 0.26);
        if (h > 6.1 || h < 0.35 || cluster < -0.13) continue;
        if (
          places.some(
            (p) =>
              p.realm === this.realm &&
              Math.hypot(p.position[0] - x, p.position[1] - z) <
                (p.kind === "settlement" ? 4.2 : 2.5),
          )
        )
          continue;
        const snow = land.region === "north";
        trees.push({
          x,
          z,
          h,
          s: 0.36 + random() * 0.38,
          snow,
          color: new THREE.Color(snow ? "#55786e" : "#426b4b").lerp(
            new THREE.Color(snow ? "#bccfc1" : "#839b5e"),
            random() * 0.65,
          ),
        });
      }
    }
    const pineParts = [0, 1, 2].map((i) => {
      const g = new THREE.ConeGeometry(0.58 - i * 0.12, 1.25 - i * 0.1, 7);
      g.translate(0, 0.8 + i * 0.46, 0);
      return g;
    });
    const pine = mergeGeometries(pineParts)!;
    pineParts.forEach((g) => g.dispose());
    const leafParts = [
      [-0.27, 1.25, 0],
      [0.24, 1.4, 0.1],
      [0, 1.8, -0.1],
    ].map(([x, y, z]) => {
      const g = new THREE.IcosahedronGeometry(0.6, 0);
      g.translate(x, y, z);
      return g;
    });
    const leaf = mergeGeometries(leafParts)!;
    leafParts.forEach((g) => g.dispose());
    for (const [snow, geometry] of [
      [true, pine],
      [false, leaf],
    ] as const) {
      const instances = trees.filter((t) => t.snow === snow);
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          roughness: 1,
          flatShading: true,
        }),
        instances.length,
      );
      const trunkGeometry = new THREE.CylinderGeometry(0.06, 0.1, 1.15, 5);
      trunkGeometry.translate(0, 0.5, 0);
      const trunks = new THREE.InstancedMesh(
        trunkGeometry,
        new THREE.MeshStandardMaterial({ color: "#746a50", roughness: 1 }),
        instances.length,
      );
      instances.forEach((t, i) => {
        dummy.position.set(t.x, t.h, t.z);
        dummy.scale.set(t.s, t.s * (0.8 + random() * 0.4), t.s);
        dummy.rotation.y = random() * 6;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, t.color);
        trunks.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.trees.add(mesh, trunks);
    }
  }

  private buildGeology() {
    const random = seeded(840),
      dummy = new THREE.Object3D(),
      locations: { x: number; z: number; y: number; s: number }[] = [];
    for (const land of this.landData)
      for (let i = 0; i < (this.realm === "spirit" ? 8 : 65); i++) {
        const p = land.points[Math.floor(random() * land.points.length)];
        const x = p[0] + (random() - 0.5) * 1.3,
          z = p[1] + (random() - 0.5) * 1.3;
        if (!inside(x, z, land.points)) continue;
        locations.push({
          x,
          z,
          y: heightAt(x, z, land),
          s: 0.23 + random() * 0.65,
        });
      }
    const rocks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color: "#8b927e",
        roughness: 1,
        flatShading: true,
      }),
      locations.length,
    );
    locations.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 0.1, p.z);
      dummy.rotation.set(random(), random() * 6, random() * 0.4);
      dummy.scale.set(p.s, p.s * 0.68, p.s * 0.8);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
      rocks.setColorAt(
        i,
        new THREE.Color("#9b9f85").lerp(
          new THREE.Color("#d1c69f"),
          random() * 0.5,
        ),
      );
    });
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.terrain.add(rocks);
  }

  private buildRivers() {
    for (const river of rivers) {
      const curve = new THREE.CatmullRomCurve3(
        river.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      );
      const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      const samples = 180;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples,
          p = curve.getPoint(t),
          tangent = curve.getTangent(t),
          width = 0.17 + t * 0.17;
        for (const side of [-1, 1]) {
          const x = p.x - tangent.z * width * side,
            z = p.z + tangent.x * width * side;
          positions.push(x, this.surface(x, z) + 0.1, z);
          uvs.push(side < 0 ? 0 : 1, t * 20);
        }
        if (i < samples) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const material = createWaterMaterial(this.timeUniform, "#4c9990", 2);
      material.side = THREE.DoubleSide;
      this.water.add(new THREE.Mesh(geometry, material));
    }
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 64),
      createWaterMaterial(this.timeUniform, "#386e6e", 1.3),
    );
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(0.72, 1, 1);
    lake.position.set(-36, 0.6, 4);
    this.water.add(lake);
    this.water.add(makeSeaEye(this.timeUniform));
    // The sea eye is a geographic water marker rather than an invented route.
    for (let i = 0; i < 4; i++) {
      const points = Array.from({ length: 80 }, (_, j) => {
        const angle = (j / 79) * Math.PI * 2;
        return new THREE.Vector3(
          -43 + Math.cos(angle) * (1.2 + i * 0.65),
          -0.48,
          26 + Math.sin(angle) * (1.2 + i * 0.65),
        );
      });
      this.water.add(line(points, "#6f9990", 0.28 - i * 0.04));
    }
  }

  private labelElement(className: string) {
    const el = document.createElement("div");
    el.className = className;
    const object = new CSS2DObject(el);
    return { el, object };
  }

  private buildLabels() {
    const largeMarkers = new Set([
      "kunlun",
      "lingxu",
      "qingniu",
      "penglai",
      "wanzang",
      "duanjian",
      "taiyuan",
      "dayan",
      "lian",
      "wujin",
      "snow-pass",
      "shang",
      "zhou",
      "tianji",
      "tianque",
      "yuedu",
      "zhaochuan",
      "jiutian",
      "abandoned",
      "twelve",
    ]);
    for (const region of regions.filter((r) => r.realm === this.realm)) {
      if (this.realm === "spirit") continue;
      const { el, object } = this.labelElement(
        `region-label ${region.water ? "sea-label" : ""}`,
      );
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `查看${region.name}地域`);
      const title = document.createElement("span");
      title.className = "region-name";
      title.textContent = region.name;
      const sub = document.createElement("span");
      sub.className = "region-en";
      sub.textContent = region.en;
      button.append(title, sub);
      button.onclick = () => this.callbacks.region(region.id);
      el.append(button);
      object.position.set(region.label[0], 0.8, region.label[1]);
      this.annotations.add(object);
      this.labels.push({ object, el, regionId: region.id });
    }
    for (const place of places.filter((p) => p.realm === this.realm)) {
      const { el, object } = this.labelElement(
        `place-label kind-${place.kind}`,
      );
      el.dataset.place = place.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "place-button";
      button.title = `${place.name} · ${place.subtitle}`;
      button.setAttribute("aria-label", `查看${place.name}`);
      const icon = document.createElement("span");
      icon.className = "place-pin";
      icon.innerHTML =
        place.kind === "mountain"
          ? '<svg viewBox="0 0 16 16"><path d="m2 12 5-8 3 5 2-3 3 6Z"/></svg>'
          : place.kind === "settlement"
            ? '<svg viewBox="0 0 16 16"><path d="M3 12V6l5-3 5 3v6H3Zm3 0V9h4v3M2 6h12"/></svg>'
            : place.kind === "water"
              ? '<svg viewBox="0 0 16 16"><path d="M2 6q2-3 4 0t4 0 4 0M2 10q2-3 4 0t4 0 4 0"/></svg>'
              : '<svg viewBox="0 0 16 16"><path d="M3 13V6l3-3 2 3 2-2 3 3v6M2 13h12M6 13V9h4v4"/></svg>';
      const text = document.createElement("span");
      text.className = "place-name";
      text.textContent =
        place.realm === "spirit" ? place.name.replace("洞天 ", "") : place.name;
      button.append(icon, text);
      button.onclick = (event) => {
        event.stopPropagation();
        this.callbacks.select(place.id);
      };
      el.append(button);
      object.position.set(
        place.position[0],
        this.surface(...place.position) + 0.45,
        place.position[1],
      );
      this.placeLabels.add(object);
      this.labels.push({
        object,
        el,
        place,
        minor: !largeMarkers.has(place.id) && place.realm !== "spirit",
      });
    }
  }

  private buildRoutes() {
    for (const route of connections) {
      const a = places.find((p) => p.id === route.from),
        b = places.find((p) => p.id === route.to);
      if (!a || !b || a.realm !== this.realm) continue;
      const points = Array.from({ length: 50 }, (_, i) => {
        const t = i / 49,
          x = THREE.MathUtils.lerp(a.position[0], b.position[0], t),
          z = THREE.MathUtils.lerp(a.position[1], b.position[1], t);
        return new THREE.Vector3(x, this.surface(x, z) + 0.25, z);
      });
      this.routeLines.add(line(points, "#926438", 0.8, true));
    }
  }

  setLayers(layers: Layers) {
    this.needsRender = true;
    this.layers = layers;
    this.applyVisibility();
    this.renderer.shadowMap.needsUpdate = true;
  }
  private applyVisibility() {
    this.terrain.visible = this.layers.terrain;
    this.trees.visible = this.layers.terrain && this.layers.vegetation;
    this.structures.visible = this.layers.terrain && this.layers.buildings;
    this.details.visible = this.structures.visible && this.camera.zoom > 1.3;
    this.clouds.visible = this.layers.atmosphere;
    this.water.visible = this.layers.water;
    this.annotations.visible = this.layers.labels;
    this.routeLines.visible = this.layers.connections;
    this.placeLabels.visible = this.layers.places;
    this.renderer.domElement.dataset.buildings = String(
      this.structures.visible,
    );
    this.renderer.domElement.dataset.vegetation = String(this.trees.visible);
    this.renderer.domElement.dataset.detail =
      this.camera.zoom > 2.8 ? "close" : "overview";
    for (const label of this.labels) {
      if (label.place) {
        const compact = this.host.clientWidth < 650;
        const compactPriority = new Set([
          "qingniu",
          "kunlun",
          "penglai",
          "duanjian",
          "wujin",
          "tianque",
          "yuedu",
          "zhaochuan",
          "jiutian",
        ]);
        const show =
          (this.layers.places && this.selected === label.place.id) ||
          (this.layers.places &&
            (!label.minor || this.camera.zoom > 1.6) &&
            (!compact ||
              this.camera.zoom > 1.6 ||
              label.place.realm === "spirit" ||
              compactPriority.has(label.place.id)));
        label.object.visible = show;
        label.el.style.display = show ? "" : "none";
        label.el.classList.toggle("selected", this.selected === label.place.id);
      } else {
        const show = this.layers.labels && this.camera.zoom < 2.8;
        label.object.visible = show;
        label.el.style.display = show ? "" : "none";
      }
    }
  }

  selectPlace(id: string | null, focus = true) {
    this.needsRender = true;
    this.selected = id;
    const place = places.find((p) => p.id === id);
    this.selectionRing.visible = !!place;
    if (place) {
      const h = this.surface(...place.position);
      this.selectionRing.position.set(
        place.position[0],
        h + 0.2,
        place.position[1],
      );
      if (focus) {
        const compact = this.host.clientWidth < 650;
        const zoom = Math.max(this.camera.zoom, compact ? 2.2 : 1.65);
        this.focus(
          [
            place.position[0],
            place.position[1] + (compact ? this.mobileOffset(zoom, 0.26) : 0),
          ],
          zoom,
        );
      }
    }
    this.applyVisibility();
  }

  setLighting(lighting: Lighting) {
    this.needsRender = true;
    this.lighting = lighting;
    const settings = {
      day: {
        ambient: "#e6efe0",
        ambientPower: 1.3,
        sun: "#fff0d0",
        sunPower: 2.4,
        water: "#71a79c",
        fill: "#c7e5e1",
        window: 0.12,
      },
      dusk: {
        ambient: "#c2bcc8",
        ambientPower: 1.05,
        sun: "#ffc184",
        sunPower: 2.3,
        water: "#72958f",
        fill: "#9aafd3",
        window: 1.25,
      },
      night: {
        ambient: "#92a7c4",
        ambientPower: 1.05,
        sun: "#b4cce5",
        sunPower: 0.6,
        water: "#264c5b",
        fill: "#7494bd",
        window: 1.8,
      },
    }[lighting];
    this.ambient.color.set(settings.ambient);
    this.ambient.intensity = settings.ambientPower;
    this.sunlight.color.set(settings.sun);
    this.sunlight.intensity = settings.sunPower;
    this.fill.color.set(settings.fill);
    this.ocean.material.color.set(
      this.realm === "human"
        ? settings.water
        : lighting === "night"
          ? "#30485d"
          : lighting === "dusk"
            ? "#b3ada8"
            : "#b7c8bf",
    );
    this.renderer.setClearColor(this.ocean.material.color);
    this.architecture?.lights.forEach((material) => {
      material.emissiveIntensity = settings.window;
    });
    for (const group of [this.water, this.coast])
      group.traverse((object) => {
        if (object instanceof THREE.Line) {
          const material = object.material as THREE.LineBasicMaterial;
          if (material.userData.baseOpacity === undefined)
            material.userData.baseOpacity = material.opacity;
          material.opacity =
            material.userData.baseOpacity *
            (lighting === "night" ? 0.19 : lighting === "dusk" ? 0.45 : 0.62);
        }
      });
    this.weather?.lighting(lighting);
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.dataset.lighting = lighting;
  }

  setMotion(motion: boolean) {
    this.needsRender = true;
    this.motion = motion;
    this.renderer.domElement.dataset.motion = String(motion);
  }

  inspectPlace(id: string) {
    const place = places.find((p) => p.id === id);
    if (!place || place.realm !== this.realm) return;
    const compact = this.host.clientWidth < 650;
    const zoom = compact ? 4.5 : 3.8;
    this.focus(
      [
        place.position[0],
        place.position[1] + (compact ? this.mobileOffset(zoom, 0.31) : 0),
      ],
      zoom,
      this.surface(...place.position) * 0.75,
    );
  }

  private mobileOffset(zoom: number, screenFraction: number) {
    const pixelsPerUnit =
      (this.host.clientWidth / (this.camera.right - this.camera.left)) * zoom;
    const projection = this.cameraAngle.y / this.cameraAngle.length();
    return (
      (this.host.clientHeight * screenFraction) / (pixelsPerUnit * projection)
    );
  }

  focus(point: Point, zoom = 1.45, elevation = 0) {
    this.tween = {
      start: performance.now(),
      from: this.controls.target.clone(),
      to: new THREE.Vector3(point[0], elevation, point[1]),
      zoom: this.camera.zoom,
      targetZoom: zoom,
    };
  }
  zoomBy(factor: number) {
    this.focus(
      [this.controls.target.x, this.controls.target.z],
      THREE.MathUtils.clamp(this.camera.zoom * factor, 0.65, 7),
      this.controls.target.y,
    );
  }
  reset(immediate = false) {
    const target: Point = this.realm === "human" ? [4, 3] : [0, 0];
    if (immediate) {
      this.tween = undefined;
      this.controls.target.set(target[0], 0, target[1]);
      this.camera.position.copy(this.cameraAngle).add(this.controls.target);
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.handleChange();
      this.applyVisibility();
    } else this.focus(target, 1);
  }
  setFlat(flat: boolean) {
    this.cameraAngle.set(0, flat ? 155 : 115, flat ? 0.01 : 105);
    this.camera.position.copy(this.cameraAngle).add(this.controls.target);
    this.controls.update();
  }
  resize() {
    this.needsRender = true;
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const vertical = Math.max(50, 76 / aspect);
    this.camera.left = -vertical * aspect;
    this.camera.right = vertical * aspect;
    this.camera.top = vertical;
    this.camera.bottom = -vertical;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
    this.applyVisibility();
    this.notifyViewport(true);
  }

  private animate = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    // Cap to ~40 FPS, and stop submitting frames for a hidden tab.
    if (document.hidden || time - this.previousTime < 24) return;
    const delta = Math.min((time - this.previousTime) / 1000, 0.08);
    this.previousTime = time;
    if (this.motion) this.elapsed += delta;
    this.timeUniform.value = this.elapsed;
    this.architecture?.animated.forEach((animation) =>
      animation.tick(this.elapsed),
    );
    this.weather?.tick(this.elapsed);
    if (this.tween) {
      const t = Math.min((time - this.tween.start) / 650, 1),
        e = 1 - Math.pow(1 - t, 3);
      const target = this.tween.from.clone().lerp(this.tween.to, e);
      const delta = target.clone().sub(this.controls.target);
      this.camera.position.add(delta);
      this.controls.target.copy(target);
      this.camera.zoom = THREE.MathUtils.lerp(
        this.tween.zoom,
        this.tween.targetZoom,
        e,
      );
      this.camera.updateProjectionMatrix();
      this.handleChange();
      if (t >= 1) {
        this.tween = undefined;
        // Always publish the final value, even when the last easing step is
        // smaller than the change-event threshold (e.g. 449% -> 450%).
        this.lastZoom = this.camera.zoom;
        this.callbacks.zoom(this.camera.zoom);
        this.applyVisibility();
        this.notifyViewport(true);
      }
    }
    if (this.selectionRing.visible) {
      const s = 1 + Math.sin(this.elapsed * 1.6) * 0.08;
      this.selectionRing.scale.setScalar(s);
    }
    this.controls.update();
    if (this.motion || this.needsRender || this.tween) {
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.scene.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove();
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        object.geometry.dispose();
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((material) => {
          const map = (material as THREE.MeshStandardMaterial).map;
          if (map) map.dispose();
          material.dispose();
        });
      }
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    this.terrainTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}

import * as THREE from 'three';
import Delaunator from 'delaunator';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { celestialLands, connections, humanLands, places, regions, rivers } from './data';
import type { Land, Place, Point, Realm } from './data';

export interface Layers { terrain: boolean; water: boolean; places: boolean; labels: boolean; connections: boolean }
type Callbacks = { select: (id: string) => void; region: (id: string) => void; zoom: (value: number) => void; ready: () => void };

function seeded(seed: number) {
  let state = seed;
  return () => { state |= 0; state = state + 0x6D2B79F5 | 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function noise(x: number, y: number) {
  return Math.sin(x * 0.71 + Math.cos(y * 0.43)) * 0.36 + Math.sin(y * 1.19 + x * 0.39) * 0.24 + Math.cos(x * 1.93 - y * 0.79) * 0.13;
}
function inside(x: number, y: number, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function edgeDistance(x: number, z: number, polygon: Point[]) {
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return distance;
}
function heightAt(x: number, z: number, land: Land) {
  const d = edgeDistance(x, z, land.points);
  let h = 0.8 + noise(x, z) * 0.5;
  for (const [px, pz, height, width] of land.peaks) {
    const dx = x - px, dz = z - pz;
    h += height * Math.exp(-(dx * dx * 0.8 + dz * dz * 1.4) / (width * width)) * (0.8 + noise(x * 1.4, z * 1.4) * 0.3);
  }
  return Math.max(0.12, h * Math.min(d / 1.7, 1));
}
function smoothPolygon(points: Point[]): Point[] {
  const curve = new THREE.CatmullRomCurve3(points.map(([x,z]) => new THREE.Vector3(x,0,z)), true, 'catmullrom', 0.35);
  return curve.getPoints(points.length * 5).slice(0, -1).map(p => [p.x,p.z]);
}
function line(points: THREE.Vector3[], color: THREE.ColorRepresentation, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.55, gapSize: 0.35 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
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
  private clouds = new THREE.Group();
  private coast = new THREE.Group();
  private landData: Land[] = [];
  private labels: { object: CSS2DObject; el: HTMLElement; place?: Place; regionId?: string; minor?: boolean }[] = [];
  private observer: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private realm: Realm = 'human';
  private layers: Layers = { terrain: true, water: true, places: true, labels: true, connections: false };
  private selected: string | null = null;
  private lastZoom = 0;
  private tween?: { start: number; from: THREE.Vector3; to: THREE.Vector3; zoom: number; targetZoom: number };
  private flat = false;
  private cameraAngle = new THREE.Vector3(0, 115, 105);
  private selectionRing: THREE.Mesh;
  private previousTime = 0;

  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#b9d2ca');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'atlas-canvas';
    this.renderer.domElement.setAttribute('aria-label', '可交互的三界立体地形地图。拖动平移，滚轮缩放，使用地点按钮查看详情。');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.className = 'map-labels';
    host.appendChild(this.labelRenderer.domElement);
    this.camera.position.copy(this.cameraAngle);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 5;
    this.controls.zoomSpeed = 0.9;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('start', () => { this.tween = undefined; });
    this.controls.addEventListener('change', this.handleChange);
    this.scene.add(new THREE.AmbientLight('#e4f1e9', 1.25));
    const sunlight = new THREE.DirectionalLight('#fff3d2', 2.3);
    sunlight.position.set(-40, 85, -35);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048,2048);
    sunlight.shadow.camera.left = -100; sunlight.shadow.camera.right = 100;
    sunlight.shadow.camera.top = 100; sunlight.shadow.camera.bottom = -100;
    sunlight.shadow.normalBias = 0.18;
    sunlight.shadow.bias = -0.001;
    sunlight.shadow.radius = 3;
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight('#c7e5e1', 0.5);
    fill.position.set(50,20,50); this.scene.add(fill);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1400,1400), new THREE.MeshStandardMaterial({color: '#b1cec4', roughness: 0.94}));
    ocean.rotation.x = -Math.PI / 2; ocean.position.y = -0.8; ocean.receiveShadow = true;
    this.scene.add(ocean);
    this.drawGrid();
    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(1.1,1.21,64), new THREE.MeshBasicMaterial({color: '#a77b3e', transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide}));
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 10;
    this.scene.add(this.selectionRing);
    for (const group of [this.terrain,this.water,this.trees,this.annotations,this.placeLabels,this.routeLines,this.structures,this.clouds,this.coast]) this.scene.add(group);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.setRealm('human');
    this.resize();
    this.animate(0);
    window.setTimeout(() => { if (!this.disposed) callbacks.ready(); }, 200);
  }

  private handleChange = () => {
    if (Math.abs(this.camera.zoom - this.lastZoom) > 0.01) {
      this.lastZoom = this.camera.zoom;
      this.callbacks.zoom(this.camera.zoom);
      this.applyVisibility();
    }
  };

  private drawGrid() {
    const points: THREE.Vector3[] = [];
    for (let x = -150; x <= 150; x += 12) points.push(new THREE.Vector3(x,-0.75,-150),new THREE.Vector3(x,-0.75,150));
    for (let z = -150; z <= 150; z += 12) points.push(new THREE.Vector3(-150,-0.75,z),new THREE.Vector3(150,-0.75,z));
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:'#648f82', transparent:true, opacity:0.09}));
    this.scene.add(grid);
    // Dotted intersections evoke the registration marks of a printed atlas.
    const dots: number[] = [];
    for (let x=-150;x<=150;x+=12) for (let z=-150;z<=150;z+=12) dots.push(x,-0.7,z);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));
    this.scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:'#4b8175',size:0.15,transparent:true,opacity:0.2})));
  }

  private clear(group: THREE.Group) {
    group.traverse(object => {
      if (object instanceof CSS2DObject) object.element.remove();
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    group.clear();
  }

  setRealm(realm: Realm) {
    this.tween=undefined;
    this.realm = realm;
    this.selected = null;
    this.selectionRing.visible = false;
    this.labels = [];
    for (const group of [this.terrain,this.water,this.trees,this.annotations,this.placeLabels,this.routeLines,this.structures,this.clouds,this.coast]) this.clear(group);
    if (realm === 'human') this.landData = humanLands.map(land => ({...land,points:smoothPolygon(land.points)}));
    else if (realm === 'celestial') this.landData = celestialLands.map(land => ({...land,points:smoothPolygon(land.points)}));
    else this.landData = places.filter(place => place.realm === 'spirit').map((place,i) => {
      const [x,z] = place.position;
      const random = seeded(i + 43); const rx = 4+random()*2.5, rz = 2.9+random()*1.5;
      const polygon: Point[] = Array.from({length:10},(_,j) => { const a=j/10*Math.PI*2; const r=0.8+random()*0.3; return [x+Math.cos(a)*rx*r,z+Math.sin(a)*rz*r]; });
      return { id:place.id,region:'caves',color:i%3===0?'#b5bf9c':'#9fb8a3',points:smoothPolygon(polygon),peaks:[[x-1,z-1,2.2+random()*4,2]] };
    });
    this.landData.forEach((land,i) => this.buildLand(land,i));
    this.buildTrees();
    if (realm === 'human') this.buildRivers();
    else this.buildClouds();
    if (realm === 'celestial') this.buildCelestialArchitecture();
    this.buildLabels();
    this.buildRoutes();
    this.applyVisibility();
    this.reset(true);
  }

  private buildLand(land: Land, index: number) {
    const random = seeded(index * 673 + 144);
    const boundary = land.points;
    const vertices: Point[] = [...boundary];
    const minX = Math.min(...boundary.map(p=>p[0])), maxX = Math.max(...boundary.map(p=>p[0]));
    const minZ = Math.min(...boundary.map(p=>p[1])), maxZ = Math.max(...boundary.map(p=>p[1]));
    const spacing = this.realm==='spirit' ? 1.15 : 1.15;
    for (let x=minX;x<maxX;x+=spacing) for (let z=minZ;z<maxZ;z+=spacing) {
      const px=x+(random()-0.5)*spacing*0.7, pz=z+(random()-0.5)*spacing*0.7;
      if (inside(px,pz,boundary) && edgeDistance(px,pz,boundary)>0.25) vertices.push([px,pz]);
    }
    const triangulation = Delaunator.from(vertices);
    const positions: number[] = [], colors: number[] = [];
    const triangles: THREE.Vector3[][] = [];
    const base = new THREE.Color(land.color);
    for (let t=0;t<triangulation.triangles.length;t+=3) {
      const indices = [triangulation.triangles[t],triangulation.triangles[t+1],triangulation.triangles[t+2]];
      const cx=indices.reduce((s,i)=>s+vertices[i][0],0)/3, cz=indices.reduce((s,i)=>s+vertices[i][1],0)/3;
      if (!inside(cx,cz,boundary)) continue;
      const tri = indices.map(i => { const [x,z] = vertices[i]; return new THREE.Vector3(x,i<boundary.length?0.16:heightAt(x,z,land),z); });
      const h=tri.reduce((s,v)=>s+v.y,0)/3;
      const d=edgeDistance(cx,cz,boundary);
      const color=base.clone();
      if (d<1.2) color.lerp(new THREE.Color('#ded0a3'),0.65);
      if (h>2.7) color.lerp(new THREE.Color(this.realm==='celestial'?'#c0bba5':'#8a987a'),Math.min((h-2.7)/7,0.68));
      if (h>5) color.lerp(new THREE.Color('#8d9484'),Math.min((h-5)/6,0.8));
      if (land.region==='north'&&h>4.3) color.lerp(new THREE.Color('#f0efe1'),Math.min((h-4.3)/2,1));
      if (h>8.2) color.lerp(new THREE.Color('#e1e0ce'),0.7);
      color.multiplyScalar(0.95+random()*0.1);
      // Delaunator winds clockwise in the X/Z plane; reverse for the upward face.
      for (const v of [tri[0],tri[2],tri[1]]) { positions.push(v.x,v.y,v.z); colors.push(color.r,color.g,color.b); }
      triangles.push(tri);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true,side:THREE.DoubleSide}));
    mesh.castShadow=true; mesh.receiveShadow=true;
    this.terrain.add(mesh);

    const cliffPositions:number[]=[], cliffColors:number[]=[];
    for (let i=0;i<boundary.length;i++) {
      const a=boundary[i],b=boundary[(i+1)%boundary.length];
      const depth=this.realm==='human'?-1.3:-3.4;
      const col=new THREE.Color(this.realm==='human'?'#827e60':'#989e90').multiplyScalar(0.86+random()*0.22);
      for (const v of [[a[0],0.16,a[1]],[b[0],0.16,b[1]],[a[0],depth,a[1]],[b[0],0.16,b[1]],[b[0],depth,b[1]],[a[0],depth,a[1]]]) { cliffPositions.push(...v); cliffColors.push(col.r,col.g,col.b); }
    }
    const cliffs=new THREE.BufferGeometry();cliffs.setAttribute('position',new THREE.Float32BufferAttribute(cliffPositions,3));cliffs.setAttribute('color',new THREE.Float32BufferAttribute(cliffColors,3));cliffs.computeVertexNormals();
    this.terrain.add(new THREE.Mesh(cliffs,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));
    this.coast.add(line([...boundary,boundary[0]].map(([x,z])=>new THREE.Vector3(x,0.21,z)),'#f0e3bd',0.9));
    const center=new THREE.Vector2((minX+maxX)/2,(minZ+maxZ)/2);
    for (const expansion of [1.035,1.075,1.125]) {
      const points=[...boundary,boundary[0]].map(([x,z])=>new THREE.Vector3(center.x+(x-center.x)*expansion,-0.55,center.y+(z-center.y)*expansion));
      this.water.add(line(points,'#eef0d5',expansion<1.05?0.53:0.24));
    }
    // Marching triangles: elevation contours follow the actual terrain surface.
    const contourPoints:THREE.Vector3[]=[];
    for (const level of [1.5,2.8,4.4,6.5]) for (const tri of triangles) {
      const crossings:THREE.Vector3[]=[];
      for (let i=0;i<3;i++) {
        const a=tri[i],b=tri[(i+1)%3];
        if ((a.y<level&&b.y>=level)||(b.y<level&&a.y>=level)) crossings.push(a.clone().lerp(b,(level-a.y)/(b.y-a.y)).add(new THREE.Vector3(0,0.04,0)));
      }
      if(crossings.length===2) contourPoints.push(...crossings);
    }
    this.terrain.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(contourPoints),new THREE.LineBasicMaterial({color:'#636c54',transparent:true,opacity:0.11})));
  }

  private surface(x:number,z:number) {
    const land=this.landData.find(land=>inside(x,z,land.points));
    return land?heightAt(x,z,land):0;
  }

  private buildTrees() {
    const random=seeded(4892);
    const locations:{x:number;z:number;h:number;s:number}[]=[];
    for (const land of this.landData) {
      if(this.realm==='celestial'&&land.id==='palace')continue;
      const minX=Math.min(...land.points.map(p=>p[0])),maxX=Math.max(...land.points.map(p=>p[0]));
      const minZ=Math.min(...land.points.map(p=>p[1])),maxZ=Math.max(...land.points.map(p=>p[1]));
      const count=this.realm==='spirit'?18:land.region==='west'?35:140;
      for(let i=0;i<count;i++) {
        const x=minX+random()*(maxX-minX),z=minZ+random()*(maxZ-minZ);
        if(!inside(x,z,land.points)||edgeDistance(x,z,land.points)<1.4)continue;
        const h=heightAt(x,z,land);
        if(h>5.7||h<0.4)continue;
        if(places.some(p=>p.realm===this.realm&&Math.hypot(p.position[0]-x,p.position[1]-z)<1.7))continue;
        locations.push({x,z,h,s:0.45+random()*0.5});
      }
    }
    const treeGeometry=new THREE.ConeGeometry(0.45,1.8,5);
    treeGeometry.translate(0,0.8,0);
    const tree=new THREE.InstancedMesh(treeGeometry,new THREE.MeshStandardMaterial({color:'#58765c',roughness:1,flatShading:true}),locations.length);
    const dummy=new THREE.Object3D();
    locations.forEach((p,i)=>{dummy.position.set(p.x,p.h,p.z);dummy.scale.set(p.s,p.s,p.s);dummy.rotation.y=random()*Math.PI;dummy.updateMatrix();tree.setMatrixAt(i,dummy.matrix);tree.setColorAt(i,new THREE.Color().setHSL(0.24+random()*0.06,0.13+random()*0.1,0.3+random()*0.12));});
    tree.castShadow=true;tree.receiveShadow=true;this.trees.add(tree);
  }

  private buildRivers() {
    for(const river of rivers) {
      const curve=new THREE.CatmullRomCurve3(river.map(([x,z])=>new THREE.Vector3(x,0,z)));
      const points=curve.getPoints(160).map(p=>new THREE.Vector3(p.x,this.surface(p.x,p.z)+0.12,p.z));
      const path=new THREE.CatmullRomCurve3(points);
      const riverMesh=new THREE.Mesh(new THREE.TubeGeometry(path,150,0.13,5,false),new THREE.MeshBasicMaterial({color:'#78aaa1'}));
      this.water.add(riverMesh);
    }
    const lake=new THREE.Mesh(new THREE.CircleGeometry(2.7,48),new THREE.MeshStandardMaterial({color:'#5c918d',roughness:0.5}));
    lake.rotation.x=-Math.PI/2;lake.scale.set(0.68,1,1);lake.position.set(-36,this.surface(-36,4)+0.12,4);this.water.add(lake);
    // The sea eye is a geographic water marker rather than an invented route.
    for(let i=0;i<4;i++) {
      const points=Array.from({length:80},(_,j)=>{const angle=j/79*Math.PI*2;return new THREE.Vector3(-43+Math.cos(angle)*(1.2+i*0.65),-0.48,26+Math.sin(angle)*(1.2+i*0.65));});
      this.water.add(line(points,'#6f9990',0.28-i*0.04));
    }
  }

  private buildClouds() {
    const random=seeded(771);
    for(let i=0;i<42;i++) {
      const x=(random()-0.5)*140,z=(random()-0.5)*100;
      const shape=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:'#eef0df',transparent:true,opacity:0.16,depthWrite:false}));
      shape.position.set(x,-0.25,z);shape.scale.set(5+random()*8,0.25,2+random()*3);this.clouds.add(shape);
    }
  }

  private buildCelestialArchitecture() {
    const ivory=new THREE.MeshStandardMaterial({color:'#e4d9bb',roughness:0.9});
    const roof=new THREE.MeshStandardMaterial({color:'#6f8b79',roughness:1});
    const palace=(x:number,z:number,size:number)=>{
      const y=this.surface(x,z);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(size*1.3,size*1.5,0.7,4),ivory);base.position.set(x,y+0.3,z);base.rotation.y=Math.PI/4;this.structures.add(base);
      const body=new THREE.Mesh(new THREE.BoxGeometry(size,1.6,size),ivory);body.position.set(x,y+1.2,z);body.castShadow=true;this.structures.add(body);
      const top=new THREE.Mesh(new THREE.ConeGeometry(size,1,4),roof);top.position.set(x,y+2.5,z);top.rotation.y=Math.PI/4;top.castShadow=true;this.structures.add(top);
    };
    [[0,0],[-8,-4],[8,-5],[-7,7],[7,7]].forEach(([x,z])=>palace(x,z,2.1));
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI*2,x=Math.cos(a)*15,z=Math.sin(a)*10;
      const y=this.surface(x,z);
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.65,3.2,6),ivory);tower.position.set(x,y+1.6,z);tower.castShadow=true;this.structures.add(tower);
      const top=new THREE.Mesh(new THREE.ConeGeometry(0.85,0.8,6),roof);top.position.set(x,y+3.5,z);this.structures.add(top);
    }
    for(let tier=0;tier<3;tier++) {
      const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.5-tier*0.8,4.2-tier*0.8,0.6,8),ivory);platform.position.set(31,this.surface(31,17)+tier*0.7,17);platform.castShadow=true;this.structures.add(platform);
    }
    palace(-31,4,1.6);palace(31,17,1.6);
  }

  private labelElement(className:string) {
    const el=document.createElement('div');el.className=className;
    const object=new CSS2DObject(el);
    return {el,object};
  }

  private buildLabels() {
    const largeMarkers=new Set(['kunlun','lingxu','qingniu','penglai','wanzang','duanjian','taiyuan','dayan','lian','wujin','snow-pass','shang','zhou','tianji','tianque','yuedu','zhaochuan','jiutian','abandoned','twelve']);
    for(const region of regions.filter(r=>r.realm===this.realm)) {
      if(this.realm==='spirit')continue;
      const {el,object}=this.labelElement(`region-label ${region.water?'sea-label':''}`);
      const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`查看${region.name}地域`);
      const title=document.createElement('span');title.className='region-name';title.textContent=region.name;
      const sub=document.createElement('span');sub.className='region-en';sub.textContent=region.en;
      button.append(title,sub);button.onclick=()=>this.callbacks.region(region.id);el.append(button);
      object.position.set(region.label[0],0.8,region.label[1]);
      this.annotations.add(object);this.labels.push({object,el,regionId:region.id});
    }
    for(const place of places.filter(p=>p.realm===this.realm)) {
      const {el,object}=this.labelElement(`place-label kind-${place.kind}`);
      el.dataset.place=place.id;
      const button=document.createElement('button');button.type='button';button.className='place-button';button.title=`${place.name} · ${place.subtitle}`;button.setAttribute('aria-label',`查看${place.name}`);
      const icon=document.createElement('span');icon.className='place-pin';
      icon.innerHTML=place.kind==='mountain'?'<svg viewBox="0 0 16 16"><path d="m2 12 5-8 3 5 2-3 3 6Z"/></svg>':place.kind==='settlement'?'<svg viewBox="0 0 16 16"><path d="M3 12V6l5-3 5 3v6H3Zm3 0V9h4v3M2 6h12"/></svg>':place.kind==='water'?'<svg viewBox="0 0 16 16"><path d="M2 6q2-3 4 0t4 0 4 0M2 10q2-3 4 0t4 0 4 0"/></svg>':'<svg viewBox="0 0 16 16"><path d="M3 13V6l3-3 2 3 2-2 3 3v6M2 13h12M6 13V9h4v4"/></svg>';
      const text=document.createElement('span');text.className='place-name';text.textContent=place.realm==='spirit'?place.name.replace('洞天 ',''):place.name;
      button.append(icon,text);button.onclick=(event)=>{event.stopPropagation();this.callbacks.select(place.id);};
      el.append(button);
      object.position.set(place.position[0],this.surface(...place.position)+0.45,place.position[1]);
      this.placeLabels.add(object);
      this.labels.push({object,el,place,minor:!largeMarkers.has(place.id)&&place.realm!=='spirit'});
    }
  }

  private buildRoutes() {
    for(const route of connections) {
      const a=places.find(p=>p.id===route.from),b=places.find(p=>p.id===route.to);
      if(!a||!b||a.realm!==this.realm)continue;
      const points=Array.from({length:50},(_,i)=>{const t=i/49,x=THREE.MathUtils.lerp(a.position[0],b.position[0],t),z=THREE.MathUtils.lerp(a.position[1],b.position[1],t);return new THREE.Vector3(x,this.surface(x,z)+0.25,z);});
      this.routeLines.add(line(points,'#926438',0.8,true));
    }
  }

  setLayers(layers:Layers) { this.layers=layers;this.applyVisibility(); }
  private applyVisibility() {
    this.terrain.visible=this.layers.terrain;this.trees.visible=this.layers.terrain;this.structures.visible=this.layers.terrain;
    this.water.visible=this.layers.water;this.annotations.visible=this.layers.labels;this.routeLines.visible=this.layers.connections;this.placeLabels.visible=this.layers.places;
    for(const label of this.labels) {
      if(label.place) {
        const compact=this.host.clientWidth<650;
        const compactPriority=new Set(['qingniu','kunlun','penglai','duanjian','wujin','tianque','yuedu','zhaochuan','jiutian']);
        const show=this.layers.places&&this.selected===label.place.id||this.layers.places&&
          (!label.minor||this.camera.zoom>1.6)&&
          (!compact||this.camera.zoom>1.6||label.place.realm==='spirit'||compactPriority.has(label.place.id));
        label.object.visible=show;label.el.style.display=show?'':'none';
        label.el.classList.toggle('selected',this.selected===label.place.id);
      } else {
        const show=this.layers.labels&&this.camera.zoom<2.8;
        label.object.visible=show;label.el.style.display=show?'':'none';
      }
    }
  }

  selectPlace(id:string|null,focus=true) {
    this.selected=id;const place=places.find(p=>p.id===id);
    this.selectionRing.visible=!!place;
    if(place) {
      const h=this.surface(...place.position);
      this.selectionRing.position.set(place.position[0],h+0.2,place.position[1]);
      if(focus) {
        const compact=this.host.clientWidth<650;
        this.focus([place.position[0],place.position[1]+(compact?22:0)],Math.max(this.camera.zoom,compact?1.9:1.65));
      }
    }
    this.applyVisibility();
  }

  focus(point:Point,zoom=1.45) {
    this.tween={start:performance.now(),from:this.controls.target.clone(),to:new THREE.Vector3(point[0],0,point[1]),zoom:this.camera.zoom,targetZoom:zoom};
  }
  zoomBy(factor:number) { this.focus([this.controls.target.x,this.controls.target.z],THREE.MathUtils.clamp(this.camera.zoom*factor,0.65,5)); }
  reset(immediate=false) {
    const target:Point=this.realm==='human'?[4,3]:[0,0];
    if(immediate) {this.tween=undefined;this.controls.target.set(target[0],0,target[1]);this.camera.position.copy(this.cameraAngle).add(this.controls.target);this.camera.zoom=1;this.camera.updateProjectionMatrix();this.controls.update();this.handleChange();this.applyVisibility();}
    else this.focus(target,1);
  }
  setFlat(flat:boolean) {
    this.flat=flat;this.cameraAngle.set(0,flat?155:115,flat?0.01:105);
    this.camera.position.copy(this.cameraAngle).add(this.controls.target);this.controls.update();
  }
  resize() {
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    const aspect=width/height;
    const vertical=Math.max(50,76/aspect);
    this.camera.left=-vertical*aspect;this.camera.right=vertical*aspect;this.camera.top=vertical;this.camera.bottom=-vertical;
    this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);this.labelRenderer.setSize(width,height);this.applyVisibility();
  }

  private animate = (time:number) => {
    if(this.disposed)return;
    this.frame=requestAnimationFrame(this.animate);
    // Cap to ~40 FPS, and stop submitting frames for a hidden tab.
    if(document.hidden||time-this.previousTime<24)return;
    this.previousTime=time;
    if(this.tween) {
      const t=Math.min((time-this.tween.start)/650,1),e=1-Math.pow(1-t,3);
      const target=this.tween.from.clone().lerp(this.tween.to,e);
      const delta=target.clone().sub(this.controls.target);this.camera.position.add(delta);this.controls.target.copy(target);
      this.camera.zoom=THREE.MathUtils.lerp(this.tween.zoom,this.tween.targetZoom,e);this.camera.updateProjectionMatrix();this.handleChange();
      if(t>=1)this.tween=undefined;
    }
    if(this.selectionRing.visible){const s=1+Math.sin(time/600)*0.08;this.selectionRing.scale.setScalar(s);}
    this.controls.update();this.renderer.render(this.scene,this.camera);this.labelRenderer.render(this.scene,this.camera);
  };

  dispose() {
    this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();
    this.scene.traverse(object=>{
      if(object instanceof CSS2DObject)object.element.remove();
      if(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points){object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose());}
    });
    this.renderer.dispose();this.renderer.domElement.remove();this.labelRenderer.domElement.remove();
  }
}

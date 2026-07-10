// ============================================================================
// 3D Rendering Engine — dollhouse-first. The default view hides the roof and
// frames the camera down into the rooms (Floorplanner-style), because seeing
// inside the building is the whole point. Exterior mode restores the shell.
// ============================================================================
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { useStore } from '../store';
import { floorPlanApi } from '@/lib/valuation-api';
import type { Floor, Furniture, Opening, Wall } from '../types';
import { ROOM_COLORS, DEFAULTS } from '../types';
import { arcPoints, detectRooms, dist, norm, sub } from '../geometry';
import { libDef, type LibDef } from '../library';

const COL = {
  wallInt: 0xf6f1e7, // warm plaster
  wallExt: 0xe4d8c3,
  wallCap: 0xb9ad9a,
  floorWood: 0xcda877,
  ground: 0x9bb87e,
  sky: 0xd7e8f7,
  frame: 0xffffff,
  doorLeaf: 0x8a5a2b,
  glass: 0xa8d8ff,
  roof: 0x9c5236,
};

// ---------------------------------------------------------------------------
// Procedural textures — generated once, no external assets
// ---------------------------------------------------------------------------
const texCache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat: number): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; // color maps must be sRGB or they render washed out
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const woodTexture = () =>
  canvasTex(
    'wood',
    (ctx, S) => {
      ctx.fillStyle = '#e8dcc3';
      ctx.fillRect(0, 0, S, S);
      const planks = 8;
      const ph = S / planks;
      for (let i = 0; i < planks; i++) {
        const shade = 0.93 + ((i * 37) % 10) / 70;
        ctx.fillStyle = `rgb(${Math.round(226 * shade)},${Math.round(211 * shade)},${Math.round(183 * shade)})`;
        ctx.fillRect(0, i * ph, S, ph - 2);
        ctx.strokeStyle = 'rgba(140,110,70,0.13)';
        for (let g = 0; g < 5; g++) {
          const y = i * ph + ((g * 83 + i * 53) % ph);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(S / 3, y + 3, (2 * S) / 3, y - 3, S, y + 1);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(110,85,50,0.4)';
        ctx.fillRect(0, i * ph + ph - 2, S, 2);
        ctx.fillRect(((i * 197) % S), i * ph, 2, ph);
      }
    },
    0.32,
  );

const roofTexture = () =>
  canvasTex(
    'roof',
    (ctx, S) => {
      ctx.fillStyle = '#9c5236';
      ctx.fillRect(0, 0, S, S);
      // corrugated sheets
      for (let x = 0; x < S; x += 18) {
        const g = ctx.createLinearGradient(x, 0, x + 18, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.22)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
        g.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 18, S);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < S; y += 170) ctx.fillRect(0, y, S, 3);
    },
    0.55,
  );

const grassTexture = () =>
  canvasTex(
    'grass',
    (ctx, S) => {
      ctx.fillStyle = '#9bb87e';
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 3200; i++) {
        const x = (i * 887) % S;
        const y = (i * 541) % S;
        const l = (i * 13) % 3;
        ctx.fillStyle = l === 0 ? 'rgba(70,110,50,0.25)' : l === 1 ? 'rgba(160,190,120,0.28)' : 'rgba(110,140,80,0.2)';
        ctx.fillRect(x, y, 2, 2 + (i % 3));
      }
    },
    30,
  );

interface Mats {
  wallInt: THREE.MeshStandardMaterial;
  wallExt: THREE.MeshStandardMaterial;
  cap: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  edge: THREE.LineBasicMaterial;
  clip: THREE.Plane[];
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rTop = r): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, 20), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Furniture — composite primitives per glyph (beats colored boxes by a mile)
// ---------------------------------------------------------------------------
function buildFurniture(def: LibDef, fu: Furniture, clip: THREE.Plane[]): THREE.Group {
  const g = new THREE.Group();
  const w = fu.w;
  const d = fu.h;
  const z = def.z;
  const std = (color: number | string, rough = 0.65) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, clippingPlanes: clip });
  const main = std(def.color);
  const white = std(0xf8fafc, 0.4);
  const dark = std(0x4b5563);
  const wood = std(0x9a6b3f);

  switch (def.glyph) {
    case 'bed': {
      g.add(box(w, 0.25, d, wood, 0, 0.125, 0));
      g.add(box(w - 0.08, 0.18, d - 0.08, std(0xe7e2f7, 0.8), 0, 0.34, 0));
      g.add(box(w * 0.72, 0.09, d * 0.16, white, 0, 0.47, -d * 0.36)); // pillows
      g.add(box(w, 0.5, 0.06, wood, 0, 0.35, -d / 2 + 0.03)); // headboard
      break;
    }
    case 'sofa': {
      g.add(box(w, 0.34, d, main, 0, 0.17, 0));
      g.add(box(w, 0.42, d * 0.28, main, 0, 0.55, d * 0.36)); // back
      g.add(box(w * 0.11, 0.28, d, main, -w / 2 + w * 0.055, 0.48, 0)); // arms
      g.add(box(w * 0.11, 0.28, d, main, w / 2 - w * 0.055, 0.48, 0));
      break;
    }
    case 'chair': {
      g.add(box(w, 0.08, d, main, 0, 0.44, 0));
      g.add(box(w, 0.45, 0.06, main, 0, 0.7, d / 2 - 0.03));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.02, 0.44, dark, (sx * (w - 0.08)) / 2, 0.22, (sz * (d - 0.08)) / 2));
      break;
    }
    case 'table': {
      g.add(box(w, 0.05, d, wood, 0, z - 0.025, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.03, z - 0.05, wood, (sx * (w - 0.12)) / 2, (z - 0.05) / 2, (sz * (d - 0.12)) / 2));
      break;
    }
    case 'tv': {
      g.add(box(w, 0.4, d, wood, 0, 0.2, 0)); // console
      g.add(box(w * 0.85, w * 0.42, 0.05, std(0x0f172a, 0.25), 0, 0.42 + (w * 0.42) / 2, 0));
      break;
    }
    case 'stove': {
      g.add(box(w, 0.9, d, std(0xe5e7eb, 0.45), 0, 0.45, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(Math.min(w, d) * 0.16, 0.02, dark, (sx * w) / 4, 0.91, (sz * d) / 4));
      break;
    }
    case 'fridge': {
      g.add(box(w, z, d, std(0xd1d5db, 0.35), 0, z / 2, 0));
      g.add(box(w, 0.01, d, dark, 0, z * 0.62, 0));
      break;
    }
    case 'sink': {
      g.add(box(w, 0.88, d, std(0x9ca3af, 0.5), 0, 0.44, 0));
      g.add(cyl(Math.min(w, d) * 0.3, 0.06, white, 0, 0.9, 0));
      g.add(cyl(0.015, 0.22, dark, Math.min(w, d) * 0.18, 1.0, 0));
      break;
    }
    case 'toilet': {
      g.add(box(w, 0.42, d * 0.32, white, 0, 0.4, -d / 2 + d * 0.16)); // cistern
      g.add(cyl((w / 2) * 0.9, 0.38, white, 0, 0.19, d * 0.14));
      break;
    }
    case 'basin': {
      g.add(cyl(Math.min(w, d) / 2.6, 0.75, white, 0, 0.375, 0));
      g.add(cyl(Math.min(w, d) / 2, 0.1, white, 0, 0.8, 0));
      break;
    }
    case 'shower': {
      g.add(box(w, 0.06, d, white, 0, 0.03, 0)); // tray
      const gl = new THREE.MeshStandardMaterial({ color: COL.glass, transparent: true, opacity: 0.25, roughness: 0.1, clippingPlanes: clip });
      g.add(box(w, 2, 0.02, gl, 0, 1.03, d / 2));
      g.add(box(0.02, 2, d, gl, w / 2, 1.03, 0));
      g.add(cyl(0.02, 1.9, dark, -w / 2 + 0.08, 0.98, -d / 2 + 0.08));
      break;
    }
    case 'tub': {
      g.add(box(w, 0.5, d, white, 0, 0.25, 0));
      const inner = box(w - 0.14, 0.08, d - 0.14, std(0xe0f2fe, 0.3), 0, 0.47, 0);
      g.add(inner);
      break;
    }
    case 'car': {
      g.add(box(w, 0.55, d, main, 0, 0.45, 0));
      g.add(box(w * 0.92, 0.45, d * 0.5, std(0x93c5fd, 0.2), 0, 0.95, -d * 0.05));
      for (const [sx, sz] of [[-1, -0.32], [1, -0.32], [-1, 0.32], [1, 0.32]]) {
        const wheel = cyl(0.3, 0.18, dark, (sx * w) / 2, 0.3, sz * d);
        wheel.rotation.z = Math.PI / 2;
        g.add(wheel);
      }
      break;
    }
    case 'tree': {
      const trunkH = Math.max(0.8, z * 0.4);
      g.add(cyl(0.1, trunkH, std(0x6b4423, 0.95), 0, trunkH / 2, 0, 0.16));
      // clustered crown — three offset blobs beat one lollipop sphere
      const greens = [0x3d7a44, 0x4f9152, 0x356b3c];
      const blobs: [number, number, number, number][] = [
        [0, trunkH + w * 0.42, 0, w * 0.5],
        [w * 0.26, trunkH + w * 0.28, w * 0.14, w * 0.34],
        [-w * 0.24, trunkH + w * 0.34, -w * 0.16, w * 0.36],
        [0.04, trunkH + w * 0.72, -0.06, w * 0.3],
      ];
      blobs.forEach(([bx, by, bz, r], i) => {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), std(greens[i % 3], 0.95));
        blob.position.set(bx, by, bz);
        blob.castShadow = true;
        g.add(blob);
      });
      break;
    }
    case 'fence':
    case 'gate': {
      g.add(box(w, z, Math.max(d, 0.08), std(def.glyph === 'gate' ? 0x8d6e3f : 0x6b7280, 0.85), 0, z / 2, 0));
      break;
    }
    default:
      g.add(box(w, z, d, main, 0, z / 2, 0));
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      (o.material as THREE.MeshStandardMaterial).clippingPlanes = clip;
      o.castShadow = true;
    }
  });
  return g;
}

// ---------------------------------------------------------------------------
// Walls with openings, frames, caps and edge lines
// ---------------------------------------------------------------------------
function buildWall(group: THREE.Group, w: Wall, openings: Opening[], elevation: number, floorHeight: number, mats: Mats) {
  if (w.kind === 'divider') return; // open-plan area boundary — no physical presence
  const height = w.height || floorHeight;
  const pts = arcPoints(w.a, w.b, w.bulge ?? 0, w.bulge ? 16 : 1);
  const totalLen = pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const wallOps = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => ({ ...o, start: o.t * totalLen - o.width / 2, end: o.t * totalLen + o.width / 2 }))
    .sort((a, b) => a.start - b.start);
  const mat = w.kind === 'exterior' ? mats.wallExt : mats.wallInt;

  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = dist(a, b);
    if (segLen < 1e-6) continue;
    const segStart = walked;
    const segEnd = walked + segLen;
    walked = segEnd;
    const dir = norm(sub(b, a));
    const angle = Math.atan2(dir.y, dir.x);

    const place = (fromT: number, toT: number, y0: number, y1: number, withCap: boolean) => {
      const L = toT - fromT;
      if (L < 0.005 || y1 - y0 < 0.005) return;
      const geo = new THREE.BoxGeometry(L, y1 - y0, w.thickness);
      const mesh = new THREE.Mesh(geo, mat);
      const midT = (fromT + toT) / 2 - segStart;
      const cx = a.x + dir.x * midT;
      const cz = a.y + dir.y * midT;
      mesh.position.set(cx, elevation + (y0 + y1) / 2, cz);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      // crisp edges
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), mats.edge);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      group.add(edges);
      // darker cap on the cut top — makes the dollhouse read like a model
      if (withCap && Math.abs(y1 - height) < 1e-6) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(L, 0.02, w.thickness + 0.012), mats.cap);
        cap.position.set(cx, elevation + height + 0.01, cz);
        cap.rotation.y = -angle;
        group.add(cap);
      }
    };

    const frameBox = (fromT: number, toT: number, y0: number, y1: number, depth: number) => {
      const L = toT - fromT;
      const geo = new THREE.BoxGeometry(L, y1 - y0, depth);
      const mesh = new THREE.Mesh(geo, mats.frame);
      const midT = (fromT + toT) / 2 - segStart;
      mesh.position.set(a.x + dir.x * midT, elevation + (y0 + y1) / 2, a.y + dir.y * midT);
      mesh.rotation.y = -angle;
      group.add(mesh);
    };

    const inside = wallOps.filter((o) => o.end > segStart + 0.01 && o.start < segEnd - 0.01);
    let cursor = segStart;
    for (const o of inside) {
      const os = Math.max(segStart, o.start);
      const oe = Math.min(segEnd, o.end);
      place(cursor, os, 0, height, true);
      if (o.kind === 'door') {
        place(os, oe, o.height, height, true); // lintel
        if (o.sub !== 'opening') {
          frameBox(os, oe, 0, o.height, w.thickness * 0.55); // jamb surround
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(oe - os - 0.08, o.height - 0.08, 0.045), mats.door);
          const midT = (os + oe) / 2 - segStart;
          leaf.position.set(a.x + dir.x * midT, elevation + o.height / 2, a.y + dir.y * midT);
          leaf.rotation.y = -angle;
          leaf.castShadow = true;
          group.add(leaf);
        }
      } else {
        place(os, oe, 0, o.sill, true);
        place(os, oe, o.sill + o.height, height, true);
        frameBox(os, oe, o.sill, o.sill + o.height, w.thickness * 0.6);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(oe - os - 0.06, o.height - 0.06, 0.02), mats.glass);
        const midT = (os + oe) / 2 - segStart;
        glass.position.set(a.x + dir.x * midT, elevation + o.sill + o.height / 2, a.y + dir.y * midT);
        glass.rotation.y = -angle;
        group.add(glass);
      }
      cursor = oe;
    }
    place(cursor, segEnd, 0, height, true);
  }
}

function buildRoof(group: THREE.Group, floor: Floor, elevation: number, roof: { kind: string; height: number; overhang: number }, clip: THREE.Plane[], transparent: boolean) {
  const roofMat = () =>
    new THREE.MeshStandardMaterial({
      map: roofTexture(),
      roughness: 0.75,
      side: THREE.DoubleSide,
      clippingPlanes: clip,
      transparent,
      opacity: transparent ? 0.3 : 1,
    });
  const pts = floor.walls.filter((w) => w.kind === 'exterior').flatMap((w) => [w.a, w.b]);
  const all = pts.length ? pts : floor.walls.flatMap((w) => [w.a, w.b]);
  if (!all.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of all) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const o = roof.overhang;
  minX -= o; minY -= o; maxX += o; maxY += o;
  const w = maxX - minX;
  const d = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;
  const h = roof.height;

  if (roof.kind === 'flat') {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), roofMat());
    slab.position.set(cx, elevation + 0.125, cz);
    slab.castShadow = true;
    group.add(slab);
    return;
  }
  if (roof.kind === 'shed') {
    const geo = new THREE.BoxGeometry(Math.hypot(w, h), 0.16, d);
    const mesh = new THREE.Mesh(geo, roofMat());
    mesh.position.set(cx, elevation + h / 2, cz);
    mesh.rotation.z = Math.atan2(h, w);
    mesh.castShadow = true;
    group.add(mesh);
    return;
  }
  const alongX = w >= d;
  const ridgeInset = roof.kind === 'hip' ? Math.min(alongX ? d : w, alongX ? w : d) * 0.25 : 0;
  const y0 = elevation;
  const y1 = elevation + h;
  const verts: number[] = [];
  const quad = (p1: number[], p2: number[], p3: number[], p4: number[]) => {
    verts.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
  };
  const tri = (p1: number[], p2: number[], p3: number[]) => verts.push(...p1, ...p2, ...p3);
  if (alongX) {
    const r1 = [minX + ridgeInset, y1, cz];
    const r2 = [maxX - ridgeInset, y1, cz];
    quad([minX, y0, minY], [maxX, y0, minY], r2, r1);
    quad([maxX, y0, maxY], [minX, y0, maxY], r1, r2);
    tri([minX, y0, maxY], [minX, y0, minY], r1);
    tri([maxX, y0, minY], [maxX, y0, maxY], r2);
  } else {
    const r1 = [cx, y1, minY + ridgeInset];
    const r2 = [cx, y1, maxY - ridgeInset];
    quad([minX, y0, minY], [minX, y0, maxY], r2, r1);
    quad([maxX, y0, maxY], [maxX, y0, minY], r1, r2);
    tri([minX, y0, minY], [maxX, y0, minY], r1);
    tri([maxX, y0, maxY], [minX, y0, maxY], r2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  // planar UVs so the sheet texture maps onto the slopes
  const uvs: number[] = [];
  for (let i = 0; i < verts.length; i += 3) uvs.push(verts[i] * 0.45, verts[i + 2] * 0.45);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, roofMat());
  mesh.castShadow = true;
  group.add(mesh);
}

// ---------------------------------------------------------------------------

export default function View3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rebuildRef = useRef<() => void>(() => {});
  const frameRef = useRef<(preset: 'dollhouse' | 'exterior' | 'top') => void>(() => {});
  const s = useStore();
  const stateRef = useRef(s);
  stateRef.current = s;

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.sky);
    scene.fog = new THREE.Fog(COL.sky, 90, 320);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    camera.position.set(16, 18, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI / 2 - 0.02; // never go below ground

    const walk = new PointerLockControls(camera, renderer.domElement);
    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => (keys[e.code] = true);
    const ku = (e: KeyboardEvent) => (keys[e.code] = false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a6b, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.35);
    fill.position.set(-20, 25, -15);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(220, 48),
      new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    let building = new THREE.Group();
    scene.add(building);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);

    const frame = (preset: 'dollhouse' | 'exterior' | 'top') => {
      const bb = new THREE.Box3().setFromObject(building);
      if (bb.isEmpty()) return;
      const c = bb.getCenter(new THREE.Vector3());
      const size = bb.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.z, 6);
      const dir =
        preset === 'top'
          ? new THREE.Vector3(0.02, 1, 0.02)
          : preset === 'dollhouse'
            ? new THREE.Vector3(0.55, 0.95, 0.55)
            : new THREE.Vector3(1, 0.42, 0.85);
      dir.normalize();
      camera.position.copy(c.clone().add(dir.multiplyScalar(r * (preset === 'top' ? 1.45 : 1.35))));
      orbit.target.set(c.x, Math.min(c.y, 1.2), c.z);
      orbit.update();
    };
    frameRef.current = frame;

    const rebuild = () => {
      const st = stateRef.current;
      scene.remove(building);
      building.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
      });
      building = new THREE.Group();

      const opts = st.three;
      const clip = opts.sectionY != null ? [clipPlane] : [];
      if (opts.sectionY != null) clipPlane.constant = opts.sectionY;

      const mkWall = (color: number) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.92,
          transparent: opts.transparent,
          opacity: opts.transparent ? 0.32 : 1,
          clippingPlanes: clip,
        });
      const mats: Mats = {
        wallInt: mkWall(COL.wallInt),
        wallExt: mkWall(COL.wallExt),
        cap: new THREE.MeshStandardMaterial({ color: COL.wallCap, roughness: 0.8, clippingPlanes: clip, transparent: opts.transparent, opacity: opts.transparent ? 0.4 : 1 }),
        glass: new THREE.MeshStandardMaterial({ color: COL.glass, transparent: true, opacity: 0.4, roughness: 0.08, metalness: 0.1, clippingPlanes: clip }),
        frame: new THREE.MeshStandardMaterial({ color: COL.frame, roughness: 0.5, clippingPlanes: clip }),
        door: new THREE.MeshStandardMaterial({ color: COL.doorLeaf, roughness: 0.6, clippingPlanes: clip }),
        edge: new THREE.LineBasicMaterial({ color: 0x7d6f5c, transparent: true, opacity: opts.transparent ? 0.1 : 0.28 }),
        clip,
      };

      const floors = [...st.project.floors].sort((a, b) => a.level - b.level);
      let elevation = 0;
      const elevations = new Map<string, number>();
      for (const f of floors) {
        if (f.level < 0) elevations.set(f.id, -f.height);
        else {
          elevations.set(f.id, elevation);
          elevation += f.height;
        }
      }

      const shown = opts.isolate ? floors.filter((f) => f.id === st.floorId) : floors;
      for (const f of shown) {
        const elev = elevations.get(f.id) ?? 0;
        const fg = new THREE.Group();

        // floor slabs, colored by room type (wood tone when unassigned)
        const rooms = detectRooms(f.walls, f.rooms);
        for (const r of rooms) {
          const shape = new THREE.Shape(r.poly.map((p) => new THREE.Vector2(p.x, p.y)));
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
          // plank texture tinted by room type — wet rooms read as tile (smoother, cooler)
          const isWet = r.anchor && ['Bathroom', 'Toilet', 'Kitchen', 'Laundry'].includes(r.anchor.type);
          const color = r.anchor
            ? new THREE.Color(ROOM_COLORS[r.anchor.type]).lerp(new THREE.Color('#ffffff'), isWet ? 0.15 : 0.35)
            : new THREE.Color('#ffffff');
          const slab = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({
              map: woodTexture(),
              color,
              roughness: isWet ? 0.35 : 0.7,
              clippingPlanes: clip,
            }),
          );
          slab.rotation.x = Math.PI / 2;
          slab.position.y = elev + 0.1;
          slab.receiveShadow = true;
          fg.add(slab);
        }
        // plinth under the ground floor so the building sits on the site
        if (f.level === 0 && f.walls.length) {
          const pts = f.walls.flatMap((w) => [w.a, w.b]);
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of pts) {
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
          }
          const plinth = box(maxX - minX + 0.6, 0.18, maxY - minY + 0.6, new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.9, clippingPlanes: clip }), (minX + maxX) / 2, -0.09 + elev, (minY + maxY) / 2);
          fg.add(plinth);
        }

        for (const w of f.walls) buildWall(fg, w, f.openings, elev, f.height, mats);

        // corner posts: fill the notch left by butt-jointed wall boxes at every
        // junction so corners read as solid mitered walls
        {
          const nodes = new Map<string, { x: number; y: number; t: number; h: number; n: number; ext: boolean; ortho: boolean }>();
          for (const w of f.walls) {
            if (w.kind === 'divider') continue;
            for (const [p, q] of [
              [w.a, w.b],
              [w.b, w.a],
            ] as const) {
              const key = `${Math.round(p.x * 50)}:${Math.round(p.y * 50)}`;
              const e = nodes.get(key) ?? { x: p.x, y: p.y, t: 0, h: 0, n: 0, ext: false, ortho: true };
              e.t = Math.max(e.t, w.thickness);
              e.h = Math.max(e.h, w.height || f.height);
              e.n++;
              e.ext = e.ext || w.kind === 'exterior';
              const ang = Math.atan2(q.y - p.y, q.x - p.x);
              const m = Math.abs(ang % (Math.PI / 2));
              if (m > 0.03 && m < Math.PI / 2 - 0.03) e.ortho = false;
              nodes.set(key, e);
            }
          }
          for (const e of nodes.values()) {
            if (e.n < 2) continue;
            const mat = e.ext ? mats.wallExt : mats.wallInt;
            const post = e.ortho
              ? box(e.t, e.h, e.t, mat, e.x, elev + e.h / 2, e.y)
              : cyl(e.t / 2, e.h, mat, e.x, elev + e.h / 2, e.y);
            fg.add(post);
            const cap = e.ortho
              ? box(e.t + 0.012, 0.02, e.t + 0.012, mats.cap, e.x, elev + e.h + 0.01, e.y)
              : cyl(e.t / 2 + 0.006, 0.02, mats.cap, e.x, elev + e.h + 0.01, e.y);
            fg.add(cap);
          }
        }

        for (const stair of f.stairs) {
          const steps = Math.max(3, Math.round(f.height / DEFAULTS.riserIdeal));
          const riser = f.height / steps;
          const g = new THREE.Group();
          const stairMat = new THREE.MeshStandardMaterial({ color: 0xa9835a, roughness: 0.7, clippingPlanes: clip });
          if (stair.kind === 'spiral') {
            for (let i = 0; i < steps; i++) {
              const tread = box(stair.width, 0.05, 0.3, stairMat);
              const ang = (i / steps) * Math.PI * 2;
              tread.position.set(Math.cos(ang) * stair.width * 0.5, elev + riser * (i + 1), Math.sin(ang) * stair.width * 0.5);
              tread.rotation.y = -ang;
              g.add(tread);
            }
            g.add(cyl(0.06, f.height, stairMat, 0, elev + f.height / 2, 0));
          } else {
            const legSteps = stair.kind === 'straight' ? steps : Math.ceil(steps / 2);
            const treadD = stair.length / legSteps;
            for (let i = 0; i < legSteps; i++) {
              g.add(box(stair.width, riser, treadD, stairMat, stair.width / 2, elev + riser * (i + 0.5), stair.length - treadD * (i + 0.5)));
            }
            if (stair.kind !== 'straight') {
              for (let i = 0; i < steps - legSteps; i++) {
                g.add(box(stair.width, riser, treadD, stairMat, stair.width * 1.5 + 0.1, elev + riser * (legSteps + i + 0.5), treadD * (i + 0.5)));
              }
            }
          }
          const holder = new THREE.Group();
          holder.add(g);
          holder.position.set(stair.x, 0, stair.y);
          holder.rotation.y = (-stair.rot * Math.PI) / 180;
          fg.add(holder);
        }

        for (const fu of f.furniture) {
          const def = libDef(fu.def);
          const item = buildFurniture(def, fu, clip);
          item.position.set(fu.x + fu.w / 2, elev + (def.elev ?? 0), fu.y + fu.h / 2);
          item.rotation.y = (-fu.rot * Math.PI) / 180;
          fg.add(item);
        }

        building.add(fg);
      }

      // roof only in exterior mode — dollhouse exists to see the rooms
      if (opts.mode === 'exterior') {
        const tops = floors.filter((f) => f.level >= 0);
        const top = tops[tops.length - 1];
        if (top && (!opts.isolate || top.id === st.floorId)) {
          const topElev = (elevations.get(top.id) ?? 0) + top.height;
          buildRoof(building, top, topElev, st.project.roof, clip, opts.transparent);
        }
      }
      scene.add(building);
    };
    rebuildRef.current = rebuild;
    rebuild();
    frame(stateRef.current.three.mode);
    // report-snapshot hook: page-level code captures the current 3D view as PNG
    (window as unknown as { __fpCapture3D?: () => string }).__fpCapture3D = () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    };

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let lastFrame = performance.now();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const st = stateRef.current;
      const az = (st.three.sunAz * Math.PI) / 180;
      const el = (st.three.sunEl * Math.PI) / 180;
      sun.position.set(Math.cos(el) * Math.cos(az) * 45, Math.sin(el) * 45, Math.cos(el) * Math.sin(az) * 45);
      sun.castShadow = st.three.shadows;

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      if (st.three.walk && walk.isLocked) {
        const speed = keys['ShiftLeft'] ? 7 : 3.5;
        const dir = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp']) dir.z += 1;
        if (keys['KeyS'] || keys['ArrowDown']) dir.z -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dir.x -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dir.x += 1;
        if (dir.lengthSq() > 0) {
          dir.normalize();
          walk.moveForward(dir.z * speed * dt);
          walk.moveRight(dir.x * speed * dt);
        }
        camera.position.y = 1.6;
      } else {
        orbit.enabled = !st.three.walk;
        orbit.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    const unsub = useStore.subscribe((st, prev) => {
      stateRef.current = st;
      if (st.three.walk && !prev.three.walk) {
        const bb = new THREE.Box3().setFromObject(building);
        const c = bb.isEmpty() ? new THREE.Vector3(5, 0, 5) : bb.getCenter(new THREE.Vector3());
        camera.position.set(c.x, 1.6, c.z);
        walk.lock();
      }
      if (!st.three.walk && prev.three.walk && walk.isLocked) walk.unlock();
      if (st.rev !== prev.rev || st.floorId !== prev.floorId || st.three !== prev.three) {
        rebuildRef.current();
        if (st.three.mode !== prev.three.mode) frame(st.three.mode);
      }
      if (st.project.id !== prev.project.id) {
        rebuildRef.current();
        frame(st.three.mode);
      }
    });
    const onUnlock = () => {
      if (stateRef.current.three.walk) stateRef.current.setThree({ walk: false });
    };
    walk.addEventListener('unlock', onUnlock);

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      walk.removeEventListener('unlock', onUnlock);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      ro.disconnect();
      renderer.dispose();
      renderer.forceContextLoss(); // release the WebGL context immediately (browsers cap ~16)
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ModeBtn = ({ id, label }: { id: 'dollhouse' | 'exterior'; label: string }) => (
    <button
      onClick={() => {
        s.setThree({ mode: id, walk: false });
      }}
      className={`rounded px-2.5 py-1 text-xs font-medium ${s.three.mode === id && !s.three.walk ? 'bg-sky-600 text-white' : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      {/* view controls on the canvas — dollhouse first */}
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/70 p-1 shadow-lg backdrop-blur">
        <ModeBtn id="dollhouse" label="🏠 Dollhouse" />
        <ModeBtn id="exterior" label="Exterior" />
        <button onClick={() => frameRef.current('top')} className="rounded px-2.5 py-1 text-xs font-medium bg-slate-900/80 text-slate-300 hover:bg-slate-800">
          Top
        </button>
        <button onClick={() => frameRef.current(s.three.mode)} className="rounded px-2.5 py-1 text-xs font-medium bg-slate-900/80 text-slate-300 hover:bg-slate-800" title="Re-center on the building">
          ⌖ Fit
        </button>
        <button
          onClick={() => s.setThree({ walk: !s.three.walk })}
          className={`rounded px-2.5 py-1 text-xs font-medium ${s.three.walk ? 'bg-red-600 text-white' : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'}`}
        >
          {s.three.walk ? 'Exit walk' : '🚶 Walk'}
        </button>
        {s.valuationId && (
          <button
            onClick={async () => {
              const cap = (window as unknown as { __fpCapture3D?: () => string }).__fpCapture3D;
              if (!cap) return;
              const res = await floorPlanApi.uploadReportPhoto(s.valuationId!, cap(), `3D View — ${s.three.mode === 'dollhouse' ? 'Dollhouse' : 'Exterior'}`, '3d_view');
              alert(res.success ? 'Added to the report (Appendix B — 3D Views).' : `Could not add to report: ${res.error ?? 'unknown error'}`);
            }}
            title="Snapshot this 3D view into the valuation report pictures"
            className="rounded px-2.5 py-1 text-xs font-medium bg-emerald-700/80 text-white hover:bg-emerald-600"
          >
            📸 To report
          </button>
        )}
      </div>
      {s.three.walk && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-slate-900/80 px-3 py-1 text-xs text-white">
          Walk mode — WASD to move, mouse to look, Shift to run, Esc to exit
        </div>
      )}
    </div>
  );
}

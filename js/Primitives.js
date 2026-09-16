// js/geometry/Primitives.js
//
// Builds MeshData for the standard "Add Mesh" primitives. Every function
// returns a fresh MeshData positioned around the origin, with quads where
// a quad is the natural topology (cube, cylinder walls, torus) and
// triangle fans only where they are unavoidable (sphere poles, cone tip).

import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export function createCube(size = 2) {
  const m = new MeshData();
  const s = size / 2;
  const p = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], // back face (z-)
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s], // front face (z+)
  ];
  const idx = p.map((c) => m.addVertex(c[0], c[1], c[2]));
  const uvQuad = [[0, 0], [1, 0], [1, 1], [0, 1]];
  m.addFace([idx[0], idx[3], idx[2], idx[1]], uvQuad); // -Z
  m.addFace([idx[4], idx[5], idx[6], idx[7]], uvQuad); // +Z
  m.addFace([idx[0], idx[1], idx[5], idx[4]], uvQuad); // -Y
  m.addFace([idx[3], idx[7], idx[6], idx[2]], uvQuad); // +Y
  m.addFace([idx[0], idx[4], idx[7], idx[3]], uvQuad); // -X
  m.addFace([idx[1], idx[2], idx[6], idx[5]], uvQuad); // +X
  return m;
}

export function createPlane(size = 2, segments = 1) {
  const m = new MeshData();
  const s = size / 2;
  const step = size / segments;
  const grid = [];
  for (let iy = 0; iy <= segments; iy++) {
    const row = [];
    for (let ix = 0; ix <= segments; ix++) {
      const x = -s + ix * step;
      const y = -s + iy * step;
      row.push(m.addVertex(x, y, 0));
    }
    grid.push(row);
  }
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = grid[iy][ix];
      const b = grid[iy][ix + 1];
      const c = grid[iy + 1][ix + 1];
      const d = grid[iy + 1][ix];
      const u0 = ix / segments, u1 = (ix + 1) / segments;
      const v0 = iy / segments, v1 = (iy + 1) / segments;
      m.addFace([a, b, c, d], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  return m;
}

export function createCircle(radius = 1, segments = 24, fill = true) {
  const m = new MeshData();
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ring.push(m.addVertex(Math.cos(t) * radius, Math.sin(t) * radius, 0));
  }
  if (fill) {
    const center = m.addVertex(0, 0, 0);
    for (let i = 0; i < segments; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % segments];
      m.addFace([center, a, b]);
    }
  } else {
    for (let i = 0; i < segments; i++) m.ensureEdge(ring[i], ring[(i + 1) % segments]);
  }
  return m;
}

export function createUVSphere(radius = 1, widthSegments = 16, heightSegments = 12) {
  const m = new MeshData();
  const grid = [];
  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const theta = v * Math.PI; // 0..PI from +Y pole to -Y pole
    const row = [];
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const phi = u * Math.PI * 2;
      const x = -radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.cos(theta);
      const z = radius * Math.sin(theta) * Math.sin(phi);
      row.push(m.addVertex(x, y, z));
    }
    grid.push(row);
  }
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const u0 = ix / widthSegments, u1 = (ix + 1) / widthSegments;
      const v0 = iy / heightSegments, v1 = (iy + 1) / heightSegments;
      const a = grid[iy][ix];
      const b = grid[iy][ix + 1];
      const c = grid[iy + 1][ix + 1];
      const d = grid[iy + 1][ix];
      if (iy === 0) {
        // top cap: collapse to a triangle fan (a === b at the pole)
        m.addFace([a, c, d], [[ (u0 + u1) / 2, v0], [u1, v1], [u0, v1]]);
      } else if (iy === heightSegments - 1) {
        m.addFace([a, b, d], [[u0, v0], [u1, v0], [(u0 + u1) / 2, v1]]);
      } else {
        m.addFace([a, b, c, d], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
    }
  }
  return m;
}

export function createCylinder(radius = 1, height = 2, segments = 16, capped = true) {
  const m = new MeshData();
  const h = height / 2;
  const top = [];
  const bottom = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = Math.cos(t) * radius;
    const z = Math.sin(t) * radius;
    top.push(m.addVertex(x, h, z));
    bottom.push(m.addVertex(x, -h, z));
  }
  for (let i = 0; i < segments; i++) {
    const ni = (i + 1) % segments;
    const u0 = i / segments, u1 = (i + 1) / segments;
    m.addFace([bottom[i], bottom[ni], top[ni], top[i]], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  }
  if (capped) {
    const topCenter = m.addVertex(0, h, 0);
    const bottomCenter = m.addVertex(0, -h, 0);
    for (let i = 0; i < segments; i++) {
      const ni = (i + 1) % segments;
      m.addFace([topCenter, top[i], top[ni]]);
      m.addFace([bottomCenter, bottom[ni], bottom[i]]);
    }
  }
  return m;
}

export function createCone(radius = 1, height = 2, segments = 16, capped = true) {
  const m = new MeshData();
  const h = height / 2;
  const apex = m.addVertex(0, h, 0);
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ring.push(m.addVertex(Math.cos(t) * radius, -h, Math.sin(t) * radius));
  }
  for (let i = 0; i < segments; i++) {
    const ni = (i + 1) % segments;
    m.addFace([ring[i], ring[ni], apex]);
  }
  if (capped) {
    const bottomCenter = m.addVertex(0, -h, 0);
    for (let i = 0; i < segments; i++) {
      const ni = (i + 1) % segments;
      m.addFace([bottomCenter, ring[ni], ring[i]]);
    }
  }
  return m;
}

export function createTorus(radius = 1, tubeRadius = 0.35, radialSegments = 16, tubularSegments = 24) {
  const m = new MeshData();
  const grid = [];
  for (let i = 0; i <= radialSegments; i++) {
    const u = (i / radialSegments) * Math.PI * 2;
    const row = [];
    for (let j = 0; j <= tubularSegments; j++) {
      const v = (j / tubularSegments) * Math.PI * 2;
      const x = (radius + tubeRadius * Math.cos(v)) * Math.cos(u);
      const y = tubeRadius * Math.sin(v);
      const z = (radius + tubeRadius * Math.cos(v)) * Math.sin(u);
      row.push(m.addVertex(x, y, z));
    }
    grid.push(row);
  }
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < tubularSegments; j++) {
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];
      const u0 = i / radialSegments, u1 = (i + 1) / radialSegments;
      const v0 = j / tubularSegments, v1 = (j + 1) / tubularSegments;
      m.addFace([a, b, c, d], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  return m;
}

export const PRIMITIVES = {
  CUBE: { label: 'Cube', build: () => createCube() },
  PLANE: { label: 'Plane', build: () => createPlane() },
  CIRCLE: { label: 'Circle', build: () => createCircle() },
  UV_SPHERE: { label: 'UV Sphere', build: () => createUVSphere() },
  CYLINDER: { label: 'Cylinder', build: () => createCylinder() },
  CONE: { label: 'Cone', build: () => createCone() },
  TORUS: { label: 'Torus', build: () => createTorus() },
};

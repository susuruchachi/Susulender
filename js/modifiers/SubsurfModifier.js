// js/modifiers/SubsurfModifier.js
// A real Catmull-Clark subdivision (face points, edge points, and the
// weighted vertex-smoothing rule), with a simplified rule for boundary
// vertices on open meshes. Note: UVs are not carried through the
// subdivision (they reset to a default per new face) - re-unwrap after
// applying if you need clean texture coordinates on the subdivided result.

import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export const SubsurfModifier = {
  type: 'SUBSURF',
  label: 'Subdivision Surface',
  defaultParams: () => ({ levels: 1 }),
  apply(mesh, params) {
    const levels = Math.max(0, Math.min(3, Math.round(params.levels ?? 1)));
    let current = mesh;
    for (let i = 0; i < levels; i++) current = subdivideOnce(current);
    return current;
  },
};

function keyOf(a, b) {
  return a < b ? a + '_' + b : b + '_' + a;
}

function subdivideOnce(mesh) {
  const n = mesh.verts.length;

  const facePoints = mesh.faces.map((f) => {
    const c = new THREE.Vector3();
    f.verts.forEach((vi) => c.add(mesh.verts[vi].co));
    return c.divideScalar(f.verts.length);
  });

  const edgeInfo = new Map();
  mesh.faces.forEach((f, fi) => {
    const cnt = f.verts.length;
    for (let i = 0; i < cnt; i++) {
      const a = f.verts[i];
      const b = f.verts[(i + 1) % cnt];
      const key = keyOf(a, b);
      let info = edgeInfo.get(key);
      if (!info) {
        info = {
          a,
          b,
          faces: [],
          midpoint: mesh.verts[a].co.clone().add(mesh.verts[b].co).multiplyScalar(0.5),
        };
        edgeInfo.set(key, info);
      }
      info.faces.push(fi);
    }
  });

  edgeInfo.forEach((info) => {
    if (info.faces.length === 2) {
      info.edgePoint = facePoints[info.faces[0]]
        .clone()
        .add(facePoints[info.faces[1]])
        .add(mesh.verts[info.a].co)
        .add(mesh.verts[info.b].co)
        .multiplyScalar(0.25);
    } else {
      info.edgePoint = info.midpoint.clone();
    }
  });

  const vertFaces = Array.from({ length: n }, () => []);
  const vertEdgeKeys = Array.from({ length: n }, () => []);
  mesh.faces.forEach((f, fi) => f.verts.forEach((vi) => vertFaces[vi].push(fi)));
  edgeInfo.forEach((info, key) => {
    vertEdgeKeys[info.a].push(key);
    vertEdgeKeys[info.b].push(key);
  });

  const newPositions = mesh.verts.map((v, vi) => {
    const touchingEdges = vertEdgeKeys[vi].map((k) => edgeInfo.get(k));
    const boundaryEdges = touchingEdges.filter((e) => e.faces.length < 2);
    if (boundaryEdges.length > 0) {
      if (boundaryEdges.length === 2) {
        return boundaryEdges[0].midpoint
          .clone()
          .add(boundaryEdges[1].midpoint)
          .add(v.co.clone().multiplyScalar(4))
          .multiplyScalar(1 / 6);
      }
      return v.co.clone();
    }
    const valence = touchingEdges.length;
    if (valence === 0) return v.co.clone();
    const F = new THREE.Vector3();
    vertFaces[vi].forEach((fi) => F.add(facePoints[fi]));
    F.divideScalar(vertFaces[vi].length);
    const R = new THREE.Vector3();
    touchingEdges.forEach((e) => R.add(e.midpoint));
    R.divideScalar(touchingEdges.length);
    return F.add(R.multiplyScalar(2))
      .add(v.co.clone().multiplyScalar(valence - 3))
      .divideScalar(valence);
  });

  const out = new MeshData();
  newPositions.forEach((p) => out.addVertex(p.x, p.y, p.z));
  const facePointIdx = facePoints.map((fp) => out.addVertexV(fp));
  const edgePointIdx = new Map();
  edgeInfo.forEach((info, key) => edgePointIdx.set(key, out.addVertexV(info.edgePoint)));

  mesh.faces.forEach((f, fi) => {
    const cnt = f.verts.length;
    const fp = facePointIdx[fi];
    for (let i = 0; i < cnt; i++) {
      const vPrev = f.verts[(i - 1 + cnt) % cnt];
      const v = f.verts[i];
      const vNext = f.verts[(i + 1) % cnt];
      const ePrev = edgePointIdx.get(keyOf(vPrev, v));
      const eNext = edgePointIdx.get(keyOf(v, vNext));
      out.addFace([v, eNext, fp, ePrev]);
    }
  });
  out.rebuildEdgesFromFaces();
  return out;
}

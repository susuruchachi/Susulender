// js/io/STLIO.js
// STL is pure triangle soup with no shared-vertex topology and no UVs.
// Export always writes binary STL (compact, single file, universally
// supported). Import accepts either ASCII or binary STL and welds
// coincident vertices afterwards, since otherwise every triangle would
// come in with its own unshared corners and nothing in Edit Mode
// (extrude, subdivide...) would work correctly on the result.

import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export function exportSTLBinary(sceneObjects) {
  const triangles = [];
  sceneObjects.forEach((so) => {
    const mesh = so.evaluatedMesh;
    const matrix = so.object3D.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    mesh.faces.forEach((f) => {
      const n = mesh.computeFaceNormal(f).applyMatrix3(normalMatrix).normalize();
      const pts = f.verts.map((vi) => mesh.verts[vi].co.clone().applyMatrix4(matrix));
      for (let i = 1; i < pts.length - 1; i++) triangles.push({ n, a: pts[0], b: pts[i], c: pts[i + 1] });
    });
  });

  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const dv = new DataView(buffer);
  dv.setUint32(80, triangles.length, true);
  let offset = 84;
  triangles.forEach((t) => {
    dv.setFloat32(offset, t.n.x, true);
    dv.setFloat32(offset + 4, t.n.y, true);
    dv.setFloat32(offset + 8, t.n.z, true);
    offset += 12;
    [t.a, t.b, t.c].forEach((p) => {
      dv.setFloat32(offset, p.x, true);
      dv.setFloat32(offset + 4, p.y, true);
      dv.setFloat32(offset + 8, p.z, true);
      offset += 12;
    });
    dv.setUint16(offset, 0, true);
    offset += 2;
  });
  return buffer;
}

export function importSTL(arrayBuffer, name = 'Imported') {
  const bytes = new Uint8Array(arrayBuffer);
  let looksBinary = false;
  if (bytes.length >= 84) {
    const dv0 = new DataView(arrayBuffer);
    const triCount = dv0.getUint32(80, true);
    if (84 + triCount * 50 === bytes.length) looksBinary = true;
  }
  const startsWithSolid = new TextDecoder().decode(bytes.subarray(0, Math.min(5, bytes.length))) === 'solid';

  const mesh = new MeshData();
  if (startsWithSolid && !looksBinary) {
    const text = new TextDecoder().decode(bytes);
    const vertRe = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let match;
    let triVerts = [];
    while ((match = vertRe.exec(text))) {
      triVerts.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
      if (triVerts.length === 9) {
        const i0 = mesh.addVertex(triVerts[0], triVerts[1], triVerts[2]);
        const i1 = mesh.addVertex(triVerts[3], triVerts[4], triVerts[5]);
        const i2 = mesh.addVertex(triVerts[6], triVerts[7], triVerts[8]);
        mesh.addFace([i0, i1, i2]);
        triVerts = [];
      }
    }
  } else {
    const dv = new DataView(arrayBuffer);
    const triCount = dv.getUint32(80, true);
    let offset = 84;
    for (let t = 0; t < triCount && offset + 50 <= bytes.length; t++) {
      offset += 12; // skip the stored normal - we recompute per face
      const idx = [];
      for (let i = 0; i < 3; i++) {
        idx.push(mesh.addVertex(dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)));
        offset += 12;
      }
      mesh.addFace(idx);
      offset += 2;
    }
  }
  return [{ name, mesh: weldMesh(mesh) }];
}

function weldMesh(mesh, threshold = 1e-5) {
  const welded = new MeshData();
  const buckets = new Map();
  const remap = new Map();
  const keyOf = (co) => Math.round(co.x / threshold) + '_' + Math.round(co.y / threshold) + '_' + Math.round(co.z / threshold);
  mesh.verts.forEach((v, i) => {
    const key = keyOf(v.co);
    let idx = buckets.get(key);
    if (idx === undefined) {
      idx = welded.addVertex(v.co.x, v.co.y, v.co.z);
      buckets.set(key, idx);
    }
    remap.set(i, idx);
  });
  mesh.faces.forEach((f) => {
    const newVerts = f.verts.map((vi) => remap.get(vi));
    if (new Set(newVerts).size >= 3) welded.addFace(newVerts, f.uvs);
  });
  welded.rebuildEdgesFromFaces();
  return welded;
}

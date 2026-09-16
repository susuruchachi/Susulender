// js/uv/UnwrapOps.js
// Projection-based unwrap methods. These don't attempt Blender's seam-
// based "Unwrap" (angle-based flattening of a cut mesh) - that's a much
// larger algorithm. Planar/box/cylindrical/spherical projection covers a
// lot of real modeling needs (hard-surface parts, architectural shapes,
// simple organic forms) and is honest about what it is.

import * as THREE from 'three';

function normalizeKeepingAspect(mesh, faceIndices, onlyV = false) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  faceIndices.forEach((fi) => {
    mesh.faces[fi].uvs.forEach(([u, v]) => {
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    });
  });
  const scale = 1 / Math.max(maxU - minU, maxV - minV, 1e-6);
  faceIndices.forEach((fi) => {
    mesh.faces[fi].uvs = mesh.faces[fi].uvs.map(([u, v]) => [onlyV ? u : (u - minU) * scale, (v - minV) * scale]);
  });
}

export function unwrapPlanar(mesh, faceIndices, axis = 'Z') {
  const idx = axis === 'X' ? [1, 2] : axis === 'Y' ? [0, 2] : [0, 1];
  faceIndices.forEach((fi) => {
    const f = mesh.faces[fi];
    f.uvs = f.verts.map((vi) => {
      const co = mesh.verts[vi].co;
      return [co.getComponent(idx[0]), co.getComponent(idx[1])];
    });
  });
  normalizeKeepingAspect(mesh, faceIndices);
}

export function unwrapBox(mesh, faceIndices) {
  faceIndices.forEach((fi) => {
    const f = mesh.faces[fi];
    const n = mesh.computeFaceNormal(f);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const idx = ax >= ay && ax >= az ? [1, 2] : ay >= ax && ay >= az ? [0, 2] : [0, 1];
    f.uvs = f.verts.map((vi) => {
      const co = mesh.verts[vi].co;
      return [co.getComponent(idx[0]), co.getComponent(idx[1])];
    });
  });
  normalizeKeepingAspect(mesh, faceIndices);
}

export function unwrapCylindrical(mesh, faceIndices, axis = 'Y') {
  const upIdx = axis === 'X' ? 0 : axis === 'Z' ? 2 : 1;
  const ringIdx = axis === 'X' ? [1, 2] : axis === 'Z' ? [0, 1] : [0, 2];
  faceIndices.forEach((fi) => {
    const f = mesh.faces[fi];
    f.uvs = f.verts.map((vi) => {
      const co = mesh.verts[vi].co;
      const angle = Math.atan2(co.getComponent(ringIdx[1]), co.getComponent(ringIdx[0]));
      const u = (angle + Math.PI) / (Math.PI * 2);
      return [u, co.getComponent(upIdx)];
    });
  });
  normalizeKeepingAspect(mesh, faceIndices, true);
}

export function unwrapSpherical(mesh, faceIndices) {
  faceIndices.forEach((fi) => {
    const f = mesh.faces[fi];
    f.uvs = f.verts.map((vi) => {
      const co = mesh.verts[vi].co;
      const r = Math.max(co.length(), 1e-6);
      const u = (Math.atan2(co.z, co.x) + Math.PI) / (Math.PI * 2);
      const v = Math.acos(THREE.MathUtils.clamp(co.y / r, -1, 1)) / Math.PI;
      return [u, v];
    });
  });
}

export const UNWRAP_METHODS = {
  PLANAR_X: { label: 'Planar - X', run: (mesh, faces) => unwrapPlanar(mesh, faces, 'X') },
  PLANAR_Y: { label: 'Planar - Y', run: (mesh, faces) => unwrapPlanar(mesh, faces, 'Y') },
  PLANAR_Z: { label: 'Planar - Z', run: (mesh, faces) => unwrapPlanar(mesh, faces, 'Z') },
  BOX: { label: 'Box Projection', run: (mesh, faces) => unwrapBox(mesh, faces) },
  CYLINDRICAL: { label: 'Cylindrical', run: (mesh, faces) => unwrapCylindrical(mesh, faces) },
  SPHERICAL: { label: 'Spherical', run: (mesh, faces) => unwrapSpherical(mesh, faces) },
};

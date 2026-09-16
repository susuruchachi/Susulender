// js/modifiers/SolidifyModifier.js
// Gives a surface real thickness: builds an inner shell offset along
// per-vertex averaged normals, and walls any open border so the result is
// a closed volume (a flat plane becomes a thin slab, for example).

import * as THREE from 'three';

export const SolidifyModifier = {
  type: 'SOLIDIFY',
  label: 'Solidify',
  defaultParams: () => ({ thickness: 0.08 }),
  apply(mesh, params) {
    const thickness = params.thickness ?? 0.08;
    const out = mesh.clone();
    const n = mesh.verts.length;

    const vertNormal = Array.from({ length: n }, () => new THREE.Vector3());
    mesh.faces.forEach((f) => {
      const normal = mesh.computeFaceNormal(f);
      f.verts.forEach((vi) => vertNormal[vi].add(normal));
    });
    vertNormal.forEach((v) => {
      if (v.lengthSq() > 1e-9) v.normalize();
    });

    const innerOffset = new Map();
    for (let vi = 0; vi < n; vi++) {
      const p = mesh.verts[vi].co.clone().add(vertNormal[vi].clone().multiplyScalar(-thickness));
      innerOffset.set(vi, out.addVertexV(p));
    }

    mesh.faces.forEach((f) => {
      const newVerts = f.verts.map((vi) => innerOffset.get(vi)).reverse();
      out.addFace(newVerts, f.uvs.map((uv) => uv.slice()).reverse());
    });

    const usage = new Map();
    mesh.faces.forEach((f) => {
      const cnt = f.verts.length;
      for (let i = 0; i < cnt; i++) {
        const a = f.verts[i];
        const b = f.verts[(i + 1) % cnt];
        const key = a < b ? a + '_' + b : b + '_' + a;
        const entry = usage.get(key);
        if (entry) entry.count++;
        else usage.set(key, { count: 1, a, b });
      }
    });
    usage.forEach(({ count, a, b }) => {
      if (count === 1) out.addFace([a, b, innerOffset.get(b), innerOffset.get(a)]);
    });

    out.rebuildEdgesFromFaces();
    return out;
  },
};

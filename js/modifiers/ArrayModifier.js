// js/modifiers/ArrayModifier.js
// Duplicates the mesh `count` times, each copy offset by a fixed vector
// from the previous one (a "constant offset" array, the simplest and most
// predictable of Blender's array modes).

import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export const ArrayModifier = {
  type: 'ARRAY',
  label: 'Array',
  defaultParams: () => ({ count: 3, offsetX: 1.2, offsetY: 0, offsetZ: 0 }),
  apply(mesh, params) {
    const count = Math.max(1, Math.min(64, Math.round(params.count ?? 3)));
    const offset = new THREE.Vector3(params.offsetX ?? 1.2, params.offsetY ?? 0, params.offsetZ ?? 0);
    const out = new MeshData();
    for (let i = 0; i < count; i++) {
      const vertOffset = out.verts.length;
      const step = offset.clone().multiplyScalar(i);
      mesh.verts.forEach((v) => out.addVertexV(v.co.clone().add(step)));
      mesh.faces.forEach((f) =>
        out.addFace(
          f.verts.map((vi) => vi + vertOffset),
          f.uvs.map((uv) => uv.slice())
        )
      );
    }
    out.rebuildEdgesFromFaces();
    return out;
  },
};

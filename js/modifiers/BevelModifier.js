// js/modifiers/BevelModifier.js
// A simplified "chamfer every corner" bevel: each vertex is replaced by one
// new point per incident edge (pulled toward that neighbour), and the
// resulting small gap at each corner is capped with its own face. This
// covers the common hard-surface "soften every edge a little" use case
// without the full complexity of Blender's segment/angle-limited bevel.

import { MeshData } from '../core/MeshData.js';

export const BevelModifier = {
  type: 'BEVEL',
  label: 'Bevel',
  defaultParams: () => ({ amount: 0.06 }),
  apply(mesh, params) {
    const amount = Math.max(0, params.amount ?? 0.06);
    if (amount <= 0) return mesh.clone();
    const out = new MeshData();

    const cutPoint = new Map();
    const getCut = (V, Ni) => {
      const key = V + '_' + Ni;
      let idx = cutPoint.get(key);
      if (idx === undefined) {
        const a = mesh.verts[V].co;
        const b = mesh.verts[Ni].co;
        const len = a.distanceTo(b);
        const t = len > 1e-9 ? Math.min(amount, len * 0.49) / len : 0;
        idx = out.addVertexV(a.clone().lerp(b, t));
        cutPoint.set(key, idx);
      }
      return idx;
    };

    mesh.faces.forEach((f) => {
      const n = f.verts.length;
      const loop = [];
      const uvs = [];
      for (let i = 0; i < n; i++) {
        const prevN = f.verts[(i - 1 + n) % n];
        const V = f.verts[i];
        const nextN = f.verts[(i + 1) % n];
        loop.push(getCut(V, prevN), getCut(V, nextN));
        uvs.push(f.uvs[i], f.uvs[i]);
      }
      out.addFace(loop, uvs);
    });

    // corner caps: gather every wedge touching each original vertex, order
    // them by walking around it, and cap the resulting small n-gon.
    const wedgesByVert = new Map();
    mesh.faces.forEach((f) => {
      const n = f.verts.length;
      for (let i = 0; i < n; i++) {
        const V = f.verts[i];
        const prevN = f.verts[(i - 1 + n) % n];
        const nextN = f.verts[(i + 1) % n];
        if (!wedgesByVert.has(V)) wedgesByVert.set(V, []);
        wedgesByVert.get(V).push({ prevN, nextN });
      }
    });
    wedgesByVert.forEach((wedges, V) => {
      if (wedges.length < 2) return;
      const remaining = wedges.slice();
      const ordered = [remaining.shift()];
      while (remaining.length) {
        const last = ordered[ordered.length - 1];
        const nextIdx = remaining.findIndex((w) => w.prevN === last.nextN);
        if (nextIdx === -1) break; // open fan at a mesh border - cap what we have
        ordered.push(remaining.splice(nextIdx, 1)[0]);
      }
      const capLoop = ordered.map((w) => getCut(V, w.nextN));
      if (capLoop.length >= 3) out.addFace(capLoop);
    });

    out.rebuildEdgesFromFaces();
    return out;
  },
};

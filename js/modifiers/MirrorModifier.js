// js/modifiers/MirrorModifier.js
// Mirrors the mesh across an axis of local space. Vertices that already
// sit on the mirror plane (within mergeThreshold) are welded so the seam
// doesn't crack open.

export const MirrorModifier = {
  type: 'MIRROR',
  label: 'Mirror',
  defaultParams: () => ({ axis: 'X', mergeThreshold: 0.001 }),
  apply(mesh, params) {
    const axis = params.axis || 'X';
    const compIdx = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2;
    const threshold = params.mergeThreshold ?? 0.001;
    const out = mesh.clone();
    const baseCount = out.verts.length;

    const mirrorMap = new Map();
    for (let vi = 0; vi < baseCount; vi++) {
      const original = out.verts[vi].co;
      if (Math.abs(original.getComponent(compIdx)) <= threshold) {
        mirrorMap.set(vi, vi); // sits on the plane: weld to itself
        continue;
      }
      const co = original.clone();
      co.setComponent(compIdx, -co.getComponent(compIdx));
      mirrorMap.set(vi, out.addVertexV(co, false));
    }

    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const f = mesh.faces[fi];
      const newVerts = f.verts.map((vi) => mirrorMap.get(vi)).reverse();
      const newUVs = f.uvs.map((uv) => [uv[0], uv[1]]).reverse();
      out.addFace(newVerts, newUVs);
    }
    out.rebuildEdgesFromFaces();
    return out;
  },
};

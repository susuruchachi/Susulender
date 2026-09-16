// js/core/MeshData.js
//
// The editable mesh representation shared by every tool in the app.
// This is intentionally NOT a THREE.BufferGeometry: BufferGeometry is a
// flat, triangulated, GPU-friendly format with no concept of "this vertex
// is shared by these three faces". Editing (extrude, inset, loop cut...)
// needs that shared topology, so we keep our own vert/edge/face graph and
// only flatten it into a BufferGeometry for rendering (see toBufferGeometry).
//
// Data shapes:
//   vert:  { co: THREE.Vector3, select: boolean }
//   edge:  { v: [vertIndexA, vertIndexB], select: boolean }
//   face:  { verts: number[], uvs: number[][], select: boolean, matIndex: number }
//          `verts` is an ordered loop (CCW when viewed from the outside).
//          `uvs` is a parallel array, one [u, v] per corner of the loop
//          (UVs live on face-corners, not vertices, so seams are possible).

import * as THREE from 'three';

export class MeshData {
  constructor() {
    this.verts = [];
    this.edges = [];
    this.faces = [];
    this.selectMode = 'VERTEX'; // 'VERTEX' | 'EDGE' | 'FACE'
    this._edgeIndexMap = new Map();
  }

  // ---------------------------------------------------------------- clone
  clone() {
    const m = new MeshData();
    m.verts = this.verts.map((v) => ({ co: v.co.clone(), select: v.select }));
    m.edges = this.edges.map((e) => ({ v: [e.v[0], e.v[1]], select: e.select }));
    m.faces = this.faces.map((f) => ({
      verts: f.verts.slice(),
      uvs: f.uvs.map((uv) => [uv[0], uv[1]]),
      select: f.select,
      matIndex: f.matIndex || 0,
    }));
    m.selectMode = this.selectMode;
    m.rebuildEdgeIndexMap();
    return m;
  }

  toJSON() {
    return {
      verts: this.verts.map((v) => ({ co: [v.co.x, v.co.y, v.co.z], select: v.select })),
      edges: this.edges.map((e) => ({ v: e.v.slice(), select: e.select })),
      faces: this.faces.map((f) => ({
        verts: f.verts.slice(),
        uvs: f.uvs.map((uv) => uv.slice()),
        select: f.select,
        matIndex: f.matIndex || 0,
      })),
      selectMode: this.selectMode,
    };
  }

  static fromJSON(data) {
    const m = new MeshData();
    m.verts = data.verts.map((v) => ({ co: new THREE.Vector3(v.co[0], v.co[1], v.co[2]), select: !!v.select }));
    m.edges = data.edges.map((e) => ({ v: e.v.slice(), select: !!e.select }));
    m.faces = data.faces.map((f) => ({
      verts: f.verts.slice(),
      uvs: f.uvs.map((uv) => uv.slice()),
      select: !!f.select,
      matIndex: f.matIndex || 0,
    }));
    m.selectMode = data.selectMode || 'VERTEX';
    m.rebuildEdgeIndexMap();
    return m;
  }

  // ------------------------------------------------------------- building
  addVertex(x, y, z, select = false) {
    this.verts.push({ co: new THREE.Vector3(x, y, z), select });
    return this.verts.length - 1;
  }

  addVertexV(vec, select = false) {
    return this.addVertex(vec.x, vec.y, vec.z, select);
  }

  _edgeKey(a, b) {
    return a < b ? a + '_' + b : b + '_' + a;
  }

  ensureEdge(a, b) {
    const key = this._edgeKey(a, b);
    let idx = this._edgeIndexMap.get(key);
    if (idx === undefined) {
      idx = this.edges.length;
      this.edges.push({ v: [a, b], select: false });
      this._edgeIndexMap.set(key, idx);
    }
    return idx;
  }

  // vertIndices: ordered loop, CCW as seen from the face's outward side.
  // uvs: optional parallel array of [u, v]; a simple default is generated
  // if omitted (real UVs normally come from an unwrap operator).
  addFace(vertIndices, uvs = null) {
    const n = vertIndices.length;
    if (n < 3) return -1;
    const faceUVs = uvs || vertIndices.map((_, i) => [i / n, i % 2 === 0 ? 0 : 1]);
    this.faces.push({ verts: vertIndices.slice(), uvs: faceUVs, select: false, matIndex: 0 });
    for (let i = 0; i < n; i++) {
      this.ensureEdge(vertIndices[i], vertIndices[(i + 1) % n]);
    }
    return this.faces.length - 1;
  }

  // --------------------------------------------------------- housekeeping
  rebuildEdgeIndexMap() {
    this._edgeIndexMap = new Map();
    this.edges.forEach((e, i) => this._edgeIndexMap.set(this._edgeKey(e.v[0], e.v[1]), i));
  }

  // Recompute `edges` purely from the current faces, while preserving any
  // "wire" edges (edges not bordering a face, e.g. from a vertex extrude)
  // whose vertices are still valid.
  rebuildEdgesFromFaces() {
    const newEdges = [];
    const map = new Map();
    const ensure = (a, b) => {
      const key = this._edgeKey(a, b);
      if (!map.has(key)) {
        map.set(key, newEdges.length);
        newEdges.push({ v: [a, b], select: false });
      }
      return map.get(key);
    };
    this.faces.forEach((f) => {
      const n = f.verts.length;
      for (let i = 0; i < n; i++) ensure(f.verts[i], f.verts[(i + 1) % n]);
    });
    const maxV = this.verts.length;
    this.edges.forEach((e) => {
      if (e.v[0] < maxV && e.v[1] < maxV && e.v[0] !== e.v[1]) {
        const key = this._edgeKey(e.v[0], e.v[1]);
        if (!map.has(key)) {
          map.set(key, newEdges.length);
          newEdges.push({ v: [e.v[0], e.v[1]], select: e.select });
        }
      }
    });
    this.edges = newEdges;
    this._edgeIndexMap = map;
  }

  // Physically drop the given vertex slots and reindex every reference.
  // Callers must ensure nothing still points at `removedSet` before calling
  // this (either by filtering those owners away, or remapping them first).
  _removeVertSlots(removedSet) {
    const remap = new Map();
    let newIdx = 0;
    this.verts.forEach((v, i) => {
      if (!removedSet.has(i)) remap.set(i, newIdx++);
    });
    this.verts = this.verts.filter((v, i) => !removedSet.has(i));
    this.faces.forEach((f) => {
      f.verts = f.verts.map((vi) => remap.get(vi));
    });
    this.edges.forEach((e) => {
      e.v = [remap.get(e.v[0]), remap.get(e.v[1])];
    });
    this.rebuildEdgeIndexMap();
  }

  // ----------------------------------------------------------- selection
  selectAll(mode = this.selectMode) {
    this.selectMode = mode;
    this.verts.forEach((v) => (v.select = true));
    this.edges.forEach((e) => (e.select = true));
    this.faces.forEach((f) => (f.select = true));
  }

  selectNone() {
    this.verts.forEach((v) => (v.select = false));
    this.edges.forEach((e) => (e.select = false));
    this.faces.forEach((f) => (f.select = false));
  }

  invertSelect() {
    if (this.selectMode === 'VERTEX') this.verts.forEach((v) => (v.select = !v.select));
    else if (this.selectMode === 'EDGE') this.edges.forEach((e) => (e.select = !e.select));
    else this.faces.forEach((f) => (f.select = !f.select));
    this.syncSelectionFromMode();
  }

  // After a raw select-mode-specific edit, push the selection state onto
  // the other two levels so all three stay visually consistent:
  //   vertex-select -> an edge/face is selected iff ALL its verts are
  syncSelectionFromMode() {
    if (this.selectMode === 'VERTEX') {
      this.edges.forEach((e) => (e.select = this.verts[e.v[0]].select && this.verts[e.v[1]].select));
      this.faces.forEach((f) => (f.select = f.verts.every((vi) => this.verts[vi].select)));
    } else if (this.selectMode === 'EDGE') {
      this.verts.forEach((v) => (v.select = false));
      this.edges.forEach((e) => {
        if (e.select) {
          this.verts[e.v[0]].select = true;
          this.verts[e.v[1]].select = true;
        }
      });
      this.faces.forEach((f) => {
        const n = f.verts.length;
        f.select = true;
        for (let i = 0; i < n; i++) {
          const key = this._edgeKey(f.verts[i], f.verts[(i + 1) % n]);
          const ei = this._edgeIndexMap.get(key);
          if (ei === undefined || !this.edges[ei].select) {
            f.select = false;
            break;
          }
        }
      });
    } else {
      this.verts.forEach((v) => (v.select = false));
      this.edges.forEach((e) => (e.select = false));
      this.faces.forEach((f) => {
        if (f.select) f.verts.forEach((vi) => (this.verts[vi].select = true));
      });
      this.edges.forEach((e) => {
        e.select = this.verts[e.v[0]].select && this.verts[e.v[1]].select;
      });
    }
  }

  getSelectedVertIndices() {
    const out = [];
    this.verts.forEach((v, i) => v.select && out.push(i));
    return out;
  }

  getSelectedEdgeIndices() {
    const out = [];
    this.edges.forEach((e, i) => e.select && out.push(i));
    return out;
  }

  getSelectedFaceIndices() {
    const out = [];
    this.faces.forEach((f, i) => f.select && out.push(i));
    return out;
  }

  selectionBounds() {
    const verts = this.getSelectedVertIndices();
    if (verts.length === 0) return null;
    const box = new THREE.Box3();
    verts.forEach((vi) => box.expandByPoint(this.verts[vi].co));
    return box;
  }

  selectionCenter() {
    const verts = this.getSelectedVertIndices();
    if (verts.length === 0) return null;
    const c = new THREE.Vector3();
    verts.forEach((vi) => c.add(this.verts[vi].co));
    c.divideScalar(verts.length);
    return c;
  }

  // ------------------------------------------------------------ deleting
  deleteFaces(faceIndices) {
    const toDelete = new Set(faceIndices);
    this.faces = this.faces.filter((f, i) => !toDelete.has(i));
  }

  deleteEdges(edgeIndices) {
    const toDelete = new Set(edgeIndices);
    const deletedKeys = new Set(edgeIndices.map((i) => this._edgeKey(this.edges[i].v[0], this.edges[i].v[1])));
    this.faces = this.faces.filter((f) => {
      const n = f.verts.length;
      for (let i = 0; i < n; i++) {
        if (deletedKeys.has(this._edgeKey(f.verts[i], f.verts[(i + 1) % n]))) return false;
      }
      return true;
    });
    this.edges = this.edges.filter((e, i) => !toDelete.has(i));
    this.rebuildEdgeIndexMap();
  }

  deleteVerts(vertIndices) {
    const toDelete = new Set(vertIndices);
    this.faces = this.faces.filter((f) => !f.verts.some((vi) => toDelete.has(vi)));
    this.edges = this.edges.filter((e) => !toDelete.has(e.v[0]) && !toDelete.has(e.v[1]));
    this._removeVertSlots(toDelete);
  }

  deleteSelected(mode) {
    // mode: 'VERTICES' | 'EDGES' | 'FACES' (FACES keeps verts/edges - "Delete Faces")
    if (mode === 'VERTICES') this.deleteVerts(this.getSelectedVertIndices());
    else if (mode === 'EDGES') this.deleteEdges(this.getSelectedEdgeIndices());
    else this.deleteFaces(this.getSelectedFaceIndices());
  }

  // ------------------------------------------------------------- merging
  mergeVerts(vertIndices, mode = 'CENTER') {
    if (vertIndices.length < 2) return;
    const survivor = vertIndices[0];
    let target;
    if (mode === 'CENTER') {
      target = new THREE.Vector3();
      vertIndices.forEach((vi) => target.add(this.verts[vi].co));
      target.divideScalar(vertIndices.length);
    } else {
      target = this.verts[survivor].co.clone();
    }
    this.verts[survivor].co.copy(target);
    const mergedAway = new Set(vertIndices.slice(1));
    const remap = (vi) => (mergedAway.has(vi) ? survivor : vi);

    this.faces = this.faces
      .map((f) => {
        const newVerts = [];
        const newUVs = [];
        f.verts.forEach((vi, i) => {
          const r = remap(vi);
          if (newVerts.length === 0 || newVerts[newVerts.length - 1] !== r) {
            newVerts.push(r);
            newUVs.push(f.uvs[i]);
          }
        });
        if (newVerts.length > 1 && newVerts[0] === newVerts[newVerts.length - 1]) {
          newVerts.pop();
          newUVs.pop();
        }
        return { verts: newVerts, uvs: newUVs, select: f.select, matIndex: f.matIndex };
      })
      .filter((f) => new Set(f.verts).size >= 3);

    const seenKeys = new Set();
    this.edges = this.edges
      .map((e) => ({ v: [remap(e.v[0]), remap(e.v[1])], select: e.select }))
      .filter((e) => {
        if (e.v[0] === e.v[1]) return false;
        const key = this._edgeKey(e.v[0], e.v[1]);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

    this._removeVertSlots(mergedAway);
    this.selectNone();
    this.verts[remapSurvivorIndex(this, survivor, mergedAway)].select = true;
    this.syncSelectionFromMode();
  }

  // ------------------------------------------------------------ extrude
  // Extrudes a set of selected faces as a region: shared internal edges
  // between two selected faces do not get a wall, only the outer boundary
  // does. Returns the indices of the newly created (moveable) vertices.
  extrudeFaces(faceIndices) {
    if (faceIndices.length === 0) return [];
    const selSet = new Set(faceIndices);

    // count how many selected faces use each undirected edge, and keep one
    // directed occurrence (a->b) so we can build correctly-wound walls.
    const usage = new Map(); // key -> { count, a, b }
    faceIndices.forEach((fi) => {
      const f = this.faces[fi];
      const n = f.verts.length;
      for (let i = 0; i < n; i++) {
        const a = f.verts[i];
        const b = f.verts[(i + 1) % n];
        const key = this._edgeKey(a, b);
        const entry = usage.get(key);
        if (entry) entry.count++;
        else usage.set(key, { count: 1, a, b });
      }
    });

    // collect all verts touched by the selected faces, duplicate them
    const touched = new Set();
    faceIndices.forEach((fi) => this.faces[fi].verts.forEach((vi) => touched.add(vi)));
    const oldToNew = new Map();
    touched.forEach((vi) => {
      const ni = this.addVertexV(this.verts[vi].co, true);
      oldToNew.set(vi, ni);
    });

    // re-point the selected faces (the caps) at the new duplicated verts
    faceIndices.forEach((fi) => {
      const f = this.faces[fi];
      f.verts = f.verts.map((vi) => oldToNew.get(vi));
      f.select = true;
    });

    // build side walls along boundary edges (used by exactly one selected face)
    usage.forEach(({ count, a, b }) => {
      if (count === 1) {
        const na = oldToNew.get(a);
        const nb = oldToNew.get(b);
        this.addFace([a, b, nb, na]);
      }
    });

    this.rebuildEdgesFromFaces();
    this.selectNone();
    oldToNew.forEach((ni) => (this.verts[ni].select = true));
    this.selectMode = 'FACE';
    this.faces.forEach((f) => (f.select = selSet.has(this.faces.indexOf(f)) ? false : f.select));
    faceIndices.forEach((fi) => (this.faces[fi] ? void 0 : null));
    this.syncSelectionFromMode();
    return Array.from(oldToNew.values());
  }

  // Extrudes selected edges into a strip of quads (no cap - matches
  // Blender's edge-mode extrude of a boundary/opening).
  extrudeEdges(edgeIndices) {
    if (edgeIndices.length === 0) return [];
    const touched = new Set();
    edgeIndices.forEach((ei) => {
      touched.add(this.edges[ei].v[0]);
      touched.add(this.edges[ei].v[1]);
    });
    const oldToNew = new Map();
    touched.forEach((vi) => oldToNew.set(vi, this.addVertexV(this.verts[vi].co, true)));
    edgeIndices.forEach((ei) => {
      const [a, b] = this.edges[ei].v;
      this.addFace([a, b, oldToNew.get(b), oldToNew.get(a)]);
    });
    this.rebuildEdgesFromFaces();
    this.selectNone();
    oldToNew.forEach((ni) => (this.verts[ni].select = true));
    this.selectMode = 'VERTEX';
    this.syncSelectionFromMode();
    return Array.from(oldToNew.values());
  }

  // Extrudes selected verts as loose spikes (new vertex + connecting wire
  // edge). Useful for isolated vertices; verts already forming faces are
  // better extruded via extrudeFaces/extrudeEdges instead.
  extrudeVerts(vertIndices) {
    const newIdx = [];
    vertIndices.forEach((vi) => {
      const ni = this.addVertexV(this.verts[vi].co, true);
      this.edges.push({ v: [vi, ni], select: true });
      newIdx.push(ni);
    });
    this.rebuildEdgeIndexMap();
    this.selectNone();
    newIdx.forEach((ni) => (this.verts[ni].select = true));
    this.selectMode = 'VERTEX';
    this.syncSelectionFromMode();
    return newIdx;
  }

  // -------------------------------------------------------------- inset
  insetFaces(faceIndices, amount = 0.1) {
    const newFaceIdx = [];
    faceIndices.forEach((fi) => {
      const f = this.faces[fi];
      const n = f.verts.length;
      const centroid = new THREE.Vector3();
      f.verts.forEach((vi) => centroid.add(this.verts[vi].co));
      centroid.divideScalar(n);

      const innerVerts = f.verts.map((vi) => {
        const p = this.verts[vi].co.clone().lerp(centroid, amount);
        return this.addVertex(p.x, p.y, p.z, true);
      });

      // frame quads between the original ring and the inner ring
      for (let i = 0; i < n; i++) {
        const a = f.verts[i];
        const b = f.verts[(i + 1) % n];
        const ib = innerVerts[(i + 1) % n];
        const ia = innerVerts[i];
        this.addFace([a, b, ib, ia]);
      }

      f.verts = innerVerts;
      f.uvs = innerVerts.map((_, i) => f.uvs[i] || [i / n, 0]);
      f.select = true;
      newFaceIdx.push(fi);
    });
    this.rebuildEdgesFromFaces();
    return newFaceIdx;
  }

  // -------------------------------------------------------- subdivide
  // Subdivides the given edges: inserts a midpoint on each, and whenever a
  // face ends up with exactly two inserted midpoints, splits that face in
  // two along the line between them (this is what makes subdividing an
  // edge ring behave like a loop cut).
  subdivideEdges(edgeIndices) {
    const midpointMap = new Map(); // edge key -> new vert index
    edgeIndices.forEach((ei) => {
      const [a, b] = this.edges[ei].v;
      const key = this._edgeKey(a, b);
      if (!midpointMap.has(key)) {
        const mid = this.verts[a].co.clone().lerp(this.verts[b].co, 0.5);
        midpointMap.set(key, this.addVertex(mid.x, mid.y, mid.z, true));
      }
    });

    const newFaces = [];
    this.faces.forEach((f) => {
      const n = f.verts.length;
      const newLoop = [];
      const newUVs = [];
      const splitPositions = [];
      for (let i = 0; i < n; i++) {
        const a = f.verts[i];
        const b = f.verts[(i + 1) % n];
        newLoop.push(a);
        newUVs.push(f.uvs[i]);
        const key = this._edgeKey(a, b);
        if (midpointMap.has(key)) {
          newLoop.push(midpointMap.get(key));
          const uvA = f.uvs[i];
          const uvB = f.uvs[(i + 1) % n];
          newUVs.push([(uvA[0] + uvB[0]) / 2, (uvA[1] + uvB[1]) / 2]);
          splitPositions.push(newLoop.length - 1);
        }
      }
      if (splitPositions.length === 2) {
        const [p0, p1] = splitPositions;
        const faceA = { verts: newLoop.slice(p0, p1 + 1), uvs: newUVs.slice(p0, p1 + 1), select: true, matIndex: f.matIndex };
        const faceB = {
          verts: newLoop.slice(p1).concat(newLoop.slice(0, p0 + 1)),
          uvs: newUVs.slice(p1).concat(newUVs.slice(0, p0 + 1)),
          select: true,
          matIndex: f.matIndex,
        };
        newFaces.push(faceA, faceB);
      } else {
        newFaces.push({ verts: newLoop, uvs: newUVs, select: f.select, matIndex: f.matIndex });
      }
    });
    this.faces = newFaces;
    this.rebuildEdgesFromFaces();
  }

  // -------------------------------------------------------------- misc
  flipNormals(faceIndices) {
    faceIndices.forEach((fi) => {
      const f = this.faces[fi];
      f.verts.reverse();
      f.uvs.reverse();
    });
  }

  computeFaceNormal(face) {
    // Newell's method: robust for non-planar or concave n-gons.
    const n = new THREE.Vector3();
    const verts = face.verts.map((vi) => this.verts[vi].co);
    for (let i = 0; i < verts.length; i++) {
      const cur = verts[i];
      const next = verts[(i + 1) % verts.length];
      n.x += (cur.y - next.y) * (cur.z + next.z);
      n.y += (cur.z - next.z) * (cur.x + next.x);
      n.z += (cur.x - next.x) * (cur.y + next.y);
    }
    if (n.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
    return n.normalize();
  }

  translateSelected(delta) {
    this.getSelectedVertIndices().forEach((vi) => this.verts[vi].co.add(delta));
  }

  applyMatrixToSelected(matrix, pivot) {
    const p = pivot || this.selectionCenter() || new THREE.Vector3();
    this.getSelectedVertIndices().forEach((vi) => {
      const co = this.verts[vi].co;
      co.sub(p).applyMatrix4(matrix).add(p);
    });
  }

  // -------------------------------------------------------------- export
  // Triangulates (fan triangulation) into flat arrays ready for a
  // THREE.BufferGeometry, plus back-references so picking can map a
  // triangle hit back to the source vertex/face.
  toBufferGeometry() {
    const positions = [];
    const normals = [];
    const uvs = [];
    const vertMap = []; // per-output-vertex -> source vertex index
    const faceMap = []; // per-triangle -> source face index

    this.faces.forEach((f, fi) => {
      const n = f.verts.length;
      if (n < 3) return;
      const normal = this.computeFaceNormal(f);
      for (let i = 1; i < n - 1; i++) {
        const tri = [0, i, i + 1];
        tri.forEach((cornerIdx) => {
          const vi = f.verts[cornerIdx];
          const co = this.verts[vi].co;
          positions.push(co.x, co.y, co.z);
          normals.push(normal.x, normal.y, normal.z);
          const uv = f.uvs[cornerIdx] || [0, 0];
          uvs.push(uv[0], uv[1]);
          vertMap.push(vi);
        });
        faceMap.push(fi);
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.userData.vertMap = vertMap;
    geo.userData.faceMap = faceMap;
    return geo;
  }
}

// Helper used by mergeVerts: after _removeVertSlots reindexes everything,
// figure out where `survivor`'s original index ended up.
function remapSurvivorIndex(mesh, survivor, mergedAway) {
  let shift = 0;
  for (const vi of mergedAway) if (vi < survivor) shift++;
  return survivor - shift;
}

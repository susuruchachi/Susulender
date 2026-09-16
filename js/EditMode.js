// js/modes/EditMode.js
// Edit Mode: select/transform vertices, edges or faces of the active
// object's base mesh (the pre-modifier "cage"). Selection is kept in sync
// across all three levels by MeshData.syncSelectionFromMode(), so most
// operators here can just ask for getSelectedVertIndices() regardless of
// which select mode is active.

import * as THREE from 'three';

export class EditMode {
  constructor(app) {
    this.app = app;
    this._dragStart = null;
    this._isBoxSelecting = false;
    this._boxDiv = null;
  }

  get sceneObject() {
    return this.app.scene.activeObject;
  }

  get mesh() {
    return this.sceneObject ? this.sceneObject.mesh : null;
  }

  // ------------------------------------------------------- pointer tool
  onPointerDown(e) {
    if (!this.sceneObject) return false;
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._isBoxSelecting = false;
    return true;
  }

  onPointerMove(e) {
    if (!this._dragStart) return;
    const dist = Math.hypot(e.clientX - this._dragStart.x, e.clientY - this._dragStart.y);
    if (!this._isBoxSelecting && dist > 6) {
      this._isBoxSelecting = true;
      this._ensureBoxDiv();
    }
    if (this._isBoxSelecting) this._updateBoxDiv(e.clientX, e.clientY);
  }

  onPointerUp(e) {
    if (!this.sceneObject) return;
    const additive = e.shiftKey;
    const mesh = this.mesh;
    if (this._isBoxSelecting) {
      const rect = rectFrom(this._dragStart, { x: e.clientX, y: e.clientY });
      const vertIdx = new Set(this.app.picking.boxSelectVertIndices(this.sceneObject, rect));
      if (!additive) mesh.selectNone();
      if (mesh.selectMode === 'VERTEX') {
        vertIdx.forEach((vi) => (mesh.verts[vi].select = true));
      } else if (mesh.selectMode === 'EDGE') {
        mesh.edges.forEach((edge) => {
          if (vertIdx.has(edge.v[0]) && vertIdx.has(edge.v[1])) edge.select = true;
        });
      } else {
        mesh.faces.forEach((f) => {
          if (f.verts.every((vi) => vertIdx.has(vi))) f.select = true;
        });
      }
      mesh.syncSelectionFromMode();
      this._removeBoxDiv();
    } else {
      this._clickSelect(e.clientX, e.clientY, additive);
    }
    this._dragStart = null;
    this._isBoxSelecting = false;
    this.app.onEditSelectionChanged();
  }

  _clickSelect(x, y, additive) {
    const mesh = this.mesh;
    let idx = -1;
    if (mesh.selectMode === 'VERTEX') idx = this.app.picking.pickVertex(this.sceneObject, x, y);
    else if (mesh.selectMode === 'EDGE') idx = this.app.picking.pickEdge(this.sceneObject, x, y);
    else idx = this.app.picking.pickFace(this.sceneObject, x, y);

    const arr = mesh.selectMode === 'VERTEX' ? mesh.verts : mesh.selectMode === 'EDGE' ? mesh.edges : mesh.faces;
    if (idx === -1) {
      if (!additive) mesh.selectNone();
    } else if (additive) {
      arr[idx].select = !arr[idx].select;
    } else {
      mesh.selectNone();
      arr[idx].select = true;
    }
    mesh.syncSelectionFromMode();
  }

  _ensureBoxDiv() {
    if (this._boxDiv) return;
    this._boxDiv = document.createElement('div');
    this._boxDiv.className = 'select-box';
    this.app.viewport.container.appendChild(this._boxDiv);
  }

  _updateBoxDiv(x, y) {
    const rect = rectFrom(this._dragStart, { x, y });
    const c = this.app.viewport.container.getBoundingClientRect();
    Object.assign(this._boxDiv.style, {
      left: rect.x0 - c.left + 'px',
      top: rect.y0 - c.top + 'px',
      width: rect.x1 - rect.x0 + 'px',
      height: rect.y1 - rect.y0 + 'px',
    });
  }

  _removeBoxDiv() {
    if (this._boxDiv) {
      this._boxDiv.remove();
      this._boxDiv = null;
    }
  }

  // ------------------------------------------------------------ keyboard
  handleKeyDown(e) {
    const gizmo = this.app.gizmo;
    if (gizmo.isModalActive()) {
      if (e.key === 'Escape') return gizmo.cancel();
      if (e.key === 'Enter') return gizmo.confirm();
      if (e.key === 'x' || e.key === 'X') return gizmo.setKeyboardAxis('X');
      if (e.key === 'y' || e.key === 'Y') return gizmo.setKeyboardAxis('Y');
      if (e.key === 'z' || e.key === 'Z') return gizmo.setKeyboardAxis('Z');
      if (/^[0-9.-]$/.test(e.key)) return gizmo.appendNumeric(e.key);
      if (e.key === 'Backspace') return gizmo.backspaceNumeric();
      return;
    }
    if (!this.mesh) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      this.app.setMode('OBJECT');
    } else if (e.key === '1') this.setSelectMode('VERTEX');
    else if (e.key === '2') this.setSelectMode('EDGE');
    else if (e.key === '3') this.setSelectMode('FACE');
    else if (e.key === 'g' || e.key === 'G') this.beginModal('MOVE');
    else if (e.key === 'r' || e.key === 'R') this.beginModal('ROTATE');
    else if (e.key === 's' || e.key === 'S') this.beginModal('SCALE');
    else if (e.key === 'e' || e.key === 'E') this.extrude();
    else if (e.key === 'i' || e.key === 'I') this.inset();
    else if (e.key === 'm' || e.key === 'M') this.mergeAtCenter();
    else if (e.key === 'a' || e.key === 'A') {
      if (e.shiftKey) this.mesh.selectNone();
      else this.mesh.selectAll();
      this.app.onEditSelectionChanged();
    } else if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') this.deleteSelected();
    else if ((e.key === 'd' || e.key === 'D') && e.shiftKey) this.duplicateSelected();
    else if (e.key === 'n' || e.key === 'N') this.flipNormals();
  }

  setSelectMode(mode) {
    this.mesh.selectMode = mode;
    this.mesh.syncSelectionFromMode();
    this.app.scene.setEditSelectMode(mode);
    this.app.onEditSelectionChanged();
  }

  beginModal(mode) {
    if (!this.mesh.getSelectedVertIndices().length) return;
    this.app.gizmo.setTarget(this);
    this.app.gizmo.beginModalFromKeyboard(mode, this.app.lastMouseX, this.app.lastMouseY);
  }

  // ----------------------------------------------------------- operators
  _selectedEdgesImplied() {
    const mesh = this.mesh;
    const selVerts = new Set(mesh.getSelectedVertIndices());
    const out = [];
    mesh.edges.forEach((e, i) => {
      if (selVerts.has(e.v[0]) && selVerts.has(e.v[1])) out.push(i);
    });
    return out;
  }

  extrude() {
    const mesh = this.mesh;
    if (!mesh) return;
    let moved = [];
    this.app.history.snapshot('Extrude');
    if (mesh.selectMode === 'FACE' && mesh.getSelectedFaceIndices().length) {
      moved = mesh.extrudeFaces(mesh.getSelectedFaceIndices());
    } else if (mesh.selectMode === 'EDGE' && mesh.getSelectedEdgeIndices().length) {
      moved = mesh.extrudeEdges(mesh.getSelectedEdgeIndices());
    } else if (mesh.getSelectedVertIndices().length) {
      moved = mesh.extrudeVerts(mesh.getSelectedVertIndices());
    } else {
      return;
    }
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
    if (moved.length) this.beginModal('MOVE');
  }

  inset(amount = 0.15) {
    const mesh = this.mesh;
    if (!mesh || mesh.selectMode !== 'FACE') return;
    const faces = mesh.getSelectedFaceIndices();
    if (!faces.length) return;
    this.app.history.snapshot('Inset Faces');
    mesh.insetFaces(faces, amount);
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
  }

  subdivide() {
    const mesh = this.mesh;
    if (!mesh) return;
    const edges = this._selectedEdgesImplied();
    if (!edges.length) return;
    this.app.history.snapshot('Subdivide');
    mesh.subdivideEdges(edges);
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
  }

  mergeAtCenter() {
    const mesh = this.mesh;
    if (!mesh) return;
    const verts = mesh.getSelectedVertIndices();
    if (verts.length < 2) return;
    this.app.history.snapshot('Merge at Center');
    mesh.mergeVerts(verts, 'CENTER');
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
  }

  deleteSelected() {
    const mesh = this.mesh;
    if (!mesh) return;
    this.app.history.snapshot('Delete');
    if (mesh.selectMode === 'VERTEX') mesh.deleteSelected('VERTICES');
    else if (mesh.selectMode === 'EDGE') mesh.deleteSelected('EDGES');
    else mesh.deleteSelected('FACES');
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
  }

  flipNormals() {
    const mesh = this.mesh;
    if (!mesh) return;
    const faces = mesh.getSelectedFaceIndices().length ? mesh.getSelectedFaceIndices() : mesh.faces.map((_, i) => i);
    this.app.history.snapshot('Flip Normals');
    mesh.flipNormals(faces);
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
  }

  duplicateSelected() {
    const mesh = this.mesh;
    if (!mesh) return;
    const faces = mesh.getSelectedFaceIndices();
    const selVerts = mesh.getSelectedVertIndices();
    if (!selVerts.length) return;
    this.app.history.snapshot('Duplicate');
    const oldToNew = new Map();
    selVerts.forEach((vi) => oldToNew.set(vi, mesh.addVertexV(mesh.verts[vi].co, true)));
    faces.forEach((fi) => {
      const f = mesh.faces[fi];
      if (f.verts.every((vi) => oldToNew.has(vi))) {
        mesh.addFace(f.verts.map((vi) => oldToNew.get(vi)), f.uvs.map((uv) => uv.slice()));
      }
    });
    mesh.selectNone();
    oldToNew.forEach((ni) => (mesh.verts[ni].select = true));
    mesh.rebuildEdgesFromFaces();
    mesh.syncSelectionFromMode();
    this.sceneObject.rebuildGeometry();
    this.app.onEditSelectionChanged();
    this.beginModal('MOVE');
  }

  // -------------------------------------------- TransformGizmo target
  // All math below happens in the object's LOCAL space (that's what
  // mesh.verts[].co is expressed in), so world-space deltas/pivots coming
  // from the gizmo are converted in and back out again.
  getPivot() {
    const mesh = this.mesh;
    if (!mesh) return new THREE.Vector3();
    const local = mesh.selectionCenter() || new THREE.Vector3();
    this.sceneObject.object3D.updateMatrixWorld(true);
    return local.applyMatrix4(this.sceneObject.object3D.matrixWorld);
  }

  captureSnapshot() {
    const mesh = this.mesh;
    return mesh.getSelectedVertIndices().map((vi) => ({ vi, co: mesh.verts[vi].co.clone() }));
  }

  applyTranslation(snapshot, deltaWorld) {
    const obj = this.sceneObject.object3D;
    const invQuat = obj.quaternion.clone().invert();
    const localDelta = deltaWorld.clone().applyQuaternion(invQuat);
    localDelta.divide(obj.scale);
    const mesh = this.mesh;
    snapshot.forEach((s) => mesh.verts[s.vi].co.copy(s.co).add(localDelta));
  }

  applyRotation(snapshot, pivotWorld, axisWorld, angle) {
    const obj = this.sceneObject.object3D;
    obj.updateMatrixWorld(true);
    const invMatrix = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const pivotLocal = pivotWorld.clone().applyMatrix4(invMatrix);
    const axisLocal = axisWorld.clone().transformDirection(invMatrix).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axisLocal, angle);
    const mesh = this.mesh;
    snapshot.forEach((s) => {
      const rel = s.co.clone().sub(pivotLocal).applyQuaternion(q);
      mesh.verts[s.vi].co.copy(pivotLocal).add(rel);
    });
  }

  // Non-uniform world-axis scale on local vertices is exact for an
  // unrotated object (or uniform scale) and a close approximation
  // otherwise - see the note in TransformGizmo about transform spaces.
  applyScale(snapshot, pivotWorld, perAxisWorld) {
    const obj = this.sceneObject.object3D;
    obj.updateMatrixWorld(true);
    const invMatrix = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const pivotLocal = pivotWorld.clone().applyMatrix4(invMatrix);
    const mesh = this.mesh;
    snapshot.forEach((s) => {
      const rel = s.co.clone().sub(pivotLocal).multiply(perAxisWorld);
      mesh.verts[s.vi].co.copy(pivotLocal).add(rel);
    });
  }

  restoreSnapshot(snapshot) {
    const mesh = this.mesh;
    snapshot.forEach((s) => mesh.verts[s.vi].co.copy(s.co));
  }

  commit() {
    this.sceneObject.rebuildGeometry();
    this.app.onTransformChanged();
  }
}

function rectFrom(a, b) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

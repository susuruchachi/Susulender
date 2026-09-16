// js/modes/ObjectMode.js
// Object Mode: select/move/rotate/scale/duplicate/delete whole objects.
// Implements both the pointer "tool" interface InputRouter calls, and the
// TransformGizmo "target" interface, so the same gizmo instance can drive
// either this or EditMode without knowing which one it's talking to.

import * as THREE from 'three';

export class ObjectMode {
  constructor(app) {
    this.app = app;
    this._dragStart = null;
    this._isBoxSelecting = false;
    this._boxDiv = null;
  }

  // ------------------------------------------------------- pointer tool
  onPointerDown(e) {
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
    const additive = e.shiftKey;
    if (this._isBoxSelecting) {
      const rect = rectFrom(this._dragStart, { x: e.clientX, y: e.clientY });
      const hits = this.app.picking.boxSelectObjects(this.app.scene, rect);
      if (!additive) this.app.scene.clearObjectSelection();
      hits.forEach((o) => this.app.scene.toggleSelectObject(o.id, true));
      this._removeBoxDiv();
    } else {
      const id = this.app.picking.pickObject(this.app.scene, e.clientX, e.clientY);
      if (id) this.app.scene.toggleSelectObject(id, additive);
      else if (!additive) this.app.scene.clearObjectSelection();
    }
    this._dragStart = null;
    this._isBoxSelecting = false;
    this.app.onSelectionChanged();
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

    const hasSelection = this.app.scene.getSelectedObjects().length > 0;
    if ((e.key === 'g' || e.key === 'G') && hasSelection) this.beginModal('MOVE');
    else if ((e.key === 'r' || e.key === 'R') && hasSelection) this.beginModal('ROTATE');
    else if ((e.key === 's' || e.key === 'S') && hasSelection) this.beginModal('SCALE');
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (this.app.scene.activeObject) this.app.setMode('EDIT');
    } else if (e.key === 'a' || e.key === 'A') {
      if (e.shiftKey) this.app.scene.clearObjectSelection();
      else this.app.scene.objects.forEach((o) => this.app.scene.toggleSelectObject(o.id, true));
      this.app.onSelectionChanged();
    } else if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') this.deleteSelected();
    else if ((e.key === 'd' || e.key === 'D') && e.shiftKey) this.duplicateSelected();
    else if (e.code === 'Numpad1') this.app.cameraControls.setViewPreset('FRONT');
    else if (e.code === 'Numpad3') this.app.cameraControls.setViewPreset('RIGHT');
    else if (e.code === 'Numpad7') this.app.cameraControls.setViewPreset('TOP');
    else if (e.code === 'NumpadDecimal' || e.code === 'Period') this.frameSelection();
  }

  beginModal(mode) {
    if (!this.app.scene.getSelectedObjects().length) return;
    this.app.gizmo.setTarget(this);
    this.app.gizmo.beginModalFromKeyboard(mode, this.app.lastMouseX, this.app.lastMouseY);
  }

  frameSelection() {
    const sel = this.app.scene.getSelectedObjects();
    if (!sel.length) return;
    const box = new THREE.Box3();
    sel.forEach((o) => box.union(new THREE.Box3().setFromObject(o.object3D)));
    this.app.cameraControls.frameBox(box);
  }

  deleteSelected() {
    const sel = this.app.scene.getSelectedObjects();
    if (!sel.length) return;
    this.app.history.snapshot('Delete Object');
    sel.forEach((o) => this.app.scene.removeObject(o.id));
    this.app.onSceneChanged();
  }

  duplicateSelected() {
    const sel = this.app.scene.getSelectedObjects();
    if (!sel.length) return;
    this.app.history.snapshot('Duplicate Object');
    const copies = sel.map((o) => o.clone());
    this.app.scene.objects.forEach((o) => (o.selected = false));
    copies.forEach((c) => {
      this.app.scene.objects.push(c);
      c.selected = true;
    });
    this.app.scene.activeObjectId = copies[copies.length - 1].id;
    this.app.scene.emit('change');
    this.app.onSceneChanged();
    this.beginModal('MOVE');
  }

  // -------------------------------------------- TransformGizmo target
  getPivot() {
    const sel = this.app.scene.getSelectedObjects();
    if (!sel.length) return new THREE.Vector3();
    const c = new THREE.Vector3();
    sel.forEach((o) => c.add(o.position));
    return c.divideScalar(sel.length);
  }

  captureSnapshot() {
    return this.app.scene.getSelectedObjects().map((o) => ({
      obj: o,
      position: o.position.clone(),
      rotation: o.rotation.clone(),
      scale: o.scale.clone(),
    }));
  }

  applyTranslation(snapshot, delta) {
    snapshot.forEach((s) => s.obj.position.copy(s.position).add(delta));
  }

  applyRotation(snapshot, pivot, axis, angle) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    snapshot.forEach((s) => {
      const rel = s.position.clone().sub(pivot).applyQuaternion(q);
      s.obj.position.copy(pivot).add(rel);
      const combined = q.clone().multiply(new THREE.Quaternion().setFromEuler(s.rotation));
      s.obj.rotation.setFromQuaternion(combined);
    });
  }

  applyScale(snapshot, pivot, perAxis) {
    snapshot.forEach((s) => {
      const rel = s.position.clone().sub(pivot).multiply(perAxis);
      s.obj.position.copy(pivot).add(rel);
      s.obj.scale.copy(s.scale).multiply(perAxis);
    });
  }

  restoreSnapshot(snapshot) {
    snapshot.forEach((s) => {
      s.obj.position.copy(s.position);
      s.obj.rotation.copy(s.rotation);
      s.obj.scale.copy(s.scale);
    });
  }

  // Called on every drag update (see the note in TransformGizmo.confirm/
  // cancel about why the pivot itself must not be touched here).
  commit() {
    this.app.scene.getSelectedObjects().forEach((o) => o.syncObject3DFromTransform());
    this.app.onTransformChanged();
  }
}

function rectFrom(a, b) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

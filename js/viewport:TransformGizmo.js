// js/viewport/TransformGizmo.js
//
// Draws the move/rotate/scale handles and drives both interaction styles
// Blender users expect:
//   1) grab a colored handle and drag it (mouse click-drag or touch drag)
//   2) press G/R/S, move the pointer with nothing held down, optionally
//      press X/Y/Z to constrain an axis or type a number, then click/Enter
//      to confirm or Esc/right-click to cancel
//
// It transforms whatever "target" it is given, without needing to know if
// that target is object-mode selection or edit-mode vertices - the target
// just has to implement:
//   getPivot() -> THREE.Vector3
//   captureSnapshot() -> opaque
//   applyTranslation(snapshot, THREE.Vector3 delta)
//   applyRotation(snapshot, pivot, THREE.Vector3 axis, angleRadians)
//   applyScale(snapshot, pivot, THREE.Vector3 perAxisFactors)
//   restoreSnapshot(snapshot)
//   commit()

import * as THREE from 'three';

const AXIS_COLOR = { X: 0xe5534b, Y: 0x3fb950, Z: 0x4a9eff };
const AXIS_VEC = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };

export class TransformGizmo {
  constructor(viewport) {
    this.viewport = viewport;
    this.mode = 'MOVE'; // 'MOVE' | 'ROTATE' | 'SCALE'
    this.target = null; // object implementing the interface above
    this.visible = false;

    this.group = new THREE.Group();
    this.group.renderOrder = 999;
    viewport.overlayRoot.add(this.group);

    this._handles = { MOVE: [], ROTATE: [], SCALE: [] };
    this._buildMoveHandles();
    this._buildRotateHandles();
    this._buildScaleHandles();
    this._applyModeVisibility();

    // modal drag state
    this.dragging = false;
    this.confirmOnPointerUp = false; // true: gizmo-handle click-drag style
    this.confirmOnClick = false; // true: G/R/S keyboard modal style
    this.axis = null; // 'X'|'Y'|'Z'|null
    this.numericBuffer = '';
    this._snapshot = null;
    this._startValue = null; // axis distance / angle-reference-vector, depending on mode
    this._pivot = new THREE.Vector3();

    viewport.onBeforeRender(() => this._updateScreenScale());
  }

  // -------------------------------------------------------------- handles
  _addHandle(list, mesh, axis) {
    mesh.userData.axis = axis;
    mesh.userData.isGizmoHandle = true;
    this.group.add(mesh);
    list.push(mesh);
  }

  _buildMoveHandles() {
    ['X', 'Y', 'Z'].forEach((axis) => {
      const color = AXIS_COLOR[axis];
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), new THREE.MeshBasicMaterial({ color }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), new THREE.MeshBasicMaterial({ color }));
      shaft.position.y = 0.35;
      tip.position.y = 0.79;
      const group = new THREE.Group();
      group.add(shaft, tip);
      orientAlongAxis(group, axis);
      this._addHandle(this._handles.MOVE, group, axis);
    });
    const free = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }));
    this._addHandle(this._handles.MOVE, free, null);
  }

  _buildRotateHandles() {
    ['X', 'Y', 'Z'].forEach((axis) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.012, 6, 48),
        new THREE.MeshBasicMaterial({ color: AXIS_COLOR[axis], side: THREE.DoubleSide })
      );
      orientRingAlongAxis(ring, axis);
      this._addHandle(this._handles.ROTATE, ring, axis);
    });
    const viewRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.01, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    this._addHandle(this._handles.ROTATE, viewRing, 'VIEW');
  }

  _buildScaleHandles() {
    ['X', 'Y', 'Z'].forEach((axis) => {
      const color = AXIS_COLOR[axis];
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), new THREE.MeshBasicMaterial({ color }));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), new THREE.MeshBasicMaterial({ color }));
      shaft.position.y = 0.3;
      cap.position.y = 0.66;
      const group = new THREE.Group();
      group.add(shaft, cap);
      orientAlongAxis(group, axis);
      this._addHandle(this._handles.SCALE, group, axis);
    });
    const uniform = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }));
    this._addHandle(this._handles.SCALE, uniform, null);
  }

  _applyModeVisibility() {
    Object.entries(this._handles).forEach(([mode, meshes]) => {
      meshes.forEach((m) => (m.visible = this.visible && mode === this.mode));
    });
  }

  setMode(mode) {
    this.mode = mode;
    this._applyModeVisibility();
  }

  setTarget(target) {
    this.target = target;
    this.visible = !!target;
    if (target) this._pivot.copy(target.getPivot());
    this._applyModeVisibility();
  }

  refreshPivot() {
    if (this.target) {
      this._pivot.copy(this.target.getPivot());
      this.group.position.copy(this._pivot);
    }
  }

  _updateScreenScale() {
    if (!this.visible) return;
    this.group.position.copy(this._pivot);
    const dist = this.viewport.camera.position.distanceTo(this._pivot);
    const s = Math.max(dist * 0.16, 0.001);
    this.group.scale.setScalar(s);
  }

  // ------------------------------------------------------------- hit test
  getHandleMeshes() {
    if (!this.visible) return [];
    return this._handles[this.mode];
  }

  // Returns `undefined` for "no handle here" (a real miss), or the hit
  // handle's axis - which is legitimately `null` for the free-move /
  // uniform-scale handle, so callers must check `!== undefined`, not
  // truthiness, to tell a miss from a free-handle hit.
  hitTest(clientX, clientY) {
    if (!this.visible) return undefined;
    const hits = this.viewport.raycastFromScreen(clientX, clientY, this.getHandleMeshes(), true);
    if (!hits.length) return undefined;
    let obj = hits[0].object;
    while (obj && obj.userData.axis === undefined && obj.parent) obj = obj.parent;
    return obj && 'axis' in obj.userData ? obj.userData.axis : undefined;
  }

  // -------------------------------------------------------------- modal
  isModalActive() {
    return this.dragging;
  }

  beginDragFromHandle(axis, clientX, clientY) {
    if (!this.target) return;
    this.axis = axis === 'VIEW' ? null : axis;
    this.confirmOnPointerUp = true;
    this.confirmOnClick = false;
    this._startModal(clientX, clientY);
  }

  beginModalFromKeyboard(mode, clientX, clientY) {
    if (!this.target) return;
    this.mode = mode;
    this._applyModeVisibility();
    this.axis = null;
    this.confirmOnPointerUp = false;
    this.confirmOnClick = true;
    this._startModal(clientX, clientY);
  }

  setKeyboardAxis(axis) {
    if (!this.dragging || !this.confirmOnClick) return;
    this.axis = this.axis === axis ? null : axis; // pressing the same axis twice clears the constraint
    this.numericBuffer = '';
    this._startModal(this._lastClientX, this._lastClientY, true);
  }

  appendNumeric(char) {
    if (!this.dragging || !this.confirmOnClick) return;
    this.numericBuffer += char;
    this._applyNumeric();
  }

  backspaceNumeric() {
    if (!this.dragging || !this.confirmOnClick) return;
    this.numericBuffer = this.numericBuffer.slice(0, -1);
    this._applyNumeric();
  }

  _startModal(clientX, clientY, keepSnapshotAndPivot = false) {
    this._lastClientX = clientX;
    this._lastClientY = clientY;
    this.numericBuffer = '';
    if (!keepSnapshotAndPivot) {
      this._pivot.copy(this.target.getPivot());
      this._snapshot = this.target.captureSnapshot();
    }
    // Recomputed even when keeping the snapshot/pivot: switching axis
    // constraint mid-drag (setKeyboardAxis) needs a fresh reference value
    // for the new axis at the current pointer position, so the next
    // updateDrag doesn't jump - it still applies against the same
    // untouched snapshot either way, so this never loses the original data.
    this.dragging = true;
    this._startValue = this._computeRayValue(clientX, clientY);
  }

  updateDrag(clientX, clientY) {
    if (!this.dragging) return;
    this._lastClientX = clientX;
    this._lastClientY = clientY;
    if (this.numericBuffer) return; // numeric entry overrides pointer movement
    const current = this._computeRayValue(clientX, clientY);
    this._applyValue(current);
  }

  _applyNumeric() {
    const n = parseFloat(this.numericBuffer);
    if (Number.isNaN(n)) return;
    this._applyValue(this.mode === 'ROTATE' ? THREE.MathUtils.degToRad(n) : n, true);
  }

  // Returns a single scalar representing "how far the pointer has moved
  // along the relevant control" - a signed axis distance for move/scale,
  // or a signed angle for rotate. Comparing this value between drag-start
  // and now gives the delta to apply.
  _computeRayValue(clientX, clientY) {
    const camera = this.viewport.camera;
    const ndc = this.viewport.screenToNDC(clientX, clientY);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);

    if (this.mode === 'ROTATE') {
      const axisVec = this._resolveAxisVector(camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisVec, this._pivot);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return this._startValue || 0;
      const rel = hit.sub(this._pivot);
      if (rel.lengthSq() < 1e-10) return this._startValue || 0;
      const refAxis = pickReferenceAxis(axisVec);
      const tangent = new THREE.Vector3().crossVectors(axisVec, refAxis).normalize();
      const bitangent = new THREE.Vector3().crossVectors(axisVec, tangent).normalize();
      return Math.atan2(rel.dot(bitangent), rel.dot(tangent));
    }

    if (this.axis) {
      const axisVec = AXIS_VEC[this.axis];
      const toCam = camera.position.clone().sub(this._pivot);
      let planeNormal = new THREE.Vector3().crossVectors(axisVec, toCam).cross(axisVec);
      if (planeNormal.lengthSq() < 1e-8) planeNormal = toCam.normalize();
      else planeNormal.normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this._pivot);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return this._startValue || 0;
      return hit.sub(this._pivot).dot(axisVec);
    }

    // free (screen-parallel plane through the pivot)
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir, this._pivot);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return this._startValue || new THREE.Vector3();
    return hit; // a Vector3 for the free-move case
  }

  _resolveAxisVector(camera) {
    if (this.axis) return AXIS_VEC[this.axis].clone();
    return camera.position.clone().sub(this._pivot).normalize(); // view-axis rotate, matches Blender's default
  }

  _applyValue(current, isNumeric = false) {
    if (this.mode === 'MOVE') {
      let delta;
      if (this.axis) {
        const dist = isNumeric ? current : current - this._startValue;
        delta = AXIS_VEC[this.axis].clone().multiplyScalar(dist);
      } else {
        delta = isNumeric ? new THREE.Vector3() : current.clone().sub(this._startValue);
      }
      this.target.applyTranslation(this._snapshot, delta);
    } else if (this.mode === 'ROTATE') {
      const angle = isNumeric ? current : current - this._startValue;
      const axisVec = this._resolveAxisVector(this.viewport.camera);
      this.target.applyRotation(this._snapshot, this._pivot, axisVec, angle);
    } else if (this.mode === 'SCALE') {
      let factor;
      if (isNumeric) {
        factor = current;
      } else {
        const refDist = Math.max(this.viewport.camera.position.distanceTo(this._pivot) * 0.16, 0.001);
        factor = 1 + (current - this._startValue) / refDist;
      }
      const perAxis = new THREE.Vector3(1, 1, 1);
      if (this.axis) perAxis[this.axis.toLowerCase()] = factor;
      else perAxis.set(factor, factor, factor);
      this.target.applyScale(this._snapshot, this._pivot, perAxis);
    }
    this.target.commit();
  }

  // Note on the pivot during a drag: this._pivot is captured once at
  // _startModal and deliberately never re-read from target.getPivot()
  // again until confirm()/cancel() below. Rotate and scale math depend on
  // the pivot staying fixed for the whole gesture - recomputing it every
  // frame from the (already moving) selection would make the center drift
  // as you drag. refreshPivot() is only ever called once a drag is over.
  confirm() {
    if (!this.dragging) return;
    this.dragging = false;
    this.confirmOnClick = false;
    this.confirmOnPointerUp = false;
    this.numericBuffer = '';
    this._snapshot = null;
    this.refreshPivot();
  }

  cancel() {
    if (!this.dragging) return;
    this.target.restoreSnapshot(this._snapshot);
    this.target.commit();
    this.dragging = false;
    this.confirmOnClick = false;
    this.confirmOnPointerUp = false;
    this.numericBuffer = '';
    this._snapshot = null;
    this.refreshPivot();
  }
}

function orientAlongAxis(obj, axis) {
  if (axis === 'X') obj.rotation.z = -Math.PI / 2;
  else if (axis === 'Z') obj.rotation.x = Math.PI / 2;
}

function orientRingAlongAxis(ring, axis) {
  if (axis === 'X') ring.rotation.y = Math.PI / 2;
  else if (axis === 'Y') ring.rotation.x = Math.PI / 2;
}

function pickReferenceAxis(axisVec) {
  const candidate = Math.abs(axisVec.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(candidate, axisVec).normalize();
}

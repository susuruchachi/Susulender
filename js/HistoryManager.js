// js/core/HistoryManager.js
// Undo/redo via whole-scene snapshots rather than fine-grained "undo
// commands". Heavier on memory than a command pattern, but far more
// robust: every operator just calls history.snapshot() right before it
// mutates anything, and undo/redo can never get out of sync with a
// half-applied edit.

import { MeshData } from './MeshData.js';
import { SceneObject } from './SceneObject.js';

export class HistoryManager {
  constructor(scene) {
    this.scene = scene;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 60;
  }

  snapshot(label = '') {
    this.undoStack.push({ label, state: this._captureState() });
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;
    this.redoStack.push(this._captureState());
    const { state } = this.undoStack.pop();
    this._restoreState(state);
  }

  redo() {
    if (!this.canRedo()) return;
    this.undoStack.push({ label: 'redo', state: this._captureState() });
    const state = this.redoStack.pop();
    this._restoreState(state);
  }

  _captureState() {
    return {
      activeObjectId: this.scene.activeObjectId,
      mode: this.scene.mode,
      editSelectMode: this.scene.editSelectMode,
      objects: this.scene.objects.map((o) => ({
        id: o.id,
        name: o.name,
        meshJSON: o.mesh.toJSON(),
        position: [o.position.x, o.position.y, o.position.z],
        rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
        scale: [o.scale.x, o.scale.y, o.scale.z],
        modifiers: o.modifiers.map((m) => ({ id: m.id, type: m.type, enabled: m.enabled, params: { ...m.params } })),
        material: { ...o.material },
        selected: o.selected,
      })),
    };
  }

  _restoreState(state) {
    this.scene.objects.forEach((o) => o.dispose());
    this.scene.objects = [];

    state.objects.forEach((os) => {
      const meshData = MeshData.fromJSON(os.meshJSON);
      const obj = new SceneObject(meshData, os.name);
      obj.id = os.id;
      obj.position.set(os.position[0], os.position[1], os.position[2]);
      obj.rotation.set(os.rotation[0], os.rotation[1], os.rotation[2]);
      obj.scale.set(os.scale[0], os.scale[1], os.scale[2]);
      obj.modifiers = os.modifiers.map((m) => ({ id: m.id, type: m.type, enabled: m.enabled, params: { ...m.params } }));
      obj.material = { ...os.material };
      obj.updateMaterial();
      obj.selected = os.selected;
      obj.syncObject3DFromTransform();
      obj.rebuildGeometry();
      this.scene.objects.push(obj);
    });

    this.scene.activeObjectId = state.activeObjectId;
    this.scene.mode = state.mode;
    this.scene.editSelectMode = state.editSelectMode || 'VERTEX';
    this.scene.emit('change');
    this.scene.emit('selectionChange');
    this.scene.emit('modeChange', this.scene.mode);
  }
}

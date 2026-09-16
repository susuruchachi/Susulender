// js/main.js
// The App class wires every module together. It owns the pieces that
// don't belong to any single concern (which tool is active, tracking the
// gizmo's target as selection changes, keyboard dispatch) while leaving
// the actual work to the modules imported below.

import { Scene } from './core/Scene.js';
import { SceneObject } from './core/SceneObject.js';
import { HistoryManager } from './core/HistoryManager.js';
import { Viewport } from './viewport/Viewport.js';
import { OrbitCameraControls } from './viewport/OrbitCameraControls.js';
import { TransformGizmo } from './viewport/TransformGizmo.js';
import { PickingManager } from './viewport/PickingManager.js';
import { InputRouter } from './viewport/InputRouter.js';
import { EditOverlay } from './viewport/EditOverlay.js';
import { ObjectMode } from './modes/ObjectMode.js';
import { EditMode } from './modes/EditMode.js';
import { PRIMITIVES } from './geometry/Primitives.js';
import { IOManager } from './io/IOManager.js';
import { UIManager } from './ui/UIManager.js';

class App {
  constructor(rootEl) {
    this.scene = new Scene();
    this.history = new HistoryManager(this.scene);
    this.lastMouseX = window.innerWidth / 2;
    this.lastMouseY = window.innerHeight / 2;

    // UIManager builds the DOM skeleton (including the viewport slot) and
    // the side panels first; the panels only touch app.scene at this
    // point, which already exists.
    this.ui = new UIManager(this, rootEl);

    this.viewport = new Viewport(this.ui.viewportContainer);
    this.cameraControls = new OrbitCameraControls(this.viewport.camera);
    this.gizmo = new TransformGizmo(this.viewport);
    this.picking = new PickingManager(this.viewport);
    this.editOverlay = new EditOverlay(this.viewport);
    this.objectModeInstance = new ObjectMode(this);
    this.editModeInstance = new EditMode(this);
    this.io = new IOManager(this);
    this.inputRouter = new InputRouter(this.viewport, this.gizmo, this.cameraControls, () =>
      this.scene.mode === 'OBJECT' ? this.objectModeInstance : this.editModeInstance
    );
    this.ui.attachRuntimeHooks();

    this.viewport.onBeforeRender(() => {
      this.editOverlay.update(this.scene.mode === 'EDIT' ? this.scene.activeObject : null);
    });

    this._wireGlobalInput();
    this.addPrimitive('CUBE'); // a default object so there's something to see and try tools on
  }

  _wireGlobalInput() {
    document.addEventListener('pointermove', (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('keydown', (e) => {
      if (this._isTypingInField(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.redo();
        return;
      }

      if (this.scene.mode === 'OBJECT') this.objectModeInstance.handleKeyDown(e);
      else this.editModeInstance.handleKeyDown(e);
    });
  }

  _isTypingInField(target) {
    return target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
  }

  // ------------------------------------------------------------- hooks
  // Called by ObjectMode/EditMode/IOManager/panels after they mutate
  // something, so the gizmo target and UI panels stay in sync without
  // every caller needing to know all the places that might need updating.
  _refreshGizmoTarget() {
    if (this.scene.mode === 'OBJECT') {
      this.gizmo.setTarget(this.scene.getSelectedObjects().length ? this.objectModeInstance : null);
    } else {
      const mesh = this.scene.activeObject ? this.scene.activeObject.mesh : null;
      this.gizmo.setTarget(mesh && mesh.getSelectedVertIndices().length ? this.editModeInstance : null);
    }
  }

  onSceneChanged() {
    this.viewport.syncObjects(this.scene);
    this._refreshGizmoTarget();
    this.ui.refreshAll();
  }

  onSelectionChanged() {
    this._refreshGizmoTarget();
    this.ui.refreshSelection();
  }

  onEditSelectionChanged() {
    this._refreshGizmoTarget();
    this.ui.refreshSelection();
  }

  onTransformChanged() {
    this.ui.refreshTransformOnly();
  }

  setMode(mode) {
    if (mode === this.scene.mode) return;
    if (mode === 'EDIT' && !this.scene.activeObject) return;
    this.scene.setMode(mode);
    if (mode === 'EDIT') {
      const mesh = this.scene.activeObject.mesh;
      mesh.selectMode = this.scene.editSelectMode;
      mesh.syncSelectionFromMode();
    }
    this._refreshGizmoTarget();
    this.ui.refreshMode();
  }

  addPrimitive(key) {
    const def = PRIMITIVES[key];
    if (!def) return;
    this.history.snapshot('Add ' + def.label);
    const meshData = def.build();
    meshData.selectAll(); // matches Blender's default: a fresh object is fully selected on first Tab into Edit Mode
    const obj = new SceneObject(meshData, def.label);
    this.scene.addObject(obj);
    this.onSceneChanged();
    this.objectModeInstance.frameSelection();
  }

  undo() {
    this.history.undo();
    this._afterHistoryRestore();
  }

  redo() {
    this.history.redo();
    this._afterHistoryRestore();
  }

  _afterHistoryRestore() {
    this.viewport.syncObjects(this.scene);
    this._refreshGizmoTarget();
    this.ui.refreshAll();
  }

  notify(message, level = 'info') {
    this.ui.showNotification(message, level);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  window.blendStudioApp = new App(root); // exposed for debugging from the browser console
});

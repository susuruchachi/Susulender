// js/core/Scene.js
// Holds every SceneObject, which one(s) are selected, which is the
// "active" one (whose properties show in the side panel), and the current
// mode (Object / Edit). A tiny pub/sub lets UI panels react to changes
// without polling.

export class Scene {
  constructor() {
    this.objects = [];
    this.activeObjectId = null;
    this.mode = 'OBJECT';
    this.editSelectMode = 'VERTEX';
    this._listeners = new Map();
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event).delete(cb);
  }

  emit(event, payload) {
    (this._listeners.get(event) || []).forEach((cb) => cb(payload));
  }

  addObject(obj) {
    this.objects.push(obj);
    this.setActiveObject(obj.id);
    this.emit('change');
    return obj;
  }

  removeObject(id) {
    const obj = this.getObject(id);
    if (!obj) return;
    obj.dispose();
    this.objects = this.objects.filter((o) => o.id !== id);
    if (this.activeObjectId === id) {
      this.activeObjectId = this.objects.length ? this.objects[this.objects.length - 1].id : null;
    }
    this.emit('change');
    this.emit('selectionChange');
  }

  getObject(id) {
    return this.objects.find((o) => o.id === id);
  }

  get activeObject() {
    return this.getObject(this.activeObjectId) || null;
  }

  getSelectedObjects() {
    return this.objects.filter((o) => o.selected);
  }

  setActiveObject(id) {
    this.objects.forEach((o) => (o.selected = o.id === id));
    this.activeObjectId = id;
    this.emit('selectionChange');
  }

  toggleSelectObject(id, additive) {
    const obj = this.getObject(id);
    if (!obj) return;
    if (!additive) {
      this.objects.forEach((o) => (o.selected = o.id === id));
      this.activeObjectId = id;
    } else {
      obj.selected = !obj.selected;
      if (obj.selected) this.activeObjectId = id;
      else if (this.activeObjectId === id) {
        const stillSelected = this.getSelectedObjects();
        this.activeObjectId = stillSelected.length ? stillSelected[stillSelected.length - 1].id : null;
      }
    }
    this.emit('selectionChange');
  }

  clearObjectSelection() {
    this.objects.forEach((o) => (o.selected = false));
    this.activeObjectId = null;
    this.emit('selectionChange');
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit('modeChange', mode);
  }

  setEditSelectMode(mode) {
    this.editSelectMode = mode;
    if (this.activeObject) this.activeObject.mesh.selectMode = mode;
    this.emit('editSelectModeChange', mode);
  }
}

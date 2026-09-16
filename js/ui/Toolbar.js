// js/ui/Toolbar.js
// Shows a different button set for Object Mode vs Edit Mode. These
// buttons exist mainly so touch/tablet users (no keyboard) can reach every
// operator that would otherwise need a shortcut key like G/R/S/E/I/M.

export class Toolbar {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    if (this.app.scene.mode === 'OBJECT') this._renderObjectTools();
    else this._renderEditTools();
  }

  _button(label, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'tool-button';
    btn.textContent = label;
    btn.title = title;
    btn.onclick = onClick;
    this.container.appendChild(btn);
    return btn;
  }

  _sep() {
    const hr = document.createElement('div');
    hr.className = 'tool-separator';
    this.container.appendChild(hr);
  }

  _renderObjectTools() {
    this._button('\u2795', 'Add Cube (see Add menu for more)', () => this.app.addPrimitive('CUBE'));
    this._sep();
    this._button('\u2921\ufe0e', 'Move (G)', () => this.app.objectModeInstance.beginModal('MOVE'));
    this._button('\u21bb', 'Rotate (R)', () => this.app.objectModeInstance.beginModal('ROTATE'));
    this._button('\u26f6', 'Scale (S)', () => this.app.objectModeInstance.beginModal('SCALE'));
    this._sep();
    this._button('\u29c9', 'Duplicate (Shift+D)', () => this.app.objectModeInstance.duplicateSelected());
    this._button('\u2716', 'Delete (X)', () => this.app.objectModeInstance.deleteSelected());
  }

  _renderEditTools() {
    const activeMesh = this.app.scene.activeObject ? this.app.scene.activeObject.mesh : null;
    const curMode = activeMesh ? activeMesh.selectMode : 'VERTEX';

    [
      ['VERTEX', 'Vert', '1'],
      ['EDGE', 'Edge', '2'],
      ['FACE', 'Face', '3'],
    ].forEach(([m, label, key]) => {
      const btn = this._button(label, m.charAt(0) + m.slice(1).toLowerCase() + ' select (' + key + ')', () => this.app.editModeInstance.setSelectMode(m));
      if (m === curMode) btn.classList.add('active');
    });
    this._sep();
    this._button('\u2921\ufe0e', 'Move (G)', () => this.app.editModeInstance.beginModal('MOVE'));
    this._button('\u21bb', 'Rotate (R)', () => this.app.editModeInstance.beginModal('ROTATE'));
    this._button('\u26f6', 'Scale (S)', () => this.app.editModeInstance.beginModal('SCALE'));
    this._sep();
    this._button('Extrude', 'Extrude Region (E)', () => this.app.editModeInstance.extrude());
    this._button('Inset', 'Inset Faces (I)', () => this.app.editModeInstance.inset());
    this._button('Subdiv', 'Subdivide selected edges', () => this.app.editModeInstance.subdivide());
    this._button('Merge', 'Merge at Center (M)', () => this.app.editModeInstance.mergeAtCenter());
    this._sep();
    this._button('\u29c9', 'Duplicate (Shift+D)', () => this.app.editModeInstance.duplicateSelected());
    this._button('\u2716', 'Delete (X)', () => this.app.editModeInstance.deleteSelected());
    this._sep();
    this._button('Flip N', 'Flip Normals (N)', () => this.app.editModeInstance.flipNormals());
  }
}

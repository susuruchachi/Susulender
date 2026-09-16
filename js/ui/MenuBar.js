// js/ui/MenuBar.js
// The top bar: File (import/export), Add (mesh primitives), Edit
// (undo/redo), and the Object/Edit mode switch.

import { PRIMITIVES } from '../geometry/Primitives.js';

export class MenuBar {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.modeButtons = [];
    this.render();
    document.addEventListener('click', () => this._closeAllMenus());
  }

  render() {
    this.container.innerHTML = '';
    const logo = document.createElement('div');
    logo.className = 'menubar-logo';
    logo.textContent = 'Blend Studio';
    this.container.appendChild(logo);

    this.container.appendChild(this._buildMenu('File', this._fileMenuItems()));
    this.container.appendChild(this._buildMenu('Add', this._addMenuItems()));
    this.container.appendChild(this._buildMenu('Edit', this._editMenuItems()));

    const spacer = document.createElement('div');
    spacer.className = 'menubar-spacer';
    this.container.appendChild(spacer);

    this.container.appendChild(this._buildModeSwitch());
  }

  _closeAllMenus() {
    this.container.querySelectorAll('.menu-list.open').forEach((l) => l.classList.remove('open'));
  }

  _buildMenu(label, items) {
    const wrap = document.createElement('div');
    wrap.className = 'menu-dropdown';
    const btn = document.createElement('button');
    btn.className = 'menu-button';
    btn.textContent = label;
    const list = document.createElement('div');
    list.className = 'menu-list';
    items.forEach((item) => {
      if (item.separator) {
        const hr = document.createElement('div');
        hr.className = 'menu-separator';
        list.appendChild(hr);
        return;
      }
      const li = document.createElement('button');
      li.className = 'menu-item';
      li.textContent = item.label;
      li.onclick = (e) => {
        e.stopPropagation();
        item.action();
        this._closeAllMenus();
      };
      list.appendChild(li);
    });
    btn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = list.classList.contains('open');
      this._closeAllMenus();
      if (!isOpen) list.classList.add('open');
    };
    wrap.appendChild(btn);
    wrap.appendChild(list);
    return wrap;
  }

  _fileMenuItems() {
    return [
      { label: 'Import OBJ...', action: () => this.app.io.promptImport('obj') },
      { label: 'Import STL...', action: () => this.app.io.promptImport('stl') },
      { label: 'Import glTF / GLB...', action: () => this.app.io.promptImport('gltf') },
      { label: 'Import .blend (experimental)...', action: () => this.app.io.promptImport('blend') },
      { separator: true },
      { label: 'Export Selected \u2192 OBJ', action: () => this.app.io.exportSelected('obj') },
      { label: 'Export Selected \u2192 STL', action: () => this.app.io.exportSelected('stl') },
      { label: 'Export Selected \u2192 glTF (.glb)', action: () => this.app.io.exportSelected('gltf') },
      { separator: true },
      { label: 'Export All \u2192 OBJ', action: () => this.app.io.exportAll('obj') },
      { label: 'Export All \u2192 STL', action: () => this.app.io.exportAll('stl') },
      { label: 'Export All \u2192 glTF (.glb)', action: () => this.app.io.exportAll('gltf') },
    ];
  }

  _addMenuItems() {
    return Object.entries(PRIMITIVES).map(([key, def]) => ({
      label: def.label,
      action: () => this.app.addPrimitive(key),
    }));
  }

  _editMenuItems() {
    return [
      { label: 'Undo', action: () => this.app.undo() },
      { label: 'Redo', action: () => this.app.redo() },
    ];
  }

  _buildModeSwitch() {
    const wrap = document.createElement('div');
    wrap.className = 'mode-switch';
    [
      ['OBJECT', 'Object Mode'],
      ['EDIT', 'Edit Mode'],
    ].forEach(([mode, label]) => {
      const btn = document.createElement('button');
      btn.className = 'mode-button';
      btn.textContent = label;
      btn.dataset.mode = mode;
      btn.onclick = () => this.app.setMode(mode);
      this.modeButtons.push(btn);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  refresh() {
    this.modeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === this.app.scene.mode));
  }
}

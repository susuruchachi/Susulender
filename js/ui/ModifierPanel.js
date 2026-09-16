// js/ui/ModifierPanel.js
// The active object's modifier stack: add, enable/disable, reorder,
// remove, and edit each modifier's parameters.

import { MODIFIER_REGISTRY } from '../modifiers/ModifierStack.js';

export class ModifierPanel {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'Modifiers';
    this.container.appendChild(header);

    const obj = this.app.scene.activeObject;
    if (!obj) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No active object.';
      this.container.appendChild(empty);
      return;
    }

    const addRow = document.createElement('div');
    addRow.className = 'modifier-add-row';
    const select = document.createElement('select');
    select.className = 'modifier-add-select';
    Object.entries(MODIFIER_REGISTRY).forEach(([key, def]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      select.appendChild(opt);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'tool-button';
    addBtn.textContent = 'Add Modifier';
    addBtn.onclick = () => {
      this.app.history.snapshot('Add Modifier');
      obj.addModifier(select.value);
      this.app.onSceneChanged();
    };
    addRow.appendChild(select);
    addRow.appendChild(addBtn);
    this.container.appendChild(addRow);

    obj.modifiers.forEach((mod) => this.container.appendChild(this._modifierCard(obj, mod)));

    if (!obj.modifiers.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No modifiers on this object.';
      this.container.appendChild(empty);
    }
  }

  _modifierCard(obj, mod) {
    const def = MODIFIER_REGISTRY[mod.type];
    const card = document.createElement('div');
    card.className = 'modifier-card';

    const headerRow = document.createElement('div');
    headerRow.className = 'modifier-card-header';

    const enable = document.createElement('input');
    enable.type = 'checkbox';
    enable.checked = mod.enabled;
    enable.title = 'Enable / disable';
    enable.onchange = () => {
      this.app.history.snapshot('Toggle Modifier');
      mod.enabled = enable.checked;
      obj.rebuildGeometry();
      this.app.onTransformChanged();
    };
    headerRow.appendChild(enable);

    const title = document.createElement('span');
    title.className = 'modifier-title';
    title.textContent = def ? def.label : mod.type;
    headerRow.appendChild(title);

    const upBtn = document.createElement('button');
    upBtn.className = 'modifier-icon-btn';
    upBtn.textContent = '\u2191';
    upBtn.title = 'Move up the stack';
    upBtn.onclick = () => {
      this.app.history.snapshot('Reorder Modifier');
      obj.moveModifier(mod.id, -1);
      this.app.onSceneChanged();
    };
    const downBtn = document.createElement('button');
    downBtn.className = 'modifier-icon-btn';
    downBtn.textContent = '\u2193';
    downBtn.title = 'Move down the stack';
    downBtn.onclick = () => {
      this.app.history.snapshot('Reorder Modifier');
      obj.moveModifier(mod.id, 1);
      this.app.onSceneChanged();
    };
    const removeBtn = document.createElement('button');
    removeBtn.className = 'modifier-icon-btn';
    removeBtn.textContent = '\u2716';
    removeBtn.title = 'Remove modifier';
    removeBtn.onclick = () => {
      this.app.history.snapshot('Remove Modifier');
      obj.removeModifier(mod.id);
      this.app.onSceneChanged();
    };
    headerRow.appendChild(upBtn);
    headerRow.appendChild(downBtn);
    headerRow.appendChild(removeBtn);
    card.appendChild(headerRow);

    const paramsRow = document.createElement('div');
    paramsRow.className = 'modifier-params';
    Object.keys(mod.params).forEach((key) => {
      const value = mod.params[key];
      const row = document.createElement('div');
      row.className = 'modifier-param-row';
      const label = document.createElement('label');
      label.textContent = key;
      row.appendChild(label);

      if (key === 'axis') {
        const sel = document.createElement('select');
        ['X', 'Y', 'Z'].forEach((ax) => {
          const opt = document.createElement('option');
          opt.value = ax;
          opt.textContent = ax;
          if (ax === value) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.onchange = () => {
          this.app.history.snapshot('Modifier Param');
          mod.params[key] = sel.value;
          obj.rebuildGeometry();
          this.app.onTransformChanged();
        };
        row.appendChild(sel);
      } else {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = Number.isInteger(value) ? '1' : '0.01';
        input.value = value;
        input.className = 'prop-input prop-input-num';
        input.onchange = () => {
          this.app.history.snapshot('Modifier Param');
          mod.params[key] = Number(input.value);
          obj.rebuildGeometry();
          this.app.onTransformChanged();
        };
        row.appendChild(input);
      }
      paramsRow.appendChild(row);
    });
    card.appendChild(paramsRow);
    return card;
  }
}

// js/ui/PropertiesPanel.js
// Name, transform (position/rotation/scale) and material for the active
// object. Editing any field here applies immediately.

import * as THREE from 'three';

export class PropertiesPanel {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'Properties';
    this.container.appendChild(header);

    const obj = this.app.scene.activeObject;
    if (!obj) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'No active object.';
      this.container.appendChild(empty);
      return;
    }

    const nameRow = this._row('Name');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = obj.name;
    nameInput.className = 'prop-input prop-input-text';
    nameInput.onchange = () => {
      obj.name = nameInput.value || obj.name;
      this.app.onSceneChanged();
    };
    nameRow.appendChild(nameInput);
    this.container.appendChild(nameRow);

    this.container.appendChild(
      this._vectorRow('Position', obj.position, (v) => {
        obj.position.set(v.x, v.y, v.z);
        obj.syncObject3DFromTransform();
        this.app.onTransformChanged();
      })
    );

    const rotDeg = {
      x: THREE.MathUtils.radToDeg(obj.rotation.x),
      y: THREE.MathUtils.radToDeg(obj.rotation.y),
      z: THREE.MathUtils.radToDeg(obj.rotation.z),
    };
    this.container.appendChild(
      this._vectorRow('Rotation \u00b0', rotDeg, (v) => {
        obj.rotation.set(THREE.MathUtils.degToRad(v.x), THREE.MathUtils.degToRad(v.y), THREE.MathUtils.degToRad(v.z));
        obj.syncObject3DFromTransform();
        this.app.onTransformChanged();
      })
    );

    this.container.appendChild(
      this._vectorRow('Scale', obj.scale, (v) => {
        obj.scale.set(v.x, v.y, v.z);
        obj.syncObject3DFromTransform();
        this.app.onTransformChanged();
      })
    );

    const colorRow = this._row('Color');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = obj.material.color;
    colorInput.className = 'prop-input-color';
    colorInput.oninput = () => {
      obj.material.color = colorInput.value;
      obj.updateMaterial();
    };
    colorRow.appendChild(colorInput);
    this.container.appendChild(colorRow);

    this.container.appendChild(
      this._sliderRow('Roughness', obj.material.roughness, 0, 1, (v) => {
        obj.material.roughness = v;
        obj.updateMaterial();
      })
    );
    this.container.appendChild(
      this._sliderRow('Metalness', obj.material.metalness, 0, 1, (v) => {
        obj.material.metalness = v;
        obj.updateMaterial();
      })
    );
  }

  _row(label) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    row.appendChild(l);
    return row;
  }

  _vectorRow(label, vecLike, onChange) {
    const row = this._row(label);
    const wrap = document.createElement('div');
    wrap.className = 'prop-vector';
    ['x', 'y', 'z'].forEach((axis) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.value = Number(vecLike[axis]).toFixed(3);
      input.className = 'prop-input prop-input-num';
      input.onchange = () => {
        onChange({
          x: Number(wrap.children[0].value),
          y: Number(wrap.children[1].value),
          z: Number(wrap.children[2].value),
        });
      };
      wrap.appendChild(input);
    });
    row.appendChild(wrap);
    return row;
  }

  _sliderRow(label, value, min, max, onChange) {
    const row = this._row(label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = '0.01';
    input.value = String(value);
    input.className = 'prop-slider';
    input.oninput = () => onChange(Number(input.value));
    row.appendChild(input);
    return row;
  }
}

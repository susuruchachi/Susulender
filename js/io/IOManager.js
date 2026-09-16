// js/io/IOManager.js
// Wires the browser's file-picker and download APIs to the format-specific
// import/export functions. This is the only place that touches
// <input type="file">, Blob, and object URLs.

import { exportOBJ, importOBJ } from './OBJIO.js';
import { exportSTLBinary, importSTL } from './STLIO.js';
import { exportGLTFBinary, importGLTF } from './GLTFIO.js';
import { importBlend } from './BlendIO.js';
import { SceneObject } from '../core/SceneObject.js';

const ACCEPT = { obj: '.obj', stl: '.stl', gltf: '.gltf,.glb', blend: '.blend' };

export class IOManager {
  constructor(app) {
    this.app = app;
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => this._handleFileSelected());
    this._pendingFormat = null;
  }

  promptImport(format) {
    this._pendingFormat = format;
    this.fileInput.accept = ACCEPT[format] || '';
    this.fileInput.value = '';
    this.fileInput.click();
  }

  async _handleFileSelected() {
    const file = this.fileInput.files[0];
    if (!file) return;
    const format = this._pendingFormat;
    const baseName = file.name.replace(/\.[^.]+$/, '');

    try {
      let results = [];
      if (format === 'obj') {
        results = importOBJ(await file.text(), baseName);
      } else if (format === 'stl') {
        results = importSTL(await file.arrayBuffer(), baseName);
      } else if (format === 'gltf') {
        results = await importGLTF(await file.arrayBuffer(), baseName);
      } else if (format === 'blend') {
        const { info, results: blendResults, warnings } = importBlend(await file.arrayBuffer());
        results = blendResults;
        this.app.notify(this._describeBlendImport(info, blendResults, warnings), warnings.length && !blendResults.length ? 'warn' : 'info');
      }

      if (!results.length) {
        if (format !== 'blend') this.app.notify('No mesh data found in that file.', 'warn');
        return;
      }

      this.app.history.snapshot('Import ' + format.toUpperCase());
      let last = null;
      results.forEach((r) => {
        last = new SceneObject(r.mesh, r.name);
        this.app.scene.addObject(last);
      });
      this.app.onSceneChanged();
      if (last) this.app.objectModeInstance.frameSelection();
      if (format !== 'blend') this.app.notify(`Imported ${results.length} object(s) from ${file.name}.`, 'info');
    } catch (err) {
      this.app.notify('Import failed: ' + err.message, 'error');
    }
  }

  _describeBlendImport(info, results, warnings) {
    const parts = [
      `.blend v${info.version} (${info.pointerSize * 8}-bit, ${info.endianness}-endian), ${info.totalBlocks} blocks, ${info.structCount} struct types.`,
    ];
    if (results.length) parts.push(`Reconstructed ${results.length} mesh(es).`);
    if (warnings.length) parts.push(...warnings);
    if (!results.length) parts.push('No geometry could be reconstructed \u2014 try OBJ or glTF export from Blender instead.');
    return parts.join(' ');
  }

  exportSelected(format) {
    const sel = this.app.scene.getSelectedObjects();
    if (!sel.length) return this.app.notify('Select an object to export first.', 'warn');
    this._doExport(format, sel);
  }

  exportAll(format) {
    if (!this.app.scene.objects.length) return this.app.notify('Nothing to export yet.', 'warn');
    this._doExport(format, this.app.scene.objects);
  }

  async _doExport(format, objects) {
    try {
      if (format === 'obj') {
        const { obj, mtl } = exportOBJ(objects);
        this._download(obj, 'scene.obj', 'text/plain');
        this._download(mtl, 'scene.mtl', 'text/plain');
      } else if (format === 'stl') {
        this._download(exportSTLBinary(objects), 'scene.stl', 'application/octet-stream');
      } else if (format === 'gltf') {
        this._download(await exportGLTFBinary(objects), 'scene.glb', 'model/gltf-binary');
      }
      this.app.notify('Exported ' + objects.length + ' object(s) as ' + format.toUpperCase() + '.', 'info');
    } catch (err) {
      this.app.notify('Export failed: ' + err.message, 'error');
    }
  }

  _download(data, filename, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

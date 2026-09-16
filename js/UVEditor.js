// js/uv/UVEditor.js
// A 2D canvas panel showing the UV layout of whichever faces are selected
// in Edit Mode (all faces if none are selected), with a checker background
// for reference, direct dragging of individual UV points, pan/zoom, and
// buttons (wired up in ui/UIManager.js) to run the projection unwraps in
// UnwrapOps.js. Point-by-point dragging rather than full island transforms
// is a deliberate scope simplification - see the README.

import { UNWRAP_METHODS } from './UnwrapOps.js';

export class UVEditor {
  constructor(app, containerEl) {
    this.app = app;
    this.container = containerEl;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'uv-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.viewScale = 1;
    this.viewOffset = { x: 0, y: 0 };
    this._dragPoint = null;
    this._panStart = null;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this._onDown);
    this.canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });

    this.resize();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(rect.width, 10) * dpr;
    this.canvas.height = Math.max(rect.height, 10) * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.render();
  }

  _squareSize() {
    return Math.min(this.canvas.width, this.canvas.height) * 0.82 * this.viewScale;
  }

  _uvToScreen(u, v) {
    const size = this._squareSize();
    const ox = this.canvas.width * 0.5 + this.viewOffset.x;
    const oy = this.canvas.height * 0.5 + this.viewOffset.y;
    return { x: ox + (u - 0.5) * size, y: oy - (v - 0.5) * size };
  }

  _screenToUV(x, y) {
    const size = this._squareSize();
    const ox = this.canvas.width * 0.5 + this.viewOffset.x;
    const oy = this.canvas.height * 0.5 + this.viewOffset.y;
    return { u: (x - ox) / size + 0.5, v: -(y - oy) / size + 0.5 };
  }

  _activeFaces() {
    const obj = this.app.scene.activeObject;
    if (!obj || this.app.scene.mode !== 'EDIT') return { obj: null, mesh: null, faceIdx: [] };
    const mesh = obj.mesh;
    const sel = mesh.getSelectedFaceIndices();
    const faceIdx = sel.length ? sel : mesh.faces.map((_, i) => i);
    return { obj, mesh, faceIdx };
  }

  render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#1c1c1f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const topLeft = this._uvToScreen(0, 1);
    const bottomRight = this._uvToScreen(1, 0);
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;
    const n = 8;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#3a3a41' : '#2a2a2f';
        ctx.fillRect(topLeft.x + (w / n) * x, topLeft.y + (h / n) * y, w / n + 1, h / n + 1);
      }
    }
    ctx.strokeStyle = '#6d9eff';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(topLeft.x, topLeft.y, w, h);

    const { mesh, faceIdx } = this._activeFaces();
    if (!mesh) {
      ctx.fillStyle = '#9a9aa2';
      ctx.font = 13 * dpr + 'px sans-serif';
      ctx.fillText('Enter Edit Mode and select faces to view their UVs', 16 * dpr, 24 * dpr);
      return;
    }

    ctx.strokeStyle = '#e9e9ee';
    ctx.lineWidth = 1 * dpr;
    faceIdx.forEach((fi) => {
      const f = mesh.faces[fi];
      ctx.beginPath();
      f.uvs.forEach(([u, v], i) => {
        const s = this._uvToScreen(u, v);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
    });

    ctx.fillStyle = '#ffb454';
    faceIdx.forEach((fi) => {
      mesh.faces[fi].uvs.forEach(([u, v]) => {
        const s = this._uvToScreen(u, v);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    if (!faceIdx.length || mesh.faces.length === 0) {
      ctx.fillStyle = '#9a9aa2';
      ctx.font = 13 * dpr + 'px sans-serif';
      ctx.fillText('No faces to show', 16 * dpr, 24 * dpr);
    }
  }

  _canvasXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  _onDown = (e) => {
    const { x, y } = this._canvasXY(e);
    const { mesh, faceIdx } = this._activeFaces();
    const dpr = window.devicePixelRatio || 1;
    if (mesh) {
      let best = null;
      let bestDist = 12 * dpr;
      faceIdx.forEach((fi) => {
        mesh.faces[fi].uvs.forEach((uv, ci) => {
          const s = this._uvToScreen(uv[0], uv[1]);
          const d = Math.hypot(s.x - x, s.y - y);
          if (d < bestDist) {
            bestDist = d;
            best = { fi, ci };
          }
        });
      });
      if (best) {
        this._dragPoint = best;
        this.canvas.setPointerCapture(e.pointerId);
        this.app.history.snapshot('Edit UV');
        return;
      }
    }
    this._panStart = { x: e.clientX, y: e.clientY, ox: this.viewOffset.x, oy: this.viewOffset.y };
    this.canvas.setPointerCapture(e.pointerId);
  };

  _onMove = (e) => {
    const { x, y } = this._canvasXY(e);
    if (this._dragPoint) {
      const { obj, mesh } = this._activeFaces();
      if (mesh) {
        const uv = this._screenToUV(x, y);
        mesh.faces[this._dragPoint.fi].uvs[this._dragPoint.ci] = [uv.u, uv.v];
        obj.rebuildGeometry();
        this.render();
      }
    } else if (this._panStart) {
      const dpr = window.devicePixelRatio || 1;
      this.viewOffset.x = this._panStart.ox + (e.clientX - this._panStart.x) * dpr;
      this.viewOffset.y = this._panStart.oy + (e.clientY - this._panStart.y) * dpr;
      this.render();
    }
  };

  _onUp = () => {
    this._dragPoint = null;
    this._panStart = null;
  };

  _onWheel = (e) => {
    e.preventDefault();
    this.viewScale = Math.max(0.2, Math.min(6, this.viewScale * (e.deltaY > 0 ? 0.9 : 1.1)));
    this.render();
  };

  applyUnwrap(methodKey) {
    const { obj, mesh, faceIdx } = this._activeFaces();
    if (!mesh || !faceIdx.length) return;
    const method = UNWRAP_METHODS[methodKey];
    if (!method) return;
    this.app.history.snapshot('Unwrap: ' + method.label);
    method.run(mesh, faceIdx);
    obj.rebuildGeometry();
    this.render();
  }
}

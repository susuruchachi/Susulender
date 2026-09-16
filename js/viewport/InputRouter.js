// js/viewport/InputRouter.js
//
// A single place that owns every pointer/wheel event on the canvas and
// decides who gets it, in priority order:
//   1. an in-progress keyboard-driven gizmo modal (G/R/S) - a plain click
//      or right-click/Escape confirms or cancels it
//   2. grabbing a gizmo handle directly (mouse drag or touch drag)
//   3. two touch points down - always pinch-zoom + two-finger pan
//   4. mouse navigation buttons (middle-drag orbit, shift+middle pan)
//   5. the active tool (Object/Edit mode's own pointer handling - click
//      select vs. drag-to-box-select is decided *inside* the tool, since
//      it has the context to know what a tap vs. a drag should do)
//   6. touch fallback: if nothing above claimed it, a single-finger drag
//      orbits the camera, so navigation is always available on a tablet
//      even with no keyboard and no dedicated two-finger gesture.

export class InputRouter {
  constructor(viewport, gizmo, cameraControls, getActiveTool) {
    this.viewport = viewport;
    this.gizmo = gizmo;
    this.cameraControls = cameraControls;
    this.getActiveTool = getActiveTool;
    this.dom = viewport.renderer.domElement;

    this._pointers = new Map();
    this._activeDragKind = null;
    this._downInfo = null;
    this._pinchStartDist = null;
    this._panMidpoint = null;

    this.dom.addEventListener('pointerdown', this._onDown);
    this.dom.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: false });
    this.dom.addEventListener('click', this._onClick);
    this.dom.addEventListener('contextmenu', this._onContextMenu);
  }

  _onDown = (e) => {
    try {
      this.dom.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore - some browsers reject capture for certain pointer types */
    }
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
    this._downInfo = { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button, fallbackDrag: null };

    if (this.gizmo.isModalActive() && this.gizmo.confirmOnClick) return; // waiting for the 'click' to confirm

    if (this._pointers.size >= 2) {
      this._activeDragKind = 'pinchpan';
      this._pinchStartDist = null;
      this._panMidpoint = null;
      return;
    }

    const hit = this.gizmo.hitTest(e.clientX, e.clientY);
    if (hit !== undefined) {
      this._activeDragKind = 'gizmo-handle';
      this.gizmo.beginDragFromHandle(hit, e.clientX, e.clientY);
      return;
    }

    if (e.pointerType !== 'touch') {
      if (e.button === 1 && e.shiftKey) {
        this._activeDragKind = 'pan';
        return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this._activeDragKind = 'orbit';
        return;
      }
    }

    const tool = this.getActiveTool();
    const claimed = tool && tool.onPointerDown && tool.onPointerDown(e);
    if (claimed) {
      this._activeDragKind = 'tool';
      return;
    }

    this._activeDragKind = null;
    this._downInfo.fallbackDrag = e.pointerType === 'touch' ? 'orbit' : null;
  };

  _onMove = (e) => {
    if (this.gizmo.isModalActive() && this.gizmo.confirmOnClick) {
      this.gizmo.updateDrag(e.clientX, e.clientY);
      return;
    }
    if (!this._pointers.has(e.pointerId)) return;
    const prev = this._pointers.get(e.pointerId);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this._pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });

    if (this._pointers.size >= 2) {
      this._handlePinchPanTouch();
      return;
    }
    if (this._activeDragKind === 'gizmo-handle') {
      this.gizmo.updateDrag(e.clientX, e.clientY);
      return;
    }
    if (this._activeDragKind === 'tool') {
      const tool = this.getActiveTool();
      tool && tool.onPointerMove && tool.onPointerMove(e, dx, dy);
      return;
    }
    if (this._activeDragKind === 'orbit') {
      this.cameraControls.orbit(dx, dy);
      return;
    }
    if (this._activeDragKind === 'pan') {
      this.cameraControls.pan(dx, dy);
      return;
    }
    if (this._activeDragKind === null && this._downInfo && this._downInfo.fallbackDrag) {
      const totalDx = e.clientX - this._downInfo.x;
      const totalDy = e.clientY - this._downInfo.y;
      if (Math.hypot(totalDx, totalDy) > 6) {
        this._activeDragKind = this._downInfo.fallbackDrag;
        this.cameraControls.orbit(dx, dy);
      }
    }
  };

  _onUp = (e) => {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) {
      this._pinchStartDist = null;
      this._panMidpoint = null;
    }

    if (this._activeDragKind === 'gizmo-handle' && this.gizmo.confirmOnPointerUp) {
      this.gizmo.confirm();
    } else if (this._activeDragKind === 'tool') {
      const tool = this.getActiveTool();
      tool && tool.onPointerUp && tool.onPointerUp(e);
    }

    if (this._pointers.size === 0) {
      this._activeDragKind = null;
      this._downInfo = null;
    }
  };

  _onClick = (e) => {
    if (this.gizmo.isModalActive() && this.gizmo.confirmOnClick) {
      this.gizmo.updateDrag(e.clientX, e.clientY);
      this.gizmo.confirm();
      e.stopPropagation();
    }
  };

  _onContextMenu = (e) => {
    e.preventDefault();
    if (this.gizmo.isModalActive() && this.gizmo.confirmOnClick) this.gizmo.cancel();
  };

  _onWheel = (e) => {
    e.preventDefault();
    this.cameraControls.dolly(e.deltaY > 0 ? 1.08 : 0.92);
  };

  _handlePinchPanTouch() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    if (this._pinchStartDist != null) {
      const scale = this._pinchStartDist / Math.max(dist, 1e-6);
      this.cameraControls.dolly(scale);
    }
    if (this._panMidpoint) {
      this.cameraControls.pan(mid.x - this._panMidpoint.x, mid.y - this._panMidpoint.y);
    }
    this._pinchStartDist = dist;
    this._panMidpoint = mid;
  }
}

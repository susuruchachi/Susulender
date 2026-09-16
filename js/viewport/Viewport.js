// js/viewport/Viewport.js
// Owns the THREE.js side of the 3D view: renderer, camera, lights, grid,
// and the render loop. Also keeps the THREE scene graph in sync with the
// app's logical Scene (js/core/Scene.js) via syncObjects().

import * as THREE from 'three';

export class Viewport {
  constructor(container) {
    this.container = container;
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x2b2b2f);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 1000);
    this.camera.position.set(4.5, 3.2, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.touchAction = 'none'; // we handle all touch gestures ourselves
    container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x30302f, 1.1);
    this.threeScene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 4);
    this.threeScene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-4, -2, -5);
    this.threeScene.add(fill);

    this.grid = new THREE.GridHelper(20, 20, 0x5a5a60, 0x3c3c42);
    this.threeScene.add(this.grid);
    this.axes = new THREE.AxesHelper(1.15);
    this.threeScene.add(this.axes);

    this.objectRoot = new THREE.Group();
    this.objectRoot.name = 'objectRoot';
    this.threeScene.add(this.objectRoot);

    this.overlayRoot = new THREE.Group(); // gizmo + edit-mode overlays + selection outlines
    this.overlayRoot.name = 'overlayRoot';
    this.threeScene.add(this.overlayRoot);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.08;
    this.raycaster.params.Line.threshold = 0.05;

    this._renderCallbacks = [];

    this._resizeObserver = new ResizeObserver(() => this.handleResize());
    this._resizeObserver.observe(container);
    this.handleResize();

    this._animate();
  }

  onBeforeRender(cb) {
    this._renderCallbacks.push(cb);
  }

  handleResize() {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Adds/removes THREE objects so objectRoot exactly matches scene.objects.
  syncObjects(scene) {
    const existingIds = new Set(this.objectRoot.children.map((c) => c.userData.sceneObjectId));
    const wantedIds = new Set(scene.objects.map((o) => o.id));
    [...this.objectRoot.children].forEach((child) => {
      if (!wantedIds.has(child.userData.sceneObjectId)) this.objectRoot.remove(child);
    });
    scene.objects.forEach((o) => {
      if (!existingIds.has(o.id)) this.objectRoot.add(o.object3D);
      o.object3D.visible = o.visible;
    });
  }

  screenToNDC(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  raycastFromScreen(clientX, clientY, objects, recursive = true) {
    const ndc = this.screenToNDC(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  worldToScreen(worldPos) {
    const v = worldPos.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  _animate = () => {
    requestAnimationFrame(this._animate);
    this._renderCallbacks.forEach((cb) => cb());
    this.renderer.render(this.threeScene, this.camera);
  };
}

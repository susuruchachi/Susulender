// js/viewport/EditOverlay.js
// Draws the Edit Mode visualization: vertex dots, edge wireframe, and a
// translucent highlight over selected faces - always rebuilt from the
// active object's base mesh (the cage), colored by current selection.
// Kept separate from EditMode.js so restyling how edit mode *looks* never
// requires touching the selection/operator logic.

import * as THREE from 'three';

const COLOR_UNSELECTED = new THREE.Color(0x0d0d0d);
const COLOR_SELECTED = new THREE.Color(0xff8a1e);
const FACE_HIGHLIGHT_COLOR = 0xff8a1e;

export class EditOverlay {
  constructor(viewport) {
    this.viewport = viewport;

    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.group.renderOrder = 500;
    viewport.overlayRoot.add(this.group);

    this.faceGeo = new THREE.BufferGeometry();
    this.faceMat = new THREE.MeshBasicMaterial({
      color: FACE_HIGHLIGHT_COLOR,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.faceMesh = new THREE.Mesh(this.faceGeo, this.faceMat);
    this.faceMesh.renderOrder = 500;

    this.lineGeo = new THREE.BufferGeometry();
    this.lineMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true });
    this.lines = new THREE.LineSegments(this.lineGeo, this.lineMat);
    this.lines.renderOrder = 501;

    this.pointGeo = new THREE.BufferGeometry();
    this.pointMat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true });
    this.points = new THREE.Points(this.pointGeo, this.pointMat);
    this.points.renderOrder = 502;

    this.group.add(this.faceMesh, this.lines, this.points);
    this.group.visible = false;
  }

  update(sceneObject) {
    if (!sceneObject) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    sceneObject.object3D.updateMatrixWorld(true);
    this.group.matrix.copy(sceneObject.object3D.matrixWorld);
    this.group.matrixWorldNeedsUpdate = true;

    const mesh = sceneObject.mesh;

    const pointPos = new Array(mesh.verts.length * 3);
    const pointCol = new Array(mesh.verts.length * 3);
    mesh.verts.forEach((v, i) => {
      pointPos[i * 3] = v.co.x;
      pointPos[i * 3 + 1] = v.co.y;
      pointPos[i * 3 + 2] = v.co.z;
      const c = v.select ? COLOR_SELECTED : COLOR_UNSELECTED;
      pointCol[i * 3] = c.r;
      pointCol[i * 3 + 1] = c.g;
      pointCol[i * 3 + 2] = c.b;
    });
    this.pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(pointPos, 3));
    this.pointGeo.setAttribute('color', new THREE.Float32BufferAttribute(pointCol, 3));

    const linePos = [];
    const lineCol = [];
    mesh.edges.forEach((e) => {
      const a = mesh.verts[e.v[0]].co;
      const b = mesh.verts[e.v[1]].co;
      linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = e.select ? COLOR_SELECTED : COLOR_UNSELECTED;
      lineCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    this.lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    this.lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));

    const facePos = [];
    mesh.faces.forEach((f) => {
      if (!f.select) return;
      const n = f.verts.length;
      for (let i = 1; i < n - 1; i++) {
        [0, i, i + 1].forEach((corner) => {
          const co = mesh.verts[f.verts[corner]].co;
          facePos.push(co.x, co.y, co.z);
        });
      }
    });
    this.faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(facePos.length ? facePos : [0, 0, 0], 3));
    this.faceGeo.setDrawRange(0, facePos.length / 3);
  }

  dispose() {
    this.faceGeo.dispose();
    this.lineGeo.dispose();
    this.pointGeo.dispose();
    this.faceMat.dispose();
    this.lineMat.dispose();
    this.pointMat.dispose();
  }
}

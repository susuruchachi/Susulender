// js/viewport/PickingManager.js
// Object-mode picking raycasts the real rendered geometry. Edit-mode
// picking works against sceneObject.mesh (the base "cage", not the
// modifier-evaluated result) since that is what Edit Mode actually edits,
// and vertices/edges are screen-space markers rather than solid geometry.
// Box-select does not do occlusion culling (it behaves like X-ray select
// is always on) - that is a deliberate scope simplification.

import * as THREE from 'three';

export class PickingManager {
  constructor(viewport) {
    this.viewport = viewport;
  }

  pickObject(scene, clientX, clientY) {
    const meshes = scene.objects.filter((o) => o.visible).map((o) => o.threeMesh);
    const hits = this.viewport.raycastFromScreen(clientX, clientY, meshes, false);
    if (!hits.length) return null;
    return hits[0].object.userData.sceneObjectId;
  }

  pickVertex(sceneObject, clientX, clientY, maxPixelDist = 16) {
    sceneObject.object3D.updateMatrixWorld(true);
    const mesh = sceneObject.mesh;
    let best = -1;
    let bestDist = maxPixelDist;
    mesh.verts.forEach((v, i) => {
      const world = v.co.clone().applyMatrix4(sceneObject.object3D.matrixWorld);
      const screen = this.viewport.worldToScreen(world);
      const d = Math.hypot(screen.x - clientX, screen.y - clientY);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  pickEdge(sceneObject, clientX, clientY, maxPixelDist = 12) {
    sceneObject.object3D.updateMatrixWorld(true);
    const mesh = sceneObject.mesh;
    let best = -1;
    let bestDist = maxPixelDist;
    mesh.edges.forEach((e, i) => {
      const a = mesh.verts[e.v[0]].co.clone().applyMatrix4(sceneObject.object3D.matrixWorld);
      const b = mesh.verts[e.v[1]].co.clone().applyMatrix4(sceneObject.object3D.matrixWorld);
      const sa = this.viewport.worldToScreen(a);
      const sb = this.viewport.worldToScreen(b);
      const d = distancePointToSegment(clientX, clientY, sa, sb);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  pickFace(sceneObject, clientX, clientY) {
    sceneObject.object3D.updateMatrixWorld(true);
    const geo = sceneObject.mesh.toBufferGeometry();
    const tempMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    tempMesh.matrixAutoUpdate = false;
    tempMesh.matrixWorld.copy(sceneObject.object3D.matrixWorld);
    const hits = this.viewport.raycastFromScreen(clientX, clientY, [tempMesh], false);
    let result = -1;
    if (hits.length) result = geo.userData.faceMap[hits[0].faceIndex];
    geo.dispose();
    tempMesh.material.dispose();
    return result;
  }

  boxSelectVertIndices(sceneObject, rect) {
    sceneObject.object3D.updateMatrixWorld(true);
    const mesh = sceneObject.mesh;
    const out = [];
    mesh.verts.forEach((v, i) => {
      const world = v.co.clone().applyMatrix4(sceneObject.object3D.matrixWorld);
      const screen = this.viewport.worldToScreen(world);
      if (screen.x >= rect.x0 && screen.x <= rect.x1 && screen.y >= rect.y0 && screen.y <= rect.y1) out.push(i);
    });
    return out;
  }

  boxSelectObjects(scene, rect) {
    const camera = this.viewport.camera;
    const box2 = new THREE.Box2(new THREE.Vector2(rect.x0, rect.y0), new THREE.Vector2(rect.x1, rect.y1));
    return scene.objects.filter((o) => {
      if (!o.visible) return false;
      const box3 = new THREE.Box3().setFromObject(o.object3D);
      const center = new THREE.Vector3();
      box3.getCenter(center);
      const screen = this.viewport.worldToScreen(center);
      return box2.containsPoint(new THREE.Vector2(screen.x, screen.y));
    });
  }
}

function distancePointToSegment(px, py, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 1e-9 ? ((px - a.x) * abx + (py - a.y) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(px - cx, py - cy);
}

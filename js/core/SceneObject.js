// js/core/SceneObject.js
// One item in the scene: a base editable MeshData, a transform, a
// modifier stack, a material, and the actual THREE.Mesh used to render it.
// `mesh` is always the pre-modifier "cage" that Edit Mode edits directly;
// `threeMesh.geometry` is always the fully evaluated (post-modifier)
// result, so Object Mode always shows the final shape.

import * as THREE from 'three';
import { evaluateStack, createModifier } from '../modifiers/ModifierStack.js';

let objCounter = 1;

export class SceneObject {
  constructor(meshData, name) {
    this.id = 'obj_' + objCounter;
    this.name = name || 'Object.' + String(objCounter).padStart(3, '0');
    objCounter++;
    this.type = 'MESH';
    this.mesh = meshData;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.modifiers = [];
    this.visible = true;
    this.selected = false;

    this.material = { color: randomPastelColorHex(), roughness: 0.6, metalness: 0.05 };
    this.materialThree = new THREE.MeshStandardMaterial({
      color: this.material.color,
      roughness: this.material.roughness,
      metalness: this.material.metalness,
      side: THREE.DoubleSide,
    });

    this.object3D = new THREE.Group();
    this.object3D.name = this.name;
    this.threeMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.materialThree);
    this.threeMesh.userData.sceneObjectId = this.id;
    this.object3D.userData.sceneObjectId = this.id;
    this.object3D.add(this.threeMesh);

    this.rebuildGeometry();
    this.syncObject3DFromTransform();
  }

  get evaluatedMesh() {
    return evaluateStack(this.mesh, this.modifiers);
  }

  rebuildGeometry() {
    const finalMesh = this.evaluatedMesh;
    const geo = finalMesh.toBufferGeometry();
    this.threeMesh.geometry.dispose();
    this.threeMesh.geometry = geo;
  }

  syncObject3DFromTransform() {
    this.object3D.position.copy(this.position);
    this.object3D.rotation.copy(this.rotation);
    this.object3D.scale.copy(this.scale);
  }

  syncTransformFromObject3D() {
    this.position.copy(this.object3D.position);
    this.rotation.copy(this.object3D.rotation);
    this.scale.copy(this.object3D.scale);
  }

  updateMaterial() {
    this.materialThree.color.set(this.material.color);
    this.materialThree.roughness = this.material.roughness;
    this.materialThree.metalness = this.material.metalness;
  }

  addModifier(type) {
    const mod = createModifier(type);
    this.modifiers.push(mod);
    this.rebuildGeometry();
    return mod;
  }

  removeModifier(id) {
    this.modifiers = this.modifiers.filter((m) => m.id !== id);
    this.rebuildGeometry();
  }

  moveModifier(id, direction) {
    const i = this.modifiers.findIndex((m) => m.id === id);
    if (i === -1) return;
    const j = i + direction;
    if (j < 0 || j >= this.modifiers.length) return;
    [this.modifiers[i], this.modifiers[j]] = [this.modifiers[j], this.modifiers[i]];
    this.rebuildGeometry();
  }

  clone() {
    const copy = new SceneObject(this.mesh.clone(), this.name + '.copy');
    copy.position.copy(this.position);
    copy.rotation.copy(this.rotation);
    copy.scale.copy(this.scale);
    copy.modifiers = this.modifiers.map((m) => ({ id: m.id + '_c', type: m.type, enabled: m.enabled, params: { ...m.params } }));
    copy.material = { ...this.material };
    copy.updateMaterial();
    copy.syncObject3DFromTransform();
    copy.rebuildGeometry();
    return copy;
  }

  dispose() {
    this.threeMesh.geometry.dispose();
    this.materialThree.dispose();
  }
}

function randomPastelColorHex() {
  const c = new THREE.Color();
  c.setHSL(Math.random(), 0.45, 0.58);
  return '#' + c.getHexString();
}

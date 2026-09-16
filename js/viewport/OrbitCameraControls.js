// js/viewport/OrbitCameraControls.js
// Pure camera math: a target point plus spherical coordinates around it.
// This module owns no DOM listeners itself - InputRouter decides *when*
// orbit/pan/dolly should happen (mouse button, touch finger count, gizmo
// priority, ...) and calls these methods when it does.

import * as THREE from 'three';

export class OrbitCameraControls {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0, 0);
    this.spherical = new THREE.Spherical();
    this.spherical.setFromVector3(camera.position.clone().sub(this.target));
    this.minDistance = 0.3;
    this.maxDistance = 300;
    this.rotateSpeed = 0.006;
    this.panSpeedBase = 0.0016;
    this.applyToCamera();
  }

  orbit(dxPixels, dyPixels) {
    this.spherical.theta -= dxPixels * this.rotateSpeed;
    this.spherical.phi -= dyPixels * this.rotateSpeed;
    this.spherical.phi = Math.max(0.02, Math.min(Math.PI - 0.02, this.spherical.phi));
    this.applyToCamera();
  }

  pan(dxPixels, dyPixels) {
    const panSpeed = this.spherical.radius * this.panSpeedBase;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    this.target.addScaledVector(right, -dxPixels * panSpeed);
    this.target.addScaledVector(up, dyPixels * panSpeed);
    this.applyToCamera();
  }

  dolly(scale) {
    this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius * scale));
    this.applyToCamera();
  }

  setViewPreset(preset) {
    if (preset === 'FRONT') {
      this.spherical.theta = 0;
      this.spherical.phi = Math.PI / 2;
    } else if (preset === 'RIGHT') {
      this.spherical.theta = Math.PI / 2;
      this.spherical.phi = Math.PI / 2;
    } else if (preset === 'TOP') {
      this.spherical.theta = 0;
      this.spherical.phi = 0.001;
    } else if (preset === 'HOME') {
      this.target.set(0, 0, 0);
      this.spherical.theta = Math.PI / 4;
      this.spherical.phi = Math.PI / 3;
      this.spherical.radius = 8;
    }
    this.applyToCamera();
  }

  frameBox(box3, paddingFactor = 1.6) {
    if (!box3) return;
    const size = new THREE.Vector3();
    box3.getSize(size);
    const center = new THREE.Vector3();
    box3.getCenter(center);
    const radius = Math.max(size.length() * 0.5, 0.05) * paddingFactor;
    this.target.copy(center);
    this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, radius / Math.tan((this.camera.fov * Math.PI) / 360)));
    this.applyToCamera();
  }

  applyToCamera() {
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
}

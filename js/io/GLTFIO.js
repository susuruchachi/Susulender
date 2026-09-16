// js/io/GLTFIO.js
// glTF import/export via three.js's own loader/exporter addons. Export
// always produces binary .glb (self-contained, single file). Import reads
// geometry only (positions + UVs, triangulated - glTF has no quads/n-gons
// or modifier concept) and bakes each node's world transform into the
// imported vertices, so materials/textures/hierarchy are out of scope.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshData } from '../core/MeshData.js';

export function exportGLTFBinary(sceneObjects) {
  const exportScene = new THREE.Scene();
  sceneObjects.forEach((so) => {
    const geo = so.evaluatedMesh.toBufferGeometry();
    const mat = so.materialThree.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = so.name;
    mesh.applyMatrix4(so.object3D.matrixWorld);
    exportScene.add(mesh);
  });

  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(exportScene, (result) => resolve(result), (err) => reject(err), { binary: true });
  });
}

export async function importGLTF(arrayBuffer, fallbackName = 'Imported') {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  const results = [];
  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((child) => {
    if (child.isMesh && child.geometry && child.geometry.attributes.position) {
      const mesh = meshDataFromBufferGeometry(child.geometry);
      mesh.verts.forEach((v) => v.co.applyMatrix4(child.matrixWorld));
      results.push({ name: child.name || fallbackName, mesh });
    }
  });
  return results;
}

function meshDataFromBufferGeometry(geo) {
  const mesh = new MeshData();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const index = geo.index;

  for (let i = 0; i < pos.count; i++) mesh.addVertex(pos.getX(i), pos.getY(i), pos.getZ(i));

  const addTri = (a, b, c) => {
    const uvs = uv
      ? [
          [uv.getX(a), uv.getY(a)],
          [uv.getX(b), uv.getY(b)],
          [uv.getX(c), uv.getY(c)],
        ]
      : null;
    mesh.addFace([a, b, c], uvs);
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  } else {
    for (let i = 0; i < pos.count; i += 3) addTri(i, i + 1, i + 2);
  }
  return mesh;
}

// js/io/OBJIO.js
// Hand-rolled OBJ (+ companion MTL) import/export. Export bakes each
// object's full world transform and its modifier stack result (the final
// visible shape), since that's what another program opening the file
// should see. Import does not read material colours from the .mtl file
// (only geometry + UVs) - a deliberate, common simplification.

import * as THREE from 'three';
import { MeshData } from '../core/MeshData.js';

export function exportOBJ(sceneObjects) {
  const objLines = ['# Exported from Blend Studio', 'mtllib scene.mtl', ''];
  const mtlLines = [];
  const matNameByColor = new Map();
  let vBase = 0;
  let vtBase = 0;

  sceneObjects.forEach((so) => {
    const mesh = so.evaluatedMesh;
    const matrix = so.object3D.matrixWorld;

    let matName = matNameByColor.get(so.material.color);
    if (!matName) {
      matName = 'mat_' + matNameByColor.size;
      matNameByColor.set(so.material.color, matName);
      const c = new THREE.Color(so.material.color);
      mtlLines.push(`newmtl ${matName}`, `Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`, 'Ka 0 0 0', 'Ks 0.05 0.05 0.05', '');
    }

    objLines.push('o ' + sanitizeName(so.name), 'usemtl ' + matName);

    mesh.verts.forEach((v) => {
      const w = v.co.clone().applyMatrix4(matrix);
      objLines.push(`v ${w.x.toFixed(6)} ${w.y.toFixed(6)} ${w.z.toFixed(6)}`);
    });
    mesh.faces.forEach((f) => f.uvs.forEach(([u, v]) => objLines.push(`vt ${u.toFixed(6)} ${v.toFixed(6)}`)));

    let vtCursor = vtBase;
    mesh.faces.forEach((f) => {
      const refs = f.verts.map((vi, ci) => `${vBase + vi + 1}/${vtCursor + ci + 1}`);
      objLines.push('f ' + refs.join(' '));
      vtCursor += f.verts.length;
    });
    vBase += mesh.verts.length;
    vtBase = vtCursor;
    objLines.push('');
  });

  return { obj: objLines.join('\n') + '\n', mtl: mtlLines.join('\n') + '\n' };
}

export function importOBJ(text, baseName = 'Imported') {
  const allV = [];
  const allVT = [];
  const results = [];
  let curMesh = null;
  let curName = null;
  let localMap = null;

  const finishCurrent = () => {
    if (curMesh && curMesh.faces.length) results.push({ name: curName || baseName, mesh: curMesh });
  };
  const beginNew = (name) => {
    finishCurrent();
    curMesh = new MeshData();
    curName = name;
    localMap = new Map();
  };
  beginNew(baseName);

  const resolveIndex = (raw, arrLength) => {
    const n = parseInt(raw, 10);
    return n < 0 ? arrLength + n + 1 : n;
  };

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') {
      allV.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (tag === 'vt') {
      allVT.push([parseFloat(parts[1]), parseFloat(parts[2] ?? '0')]);
    } else if (tag === 'o' || tag === 'g') {
      beginNew(parts.slice(1).join(' ') || null);
    } else if (tag === 'f') {
      const corners = parts.slice(1).map((token) => {
        const [vRaw, vtRaw] = token.split('/');
        const gIdx = resolveIndex(vRaw, allV.length);
        let localIdx = localMap.get(gIdx);
        if (localIdx === undefined) {
          const co = allV[gIdx - 1] || [0, 0, 0];
          localIdx = curMesh.addVertex(co[0], co[1], co[2]);
          localMap.set(gIdx, localIdx);
        }
        let uv = [0, 0];
        if (vtRaw) {
          const gvt = resolveIndex(vtRaw, allVT.length);
          uv = allVT[gvt - 1] || [0, 0];
        }
        return { localIdx, uv };
      });
      curMesh.addFace(
        corners.map((c) => c.localIdx),
        corners.map((c) => c.uv)
      );
    }
  });
  finishCurrent();
  return results;
}

function sanitizeName(name) {
  return name.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
}

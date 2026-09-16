// js/io/BlendIO.js
//
// .blend is a versioned binary format with pointer-based structs whose
// exact layout is only described *inside each individual file* (the SDNA
// block) and has changed substantially across Blender's history -
// especially the move from fixed MVert/MEdge/MPoly/MLoop structs to a
// fully generic per-attribute storage system in more recent versions.
// Reliably reproducing everything Blender itself can read is out of reach
// here. What this module does instead, honestly:
//
//   1. Parses the file header and the block list - this part of the
//      format has not changed since Blender's earliest versions, so it
//      always works (unless the file is compressed - see below).
//   2. Parses the embedded SDNA struct definitions - also very stable,
//      always works.
//   3. Attempts to find classic direct Mesh -> MVert/MPoly/MLoop pointers
//      and, if present, reconstructs real geometry from them. This works
//      for a meaningful range of files but is best-effort: if those exact
//      fields aren't where expected (e.g. a newer attribute-based file),
//      extraction is skipped with a clear message rather than guessing.
//
// For anything this can't handle, OBJ or glTF export from Blender is the
// reliable path - and is what this app's own File > Export offers too.

import { MeshData } from '../core/MeshData.js';

export function parseBlendFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 12) throw new Error('File is too small to be a .blend file.');

  if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
    throw new Error('This .blend file is Zstandard-compressed. In Blender, use File > Save As with "Compress" unchecked, or export as glTF/OBJ instead.');
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    throw new Error('This .blend file is gzip-compressed and can\'t be read here. Re-save it uncompressed from Blender, or export as glTF/OBJ.');
  }
  const magic = new TextDecoder().decode(bytes.subarray(0, 7));
  if (magic !== 'BLENDER') {
    throw new Error('This does not look like a .blend file (missing the BLENDER header).');
  }

  const pointerSize = bytes[7] === 0x5f ? 4 : 8; // '_' -> 4 bytes, '-' -> 8 bytes
  const littleEndian = bytes[8] === 0x76; // 'v' -> little endian, 'V' -> big endian
  const versionStr = new TextDecoder().decode(bytes.subarray(9, 12));

  const dv = new DataView(arrayBuffer);
  const blockHeaderLen = 4 + 4 + pointerSize + 4 + 4;
  const blocks = [];
  let offset = 12;
  while (offset + blockHeaderLen <= bytes.length) {
    const code = new TextDecoder().decode(bytes.subarray(offset, offset + 4)).replace(/\0+$/, '');
    const size = dv.getUint32(offset + 4, littleEndian);
    const oldAddress = pointerSize === 4 ? dv.getUint32(offset + 8, littleEndian) : Number(dv.getBigUint64(offset + 8, littleEndian));
    const sdnaIndex = dv.getUint32(offset + 8 + pointerSize, littleEndian);
    const count = dv.getUint32(offset + 8 + pointerSize + 4, littleEndian);
    const dataStart = offset + blockHeaderLen;
    blocks.push({ code, size, oldAddress, sdnaIndex, count, dataStart });
    if (code === 'ENDB') break;
    offset = dataStart + size;
  }

  const dnaBlock = blocks.find((b) => b.code === 'DNA1');
  const sdna = dnaBlock ? parseSDNA(dv, dnaBlock, littleEndian) : null;

  return { pointerSize, littleEndian, versionStr, blocks, sdna, dv };
}

function readCString(bytes, start) {
  let end = start;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return { str: new TextDecoder().decode(bytes.subarray(start, end)), next: end + 1 };
}

function align4(n) {
  return (n + 3) & ~3;
}

function parseSDNA(dv, block, littleEndian) {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset + block.dataStart, block.size);
  const tagAt = (n) => new TextDecoder().decode(bytes.subarray(n, n + 4));
  let p = 0;
  if (tagAt(p) !== 'SDNA') return null;
  p += 4;
  if (tagAt(p) !== 'NAME') return null;
  p += 4;
  const nameCount = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0, littleEndian);
  p += 4;
  const names = [];
  for (let i = 0; i < nameCount; i++) {
    const r = readCString(bytes, p);
    names.push(r.str);
    p = r.next;
  }
  p = align4(p);

  if (tagAt(p) !== 'TYPE') return null;
  p += 4;
  const typeCount = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0, littleEndian);
  p += 4;
  const types = [];
  for (let i = 0; i < typeCount; i++) {
    const r = readCString(bytes, p);
    types.push(r.str);
    p = r.next;
  }
  p = align4(p);

  if (tagAt(p) !== 'TLEN') return null;
  p += 4;
  const lengths = [];
  for (let i = 0; i < typeCount; i++) {
    lengths.push(new DataView(bytes.buffer, bytes.byteOffset + p, 2).getUint16(0, littleEndian));
    p += 2;
  }
  p = align4(p);

  if (tagAt(p) !== 'STRC') return null;
  p += 4;
  const structCount = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0, littleEndian);
  p += 4;
  const structs = [];
  for (let i = 0; i < structCount; i++) {
    const typeIndex = new DataView(bytes.buffer, bytes.byteOffset + p, 2).getUint16(0, littleEndian);
    p += 2;
    const fieldCount = new DataView(bytes.buffer, bytes.byteOffset + p, 2).getUint16(0, littleEndian);
    p += 2;
    const fields = [];
    for (let f = 0; f < fieldCount; f++) {
      const fTypeIndex = new DataView(bytes.buffer, bytes.byteOffset + p, 2).getUint16(0, littleEndian);
      p += 2;
      const fNameIndex = new DataView(bytes.buffer, bytes.byteOffset + p, 2).getUint16(0, littleEndian);
      p += 2;
      fields.push({ typeIndex: fTypeIndex, nameIndex: fNameIndex });
    }
    structs.push({ typeIndex, fields });
  }

  return { names, types, lengths, structs };
}

function findStruct(sdna, typeName) {
  const typeIndex = sdna.types.indexOf(typeName);
  if (typeIndex === -1) return null;
  return sdna.structs.find((s) => s.typeIndex === typeIndex) || null;
}

function fieldInfo(sdna, field) {
  const rawName = sdna.names[field.nameIndex] || '';
  const isPointer = rawName.startsWith('*');
  const arrMatches = rawName.match(/\[(\d+)\]/g);
  let arrayCount = 1;
  if (arrMatches) arrMatches.forEach((m) => (arrayCount *= parseInt(m.slice(1, -1), 10)));
  const baseName = rawName.replace(/^\*+/, '').replace(/\[\d+\]/g, '');
  return { rawName, baseName, isPointer, arrayCount, typeIndex: field.typeIndex };
}

function structFieldLayout(sdna, structDef, pointerSize) {
  let offset = 0;
  const fields = structDef.fields.map((field) => {
    const info = fieldInfo(sdna, field);
    const unitSize = info.isPointer ? pointerSize : sdna.lengths[info.typeIndex] || 0;
    const totalSize = unitSize * info.arrayCount;
    const entry = { ...info, offset, unitSize, totalSize };
    offset += totalSize;
    return entry;
  });
  return { fields, totalSize: offset };
}

function findField(layout, name) {
  return layout.fields.find((f) => f.baseName === name);
}

function readPointerAt(dv, absOffset, pointerSize, littleEndian) {
  return pointerSize === 4 ? dv.getUint32(absOffset, littleEndian) : Number(dv.getBigUint64(absOffset, littleEndian));
}

function findBlockByAddress(blocks, address) {
  if (!address) return null;
  return blocks.find((b) => b.oldAddress === address) || null;
}

export function describeBlendFile(parsed) {
  const blockCounts = {};
  parsed.blocks.forEach((b) => (blockCounts[b.code] = (blockCounts[b.code] || 0) + 1));
  return {
    version: parsed.versionStr,
    pointerSize: parsed.pointerSize,
    endianness: parsed.littleEndian ? 'little' : 'big',
    totalBlocks: parsed.blocks.length,
    blockCounts,
    structCount: parsed.sdna ? parsed.sdna.structs.length : 0,
  };
}

function extractMeshesFromBlend(parsed) {
  const { sdna, blocks, dv, pointerSize, littleEndian } = parsed;
  if (!sdna) throw new Error('No struct-definition (DNA1) block found - cannot interpret this file\'s contents.');

  const meshStructDef = findStruct(sdna, 'Mesh');
  const vertStructDef = findStruct(sdna, 'MVert');
  const polyStructDef = findStruct(sdna, 'MPoly');
  const loopStructDef = findStruct(sdna, 'MLoop');
  if (!meshStructDef || !vertStructDef || !polyStructDef || !loopStructDef) {
    throw new Error(
      'This file\'s internal mesh layout was not recognized (it likely comes from a Blender version storing mesh data differently than the classic MVert/MPoly/MLoop structs this experimental reader looks for). Please use OBJ or glTF export from Blender instead.'
    );
  }

  const meshLayout = structFieldLayout(sdna, meshStructDef, pointerSize);
  const vertLayout = structFieldLayout(sdna, vertStructDef, pointerSize);
  const polyLayout = structFieldLayout(sdna, polyStructDef, pointerSize);
  const loopLayout = structFieldLayout(sdna, loopStructDef, pointerSize);

  const results = [];
  const warnings = [];

  blocks
    .filter((b) => b.code === 'ME')
    .forEach((meBlock, meIndex) => {
      try {
        const base = meBlock.dataStart;
        const mvertField = findField(meshLayout, 'mvert');
        const mpolyField = findField(meshLayout, 'mpoly');
        const mloopField = findField(meshLayout, 'mloop');
        const totvertField = findField(meshLayout, 'totvert');
        const totpolyField = findField(meshLayout, 'totpoly');
        if (!mvertField || !mpolyField || !mloopField || !totvertField || !totpolyField) {
          warnings.push(`Mesh #${meIndex + 1}: missing a classic direct vertex/polygon pointer - likely a newer file format. Skipped.`);
          return;
        }

        const totvert = dv.getInt32(base + totvertField.offset, littleEndian);
        const totpoly = dv.getInt32(base + totpolyField.offset, littleEndian);
        const vertPtr = readPointerAt(dv, base + mvertField.offset, pointerSize, littleEndian);
        const polyPtr = readPointerAt(dv, base + mpolyField.offset, pointerSize, littleEndian);
        const loopPtr = readPointerAt(dv, base + mloopField.offset, pointerSize, littleEndian);

        const vertBlock = findBlockByAddress(blocks, vertPtr);
        const polyBlock = findBlockByAddress(blocks, polyPtr);
        const loopBlock = findBlockByAddress(blocks, loopPtr);
        if (!vertBlock || !polyBlock || !loopBlock || totvert <= 0 || totpoly <= 0) {
          warnings.push(`Mesh #${meIndex + 1}: could not locate its raw vertex/polygon data blocks. Skipped.`);
          return;
        }

        const coField = findField(vertLayout, 'co');
        const loopstartField = findField(polyLayout, 'loopstart');
        const totloopField = findField(polyLayout, 'totloop');
        const loopVField = findField(loopLayout, 'v');
        if (!coField || !loopstartField || !totloopField || !loopVField) {
          warnings.push(`Mesh #${meIndex + 1}: recognized structs but not the expected fields inside them. Skipped.`);
          return;
        }

        const mesh = new MeshData();
        for (let i = 0; i < totvert; i++) {
          const vOff = vertBlock.dataStart + i * vertLayout.totalSize + coField.offset;
          mesh.addVertex(dv.getFloat32(vOff, littleEndian), dv.getFloat32(vOff + 4, littleEndian), dv.getFloat32(vOff + 8, littleEndian));
        }
        for (let i = 0; i < totpoly; i++) {
          const pOff = polyBlock.dataStart + i * polyLayout.totalSize;
          const loopstart = dv.getInt32(pOff + loopstartField.offset, littleEndian);
          const totloop = dv.getInt32(pOff + totloopField.offset, littleEndian);
          const loopIndices = [];
          for (let l = 0; l < totloop; l++) {
            const lOff = loopBlock.dataStart + (loopstart + l) * loopLayout.totalSize + loopVField.offset;
            loopIndices.push(dv.getUint32(lOff, littleEndian));
          }
          if (loopIndices.length >= 3 && loopIndices.every((vi) => vi < mesh.verts.length)) mesh.addFace(loopIndices);
        }
        if (mesh.faces.length) results.push({ name: 'BlendMesh_' + (results.length + 1), mesh });
        else warnings.push(`Mesh #${meIndex + 1}: no valid polygons could be reconstructed. Skipped.`);
      } catch (err) {
        warnings.push(`Mesh #${meIndex + 1}: failed to read (${err.message}).`);
      }
    });

  return { results, warnings };
}

// Always returns { info, results, warnings } - info (file structure) is
// available even when geometry extraction fails entirely, so the UI can
// show *something* useful either way. Throws only for a file that isn't
// readable as a .blend container at all (bad header, compressed, ...).
export function importBlend(arrayBuffer) {
  const parsed = parseBlendFile(arrayBuffer);
  const info = describeBlendFile(parsed);
  try {
    const { results, warnings } = extractMeshesFromBlend(parsed);
    return { info, results, warnings };
  } catch (err) {
    return { info, results: [], warnings: [err.message] };
  }
}

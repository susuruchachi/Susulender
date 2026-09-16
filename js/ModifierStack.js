// js/modifiers/ModifierStack.js
// The modifier registry and evaluation pipeline. Adding a new modifier
// type to the whole app is just: write a { type, label, defaultParams(),
// apply(mesh, params) } object in its own file, then register it below.

import { MirrorModifier } from './MirrorModifier.js';
import { SubsurfModifier } from './SubsurfModifier.js';
import { ArrayModifier } from './ArrayModifier.js';
import { BevelModifier } from './BevelModifier.js';
import { SolidifyModifier } from './SolidifyModifier.js';

export const MODIFIER_REGISTRY = {
  MIRROR: MirrorModifier,
  SUBSURF: SubsurfModifier,
  ARRAY: ArrayModifier,
  BEVEL: BevelModifier,
  SOLIDIFY: SolidifyModifier,
};

let idCounter = 1;

export function createModifier(type) {
  const def = MODIFIER_REGISTRY[type];
  if (!def) throw new Error('Unknown modifier type: ' + type);
  return { id: 'mod_' + idCounter++, type, enabled: true, params: def.defaultParams() };
}

// Runs the whole stack on a base MeshData and returns the final, fully
// evaluated MeshData. Never mutates `baseMesh` itself. A failure in one
// modifier is logged and skipped rather than breaking the whole viewport.
export function evaluateStack(baseMesh, modifiers) {
  let mesh = baseMesh;
  for (const mod of modifiers) {
    if (!mod.enabled) continue;
    const def = MODIFIER_REGISTRY[mod.type];
    if (!def) continue;
    try {
      mesh = def.apply(mesh, mod.params);
    } catch (err) {
      console.error('[ModifierStack] modifier failed, skipping:', mod.type, err);
    }
  }
  return mesh;
}

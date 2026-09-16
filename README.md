# Blend Studio

A from-scratch 3D modeling tool that runs entirely in the browser: Object
Mode, Edit Mode (vertex/edge/face), a modifier stack, OBJ/STL/glTF
import-export, an experimental `.blend` reader, and a UV editor. No build
step - open `index.html` and it runs, using [three.js](https://threejs.org/)
loaded from a CDN for rendering.

## Running it

Because it uses ES modules, most browsers block `import` on a plain
`file://` page. Serve the folder over local HTTP instead, for example:

```
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed `localhost` address. A phone or tablet on the same
network can also open that address directly.

## Controls

**Mouse / trackpad**
- Left click: select. Left-drag on empty space: box select.
- Middle-drag: orbit. Shift + middle-drag: pan. Scroll: zoom.
- `G` / `R` / `S`: move / rotate / scale the selection, then move the
  mouse (nothing held down) and left-click or `Enter` to confirm, `Esc` or
  right-click to cancel. Press `X` / `Y` / `Z` during that to constrain an
  axis (press the same one again to release it), or type a number.
- Dragging a colored gizmo handle does the same thing directly.

**Touch (phone / tablet)**
- One-finger drag: orbit. Two-finger drag: pan. Pinch: zoom.
- Tap a gizmo handle and drag it directly - no keyboard needed.
- The Move/Rotate/Scale toolbar buttons start the same modal flow as
  `G`/`R`/`S`; a floating X/Y/Z/confirm/cancel control appears at the
  bottom of the viewport while it's active.
- Below ~900px wide, the side panels become a bottom drawer - tap "Panels"
  to open it, and the tabs across the top switch between Outliner /
  Properties / Modifiers / UV Editor.

**Edit Mode**
- `Tab`: toggle Object/Edit Mode. `1`/`2`/`3`: vertex/edge/face select.
- `E` extrude, `I` inset, `M` merge at center, `X`/Delete delete (respects
  the current select mode), `N` flip normals, Shift+`D` duplicate.
- "Subdivide" (toolbar only) subdivides the selected edges; selecting a
  ring all the way around a shape and subdividing acts like a loop cut.

`Ctrl+Z` / `Ctrl+Shift+Z` undo/redo everywhere (whole-scene snapshots, not
a fine-grained command stack - simpler to reason about at the cost of
some memory).

## What's genuinely implemented, and what's simplified

This is a real modeler, not a demo - extrude, inset, subdivide, merge,
and delete all correctly maintain shared mesh topology (not just per-face
patches), and the modifiers (Mirror, Subdivision Surface, Array, Bevel,
Solidify) are real implementations, not stand-ins. That said, some
deliberate scope choices to be upfront about:

- **`.blend` import is experimental, not full compatibility.** The
  `.blend` format's block structure and struct-definition (SDNA) table
  are well-documented and stable, so those always parse. Actual geometry
  is only reconstructed when a file still exposes the classic direct
  `Mesh -> MVert/MPoly/MLoop` pointers; newer files that store mesh data
  as generic per-attribute layers aren't decoded, and compressed
  `.blend` files (zstd/gzip) are detected and reported rather than
  guessed at. **OBJ and glTF (`.glb`) are the reliable interchange
  path** - both are supported for import and export and round-trip
  cleanly with Blender itself. This is a hard technical boundary, not a
  missing feature I ran out of time for: correctly parsing every
  `.blend` version's internal layout is a project of its own.
- Loop cut is really "Subdivide" under the hood: selecting a ring of
  edges and subdividing splits every face that has exactly two selected
  edges, which is what a loop cut visually is, but there's no dedicated
  loop-cut tool that lets you slide the cut before confirming.
- Bevel (the modifier) chamfers every corner by a fixed amount rather than
  Blender's full segment/angle-limited edge bevel.
- UV unwrapping is projection-based (planar/box/cylindrical/spherical),
  not the seam-based "cut and flatten" unwrap Blender does. The UV editor
  lets you drag individual UV points; there's no island-level
  select/move/rotate yet.
- Box-select has no occlusion culling (equivalent to X-ray select always
  being on).
- Imported glTF/STL geometry comes in fully triangulated (neither format
  stores quads/n-gons), and imported materials/textures aren't read (only
  geometry + UVs where the format has them).
- No sculpting, no armatures/rigging, no particle systems, no shading
  nodes - this is a polygon modeling tool.

## File layout

```
index.html            entry point; loads three.js from a CDN via importmap
css/style.css          all styling
js/main.js             App class - wires every module together
js/core/               MeshData (editable vert/edge/face mesh), SceneObject,
                        Scene (selection/mode state), HistoryManager (undo/redo)
js/geometry/           parametric primitives (cube, sphere, cylinder, ...)
js/modifiers/          ModifierStack registry + Mirror/Subsurf/Array/Bevel/Solidify
js/modes/              ObjectMode and EditMode (selection + operators)
js/viewport/           Viewport (renderer/camera/lights), OrbitCameraControls,
                        TransformGizmo, PickingManager, InputRouter (mouse+touch
                        routing), EditOverlay (vertex/edge/face drawing)
js/uv/                 UnwrapOps (projection unwraps), UVEditor (2D panel)
js/io/                 OBJIO, STLIO, GLTFIO, BlendIO (format parsers) + IOManager
                        (wires them to the browser's file picker/download)
js/ui/                 MenuBar, Toolbar, Outliner, PropertiesPanel, ModifierPanel,
                        UIManager (layout + panel wiring)
```

Every module is a small, single-purpose ES file specifically so a piece
can be swapped or extended in isolation - for example, adding a new
modifier is a new file in `js/modifiers/` implementing
`{ type, label, defaultParams(), apply(mesh, params) }`, registered in
`ModifierStack.js`, with nothing else to touch.

## Extending it

A few natural next additions, given the architecture above:
- A new modifier: add a file to `js/modifiers/`, register it in
  `ModifierStack.js`. `ModifierPanel.js` will pick it up automatically.
- A new import/export format: add a file to `js/io/`, wire it into
  `IOManager.js` and add a menu entry in `ui/MenuBar.js`.
- A new primitive: add a builder function to `js/geometry/Primitives.js`
  and add it to the `PRIMITIVES` map at the bottom of that file.

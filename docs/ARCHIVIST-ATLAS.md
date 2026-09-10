# Archivist sprite atlas

- Asset: `public/art/archivist.png`
- Generation: built-in `image_gen.imagegen`, fresh generation; no external API or CLI generation.
- Actual texture size: **1254 × 1254 px**, PNG **RGBA**.
- Layout: **2 columns × 2 rows**, each **627 × 627 px**.
- Character: one original elderly silver-haired archivist with a lowered taupe hood, ivory/slate cloak, leather boots and satchel, and a small cyan archive capsule.
- Style references inspected before prompting: `.dream-loop/target.png` and `public/art/explorer-alpha.png`.
- Source generation: `/home/sabino/.codex/generated_images/01a08d6c-d30b-7922-8d3c-1bb0ded47012/exec-dd65d9d6-a48a-4f70-b150-f9f6641e566f.png`.

## Transparency verification

Pillow verified `mode == "RGBA"`, an alpha range of **0–255**, and **76.124%** fully transparent pixels. The background is actual alpha transparency. The PNG was copied without modifying or flattening its alpha channel.

The built-in generator returned 1254 × 1254 despite requesting 1536 × 1536 (and also returned 1254 × 1254 on a prior 1024 request). Use the actual dimensions below. An intermediate edit produced RGB with a painted checkerboard and was rejected; it is not the saved asset.

## Frame rectangles and foot anchors

All bounds below use source pixels. Content bounding boxes are cell-local, measured at alpha > 128, with exclusive right/bottom coordinates. Foot anchors are cell-local. Their x values are the midpoint of the visible lower-65-pixel footprint; their y values are the lowest visible boot edge. Use these anchors to place every pose at the same world ground point.

| Index | Pose                                        | Source rectangle x, y, w, h | Visible content x0, y0, x1, y1 | Foot anchor x, y |
| ----- | ------------------------------------------- | --------------------------- | ------------------------------ | ---------------- |
| 0     | Front three-quarter idle, facing right      | 0, 0, 627, 627              | 187, 94, 434, 590              | 326, 590         |
| 1     | Front three-quarter walk, facing right      | 627, 0, 627, 627            | 164, 94, 456, 590              | 333.5, 590       |
| 2     | Rear three-quarter idle, facing upper right | 0, 627, 627, 627            | 180, 64, 434, 546              | 320, 546         |
| 3     | Rear three-quarter walk, facing upper right | 627, 627, 627, 627          | 155, 64, 462, 552              | 337.5, 552       |

The frames have slightly different padding and baselines; do not place them using a common full-cell bottom edge. Use the measured anchors above. At scale `s`, draw a source cell at `(worldX - anchorX*s, worldY - anchorY*s)` with dimensions `(627*s, 627*s)`. To face left, flip around the world ground point. Disable image smoothing for the pixel style.

Visible standing height is about 496 source pixels in the front views and 482–488 in the rear views. A common scale preserves the consistent character proportions and modest pose variation. For example, `s = 0.155` produces an approximately 75–77 px tall on-screen character.

## Final generation prompt

```text
Create a transparent PNG sprite atlas for a pixel-art isometric adventure game. Use genuine RGBA transparency: the blank background is alpha=0, while the character is solid opaque. Output size 1536x1536.
Make a 2x2 animation sheet of one original elderly archivist. Silver swept hair and short silver beard, kind lined face, lowered hood behind his head, warm taupe and faded ivory cloak with slate-blue hem, brown leather boots and satchel. He cradles a tiny glowing cyan archive capsule at his chest. Restrained classic RPG pixel art, hard square pixel clusters, warm upper-left highlights, cool slate shadows, no blur. All four frames show exactly the same person and outfit.
Top-left: front three-quarter idle facing right. Top-right: front three-quarter walk facing right with one forward boot. Bottom-left: back three-quarter idle facing upper right. Bottom-right: back three-quarter walk facing upper right with one forward boot. Back views show his hood and cloak, with face mostly hidden.
Each frame occupies exactly one of four equal 768x768 cells. Character head-to-boot height is 480 pixels, top of head at local y=160, boot soles at local y=640. Center of body local x=384. Keep every pixel within local x=170..600 and y=150..650. Same baseline, same size, full body in every frame. The cells have no dividers or labels. Clear transparent margins surround all four full bodies.
Only the four characters appear. Empty pixels are genuinely transparent. No ground, scenery, shadow, external glow, halo, text, grid, watermark, floor or painted background. Preserve alpha transparency in the delivered PNG.
```

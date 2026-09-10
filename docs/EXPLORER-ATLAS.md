# Explorer atlas

`public/art/explorer-alpha.png` is the selected production sprite atlas, generated with the built-in image generation tool. It is a 1536 × 1024 **RGBA** PNG, with 3 columns and 2 rows of 512 × 512 cells. Preserve its generated alpha channel. The original `explorer.png` remains unchanged.

The top row is front/right idle, walk A, walk B. The bottom row is rear/right idle, walk A, walk B. For left-facing movement, mirror the selected sprite in the renderer.

Use the full 512 × 512 cell when rendering so the sword and subtle edge glow remain visible. Alpha at or above 128 has these cell-local bounds (right and bottom exclusive):

| Frame | Bounds | Suggested body/foot anchor |
| --- | --- | --- |
| Front idle | 109, 65 → 508, 459 | 282, 459 |
| Front walk A | 74, 65 → 475, 459 | 265, 459 |
| Front walk B | 97, 65 → 454, 459 | 268, 459 |
| Rear idle | 103, 29 → 508, 430 | 270, 430 |
| Rear walk A | 73, 35 → 487, 430 | 263, 430 |
| Rear walk B | 59, 31 → 464, 434 | 251, 434 |

Anchors are visual estimates for consistent ground contact, not baked metadata. The white hair/boots span roughly 394–403 pixels, so a displayed body height of 64 px uses a scale around 0.16 (the full cell occupies about 82 px).

Validation with Pillow: `mode=RGBA`; alpha extrema 0–254; 1,122,742 of 1,572,864 pixels have zero alpha; 342,786 pixels have alpha at or above 128. The low-alpha perimeter contains generated soft sword/hair glow; it is not a baked checkerboard. The broad nonzero alpha bounds therefore cover nearly the entire atlas, and thresholded bounds above are more useful for alignment.

## Final generation prompt

> Create a transparent-background PNG game sprite sheet. Actual alpha transparency is REQUIRED: use the tool's transparent output mode, make the empty background pixels fully transparent (alpha 0), and the sprites opaque. Do not draw a checkerboard pattern or any visible backdrop. Asset type: original high-quality pixel-art sprite atlas for an isometric fantasy/sci-fi browser action game. Canvas 1536 by 1024, exactly 3 columns by 2 rows, six separate frames, evenly centered in equal 512 by 512 cells. Each sprite is a small full-body explorer with spiky white hair, vivid burnt-orange scarf, indigo blue long coat over ivory shirt, dark pants, brown leather boots and gloves, holding a low bright cyan energy sword pointing down-right. Three-quarter isometric view, crisp deliberate pixel clusters and dark clean outline; detailed premium retro action game style. Top row faces camera-right: idle, walk left foot forward, walk right foot forward. Bottom row faces away-right: idle, walk left foot forward, walk right foot forward. All figures have identical proportions and stay fully inside their cells with comfortable empty transparent margins. All feet align on identical row baselines, same scale between frames. No ground, no shadow under boots, no grid lines, no labels, no letters, no diagrams. The only nontransparent pixels in the whole PNG must belong to the six sprites. This will be composited over a game world and needs a real alpha channel, not a visual imitation of transparency.

Two extraction attempts on the older baked-checkerboard image had already failed before this fresh atlas was selected. This final asset was copied without pixel edits from the tool output.

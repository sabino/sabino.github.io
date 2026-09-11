# Theo’s atlas

The world map is a chart of remembered exploration. The same seed still reproduces the underlying world, but the map reveals it through actual travel. Map interaction never moves the current body or advances time while the atlas is open.

## Navigation

Press M or expand the minimap. Drag, or focus the canvas and use arrow keys, to pan. Scroll to zoom around the pointer; the zoom buttons and +/− keys zoom about the center. My body recenters without changing scale. All explored fits the complete known extent, including distant or negative coordinates. Current thread centers a remembered objective even if its surrounding country remains uncharted.

Known-place buttons locate discovered cities, villages, hamlets, and vaults. Coordinate search locates arbitrary coordinates within the playable ±1-billion-tile navigation range. It does not reveal that location. Click a point and use Follow this mark to track its direction and distance in the ordinary field notes. Marking a point does not establish a passable route or provide fast travel. The player still walks and respects collision. The view and temporary mark persist while this life remains active in the page; terrain knowledge and discovered sites persist in save files.

The projection is a continuous square-tile plane. A globe would require a world topology and wrapping contract; the atlas does not invent a spherical edge or pretend that the current world already wraps.

## Exploration and compatibility

Every normal visit update records 8×8 cells around the actual body. Four cells share a 16×16 chunk and use a compact four-bit mask. Nearby settlement or vault footprints reveal the place’s identity; entering their farther streets continues to uncover the terrain itself. An objective may identify a distant recipient without revealing the intervening country.

Knowledge belongs to Theo. Walking and taking another living host reveal the surroundings of the actual body; returning retains earlier exploration. Saves store optional versioned exploration data alongside the world-generation version. Earlier saves reconstruct only their already-entered chunks as an approximate trail. A prefix count references the existing visited list, avoiding a second expanded copy of long histories. New cells use compact masks. Malformed masks, coordinates, and site records are rejected.

`explored`, `exploredCells`, `exploredBounds`, `discoveredSites`, and `explorationRevision` are read-only queries. Rendering, remote coordinate inspection, and accepting correspondence do not call discovery. Small bounded cell queries use direct chunk lookups rather than scanning an entire travel history; broad atlas views iterate stored knowledge.

## Rendering and checks

The minimap and atlas share `AtlasPainter`. Close views show actual remembered tiles; regional views use sampled climate; very distant views aggregate known cells into pixels so thin explored trails remain visible. Samples are cached with a bounded 32,768-color cache. Unknown space receives only the chart grid and explicitly known destination markers, and never requests terrain chunks.

Pure navigation checks verify pointer anchoring, screen/world round trips at distant coordinates, full-extent fitting, and bounded finite zoom. Session checks cover actual walking, discovered outskirts with still-unknown centers, retained knowledge after possession and saving, remote-query non-revelation, legacy histories over 100,000 chunks, malformed saves, and direct bounded queries without history iteration. Browser evidence is recorded separately in [QA.md](QA.md).

# Sabino Software website

Static bilingual website for [sabino.pro](https://sabino.pro), designed to run directly on GitHub Pages without a build step.

## Local preview

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/` for English or `http://localhost:4173/pt/` for Portuguese.

## Deployment model

- GitHub Pages serves the repository root.
- `.nojekyll` keeps the build deterministic and preserves static subpaths.
- `CNAME`, `.well-known/`, and `one-click-apps/` are intentionally retained.
- Other project sites under `sabino.pro/<project>/` are published from their own repositories and are not duplicated here.

## Visual asset provenance

- `hero-systems-topology.webp` was generated specifically for this site with OpenAI image generation, then optimized locally for web delivery.
- Project screenshots come from the corresponding public repositories.
- Company marks are shown only as a factual representation of Felipe Sabino's career history; the site explicitly states that no endorsement is implied.

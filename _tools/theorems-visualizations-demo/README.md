# theorems-visualizations demo data

Generator for `assets/js/theorems-visualizations-core.js` and
`assets/data/theorems-visualizations-demo.json`, which drive the figures in
`_posts/2026-10-18-drawing-six-thousand-ideas-in-one-dependency-graph.markdown`.

- `build_data.mjs`:
  - **Runtime & live visualizations (`assets/js/theorems-visualizations-core.js`)**:
    bundles `theorems-visualizations/assets/js/viz/core.js`, `math.js`, the 17
    kits in `assets/js/viz/kits/`, and 45 live `viz(v)` functions across all 13
    fields and 8 cross-field bridges into a single IIFE (`window.TheoremsVizCore`).
  - **Dependency graph & atlas data (`assets/data/theorems-visualizations-demo.json`)**:
    packs all 6,684 written items, 11,541 dependency edges, 88 shelf rows across
    85 collections and 13 fields, the 77-step longest reasoning chain, 1,989
    cross-field edges, 8 bridges, 450 landmark papers, and headless verification
    telemetry.

Run `./run.sh` with a `theorems-visualizations` checkout beside this repo (or
`THEOREMS_VIZ=/path`).

# MAPS Google Sites prototype v6

This version preserves the MAPS-style hierarchical selector and makes the previously unfinished preset/filter controls functional.

## Important change in v4

The catalog and citations are bundled as ordinary JavaScript data files rather than loaded with `fetch()`.
That means **you can test this version by simply double-clicking `index.html`**. No local web server is required.
It remains fully compatible with GitHub Pages and Google Sites embedding.

You can still serve it locally if desired:

    python3 -m http.server 8000

then open `http://localhost:8000`.

## Functional preset behavior

- Add one or more Disk, Molecule, or available Paper presets.
- Product-type checkboxes are enabled after the first preset.
- Images, Moment maps, Measurement sets, and Radial profiles default on for disk/molecule presets.
- Auxiliary paper data turns on for paper presets.
- Product-type filters update the preset-derived selection immediately.
- Manual tree selections are preserved independently of preset filters.
- Manually unchecking a preset-selected file excludes that file until Clear all.
- Clear all resets manual selections, presets, exclusions, and filters.

## Data

The full extracted MAPS catalog and original FTP URLs are retained. `data/tree.json` and `data/citations.json` remain in the package as inspectable source data; `data/catalog.js` and `data/citations.js` are the browser-loaded equivalents.


## v6 faceted filters

- Removed Paper presets.
- Removed the Auxiliary paper data product-type checkbox. Auxiliary files remain manually selectable in the tree.
- Renamed the `Aux` tree branch to `Auxiliary paper data`.
- Disk/Molecule filters now use faceted logic: OR within the same facet, AND across facets.
- Selected filters are removable chips with an × button.


## Search improvements in v7

Search is now hierarchy-aware and token-based rather than filename-substring-only. Queries such as `AS 209 CO`, `HD 163296 HCN`, and `measurement set C18O` match terms across the full catalog path. Results rank hierarchy groups ahead of individual files and show breadcrumbs for context. Short chemistry tokens such as `CO` are matched exactly, so `CO` does not unintentionally match `C18O` or `H13CO+`.

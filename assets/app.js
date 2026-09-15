(() => {
  "use strict";

  const state = {
    roots: [],
    items: new Map(),
    leaves: [],
    manualSelected: new Set(),
    manualExcluded: new Set(),
    presetSelected: new Set(),
    selected: new Set(),
    selectedSize: 0,
    presets: new Map(),
    filters: {
      images: false,
      moment_maps: false,
      measurement_sets: false,
      radial_profiles: false
    },
    citations: {},
    searchIndex: [],
    molecules: []
  };

  const treeContainer = document.getElementById("treeContainer");
  const totalSelected = document.getElementById("totalSelected");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const popup = document.getElementById("downloadPopupTxt");
  const bibButton = document.getElementById("confirmBibtexBtn");
  const confirmDownloadButton = document.getElementById("confirmDownloadBtn");
  const presetButton = document.getElementById("presetButton");
  const presetMenu = document.getElementById("presetMenu");
  const displayPresets = document.getElementById("displayPresets");
  const typeFilters = document.getElementById("typeFilters");
  const filterInputs = new Map(
    [...typeFilters.querySelectorAll("input[data-filter]")].map(input => [input.dataset.filter, input])
  );

  const diskDisplayNames = new Map([
    ["AS_209", "AS 209"],
    ["GM_Aur", "GM Aur"],
    ["HD_163296", "HD 163296"],
    ["IM_Lup", "IM Lup"],
    ["MWC_480", "MWC 480"]
  ]);

  const preferredMoleculeOrder = [
    "CO", "13CO", "C18O", "C17O", "13CN", "CN", "CS", "HCO+", "H13CO+",
    "HCN", "H13CN", "HC15N", "DCN", "C2H", "N2D+", "H2CO", "CH3CN", "HC3N", "c-C3H2"
  ];

  function displayPathLabel(label) {
    return diskDisplayNames.get(label) || String(label).replaceAll("_", " ");
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[″”]/g, " arcsec ")
      .replace(/[′’]/g, " arcmin ")
      .replace(/[_\/.,:;()\[\]{}=-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenizeSearch(value) {
    return normalizeSearchText(value).match(/[a-z0-9]+\+?/g) || [];
  }

  function compactSearchText(value) {
    return normalizeSearchText(value).replace(/\s+/g, "");
  }

  function labelAliases(label) {
    const aliases = [];
    const shown = displayPathLabel(label);
    aliases.push(shown);
    aliases.push(shown.replace(/\s+/g, ""));

    if (label === "images") aliases.push("image images cube cubes imaging");
    if (label === "VADP") aliases.push("value added products value-added products moment map maps radial profile profiles");
    if (label === "measurement_sets") aliases.push("measurement set sets measurementset measurementsets ms");
    if (label === "Aux" || label === "Auxiliary paper data") aliases.push("aux auxiliary paper data");
    return aliases;
  }

  function categoryAliases(category) {
    if (category === "images") return "image images cube cubes imaging";
    if (category === "moment_maps") return "moment map maps value added product products vadp";
    if (category === "measurement_sets") return "measurement set sets measurementset measurementsets ms visibility visibilities";
    if (category === "radial_profiles") return "radial profile profiles value added product products vadp";
    if (category === "aux") return "aux auxiliary paper data";
    return "";
  }

  function makeSearchRecord(item) {
    const fullPath = [...item.pathLabels, item.label];
    const displayPath = fullPath.map(displayPathLabel);
    const pathAliasText = fullPath.flatMap(labelAliases).join(" ");
    const leafAliases = item.kind === "leaf" ? categoryAliases(item.meta?.category) : "";
    const raw = `${pathAliasText} ${item.label} ${item.id || ""} ${leafAliases}`;
    const tokens = [...new Set(tokenizeSearch(raw))];
    const pathTokens = [...new Set(tokenizeSearch(`${pathAliasText} ${leafAliases}`))];
    return {
      key: item.key,
      label: item.label,
      kind: item.kind,
      path: displayPath,
      depth: displayPath.length,
      tokens,
      pathTokens,
      normalized: normalizeSearchText(raw),
      compact: compactSearchText(raw),
      labelTokens: tokenizeSearch(`${displayPathLabel(item.label)} ${item.label}`)
    };
  }

  function register(items, parentKey = null, ancestors = [], pathLabels = []) {
    for (const item of items) {
      item.parentKey = parentKey;
      item.ancestors = ancestors;
      item.pathLabels = pathLabels;
      state.items.set(item.key, item);

      if (item.kind === "node") {
        state.searchIndex.push(makeSearchRecord(item));
        register(item.children, item.key, [...ancestors, item.key], [...pathLabels, item.label]);
      } else {
        annotateLeaf(item);
        state.searchIndex.push(makeSearchRecord(item));
        state.leaves.push(item);
      }
    }
  }

  function annotateLeaf(item) {
    const path = item.pathLabels;
    const root = path[0] || null;
    const isAux = root === "Aux" || root === "Auxiliary paper data";
    item.meta = {
      disk: root && !isAux ? root : null,
      branch: root && !isAux ? (path[1] || null) : "Auxiliary paper data",
      molecule: root && !isAux ? (path[2] || null) : null,
      category: productCategory(item)
    };
  }

  function productCategory(item) {
    if (item.type === "aux") return "aux";
    if (item.type === "image") return "images";
    if (item.type === "measurement_set") return "measurement_sets";
    if (item.type === "moment_map" && /radialprofile/i.test(item.label)) return "radial_profiles";
    if (item.type === "moment_map") return "moment_maps";
    return "moment_maps";
  }

  function discoverMolecules() {
    const found = new Set();
    for (const root of state.roots) {
      if (!diskDisplayNames.has(root.label)) continue;
      const images = root.children.find(child => child.kind === "node" && child.label === "images");
      if (!images) continue;
      for (const child of images.children) if (child.kind === "node") found.add(child.label);
    }
    const ordered = preferredMoleculeOrder.filter(name => found.has(name));
    const extra = [...found].filter(name => !preferredMoleculeOrder.includes(name)).sort();
    state.molecules = [...ordered, ...extra];
  }

  function buildTree() {
    const rootUl = document.createElement("ul");
    rootUl.className = "tree-list";
    const frag = document.createDocumentFragment();
    for (const root of state.roots) frag.appendChild(renderItem(root));
    rootUl.appendChild(frag);
    treeContainer.replaceChildren(rootUl);
  }

  function itemCheckboxState(item) {
    if (item.kind === "leaf") {
      return {checked: state.selected.has(item.key), indeterminate: false};
    }
    const [selected, total] = subtreeCounts(item);
    return {
      checked: total > 0 && selected === total,
      indeterminate: selected > 0 && selected < total
    };
  }

  function renderItem(item) {
    const li = document.createElement("li");
    li.dataset.key = item.key;

    const row = document.createElement("div");
    row.className = `tree-row ${item.kind}`;
    row.dataset.key = item.key;

    if (item.kind === "node") {
      const toggle = document.createElement("button");
      toggle.className = "toggle";
      toggle.type = "button";
      toggle.textContent = "+";
      toggle.setAttribute("aria-label", `Expand ${item.label}`);
      toggle.dataset.action = "toggle";
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "toggle spacer";
      row.appendChild(spacer);
    }

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "tree-check";
    cb.dataset.action = "check";
    cb.dataset.key = item.key;
    cb.id = `check-${item.key.replaceAll(".", "-")}`;
    const cstate = itemCheckboxState(item);
    cb.checked = cstate.checked;
    cb.indeterminate = cstate.indeterminate;
    row.appendChild(cb);

    const label = document.createElement("label");
    label.className = "tree-label";
    label.htmlFor = cb.id;
    if (item.kind === "leaf") {
      const a = document.createElement("a");
      a.href = item.url;
      a.textContent = item.label;
      a.title = item.url;
      label.appendChild(a);
    } else {
      label.textContent = item.label;
    }
    row.appendChild(label);
    li.appendChild(row);

    if (item.kind === "node") {
      const ul = document.createElement("ul");
      ul.className = "children";
      ul.hidden = true;
      ul.dataset.rendered = "false";
      li.appendChild(ul);
    }
    return li;
  }

  function renderDirectChildren(item, ul) {
    if (!ul || ul.dataset.rendered === "true") return;
    const frag = document.createDocumentFragment();
    for (const child of item.children) frag.appendChild(renderItem(child));
    ul.appendChild(frag);
    ul.dataset.rendered = "true";
  }

  function descendants(item, out = []) {
    if (item.kind === "leaf") {
      out.push(item);
    } else {
      for (const c of item.children) descendants(c, out);
    }
    return out;
  }

  function checkboxFor(key) {
    return document.querySelector(`input[data-action="check"][data-key="${CSS.escape(key)}"]`);
  }

  function setItemSelected(item, checked) {
    const leaves = item.kind === "leaf" ? [item] : descendants(item, []);
    for (const leaf of leaves) {
      if (checked) {
        state.manualSelected.add(leaf.key);
        state.manualExcluded.delete(leaf.key);
      } else {
        state.manualSelected.delete(leaf.key);
        if (state.presetSelected.has(leaf.key)) state.manualExcluded.add(leaf.key);
        else state.manualExcluded.delete(leaf.key);
      }
    }
    refreshFinalSelection();
  }

  function syncVisibleCheckboxes() {
    document.querySelectorAll('input[data-action="check"]').forEach(cb => {
      const item = state.items.get(cb.dataset.key);
      if (!item) return;
      const s = itemCheckboxState(item);
      cb.checked = s.checked;
      cb.indeterminate = s.indeterminate;
    });
  }

  function subtreeCounts(item) {
    if (item.kind === "leaf") return [state.selected.has(item.key) ? 1 : 0, 1];
    let s = 0, t = 0;
    for (const c of item.children) {
      const [cs, ct] = subtreeCounts(c);
      s += cs;
      t += ct;
    }
    return [s, t];
  }

  function formatSize(size) {
    const rounded = Math.round((size + Number.EPSILON) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/,"" ).replace(/\.$/,"");
  }

  function refreshFinalSelection() {
    const selected = new Set(state.manualSelected);
    for (const key of state.presetSelected) {
      if (!state.manualExcluded.has(key)) selected.add(key);
    }
    state.selected = selected;
    let size = 0;
    for (const key of state.selected) size += Number(state.items.get(key)?.size) || 0;
    state.selectedSize = size;
    syncVisibleCheckboxes();
    updateSummary();
  }

  function updateSummary() {
    const n = state.selected.size;
    const size = Math.max(0, state.selectedSize);
    let text = `${n} files selected; ${formatSize(size)}GB total.`;
    if (size > 1000) text += "<br> Be aware that you have selected &gt;1TB of data!";
    totalSelected.innerHTML = text;
  }

  function toggleNode(item, force = null) {
    const li = document.querySelector(`li[data-key="${CSS.escape(item.key)}"]`);
    if (!li) return;
    const ul = li.querySelector(":scope > ul.children");
    const button = li.querySelector(":scope > .tree-row > .toggle");
    if (!ul || !button) return;
    const open = force === null ? ul.hidden : force;
    if (open) renderDirectChildren(item, ul);
    ul.hidden = !open;
    button.textContent = open ? "−" : "+";
    button.setAttribute("aria-label", `${open ? "Collapse" : "Expand"} ${item.label}`);
    if (open) syncVisibleCheckboxes();
  }

  function collapseAll() {
    document.querySelectorAll(".children").forEach(ul => ul.hidden = true);
    document.querySelectorAll(".toggle:not(.spacer)").forEach(b => b.textContent = "+");
  }

  function clearAll() {
    state.manualSelected.clear();
    state.manualExcluded.clear();
    state.presetSelected.clear();
    state.presets.clear();
    for (const key of Object.keys(state.filters)) state.filters[key] = false;
    syncFilterUI();
    renderPresetDisplay();
    refreshFinalSelection();
  }

  function selectedLeaves() {
    return [...state.selected].map(k => state.items.get(k)).filter(Boolean);
  }

  function openModal() {
    const selected = selectedLeaves();
    const n = selected.length;
    const size = formatSize(state.selectedSize);
    if (!n) {
      popup.textContent = "No data products were selected for download.";
      bibButton.disabled = true;
      confirmDownloadButton.disabled = true;
    } else {
      popup.innerHTML =
        `You have selected ${n} files for download. This is ${size}GB of total data.<br>` +
        `Please confirm that this is what you want before proceeding.<br><br>` +
        `The relevant citations for this data have been placed into a single bibtex file, available below. ` +
        `Please make sure to cite this data in any future publications or talks where they are used.<br><br>` +
        `A download shell script (download_MAPS.sh) has been prepared with all of your selected files. ` +
        `To launch the script, first make it executable (<code>chmod +x download_MAPS.sh</code>) and then run ` +
        `<code>./download_MAPS.sh</code>.`;
      bibButton.disabled = false;
      confirmDownloadButton.disabled = false;
    }
    modalBackdrop.hidden = false;
  }

  function closeModal() {
    modalBackdrop.hidden = true;
  }

  function downloadBlob(filename, text, type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function makeDownloadScript() {
    const urls = selectedLeaves().map(x => x.url);
    const size = formatSize(state.selectedSize);
    const quoted = urls.map(u => `'${u.replaceAll("'", "'\\''")}'`).join("\n");
    return `#!/usr/bin/env bash
set -euo pipefail

# MAPS download script generated by the standalone data browser.
# ${urls.length} files; approximately ${size} GB total.
# Requires wget with FTP support.

urls=(
${quoted}
)

echo "Downloading ${urls.length} MAPS files (~${size} GB total)"
for url in "\${urls[@]}"; do
  echo "==> $url"
  wget -c "$url"
done
`;
  }

  function makeBibtex() {
    const required = new Set();
    for (const leaf of selectedLeaves()) {
      for (const c of (leaf.citations || [])) required.add(c);
    }
    return [...required].sort().map(k => state.citations[k] || `% Citation metadata not bundled for ${k}`).join("\n\n") + "\n";
  }

  function searchTokenMatches(queryToken, recordToken) {
    if (recordToken === queryToken) return true;
    // Permit useful partial typing for words/numbers of at least three characters,
    // but keep short chemistry tokens like CO exact so CO does not match C18O/H13CO+.
    return queryToken.length >= 3 && recordToken.startsWith(queryToken);
  }

  function recordMatchesQuery(record, queryTokens, queryCompact) {
    if (!queryTokens.length) return false;
    const tokenMatch = queryTokens.every(qt => record.tokens.some(rt => searchTokenMatches(qt, rt)));
    if (!tokenMatch) return false;

    // Compact matching makes AS209 and HD163296 work naturally as well.
    if (queryTokens.length === 1 && queryCompact.length >= 4) {
      const only = queryTokens[0];
      const direct = record.tokens.some(rt => searchTokenMatches(only, rt));
      if (!direct && !record.compact.includes(queryCompact)) return false;
    }
    return true;
  }

  function searchScore(record, queryTokens, queryCompact) {
    let score = 0;
    const last = queryTokens.at(-1);
    const pathMatches = queryTokens.every(qt => record.pathTokens.some(rt => searchTokenMatches(qt, rt)));
    if (pathMatches) score += 120;
    if (record.kind === "node") score += 100;
    else score -= 10;
    if (last && record.labelTokens.some(rt => rt === last)) score += 90;
    if (queryCompact.length >= 4 && record.compact.includes(queryCompact)) score += 25;
    score -= record.depth * 2;
    return score;
  }

  function resultBreadcrumb(match) {
    return match.path.join(" › ");
  }

  function doSearch() {
    const q = searchInput.value.trim();
    searchResults.replaceChildren();
    if (!q) {
      searchResults.hidden = true;
      return;
    }

    const queryTokens = tokenizeSearch(q);
    const queryCompact = compactSearchText(q);
    const allMatches = state.searchIndex
      .filter(record => recordMatchesQuery(record, queryTokens, queryCompact))
      .map(record => ({...record, score: searchScore(record, queryTokens, queryCompact)}))
      .sort((a, b) => b.score - a.score || a.depth - b.depth || resultBreadcrumb(a).localeCompare(resultBreadcrumb(b), undefined, {numeric: true}));

    // Groups are generally much more useful than thousands of individual files.
    // Show a modest number of both, with groups first through ranking.
    const matches = allMatches.slice(0, 60);

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "search-result search-empty";
      empty.textContent = `No catalog entries match “${q}”`;
      searchResults.appendChild(empty);
    } else {
      const summary = document.createElement("div");
      summary.className = "search-summary";
      summary.textContent = `${allMatches.length.toLocaleString()} matching catalog entries`;
      searchResults.appendChild(summary);

      for (const match of matches) {
        const item = state.items.get(match.key);
        const div = document.createElement("div");
        div.className = `search-result ${item.kind}`;
        div.dataset.key = item.key;

        const main = document.createElement("div");
        main.className = "search-result-main";
        main.textContent = resultBreadcrumb(match);
        div.appendChild(main);

        const small = document.createElement("small");
        if (item.kind === "node") {
          const count = descendants(item, []).length;
          small.textContent = `Group · ${count.toLocaleString()} file${count === 1 ? "" : "s"} · click to reveal in tree`;
        } else {
          small.textContent = `${item.type.replaceAll("_", " ")} · click to reveal in tree`;
        }
        div.appendChild(small);
        searchResults.appendChild(div);
      }

      if (allMatches.length > matches.length) {
        const more = document.createElement("div");
        more.className = "search-more";
        more.textContent = `${(allMatches.length - matches.length).toLocaleString()} more matches — add another term to narrow the search.`;
        searchResults.appendChild(more);
      }
    }
    searchResults.hidden = false;
  }

  function reveal(key) {
    const item = state.items.get(key);
    if (!item) return;
    for (const ancestorKey of item.ancestors) {
      const ancestor = state.items.get(ancestorKey);
      if (ancestor) toggleNode(ancestor, true);
    }
    const row = document.querySelector(`.tree-row[data-key="${CSS.escape(key)}"]`);
    if (row) {
      row.scrollIntoView({block: "center", behavior: "smooth"});
      row.classList.add("tree-highlight");
      setTimeout(() => row.classList.remove("tree-highlight"), 1600);
    }
    searchResults.hidden = true;
  }

  function presetKey(kind, value) {
    return `${kind}:${value}`;
  }

  function presetLabel(preset) {
    if (preset.kind === "disk") return diskDisplayNames.get(preset.value) || preset.value.replaceAll("_", " ");
    return preset.value;
  }

  // Faceted behavior: OR within a facet, AND across active facets.
  // Example: (HD 163296 OR AS 209) AND (CO OR HCN).
  function recomputePresetSelection() {
    const next = new Set();
    if (!state.presets.size) {
      state.presetSelected = next;
      refreshFinalSelection();
      return;
    }

    const selectedDisks = new Set();
    const selectedMolecules = new Set();
    for (const preset of state.presets.values()) {
      if (preset.kind === "disk") selectedDisks.add(preset.value);
      if (preset.kind === "molecule") selectedMolecules.add(preset.value);
    }

    for (const leaf of state.leaves) {
      // Auxiliary products remain available through the tree, but are not part of Disk/Molecule facets.
      if (leaf.meta.category === "aux") continue;
      if (!state.filters[leaf.meta.category]) continue;
      if (selectedDisks.size && !selectedDisks.has(leaf.meta.disk)) continue;
      if (selectedMolecules.size && !selectedMolecules.has(leaf.meta.molecule)) continue;
      next.add(leaf.key);
    }
    state.presetSelected = next;
    refreshFinalSelection();
  }

  function initializeFiltersForFirstPreset() {
    state.filters.images = true;
    state.filters.moment_maps = true;
    state.filters.measurement_sets = true;
    state.filters.radial_profiles = true;
  }

  function addPreset(kind, value) {
    const key = presetKey(kind, value);
    const firstPreset = state.presets.size === 0;
    if (!state.presets.has(key)) state.presets.set(key, {kind, value});

    if (firstPreset) initializeFiltersForFirstPreset();

    syncFilterUI();
    renderPresetDisplay();
    recomputePresetSelection();
    closePresetMenu();
  }

  function removePreset(kind, value) {
    state.presets.delete(presetKey(kind, value));
    if (!state.presets.size) {
      for (const key of Object.keys(state.filters)) state.filters[key] = false;
    }
    syncFilterUI();
    renderPresetDisplay();
    recomputePresetSelection();
  }

  function renderPresetDisplay() {
    displayPresets.replaceChildren();
    if (!state.presets.size) {
      displayPresets.textContent = "No filters selected. Add a filter or manually select data.";
      return;
    }

    const facetDefs = [
      ["disk", "Disk"],
      ["molecule", "Molecule"]
    ];
    const frag = document.createDocumentFragment();

    for (const [kind, title] of facetDefs) {
      const presets = [...state.presets.values()].filter(p => p.kind === kind);
      if (!presets.length) continue;

      const row = document.createElement("div");
      row.className = "facet-row";
      const heading = document.createElement("span");
      heading.className = "facet-label";
      heading.textContent = `${title}:`;
      row.appendChild(heading);

      const chips = document.createElement("span");
      chips.className = "facet-chips";
      for (const preset of presets) {
        const chip = document.createElement("span");
        chip.className = "filter-chip";
        const text = document.createElement("span");
        text.textContent = presetLabel(preset);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "chip-remove";
        remove.dataset.removeKind = preset.kind;
        remove.dataset.removeValue = preset.value;
        remove.setAttribute("aria-label", `Remove ${presetLabel(preset)} filter`);
        remove.textContent = "×";
        chip.append(text, remove);
        chips.appendChild(chip);
      }
      row.appendChild(chips);
      frag.appendChild(row);
    }

    displayPresets.appendChild(frag);
  }

  function syncFilterUI() {
    const enabled = state.presets.size > 0;
    for (const [name, input] of filterInputs) {
      input.disabled = !enabled;
      input.checked = Boolean(state.filters[name]);
    }
  }

  function makePresetGroup(title, items) {
    const section = document.createElement("section");
    section.className = "preset-group";
    const heading = document.createElement("div");
    heading.className = "preset-group-title";
    heading.textContent = title;
    section.appendChild(heading);

    const list = document.createElement("div");
    list.className = `preset-items preset-items-${title.toLowerCase()}`;
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-item";
      button.dataset.kind = item.kind;
      button.dataset.value = item.value;
      button.textContent = item.label;
      if (item.disabled) {
        button.disabled = true;
        button.title = item.title || "No matching auxiliary bundle is present in the current MAPS catalog.";
      }
      list.appendChild(button);
    }
    section.appendChild(list);
    return section;
  }

  function buildPresetMenu() {
    const disks = [...diskDisplayNames].map(([value, label]) => ({kind: "disk", value, label}));
    const molecules = state.molecules.map(value => ({kind: "molecule", value, label: value}));
    presetMenu.replaceChildren(
      makePresetGroup("Disks", disks),
      makePresetGroup("Molecules", molecules)
    );
  }

  function openPresetMenu() {
    presetMenu.hidden = false;
    presetButton.setAttribute("aria-expanded", "true");
  }

  function closePresetMenu() {
    presetMenu.hidden = true;
    presetButton.setAttribute("aria-expanded", "false");
  }

  function togglePresetMenu() {
    if (presetMenu.hidden) openPresetMenu();
    else closePresetMenu();
  }

  treeContainer.addEventListener("click", event => {
    const row = event.target.closest(".tree-row");
    if (!row) return;
    const item = state.items.get(row.dataset.key);
    if (!item) return;

    if (event.target.dataset.action === "toggle") {
      toggleNode(item);
      return;
    }

    if (event.target.matches('input[data-action="check"]')) {
      setItemSelected(item, event.target.checked);
    }
  });

  // Prevent clicking a leaf URL from also toggling the label/checkbox.
  treeContainer.addEventListener("click", event => {
    if (event.target.tagName === "A") event.stopPropagation();
  }, true);

  presetButton.addEventListener("click", event => {
    event.stopPropagation();
    togglePresetMenu();
  });

  presetMenu.addEventListener("click", event => {
    const button = event.target.closest("button.preset-item[data-kind]");
    if (!button || button.disabled) return;
    addPreset(button.dataset.kind, button.dataset.value);
  });

  displayPresets.addEventListener("click", event => {
    const button = event.target.closest("button[data-remove-kind][data-remove-value]");
    if (!button) return;
    removePreset(button.dataset.removeKind, button.dataset.removeValue);
  });

  typeFilters.addEventListener("change", event => {
    const input = event.target.closest("input[data-filter]");
    if (!input) return;
    state.filters[input.dataset.filter] = input.checked;
    recomputePresetSelection();
  });

  document.getElementById("clearAll").addEventListener("click", clearAll);
  document.getElementById("collapseAll").addEventListener("click", collapseAll);
  document.getElementById("downloadBtn").addEventListener("click", openModal);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCloseX").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", e => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal();
      closePresetMenu();
    }
  });

  confirmDownloadButton.addEventListener("click", () => downloadBlob("download_MAPS.sh", makeDownloadScript()));
  bibButton.addEventListener("click", () => downloadBlob("MAPS.bib", makeBibtex()));

  document.getElementById("searchButton").addEventListener("click", doSearch);
  searchInput.addEventListener("input", doSearch);
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) doSearch();
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrap")) searchResults.hidden = true;
    if (!e.target.closest(".preset-wrap")) closePresetMenu();
  });
  searchResults.addEventListener("click", e => {
    const r = e.target.closest(".search-result[data-key]");
    if (r) reveal(r.dataset.key);
  });

  try {
    const roots = window.MAPS_TREE;
    const citations = window.MAPS_CITATIONS;
    if (!Array.isArray(roots)) throw new Error("MAPS catalog did not load");
    if (!citations || typeof citations !== "object") throw new Error("MAPS citations did not load");
    state.roots = roots;
    state.citations = citations;
    for (const root of roots) {
      if (root.kind === "node" && root.label === "Aux") root.label = "Auxiliary paper data";
    }
    register(roots);
    discoverMolecules();
    buildTree();
    buildPresetMenu();
    syncFilterUI();
    renderPresetDisplay();
    refreshFinalSelection();
  } catch (error) {
    console.error(error);
    treeContainer.innerHTML = `<div class="loading">Could not load the MAPS catalog. ${error.message}</div>`;
  }
})();

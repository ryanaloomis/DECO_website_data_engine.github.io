#!/usr/bin/env python3
"""
Extract the MAPS data tree from a saved copy of https://alma-maps.info/data.html.

Usage:
    python tools/extract_maps_catalog.py "MAPS - Data.html" data/tree.json

Requires:
    beautifulsoup4
"""
from pathlib import Path
from bs4 import BeautifulSoup
import json
import sys

def label_text(label):
    return " ".join(label.stripped_strings).strip()

def parse_li(li):
    label = li.find("label", recursive=False)
    if label is None:
        return None
    inp = label.find("input", recursive=False)
    if inp is None:
        return None

    classes = inp.get("class") or []
    if "hummingbird-end-node" in classes:
        parts = (inp.get("id") or "").split(";")
        if len(parts) < 4:
            raise ValueError(f"Unexpected leaf metadata: {inp.get('id')!r}")
        return {
            "kind": "leaf",
            "id": inp.get("data-id") or label_text(label),
            "label": label_text(label),
            "url": parts[0],
            "type": parts[1],
            "size": float(parts[2]),
            "citations": parts[3].split(",") if parts[3] else [],
        }

    node = {
        "kind": "node",
        "id": inp.get("id") or inp.get("data-id"),
        "label": label_text(label),
        "children": [],
    }
    child_ul = li.find("ul", recursive=False)
    if child_ul is not None:
        for child_li in child_ul.find_all("li", recursive=False):
            child = parse_li(child_li)
            if child is not None:
                node["children"].append(child)
    return node

def assign_keys(items, prefix=""):
    for i, item in enumerate(items):
        key = f"{prefix}.{i}" if prefix else str(i)
        item["key"] = key
        if item["kind"] == "node":
            assign_keys(item["children"], key)

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_maps_catalog.py INPUT_HTML OUTPUT_JSON")

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])

    soup = BeautifulSoup(source.read_text(errors="replace"), "html.parser")
    tree = soup.find(id="treeview")
    if tree is None:
        raise SystemExit("Could not find #treeview in input HTML")

    roots = []
    for li in tree.find_all("li", recursive=False):
        item = parse_li(li)
        if item is not None:
            roots.append(item)

    assign_keys(roots)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(roots, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {target}")

if __name__ == "__main__":
    main()

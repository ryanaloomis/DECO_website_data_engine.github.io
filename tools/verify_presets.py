#!/usr/bin/env python3
"""Verify preset/filter semantics against the extracted MAPS catalog."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
roots = json.loads((ROOT / "data" / "tree.json").read_text())
leaves = []

def category(item):
    if item["type"] == "aux": return "aux"
    if item["type"] == "image": return "images"
    if item["type"] == "measurement_set": return "measurement_sets"
    if item["type"] == "moment_map" and "radialprofile" in item["label"].lower():
        return "radial_profiles"
    return "moment_maps"

def walk(item, path):
    if item["kind"] == "leaf":
        labels = [p["label"] for p in path]
        root = labels[0] if labels else None
        leaves.append({
            "item": item,
            "disk": root if root != "Aux" else None,
            "branch": labels[1] if root != "Aux" and len(labels) > 1 else "Aux",
            "molecule": labels[2] if root != "Aux" and len(labels) > 2 else None,
            "category": category(item),
        })
    else:
        for child in item["children"]:
            walk(child, path + [item])

for root in roots:
    walk(root, [])

assert len(leaves) == 21827
assert Counter(x["category"] for x in leaves) == Counter({
    "images": 7525,
    "moment_maps": 7510,
    "radial_profiles": 5936,
    "measurement_sets": 834,
    "aux": 22,
})

# Default non-paper preset filters mirror the intended old UI defaults.
def select(kind, value, enabled=("images", "moment_maps", "measurement_sets", "radial_profiles")):
    out = []
    for leaf in leaves:
        if leaf["category"] not in enabled:
            continue
        if kind == "disk" and leaf["disk"] == value:
            out.append(leaf)
        elif kind == "molecule" and leaf["molecule"] == value:
            out.append(leaf)
        elif kind == "paper" and leaf["category"] == "aux" and leaf["item"]["label"] == f"MAPS_{value}.tgz":
            out.append(leaf)
    return out

assert len(select("disk", "AS_209")) == 4282
assert len(select("molecule", "HCN")) == 2330
assert len(select("molecule", "CO")) == 433
assert len(select("paper", "III", enabled=("aux",))) == 0  # no MAPS_III.tgz in supplied catalog
assert len(select("paper", "IV", enabled=("aux",))) == 1

# A filter toggle should remove only that product class from a preset selection.
as209_without_ms = select("disk", "AS_209", enabled=("images", "moment_maps", "radial_profiles"))
assert len(as209_without_ms) == 4115

print("Preset verification passed")
print("Catalog leaves:", len(leaves))
print("Categories:", dict(Counter(x["category"] for x in leaves)))
print("AS 209 default preset:", len(select("disk", "AS_209")))
print("HCN default preset:", len(select("molecule", "HCN")))
print("CO default preset:", len(select("molecule", "CO")))

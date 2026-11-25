"""Adds (or replaces) a downloaded car's entry in game/data/credits.json and its row in docs/ASSETS.md, from the car file's
"source" block (tools/blender/cars/<car>.json). Usage: python3 tools/credit_car.py <car> "<what was removed, English>" "<dasselbe, Deutsch>" [phone tris] [high tris]
Run from the repository root. Only for CC BY / CC0 models (others are not used)."""
import json, re, sys

car, removed_en, removed_de = sys.argv[1:4]
tris = sys.argv[4:6]
cfg = json.load(open(f"tools/blender/cars/{car}.json"))
src = cfg["source"]
m = re.match(r"\s*(.*?)\s*\((https://[^)]+)\)", src["author"])
author, author_url = (m.group(1), m.group(2)) if m else (src["author"], None)
lic = src["licence"].upper().replace("-4.0", " 4.0").replace("CC-BY", "CC BY")
assert lic in ("CC BY 4.0", "CC0 1.0", "CC0"), "only CC BY or CC0: " + lic
lic_url = "https://creativecommons.org/licenses/by/4.0/" if lic.startswith("CC BY") else "https://creativecommons.org/publicdomain/zero/1.0/"
files = [f"game/assets/cars/{car}.glb", f"game/assets/cars/{car}-hi.glb"]
title = src["title"]
entry = {
    "id": car, "kind": "model", "name": title, "file": files, "author": author, **({"authorUrl": author_url} if author_url else {}),
    "source": src["url"], "licence": lic, "licenceUrl": lic_url, "attribution": lic.startswith("CC BY"),
    "changes": f"scaled to the real car, materials replaced, {removed_en} removed, reduced",
    "use": {
        "en": f"\"{title}\" by {author}, {lic}; changed: scaled, materials replaced, {removed_en} removed, reduced",
        "de": f"„{title}“ von {author}, {lic}; verändert: skaliert, Materialien ersetzt, {removed_de} entfernt, verkleinert",
    },
}
p = "game/data/credits.json"
c = json.load(open(p))
c["entries"] = [e for e in c["entries"] if e.get("id") != car] + [entry]
open(p, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")
uid = src["url"].rstrip("/").split("-")[-1]
size = f"reduced to {tris[0]} / {tris[1]} triangles" if len(tris) == 2 else "reduced"
row = (f"| `game/assets/cars/{car}.glb`, `{car}-hi.glb` | {title} | {src['author']} | {src['url']} (Sketchfab UID {uid}) | {lic} ({lic_url}), "
       f"stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real "
       f"car's length, all materials replaced by the game's slots, {removed_en} removed, {size}), by `tools/blender/car_normalize.py` with "
       f"`tools/blender/cars/{car}.json` |")
p = "docs/ASSETS.md"
s = open(p).read()
lines = [l for l in s.split("\n") if not l.startswith(f"| `game/assets/cars/{car}.glb`")]
i = max(k for k, l in enumerate(lines) if l.startswith("| `game/assets/cars/"))
lines.insert(i + 1, row)
open(p, "w").write("\n".join(lines))
print("credited", car, "-", lic, author)

"""On the GPU PC (embedded Python, run with -I): unpacks every <folder>/*.zip into <folder>/src and prints its licence
file, the glTF's asset.extras (Sketchfab writes title, author, licence, source there) and the model files found.
Usage: python -I unpack_check.py C:\\AI\\work\\<car> [...]"""
import sys, os, zipfile, json, glob

for folder in sys.argv[1:]:
    for z in glob.glob(os.path.join(folder, "*.zip")):
        dst = os.path.join(folder, "src", os.path.splitext(os.path.basename(z))[0])
        with zipfile.ZipFile(z) as f:
            for name in f.namelist():   # nothing may leave the target folder
                if os.path.isabs(name) or ".." in name.replace("\\", "/").split("/"):
                    raise SystemExit("unsafe path in %s: %s" % (z, name))
            f.extractall(dst)
        print("=" * 20, z, "->", dst)
        for lic in glob.glob(os.path.join(dst, "**", "license*.txt"), recursive=True) + glob.glob(os.path.join(dst, "**", "LICENSE*"), recursive=True):
            print("--", lic); print(open(lic, encoding="utf-8", errors="replace").read().strip())
        models = [p for p in glob.glob(os.path.join(dst, "**", "*"), recursive=True) if os.path.splitext(p)[1].lower() in (".gltf", ".glb", ".fbx", ".obj", ".blend")]
        for m in models:
            print("model", m, os.path.getsize(m))
            if m.lower().endswith(".gltf"):
                g = json.load(open(m, encoding="utf-8"))
                print("extras", json.dumps(g.get("asset", {}).get("extras", {})), "generator", g.get("asset", {}).get("generator"),
                      "meshes", len(g.get("meshes", [])), "materials", [x.get("name") for x in g.get("materials", [])][:40])

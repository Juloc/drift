"""Runs the TRELLIS.2 workflow of the GPU PC through the ComfyUI API (docs/CAR-PIPELINE.md).

Needs the tunnel (ssh -N -L 127.0.0.1:8188:127.0.0.1:8188 gpu) and ComfyUI started on the PC. Standard library only.
Usage: python3 tools/gpu/trellis_run.py WORKFLOW.json IMAGE.png PREFIX [--seed N] [--out DIR]
Uploads the picture, sets node 122 (LoadImage) and 322 (Save3DAdvanced prefix), queues it, polls /history,
then downloads every output file (the .glb and the preview pictures) into DIR. Prints the time it took.
"""
import argparse, json, os, sys, time, uuid, urllib.request, urllib.parse

API = "http://127.0.0.1:8188"


def post_json(path, obj):
    req = urllib.request.Request(API + path, data=json.dumps(obj).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def upload(path):
    boundary = uuid.uuid4().hex
    name = os.path.basename(path)
    with open(path, "rb") as f:
        data = f.read()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(API + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["name"]


def fetch(info, out):
    q = urllib.parse.urlencode({"filename": info["filename"], "subfolder": info.get("subfolder", ""), "type": info.get("type", "output")})
    dst = os.path.join(out, (info.get("subfolder") or "").replace("/", "_") + info["filename"])
    with urllib.request.urlopen(API + "/view?" + q) as r, open(dst, "wb") as f:
        f.write(r.read())
    return dst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workflow"); ap.add_argument("image"); ap.add_argument("prefix")
    ap.add_argument("--seed", type=int, default=None, help="one seed for the three samplers (default: the workflow's)")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    wf = json.load(open(a.workflow))
    wf["122"]["inputs"]["image"] = upload(a.image)
    wf["322"]["inputs"]["filename_prefix"] = a.prefix
    if a.seed is not None:
        for k in ("3", "18", "23", "12"):
            wf[k]["inputs"]["seed"] = a.seed + int(k)
    t0 = time.time()
    pid = post_json("/prompt", {"prompt": wf, "client_id": uuid.uuid4().hex})["prompt_id"]
    print("queued", pid, flush=True)
    while True:
        time.sleep(3)
        with urllib.request.urlopen(f"{API}/history/{pid}") as r:
            h = json.load(r)
        if pid in h:
            break
    st = h[pid].get("status", {})
    print("status", st.get("status_str"), "after %.0f s" % (time.time() - t0), flush=True)
    if st.get("status_str") != "success":
        print(json.dumps(st.get("messages", [])[-3:], indent=1)[:4000]); sys.exit(1)
    os.makedirs(a.out, exist_ok=True)
    for node, o in h[pid]["outputs"].items():
        for key, items in o.items():
            for info in items if isinstance(items, list) else []:
                if isinstance(info, dict) and "filename" in info:
                    print(node, key, fetch(info, a.out))


main()

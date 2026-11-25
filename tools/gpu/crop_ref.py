# Crops the car out of a reference picture (PIL only). Usage: python crop_ref.py in.webp out.png left top right bottom
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
box = tuple(int(v) for v in sys.argv[3:7])
im = Image.open(src).convert("RGB")
print("source", im.size)
c = im.crop(box)
# square canvas with a margin, the car centred (TRELLIS conditions on a square picture; the workflow masks the background itself)
side = int(max(c.size) * 1.08)
sq = Image.new("RGB", (side, side), (0, 0, 0))
sq.paste(c, ((side - c.size[0]) // 2, (side - c.size[1]) // 2))
sq = sq.resize((1024, 1024), Image.LANCZOS) if side > 1024 else sq
sq.save(dst)
print("wrote", dst, sq.size, "crop", box)

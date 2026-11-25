#!/bin/sh
# Builds the game files of one car on the GPU PC (headless Blender) and fetches them (docs/CAR-PIPELINE.md, step 3).
# Usage: tools/gpu/car_variants.sh <car> [variants="smooth smooth-hi"]
#   needs: C:\AI\work\<car>\raw.glb on the PC (the TRELLIS result), tools/blender/cars/<car>.json here.
# Writes game/assets/cars/<car>.glb (smooth, phone), <car>-hi.glb (smooth, high tier), and the logs next to them in /tmp.
set -eu
car=$1; variants=${2:-"smooth smooth-hi"}
cd "$(dirname "$0")/../.."
ssh gpu "mkdir C:\\AI\\scripts\\drift\\cars 2>nul & mkdir C:\\AI\\work\\$car 2>nul & exit 0"
scp -q tools/blender/car_from_trellis.py tools/blender/prepare_car.py tools/blender/look.py gpu:C:/AI/scripts/drift/
scp -q "tools/blender/cars/$car.json" gpu:C:/AI/scripts/drift/cars/
scp -q game/assets/cars/s15-test.glb game/assets/cars/s15-test-hi.glb "gpu:C:/AI/work/$car/"
for v in $variants; do
  case $v in
    smooth) out=$car.glb; wheels=s15-test.glb ;;
    smooth-hi) out=$car-hi.glb; wheels=s15-test-hi.glb ;;
  esac
  log=/tmp/claude-1000/car-$car-$v.log
  t0=$(date +%s)
  ssh gpu "C:\\AI\\Blender\\blender.exe -b -P C:\\AI\\scripts\\drift\\car_from_trellis.py -- --raw C:\\AI\\work\\$car\\raw.glb --car C:\\AI\\scripts\\drift\\cars\\$car.json --wheels C:\\AI\\work\\$car\\$wheels --variant $v --out C:\\AI\\work\\$car\\$out --blend C:\\AI\\work\\$car\\$v.blend" > "$log" 2>&1 || { grep -E '^\[|Error|Traceback|File "' "$log" | tail -30; echo "FAILED: $v (log $log)"; exit 1; }
  scp -q "gpu:C:/AI/work/$car/$out" "game/assets/cars/$out"
  echo "== $v -> game/assets/cars/$out ($(( $(date +%s) - t0 )) s, log $log)"
  grep '^\[' "$log" | sed 's/^/   /'
done

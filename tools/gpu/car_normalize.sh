#!/bin/sh
# Normalises a downloaded car model on the GPU PC (headless Blender) and fetches the game files (docs/CAR-PIPELINE.md).
# Usage: tools/gpu/car_normalize.sh <car> <model file on the PC, e.g. C:/AI/work/<car>/model.fbx> [tiers="phone high"] [name=<car>]
#   needs tools/blender/cars/<car>.json here. Writes game/assets/cars/<name>.glb (phone) and <name>-hi.glb (high).
set -eu
car=$1; model=$2; tiers=${3:-"phone high"}; name=${4:-$car}
cd "$(dirname "$0")/../.."
ssh gpu "mkdir C:\\AI\\scripts\\drift\\cars 2>nul & mkdir C:\\AI\\work\\$car 2>nul & exit 0"
scp -q tools/blender/car_normalize.py tools/blender/carlib.py tools/blender/prepare_car.py tools/blender/look.py gpu:C:/AI/scripts/drift/
scp -q "tools/blender/cars/$car.json" gpu:C:/AI/scripts/drift/cars/
scp -q game/assets/cars/s15-test.glb game/assets/cars/s15-test-hi.glb "gpu:C:/AI/work/$car/"
for t in $tiers; do
  case $t in phone) out=$name.glb; wheels=s15-test.glb ;; high) out=$name-hi.glb; wheels=s15-test-hi.glb ;; esac
  log=/tmp/claude-1000/norm-$name-$t.log; t0=$(date +%s)
  ssh gpu "C:\\AI\\Blender\\blender.exe -b -P C:\\AI\\scripts\\drift\\car_normalize.py -- --model $model --car C:\\AI\\scripts\\drift\\cars\\$car.json --wheels C:\\AI\\work\\$car\\$wheels --tier $t --out C:\\AI\\work\\$car\\$out --blend C:\\AI\\work\\$car\\$name-$t.blend" > "$log" 2>&1 || { grep -E '^\[|Error|Traceback|File "' "$log" | tail -40; echo "FAILED: $t (log $log)"; exit 1; }
  scp -q "gpu:C:/AI/work/$car/$out" "game/assets/cars/$out"
  echo "== $t -> game/assets/cars/$out ($(( $(date +%s) - t0 )) s, log $log)"
  grep '^\[' "$log" | sed 's/^/   /'
done

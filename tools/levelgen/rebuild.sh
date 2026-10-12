#!/bin/sh
# Build, measure, build again, prove. The second build is not redundant: the
# quota is measured by playing the first one, and the generator reads that
# measurement back in. See tools/fit-quota.mjs.
set -e
DIR=$(dirname "$0")
# The generator builds the remix pack; levels/pack.js is the original set.
export SUPREMIX_PACK=remix
LEVELGEN_LOOSE=1 PYTHONPATH="$DIR" python "$DIR/run.py" "$DIR" > /dev/null
node tools/fit-quota.mjs > /dev/null
PYTHONPATH="$DIR" python "$DIR/run.py" "$DIR" | tail -2
node tools/validate-levels.mjs | tail -1
node tools/verify-solutions.mjs | tail -1
node tools/design-audit.mjs | tail -1
node tools/pack-assets.mjs remix | tail -1

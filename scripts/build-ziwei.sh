#!/usr/bin/env bash
# 从玄枢 (doushu0117) 重新构建股小蜜紫微内核 bundle
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOUSHU="${DOUSHU_ROOT:-$ROOT/../BBB/doushu0117}"
OUT="$ROOT/project-proj_21qCfX0Vycj/utils/ziwei"

if [[ ! -d "$DOUSHU/ziwei" ]]; then
  echo "玄枢源码未找到: $DOUSHU/ziwei" >&2
  exit 1
fi

cd "$DOUSHU"
npx esbuild ziwei/constants.ts \
  --bundle --format=iife --global-name=ZiweiConstants \
  --outfile="$OUT/constants.bundle.js"
npx esbuild ziwei/services/astrologyService.ts \
  --bundle --format=iife --global-name=ZiweiAstrology \
  --outfile="$OUT/astrologyService.bundle.js"
npx esbuild ziwei/services/interpretationService.ts \
  --bundle --format=iife --global-name=ZiweiInterpretation \
  --outfile="$OUT/interpretationService.bundle.js"

echo "Ziwei bundles written to $OUT"

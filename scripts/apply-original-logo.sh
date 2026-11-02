#!/usr/bin/env bash
# Replace public/logo-512.png with the ORIGINAL supplied logo, byte-for-byte.
# NO resize, NO crop, NO recolour, NO inversion, NO redraw, NO re-encode.
# Usage: bash scripts/apply-original-logo.sh /path/to/original-logo.png
set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "Usage: bash scripts/apply-original-logo.sh /path/to/original-logo.(png|jpg|webp|svg)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/logo-512.png"

MAGIC="$(head -c 16 "$SRC" | od -An -tx1 | tr -d ' \n')"
case "$MAGIC" in
  89504e470d0a1a0a*) TYPE="PNG" ;;
  ffd8ff*)           TYPE="JPEG" ;;
  52494646????????57454250*) TYPE="WEBP" ;;
  *)
    if head -c 300 "$SRC" | grep -qi '<svg'; then
      TYPE="SVG"
    else
      echo "ERROR: unsupported file. Send a PNG, JPEG, WebP or SVG image." >&2
      exit 1
    fi
    ;;
esac

BEFORE="$(sha256sum "$DEST" | cut -d' ' -f1)"
cp -f "$SRC" "$DEST"
AFTER="$(sha256sum "$DEST" | cut -d' ' -f1)"

echo "type=$TYPE"
echo "path=$DEST"
echo "bytes=$(wc -c < "$DEST")"
echo "sha256_before=$BEFORE"
echo "sha256_after=$AFTER"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "NOTE: hash unchanged (the supplied file is identical to the current one)."
else
  echo "OK: replaced byte-for-byte. No image processing was applied."
fi

python3 -c 'import sys,struct
d=open(sys.argv[1],"rb").read()
print("dimensions=%sx%s" % struct.unpack(">II", d[16:24]) if d[:8]==b"\x89PNG\r\n\x1a\n" else "dimensions=n/a (non-PNG)")' "$DEST"

echo
echo "Next steps:"
echo "  npx tsc --noEmit && npx next build"
echo "  git add public/logo-512.png && git commit -m 'Use original supplied logo, unchanged'"
echo "  redeploy the EXISTING Vercel project ai-gimms-hub, then verify /logo-512.png 200 + 13/13 pages"

#!/bin/zsh
# Install a .wgt/.tpk on the TV via the homebrew service (port 8091).
#
# Usage:
#   ./install-app.sh <url-or-path-to-wgt> [name-on-tv]
#
# The name header is only needed if the server can't guess it; default is the
# filename of the download.
set -euo pipefail

TV="${TV_IP:-192.168.1.119}"
PIN_FILE="$(dirname "$0")/hbpin.txt"
[ -f "$PIN_FILE" ] || PIN_FILE="${TVPIN_FILE:-}"
[ -n "$PIN_FILE" ] && [ -f "$PIN_FILE" ] || { echo "PIN file not found (hbpin.txt next to this script)"; exit 1; }
PIN="$(cat "$PIN_FILE")"

SRC="$1"
NAME="${2:-$(basename "$SRC" | sed 's/?.*$//')}"

case "$SRC" in
  http://*|https://*)
    TMP="$(mktemp /tmp/tv-app-XXXXXX).wgt"
    echo "downloading $SRC"
    curl -sL "$SRC" -o "$TMP"
    FILE="$TMP"
    ;;
  *)
    FILE="$SRC"
    ;;
esac

# Repack if the TV's signer chokes on data-descriptor zips (happens with
# Apps2Samsung bundle wgt files).
REPACK="$(mktemp /tmp/tv-app-repack-XXXXXX).wgt"
if ! python3 - "$FILE" "$REPACK" <<'EOF'
import sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin:
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in zin.namelist():
            zout.writestr(n, zin.read(n))
EOF
then
  echo "not a zip/wgt? trying as-is"; FILE="$FILE"
else
  if python3 -c "import zipfile,sys; z=zipfile.ZipFile('$FILE'); sys.exit(0 if any(n in ('config.xml','tizen-manifest.xml') for n in z.namelist()) else 1)" 2>/dev/null; then
    FILE="$FILE"
  else
    FILE="$REPACK"
  fi
fi

echo "installing $NAME ($(du -h "$FILE" | cut -f1))"
RESP="$(curl -s -m 300 -X POST "http://$TV:8091/install" \
  -H "x-homebrew-pin: $PIN" \
  -H "x-homebrew-name: $NAME" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$FILE")"
echo "$RESP"
echo "$RESP" | grep -q '"ok":true' || exit 1

# Launch it if the response tells us the appId.
APPID="$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("appId",""))' 2>/dev/null || true)"
if [ -n "$APPID" ]; then
  echo "launching $APPID"
  curl -s -m 10 -X POST "http://$TV:8001/api/v2/applications/$APPID" -o /dev/null -w "launch → HTTP %{http_code}\n" || true
fi

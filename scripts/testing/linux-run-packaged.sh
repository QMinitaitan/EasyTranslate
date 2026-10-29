#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo 'Usage: bash linux-run-packaged.sh VALIDATION_ROOT FRESH_LABEL PREPARED_ENV_SH' >&2
  exit 2
fi
validation=$(realpath "$1")
[[ "$2" =~ ^[a-zA-Z0-9-]+$ ]] || { echo 'Use a simple fresh label' >&2; exit 2; }
label=$2
[[ ! -e "$validation/runtime-$label" && ! -e "$validation/logs/runtime-$label.log" ]] || { echo 'Runtime output or log already exists; use a fresh label' >&2; exit 2; }
source "$3"
export TMPDIR="$validation/tmp" TMP="$validation/tmp" TEMP="$validation/tmp"
mkdir -p "$TMPDIR" "$validation/fonts" "$validation/font-cache"
cat > "$validation/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$ET_LINUX/rootfs/usr/share/fonts</dir>
  <dir>/usr/share/fonts</dir>
  <dir>$validation/fonts</dir>
  <cachedir>$validation/font-cache</cachedir>
</fontconfig>
EOF
# WSL host font is read-only and optional. Other hosts can use installed CJK fonts.
if [[ -f /mnt/c/Windows/Fonts/msyh.ttc ]]; then
  ln -sfn /mnt/c/Windows/Fonts/msyh.ttc "$validation/fonts/host-msyh.ttc"
fi
export FONTCONFIG_FILE="$validation/fonts.conf"
export LIBGL_DRIVERS_PATH="$ET_LINUX/rootfs/usr/lib/x86_64-linux-gnu/dri"
unset NODE_OPTIONS NODE_PATH ELECTRON_RUN_AS_NODE VITE_DEV_SERVER_URL
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# The controller creates, verifies, archives and removes its own small native
# /tmp HOME. Large Electron profiles, caches, logs and captures stay in validation.
node "$script_dir/linux-packaged-validation.cjs" \
  "$validation/installed/opt/EasyTranslate/easytranslate" "$validation/runtime-$label" \
  > "$validation/logs/runtime-$label.log" 2>&1
cat "$validation/logs/runtime-$label.log"

#!/usr/bin/env bash
# Run from a fresh git archive; never installs a package or publishes a release.
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo 'Usage: bash linux-build-validation.sh SOURCE OUTPUT PREPARED_ENV_SH' >&2
  exit 2
fi
source_dir=$(realpath "$1")
output=$(realpath "$2")
source "$3"
case "$source_dir/" in "$output/"*) ;; *) echo 'Source must live inside the owned output directory' >&2; exit 2;; esac
mkdir -p "$output"/{logs,home,config,cache,data,tmp,package,installed}
export HOME="$output/home" XDG_CONFIG_HOME="$output/config" XDG_CACHE_HOME="$output/cache" XDG_DATA_HOME="$output/data"
export TMPDIR="$output/tmp" TMP="$output/tmp" TEMP="$output/tmp"
unset NODE_OPTIONS NODE_PATH ELECTRON_RUN_AS_NODE VITE_DEV_SERVER_URL
cd "$source_dir"
{
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  uname -a
  cat /etc/os-release
  id
  node --version
  npm --version
  printf 'node='; command -v node
  printf 'npm='; command -v npm
  printf 'HOME=%s\nTMPDIR=%s\nELECTRON_BUILDER_CACHE=%s\n' "$HOME" "$TMPDIR" "$ELECTRON_BUILDER_CACHE"
} > "$output/logs/environment.txt"
npm ci --prefer-offline --no-audit --no-fund > "$output/logs/npm-ci.log" 2>&1
npm run check > "$output/logs/check.log" 2>&1
# Reuse the checksum-verified native Linux Electron, rather than re-downloading it.
./node_modules/.bin/electron-builder --linux deb --x64 --publish never \
  "--config.electronDist=$ET_LINUX/project-prereqs/node_modules/electron/dist" \
  "--config.directories.output=$output/package" > "$output/logs/package.log" 2>&1
artifact="$output/package/EasyTranslate-0.0.2-amd64.deb"
if [[ ! -f "$artifact" ]]; then
  mapfile -t artifacts < <(find "$output/package" -maxdepth 1 -type f -name '*.deb')
  [[ ${#artifacts[@]} -eq 1 ]] || { echo 'Expected one .deb artifact' >&2; exit 1; }
  artifact=${artifacts[0]}
fi
dpkg-deb --info "$artifact" > "$output/logs/deb-info.txt"
dpkg-deb --contents "$artifact" > "$output/logs/deb-contents.txt"
dpkg-deb --field "$artifact" > "$output/logs/deb-control.txt"
dpkg-deb --extract "$artifact" "$output/installed"
sha256sum "$artifact" "$output/installed/opt/EasyTranslate/resources/app.asar" \
  "$output/package/linux-unpacked/resources/app.asar" > "$output/logs/artifact-sha256.txt"
echo "$artifact" > "$output/logs/artifact-path.txt"
printf 'Native Linux check and .deb extraction complete: %s\n' "$output"

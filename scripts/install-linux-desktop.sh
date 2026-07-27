#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
DATA_ROOT="${XDG_DATA_HOME:-${HOME}/.local/share}"
APPLICATIONS_DIR="${DATA_ROOT}/applications"
ICON_DIR="${DATA_ROOT}/icons/hicolor/256x256/apps"
DESKTOP_TEMPLATE="${APP_ROOT}/packaging/linux/easytranslate.desktop.in"
DESKTOP_FILE="${APPLICATIONS_DIR}/easytranslate.desktop"
ICON_SOURCE="${APP_ROOT}/assets/icon-v3/easytranslate-mark-256.png"
ICON_FILE="${ICON_DIR}/easytranslate.png"

mkdir -p "${APPLICATIONS_DIR}" "${ICON_DIR}"
install -m 0644 "${ICON_SOURCE}" "${ICON_FILE}"

TEMP_DESKTOP="$(mktemp)"
trap 'rm -f "${TEMP_DESKTOP}"' EXIT
sed \
  -e "s|@APP_ROOT@|${APP_ROOT}|g" \
  -e "s|@ICON_PATH@|${ICON_FILE}|g" \
  "${DESKTOP_TEMPLATE}" > "${TEMP_DESKTOP}"
install -m 0644 "${TEMP_DESKTOP}" "${DESKTOP_FILE}"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${APPLICATIONS_DIR}"
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${DATA_ROOT}/icons/hicolor"
fi

echo "Installed ${DESKTOP_FILE}"
echo "Installed ${ICON_FILE}"

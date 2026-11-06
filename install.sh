#!/usr/bin/env bash
# ==============================================================================
# Tycho installer — installs the Tycho core (single executable) from git.qtrn.io
#   curl -fsSL https://qtrn.io/install.sh | bash
# Options (environment variables):
#   TYCHO_VERSION=v1.0.0          version to install (default: v1.0.0)
#   TYCHO_MODULES="forge security" modules to install right after the core
#   TYCHO_BASE_URL=...            release mirror (default: git.qtrn.io releases)
#   TYCHO_INSTALL_DIR=...         target directory (default: ~/.local/bin, or
#                                 /usr/local/bin when run as root)
# License: AGPL-3.0-only | Copyright: Quatrain Technologies
# ==============================================================================
set -euo pipefail

VERSION="${TYCHO_VERSION:-v1.0.0}"
BASE_URL="${TYCHO_BASE_URL:-https://git.qtrn.io/tycho/tycho/releases/download/${VERSION}}"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD="\033[1m"; GREEN="\033[0;32m"; RED="\033[0;31m"; DIM="\033[2m"; NC="\033[0m"
else
  BOLD=""; GREEN=""; RED=""; DIM=""; NC=""
fi

fail() {
  echo -e "${RED}✖ $*${NC}" >&2
  exit 1
}

# 1. Platform
case "$(uname -s)" in
  Linux)  OS_NAME="linux" ;;
  Darwin) OS_NAME="darwin" ;;
  *)      fail "unsupported operating system: $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64|amd64)  ARCH_NAME="amd64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *)             fail "unsupported architecture: $(uname -m)" ;;
esac
ASSET="tycho-${OS_NAME}-${ARCH_NAME}"

# 2. Target directory
if [ -n "${TYCHO_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$TYCHO_INSTALL_DIR"
elif [ "$(id -u)" -eq 0 ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${HOME}/.local/bin"
fi
mkdir -p "$INSTALL_DIR"

# 3. Download and verify (SHA-256 published with the release)
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
echo -e "Installing ${BOLD}Tycho ${VERSION}${NC} (${ASSET}) into ${INSTALL_DIR}"
curl -fsSL "${BASE_URL}/${ASSET}" -o "${TMP_DIR}/${ASSET}" || fail "download failed: ${BASE_URL}/${ASSET}"
curl -fsSL "${BASE_URL}/SHA256SUMS" -o "${TMP_DIR}/SHA256SUMS" || fail "download failed: ${BASE_URL}/SHA256SUMS"

EXPECTED="$(awk -v f="$ASSET" '$2 == f { print $1 }' "${TMP_DIR}/SHA256SUMS")"
[ -n "$EXPECTED" ] || fail "no checksum published for ${ASSET}"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "${TMP_DIR}/${ASSET}" | awk '{ print $1 }')"
else
  ACTUAL="$(shasum -a 256 "${TMP_DIR}/${ASSET}" | awk '{ print $1 }')"
fi
[ "$EXPECTED" = "$ACTUAL" ] || fail "checksum mismatch for ${ASSET}: refusing to install"

install -m 0755 "${TMP_DIR}/${ASSET}" "${INSTALL_DIR}/tycho"
echo -e "${GREEN}✔${NC} $("${INSTALL_DIR}/tycho" version) ${DIM}(sha256 verified)${NC}"

# 4. Optional modules
if [ -n "${TYCHO_MODULES:-}" ]; then
  # shellcheck disable=SC2086
  "${INSTALL_DIR}/tycho" module add ${TYCHO_MODULES}
fi

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *) echo -e "Add ${BOLD}${INSTALL_DIR}${NC} to your PATH to run ${BOLD}tycho${NC}." ;;
esac
echo -e "Next: ${BOLD}tycho module add forge${NC} (see ${BOLD}tycho help${NC} for all modules)"

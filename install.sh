#!/bin/bash

# Tycho - Quick Installer
# Designed for robust system-wide or user-only installation with interactive configurations.
# Co-authored by Antigravity (Google DeepMind)

set -e

REPO_USER="crapougnax"
REPO_NAME="tycho"
# Allow specifying target version via environment variable, defaults to 'latest' release
TYCHO_VERSION="${TYCHO_VERSION:-latest}"

if [[ "$TYCHO_VERSION" == "latest" ]]; then
    # Resolve the latest release tag (including pre-releases) dynamically from GitHub API
    RESOLVED_TAG=""
    RESOLVED_TAG=$(curl -s -f "https://api.github.com/repos/$REPO_USER/$REPO_NAME/releases" | jq -r '.[0].tag_name' 2>/dev/null)
    if [[ $? -eq 0 ]] && [[ -n "$RESOLVED_TAG" ]] && [[ "$RESOLVED_TAG" != "null" ]]; then
        DOWNLOAD_URL="https://github.com/$REPO_USER/$REPO_NAME/releases/download/$RESOLVED_TAG/tycho"
    else
        # Point to the asset inside the latest GitHub Release as a safe fallback
        DOWNLOAD_URL="https://github.com/$REPO_USER/$REPO_NAME/releases/latest/download/tycho"
    fi
elif [[ "$TYCHO_VERSION" =~ ^v[0-9] ]]; then
    # Point to a specific tagged GitHub Release asset
    DOWNLOAD_URL="https://github.com/$REPO_USER/$REPO_NAME/releases/download/$TYCHO_VERSION/tycho"
else
    # Fallback to downloading directly from a raw branch (e.g., 'main' or 'dev')
    DOWNLOAD_URL="https://raw.githubusercontent.com/$REPO_USER/$REPO_NAME/$TYCHO_VERSION/tycho"
fi

# Colors for premium UI
GREEN="\e[32m"
YELLOW="\e[33m"
RED="\e[31m"
BLUE="\e[34m"
BOLD="\e[1m"
NC="\e[0m"

echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "${BLUE}${BOLD}          TYCHO QUICK INSTALLER         ${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}"
echo ""

# Detect OS
OS_TYPE="$(uname -s)"

# -------------------------------------------------------------
# Helper Functions
# -------------------------------------------------------------

# Detect package manager
detect_package_manager() {
    if command -v apt-get &>/dev/null; then
        echo "apt"
    elif command -v dnf &>/dev/null; then
        echo "dnf"
    elif command -v pacman &>/dev/null; then
        echo "pacman"
    elif command -v zypper &>/dev/null; then
        echo "zypper"
    elif command -v brew &>/dev/null; then
        echo "brew"
    else
        echo "unknown"
    fi
}

# Install Podman using system package manager
install_podman() {
    local pm=$1
    echo -e "${BLUE}Installing Podman via $pm...${NC}"
    case "$pm" in
        apt)
            sudo apt-get update
            sudo apt-get install -y podman dbus-user-session uidmap
            ;;
        dnf)
            sudo dnf install -y podman
            ;;
        pacman)
            sudo pacman -S --noconfirm podman
            ;;
        zypper)
            sudo zypper install -y podman
            ;;
        brew)
            brew install podman
            ;;
        *)
            echo -e "${RED}Unknown package manager. Please install Podman manually.${NC}"
            exit 1
            ;;
    esac
}

# Install jq using system package manager
install_jq() {
    local pm=$1
    echo -e "${BLUE}Installing jq via $pm...${NC}"
    case "$pm" in
        apt)
            sudo apt-get update
            sudo apt-get install -y jq
            ;;
        dnf)
            sudo dnf install -y jq
            ;;
        pacman)
            sudo pacman -S --noconfirm jq
            ;;
        zypper)
            sudo zypper install -y jq
            ;;
        brew)
            brew install jq
            ;;
        *)
            echo -e "${RED}Unknown package manager. Please install jq manually.${NC}"
            exit 1
            ;;
    esac
}

# Read input from the controlling terminal if available, with a fallback for non-interactive environments.
# This prevents reading lines of the script itself when running the installer via piping (e.g., curl | bash).
# Arguments:
#   1: Prompt message to display
#   2: Variable name to store the result
#   3: Default value if no input is provided
safe_read() {
    local prompt="$1"
    local var_name="$2"
    local default_val="$3"
    local response=""

    if [[ -t 0 ]]; then
        read -rp "$prompt" response
    elif [[ -c /dev/tty ]]; then
        # Group and redirect stderr to suppress shell redirection errors if /dev/tty is not openable
        { read -rp "$prompt" response </dev/tty; } 2>/dev/null || response=""
    else
        # Fallback for non-interactive execution (e.g., CI/CD)
        response=""
    fi

    # Assign value with default fallback using printf -v to prevent shell injection or quoting issues
    printf -v "$var_name" "%s" "${response:-$default_val}"
}

# -------------------------------------------------------------
# 1. Choose installation type for Tycho CLI
# -------------------------------------------------------------
echo -e "${BOLD}1. Select installation scope for Tycho CLI:${NC}"
echo "   1) System-wide (installs to /usr/local/bin, requires sudo/root)"
echo "   2) User-only (installs to $HOME/.local/bin, no root required)"
safe_read "Choice [1-2, default: 2]: " cli_choice 2

if [[ "$cli_choice" -eq 1 ]]; then
    CLI_INSTALL_DIR="/usr/local/bin"
    USE_SUDO=true
    echo -e "${GREEN}Scope selected: System-wide${NC}"
else
    CLI_INSTALL_DIR="$HOME/.local/bin"
    USE_SUDO=false
    echo -e "${GREEN}Scope selected: User-only${NC}"
fi
echo ""

# -------------------------------------------------------------
# 2. Check / Install System Dependencies (Podman & jq)
# -------------------------------------------------------------
echo -e "${BOLD}2. Checking system dependencies...${NC}"

# Check Podman
if command -v podman &>/dev/null; then
    PODMAN_VERSION=$(podman --version)
    echo -e "${GREEN}Podman is already installed: $PODMAN_VERSION${NC}"
    INSTALL_PODMAN_REQUIRED=false
else
    echo -e "${YELLOW}Podman was not found on your system.${NC}"
    INSTALL_PODMAN_REQUIRED=true
fi

# Check jq
if command -v jq &>/dev/null; then
    echo -e "${GREEN}jq is already installed.${NC}"
    INSTALL_JQ_REQUIRED=false
else
    echo -e "${YELLOW}jq (JSON processor) is required but was not found on your system.${NC}"
    INSTALL_JQ_REQUIRED=true
fi

echo ""

if [[ "$INSTALL_PODMAN_REQUIRED" == "true" || "$INSTALL_JQ_REQUIRED" == "true" ]]; then
    echo -e "Would you like the installer to attempt to install missing dependencies?"
    if [[ "$INSTALL_PODMAN_REQUIRED" == "true" ]]; then
        echo "   - Podman"
    fi
    if [[ "$INSTALL_JQ_REQUIRED" == "true" ]]; then
        echo "   - jq"
    fi
    echo "   1) Yes, install missing dependencies (requires sudo/root)"
    echo "   2) No, skip dependency installation"
    safe_read "Choice [1-2, default: 2]: " dep_choice 2

    if [[ "$dep_choice" -eq 1 ]]; then
        PM=$(detect_package_manager)
        if [[ "$PM" == "unknown" ]]; then
            echo -e "${RED}Could not automatically detect your package manager. Please install missing dependencies manually.${NC}"
            exit 1
        fi
        
        if [[ "$INSTALL_PODMAN_REQUIRED" == "true" ]]; then
            install_podman "$PM"
        fi
        if [[ "$INSTALL_JQ_REQUIRED" == "true" ]]; then
            install_jq "$PM"
        fi
    else
        echo -e "${YELLOW}Skipping dependency installation. Please make sure both Podman and jq are installed before running Tycho.${NC}"
    fi
    echo ""
fi

# -------------------------------------------------------------
# 3. Configure Rootless/User optimization for Podman (Linux only)
# -------------------------------------------------------------
if [[ "$OS_TYPE" == "Linux" ]]; then
    echo -e "${BOLD}3. Rootless Podman Configuration:${NC}"
    echo "   To deploy web apps like Traefik in user (rootless) mode, it is recommended to:"
    echo "   - Enable user session lingering (keeps containers running after logout)."
    echo "   - Allow unprivileged port binding below 1024 (for ports 80/443)."
    echo ""
    echo "   1) Yes, optimize rootless Podman (recommended)"
    echo "   2) No, skip optimization"
    safe_read "Choice [1-2, default: 1]: " optimize_choice 1

    if [[ "$optimize_choice" -eq 1 ]]; then
        echo -e "${BLUE}Configuring user session lingering...${NC}"
        loginctl enable-linger "$USER" || echo -e "${YELLOW}Warning: Could not enable lingering. Make sure systemd-logind is active.${NC}"

        echo -e "${BLUE}Allowing unprivileged port binding (<1024) for Traefik...${NC}"
        # We write to sysctl config to persist across reboots and apply immediately
        if sudo tee /etc/sysctl.d/99-rootless.conf <<EOF >/dev/null
net.ipv4.ip_unprivileged_port_start=0
EOF
        then
            sudo sysctl --system
            echo -e "${GREEN}Successfully configured unprivileged ports (<1024).${NC}"
        else
            echo -e "${RED}Failed to configure sysctl. You might need to configure this manually.${NC}"
        fi
    else
        echo -e "${YELLOW}Skipping rootless Podman optimization.${NC}"
    fi
    echo ""
fi

# -------------------------------------------------------------
# 4. Download and Install Tycho CLI
# -------------------------------------------------------------
echo -e "${BOLD}4. Installing Tycho CLI...${NC}"
mkdir -p "$CLI_INSTALL_DIR"

tmp_file=$(mktemp)
download_success=false

if curl -fsSL "$DOWNLOAD_URL" -o "$tmp_file"; then
    download_success=true
elif [[ "$TYCHO_VERSION" == "latest" ]]; then
    echo -e "${YELLOW}Warning: Failed to download release asset from $DOWNLOAD_URL.${NC}" >&2
    echo -e "Falling back to downloading directly from the main branch..." >&2
    DOWNLOAD_URL="https://raw.githubusercontent.com/$REPO_USER/$REPO_NAME/main/tycho"
    if curl -fsSL "$DOWNLOAD_URL" -o "$tmp_file"; then
        download_success=true
    fi
fi

if [[ "$download_success" == "true" ]]; then
    chmod +x "$tmp_file"
    if [[ "$USE_SUDO" == "true" ]]; then
        echo -e "Installing to $CLI_INSTALL_DIR/tycho (requires sudo)..."
        sudo cp "$tmp_file" "$CLI_INSTALL_DIR/tycho"
    else
        echo -e "Installing to $CLI_INSTALL_DIR/tycho..."
        cp "$tmp_file" "$CLI_INSTALL_DIR/tycho"
    fi
    rm -f "$tmp_file"
else
    rm -f "$tmp_file"
    echo -e "${RED}Error: Failed to download Tycho CLI from $DOWNLOAD_URL.${NC}" >&2
    echo -e "${RED}The release might still be publishing on GitHub. Please try again in a few minutes.${NC}" >&2
    exit 1
fi

# Initialize workspace directories
if [[ "$cli_choice" -eq 1 ]]; then
    echo "Initializing system-wide config directory..."
    sudo mkdir -p "/etc/tycho/podman/core" "/etc/tycho/podman/recipes"
else
    echo "Initializing user config directory..."
    mkdir -p "$HOME/.tycho/podman/core" "$HOME/.tycho/podman/recipes"
fi

# Save active version number
if [[ "$TYCHO_VERSION" == "latest" ]]; then
    RESOLVED_VERSION=""
    RESOLVED_VERSION=$(curl -s -f "https://api.github.com/repos/$REPO_USER/$REPO_NAME/releases" | jq -r '.[0].tag_name' 2>/dev/null)
    if [[ $? -ne 0 ]] || [[ -z "$RESOLVED_VERSION" ]] || [[ "$RESOLVED_VERSION" == "null" ]]; then
        RESOLVED_VERSION="latest"
    fi
else
    RESOLVED_VERSION="$TYCHO_VERSION"
fi

if [[ "$cli_choice" -eq 1 ]]; then
    echo "$RESOLVED_VERSION" | sudo tee /etc/tycho/version >/dev/null
else
    echo "$RESOLVED_VERSION" > "$HOME/.tycho/version"
fi

# Check if installation directory is in PATH (if user-only)
if [[ "$USE_SUDO" == "false" ]] && [[ ":$PATH:" != *":$CLI_INSTALL_DIR:"* ]]; then
    echo ""
    echo -e "${YELLOW}${BOLD}WARNING: $CLI_INSTALL_DIR is not in your PATH!${NC}"
    echo -e "To run tycho easily, add it to your profile (e.g., ~/.bashrc or ~/.zshrc):"
    echo -e "  ${BOLD}export PATH=\"\$PATH:\$HOME/.local/bin\"${NC}"
fi

# -------------------------------------------------------------
# 5. Success
# -------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}Tycho CLI has been installed successfully!${NC}"
if [[ "$cli_choice" -eq 1 ]]; then
    echo -e "Run '${BOLD}sudo tycho setup${NC}' to begin your system-wide configuration."
else
    echo -e "Run '${BOLD}tycho setup${NC}' to begin your user-only configuration."
fi
echo ""

#!/bin/bash

# Tycho - Quick Installer
# Designed for robust system-wide or user-only installation with interactive configurations.
# Co-authored by Antigravity (Google DeepMind)

set -e

REPO_USER="crapougnax"
REPO_NAME="tycho"
REPO_BRANCH="main"
GITHUB_RAW="https://raw.githubusercontent.com/$REPO_USER/$REPO_NAME/$REPO_BRANCH"

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

    if [ -t 0 ]; then
        read -rp "$prompt" response
    elif [ -c /dev/tty ]; then
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
# 2. Check / Install Podman
# -------------------------------------------------------------
echo -e "${BOLD}2. Checking Podman installation...${NC}"
if command -v podman &>/dev/null; then
    PODMAN_VERSION=$(podman --version)
    echo -e "${GREEN}Podman is already installed: $PODMAN_VERSION${NC}"
    INSTALL_PODMAN_REQUIRED=false
else
    echo -e "${YELLOW}Podman was not found on your system.${NC}"
    INSTALL_PODMAN_REQUIRED=true
fi

if [[ "$INSTALL_PODMAN_REQUIRED" == "true" ]]; then
    echo "   Would you like the installer to attempt to install Podman?"
    echo "   1) Yes, install system-wide (requires sudo/root)"
    echo "   2) No, skip Podman installation"
    safe_read "Choice [1-2, default: 2]: " podman_choice 2

    if [[ "$podman_choice" -eq 1 ]]; then
        PM=$(detect_package_manager)
        if [[ "$PM" == "unknown" ]]; then
            echo -e "${RED}Could not automatically detect your package manager. Please install Podman manually.${NC}"
            exit 1
        fi
        install_podman "$PM"
    else
        echo -e "${YELLOW}Skipping Podman installation. Please make sure it is installed before running Tycho.${NC}"
    fi
fi
echo ""

# -------------------------------------------------------------
# 3. Configure Rootless/User optimization for Podman (Linux only)
# -------------------------------------------------------------
if [[ "$OS_TYPE" == "Linux" ]]; then
    echo -e "${BOLD}3. Rootless Podman Configuration:${NC}"
    echo "   To deploy web apps like Traefik in user (rootless) mode, it is recommended to:"
    echo "   - Enable user session lingering (keeps containers running after logout)."
    echo "   - Allow unprivileged port binding below 1024 (for ports 80/443)."
    echo ""
    safe_read "Optimize rootless Podman for the current user ($USER)? (Y/n): " optimize_choice y

    if [[ "$optimize_choice" =~ ^[Yy]$ ]]; then
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

if [[ "$USE_SUDO" == "true" ]]; then
    echo -e "Downloading to $CLI_INSTALL_DIR/tycho (requires sudo)..."
    sudo curl -fsSL "$GITHUB_RAW/tycho" -o "$CLI_INSTALL_DIR/tycho"
    sudo chmod +x "$CLI_INSTALL_DIR/tycho"
else
    echo -e "Downloading to $CLI_INSTALL_DIR/tycho..."
    curl -fsSL "$GITHUB_RAW/tycho" -o "$CLI_INSTALL_DIR/tycho"
    chmod +x "$CLI_INSTALL_DIR/tycho"
fi

# Initialize workspace directories
if [[ "$cli_choice" -eq 1 ]]; then
    echo "Initializing system-wide config directory..."
    sudo mkdir -p "/etc/tycho/podman/core" "/etc/tycho/podman/recipes"
else
    echo "Initializing user config directory..."
    mkdir -p "$HOME/.tycho/podman/core" "$HOME/.tycho/podman/recipes"
fi

# Check if installation directory is in PATH (if user-only)
if [[ "$USE_SUDO" == "false" ]]; then
    if [[ ":$PATH:" != *":$CLI_INSTALL_DIR:"* ]]; then
        echo ""
        echo -e "${YELLOW}${BOLD}WARNING: $CLI_INSTALL_DIR is not in your PATH!${NC}"
        echo -e "To run tycho easily, add it to your profile (e.g., ~/.bashrc or ~/.zshrc):"
        echo -e "  ${BOLD}export PATH=\"\$PATH:\$HOME/.local/bin\"${NC}"
    fi
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

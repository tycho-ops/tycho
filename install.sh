#!/bin/bash

# Tycho - Quick Installer

set -e

REPO_USER="crapougnax" # To be updated by user
REPO_NAME="tycho"
REPO_BRANCH="main"
GITHUB_RAW="https://raw.githubusercontent.com/$REPO_USER/$REPO_NAME/$REPO_BRANCH"

echo "--- Tycho Installer ---"

# 1. Download CLI
echo "Downloading Tycho CLI..."
sudo curl -fsSL "$GITHUB_RAW/tycho" -o /usr/local/bin/tycho
sudo chmod +x /usr/local/bin/tycho

# 2. Initialize work dir
echo "Initializing ~/.tycho directory..."
mkdir -p "$HOME/.tycho/podman/core" "$HOME/.tycho/podman/recipes"

# 3. Success
echo ""
echo "Tycho CLI has been installed successfully!"
echo "Run 'tycho setup' to begin."
echo ""

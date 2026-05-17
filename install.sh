#!/bin/bash

# Sovereign - Quick Installer

set -e

REPO_USER="crapougnax" # To be updated by user
REPO_NAME="sovereign"
REPO_BRANCH="master"
GITHUB_RAW="https://raw.githubusercontent.com/$REPO_USER/$REPO_NAME/$REPO_BRANCH"

echo "--- Sovereign Installer ---"

# 1. Download CLI
echo "Downloading Sovereign CLI..."
sudo curl -fsSL "$GITHUB_RAW/sovereign" -o /usr/local/bin/sovereign
sudo chmod +x /usr/local/bin/sovereign

# 2. Initialize work dir
echo "Initializing ~/.sovereign directory..."
mkdir -p "$HOME/.sovereign/podman/core" "$HOME/.sovereign/podman/recipes"

# 3. Success
echo ""
echo "Sovereign CLI has been installed successfully!"
echo "Run 'sovereign setup' to begin."
echo ""

#!/usr/bin/env bash
set -euo pipefail

# Print info header
echo "===================================================="
echo "Preparing DevSecOps Lab Environment (Rootless Podman)"
echo "===================================================="

# 1. Create local directories for volumes
echo "Creating directories: ./data/juiceshop and ./reports..."
mkdir -p ./data/juiceshop ./reports

# 2. Align permissions for rootless UID/GID 1000
# Inside rootless container namespace, user 1000:1000 maps to a subuid range on the host.
# We must use 'podman unshare' to perform chown within the rootless user namespace mapping.
if command -v podman &> /dev/null; then
    echo "Aligning directories permissions for UID/GID 1000 using 'podman unshare'..."
    podman unshare chown -R 1000:1000 ./data/juiceshop ./reports
else
    echo "Warning: podman not found. Falling back to standard chown (requires root privileges)..."
    chown -R 1000:1000 ./data/juiceshop ./reports || {
        echo "Error: Standard chown failed. Run as root or make sure podman is installed."
        exit 1
    }
fi

echo "Environment successfully prepared!"
echo "===================================================="
exit 0

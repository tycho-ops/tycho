#!/bin/bash

# Ollama Pre-installer hook
# Detects NVIDIA GPU presence and offers to enable acceleration.

ENV_FILE="$1"
gpu_detected=false

if command -v nvidia-smi &>/dev/null || [ -c /dev/nvidia0 ]; then
    gpu_detected=true
fi

# Only prompt if GPU is detected AND it hasn't been enabled already (checking for #gpu# comments)
if [[ "$gpu_detected" == "true" ]] && grep -q '#gpu#' compose.yaml; then
    echo -e "\n\e[32m[Ollama] NVIDIA GPU detected on your system!\e[0m"
    echo "Do you want to enable GPU acceleration in the Tycho recipe?"
    echo "  1) Yes, enable GPU acceleration (recommended)"
    echo "  2) No, use CPU-only mode"
    read -p "Choice [1-2, default: 1]: " gpu_choice
    gpu_choice=${gpu_choice:-1}

    if [[ "$gpu_choice" -eq 1 ]]; then
        echo "Enabling GPU acceleration inside compose.yaml..."
        # Strip the '#gpu#' comment placeholders to activate the deploy configurations
        sed -i 's/#gpu#//g' compose.yaml
        echo -e "\e[32m[OK] GPU acceleration enabled successfully!\e[0m\n"
    else
        echo -e "\e[33m[Ollama] GPU acceleration skipped. Running in CPU-only mode.\e[0m\n"
    fi
fi

#!/bin/bash

# Ollama Post-installer hook
# Offers to pull a default LLM model to ensure immediate usability.

ENV_FILE="$1"

# Safe read helper to support piped or non-interactive environments cleanly
safe_read() {
    local prompt="$1"
    local var_name="$2"
    local default_val="$3"
    local response=""

    if [ -t 0 ]; then
        read -rp "$prompt" response
    elif [ -c /dev/tty ]; then
        { read -rp "$prompt" response </dev/tty; } 2>/dev/null || response=""
    else
        response=""
    fi

    printf -v "$var_name" "%s" "${response:-$default_val}"
}

# Find Ollama container name dynamically
container_name=$(podman ps --filter "label=com.docker.compose.service=ollama" --format "{{.Names}}" | head -n 1)
container_name=${container_name:-ollama-ollama-1}

echo -e "\n\e[32m[Ollama] Service is running!\e[0m"
echo "Ollama requires models to be downloaded (pulled) before serving requests."
echo "Would you like to pull a default model now?"
echo "  1) Llama 3 (8B - Recommended for general use) [llama3]"
echo "  2) Mistral (7B - Great balance of speed and power) [mistral]"
echo "  3) Gemma 2 (9B - Google's state-of-the-art open model) [gemma2]"
echo "  4) Phi 3 (3.8B - Ultra lightweight & fast) [phi3]"
echo "  5) Enter a custom model name manually"
echo "  6) Skip / Do not pull a model right now"
safe_read "Choice [1-6, default: 6]: " model_choice 6

model_name=""
case "$model_choice" in
    1) model_name="llama3" ;;
    2) model_name="mistral" ;;
    3) model_name="gemma2" ;;
    4) model_name="phi3" ;;
    5)
        safe_read "Enter custom model name (e.g., codegemma, qwen2): " custom_model ""
        model_name="$custom_model"
        ;;
    *)
        echo -e "[Ollama] Skipping model download. You can download models manually later using:"
        echo -e "  \e[34mpodman exec -it $container_name ollama pull <model-name>\e[0m\n"
        exit 0
        ;;
esac

if [[ -n "$model_name" ]]; then
    echo -e "\n[Ollama] Pulling model '$model_name' inside container '$container_name'..."
    echo -e "This might take a few minutes depending on your internet connection."
    podman exec -it "$container_name" ollama pull "$model_name"
    echo -e "\e[32m[OK] Model '$model_name' successfully pulled!\e[0m\n"
fi

#!/bin/bash

# Open Notebook Pre-installer hook
# Generates a secure random encryption key if not already configured.

ENV_FILE="$1"

# Check if OPEN_NOTEBOOK_ENCRYPTION_KEY is already defined in .env
if ! grep -q "^OPEN_NOTEBOOK_ENCRYPTION_KEY=" "$ENV_FILE"; then
    echo "Generating secure random encryption key for Open Notebook..."
    # Generate random key
    SECURE_KEY=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 64)
    echo "OPEN_NOTEBOOK_ENCRYPTION_KEY=$SECURE_KEY" >> "$ENV_FILE"
    echo -e "\e[32m[OK] Generated and added OPEN_NOTEBOOK_ENCRYPTION_KEY to $ENV_FILE\e[0m"
fi

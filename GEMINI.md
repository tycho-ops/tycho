# Tycho: Co-Development Principles

This document defines the foundational mandates and architectural principles for the Tycho project. It serves as a guide for AI agents and human contributors to maintain consistency and integrity.

## 1. Architectural Mandates

- **Podman Centric**: All container management must use `podman`. Support for both rootless (User Mode) and rootful (System Mode) is mandatory.
- **Infrastructure Isolation**: 
    - **System Mode**: Infrastructure components like Traefik or VPNs should run as system-level services (Rootful/systemd) when managing host-level resources (ports 80/443).
    - **User Mode**: Applications must run in the user's rootless space.
- **Storage Separation**: Enforce strict isolation in shared environments. Data must be structured as `${BASE_STORAGE_PATH}/${USER}/${APP_NAME}` to allow for future quota management.

## 2. CLI Development Standards

- **Standalone & Lightweight**: The `tycho` CLI is a single Bash script. Avoid heavy dependencies. Use standard tools like `curl`, `jq`, and `ss`.
- **GitHub as Source of Truth**: The CLI must fetch recipes and updates dynamically from the remote repository. No local cloning of the full repo should be required for end-users.
- **Interactive Safeguards**: Every destructive action (`uninstall`, `overwrite`) must require explicit user confirmation.
- **Smart Configuration**: Use `.env.dist` as a template. Automatically prompt for missing required variables defined in a recipe's `package.json`.

## 3. Recipe Standards

- **Metadata First**: Every recipe folder must contain a `package.json` with at least:
- `name`: Unique identifier.
- `description`: Short title for `tycho list`.
- `requiredEnv`: List of mandatory environment variables.
- **Standardized Naming**: Use the format `${APPNAME}_SUBDOMAIN` for routing variables to prevent environment collisions.
- **Documentation**: A `README.md` is mandatory for each recipe to provide original project credits and specific usage instructions.

## 4. Security & Best Practices

- **Zero Secret Exposure**: Never hardcode keys or tokens. Use environment variables exclusively.
- **Least Privilege**: Favor rootless execution for all applications. Only use root for core network gateway components.
- **Persistence**: Always prefer persistent volumes over container storage. Ask for cleanup during uninstallation to prevent "ghost" data.

## 5. Development Workflow

- **Compatibility**: Any new feature must be tested for both single-user (home dir) and multi-user (shared `/data`) scenarios.
- **Versioning**: Maintain backward compatibility for recipes when updating the CLI logic.
- **Documentation**: Update the `HOWTO.md` for any new command or configuration logic.

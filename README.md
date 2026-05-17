# Sovereign

Sovereign is an autonomous server management CLI designed to deploy and manage a complete, self-hosted infrastructure using Podman. It supports two primary deployment patterns.

## Key Features

- **Standalone CLI**: One tool to rule them all.
- **Dynamic Recipes**: Fetches the latest configurations directly from GitHub.
- **Rootless First**: Optimized for rootless Podman environments with strict user isolation.
- **Automated Storage**: Each user gets their own isolated storage space (e.g., `/data/users/username/app`).
- **Smart Routing**: Automatic Traefik detection and subdomain conflict checks.

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/crapougnax/sovereign/main/install.sh | bash
```

---

## 🏗 Choose your Architecture

### 1. Personal Server (Full User Mode)
The easiest way for a single user. Everything (including Traefik) runs in your user space.
- **Prerequisite**: Allow binding to ports 80/443:
  `echo "net.ipv4.ip_unprivileged_port_start=0" | sudo tee /etc/sysctl.d/99-rootless.conf && sudo sysctl --system`
- **Workflow**:
  ```bash
  sovereign setup
  sovereign install traefik    # Installs core/traefik in your home
  sovereign install core/smtp
  sovereign install immich     # Or any other recipe
  ```

### 2. Infrastructure Server (Shared/System Mode)
More robust. Traefik is a system-level gateway, and users install their apps separately.
- **Step A (Admin)**: Install the system gateway:
  ```bash
  sudo sovereign setup
  sudo sovereign install traefik  # Creates a systemd service
  ```
- **Step B (Users)**: Install personal apps:
  ```bash
  sovereign setup
  sovereign install immich
  ```

---

## Commands

- `sovereign setup`: Interactive assistant to configure your domain and email.
- `sovereign list`: Explore available recipes on GitHub.
- `sovereign install <pkg>`: Deploy a new service (interactive).
- `sovereign uninstall <pkg>`: Cleanly remove a service and its data.
- `sovereign stats`: Monitor your server's health.
- `sovereign upgrade`: Self-update the CLI to the latest version.

## License

GNU AGPL-v3. See [LICENSE](LICENSE) for details.

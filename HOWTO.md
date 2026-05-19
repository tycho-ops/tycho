# Tycho HOWTO

This guide provides detailed instructions on how to customize and extend your Tycho infrastructure depending on your needs.

## 1. Choice of Deployment Mode

Tycho allows you to choose between two architectural patterns.

### Personal Mode (Single User)
Everything (including Traefik) runs in your user space using Podman Rootless.
- **Location**: `~/.tycho/`
- **Installation**: Run all commands as a normal user.
- **Port Handling**: Requires permission to bind to ports 80/443 (handled by standard `sysctl net.ipv4.ip_unprivileged_port_start=0`).
- **Ideal for**: A simple private server where you are the only administrator.

### Infrastructure Mode (Shared Server)
Traefik runs at the system level (Rootful), while applications run in individual user spaces (Rootless).
- **Location**: `/etc/tycho/` (for system core) and `~/.tycho/` (for user apps).
- **Installation**: 
    1. Run `sudo tycho install traefik` to set up the system-wide gateway.
    2. Standard users run `tycho install <app>` to deploy their own services.
- **Port Handling**: Only `root` touches privileged ports.
- **Ideal for**: Servers shared by multiple users or more robust "enterprise-grade" home labs.

## 2. Configuration (.env)

The `.env` file is located at `~/.tycho/.env` (User) or `/etc/tycho/.env` (System).

- `DOMAIN_NAME`: Your base domain (e.g., `quatrain.dev`).
- `BASE_STORAGE_PATH`: The root directory where all apps will store their persistent data.
- `CF_DNS_API_TOKEN`: Cloudflare API token for wildcard SSL certificates.
- `TRAEFIK_RESOLVER`: `dnsresolver` (Cloudflare) or `myresolver` (HTTP).
- `TRAEFIK_AUTH`: Basic auth for the Traefik dashboard.

## 3. Managing Recipes

Recipes are stored in the `podman/recipes/` directory on GitHub.

### Adding a new Recipe
1. Create a directory in `podman/recipes/` on GitHub.
2. Add a `package.json` with a `description` and `requiredEnv` list.
3. Add a `compose.yaml` file.
4. Commit and push.

### Updating a Recipe
Run `tycho install <recipe-name>` again. Tycho will fetch the latest version and recreate the containers.

## 4. Monitoring & Maintenance

- **System Stats**: `tycho stats` shows real-time resource usage.
- **Process List**: `tycho ps` lists all active containers managed by Tycho for the current user.
- **Upgrade CLI**: `tycho upgrade` downloads the latest version of the management script from GitHub.
- **Uninstall**: `tycho uninstall <pkg>` stops the service and optionally cleans up volumes and networks.

## 5. Troubleshooting

- **Logs**: `tycho logs <package>` (e.g., `tycho logs core/traefik`).
- **Conflict detection**: Tycho will warn you if you try to use a subdomain that is already active on the same server.

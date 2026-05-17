# Sovereign HOWTO

This guide provides detailed instructions on how to customize and extend your Sovereign infrastructure.

## Configuration (.env)

The heart of Sovereign is the `.env` file located at `~/.sovereign/.env`.

- `DOMAIN_NAME`: Your base domain (e.g., `quatrain.dev`).
- `CF_DNS_API_TOKEN`: Cloudflare API token for wildcard SSL certificates.
- `TRAEFIK_RESOLVER`: Set to `dnsresolver` to use Cloudflare, or `myresolver` for standard HTTP validation.
- `TRAEFIK_AUTH`: Basic auth credentials for the Traefik dashboard.

## Managing Recipes

Recipes are stored in the `podman/recipes/` directory on GitHub. Each recipe must contain a `compose.yaml` (or `compose.yml`) file.

### Adding a new Recipe

1. Create a directory in `podman/recipes/` on your GitHub repository.
2. Add a `compose.yaml` file.
3. Commit and push to GitHub.
4. Run `sovereign install <your-recipe>` on your server.

### Updating a Recipe

When you push changes to GitHub, you can update the service on your server by running:
```bash
sovereign install <recipe-name>
```
Sovereign will fetch the new version and recreate the containers.

## Monitoring

Use `sovereign stats` to see real-time CPU, Memory, and Disk usage for all your Sovereign-managed containers.

## Troubleshooting

- **Logs**: Use `sovereign logs <package>` (e.g., `sovereign logs core/traefik`).
- **Status**: Use `sovereign ps` to see which services are active.
- **Cache**: Sovereign stores local copies of recipes in `~/.sovereign/podman/`. If you want to force a clean fetch, you can delete the specific subdirectory in that folder.

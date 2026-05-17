# Sovereign

Sovereign is a centralized management system for your home server infrastructure using Podman.

## Project Structure

- `core/`: Critical infrastructure services.
  - `traefik/`: Edge router and SSL management.
  - `smtp/`: SMTP relay for system notifications.
- `apps/`: Optional services.
  - `immich/`: Photo management.
  - `n8n/`: Workflow automation.
  - `jellyfin/`: Media server.
- `sovereign`: Management CLI tool.

## Getting Started

1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in your credentials.
3. Use the `sovereign` CLI to manage your services.

```bash
./sovereign up core/traefik
./sovereign up core/smtp
./sovereign up apps/immich
```

## CLI Usage

- `./sovereign up [target]`: Start a service.
- `./sovereign down [target]`: Stop a service.
- `./sovereign restart [target]`: Restart a service.
- `./sovereign logs [target]`: View logs.
- `./sovereign ps`: List all running services managed by Sovereign.

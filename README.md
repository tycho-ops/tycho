# Sovereign

Sovereign is an autonomous server management CLI designed to deploy and manage a complete, self-hosted infrastructure using Podman.

## Key Features

- **Standalone CLI**: Install once, manage everything.
- **GitHub Backed**: Recipes are fetched dynamically from your central GitHub repository.
- **Rootless by Design**: Optimized for secure, rootless Podman environments.
- **Centralized Config**: A single `.env` file manages your entire stack.

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/crapougnax/sovereign/master/install.sh | bash
```

## Getting Started

1. **Setup**: Run `sovereign setup` to initialize your configuration.
2. **Configure**: Edit `~/.sovereign/.env` to add your API tokens and credentials.
3. **Deploy Core**: 
   ```bash
   sovereign install core/traefik
   sovereign install core/smtp
   ```
4. **Add Apps**:
   ```bash
   sovereign install immich
   sovereign install nextcloud
   ```

## License

GNU AGPL-v3. See [LICENSE](LICENSE) for details.

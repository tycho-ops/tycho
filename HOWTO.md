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

## 3. Managing Repositories (User Guide)

Tycho supports third-party recipe repositories similar to Helm. This allows you to add repositories hosted by the community or within your organization.

### Managing Repositories
- **Add a repository**:
  ```bash
  tycho repo add <name> <owner>/<repo>[@branch-or-tag]
  ```
  > [!TIP]
  > **Semantic Tag Resolution**: You can specify short version tags (e.g. `v1` or `v1.0`). Tycho will automatically query the GitHub API, resolve it to the latest matching full release tag (like `v1.0.4` or `v1.2.3`), and pin your configuration to that stable release.
  
  > [!WARNING]
  > **Security Warning**: Adding a repository without specifying a tag (e.g. `tycho repo add myrepo owner/repo`) is allowed and will default to the `main` branch. However, Tycho will print a security warning as this is not recommended for production stability.

- **List repositories**:
  ```bash
  tycho repo list
  ```
  Lists all added repositories alongside the default `official` one.

- **Verify repository status**:
  ```bash
  tycho repo update
  ```
  Loops through all configured repositories and verifies their online connectivity status.

- **Remove a repository**:
  ```bash
  tycho repo remove <name>
  ```

- **Bootstrap a new repository template**:
  ```bash
  tycho repo boilerplate <folder>
  ```
  Creates the standard Tycho recipe repository structure inside the specified directory, including the metadata file (`.tycho/repository.json`) and placeholder folders for your custom services.

### Listing & Installing Third-Party Recipes
- **List recipes**: `tycho list` dynamically queries all registered repositories and presents a unified table:
  ```
  RECIPE                   REPOSITORY      DESCRIPTION
  --------------------------------------------------------------------------------
  nextcloud                official        Enterprise-grade sharing and collaboration platform
  quatrain-studio          coreapps        Visual data modeling and developer dashboard
  ```
- **Install a recipe**:
  - To install a recipe from any repository (searched automatically):
    ```bash
    tycho install quatrain-studio
    ```
  - To target a specific repository explicitly and avoid name collisions:
    ```bash
    tycho install coreapps/quatrain-studio
    ```

---

## 4. Being a Recipe Provider (Provider Guide)

If you are a developer or team lead, you can easily host your own Tycho recipe repository on GitHub to share custom services with your users.

### Repository Structure
Any GitHub repository can act as a Tycho recipe repository as long as it contains the designated `.tycho` root directory:
```
<your-repository-root>/
└── .tycho/
    ├── core/
    │   └── podman/                 # Core services (e.g., custom gateways)
    └── recipes/
        └── podman/                 # Platform recipes (e.g. podman, k8s coming soon)
            └── quatrain-studio/    # The recipe directory
                ├── compose.yaml    # Docker/Podman compose template
                ├── package.json    # Recipe metadata
                └── README.md       # Individual deployment instructions
```

### Recipe Components
Each recipe directory must include:
1. **`compose.yaml`** (or `compose.yml`): The Podman compose template. Route public HTTP services by declaring standard Traefik routing labels:
   ```yaml
   labels:
     - traefik.enable=true
     - traefik.http.routers.<app>.rule=Host(`${<APP>_SUBDOMAIN:-<app>}.${DOMAIN_NAME}`)
     - traefik.http.routers.<app>.tls=true
     - traefik.http.routers.<app>.entrypoints=websecure
     - traefik.http.routers.<app>.tls.certresolver=${TRAEFIK_RESOLVER:-myresolver}
     - traefik.http.services.<app>.loadbalancer.server.port=<port>
   ```
2. **`package.json`**: Metadata defining user query questions:
   ```json
   {
     "name": "quatrain-studio",
     "description": "Visual data modeling and developer dashboard",
     "requiredEnv": [
       "STUDIO_SUBDOMAIN",
       "STUDIO_DATA_LOCATION"
     ]
   }
   ```
3. **`README.md`**: Descriptive setup, customization options, and volume mount documentation for users.

### Recipe Hooks (pre-install & post-install)
To enable advanced configuration, environment checks, or post-deployment seeding, Tycho supports dynamic execution of shell hooks inside your recipe directory.

If these optional scripts are provided, the Tycho CLI will run them automatically during deployment:

#### 1. Pre-installation Hook (`pre-install.sh`)
This script runs **before** standard volumes are initialized and `podman compose` is triggered.
- **Execution directory**: The script runs inside the localized recipe folder (e.g. `~/.tycho/podman/recipes/my-app/`).
- **Arguments**: Receives a single argument containing the absolute path to the active Tycho `.env` file (accessible via `$1`).
- **Common use cases**:
  - Auto-detecting host capabilities (like checking for an NVIDIA GPU using `nvidia-smi` or `/dev/nvidia0` and prompting the user to enable it in-place in `compose.yaml`).
  - Generating secure custom passwords, encryption keys, or salt variables and appending them to the `.env` file.
  - Initializing or mapping specific host directories.

#### 2. Post-installation Hook (`post-install.sh`)
This script runs **after** the Tycho CLI has fully successfully deployed and started the container services via `podman compose up -d`.
- **Execution directory**: The script runs inside the localized recipe folder (e.g. `~/.tycho/podman/recipes/my-app/`).
- **Arguments**: Receives a single argument containing the absolute path to the active Tycho `.env` file (accessible via `$1`).
- **Common use cases**:
  - Automatically pulling resources or seeding data inside the running containers (e.g., executing `podman exec -it <container> ollama pull <model>` to download an initial LLM model).
  - Performing database migrations or executing initialization endpoints.
  - Displaying friendly post-installation messages, access URLs, or customized credential tips to the user.

> [!NOTE]
> **Interactivity Safeguard**: Since the hooks run in the active terminal environment, you can use interactive prompts using standard shell input (like `read` or using custom `safe_read` scripts to ensure compatibility with redirected streams).

### Publishing & Sharing Your Custom Recipes
To publish and share your custom recipes:
1. **Bootstrap the repository structure**: Run `tycho repo boilerplate <folder>` to initialize the required directory structure and `repository.json` metadata file in your local directory.
2. **Add your recipes**: Place your recipe directories under `.tycho/recipes/podman/<recipe_name>/` including the `compose.yaml`, `package.json`, and `README.md` files.
3. **Commit and push**: Initialize git in the folder, commit all your files, and push them to a public GitHub repository (e.g. `https://github.com/username/my-tycho-recipes`).
4. **Publish releases**: Tag your repository commits with semantic versions (e.g., `v1.0.0`, `v1.1.0`).
5. **Share with users**: Users can then register your repository using:
   ```bash
   tycho repo add <alias_name> <username>/<my-tycho-recipes>[@version_tag]
   ```
   And deploy your custom recipe via:
   ```bash
   tycho install <alias_name>/<recipe_name>
   ```

### Best Practices for Recipe Providers
- **Semantic Version Tags**: Proactively tag your repository releases using semantic versioning (e.g., `v1.0.0`, `v1.1.2`, `v2.0.0`). This allows users to add your repository pinned to safe major or minor release versions (like `owner/repo@v1`), which Tycho resolves to the latest stable minor/patch update dynamically.

## 5. Domain Alias Management (Dynamic DNS)

Tycho comes with support for wildcard dynamic subdomains via a free alias service integrated at `api.tycho.cc`. This is particularly useful for exposing containers via Traefik without setting up or purchasing your own custom domain.

### Registering and Updating Aliases

- **Register a new alias**:
  ```bash
  tycho alias register <subdomain>
  ```
  This registers `*.subdomain.tycho.cc` pointing to your server's current public IP address.
  *Note: The email address configured in `tycho setup` is pseudonymized during registration using `HMAC-SHA256` with a secret server-side salt, protecting your privacy.*

- **Update an existing alias**:
  ```bash
  tycho alias update
  ```
  Updates the public IP associated with your active subdomain. Perfect for servers with dynamic residential IP addresses (can be run via CRON).

## 6. Monitoring & Maintenance

- **System Stats**: `tycho stats` shows real-time resource usage.
- **Process List**: `tycho ps` lists all active containers managed by Tycho for the current user.
- **Upgrade CLI**: `tycho upgrade` downloads the latest version of the management script from GitHub.
- **Uninstall**: `tycho uninstall <pkg>` stops the service and optionally cleans up volumes and networks.

### Backup & Restore

Tycho features built-in server backup and restoration capabilities. These commands ensure that all your configurations, added third-party repositories, local recipe definitions, and persistent databases/application storage are backed up and restored safely.

Backups are **self-aware**: every backup contains a shell-sourceable `.tycho-backup-meta` manifest declaring its type (full vs. service-specific), date, and storage scope. The restore command reads this manifest first to automatically isolate target boundaries and verify safety.

#### 1. Scope and Separation (Metadata vs. Data)
- **Metadata Backup (Default)**: Archives configurations, `.env`, recipe directories, and repository databases (`$WORK_DIR`). It is extremely fast, small, and highly secure.
  ```bash
  tycho backup [target_file.tar.gz]
  ```
- **Full Backup (Metadata + Data)**: Includes all persistent application storage files inside `$BASE_STORAGE_PATH` (e.g. database directories, uploads). Trigger this using the `--with-data` or `-d` flag:
  ```bash
  tycho backup [target_file.tar.gz] --with-data
  ```
- **Service-Level Backup**: Restricts the backup to a specific service only.
  ```bash
  # Back up only nextcloud configuration (metadata)
  tycho backup --service nextcloud
  
  # Back up nextcloud configuration AND its persistent data files
  tycho backup --service nextcloud --with-data
  ```

#### 2. Non-Interactive Operations (CRON Automation)
For automated backups (e.g., via CRON), append the `--non-interactive` or `-y` flag to bypass all interactive prompts:
```bash
tycho backup --non-interactive
```
> [!IMPORTANT]
> **Downtime Prevention**: By default, Tycho does not stop active container services in non-interactive mode. To explicitly stop active containers temporarily to guarantee complete transaction/database consistency, you must pass the `--stop-services` flag:
> ```bash
> tycho backup --non-interactive --stop-services
> ```

#### 3. Remote Transport & Incremental Syncing
- **Standard Remote Transfer**: Copies the generated `.tar.gz` to a remote target using secure copy:
  ```bash
  tycho backup --remote backup-user@backup-host:/path/to/backups --port 2222 --identity ~/.ssh/id_rsa
  ```
- **Incremental Replication**: Uses `rsync` instead of `tar` compression to replicate directories directly. This transfers only differences and is highly efficient:
  ```bash
  # Local incremental replication to a target directory
  tycho backup /var/backups/tycho-sync --incremental --with-data
  
  # Remote incremental replication over SSH
  tycho backup --remote backup-user@backup-host:/var/backups/tycho-sync --incremental --with-data
  ```

#### 4. Retention Policy Pruning (`--keep <N>`)
Specify a maximum number of historical backups to retain. Tycho will automatically sort matching archives chronologically and prune the oldest:
```bash
# Keep only the 5 newest nextcloud backups locally
tycho backup --service nextcloud --keep 5

# Works over remote standard connections as well
tycho backup --remote user@host:/backups --keep 7
```

#### 5. Restore from Backup
The restore command safely stops active containers (either globally or for the specific service) before overwriting, and will offer to restart services sequentially (core Traefik gateway first, then application recipes) once restored.

```bash
tycho restore <backup_file.tar.gz_or_dir>
```
To run non-interactively without overwrite confirmations:
```bash
tycho restore <backup_file.tar.gz> --non-interactive
```

> [!CAUTION]
> **Destructive Operation**: Restoring from a backup will overwrite current configurations and persistent data directories under `$WORK_DIR` and `$BASE_STORAGE_PATH` within the backup's scoped boundaries (e.g., overwriting ONLY the target service files if it was a service-level backup).

## 7. Core CLI Development & Releases (Developer Guide)

If you are contributing to the core Tycho project, this guide explains how the installation, versioning, and release pipeline are structured.

### Installation Versioning Options
The quick installer supports the `TYCHO_VERSION` environment variable. This allows developers and administrators to deploy and test different states of the CLI:

- **Stable Release (Default)**: Downloads the latest official compiled release binary and assets.
  ```bash
  curl -fsSL https://tycho.cc/install.sh | bash
  ```
- **Latest Development State (`main`)**: Downloads the latest commits directly from the `main` branch.
  ```bash
  export TYCHO_VERSION=main
  curl -fsSL https://tycho.cc/install.sh | bash
  ```
- **Specific Tag/Version**: Downloads a specific release tag asset.
  ```bash
  export TYCHO_VERSION=v0.9.0
  curl -fsSL https://tycho.cc/install.sh | bash
  ```

### Release Automation
We use a GitHub Actions workflow to publish releases automatically:
1. **Trigger**: Pushing any tag starting with `v*` (e.g. `v0.9.0`) triggers the `.github/workflows/release.yaml` workflow.
2. **Release Notes**: A GitHub Release is created, and release notes are automatically compiled by listing all commits and pull requests since the previous tag.
3. **Packaged Assets**: The following assets are packaged and attached directly to the release page:
   - `tycho` (The main CLI executable script)
   - `install.sh` (The quick installation script)
   - `LICENSE` (The licensing terms)
   - All root markdown documentation (`*.md` files: `README.md`, `HOWTO.md`, `PHILOSOPHY.md`, `COOKBOOK_MUSIC.md`)

## 8. Troubleshooting

- **Logs**: `tycho logs <package>` (e.g., `tycho logs core/traefik`).
- **Conflict detection**: Tycho will warn you if you try to use a subdomain that is already active on the same server.

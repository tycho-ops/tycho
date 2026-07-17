# Gitea Tycho Recipe

A painless self-hosted Git service with SQLite database backend.

## Deployment Details

- **Default URL**: `https://${GITEA_SUBDOMAIN:-gitea}.${DOMAIN_NAME}`
- **SSH Git Clone Port**: `${GITEA_SSH_PORT:-2222}`
- **Required Env Variables**:
  - `GITEA_DATA_LOCATION`: Host directory path to persist Gitea repositories, SSH keys, configuration, and SQLite database.
- **Optional Env Variables**:
  - `GITEA_SUBDOMAIN`: Subdomain mapping for the app routing (defaults to `gitea`).
  - `GITEA_SSH_PORT`: External port mapped to container SSH port 22 (defaults to `2222`).

## Storage Persistence

Data is persisted on the host at the directory specified by `GITEA_DATA_LOCATION`.

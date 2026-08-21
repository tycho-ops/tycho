# LLM Agent Instructions & Guidelines — Tycho CLI

> **Audience**: AI Coding Agents & Human Pair Programming  
> **Platform**: Rootless Podman + Linux Host Engine + Bash / POSIX  
> **Repository**: `tycho-ops/tycho` | **License**: AGPL-v3

---

## 🧭 1. Base Guidelines & Primary Hierarchy

All AI coding agents interacting with this workspace **MUST** strictly load and adhere to the author's primary development rules, GitFlow protocol, and 3-tier forking architecture defined in:
👉 **[Author's Global AI Rules, Architecture Standards & GitFlow Protocol (AGENTS.md)](https://gist.github.com/crapougnax/47971b85aa73dd702f4372a89858111c)**

---

## 🏗️ 2. Project-Specific Architecture & Guidelines

### A. Rootless & Unprivileged Container Isolation
- **Non-Root by Design:** Tycho is built for unprivileged rootless Podman execution (`USER bun`, `USER node`, rootless user namespace).
- **Socket & Storage Boundaries:** User mode runs under `$HOME/.tycho` with storage isolated at `/data/users/$USER`. System mode runs under `/etc/tycho` and `/data/system`.
- **Zero Sudo in User Mode:** Never invoke `sudo` inside user mode recipes.

### B. Dynamic Recipes & GitHub Backed Architecture
- Recipes and packages are dynamically resolved from remote repositories with automatic semantic tag resolution.
- Recipes must provide self-contained `Containerfile` (or compose) definitions with `.env.dist` templates.

### C. Subcommand Router Architecture
- **Podman Subcommands:** Host operations are grouped under `tycho podman <install|uninstall|backup|restore|stats|ps|alias>`.
- **Kubernetes Subcommands:** Kubernetes orchestration is routed via `tycho k8s <bootstrap|cert|deploy|status|tf>` delegating to `tycho-ops/k8s-iac`.
- **Backward Compatibility:** Top-level legacy aliases (e.g. `tycho install`) must be preserved as transparent redirects.

### D. Bash Quality Standards & SonarCloud Rules
- **No Exit Code Masking:** Never declare a `local` variable in the same statement as a command substitution (`local out; out=$(cmd)`).
- **Double Brackets Tests:** Always use `[[ ... ]]` instead of single brackets `[ ... ]`.
- **Stderr Redirection:** Always redirect errors, warnings, and diagnostic CLI headers to stderr (`>&2`).
- **Explicit Returns:** Provide an explicit `return 0` at the end of every shell function.

---

## 🛠️ 3. Essential Development Commands

| Action | Command |
| :--- | :--- |
| **Run ShellCheck Linter** | `shellcheck tycho install.sh` |
| **Test User Mode Execution** | `./tycho list` |
| **Verify Subcommand Routing** | `./tycho --help` |

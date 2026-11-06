> 🇫🇷 [Version française](README.fr.md)

# Tycho

Tycho deploys and operates self-hosted services from generic recipes, on Kubernetes or on a single
Podman host, with security and compliance checks built in. This repository holds the **core**: the
only executable, which installs and runs the Tycho modules.

## Install

```bash
curl -fsSL https://qtrn.io/install.sh | bash
```

The installer downloads the core for your platform (Linux or macOS, amd64 or arm64) from
`git.qtrn.io`, verifies its SHA-256 checksum and installs it into `~/.local/bin` (or
`/usr/local/bin` as root). To add modules at the same time:

```bash
curl -fsSL https://qtrn.io/install.sh | TYCHO_MODULES="forge security" bash
```

No runtime is needed: the core embeds its own (Bun).

## Modules

Every feature is a module, an npm package `@tycho/<module>` that the core downloads from
`https://qtrn.io/`, verifies (sha512 integrity, compatibility with the core version) and runs.

```bash
tycho module add forge            # install the latest version
tycho module add forge@~1.0.0     # or a version range
tycho module list
tycho module remove forge
```

| Module | Command | Purpose |
| :--- | :--- | :--- |
| [forge](https://git.qtrn.io/tycho/tycho-forge) | `tycho forge` | Pull requests, issues, mirrors on Forgejo, GitHub, GitLab, Bitbucket |
| [containers](https://git.qtrn.io/tycho/tycho-containers) | `tycho containers` | Single-host Podman deployments of catalogue recipes |
| [orchestration](https://git.qtrn.io/tycho/tycho-orchestration) | `tycho orchestration` | Kubernetes deployments of catalogue recipes |
| [knowledge](https://git.qtrn.io/tycho/tycho-knowledge) | `tycho knowledge` | Open Knowledge Format (OKF) curation and sync |
| [security](https://git.qtrn.io/tycho/tycho-security) | `tycho security`, `tycho sec` | Security audits of code and deployments |

Modules are installed in `~/.local/share/tycho/modules` (user mode) or
`/usr/local/share/tycho/modules` (as root), with a `modules.lock` recording each version and its
integrity.

## Targets

A target is a deployment environment (a Kubernetes cluster or a Podman host) described by the
`target.yaml` of its own repository (RFC-001 §3). One `tycho` manages several targets, and every
module acts on the selected one:

```bash
tycho context add ~/src/acme/k8s-scaleway-prod     # name read from its target.yaml
tycho context add ~/src/acme/podman-baremetal-edge
tycho context list
tycho context use acme-prod
tycho orchestration plan                            # current target
tycho orchestration status --target acme-edge       # or TYCHO_TARGET=acme-edge
```

Selection order: `--target <name>`, then `TYCHO_TARGET`, then the current target; Tycho never
guesses. Targets are kept in `~/.config/tycho/targets.json`.

## Module development

`tycho module link <dir>` uses a module from a local working copy (a built module whose
`package.json` declares the `tycho` contract), instead of a published version.

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `TYCHO_REGISTRY` | `https://qtrn.io/` | npm registry serving `@tycho/*` (mirror, air-gapped site) |
| `TYCHO_REGISTRY_TOKEN` | — | Token for a private registry |
| `TYCHO_MODULES_DIR` | see above | Where modules are installed |
| `TYCHO_CONFIG_DIR` | `~/.config/tycho` | Where targets are registered |
| `TYCHO_TARGET` | — | Target of the command, instead of the current one |
| `NO_COLOR` | — | Disables colours |

## Design

The architecture is described in the RFCs, in French for now:

- [RFC-001](docs/rfcs/rfc-001-stacks-plugins-targets.md) — stacks, plugins and targets; modules as
  npm packages run by the core (§4quinquies); Kubernetes / Podman parity
- [RFC-002](docs/rfcs/rfc-002-gate.md) — Gate (draft)
- [RFC-003](docs/rfcs/rfc-003-ledger.md) — Ledger (draft)
- [Roadmap](ROADMAP.md)

## Development

```bash
bun install
bun test              # unit tests (fake registry, integrity, archive safety)
bun run typecheck
bun run build:local   # compiled core in bin/tycho
bun run build:release # the four platforms + SHA256SUMS in dist/
```

## Licence

GNU Affero General Public License v3.0 only (AGPL-3.0-only). Copyright Quatrain Technologies.

> 🇬🇧 [English version](README.md)

# Tycho

Tycho déploie et exploite des services auto-hébergés à partir de recettes génériques, sur
Kubernetes ou sur un hôte Podman unique, avec des contrôles de sécurité et de conformité intégrés.
Ce dépôt contient le **cœur** : le seul exécutable, qui installe et exécute les modules Tycho.

## Installation

```bash
curl -fsSL https://qtrn.io/install.sh | bash
```

L'installeur télécharge le cœur pour votre plateforme (Linux ou macOS, amd64 ou arm64) depuis
`git.qtrn.io`, vérifie sa somme SHA-256 et l'installe dans `~/.local/bin` (ou `/usr/local/bin`
en root). Pour ajouter des modules en même temps :

```bash
curl -fsSL https://qtrn.io/install.sh | TYCHO_MODULES="forge security" bash
```

Aucun runtime n'est nécessaire : le cœur embarque le sien (Bun).

## Modules

Chaque fonctionnalité est un module, un paquet npm `@tycho/<module>` que le cœur télécharge depuis
`https://qtrn.io/`, vérifie (intégrité sha512, compatibilité avec la version du cœur) et exécute.

```bash
tycho module add forge            # installer la dernière version
tycho module add forge@~1.0.0     # ou une plage de versions
tycho module list
tycho module remove forge
```

| Module | Commande | Rôle |
| :--- | :--- | :--- |
| [forge](https://git.qtrn.io/tycho/tycho-forge) | `tycho forge` | Pull requests, issues, miroirs sur Forgejo, GitHub, GitLab, Bitbucket |
| [containers](https://git.qtrn.io/tycho/tycho-containers) | `tycho containers` | Déploiements Podman sur un seul hôte, à partir des recettes du catalogue |
| [orchestration](https://git.qtrn.io/tycho/tycho-orchestration) | `tycho orchestration` | Déploiements Kubernetes à partir des recettes du catalogue |
| [knowledge](https://git.qtrn.io/tycho/tycho-knowledge) | `tycho knowledge` | Curation et synchronisation au format OKF (Open Knowledge Format) |
| [security](https://git.qtrn.io/tycho/tycho-security) | `tycho security`, `tycho sec` | Audits de sécurité du code et des déploiements |

Les modules sont installés dans `~/.local/share/tycho/modules` (mode utilisateur) ou
`/usr/local/share/tycho/modules` (en root), avec un `modules.lock` qui enregistre chaque version
et son intégrité.

## Configuration

| Variable | Défaut | Rôle |
| :--- | :--- | :--- |
| `TYCHO_REGISTRY` | `https://qtrn.io/` | Registre npm servant `@tycho/*` (miroir, site isolé) |
| `TYCHO_REGISTRY_TOKEN` | — | Jeton pour un registre privé |
| `TYCHO_MODULES_DIR` | voir ci-dessus | Emplacement des modules |
| `NO_COLOR` | — | Désactive les couleurs |

## Conception

L'architecture est décrite dans les RFC, en français pour l'instant :

- [RFC-001](docs/rfcs/rfc-001-stacks-plugins-targets.md) — stacks, plugins et cibles ; modules en
  paquets npm exécutés par le cœur (§4quinquies) ; parité Kubernetes / Podman
- [RFC-002](docs/rfcs/rfc-002-gate.md) — Gate (brouillon)
- [RFC-003](docs/rfcs/rfc-003-ledger.md) — Ledger (brouillon)
- [Feuille de route](ROADMAP.fr.md)

## Développement

```bash
bun install
bun test              # tests unitaires (faux registre, intégrité, sûreté des archives)
bun run typecheck
bun run build:local   # cœur compilé dans bin/tycho
bun run build:release # les quatre plateformes + SHA256SUMS dans dist/
```

## Licence

GNU Affero General Public License v3.0 uniquement (AGPL-3.0-only). Copyright Quatrain Technologies.

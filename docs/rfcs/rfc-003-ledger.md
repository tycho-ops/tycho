---
type: rfc
title: "RFC-003 : Ledger — registre des credentials, de leur raison d'être et de leur cycle de vie"
description: "tycho ledger : inventaire de tout credential (clés SSH, API keys, DB, tokens, certificats) par empreinte uniquement ; owner, purpose, consumers, locations, expiration ; découverte, rotation, révocation liée au retrait des cibles ; source du registre des accès IA et des empreintes DLP du Gate."
tags: [rfc, security, secrets, ssh, rotation, inventory, iso27001]
status: draft
timestamp: 2026-10-24T18:10:00Z
---

# RFC-003 : Ledger

> **Statut** : Brouillon — pour discussion, aucun code avant acceptation
> **Auteur** : crapougnax
> **Date** : 2026-10-24
> **Parent** : RFC-001 (§6 Secrets et clés, §10.1 Gestion des clés) ; lié à RFC-002 (Gate)
> **Module** : `tycho ledger`

---

## 0. Contexte et motivation

Cas déclencheur (retour d'expérience public, octobre 2026) : deux connexions SSH `Accepted publickey` depuis une IP externe, sans aucune tentative échouée. La clé était **légitime** — `deploy@old-build`, dans `authorized_keys` depuis novembre 2025 — mais son propriétaire, un serveur de build, avait été retiré des mois plus tôt. Un backup du `.env` applicatif a été créé pendant la session.

Le problème n'est pas l'existence du secret mais **l'oubli de sa raison d'être** : la confiance survit à ce qui la justifiait (machine retirée, prestataire parti, dépôt copié, backup de `.env`).

| Outil | Fait | Ne fait pas |
| :--- | :--- | :--- |
| gitleaks / trufflehog | Trouve des secrets | Ignore leur rôle et s'ils doivent encore vivre |
| SOPS / OpenBao / Vault | Stocke ce qu'on y met | Ignore ce qui traîne ailleurs |
| osquery | Inventorie l'hôte | Aucune notion d'owner ni de cycle de vie |

Question à laquelle le ledger répond : **ce credential appartient-il encore à quelque chose de vivant, et qui l'accepte ?**

Contrôles ISO/IEC 27001:2022 visés : A.5.9 (inventaire), A.5.16 (gestion des identités), A.5.17 (informations d'authentification), A.5.18 (droits d'accès), A.8.5 (authentification sécurisée), A.8.15 (journalisation).

---

## 1. Principes (normatifs)

1. **Empreintes uniquement.** Le ledger ne contient jamais de valeur : fingerprint SHA256 pour les clés publiques, HMAC à clé pour les secrets (§8).
2. **Tout credential a un owner, un purpose et une expiration.** À défaut : statut `unowned`, écart à traiter.
3. **Court terme plutôt que rotation.** Ordre de préférence : secret à courte durée de vie (certificat SSH, token OIDC, token émis par le Gate) > rotation automatique > rotation assistée.
4. **Versionné dans git.** Possible parce qu'il ne contient que des empreintes ; l'historique est la piste d'audit (RFC-001).
5. **Le retrait d'une cible révoque sa confiance.** Un décommissionnement n'est terminé que lorsque le ledger ne référence plus la cible comme owner ou location active.

---

## 2. Modèle d'entrée

```yaml
id: deploy-old-build
type: ssh_key            # ssh_key | api_key | db | token | cert
fingerprint: "SHA256:…"
owner: target/old-build  # human/*, target/*, service/*, agent/*
purpose: "déploiement CI vers api-prod"
consumers:               # où le credential est ACCEPTÉ
  - host/api-prod:/home/deploy/.ssh/authorized_keys
locations:               # où le credential est STOCKÉ
  - target/old-build:~/.ssh/id_ed25519
created: 2025-11-03
expires: 2026-05-03
rotation: assisted       # auto | assisted | short-lived | none
last_seen: 2026-10-22T03:14Z
status: orphaned         # active | dormant | orphaned | unowned | expired | revoked
label: provisional       # accepted | negotiated | provisional (RFC-001 §7.2)
```

| Statut | Règle |
| :--- | :--- |
| `active` | owner vivant, non expiré, vu récemment |
| `dormant` | aucun `last_seen` depuis 90 jours |
| `orphaned` | owner retiré ou inexistant dans les cibles |
| `unowned` | découvert, jamais déclaré |
| `expired` | `expires` dépassé et toujours accepté par un consumer |
| `revoked` | retiré de tous les consumers, vérifié |

---

## 3. Sous-commandes

| Commande | Rôle |
| :--- | :--- |
| `tycho ledger discover` | Lance les plugins de découverte, propose des entrées `unowned` |
| `tycho ledger register` | Déclare ou complète une entrée (owner, purpose, expiration) |
| `tycho ledger rotate <id>` | Exécute le rotator du type, met à jour les consumers, révoque l'ancienne valeur |
| `tycho ledger revoke <id>` | Révoque chez tous les consumers (SSH : KRL `RevokedKeys`) et vérifie |
| `tycho ledger report` | Orphelins, unowned, dormants, expirés, drift ; sortie OKF pour `<org>/compliance/preuves/` |

---

## 4. Découverte (plugins)

- **Git** : historique complet, toutes branches (pas seulement HEAD).
- **Systèmes de fichiers** : `.env*`, `*.bak`, `/opt/**`, répertoires home.
- **SSH** : `authorized_keys` de tous les comptes (root compris), `authorized_keys.d`, `AuthorizedKeysCommand`, options `from=` / `command=`.
- **Kubernetes** : métadonnées des `Secret` uniquement — jamais `data`, `stringData` ni `last-applied-configuration`.
- **Forgejo** : variables et secrets CI, deploy keys, tokens.
- **Scaleway** : IAM, API keys.
- **`last_seen`** : logs sshd (`Accepted publickey … SHA256:…`), logs d'API des fournisseurs, journal du Gate.

---

## 5. Rotation

| Mode | Exemples | Comportement |
| :--- | :--- | :--- |
| `short-lived` | Certificats SSH (`TrustedUserCAKeys`), OIDC Keycloak, tokens Gate | Pas de rotation : expiration native |
| `auto` | Mots de passe Postgres, API keys avec endpoint de rotation | Rotator complet, sans humain |
| `assisted` | Clés tierces sans API | Génère, liste les consumers à mettre à jour, révoque après confirmation |
| `none` | Exception documentée | Étiquette `negotiated` obligatoire, date de revue |

Cible pour les comptes machine SSH : remplacement de `authorized_keys` par une CA SSH Tycho (certificats de quelques heures à quelques jours), cohérente avec la signature SSH retenue en RFC-001 §4ter.

---

## 6. Intégrations

- **Cycle de vie des cibles (RFC-001 §3)** : `target retire` déclenche `revoke` de tout credential dont la cible est owner, et signale les `locations` à détruire (disques, snapshots, backups, artefacts CI).
- **Gate (RFC-002)** :
  - le Gate détient les credentials des services tiers et émet des tokens courts et scopés par agent (`short-lived`) ;
  - le Gate s'enregistre comme consumer ; son journal alimente `last_seen` ;
  - DLP sortante : détection des secrets connus dans les requêtes des agents par HMAC des segments à forte entropie, comparés aux empreintes du ledger.
- **SMSI** : le registre des accès IA de l'organisation devient une vue du ledger filtrée sur `owner: agent/*`.

---

## 7. Modes (RFC-001 §7ter)

| Mode | Comportement |
| :--- | :--- |
| `sandbox` | `report` seulement |
| `standard` | Alertes sur `unowned`, `orphaned`, `expired` |
| `hardened` | Bloquant : une cible consommant un credential non enregistré ou expiré n'est pas déployée |

---

## 8. Questions ouvertes

1. **Empreinte des secrets à faible entropie** : un hash simple se brute-force ; HMAC avec une clé hors du ledger (Gate ou KMS). Où vit cette clé, comment tourne-t-elle ? Articulation avec RFC-001 §6 (clé de cible au repos).
2. **Périmètre de découverte** : `discover` autorisé sur des dépôts tiers ou clients ? Cadre contractuel à définir.
3. **Rotators du MVP** : proposition SSH (via CA), Postgres, API keys Scaleway.
4. **Format** : une entrée YAML par fichier (diffs lisibles) ou un document OKF unique ?
5. **Seuil `dormant`** : 90 jours par défaut, configurable par type ?

---

## Références

- RFC-001 : `docs/rfcs/rfc-001-stacks-plugins-targets.md`
- RFC-002 : `docs/rfcs/rfc-002-gate.md`
- OpenSSH — certificats et KRL : `ssh-keygen(1)` (sections CERTIFICATES, KEY REVOCATION LISTS)

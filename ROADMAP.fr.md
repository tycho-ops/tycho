> 🇬🇧 [English version](ROADMAP.md)

# Feuille de route

Travaux prévus après la version 1.0.0 du cœur. L'architecture est fixée par
l'[RFC-001](docs/rfcs/rfc-001-stacks-plugins-targets.md) ; cette liste porte sur l'ordre de livraison.

## Prochainement

- **Signature des modules (cœur 1.1)** — signature minisign de chaque archive de module,
  vérifiée avant chaque chargement ; niveaux de confiance `partner` et `dev` (RFC-001 §4ter,
  §4quinquies).
- **Installation par Homebrew** — `brew install tycho/tap/tycho` depuis un tap hébergé sur
  `git.qtrn.io` (`tycho/homebrew-tap`). La formule télécharge le cœur depuis les releases de
  `git.qtrn.io` et vérifie sa somme SHA-256 : aucun artefact n'est publié ailleurs.
- **`tycho dashboard`** — un module qui lance une interface web locale (Astro, servie par le
  runtime du cœur) pour consulter les rapports d'audit et de déploiement, comparer des
  exécutions et les exporter (Markdown/OKF, PDF, CSV). Strictement local : écoute sur
  `127.0.0.1`, aucune donnée ne quitte la machine.
- **Installation guidée d'une cible** — `tycho orchestration init|apply` pose chaque question
  obligatoire (`publicIps: ephemeral|durable`, `egressGateway`, reverse DNS facultatifs…), affiche
  un plan avec ses contrôles, et s'interrompt après la réservation des IP jusqu'à ce que les
  enregistrements DNS existent ; à la reprise (`--resume`), il vérifie IP, DNS direct et DNS
  inverse avant de continuer (RFC-001 §3).

## Plus tard

- **`tycho cost`** — un module qui interroge ce que facturent les opérateurs, via leurs API de
  facturation et de tarifs (Scaleway d'abord, puis OVHcloud et les autres derrière la même
  interface) :
  - **coût réel** : consommation par projet, par cible et par ressource (nœuds, load
    balancers, IP, stockage, trafic sortant), sur une période, devise et taxes précisées ;
  - **estimation** : le coût mensuel d'une cible avant sa création, à partir de ses pools de
    nœuds, de son stockage et de ses IP publiques, pour que `tycho orchestration` l'affiche avec
    le plan ;
  - **comparaison** : la même cible chiffrée chez plusieurs opérateurs et régions.

  En lecture seule : il utilise des clés d'API limitées à la facturation et ne modifie aucune
  ressource. Les rapports alimentent `tycho dashboard` et les exports OKF (Markdown, CSV).
- **`tycho compliance site <domaine>`** — un module qui audite un site public au regard des
  textes qui s'y appliquent (RGPD, ePrivacy, LCEN pour commencer) :
  - **hébergement** : où sont hébergés le site et chaque ressource tierce qu'il charge (IP, AS,
    pays, fournisseur), en signalant les transferts hors UE ;
  - **cookies et consentement** : présence d'un bandeau, cookies et stockage déposés *avant*
    consentement, refus aussi simple que l'acceptation ;
  - **traçage** : traceurs de mesure d'audience, publicitaires et sociaux, polices et CDN qui
    exposent l'IP du visiteur ;
  - **pages obligatoires** : mentions légales (éditeur, hébergeur, contact), politique de
    confidentialité, conditions générales d'utilisation ou de vente le cas échéant.

  Le rapport alimente `tycho dashboard` et les exports OKF ; il constate et cite les textes, il
  ne constitue pas un avis juridique.
- **Deux recettes optionnelles du catalogue**, chacune déployable sur Kubernetes et Podman
  avec les règles habituelles du catalogue (SSO Keycloak, sauvegarde, versions LTS) :
  - **signature électronique de documents** pour les NDA, MOU et accords du même type :
    circuit de signature à plusieurs signataires, piste d'audit, PDF scellé. Candidats :
    DocuSeal, Documenso (tous deux AGPL-3.0). Elle fournit des signatures électroniques
    simples (eIDAS art. 25), pas qualifiées.
  - **prise de rendez-vous**, une alternative auto-hébergée aux pages de réservation de
    Google Agenda : page publique de réservation, disponibilités lues dans n'importe quel
    agenda CalDAV/iCal, e-mails de confirmation avec une invitation `.ics`. Candidats :
    Cal.com (AGPL-3.0), Easy!Appointments (GPL-3.0), ou la fonction rendez-vous de Nextcloud
    Agenda là où Nextcloud est déjà déployé.
- Implémentations réelles derrière les modules `containers`, `orchestration`, `knowledge` et
  `security` (en 0.x aujourd'hui), en commençant par la parité Podman sur une stack simple
  (RFC-001 §9, phase 4).
- Paquets Debian sur `qtrn.io/deb/tycho`.
- Moteur de rendu unique (`tycho render`) et plugin de gestion de configuration Argo CD
  (RFC-001 §5, §9 phase 3).

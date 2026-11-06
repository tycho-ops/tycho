> 🇫🇷 [Version française](ROADMAP.fr.md)

# Roadmap

Planned work after the 1.0.0 release of the core. The architecture is set by
[RFC-001](docs/rfcs/rfc-001-stacks-plugins-targets.md); this list is about delivery order.

## Next

- **Module signatures (core 1.1)** — minisign signature of every module tarball, verified
  before each load; `partner` and `dev` trust levels (RFC-001 §4ter, §4quinquies).
- **Homebrew install** — `brew install tycho/tap/tycho` from a tap hosted on `git.qtrn.io`
  (`tycho/homebrew-tap`). The formula downloads the core from the `git.qtrn.io` releases and
  checks its SHA-256: no artifact is published anywhere else.
- **`tycho dashboard`** — a module that starts a local web interface (Astro, served by the
  core's own runtime) to browse audit and deployment reports, compare runs and export them
  (Markdown/OKF, PDF, CSV). Local only: bound to `127.0.0.1`, no data leaves the machine.
- **Guided target installation** — `tycho orchestration init|apply` asks every required
  setting (`publicIps: ephemeral|durable`, `egressGateway`, optional reverse DNS…), shows a plan
  with its checks, and pauses after reserving the public IPs until the DNS records exist; on
  `--resume` it verifies IPs, forward DNS and reverse DNS before going on (RFC-001 §3).

## Later

- **`tycho cost`** — a module that queries what the operators charge, through their billing
  and pricing APIs (Scaleway first, then OVHcloud and the others behind the same interface):
  - **actual cost**: consumption per project, per target and per resource (nodes, load
    balancers, IPs, storage, egress), over a period, with the currency and the taxes stated;
  - **estimate**: the monthly cost of a target before it is created, from its node pools,
    storage and public IPs, so that `tycho orchestration` can show it with the plan;
  - **comparison**: the same target priced at several operators and regions.

  Read-only: it uses API keys limited to billing, and never changes a resource. Reports feed
  `tycho dashboard` and the OKF exports (Markdown, CSV).
- **`tycho compliance site <domain>`** — a module that audits a public website against the
  regulations that apply to it (GDPR, ePrivacy, French LCEN for a start):
  - **hosting**: where the site and each third-party resource it loads are hosted (IP, AS,
    country, provider), flagging transfers outside the EU;
  - **cookies and consent**: presence of a consent banner, cookies and storage set *before*
    consent, refusal as easy as acceptance;
  - **tracking**: analytics, advertising and social trackers, fonts and CDNs that leak the
    visitor's IP;
  - **mandatory pages**: legal notice (publisher, host, contact), privacy policy, terms of
    use or sale when relevant.

  The report feeds `tycho dashboard` and the OKF exports; it states findings and the text they
  rely on, it is not legal advice.
- **Two optional catalogue recipes**, each deployable on Kubernetes and Podman with the
  catalogue's usual SSO (Keycloak), backup and LTS policies:
  - **document e-signature** for NDAs, MOUs and similar agreements: signing workflow with
    several signers, audit trail, sealed PDF. Candidates: DocuSeal, Documenso (both
    AGPL-3.0). It provides simple electronic signatures (eIDAS art. 25), not qualified ones.
  - **appointment booking**, a self-hosted alternative to Google Calendar booking pages:
    public booking page, availability read from any CalDAV/iCal calendar, confirmation
    e-mails with an `.ics` invitation. Candidates: Cal.com (AGPL-3.0), Easy!Appointments
    (GPL-3.0), or the appointments feature of Nextcloud Calendar where Nextcloud is already
    deployed.
- Real implementations behind the `containers`, `orchestration`, `knowledge` and `security`
  modules (0.x today), starting with Podman parity on a simple stack (RFC-001 §9, phase 4).
- Debian packages on `qtrn.io/deb/tycho`.
- Single rendering engine (`tycho render`) and the Argo CD config management plugin
  (RFC-001 §5, §9 phase 3).

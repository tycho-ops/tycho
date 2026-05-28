# Tycho Server Dashboard (Dynamic & Zero-Configuration)

This is a reusable Tycho recipe that deploys an ultra-premium, lightweight, and password-protected server services hub and dashboard.

It is **100% dynamic** and **fully automated**: it mounts the host server's Tycho configuration and automatically discovers all your installed recipes (e.g. Nextcloud, Jellyfin, n8n, VPN, Traefik) in real-time, requiring **zero manual links configuration**!

---

## 🌟 Features

- **Sleek Glassmorphic Design:** Modern UI built with Google Fonts Outfit typography, HSL gradients, and smooth animation transitions.
- **Client-Side Cryptographic Lock Screen:** Fully protected by a password validated securely on the client side using SHA-256 hashes.
- **Zero-Configuration Discovery:** Automatically scans your `/etc/tycho` or `~/.tycho` installation directory (via mounted volumes) to list exactly the applications you have installed.
- **Live Status Monitoring:** Periodically pings your active subdomains asynchronously using fast, CORS-friendly requests, dynamically updating service status indicators (Green pulse for online, Red for offline).

---

## 🛠️ Installation

Simply deploy this recipe using the Tycho CLI:

```bash
tycho install dashboard
```

You will be prompted to enter your desired subdomain (e.g., `hub`). The dashboard will then be exposed securely via Traefik at `https://hub.yourdomain.com`.

---

## ⚙️ Customization

### Hiding/Locking with a Password

The dashboard is locked by default with the password `quatrain`.

To customize the password, you can declare the environment variable `DASHBOARD_PASSWORD_HASH` in your global Tycho `.env` file (`~/.tycho/.env` or `/etc/tycho/.env`):

```env
DASHBOARD_PASSWORD_HASH=your_sha256_hash_here
```

To generate a new SHA-256 hash for your password in the terminal, run:

```bash
# On Linux / macOS
echo -n "your-new-password" | shasum -a 256
```

Copy the generated 64-character hash and paste it as the `DASHBOARD_PASSWORD_HASH` value in your `.env`.

### Customizing Title and Subtitle

You can also customize the main dashboard titles directly in your global Tycho `.env` file:

```env
DASHBOARD_TITLE=My Personal Cloud
DASHBOARD_SUBTITLE=Home Server Hub
```

The Bun discovery backend parses these variables from your host `.env` automatically and updates the frontend instantly on refresh!

import path from 'node:path'
import fs from 'node:fs'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = Number(process.env.PORT) || 80
const ENV_FILE = '/app/.env'
const RECIPES_DIR = '/app/recipes'
const PASSWORD_HASH = process.env.DASHBOARD_PASSWORD_HASH || '2093077759d57a2472d6ff3156670a4a69bc92ff5e13d526e031a0e02c612be7' // Hash of 'quatrain'

// Helper to parse env file securely
function parseEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Config] Env file not found at ${filePath}, using defaults.`);
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const cleanLine = line.trim();
    if (cleanLine.startsWith('#') || !cleanLine.includes('=')) return;
    const parts = cleanLine.split('=');
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  });
  return env;
}

// Helper to discover installed recipes and configuration
function discoverServices(): any[] {
  const env = parseEnv(ENV_FILE);
  const domainName = env['DOMAIN_NAME'] || 'localhost';
  const services: any[] = [];

  if (!fs.existsSync(RECIPES_DIR)) {
    console.warn(`[Config] Recipes directory not found at ${RECIPES_DIR}.`);
  } else {
    try {
      const dirs = fs.readdirSync(RECIPES_DIR);
      dirs.forEach(dirName => {
        const dirPath = path.join(RECIPES_DIR, dirName);
        if (!fs.statSync(dirPath).isDirectory()) return;

        const pkgJsonPath = path.join(dirPath, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) return;

        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          const appName = pkgJson.name || dirName;

          // Skip dashboard itself
          if (appName === 'dashboard') return;

          // Resolve subdomain from env (e.g. NEXTCLOUD_SUBDOMAIN)
          const envVarName = `${appName.toUpperCase().replace(/-/g, '_')}_SUBDOMAIN`;
          const subdomain = env[envVarName] || appName;

          // Deduce nice icons & friendly names
          let friendlyName = appName.charAt(0).toUpperCase() + appName.slice(1);
          let icon = '🔗';

          if (appName === 'nextcloud') { friendlyName = 'Nextcloud'; icon = '📁'; }
          else if (appName === 'jellyfin') { friendlyName = 'Jellyfin'; icon = '📺'; }
          else if (appName === 'n8n') { friendlyName = 'n8n'; icon = '⚡'; }
          else if (appName === 'immich') { friendlyName = 'Immich'; icon = '📸'; }
          else if (appName === 'backup-receiver') { friendlyName = 'Backups'; icon = '📦'; }
          else if (appName === 'minio') { friendlyName = 'MinIO'; icon = '🪣'; }

          services.push({
            name: friendlyName,
            url: `https://${subdomain}.${domainName}`,
            icon: icon,
            description: pkgJson.description || `Service ${friendlyName} déployé sur Tycho.`
          });
        } catch (e) {
          console.error(`Failed to parse recipe package.json in ${dirPath}:`, e);
        }
      });
    } catch (e) {
      console.error(`Failed to read recipes directory ${RECIPES_DIR}:`, e);
    }
  }

  // Always include Core Traefik and VPN if we can detect their existence
  if (env['TRAEFIK_AUTH']) {
    services.push({
      name: 'Traefik',
      url: `https://traefik.${domainName}`,
      icon: '🚦',
      description: 'Proxy inversé et gestionnaire de trafic (Admin).'
    });
  }

  // Check if VPN volume or config exists in data or compose
  const vpnDir = '/app/recipes/../core/vpn';
  if (fs.existsSync(vpnDir) || env['WG_PORT']) {
    services.push({
      name: 'VPN',
      url: `https://vpn.${domainName}`,
      icon: '🛡️',
      description: 'Accès distant sécurisé via WireGuard.'
    });
  }

  return services;
}

// --- REST Endpoints ---

// Get active services dynamically scanned
app.get('/api/services', (req, res) => {
  try {
    const services = discoverServices();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get configuration (title, passwordHash)
app.get('/api/config', (req, res) => {
  const env = parseEnv(ENV_FILE);
  const domainName = env['DOMAIN_NAME'] || 'localhost';
  res.json({
    title: env['DASHBOARD_TITLE'] || 'Quatrain Server',
    subtitle: env['DASHBOARD_SUBTITLE'] || 'Infrastructure & Services Hub',
    passwordHash: PASSWORD_HASH,
    domainSuffix: domainName
  });
});

// Serve static HTML assets
app.use(express.static(path.join(__dirname, '../html')));

// Fallback all other routes to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../html/index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`🚀 Tycho Dynamic Dashboard Server is running on port ${PORT}`);
  console.log(`📁 Scanning recipes inside ${RECIPES_DIR}`);
  console.log(`📄 Scanning environment configuration inside ${ENV_FILE}`);
});

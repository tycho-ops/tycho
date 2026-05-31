import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { Backend, PersistedBaseObject, InjectMetaMiddleware } from '@quatrain/backend'
import { SQLiteAdapter } from '@quatrain/backend-sqlite'
import { ExpressAdapter } from '@quatrain/api-server-express'
import { Api } from '@quatrain/api'
import { Core, StringProperty, BaseObjectType, returnAs } from '@quatrain/core'

// --- Configurations ---
const PORT = Number(process.env.PORT) || 4000
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data')
const SQLITE_PATH = path.join(DATA_DIR, 'naming-api.sqlite')
const API_SECRET_SALT = process.env.API_SECRET_SALT || 'default_tycho_secret_salt_123!'
const DOMAIN_SUFFIX = process.env.DOMAIN_SUFFIX || 'tycho.cc'

const IONOS_API_PREFIX = process.env.IONOS_API_PREFIX || ''
const IONOS_API_SECRET = process.env.IONOS_API_SECRET || ''

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true })

// --- Model Definition (Quatrain Style) ---
export interface AliasRecordType extends BaseObjectType {
   subdomain: string
   emailHash: string
   currentIp: string
}

export const AliasRecordProperties: any = [
   {
      name: 'subdomain',
      mandatory: true,
      type: StringProperty.TYPE,
      minLength: 3,
      maxLength: 63,
   },
   {
      name: 'emailHash',
      mandatory: true,
      type: StringProperty.TYPE,
      minLength: 64,
      maxLength: 64,
   },
   {
      name: 'currentIp',
      mandatory: true,
      type: StringProperty.TYPE,
   }
]

export class AliasRecord extends PersistedBaseObject {
   static readonly PROPS_DEFINITION = AliasRecordProperties
   static readonly COLLECTION = 'alias_records'

   static async factory(src: any = undefined): Promise<AliasRecord> {
      return super.factory(src, AliasRecord)
   }
}

Core.addClass('AliasRecord', AliasRecord)

// --- Helpers ---

// Safe SHA-256 hashing helper for anonymity
function hashEmail(email: string): string {
   const cleanEmail = email.trim().toLowerCase()
   return crypto.createHmac('sha256', API_SECRET_SALT).update(cleanEmail).digest('hex')
}

// Helper to verify private IPv4 subnets (RFC 1918, CGNAT, Link-Local)
function isIpv4Private(parts: number[]): boolean {
   const [p0, p1] = parts
   if (p0 === 10) return true
   if (p0 === 172 && p1 >= 16 && p1 <= 31) return true
   if (p0 === 192 && p1 === 168) return true
   if (p0 === 169 && p1 === 254) return true // Link-Local
   if (p0 === 100 && p1 >= 64 && p1 <= 127) return true // CGNAT
   return false
}

// IP Verification for Loopback & Private networks (RFC 1918)
function isIpPrivateOrReserved(ip: string): boolean {
   // Loopback (127.0.0.1, ::1)
   if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) return true

   // Private IPv4 (RFC 1918)
   const parts = ip.split('.').map(Number)
   return parts.length === 4 && isIpv4Private(parts)
}

// Subdomain name reserved keywords to prevent phishing/abuse
const RESERVED_SUBDOMAINS = new Set([
   'admin', 'api', 'traefik', 'dashboard', 'portal', 'secure', 'mail', 'smtp',
   'dns', 'ns', 'ns1', 'ns2', 'vpn', 'tycho', 'mytycho', 'quatrain', 'core',
   'studio', 'support', 'billing', 'login', 'signin', 'ssl', 'cert', 'payment', 'bank'
])

function isValidSubdomain(subdomain: string): boolean {
   // Alphanumeric + hyphen only, length 3 to 63
   const regex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
   if (!regex.test(subdomain)) return false
   return !RESERVED_SUBDOMAINS.has(subdomain)
}

// Helper to create or update an A record
async function upsertRecordA(host: string, zoneId: string, apiKey: string, name: string, ip: string, existingRecord: any): Promise<boolean> {
   if (existingRecord) {
      Api.info(`Updating existing A record for ${name} to ${ip}...`)
      const putRes = await fetch(`${host}/zones/${zoneId}/records/${existingRecord.id}`, {
         method: 'PUT',
         headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
         },
         body: JSON.stringify({ content: ip, ttl: 300 })
      })
      if (!putRes.ok) {
         Api.error(`Failed to update A record: ${await putRes.text()}`)
         return false
      }
   } else {
      Api.info(`Creating new A record for ${name} to ${ip}...`)
      const postRes = await fetch(`${host}/zones/${zoneId}/records`, {
         method: 'POST',
         headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
         },
         body: JSON.stringify([{
            name,
            type: 'A',
            content: ip,
            ttl: 300
         }])
      })
      if (!postRes.ok) {
         Api.error(`Failed to create A record: ${await postRes.text()}`)
         return false
      }
   }
   return true
}

// Helper to create or update a CNAME wildcard record
async function upsertRecordCNAME(host: string, zoneId: string, apiKey: string, name: string, target: string, existingWildcard: any): Promise<boolean> {
   if (existingWildcard) {
      Api.info(`Updating existing CNAME wildcard for ${name} to ${target}...`)
      const putRes = await fetch(`${host}/zones/${zoneId}/records/${existingWildcard.id}`, {
         method: 'PUT',
         headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
         },
         body: JSON.stringify({ content: target, ttl: 300 })
      })
      if (!putRes.ok) {
         Api.error(`Failed to update CNAME wildcard: ${await putRes.text()}`)
         return false
      }
   } else {
      Api.info(`Creating new CNAME wildcard for ${name} to ${target}...`)
      const postRes = await fetch(`${host}/zones/${zoneId}/records`, {
         method: 'POST',
         headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
         },
         body: JSON.stringify([{
            name,
            type: 'CNAME',
            content: target,
            ttl: 300
         }])
      })
      if (!postRes.ok) {
         Api.error(`Failed to create CNAME wildcard: ${await postRes.text()}`)
         return false
      }
   }
   return true
}

// --- IONOS DNS API Client Logic ---
async function updateIonosDNS(subdomain: string, ip: string): Promise<boolean> {
   if (!IONOS_API_PREFIX || !IONOS_API_SECRET) {
      Api.info(`[DNS Simulation] Successfully simulated DNS mapping for *.${subdomain}.${DOMAIN_SUFFIX} -> ${ip}`)
      return true
   }

   const apiKey = `${IONOS_API_PREFIX}.${IONOS_API_SECRET}`
   const host = 'https://api.hosting.ionos.com/dns/v1'

   try {
      // 1. Fetch available zones to find the target zone ID
      const zonesRes = await fetch(`${host}/zones`, {
         headers: { 'X-API-Key': apiKey }
      })
      if (!zonesRes.ok) {
         Api.error(`Ionos API fetch zones failed with status ${zonesRes.status}`)
         return false
      }
      const zones = (await zonesRes.json()) as any[]
      const zone = zones.find(z => z.name === DOMAIN_SUFFIX)
      if (!zone) {
         Api.error(`Zone ${DOMAIN_SUFFIX} not found on Ionos account`)
         return false
      }
      const zoneId = zone.id

      // 2. Fetch current records to see if they already exist
      const recordsRes = await fetch(`${host}/zones/${zoneId}`, {
         headers: { 'X-API-Key': apiKey }
      })
      if (!recordsRes.ok) {
         Api.error(`Failed to fetch records for zone ${zoneId}`)
         return false
      }
      const zoneDetail = (await recordsRes.json()) as any
      const records = zoneDetail.records || []

      const targetRecordName = `${subdomain}.${DOMAIN_SUFFIX}`
      const targetWildcardName = `*.${subdomain}.${DOMAIN_SUFFIX}`

      const existingRecord = records.find((r: any) => r.name === targetRecordName && r.type === 'A')
      const existingWildcard = records.find((r: any) => r.name === targetWildcardName && r.type === 'CNAME')

      // 3. Create or Update A Record (toto.tycho.cc)
      const aSuccess = await upsertRecordA(host, zoneId, apiKey, targetRecordName, ip, existingRecord)
      if (!aSuccess) return false

      // 4. Create or Update CNAME Record (*.toto.tycho.cc)
      const cnameSuccess = await upsertRecordCNAME(host, zoneId, apiKey, targetWildcardName, targetRecordName, existingWildcard)
      if (!cnameSuccess) return false

      return true
   } catch (error) {
      Api.error(`Failed to update Ionos DNS: ${(error as Error).message}`)
      return false
   }
}

// --- Main Application ---
export async function startNamingApi() {
   try {
      // 1. Initialize SQLite Database
      const adapter = new SQLiteAdapter({
         config: { database: SQLITE_PATH },
         middlewares: [new InjectMetaMiddleware()],
         softDelete: false
      })
      Backend.addBackend(adapter, 'default', true)

      // Create database table if not exists using standard SQLite adapter sync
      const db = (adapter as any).db || (await (adapter as any).getDb())
      await db.exec(`
         CREATE TABLE IF NOT EXISTS alias_records (
            id TEXT PRIMARY KEY,
            subdomain TEXT NOT NULL UNIQUE,
            emailHash TEXT NOT NULL,
            currentIp TEXT NOT NULL,
            createdAt TEXT,
            updatedAt TEXT,
            status TEXT
         );
      `)

      // 2. Initialize Express Adapter
      const server = new ExpressAdapter(undefined, { apiPrefix: '' })
      Api.addServer(server, 'default')

// Helper to update an existing alias
async function handleUpdateAlias(res: any, record: AliasRecord, subdomain: string, ip: string): Promise<any> {
   // Check if IP is actually changing (No-op detection)
   if (record.val('currentIp') === ip) {
      Api.info(`[No-Op] Subdomain ${subdomain} already points to ${ip}`)
      return res.json({ message: 'Adresse IP déjà à jour.' })
   }

   // Update record
   record.set('currentIp', ip)
   await (record as any).save()

   // Update DNS
   const dnsSuccess = await updateIonosDNS(subdomain, ip)
   if (!dnsSuccess) {
      return res.status(502).json({ error: `Impossible de mettre à jour les enregistrements DNS.` })
   }

   Api.info(`Updated subdomain ${subdomain} to new IP ${ip}`)
   return res.json({ message: 'Adresse IP mise à jour avec succès.' })
}

// Helper to create a new alias
async function handleCreateAlias(res: any, subdomain: string, emailHash: string, ip: string): Promise<any> {
   // Rate Limit checking: Count existing domains owned by this email
   const userDomains = await AliasRecord.query()
      .where('emailHash', emailHash)
      .execute(returnAs.AS_INSTANCES)

   if (userDomains.items.length >= 5) {
      return res.status(429).json({ error: `Limite atteinte : Maximum 5 sous-domaines par compte utilisateur.` })
   }

   // Create new record
   const record = await AliasRecord.factory()
   record.set('subdomain', subdomain)
   record.set('emailHash', emailHash)
   record.set('currentIp', ip)
   await (record as any).save()

   // Update DNS
   const dnsSuccess = await updateIonosDNS(subdomain, ip)
   if (!dnsSuccess) {
      return res.status(502).json({ error: `Impossible d'enregistrer les enregistrements DNS.` })
   }

   Api.info(`Registered new subdomain *.${subdomain}.${DOMAIN_SUFFIX} to IP ${ip}`)
   return res.json({ message: 'Alias créé et configuré avec succès.' })
}

      // 3. Register endpoints
      server.post('/v1/alias/register', async (req: any, res: any) => {
         try {
            const { subdomain, email, ip } = req.body

            // Input Validation
            if (!subdomain || !email || !ip) {
               return res.status(400).json({ error: 'Champs manquants : subdomain, email et ip sont requis.' })
            }

            if (!isValidSubdomain(subdomain)) {
               return res.status(400).json({ error: `Le sous-domaine '${subdomain}' est invalide ou réservé.` })
            }

            if (isIpPrivateOrReserved(ip)) {
               return res.status(400).json({ error: `L'adresse IP '${ip}' n'est pas autorisée (privée ou loopback).` })
            }

            const emailHash = hashEmail(email)

            // Search for existing subdomain record in DB
            const existingRecords = await AliasRecord.query()
               .where('subdomain', subdomain)
               .execute(returnAs.AS_INSTANCES)

            const records = existingRecords.items as AliasRecord[]

            if (records.length > 0) {
               const record = records[0]
               // Authorization Check: Check if requester matches owner
               if (record.val('emailHash') !== emailHash) {
                  return res.status(403).json({ error: `Ce sous-domaine est déjà enregistré par un autre utilisateur.` })
               }

               return await handleUpdateAlias(res, record, subdomain, ip)
            } else {
               return await handleCreateAlias(res, subdomain, emailHash, ip)
            }
         } catch (err) {
            Api.error(`Error registering alias: ${(err as Error).message}`)
            return res.status(500).json({ error: 'Erreur interne du serveur.' })
         }
      })

      // Healthcheck route
      server.get('/health', (_req: any, res: any) => {
         res.json({ status: 'ok', domainSuffix: DOMAIN_SUFFIX })
      })

      // 4. Start Server
      server.start(PORT, () => {
         Api.info(`🚀 Tycho Naming API is running on http://localhost:${PORT}`)
         Api.info(`💾 Database initialized at ${SQLITE_PATH}`)
      })
   } catch (error) {
      Api.error(`Naming API failed to start: ${error}`)
      process.exit(1)
   }
}

// Auto-run if executed directly
if (require.main === module || (typeof (globalThis as any).Bun !== 'undefined' && (globalThis as any).Bun.main === __filename)) {
   startNamingApi()
}

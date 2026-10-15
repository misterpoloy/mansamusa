// Generates the ES256 key the host app uses to sign agent JWTs (tracker P7.01).
// Usage: yarn tsx scripts/gen-jwt-key.ts   → prints MANSA_JWT_PRIVATE_KEY and MANSA_JWT_KID
import { createHash, generateKeyPairSync } from 'node:crypto'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const jwk = publicKey.export({ format: 'jwk' }) as { crv: string; kty: string; x: string; y: string }
// RFC 7638 thumbprint as the key id
const kid = createHash('sha256')
  .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
  .digest('base64url')

console.log('# Store these as secrets (Vercel env / .env.local). Never commit them.')
console.log(`MANSA_JWT_KID=${kid}`)
console.log(`MANSA_JWT_PRIVATE_KEY="${pem.trim().replace(/\n/g, '\\n')}"`)

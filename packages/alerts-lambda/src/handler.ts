import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

// Invoked by EventBridge Scheduler (daily briefing, paydays). The host app owns the
// detectors and the Telegram delivery; this function only authenticates and triggers.
const ssm = new SSMClient({})
let cachedSecret: string | undefined

async function secret(): Promise<string> {
  if (cachedSecret) return cachedSecret
  const name = process.env.ALERTS_SECRET_PARAM ?? '/mansa/alerts_secret'
  const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }))
  if (!out.Parameter?.Value) throw new Error(`SSM parameter ${name} is empty`)
  cachedSecret = out.Parameter.Value
  return cachedSecret
}

export async function handler(event: { schedule?: string } = {}) {
  const url = process.env.WALLET_ALERTS_URL
  if (!url) throw new Error('WALLET_ALERTS_URL is not set')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await secret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ schedule: event.schedule ?? 'daily' }),
    signal: AbortSignal.timeout(50_000),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Alerts endpoint answered ${res.status}: ${body.slice(0, 300)}`)
  return { status: res.status, body: body.slice(0, 1000) }
}

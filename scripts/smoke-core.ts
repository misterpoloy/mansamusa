// Live check of the core loop against Bedrock with fake in-memory tools (tracker P3.11).
// Usage: MANSA_MODEL_SONNET=<inference profile id> AWS_PROFILE=default yarn tsx scripts/smoke-core.ts "¿cómo voy?"
import {
  PERSONA, appendUserText, createBedrockClient, createLocalRegistry, getOverview, modelFor, requestContext, runAgent, type ToolCtx,
} from '../packages/core/src/index.js'

const ctx: ToolCtx = {
  tenantId: 'tenant_smoke', userId: 'user_smoke', role: 'owner', locale: 'auto',
  channel: 'cli', runtime: 'raw', demo: false, timezone: 'America/Mexico_City',
}

const registry = createLocalRegistry({ get_overview: getOverview }, {
  get_overview: async () => ({
    asOf: new Date().toISOString().slice(0, 10),
    cash: [{ currency: 'MXN', total: '18250.40', accounts: 3 }, { currency: 'GTQ', total: '4100.00', accounts: 1 }],
    creditCards: [{ currency: 'MXN', owed: '9200.00', limit: '60000.00', utilizationPct: 15.3, cards: 2 }],
    loans: [{ currency: 'MXN', balance: '84000.00', loans: 1 }],
    netByCurrency: [{ currency: 'MXN', total: '-74949.60' }, { currency: 'GTQ', total: '4100.00' }],
    upcoming: [{ kind: 'card_payment', name: 'Demo Card', date: '2026-10-20', amount: '9200.00', currency: 'MXN' }],
    notes: ['Synthetic data from scripts/smoke-core.ts'],
  }),
})

const question = process.argv[2] ?? '¿Cómo voy este mes?'
const client = createBedrockClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
const modelId = modelFor('chat', process.env)

for (let run = 1; run <= 2; run++) {
  console.log(`\n── run ${run} (second run should show cache reads) ──`)
  for await (const e of runAgent({
    client, modelId, persona: PERSONA, context: requestContext(ctx), registry, ctx,
    messages: appendUserText([], question),
  })) {
    if (e.type === 'text') process.stdout.write(e.text)
    else if (e.type === 'tool_call') console.log(`\n[tool] ${e.name} ${JSON.stringify(e.input)}`)
    else if (e.type === 'usage') console.log(`\n[usage] in=${e.inputTokens} out=${e.outputTokens} cacheRead=${e.cacheReadTokens} cacheWrite=${e.cacheWriteTokens} ${e.latencyMs}ms`)
    else if (e.type === 'error') console.error(`\n[error] ${e.message}`)
    else if (e.type === 'done') console.log(`\n[done] ${e.stopReason} after ${e.steps} step(s)`)
  }
}

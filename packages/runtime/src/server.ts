import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

// AgentCore Runtime service contract: port 8080, GET /ping, POST /invocations.
// /invocations is wired to runAgent + the MCP registry in P7.04.
const PORT = Number(process.env.PORT ?? 8080)

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' && req.url === '/ping') {
    return json(res, 200, { status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) })
  }
  if (req.method === 'POST' && req.url?.startsWith('/invocations')) {
    return json(res, 501, { error: 'Not implemented yet (tracker P7.04)' })
  }
  return json(res, 404, { error: 'Not found' })
}

createServer((req, res) => {
  handle(req, res).catch((error) => json(res, 500, { error: error instanceof Error ? error.message : String(error) }))
}).listen(PORT, () => console.log(`mansamusa runtime listening on :${PORT}`))

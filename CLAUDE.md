# Mansa Musa

Bedrock agent core + infrastructure for a personal-finance app. The host app (a Next.js wallet) implements the tool contracts against its own database; this repo never imports an ORM.

## Layout
- `packages/core` — `@mansamusa/core`: `runAgent()` ConverseStream loop, Zod tool contracts, registries (local / MCP), model router, bilingual persona, SSE helpers, pure compute (payoff, statement check, dedup).
- `packages/runtime` — AgentCore Runtime container (`GET /ping`, `POST /invocations`, linux/arm64, port 8080).
- `packages/alerts-lambda` — EventBridge Scheduler target that calls the host's alerts endpoint.
- `infra/` — Terraform only (no CDK). `infra/bootstrap/deployer-policy.json` is the IAM policy a deployer needs.

## Rules
- The model decides, code computes: money math lives in `compute/` as integer-cent TypeScript, never in prompts.
- Every write is a proposal a human approves. Tools never take `tenantId` as input; it comes from `ToolCtx`, built from a verified identity.
- `zod` is a peer dependency of core. Core never throws a `ZodError` into the host; registries convert errors into tool results.
- Anything under `src/sse.ts` must stay free of Node imports (React Native uses it).
- Yarn 4 (`corepack yarn ...`). `yarn test` must stay green; add tests next to new compute or loop behaviour.
- No secrets, account numbers or real ledgers in this repo. Synthetic data only.

# Mansa Musa

An AWS Bedrock agent for a real personal-finance app: one hand-rolled `ConverseStream` tool loop running on two runtimes. It runs **in-process** inside a Next.js route, and in **AgentCore Runtime** with tools served over AgentCore Gateway (MCP). Built for a JSConf talk, and used for real.

## Layout (planned)

```
packages/core          @mansamusa/core — agent loop, Zod tool contracts, model router, bilingual persona, channel adapters
packages/runtime       AgentCore Runtime container (POST /invocations, GET /ping, linux/arm64)
packages/alerts-lambda EventBridge Scheduler → host app alerts endpoint
infra/                 Terraform: budget, Vercel OIDC role, Guardrails, AgentCore runtime/gateway/memory, alerts
seeds/                 synthetic demo data only — never real ledgers
```

## Principles

- **The LLM decides, code computes.** Balances, payoff plans and statement checks are pure TypeScript.
- **Propose → confirm.** The agent never writes directly; every change is a proposal a human approves.
- **Tenant from identity, never from the prompt.** Tools receive `ctx` from a verified JWT.
- **Deploy your own.** `terraform apply` into your own AWS account; your app is your own OIDC issuer.

The host app (the wallet) implements the tool contracts against its own database. This repo never imports a specific ORM.

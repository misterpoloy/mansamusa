output "vercel_role_arn" {
  description = "AWS_ROLE_ARN for the wallet on Vercel."
  value       = try(module.vercel_oidc[0].role_arn, null)
}

output "guardrail_id" {
  value = module.guardrails.base_id
}

output "guardrail_version" {
  value = module.guardrails.base_version
}

output "demo_guardrail_id" {
  value = module.guardrails.demo_id
}

output "demo_guardrail_version" {
  value = module.guardrails.demo_version
}

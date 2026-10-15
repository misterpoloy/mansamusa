locals {
  account_id = data.aws_caller_identity.current.account_id
}

module "budget" {
  count     = var.budget_email == "" ? 0 : 1
  source    = "./modules/budget"
  name      = var.project
  limit_usd = var.budget_limit_usd
  email     = var.budget_email
}

module "guardrails" {
  source = "./modules/guardrails"
  name   = var.project
}

module "vercel_oidc" {
  count  = var.vercel_team_slug == "" ? 0 : 1
  source = "./modules/vercel_oidc"

  name           = var.project
  team_slug      = var.vercel_team_slug
  project_name   = var.vercel_project_name
  environments   = var.vercel_environments
  region         = var.aws_region
  account_id     = local.account_id
  guardrail_arns = module.guardrails.arns
}

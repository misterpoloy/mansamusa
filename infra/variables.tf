variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "mansamusa"
}

variable "aws_region" {
  description = "Home region. Bedrock, AgentCore and Guardrails must all be available here."
  type        = string
  default     = "us-east-1"
}

variable "budget_email" {
  description = "Where budget alerts go. Empty skips the budget (set it before real use)."
  type        = string
  default     = ""
}

variable "budget_limit_usd" {
  description = "Monthly budget for the account (Bedrock tokens + AgentCore + infra)."
  type        = number
  default     = 25
}

variable "vercel_team_slug" {
  description = "Vercel team slug used by the OIDC issuer (https://oidc.vercel.com/<slug>). Empty disables the Vercel role."
  type        = string
  default     = ""
}

variable "vercel_project_name" {
  description = "Vercel project that hosts the wallet app."
  type        = string
  default     = ""
}

variable "vercel_environments" {
  description = "Vercel environments allowed to assume the role."
  type        = list(string)
  default     = ["production", "preview"]
}

variable "wallet_url" {
  description = "Public origin of the host app; also the JWT issuer (e.g. https://your-wallet.vercel.app)."
  type        = string
  default     = ""
}

variable "name" { type = string }
variable "team_slug" { type = string }
variable "project_name" { type = string }
variable "environments" { type = list(string) }
variable "region" { type = string }
variable "account_id" { type = string }
variable "guardrail_arns" { type = list(string) }

# Vercel issues short-lived OIDC tokens to functions; AWS trusts them, so the wallet
# never holds static AWS keys. Team issuer mode: https://oidc.vercel.com/<team>.
locals {
  issuer_host = "oidc.vercel.com/${var.team_slug}"
  audience    = "https://vercel.com/${var.team_slug}"
  subjects    = [for env in var.environments : "owner:${var.team_slug}:project:${var.project_name}:environment:${env}"]
}

resource "aws_iam_openid_connect_provider" "vercel" {
  url            = "https://${local.issuer_host}"
  client_id_list = [local.audience]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.vercel.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.issuer_host}:aud"
      values   = [local.audience]
    }
    condition {
      test     = "StringLike"
      variable = "${local.issuer_host}:sub"
      values   = local.subjects
    }
  }
}

data "aws_iam_policy_document" "wallet" {
  statement {
    sid     = "InvokeClaude"
    actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    # Cross-region inference profiles route to models in several US regions,
    # so both the profile and the underlying foundation models must be allowed.
    resources = [
      "arn:aws:bedrock:${var.region}:${var.account_id}:inference-profile/us.anthropic.*",
      "arn:aws:bedrock:${var.region}:${var.account_id}:application-inference-profile/*",
      "arn:aws:bedrock:*::foundation-model/anthropic.*",
    ]
  }
  statement {
    sid       = "Guardrails"
    actions   = ["bedrock:ApplyGuardrail"]
    resources = var.guardrail_arns
  }
  statement {
    sid       = "InvokeAgentRuntime"
    actions   = ["bedrock-agentcore:InvokeAgentRuntime"]
    resources = ["arn:aws:bedrock-agentcore:${var.region}:${var.account_id}:runtime/*"]
  }
}

resource "aws_iam_role" "wallet" {
  name                 = "${var.name}-wallet"
  description          = "Assumed by the wallet app on Vercel via OIDC"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "wallet" {
  name   = "${var.name}-wallet"
  role   = aws_iam_role.wallet.id
  policy = data.aws_iam_policy_document.wallet.json
}

output "role_arn" { value = aws_iam_role.wallet.arn }

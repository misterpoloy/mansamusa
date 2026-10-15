variable "name" { type = string }

locals {
  blocked = "Mansa Musa no puede ayudar con eso. / Mansa Musa can't help with that."

  # Always on. Prompt-attack filtering applies to input only.
  content_filters = {
    PROMPT_ATTACK = { input = "HIGH", output = "NONE" }
    HATE          = { input = "MEDIUM", output = "MEDIUM" }
    INSULTS       = { input = "LOW", output = "MEDIUM" }
    SEXUAL        = { input = "MEDIUM", output = "MEDIUM" }
    VIOLENCE      = { input = "MEDIUM", output = "MEDIUM" }
    MISCONDUCT    = { input = "LOW", output = "LOW" }
  }

  base_pii = ["CREDIT_DEBIT_CARD_NUMBER", "CREDIT_DEBIT_CARD_CVV", "PIN", "PASSWORD", "INTERNATIONAL_BANK_ACCOUNT_NUMBER"]
  # Stage only: hide people and places behind the numbers.
  demo_pii = ["NAME", "EMAIL", "PHONE", "ADDRESS"]

  regexes = {
    mx_clabe = { pattern = "\\b\\d{18}\\b", description = "Mexican CLABE (18 digits)" }
  }

  variants = {
    base = local.base_pii
    demo = concat(local.base_pii, local.demo_pii)
  }
}

resource "aws_bedrock_guardrail" "this" {
  for_each = local.variants

  name                      = "${var.name}-${each.key}"
  description               = "Mansa Musa ${each.key} guardrail"
  blocked_input_messaging   = local.blocked
  blocked_outputs_messaging = local.blocked

  content_policy_config {
    dynamic "filters_config" {
      for_each = local.content_filters
      content {
        type            = filters_config.key
        input_strength  = filters_config.value.input
        output_strength = filters_config.value.output
      }
    }
  }

  topic_policy_config {
    topics_config {
      name       = "SecuritiesPicks"
      type       = "DENY"
      definition = "Recommending specific stocks, bonds, funds, ETFs or cryptocurrencies to buy or sell, or predicting their prices."
      examples = [
        "¿Qué acciones me recomiendas comprar?",
        "Should I buy Bitcoin now?",
        "Which ETF will go up next month?",
      ]
    }
  }

  sensitive_information_policy_config {
    dynamic "pii_entities_config" {
      for_each = toset(each.value)
      content {
        type   = pii_entities_config.value
        action = "ANONYMIZE"
      }
    }
    dynamic "regexes_config" {
      for_each = local.regexes
      content {
        name        = regexes_config.key
        description = regexes_config.value.description
        pattern     = regexes_config.value.pattern
        action      = "ANONYMIZE"
      }
    }
  }
}

resource "aws_bedrock_guardrail_version" "this" {
  for_each      = aws_bedrock_guardrail.this
  guardrail_arn = each.value.guardrail_arn
  description   = "managed by terraform"
}

output "arns" { value = [for g in aws_bedrock_guardrail.this : g.guardrail_arn] }
output "base_id" { value = aws_bedrock_guardrail.this["base"].guardrail_id }
output "base_version" { value = aws_bedrock_guardrail_version.this["base"].version }
output "demo_id" { value = aws_bedrock_guardrail.this["demo"].guardrail_id }
output "demo_version" { value = aws_bedrock_guardrail_version.this["demo"].version }

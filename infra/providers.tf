provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Repo      = "mansamusa"
    }
  }
}

data "aws_caller_identity" "current" {}

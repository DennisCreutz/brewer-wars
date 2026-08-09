variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "zone_id" {
  description = "Route53 hosted zone id for domain_name"
  type        = string
}

variable "cloudfront_certificate_arn" {
  description = "ACM certificate (us-east-1) covering domain_name and *.domain_name, used for the Cognito custom domain"
  type        = string
}

variable "api_certificate_arn" {
  description = "ACM certificate (regional) covering api.domain_name"
  type        = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "lambda_dist_path" {
  description = "Absolute path to backend/dist, containing one subfolder per handler"
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "use_custom_auth_domain" {
  description = "Use auth.<domain_name> for the Cognito hosted UI. Requires the frontend module's CloudFront distribution (and its apex A record) to already exist. Set to false to fall back to the free Cognito-hosted prefix domain when that isn't available yet (e.g. account pending AWS's CloudFront verification)."
  type        = bool
  default     = true
}

data "aws_region" "current" {}

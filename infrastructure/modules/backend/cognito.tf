resource "aws_cognito_user_pool" "this" {
  name = "${var.project}-${var.environment}"

  # No self-registration: only admins (via CLI/console) create accounts.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  username_attributes = ["email"]

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_pool_add_ons {
    advanced_security_mode = "OFF"
  }

  deletion_protection = "ACTIVE"
}

resource "aws_cognito_user_group" "admins" {
  name         = "admins"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Can create and manage wars"
  precedence   = 1
}

resource "aws_cognito_user_group" "users" {
  name         = "users"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Can view and play wars"
  precedence   = 10
}

resource "aws_cognito_user_pool_domain" "auth" {
  # Falls back to the free Cognito-hosted prefix domain when the custom
  # domain can't be provisioned yet — Cognito requires the parent domain
  # (brewer-wars.com) to already resolve to an A record, which comes from
  # the frontend module's CloudFront distribution. If this account is
  # still pending AWS's CloudFront verification (see AccessDenied on the
  # frontend module), that A record won't exist yet. Flip
  # var.use_custom_auth_domain back to true and re-apply once CloudFront
  # is live to switch over — no other resource needs to change.
  domain          = var.use_custom_auth_domain ? "auth.${var.domain_name}" : "${var.project}-${var.environment}"
  certificate_arn = var.use_custom_auth_domain ? var.cloudfront_certificate_arn : null
  user_pool_id    = aws_cognito_user_pool.this.id
}

resource "aws_route53_record" "auth_domain" {
  count = var.use_custom_auth_domain ? 1 : 0

  zone_id = var.zone_id
  name    = aws_cognito_user_pool_domain.auth.domain
  type    = "A"

  alias {
    name                   = aws_cognito_user_pool_domain.auth.cloudfront_distribution
    zone_id                = "Z2FDTNDATAQYW2" # fixed CloudFront hosted zone id used by all Cognito custom domains
    evaluate_target_health = false
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = [
    "https://${var.domain_name}/auth/callback",
    "http://localhost:5173/auth/callback",
  ]
  logout_urls = [
    "https://${var.domain_name}/",
    "http://localhost:5173/",
  ]

  supported_identity_providers = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  enable_token_revocation              = true
}

output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "auth_domain" {
  value = var.use_custom_auth_domain ? aws_cognito_user_pool_domain.auth.domain : "${aws_cognito_user_pool_domain.auth.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "user_pool_issuer" {
  value = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

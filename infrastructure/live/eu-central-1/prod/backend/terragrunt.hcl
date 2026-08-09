include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infrastructure/modules/backend"
}

dependency "dns" {
  config_path = "../dns"
}

dependency "database" {
  config_path = "../database"
}

inputs = {
  zone_id                    = dependency.dns.outputs.zone_id
  cloudfront_certificate_arn = dependency.dns.outputs.cloudfront_certificate_arn
  api_certificate_arn        = dependency.dns.outputs.api_certificate_arn
  table_name                 = dependency.database.outputs.table_name
  table_arn                  = dependency.database.outputs.table_arn
  lambda_dist_path           = "${get_repo_root()}/backend/dist"

  # TEMPORARY: this account is pending AWS's CloudFront account
  # verification (AccessDenied on the frontend module), so there's no
  # CloudFront distribution yet to give brewer-wars.com an A record, which
  # the custom Cognito domain requires. Falls back to the free
  # Cognito-hosted prefix domain until that's resolved — flip to true and
  # re-apply once `frontend` succeeds.
  use_custom_auth_domain = false
}

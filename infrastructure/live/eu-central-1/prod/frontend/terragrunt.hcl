include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infrastructure/modules/frontend"
}

dependency "dns" {
  config_path = "../dns"
}

inputs = {
  zone_id                    = dependency.dns.outputs.zone_id
  cloudfront_certificate_arn = dependency.dns.outputs.cloudfront_certificate_arn
}

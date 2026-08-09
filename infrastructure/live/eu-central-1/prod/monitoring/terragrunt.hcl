include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infrastructure/modules/monitoring"
}

dependency "backend" {
  config_path = "../backend"

  mock_outputs = {
    api_id = "mock"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "database" {
  config_path = "../database"
}

dependency "frontend" {
  config_path = "../frontend"
}

inputs = {
  api_id                 = dependency.backend.outputs.api_id
  lambda_function_names  = dependency.backend.outputs.lambda_function_names
  table_name             = dependency.database.outputs.table_name
  distribution_id        = dependency.frontend.outputs.distribution_id
}

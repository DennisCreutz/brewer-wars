locals {
  functions = {
    listWars = {
      method  = "GET"
      path    = "/wars"
      actions = ["dynamodb:Query", "dynamodb:BatchGetItem"]
    }
    createWar = {
      method = "POST"
      path   = "/wars"
      # TransactWriteItems requires IAM permission for both the
      # transaction action itself and every underlying item action it
      # performs (here: three Put items) — granting only
      # TransactWriteItems is insufficient and fails at runtime.
      actions = ["dynamodb:TransactWriteItems", "dynamodb:PutItem"]
    }
    getWar = {
      method  = "GET"
      path    = "/wars/{warId}"
      actions = ["dynamodb:GetItem"]
    }
    putWar = {
      method  = "PUT"
      path    = "/wars/{warId}"
      actions = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    }
    deleteWar = {
      method  = "DELETE"
      path    = "/wars/{warId}"
      actions = ["dynamodb:GetItem", "dynamodb:TransactWriteItems", "dynamodb:DeleteItem"]
    }
    resetWars = {
      method  = "DELETE"
      path    = "/wars"
      actions = ["dynamodb:Query", "dynamodb:BatchWriteItem"]
    }
  }
}

data "archive_file" "handler" {
  for_each = local.functions

  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/${each.key}"
  output_path = "${path.module}/.build/${each.key}.zip"
}

resource "aws_cloudwatch_log_group" "handler" {
  for_each = local.functions

  name              = "/aws/lambda/${var.project}-${var.environment}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "handler" {
  for_each = local.functions

  name = "${var.project}-${var.environment}-${each.key}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "handler_dynamodb" {
  for_each = local.functions

  name = "dynamodb-access"
  role = aws_iam_role.handler[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = each.value.actions
      Resource = [var.table_arn]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "handler_logs" {
  for_each = local.functions

  role       = aws_iam_role.handler[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "handler" {
  for_each = local.functions

  function_name    = "${var.project}-${var.environment}-${each.key}"
  role             = aws_iam_role.handler[each.key].arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 10

  filename         = data.archive_file.handler[each.key].output_path
  source_code_hash = data.archive_file.handler[each.key].output_base64sha256

  environment {
    variables = {
      TABLE_NAME      = var.table_name
      ALLOWED_ORIGIN  = "https://${var.domain_name}"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.handler,
    aws_iam_role_policy.handler_dynamodb,
    aws_iam_role_policy_attachment.handler_logs,
  ]
}

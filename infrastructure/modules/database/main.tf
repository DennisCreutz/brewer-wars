variable "project" {
  type = string
}

variable "environment" {
  type = string
}

resource "aws_dynamodb_table" "wars" {
  name         = "${var.project}-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = true

  tags = {
    Name = "${var.project}-${var.environment}"
  }
}

output "table_name" {
  value = aws_dynamodb_table.wars.name
}

output "table_arn" {
  value = aws_dynamodb_table.wars.arn
}

locals {
  bucket_name = "oz-artifacts-${var.environment}"
}

# Per docs/code-sandbox-and-artifact-generation.md §6.3 — one bucket per env, private ACL,
# CORS limited to chat origins, 30-day object expiration for generated files.
resource "digitalocean_spaces_bucket" "artifacts" {
  name   = local.bucket_name
  region = var.spaces_region
  acl    = "private"

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.chat_origins
    max_age_seconds = 3600
  }

  lifecycle_rule {
    id      = "expire-generated-artifacts-30d"
    enabled = true
    # Applies to all object keys; layout is <tenant>/<yyyymmdd>/<art_id>.<ext> (see docs).
    expiration {
      days = 30
    }
  }
}

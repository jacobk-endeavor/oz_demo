output "bucket_name" {
  description = "Spaces bucket name (set DO_SPACES_BUCKET to this in App Platform / .env)."
  value       = digitalocean_spaces_bucket.artifacts.name
}

output "spaces_endpoint" {
  description = "S3 API endpoint base for this region (set DO_SPACES_ENDPOINT)."
  value       = "https://${var.spaces_region}.digitaloceanspaces.com"
}

output "spaces_region" {
  value = var.spaces_region
}

output "cors_allowed_origins" {
  value = var.chat_origins
}

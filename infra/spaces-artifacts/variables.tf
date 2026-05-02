variable "environment" {
  description = "Short env name appended to the bucket (e.g. dev, prod, staging)."
  type        = string
}

variable "spaces_region" {
  description = "DigitalOcean region slug for Spaces (must match app + endpoint, e.g. nyc3)."
  type        = string
  default     = "nyc3"
}

variable "do_token" {
  description = "DigitalOcean API token (create resources). Not the Spaces access key."
  type        = string
  sensitive   = true
}

variable "spaces_access_id" {
  description = "Spaces key (access key id) for the Terraform provider S3/Spaces API."
  type        = string
  sensitive   = true
}

variable "spaces_secret_key" {
  description = "Spaces secret for the Terraform provider S3/Spaces API."
  type        = string
  sensitive   = true
}

variable "chat_origins" {
  description = "Origins allowed to fetch objects via browser (CORS), e.g. the App Platform chat URL and local dev."
  type        = list(string)
}

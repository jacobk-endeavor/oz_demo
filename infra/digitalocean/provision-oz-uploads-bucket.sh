#!/usr/bin/env bash
# Provision DigitalOcean Spaces bucket for chat uploads (separate from artifacts).
# Idempotent: skips create if the bucket already exists; reapplies CORS + lifecycle.
#
# Required:
#   DO_SPACES_REGION       — e.g. nyc3
#   OZ_UPLOAD_ENV          — env suffix for bucket name (e.g. dev, staging, prod)
#   OZ_CHAT_CORS_ORIGIN    — single origin allowed for browser uploads, e.g. https://oz-demo-xxx.ondigitalocean.app
# Credentials (either pair):
#   DO_SPACES_KEY + DO_SPACES_SECRET   — repo convention from .env.example
#   AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
#
# Optional:
#   DO_SPACES_ENDPOINT     — override base URL (default https://${DO_SPACES_REGION}.digitaloceanspaces.com)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export OZ_CHAT_CORS_ORIGIN="${OZ_CHAT_CORS_ORIGIN:?set OZ_CHAT_CORS_ORIGIN to the chat web origin (single origin)}"
export OZ_UPLOAD_ENV="${OZ_UPLOAD_ENV:?set OZ_UPLOAD_ENV (e.g. dev, prod)}"
DO_SPACES_REGION="${DO_SPACES_REGION:?set DO_SPACES_REGION (e.g. nyc3)}"

AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${DO_SPACES_KEY:-}}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${DO_SPACES_SECRET:-}}"
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY

if [[ -z "$AWS_ACCESS_KEY_ID" || -z "$AWS_SECRET_ACCESS_KEY" ]]; then
  echo "Missing Spaces credentials: set DO_SPACES_KEY/DO_SPACES_SECRET or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY" >&2
  exit 1
fi

ENDPOINT="${DO_SPACES_ENDPOINT:-https://${DO_SPACES_REGION}.digitaloceanspaces.com}"
BUCKET="oz-uploads-${OZ_UPLOAD_ENV}"

if aws s3api head-bucket --bucket "$BUCKET" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
  echo "Bucket already exists: $BUCKET"
else
  echo "Creating bucket: $BUCKET"
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --endpoint-url "$ENDPOINT" \
    --create-bucket-configuration "LocationConstraint=${DO_SPACES_REGION}"
fi

CORS_TMP="$(mktemp)"
cleanup() { rm -f "$CORS_TMP"; }
trap cleanup EXIT

export ROOT CORS_TMP OZ_CHAT_CORS_ORIGIN
python3 <<'PY'
import os
from pathlib import Path

root = Path(os.environ["ROOT"])
origin = os.environ["OZ_CHAT_CORS_ORIGIN"]
tmp = Path(os.environ["CORS_TMP"])
text = (root / "infra/digitalocean/cors-oz-uploads.template.json").read_text(encoding="utf-8")
tmp.write_text(text.replace("$OZ_CHAT_CORS_ORIGIN", origin), encoding="utf-8")
PY

echo "Applying CORS (single AllowedOrigin: $OZ_CHAT_CORS_ORIGIN)"
aws s3api put-bucket-cors --bucket "$BUCKET" --endpoint-url "$ENDPOINT" --cors-configuration "file://${CORS_TMP}"

echo "Applying lifecycle (expire objects after 1 day — closest S3-compatible rule to a 24h policy)"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" \
  --endpoint-url "$ENDPOINT" \
  --lifecycle-configuration "file://${ROOT}/infra/digitalocean/lifecycle-uploads.json"

echo "Done. Bucket: $BUCKET"
echo "Object key layout: s3://${BUCKET}/<tenant>/<conv_id>/<upload_id>.<ext>"
echo "Endpoint: $ENDPOINT"

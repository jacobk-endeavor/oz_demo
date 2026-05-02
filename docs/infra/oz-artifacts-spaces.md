# Oz artifact buckets (DigitalOcean Spaces)

This runbook implements [docs/code-sandbox-and-artifact-generation.md](../code-sandbox-and-artifact-generation.md) **§6.3 Infrastructure / ops**: one **private** Spaces bucket per environment, **CORS** limited to the chat app origin(s), a **30-day** lifecycle rule, and **signed-URL** access from the Node backend (never from the browser with root keys).

## Object key layout

All generated artifacts use:

`s3://oz-artifacts-<env>/<tenant>/<yyyymmdd>/<art_id>.<ext>`

- **env** — matches the bucket suffix (`dev`, `prod`, etc.).
- **tenant** — isolation prefix for multi-tenant demos (the runtime supplies this when calling `putArtifact`).
- **yyyymmdd** — UTC upload date.
- **art_id** — server-allocated id; **ext** is the file kind (for example `xlsx`, `png`).

The bucket root is the tenant prefix; there is no additional `artifacts/` path segment. Lifecycle applies to the **entire** bucket so every key under that layout expires after 30 days.

## Provision with Terraform

From the repo root:

```bash
cd infra/spaces-artifacts
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: token, Spaces keys, chat_origins, environment
terraform init
terraform plan
terraform apply
```

Outputs include `bucket_name` and `spaces_endpoint`. Set runtime env (see below) to those values.

### Credentials

- **do_token** — standard DigitalOcean API token (used to create the bucket via the DO API).
- **spaces_access_id** / **spaces_secret_key** — Spaces access keys (S3-compatible); required by the provider for bucket configuration. The **app runtime** should use a **separate** Spaces key pair (minimum permission: read/write to this bucket only) injected as `DO_SPACES_KEY` / `DO_SPACES_SECRET` — do not reuse the Terraform keys in production if they have broader scope.

## Runtime environment (App Platform / `.env`)

Align with `.env.example`:

| Variable | Example | Purpose |
|----------|---------|---------|
| `DO_SPACES_KEY` | Spaces access key id | S3 client auth |
| `DO_SPACES_SECRET` | Spaces secret | S3 client auth |
| `DO_SPACES_ENDPOINT` | `https://nyc3.digitaloceanspaces.com` | Must match bucket region |
| `DO_SPACES_REGION` | `nyc3` | Region slug for SDKs that require it |
| `DO_SPACES_BUCKET` | `oz-artifacts-prod` | Bucket from Terraform output |

**Signed URLs:** the backend mints time-limited presigned `GetObject` URLs (for example 1 hour). Users download in the browser; CORS on the bucket allows `GET`/`HEAD` from `chat_origins` so the origin is not blocked on cross-origin fetches. Rotating **Spaces** access keys is an operational task (quarterly is a reasonable default per §6.3).

## CORS

`chat_origins` should include:

- The **App Platform** HTTPS URL for the deployed chat UI.
- **Local dev** (`http://localhost:5173` or your Vite port) if you test downloads against real Spaces from the dev server.

Do not use `*` in production.

## Related

- Design: [docs/code-sandbox-and-artifact-generation.md](../code-sandbox-and-artifact-generation.md) §6.3
- Data retention: [docs/data-retention-and-artifact-policy.md](../data-retention-and-artifact-policy.md) — runtime artifact TTL
- App spec: `.do/app.yaml` — set encrypted env vars in the control panel (not committed)

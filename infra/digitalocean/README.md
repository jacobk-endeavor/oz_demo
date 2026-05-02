# DigitalOcean Spaces — chat uploads bucket

Chat attachments for the sandbox flow use a **dedicated** bucket per environment, separate from the artifact bucket (`oz-artifacts-<env>`).

| Item | Value |
|------|--------|
| Bucket name | `oz-uploads-<env>` (e.g. `oz-uploads-dev`, `oz-uploads-prod`) |
| Object keys | `s3://oz-uploads-<env>/<tenant>/<conv_id>/<upload_id>.<ext>` |
| CORS | Single allowed origin: the chat web app (`OZ_CHAT_CORS_ORIGIN`). |
| Lifecycle | Expire objects after **1 day** (minimum granularity for S3-compatible lifecycle on Spaces; aligns with the **24 h retention** intent in §12.1.2). |

## Provision

Prerequisites: [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (`aws`).

From the repository root:

```bash
export DO_SPACES_REGION=nyc3
export OZ_UPLOAD_ENV=dev
export OZ_CHAT_CORS_ORIGIN='https://your-chat-app.example.com'
export DO_SPACES_KEY='...'
export DO_SPACES_SECRET='...'

bash infra/digitalocean/provision-oz-uploads-bucket.sh
```

The script creates the bucket if missing, then applies CORS and lifecycle. Re-running is safe.

Design references: [docs/code-sandbox-and-artifact-generation.md](../../docs/code-sandbox-and-artifact-generation.md) §10.2, §12.1.2, §6.3.

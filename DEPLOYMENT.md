# Production deployment

Pushes to `main` trigger `.github/workflows/deploy-production.yml`. The workflow
runs a clean dependency install and production build before uploading the source
archive to the server. The server keeps the latest three releases and rolls the
application back when the HTTPS health check fails.

## Required GitHub Actions secrets

Configure these in **Settings → Secrets and variables → Actions**:

- `DEPLOY_HOST`: production server address
- `DEPLOY_USER`: SSH user
- `DEPLOY_PASSWORD`: SSH password
- `DEPLOY_PORT`: SSH port; use `22` for the current server

The server RSA host-key fingerprint is pinned directly in the workflow. If the
server SSH host key is intentionally rotated, update both `fingerprint` values
in the workflow after verifying the new key out of band.

The production `.env` remains on the server at
`/opt/forum-dcr2026/shared/.env`; it is never uploaded from GitHub.

The workflow may also be run manually from **Actions → Deploy production → Run
workflow**.

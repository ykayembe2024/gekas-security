# Deploy notes — GEKAS Security

## Petition Postgres (`deploy/petition/`)

- Compose: `docker-compose.yml` → container `gekas-petition-db` on `127.0.0.1:55437`
- Schema source of truth: `schema.sql` (also applied by `stats-api` `initDb()` on boot)
- Tables:
  - `petition` — title, content, image URL, target_signatures
  - `petition_signature` — signers (unique email per petition), ISO country code
- API / uploads / push: `stats-api` (pm2, port 3010) — see `ecosystem.config.cjs`
- Nginx snippets: `nginx-gekas-snippet.conf`, `nginx-gekas-security.com.conf`

## Umami (`deploy/umami/`)

- Compose: Umami + its own Postgres (`umami-gekas` / `umami-gekas-db`)
- Schema is **managed by Umami** (migrations on container start) — do not hand-edit
- Website id used by the tracker + stats PWA: `c92b66b9-3b10-4b1b-a36c-74e99b0ba379`
- Nginx: `nginx-stats.conf` → `stats.gekas-security.com`

## Stats PWA

- Static app: `/var/www/gekas-stats-pwa` (repo: `stats-pwa/`)
- Proxies Umami `/api/` and petition `/api/petition` via nginx

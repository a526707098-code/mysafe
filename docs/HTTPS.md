# HTTPS and network exposure

The vault never needs a public domain. Nginx listens on `${VAULT_BIND}:${VAULT_PORT}`
(default `127.0.0.1:8080`). Pick one of:

## A. Tailscale Serve (recommended)

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
# → https://<host>.<tailnet>.ts.net
```

Set `APP_ORIGIN=https://<host>.<tailnet>.ts.net` and `COOKIE_SECURE=true`, then enable the
HSTS line in `nginx/conf.d/vault.conf` and `docker compose restart private-vault-nginx`.

## B. Bind to the tailnet IP

`VAULT_BIND=100.x.y.z` publishes plain HTTP on the tailnet only. Tailscale encrypts the
transport, but browsers treat it as insecure (`Secure` cookies won't be set), so A is better.

## C. Private reverse proxy

Point an existing internal proxy (Caddy, Traefik, NPM, another nginx) at
`127.0.0.1:8080` and terminate TLS there. Forward `X-Forwarded-Proto` and set `APP_ORIGIN`.

PostgreSQL, the API and the Next.js server are on an `internal` Docker network and are never
reachable from the host network, regardless of the option chosen.

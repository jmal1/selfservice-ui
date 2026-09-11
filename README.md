# selfservice-ui

SvelteKit frontend for **Crucible** (student + instructor portal).

Image: `ghcr.io/jmal1/selfservice-ui:<full-sha>` (and short SHA / `latest` from CI on `master`).

## Public vs private config

This repository is **public**. Tracked `.env.production` holds **empty** public keys only (`PUBLIC_*`); runtime API base URL and SSO are provided by the reverse-proxy / API login flow in production.

Lab hostnames, deploy targets, and secrets are **not** documented here. Production release pins live in private [`jmal1/crucible-deploy`](https://github.com/jmal1/crucible-deploy).

## Develop

```sh
npm ci
cp .env.production .env   # needed for svelte-kit sync / svelte-check
npm run dev
```

## Verify

```sh
npm run verify
```

CI (`.github/workflows/ci.yaml`) runs verify on push/PR to `master`, then builds and pushes the GHCR image (docs-only path changes are ignored).

## Related

- API: [`jmal1/selfservice-api`](https://github.com/jmal1/selfservice-api)
- External Playwright synthetics: [`jmal1/selfservice-synthetic-ui`](https://github.com/jmal1/selfservice-synthetic-ui)
- Deploy / prod topology (private): [`jmal1/crucible-deploy`](https://github.com/jmal1/crucible-deploy)

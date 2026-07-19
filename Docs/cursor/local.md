# Cursor / operator notes — local → remote

Working copy: this laptop repo (`master-ball`). Production GitHub: [eddxdd/master-ball](https://github.com/eddxdd/master-ball). Live site: https://masterball.eduardolemos.com/

## How deploy is triggered

1. Commit + push to `main`.
2. AWS CodePipeline `master-ball-pipeline` (us-east-2) runs:
   - `buildspec-test.yml` → light gates
   - `buildspec.yml` → build/push `master-ball-api` + `master-ball-frontend` to ECR
   - `buildspec-deploy.yml` → SSH to EC2, `git reset --hard origin/main`, compose pull/up
3. Public traffic hits EC2 **:4000** (proxy) — same port as the previous Wordle site so DNS/Cloudflare stays put.

Do **not** deploy by only pushing Docker from the laptop unless the pipeline is broken. Prefer git.

## Before you push

- Never commit `.env`, `*.pem`, or real API keys.
- Local stack: `docker compose up` (see [`Docs/setup.md`](../setup.md)).
- Production compose file is [`docker-compose.prod.yml`](../../docker-compose.prod.yml) — not used for day-to-day local HMR.

## SSH to the server

```bash
ssh -i <your-key.pem> ec2-user@<EC2_HOST>
cd /home/ec2-user/apps/master-ball
```

`EC2_HOST` lives in CodeBuild env for `master-ball-deploy` — confirm current value in the AWS console. SSH private key is in Secrets Manager as `master-ball/ec2-deploy-key`.

## Postgres tunnel (pgAdmin / psql from laptop)

On the server, Postgres is bound to `127.0.0.1:5433` only.

```bash
ssh -i <your-key.pem> -L 5433:127.0.0.1:5433 ec2-user@<EC2_HOST>
```

Then connect client to `localhost:5433` with `POSTGRES_*` from the **server** `.env` (not this laptop’s `.env`).

## Syncing secrets to the server

Copy values by hand (or `scp` a file once), never via git:

```bash
scp -i <your-key.pem> .env.production.example ec2-user@<EC2_HOST>:/home/ec2-user/apps/master-ball/.env
# then SSH in and edit real secrets
```

Required names are listed in [`remote.md`](./remote.md).

## Smoke test after a deploy (from laptop)

1. https://masterball.eduardolemos.com/ — homepage loads
2. Pokedex species page + sprite
3. Team Builder + Calculator
4. Professor chat (WebSocket) — needs `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` on server
5. `curl -sS https://masterball.eduardolemos.com/health`

## What to write back into remote.md

When you change EC2 size, host IP, Cloudflare settings, or bootstrap state, update [`remote.md`](./remote.md) so the next session does not rediscover it.

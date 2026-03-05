# Master Ball – AWS / remote server instructions

Local reference for deploy and database access. Kept in repo for the maintainer; secrets stay in server `.env` (not in git).

---

## Deploy

- **Server path:** `/home/ec2-user/apps/master-ball`
- **Compose:** `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`
- **CI/CD:** CodeBuild runs `buildspec-deploy.yml` (SSH to EC2, `git pull`, prune, ECR login, compose pull/up).
- **Startup:** Container runs `npx prisma migrate deploy && node dist/scripts/seedWordle.js && node dist/server.js`.

Required on the server (in `.env`): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `JWT_EXPIRES_IN`.

---

## Database access (pgAdmin 4)

To inspect or manage the production PostgreSQL database from your machine using pgAdmin 4:

1. **Ensure Postgres is reachable from the server host**  
   In `docker-compose.prod.yml`, the `db` service does not expose port 5432 by default. To use pgAdmin via an SSH tunnel, expose it on the server’s localhost only:

   ```yaml
   # under services.db add:
   ports:
     - "127.0.0.1:5432:5432"
   ```

   Redeploy so the change is applied. Do **not** bind to `0.0.0.0:5432` unless you lock it down by firewall; prefer SSH tunnel only.

2. **Create an SSH tunnel from your machine**  
   Replace `<EC2_HOST>` with the EC2 hostname or IP and `<EC2_USER>` (e.g. `ec2-user`) with your SSH user:

   ```bash
   ssh -L 5432:localhost:5432 <EC2_USER>@<EC2_HOST>
   ```

   Leave this session open while you use pgAdmin. pgAdmin will connect to `localhost:5432`, which is forwarded to the server’s Postgres.

3. **Add the server in pgAdmin 4**  
   - **Connection** tab:  
     - **Host:** `localhost`  
     - **Port:** `5432`  
     - **Username:** value of `POSTGRES_USER` from the server’s `.env`  
     - **Password:** value of `POSTGRES_PASSWORD` from the server’s `.env`  
     - **Database:** value of `POSTGRES_DB` from the server’s `.env`  
   - Save. You can then browse and query the database.

Credentials are only on the server in `.env`; they are not stored in this repo.

---

## Optional: pgAdmin without exposing port 5432

If you prefer not to add `ports` to the `db` service, you can run pgAdmin (or any Postgres client) from inside the server:

- `docker exec -it <db_container_name> psql -U $POSTGRES_USER -d $POSTGRES_DB` for a CLI session.
- Or run a pgAdmin container on the server that uses the same Docker network as `db` and connect to host `db`, port `5432` (no SSH tunnel needed from your laptop if you access pgAdmin’s UI via SSH X11 forward or a temporary port forward).

For most “inspect from my laptop” use cases, the SSH tunnel + localhost port exposure above is the simplest.

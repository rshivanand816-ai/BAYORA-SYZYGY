# Bayora — Alembic migrations (controller store)

Alembic manages the **controller store** only. The policy, evaluator and
audit stores are owned by the `blue-policy-service`, `evaluation-service` and
`audit-collector` services respectively and are not reachable from the
migration runner; they are created by their own bootstrapping code.

## Layout

| Path | Purpose |
| --- | --- |
| `alembic.ini` | Alembic configuration. `script_location = migrations`, `sqlalchemy.url` intentionally empty. |
| `env.py` | Loads the app settings, exposes `ControllerBase.metadata`, implements offline and online modes. |
| `script.py.mako` | Template for new revisions. |
| `versions/0001_initial.py` | The initial revision (see the comment in the file for why it creates the tables from the model metadata). |

## Database URL

The URL is **not** stored in `alembic.ini`. `env.py` reads it from the
application settings, i.e. `get_settings().database_url`, which is
`BAYORA_DATABASE_URL` from the environment (or `.env`). This keeps one source
of truth: the migrations and the running application can never end up
pointing at different databases.

To run against a scratch database, set the variable explicitly for the
invocation only:

```sh
BAYORA_DATABASE_URL=postgresql://bayora:...@localhost:5432/bayora_controller_scratch \
  alembic -c migrations/alembic.ini upgrade head
```

## Usage

Run all commands from the `backend` directory so that the `app` package is
importable.

```sh
cd backend

# Apply every pending revision.
alembic -c migrations/alembic.ini upgrade head

# Roll back one revision.
alembic -c migrations/alembic.ini downgrade -1

# Create a revision from the difference between the models and the database.
alembic -c migrations/alembic.ini revision --autogenerate -m "add finding triage state"

# Inspect the history / current state.
alembic -c migrations/alembic.ini history
alembic -c migrations/alembic.ini current
```

## Requirements

`alembic>=1.13` and `psycopg[binary]>=3.1` are already listed in
`backend/requirements.txt`, so the migration runner works against the
PostgreSQL service in `compose.yaml` as well as against a local SQLite file.

## Production note

The application currently bootstraps its schema with `create_all()` on
start-up, which makes the migration history advisory rather than
authoritative. Running `alembic upgrade head` before the application starts is
the recommended order, but until the bootstrap is changed to be
migration-driven, the two paths can both create the schema. `create_all` is
idempotent, so the result is a consistent schema either way — but the
migration history is not, by itself, proof of what is in the database.

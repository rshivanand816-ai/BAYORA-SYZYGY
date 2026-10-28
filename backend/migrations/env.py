"""Alembic environment for the Bayora controller store.

The controller store is the only trust domain that Alembic manages here. The
policy, evaluator and audit stores are owned by their respective services
and are not reachable from the migration runner; see
``security/threat-model/README.md``.

The database URL is taken from the application settings so that migrations
and the running application can never disagree about which database they are
talking to.
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the `app` package importable when alembic is invoked from the
# `backend` directory (`alembic -c migrations/alembic.ini ...`).
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.core.config import get_settings  # noqa: E402
from app.db.base import ControllerBase  # noqa: E402
from app.db import models  # noqa: E402,F401  (import registers the tables)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate compares against this metadata.
target_metadata = ControllerBase.metadata


def _database_url() -> str:
    """Resolve the controller database URL.

    The application settings win. `BAYORA_DATABASE_URL` is honoured as an
    explicit override so that a migration can be pointed at a scratch
    database without touching the rest of the configuration.
    """
    override = os.environ.get("BAYORA_DATABASE_URL")
    if override:
        return override
    return get_settings().database_url


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting to a database."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connect to the database and run the migrations in a transaction."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

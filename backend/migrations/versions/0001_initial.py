"""initial controller store

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-21

WHY THIS MIGRATION CREATES THE TABLES INSTEAD OF LISTING THEM OPERATION BY
OPERATION
------------------------------------------------------------------------
The controller store contains twenty tables whose shape is defined by the
SQLAlchemy models in ``app/db/models.py``. The application bootstraps the
database with ``ControllerBase.metadata.create_all(...)`` on start-up (see
``app/db/base.py`` and ``app/seed.py``), so at the moment this migration runs
the schema is very often already present.

Listing twenty ``op.create_table()`` calls by hand here would duplicate the
model definitions in a second place. That copy is a drift hazard: a column
added to a model but not to the migration produces a schema that the
application and the migration history disagree about, and it is exactly the
kind of divergence that is hard to find during an incident.

Creating the tables from the live metadata keeps a single source of truth:

    * the models are the schema definition;
    * the migration is a recorded, versioned marker that the controller store
      exists and was established at a known point in the history;
    * Alembic's ``--autogenerate`` still produces real, explicit
      ``op.create_table()`` / ``op.add_column()`` operations for every
      SUBSEQUENT change, which is where the drift risk actually lives.

This is a deliberate trade-off, and the limitation is real and worth stating
plainly:

    * the initial revision is not a literal, human-readable DDL transcript.
      Reviewing "what does the schema look like" means reading the models,
      not reading the migration;
    * ``downgrade()`` drops the tables wholesale. A downgrade is therefore
      destructive and is expected to be used only for a scratch database;
    * the migration does not create the sibling policy / evaluator / audit
      stores. Those belong to other services and are created by their own
      bootstrapping code.

For an environment where the schema has already been created by
``create_all``, this revision is a no-op in effect: ``create_all`` is
idempotent, so running it against an existing schema leaves the schema
unchanged.
"""
from __future__ import annotations

from alembic import op

from app.db.base import ControllerBase

# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the controller store's tables from the model metadata."""
    # Import for the side effect of registering every table on the metadata.
    import app.db.models  # noqa: F401

    ControllerBase.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    """Drop the controller store's tables.

    Destructive: every row in the controller store is lost. The audit and
    policy stores are not touched.
    """
    import app.db.models  # noqa: F401

    ControllerBase.metadata.drop_all(bind=op.get_bind())

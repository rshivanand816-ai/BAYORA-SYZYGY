#!/bin/sh
# Create the three sibling logical stores next to the primary database.
#
# The four Bayora trust domains (controller / policy / evaluator / audit) are
# separated by DATABASE, not by host: they all live on the single postgres
# service, which is only reachable from the internal `bayora-db-net` segment.
#
# This script runs ONLY on the first initialisation of the volume. Changing it
# later has no effect; the stores then have to be created by hand.
#
# Every store is owned by the same role, so database-level separation is a
# naming/segmentation convention rather than a credential boundary. Giving
# each service its own Postgres role and REVOKE-ing the others is the
# recommended hardening and is tracked as follow-up work in
# security/threat-model/README.md.

set -eu

: "${BAYORA_POSTGRES_USER:=bayora}"
: "${BAYORA_POSTGRES_DB:=bayora_controller}"

for store in bayora_policy bayora_evaluator bayora_audit; do
    echo "creating store ${store}"
    psql -v ON_ERROR_STOP=1 \
         --username "$BAYORA_POSTGRES_USER" \
         --dbname "$BAYORA_POSTGRES_DB" \
         -c "CREATE DATABASE ${store} OWNER ${BAYORA_POSTGRES_USER};"
done

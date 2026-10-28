"""System bootstrapper and seed data orchestrator."""
from __future__ import annotations

import logging
from sqlalchemy import select

from app.admin.service import TEAM_SYZYGY
from app.audit.collector import get_collector
from app.auth.service import seed_demo_users
from app.blue_team.service import seed_defense_policies
from app.core.config import get_settings
from app.datasets.service import seed_dataset_sources
from app.db.base import create_all, session_scope
from app.db.models import EvaluationSession, User
from app.evaluations.service import create_evaluation, start_evaluation
from app.models_gateway.service import seed_models_and_suites
from app.schemas.api import EvaluationCreate, UserOut
from app.security.service import run_system_isolation_checks
from app.shadowpolicy.service import seed_demo_shadowpolicy_round

log = logging.getLogger("bayora.seed")


def bootstrap_system() -> None:
    settings = get_settings()
    settings.ensure_dirs()

    # 1. Initialize databases
    for store in ("controller", "policy", "evaluator", "audit"):
        create_all(store)

    # 2. Seed core data
    seed_demo_users()
    seed_models_and_suites()
    seed_defense_policies()
    seed_dataset_sources()
    run_system_isolation_checks("bootstrap")
    seed_demo_shadowpolicy_round()

    # 3. Pre-seed a completed baseline evaluation run so the dashboard is rich immediately
    with session_scope("controller") as s:
        existing_eval = s.execute(
            select(EvaluationSession).where(EvaluationSession.name == "Baseline Adversarial Safety Evaluation")
        ).scalar_one_or_none()
        if not existing_eval:
            admin_u = s.execute(select(User).where(User.username == "admin")).scalar_one_or_none()
            if admin_u:
                user_out = UserOut(
                    id=admin_u.id,
                    username=admin_u.username,
                    email=admin_u.email,
                    display_name=admin_u.display_name,
                    role="admin",
                    tenant=admin_u.tenant,
                    is_active=True,
                )
                from app.models_gateway.service import get_all_models, get_all_test_suites
                from app.blue_team.service import get_policy_refs

                models = get_all_models()
                suites = get_all_test_suites()
                pol_refs = get_policy_refs()

                if models and suites and pol_refs:
                    eval_req = EvaluationCreate(
                        name="Baseline Adversarial Safety Evaluation",
                        model_id=models[0].id,
                        suite_id=suites[0].id,
                        defense_policy_version_id=pol_refs[0].id,
                        eval_type="automated_suite",
                        probe_budget=20,
                    )
                    created_eval = create_evaluation(eval_req, user_out)
                    start_evaluation(created_eval.id, user_out)

    # 4. Initial audit checkpoint
    collector = get_collector()
    try:
        if not collector.list_checkpoints():
            collector.create_checkpoint()
    except Exception as exc:
        log.warning("Initial checkpoint deferred: %s", exc)

    log.info("Bayora system bootstrapped successfully.")

"""Datasets and benchmark import service."""
from __future__ import annotations

from sqlalchemy import select

from app.audit.collector import AuditCollector
from app.core.errors import bad_request, not_found
from app.core.util import iso, new_id, sha256_hex, utcnow
from app.db.base import session_scope
from app.db.models import DatasetImportJob, DatasetSource, TestCase, TestSuite
from app.schemas.api import DatasetSourceOut, ImportJobOut

audit_collector = AuditCollector()


def seed_dataset_sources() -> None:
    """Register the dataset sources the platform knows about.

    Two kinds of row are registered, and the difference is recorded in the
    `status` column so the UI can never present a catalogue entry as an
    integrated corpus:

    ``available``
        The corpus is genuinely present in this repository and can be
        imported right now.
    ``not_integrated``
        The corpus is a *catalogue reference* only. Its importer is present
        and functional, but no content from it is bundled, and nothing in
        this platform has ever been derived from it. The upstream licence
        and use restrictions are recorded for the operator who wants to
        fetch and import it themselves.
    """
    with session_scope("controller") as s:
        sources = [
            DatasetSource(
                id=new_id(),
                key="bayora-synthetic-v1",
                name="Bayora Synthetic Adversarial Suite v1",
                url="datasets/synthetic/bayora-synthetic-v1.jsonl",
                kind="synthetic",
                license_note=(
                    "MIT — Bayora synthetic adversarial suite v1, authored by Team SYZYGY. "
                    "See datasets/synthetic/PROVENANCE.md."
                ),
                use_restrictions="Evaluations only; non-production.",
                supported_formats=["json", "jsonl", "csv"],
                version="1.0.0",
                status="available",
            ),
            DatasetSource(
                id=new_id(),
                key="advglue-synth",
                name="Synthetic AdvGLUE Adversarial Benchmark",
                url="https://github.com/syzygy/bayora-benchmarks",
                kind="synthetic",
                license_note="MIT License - Synthetic Safety Benchmark",
                use_restrictions="Evaluations only; non-production.",
                supported_formats=["json", "jsonl", "csv"],
                version="1.0",
                status="available",
            ),
            DatasetSource(
                id=new_id(),
                key="jailbreak-bench-v1",
                name="Harmful Prompt & Injection Heuristics Suite",
                url="https://github.com/syzygy/bayora-jailbreaks",
                kind="synthetic",
                license_note="Apache 2.0 License",
                use_restrictions="Research and defensive hardening only.",
                supported_formats=["json", "jsonl"],
                version="2026.1",
                status="available",
            ),
        ]

        # Catalogue references. The importer works on any conforming file, but
        # no content from these corpora is bundled here, so their status is
        # `not_integrated` rather than `available`.
        catalogue = [
            (
                "advbench",
                "AdvBench — Harmful Behaviours and Jailbreak Prompts",
                "https://github.com/llm-attacks/llm-attacks",
                "MIT (verify against the upstream repository before importing)",
                "Research and defensive evaluation only. Do not use for training.",
                ["jsonl", "json", "csv"],
            ),
            (
                "jailbreakbench",
                "JailbreakBench — LLM Jailbreak Robustness Benchmark",
                "https://github.com/JailbreakBench/jailbreakbench",
                "MIT (verify against the upstream repository before importing)",
                "Research and defensive evaluation only.",
                ["jsonl", "json", "csv"],
            ),
            (
                "harmbench",
                "HarmBench — Standardised Harmful-Behaviour Evaluation",
                "https://github.com/centerforaisafety/HarmBench",
                "MIT (verify against the upstream repository before importing)",
                "Research and defensive evaluation only.",
                ["jsonl", "json", "csv"],
            ),
            (
                "toxigen",
                "ToxiGen — Machine-Generated Toxicity Corpus",
                "https://github.com/microsoft/ToxiGen",
                "MIT (verify against the upstream repository before importing)",
                "Research and defensive evaluation only. Content is machine-generated.",
                ["jsonl", "json", "csv"],
            ),
            (
                "gandalf-lakera",
                "Gandalf / Lakera Guardrails — Prompt-Injection Test Corpus",
                "https://github.com/lakeraai",
                "Upstream licence varies per repository — check before importing",
                "Research and defensive evaluation only.",
                ["jsonl", "json", "csv"],
            ),
            (
                "nvd-cve",
                "NVD / CVE — Vulnerability Records for Defence-Instruction Testing",
                "https://nvd.nist.gov/vuln/data-feeds",
                "NVD data is in the public domain (US Government work). CVE terms apply.",
                "Use public vulnerability descriptions only; do not import exploit code.",
                ["jsonl", "json", "csv"],
            ),
            (
                "darpa-transparent-computing",
                "DARPA Transparent Computing — AIxCC / ARVO Benchmark Artefacts",
                "https://github.com/aixcc",
                "Per-artefact licence — check each repository before importing",
                "Research and defensive evaluation only. Includes offensive material.",
                ["jsonl", "json", "csv"],
            ),
            (
                "anthropic-hh-rlhf",
                "Anthropic HH-RLHF — Helpful/Harmless Preference Data",
                "https://huggingface.co/datasets/Anthropic/hh-rlhf",
                "Anthropic Research License — review the dataset card before importing",
                "Research and defensive evaluation only. Redistribution is restricted.",
                ["jsonl", "json", "csv"],
            ),
        ]

        for key, name, url, lic, restrictions, formats in catalogue:
            sources.append(
                DatasetSource(
                    id=new_id(),
                    key=key,
                    name=name,
                    url=url,
                    kind="external",
                    license_note=lic,
                    use_restrictions=restrictions,
                    supported_formats=formats,
                    version=None,
                    status="not_integrated",
                )
            )

        existing_keys = {
            k for k in s.execute(select(DatasetSource.key)).scalars().all()
        }
        s.add_all([src for src in sources if src.key not in existing_keys])


def get_all_dataset_sources() -> list[DatasetSourceOut]:
    with session_scope("controller") as s:
        sources = s.execute(select(DatasetSource).order_by(DatasetSource.name)).scalars().all()
        return [
            DatasetSourceOut(
                id=ds.id,
                key=ds.key,
                name=ds.name,
                url=ds.url,
                kind=ds.kind,  # type: ignore[arg-type]
                license_note=ds.license_note,
                use_restrictions=ds.use_restrictions,
                supported_formats=ds.supported_formats,
                version=ds.version,
                status=ds.status,  # type: ignore[arg-type]
            )
            for ds in sources
        ]


def get_import_jobs() -> list[ImportJobOut]:
    with session_scope("controller") as s:
        sources = {
            ds.id: ds.name
            for ds in s.execute(select(DatasetSource)).scalars().all()
        }
        jobs = s.execute(select(DatasetImportJob).order_by(DatasetImportJob.created_at.desc())).scalars().all()
        return [
            ImportJobOut(
                id=j.id,
                source_id=j.source_id,
                source_name=sources.get(j.source_id, "Benchmark Source"),
                format=j.format,
                status=j.status,  # type: ignore[arg-type]
                rows_total=j.rows_total,
                rows_imported=j.rows_imported,
                rows_rejected=j.rows_rejected,
                errors=j.errors,
                suite_id=j.suite_id,
                file_sha256=j.file_sha256,
                dataset_version=j.dataset_version,
                created_at=iso(j.created_at) or "",
                completed_at=iso(j.completed_at),
            )
            for j in jobs
        ]


def import_dataset_file(
    source_id: str,
    fmt: str,
    raw_bytes: bytes,
    created_by: str,
) -> ImportJobOut:
    """Parse an uploaded benchmark file and persist the accepted rows.

    The import job records exactly what was observed: how many rows the file
    contained, how many were accepted, how many were rejected and why. No
    count is assumed.
    """
    from app.datasets.importer import parse_dataset

    parsed = parse_dataset(raw_bytes, fmt)

    with session_scope("controller") as s:
        ds = s.execute(select(DatasetSource).where(DatasetSource.id == source_id)).scalar_one_or_none()
        if not ds:
            raise not_found("DatasetSource")

        job_id = new_id()
        suite_id: str | None = None
        dataset_version: str | None = ds.version

        if parsed.records:
            suite_id = new_id()
            s.add(
                TestSuite(
                    id=suite_id,
                    name=f"{ds.name} (import {job_id[:8]})",
                    version=dataset_version or "imported",
                    description=(
                        f"Imported from '{ds.name}' "
                        f"(file sha256 {parsed.file_sha256[:16]}..., {parsed.rows_imported} rows)."
                    ),
                    source=ds.key,
                    dataset_source_id=ds.id,
                    is_external=ds.kind == "external",
                )
            )
            s.flush()
            for rec in parsed.records:
                s.add(
                    TestCase(
                        id=new_id(),
                        suite_id=suite_id,
                        case_key=rec.case_key,
                        title=rec.title,
                        category=rec.category,
                        input_fixture=rec.input_fixture,
                        expected_outcome=rec.expected_outcome,
                        is_attack=rec.is_attack,
                        severity=rec.severity,
                        success_condition=rec.success_condition,
                        success_marker=None,
                    )
                )

        status = "completed" if parsed.rows_total == parsed.rows_imported else "completed_with_rejections"
        job = DatasetImportJob(
            id=job_id,
            source_id=source_id,
            format=fmt,
            status=status,
            rows_total=parsed.rows_total,
            rows_imported=parsed.rows_imported,
            rows_rejected=parsed.rows_rejected,
            errors=parsed.errors[:100],
            suite_id=suite_id,
            file_sha256=parsed.file_sha256,
            dataset_version=dataset_version,
            created_by=created_by,
            completed_at=utcnow(),
        )
        s.add(job)

    audit_collector.append({
        "actor": created_by,
        "actor_role": "admin",
        "service": "api-controller",
        "event_type": "dataset.imported",
        "category": "datasets",
        "severity": "info",
        "session_id": job_id,
        "summary": (
            f"Imported dataset '{ds.name}' ({fmt}): {parsed.rows_imported} rows imported, "
            f"{parsed.rows_rejected} rejected out of {parsed.rows_total}."
        ),
        "payload": {
            "source_id": source_id,
            "rows_total": parsed.rows_total,
            "rows_imported": parsed.rows_imported,
            "rows_rejected": parsed.rows_rejected,
            "file_sha256": parsed.file_sha256,
            "suite_id": suite_id,
        },
    })

    return next(j for j in get_import_jobs() if j.id == job_id)


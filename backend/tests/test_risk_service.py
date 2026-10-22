"""Unit tests for AFIP Módulo 11 CUIT validation and RiskService debt extraction."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.clients.bcra_client import BCRAClient
from backend.app.database import Base, CuitCache, init_db
from backend.app.services.risk_service import (
    RiskService,
    clean_cuit,
    format_cuit,
    validate_cuit,
)


@pytest.fixture
def db_session():
    """In-memory SQLite session fixture."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    init_db(bind_engine=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def risk_service():
    """RiskService with BCRAClient in mock mode."""
    client = BCRAClient(force_mock=True)
    return RiskService(bcra_client=client)


def test_clean_and_format_cuit():
    """Verify clean_cuit and format_cuit helpers."""
    assert clean_cuit(" 20-30.123.456-3 ") == "20301234563"
    assert clean_cuit("") == ""
    assert clean_cuit(None) == ""

    assert format_cuit("20301234563") == "20-30123456-3"
    assert format_cuit("invalid") == "invalid"


def test_validate_cuit_modulo_11():
    """Verify official AFIP Módulo 11 checksum algorithm."""
    # Valid tax IDs
    assert validate_cuit("20-30123456-3") is True
    assert validate_cuit("20301234563") is True
    assert validate_cuit("30-71234567-1") is True
    assert validate_cuit("27-40987654-9") is True
    assert validate_cuit("30-61234567-4") is True
    assert validate_cuit("20-12345678-6") is True

    # Invalid check digits
    assert validate_cuit("20-30123456-7") is False
    assert validate_cuit("30-71234567-8") is False
    assert validate_cuit("27-40987654-3") is False

    # Invalid lengths or prefix
    assert validate_cuit("12-34567890-1") is False  # Invalid prefix 12
    assert validate_cuit("203012345") is False       # Too short
    assert validate_cuit("20301234567890") is False  # Too long
    assert validate_cuit("abc") is False             # Non-numeric


def test_get_debtor_report_invalid_cuit_raises(risk_service):
    """Verify that an invalid CUIT raises ValueError."""
    with pytest.raises(ValueError, match=r"CUIT inv.*lido"):
        risk_service.get_debtor_report("20-99999999-1")


def test_get_debtor_report_normal_debtor(risk_service, db_session):
    """Verify credit dossier extraction for normal debtor with Situación 1."""
    report = risk_service.get_debtor_report("20-30123456-3", db=db_session)
    assert report["cuit"] == "20301234563"
    assert report["cuit_formateado"] == "20-30123456-3"
    assert report["peor_situacion"] == 1
    assert report["deuda_total"] > 0
    assert len(report["entidades"]) == 2
    assert len(report["historial_24m"]) == 24
    assert report["total_cheques_rechazados"] == 0

    # Verify cached in database
    cached = db_session.get(CuitCache, "20301234563")
    assert cached is not None
    assert cached.worst_situation == 1
    assert cached.total_debt == report["deuda_total"]

    # Verify second query retrieves from cache
    cached_report = risk_service.get_debtor_report("20301234563", db=db_session)
    assert cached_report["cuit"] == report["cuit"]


def test_get_debtor_report_distressed_debtor(risk_service):
    """Verify credit dossier extraction for distressed debtor with bounced checks."""
    report = risk_service.get_debtor_report("30-71234567-1")
    assert report["cuit"] == "30712345671"
    assert report["peor_situacion"] >= 3
    assert len(report["entidades"]) == 3
    assert report["total_cheques_rechazados"] >= 2
    assert report["monto_total_cheques"] > 0


def test_get_debtor_report_clean_debtor(risk_service):
    """Verify clean debtor profile with zero debt and zero periods."""
    report = risk_service.get_debtor_report("27-40987654-9")
    assert report["cuit"] == "27409876549"
    assert report["deuda_total"] == 0.0
    assert report["peor_situacion"] == 1
    assert len(report["entidades"]) == 0
    assert len(report["historial_24m"]) == 0
    assert len(report["cheques_rechazados"]) == 0
    assert report["nivel_riesgo"] == "OPTIMAL"
    assert len(report["alertas_tempranas"]) == 0


def test_early_warning_badges_normal_vs_distressed(risk_service):
    """Verify badges triggered for normal and distressed debtors."""
    # Normal debtor: 0 warning badges, risk level LOW
    report_normal = risk_service.get_debtor_report("20-30123456-3")
    assert len(report_normal["alertas_tempranas"]) == 0
    assert report_normal["nivel_riesgo"] == "LOW"

    # Distressed debtor: critical deterioration, non-bank concentration, unpaid checks
    report_distressed = risk_service.get_debtor_report("30-71234567-1")
    assert report_distressed["nivel_riesgo"] == "CRITICAL"
    badge_codes = {b["code"] for b in report_distressed["alertas_tempranas"]}
    assert "DETERIORATION_6M" in badge_codes
    assert "NON_BANK_CONCENTRATION" in badge_codes
    assert "UNPAID_CHECKS_90D" in badge_codes


def test_debt_acceleration_badge_trigger():
    """Verify DEBT_ACCELERATION_YOY triggers when debt increases >50% YoY."""
    from backend.app.services.risk_service import evaluate_risk_badges

    report_accelerated = {
        "peor_situacion": 1,
        "deuda_total": 160000.0,
        "entidades": [{"entidad": "BANCO GALICIA", "monto": 160000.0, "situacion": 1}],
        "cheques_rechazados": [],
        "historial_24m": [
            {"periodo": "202602", "deuda_total": 160000.0, "peor_situacion": 1},
            *([{"periodo": f"2025{m:02d}", "deuda_total": 100000.0, "peor_situacion": 1} for m in range(12, 1, -1)]),
        ],
    }

    badges = evaluate_risk_badges(report_accelerated)
    codes = {b["code"] for b in badges}
    assert "DEBT_ACCELERATION_YOY" in codes
    badge = next(b for b in badges if b["code"] == "DEBT_ACCELERATION_YOY")
    assert "+60.0% i.a." in badge["metric"]


def test_non_bank_concentration_threshold():
    """Verify NON_BANK_CONCENTRATION threshold edge cases."""
    from backend.app.services.risk_service import evaluate_risk_badges

    # Exactly 50% non-bank debt
    report = {
        "peor_situacion": 1,
        "deuda_total": 100000.0,
        "entidades": [
            {"entidad": "BANCO MACRO", "monto": 50000.0, "situacion": 1},
            {"entidad": "FINTECH MONI DIGITAL (PSP)", "monto": 50000.0, "situacion": 1},
        ],
        "cheques_rechazados": [],
        "historial_24m": [],
    }

    badges = evaluate_risk_badges(report)
    codes = {b["code"] for b in badges}
    assert "NON_BANK_CONCENTRATION" in codes


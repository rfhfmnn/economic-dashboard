"""Unit tests for FXClient and Brecha Cambiaria calculations."""

import pytest
from backend.app.clients.fx_client import FXClient, calculate_brecha


def test_calculate_brecha_math_vectors():
    """Verify precision of brecha cambiaria calculation against exact test vectors."""
    # Positive spread (20%)
    assert calculate_brecha(1200.0, 1000.0) == 20.0

    # Zero spread
    assert calculate_brecha(1000.0, 1000.0) == 0.0

    # Negative spread (-5%)
    assert calculate_brecha(950.0, 1000.0) == -5.0

    # Floating point rounding check: ((1250.50 - 1055.25) / 1055.25) * 100 = 18.5027... -> 18.50
    assert calculate_brecha(1250.50, 1055.25) == 18.50

    # Invalid official rate must raise ValueError
    with pytest.raises(ValueError, match="official_rate must be greater than zero"):
        calculate_brecha(1200.0, 0.0)

    with pytest.raises(ValueError, match="official_rate must be greater than zero"):
        calculate_brecha(1200.0, -100.0)


def test_fx_client_get_all_rates_and_single_rate():
    """Verify FXClient rates retrieval and house aliasing."""
    client = FXClient(force_mock=True)
    try:
        rates = client.get_all_rates()
        assert isinstance(rates, list)
        assert len(rates) >= 5

        # Check alias resolution
        mep_quote = client.get_rate("mep")
        bolsa_quote = client.get_rate("bolsa")
        assert mep_quote is not None
        assert bolsa_quote is not None
        assert mep_quote["casa"] == "bolsa"
        assert mep_quote["venta"] == bolsa_quote["venta"]

        ccl_quote = client.get_rate("ccl")
        assert ccl_quote is not None
        assert ccl_quote["casa"] == "contadoconliquidacion"

        blue_quote = client.get_rate("blue")
        assert blue_quote is not None
        assert blue_quote["venta"] > 0
    finally:
        client.close()


def test_fx_client_spreads_summary():
    """Verify calculation of full spreads summary comparing parallel against mayorista."""
    client = FXClient(force_mock=True)
    try:
        summary = client.get_spreads_summary(official_base="mayorista")
        assert "base" in summary
        assert "spreads" in summary

        base = summary["base"]
        assert base["casa"] == "mayorista"
        base_rate = base["venta"]
        assert base_rate > 0

        spreads = summary["spreads"]
        for key in ("mep", "ccl", "blue"):
            assert key in spreads
            sp = spreads[key]
            expected_spread_ars = round(sp["venta"] - base_rate, 2)
            expected_brecha_pct = calculate_brecha(sp["venta"], base_rate)
            assert sp["spread_ars"] == expected_spread_ars
            assert sp["brecha_pct"] == expected_brecha_pct
    finally:
        client.close()


def test_fx_client_network_fallback():
    """Verify that network errors trigger graceful fallback to mock FX rates."""
    client = FXClient(base_url="https://invalid-fx-domain-test-unreachable.com", force_mock=False, timeout=1.0)
    try:
        rates = client.get_all_rates()
        assert isinstance(rates, list)
        assert len(rates) > 0

        summary = client.get_spreads_summary()
        assert "base" in summary
        assert "spreads" in summary
    finally:
        client.close()

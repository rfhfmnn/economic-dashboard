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


def test_fx_client_ccl_alias_supports_contadoconliqui():
    """Verify CCL rates and spreads correctly resolve DolarApi's live 'contadoconliqui' house name."""
    live_style_rates = [
        {"casa": "mayorista", "nombre": "Mayorista", "compra": 1050.0, "venta": 1055.0},
        {"casa": "bolsa", "nombre": "Bolsa", "compra": 1200.0, "venta": 1210.0},
        {"casa": "contadoconliqui", "nombre": "Contado con liquidación", "compra": 1280.0, "venta": 1295.0},
        {"casa": "blue", "nombre": "Blue", "compra": 1300.0, "venta": 1310.0},
    ]
    client = FXClient(force_mock=True)
    client.get_all_rates = lambda: live_style_rates
    try:
        ccl = client.get_rate("ccl")
        assert ccl is not None
        assert ccl["casa"] == "contadoconliqui"
        assert ccl["venta"] == 1295.0

        summary = client.get_spreads_summary()
        assert "ccl" in summary["spreads"]
        assert summary["spreads"]["ccl"]["venta"] == 1295.0
        assert summary["spreads"]["ccl"]["brecha_pct"] > 0
    finally:
        client.close()


def test_fx_client_get_historical_rates_mock():
    """Verify get_historical_rates returns series for oficial, mep, ccl and blue."""
    client = FXClient(force_mock=True)
    try:
        res = client.get_historical_rates()
        assert "rates" in res
        rates = res["rates"]
        for key in ("oficial", "mep", "ccl", "blue"):
            assert key in rates
            assert len(rates[key]) > 0
            pt = rates[key][0]
            assert "fecha" in pt
            assert "valor" in pt
            assert pt["valor"] > 0
    finally:
        client.close()


def test_fx_client_get_historical_rates_date_filtering():
    """Verify get_historical_rates properly filters observations by desde and hasta."""
    client = FXClient(force_mock=True)
    try:
        res = client.get_historical_rates(desde="2026-01-01", hasta="2026-01-15")
        rates = res["rates"]
        for key in ("oficial", "mep", "ccl", "blue"):
            assert len(rates[key]) > 0
            for pt in rates[key]:
                assert "2026-01-01" <= pt["fecha"] <= "2026-01-15"
    finally:
        client.close()

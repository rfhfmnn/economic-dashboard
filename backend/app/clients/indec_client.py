"""HTTP client for INDEC (Instituto Nacional de Estadística y Censos) official API.

Connects to api.indec.gob.ar using Bearer token authentication via INDEC_API_TOKEN,
backed by SQLite caching (IndecCache) and a declarative dataset registry mapping
the 8 key macroeconomic series, strictly enforcing zero synthetic fallback data in runtime.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any, Self

import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.database import IndecCache

logger = logging.getLogger(__name__)


class IndecClientError(Exception):
    """Base exception for all INDEC client errors."""


class IndecAuthError(IndecClientError):
    """Raised when INDEC API token is missing, expired, or rejected (HTTP 401/403)."""


# Alias for acceptance criteria compatibility
IndecAuthenticationError = IndecAuthError


class IndecNetworkError(IndecClientError):
    """Raised when INDEC API is unreachable, times out, or returns a 5xx server error."""


class IndecResponseError(IndecClientError):
    """Raised when INDEC API returns an unexpected response structure or 4xx error."""


DATASET_REGISTRY: dict[str, dict[str, Any]] = {
    # 1. Precios y costos
    "ipc_general": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - nivel general nacional",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general nacional",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_core": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - núcleo",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "IPC categoría núcleo (desestacionalizado sin regulados ni estacionales)",
        "params": {
            "nivel": "eq.Categoría",
            "descripcion": "eq.Núcleo",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_regulados": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - regulados",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "IPC categoría regulados (tarifas, servicios públicos y regulados)",
        "params": {
            "nivel": "eq.Categoría",
            "descripcion": "eq.Regulados",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_estacionales": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - estacionales",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "IPC categoría estacionales (frutas, verduras, turismo)",
        "params": {
            "nivel": "eq.Categoría",
            "descripcion": "eq.Estacionales",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_alimentos": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - alimentos y bebidas no alcohólicas",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división alimentos y bebidas no alcohólicas",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*alimentos y bebidas*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_salud": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - salud",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división salud",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*salud*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_transporte": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - transporte",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división transporte",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*transporte*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_vivienda": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - vivienda, agua, electricidad y gas",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división vivienda, agua, electricidad y gas",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*vivienda*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_general": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - nivel general",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el Gran Buenos Aires - nivel general",
        "params": {
            "nivel": "eq.Nivel general",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_materiales": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - materiales",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - capítulo materiales",
        "params": {
            "nivel": "eq.Capitulo",
            "descripcion": "eq.Materiales",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_mano_obra": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - mano de obra",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - capítulo mano de obra",
        "params": {
            "nivel": "eq.Capitulo",
            "descripcion": "eq.Mano de obra",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_gastos_generales": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - gastos generales",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - capítulo gastos generales",
        "params": {
            "nivel": "eq.Capitulo",
            "descripcion": "eq.Gastos generales",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipim": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPIM) - nivel general",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPIM nivel general",
        "params": {
            "indicador": "eq.IPIM",
            "nivel": "eq.Nivel general",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipib": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPIB) - nivel general",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPIB nivel general",
        "params": {
            "indicador": "eq.IPIB",
            "nivel": "eq.Nivel general",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipp": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPP) - nivel general",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPP nivel general",
        "params": {
            "indicador": "eq.IPP",
            "nivel": "eq.Nivel general",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "redeterminacion_obra_publica": {
        "endpoint": "/redeterminacion_precios_contratos_obras_publicas",
        "name": "Redeterminación obra pública - mano de obra",
        "category": "Precios y costos",
        "unit": "Índice base 1993=100",
        "frequency": "mensual",
        "description": "Redeterminación de precios de contratos de obra pública - mano de obra",
        "params": {
            "inciso": "eq.a",
            "tipo_de_indicador": "eq.Indice",
            "order": "periodo.desc",
        },
    },

    # 2. Salarios e ingresos
    "salarios_total": {
        "endpoint": "/indice_salarios",
        "name": "Índice de salarios - total registrado",
        "category": "Salarios e ingresos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de salarios - total registrado",
        "params": {
            "descripcion": "eq.Total registrado",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "salarios_privado_reg": {
        "endpoint": "/indice_salarios",
        "name": "Índice de salarios - sector privado registrado",
        "category": "Salarios e ingresos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de salarios - sector privado registrado",
        "params": {
            "descripcion": "eq.Sector privado registrado",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "salarios_privado_no_reg": {
        "endpoint": "/indice_salarios",
        "name": "Índice de salarios - sector privado no registrado",
        "category": "Salarios e ingresos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de salarios - sector privado no registrado",
        "params": {
            "descripcion": "eq.Total no registrado",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "salarios_publico": {
        "endpoint": "/indice_salarios",
        "name": "Índice de salarios - sector público",
        "category": "Salarios e ingresos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de salarios - sector público",
        "params": {
            "descripcion": "eq.Sector público",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },

    # 3. Actividad y producción
    "emae_general": {
        "endpoint": "/estimador-mensual-de-actividad-economica-nivel-general",
        "name": "EMAE - nivel general",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "Estimador mensual de actividad económica - nivel general",
        "params": {
            "tipo_de_indicador_descripcion": "eq.Índice serie original",
            "order": "periodo.desc",
        },
    },
    "emae_industria": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - industria manufacturera",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - industria manufacturera (letra D)",
        "params": {
            "codigo": "eq.D",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_comercio": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - comercio mayorista y minorista",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - comercio mayorista, minorista y reparaciones (letra G)",
        "params": {
            "codigo": "eq.G",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_construccion": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - construcción",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - construcción (letra F)",
        "params": {
            "codigo": "eq.F",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_agro": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - agricultura, ganadería y silvicultura",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - agricultura, ganadería, caza y silvicultura (letra A)",
        "params": {
            "codigo": "eq.A",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_financiera": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - intermediación financiera",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - intermediación financiera (letra J)",
        "params": {
            "codigo": "eq.J",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_mineria": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - explotación de minas y canteras",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - explotación de minas y canteras (letra C)",
        "params": {
            "codigo": "eq.C",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "ipi_manuf": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - nivel general",
        "params": {
            "descripcion": "eq.IPI Manufacturero - Nivel general",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_minero_general": {
        "endpoint": "/ipi_minero",
        "name": "IPI minero - nivel general",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial minero - nivel general",
        "params": {
            "descripcion": "eq.Nivel General - IPI Minero",
            "tipo_de_indicador": "eq.Variación acumulada interanual",
            "serie": "eq.Serie Original",
            "order": "periodo.desc",
        },
    },
    "ipi_minero_petroleo": {
        "endpoint": "/ipi_minero",
        "name": "IPI minero - petróleo crudo",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial minero - petróleo crudo",
        "params": {
            "descripcion": "eq.Petróleo crudo",
            "tipo_de_indicador": "eq.Variación acumulada interanual",
            "serie": "eq.Serie Original",
            "order": "periodo.desc",
        },
    },
    "ipi_minero_gas": {
        "endpoint": "/ipi_minero",
        "name": "IPI minero - gas natural",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial minero - gas natural",
        "params": {
            "descripcion": "eq.Gas natural",
            "tipo_de_indicador": "eq.Variación acumulada interanual",
            "serie": "eq.Serie Original",
            "order": "periodo.desc",
        },
    },
    "ipi_minero_litio": {
        "endpoint": "/ipi_minero",
        "name": "IPI minero - minerales de litio",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial minero - carbonato de litio y minerales de litio",
        "params": {
            "descripcion": "eq.Carbonato de litio y otros minerales de litio",
            "tipo_de_indicador": "eq.Variación acumulada interanual",
            "serie": "eq.Serie Original",
            "order": "periodo.desc",
        },
    },

    # 4. Mercado de trabajo y social
    "eph_desempleo": {
        "endpoint": "/mercado_trabajo_eph",
        "name": "Tasa de desocupación",
        "category": "Mercado de trabajo y social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "value_field": "tasa_de_desocupacion",
        "description": "Encuesta permanente de hogares - tasa de desocupación abierta",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "eph_empleo": {
        "endpoint": "/mercado_trabajo_eph",
        "name": "Tasa de empleo",
        "category": "Mercado de trabajo y social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "value_field": "tasa_de_empleo",
        "description": "Encuesta permanente de hogares - tasa de empleo",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "eph_actividad": {
        "endpoint": "/mercado_trabajo_eph",
        "name": "Tasa de actividad",
        "category": "Mercado de trabajo y social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "value_field": "tasa_de_actividad",
        "description": "Encuesta permanente de hogares - tasa de actividad",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "eph_subocupacion": {
        "endpoint": "/mercado_trabajo_eph",
        "name": "Tasa de subocupación",
        "category": "Mercado de trabajo y social",
        "unit": "% PEA",
        "frequency": "trimestral",
        "value_field": "tasa_de_subocupacion",
        "description": "Encuesta permanente de hogares - tasa de subocupación",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "cbt": {
        "endpoint": "/valorizacion_canastas_cba_cbt",
        "name": "Canasta básica total (CBT)",
        "category": "Mercado de trabajo y social",
        "unit": "ARS",
        "frequency": "mensual",
        "description": "Canasta básica total - línea de pobreza individual adulto equivalente",
        "params": {
            "codigo": "eq.CBT",
            "tipo_de_indicador_descripcion": "eq.Valores mensuales por adulto equivalente, expresados en pesos",
            "region": "eq.GBA",
            "order": "periodo.desc",
        },
    },
    "cba": {
        "endpoint": "/valorizacion_canastas_cba_cbt",
        "name": "Canasta básica alimentaria (CBA)",
        "category": "Mercado de trabajo y social",
        "unit": "ARS",
        "frequency": "mensual",
        "description": "Canasta básica alimentaria - línea de indigencia individual adulto equivalente",
        "params": {
            "codigo": "eq.CBA",
            "tipo_de_indicador_descripcion": "eq.Valores mensuales por adulto equivalente, expresados en pesos",
            "region": "eq.GBA",
            "order": "periodo.desc",
        },
    },
    "pobreza_personas": {
        "endpoint": "/pobreza_eph",
        "name": "Incidencia de la pobreza - personas",
        "category": "Mercado de trabajo y social",
        "unit": "% personas",
        "frequency": "semestral",
        "value_field": "tasa_pobreza_personas",
        "description": "Incidencia de la pobreza en personas (EPH - 31 aglomerados)",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "pobreza_hogares": {
        "endpoint": "/pobreza_eph",
        "name": "Incidencia de la pobreza - hogares",
        "category": "Mercado de trabajo y social",
        "unit": "% hogares",
        "frequency": "semestral",
        "value_field": "tasa_pobreza_hogares",
        "description": "Incidencia de la pobreza en hogares (EPH - 31 aglomerados)",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "indigencia_personas": {
        "endpoint": "/pobreza_eph",
        "name": "Incidencia de la indigencia - personas",
        "category": "Mercado de trabajo y social",
        "unit": "% personas",
        "frequency": "semestral",
        "value_field": "tasa_indigencia_personas",
        "description": "Incidencia de la indigencia en personas (EPH - 31 aglomerados)",
        "params": {
            "area_geografica_nom": "eq.T_31_A",
            "order": "periodo.desc",
        },
    },
    "crianza_men1": {
        "endpoint": "/canasta-crianza",
        "name": "Canasta de crianza - menores de 1 año",
        "category": "Mercado de trabajo y social",
        "unit": "ARS",
        "frequency": "mensual",
        "value_field": "tot_men1",
        "description": "Costo mensual de la canasta de crianza para menores de 1 año",
        "params": {
            "order": "Periodo.desc",
        },
    },
    "crianza_1a3": {
        "endpoint": "/canasta-crianza",
        "name": "Canasta de crianza - 1 a 3 años",
        "category": "Mercado de trabajo y social",
        "unit": "ARS",
        "frequency": "mensual",
        "value_field": "tot_1a3",
        "description": "Costo mensual de la canasta de crianza para niños de 1 a 3 años",
        "params": {
            "order": "Periodo.desc",
        },
    },
    "crianza_4a5": {
        "endpoint": "/canasta-crianza",
        "name": "Canasta de crianza - 4 a 5 años",
        "category": "Mercado de trabajo y social",
        "unit": "ARS",
        "frequency": "mensual",
        "value_field": "tot_4a5",
        "description": "Costo mensual de la canasta de crianza para niños de 4 a 5 años",
        "params": {
            "order": "Periodo.desc",
        },
    },
    "crianza_6a12": {
        "endpoint": "/canasta-crianza",
        "name": "Canasta de crianza - 6 a 12 años",
        "category": "Mercado de trabajo y social",
        "unit": "ARS",
        "frequency": "mensual",
        "value_field": "tot_6a12",
        "description": "Costo mensual de la canasta de crianza para niños de 6 a 12 años",
        "params": {
            "order": "Periodo.desc",
        },
    },

    # 5. Sector externo y población
    "ica_saldo": {
        "endpoint": "/comercio_exterior_exportacion_bienes",
        "name": "Balanza comercial (ICA)",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_FOB",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Intercambio comercial argentino - exportaciones valor FOB",
        "params": {
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_exportaciones_primarios": {
        "endpoint": "/comercio_exterior_exportacion_bienes",
        "name": "Exportaciones de bienes - productos primarios",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_FOB",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Exportaciones de productos primarios valor FOB total mensual",
        "params": {
            "rubro_cod": "eq.1",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_exportaciones_moa": {
        "endpoint": "/comercio_exterior_exportacion_bienes",
        "name": "Exportaciones de bienes - manufacturas agropecuarias (MOA)",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_FOB",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Exportaciones de manufacturas agropecuarias valor FOB total mensual",
        "params": {
            "rubro_cod": "eq.2",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_exportaciones_moi": {
        "endpoint": "/comercio_exterior_exportacion_bienes",
        "name": "Exportaciones de bienes - manufacturas industriales (MOI)",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_FOB",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Exportaciones de manufacturas de origen industrial valor FOB total mensual",
        "params": {
            "rubro_cod": "eq.3",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_exportaciones_energia": {
        "endpoint": "/comercio_exterior_exportacion_bienes",
        "name": "Exportaciones de bienes - combustibles y energía",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_FOB",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Exportaciones de combustibles y energía valor FOB total mensual",
        "params": {
            "rubro_cod": "eq.4",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_importaciones_capital": {
        "endpoint": "/comercio_exterior_importacion_bienes",
        "name": "Importaciones de bienes - bienes de capital",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_CIF",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Importaciones de bienes de capital valor CIF total mensual",
        "params": {
            "uso_economico_cod": "eq.1",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_importaciones_intermedios": {
        "endpoint": "/comercio_exterior_importacion_bienes",
        "name": "Importaciones de bienes - bienes intermedios",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_CIF",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Importaciones de bienes intermedios valor CIF total mensual",
        "params": {
            "uso_economico_cod": "eq.2",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_importaciones_combustibles": {
        "endpoint": "/comercio_exterior_importacion_bienes",
        "name": "Importaciones de bienes - combustibles y lubricantes",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_CIF",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Importaciones de combustibles y lubricantes valor CIF total mensual",
        "params": {
            "uso_economico_cod": "eq.3",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "comex_importaciones_consumo": {
        "endpoint": "/comercio_exterior_importacion_bienes",
        "name": "Importaciones de bienes - bienes de consumo",
        "category": "Sector externo y población",
        "unit": "Millones USD",
        "frequency": "mensual",
        "value_field": "valor_CIF",
        "scale": 0.000001,
        "aggregate": "sum",
        "description": "Importaciones de bienes de consumo valor CIF total mensual",
        "params": {
            "uso_economico_cod": "eq.5",
            "order": "Periodo.desc",
            "limit": "2000",
        },
    },
    "proyeccion_poblacion_caba": {
        "endpoint": "/proyecciones_poblacion_jurisdiccion_2022_2040",
        "name": "Proyección de población - Ciudad Autónoma de Buenos Aires",
        "category": "Sector externo y población",
        "unit": "Personas",
        "frequency": "anual",
        "value_field": "poblacion",
        "aggregate": "sum",
        "description": "Proyecciones demográficas de población en CABA (2022-2040)",
        "params": {
            "jurisdiccion_cod": "eq.02",
            "order": "fecha.asc",
            "limit": "1000",
        },
    },
    "proyeccion_poblacion_pba": {
        "endpoint": "/proyecciones_poblacion_jurisdiccion_2022_2040",
        "name": "Proyección de población - Provincia de Buenos Aires",
        "category": "Sector externo y población",
        "unit": "Personas",
        "frequency": "anual",
        "value_field": "poblacion",
        "aggregate": "sum",
        "description": "Proyecciones demográficas de población en Provincia de Buenos Aires (2022-2040)",
        "params": {
            "jurisdiccion_cod": "eq.06",
            "order": "fecha.asc",
            "limit": "1000",
        },
    },
    "poblacion_departamento_rosario": {
        "endpoint": "/estimaciones_poblacion_departamento_2022_2035",
        "name": "Estimación de población - departamento Rosario",
        "category": "Sector externo y población",
        "unit": "Personas",
        "frequency": "anual",
        "value_field": "poblacion",
        "aggregate": "sum",
        "description": "Estimaciones de población en el departamento Rosario (2022-2035)",
        "params": {
            "departamento_nom": "eq.Rosario",
            "order": "fecha.asc",
            "limit": "1000",
        },
    },
    "poblacion_departamento_cordoba": {
        "endpoint": "/estimaciones_poblacion_departamento_2022_2035",
        "name": "Estimación de población - departamento Capital (Córdoba)",
        "category": "Sector externo y población",
        "unit": "Personas",
        "frequency": "anual",
        "value_field": "poblacion",
        "aggregate": "sum",
        "description": "Estimaciones de población en departamento Capital - Córdoba (2022-2035)",
        "params": {
            "jurisdiccion_cod": "eq.14",
            "departamento_nom": "eq.Capital",
            "order": "fecha.asc",
            "limit": "1000",
        },
    },
}


class IndecClient:
    """Official HTTP client for api.indec.gob.ar with Bearer JWT auth and SQLite caching."""

    DATASET_REGISTRY = DATASET_REGISTRY

    def __init__(
        self,
        base_url: str = "https://api.indec.gob.ar",
        token: str | None = None,
        timeout: float = 10.0,
        cache_ttl_seconds: int = 86400,  # 24 hours
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        clean_base = base_url.rstrip("/")
        if not clean_base.endswith("/v1"):
            self.base_url = f"{clean_base}/v1"
        else:
            self.base_url = clean_base

        self._explicit_token = token
        self.timeout = timeout
        self.cache_ttl_seconds = cache_ttl_seconds
        self._transport = transport

        self.client = httpx.Client(
            timeout=self.timeout,
            headers={
                "User-Agent": "EconomicRiskDashboard/1.0",
                "Accept": "application/json",
            },
            transport=self._transport,
        )

    @property
    def token(self) -> str | None:
        """Resolve INDEC API token dynamically from explicit param, os.environ, or .env."""
        if self._explicit_token is not None:
            return self._explicit_token.strip() if self._explicit_token else None

        tok = os.getenv("INDEC_API_TOKEN")
        if tok and tok.strip():
            return tok.strip()

        # In runtime outside pytest, attempt to reload .env from root if not present in os.environ
        if "PYTEST_CURRENT_TEST" not in os.environ:
            try:
                from dotenv import find_dotenv, load_dotenv

                dotenv_path = find_dotenv()
                if dotenv_path:
                    load_dotenv(dotenv_path=dotenv_path, override=False)
                    tok = os.getenv("INDEC_API_TOKEN")
                    if tok and tok.strip():
                        return tok.strip()
            except Exception:
                pass

        return None

    @token.setter
    def token(self, value: str | None) -> None:
        self._explicit_token = value

    def _ensure_authenticated(self) -> None:
        """Validate that an INDEC_API_TOKEN is configured before sending network requests."""
        if not self.token or not self.token.strip():
            raise IndecAuthError(
                "INDEC_API_TOKEN no configurado en las variables de entorno. "
                "Debe proporcionar un token Bearer para autenticarse contra api.indec.gob.ar. "
                "Configure INDEC_API_TOKEN en su archivo .env o en el entorno del sistema."
            )

    def fetch_series(
        self,
        variable_id: str,
        period: str | None = None,
        db: Session | None = None,
        force_refresh: bool = False,
        custom_params: dict[str, Any] | None = None,
    ) -> Any:
        """Fetch macroeconomic series data from local cache or official INDEC API.

        Args:
            variable_id: Key identifying the dataset in DATASET_REGISTRY (e.g. 'ipc_general').
            period: Optional period filter (e.g. '2026-09') or None for full series.
            db: Optional SQLAlchemy Session for SQLite caching.
            force_refresh: If True, bypasses cache and forces network fetch.
            custom_params: Optional additional PostgREST query parameters.

        Returns:
            The raw JSON payload (list or dict) from cache or INDEC API.

        Raises:
            ValueError: If variable_id is not in DATASET_REGISTRY.
            IndecAuthError: If INDEC_API_TOKEN is missing or invalid (HTTP 401/403).
            IndecNetworkError: If INDEC API is unreachable, times out, or returns HTTP 5xx.
            IndecResponseError: If INDEC API returns HTTP 4xx or malformed JSON.
        """
        if variable_id not in self.DATASET_REGISTRY:
            raise ValueError(
                f"Variable '{variable_id}' no está registrada en DATASET_REGISTRY. "
                f"Variables válidas: {list(self.DATASET_REGISTRY.keys())}"
            )

        cache_period = period if period else "all"

        # 1. Check local SQLite cache first (if db provided and not force_refresh)
        if db is not None and not force_refresh:
            cached = (
                db.query(IndecCache)
                .filter(
                    IndecCache.variable_id == variable_id,
                    IndecCache.period == cache_period,
                )
                .first()
            )
            if cached is not None:
                is_fresh = True
                if self.cache_ttl_seconds > 0 and cached.cached_at:
                    now = datetime.now(UTC)
                    cached_time = cached.cached_at
                    if cached_time.tzinfo is None:
                        cached_time = cached_time.replace(tzinfo=UTC)
                    if (now - cached_time).total_seconds() > self.cache_ttl_seconds:
                        is_fresh = False
                if is_fresh:
                    logger.debug(
                        "Cache hit for INDEC series %s (period=%s)",
                        variable_id,
                        cache_period,
                    )
                    return cached.raw_payload

        # 2. Before network call, ensure token is present (strictly no synthetic mock fallback)
        self._ensure_authenticated()

        registry_entry = self.DATASET_REGISTRY[variable_id]
        endpoint = registry_entry["endpoint"]
        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        params = dict(registry_entry.get("params", {}))
        if period and period != "all":
            params["periodo"] = f"eq.{period}"
        if custom_params:
            params.update(custom_params)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "User-Agent": "EconomicRiskDashboard/1.0",
        }

        # 3. Execute HTTP request
        try:
            response = self.client.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            raise IndecNetworkError(
                f"Tiempo de espera agotado al conectar con INDEC ({url}): {exc}"
            ) from exc
        except (httpx.ConnectError, httpx.NetworkError, httpx.RequestError) as exc:
            raise IndecNetworkError(
                f"Error de conexión con la API del INDEC ({url}): {exc}"
            ) from exc

        # 4. Handle HTTP status codes
        if response.status_code in (401, 403):
            raise IndecAuthError(
                f"Error de autenticación INDEC (HTTP {response.status_code}): "
                "Token inválido o expirado. Verifique INDEC_API_TOKEN."
            )
        if response.status_code >= 500:
            raise IndecNetworkError(
                f"Error en servidor INDEC (HTTP {response.status_code}): {response.text}"
            )
        if response.status_code >= 400:
            raise IndecResponseError(
                f"Error en consulta a INDEC (HTTP {response.status_code}): {response.text}"
            )

        # 5. Parse JSON payload
        try:
            payload = response.json()
        except Exception as exc:
            raise IndecResponseError(
                f"Respuesta inválida de INDEC (no es JSON válido): {exc}"
            ) from exc

        # 6. Persist to SQLite cache (if db provided)
        if db is not None:
            try:
                cached_entry = (
                    db.query(IndecCache)
                    .filter(
                        IndecCache.variable_id == variable_id,
                        IndecCache.period == cache_period,
                    )
                    .first()
                )
                if cached_entry is not None:
                    cached_entry.raw_payload = payload
                    cached_entry.cached_at = datetime.now(UTC)
                else:
                    new_cache = IndecCache(
                        variable_id=variable_id,
                        period=cache_period,
                        raw_payload=payload,
                        cached_at=datetime.now(UTC),
                    )
                    db.add(new_cache)
                db.commit()
            except SQLAlchemyError as exc:
                db.rollback()
                logger.warning(
                    "Error al persistir en IndecCache (%s): %s", variable_id, exc
                )

        return payload

    # Alias for method name flexibility
    get_series = fetch_series

    def get_catalog(self) -> dict[str, dict[str, Any]]:
        """Return metadata for all registered INDEC series."""
        return dict(self.DATASET_REGISTRY)

    def close(self) -> None:
        """Close the underlying HTTP client session."""
        if hasattr(self, "client") and not self.client.is_closed:
            self.client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

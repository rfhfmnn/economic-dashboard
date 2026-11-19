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


PAGINATED_COMEX_ENDPOINTS: set[str] = {
    "/comercio_exterior_exportacion_bienes",
    "/comercio_exterior_importacion_bienes",
}
COMEX_PAGE_SIZE: int = 1000
COMEX_MAX_PAGES: int = 30  # Cap at 30,000 records (approx. 25-30 pages)


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
    "ipc_general_indice": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - nivel general nacional (índice)",
        "category": "Precios y costos",
        "unit": "Índice base dic 2016=100",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general nacional en número índice",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.Indice",
            "order": "periodo.desc",
        },
    },
    "ipc_general_ia": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - nivel general nacional (interanual)",
        "category": "Precios y costos",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general nacional variación interanual",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_ia",
            "order": "periodo.desc",
        },
    },
    "ipc_bebidas_alcoholicas_tabaco": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - bebidas alcohólicas y tabaco",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división bebidas alcohólicas y tabaco",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*bebidas alcohólicas*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_prendas_calzado": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - prendas de vestir y calzado",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división prendas de vestir y calzado",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*prendas de vestir*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_equipamiento_hogar": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - equipamiento y mantenimiento del hogar",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división equipamiento y mantenimiento del hogar",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*equipamiento y mantenimiento*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_comunicacion": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - comunicación",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división comunicación",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*comunicación*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_recreacion_cultura": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - recreación y cultura",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división recreación y cultura",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*recreación y cultura*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_educacion": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - educación",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división educación",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*educación*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_restaurantes_hoteles": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - restaurantes y hoteles",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división restaurantes y hoteles",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*restaurantes y hoteles*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_bienes_servicios_varios": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - bienes y servicios varios",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - división bienes y servicios varios",
        "params": {
            "nivel": "eq.División",
            "descripcion": "ilike.*bienes y servicios varios*",
            "region": "eq.Nacional",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_gba": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - región Gran Buenos Aires (GBA)",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general región Gran Buenos Aires",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.GBA",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_pampeana": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - región pampeana",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general región pampeana",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Pampeana",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_cuyo": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - región Cuyo",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general región Cuyo",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Cuyo",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_noa": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - región Noroeste (NOA)",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general región Noroeste",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Noroeste",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_nea": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - región Noreste (NEA)",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general región Noreste",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Noreste",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "ipc_patagonia": {
        "endpoint": "/ipc_nacional",
        "name": "IPC - región Patagonia",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice de precios al consumidor - nivel general región Patagonia",
        "params": {
            "nivel": "eq.Nivel General",
            "region": "eq.Patagonia",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_general_indice": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - nivel general (índice)",
        "category": "Precios y costos",
        "unit": "Índice base 2016=100",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el Gran Buenos Aires - nivel general en número índice",
        "params": {
            "nivel": "eq.Nivel general",
            "tipo_de_indicador": "eq.Indice",
            "order": "periodo.desc",
        },
    },
    "icc_movimiento_suelo": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - movimiento de tierra",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem movimiento de tierra",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*movimiento de tierra*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_estructura": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - estructura",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem estructura",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*estructura*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_albanileria": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - albañilería",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem albañilería",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*albañilería*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_yeseria": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - yesería",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem yesería",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*yesería*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_instalacion_sanitaria": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - instalación sanitaria y contra incendio",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem instalación sanitaria",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*sanitaria*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_instalacion_gas": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - instalación de gas",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem instalación de gas",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*gas*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_instalacion_electrica": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - instalación eléctrica",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem instalación eléctrica",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*eléctrica*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "icc_pintura": {
        "endpoint": "/icc_precios_construccion",
        "name": "Costo de la construcción (ICC) - pintura",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Índice del costo de la construcción en el GBA - ítem pintura",
        "params": {
            "nivel": "eq.Item de obra",
            "descripcion": "ilike.*pintura*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipim_nacionales": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPIM) - productos nacionales",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPIM productos nacionales",
        "params": {
            "indicador": "eq.IPIM",
            "nivel": "eq.Origen",
            "descripcion": "eq.Nacionales",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipim_importados": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPIM) - productos importados",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPIM productos importados",
        "params": {
            "indicador": "eq.IPIM",
            "nivel": "eq.Origen",
            "descripcion": "eq.Importados",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipim_primarios": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPIM) - productos primarios",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPIM productos primarios",
        "params": {
            "indicador": "eq.IPIM",
            "nivel": "eq.Sector",
            "descripcion": "eq.Productos primarios",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "sipm_ipim_manufacturados": {
        "endpoint": "/sipm_precios_mayoristas",
        "name": "Precios mayoristas (IPIM) - productos manufacturados",
        "category": "Precios y costos",
        "unit": "% mensual",
        "frequency": "mensual",
        "description": "Sistema de índices de precios mayoristas - IPIM productos manufacturados y energía",
        "params": {
            "indicador": "eq.IPIM",
            "nivel": "eq.Sector",
            "descripcion": "ilike.*manufacturados*",
            "tipo_de_indicador": "eq.v_m",
            "order": "periodo.desc",
        },
    },
    "salarios_total_indice": {
        "endpoint": "/indice_salarios",
        "name": "Índice de salarios - total registrado (índice)",
        "category": "Salarios e ingresos",
        "unit": "Índice base oct 2016=100",
        "frequency": "mensual",
        "description": "Índice de salarios - total registrado en número índice",
        "params": {
            "descripcion": "eq.Total registrado",
            "tipo_de_indicador": "eq.Indice",
            "order": "periodo.desc",
        },
    },
    "emae_pesca": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - pesca",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - pesca (letra B)",
        "params": {
            "codigo": "eq.B",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_electricidad_gas_agua": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - electricidad, gas y agua",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - electricidad, gas y agua (letra E)",
        "params": {
            "codigo": "eq.E",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_hoteles_restaurantes": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - hoteles y restaurantes",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - hoteles y restaurantes (letra H)",
        "params": {
            "codigo": "eq.H",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_transporte_comunicaciones": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - transporte y comunicaciones",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - transporte y comunicaciones (letra I)",
        "params": {
            "codigo": "eq.I",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_inmobiliarias_alquiler": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - actividades inmobiliarias, empresariales y de alquiler",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - actividades inmobiliarias, empresariales y de alquiler (letra K)",
        "params": {
            "codigo": "eq.K",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_administracion_publica": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - administración pública y defensa",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - administración pública, defensa y planes de seguridad social (letra L)",
        "params": {
            "codigo": "eq.L",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_ensenanza": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - enseñanza",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - enseñanza (letra M)",
        "params": {
            "codigo": "eq.M",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_servicios_salud": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - servicios sociales y de salud",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - servicios sociales y de salud (letra N)",
        "params": {
            "codigo": "eq.N",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_otros_servicios": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - otras actividades de servicios comunitarias",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - otras actividades de servicios comunitarias, sociales y personales (letra O)",
        "params": {
            "codigo": "eq.O",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "emae_servicio_domestico": {
        "endpoint": "/estimador-mensual-de-actividad-economica-sectores",
        "name": "EMAE - hogares privados con servicio doméstico",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "EMAE por sector - hogares privados con servicio doméstico (letra P)",
        "params": {
            "codigo": "eq.P",
            "tipo_de_indicador": "eq.Índice base 2004=100",
            "order": "periodo.desc",
        },
    },
    "ipi_manuf_indice": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - nivel general (índice)",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - nivel general en número índice",
        "params": {
            "descripcion": "eq.IPI Manufacturero - Nivel general",
            "tipo_de_indicador": "eq.Índice",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_manuf_desest": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - desestacionalizado",
        "category": "Actividad y producción",
        "unit": "Índice base 2004=100",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - nivel general serie desestacionalizada",
        "params": {
            "descripcion": "eq.IPI Manufacturero - Nivel general",
            "tipo_de_indicador": "eq.Índice",
            "serie": "eq.Serie desestacionalizada",
            "order": "periodo.desc",
        },
    },
    "ipi_alimentos": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - alimentos y bebidas",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división alimentos y bebidas",
        "params": {
            "descripcion": "eq.Alimentos y bebidas",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_tabaco": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - productos de tabaco",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división productos de tabaco",
        "params": {
            "descripcion": "eq.Productos de tabaco",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_textiles": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - productos textiles",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división productos textiles",
        "params": {
            "descripcion": "eq.Productos textiles",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_prendas_calzado": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - prendas de vestir, cuero y calzado",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división prendas de vestir, cuero y calzado",
        "params": {
            "descripcion": "eq.Prendas de vestir, cuero y calzado",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_madera_papel": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - madera, papel, edición e impresión",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división madera, papel, edición e impresión",
        "params": {
            "descripcion": "eq.Madera, papel, edición e impresión",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_refinacion_petroleo": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - refinación del petróleo",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división refinación del petróleo, coque y combustible nuclear",
        "params": {
            "descripcion": "eq.Refinación del petróleo, coque y combustible nuclear",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_quimicos": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - sustancias y productos químicos",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división sustancias y productos químicos",
        "params": {
            "descripcion": "eq.Sustancias y productos químicos",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_caucho_plastico": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - productos de caucho y plástico",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división productos de caucho y plástico",
        "params": {
            "descripcion": "eq.Productos de caucho y plástico",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_minerales_no_metalicos": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - productos minerales no metálicos",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división productos minerales no metálicos",
        "params": {
            "descripcion": "eq.Productos minerales no metálicos",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_metalicas_basicas": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - industrias metálicas básicas",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división industrias metálicas básicas",
        "params": {
            "descripcion": "eq.Industrias metálicas básicas",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_productos_metal": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - productos de metal",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división productos de metal",
        "params": {
            "descripcion": "eq.Productos de metal",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_maquinaria_equipo": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - maquinaria y equipo",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división maquinaria y equipo",
        "params": {
            "descripcion": "eq.Maquinaria y equipo",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_otros_equipos": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - otros equipos, aparatos e instrumentos",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división otros equipos, aparatos e instrumentos",
        "params": {
            "descripcion": "eq.Otros equipos, aparatos e instrumentos",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_automotores": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - vehículos automotores, carrocerías y autopartes",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división vehículos automotores, carrocerías, remolques y autopartes",
        "params": {
            "descripcion": "eq.Vehículos automotores, carrocerías, remolques y autopartes",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_otro_transporte": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - otro equipo de transporte",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división otro equipo de transporte",
        "params": {
            "descripcion": "eq.Otro equipo de transporte",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_muebles": {
        "endpoint": "/ipi_manufacturero",
        "name": "IPI manufacturero - muebles y colchones",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial manufacturero - división muebles y colchones, y otras industrias manufactureras",
        "params": {
            "descripcion": "eq.Muebles y colchones, y otras industrias manufactureras",
            "tipo_de_indicador": "eq.Variación interanual",
            "serie": "eq.Serie original",
            "order": "periodo.desc",
        },
    },
    "ipi_minero_servicios": {
        "endpoint": "/ipi_minero",
        "name": "IPI minero - servicios de apoyo",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial minero - servicios de apoyo para la extracción de petróleo y gas",
        "params": {
            "descripcion": "ilike.*servicios de apoyo*",
            "tipo_de_indicador": "eq.Variación acumulada interanual",
            "serie": "eq.Serie Original",
            "order": "periodo.desc",
        },
    },
    "ipi_minero_no_metaliferos": {
        "endpoint": "/ipi_minero",
        "name": "IPI minero - minerales no metalíferos",
        "category": "Actividad y producción",
        "unit": "% interanual",
        "frequency": "mensual",
        "description": "Índice de producción industrial minero - extracción de minerales no metalíferos y rocas de aplicación",
        "params": {
            "descripcion": "ilike.*minerales no metalíferos*",
            "tipo_de_indicador": "eq.Variación acumulada interanual",
            "serie": "eq.Serie Original",
            "order": "periodo.desc",
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
        comex_page_size: int = COMEX_PAGE_SIZE,
        comex_max_pages: int = COMEX_MAX_PAGES,
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
        self.comex_page_size = comex_page_size
        self.comex_max_pages = comex_max_pages

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
            if "Periodo.desc" in params.get("order", "") or endpoint in PAGINATED_COMEX_ENDPOINTS:
                params["Periodo"] = f"eq.{period}"
            else:
                params["periodo"] = f"eq.{period}"
        if custom_params:
            params.update(custom_params)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "User-Agent": "EconomicRiskDashboard/1.0",
        }

        is_comex = (
            endpoint in PAGINATED_COMEX_ENDPOINTS
            or endpoint.rstrip("/").startswith("/comercio_exterior")
        )

        # 3. Execute HTTP request (with pagination loop for comex series)
        if is_comex:
            all_records: list[dict[str, Any]] = []
            page_size = self.comex_page_size
            max_pages = self.comex_max_pages

            for page in range(max_pages):
                page_params = dict(params)
                page_params["limit"] = str(page_size)
                page_params["offset"] = str(page * page_size)

                try:
                    response = self.client.get(url, params=page_params, headers=headers)
                except httpx.TimeoutException as exc:
                    raise IndecNetworkError(
                        f"Tiempo de espera agotado al conectar con INDEC ({url}): {exc}"
                    ) from exc
                except (httpx.ConnectError, httpx.NetworkError, httpx.RequestError) as exc:
                    raise IndecNetworkError(
                        f"Error de conexión con la API del INDEC ({url}): {exc}"
                    ) from exc

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

                try:
                    page_payload = response.json()
                except Exception as exc:
                    raise IndecResponseError(
                        f"Respuesta inválida de INDEC (no es JSON válido): {exc}"
                    ) from exc

                if isinstance(page_payload, list):
                    if not page_payload:
                        break
                    all_records.extend(page_payload)
                    if len(page_payload) < page_size:
                        break
                elif isinstance(page_payload, dict):
                    extracted_list = None
                    for k in ("data", "series", "valores", "records"):
                        if isinstance(page_payload.get(k), list):
                            extracted_list = page_payload[k]
                            break
                    if extracted_list is not None:
                        if not extracted_list:
                            break
                        all_records.extend(extracted_list)
                        if len(extracted_list) < page_size:
                            break
                    else:
                        all_records.append(page_payload)
                        break
                else:
                    break

            payload = all_records
        else:
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

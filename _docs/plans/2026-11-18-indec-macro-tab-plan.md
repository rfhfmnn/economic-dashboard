# Implementation Plan: Monitor Macroeconómico — Integración de Pestaña INDEC & Ajuste de Cabecera

**Fecha:** 2026-11-18  
**Especificación de Referencia:** `_docs/specs/2026-11-18-indec-macro-tab-design.md`  
**Estado:** Listo para Ejecución

---

## Resumen Ejecutivo

El plan detalla los pasos para:
1. Eliminar el badge `'Series BCRA'` de la barra de navegación superior en `Navbar.tsx`, dejando la cabecera unificada como **"Monitor macroeconómico"**.
2. Crear el cliente y servicio backend (`IndecClient`, `IndecService`, `IndecRoutes`) para consumir en vivo datos oficiales reales de `api.indec.gob.ar` autenticados mediante `INDEC_API_TOKEN`, con almacenamiento en caché local SQLite (`indec_cache`) y reporte de errores transparente (sin datos simulados en la experiencia de usuario).
3. Construir la interfaz de usuario en el frontend mediante `IndecView.tsx` (reutilizando `MetricCard`, `VariablePicker` y `MacroChart`), e integrarla como la tercera sub-pestaña en `MacroView.tsx`.
4. Garantizar cobertura completa de tests en backend (`pytest`) y frontend (`vitest`).

---

## Fases de Implementación

### Fase 1: Ajuste de Cabecera y Navegación Principal
**Objetivo:** Limpiar el título del headland a "Monitor macroeconómico".
- **Archivos a modificar:**
  - `frontend/src/components/layout/Navbar.tsx`: remover `badge: 'Series BCRA'`.
  - `frontend/src/App.test.tsx`: ajustar aserciones de prueba sobre el texto/badge del navbar.
- **Verificación:** `npm --prefix frontend run test` para asegurar que las pruebas de navegación pasen limpiamente.

### Fase 2: Backend — Cliente HTTP, Base de Datos y Caché Local
**Objetivo:** Establecer la infraestructura de comunicación con la API oficial del INDEC.
- **Archivos a crear/modificar:**
  - `backend/app/database.py`: agregar modelo `IndecCache` (`variable_id`, `period`, `raw_payload`, `cached_at`).
  - `backend/app/clients/indec_client.py`:
    - Clase `IndecClient` que recibe `base_url="https://api.indec.gob.ar"`, `token=os.getenv("INDEC_API_TOKEN")`.
    - Registro declarativo `DATASET_REGISTRY` mapeando variables clave (`ipc_general`, `ipc_core`, `emae_general`, `ipi_manuf`, `cbt`, `eph_desempleo`, `ica_saldo`, `icc_general`) hacia sus endpoints PostgREST correspondientes.
    - Soporte para consultas paginadas y filtradas.
    - Manejo de excepciones de red y respuesta de estado HTTP (401 Unauthorized si falta token, 404, 500) con logging estructurado.
  - `backend/tests/test_indec_client.py`: pruebas unitarias con mock de transporte HTTPX verificando headers Bearer, deserialización de JSON, manejo de caché y propagación de errores.

### Fase 3: Backend — Capa de Servicios y Rutas REST
**Objetivo:** Exponer endpoints limpios y normalizados para el frontend.
- **Archivos a crear/modificar:**
  - `backend/app/services/indec_service.py`:
    - `get_summary()`: obtiene y formatea los 8 indicadores prioritarios con sus últimos valores, fecha y variación mensual/interanual.
    - `get_catalog()`: lista todas las variables INDEC disponibles con sus categorías, unidades y descripciones gramaticales.
    - `get_series(variable_id, timeframe)`: extrae puntos cronológicos normalizados `{ fecha: "YYYY-MM-DD", valor: float }`, normalizando fechas trimestrales (EPH) a fin de mes.
  - `backend/app/routes/indec_routes.py`:
    - `GET /api/macro/indec/summary`
    - `GET /api/macro/indec/catalog`
    - `GET /api/macro/indec/series/{variable_id}`
  - `backend/app/main.py`: registrar `indec_routes.router`.
  - `backend/tests/test_indec_routes.py`: pruebas de integración con FastAPI `TestClient` validando contratos JSON y respuestas 200/401/404.

### Fase 4: Frontend — Tipos, Cliente API y Componente `IndecView`
**Objetivo:** Construir la pestaña INDEC en React respetando el sistema de diseño.
- **Archivos a crear/modificar:**
  - `frontend/src/types/index.ts`: interfaces para `IndecIndicator`, `IndecSummaryResponse`, `IndecCatalogItem`, `IndecSeriesResponse`.
  - `frontend/src/services/api.ts`: métodos `getIndecSummary`, `getIndecCatalog`, `getIndecSeries`.
  - `frontend/src/components/macro/indec/IndecView.tsx`:
    - Grilla superior con las 8 tarjetas KPI interactivas (`MetricCard`).
    - Barra con `VariablePicker` para seleccionar series primarias y secundarias (eje dual).
    - Gráfico temporal (`MacroChart`) interactivo con selector de plazo (1Y, 2Y, 5Y, Todo).
    - Estado de advertencia amigable si no se detecta `INDEC_API_TOKEN` o si hay error de conexión oficial, con botón de reintentar.
  - `frontend/src/components/macro/MacroView.tsx`:
    - Añadir tercer botón de sub-navegación: `"Variables INDEC (Economía Real)"`.
    - Renderizar condicionalmente `<IndecView />` al seleccionar dicho sub-tab.
  - `frontend/src/components/macro/indec/__tests__/IndecView.test.tsx`: pruebas de renderizado, interacción de tarjetas y cambio de series.

### Fase 5: Verificación Global y Quality Assurance
**Objetivo:** Asegurar que todo el sistema cumpla con la Definición de Hecho (DoD).
- Ejecutar `pytest backend/tests/ -v`.
- Ejecutar `npm --prefix frontend run test`.
- Ejecutar `npm --prefix frontend run build` (type-checking y bundling de producción).
- Verificar linting con `ruff check backend/` y `npm --prefix frontend run lint`.

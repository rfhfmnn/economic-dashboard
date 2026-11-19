# Implementation plan: Banco de trabajo multivariable (pool universal de datos)

**Fecha:** 2026-11-18  
**Especificación de referencia:** `_docs/specs/2026-11-18-universal-workbench-design.md`  
**Asignación de ingeniería:** Fullstack Developer  
**Estado:** Listo para ejecución

---

## Resumen ejecutivo

El presente plan define la hoja de ruta técnica para implementar el **banco de trabajo multivariable** (*workbench*) en el Economic & Credit Risk Dashboard.

El módulo provee:
1. Una sección independiente accesible desde la barra de navegación principal (`Navbar.tsx` y `App.tsx`).
2. Un buscador universal que integra las series de BCRA, INDEC, DolarApi (FX) y REM en un catálogo único con autocompletado en tiempo real.
3. Una bandeja de trabajo de hasta 5 series simultáneas con chips interactivos, colores distintivos, remoción rápida y estados de carga resilientes (`"Dato demorado"`).
4. Un motor matemático de alineación temporal, rebase a base 100 ($t_0=100$), variación porcentual acumulada ($\% \Delta$) y correlación móvil de Pearson ($r \in [-1.00, +1.00]$) con ventanas de 30, 90 y 180 días y downsampling mensual automático al mezclar frecuencias dispares.
5. Ajuste opcional por inflación mediante deflactación con IPC en moneda constante para series monetarias en pesos.
6. Tabla inferior de métricas estadísticas (último valor, variación en período, mínimo, máximo, desvío estándar) en formato monoespaciado (`tabular-nums`).
7. Exportación consolidada multivariable a CSV y Excel (XLSX).
8. Cumplimiento estricto del estándar institucional de sentence case.

---

## Fases de implementación

### Fase 1: Arquitectura de tipos, navegación principal y contratos
**Objetivo:** Establecer los tipos de dominio TypeScript, actualizar la navegación global del dashboard y preparar el contenedor principal de la vista.

- **Archivos a modificar:**
  - `frontend/src/types/index.ts`:
    - Ampliar `TabType` para incluir `'workbench'`:
      ```typescript
      export type TabType = 'macro' | 'screener' | 'batch' | 'workbench'
      ```
    - Definir interfaces de dominio del workbench:
      - `WorkbenchSource`: `'BCRA' | 'INDEC' | 'FX' | 'REM'`
      - `WorkbenchCatalogItem`: `{ id: string; source: WorkbenchSource; name: string; category: string; unit: string; frequency: 'diaria' | 'mensual' | 'trimestral'; isArs: boolean }`
      - `WorkbenchSeriesData`: `{ id: string; source: WorkbenchSource; name: string; color: string; unit: string; frequency: string; status: 'loading' | 'success' | 'delayed' | 'error'; points: MacroSeriesPoint[] }`
      - `RollingCorrelationPoint`: `{ fecha: string; r: number }`
      - `WorkbenchSeriesStats`: `{ id: string; name: string; source: WorkbenchSource; ultimoValor: number; fechaUltimo: string; variacionPeriodo: number; minimo: number; maximo: number; desvioEstandar: number }`
  - `frontend/src/components/layout/Navbar.tsx`:
    - Incorporar la pestaña del banco de trabajo con icono (`SlidersHorizontal` o `Workflow`), id `'workbench'` y etiqueta institucional en sentence case: `"Banco de trabajo"`.
  - `frontend/src/App.tsx`:
    - Renderizar condicionalmente `<WorkbenchView />` cuando `activeTab === 'workbench'`.
- **Verificación:**
  - `npm --prefix frontend run build` para asegurar coherencia en la comprobación estática de tipos.
  - Test en `frontend/src/components/layout/Navbar.test.tsx` o `frontend/src/App.test.tsx` validando que la pestaña se visualice y active correctamente.

---

### Fase 2: Backend — Catálogo consolidado, servicio de alineación y exportación
**Objetivo:** Habilitar endpoints auxiliares para el catálogo unificado y la exportación de matrices de datos consolidadas a Excel.

- **Archivos a modificar/crear:**
  - `backend/app/services/workbench_service.py`:
    - `get_unified_catalog()`: combina en una única lista estructurada las variables de BCRA, series oficiales de INDEC, cotizaciones cambiarias de DolarApi (oficial, MEP, CCL, blue) y series REM, normalizando identificadores y taxonomía financiera.
  - `backend/app/routes/macro_routes.py` (o `backend/app/routes/workbench_routes.py`):
    - `GET /api/macro/workbench/catalog`: devuelve el listado consolidado para alimentar el buscador universal.
  - `backend/app/services/export_service.py`:
    - `export_workbench_excel(aligned_data, stats_data, correlation_matrix)`: genera un libro de cálculo `.xlsx` con hojas de series consolidadas, estadísticas descriptivas y matriz de correlación cruzada.
  - `backend/app/routes/export_routes.py`:
    - `POST /api/export/workbench-excel`: recibe el payload de series activas y devuelve el archivo binario descargable.
  - `backend/tests/test_workbench_service.py`:
    - Tests unitarios verificando la agregación del catálogo unificado y el manejo de excepciones de fuentes externas.
  - `backend/tests/test_export_workbench.py`:
    - Tests verificando la correcta generación del archivo binario Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

---

### Fase 3: Motor matemático de frontend (alineación, correlación y estadísticas)
**Objetivo:** Desarrollar módulos utilitarios puros con cobertura de tests del 100% para cálculos reactivos en el cliente sin latencia de red.

- **Archivos a crear:**
  - `frontend/src/utils/alignment.ts`:
    - `alignTimeSeries(seriesList, mode: 'forward-fill' | 'downsample-monthly')`: alinea múltiples series con fechas dispares sobre un índice temporal común.
    - Soporte para escalonamiento (*forward-fill*) de series mensuales en cuadrícula diaria.
    - Consolidación mensual (*downsampling*) para series diarias al correlacionar contra datos mensuales.
  - `frontend/src/utils/correlation.ts`:
    - `calculateRollingCorrelation(seriesA, seriesB, windowDays: 30 | 90 | 180)`: calcula la correlación móvil de Pearson ($r$) asegurando $-1.00 \le r \le 1.00$.
    - `calculateSeriesStats(points)`: calcula último valor, fecha, variación acumulada, mínimo, máximo y desvío estándar muestral.
  - `frontend/src/utils/alignment.test.ts`:
    - Pruebas unitarias con vectores sintéticos: series con gaps de días no laborables, cruce de serie diaria con mensual, manejo de extremos.
  - `frontend/src/utils/correlation.test.ts`:
    - Pruebas unitarias verificando valores teóricos conocidos ($r = 1.0$, $r = -1.0$, serie constante con varianza cero, ventanas incompletas).

---

### Fase 4: Frontend — Componentes de UI del banco de trabajo
**Objetivo:** Construir la interfaz de usuario completa bajo las pautas del sistema de diseño institucional y en estricto sentence case.

- **Archivos a crear:**
  - `frontend/src/components/workbench/UniversalSearchBar.tsx`:
    - Buscador reactivo con autocompletado y filtros de origen (`Todas`, `BCRA`, `INDEC`, `FX`, `REM`).
    - Deshabilita series ya agregadas o al alcanzar el límite de 5.
  - `frontend/src/components/workbench/ActiveSeriesTray.tsx`:
    - Bandeja horizontal con chips de series activas.
    - Muestra color asignado, código de origen, nombre, spinner de carga, estado `"Dato demorado"` y botón de remoción (`X`).
  - `frontend/src/components/workbench/WorkbenchControls.tsx`:
    - Selector de modo: `"Serie temporal normalizada"` vs. `"Correlación móvil"`.
    - Selector de rango: `1M`, `3M`, `6M`, `1Y`, `5Y`, `Max` y date-pickers `Desde` / `Hasta`.
    - Selector de normalización: `"Base 100 (t₀ = 100)"` vs. `"Variación porcentual (% Δ)"`.
    - Interruptor: `"Ajustar por inflación (términos reales)"`.
    - Controles de correlación: selectores de `"Serie A"`, `"Serie B"` y ventana (`30 días`, `90 días`, `180 días`).
  - `frontend/src/components/workbench/NormalizedTimeSeriesChart.tsx`:
    - Gráfico interactivo con Recharts.
    - Renderiza hasta 5 series con sus colores asignados.
    - Aplica forward-fill escalonado (`stepAfter`) para series mensuales.
    - Tooltip multi-serie institucional sincronizado.
  - `frontend/src/components/workbench/RollingCorrelationChart.tsx`:
    - Gráfico Recharts con eje Y acotado entre -1.00 y +1.00.
    - Línea de referencia horizontal neutra en $Y=0$.
    - Áreas sombreadas sutiles para correlación positiva ($r > 0.5$) y negativa ($r < -0.5$).
  - `frontend/src/components/workbench/WorkbenchStatsTable.tsx`:
    - Tabla con alineación monoespaciada (`font-mono`, `tabular-nums`) que resume métricas de las series activas.
  - `frontend/src/components/workbench/WorkbenchView.tsx`:
    - Orquestador del estado local: series activas, estados de carga, rango de fechas, modo visual y opciones de exportación.
  - `frontend/src/components/workbench/__tests__/WorkbenchView.test.tsx`:
    - Tests de integración de componentes: renderizado de bandeja, adición y remoción de series, cambio de modo visual, visualización de estados y tabla de estadísticas.

---

### Fase 5: Exportación consolidada, auditoría de sentence case y QA
**Objetivo:** Implementar la descarga de datos y verificar que toda la interfaz cumpla con las normas de estilo y calidad del proyecto.

- **Archivos a crear/modificar:**
  - `frontend/src/components/workbench/ExportActions.tsx`:
    - Botones `"Exportar CSV"` y `"Exportar Excel"`.
    - Generación client-side de CSV unificado y llamada a endpoint de exportación XLSX.
  - Auditoría de sentence case en todos los textos de la interfaz (sin excepciones de Title Case).
  - Verificación de la suite completa de pruebas:
    - Backend: `pytest backend/tests/ -v`
    - Frontend: `npm --prefix frontend run test`
    - Compilación: `npm --prefix frontend run build`
    - Linting: `ruff check backend/` y `npm --prefix frontend run lint`

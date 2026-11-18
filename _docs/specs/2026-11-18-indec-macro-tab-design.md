# Design Document: Monitor Macroeconómico — Integración de Pestaña INDEC & Ajuste de Cabecera

**Fecha:** 2026-11-18  
**Autor:** Antigravity (en colaboración con el usuario)  
**Estado:** Borrador de Diseño Revisado (Listo para Aprobación)

---

## 1. Contexto e Intención

El **Monitor Macroeconómico** del dashboard actualmente cubre dos módulos principales:
1. *Variables BCRA & mercado cambiario* (agregados monetarios, tasas de política monetaria, reservas internacionales y brechas cambiarias).
2. *Expectativas de mercado (REM)* (proyecciones de consultoras y relevamiento del BCRA).

En el análisis macroeconómico y de riesgo crediticio institucional argentino, la dimensión monetaria debe complementarse con la **economía real**: inflación oficial (IPC), nivel de actividad económica (EMAE), producción industrial (IPI), indicadores sociolaborales (desempleo EPH, canastas básicas) y comercio exterior (ICA).

Con el lanzamiento del nuevo portal de APIs oficial del Instituto Nacional de Estadística y Censos (**`api.indec.gob.ar`**), se habilita el consumo automatizado y estructurado de estas estadísticas oficiales.

### Objetivos Principales:
1. **Ajuste de Cabecera:** En la barra de navegación superior (`Navbar.tsx`), retirar el badge `'Series BCRA'` de la pestaña `'Monitor macroeconómico'`, dejando la denominación limpia y unificada para reflejar que engloba tanto al BCRA como al INDEC.
2. **Nueva Sub-pestaña INDEC:** Incorporar una tercera opción de navegación interna en `MacroView.tsx` ("Variables INDEC & Economía Real").
3. **Interfaz Espejo:** Replicar exactamente la experiencia de usuario y el diseño de la pestaña BCRA:
   - Grilla superior con **8 tarjetas KPI interactivas**.
   - Selector de variables (`VariablePicker`) con catálogo categorizado y buscador en tiempo real.
   - Gráfico de series temporales (`MacroChart`) interactivo con selectores de plazo (1Y, 2Y, 5Y, Todo) y eje dual (izquierdo y derecho).

---

## 2. Metas, No-Metas y Anti-Metas

### Metas (In Scope):
- **Navbar:** Modificar `Navbar.tsx` para eliminar la propiedad `badge: 'Series BCRA'` del tab macro.
- **Backend - Cliente INDEC (`IndecClient`):**
  - Conexión directa a `api.indec.gob.ar` con autenticación Bearer JWT mediante variable de entorno `INDEC_API_TOKEN` en el archivo `.env`.
  - Consumo estricto de **datos oficiales reales** en vivo (sin datos sintéticos ni simulados en la experiencia de usuario).
  - Mecanismo de reintentos, timeouts custom y manejo seguro de SSL.
  - Caching local en SQLite (`indec_cache`) para evitar llamadas redundantes repetidas a la API oficial una vez obtenidos los datos reales.
  - Fixtures de prueba aislados en `tests/` para validación automatizada de contratos de red sin afectar el entorno real.
- **Backend - Capa de Servicio y Rutas:**
  - `GET /api/macro/indec/summary`: 8 indicadores principales reales para las tarjetas superiores.
  - `GET /api/macro/indec/catalog`: Catálogo completo de series oficiales reales disponibles en la API del INDEC.
  - `GET /api/macro/indec/series/{variable_id}`: Serie histórica real con soporte de filtrado temporal.
- **Frontend - Vista y Componentes:**
  - Integración en `MacroView.tsx` con navegación por sub-tabs: `'bcra_fx'`, `'rem'`, y `'indec'`.
  - Tarjetas KPI con datos reales oficiales, deltas mensuales e interanuales, sparklines y estado activo sincronizado con el gráfico.
  - Catálogo de variables organizado por categorías: *Precios y Costos*, *Actividad y Producción*, *Mercado de Trabajo y Social*, *Sector Externo*.
  - Gráfico interactivo multi-variable y multi-eje.
  - Manejo transparente de errores de red o token: si la API externa no responde o el token es inválido, se informa claramente el estado de conexión sin sustituir valores reales por números simulados.
- **Testing:** Tests unitarios e integración para el cliente HTTP, rutas FastAPI y componentes React.

### No-Metas (Out of Scope):
- Descarga o procesamiento de microdatos pesados de la EPH (bases de personas/hogares en crudo); solo se consumen las series agregadas.
- Cruce simultáneo de series BCRA e INDEC en un mismo gráfico en esta etapa (ambas conservan su propio espacio para evitar solapamientos de periodicidad heterogénea).

### Anti-Metas:
- **No datos sintéticos ni simulados:** En ningún caso se deben inventar, interpolar arbitrariamente o simular datos estadísticos. Los datos mostrados deben provenir fidedignamente de la API oficial del INDEC.
- **No romper la coherencia visual:** No introducir nuevos patrones de UI o librerías gráficas ajenas a Tailwind CSS, Lucide y Recharts.

---

## 3. Enfoques Considerados y Selección

| Enfoque | Descripción | Pros | Contras | Veredicto |
|---|---|---|---|---|
| **Enfoque 1: Espejo Idéntico con Catálogo Unificado** | Replicar la grilla de 8 tarjetas superiores fijas, barra de selección con selector categorizado y gráfico Recharts multi-eje. | Máxima familiaridad para el usuario; cero curva de aprendizaje; reutiliza componentes probados. | Requiere que el gráfico maneje fechas con periodicidad mensual y trimestral armonizadas. | **SELECCIONADO** (Aprobado por el usuario) |
| **Enfoque 2: Módulos Temáticos Segmentados** | Dividir la pestaña en sub-secciones (*Precios*, *Actividad*, *Social*), cambiando las tarjetas según la sección. | Agrupa variables de igual unidad y frecuencia. | Agrega clics de navegación y rompe la consistencia con la pestaña BCRA. | Descartado |

---

## 4. Definición de Variables y Tarjetas Superiores

Las 8 tarjetas KPI fijas en la parte superior serán:
1. **IPC Nivel General:** Variación mensual (%) e interanual (%) nacional.
2. **IPC Núcleo:** Variación mensual (%) de la canasta desestacionalizada y sin regulados.
3. **EMAE Nivel General:** Índice base 2004=100, variación interanual y desestacionalizada.
4. **IPI Manufacturero:** Variación interanual de la producción industrial.
5. **Canasta Básica Total (CBT):** Valor individual en \$ (línea de pobreza) y variación mensual.
6. **Tasa de Desocupación:** Porcentaje trimestral de la población económicamente activa (EPH).
7. **Balanza Comercial (ICA):** Saldo comercial mensual en millones de USD (Exportaciones - Importaciones).
8. **Costo de la Construcción (ICC):** Variación mensual general (%).

El catálogo (`VariablePicker`) incluirá además:
- Subrubros del IPC (Alimentos, Transporte, Vivienda, Salud, etc.).
- Sectores del EMAE (Industria, Comercio, Agro, Minería, Construcción, etc.).
- Canasta Básica Alimentaria (CBA) y Canasta de Crianza.
- Sistema de Índices de Precios Mayoristas (IPIM).
- Exportaciones e importaciones desagregadas por grandes rubros.

---

## 5. Resoluciones Técnicas del Constructor (Builder Decisions)

Tras la revisión técnica del diseño, se definen los siguientes criterios arquitectónicos:

1. **Mapeo de Endpoints PostgREST (`api.indec.gob.ar`):**  
   *Decisión:* `IndecClient` contará con un registro declarativo interno (`DATASET_REGISTRY`) que mapea cada `variable_id` hacia su endpoint PostgREST correspondiente (`/ipc`, `/emae`, `/ipi_manufacturero`, `/eph_tasas`, `/canastas_basicas`, `/ica`), junto con sus parámetros estándar (`select`, `order`, filtros de región). Si la API presenta un endpoint unificado de series, el cliente lo aprovecha transparentemente.
2. **Manejo de Variaciones (MoM / YoY) vs. Niveles:**  
   *Decisión:* En consonancia con la pestaña BCRA, el catálogo expondrá de forma explícita las series tanto en su nivel o índice como en su variación (ej. *"EMAE - Nivel General (Índice)"* y *"EMAE - Variación i.a. (%)"*). Esto evita modificar `MacroChart.tsx` innecesariamente, previniendo regresiones visuales.
3. **Armonización de Frecuencias (Mensual vs. Trimestral):**  
   *Decisión:* Para la Tasa de Desocupación (trimestral), el servicio backend asignará la fecha al último día del mes de cierre de cada trimestre (ej. `YYYY-03-31`, `YYYY-06-30`, etc.) y el componente gráfico activará `connectNulls={true}` o interpolará meses intermedios en caso de visualización comparativa multi-eje.
4. **Cero Datos Sintéticos en Vivo:**  
   *Decisión:* El cliente se comunicará exclusivamente con la API real del INDEC. Si la API no está disponible o el token no es válido, la UI mostrará un banner informativo de error de conexión/autenticación con opción de reintentar, sin generar datos falsos o números inventados.
5. **Modo Deflactado por Inflación (`isRealMode`):**  
   *Decisión:* En la pestaña INDEC el toggle de deflación por IPC se mantendrá inactivo por defecto, dado que los indicadores de actividad (EMAE, IPI) ya son índices reales o variaciones porcentuales, y las canastas ya representan valores de canasta física.

---

## 6. Verificación y Criterios de Aceptación (QA)

1. **Ajuste de Cabecera:**
   - La pestaña superior muestra estrictamente el texto "Monitor macroeconómico" sin el chip/badge "Series BCRA".
   - Pruebas existentes en `App.test.tsx` actualizadas y pasando al 100%.
2. **Navegación Interna:**
   - En `MacroView.tsx` aparecen tres sub-tabs: *Variables BCRA & mercado cambiario*, *Expectativas de mercado (REM)*, y *Variables INDEC (Economía Real)*.
   - La navegación entre sub-tabs es fluida, mantiene su estado y no genera recargas innecesarias.
3. **Consumo de Datos Reales & Manejo de Token:**
   - Con `INDEC_API_TOKEN` configurado en `.env`, el cliente consume en vivo la API oficial de `api.indec.gob.ar`.
   - Si no hay token configurado o expira, el sistema presenta un mensaje claro solicitando configurar el token en el archivo `.env`, sin inventar datos.
4. **Interacción del Tab INDEC:**
   - Se renderizan las 8 tarjetas KPI superiores con valores reales oficiales formateados en notación argentina (`es-AR`), unidades claras y deltas MoM / YoY.
   - El selector de variables permite buscar y alternar series reales entre el eje primario y el eje secundario.
   - El gráfico actualiza sus líneas y tooltips respetando los plazos temporales (1Y, 2Y, 5Y, Todo).
5. **Calidad de Código y Estándares:**
   - `pytest backend/tests/` ejecutado sin fallas (utilizando mocks únicamente como aisladores de red en los tests unitarios automáticos).
   - `npm --prefix frontend run test` y `npm --prefix frontend run build` pasando sin errores de TypeScript ni advertencias de linting.

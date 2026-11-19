# Design document: Banco de trabajo multivariable (pool universal de datos)

**Fecha:** 2026-11-18  
**Autor:** Product Manager (en colaboración con el usuario)  
**Estado:** Groomed y aprobado para implementación

---

## 1. Contexto e intención

El dashboard actualmente ofrece módulos especializados para el seguimiento macroeconómico:
1. *Monitor macroeconómico*: sub-pestañas para variables BCRA, mercado cambiario (FX DolarApi), relevamiento de expectativas de mercado (REM) y variables de la economía real del INDEC.
2. *Central de deudores*: evaluación individual y por lote de riesgo crediticio institucional.

Si bien estos módulos resuelven consultas verticales de forma óptima, los analistas de riesgo, economistas y comités de crédito requieren una herramienta analítica transversal: un **banco de trabajo multivariable** (*workbench*) capaz de operar sobre un **pool universal de datos** que combine sin fricciones series de orígenes dispares (BCRA, INDEC, DolarApi y REM).

Este nuevo módulo permite:
- Cruzar cualquier variable monetaria, cambiaria, de actividad o de precios en una misma mesa de trabajo sin restricciones de pertenencia a un sub-panel específico.
- Comparar hasta 5 series simultáneas mediante rebase dinámico ($t_0=100$) o variación porcentual acumulada ($\% \Delta$).
- Calcular correlaciones móviles temporales (*rolling correlation*) con ventanas paramétricas (30, 90 y 180 días) para detectar desacoples macroeconómicos y cambios de régimen.
- Deflactar series monetarias en pesos a moneda constante usando el IPC oficial.
- Exportar matrices de datos perfectamente armonizadas y alineadas por fecha a CSV y Excel para auditoría y modelado externo.

---

## 2. Metas, no-metas y anti-metas

### Metas (in scope):
- **Nueva sección en la barra de navegación superior:**
  - Agregar la pestaña `'workbench'` con icono institucional (`SlidersHorizontal` o `Workflow`) y etiqueta `"Banco de trabajo"` en `Navbar.tsx`.
  - Integrar el enrutador en `App.tsx` para renderizar `<WorkbenchView />`.
- **Buscador universal abierto con autocompletado reactivo:**
  - Indexar en memoria y mediante endpoints de catálogo todas las series disponibles: BCRA estadísticas, INDEC (IPC, EMAE, IPI, canastas, desocupación, ICA), DolarApi FX (oficial, MEP, CCL, blue) y REM (medianas históricas y proyecciones de inflación, tasas y tipo de cambio).
  - Filtrado instantáneo por texto, categoría y etiqueta de fuente (`[BCRA]`, `[INDEC]`, `[FX]`, `[REM]`).
- **Bandeja de series activas:**
  - Soporte de hasta 5 series activas simultáneamente en la mesa de trabajo.
  - Cada chip de serie visualiza: badge de origen de datos, nombre normalizado, color institucional asignado, botón de remoción rápida y estado de carga o disponibilidad.
  - Resiliencia ante fallos parciales: si una serie experimenta demoras o error de red, se muestra el indicador `"Dato demorado"` sin interrumpir el renderizado de las series restantes.
- **Rango temporal y selector de fechas:**
  - Accesos rápidos de rango: 1M, 3M, 6M, 1Y, 5Y, Max.
  - Selector de fechas personalizado (`desde` / `hasta`) para auditorías históricas específicas.
- **Ajuste por inflación en términos reales:**
  - Interruptor (*switch*) `"Ajustar por inflación (términos reales)"` que deflacta series elegibles expresadas en ARS contra el índice de precios al consumidor (IPC general de INDEC/BCRA).
- **Dos modos visuales interactivos:**
  1. *Vista temporal normalizada:* Base 100 dinámica ($t_0=100$) o variación porcentual ($\% \Delta$). Incluye escalonamiento visual (*forward-fill*) para series de periodicidad mensual o trimestral proyectadas sobre eje cronológico diario.
  2. *Vista de correlación móvil temporal (rolling correlation):* Cálculo en ventana deslizante (30, 90 o 180 días) del coeficiente de correlación de Pearson ($r \in [-1.00, +1.00]$) entre 2 series seleccionadas por el usuario, con armonización y downsampling mensual automático al mezclar frecuencias dispares.
- **Tabla resumen de métricas estadísticas:**
  - Panel inferior con resumen estructurado: último valor observado, fecha de actualización, variación acumulada en el período, valor mínimo, valor máximo y desvío estándar muestral.
  - Formato monoespaciado con alineación tabular (`font-mono` y `tabular-nums`).
- **Exportación de datos consolidados:**
  - Generación y descarga de archivo consolidado en CSV y Excel con matriz de datos alineada por fecha ($YYYY-MM-DD$).
- **Estricto sentence case:**
  - Todas las etiquetas, botones, títulos, cabeceras de tabla y tooltips deben estar redactados en sentence case sin excepción.

### No-metas (out of scope):
- Modelos econométricos avanzados de cointegración (Engle-Granger, Johansen) o modelos predictivos de Machine Learning (reservados para etapas analíticas posteriores).
- Edición o sobrescritura manual de observaciones históricas por parte del usuario.
- Gráficos 3D o diagramas de dispersión de nube de puntos fuera de las series temporales y de correlación móvil.

### Anti-metas:
- **No inventar datos sintéticos:** Si una serie no tiene datos para un día o período determinado, no interpolar arbitrariamente sin transparentar el método (*forward-fill* documentado explícitamente).
- **No bloqueos globales por caídas de una fuente externa:** Una falla transitoria en un proveedor no debe bloquear la visualización de las otras 4 series activas.
- **Cero Title Case:** Ningún encabezado o botón debe utilizar mayúsculas en cada palabra.

---

## 3. Especificación funcional y de interfaz de usuario

### 3.1 Estructura general de pantalla (`WorkbenchView.tsx`)

El banco de trabajo se estructura verticalmente en cuatro bloques principales:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Banco de trabajo                                       [Exportar CSV] │
│ Pool universal de datos y correlación cruzada           [Exportar XLSX]│
├────────────────────────────────────────────────────────────────────────┤
│ [ 🔍 Buscar serie en BCRA, INDEC, FX y REM...                        ] │
│ Bandeja activa (3/5):                                                  │
│ [ [BCRA] Base monetaria (x) ] [ [FX] Dólar blue (x) ] [ [INDEC] IPC (x) ]│
├────────────────────────────────────────────────────────────────────────┤
│ Barra de control:                                                      │
│ Modo: (•) Temporal normalizado   ( ) Correlación móvil                 │
│ Rango: [1M] [3M] [6M] [1Y] [5Y] [Max] | Desde [dd/mm/aaaa] Hasta [...] │
│ Normalización: [Base 100 (t0=100)] [Variación %]                       │
│ [ ] Ajustar por inflación (términos reales)                            │
├────────────────────────────────────────────────────────────────────────┤
│ Área gráfica principal:                                                │
│ - Gráfico Recharts con tooltip multi-serie sincronizado                │
│ - En modo temporal: líneas multi-color con forward-fill escalonado     │
│ - En modo correlación: curva r entre -1.00 y +1.00 con umbral cero     │
├────────────────────────────────────────────────────────────────────────┤
│ Tabla de métricas estadísticas (resumen analítico):                   │
│ Serie        | Origen | Último valor | Var. período | Mín   | Máx   | Desvío │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Buscador universal reactivo (`UniversalSearchBar.tsx`)

- **Entrada:** Campo de texto con icono de lupa, atajo de teclado y borrado rápido.
- **Catálogo indexado:**
  - Origen BCRA: todas las series monetarias, de reservas, tasas e índices disponibles en el catálogo BCRA.
  - Origen INDEC: IPC (general y aperturas), EMAE (general y sectores), IPI manufacturero, canastas básicas (CBA, CBT), tasas EPH (desocupación) y balanza comercial (ICA).
  - Origen FX: dólar oficial mayorista, dólar MEP, dólar CCL y dólar blue con datos históricos.
  - Origen REM: serie de inflación esperada (mediana), tipo de cambio nominal esperado y tasa Badlar proyectada.
- **Filtros por origen:** Píldoras para acotar la búsqueda a `Todas`, `BCRA`, `INDEC`, `FX` o `REM`.
- **Comportamiento:**
  - Autocompletado reactivo a partir de 1 caracter.
  - Muestra un máximo de 8 resultados coincidentes con scroll vertical.
  - Deshabilita la selección de una serie si ya se encuentra en la bandeja o si se alcanzó el tope de 5 series activas.

### 3.3 Bandeja de series activas (`ActiveSeriesTray.tsx`)

- Capacidad máxima: **5 series simultáneas**.
- Cada chip muestra:
  - Indicador de color asignado a la serie (paleta institucional: azul, esmeralda, ámbar, violeta, rosa).
  - Badge de origen: `[BCRA]`, `[INDEC]`, `[FX]`, `[REM]`.
  - Nombre normalizado de la serie (en sentence case).
  - Estado de carga: spinner animado durante el fetch, punto verde al finalizar o badge `"Dato demorado"` si hubo reintentos o caída de la fuente.
  - Botón de remoción rápida (`X`).
- Si la bandeja está vacía, se visualiza una ilustración sutil con el mensaje `"Seleccione hasta 5 series del buscador universal para comenzar a analizar"`.

### 3.4 Controles y barra de herramientas

1. **Selector de modo visual:**
   - Botones toggle tipo pastilla:
     - `"Serie temporal normalizada"`
     - `"Correlación móvil"`
2. **Selector de rango temporal:**
   - Botones de acceso rápido: `1M`, `3M`, `6M`, `1Y`, `5Y`, `Max`.
   - Selector personalizado de fecha inicial (`Desde`) y fecha final (`Hasta`) con validación de consistencia cronológica.
3. **Selector de normalización (modo temporal):**
   - `"Base 100 (t₀ = 100)"`: Rebase de todas las series seleccionadas al primer punto observable del período.
   - `"Variación porcentual acumulada (% Δ)"`: Muestra el crecimiento porcentual acumulado relativo al valor inicial.
4. **Interruptor de ajuste por inflación:**
   - Switch `"Ajustar por inflación (términos reales)"`.
   - Al activarse, aplica el deflactor IPC únicamente sobre aquellas series identificadas como monetarias en pesos (ARS). Las tasas porcentuales, índices ya normalizados o series en USD no se alteran y muestran un tooltip aclaratorio: `"Esta serie no requiere deflactación"`.
5. **Selector de parámetros de correlación (modo correlación móvil):**
   - Selectores desplegables de dos series: `"Serie A"` y `"Serie B"` (elegidas de entre las activas en la bandeja).
   - Selector de ventana temporal: `30 días`, `90 días` o `180 días`.
   - Etiqueta informativa de frecuencia: muestra `"Armonización mensual automática"` cuando se cruzan series diarias y mensuales.

---

## 4. Arquitectura y motor matemático

### 4.1 Armonización y alineación temporal de frecuencias dispares

Las series del pool universal presentan periodicidades heterogéneas:
- **Diarias:** Reservas, tipo de cambio oficial, FX paralelos (MEP, CCL, Blue), tasas de política monetaria.
- **Mensuales:** IPC, EMAE, IPI manufacturero, canastas básicas, REM.
- **Trimestrales:** Desocupación EPH.

#### Reglas de armonización:
1. **Modo serie temporal normalizada:**
   - El eje temporal adopta la frecuencia diaria como base cronológica común.
   - Las series mensuales y trimestrales aplican técnica de **forward-fill escalonado** (*step-after*): el valor oficial publicado se mantiene constante durante todos los días del mes correspondiente hasta la entrada en vigencia del nuevo período.
   - En el gráfico Recharts, las series mensuales se renderizan como líneas escalonadas (`type="stepAfter"` o equivalente) para que el analista distinga inmediatamente que se trata de un dato con periodicidad mensual.
2. **Modo correlación móvil temporal:**
   - Si ambas series son de frecuencia diaria: el cálculo de la correlación móvil de Pearson se realiza sobre observaciones diarias continuas.
   - Si al menos una de las dos series es mensual o trimestral: el motor ejecuta un **downsampling mensual automático**. Las series diarias se consolidan a fin de mes (usando el promedio mensual o último valor según su taxonomía financiera) y la ventana móvil se aplica en bloques de meses equivalentes (ej. 30 días $\approx$ 1 mes, 90 días $\approx$ 3 meses, 180 días $\approx$ 6 meses).

### 4.2 Fórmulas matemáticas

1. **Rebase a base 100 dinámica:**
   $$I_t = \frac{X_t}{X_0} \times 100$$
   donde $X_0$ es la primera observación válida no nula en la ventana temporal seleccionada.

2. **Variación porcentual acumulada:**
   $$\% \Delta_t = \left( \frac{X_t}{X_0} - 1 \right) \times 100$$

3. **Coeficiente de correlación móvil de Pearson ($r_t$ en ventana $W$):**
   $$r_t = \frac{\sum_{i=t-W+1}^{t} (X_i - \bar{X}) (Y_i - \bar{Y})}{\sqrt{\sum_{i=t-W+1}^{t} (X_i - \bar{X})^2} \sqrt{\sum_{i=t-W+1}^{t} (Y_i - \bar{Y})^2}}$$
   - El dominio de salida está estrictamente acotado: $-1.00 \le r_t \le +1.00$.
   - Si la varianza de alguna de las series en la ventana es cero, $r_t = 0$.
   - En la gráfica se proyecta una línea de referencia horizontal neutra en $Y=0$, con áreas sombreadas suaves verdes para correlación positiva ($r > 0.5$) y rojas para correlación inversa ($r < -0.5$).

### 4.3 Tabla de resumen estadístico (`WorkbenchStatsTable.tsx`)

Para cada serie activa en la bandeja, la tabla calcula y presenta:
- **Serie:** Nombre y etiqueta de origen (`[BCRA]`, `[INDEC]`, `[FX]`, `[REM]`).
- **Último valor:** Valor numérico en su unidad original con formato monetario/porcentual adecuado.
- **Fecha de observación:** Fecha del último registro disponible (`DD/MM/YYYY`).
- **Variación en el período:** Variación porcentual ($\%$) entre el primer y último registro del rango seleccionado.
- **Mínimo:** Valor mínimo observado en el rango.
- **Máximo:** Valor máximo observado en el rango.
- **Desvío estándar ($s$):** Dispersión muestral de la serie en el rango seleccionado.

---

## 5. Exportación consolidada

1. **Exportación a CSV:**
   - Generación en el cliente mediante Blob unificado con codificación UTF-8 y delimitador estándar de comas o punto y coma según configuración local.
   - Columnas: `fecha`, seguida por una columna por cada serie activa nombrada según su identificador y fuente (ej. `bcra_base_monetaria`, `dolar_blue`, `indec_ipc_general`).
2. **Exportación a Excel (XLSX):**
   - Servicio backend en `backend/app/services/export_service.py` (`POST /api/export/workbench-excel`).
   - Hoja 1: *Series consolidadas* (tabla de observaciones cronológicas alineadas).
   - Hoja 2: *Resumen estadístico* (métricas calculadas y metadatos de las fuentes).
   - Hoja 3: *Matriz de correlación* (coeficientes de correlación cruzada entre todos los pares activos).

---

## 6. Manejo de resiliencia y errores

- **Degradación elegante:** Si una llamada a `api.bcra.gob.ar`, `api.indec.gob.ar` o `dolarapi.com` demora o falla:
  - El chip de la serie afectada cambia a estado `"Dato demorado"` con advertencia tooltip.
  - Las otras series activas continúan mostrándose y correlacionándose sin interrupción.
- **Notificación no intrusiva:** Si una fuente no responde, se ofrece un botón de reintento individual en el chip sin recargar la página completa.

---

## 7. Cumplimiento de diseño y sentence case

- **Estricto sentence case:**
  - ✅ `"Banco de trabajo"`
  - ✅ `"Buscador universal de series"`
  - ✅ `"Ajustar por inflación (términos reales)"`
  - ✅ `"Serie temporal normalizada"`
  - ✅ `"Correlación móvil"`
  - ✅ `"Tabla resumen estadística"`
  - ✅ `"Descargar datos consolidados"`
  - ✅ `"Dato demorado"`
  - ❌ Prohibido Title Case como `"Banco De Trabajo"` o `"Ajustar Por Inflación"`.
- **Alineación monoespaciada:** Todas las celdas numéricas de la tabla de resumen estadístico y los valores del tooltip del gráfico utilizan `font-mono` y `tabular-nums`.

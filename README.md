# Laboratorio Virtual de Resistencia de Materiales

Laboratorio experimental virtual para la asignatura **Resistencia de Materiales (IND011)** —
Ingeniería Industrial, Universidad Andina del Cusco. No es una calculadora de fórmulas ni un
cuestionario: el estudiante configura un banco de ensayo, lo opera directamente (como un
simulador tipo [PhET](https://phet.colorado.edu/) — sliders con lectura numérica en vivo, sin
pasos obligatorios) y ve la respuesta física en tiempo real, con las limitaciones realistas de
un instrumento (rango, resolución, error de cero, incertidumbre). Puede registrar puntos,
compararlos al instante contra el modelo de referencia y exportar sus datos. Los modos guiados o
de evaluación (predicción obligatoria, rúbrica, semillas por estudiante) se construirán después,
como una capa aparte sobre este mismo simulador.

## Estado del proyecto — Primera etapa (núcleo + tercera unidad)

Implementado y funcional:

- **Biblioteca de materiales** (`src/engine/materials.ts`): 25 materiales industriales reales
  (aceros al carbono/aleados/inoxidables, aluminios, cobre y aleaciones, fundiciones, polímeros,
  fabricación aditiva, compuestos GFRP/CFRP, y 2 probetas "desconocidas" para identificación),
  con fuente documentada y propiedades que se omiten (no se inventan) cuando no hay dato de
  referencia confiable.
- **Motor de medición virtual** (`src/engine/measurement.ts`): instrumentos con rango,
  resolución, error de cero y incertidumbre; variación sintética pequeña y reproducible a
  partir de una semilla (nunca `Math.random()` libre).
- **Motor mecánico** (`src/engine/mechanics/`): carga axial con modelo constitutivo
  elástico/elastoplástico bilineal/frágil según el material (`axial.ts`), pandeo de Euler con
  las 4 condiciones de apoyo ideales y modelo de imperfección inicial (`buckling.ts`),
  transformación de esfuerzos y círculo de Mohr (`mohr.ts`), y los módulos de torsión
  (`torsion.ts`) y recipientes a presión (`pressureVessel.ts`) — estos dos últimos como motor de
  cálculo validado numéricamente; sus bancos interactivos completos (Banco 5 y Banco 8) llegan
  en una etapa posterior.
- **Analizador de secciones** (`src/engine/sections.ts`): área, centroide, Ix, Iy, Ixy, radios de
  giro y ejes principales para secciones circulares, rectangulares (macizas y tubulares) y
  perfiles I, T y L (por el método de rectángulos compuestos).
- **Banco 2 — Compresión** y **Banco 6 — Pandeo de columnas**: manipulación directa de la carga
  (por fuerza, deformación unitaria o milímetros), representación SVG interactiva con
  instrumentos en vivo (celda de carga con rango autoajustado, comparador de carátula, gráfico
  σ-ε / P-δ en tiempo real), descarga/deformación permanente, probeta destructible y
  reemplazable, registro de puntos y comparación instantánea contra el modelo de referencia —
  todo en una sola vista, sin pasos obligatorios.
- **Estación A — Propiedades geométricas** y **Estación B — Círculo de Mohr**: herramientas de
  análisis interactivas con representación gráfica.
- **Exportación**: mediciones a CSV, sesión completa a JSON, informe imprimible (PDF vía
  impresión del navegador).

Pendiente para etapas siguientes (según el plan de la asignatura): bancos de Tracción, Flexión,
Cortante, Torsión, Uniones mecánicas y Recipientes a presión; un modo guiado/evaluación opcional
(predicción previa, rúbrica, semillas por estudiante) construido sobre este mismo simulador.

## Arquitectura

```
src/
  engine/                  Motor de cálculo puro (sin React, sin SVG) — testeable de forma aislada
    types.ts               Tipos centrales (Material, SesionEnsayo, EtapaEnsayo, ...)
    materials.ts            Biblioteca de materiales
    measurement.ts          Instrumentación virtual (medir, selección de rango de celda de carga)
    sections.ts              Propiedades geométricas de secciones
    prng.ts                   PRNG determinista (mulberry32) para variaciones reproducibles
    mechanics/
      axial.ts                Carga axial (tracción/compresión), modelos constitutivos
      buckling.ts              Pandeo de Euler
      mohr.ts                  Círculo de Mohr / transformación de esfuerzos
      torsion.ts                Torsión de ejes circulares
      pressureVessel.ts          Recipientes de pared delgada
    __tests__/                Pruebas de validación numérica (vitest) — ver más abajo

  trial/                    Gestión de la sesión de ensayo (independiente del banco concreto)
    useSesionEnsayo.ts        Hook con el estado del ensayo (material, mediciones, cálculos del
                               estudiante); no impone una secuencia de pasos en la interfaz
    exportar.ts                 CSV / JSON

  components/               Piezas de interfaz reutilizables entre bancos y estaciones
  benches/                   Un banco de ensayo = <Nombre>Bench.tsx + <Nombre>SVG.tsx
    compression/
    buckling/
  stations/                  Una estación de análisis = <Nombre>Station.tsx + <Nombre>SVG.tsx
    sections/
    mohr/

  App.tsx                  Catálogo y navegación entre bancos/estaciones
```

El motor (`engine/`) no importa React ni nada visual: cada fórmula es una función pura, testeada
por separado de la interfaz. Los componentes de React orquestan el motor y dibujan el estado
en SVG; ningún cálculo "vive" dentro de un componente.

## Ejecución local

Requiere Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173 con recarga en caliente
npm test            # 69 pruebas de validación numérica (vitest)
npm run build       # compila TypeScript y genera dist/ para producción
npm run preview     # sirve dist/ localmente
```

## Publicación en GitHub Pages

El flujo `.github/workflows/deploy.yml` se ejecuta con cada cambio en `main`: instala
dependencias, corre las pruebas, compila con `BASE_PATH=/<repositorio>/` y publica `dist/` en
`https://<usuario>.github.io/<repositorio>/`. Hay que activarlo una vez en el repositorio:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Pruebas de validación numérica

`npm test` ejecuta, entre otras, las pruebas obligatorias con resultados conocidos:

| Caso | Entrada | Resultado esperado | Verificado |
|---|---|---|---|
| Tracción elástica | P=10000 N, A=100 mm², L=100 mm, E=200000 MPa | σ=100 MPa, ε=0.0005, ΔL=0.05 mm | ✅ |
| Pandeo de Euler | E=200000 MPa, I=10000 mm⁴, L=1000 mm, K=1 | Pcr ≈ 19.739 kN | ✅ |
| Torsión | d=10 mm, L=500 mm, G=80000 MPa, T=10 N·m | φ≈0.06366 rad, τmax≈50.93 MPa | ✅ |
| Círculo de Mohr | σx=80, σy=20, τxy=30 MPa | σprom=50, R≈42.426, σ1≈92.426, σ2≈7.574 MPa | ✅ |
| Recipiente de pared delgada | P=1 MPa, r=100 mm, t=5 mm, extremos cerrados | σcirc≈20 MPa, σlong≈10 MPa | ✅ |

Además hay pruebas de conversión/consistencia de unidades, cambio de material, límites de
rango de instrumentos, error de cero, condiciones de apoyo (los 4 casos de K) y validación de
entradas inválidas (áreas, longitudes, secciones y diámetros no físicos).

## Decisiones técnicas relevantes

- **Modelo constitutivo por material**: elástico-plástico bilineal (metales dúctiles),
  frágil-lineal (fundición gris, polímeros rígidos, compuestos, impresión 3D) o elástico-lineal,
  según `material.modelo`. Nunca se usa la misma curva para todos los materiales.
- **Aplicabilidad de Euler**: se verifica la esbeltez crítica (σcr vs. σY) antes de aceptar el
  resultado; una columna corta advierte que Euler no es válido.
- **Imperfección inicial en pandeo**: modelo de amplificación elástica δ(P)=δ₀/(1−P/Pcr),
  válido solo para P<Pcr; no se inventa una trayectoria post-pandeo.
- **Pared delgada**: se verifica r/t≥10 antes de aplicar las fórmulas.
- **Selección automática de celda de carga**: el banco elige, de un catálogo de celdas de 50/200/1000 kN,
  la de menor rango que cubre la fuerza máxima esperada para la geometría y el material
  configurados, evitando saturaciones artificiales del instrumento.
- **Todas las lecturas son mediciones virtuales simuladas** — la interfaz lo indica explícitamente;
  no provienen de un equipo físico.

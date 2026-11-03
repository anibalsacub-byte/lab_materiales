# Laboratorio Virtual de Resistencia de Materiales

Laboratorio experimental virtual para cursos de **Resistencia de Materiales** / Mecánica de
Materiales en Ingeniería, creado por **Ricardo Aníbal Sánchez Cuba** (Ingeniero Industrial,
docente universitario) para uso independiente de cualquier institución. No es una calculadora de
fórmulas ni un cuestionario: el estudiante configura un banco de ensayo, lo opera directamente (como un
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
- **Motor mecánico** (`src/engine/mechanics/`): carga axial con modelo constitutivo trilineal —
  elástico, meseta de fluencia (solo en los materiales que realmente la presentan, p. ej. aceros
  al carbono normalizados) y endurecimiento hasta σU, seguido de un ablandamiento idealizado por
  estricción hasta la fractura (`axial.ts`, con inversa esfuerzo→deformación, válida solo en el
  tramo ascendente, para controlar el ensayo por fuerza); pandeo de Euler con las 4 condiciones
  de apoyo ideales y modelo de imperfección inicial (`buckling.ts`); transformación de esfuerzos y
  círculo de Mohr (`mohr.ts`); torsión de ejes circulares, elástica y elastoplástica hasta la rotura (`torsion.ts`);
  flexión de vigas con fórmulas cerradas y, para el ensayo, momento–curvatura y curva
  carga–flecha en 3 y 4 puntos con plasticidad (`bending.ts`); compresión dúctil y frágil
  (`axial.ts`); pandeo con control por desplazamiento (`buckling.ts`); y recipientes a presión
  (`pressureVessel.ts`) — este último, de momento, solo como motor de cálculo validado
  numéricamente; su banco interactivo (Banco 8) llega en una etapa posterior.
- **Analizador de secciones** (`src/engine/sections.ts`): área, centroide, Ix, Iy, Ixy, radios de
  giro y ejes principales para secciones circulares, rectangulares (macizas y tubulares) y
  perfiles I, T y L (por el método de rectángulos compuestos).
- **Cinco bancos con el mismo diseño de laboratorio** (tema oscuro, máquina dibujada en SVG con
  su consola de carga y pico, gráfico en vivo, mandos con íconos y datos adquiridos al lado). En
  todos, el ensayo se controla como en una máquina real: **la variable de control avanza a
  velocidad constante** y la carga es la respuesta de la probeta, con aceleración de tiempo
  ×1/×10/×50, pausa, descarga elástica (la probeta queda montada), desmontaje solo sin carga,
  nuevo montaje, movimiento manual (jog), tara de los instrumentos y detección de la rotura.
  Adquisición automática (1 punto/s o cada 2 % de cambio de carga), «Calcule y compare» sobre
  cualquier punto, resumen del ensayo y exportación a CSV, JSON y PNG del gráfico.
  - **Banco 1 — Tracción**: mordazas de cuña, probeta tipo hueso de perro con estricción y fractura
    copa-cono, extensómetro; curva σ–ε con regiones, σy, σu, Rp0,2 y energía.
  - **Banco 2 — Compresión**: platos con asiento esférico; los dúctiles se abarrilan y la carga
    sigue subiendo (se detiene al 50 % o a la capacidad de la máquina); los frágiles rompen por
    cortante a σUc (fundición gris ≈ 752 MPa, 3,6 veces su resistencia a tracción).
  - **Banco 3 — Flexión**: 3 y 4 puntos con rodillos y deflectómetro; curva carga–flecha con
    plasticidad (primera fluencia Py, rótula plástica, rotura frágil de la fibra traccionada) y
    diagramas V(x) y M(x) a la carga actual.
  - **Banco 5 — Torsión**: máquina de torsión con disco graduado, generatrices que se vuelven
    hélices, celda de par y encoder; curva par–giro elastoplástica, Ty y rotura transversal
    (dúctil) o en hélice a 45° (frágil).
  - **Banco 6 — Pandeo**: columna en la máquina universal con apoyos articulados (cuchilla) o
    empotrados y comparador lateral; imperfección inicial, aproximación a Pcr, bifurcación de la
    columna perfecta y colapso por rótula plástica; método de Southwell.
- **Estación A — Propiedades geométricas** y **Estación B — Círculo de Mohr**: herramientas de
  análisis interactivas con representación gráfica.
- **Exportación**: mediciones a CSV, sesión completa a JSON, informe imprimible (PDF vía
  impresión del navegador).

Pendiente para etapas siguientes: bancos de Cortante, Uniones mecánicas y Recipientes a
presión; un modo guiado/evaluación opcional (predicción previa, rúbrica, semillas por
estudiante) construido sobre este mismo simulador.

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
    useEnsayoMaquina.ts       Motor común de los bancos: estados de la máquina, control por
                               desplazamiento, adquisición, pico, descarga y desmontaje
    useSesionEnsayo.ts        Hook con el estado del ensayo (material, mediciones, cálculos del
                               estudiante); no impone una secuencia de pasos en la interfaz
    exportar.ts                 CSV / JSON / gráfico a PNG

  components/               Piezas de interfaz reutilizables entre bancos y estaciones
    lab/LabUI.tsx              Controles del diseño "laboratorio" (display, stepper, segmentado, pasos, chips)
    lab/PanelesEnsayo.tsx      Paneles comunes de los bancos (mandos, tabla en vivo, exportación, estado)
    svg/                       Piezas SVG reutilizables (MarcoMaquinaSVG, GraficoEnsayo)
  benches/                   Un banco = <Nombre>Bench.tsx + su montaje o máquina en SVG
    traction/
    compression/
    bending/
    torsion/
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
npm test            # 128 pruebas de validación numérica (vitest)
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

- **Modelo constitutivo por material**: elástico-plástico continuo para metales dúctiles (con
  meseta de fluencia y endurecimiento curvo en los aceros que la presentan; Ramberg-Osgood con
  codo redondeado y σY = Rp0,2 en los que fluyen de forma continua; estricción con caída
  parabólica hasta la fractura), frágil (fundición gris, polímeros rígidos, compuestos,
  impresión 3D) o elástico-lineal, según `material.modelo`.
  En los frágiles cuyos datos no caben en una recta (σU < E·εF) la curva es cóncava,
  σ = σU·[1 − (1 − ε/εF)ⁿ] con n = E·εF/σU: pendiente inicial E, rotura en (εF, σU) sin
  superar nunca σU. Nunca se usa la misma curva para todos los materiales.
- **Historia de carga**: la descarga y la recarga siguen una recta de pendiente E desde el punto
  alcanzado (deformación permanente), sin esfuerzos de compresión en las mordazas.
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

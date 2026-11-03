import { useEffect, useMemo, useState } from 'react';
import { FichaMaterial } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { BarraPasos, ChipsMaterial, DisplayDigital, Segmentado, Stepper } from '../../components/lab/LabUI';
import {
  BotonesExportar,
  CasillasGrafico,
  ControlesMovimiento,
  EcuacionesVivo,
  limitesConComparadas,
  useHistorialEnsayos,
  type Ecuacion,
  LineaEstado,
  MandosMaquina,
  ResumenItem,
  TablaDatosVivo,
  fmt,
  textoLectura,
  textosEstadoBase,
  useModoLab,
} from '../../components/lab/PanelesEnsayo';
import { COLORES_PROBETA } from '../../components/lab/coloresProbeta';
import { GraficoEnsayo, type OpcionesGrafico, type PuntoClave, type RegionGrafico } from '../../components/svg/GraficoEnsayo';
import { MarcoMaquinaSVG } from '../../components/svg/MarcoMaquinaSVG';
import { MontajePandeoSVG, acortamientoVisualPandeo, yTravesanoPandeo } from './MontajePandeoSVG';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { useEnsayoMaquina, type ModeloEnsayo } from '../../trial/useEnsayoMaquina';
import { obtenerMaterial } from '../../engine/materials';
import {
  APOYOS,
  cargaCriticaEuler,
  deflexionConImperfeccion,
  desplazamientoParaFlecha,
  esbeltez,
  estadoColumna,
  hitoColumna,
  longitudEfectiva,
  radioGiro,
  verificarAplicabilidadEuler,
  esbeltezTransicionJohnson,
  esfuerzoCriticoEuler,
  esfuerzoCriticoJohnsonEuler,
  type ColumnaEnsayo,
  type CondicionApoyo,
} from '../../engine/mechanics/buckling';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';

type TipoSeccionLocal = 'circular' | 'tubular' | 'rectangular';
type VistaGrafico = 'carga' | 'esbeltez';

const ID_GRAFICO = 'grafico-ensayo-pandeo';
const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: true, energia: false, cuadricula: true, teorica: true, comparar: true };

export function BucklingBench({ onVolver }: { onVolver: () => void }) {
  useModoLab();
  const sesionEnsayo = useSesionEnsayo('banco-6-pandeo', 'sae-1018');
  const { sesion } = sesionEnsayo;

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('circular');
  const [d, setD] = useState(10);
  const [dInt, setDInt] = useState(7);
  const [b, setB] = useState(20);
  const [h, setH] = useState(6);
  const [L, setL] = useState(800);
  const [condicion, setCondicion] = useState<CondicionApoyo>('articulado-articulado');
  const [delta0, setDelta0] = useState(0.5);
  const [velocidad, setVelocidad] = useState(1);
  const [pasoJog, setPasoJog] = useState('0.01');
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);
  const [vista, setVista] = useState<VistaGrafico>('carga');
  const historial = useHistorialEnsayos();

  const material = obtenerMaterial(sesion.materialId)!;
  const ductil = material.modelo === 'elastico_plastico_bilineal';
  const E = material.propiedades.E_MPa ?? 200000;
  const sigmaLimite = ductil ? material.propiedades.sigmaY_MPa : material.propiedades.sigmaU_MPa;

  const seccion = useMemo(() => {
    try {
      if (tipoSeccion === 'circular') return calcularSeccion({ tipo: 'circular_maciza', d });
      if (tipoSeccion === 'tubular') return calcularSeccion({ tipo: 'circular_tubular', d, dInt });
      return calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);
  const A = seccion?.area_mm2 ?? 1;
  const Imin = seccion ? Math.min(seccion.Ix_mm4, seccion.Iy_mm4) : 1;
  // Pandea alrededor del eje de menor inercia: la fibra extrema está a media dimensión menor.
  const espesorPandeo = tipoSeccion === 'rectangular' ? Math.min(b, h) : d;
  const K = APOYOS[condicion].K;
  const Le = longitudEfectiva(L, K);
  const r = radioGiro(Imin, A);
  const lambda = esbeltez(Le, r);
  const Pcr = cargaCriticaEuler(E, Imin, L, K);
  const aplicabilidad = verificarAplicabilidadEuler(E, lambda, material.propiedades.sigmaY_MPa);

  const col: ColumnaEnsayo = useMemo(
    () => ({ E, A, I: Imin, L, K, delta0, c: espesorPandeo / 2, sigmaLimite, ductil }),
    [E, A, Imin, L, K, delta0, espesorPandeo, sigmaLimite, ductil],
  );
  const hito = useMemo(() => hitoColumna(col), [col]);
  const flechaFin = Math.min(L / 20, 20);
  const uFinRecorrido = useMemo(() => desplazamientoParaFlecha(col, flechaFin, hito), [col, flechaFin, hito]);
  const rompe = !ductil && hito !== undefined && hito.u < uFinRecorrido;
  const xFinal = rompe ? hito!.u : uFinRecorrido;
  const fluyo = (uMax: number) => hito !== undefined && ductil && uMax > hito.u;
  const kDescarga = hito ? hito.P / Math.max(hito.u, 1e-9) : (E * A) / L;

  const env = (u: number) => estadoColumna(col, u, hito);
  const respuesta = (u: number, uMax: number) => {
    if (!fluyo(uMax) || u >= uMax) return env(u).P;
    return Math.max(0, env(uMax).P - kDescarga * (uMax - u));
  };
  /** Flecha lateral; tras la fluencia la descarga recupera solo la parte elástica de la flecha. */
  const flechaEn = (u: number, uMax: number, P: number) => {
    if (!fluyo(uMax) || u >= uMax) return env(u).delta;
    return env(uMax).delta - (env(uMax).P - P) * (hito!.delta / hito!.P);
  };
  const Pmax = Math.max(Pcr, hito?.P ?? 0, env(xFinal).P);
  const celda = elegirCeldaCarga(Math.min(Pmax, sigmaLimite !== undefined ? sigmaLimite * A : Pmax));

  // x = desplazamiento del travesaño u (mm), F = carga axial P (N).
  const modelo: ModeloEnsayo = {
    respuesta,
    xFalla: rompe ? hito!.u : undefined,
    xFin: rompe ? undefined : uFinRecorrido,
    xSinCarga: (uMax) => (fluyo(uMax) ? uMax - env(uMax).P / kDescarga : 0),
    velocidad: velocidad / 60,
    escalaF: Pmax,
    escalaX: xFinal,
    leer: (u, P, indicePunto, calibrado, uMax) => {
      const op = { semillaEnsayo: sesion.semilla, indicePunto, calibrado };
      return {
        fuerza: medir(P, celda, op),
        // El comparador se pone a cero con la columna montada: mide la flecha adicional a δ₀.
        flechaLateral: medir(flechaEn(u, uMax, P) - delta0, INSTRUMENTOS.comparadorDigital25mm, op),
        acortamiento: medir(u, INSTRUMENTOS.comparadorDigital25mm, { ...op, indicePunto: indicePunto + 50000 }),
      };
    },
    clavePico: 'fuerza',
    alReiniciar: () => historial.guardar(etiquetaEnsayo, traza),
  };
  const etiquetaEnsayo = `${material.nombreCorto ?? material.nombre} · ${tipoSeccion === 'rectangular' ? `${fmt(b, 0)}×${fmt(h, 0)}` : `Ø${fmt(d, 0)}${tipoSeccion === 'tubular' ? `/${fmt(dInt, 1)}` : ''}`} · L ${fmt(L, 0)} · K ${fmt(K, 2)}`;
  const m = useEnsayoMaquina(sesionEnsayo, modelo);
  const { sim: s, estado, fracturada, retirada, enMaquina, montada } = m;
  const terminado = fracturada || estado === 'finalizada';

  useEffect(() => {
    if (estado === 'desmontada') setVelocidad(Math.min(Math.max(Math.round((xFinal / 1.5) * 100) / 100, 0.05), 20));
  }, [xFinal]);

  function iniciar() {
    if (s.x === 0) sesionEnsayo.actualizarConfiguracion({ seccion: tipoSeccion, d_mm: d, b_mm: b, h_mm: h, L_mm: L, condicion, K, delta0_mm: delta0, Imin_mm4: Imin, Pcr_N: Pcr, velocidad_mm_min: velocidad });
    m.acciones.iniciar();
  }

  // ---------- Vista ----------

  const enN = Pmax < 2000;
  const fP = enN ? 1 : 1000;
  const uP = enN ? 'N' : 'kN';
  const delta = flechaEn(s.x, s.xMax, m.F);
  const Pleida = m.lecturaVivo?.fuerza.valor;
  const flechaLeida = m.lecturaVivo?.flechaLateral.valor;
  const acortLeido = m.lecturaVivo?.acortamiento.valor;
  const displayCarga = enMaquina ? textoLectura(Pleida, enN ? 1 : 3, fP) : '—';
  const displayPico = m.pico === undefined ? '—' : fmt(m.pico / fP, enN ? 1 : 3);

  const kVis = Math.min(18, 60 / flechaFin);
  const colapso = fluyo(s.xMax) ? Math.min((env(s.xMax).delta - hito!.delta) / Math.max(flechaFin - hito!.delta, 1e-6), 1) : 0;
  // Flecha dibujada y acercamiento de los extremos coherente con ella (desde la forma inicial con δ₀):
  // el travesaño baja junto con la columna que se curva.
  const flechaVisual = Math.min(kVis * delta, 70);
  const acortVisual = Math.max(
    acortamientoVisualPandeo(condicion, flechaVisual, colapso) - acortamientoVisualPandeo(condicion, Math.min(kVis * delta0, 70), 0),
    0,
  );

  const regimen = (() => {
    if (!montada) return '—';
    if (retirada) return `Sin carga · flecha permanente ${fmt(delta, 2)} mm`;
    if (fracturada) return 'Rotura frágil de la fibra más comprimida';
    if (fluyo(s.xMax) && s.x < s.xMax - 1e-9) return 'Descarga: se recupera solo la parte elástica de la flecha';
    if (fluyo(s.x)) return hito!.delta < 1e-6 ? 'Aplastamiento: la columna es corta y fluye sin pandear' : 'Colapso plástico: rótula en el punto de máxima flecha, la carga cae';
    if (m.F >= 0.98 * Pcr) return 'Pandeo: la flecha crece a carga casi constante (P ≈ Pcr)';
    return `Compresión con flexión creciente (P/Pcr = ${fmt(m.F / Pcr, 2)})`;
  })();

  const textos = {
    ...textosEstadoBase(m, `travesaño a ${fmt(velocidad, 2)} mm/min`, 'columna'),
    retirada: `Columna retirada${fluyo(s.xMax) ? ` — quedó curvada (flecha permanente ${fmt(delta, 2)} mm)` : ' — recuperó su forma (pandeo elástico)'}. Vuelva a montarla o use «Nueva probeta»`,
    finalizada: `Fin de recorrido (flecha lateral ${fmt(flechaFin, 1)} mm). Descargue para retirar la columna`,
    fracturada: 'Columna rota — la máquina detectó la caída de carga',
  };

  // Gráfico P–δ
  const traza = s.traza.map((p) => ({ x: flechaEn(p.x, p.envolvente ? p.x : s.xMax, p.F), y: p.F / fP }));
  const referencia = useMemo(() => {
    if (delta0 <= 0) return [{ x: 0, y: 0 }, { x: 0, y: Pcr / fP }, { x: flechaFin, y: Pcr / fP }];
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 120; i++) {
      const P = Pcr * (1 - (1 - i / 120) ** 3) * 0.999;
      const dlt = deflexionConImperfeccion(P, Pcr, delta0);
      if (dlt > flechaFin * 1.1) break;
      pts.push({ x: dlt, y: P / fP });
    }
    return pts;
  }, [delta0, Pcr, flechaFin, fP]);
  const regiones: RegionGrafico[] = [];
  const deltaMaxAlcanzada = env(s.xMax).delta;
  if (hito && ductil && hito.delta > delta0) {
    const tramos: RegionGrafico[] = [
      { desde: 0, hasta: hito.delta, nombre: 'Elástica', color: '#4f9dff' },
      { desde: hito.delta, hasta: flechaFin, nombre: 'Colapso plástico', color: '#ff6b6b' },
    ];
    for (const rg of tramos) if (rg.desde < deltaMaxAlcanzada) regiones.push({ ...rg, hasta: Math.min(rg.hasta, deltaMaxAlcanzada) });
  } else if (s.xMax > 0) {
    regiones.push({ desde: 0, hasta: deltaMaxAlcanzada, nombre: 'Elástica', color: '#4f9dff' });
  }
  const puntosClave: PuntoClave[] = [];
  if (hito && ductil && s.xMax >= hito.u && hito.delta > 0) puntosClave.push({ x: hito.delta, y: hito.P / fP, etiqueta: `Fluencia · P = ${fmt(hito.P / fP, enN ? 0 : 2)} ${uP}`, color: '#f0b429' });
  if (fracturada && hito) puntosClave.push({ x: hito.delta, y: hito.P / fP, etiqueta: 'Rotura', color: '#ff5c5c' });
  const xMaxGrafico = flechaFin * 1.08;
  const lineaPcr = { desde: { x: 0, y: Pcr / fP }, hasta: { x: xMaxGrafico * 0.55, y: Pcr / fP }, etiqueta: `Pcr (Euler) = ${fmt(Pcr / fP, enN ? 0 : 2)} ${uP}` };

  const cargas = sesion.mediciones.map((med) => med.lecturas.fuerza?.valor).filter((v): v is number => typeof v === 'number');
  const PmaxMedida = cargas.length ? Math.max(...cargas) : 0;

  const puntoSel = m.seleccion !== null ? s.verdaderos[m.seleccion] : undefined;
  const calc = sesion.calculosEstudiante;
  const hayCalculo = ['Le', 'esbeltez', 'Pcr'].some((v) => calc[v] !== undefined);
  const pasoActual = estado === 'desmontada' ? 2 : terminado ? 4 : 3;
  const lim = limitesConComparadas(xMaxGrafico, (Pmax / fP) * 1.15, historial.comparadas, !!opciones.comparar);

  // Curva de diseño Euler–Johnson (σcr frente a λ) y posición de esta columna.
  const sigmaYCol = ductil ? material.propiedades.sigmaY_MPa : undefined;
  const lambdaT = sigmaYCol !== undefined ? esbeltezTransicionJohnson(E, sigmaYCol) : undefined;
  const lambdaEjeMax = Math.max(250, lambda * 1.25);
  const sigmaEjeMax = (sigmaYCol ?? sigmaLimite ?? esfuerzoCriticoEuler(E, Math.max(lambda, 20))) * 1.15;
  const sigmaCrDiseno = sigmaYCol !== undefined ? esfuerzoCriticoJohnsonEuler(E, sigmaYCol, lambda) : esfuerzoCriticoEuler(E, lambda);
  const curvaDiseno: { x: number; y: number }[] = [];
  const curvaEuler: { x: number; y: number }[] = [];
  for (let i = 1; i <= 200; i++) {
    const l = (lambdaEjeMax * i) / 200;
    const euler = esfuerzoCriticoEuler(E, l);
    if (euler <= sigmaEjeMax) curvaEuler.push({ x: l, y: euler });
    const diseno = sigmaYCol !== undefined ? esfuerzoCriticoJohnsonEuler(E, sigmaYCol, l) : euler;
    if (diseno <= sigmaEjeMax) curvaDiseno.push({ x: l, y: diseno });
  }
  if (sigmaYCol !== undefined) curvaDiseno.unshift({ x: 0, y: sigmaYCol });

  // Ecuaciones en vivo.
  const Pv = typeof Pleida === 'number' ? Pleida : undefined;
  const ecuaciones: Ecuacion[] = [
    { nombre: 'Longitud efectiva', formula: 'Le = K·L', sustitucion: `${fmt(K, 3)} · ${fmt(L, 0)} mm`, resultado: `${fmt(Le, 0)} mm` },
    { nombre: 'Radio de giro', formula: 'r = √(I / A)', sustitucion: `√(${fmt(Imin, 0)} mm⁴ / ${fmt(A, 1)} mm²)`, resultado: `${fmt(r, 2)} mm` },
    {
      nombre: 'Esbeltez',
      formula: 'λ = Le / r',
      sustitucion: `${fmt(Le, 0)} / ${fmt(r, 2)}`,
      resultado: fmt(lambda, 1),
      nota:
        lambdaT !== undefined && sigmaYCol !== undefined
          ? `Euler es teóricamente válido si λ ≥ √(π²E/σY) = ${fmt(Math.sqrt((Math.PI ** 2 * E) / sigmaYCol), 1)} (σcr ≤ σY). En diseño, por imperfecciones y esfuerzos residuales, se usa Johnson hasta λt = √(2π²E/σY) = ${fmt(lambdaT, 1)}: esta columna es ${lambda >= lambdaT ? 'esbelta (Euler)' : 'intermedia (Johnson)'}.`
          : undefined,
    },
    { nombre: 'Carga crítica de Euler', formula: 'Pcr = π²·E·I / Le²', sustitucion: `π²·${fmt(E, 0)}·${fmt(Imin, 0)} / ${fmt(Le, 0)}²`, resultado: `${fmt(Pcr, 0)} N` },
    ...(lambdaT !== undefined && lambda < lambdaT
      ? [{ nombre: 'Johnson (columna intermedia)', formula: 'σcr = σY − (σY·λ/2π)² / E', sustitucion: `${fmt(sigmaYCol!, 0)} − (${fmt(sigmaYCol!, 0)}·${fmt(lambda, 1)}/2π)² / ${fmt(E, 0)}`, resultado: `${fmt(sigmaCrDiseno, 1)} MPa → P = ${fmt(sigmaCrDiseno * A, 0)} N` }]
      : []),
    { nombre: 'Carga relativa', formula: 'P / Pcr', sustitucion: Pv !== undefined ? `${fmt(Pv, 0)} N / ${fmt(Pcr, 0)} N` : undefined, resultado: Pv !== undefined ? fmt(Pv / Pcr, 3) : undefined },
  ];

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 6 — Pandeo de columnas</div>
          <div className="subtitulo">Columna en la máquina universal con control por desplazamiento: imperfección, carga crítica de Euler y colapso, en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material', 'Geometría', 'Montaje', 'Ensayo', 'Resultados']} actual={pasoActual} />

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Máquina universal de ensayos</div>
          <MarcoMaquinaSVG
            ariaLabel="Máquina universal de ensayos con montaje de pandeo"
            yTravesano={yTravesanoPandeo(acortVisual) - (enMaquina ? 0 : 8)}
            colorProbeta={COLORES_PROBETA[material.categoria]}
            displayCarga={displayCarga}
            displayPico={displayPico}
            unidad={uP}
            enMarcha={m.enMovimiento}
            onParadaEmergencia={() => m.enMovimiento && m.acciones.pausar()}
          >
            <MontajePandeoSVG
              condicion={condicion}
              flechaVisual={flechaVisual}
              acortamiento={acortVisual}
              colapso={colapso}
              fracturada={fracturada}
              grosor={Math.min(Math.max(espesorPandeo * 0.9, 5), 16)}
              probetaVisible={!retirada}
              enContacto={enMaquina}
              colorProbeta={COLORES_PROBETA[material.categoria]}
              cotas={[
                `δ = ${fmt(delta, 2)} mm`,
                `L = ${fmt(L, 0)} mm`,
                tipoSeccion === 'circular' ? `Ø ${fmt(d, 1)}` : tipoSeccion === 'tubular' ? `Ø ${fmt(d, 1)} / ${fmt(dInt, 1)}` : `${fmt(b, 1)} × ${fmt(h, 1)}`,
              ]}
            />
          </MarcoMaquinaSVG>
          <LineaEstado
            m={m}
            textos={textos}
            regimen={regimen}
            detalle={<>u = {fmt(s.x, 3)} mm · P/Pcr = {fmt(m.F / Pcr, 3)} · t = {fmt(s.t, 1)} s · escala gráfica de la flecha ×{fmt(kVis, 1)}</>}
          />
          <EcuacionesVivo ecuaciones={ecuaciones} />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Gráficos</div>
          <Segmentado<VistaGrafico>
            opciones={[{ valor: 'carga', etiqueta: 'Carga–flecha lateral' }, { valor: 'esbeltez', etiqueta: 'Euler–Johnson σcr(λ)' }]}
            valor={vista}
            onChange={setVista}
          />
          <div style={{ marginTop: 8 }}>
            {vista === 'carga' ? (
              <GraficoEnsayo
                id={ID_GRAFICO}
                titulo="Carga axial–flecha lateral"
                subtitulo={`${material.nombre} — ${APOYOS[condicion].nombre}, L = ${fmt(L, 0)} mm, δ₀ = ${fmt(delta0, 2)} mm`}
                xEtiqueta="Flecha lateral δ (mm)"
                yEtiqueta={`Carga axial P (${uP})`}
                xMax={lim.xMax}
                yMax={lim.yMax}
                comparadas={historial.comparadas}
                etiquetaActual={etiquetaEnsayo}
                traza={traza}
                referencia={referencia}
                regiones={regiones}
                puntosClave={puntosClave}
                lineaOffset={lineaPcr}
                puntoActual={montada ? { x: delta, y: m.F / fP, fracturado: fracturada } : undefined}
                registrados={s.verdaderos.filter((p) => p.manual).map((p) => ({ x: flechaEn(p.x, p.x, p.F), y: p.F / fP }))}
                opciones={opciones}
              />
            ) : (
              <GraficoEnsayo
                id={ID_GRAFICO}
                titulo="Esfuerzo crítico en función de la esbeltez"
                subtitulo={sigmaYCol !== undefined ? `${material.nombre}: Johnson para λ < λt = ${fmt(lambdaT!, 0)}, Euler para λ ≥ λt` : `${material.nombre}: sin σY, solo Euler`}
                xEtiqueta="Esbeltez λ = K·L/r"
                yEtiqueta="Esfuerzo crítico σcr (MPa)"
                xMax={lambdaEjeMax}
                yMax={sigmaEjeMax}
                traza={curvaDiseno}
                referencia={curvaEuler}
                regiones={
                  lambdaT !== undefined
                    ? [
                        { desde: 0, hasta: lambdaT, nombre: 'Intermedia (Johnson)', color: '#f0b429' },
                        { desde: lambdaT, hasta: lambdaEjeMax, nombre: 'Esbelta (Euler)', color: '#4f9dff' },
                      ]
                    : []
                }
                puntosClave={[
                  { x: lambda, y: sigmaCrDiseno, etiqueta: `Esta columna: λ = ${fmt(lambda, 0)}`, color: '#ff9f43' },
                  ...(terminado ? [{ x: lambda, y: PmaxMedida / A, etiqueta: `Medido: Pmáx/A = ${fmt(PmaxMedida / A, 0)} MPa`, color: '#3ecf8e' }] : []),
                ]}
                opciones={{ ...opciones, energia: false, offset: false, comparar: false }}
                decimalesX={0}
              />
            )}
          </div>
          {vista === 'carga' && (
            <>
              <CasillasGrafico
                opciones={opciones}
                setOpciones={setOpciones}
                claves={['etiquetas', 'puntos', 'regiones', 'offset', 'cuadricula', 'teorica', ...(historial.comparadas.length ? (['comparar'] as const) : [])]}
                nombres={{ offset: 'Carga crítica Pcr', teorica: 'Teoría δ₀/(1 − P/Pcr)' }}
              />
              {historial.comparadas.length > 0 && <button className="boton-texto" onClick={historial.limpiar}>Borrar ensayos comparados ({historial.comparadas.length})</button>}
            </>
          )}
          <DisplayDigital
            items={[
              { etiqueta: 'Carga', valor: displayCarga, unidad: uP, alerta: displayCarga === 'OVL' },
              { etiqueta: 'Flecha lateral', valor: enMaquina ? textoLectura(flechaLeida, 3) : '—', unidad: 'mm (desde δ₀)' },
              { etiqueta: 'Acortamiento', valor: enMaquina ? textoLectura(acortLeido, 3) : '—', unidad: 'mm' },
              { etiqueta: 'P / Pcr', valor: typeof Pleida === 'number' ? fmt(Pleida / Pcr, 3) : '—', unidad: '' },
            ]}
          />
          <MandosMaquina m={{ ...m, acciones: { ...m.acciones, iniciar } }} nombre="columna" puedeMontar={!!seccion} />
          <TablaDatosVivo
            m={m}
            columnas={[
              { titulo: `Carga (${uP})`, valor: (med) => textoLectura(med.lecturas.fuerza?.valor, enN ? 1 : 3, fP) },
              { titulo: 'Flecha lateral (mm)', valor: (med) => textoLectura(med.lecturas.flechaLateral?.valor, 3) },
              { titulo: 'Acortamiento (mm)', valor: (med) => textoLectura(med.lecturas.acortamiento?.valor, 3) },
            ]}
          />
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Configuración del ensayo</div>
          <ControlesMovimiento
            m={m}
            velocidad={velocidad}
            setVelocidad={setVelocidad}
            unidadVelocidad="mm/min"
            unidadJog="mm"
            velocidadMin={0.05}
            velocidadMax={20}
            pasoVelocidad={0.05}
            pasosJog={['0.001', '0.01', '0.1', '1']}
            pasoJog={pasoJog}
            setPasoJog={setPasoJog}
            jogAX={(mm) => mm}
          >
            <Segmentado
              etiqueta="Sección"
              opciones={[{ valor: 'circular', etiqueta: 'Circular' }, { valor: 'tubular', etiqueta: 'Tubo' }, { valor: 'rectangular', etiqueta: 'Rectangular' }]}
              valor={tipoSeccion}
              onChange={setTipoSeccion}
              disabled={montada}
            />
            {tipoSeccion !== 'rectangular' ? (
              <>
                <Stepper etiqueta={tipoSeccion === 'tubular' ? 'Diámetro exterior D (mm)' : 'Diámetro d (mm)'} valor={d} onChange={setD} min={4} max={30} paso={1} decimales={0} disabled={montada} />
                {tipoSeccion === 'tubular' && <Stepper etiqueta="Diámetro interior (mm)" valor={dInt} onChange={setDInt} min={1} max={d - 1} paso={0.5} disabled={montada} />}
              </>
            ) : (
              <>
                <Stepper etiqueta="Ancho b (mm)" valor={b} onChange={setB} min={4} max={60} paso={1} decimales={0} disabled={montada} />
                <Stepper etiqueta="Espesor h (mm)" valor={h} onChange={setH} min={2} max={30} paso={1} decimales={0} disabled={montada} />
              </>
            )}
            <Stepper etiqueta="Longitud L (mm)" valor={L} onChange={setL} min={150} max={1500} paso={50} decimales={0} disabled={montada} />
            <Stepper etiqueta="Imperfección δ₀ (mm)" valor={delta0} onChange={setDelta0} min={0} max={3} paso={0.1} decimales={2} disabled={montada} />
          </ControlesMovimiento>
          <div className="campo">
            <label>Condición de apoyo</label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value as CondicionApoyo)} disabled={montada}>
              {Object.entries(APOYOS).map(([clave, info]) => (
                <option key={clave} value={clave}>{info.nombre} (K = {info.K})</option>
              ))}
            </select>
            <p className="nota">{APOYOS[condicion].procedencia}</p>
          </div>
          <p className="nota">
            A = {fmt(A, 1)} mm² · I mín = {fmt(Imin, 0)} mm⁴ · Le = {fmt(Le, 0)} mm · r = {fmt(r, 2)} mm · λ = Le/r = {fmt(lambda, 1)} · Pcr = {fmt(Pcr / fP, enN ? 0 : 3)} {uP} · {celda.nombre}.
          </p>
          <p className={aplicabilidad.aplicable ? 'nota' : 'advertencia'}>{aplicabilidad.mensaje}</p>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la columna</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={(id) => m.acciones.nuevaProbeta(id)} disabled={montada} soloIsotropicos />
          {montada && <p className="nota">Para cambiar material o geometría, desmonte la columna o use «Nueva probeta».</p>}
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <BotonesExportar m={m} idGrafico={ID_GRAFICO} nombrePng={`pandeo-${sesion.materialId}.png`} />
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          <p className="nota">
            Calcule Le = K·L, r = √(I/A), λ = Le/r y Pcr = π²·E·I/Le². Con los datos también puede estimar Pcr sin conocer E
            (método de Southwell): al graficar δ/P frente a δ, la pendiente es 1/Pcr.
            {puntoSel && ` Punto seleccionado: P = ${fmt(puntoSel.F, 1)} N, δ = ${fmt(flechaEn(puntoSel.x, puntoSel.x, puntoSel.F), 3)} mm.`}
          </p>
          <div className="fila campo">
            <div><label>Le calculada (mm)</label><input type="number" value={calc.Le ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('Le', Number(e.target.value))} /></div>
            <div><label>λ calculada</label><input type="number" value={calc.esbeltez ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('esbeltez', Number(e.target.value))} /></div>
            <div><label>Pcr calculada (N)</label><input type="number" value={calc.Pcr ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('Pcr', Number(e.target.value))} /></div>
          </div>
          {hayCalculo && (
            <TablaValidacion>
              <FilaValidacion etiqueta="Le (longitud efectiva)" valorEstudiante={calc.Le} valorReferencia={Le} unidad="mm" />
              <FilaValidacion etiqueta="λ (esbeltez)" valorEstudiante={calc.esbeltez} valorReferencia={lambda} unidad="" />
              <FilaValidacion etiqueta="Pcr (carga crítica de Euler)" valorEstudiante={calc.Pcr} valorReferencia={Pcr} unidad="N" />
            </TablaValidacion>
          )}
        </section>

        <section className="lab-panel">
          {terminado && (
            <>
              <div className="lab-panel-titulo">Resumen del ensayo</div>
              <div className="resumen-ensayo">
                <ResumenItem etiqueta="Carga máxima medida" valor={`${fmt(PmaxMedida / fP, enN ? 1 : 3)} ${uP}`} />
                <ResumenItem etiqueta="Carga crítica de Euler Pcr" valor={`${fmt(Pcr / fP, enN ? 1 : 3)} ${uP}`} />
                <ResumenItem etiqueta="Pmáx / Pcr" valor={fmt(PmaxMedida / Pcr, 3)} />
                <ResumenItem etiqueta="Flecha lateral máxima" valor={`${fmt(deltaMaxAlcanzada, 2)} mm`} />
                <ResumenItem etiqueta="Esbeltez λ" valor={fmt(lambda, 1)} />
                <ResumenItem etiqueta="Falla" valor={fracturada ? 'Rotura frágil' : fluyo(s.xMax) ? 'Colapso plástico' : 'Pandeo elástico (recuperable)'} />
              </div>
              <p className="nota">
                Una columna real nunca es perfecta: la imperfección hace que la flecha crezca desde el principio y que la carga
                máxima quede algo por debajo de Pcr. Cuanto más esbelta, más se acerca a Pcr antes de fluir.
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => sesionEnsayo.registrarConclusiones(e.target.value)}
            placeholder="Efecto de la imperfección y de la condición de apoyo, esbeltez frente a esbeltez crítica, método de Southwell…"
          />
        </section>
      </div>
    </div>
  );
}

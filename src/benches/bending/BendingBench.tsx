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
import { GraficoEnsayo, type OpcionesGrafico, type PuntoClave, type PuntoXY, type RegionGrafico } from '../../components/svg/GraficoEnsayo';
import { MarcoMaquinaSVG } from '../../components/svg/MarcoMaquinaSVG';
import { MontajeFlexionSVG, altoVisualViga, yTravesanoFlexion } from './MontajeFlexionSVG';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { useEnsayoMaquina, type ModeloEnsayo } from '../../trial/useEnsayoMaquina';
import { obtenerMaterial } from '../../engine/materials';
import {
  cargaEnFlecha,
  distribucionEsfuerzoFlexion,
  curvaCargaFlecha,
  inerciaSeccionFlexion,
  momentoCentral,
  semialturaSeccion,
  type ConfiguracionFlexion,
  type SeccionFlexion,
} from '../../engine/mechanics/bending';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';

type TipoSeccionLocal = 'rectangular' | 'circular';
type VistaGrafico = 'carga' | 'momento' | 'cortante' | 'seccion';

const ID_GRAFICO = 'grafico-ensayo-flexion';
const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: false, energia: false, cuadricula: true, teorica: true, comparar: true };

export function BendingBench({ onVolver }: { onVolver: () => void }) {
  useModoLab();
  const sesionEnsayo = useSesionEnsayo('banco-3-flexion', 'astm-a36');
  const { sesion } = sesionEnsayo;

  const [config, setConfig] = useState<ConfiguracionFlexion>('tres-puntos');
  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('rectangular');
  const [b, setB] = useState(20);
  const [h, setH] = useState(10);
  const [d, setD] = useState(12);
  const [L, setL] = useState(200);
  const [velocidad, setVelocidad] = useState(13);
  const [pasoJog, setPasoJog] = useState('0.01');
  const [vista, setVista] = useState<VistaGrafico>('carga');
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);
  const historial = useHistorialEnsayos();

  const material = obtenerMaterial(sesion.materialId)!;
  const ductil = material.modelo === 'elastico_plastico_bilineal';
  const E = material.propiedades.E_MPa ?? 200000;
  const seccion = useMemo<SeccionFlexion>(() => (tipoSeccion === 'rectangular' ? { tipo: 'rectangular', b, h } : { tipo: 'circular', d }), [tipoSeccion, b, h, d]);
  const I = inerciaSeccionFlexion(seccion);
  const c = semialturaSeccion(seccion);
  const alto = tipoSeccion === 'rectangular' ? h : d;

  const curva = useMemo(() => curvaCargaFlecha(material, seccion, L, config), [material, seccion, L, config]);
  // Más allá de ~L/10 la teoría de pequeñas deflexiones deja de valer y la viga desliza sobre los apoyos.
  const flechaRecorrido = L / 10;
  const rompe = curva.deltaRotura < flechaRecorrido;
  const xFinal = rompe ? curva.deltaRotura : flechaRecorrido;
  const Penv = (delta: number) => cargaEnFlecha(curva, delta);
  const Pmax = Penv(xFinal);
  const celda = elegirCeldaCarga(Pmax);
  const k = curva.rigidez;
  const respuesta = (delta: number, deltaMax: number) => (delta >= deltaMax ? Penv(delta) : Math.max(0, Penv(deltaMax) - k * (deltaMax - delta)));

  // x = flecha en el centro δ (mm), F = carga total P (N).
  const modelo: ModeloEnsayo = {
    respuesta,
    xFalla: rompe ? curva.deltaRotura : undefined,
    xFin: rompe ? undefined : flechaRecorrido,
    xSinCarga: (deltaMax) => deltaMax - Penv(deltaMax) / k,
    velocidad: velocidad / 60,
    escalaF: Pmax,
    escalaX: xFinal,
    leer: (delta, P, indicePunto, calibrado) => {
      const op = { semillaEnsayo: sesion.semilla, indicePunto, calibrado };
      return {
        fuerza: medir(P, celda, op),
        flecha: medir(delta, INSTRUMENTOS.comparadorDigital25mm, op),
      };
    },
    clavePico: 'fuerza',
    alReiniciar: () => historial.guardar(etiquetaEnsayo, traza),
  };
  const etiquetaEnsayo = `${material.nombreCorto ?? material.nombre} · ${config === 'tres-puntos' ? '3P' : '4P'} · ${tipoSeccion === 'rectangular' ? `${fmt(b, 0)}×${fmt(h, 0)}` : `Ø${fmt(d, 0)}`} · L ${fmt(L, 0)}`;
  const m = useEnsayoMaquina(sesionEnsayo, modelo);
  const { sim: s, estado, fracturada, retirada, enMaquina, montada } = m;
  const terminado = fracturada || estado === 'finalizada';

  // Velocidad sugerida para que el ensayo dure ~1,5 min (una viga frágil rompe con muy poca flecha).
  useEffect(() => {
    if (estado === 'desmontada') setVelocidad(Math.min(Math.max(Math.round((xFinal / 1.5) * 10) / 10, 0.1), 50));
  }, [xFinal]);

  function cambiarMaterial(id: string) {
    m.acciones.nuevaProbeta(id);
  }

  function iniciar() {
    if (s.x === 0) sesionEnsayo.actualizarConfiguracion({ config, seccion, L_mm: L, I_mm4: I, velocidad_mm_min: velocidad, celdaCarga: celda.nombre });
    m.acciones.iniciar();
  }

  // ---------- Vista ----------

  const enN = Pmax < 2000;
  const fP = enN ? 1 : 1000;
  const uP = enN ? 'N' : 'kN';
  const Pleida = m.lecturaVivo?.fuerza.valor;
  const flechaLeida = m.lecturaVivo?.flecha.valor;
  const displayCarga = enMaquina ? textoLectura(Pleida, enN ? 1 : 3, fP) : '—';
  const displayFlecha = enMaquina ? textoLectura(flechaLeida, 3) : '—';
  const displayPico = m.pico === undefined ? '—' : fmt(m.pico / fP, enN ? 1 : 3);
  const Mleido = typeof Pleida === 'number' ? momentoCentral(Pleida, L, config) : undefined;

  const plastificacion = curva.deltaFluencia !== undefined && s.xMax > curva.deltaFluencia ? Math.min((s.xMax - curva.deltaFluencia) / (8 * curva.deltaFluencia), 1) : 0;
  const kVis = Math.min(25, (0.12 * 300) / xFinal);
  const altoViga = altoVisualViga(alto, L);

  const regimen = (() => {
    if (!montada) return '—';
    if (retirada) return `Sin carga · flecha permanente ${fmt(s.x, 3)} mm`;
    if (fracturada) return 'Rotura de la fibra traccionada (cara inferior, en el centro)';
    if (s.x < s.xMax - 1e-9) return 'Descarga / recarga elástica';
    if (curva.deltaFluencia === undefined) return 'Sin fluencia — comportamiento frágil';
    if (s.x <= curva.deltaFluencia) return 'Elástico';
    return 'Elastoplástico: la fluencia avanza de las fibras extremas al eje neutro';
  })();

  const textos = {
    ...textosEstadoBase(m, `travesaño a ${fmt(velocidad, 1)} mm/min`, 'viga'),
    retirada: `Viga retirada — quedó con una flecha permanente de ${fmt(s.x, 3)} mm. Vuelva a montarla o use «Nueva probeta»`,
    finalizada: `Fin de recorrido (flecha L/10 = ${fmt(flechaRecorrido, 1)} mm): la viga dúctil se dobló sin romper. Descargue para retirarla`,
    fracturada: 'Viga rota — la máquina detectó la caída de carga',
  };

  // Gráficos
  const Pact = m.F;
  const diagrama = (tipo: 'momento' | 'cortante'): PuntoXY[] => {
    const pts: PuntoXY[] = [];
    const xs = config === 'tres-puntos' ? [0, L / 2, L / 2, L] : [0, L / 3, L / 3, (2 * L) / 3, (2 * L) / 3, L];
    if (tipo === 'momento') {
      const Mc = momentoCentral(Pact, L, config) / 1000;
      return config === 'tres-puntos' ? [{ x: 0, y: 0 }, { x: L / 2, y: Mc }, { x: L, y: 0 }] : [{ x: 0, y: 0 }, { x: L / 3, y: Mc }, { x: (2 * L) / 3, y: Mc }, { x: L, y: 0 }];
    }
    const V = Pact / 2 / fP;
    const valores = config === 'tres-puntos' ? [V, V, -V, -V] : [V, V, 0, 0, -V, -V];
    xs.forEach((x, i) => pts.push({ x, y: valores[i] }));
    return pts;
  };
  const MmaxGrafico = Math.max(momentoCentral(Pmax, L, config) / 1000, 1e-6) * 1.15;
  const VmaxGrafico = Math.max(Pmax / 2 / fP, 1e-6) * 1.2;

  const traza = s.traza.map((p) => ({ x: p.x, y: p.F / fP }));
  const referencia = [{ x: 0, y: 0 }, { x: Math.min((Pmax * 1.15) / k, xFinal * 1.08), y: Math.min(Pmax * 1.15, k * xFinal * 1.08) / fP }];
  const regiones: RegionGrafico[] = [];
  if (curva.deltaFluencia !== undefined) {
    const tramos: RegionGrafico[] = [
      { desde: 0, hasta: curva.deltaFluencia, nombre: 'Elástica', color: '#4f9dff' },
      { desde: curva.deltaFluencia, hasta: xFinal, nombre: 'Elastoplástica', color: '#3ecf8e' },
    ];
    for (const r of tramos) if (r.desde < s.xMax) regiones.push({ ...r, hasta: Math.min(r.hasta, s.xMax) });
  } else if (s.xMax > 0) {
    regiones.push({ desde: 0, hasta: s.xMax, nombre: 'Sin fluencia (frágil)', color: '#4f9dff' });
  }
  const puntosClave: PuntoClave[] = [];
  if (curva.PFluencia !== undefined && curva.deltaFluencia !== undefined && s.xMax >= curva.deltaFluencia)
    puntosClave.push({ x: curva.deltaFluencia, y: curva.PFluencia / fP, etiqueta: `Py = ${fmt(curva.PFluencia / fP, enN ? 0 : 2)} ${uP}`, color: '#f0b429' });
  if (fracturada) puntosClave.push({ x: curva.deltaRotura, y: curva.PRotura / fP, etiqueta: 'Rotura', color: '#ff5c5c' });
  if (estado === 'finalizada') puntosClave.push({ x: s.x, y: m.F / fP, etiqueta: 'Fin del ensayo', color: '#a9bdd1' });

  let energia = 0;
  for (let i = 1; i < s.traza.length; i++) energia += ((s.traza[i].F + s.traza[i - 1].F) / 2) * (s.traza[i].x - s.traza[i - 1].x);

  const cargas = sesion.mediciones.map((med) => med.lecturas.fuerza?.valor).filter((v): v is number => typeof v === 'number');
  const PmaxMedida = cargas.length ? Math.max(...cargas) : 0;

  const puntoSel = m.seleccion !== null ? s.verdaderos[m.seleccion] : undefined;
  const medSel = m.seleccion !== null ? sesion.mediciones[m.seleccion] : undefined;
  const elasticoSel = puntoSel !== undefined && puntoSel.F > 0 && Math.abs(puntoSel.F - k * puntoSel.x) <= 0.03 * puntoSel.F;
  const calc = sesion.calculosEstudiante;
  const hayCalculo = ['Mmax', 'sigmaMax', 'E'].some((v) => calc[v] !== undefined);
  const pasoActual = estado === 'desmontada' ? 2 : terminado ? 4 : 3;
  const formulaE = config === 'tres-puntos' ? 'E = P·L³/(48·I·δ)' : 'E = 23·P·L³/(1296·I·δ)';
  const formulaM = config === 'tres-puntos' ? 'M = P·L/4' : 'M = P·L/6';
  const lim = limitesConComparadas(xFinal * 1.08, (Pmax / fP) * 1.15, historial.comparadas, !!opciones.comparar);

  // Ecuaciones en vivo, con la carga y la flecha que leen ahora los instrumentos.
  const Pv = typeof Pleida === 'number' ? Pleida : undefined;
  const dV = typeof flechaLeida === 'number' ? flechaLeida : undefined;
  const Mv = Pv !== undefined ? momentoCentral(Pv, L, config) : undefined;
  const elasticoAhora = enMaquina && m.F > 0 && Math.abs(m.F - k * s.x) <= 0.03 * m.F;
  const fluye = curva.PFluencia !== undefined && s.xMax > (curva.deltaFluencia ?? Infinity);
  const ecuaciones: Ecuacion[] = [
    tipoSeccion === 'rectangular'
      ? { nombre: 'Momento de inercia', formula: 'I = b·h³/12', sustitucion: `${fmt(b, 1)}·(${fmt(h, 1)})³/12`, resultado: `${fmt(I, 1)} mm⁴` }
      : { nombre: 'Momento de inercia', formula: 'I = π·d⁴/64', sustitucion: `π·(${fmt(d, 1)})⁴/64`, resultado: `${fmt(I, 1)} mm⁴` },
    { nombre: 'Reacciones en los apoyos', formula: 'R = P/2', sustitucion: Pv !== undefined ? `${fmt(Pv, 1)} N / 2` : undefined, resultado: Pv !== undefined ? `${fmt(Pv / 2, 1)} N` : undefined },
    {
      nombre: 'Momento máximo (centro)',
      formula: formulaM,
      sustitucion: Pv !== undefined ? `${fmt(Pv, 1)} N · ${fmt(L, 0)} mm / ${config === 'tres-puntos' ? 4 : 6}` : undefined,
      resultado: Mv !== undefined ? `${fmt(Mv / 1000, 3)} N·m` : undefined,
    },
    {
      nombre: 'Esfuerzo en la fibra extrema',
      formula: 'σ = M·c / I',
      sustitucion: Mv !== undefined ? `${fmt(Mv, 0)} N·mm · ${fmt(c, 2)} mm / ${fmt(I, 1)} mm⁴` : undefined,
      resultado: Mv !== undefined ? `${fmt((Mv * c) / I, 1)} MPa` : undefined,
      inactiva: fluye,
      nota: fluye ? 'La sección ya fluyó: la fórmula elástica sobrestima σ en la fibra (vea la pestaña «Esfuerzos σ(y)»).' : undefined,
    },
    {
      nombre: 'Módulo de Young por flexión',
      formula: formulaE,
      sustitucion: elasticoAhora && Pv !== undefined && dV ? (config === 'tres-puntos' ? `${fmt(Pv, 1)}·${fmt(L, 0)}³/(48·${fmt(I, 1)}·${fmt(dV, 3)})` : `23·${fmt(Pv, 1)}·${fmt(L, 0)}³/(1296·${fmt(I, 1)}·${fmt(dV, 3)})`) : undefined,
      resultado: elasticoAhora && Pv !== undefined && dV ? `${fmt(((config === 'tres-puntos' ? 1 / 48 : 23 / 1296) * Pv * L ** 3) / (I * dV) / 1000, 1)} GPa` : undefined,
      inactiva: !elasticoAhora,
      nota: elasticoAhora ? undefined : 'Solo en la zona elástica (recta inicial de la curva carga–flecha).',
    },
  ];

  // Distribución σ(y) en la sección central (con esfuerzos residuales si se descargó).
  const Mactual = momentoCentral(m.F, L, config);
  const MmaxHistoria = momentoCentral(Penv(s.xMax), L, config);
  const distribucion = vista === 'seccion' && montada ? distribucionEsfuerzoFlexion(material, seccion, Mactual, MmaxHistoria) : [];
  const sigmaEscala = Math.max(material.propiedades.sigmaU_MPa ?? 0, ...distribucion.map((p) => Math.abs(p.sigma)), (Mactual * c) / I) * 1.12 || 1;

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 3 — Ensayo de flexión</div>
          <div className="subtitulo">Flexión en 3 o 4 puntos en la máquina universal, con control por desplazamiento, curva carga–flecha y diagramas V(x) y M(x).</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material', 'Geometría', 'Montaje', 'Ensayo', 'Resultados']} actual={pasoActual} />

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Máquina universal de ensayos</div>
          <MarcoMaquinaSVG
            ariaLabel="Máquina universal de ensayos con utillaje de flexión"
            yTravesano={yTravesanoFlexion(altoViga, Math.min(kVis * s.x, 60), config, enMaquina)}
            colorProbeta={COLORES_PROBETA[material.categoria]}
            displayCarga={displayCarga}
            displayPico={displayPico}
            unidad={uP}
            enMarcha={m.enMovimiento}
            onParadaEmergencia={() => m.enMovimiento && m.acciones.pausar()}
          >
            <MontajeFlexionSVG
              config={config}
              altoViga={altoViga}
              flechaVisual={Math.min(kVis * s.x, 60)}
              plastificacion={plastificacion}
              fracturada={fracturada}
              probetaVisible={!retirada}
              enContacto={enMaquina}
              circular={tipoSeccion === 'circular'}
              cotas={[`δ = ${fmt(s.x, 3)} mm`, `L = ${fmt(L, 0)} mm`, tipoSeccion === 'rectangular' ? `${fmt(b, 1)} × ${fmt(h, 1)}` : `Ø ${fmt(d, 1)}`]}
            />
          </MarcoMaquinaSVG>
          <LineaEstado
            m={m}
            textos={textos}
            regimen={regimen}
            detalle={<>Reacciones R = P/2 = {fmt(m.F / 2 / fP, enN ? 1 : 3)} {uP} · t = {fmt(s.t, 1)} s{kVis > 1.05 ? ` · escala gráfica de la flecha ×${fmt(kVis, 1)}` : ''}</>}
          />
          <EcuacionesVivo ecuaciones={ecuaciones} />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Gráficos</div>
          <Segmentado<VistaGrafico>
            opciones={[
              { valor: 'carga', etiqueta: 'Carga–flecha' },
              { valor: 'momento', etiqueta: 'Momento M(x)' },
              { valor: 'cortante', etiqueta: 'Cortante V(x)' },
              { valor: 'seccion', etiqueta: 'Esfuerzos σ(y)' },
            ]}
            valor={vista}
            onChange={setVista}
          />
          <div style={{ marginTop: 8 }}>
            {vista === 'carga' && (
              <GraficoEnsayo
                id={ID_GRAFICO}
                titulo="Curva carga–flecha"
                subtitulo={`${material.nombre} — flexión en ${config === 'tres-puntos' ? '3' : '4'} puntos, L = ${fmt(L, 0)} mm`}
                xEtiqueta="Flecha en el centro δ (mm)"
                yEtiqueta={`Carga P (${uP})`}
                xMax={lim.xMax}
                yMax={lim.yMax}
                comparadas={historial.comparadas}
                etiquetaActual={etiquetaEnsayo}
                traza={traza}
                referencia={referencia}
                regiones={regiones}
                puntosClave={puntosClave}
                energia={energia / 1000}
                unidadEnergia="J"
                puntoActual={montada ? { x: s.x, y: m.F / fP, fracturado: fracturada } : undefined}
                registrados={s.verdaderos.filter((p) => p.manual).map((p) => ({ x: p.x, y: p.F / fP }))}
                opciones={opciones}
              />
            )}
            {vista === 'momento' && (
              <GraficoEnsayo
                id={ID_GRAFICO}
                titulo="Diagrama de momento flector M(x)"
                subtitulo={`Carga actual P = ${fmt(Pact / fP, enN ? 1 : 3)} ${uP} · ${formulaM}`}
                xEtiqueta="Posición x desde el apoyo izquierdo (mm)"
                yEtiqueta="Momento M (N·m)"
                xMax={L}
                yMax={MmaxGrafico}
                traza={diagrama('momento')}
                puntosClave={Pact > 0 ? [{ x: L / 2, y: momentoCentral(Pact, L, config) / 1000, etiqueta: `Mmáx = ${fmt(momentoCentral(Pact, L, config) / 1000, 2)} N·m`, color: '#f0b429' }] : []}
                opciones={{ ...opciones, regiones: false, energia: false, teorica: false }}
                decimalesX={0}
              />
            )}
            {vista === 'cortante' && (
              <GraficoEnsayo
                id={ID_GRAFICO}
                titulo="Diagrama de fuerza cortante V(x)"
                subtitulo={`Carga actual P = ${fmt(Pact / fP, enN ? 1 : 3)} ${uP} · V = ±P/2`}
                xEtiqueta="Posición x desde el apoyo izquierdo (mm)"
                yEtiqueta={`Cortante V (${uP})`}
                xMax={L}
                yMax={VmaxGrafico}
                yMin={-VmaxGrafico}
                traza={diagrama('cortante')}
                opciones={{ ...opciones, regiones: false, energia: false, teorica: false, puntos: false }}
                decimalesX={0}
              />
            )}
            {vista === 'seccion' && (
              <GraficoEnsayo
                id={ID_GRAFICO}
                titulo="Distribución de esfuerzos en la sección central"
                subtitulo={
                  m.F <= 0 && s.xMax > 0
                    ? 'Sin carga: los esfuerzos que quedan son residuales (se anulan en conjunto)'
                    : `M = ${fmt(Mactual / 1000, 2)} N·m · línea discontinua: teoría elástica σ = M·y/I`
                }
                xEtiqueta="Esfuerzo normal σ (MPa) · tracción +"
                yEtiqueta="Altura y desde el eje neutro (mm)"
                xMin={-sigmaEscala}
                xMax={sigmaEscala}
                yMin={-c * 1.1}
                yMax={c * 1.1}
                traza={distribucion.map((p) => ({ x: p.sigma, y: p.y }))}
                referencia={[{ x: (Mactual * c) / I, y: -c }, { x: (-Mactual * c) / I, y: c }]}
                opciones={{ ...opciones, regiones: false, energia: false, puntos: false, comparar: false }}
              />
            )}
          </div>
          {vista === 'carga' && (
            <>
              <CasillasGrafico
                opciones={opciones}
                setOpciones={setOpciones}
                claves={['etiquetas', 'puntos', 'regiones', 'energia', 'cuadricula', 'teorica', ...(historial.comparadas.length ? (['comparar'] as const) : [])]}
                nombres={{ teorica: 'Recta elástica' }}
              />
              {historial.comparadas.length > 0 && <button className="boton-texto" onClick={historial.limpiar}>Borrar ensayos comparados ({historial.comparadas.length})</button>}
            </>
          )}
          <DisplayDigital
            items={[
              { etiqueta: 'Carga', valor: displayCarga, unidad: uP, alerta: displayCarga === 'OVL' },
              { etiqueta: 'Flecha', valor: displayFlecha, unidad: 'mm', alerta: displayFlecha === 'OVL' },
              { etiqueta: 'Mmáx', valor: Mleido !== undefined ? fmt(Mleido / 1000, 2) : '—', unidad: 'N·m' },
              { etiqueta: 'σ = M·c/I', valor: Mleido !== undefined ? fmt((Mleido * c) / I, 1) : '—', unidad: 'MPa (elástica)' },
            ]}
          />
          <MandosMaquina m={{ ...m, acciones: { ...m.acciones, iniciar } }} nombre="viga" />
          <TablaDatosVivo
            m={m}
            columnas={[
              { titulo: `Carga (${uP})`, valor: (med) => textoLectura(med.lecturas.fuerza?.valor, enN ? 1 : 3, fP) },
              { titulo: 'Flecha (mm)', valor: (med) => textoLectura(med.lecturas.flecha?.valor, 3) },
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
            velocidadMin={0.1}
            velocidadMax={50}
            pasosJog={['0.001', '0.01', '0.1', '1']}
            pasoJog={pasoJog}
            setPasoJog={setPasoJog}
            jogAX={(mm) => mm}
          >
            <Segmentado
              etiqueta="Ensayo"
              opciones={[{ valor: 'tres-puntos', etiqueta: '3 puntos' }, { valor: 'cuatro-puntos', etiqueta: '4 puntos' }]}
              valor={config}
              onChange={setConfig}
              disabled={montada}
            />
            <Segmentado
              etiqueta="Sección"
              opciones={[{ valor: 'rectangular', etiqueta: 'Rectangular' }, { valor: 'circular', etiqueta: 'Circular' }]}
              valor={tipoSeccion}
              onChange={setTipoSeccion}
              disabled={montada}
            />
            {tipoSeccion === 'rectangular' ? (
              <>
                <Stepper etiqueta="Ancho b (mm)" valor={b} onChange={setB} min={5} max={50} paso={1} decimales={0} disabled={montada} />
                <Stepper etiqueta="Altura h (mm)" valor={h} onChange={setH} min={3} max={30} paso={1} decimales={0} disabled={montada} />
              </>
            ) : (
              <Stepper etiqueta="Diámetro d (mm)" valor={d} onChange={setD} min={4} max={30} paso={1} decimales={0} disabled={montada} />
            )}
            <Stepper etiqueta="Claro entre apoyos L (mm)" valor={L} onChange={setL} min={60} max={600} paso={10} decimales={0} disabled={montada} />
          </ControlesMovimiento>
          <p className="nota">
            I = {fmt(I, 1)} mm⁴ · c = {fmt(c, 1)} mm · L/h = {fmt(L / alto, 1)} · {celda.nombre} · deflectómetro (±25 mm) · probetas usadas: {m.probetasUsadas}.
          </p>
          {L / alto < 8 && <p className="advertencia">Viga corta (L/h &lt; 8): la deformación por cortante deja de ser despreciable y la flecha real será mayor que la de la teoría de Euler–Bernoulli.</p>}
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la viga</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={cambiarMaterial} disabled={montada} soloIsotropicos />
          {montada && <p className="nota">Para cambiar material o geometría, desmonte la viga o use «Nueva probeta».</p>}
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <BotonesExportar m={m} idGrafico={ID_GRAFICO} nombrePng={`flexion-${vista}-${sesion.materialId}.png`} />
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          {!puntoSel || !medSel ? (
            <p className="nota">Seleccione una fila de la tabla. Calcule {formulaM} y σ = M·c/I; en un punto elástico también {formulaE}.</p>
          ) : (
            <>
              <p className="nota">
                Punto {m.seleccion! + 1}: P = {textoLectura(medSel.lecturas.fuerza?.valor, 1)} N · δ = {textoLectura(medSel.lecturas.flecha?.valor, 3)} mm · L = {fmt(L, 0)} mm · I = {fmt(I, 1)} mm⁴ · c = {fmt(c, 1)} mm
                {elasticoSel ? ' · punto en zona elástica' : ' · fuera de la zona elástica: σ = M·c/I y E no aplican (la sección ya fluye)'}
              </p>
              <div className="fila campo">
                <div><label>Mmáx calculado (N·mm)</label><input type="number" value={calc.Mmax ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('Mmax', Number(e.target.value))} /></div>
                {elasticoSel && <div><label>σmáx calculado (MPa)</label><input type="number" value={calc.sigmaMax ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('sigmaMax', Number(e.target.value))} /></div>}
              </div>
              {elasticoSel && (
                <div className="fila campo">
                  <div><label>E calculado (MPa)</label><input type="number" value={calc.E ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('E', Number(e.target.value))} /></div>
                </div>
              )}
              {hayCalculo && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="Mmáx (momento en el centro)" valorEstudiante={calc.Mmax} valorReferencia={momentoCentral(puntoSel.F, L, config)} unidad="N·mm" />
                  {elasticoSel && <FilaValidacion etiqueta="σmáx (fibra extrema)" valorEstudiante={calc.sigmaMax} valorReferencia={(momentoCentral(puntoSel.F, L, config) * c) / I} unidad="MPa" />}
                  {elasticoSel && <FilaValidacion etiqueta="E (módulo de Young)" valorEstudiante={calc.E} valorReferencia={E} unidad="MPa" />}
                </TablaValidacion>
              )}
            </>
          )}
        </section>

        <section className="lab-panel">
          {terminado && (
            <>
              <div className="lab-panel-titulo">Resumen del ensayo</div>
              <div className="resumen-ensayo">
                <ResumenItem etiqueta="Carga máxima medida" valor={`${fmt(PmaxMedida / fP, enN ? 1 : 3)} ${uP}`} />
                <ResumenItem etiqueta="Carga de primera fluencia Py" valor={curva.PFluencia !== undefined ? `${fmt(curva.PFluencia / fP, enN ? 1 : 3)} ${uP}` : 'No aplica (frágil)'} />
                <ResumenItem
                  etiqueta={fracturada ? 'Módulo de rotura σ = Mmáx·c/I' : 'σ aparente al final = Mmáx·c/I'}
                  valor={`${fmt((momentoCentral(PmaxMedida, L, config) * c) / I, 1)} MPa`}
                />
                <ResumenItem etiqueta="Flecha máxima" valor={`${fmt(s.xMax, 2)} mm`} />
                <ResumenItem etiqueta="Rigidez elástica P/δ" valor={`${fmt(k, 1)} N/mm`} />
                <ResumenItem etiqueta="Energía absorbida ∫P·dδ" valor={`${fmt(energia / 1000, 2)} J`} />
              </div>
              <p className="nota">
                {ductil
                  ? 'La sección plastificada resiste más de lo que predice M·c/I con σY: en una sección rectangular el momento plástico es 1,5 veces el de primera fluencia (factor de forma).'
                  : 'En un material frágil el módulo de rotura en flexión suele ser mayor que su resistencia a tracción: solo la fibra extrema llega a σU.'}
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => sesionEnsayo.registrarConclusiones(e.target.value)}
            placeholder="3 frente a 4 puntos (zona de momento constante), factor de forma, E medido por flexión, flecha permanente…"
          />
        </section>
      </div>
    </div>
  );
}

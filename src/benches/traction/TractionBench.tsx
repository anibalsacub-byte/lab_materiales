import { useMemo, useState } from 'react';
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
import { MontajeTraccionSVG, yTravesanoTraccion } from './MontajeTraccionSVG';
import { ecuacionesAxiales } from '../ecuacionesAxiales';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { useEnsayoMaquina, type ModeloEnsayo } from '../../trial/useEnsayoMaquina';
import { obtenerMaterial } from '../../engine/materials';
import {
  esfuerzoConHistoria,
  esfuerzoEnDeformacion,
  generarCurvaEsfuerzoDeformacion,
  limiteElasticoOffset,
  parametrosCurvaBilineal,
  trabajoDeformacion,
} from '../../engine/mechanics/axial';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';
import type { Material } from '../../engine/types';

type TipoSeccionLocal = 'circular' | 'rectangular';

const ID_GRAFICO = 'grafico-ensayo-traccion';
const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: false, energia: false, cuadricula: true, teorica: false, comparar: true };

function deformacionFractura(m: Material): number {
  const { epsilonF, sigmaU_MPa, E_MPa } = m.propiedades;
  if (epsilonF !== undefined) return epsilonF;
  if (sigmaU_MPa !== undefined && E_MPa) return sigmaU_MPa / E_MPa;
  return 0.02;
}

/** Velocidad de travesaño sugerida para que el ensayo dure ~1,5 min a tiempo real (orden de ASTM E8). */
function velocidadSugerida(m: Material, L: number): number {
  const v = (deformacionFractura(m) * L) / 1.5;
  return Math.min(Math.max(Math.round(v * 10) / 10, 0.1), 50);
}

/**
 * Deformación transversal: ν en la parte elástica, 0,5 en la plástica (el volumen se conserva al
 * fluir el metal). Es la razón por la que ν solo se mide en la zona elástica.
 */
function deformacionTransversalReal(m: Material, eps: number, sigma: number): number {
  const E = m.propiedades.E_MPa ?? 1;
  const nu = m.propiedades.nu ?? 0.3;
  const elastica = sigma / E;
  const plastica = Math.max(eps - elastica, 0);
  return -(nu * elastica + 0.5 * plastica);
}

export function TractionBench({ onVolver }: { onVolver: () => void }) {
  useModoLab();
  const sesionEnsayo = useSesionEnsayo('banco-1-traccion', 'astm-a36');
  const { sesion } = sesionEnsayo;

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('circular');
  const [d, setD] = useState(12.5);
  const [b, setB] = useState(12.5);
  const [h, setH] = useState(6);
  const [L, setL] = useState(50);
  const [velocidad, setVelocidad] = useState(() => velocidadSugerida(obtenerMaterial('astm-a36')!, 50));
  const [pasoJog, setPasoJog] = useState('0.01');
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);
  const historial = useHistorialEnsayos();

  const material = obtenerMaterial(sesion.materialId)!;
  const pc = useMemo(() => parametrosCurvaBilineal(material), [material]);
  const rp02 = useMemo(() => limiteElasticoOffset(material), [material]);
  const ductil = material.modelo === 'elastico_plastico_bilineal' && pc !== undefined;
  const E = material.propiedades.E_MPa ?? 200000;
  const epsF = deformacionFractura(material);
  const sigmaU = material.propiedades.sigmaU_MPa ?? E * epsF;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);
  const A = seccion?.area_mm2 ?? 1;
  const celda = elegirCeldaCarga(sigmaU * A);
  const sigmaDe = (eps: number, epsMax: number) => esfuerzoConHistoria(material, eps, epsMax) ?? 0;

  // Física del ensayo: x = ε (control por el desplazamiento del travesaño), F = σ (MPa).
  const modelo: ModeloEnsayo = {
    respuesta: sigmaDe,
    xFalla: epsF,
    xSinCarga: (epsMax) => epsMax - sigmaDe(epsMax, epsMax) / E,
    velocidad: velocidad / 60 / L,
    escalaF: sigmaU,
    escalaX: epsF,
    leer: (eps, sigma, indicePunto, calibrado) => {
      const op = { semillaEnsayo: sesion.semilla, indicePunto, calibrado };
      return {
        fuerza: medir(sigma * A, celda, op),
        alargamiento: medir(eps * L, INSTRUMENTOS.extensometroAxial50, op),
        deformacionTransversal: medir(deformacionTransversalReal(material, eps, sigma), INSTRUMENTOS.extensometroTransversal, op),
      };
    },
    clavePico: 'fuerza',
    alReiniciar: () => historial.guardar(etiquetaEnsayo, traza),
  };
  const etiquetaEnsayo = `${material.nombreCorto ?? material.nombre} · ${tipoSeccion === 'circular' ? `Ø${fmt(d, 1)}` : `${fmt(b, 1)}×${fmt(h, 1)}`} · Lo ${fmt(L, 0)}`;
  const m = useEnsayoMaquina(sesionEnsayo, modelo);
  const { sim: s, estado, fracturada, retirada, enMaquina, montada } = m;
  const sigmaActual = m.F;

  function iniciar() {
    if (s.x === 0) sesionEnsayo.actualizarConfiguracion({ seccion: tipoSeccion, d_mm: d, b_mm: b, h_mm: h, L0_mm: L, A0_mm2: A, velocidad_mm_min: velocidad, celdaCarga: celda.nombre });
    m.acciones.iniciar();
  }

  function cambiarMaterial(id: string) {
    m.acciones.nuevaProbeta(id);
    setVelocidad(velocidadSugerida(obtenerMaterial(id)!, L));
  }

  // ---------- Vista ----------

  const Fleida = m.lecturaVivo?.fuerza.valor;
  const extLeida = m.lecturaVivo?.alargamiento.valor;
  const displayCarga = enMaquina ? textoLectura(Fleida, 2, 1000) : '—';
  const displayExt = enMaquina ? textoLectura(extLeida, 3) : '—';
  const displayPico = m.pico === undefined ? '—' : fmt(m.pico / 1000, 2);

  const k = Math.min(25, 0.6 / epsF);
  // Reducción de área: el cuello dibujado se estrecha hasta el área final del material (si hay dato).
  const Z = ductil ? material.propiedades.reduccionArea_pct : undefined;
  const profundidadCuello = Z !== undefined && pc ? 1 - Math.sqrt((1 - Z / 100) * (1 + pc.epsUTS)) : 0.4;
  const estriccion = ductil && pc ? Math.min(Math.max((s.xMax - pc.epsUTS) / (pc.epsF - pc.epsUTS), 0), 1) : 0;

  const regimen = (() => {
    if (!montada) return '—';
    if (retirada) return `Sin carga · deformación permanente εp = ${fmt(s.x, 4)}`;
    if (fracturada) return ductil ? 'Fractura dúctil (copa y cono)' : 'Fractura frágil';
    if (s.x < s.xMax - 1e-9) return 'Descarga / recarga elástica';
    if (!ductil || !pc) return 'Sin fluencia — comportamiento frágil';
    if (s.x <= pc.epsY) return 'Elástico';
    if (s.x <= pc.epsPlateauFin) return 'Fluencia (meseta)';
    if (s.x <= pc.epsUTS) return 'Endurecimiento por deformación';
    return 'Estricción';
  })();

  const textos = {
    ...textosEstadoBase(m, `travesaño a ${fmt(velocidad, 1)} mm/min`),
    retirada: `Probeta retirada — quedó ${fmt(s.x * L, 3)} mm más larga. Vuelva a montarla para recargarla o use «Nueva probeta»`,
    fracturada: 'Probeta fracturada — la máquina detectó la caída de carga',
  };

  // Gráfico
  const ondular = (eps: number, sigma: number, envolvente: boolean) => {
    // Ondulación cosmética de la meseta (bandas de Lüders): solo visual, el motor no la usa.
    if (!envolvente || !pc || !material.mesetaFluencia || eps < pc.epsY || eps > pc.epsPlateauFin) return sigma;
    const t = (eps - pc.epsY) / (pc.epsPlateauFin - pc.epsY || 1);
    return sigma + Math.sin(t * Math.PI * 6) * pc.sigmaY * 0.012;
  };
  const traza = s.traza.map((p) => ({ x: p.x, y: ondular(p.x, p.F, p.envolvente) }));
  const referencia = useMemo(() => generarCurvaEsfuerzoDeformacion(material, 300, epsF).map((p) => ({ x: p.epsilon, y: p.sigma_MPa })), [material, epsF]);

  const regiones: RegionGrafico[] = [];
  if (pc && ductil) {
    const tramos: RegionGrafico[] = [
      { desde: 0, hasta: pc.epsY, nombre: 'Elástica', color: '#4f9dff' },
      ...(pc.epsPlateauFin > pc.epsY ? [{ desde: pc.epsY, hasta: pc.epsPlateauFin, nombre: 'Fluencia', color: '#f0b429' }] : []),
      { desde: pc.epsPlateauFin, hasta: pc.epsUTS, nombre: 'Endurecimiento', color: '#3ecf8e' },
      { desde: pc.epsUTS, hasta: pc.epsF, nombre: 'Estricción', color: '#ff6b6b' },
    ];
    for (const r of tramos) if (r.desde < s.xMax) regiones.push({ ...r, hasta: Math.min(r.hasta, s.xMax) });
  } else if (s.xMax > 0) {
    regiones.push({ desde: 0, hasta: s.xMax, nombre: 'Sin fluencia (frágil)', color: '#4f9dff' });
  }

  const sigmaRotura = esfuerzoEnDeformacion(material, epsF) ?? 0;
  const puntosClave: PuntoClave[] = [];
  if (pc && ductil && material.mesetaFluencia && s.xMax >= pc.epsY) puntosClave.push({ x: pc.epsY, y: pc.sigmaY, etiqueta: `σy = ${fmt(pc.sigmaY, 0)} MPa`, color: '#f0b429' });
  if (pc && ductil && s.xMax >= pc.epsUTS) puntosClave.push({ x: pc.epsUTS, y: pc.sigmaU, etiqueta: `σu = ${fmt(pc.sigmaU, 0)} MPa`, color: '#3ecf8e' });
  if (fracturada) puntosClave.push({ x: epsF, y: sigmaRotura, etiqueta: ductil ? 'Fractura' : `Fractura · σu = ${fmt(sigmaRotura, 0)} MPa`, color: '#ff5c5c' });
  const lineaOffset = rp02 && s.xMax >= rp02.epsilon
    ? { desde: { x: 0.002, y: 0 }, hasta: { x: rp02.epsilon, y: rp02.sigma_MPa }, etiqueta: `Rp0,2 = ${fmt(rp02.sigma_MPa, 0)} MPa` }
    : undefined;
  const energia = trabajoDeformacion(s.traza.map((p) => ({ epsilon: p.x, sigma_MPa: p.F })));
  const registrados = s.verdaderos.filter((p) => p.manual).map((p) => ({ x: p.x, y: p.F }));
  const yMax = Math.max(sigmaU, pc?.sigmaY ?? 0) * 1.12;
  const lim = limitesConComparadas(epsF * 1.08, yMax, historial.comparadas, !!opciones.comparar);

  // Resumen tras la fractura
  const fuerzas = sesion.mediciones.map((med) => med.lecturas.fuerza?.valor).filter((v): v is number => typeof v === 'number');
  const FmaxMedida = fuerzas.length ? Math.max(...fuerzas) : 0;
  const alargamientoRotura = Math.max(epsF - sigmaRotura / E, 0) * 100;

  // Calcule y compare
  const puntoSel = m.seleccion !== null ? s.verdaderos[m.seleccion] : undefined;
  const medSel = m.seleccion !== null ? sesion.mediciones[m.seleccion] : undefined;
  // E y ν solo se pueden obtener de un punto sobre el tramo inicial σ ≈ E·ε (sin deformación permanente).
  // La tolerancia del 5 % admite el tramo bajo de los frágiles (fundición gris: hasta ~25 % de σu,
  // donde la norma toma su módulo secante).
  const elasticoSel = puntoSel !== undefined && puntoSel.F > 0 && Math.abs(puntoSel.F - E * puntoSel.x) <= 0.05 * puntoSel.F && (!pc || puntoSel.x <= pc.epsY * 0.98);
  const calc = sesion.calculosEstudiante;
  const hayCalculo = ['sigma', 'epsilon', 'E', 'nu'].some((v) => calc[v] !== undefined);
  const pasoActual = estado === 'desmontada' ? 2 : fracturada ? 4 : 3;

  // Ecuaciones en vivo, con las lecturas actuales de los instrumentos.
  const ecuaciones = ecuacionesAxiales({
    circular: tipoSeccion === 'circular',
    d,
    b,
    h,
    A,
    L,
    F: typeof Fleida === 'number' ? Fleida : undefined,
    dL: typeof extLeida === 'number' ? extLeida : undefined,
    epsTrans: m.lecturaVivo?.deformacionTransversal.valor,
    elastico: enMaquina && m.F > 0 && Math.abs(m.F - E * s.x) <= 0.05 * m.F && (!pc || s.x <= pc.epsY * 0.98),
  });

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 1 — Ensayo de tracción</div>
          <div className="subtitulo">Máquina universal de ensayos con control por desplazamiento, adquisición automática de datos y curva σ–ε en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material', 'Geometría', 'Montaje', 'Ensayo', 'Resultados']} actual={pasoActual} />

      {/* Fila 1: máquina y columna de operación */}
      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Máquina universal de ensayos</div>
          <MarcoMaquinaSVG
            ariaLabel="Máquina universal de ensayos con montaje de tracción"
            yTravesano={yTravesanoTraccion(Math.min(k * s.x, 0.6))}
            colorProbeta={COLORES_PROBETA[material.categoria]}
            displayCarga={displayCarga}
            displayPico={displayPico}
            unidad="kN"
            enMarcha={m.enMovimiento}
            onParadaEmergencia={() => m.enMovimiento && m.acciones.pausar()}
          >
            <MontajeTraccionSVG
              alargamientoVisual={Math.min(k * s.x, 0.6)}
              alargamientoUniformeVisual={Math.min(k * Math.min(s.x, pc?.epsUTS ?? s.x), 0.6)}
              estriccion={estriccion}
              profundidadCuello={profundidadCuello}
              fracturada={fracturada}
              tipoFractura={ductil ? 'ductil' : 'fragil'}
              mordazasCerradas={enMaquina}
              probetaVisible={!retirada}
              seccion={tipoSeccion}
              cotas={[`L = ${fmt(L * (1 + s.x), 2)} mm`, `Lo = ${fmt(L, 1)} mm`, tipoSeccion === 'circular' ? `Ø ${fmt(d, 1)}` : `${fmt(b, 1)} × ${fmt(h, 1)}`]}
            />
          </MarcoMaquinaSVG>
          <LineaEstado
            m={m}
            textos={textos}
            regimen={regimen}
            detalle={<>Lo {fmt(L, 1)} → {fmt(L * (1 + s.x), 2)} mm (+{fmt(s.x * 100, 2)} %) · t = {fmt(s.t, 1)} s · escala gráfica del alargamiento ×{fmt(k, 1)}</>}
          />
          <EcuacionesVivo ecuaciones={ecuaciones} />
        </section>

        {/* Columna de operación: curva, lecturas, mandos de la máquina y datos en vivo (la tabla ocupa el alto restante) */}
        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Curva esfuerzo–deformación</div>
          <GraficoEnsayo
            id={ID_GRAFICO}
            titulo="Curva esfuerzo–deformación (ingenieril)"
            subtitulo={`${material.nombre}${material.condicion ? ` (${material.condicion})` : ''} — tracción`}
            xEtiqueta="Deformación unitaria ε (mm/mm)"
            yEtiqueta="Esfuerzo σ (MPa)"
            xMax={lim.xMax}
            yMax={lim.yMax}
            comparadas={historial.comparadas}
            etiquetaActual={etiquetaEnsayo}
            traza={traza}
            referencia={referencia}
            regiones={regiones}
            puntosClave={puntosClave}
            lineaOffset={lineaOffset}
            energia={energia}
            puntoActual={montada ? { x: s.x, y: ondular(s.x, sigmaActual, s.x >= s.xMax), fracturado: fracturada } : undefined}
            registrados={registrados}
            opciones={opciones}
          />
          <CasillasGrafico opciones={opciones} setOpciones={setOpciones} claves={['etiquetas', 'puntos', 'regiones', 'offset', 'energia', 'cuadricula', 'teorica', ...(historial.comparadas.length ? (['comparar'] as const) : [])]} />
          {historial.comparadas.length > 0 && <button className="boton-texto" onClick={historial.limpiar}>Borrar ensayos comparados ({historial.comparadas.length})</button>}
          <DisplayDigital
            items={[
              { etiqueta: 'Carga', valor: displayCarga, unidad: 'kN', alerta: displayCarga === 'OVL' },
              { etiqueta: 'Extensión', valor: displayExt, unidad: 'mm', alerta: displayExt === 'OVL' },
              { etiqueta: 'Esfuerzo', valor: typeof Fleida === 'number' ? fmt(Fleida / A, 1) : '—', unidad: 'MPa' },
              { etiqueta: 'Deformación', valor: typeof extLeida === 'number' ? fmt(extLeida / L, 4) : '—', unidad: 'mm/mm' },
            ]}
          />
          <MandosMaquina m={{ ...m, acciones: { ...m.acciones, iniciar } }} puedeMontar={!!seccion} />
          <TablaDatosVivo
            m={m}
            columnas={[
              { titulo: 'Carga (kN)', valor: (med) => textoLectura(med.lecturas.fuerza?.valor, 3, 1000) },
              { titulo: 'Extensión (mm)', valor: (med) => textoLectura(med.lecturas.alargamiento?.valor, 3) },
              { titulo: 'ε transversal', valor: (med) => textoLectura(med.lecturas.deformacionTransversal?.valor, 5) },
            ]}
          />
        </section>
      </div>

      {/* Fila 2: configuración y material */}
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
            jogAX={(mm) => mm / L}
          >
            <Segmentado
              etiqueta="Sección"
              opciones={[{ valor: 'circular', etiqueta: 'Circular' }, { valor: 'rectangular', etiqueta: 'Rectangular' }]}
              valor={tipoSeccion}
              onChange={setTipoSeccion}
              disabled={montada}
            />
            {tipoSeccion === 'circular' ? (
              <Stepper etiqueta="Diámetro d (mm)" valor={d} onChange={setD} min={4} max={20} paso={0.5} disabled={montada} />
            ) : (
              <>
                <Stepper etiqueta="Ancho b (mm)" valor={b} onChange={setB} min={4} max={30} paso={0.5} disabled={montada} />
                <Stepper etiqueta="Espesor h (mm)" valor={h} onChange={setH} min={1} max={20} paso={0.5} disabled={montada} />
              </>
            )}
            <Stepper etiqueta="Longitud calibrada Lo (mm)" valor={L} onChange={setL} min={20} max={100} paso={5} decimales={0} disabled={montada} />
          </ControlesMovimiento>
          <p className="nota">
            A₀ = {fmt(A, 2)} mm² · {celda.nombre} · extensómetro axial (resolución 0,001 mm) · probetas usadas: {m.probetasUsadas}.
            La máquina controla el desplazamiento del travesaño: la carga es la respuesta de la probeta.
          </p>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la probeta</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={cambiarMaterial} disabled={montada} soloIsotropicos />
          {montada && <p className="nota">Para cambiar material o geometría, desmonte la probeta o use «Nueva probeta».</p>}
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <BotonesExportar m={m} idGrafico={ID_GRAFICO} nombrePng={`curva-traccion-${sesion.materialId}.png`} />
        </section>
      </div>

      {/* Fila 3: análisis */}
      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          {!puntoSel || !medSel ? (
            <p className="nota">Seleccione una fila de la tabla. Con la carga y la extensión medidas, calcule σ = F/A₀ y ε = ΔL/Lo; en un punto de la zona elástica también E = σ/ε y ν = −ε_trans/ε.</p>
          ) : (
            <>
              <p className="nota">
                Punto {m.seleccion! + 1}: F = {textoLectura(medSel.lecturas.fuerza?.valor, 0)} N · ΔL = {textoLectura(medSel.lecturas.alargamiento?.valor, 3)} mm ·
                ε_trans = {textoLectura(medSel.lecturas.deformacionTransversal?.valor, 5)} · A₀ = {fmt(A, 2)} mm² · Lo = {fmt(L, 1)} mm
                {elasticoSel ? ' · punto en zona elástica' : ' · fuera de la zona elástica: E y ν no aplican'}
              </p>
              <div className="fila campo">
                <div>
                  <label>σ calculado (MPa)</label>
                  <input type="number" value={calc.sigma ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('sigma', Number(e.target.value))} />
                </div>
                <div>
                  <label>ε calculado</label>
                  <input type="number" value={calc.epsilon ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('epsilon', Number(e.target.value))} />
                </div>
              </div>
              {elasticoSel && (
                <div className="fila campo">
                  <div>
                    <label>E calculado (MPa)</label>
                    <input type="number" value={calc.E ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('E', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>ν calculado</label>
                    <input type="number" value={calc.nu ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('nu', Number(e.target.value))} />
                  </div>
                </div>
              )}
              {hayCalculo && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="σ (esfuerzo)" valorEstudiante={calc.sigma} valorReferencia={puntoSel.F} unidad="MPa" />
                  <FilaValidacion etiqueta="ε (deformación unitaria)" valorEstudiante={calc.epsilon} valorReferencia={puntoSel.x} unidad="" />
                  {elasticoSel && material.propiedades.E_MPa !== undefined && (
                    <FilaValidacion etiqueta="E (módulo de Young)" valorEstudiante={calc.E} valorReferencia={material.propiedades.E_MPa} unidad="MPa" />
                  )}
                  {elasticoSel && material.propiedades.nu !== undefined && (
                    <FilaValidacion etiqueta="ν (Poisson)" valorEstudiante={calc.nu} valorReferencia={material.propiedades.nu} unidad="" />
                  )}
                </TablaValidacion>
              )}
            </>
          )}
        </section>

        <section className="lab-panel">
          {fracturada && (
            <>
              <div className="lab-panel-titulo">Resumen del ensayo</div>
              <div className="resumen-ensayo">
                <ResumenItem etiqueta="Carga máxima medida" valor={`${fmt(FmaxMedida / 1000, 2)} kN`} />
                <ResumenItem etiqueta="Resistencia a la tracción σu = Fmáx/A₀" valor={`${fmt(FmaxMedida / A, 1)} MPa`} />
                <ResumenItem etiqueta="Límite elástico convencional Rp0,2" valor={rp02 ? `${fmt(rp02.sigma_MPa, 0)} MPa` : 'No aplica (frágil)'} />
                <ResumenItem etiqueta="Alargamiento a la rotura A" valor={`${fmt(alargamientoRotura, 1)} %`} />
                <ResumenItem etiqueta="Deformación total en la rotura" valor={`${fmt(epsF * 100, 1)} %`} />
                <ResumenItem etiqueta="Reducción de área Z = (A₀ − Au)/A₀" valor={Z !== undefined ? `${fmt(Z, 1)} % · ${tipoSeccion === 'circular' ? `du = ${fmt(d * Math.sqrt(1 - Z / 100), 2)} mm` : `Au = ${fmt(A * (1 - Z / 100), 1)} mm²`}` : ductil ? 'Sin dato en la biblioteca' : '≈ 0 % (frágil)'} />
                <ResumenItem etiqueta="Energía absorbida (tenacidad)" valor={`${fmt(energia, 2)} MJ/m³`} />
              </div>
              <p className="nota">
                A = (Lu − Lo)/Lo: alargamiento permanente medido juntando los trozos rotos (se recupera la parte elástica).
                La energía es el área bajo la curva recorrida.
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => sesionEnsayo.registrarConclusiones(e.target.value)}
            placeholder="Comportamiento dúctil o frágil, límite de fluencia, resistencia última, alargamiento, tipo de fractura…"
          />
        </section>
      </div>
    </div>
  );
}

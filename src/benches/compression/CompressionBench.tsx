import { useMemo, useState } from 'react';
import { FichaMaterial } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { BarraPasos, ChipsMaterial, DisplayDigital, Segmentado, Stepper } from '../../components/lab/LabUI';
import {
  BotonesExportar,
  CasillasGrafico,
  ControlesMovimiento,
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
import { MontajeCompresionSVG, geometriaVisualCompresion, yTravesanoCompresion } from './MontajeCompresionSVG';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { useEnsayoMaquina, type ModeloEnsayo } from '../../trial/useEnsayoMaquina';
import { obtenerMaterial } from '../../engine/materials';
import { deformacionRoturaCompresion, esfuerzoCompresion, limiteElasticoOffset, parametrosCurvaBilineal, trabajoDeformacion } from '../../engine/mechanics/axial';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';
import type { Material } from '../../engine/types';

type TipoSeccionLocal = 'circular' | 'rectangular';

const ID_GRAFICO = 'grafico-ensayo-compresion';
const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: false, energia: false, cuadricula: true, teorica: false };
/** Acortamiento al que se detiene el ensayo de un material dúctil (no rompe: se aplasta). */
const ACORTAMIENTO_FIN = 0.5;
/** Capacidad de la máquina (la celda mayor, con margen). */
const CAPACIDAD_N = 950000;

/** Fin del ensayo: rotura (frágil) o aplastamiento al 50 % / capacidad de la máquina (dúctil). */
function finDelEnsayo(material: Material, A: number): { xFalla?: number; xFin?: number; porCapacidad: boolean } {
  const epsRotura = deformacionRoturaCompresion(material);
  if (epsRotura !== undefined) return { xFalla: epsRotura, porCapacidad: false };
  const F = (eps: number) => (esfuerzoCompresion(material, eps) ?? 0) * A;
  if (F(ACORTAMIENTO_FIN) <= CAPACIDAD_N) return { xFin: ACORTAMIENTO_FIN, porCapacidad: false };
  let lo = 0;
  let hi = ACORTAMIENTO_FIN;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (F(mid) < CAPACIDAD_N) lo = mid;
    else hi = mid;
  }
  return { xFin: lo, porCapacidad: true };
}

export function CompressionBench({ onVolver }: { onVolver: () => void }) {
  useModoLab();
  const sesionEnsayo = useSesionEnsayo('banco-2-compresion', 'astm-a36');
  const { sesion } = sesionEnsayo;

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('circular');
  const [d, setD] = useState(20);
  const [b, setB] = useState(20);
  const [h, setH] = useState(20);
  const [L, setL] = useState(40);
  const [velocidad, setVelocidad] = useState(13);
  const [pasoJog, setPasoJog] = useState('0.01');
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);

  const material = obtenerMaterial(sesion.materialId)!;
  const pc = useMemo(() => parametrosCurvaBilineal(material), [material]);
  const rp02 = useMemo(() => limiteElasticoOffset(material), [material]);
  const ductil = material.modelo === 'elastico_plastico_bilineal' && pc !== undefined;
  const E = material.propiedades.E_MPa ?? 200000;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);
  const A = seccion?.area_mm2 ?? 1;
  const anchoMenor = tipoSeccion === 'circular' ? d : Math.min(b, h);
  const esbeltez = L / (seccion ? Math.min(seccion.rx_mm, seccion.ry_mm) : 1);
  const fin = useMemo(() => finDelEnsayo(material, A), [material, A]);
  const xFinal = fin.xFalla ?? fin.xFin ?? ACORTAMIENTO_FIN;
  const sigmaC = (eps: number) => esfuerzoCompresion(material, eps) ?? 0;
  const sigmaMaxEnsayo = sigmaC(xFinal * 0.9999);
  const celda = elegirCeldaCarga(sigmaMaxEnsayo * A);
  const respuesta = (eps: number, epsMax: number) => (eps >= epsMax ? sigmaC(eps) : Math.max(0, sigmaC(epsMax) - E * (epsMax - eps)));

  // x = acortamiento unitario ε, F = σ de compresión (MPa), ambos positivos.
  const modelo: ModeloEnsayo = {
    respuesta,
    xFalla: fin.xFalla,
    xFin: fin.xFin,
    xSinCarga: (epsMax) => epsMax - sigmaC(epsMax) / E,
    velocidad: velocidad / 60 / L,
    escalaF: sigmaMaxEnsayo,
    escalaX: xFinal,
    leer: (eps, sigma, indicePunto, calibrado) => {
      const op = { semillaEnsayo: sesion.semilla, indicePunto, calibrado };
      const nu = material.propiedades.nu ?? 0.3;
      const elastica = sigma / E;
      return {
        fuerza: medir(sigma * A, celda, op),
        acortamiento: medir(eps * L, INSTRUMENTOS.comparadorDigital25mm, op),
        // La probeta se ensancha: ν en la parte elástica, 0,5 en la plástica (volumen constante).
        deformacionTransversal: medir(nu * elastica + 0.5 * Math.max(eps - elastica, 0), INSTRUMENTOS.extensometroTransversal, op),
      };
    },
    clavePico: 'fuerza',
  };
  const m = useEnsayoMaquina(sesionEnsayo, modelo);
  const { sim: s, estado, fracturada, retirada, enMaquina, montada } = m;
  const terminado = fracturada || estado === 'finalizada';

  function velocidadSugerida(mat: Material, Lmm: number) {
    const f = finDelEnsayo(mat, A);
    const v = ((f.xFalla ?? f.xFin ?? ACORTAMIENTO_FIN) * Lmm) / 1.5;
    return Math.min(Math.max(Math.round(v * 10) / 10, 0.1), 50);
  }

  function cambiarMaterial(id: string) {
    m.acciones.nuevaProbeta(id);
    setVelocidad(velocidadSugerida(obtenerMaterial(id)!, L));
  }

  function iniciar() {
    if (s.x === 0) sesionEnsayo.actualizarConfiguracion({ seccion: tipoSeccion, d_mm: d, b_mm: b, h_mm: h, L0_mm: L, A0_mm2: A, velocidad_mm_min: velocidad, celdaCarga: celda.nombre });
    m.acciones.iniciar();
  }

  // ---------- Vista ----------

  const Fleida = m.lecturaVivo?.fuerza.valor;
  const acortLeido = m.lecturaVivo?.acortamiento.valor;
  const displayCarga = enMaquina ? textoLectura(Fleida, 2, 1000) : '—';
  const displayAcort = enMaquina ? textoLectura(acortLeido, 3) : '—';
  const displayPico = m.pico === undefined ? '—' : fmt(m.pico / 1000, 2);

  // Escala gráfica: los frágiles rompen con muy poco acortamiento; se amplifica para que se vea.
  const k = Math.min(25, 0.45 / xFinal);
  const geo = geometriaVisualCompresion(L, anchoMenor);
  const acortVisual = Math.min(k * s.x, 0.5);

  const regimen = (() => {
    if (!montada) return '—';
    if (retirada) return `Sin carga · acortamiento permanente εp = ${fmt(s.x, 4)}`;
    if (fracturada) return 'Rotura frágil por cortante (plano inclinado)';
    if (s.x < s.xMax - 1e-9) return 'Descarga / recarga elástica';
    if (!ductil || !pc) return 'Sin fluencia — comportamiento frágil';
    if (s.x <= pc.epsY) return 'Elástico';
    if (s.x <= pc.epsPlateauFin) return 'Fluencia (meseta)';
    return 'Endurecimiento · la sección crece (abarrilamiento)';
  })();

  const textos = {
    ...textosEstadoBase(m, `travesaño a ${fmt(velocidad, 1)} mm/min`),
    retirada: `Probeta retirada — quedó ${fmt(s.x * L, 3)} mm más corta. Vuelva a montarla para recargarla o use «Nueva probeta»`,
    finalizada: fin.porCapacidad
      ? 'Ensayo detenido: se alcanzó la capacidad de la máquina. El material dúctil no rompe en compresión'
      : 'Ensayo detenido al 50 % de acortamiento: el material dúctil se aplasta sin romper',
    fracturada: 'Probeta rota por cortante — la máquina detectó la caída de carga',
  };

  const traza = s.traza.map((p) => ({ x: p.x, y: p.F }));
  const referencia = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 300; i++) {
      const eps = (xFinal * i) / 300;
      const sig = esfuerzoCompresion(material, eps);
      if (sig !== undefined) pts.push({ x: eps, y: sig });
    }
    return pts;
  }, [material, xFinal]);

  const regiones: RegionGrafico[] = [];
  if (pc && ductil) {
    const tramos: RegionGrafico[] = [
      { desde: 0, hasta: pc.epsY, nombre: 'Elástica', color: '#4f9dff' },
      ...(pc.epsPlateauFin > pc.epsY ? [{ desde: pc.epsY, hasta: pc.epsPlateauFin, nombre: 'Fluencia', color: '#f0b429' }] : []),
      { desde: pc.epsPlateauFin, hasta: xFinal, nombre: 'Endurecimiento (sin estricción)', color: '#3ecf8e' },
    ];
    for (const r of tramos) if (r.desde < s.xMax) regiones.push({ ...r, hasta: Math.min(r.hasta, s.xMax) });
  } else if (s.xMax > 0) {
    regiones.push({ desde: 0, hasta: s.xMax, nombre: 'Sin fluencia (frágil)', color: '#4f9dff' });
  }
  const puntosClave: PuntoClave[] = [];
  if (pc && ductil && material.mesetaFluencia && s.xMax >= pc.epsY) puntosClave.push({ x: pc.epsY, y: pc.sigmaY, etiqueta: `σy = ${fmt(pc.sigmaY, 0)} MPa`, color: '#f0b429' });
  if (fracturada) puntosClave.push({ x: xFinal, y: sigmaMaxEnsayo, etiqueta: `Rotura · σuc = ${fmt(sigmaMaxEnsayo, 0)} MPa`, color: '#ff5c5c' });
  if (estado === 'finalizada') puntosClave.push({ x: s.x, y: m.F, etiqueta: 'Fin del ensayo', color: '#a9bdd1' });
  const lineaOffset = rp02 && s.xMax >= rp02.epsilon
    ? { desde: { x: 0.002, y: 0 }, hasta: { x: rp02.epsilon, y: rp02.sigma_MPa }, etiqueta: `Rp0,2 = ${fmt(rp02.sigma_MPa, 0)} MPa` }
    : undefined;
  const energia = trabajoDeformacion(s.traza.map((p) => ({ epsilon: p.x, sigma_MPa: p.F })));

  const fuerzas = sesion.mediciones.map((med) => med.lecturas.fuerza?.valor).filter((v): v is number => typeof v === 'number');
  const FmaxMedida = fuerzas.length ? Math.max(...fuerzas) : 0;

  const puntoSel = m.seleccion !== null ? s.verdaderos[m.seleccion] : undefined;
  const medSel = m.seleccion !== null ? sesion.mediciones[m.seleccion] : undefined;
  const elasticoSel = puntoSel !== undefined && puntoSel.F > 0 && Math.abs(puntoSel.F - E * puntoSel.x) <= 0.05 * puntoSel.F && (!pc || puntoSel.x <= pc.epsY * 0.98);
  const calc = sesion.calculosEstudiante;
  const hayCalculo = ['sigma', 'epsilon', 'E', 'nu'].some((v) => calc[v] !== undefined);
  const pasoActual = estado === 'desmontada' ? 2 : terminado ? 4 : 3;
  const anchoFinal = anchoMenor / Math.sqrt(Math.max(1 - s.x, 0.05));

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 2 — Ensayo de compresión</div>
          <div className="subtitulo">Máquina universal con platos de compresión, control por desplazamiento y curva σ–ε en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material', 'Geometría', 'Montaje', 'Ensayo', 'Resultados']} actual={pasoActual} />

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Máquina universal de ensayos</div>
          <MarcoMaquinaSVG
            ariaLabel="Máquina universal de ensayos con platos de compresión"
            yTravesano={yTravesanoCompresion(geo, acortVisual) - (enMaquina ? 0 : 10)}
            colorProbeta={COLORES_PROBETA[material.categoria]}
            displayCarga={displayCarga}
            displayPico={displayPico}
            unidad="kN"
            enMarcha={m.enMovimiento}
            onParadaEmergencia={() => m.enMovimiento && m.acciones.pausar()}
          >
            <MontajeCompresionSVG
              geometria={geo}
              acortamientoVisual={acortVisual}
              fracturada={fracturada}
              ductil={ductil}
              probetaVisible={!retirada}
              enContacto={enMaquina}
              seccion={tipoSeccion}
              cotas={[`L = ${fmt(L * (1 - s.x), 2)} mm`, `Lo = ${fmt(L, 1)} mm`, tipoSeccion === 'circular' ? `Ø ${fmt(d, 1)}` : `${fmt(b, 1)} × ${fmt(h, 1)}`]}
            />
          </MarcoMaquinaSVG>
          <LineaEstado
            m={m}
            textos={textos}
            regimen={regimen}
            detalle={<>Lo {fmt(L, 1)} → {fmt(L * (1 - s.x), 2)} mm (−{fmt(s.x * 100, 2)} %) · t = {fmt(s.t, 1)} s{k > 1.05 ? ` · escala gráfica del acortamiento ×${fmt(k, 1)}` : ''}</>}
          />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Curva esfuerzo–deformación</div>
          <GraficoEnsayo
            id={ID_GRAFICO}
            titulo="Curva esfuerzo–deformación en compresión (ingenieril)"
            subtitulo={`${material.nombre}${material.condicion ? ` (${material.condicion})` : ''} — compresión`}
            xEtiqueta="Acortamiento unitario ε (mm/mm)"
            yEtiqueta="Esfuerzo de compresión σ (MPa)"
            xMax={xFinal * 1.08}
            yMax={sigmaMaxEnsayo * 1.12}
            traza={traza}
            referencia={referencia}
            regiones={regiones}
            puntosClave={puntosClave}
            lineaOffset={lineaOffset}
            energia={energia}
            puntoActual={montada ? { x: s.x, y: m.F, fracturado: fracturada } : undefined}
            registrados={s.verdaderos.filter((p) => p.manual).map((p) => ({ x: p.x, y: p.F }))}
            opciones={opciones}
          />
          <CasillasGrafico opciones={opciones} setOpciones={setOpciones} claves={['etiquetas', 'puntos', 'regiones', 'offset', 'energia', 'cuadricula', 'teorica']} />
          <DisplayDigital
            items={[
              { etiqueta: 'Carga', valor: displayCarga, unidad: 'kN', alerta: displayCarga === 'OVL' },
              { etiqueta: 'Acortamiento', valor: displayAcort, unidad: 'mm', alerta: displayAcort === 'OVL' },
              { etiqueta: 'Esfuerzo', valor: typeof Fleida === 'number' ? fmt(Fleida / A, 1) : '—', unidad: 'MPa' },
              { etiqueta: 'Deformación', valor: typeof acortLeido === 'number' ? fmt(acortLeido / L, 4) : '—', unidad: 'mm/mm' },
            ]}
          />
          <MandosMaquina m={{ ...m, acciones: { ...m.acciones, iniciar } }} puedeMontar={!!seccion} />
          <TablaDatosVivo
            m={m}
            columnas={[
              { titulo: 'Carga (kN)', valor: (med) => textoLectura(med.lecturas.fuerza?.valor, 3, 1000) },
              { titulo: 'Acortamiento (mm)', valor: (med) => textoLectura(med.lecturas.acortamiento?.valor, 3) },
              { titulo: 'ε transversal', valor: (med) => textoLectura(med.lecturas.deformacionTransversal?.valor, 5) },
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
            jogAX={(mm) => mm / L}
          >
            <Segmentado
              etiqueta="Sección"
              opciones={[{ valor: 'circular', etiqueta: 'Cilíndrica' }, { valor: 'rectangular', etiqueta: 'Prismática' }]}
              valor={tipoSeccion}
              onChange={setTipoSeccion}
              disabled={montada}
            />
            {tipoSeccion === 'circular' ? (
              <Stepper etiqueta="Diámetro d (mm)" valor={d} onChange={setD} min={8} max={40} paso={1} decimales={0} disabled={montada} />
            ) : (
              <>
                <Stepper etiqueta="Ancho b (mm)" valor={b} onChange={setB} min={8} max={40} paso={1} decimales={0} disabled={montada} />
                <Stepper etiqueta="Espesor h (mm)" valor={h} onChange={setH} min={8} max={40} paso={1} decimales={0} disabled={montada} />
              </>
            )}
            <Stepper etiqueta="Altura Lo (mm)" valor={L} onChange={setL} min={10} max={120} paso={5} decimales={0} disabled={montada} />
          </ControlesMovimiento>
          <p className="nota">
            A₀ = {fmt(A, 2)} mm² · Lo/d = {fmt(L / anchoMenor, 2)} · {celda.nombre} · comparador de acortamiento (±25 mm) · probetas usadas: {m.probetasUsadas}.
          </p>
          {L / anchoMenor > 3 ? (
            <p className="advertencia">
              Probeta esbelta (Lo/d = {fmt(L / anchoMenor, 1)}, L/r = {fmt(esbeltez, 0)}): podría pandear antes de aplastarse. Las normas (p. ej. ASTM E9)
              usan Lo/d entre 1,5 y 3 para medir resistencia a compresión; para estudiar el pandeo use el Banco 6.
            </p>
          ) : (
            <p className="nota">Lo/d entre 1,5 y 3 evita el pandeo y reduce el efecto del rozamiento con los platos (ASTM E9).</p>
          )}
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la probeta</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={cambiarMaterial} disabled={montada} soloIsotropicos />
          {montada && <p className="nota">Para cambiar material o geometría, desmonte la probeta o use «Nueva probeta».</p>}
          {!ductil && material.propiedades.sigmaUc_MPa === undefined && (
            <p className="nota">Sin dato de resistencia a compresión para este material: se usa la de tracción (estimación conservadora).</p>
          )}
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <BotonesExportar m={m} idGrafico={ID_GRAFICO} nombrePng={`curva-compresion-${sesion.materialId}.png`} />
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          {!puntoSel || !medSel ? (
            <p className="nota">Seleccione una fila de la tabla. Calcule σ = F/A₀ y ε = ΔL/Lo; en un punto de la zona elástica también E = σ/ε y ν = ε_trans/ε.</p>
          ) : (
            <>
              <p className="nota">
                Punto {m.seleccion! + 1}: F = {textoLectura(medSel.lecturas.fuerza?.valor, 0)} N · ΔL = {textoLectura(medSel.lecturas.acortamiento?.valor, 3)} mm ·
                ε_trans = {textoLectura(medSel.lecturas.deformacionTransversal?.valor, 5)} · A₀ = {fmt(A, 2)} mm² · Lo = {fmt(L, 1)} mm
                {elasticoSel ? ' · punto en zona elástica' : ' · fuera de la zona elástica: E y ν no aplican'}
              </p>
              <div className="fila campo">
                <div><label>σ calculado (MPa)</label><input type="number" value={calc.sigma ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('sigma', Number(e.target.value))} /></div>
                <div><label>ε calculado</label><input type="number" value={calc.epsilon ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('epsilon', Number(e.target.value))} /></div>
              </div>
              {elasticoSel && (
                <div className="fila campo">
                  <div><label>E calculado (MPa)</label><input type="number" value={calc.E ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('E', Number(e.target.value))} /></div>
                  <div><label>ν calculado</label><input type="number" value={calc.nu ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('nu', Number(e.target.value))} /></div>
                </div>
              )}
              {hayCalculo && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="σ (esfuerzo)" valorEstudiante={calc.sigma} valorReferencia={puntoSel.F} unidad="MPa" />
                  <FilaValidacion etiqueta="ε (acortamiento unitario)" valorEstudiante={calc.epsilon} valorReferencia={puntoSel.x} unidad="" />
                  {elasticoSel && <FilaValidacion etiqueta="E (módulo de Young)" valorEstudiante={calc.E} valorReferencia={E} unidad="MPa" />}
                  {elasticoSel && material.propiedades.nu !== undefined && (
                    <FilaValidacion etiqueta="ν (Poisson)" valorEstudiante={calc.nu} valorReferencia={material.propiedades.nu} unidad="" />
                  )}
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
                <ResumenItem etiqueta="Carga máxima medida" valor={`${fmt(FmaxMedida / 1000, 2)} kN`} />
                <ResumenItem etiqueta={fracturada ? 'Resistencia a compresión σuc = Fmáx/A₀' : 'Esfuerzo máximo Fmáx/A₀'} valor={`${fmt(FmaxMedida / A, 1)} MPa`} />
                <ResumenItem etiqueta="Límite elástico convencional Rp0,2" valor={rp02 ? `${fmt(rp02.sigma_MPa, 0)} MPa` : 'No aplica (frágil)'} />
                <ResumenItem etiqueta="Acortamiento total" valor={`${fmt(s.x * 100, 1)} %`} />
                {!fracturada && <ResumenItem etiqueta="Ancho medio final (volumen constante)" valor={`${fmt(anchoFinal, 1)} mm`} />}
                <ResumenItem etiqueta="Energía absorbida" valor={`${fmt(energia, 2)} MJ/m³`} />
              </div>
              <p className="nota">
                {fracturada
                  ? 'Los frágiles resisten mucho más a compresión que a tracción y rompen por cortante en un plano inclinado.'
                  : 'Un metal dúctil no tiene «resistencia última» en compresión: se aplasta y la carga sigue subiendo porque la sección crece.'}
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => sesionEnsayo.registrarConclusiones(e.target.value)}
            placeholder="Comparación con tracción, abarrilamiento, tipo de falla, influencia de la esbeltez…"
          />
        </section>
      </div>
    </div>
  );
}

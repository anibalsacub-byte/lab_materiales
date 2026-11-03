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
import { MaquinaTorsionSVG } from './MaquinaTorsionSVG';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { useEnsayoMaquina, type ModeloEnsayo } from '../../trial/useEnsayoMaquina';
import { obtenerMaterial, moduloCorte } from '../../engine/materials';
import { deformacionAngularRotura, momentoPolarInerciaCircular, parTorsor } from '../../engine/mechanics/torsion';
import { medir, INSTRUMENTOS, elegirTorquimetro } from '../../engine/measurement';
import type { Material } from '../../engine/types';

type TipoEje = 'maciza' | 'tubular';

const ID_GRAFICO = 'grafico-ensayo-torsion';
const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: false, energia: false, cuadricula: true, teorica: true };
const RAD_A_DEG = 180 / Math.PI;
/** Anillos de integración del par (suficiente para < 0,1 % de error y un bucle fluido). */
const N_ANILLOS = 60;

function moduloG(m: Material): number {
  return moduloCorte(m) ?? (m.propiedades.E_MPa ?? 200000) / 2.6;
}

export function TorsionBench({ onVolver }: { onVolver: () => void }) {
  useModoLab();
  const sesionEnsayo = useSesionEnsayo('banco-5-torsion', 'sae-1018');
  const { sesion } = sesionEnsayo;

  const [tipoEje, setTipoEje] = useState<TipoEje>('maciza');
  const [dExt, setDExt] = useState(8);
  const [dInt, setDInt] = useState(5);
  const [L, setL] = useState(100);
  const [velocidad, setVelocidad] = useState(180);
  const [pasoJog, setPasoJog] = useState('1');
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);

  const material = obtenerMaterial(sesion.materialId)!;
  const ductil = material.modelo === 'elastico_plastico_bilineal';
  const G = moduloG(material);
  const di = tipoEje === 'tubular' ? dInt : 0;
  const geometriaValida = di < dExt - 0.5;
  const J = geometriaValida ? momentoPolarInerciaCircular(dExt, di) : 1;
  const ro = dExt / 2;
  const k = (G * J) / L;

  const gammaRotura = deformacionAngularRotura(material, G) ?? 0.5;
  const thetaF = (gammaRotura * L) / ro;
  const parEn = (theta: number) => parTorsor(material, G, dExt, di, L, theta, N_ANILLOS) ?? parTorsor(material, G, dExt, di, L, thetaF * 0.9999, N_ANILLOS) ?? 0;
  const Tmax = useMemo(() => {
    let max = 0;
    for (let i = 1; i <= 60; i++) max = Math.max(max, parTorsor(material, G, dExt, di, L, (thetaF * i) / 60 * 0.9999, N_ANILLOS) ?? 0);
    return max;
  }, [material, G, dExt, di, L, thetaF]);
  const torquimetro = elegirTorquimetro(Tmax);
  const respuesta = (theta: number, thetaMax: number) => (theta >= thetaMax ? parEn(theta) : Math.max(0, parEn(thetaMax) - k * (thetaMax - theta)));

  // x = giro θ (rad) en la longitud calibrada, F = par T (N·mm).
  const modelo: ModeloEnsayo = {
    respuesta,
    xFalla: thetaF,
    xSinCarga: (thetaMax) => thetaMax - parEn(thetaMax) / k,
    velocidad: velocidad / RAD_A_DEG / 60,
    escalaF: Tmax,
    escalaX: thetaF,
    leer: (theta, T, indicePunto, calibrado) => {
      const op = { semillaEnsayo: sesion.semilla, indicePunto, calibrado };
      return {
        par: medir(T, torquimetro, op),
        giro: medir(theta * RAD_A_DEG, INSTRUMENTOS.encoderAngular, op),
      };
    },
    clavePico: 'par',
  };
  const m = useEnsayoMaquina(sesionEnsayo, modelo);
  const { sim: s, estado, fracturada, retirada, enMaquina, montada } = m;

  function velocidadSugerida(mat: Material) {
    const gR = deformacionAngularRotura(mat, moduloG(mat)) ?? 0.5;
    const grados = ((gR * L) / ro) * RAD_A_DEG;
    return Math.min(Math.max(Math.round(grados / 1.5 / 10) * 10, 10), 3600);
  }

  function cambiarMaterial(id: string) {
    m.acciones.nuevaProbeta(id);
    setVelocidad(velocidadSugerida(obtenerMaterial(id)!));
  }

  function iniciar() {
    if (s.x === 0) sesionEnsayo.actualizarConfiguracion({ tipoEje, dExt_mm: dExt, dInt_mm: di, L_mm: L, J_mm4: J, G_MPa: G, velocidad_grad_min: velocidad, torquimetro: torquimetro.nombre });
    m.acciones.iniciar();
  }

  // ---------- Vista ----------

  const Tleido = m.lecturaVivo?.par.valor;
  const giroLeido = m.lecturaVivo?.giro.valor;
  const displayPar = enMaquina ? textoLectura(Tleido, 2, 1000) : '—';
  const displayGiro = enMaquina ? textoLectura(giroLeido, 2) : '—';
  const displayPico = m.pico === undefined ? '—' : fmt(m.pico / 1000, 2);

  const sigmaY = material.propiedades.sigmaY_MPa;
  const tauY = ductil && sigmaY !== undefined ? sigmaY / Math.sqrt(3) : undefined;
  const thetaY = tauY !== undefined ? (tauY / G) * (L / ro) : undefined;
  const Ty = tauY !== undefined ? (tauY * J) / ro : undefined;
  const kv = thetaF < 1.5 * Math.PI ? Math.min(25, (1.5 * Math.PI) / thetaF) : 1;

  const regimen = (() => {
    if (!montada) return '—';
    if (retirada) return `Sin carga · giro permanente ${fmt(s.x * RAD_A_DEG, 1)}°`;
    if (fracturada) return ductil ? 'Rotura dúctil: plano transversal (cortante)' : 'Rotura frágil: hélice a 45° (tracción)';
    if (s.x < s.xMax - 1e-9) return 'Descarga / recarga elástica';
    if (thetaY === undefined) return 'Sin fluencia — comportamiento frágil';
    if (s.x <= thetaY) return 'Elástico';
    return 'Elastoplástico: la fluencia avanza de la superficie al centro';
  })();

  const textos = {
    ...textosEstadoBase(m, `cabezal a ${fmt(velocidad, 0)} °/min`),
    retirada: `Probeta retirada — quedó torcida ${fmt(s.x * RAD_A_DEG, 1)}°. Vuelva a montarla para recargarla o use «Nueva probeta»`,
    fracturada: 'Probeta rota — la máquina detectó la caída del par',
  };

  const traza = s.traza.map((p) => ({ x: p.x * RAD_A_DEG, y: p.F / 1000 }));
  const xMaxGrafico = thetaF * RAD_A_DEG * 1.08;
  const yMaxGrafico = (Tmax / 1000) * 1.15;
  const referencia = [{ x: 0, y: 0 }, { x: Math.min((yMaxGrafico * 1000) / k, thetaF) * RAD_A_DEG, y: Math.min(yMaxGrafico, (k * thetaF) / 1000) }];

  const regiones: RegionGrafico[] = [];
  const xMaxDeg = s.xMax * RAD_A_DEG;
  if (thetaY !== undefined) {
    const tramos: RegionGrafico[] = [
      { desde: 0, hasta: thetaY * RAD_A_DEG, nombre: 'Elástica', color: '#4f9dff' },
      { desde: thetaY * RAD_A_DEG, hasta: thetaF * RAD_A_DEG, nombre: 'Elastoplástica', color: '#3ecf8e' },
    ];
    for (const r of tramos) if (r.desde < xMaxDeg) regiones.push({ ...r, hasta: Math.min(r.hasta, xMaxDeg) });
  } else if (s.xMax > 0) {
    regiones.push({ desde: 0, hasta: xMaxDeg, nombre: 'Sin fluencia (frágil)', color: '#4f9dff' });
  }
  const puntosClave: PuntoClave[] = [];
  if (thetaY !== undefined && Ty !== undefined && s.xMax >= thetaY) puntosClave.push({ x: thetaY * RAD_A_DEG, y: Ty / 1000, etiqueta: `Ty = ${fmt(Ty / 1000, 2)} N·m`, color: '#f0b429' });
  if (fracturada) puntosClave.push({ x: thetaF * RAD_A_DEG, y: parEn(thetaF * 0.9999) / 1000, etiqueta: 'Rotura', color: '#ff5c5c' });

  let energia = 0;
  for (let i = 1; i < s.traza.length; i++) energia += ((s.traza[i].F + s.traza[i - 1].F) / 2) * (s.traza[i].x - s.traza[i - 1].x);

  const pares = sesion.mediciones.map((med) => med.lecturas.par?.valor).filter((v): v is number => typeof v === 'number');
  const TmaxMedido = pares.length ? Math.max(...pares) : 0;

  const puntoSel = m.seleccion !== null ? s.verdaderos[m.seleccion] : undefined;
  const medSel = m.seleccion !== null ? sesion.mediciones[m.seleccion] : undefined;
  const elasticoSel = puntoSel !== undefined && puntoSel.F > 0 && Math.abs(puntoSel.F - k * puntoSel.x) <= 0.03 * puntoSel.F;
  const calc = sesion.calculosEstudiante;
  const hayCalculo = ['J', 'tauMax', 'gamma', 'G'].some((v) => calc[v] !== undefined);
  const pasoActual = estado === 'desmontada' ? 2 : fracturada ? 4 : 3;

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 5 — Ensayo de torsión</div>
          <div className="subtitulo">Máquina de torsión con giro controlado, celda de par, encoder angular y curva par–giro en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material', 'Geometría', 'Montaje', 'Ensayo', 'Resultados']} actual={pasoActual} />

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Máquina de torsión</div>
          <MaquinaTorsionSVG
            giro={s.x}
            giroVisual={Math.min(s.x * kv, 12 * Math.PI)}
            fracturada={fracturada}
            ductil={ductil}
            tubular={tipoEje === 'tubular'}
            mordazasCerradas={enMaquina}
            probetaVisible={!retirada}
            colorProbeta={COLORES_PROBETA[material.categoria]}
            cotas={[`θ = ${fmt(s.x * RAD_A_DEG, 1)}°`, `L = ${fmt(L, 0)} mm`, tipoEje === 'maciza' ? `Ø ${fmt(dExt, 1)}` : `Ø ${fmt(dExt, 1)} / ${fmt(di, 1)}`]}
            displayCarga={displayPar}
            displayPico={displayPico}
            unidad="N·m"
            enMarcha={m.enMovimiento}
            onParadaEmergencia={() => m.enMovimiento && m.acciones.pausar()}
          />
          <LineaEstado
            m={m}
            textos={textos}
            regimen={regimen}
            detalle={<>γ superficie = r·θ/L = {fmt((ro * s.x) / L, 4)} rad · t = {fmt(s.t, 1)} s{kv > 1.05 ? ` · escala gráfica del giro en la probeta ×${fmt(kv, 1)}` : ''}</>}
          />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Curva par–giro</div>
          <GraficoEnsayo
            id={ID_GRAFICO}
            titulo="Curva par torsor–ángulo de giro"
            subtitulo={`${material.nombre}${material.condicion ? ` (${material.condicion})` : ''} — torsión, L = ${fmt(L, 0)} mm`}
            xEtiqueta="Ángulo de giro θ (°)"
            yEtiqueta="Par torsor T (N·m)"
            xMax={xMaxGrafico}
            yMax={yMaxGrafico}
            traza={traza}
            referencia={referencia}
            regiones={regiones}
            puntosClave={puntosClave}
            energia={energia / 1000}
            puntoActual={montada ? { x: s.x * RAD_A_DEG, y: m.F / 1000, fracturado: fracturada } : undefined}
            registrados={s.verdaderos.filter((p) => p.manual).map((p) => ({ x: p.x * RAD_A_DEG, y: p.F / 1000 }))}
            opciones={opciones}
            unidadEnergia="J"
          />
          <CasillasGrafico opciones={opciones} setOpciones={setOpciones} claves={['etiquetas', 'puntos', 'regiones', 'energia', 'cuadricula', 'teorica']} nombres={{ teorica: 'Recta elástica GJ/L' }} />
          <DisplayDigital
            items={[
              { etiqueta: 'Par', valor: displayPar, unidad: 'N·m', alerta: displayPar === 'OVL' },
              { etiqueta: 'Giro', valor: displayGiro, unidad: '°', alerta: displayGiro === 'OVL' },
              { etiqueta: 'τ = T·r/J', valor: typeof Tleido === 'number' ? fmt((Tleido * ro) / J, 1) : '—', unidad: 'MPa (elástica)' },
              { etiqueta: 'γ = r·θ/L', valor: typeof giroLeido === 'number' ? fmt((ro * giroLeido) / RAD_A_DEG / L, 4) : '—', unidad: 'rad' },
            ]}
          />
          <MandosMaquina m={{ ...m, acciones: { ...m.acciones, iniciar } }} puedeMontar={geometriaValida} />
          <TablaDatosVivo
            m={m}
            columnas={[
              { titulo: 'Par (N·m)', valor: (med) => textoLectura(med.lecturas.par?.valor, 3, 1000) },
              { titulo: 'Giro (°)', valor: (med) => textoLectura(med.lecturas.giro?.valor, 2) },
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
            unidadVelocidad="°/min"
            unidadJog="°"
            velocidadMin={10}
            velocidadMax={3600}
            pasoVelocidad={10}
            pasosJog={['0.1', '1', '10', '90']}
            pasoJog={pasoJog}
            setPasoJog={setPasoJog}
            jogAX={(grados) => grados / RAD_A_DEG}
          >
            <Segmentado
              etiqueta="Eje"
              opciones={[{ valor: 'maciza', etiqueta: 'Macizo' }, { valor: 'tubular', etiqueta: 'Tubular' }]}
              valor={tipoEje}
              onChange={setTipoEje}
              disabled={montada}
            />
            <Stepper etiqueta="Diámetro exterior (mm)" valor={dExt} onChange={setDExt} min={4} max={20} paso={0.5} disabled={montada} />
            {tipoEje === 'tubular' && <Stepper etiqueta="Diámetro interior (mm)" valor={dInt} onChange={setDInt} min={1} max={dExt - 1} paso={0.5} disabled={montada} />}
            <Stepper etiqueta="Longitud calibrada L (mm)" valor={L} onChange={setL} min={50} max={300} paso={10} decimales={0} disabled={montada} />
          </ControlesMovimiento>
          <p className="nota">
            J = {fmt(J, 1)} mm⁴ · G = {fmt(G, 0)} MPa · {torquimetro.nombre} · encoder angular (resolución 0,01°) · probetas usadas: {m.probetasUsadas}.
            La máquina controla el giro del cabezal: el par es la respuesta de la probeta.
          </p>
          {!geometriaValida && <p className="advertencia">El diámetro interior debe ser menor que el exterior.</p>}
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la probeta</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={cambiarMaterial} disabled={montada} soloIsotropicos />
          {montada && <p className="nota">Para cambiar material o geometría, desmonte la probeta o use «Nueva probeta».</p>}
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <BotonesExportar m={m} idGrafico={ID_GRAFICO} nombrePng={`curva-torsion-${sesion.materialId}.png`} />
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          {!puntoSel || !medSel ? (
            <p className="nota">Seleccione una fila de la tabla. Calcule J = π(D⁴ − d⁴)/32, τmáx = T·r/J y γ = r·θ/L; en un punto elástico también G = T·L/(J·θ).</p>
          ) : (
            <>
              <p className="nota">
                Punto {m.seleccion! + 1}: T = {textoLectura(medSel.lecturas.par?.valor, 0)} N·mm · θ = {textoLectura(medSel.lecturas.giro?.valor, 2)}° · r = {fmt(ro, 2)} mm · L = {fmt(L, 0)} mm
                {elasticoSel ? ' · punto en zona elástica' : ' · fuera de la zona elástica: τ = T·r/J y G no aplican (la sección ya fluye)'}
              </p>
              <div className="fila campo">
                <div><label>J calculado (mm⁴)</label><input type="number" value={calc.J ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('J', Number(e.target.value))} /></div>
                <div><label>γ calculado (rad)</label><input type="number" value={calc.gamma ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('gamma', Number(e.target.value))} /></div>
              </div>
              {elasticoSel && (
                <div className="fila campo">
                  <div><label>τmáx calculado (MPa)</label><input type="number" value={calc.tauMax ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('tauMax', Number(e.target.value))} /></div>
                  <div><label>G calculado (MPa)</label><input type="number" value={calc.G ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('G', Number(e.target.value))} /></div>
                </div>
              )}
              {hayCalculo && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="J (momento polar)" valorEstudiante={calc.J} valorReferencia={J} unidad="mm⁴" />
                  <FilaValidacion etiqueta="γ (deformación angular en la superficie)" valorEstudiante={calc.gamma} valorReferencia={(ro * puntoSel.x) / L} unidad="rad" />
                  {elasticoSel && <FilaValidacion etiqueta="τmáx (cortante en la superficie)" valorEstudiante={calc.tauMax} valorReferencia={(puntoSel.F * ro) / J} unidad="MPa" />}
                  {elasticoSel && <FilaValidacion etiqueta="G (módulo de corte)" valorEstudiante={calc.G} valorReferencia={G} unidad="MPa" />}
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
                <ResumenItem etiqueta="Par máximo medido" valor={`${fmt(TmaxMedido / 1000, 2)} N·m`} />
                <ResumenItem etiqueta="Módulo de rotura τ = Tmáx·r/J" valor={`${fmt((TmaxMedido * ro) / J, 1)} MPa`} />
                <ResumenItem etiqueta="Par de primera fluencia Ty" valor={Ty !== undefined ? `${fmt(Ty / 1000, 2)} N·m` : 'No aplica (frágil)'} />
                <ResumenItem etiqueta="Giro a la rotura" valor={`${fmt(thetaF * RAD_A_DEG, 1)}° (${fmt((thetaF * RAD_A_DEG) / 360, 2)} vueltas)`} />
                <ResumenItem etiqueta="γ en la superficie a la rotura" valor={`${fmt(gammaRotura, 3)} rad`} />
                <ResumenItem etiqueta="Energía absorbida ∫T·dθ" valor={`${fmt(energia / 1000, 2)} J`} />
              </div>
              <p className="nota">
                El módulo de rotura usa la fórmula elástica sobre una sección ya plastificada: sobrestima el cortante real
                (en un eje macizo totalmente plástico el par es 4/3 del de primera fluencia).
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => sesionEnsayo.registrarConclusiones(e.target.value)}
            placeholder="Plano de rotura dúctil (transversal) frente a frágil (hélice a 45°), efecto del tubo hueco, G medido…"
          />
        </section>
      </div>
    </div>
  );
}

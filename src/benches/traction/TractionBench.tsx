import { useMemo, useState } from 'react';
import { MaterialSelector } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { LecturasPanel } from '../../components/LecturasPanel';
import { GraficoXY } from '../../components/svg/GraficoXY';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { exportarMedicionesCSV, exportarSesionJSON } from '../../trial/exportar';
import { obtenerMaterial } from '../../engine/materials';
import {
  esfuerzoEnDeformacion,
  deformacionDesdeEsfuerzo,
  deformacionFluencia,
  deformacionPermanenteTrasDescarga,
  deformacionTransversal,
  generarCurvaEsfuerzoDeformacion,
} from '../../engine/mechanics/axial';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';
import { TractionSVG } from './TractionSVG';
import type { LecturaInstrumento } from '../../engine/types';

const AMPLIFICACION_VISUAL = 25;

type TipoSeccionLocal = 'circular' | 'rectangular';
type ModoControl = 'fuerza' | 'epsilon' | 'mm';

/**
 * A diferencia de compresión, en tracción la fractura SÍ es el comportamiento real que se busca
 * observar (σU y εF de la biblioteca son precisamente los valores de tracción), así que el
 * límite del ensayo llega casi hasta εF en vez de usar un margen conservador.
 */
function limiteDeformacion(materialId: string): number {
  const m = obtenerMaterial(materialId);
  if (!m) return 0.01;
  const epsF = m.propiedades.epsilonF;
  return epsF !== undefined ? epsF * 0.995 : 0.02;
}

export function TractionBench({ onVolver }: { onVolver: () => void }) {
  const { sesion, setMaterial, agregarMedicion, registrarCalculo, registrarConclusiones, marcarProbetaDestruida, reiniciarEnsayo } =
    useSesionEnsayo('banco-1-traccion', 'sae-1018');

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('circular');
  const [d, setD] = useState(12);
  const [b, setB] = useState(12);
  const [h, setH] = useState(6);
  const [L, setL] = useState(50);

  const [epsilonObjetivo, setEpsilonObjetivo] = useState(0);
  const [epsilonMaxAlcanzado, setEpsilonMaxAlcanzado] = useState(0);
  const [calibradoCelda, setCalibradoCelda] = useState(false);
  const [calibradoExtensometro, setCalibradoExtensometro] = useState(false);
  const [calibradoTransversal, setCalibradoTransversal] = useState(false);
  const [deformacionPermanenteUltima, setDeformacionPermanenteUltima] = useState<number | null>(null);
  const [epsilonesRegistrados, setEpsilonesRegistrados] = useState<number[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [probetasUsadas, setProbetasUsadas] = useState(1);
  const [modoControl, setModoControl] = useState<ModoControl>('fuerza');
  const [mostrarGrafico, setMostrarGrafico] = useState(true);

  const material = obtenerMaterial(sesion.materialId)!;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);

  const A = seccion?.area_mm2 ?? 1;
  const limiteEps = limiteDeformacion(sesion.materialId);
  const epsY = deformacionFluencia(material);

  const sigmaActual = esfuerzoEnDeformacion(material, epsilonObjetivo) ?? 0;
  const PActual = sigmaActual * A;
  const alargamientoActual = epsilonObjetivo * L;
  const pasoSlider = limiteEps / 500;
  const progresoEnsayo = limiteEps > 0 ? epsilonObjetivo / limiteEps : 0;
  const maxMm = limiteEps * L;
  const pasoSliderMm = pasoSlider * L;

  const sigmaMaxPosible = material.propiedades.sigmaU_MPa ?? esfuerzoEnDeformacion(material, limiteEps) ?? material.propiedades.sigmaY_MPa ?? (material.propiedades.E_MPa ?? 200000) * limiteEps;
  const celdaCarga = elegirCeldaCarga(sigmaMaxPosible * A);
  const maxFuerza = sigmaMaxPosible * A;
  const pasoFuerza = maxFuerza / 500;

  const curvaReferencia = useMemo(() => generarCurvaEsfuerzoDeformacion(material, 60, limiteEps).map((p) => ({ x: p.epsilon, y: p.sigma_MPa })), [material, limiteEps]);
  const puntosGraficados = epsilonesRegistrados.map((eps) => ({ x: eps, y: esfuerzoEnDeformacion(material, eps) ?? 0 }));

  const estadoSvg: 'elastico' | 'plastico' | 'destruida' = sesion.probetaDestruida
    ? 'destruida'
    : epsY !== undefined && epsilonObjetivo > epsY
      ? 'plastico'
      : 'elastico';

  function manejarSlider(v: number) {
    if (sesion.probetaDestruida) return;
    const vAcotado = Math.min(Math.max(v, 0), limiteEps);
    setEpsilonObjetivo(vAcotado);
    setEpsilonMaxAlcanzado((prev) => Math.max(prev, vAcotado));
    setDeformacionPermanenteUltima(null);
  }

  function ajustarPaso(signo: 1 | -1) {
    manejarSlider(epsilonObjetivo + signo * pasoSlider);
  }

  function manejarSliderFuerza(P: number) {
    const sigmaObjetivo = P / A;
    const eps = deformacionDesdeEsfuerzo(material, sigmaObjetivo);
    manejarSlider(eps ?? limiteEps);
  }

  function manejarDescargar() {
    if (epsilonObjetivo <= 0) return;
    const permanente = deformacionPermanenteTrasDescarga(material, epsilonMaxAlcanzado);
    setDeformacionPermanenteUltima(permanente);
    setEpsilonObjetivo(0);
  }

  function manejarFalla() {
    const epsF = material.propiedades.epsilonF;
    if (epsF === undefined) return;
    setEpsilonObjetivo(epsF * 1.02);
    setEpsilonMaxAlcanzado(epsF * 1.02);
    marcarProbetaDestruida();
  }

  function manejarNuevaProbeta() {
    reiniciarEnsayo();
    setEpsilonObjetivo(0);
    setEpsilonMaxAlcanzado(0);
    setDeformacionPermanenteUltima(null);
    setEpsilonesRegistrados([]);
    setIndiceSeleccionado(0);
    setProbetasUsadas((n) => n + 1);
  }

  function registrarPunto() {
    const sigmaVerdadero = esfuerzoEnDeformacion(material, epsilonObjetivo);
    if (sigmaVerdadero === undefined) return;
    const PVerdadero = sigmaVerdadero * A;
    const alargVerdadero = epsilonObjetivo * L;
    const epsTransVerdadero = deformacionTransversal(epsilonObjetivo, material.propiedades.nu ?? 0);
    const opciones = (id: string) => ({ semillaEnsayo: sesion.semilla, indicePunto: sesion.mediciones.length, calibrado: id === 'fuerza' ? calibradoCelda : id === 'alargamiento' ? calibradoExtensometro : calibradoTransversal });

    const lecturas: Record<string, LecturaInstrumento> = {
      fuerza: medir(PVerdadero, celdaCarga, opciones('fuerza')),
      alargamiento: medir(alargVerdadero, INSTRUMENTOS.comparadorDigital25mm, opciones('alargamiento')),
      deformacionTransversal: medir(epsTransVerdadero, INSTRUMENTOS.extensometroTransversal, opciones('deformacionTransversal')),
    };
    agregarMedicion(lecturas);
    setEpsilonesRegistrados((arr) => [...arr, epsilonObjetivo]);
    setIndiceSeleccionado(sesion.mediciones.length);
  }

  const puntoRef = epsilonesRegistrados[indiceSeleccionado];
  const sigmaRef = puntoRef !== undefined ? esfuerzoEnDeformacion(material, puntoRef) : undefined;
  const ERef = material.propiedades.E_MPa;
  const nuRef = material.propiedades.nu;
  const hayCalculo = sesion.calculosEstudiante.sigma !== undefined || sesion.calculosEstudiante.epsilon !== undefined || sesion.calculosEstudiante.E !== undefined || sesion.calculosEstudiante.nu !== undefined;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Banco 1 — Tracción axial</div>
          <div className="subtitulo">Configure el ensayo, estire la probeta y observe la respuesta en tiempo real, hasta la fractura.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <div className="banco-grid">
        {/* Zona A: configuración */}
        <div className="zona-a panel">
          <div className="zona-etiqueta">Zona A · Configuración</div>
          <MaterialSelector materialId={sesion.materialId} onChange={setMaterial} />

          <div className="campo">
            <label>Tipo de sección</label>
            <select value={tipoSeccion} onChange={(e) => setTipoSeccion(e.target.value as TipoSeccionLocal)}>
              <option value="circular">Circular maciza</option>
              <option value="rectangular">Rectangular</option>
            </select>
          </div>
          {tipoSeccion === 'circular' ? (
            <div className="campo">
              <label>Diámetro d (mm)</label>
              <input type="number" value={d} min={3} max={30} onChange={(e) => setD(Number(e.target.value))} />
            </div>
          ) : (
            <div className="fila campo">
              <div>
                <label>Base b (mm)</label>
                <input type="number" value={b} min={3} max={30} onChange={(e) => setB(Number(e.target.value))} />
              </div>
              <div>
                <label>Espesor h (mm)</label>
                <input type="number" value={h} min={2} max={20} onChange={(e) => setH(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className="campo">
            <label>Longitud calibrada L (mm)</label>
            <input type="number" value={L} min={20} max={200} onChange={(e) => setL(Number(e.target.value))} />
          </div>

          <hr className="separador" />
          <p className="nota">A = {A.toFixed(1)} mm²</p>
          <p className="nota">Probetas usadas en esta sesión: {probetasUsadas}</p>
        </div>

        {/* Zona B: representación del banco */}
        <div className="zona-b panel">
          <div className="zona-etiqueta">Zona B · Banco de ensayo</div>
          <TractionSVG
            epsilon={epsilonObjetivo}
            amplificacion={AMPLIFICACION_VISUAL}
            estado={estadoSvg}
            alargamientoMm={alargamientoActual}
            progreso={progresoEnsayo}
          />
        </div>

        {/* Zona C: instrumentación y control */}
        <div className="zona-c panel">
          <div className="zona-etiqueta">Zona C · Instrumentación y control</div>
          <div className="fila campo">
            <button onClick={() => setCalibradoCelda(true)} disabled={calibradoCelda}>Cero: celda de carga</button>
            <button onClick={() => setCalibradoExtensometro(true)} disabled={calibradoExtensometro}>Cero: extensómetro</button>
            <button onClick={() => setCalibradoTransversal(true)} disabled={calibradoTransversal}>Cero: ext. transversal</button>
          </div>
          <div className="campo">
            <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={{ marginBottom: 0 }}>
                {modoControl === 'fuerza' && <>Fuerza aplicada P = {PActual.toFixed(0)} N (máx.: {maxFuerza.toFixed(0)} N)</>}
                {modoControl === 'epsilon' && <>Deformación controlada ε = {epsilonObjetivo.toFixed(5)} (máx.: {limiteEps.toFixed(4)})</>}
                {modoControl === 'mm' && <>Alargamiento controlado ΔL = {alargamientoActual.toFixed(4)} mm (máx.: {maxMm.toFixed(4)} mm)</>}
              </label>
              <div className="selector-modo" role="group" aria-label="Variable de control">
                <button className={modoControl === 'fuerza' ? 'primario' : ''} onClick={() => setModoControl('fuerza')} disabled={sesion.probetaDestruida}>N</button>
                <button className={modoControl === 'epsilon' ? 'primario' : ''} onClick={() => setModoControl('epsilon')} disabled={sesion.probetaDestruida}>ε</button>
                <button className={modoControl === 'mm' ? 'primario' : ''} onClick={() => setModoControl('mm')} disabled={sesion.probetaDestruida}>mm</button>
              </div>
            </div>
            <div className="control-paso">
              <button className="boton-paso" onClick={() => ajustarPaso(-1)} disabled={sesion.probetaDestruida || epsilonObjetivo <= 0} aria-label="Disminuir carga">−</button>
              {modoControl === 'fuerza' && (
                <input type="range" min={0} max={maxFuerza} step={pasoFuerza} value={PActual} onChange={(e) => manejarSliderFuerza(Number(e.target.value))} disabled={sesion.probetaDestruida} />
              )}
              {modoControl === 'epsilon' && (
                <input type="range" min={0} max={limiteEps} step={pasoSlider} value={epsilonObjetivo} onChange={(e) => manejarSlider(Number(e.target.value))} disabled={sesion.probetaDestruida} />
              )}
              {modoControl === 'mm' && (
                <input type="range" min={0} max={maxMm} step={pasoSliderMm} value={alargamientoActual} onChange={(e) => manejarSlider(Number(e.target.value) / L)} disabled={sesion.probetaDestruida} />
              )}
              <button className="boton-paso" onClick={() => ajustarPaso(1)} disabled={sesion.probetaDestruida || epsilonObjetivo >= limiteEps} aria-label="Aumentar carga">+</button>
            </div>
          </div>

          <LecturasPanel
            lecturas={[
              { etiqueta: 'Fuerza', valor: PActual.toFixed(0), unidad: 'N' },
              { etiqueta: 'Esfuerzo σ', valor: sigmaActual.toFixed(2), unidad: 'MPa' },
              { etiqueta: 'Alargamiento', valor: alargamientoActual.toFixed(4), unidad: 'mm' },
            ]}
          />
          <div className="fila campo">
            <button className="primario" onClick={registrarPunto} disabled={sesion.probetaDestruida}>Registrar punto</button>
            <button onClick={manejarDescargar} disabled={epsilonObjetivo <= 0 || sesion.probetaDestruida}>Descargar</button>
          </div>
          {deformacionPermanenteUltima !== null && (
            <p className="advertencia">Deformación permanente tras la descarga: ε_p = {deformacionPermanenteUltima.toFixed(5)}</p>
          )}
          <hr className="separador" />
          <div className="fila">
            <button className="peligro" onClick={manejarFalla} disabled={sesion.probetaDestruida || material.propiedades.epsilonF === undefined}>
              Forzar hasta la falla
            </button>
            <button onClick={manejarNuevaProbeta}>Nueva probeta</button>
          </div>
          {sesion.probetaDestruida && <p className="advertencia">Probeta fracturada. Use «Nueva probeta» para continuar.</p>}
        </div>

        {/* Zona D: datos y análisis */}
        <div className="zona-d panel">
          <div className="zona-etiqueta">Zona D · Datos y análisis</div>

          <label className="fila" style={{ alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mostrarGrafico} onChange={(e) => setMostrarGrafico(e.target.checked)} />
            <span style={{ flex: 'none' }}>Mostrar gráfico σ-ε en vivo</span>
          </label>
          {mostrarGrafico && (
            <GraficoXY
              curva={curvaReferencia}
              puntoActual={{ x: epsilonObjetivo, y: sigmaActual }}
              puntosRegistrados={puntosGraficados}
              xMax={limiteEps}
              yMax={sigmaMaxPosible}
              xLabel="ε"
              yLabel="σ (MPa)"
            />
          )}

          <hr className="separador" />
          <h3>Mediciones registradas ({sesion.mediciones.length})</h3>
          {sesion.mediciones.length === 0 ? (
            <p className="nota">Aplique carga en la Zona C y presione «Registrar punto» para ir guardando datos.</p>
          ) : (
            <table className="tabla-datos">
              <thead>
                <tr><th>#</th><th>Fuerza (N)</th><th>Alargamiento (mm)</th><th>ε transversal</th></tr>
              </thead>
              <tbody>
                {sesion.mediciones.map((p, i) => (
                  <tr key={p.id} onClick={() => setIndiceSeleccionado(i)} style={{ cursor: 'pointer', background: i === indiceSeleccionado ? '#eaf1f7' : undefined }}>
                    <td>{i}</td>
                    <td>{p.lecturas.fuerza.valor ?? '—'}</td>
                    <td>{p.lecturas.alargamiento.valor ?? '—'}</td>
                    <td>{p.lecturas.deformacionTransversal.valor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sesion.mediciones.length > 0 && (
            <>
              <hr className="separador" />
              <h3>Calcule y compare</h3>
              <div className="campo">
                <label>Punto a analizar</label>
                <select value={indiceSeleccionado} onChange={(e) => setIndiceSeleccionado(Number(e.target.value))}>
                  {sesion.mediciones.map((_, i) => <option key={i} value={i}>Punto {i}</option>)}
                </select>
              </div>
              <div className="fila campo">
                {(['sigma', 'epsilon'] as const).map((variable) => (
                  <div key={variable}>
                    <label>{variable === 'sigma' ? 'σ calculado (MPa)' : 'ε calculado'}</label>
                    <input type="number" value={sesion.calculosEstudiante[variable] ?? ''} onChange={(e) => registrarCalculo(variable, Number(e.target.value))} />
                  </div>
                ))}
              </div>
              <div className="fila campo">
                {(['E', 'nu'] as const).map((variable) => (
                  <div key={variable}>
                    <label>{variable === 'E' ? 'E calculado (MPa)' : 'ν calculado'}</label>
                    <input type="number" value={sesion.calculosEstudiante[variable] ?? ''} onChange={(e) => registrarCalculo(variable, Number(e.target.value))} />
                  </div>
                ))}
              </div>

              {hayCalculo && puntoRef !== undefined && sigmaRef !== undefined && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="σ (esfuerzo)" valorEstudiante={sesion.calculosEstudiante.sigma} valorReferencia={sigmaRef} unidad="MPa" />
                  <FilaValidacion etiqueta="ε (deformación unitaria)" valorEstudiante={sesion.calculosEstudiante.epsilon} valorReferencia={puntoRef} unidad="" />
                  {ERef !== undefined && <FilaValidacion etiqueta="E (módulo de Young)" valorEstudiante={sesion.calculosEstudiante.E} valorReferencia={ERef} unidad="MPa" />}
                  {nuRef !== undefined && puntoRef <= (epsY ?? 0) && <FilaValidacion etiqueta="ν (Poisson, solo válido en zona elástica)" valorEstudiante={sesion.calculosEstudiante.nu} valorReferencia={nuRef} unidad="" />}
                </TablaValidacion>
              )}
            </>
          )}

          <hr className="separador" />
          <h3>Notas</h3>
          <textarea
            rows={5}
            value={sesion.conclusiones}
            onChange={(e) => registrarConclusiones(e.target.value)}
            placeholder="Comportamiento dúctil o frágil, límite de fluencia, resistencia última, deformación a la fractura…"
          />

          <hr className="separador" />
          <div className="fila">
            <button onClick={() => exportarMedicionesCSV(sesion)} disabled={sesion.mediciones.length === 0}>Exportar CSV</button>
            <button onClick={() => exportarSesionJSON(sesion)}>Exportar JSON</button>
            <button onClick={() => window.print()}>Imprimir</button>
          </div>
        </div>
      </div>
    </div>
  );
}

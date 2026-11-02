import { useMemo, useState } from 'react';
import { EtapasStepper } from '../../components/EtapasStepper';
import { MaterialSelector } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { LecturasPanel } from '../../components/LecturasPanel';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { exportarMedicionesCSV, exportarSesionJSON } from '../../trial/exportar';
import { obtenerMaterial } from '../../engine/materials';
import {
  esfuerzoEnDeformacion,
  deformacionFluencia,
  deformacionPermanenteTrasDescarga,
  deformacionTransversal,
} from '../../engine/mechanics/axial';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';
import { CompressionSVG } from './CompressionSVG';
import type { LecturaInstrumento } from '../../engine/types';

const AMPLIFICACION_VISUAL = 25;

type TipoSeccionLocal = 'circular' | 'rectangular';

function limiteDeformacion(materialId: string): number {
  const m = obtenerMaterial(materialId);
  if (!m) return 0.01;
  const epsF = m.propiedades.epsilonF;
  if (m.modelo === 'elastico_plastico_bilineal') return epsF !== undefined ? epsF * 0.97 : 0.05;
  if (epsF !== undefined) return epsF * 0.9;
  return 0.01;
}

export function CompressionBench({ onVolver }: { onVolver: () => void }) {
  const {
    sesion,
    irAEtapa,
    avanzar,
    retroceder,
    setMaterial,
    registrarPrediccion,
    agregarMedicion,
    registrarCalculo,
    registrarConclusiones,
    marcarProbetaDestruida,
    reiniciarEnsayo,
  } = useSesionEnsayo('banco-2-compresion', 'astm-a36');

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('circular');
  const [d, setD] = useState(20);
  const [b, setB] = useState(20);
  const [h, setH] = useState(20);
  const [L, setL] = useState(60);

  const [epsilonObjetivo, setEpsilonObjetivo] = useState(0);
  const [epsilonMaxAlcanzado, setEpsilonMaxAlcanzado] = useState(0);
  const [calibradoCelda, setCalibradoCelda] = useState(false);
  const [calibradoComparador, setCalibradoComparador] = useState(false);
  const [calibradoExtensometro, setCalibradoExtensometro] = useState(false);
  const [deformacionPermanenteUltima, setDeformacionPermanenteUltima] = useState<number | null>(null);
  const [epsilonesRegistrados, setEpsilonesRegistrados] = useState<number[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [probetasUsadas, setProbetasUsadas] = useState(1);
  const [pPredicho, setPPredicho] = useState(5000);

  const material = obtenerMaterial(sesion.materialId)!;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);

  const A = seccion?.area_mm2 ?? 1;
  const rMin = seccion ? Math.min(seccion.rx_mm, seccion.ry_mm) : 1;
  const esbeltez = L / rMin;
  const limiteEps = limiteDeformacion(sesion.materialId);
  const epsY = deformacionFluencia(material);

  const sigmaActual = esfuerzoEnDeformacion(material, epsilonObjetivo) ?? 0;
  const PActual = sigmaActual * A;
  const acortamientoActual = epsilonObjetivo * L;
  const pasoSlider = limiteEps / 500;
  const progresoEnsayo = limiteEps > 0 ? epsilonObjetivo / limiteEps : 0;

  const sigmaMaxPosible = esfuerzoEnDeformacion(material, limiteEps) ?? material.propiedades.sigmaU_MPa ?? material.propiedades.sigmaY_MPa ?? (material.propiedades.E_MPa ?? 200000) * limiteEps;
  const celdaCarga = elegirCeldaCarga(sigmaMaxPosible * A);

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
    const acortVerdadero = epsilonObjetivo * L;
    const epsTransVerdadero = deformacionTransversal(epsilonObjetivo, material.propiedades.nu ?? 0);
    const opciones = (id: string) => ({ semillaEnsayo: sesion.semilla, indicePunto: sesion.mediciones.length, calibrado: id === 'fuerza' ? calibradoCelda : id === 'acortamiento' ? calibradoComparador : calibradoExtensometro });

    const lecturas: Record<string, LecturaInstrumento> = {
      fuerza: medir(PVerdadero, celdaCarga, opciones('fuerza')),
      acortamiento: medir(acortVerdadero, INSTRUMENTOS.comparadorDigital25mm, opciones('acortamiento')),
      deformacionTransversal: medir(epsTransVerdadero, INSTRUMENTOS.extensometroTransversal, opciones('deformacionTransversal')),
    };
    agregarMedicion(lecturas);
    setEpsilonesRegistrados((arr) => [...arr, epsilonObjetivo]);
  }

  const puntoRef = epsilonesRegistrados[indiceSeleccionado];
  const sigmaRef = puntoRef !== undefined ? esfuerzoEnDeformacion(material, puntoRef) : undefined;
  const ERef = material.propiedades.E_MPa;
  const nuRef = material.propiedades.nu;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Banco 2 — Compresión axial</div>
          <div className="subtitulo">Configure, prediga, ejecute, mida y valide un ensayo de compresión.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <EtapasStepper etapaActual={sesion.etapaActual} onIr={irAEtapa} />

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
              <input type="number" value={d} min={5} max={80} onChange={(e) => setD(Number(e.target.value))} />
            </div>
          ) : (
            <div className="fila campo">
              <div>
                <label>Base b (mm)</label>
                <input type="number" value={b} min={5} max={80} onChange={(e) => setB(Number(e.target.value))} />
              </div>
              <div>
                <label>Altura h (mm)</label>
                <input type="number" value={h} min={5} max={80} onChange={(e) => setH(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className="campo">
            <label>Longitud calibrada L (mm)</label>
            <input type="number" value={L} min={20} max={300} onChange={(e) => setL(Number(e.target.value))} />
          </div>

          <hr className="separador" />
          <p className="nota">A = {A.toFixed(1)} mm² · r_min = {rMin.toFixed(2)} mm · esbeltez L/r = {esbeltez.toFixed(1)}</p>
          {esbeltez > 30 && (
            <p className="advertencia">
              Esbeltez relativamente alta (L/r = {esbeltez.toFixed(1)}): esta probeta podría pandear antes de fallar por
              compresión pura. Para analizar ese fenómeno use el Banco de Pandeo, no este banco.
            </p>
          )}
          <p className="nota">Probetas usadas en esta sesión: {probetasUsadas}</p>
        </div>

        {/* Zona B: representación del banco */}
        <div className="zona-b panel">
          <div className="zona-etiqueta">Zona B · Banco de ensayo</div>
          <CompressionSVG
            epsilon={epsilonObjetivo}
            amplificacion={AMPLIFICACION_VISUAL}
            estado={estadoSvg}
            acortamientoMm={acortamientoActual}
            progreso={progresoEnsayo}
          />
        </div>

        {/* Zona C: instrumentación y control */}
        <div className="zona-c panel">
          <div className="zona-etiqueta">Zona C · Instrumentación y control</div>
          <div className="fila campo">
            <button onClick={() => setCalibradoCelda(true)} disabled={calibradoCelda}>Cero: celda de carga</button>
            <button onClick={() => setCalibradoComparador(true)} disabled={calibradoComparador}>Cero: comparador</button>
            <button onClick={() => setCalibradoExtensometro(true)} disabled={calibradoExtensometro}>Cero: extensómetro</button>
          </div>
          <div className="campo">
            <label>Deformación controlada ε = {epsilonObjetivo.toFixed(5)} (máx. admitido en este ensayo: {limiteEps.toFixed(4)})</label>
            <div className="control-paso">
              <button className="boton-paso" onClick={() => ajustarPaso(-1)} disabled={sesion.probetaDestruida || epsilonObjetivo <= 0} aria-label="Disminuir deformación">−</button>
              <input
                type="range"
                min={0}
                max={limiteEps}
                step={pasoSlider}
                value={epsilonObjetivo}
                onChange={(e) => manejarSlider(Number(e.target.value))}
                disabled={sesion.probetaDestruida}
              />
              <button className="boton-paso" onClick={() => ajustarPaso(1)} disabled={sesion.probetaDestruida || epsilonObjetivo >= limiteEps} aria-label="Aumentar deformación">+</button>
            </div>
            <p className="nota">Cada clic en − / + aplica un paso fino de Δε = {pasoSlider.toFixed(6)}, para ajustar la carga con precisión.</p>
          </div>

          <p className="nota">Lecturas instantáneas (valor verdadero, antes de instrumentar):</p>
          <LecturasPanel
            lecturas={[
              { etiqueta: 'Fuerza', valor: PActual.toFixed(0), unidad: 'N' },
              { etiqueta: 'Esfuerzo σ', valor: sigmaActual.toFixed(2), unidad: 'MPa' },
              { etiqueta: 'Acortamiento', valor: acortamientoActual.toFixed(4), unidad: 'mm' },
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
          <button className="peligro" onClick={manejarFalla} disabled={sesion.probetaDestruida || material.propiedades.epsilonF === undefined}>
            Forzar hasta la falla (destructivo)
          </button>
          {sesion.probetaDestruida && (
            <>
              <p className="advertencia">Probeta destruida. Reemplácela para continuar.</p>
              <button className="primario" onClick={manejarNuevaProbeta}>Nueva probeta</button>
            </>
          )}
        </div>

        {/* Zona D: análisis y resultados (depende de la etapa) */}
        <div className="zona-d panel">
          <div className="zona-etiqueta">Zona D · Análisis</div>

          {sesion.etapaActual === 'preparacion' && <p>Configure el ensayo en la Zona A y pase a «Predicción».</p>}

          {sesion.etapaActual === 'prediccion' && (
            <div>
              <h3>Predicción teórica</h3>
              <div className="campo">
                <label>Fuerza objetivo para la predicción (N)</label>
                <input type="number" value={pPredicho} onChange={(e) => setPPredicho(Number(e.target.value))} />
              </div>
              <p className="nota">Calcule σ, ε, ΔL y E para esta fuerza asumiendo régimen elástico, antes de ejecutar el ensayo.</p>
              {(['sigma', 'epsilon', 'deltaL', 'E'] as const).map((variable) => (
                <div className="campo" key={variable}>
                  <label>{variable}</label>
                  <input
                    type="number"
                    onChange={(e) => registrarPrediccion({ variable, valor: Number(e.target.value), unidad: variable === 'sigma' || variable === 'E' ? 'MPa' : variable === 'deltaL' ? 'mm' : '—' })}
                  />
                </div>
              ))}
            </div>
          )}

          {sesion.etapaActual === 'instrumentacion' && (
            <div>
              <h3>Instrumentos</h3>
              <ul>
                <li>{celdaCarga.nombre}: rango [{celdaCarga.rango.join(', ')}] N, resolución {celdaCarga.resolucion} N — {calibradoCelda ? 'calibrada' : 'sin calibrar'}</li>
                <li>{INSTRUMENTOS.comparadorDigital25mm.nombre}: resolución {INSTRUMENTOS.comparadorDigital25mm.resolucion} mm — {calibradoComparador ? 'calibrado' : 'sin calibrar'}</li>
                <li>{INSTRUMENTOS.extensometroTransversal.nombre}: resolución {INSTRUMENTOS.extensometroTransversal.resolucion} mm/mm — {calibradoExtensometro ? 'calibrado' : 'sin calibrar'}</li>
              </ul>
              <p className="nota">Realice la puesta a cero de cada instrumento en la Zona C antes de ejecutar.</p>
            </div>
          )}

          {sesion.etapaActual === 'ejecucion' && <p>Use el control de deformación en la Zona C. Cuando tenga una lectura estable, pase a «Registro».</p>}

          {(sesion.etapaActual === 'registro' || sesion.etapaActual === 'calculo' || sesion.etapaActual === 'validacion') && (
            <div>
              <h3>Mediciones registradas ({sesion.mediciones.length})</h3>
              <table className="tabla-datos">
                <thead>
                  <tr><th>#</th><th>Fuerza (N)</th><th>Acortamiento (mm)</th><th>ε transversal</th></tr>
                </thead>
                <tbody>
                  {sesion.mediciones.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i}</td>
                      <td>{p.lecturas.fuerza.valor ?? '—'}</td>
                      <td>{p.lecturas.acortamiento.valor ?? '—'}</td>
                      <td>{p.lecturas.deformacionTransversal.valor ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sesion.mediciones.length < 5 && <p className="advertencia">Registre al menos 5 puntos a distintos niveles de carga.</p>}
            </div>
          )}

          {sesion.etapaActual === 'calculo' && sesion.mediciones.length > 0 && (
            <div>
              <h3>Cálculo</h3>
              <div className="campo">
                <label>Punto a analizar</label>
                <select value={indiceSeleccionado} onChange={(e) => setIndiceSeleccionado(Number(e.target.value))}>
                  {sesion.mediciones.map((_, i) => <option key={i} value={i}>Punto {i}</option>)}
                </select>
              </div>
              {(['sigma', 'epsilon', 'E', 'nu'] as const).map((variable) => (
                <div className="campo" key={variable}>
                  <label>{variable}</label>
                  <input type="number" onChange={(e) => registrarCalculo(variable, Number(e.target.value))} />
                </div>
              ))}
            </div>
          )}

          {sesion.etapaActual === 'validacion' && puntoRef !== undefined && sigmaRef !== undefined && (
            <div>
              <h3>Validación — punto {indiceSeleccionado}</h3>
              <TablaValidacion>
                <FilaValidacion etiqueta="σ (esfuerzo)" valorEstudiante={sesion.calculosEstudiante.sigma} valorReferencia={sigmaRef} unidad="MPa" />
                <FilaValidacion etiqueta="ε (deformación unitaria)" valorEstudiante={sesion.calculosEstudiante.epsilon} valorReferencia={puntoRef} unidad="" />
                {ERef !== undefined && <FilaValidacion etiqueta="E (módulo de Young)" valorEstudiante={sesion.calculosEstudiante.E} valorReferencia={ERef} unidad="MPa" />}
                {nuRef !== undefined && puntoRef <= (epsY ?? 0) && <FilaValidacion etiqueta="ν (Poisson, solo válido en zona elástica)" valorEstudiante={sesion.calculosEstudiante.nu} valorReferencia={nuRef} unidad="" />}
              </TablaValidacion>
            </div>
          )}

          {sesion.etapaActual === 'interpretacion' && (
            <div>
              <h3>Conclusiones</h3>
              <textarea rows={8} value={sesion.conclusiones} onChange={(e) => registrarConclusiones(e.target.value)} placeholder="Describa el comportamiento observado, la seguridad, diferencias con el modelo teórico y limitaciones del ensayo." />
            </div>
          )}

          {sesion.etapaActual === 'exportacion' && (
            <div>
              <h3>Exportar</h3>
              <div className="fila campo">
                <button onClick={() => exportarMedicionesCSV(sesion)}>Exportar mediciones (CSV)</button>
                <button onClick={() => exportarSesionJSON(sesion)}>Exportar sesión (JSON)</button>
              </div>
              <button onClick={() => window.print()}>Imprimir informe</button>
            </div>
          )}

          <hr className="separador" />
          <div className="fila">
            <button onClick={retroceder}>← Etapa anterior</button>
            <button className="primario" onClick={avanzar}>Siguiente etapa →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

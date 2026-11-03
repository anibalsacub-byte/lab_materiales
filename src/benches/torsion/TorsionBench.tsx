import { useMemo, useState } from 'react';
import { MaterialSelector } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { LecturasPanel } from '../../components/LecturasPanel';
import { GraficoXY } from '../../components/svg/GraficoXY';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { exportarMedicionesCSV, exportarSesionJSON } from '../../trial/exportar';
import { obtenerMaterial, moduloCorte } from '../../engine/materials';
import { momentoPolarInerciaCircular, anguloGiro, esfuerzoCortanteMaximoTorsion } from '../../engine/mechanics/torsion';
import { medir, elegirTorquimetro, elegirIndicadorAngular } from '../../engine/measurement';
import { TorsionSVG } from './TorsionSVG';
import type { LecturaInstrumento } from '../../engine/types';

const AMPLIFICACION_VISUAL = 9;
const RAD_A_DEG = 180 / Math.PI;

type TipoEje = 'maciza' | 'tubular';

export function TorsionBench({ onVolver }: { onVolver: () => void }) {
  const { sesion, setMaterial, agregarMedicion, registrarCalculo, registrarConclusiones, reiniciarEnsayo } =
    useSesionEnsayo('banco-5-torsion', 'sae-1018');

  const [tipoEje, setTipoEje] = useState<TipoEje>('maciza');
  const [dExt, setDExt] = useState(12);
  const [dInt, setDInt] = useState(6);
  const [L, setL] = useState(400);
  const [torqueAplicado, setTorqueAplicado] = useState(0);
  const [calibradoTorquimetro, setCalibradoTorquimetro] = useState(false);
  const [calibradoAngular, setCalibradoAngular] = useState(false);
  const [torquesRegistrados, setTorquesRegistrados] = useState<number[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [mostrarGrafico, setMostrarGrafico] = useState(true);

  const material = obtenerMaterial(sesion.materialId)!;
  const G = moduloCorte(material);
  const sigmaY = material.propiedades.sigmaY_MPa;
  const sigmaU = material.propiedades.sigmaU_MPa;
  // No se modela plasticidad en torsión: el ensayo se limita a un régimen elástico seguro,
  // estimado con un criterio de fluencia por cortante aproximado (Tresca, τY ≈ 0.5·σY).
  const tauYEstimado = sigmaY !== undefined ? 0.5 * sigmaY : sigmaU !== undefined ? 0.35 * sigmaU : undefined;

  const J = useMemo(() => {
    try {
      return tipoEje === 'maciza' ? momentoPolarInerciaCircular(dExt) : momentoPolarInerciaCircular(dExt, dInt);
    } catch {
      return null;
    }
  }, [tipoEje, dExt, dInt]);

  const r = dExt / 2;
  const Jval = J ?? 1;
  const Gval = G ?? 80000;

  const Tmax = useMemo(() => {
    if (tauYEstimado !== undefined) return (tauYEstimado * Jval) / r / 1.0 * 0.95;
    return (0.3 * Gval * Jval) / L; // límite de respaldo: ~0.3 rad si no hay dato de fluencia
  }, [tauYEstimado, Jval, r, Gval, L]);

  const Tseguro = Math.min(torqueAplicado, Tmax);
  const pasoTorque = Tmax / 500;
  const phiRad = anguloGiro(Tseguro, L, Gval, Jval);
  const phiDeg = phiRad * RAD_A_DEG;
  const tauMax = esfuerzoCortanteMaximoTorsion(Tseguro, r, Jval);
  const phiMaxRad = anguloGiro(Tmax, L, Gval, Jval);
  const phiMaxDeg = phiMaxRad * RAD_A_DEG;
  const progresoAngular = phiMaxDeg > 0 ? Math.min(Math.abs(phiDeg) / phiMaxDeg, 1) : 0;
  const cercaDelLimite = Tseguro / Tmax > 0.85;

  const torquimetro = elegirTorquimetro(Tmax);
  const indicadorAngular = elegirIndicadorAngular(phiMaxDeg);

  const curvaReferencia = useMemo(() => [{ x: 0, y: 0 }, { x: Tmax / 1000, y: phiMaxDeg }], [Tmax, phiMaxDeg]);
  const puntosGraficados = torquesRegistrados.map((T) => ({ x: T / 1000, y: anguloGiro(T, L, Gval, Jval) * RAD_A_DEG }));

  function registrarPunto() {
    const opciones = () => ({ semillaEnsayo: sesion.semilla, indicePunto: sesion.mediciones.length, calibrado: true });
    const lecturas: Record<string, LecturaInstrumento> = {
      torque: medir(Tseguro, torquimetro, { ...opciones(), calibrado: calibradoTorquimetro }),
      angulo: medir(phiDeg, indicadorAngular, { ...opciones(), calibrado: calibradoAngular }),
    };
    agregarMedicion(lecturas);
    setTorquesRegistrados((arr) => [...arr, Tseguro]);
    setIndiceSeleccionado(sesion.mediciones.length);
  }

  function manejarNuevoEnsayo() {
    reiniciarEnsayo();
    setTorqueAplicado(0);
    setTorquesRegistrados([]);
    setIndiceSeleccionado(0);
  }

  const torqueRef = torquesRegistrados[indiceSeleccionado];
  const tauMaxRef = torqueRef !== undefined ? esfuerzoCortanteMaximoTorsion(torqueRef, r, Jval) : undefined;
  const phiRef = torqueRef !== undefined ? anguloGiro(torqueRef, L, Gval, Jval) : undefined;
  const hayCalculo = sesion.calculosEstudiante.J !== undefined || sesion.calculosEstudiante.tauMax !== undefined || sesion.calculosEstudiante.phi !== undefined || sesion.calculosEstudiante.G !== undefined;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Banco 5 — Torsión de ejes circulares</div>
          <div className="subtitulo">Aplique un par torsor y observe el giro y el esfuerzo cortante en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <div className="banco-grid">
        <div className="zona-a panel">
          <div className="zona-etiqueta">Zona A · Configuración</div>
          <MaterialSelector materialId={sesion.materialId} onChange={setMaterial} soloIsotropicos />

          <div className="campo">
            <label>Tipo de eje</label>
            <select value={tipoEje} onChange={(e) => setTipoEje(e.target.value as TipoEje)}>
              <option value="maciza">Circular macizo</option>
              <option value="tubular">Circular tubular (hueco)</option>
            </select>
          </div>
          <div className="campo">
            <label>Diámetro exterior (mm)</label>
            <input type="number" value={dExt} min={4} max={60} onChange={(e) => setDExt(Number(e.target.value))} />
          </div>
          {tipoEje === 'tubular' && (
            <div className="campo">
              <label>Diámetro interior (mm)</label>
              <input type="number" value={dInt} min={1} max={dExt - 1} onChange={(e) => setDInt(Number(e.target.value))} />
            </div>
          )}
          <div className="campo">
            <label>Longitud L (mm)</label>
            <input type="number" value={L} min={50} max={2000} onChange={(e) => setL(Number(e.target.value))} />
          </div>

          <hr className="separador" />
          {G === undefined ? (
            <p className="advertencia">Este material no tiene módulo de corte definido; elija otro para operar el banco.</p>
          ) : (
            <>
              <p className="nota">J = {Jval.toExponential(3)} mm⁴ · G = {Gval.toFixed(0)} MPa</p>
              <p className="nota">T máx. de ensayo = {(Tmax / 1000).toFixed(3)} N·m</p>
              {tauYEstimado !== undefined ? (
                <p className="nota">
                  Límite estimado por fluencia a cortante (Tresca, τY ≈ 0.5·σY): τY ≈ {tauYEstimado.toFixed(1)} MPa. Este
                  banco solo modela el régimen elástico; no se simula fluencia ni falla por torsión.
                </p>
              ) : (
                <p className="advertencia">
                  Sin dato de fluencia para estimar el límite elástico: el ensayo se acota a un giro pequeño (~0.3 rad)
                  como margen de seguridad conservador.
                </p>
              )}
              <p className="nota">Válido solo para secciones circulares: J no es la constante de torsión de otros perfiles.</p>
            </>
          )}
        </div>

        <div className="zona-b panel">
          <div className="zona-etiqueta">Zona B · Banco de ensayo</div>
          <TorsionSVG phiRad={phiRad} phiDeg={phiDeg} amplificacion={AMPLIFICACION_VISUAL} progreso={progresoAngular} cercaDelLimite={cercaDelLimite} />
        </div>

        <div className="zona-c panel">
          <div className="zona-etiqueta">Zona C · Instrumentación y control</div>
          <div className="fila campo">
            <button onClick={() => setCalibradoTorquimetro(true)} disabled={calibradoTorquimetro}>Cero: torquímetro</button>
            <button onClick={() => setCalibradoAngular(true)} disabled={calibradoAngular}>Cero: indicador angular</button>
          </div>
          <div className="campo">
            <label>Par torsor aplicado T = {(Tseguro / 1000).toFixed(3)} N·m (máx. de ensayo: {(Tmax / 1000).toFixed(3)} N·m)</label>
            <div className="control-paso">
              <button className="boton-paso" onClick={() => setTorqueAplicado((t) => Math.max(t - pasoTorque, 0))} disabled={torqueAplicado <= 0 || G === undefined} aria-label="Disminuir torque">−</button>
              <input type="range" min={0} max={Tmax} step={pasoTorque} value={torqueAplicado} onChange={(e) => setTorqueAplicado(Number(e.target.value))} disabled={G === undefined} />
              <button className="boton-paso" onClick={() => setTorqueAplicado((t) => Math.min(t + pasoTorque, Tmax))} disabled={torqueAplicado >= Tmax || G === undefined} aria-label="Aumentar torque">+</button>
            </div>
          </div>

          <LecturasPanel
            lecturas={[
              { etiqueta: 'Ángulo de giro', valor: phiDeg.toFixed(3), unidad: '°' },
              { etiqueta: 'Cortante máx. (τ)', valor: tauMax.toFixed(2), unidad: 'MPa' },
            ]}
          />
          <div className="fila campo">
            <button className="primario" onClick={registrarPunto} disabled={G === undefined}>Registrar punto</button>
            <button onClick={manejarNuevoEnsayo}>Nuevo eje</button>
          </div>
          <hr className="separador" />
          <p className="nota">Torquímetro: {torquimetro.nombre} · Indicador angular: {indicadorAngular.nombre}.</p>
        </div>

        <div className="zona-d panel">
          <div className="zona-etiqueta">Zona D · Datos y análisis</div>

          <label className="fila" style={{ alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mostrarGrafico} onChange={(e) => setMostrarGrafico(e.target.checked)} />
            <span style={{ flex: 'none' }}>Mostrar gráfico T-φ en vivo</span>
          </label>
          {mostrarGrafico && (
            <GraficoXY
              curva={curvaReferencia}
              puntoActual={{ x: Tseguro / 1000, y: phiDeg }}
              puntosRegistrados={puntosGraficados}
              xMax={Tmax / 1000}
              yMax={Math.max(phiMaxDeg, 0.01)}
              xLabel="T (N·m)"
              yLabel="φ (°)"
            />
          )}

          <hr className="separador" />
          <h3>Mediciones registradas ({sesion.mediciones.length})</h3>
          {sesion.mediciones.length === 0 ? (
            <p className="nota">Aplique torque en la Zona C y presione «Registrar punto» para ir guardando datos.</p>
          ) : (
            <table className="tabla-datos">
              <thead><tr><th>#</th><th>Torque (N·mm)</th><th>Ángulo (°)</th></tr></thead>
              <tbody>
                {sesion.mediciones.map((p, i) => (
                  <tr key={p.id} onClick={() => setIndiceSeleccionado(i)} style={{ cursor: 'pointer', background: i === indiceSeleccionado ? '#eaf1f7' : undefined }}>
                    <td>{i}</td>
                    <td>{p.lecturas.torque.valor ?? '—'}</td>
                    <td>{p.lecturas.angulo.valor ?? '—'}</td>
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
                <div><label>J calculado (mm⁴)</label><input type="number" value={sesion.calculosEstudiante.J ?? ''} onChange={(e) => registrarCalculo('J', Number(e.target.value))} /></div>
                <div><label>τ máx. calculado (MPa)</label><input type="number" value={sesion.calculosEstudiante.tauMax ?? ''} onChange={(e) => registrarCalculo('tauMax', Number(e.target.value))} /></div>
              </div>
              <div className="fila campo">
                <div><label>φ calculado (rad)</label><input type="number" value={sesion.calculosEstudiante.phi ?? ''} onChange={(e) => registrarCalculo('phi', Number(e.target.value))} /></div>
                <div><label>G calculado (MPa)</label><input type="number" value={sesion.calculosEstudiante.G ?? ''} onChange={(e) => registrarCalculo('G', Number(e.target.value))} /></div>
              </div>

              {hayCalculo && torqueRef !== undefined && tauMaxRef !== undefined && phiRef !== undefined && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="J (momento polar de inercia)" valorEstudiante={sesion.calculosEstudiante.J} valorReferencia={Jval} unidad="mm⁴" />
                  <FilaValidacion etiqueta="τ máximo" valorEstudiante={sesion.calculosEstudiante.tauMax} valorReferencia={tauMaxRef} unidad="MPa" />
                  <FilaValidacion etiqueta="φ (ángulo de giro)" valorEstudiante={sesion.calculosEstudiante.phi} valorReferencia={phiRef} unidad="rad" />
                  {G !== undefined && <FilaValidacion etiqueta="G (módulo de corte)" valorEstudiante={sesion.calculosEstudiante.G} valorReferencia={G} unidad="MPa" />}
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
            placeholder="Rigidez torsional, efecto de usar un eje tubular en vez de macizo, comparación entre materiales…"
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

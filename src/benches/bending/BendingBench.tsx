import { useMemo, useState } from 'react';
import { MaterialSelector } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { LecturasPanel } from '../../components/LecturasPanel';
import { GraficoXY } from '../../components/svg/GraficoXY';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { exportarMedicionesCSV, exportarSesionJSON } from '../../trial/exportar';
import { obtenerMaterial } from '../../engine/materials';
import {
  reaccionIzquierda,
  reaccionDerecha,
  momentoMaximo,
  deflexionMaxima,
  cortante,
  momento,
  esfuerzoFlexion,
  type ApoyoViga,
  type TipoCargaViga,
  type ParametrosViga,
} from '../../engine/mechanics/bending';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS } from '../../engine/measurement';
import { BendingSVG } from './BendingSVG';
import type { LecturaInstrumento } from '../../engine/types';

const AMPLIFICACION_VISUAL = 35;
const N_MUESTRAS_DIAGRAMA = 40;

type TipoSeccionLocal = 'circular' | 'rectangular';

/** Carga máxima de ensayo: limita σ_max a 0.95·σY si hay dato de fluencia; si no, limita la
 *  deflexión a L/200 (criterio de servicio conservador habitual cuando no hay límite de resistencia). */
function cargaMaxima(paramsUnitario: ParametrosViga, E_MPa: number, Ix_mm4: number, c_mm: number, sigmaY_MPa?: number): number {
  const Mmax = Math.abs(momentoMaximo(paramsUnitario).valor);
  const sigmaUnit = esfuerzoFlexion(Mmax, c_mm, Ix_mm4);
  if (sigmaY_MPa !== undefined && sigmaUnit > 0) return (0.95 * sigmaY_MPa) / sigmaUnit;
  const deltaUnit = deflexionMaxima(paramsUnitario, E_MPa, Ix_mm4).valor;
  return deltaUnit > 0 ? paramsUnitario.L_mm / 200 / deltaUnit : 1000;
}

export function BendingBench({ onVolver }: { onVolver: () => void }) {
  const { sesion, setMaterial, agregarMedicion, registrarCalculo, registrarConclusiones, reiniciarEnsayo } =
    useSesionEnsayo('banco-3-flexion', 'sae-1018');

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('rectangular');
  const [d, setD] = useState(30);
  const [b, setB] = useState(20);
  const [h, setH] = useState(40);
  const [L, setL] = useState(1000);
  const [apoyo, setApoyo] = useState<ApoyoViga>('simple');
  const [tipoCarga, setTipoCarga] = useState<TipoCargaViga>('puntual');
  const [aMm, setAMm] = useState(500);
  const [cargaAplicada, setCargaAplicada] = useState(0);
  const [calibradoDeflectometro, setCalibradoDeflectometro] = useState(false);
  const [puntosRegistrados, setPuntosRegistrados] = useState<number[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [mostrarDiagramas, setMostrarDiagramas] = useState(true);
  const [mostrarGraficoCargaDeflexion, setMostrarGraficoCargaDeflexion] = useState(false);

  const material = obtenerMaterial(sesion.materialId)!;
  const E = material.propiedades.E_MPa ?? 200000;
  const sigmaY = material.propiedades.sigmaY_MPa;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);

  const Ix = seccion?.Ix_mm4 ?? 1;
  const c = tipoSeccion === 'circular' ? d / 2 : h / 2;
  const aValida = apoyo === 'simple' ? Math.min(Math.max(aMm, 1), L - 1) : L;

  const paramsUnitario: ParametrosViga = useMemo(
    () =>
      tipoCarga === 'puntual'
        ? { apoyo, tipoCarga, L_mm: L, P_N: 1, a_mm: apoyo === 'simple' ? aValida : undefined }
        : { apoyo, tipoCarga, L_mm: L, w_N_mm: 1 },
    [apoyo, tipoCarga, L, aValida],
  );

  const cargaMax = useMemo(() => Math.max(cargaMaxima(paramsUnitario, E, Ix, c, sigmaY), 0.01), [paramsUnitario, E, Ix, c, sigmaY]);
  const cargaSegura = Math.min(cargaAplicada, cargaMax);
  const pasoCarga = cargaMax / 500;

  const params: ParametrosViga = useMemo(
    () =>
      tipoCarga === 'puntual'
        ? { apoyo, tipoCarga, L_mm: L, P_N: cargaSegura, a_mm: apoyo === 'simple' ? aValida : undefined }
        : { apoyo, tipoCarga, L_mm: L, w_N_mm: cargaSegura },
    [apoyo, tipoCarga, L, cargaSegura, aValida],
  );

  const Rizq = reaccionIzquierda(params);
  const Rder = reaccionDerecha(params);
  const { valor: Mmax, x_mm: xMmax } = momentoMaximo(params);
  const sigmaMax = esfuerzoFlexion(Math.abs(Mmax), c, Ix);
  const { valor: deflexionActual, x_mm: xDeflexion } = deflexionMaxima(params, E, Ix);
  const cercaDelLimite = cargaSegura / cargaMax > 0.85;

  const diagramaV = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= N_MUESTRAS_DIAGRAMA; i++) {
      const x = (L * i) / N_MUESTRAS_DIAGRAMA;
      pts.push({ x, y: cortante(Math.min(x, L - 1e-6), params) });
    }
    return pts;
  }, [params, L]);
  const diagramaM = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= N_MUESTRAS_DIAGRAMA; i++) {
      const x = (L * i) / N_MUESTRAS_DIAGRAMA;
      pts.push({ x, y: momento(x, params) });
    }
    return pts;
  }, [params, L]);
  const vMax = Math.max(...diagramaV.map((p) => Math.abs(p.y)), 1);
  const mMaxAbs = Math.max(...diagramaM.map((p) => Math.abs(p.y)), 1);

  const curvaCargaDeflexion = useMemo(() => [{ x: 0, y: 0 }, { x: cargaMax, y: deflexionMaxima({ ...params, P_N: tipoCarga === 'puntual' ? cargaMax : undefined, w_N_mm: tipoCarga === 'distribuida' ? cargaMax : undefined }, E, Ix).valor }], [cargaMax, params, tipoCarga, E, Ix]);
  const puntosGraficados = puntosRegistrados.map((carga) => {
    const p2: ParametrosViga = tipoCarga === 'puntual' ? { ...params, P_N: carga } : { ...params, w_N_mm: carga };
    return { x: carga, y: deflexionMaxima(p2, E, Ix).valor };
  });

  function registrarPunto() {
    const opciones = () => ({ semillaEnsayo: sesion.semilla, indicePunto: sesion.mediciones.length, calibrado: calibradoDeflectometro });
    const lecturas: Record<string, LecturaInstrumento> = {
      deflexion: medir(deflexionActual, INSTRUMENTOS.comparadorDigital25mm, opciones()),
    };
    agregarMedicion(lecturas);
    setPuntosRegistrados((arr) => [...arr, cargaSegura]);
    setIndiceSeleccionado(sesion.mediciones.length);
  }

  function manejarNuevaViga() {
    reiniciarEnsayo();
    setCargaAplicada(0);
    setPuntosRegistrados([]);
    setIndiceSeleccionado(0);
  }

  const cargaRef = puntosRegistrados[indiceSeleccionado];
  const paramsRef: ParametrosViga | undefined = cargaRef !== undefined ? (tipoCarga === 'puntual' ? { ...params, P_N: cargaRef } : { ...params, w_N_mm: cargaRef }) : undefined;
  const RizqRef = paramsRef ? reaccionIzquierda(paramsRef) : undefined;
  const RderRef = paramsRef ? reaccionDerecha(paramsRef) : undefined;
  const MmaxRef = paramsRef ? momentoMaximo(paramsRef).valor : undefined;
  const sigmaMaxRef = paramsRef ? esfuerzoFlexion(Math.abs(MmaxRef!), c, Ix) : undefined;
  const deflexionRef = paramsRef ? deflexionMaxima(paramsRef, E, Ix).valor : undefined;
  const hayCalculo = sesion.calculosEstudiante.Rizq !== undefined || sesion.calculosEstudiante.Mmax !== undefined || sesion.calculosEstudiante.sigmaMax !== undefined || sesion.calculosEstudiante.deflexion !== undefined;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Banco 3 — Flexión de vigas</div>
          <div className="subtitulo">Configure la viga, aplique carga y observe reacciones, diagramas V-M y deflexión en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <div className="banco-grid">
        <div className="zona-a panel">
          <div className="zona-etiqueta">Zona A · Configuración</div>
          <MaterialSelector materialId={sesion.materialId} onChange={setMaterial} soloIsotropicos />

          <div className="campo">
            <label>Condición de apoyo</label>
            <select value={apoyo} onChange={(e) => setApoyo(e.target.value as ApoyoViga)}>
              <option value="simple">Simplemente apoyada</option>
              <option value="voladizo">En voladizo (empotrada-libre)</option>
            </select>
          </div>
          <div className="campo">
            <label>Tipo de carga</label>
            <select value={tipoCarga} onChange={(e) => setTipoCarga(e.target.value as TipoCargaViga)}>
              <option value="puntual">Puntual{apoyo === 'voladizo' ? ' (en el extremo libre)' : ''}</option>
              <option value="distribuida">Uniformemente distribuida</option>
            </select>
          </div>
          {tipoCarga === 'puntual' && apoyo === 'simple' && (
            <div className="campo">
              <label>Posición de la carga a (mm), desde el apoyo izquierdo</label>
              <input type="number" value={aMm} min={1} max={L - 1} onChange={(e) => setAMm(Number(e.target.value))} />
            </div>
          )}
          <div className="campo">
            <label>Tipo de sección</label>
            <select value={tipoSeccion} onChange={(e) => setTipoSeccion(e.target.value as TipoSeccionLocal)}>
              <option value="rectangular">Rectangular</option>
              <option value="circular">Circular maciza</option>
            </select>
          </div>
          {tipoSeccion === 'circular' ? (
            <div className="campo">
              <label>Diámetro d (mm)</label>
              <input type="number" value={d} min={5} max={100} onChange={(e) => setD(Number(e.target.value))} />
            </div>
          ) : (
            <div className="fila campo">
              <div><label>Base b (mm)</label><input type="number" value={b} min={5} max={150} onChange={(e) => setB(Number(e.target.value))} /></div>
              <div><label>Altura h (mm)</label><input type="number" value={h} min={5} max={200} onChange={(e) => setH(Number(e.target.value))} /></div>
            </div>
          )}
          <div className="campo">
            <label>Longitud del claro L (mm)</label>
            <input type="number" value={L} min={200} max={5000} onChange={(e) => setL(Number(e.target.value))} />
          </div>

          <hr className="separador" />
          <p className="nota">Ix = {Ix.toExponential(3)} mm⁴ · c = {c.toFixed(1)} mm</p>
          <p className="nota">Carga máx. de ensayo: {cargaMax.toFixed(2)} {tipoCarga === 'puntual' ? 'N' : 'N/mm'}</p>
          <p className="nota">
            {sigmaY !== undefined
              ? `Límite estimado por fluencia: σY ≈ ${sigmaY.toFixed(0)} MPa (ensayo limitado al 95% de ese valor).`
              : 'Sin dato de fluencia: la carga se limita por una deflexión de servicio L/200 (criterio conservador).'}
          </p>
        </div>

        <div className="zona-b panel">
          <div className="zona-etiqueta">Zona B · Banco de ensayo</div>
          <BendingSVG
            apoyo={apoyo}
            tipoCarga={tipoCarga}
            L_mm={L}
            a_mm={aValida}
            deflexionMax_mm={deflexionActual}
            amplificacion={AMPLIFICACION_VISUAL}
            cercaDelLimite={cercaDelLimite}
          />
        </div>

        <div className="zona-c panel">
          <div className="zona-etiqueta">Zona C · Instrumentación y control</div>
          <div className="fila campo">
            <button onClick={() => setCalibradoDeflectometro(true)} disabled={calibradoDeflectometro}>Cero: deflectómetro</button>
          </div>
          <div className="campo">
            <label>Carga aplicada {tipoCarga === 'puntual' ? 'P' : 'w'} = {cargaSegura.toFixed(2)} {tipoCarga === 'puntual' ? 'N' : 'N/mm'} (máx.: {cargaMax.toFixed(2)})</label>
            <div className="control-paso">
              <button className="boton-paso" onClick={() => setCargaAplicada((v) => Math.max(v - pasoCarga, 0))} disabled={cargaAplicada <= 0} aria-label="Disminuir carga">−</button>
              <input type="range" min={0} max={cargaMax} step={pasoCarga} value={cargaAplicada} onChange={(e) => setCargaAplicada(Number(e.target.value))} />
              <button className="boton-paso" onClick={() => setCargaAplicada((v) => Math.min(v + pasoCarga, cargaMax))} disabled={cargaAplicada >= cargaMax} aria-label="Aumentar carga">+</button>
            </div>
          </div>
          <LecturasPanel
            lecturas={[
              { etiqueta: 'Reacción izq.', valor: Rizq.toFixed(1), unidad: 'N' },
              { etiqueta: 'Reacción der.', valor: Rder.toFixed(1), unidad: 'N' },
              { etiqueta: 'Momento máx.', valor: (Mmax / 1000).toFixed(3), unidad: 'N·m' },
              { etiqueta: 'σ máximo', valor: sigmaMax.toFixed(2), unidad: 'MPa' },
              { etiqueta: 'Deflexión', valor: deflexionActual.toFixed(4), unidad: 'mm' },
            ]}
          />
          <p className="nota">Deflexión de referencia evaluada en x = {xDeflexion.toFixed(0)} mm · Mmax en x = {xMmax.toFixed(0)} mm.</p>
          <div className="fila campo">
            <button className="primario" onClick={registrarPunto}>Registrar punto</button>
            <button onClick={manejarNuevaViga}>Nueva viga</button>
          </div>
        </div>

        <div className="zona-d panel">
          <div className="zona-etiqueta">Zona D · Datos y análisis</div>

          <label className="fila" style={{ alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mostrarDiagramas} onChange={(e) => setMostrarDiagramas(e.target.checked)} />
            <span style={{ flex: 'none' }}>Mostrar diagramas V(x) y M(x)</span>
          </label>
          {mostrarDiagramas && (
            <>
              <GraficoXY curva={diagramaV} xMax={L} yMax={vMax * 1.15} xLabel="x (mm)" yLabel="V (N)" />
              <GraficoXY curva={diagramaM} xMax={L} yMax={mMaxAbs * 1.15} xLabel="x (mm)" yLabel="M (N·mm)" colorCurva="#b3541e" />
            </>
          )}

          <label className="fila" style={{ alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mostrarGraficoCargaDeflexion} onChange={(e) => setMostrarGraficoCargaDeflexion(e.target.checked)} />
            <span style={{ flex: 'none' }}>Mostrar gráfico carga-deflexión</span>
          </label>
          {mostrarGraficoCargaDeflexion && (
            <GraficoXY
              curva={curvaCargaDeflexion}
              puntoActual={{ x: cargaSegura, y: deflexionActual }}
              puntosRegistrados={puntosGraficados}
              xMax={cargaMax}
              yMax={Math.max(curvaCargaDeflexion[1].y, 0.01)}
              xLabel={tipoCarga === 'puntual' ? 'P (N)' : 'w (N/mm)'}
              yLabel="δ (mm)"
            />
          )}

          <hr className="separador" />
          <h3>Mediciones registradas ({sesion.mediciones.length})</h3>
          {sesion.mediciones.length === 0 ? (
            <p className="nota">Aplique carga en la Zona C y presione «Registrar punto» para ir guardando datos.</p>
          ) : (
            <table className="tabla-datos">
              <thead><tr><th>#</th><th>Carga</th><th>Deflexión (mm)</th></tr></thead>
              <tbody>
                {sesion.mediciones.map((p, i) => (
                  <tr key={p.id} onClick={() => setIndiceSeleccionado(i)} style={{ cursor: 'pointer', background: i === indiceSeleccionado ? '#eaf1f7' : undefined }}>
                    <td>{i}</td>
                    <td>{puntosRegistrados[i]?.toFixed(2) ?? '—'}</td>
                    <td>{p.lecturas.deflexion.valor ?? '—'}</td>
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
                <div><label>R izq. calculada (N)</label><input type="number" value={sesion.calculosEstudiante.Rizq ?? ''} onChange={(e) => registrarCalculo('Rizq', Number(e.target.value))} /></div>
                <div><label>Mmax calculado (N·mm)</label><input type="number" value={sesion.calculosEstudiante.Mmax ?? ''} onChange={(e) => registrarCalculo('Mmax', Number(e.target.value))} /></div>
              </div>
              <div className="fila campo">
                <div><label>σ máx. calculado (MPa)</label><input type="number" value={sesion.calculosEstudiante.sigmaMax ?? ''} onChange={(e) => registrarCalculo('sigmaMax', Number(e.target.value))} /></div>
                <div><label>δ calculada (mm)</label><input type="number" value={sesion.calculosEstudiante.deflexion ?? ''} onChange={(e) => registrarCalculo('deflexion', Number(e.target.value))} /></div>
              </div>

              {hayCalculo && RizqRef !== undefined && MmaxRef !== undefined && sigmaMaxRef !== undefined && deflexionRef !== undefined && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="Reacción izquierda (o en el empotramiento)" valorEstudiante={sesion.calculosEstudiante.Rizq} valorReferencia={RizqRef} unidad="N" />
                  <FilaValidacion etiqueta="Momento máximo" valorEstudiante={sesion.calculosEstudiante.Mmax} valorReferencia={MmaxRef} unidad="N·mm" />
                  <FilaValidacion etiqueta="σ máximo" valorEstudiante={sesion.calculosEstudiante.sigmaMax} valorReferencia={sigmaMaxRef} unidad="MPa" />
                  <FilaValidacion etiqueta="Deflexión" valorEstudiante={sesion.calculosEstudiante.deflexion} valorReferencia={deflexionRef} unidad="mm" />
                </TablaValidacion>
              )}
              {apoyo === 'simple' && RderRef !== undefined && (
                <p className="nota">Reacción derecha de referencia: {RderRef.toFixed(1)} N.</p>
              )}
            </>
          )}

          <hr className="separador" />
          <h3>Notas</h3>
          <textarea
            rows={5}
            value={sesion.conclusiones}
            onChange={(e) => registrarConclusiones(e.target.value)}
            placeholder="Efecto de la condición de apoyo y del tipo de carga sobre el momento máximo y la deflexión, margen de seguridad…"
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

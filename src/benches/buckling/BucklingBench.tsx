import { useMemo, useState } from 'react';
import { EtapasStepper } from '../../components/EtapasStepper';
import { MaterialSelector } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { LecturasPanel } from '../../components/LecturasPanel';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { exportarMedicionesCSV, exportarSesionJSON } from '../../trial/exportar';
import { obtenerMaterial } from '../../engine/materials';
import {
  APOYOS,
  cargaCriticaEuler,
  deflexionConImperfeccion,
  esbeltez,
  esbeltezCritica,
  esfuerzoCriticoEuler,
  factorSeguridad,
  longitudEfectiva,
  radioGiro,
  verificarAplicabilidadEuler,
  type CondicionApoyo,
} from '../../engine/mechanics/buckling';
import { calcularSeccion, type TipoSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';
import { BucklingSVG } from './BucklingSVG';
import type { LecturaInstrumento } from '../../engine/types';

const AMPLIFICACION_VISUAL = 18;

export function BucklingBench({ onVolver }: { onVolver: () => void }) {
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
  } = useSesionEnsayo('banco-6-pandeo', 'sae-1018');

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccion>('circular_maciza');
  const [d, setD] = useState(12);
  const [b, setB] = useState(15);
  const [h, setH] = useState(10);
  const [L, setL] = useState(1000);
  const [condicion, setCondicion] = useState<CondicionApoyo>('articulado-articulado');
  const [delta0, setDelta0] = useState(0.3);
  const [pAplicada, setPAplicada] = useState(0);
  const [epsilonesRegistrados, setEpsilonesRegistrados] = useState<number[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);

  const material = obtenerMaterial(sesion.materialId)!;
  const E = material.propiedades.E_MPa ?? 200000;
  const sigmaY = material.propiedades.sigmaY_MPa;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular_maciza' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);

  const A = seccion?.area_mm2 ?? 1;
  const Imin = seccion ? Math.min(seccion.Ix_mm4, seccion.Iy_mm4) : 1;
  const K = APOYOS[condicion].K;
  const Le = longitudEfectiva(L, K);
  const r = radioGiro(Imin, A);
  const esb = esbeltez(Le, r);
  const Pcr = cargaCriticaEuler(E, Imin, L, K);
  const sigmaCr = esfuerzoCriticoEuler(E, esb);
  const aplicabilidad = verificarAplicabilidadEuler(E, esb, sigmaY);
  const esbCrit = sigmaY !== undefined ? esbeltezCritica(E, sigmaY) : undefined;

  const Pmax = Math.max(Pcr * 0.95, 1);
  const PSeguro = Math.min(pAplicada, Pmax);
  const pasoCarga = Pmax / 500;
  const deflexion = delta0 > 0 ? deflexionConImperfeccion(PSeguro, Pcr, delta0) : 0;
  const cercaDeCritica = PSeguro / Pcr > 0.85;
  const celdaCarga = elegirCeldaCarga(Pcr);

  function registrarPunto() {
    const opciones = () => ({ semillaEnsayo: sesion.semilla, indicePunto: sesion.mediciones.length, calibrado: true });
    const lecturas: Record<string, LecturaInstrumento> = {
      fuerza: medir(PSeguro, celdaCarga, opciones()),
      deflexionLateral: medir(deflexion, INSTRUMENTOS.comparadorLateral10mm, opciones()),
    };
    agregarMedicion(lecturas);
    setEpsilonesRegistrados((arr) => [...arr, PSeguro]);
  }

  const puntoRefP = epsilonesRegistrados[indiceSeleccionado];
  const deflexionRef = puntoRefP !== undefined && delta0 > 0 ? deflexionConImperfeccion(puntoRefP, Pcr, delta0) : 0;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Banco 6 — Pandeo de columnas (Euler)</div>
          <div className="subtitulo">Tercera unidad: estabilidad y pandeo de columnas esbeltas.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <EtapasStepper etapaActual={sesion.etapaActual} onIr={irAEtapa} />

      <div className="banco-grid">
        <div className="zona-a panel">
          <div className="zona-etiqueta">Zona A · Configuración</div>
          <MaterialSelector materialId={sesion.materialId} onChange={setMaterial} soloIsotropicos />

          <div className="campo">
            <label>Tipo de sección</label>
            <select value={tipoSeccion} onChange={(e) => setTipoSeccion(e.target.value as TipoSeccion)}>
              <option value="circular_maciza">Circular maciza</option>
              <option value="rectangular">Rectangular</option>
            </select>
          </div>
          {tipoSeccion === 'circular_maciza' ? (
            <div className="campo">
              <label>Diámetro d (mm)</label>
              <input type="number" value={d} min={4} max={40} onChange={(e) => setD(Number(e.target.value))} />
            </div>
          ) : (
            <div className="fila campo">
              <div><label>Base b (mm)</label><input type="number" value={b} min={4} max={60} onChange={(e) => setB(Number(e.target.value))} /></div>
              <div><label>Altura h (mm)</label><input type="number" value={h} min={4} max={60} onChange={(e) => setH(Number(e.target.value))} /></div>
            </div>
          )}
          <div className="campo">
            <label>Longitud de la columna L (mm)</label>
            <input type="number" value={L} min={100} max={3000} onChange={(e) => setL(Number(e.target.value))} />
          </div>
          <div className="campo">
            <label>Condición de apoyo</label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value as CondicionApoyo)}>
              {Object.entries(APOYOS).map(([clave, info]) => (
                <option key={clave} value={clave}>{info.nombre} (K = {info.K})</option>
              ))}
            </select>
            <p className="nota">{APOYOS[condicion].procedencia}</p>
          </div>
          <div className="campo">
            <label>Imperfección inicial δ₀ (mm) — use 0 para columna perfecta</label>
            <input type="number" value={delta0} min={0} max={2} step={0.05} onChange={(e) => setDelta0(Number(e.target.value))} />
          </div>

          <hr className="separador" />
          <p className="nota">A = {A.toFixed(1)} mm² · I_min = {Imin.toFixed(0)} mm⁴ · Le = {Le.toFixed(0)} mm · λ = {esb.toFixed(1)}</p>
          <p className="nota">Pcr (Euler) = {(Pcr / 1000).toFixed(3)} kN · σcr = {sigmaCr.toFixed(1)} MPa</p>
          <p className={aplicabilidad.aplicable ? 'nota' : 'advertencia'}>{aplicabilidad.mensaje}</p>
        </div>

        <div className="zona-b panel">
          <div className="zona-etiqueta">Zona B · Banco de ensayo</div>
          <BucklingSVG deflexion_mm={deflexion} amplificacion={AMPLIFICACION_VISUAL} condicion={condicion} cercaDeCritica={cercaDeCritica} />
        </div>

        <div className="zona-c panel">
          <div className="zona-etiqueta">Zona C · Instrumentación y control</div>
          <div className="campo">
            <label>Carga axial aplicada P = {(PSeguro / 1000).toFixed(3)} kN (máx. de ensayo: {(Pmax / 1000).toFixed(3)} kN = 0.95·Pcr)</label>
            <div className="control-paso">
              <button className="boton-paso" onClick={() => setPAplicada((p) => Math.max(p - pasoCarga, 0))} disabled={pAplicada <= 0} aria-label="Disminuir carga">−</button>
              <input type="range" min={0} max={Pmax} step={pasoCarga} value={pAplicada} onChange={(e) => setPAplicada(Number(e.target.value))} />
              <button className="boton-paso" onClick={() => setPAplicada((p) => Math.min(p + pasoCarga, Pmax))} disabled={pAplicada >= Pmax} aria-label="Aumentar carga">+</button>
            </div>
            <p className="nota">Cada clic en − / + aplica un paso fino de ΔP = {(pasoCarga / 1000).toFixed(4)} kN.</p>
          </div>

          <p className="nota">Lecturas instantáneas:</p>
          <LecturasPanel
            lecturas={[
              { etiqueta: 'Deflexión lateral', valor: deflexion.toFixed(4), unidad: 'mm' },
              { etiqueta: 'Factor de seguridad', valor: PSeguro > 0 ? factorSeguridad(Pcr, PSeguro).toFixed(2) : '—' },
            ]}
          />
          <p className="nota">Imperfección inicial de referencia: δ₀ = {delta0} mm</p>
          <button className="primario" onClick={registrarPunto}>Registrar punto</button>
          <hr className="separador" />
          <p className="nota">El modelo de amplificación elástica solo es válido para P &lt; Pcr. No existe aquí una trayectoria post-pandeo determinada: el ensayo se limita a 0.95·Pcr.</p>
        </div>

        <div className="zona-d panel">
          <div className="zona-etiqueta">Zona D · Análisis</div>

          {sesion.etapaActual === 'preparacion' && <p>Configure material, geometría, apoyos e imperfección en la Zona A.</p>}

          {sesion.etapaActual === 'prediccion' && (
            <div>
              <h3>Predicción teórica</h3>
              <p className="nota">Antes de cargar, prediga: longitud efectiva, esbeltez, carga crítica de Euler y esfuerzo crítico.</p>
              {(['Le', 'esbeltez', 'Pcr', 'sigmaCr'] as const).map((variable) => (
                <div className="campo" key={variable}>
                  <label>{variable}</label>
                  <input type="number" onChange={(e) => registrarPrediccion({ variable, valor: Number(e.target.value), unidad: variable === 'Le' ? 'mm' : variable === 'esbeltez' ? '' : variable === 'Pcr' ? 'N' : 'MPa' })} />
                </div>
              ))}
            </div>
          )}

          {sesion.etapaActual === 'instrumentacion' && (
            <div>
              <h3>Instrumentos</h3>
              <ul>
                <li>{celdaCarga.nombre}: rango [{celdaCarga.rango.join(', ')}] N</li>
                <li>{INSTRUMENTOS.comparadorLateral10mm.nombre}: resolución {INSTRUMENTOS.comparadorLateral10mm.resolucion} mm</li>
              </ul>
            </div>
          )}

          {sesion.etapaActual === 'ejecucion' && <p>Incremente la carga con el control de la Zona C observando la deflexión lateral.</p>}

          {(sesion.etapaActual === 'registro' || sesion.etapaActual === 'calculo' || sesion.etapaActual === 'validacion') && (
            <div>
              <h3>Mediciones registradas ({sesion.mediciones.length})</h3>
              <table className="tabla-datos">
                <thead><tr><th>#</th><th>Fuerza (N)</th><th>Deflexión lateral (mm)</th></tr></thead>
                <tbody>
                  {sesion.mediciones.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i}</td>
                      <td>{p.lecturas.fuerza.valor ?? '—'}</td>
                      <td>{p.lecturas.deflexionLateral.valor ?? '—'}</td>
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
              {(['Le', 'esbeltez', 'Pcr', 'sigmaCr', 'factorSeguridad'] as const).map((variable) => (
                <div className="campo" key={variable}>
                  <label>{variable}</label>
                  <input type="number" onChange={(e) => registrarCalculo(variable, Number(e.target.value))} />
                </div>
              ))}
            </div>
          )}

          {sesion.etapaActual === 'validacion' && puntoRefP !== undefined && (
            <div>
              <h3>Validación — punto {indiceSeleccionado}</h3>
              <TablaValidacion>
                <FilaValidacion etiqueta="Longitud efectiva Le" valorEstudiante={sesion.calculosEstudiante.Le} valorReferencia={Le} unidad="mm" />
                <FilaValidacion etiqueta="Esbeltez λ" valorEstudiante={sesion.calculosEstudiante.esbeltez} valorReferencia={esb} unidad="" />
                <FilaValidacion etiqueta="Carga crítica Pcr" valorEstudiante={sesion.calculosEstudiante.Pcr} valorReferencia={Pcr} unidad="N" />
                <FilaValidacion etiqueta="Esfuerzo crítico σcr" valorEstudiante={sesion.calculosEstudiante.sigmaCr} valorReferencia={sigmaCr} unidad="MPa" />
                <FilaValidacion etiqueta="Factor de seguridad (en el punto medido)" valorEstudiante={sesion.calculosEstudiante.factorSeguridad} valorReferencia={factorSeguridad(Pcr, puntoRefP)} unidad="" />
              </TablaValidacion>
              {esbCrit !== undefined && (
                <p className="nota">Esbeltez crítica del material: {esbCrit.toFixed(1)} ({aplicabilidad.aplicable ? 'esta columna sí está en el régimen de Euler' : 'esta columna NO está en el régimen de Euler'}).</p>
              )}
              <p className="nota">Deflexión lateral de referencia en ese punto: {deflexionRef.toFixed(4)} mm.</p>
            </div>
          )}

          {sesion.etapaActual === 'interpretacion' && (
            <div>
              <h3>Conclusiones</h3>
              <textarea rows={8} value={sesion.conclusiones} onChange={(e) => registrarConclusiones(e.target.value)} placeholder="Comente la estabilidad de la columna, el efecto de la condición de apoyo y de la imperfección inicial, y el margen de seguridad." />
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

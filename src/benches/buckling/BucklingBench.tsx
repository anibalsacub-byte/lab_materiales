import { useMemo, useState } from 'react';
import { MaterialSelector } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { LecturasPanel } from '../../components/LecturasPanel';
import { GraficoXY } from '../../components/svg/GraficoXY';
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
  const { sesion, setMaterial, agregarMedicion, registrarCalculo, registrarConclusiones } = useSesionEnsayo('banco-6-pandeo', 'sae-1018');

  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccion>('circular_maciza');
  const [d, setD] = useState(12);
  const [b, setB] = useState(15);
  const [h, setH] = useState(10);
  const [L, setL] = useState(1000);
  const [condicion, setCondicion] = useState<CondicionApoyo>('articulado-articulado');
  const [delta0, setDelta0] = useState(0.3);
  const [pAplicada, setPAplicada] = useState(0);
  const [puntosRegistrados, setPuntosRegistrados] = useState<number[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [mostrarGrafico, setMostrarGrafico] = useState(true);

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
  // Deflexión de referencia para la aguja del comparador y el eje del gráfico: la máxima
  // alcanzable en este ensayo (en Pmax). Si la columna es perfecta (δ0 = 0) la deflexión real
  // es siempre 0, así que la referencia también lo es — correcto, no es un error.
  const deflexionReferencia = delta0 > 0 ? deflexionConImperfeccion(Pmax, Pcr, delta0) : 0;
  const progresoComparador = deflexionReferencia > 0 ? Math.min(Math.abs(deflexion) / deflexionReferencia, 1) : 0;

  const curvaReferencia = useMemo(() => {
    const puntos: { x: number; y: number }[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const P = (Pmax * i) / n;
      puntos.push({ x: P, y: delta0 > 0 ? deflexionConImperfeccion(P, Pcr, delta0) : 0 });
    }
    return puntos;
  }, [Pmax, Pcr, delta0]);
  const puntosGraficados = puntosRegistrados.map((P) => ({ x: P, y: delta0 > 0 ? deflexionConImperfeccion(P, Pcr, delta0) : 0 }));

  function registrarPunto() {
    const opciones = () => ({ semillaEnsayo: sesion.semilla, indicePunto: sesion.mediciones.length, calibrado: true });
    const lecturas: Record<string, LecturaInstrumento> = {
      fuerza: medir(PSeguro, celdaCarga, opciones()),
      deflexionLateral: medir(deflexion, INSTRUMENTOS.comparadorLateral10mm, opciones()),
    };
    agregarMedicion(lecturas);
    setPuntosRegistrados((arr) => [...arr, PSeguro]);
    setIndiceSeleccionado(sesion.mediciones.length);
  }

  const puntoRefP = puntosRegistrados[indiceSeleccionado];
  const deflexionRef = puntoRefP !== undefined && delta0 > 0 ? deflexionConImperfeccion(puntoRefP, Pcr, delta0) : 0;
  const hayCalculo = sesion.calculosEstudiante.Le !== undefined || sesion.calculosEstudiante.Pcr !== undefined || sesion.calculosEstudiante.esbeltez !== undefined;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Banco 6 — Pandeo de columnas (Euler)</div>
          <div className="subtitulo">Configure la columna, aplique carga axial y observe la deflexión en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

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
          <BucklingSVG
            deflexion_mm={deflexion}
            progresoComparador={progresoComparador}
            amplificacion={AMPLIFICACION_VISUAL}
            condicion={condicion}
            cercaDeCritica={cercaDeCritica}
          />
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
          </div>

          <LecturasPanel
            lecturas={[
              { etiqueta: 'Deflexión lateral', valor: deflexion.toFixed(4), unidad: 'mm' },
              { etiqueta: 'Factor de seguridad', valor: PSeguro > 0 ? factorSeguridad(Pcr, PSeguro).toFixed(2) : '—' },
            ]}
          />
          <button className="primario" onClick={registrarPunto}>Registrar punto</button>
          <hr className="separador" />
          <p className="nota">El modelo de amplificación elástica solo es válido para P &lt; Pcr. No existe aquí una trayectoria post-pandeo determinada: el ensayo se limita a 0.95·Pcr.</p>
        </div>

        <div className="zona-d panel">
          <div className="zona-etiqueta">Zona D · Datos y análisis</div>

          <label className="fila" style={{ alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mostrarGrafico} onChange={(e) => setMostrarGrafico(e.target.checked)} />
            <span style={{ flex: 'none' }}>Mostrar gráfico P-δ en vivo</span>
          </label>
          {mostrarGrafico && (
            <GraficoXY
              curva={curvaReferencia}
              puntoActual={{ x: PSeguro, y: deflexion }}
              puntosRegistrados={puntosGraficados}
              xMax={Pmax}
              yMax={Math.max(deflexionReferencia, 0.01)}
              xLabel="P (N)"
              yLabel="δ (mm)"
            />
          )}

          <hr className="separador" />
          <h3>Mediciones registradas ({sesion.mediciones.length})</h3>
          {sesion.mediciones.length === 0 ? (
            <p className="nota">Aplique carga en la Zona C y presione «Registrar punto» para ir guardando datos.</p>
          ) : (
            <table className="tabla-datos">
              <thead><tr><th>#</th><th>Fuerza (N)</th><th>Deflexión lateral (mm)</th></tr></thead>
              <tbody>
                {sesion.mediciones.map((p, i) => (
                  <tr key={p.id} onClick={() => setIndiceSeleccionado(i)} style={{ cursor: 'pointer', background: i === indiceSeleccionado ? '#eaf1f7' : undefined }}>
                    <td>{i}</td>
                    <td>{p.lecturas.fuerza.valor ?? '—'}</td>
                    <td>{p.lecturas.deflexionLateral.valor ?? '—'}</td>
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
                <div><label>Le calculada (mm)</label><input type="number" value={sesion.calculosEstudiante.Le ?? ''} onChange={(e) => registrarCalculo('Le', Number(e.target.value))} /></div>
                <div><label>λ calculada</label><input type="number" value={sesion.calculosEstudiante.esbeltez ?? ''} onChange={(e) => registrarCalculo('esbeltez', Number(e.target.value))} /></div>
              </div>
              <div className="fila campo">
                <div><label>Pcr calculada (N)</label><input type="number" value={sesion.calculosEstudiante.Pcr ?? ''} onChange={(e) => registrarCalculo('Pcr', Number(e.target.value))} /></div>
                <div><label>σcr calculado (MPa)</label><input type="number" value={sesion.calculosEstudiante.sigmaCr ?? ''} onChange={(e) => registrarCalculo('sigmaCr', Number(e.target.value))} /></div>
              </div>
              <div className="campo">
                <label>Factor de seguridad calculado (en el punto medido)</label>
                <input type="number" value={sesion.calculosEstudiante.factorSeguridad ?? ''} onChange={(e) => registrarCalculo('factorSeguridad', Number(e.target.value))} />
              </div>

              {hayCalculo && puntoRefP !== undefined && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="Longitud efectiva Le" valorEstudiante={sesion.calculosEstudiante.Le} valorReferencia={Le} unidad="mm" />
                  <FilaValidacion etiqueta="Esbeltez λ" valorEstudiante={sesion.calculosEstudiante.esbeltez} valorReferencia={esb} unidad="" />
                  <FilaValidacion etiqueta="Carga crítica Pcr" valorEstudiante={sesion.calculosEstudiante.Pcr} valorReferencia={Pcr} unidad="N" />
                  <FilaValidacion etiqueta="Esfuerzo crítico σcr" valorEstudiante={sesion.calculosEstudiante.sigmaCr} valorReferencia={sigmaCr} unidad="MPa" />
                  <FilaValidacion etiqueta="Factor de seguridad" valorEstudiante={sesion.calculosEstudiante.factorSeguridad} valorReferencia={factorSeguridad(Pcr, puntoRefP)} unidad="" />
                </TablaValidacion>
              )}
              {esbCrit !== undefined && (
                <p className="nota">Esbeltez crítica del material: {esbCrit.toFixed(1)} ({aplicabilidad.aplicable ? 'esta columna sí está en el régimen de Euler' : 'esta columna NO está en el régimen de Euler'}).</p>
              )}
              <p className="nota">Deflexión lateral de referencia en el punto seleccionado: {deflexionRef.toFixed(4)} mm.</p>
            </>
          )}

          <hr className="separador" />
          <h3>Notas</h3>
          <textarea
            rows={5}
            value={sesion.conclusiones}
            onChange={(e) => registrarConclusiones(e.target.value)}
            placeholder="Estabilidad de la columna, efecto de la condición de apoyo y de la imperfección inicial, margen de seguridad…"
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

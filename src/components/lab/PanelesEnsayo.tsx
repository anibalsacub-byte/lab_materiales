import { useEffect, useRef, type ReactNode } from 'react';
import { Icono, Segmentado, Stepper } from './LabUI';
import type { EnsayoMaquina, EstadoMaquina, FactorTiempo } from '../../trial/useEnsayoMaquina';
import type { OpcionesGrafico } from '../svg/GraficoEnsayo';
import type { PuntoMedicion } from '../../engine/types';
import { exportarMedicionesCSV, exportarSesionJSON, exportarSvgComoPng } from '../../trial/exportar';

/** Activa el tema oscuro de laboratorio mientras el banco está abierto. */
export function useModoLab() {
  useEffect(() => {
    document.body.classList.add('modo-lab');
    return () => document.body.classList.remove('modo-lab');
  }, []);
}

export function fmt(v: number, decimales: number): string {
  // Evita mostrar «-0,00» cuando el ruido de la lectura en vacío es negativo y menor que la resolución.
  const r = Number(v.toFixed(decimales)) || 0;
  return r.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Valor de una lectura para mostrar: «OVL» si el instrumento satura, «—» si no hay lectura. */
export function textoLectura(valor: number | null | undefined, decimales: number, escala = 1): string {
  if (valor === undefined) return '—';
  if (valor === null) return 'OVL';
  return fmt(valor / escala, decimales);
}

/** Botones principales de la máquina: montar/desmontar, tara, iniciar/pausa y descargar. */
export function MandosMaquina({ m, nombre = 'probeta', puedeMontar = true }: { m: EnsayoMaquina; nombre?: string; puedeMontar?: boolean }) {
  const { estado, acciones, permisos } = m;
  return (
    <div className="controles-principales">
      {estado === 'desmontada' ? (
        <button className="btn-grande btn-montar" onClick={acciones.montar} disabled={!puedeMontar}>
          <Icono tipo="montar" /> Montar {nombre}
        </button>
      ) : m.retirada ? (
        <button className="btn-grande btn-montar" onClick={acciones.volverAMontar} title={`Monta de nuevo la misma ${nombre}, con su deformación permanente`}>
          <Icono tipo="montar" /> Volver a montar
        </button>
      ) : (
        <button className="btn-grande" onClick={acciones.desmontar} disabled={!permisos.desmontar} title="Retira la probeta de la máquina (solo con carga cero)">
          <Icono tipo="retirar" /> Desmontar
        </button>
      )}
      <button className="btn-grande" onClick={acciones.tarar} disabled={!permisos.tarar} title="Pone a cero los instrumentos antes de cargar">
        <Icono tipo="cero" /> {m.tarado ? 'Tarado ✓' : 'Cero / tara'}
      </button>
      {m.enMovimiento ? (
        <button className="btn-grande btn-pausa" onClick={acciones.pausar}>
          <Icono tipo="pausa" /> Pausa
        </button>
      ) : (
        <button className="btn-grande btn-iniciar" onClick={acciones.iniciar} disabled={!permisos.iniciar}>
          <Icono tipo="play" /> {estado === 'pausada' ? 'Continuar' : 'Iniciar'}
        </button>
      )}
      <button className="btn-grande" onClick={acciones.descargar} disabled={!permisos.descargar} title="Retrocede hasta carga cero; la probeta queda montada">
        Descargar
      </button>
    </div>
  );
}

interface ControlesMovimientoProps {
  m: EnsayoMaquina;
  velocidad: number;
  setVelocidad: (v: number) => void;
  /** Unidad de la velocidad y del movimiento manual (p. ej. «mm/min» y «mm»). */
  unidadVelocidad: string;
  unidadJog: string;
  velocidadMin: number;
  velocidadMax: number;
  pasoVelocidad?: number;
  pasosJog: string[];
  pasoJog: string;
  setPasoJog: (p: string) => void;
  /** Convierte un paso de jog (en su unidad) a la variable de control x. */
  jogAX: (paso: number) => number;
  /** Controles propios del banco (geometría), antes de los comunes. */
  children?: ReactNode;
}

/** Configuración común a todas las máquinas: velocidad, aceleración de tiempo, movimiento manual y nueva probeta. */
export function ControlesMovimiento(p: ControlesMovimientoProps) {
  const { m } = p;
  return (
    <>
      <div className="fila-controles">
        {p.children}
        <Stepper etiqueta={`Velocidad (${p.unidadVelocidad})`} valor={p.velocidad} onChange={p.setVelocidad} min={p.velocidadMin} max={p.velocidadMax} paso={p.pasoVelocidad ?? (p.velocidadMin < 1 ? 0.5 : 1)} decimales={p.velocidadMin < 1 ? 1 : 0} disabled={m.fracturada} />
        <Segmentado<FactorTiempo>
          etiqueta="Tiempo"
          opciones={[{ valor: '1', etiqueta: '×1' }, { valor: '10', etiqueta: '×10' }, { valor: '50', etiqueta: '×50' }]}
          valor={m.factorTiempo}
          onChange={m.setFactorTiempo}
        />
      </div>
      <div className="fila-controles">
        <div className="segmentado-grupo">
          <span className="stepper-etiqueta">Movimiento manual</span>
          <div className="stepper-fila">
            <button type="button" onClick={() => m.acciones.jog(-p.jogAX(Number(p.pasoJog)))} disabled={!m.permisos.jog || m.sim.x <= 0} aria-label="Retroceder">▼</button>
            <button type="button" onClick={() => m.acciones.jog(p.jogAX(Number(p.pasoJog)))} disabled={!m.permisos.jog} aria-label="Avanzar">▲</button>
          </div>
        </div>
        <Segmentado
          etiqueta={`Paso (${p.unidadJog})`}
          opciones={p.pasosJog.map((v) => ({ valor: v, etiqueta: v.replace('.', ',') }))}
          valor={p.pasoJog}
          onChange={p.setPasoJog}
        />
        <div className="segmentado-grupo">
          <span className="stepper-etiqueta">Probeta</span>
          <button type="button" className="btn-peligro-suave" onClick={() => m.acciones.nuevaProbeta()}>
            <Icono tipo="reiniciar" /> Nueva probeta
          </button>
        </div>
      </div>
    </>
  );
}

export interface ColumnaDatos {
  titulo: string;
  valor: (medicion: PuntoMedicion) => string;
}

/** Tabla de datos adquiridos que sigue al último punto mientras la máquina se mueve. */
export function TablaDatosVivo({ m, columnas }: { m: EnsayoMaquina; columnas: ColumnaDatos[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = m.sesion.mediciones.length;
  useEffect(() => {
    if (m.enMovimiento && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [n, m.enMovimiento]);

  return (
    <div className="datos-vivo">
      <div className="lab-panel-titulo">Datos adquiridos ({n})</div>
      {n === 0 ? (
        <p className="nota">
          Al iniciar el ensayo, el sistema registra un punto por segundo (o antes, si la carga cambia más de un 2 %).
          Con la máquina detenida puede registrar puntos manualmente.
        </p>
      ) : (
        <div className="tabla-scroll tabla-relleno" ref={ref}>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>#</th>
                <th>t (s)</th>
                {columnas.map((c) => <th key={c.titulo}>{c.titulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {m.sesion.mediciones.map((med, i) => {
                const manual = m.sim.verdaderos[i]?.manual;
                return (
                  <tr key={med.id} onClick={() => m.setSeleccion(i)} className={`${i === m.seleccion ? 'fila-seleccionada' : ''} ${manual ? 'fila-manual' : ''}`}>
                    <td>{i + 1}{manual ? ' ✎' : ''}</td>
                    <td>{textoLectura(med.lecturas.tiempo?.valor, 2)}</td>
                    {columnas.map((c) => <td key={c.titulo}>{c.valor(med)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="fila" style={{ marginTop: 10 }}>
        <button className="primario" onClick={m.acciones.registrarManual} disabled={!m.permisos.registrar}>Registrar punto</button>
        <span className="nota" style={{ margin: 0 }}>Haga clic en una fila para analizarla en «Calcule y compare».</span>
      </div>
    </div>
  );
}

const NOMBRES_OPCIONES: Record<keyof OpcionesGrafico, string> = {
  etiquetas: 'Etiquetas',
  puntos: 'Puntos característicos',
  regiones: 'Regiones',
  offset: 'Offset 0,2 %',
  energia: 'Energía',
  cuadricula: 'Cuadrícula',
  teorica: 'Curva teórica',
};

export function CasillasGrafico({
  opciones,
  setOpciones,
  claves,
  nombres = {},
}: {
  opciones: OpcionesGrafico;
  setOpciones: (o: OpcionesGrafico) => void;
  claves: (keyof OpcionesGrafico)[];
  nombres?: Partial<Record<keyof OpcionesGrafico, string>>;
}) {
  return (
    <div className="opciones-grafico">
      {claves.map((clave) => (
        <label key={clave}>
          <input type="checkbox" checked={opciones[clave]} onChange={(e) => setOpciones({ ...opciones, [clave]: e.target.checked })} />
          {nombres[clave] ?? NOMBRES_OPCIONES[clave]}
        </label>
      ))}
    </div>
  );
}

export function BotonesExportar({ m, idGrafico, nombrePng }: { m: EnsayoMaquina; idGrafico: string; nombrePng: string }) {
  return (
    <div className="fila" style={{ marginTop: 12, flexWrap: 'wrap' }}>
      <button onClick={() => exportarMedicionesCSV(m.sesion)} disabled={m.sesion.mediciones.length === 0}>Exportar CSV</button>
      <button onClick={() => exportarSesionJSON(m.sesion)}>Exportar JSON</button>
      <button onClick={() => exportarSvgComoPng(idGrafico, nombrePng)}>Gráfico PNG</button>
      <button onClick={() => window.print()}>Imprimir</button>
    </div>
  );
}

/** Línea de estado bajo la máquina: estado, régimen y una línea de datos propia del banco. */
export function LineaEstado({ m, textos, regimen, detalle }: { m: EnsayoMaquina; textos: Record<EstadoMaquina, string>; regimen: string; detalle: ReactNode }) {
  const clasePunto = m.enMovimiento ? 'marcha' : m.fracturada ? 'rota' : m.estado === 'pausada' || m.estado === 'finalizada' ? 'pausa' : '';
  return (
    <div className="maquina-estado">
      <div>
        <span className={`punto ${clasePunto}`} />
        <strong>{textos[m.estado]}</strong>
      </div>
      <div>Régimen: <strong>{regimen}</strong></div>
      <div>{detalle}</div>
      {m.enMaquina && !m.tarado && !m.fracturada && <div className="texto-alerta">⚠ Instrumentos sin tarar: las lecturas incluyen un error de cero.</div>}
    </div>
  );
}

/** Textos de estado comunes; cada banco puede sobrescribir los que necesite. */
export function textosEstadoBase(m: EnsayoMaquina, velocidad: string, nombre = 'probeta'): Record<EstadoMaquina, string> {
  return {
    desmontada: `Sin ${nombre} — elija material y geometría, luego monte la ${nombre}`,
    montada: `${nombre[0].toUpperCase()}${nombre.slice(1)} montada — lista para ensayar`,
    corriendo: `En marcha · ${velocidad}`,
    pausada:
      m.F <= 0 && m.sim.x > 0
        ? `En pausa, sin carga — puede continuar (recarga) o desmontar la ${nombre}`
        : 'En pausa, con carga — descargue antes de desmontar; puede mover la máquina manualmente',
    descargando: `Descargando · ${velocidad}`,
    retirada: `${nombre[0].toUpperCase()}${nombre.slice(1)} retirada. Vuelva a montarla para recargarla o use «Nueva probeta»`,
    finalizada: 'Fin de recorrido: la máquina se detuvo sin rotura. Descargue para retirar la probeta',
    fracturada: 'Rotura — la máquina detectó la caída de carga',
  };
}

export function ResumenItem({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="resumen-item">
      <div className="r-etiqueta">{etiqueta}</div>
      <div className="r-valor">{valor}</div>
    </div>
  );
}

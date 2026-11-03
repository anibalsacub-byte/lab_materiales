import { CATEGORIAS_MATERIAL, MATERIALES } from '../../engine/materials';

export type TipoIcono = 'play' | 'pausa' | 'montar' | 'retirar' | 'cero' | 'reiniciar';

/** Íconos de los mandos de la máquina (SVG en línea: se ven igual en cualquier sistema, a diferencia de ▶ que algunos muestran como emoji). */
export function Icono({ tipo }: { tipo: TipoIcono }) {
  const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="icono" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      {tipo === 'play' && <path d="M4.5 2.5 L13 8 L4.5 13.5 Z" fill="currentColor" />}
      {tipo === 'pausa' && (
        <>
          <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" fill="currentColor" />
          <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" fill="currentColor" />
        </>
      )}
      {tipo === 'montar' && <path d="M8 13.5 V4 M4 7.5 L8 3.5 L12 7.5 M3 1.5 H13" {...trazo} />}
      {tipo === 'retirar' && <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" {...trazo} />}
      {tipo === 'cero' && (
        <>
          <ellipse cx="8" cy="8" rx="4" ry="5.5" {...trazo} />
          <path d="M5 13 L11 3" {...trazo} />
        </>
      )}
      {tipo === 'reiniciar' && <path d="M13 8 A5 5 0 1 1 11.5 4.5 M12 1.5 V5 H8.5" {...trazo} />}
    </svg>
  );
}

/** Franja de lecturas con aspecto de display de instrumento (tipografía monoespaciada, cifras grandes). */
export function DisplayDigital({ items }: { items: { etiqueta: string; valor: string; unidad: string; alerta?: boolean }[] }) {
  return (
    <div className="display-digital">
      {items.map((i) => (
        <div className="dd-item" key={i.etiqueta}>
          <span className="dd-etiqueta">{i.etiqueta}</span>
          <span className={`dd-valor ${i.alerta ? 'dd-alerta' : ''}`}>{i.valor}</span>
          <span className="dd-unidad">{i.unidad}</span>
        </div>
      ))}
    </div>
  );
}

interface StepperProps {
  etiqueta: string;
  valor: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  paso: number;
  decimales?: number;
  disabled?: boolean;
}

/** Control numérico «− valor +» con límites. */
export function Stepper({ etiqueta, valor, onChange, min, max, paso, decimales = 1, disabled }: StepperProps) {
  const acotar = (v: number) => Math.min(Math.max(Number(v.toFixed(6)), min), max);
  return (
    <div className="stepper">
      <span className="stepper-etiqueta">{etiqueta}</span>
      <div className="stepper-fila">
        <button type="button" onClick={() => onChange(acotar(valor - paso))} disabled={disabled || valor <= min} aria-label={`Disminuir ${etiqueta}`}>−</button>
        <input
          type="number"
          value={Number(valor.toFixed(decimales))}
          min={min}
          max={max}
          step={paso}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(acotar(v));
          }}
        />
        <button type="button" onClick={() => onChange(acotar(valor + paso))} disabled={disabled || valor >= max} aria-label={`Aumentar ${etiqueta}`}>+</button>
      </div>
    </div>
  );
}

interface SegmentadoProps<T extends string> {
  etiqueta?: string;
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function Segmentado<T extends string>({ etiqueta, opciones, valor, onChange, disabled }: SegmentadoProps<T>) {
  return (
    <div className="segmentado-grupo">
      {etiqueta && <span className="stepper-etiqueta">{etiqueta}</span>}
      <div className="segmentado" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button type="button" key={o.valor} className={o.valor === valor ? 'activo' : ''} onClick={() => onChange(o.valor)} disabled={disabled}>
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Indicador de avance del procedimiento: solo orienta, no bloquea nada. */
export function BarraPasos({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol className="barra-pasos">
      {pasos.map((p, i) => (
        <li key={p} className={i < actual ? 'hecho' : i === actual ? 'actual' : ''}>
          <span className="paso-numero">{i < actual ? '✓' : i + 1}</span>
          <span className="paso-nombre">{p}</span>
        </li>
      ))}
    </ol>
  );
}

/** Selección de material con botones agrupados por familia. */
export function ChipsMaterial({
  materialId,
  onChange,
  disabled,
  soloIsotropicos,
  filtro,
}: {
  materialId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  soloIsotropicos?: boolean;
  /** Restringe los materiales mostrados (p. ej. a los que tienen datos para el ensayo). */
  filtro?: (id: string) => boolean;
}) {
  const disponibles = MATERIALES.filter((m) => !m.esDesconocido && !(soloIsotropicos && m.esOrtotropico) && (!filtro || filtro(m.id)));
  const categorias = Array.from(new Set(disponibles.map((m) => m.categoria)));
  return (
    <div className="chips-material">
      {categorias.map((cat) => (
        <div className="chips-grupo" key={cat}>
          <span className="chips-categoria">{CATEGORIAS_MATERIAL[cat]}</span>
          <div className="chips-fila">
            {disponibles
              .filter((m) => m.categoria === cat)
              .map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`chip-mat ${m.id === materialId ? 'activo' : ''}`}
                  onClick={() => onChange(m.id)}
                  disabled={disabled}
                  title={`${m.nombre}${m.condicion ? ` — ${m.condicion}` : ''}`}
                >
                  {m.nombreCorto ?? m.nombre}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

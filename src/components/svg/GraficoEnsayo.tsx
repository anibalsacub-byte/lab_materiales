export interface PuntoXY {
  x: number;
  y: number;
}

export interface RegionGrafico {
  desde: number;
  hasta: number;
  nombre: string;
  color: string;
}

export interface PuntoClave extends PuntoXY {
  etiqueta: string;
  color: string;
}

export interface OpcionesGrafico {
  etiquetas: boolean;
  puntos: boolean;
  regiones: boolean;
  offset: boolean;
  energia: boolean;
  cuadricula: boolean;
  teorica: boolean;
  /** Superponer las curvas de ensayos anteriores. */
  comparar?: boolean;
}

/** Curva de un ensayo anterior, para compararla con el actual. */
export interface CurvaComparada {
  etiqueta: string;
  color: string;
  puntos: PuntoXY[];
}

interface Props {
  id?: string;
  titulo: string;
  subtitulo?: string;
  xEtiqueta: string;
  yEtiqueta: string;
  xMax: number;
  yMax: number;
  traza: PuntoXY[];
  referencia?: PuntoXY[];
  regiones?: RegionGrafico[];
  puntosClave?: PuntoClave[];
  lineaOffset?: { desde: PuntoXY; hasta: PuntoXY; etiqueta: string };
  energia?: number;
  puntoActual?: PuntoXY & { fracturado?: boolean };
  registrados?: PuntoXY[];
  opciones: OpcionesGrafico;
  decimalesX?: number;
  /** Límites inferiores de los ejes (por defecto 0; negativos para diagramas y distribuciones de esfuerzo). */
  yMin?: number;
  xMin?: number;
  comparadas?: CurvaComparada[];
  /** Nombre de la curva actual en la leyenda (solo se muestra si hay curvas comparadas). */
  etiquetaActual?: string;
  unidadEnergia?: string;
}

// Colores literales (no variables CSS) para que el SVG se pueda exportar como PNG tal cual.
const C = {
  fondo: '#0c1620',
  marco: '#22344a',
  rejilla: '#1a2a3c',
  eje: '#7f97b0',
  texto: '#a9bdd1',
  titulo: '#e3edf7',
  traza: '#4fd1ff',
  referencia: '#5d7389',
  offset: '#f0b429',
  energia: '#4fd1ff',
  actual: '#ff9f43',
  fractura: '#ff5c5c',
};
const FUENTE = "'IBM Plex Mono', ui-monospace, monospace";
const FUENTE_UI = "'Inter', 'Segoe UI', sans-serif";

const W = 660;
const H = 420;
const M = { izq: 64, der: 18, sup: 52, inf: 50 };

/** Pasos de escala "limpios" (1, 2, 2.5, 5 × 10ⁿ) para las marcas de los ejes, de min a max. */
function marcas(max: number, min = 0, objetivo = 6): number[] {
  if (max <= min) return [min];
  const bruto = (max - min) / objetivo;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
  const r: number[] = [];
  for (let v = Math.ceil(min / paso - 1e-9) * paso; v <= max + paso * 1e-9; v += paso) r.push(Number(v.toFixed(10)) || 0);
  return r;
}

/** Decimales necesarios para escribir las marcas de un eje con su paso. */
function decimalesPaso(paso: number): number {
  const exp = Math.floor(Math.log10(paso));
  return Math.max(0, -exp + (paso / 10 ** exp === 2.5 ? 1 : 0));
}

function formato(v: number, decimales: number) {
  return v.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function GraficoEnsayo(props: Props) {
  const { id, titulo, subtitulo, xEtiqueta, yEtiqueta, xMax, yMax, traza, referencia, regiones, puntosClave, lineaOffset, energia, puntoActual, registrados, opciones, decimalesX } = props;
  const yMin = props.yMin ?? 0;
  const xMin = props.xMin ?? 0;
  const anchoUtil = W - M.izq - M.der;
  const altoUtil = H - M.sup - M.inf;
  const px = (x: number) => M.izq + ((Math.min(Math.max(x, xMin), xMax) - xMin) / (xMax - xMin)) * anchoUtil;
  const py = (y: number) => M.sup + altoUtil - ((Math.min(Math.max(y, yMin), yMax) - yMin) / (yMax - yMin)) * altoUtil;

  const ticksX = marcas(xMax, xMin);
  const ticksY = marcas(yMax, yMin);
  const decX = decimalesX ?? decimalesPaso((ticksX[1] ?? xMax) - (ticksX[0] ?? 0));
  const decY = decimalesPaso((ticksY[1] ?? yMax) - (ticksY[0] ?? 0));

  const camino = (pts: PuntoXY[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const areaEnergia = traza.length > 1 ? `${camino(traza)} L${px(traza[traza.length - 1].x).toFixed(1)},${py(0).toFixed(1)} L${px(traza[0].x).toFixed(1)},${py(0).toFixed(1)} Z` : '';

  return (
    <svg id={id} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={titulo} style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={W} height={H} rx={10} fill={C.fondo} />
      <text x={W / 2} y={22} textAnchor="middle" fontSize="15" fontWeight="600" fill={C.titulo} fontFamily={FUENTE_UI}>{titulo}</text>
      {subtitulo && <text x={W / 2} y={39} textAnchor="middle" fontSize="11.5" fill={C.texto} fontFamily={FUENTE_UI}>{subtitulo}</text>}

      {/* Regiones de comportamiento */}
      {opciones.regiones &&
        regiones?.map((r) => (
          <g key={r.nombre}>
            <rect x={px(r.desde)} y={M.sup} width={Math.max(px(r.hasta) - px(r.desde), 0)} height={altoUtil} fill={r.color} opacity={0.12} />
            {opciones.etiquetas && px(r.hasta) - px(r.desde) > r.nombre.length * 6.2 + 8 && (
              <text x={(px(r.desde) + px(r.hasta)) / 2} y={M.sup + 14} textAnchor="middle" fontSize="10.5" fill={r.color} fontFamily={FUENTE_UI} fontWeight="600">
                {r.nombre}
              </text>
            )}
          </g>
        ))}

      {/* Cuadrícula y marcas */}
      {ticksX.map((t) => (
        <g key={`x${t}`}>
          {opciones.cuadricula && <line x1={px(t)} y1={M.sup} x2={px(t)} y2={M.sup + altoUtil} stroke={C.rejilla} strokeWidth={1} />}
          <line x1={px(t)} y1={M.sup + altoUtil} x2={px(t)} y2={M.sup + altoUtil + 5} stroke={C.eje} />
          <text x={px(t)} y={M.sup + altoUtil + 18} textAnchor="middle" fontSize="10.5" fill={C.texto} fontFamily={FUENTE}>{formato(t, decX)}</text>
        </g>
      ))}
      {ticksY.map((t) => (
        <g key={`y${t}`}>
          {opciones.cuadricula && <line x1={M.izq} y1={py(t)} x2={M.izq + anchoUtil} y2={py(t)} stroke={C.rejilla} strokeWidth={1} />}
          <line x1={M.izq - 5} y1={py(t)} x2={M.izq} y2={py(t)} stroke={C.eje} />
          <text x={M.izq - 8} y={py(t) + 3.5} textAnchor="end" fontSize="10.5" fill={C.texto} fontFamily={FUENTE}>{formato(t, decY)}</text>
        </g>
      ))}
      <rect x={M.izq} y={M.sup} width={anchoUtil} height={altoUtil} fill="none" stroke={C.marco} />
      <line x1={M.izq} y1={M.sup + altoUtil} x2={M.izq + anchoUtil} y2={M.sup + altoUtil} stroke={C.eje} strokeWidth={1.3} />
      <line x1={M.izq} y1={M.sup} x2={M.izq} y2={M.sup + altoUtil} stroke={C.eje} strokeWidth={1.3} />
      {xMin < 0 && <line x1={px(0)} y1={M.sup} x2={px(0)} y2={M.sup + altoUtil} stroke={C.eje} strokeWidth={1} strokeDasharray="3 3" />}
      {yMin < 0 && <line x1={M.izq} y1={py(0)} x2={M.izq + anchoUtil} y2={py(0)} stroke={C.eje} strokeWidth={1} strokeDasharray="3 3" />}
      <text x={M.izq + anchoUtil / 2} y={H - 10} textAnchor="middle" fontSize="12" fill={C.texto} fontFamily={FUENTE_UI}>{xEtiqueta}</text>
      <text x={16} y={M.sup + altoUtil / 2} textAnchor="middle" fontSize="12" fill={C.texto} fontFamily={FUENTE_UI} transform={`rotate(-90, 16, ${M.sup + altoUtil / 2})`}>{yEtiqueta}</text>

      {/* Energía absorbida (área bajo la curva recorrida) */}
      {opciones.energia && areaEnergia && <path d={areaEnergia} fill={C.energia} opacity={0.16} />}
      {opciones.energia && energia !== undefined && (
        <text x={M.izq + anchoUtil - 8} y={M.sup + altoUtil - 10} textAnchor="end" fontSize="11" fill={C.energia} fontFamily={FUENTE}>
          Energía absorbida: {formato(energia, 2)} {props.unidadEnergia ?? 'MJ/m³'}
        </text>
      )}

      {/* Curva teórica de referencia */}
      {opciones.teorica && referencia && referencia.length > 1 && <path d={camino(referencia)} fill="none" stroke={C.referencia} strokeWidth={1.5} strokeDasharray="5 4" />}

      {/* Línea del 0,2 % */}
      {opciones.offset && lineaOffset && (
        <g>
          <line x1={px(lineaOffset.desde.x)} y1={py(lineaOffset.desde.y)} x2={px(lineaOffset.hasta.x)} y2={py(lineaOffset.hasta.y)} stroke={C.offset} strokeWidth={1.4} strokeDasharray="6 4" />
          <circle cx={px(lineaOffset.hasta.x)} cy={py(lineaOffset.hasta.y)} r={4} fill={C.offset} />
          {opciones.etiquetas && (
            <text x={px(lineaOffset.hasta.x) + 8} y={py(lineaOffset.hasta.y) + 16} fontSize="10.5" fill={C.offset} fontFamily={FUENTE}>{lineaOffset.etiqueta}</text>
          )}
        </g>
      )}

      {/* Ensayos anteriores superpuestos, con leyenda */}
      {opciones.comparar &&
        props.comparadas?.map((cc, i) => cc.puntos.length > 1 && <path key={i} d={camino(cc.puntos)} fill="none" stroke={cc.color} strokeWidth={1.6} opacity={0.8} />)}
      {opciones.comparar && props.comparadas && props.comparadas.length > 0 && (
        <g>
          {[{ etiqueta: props.etiquetaActual ?? "Ensayo actual", color: C.traza }, ...props.comparadas].map((cc, i) => (
            <g key={i} transform={`translate(${M.izq + anchoUtil - 200}, ${M.sup + 30 + i * 15})`}>
              <line x1={0} y1={0} x2={18} y2={0} stroke={cc.color} strokeWidth={2.4} />
              <text x={24} y={3.5} fontSize="10" fill={C.texto} fontFamily={FUENTE_UI}>{cc.etiqueta}</text>
            </g>
          ))}
        </g>
      )}

      {/* Curva medida */}
      {traza.length > 1 && <path d={camino(traza)} fill="none" stroke={C.traza} strokeWidth={2.3} strokeLinejoin="round" />}

      {/* Puntos registrados */}
      {registrados?.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={2.6} fill="#e3edf7" opacity={0.85} />)}

      {/* Puntos característicos */}
      {opciones.puntos &&
        puntosClave?.map((p) => (
          <g key={p.etiqueta}>
            <circle cx={px(p.x)} cy={py(p.y)} r={5} fill={C.fondo} stroke={p.color} strokeWidth={2} />
            {opciones.etiquetas && (
              // Cerca del borde derecho el rótulo va a la izquierda del punto para no salirse del gráfico.
              <text
                x={px(p.x) > W - M.der - p.etiqueta.length * 6.6 - 10 ? px(p.x) - 8 : px(p.x) + 8}
                y={py(p.y) - 8}
                textAnchor={px(p.x) > W - M.der - p.etiqueta.length * 6.6 - 10 ? 'end' : 'start'}
                fontSize="10.5"
                fill={p.color}
                fontFamily={FUENTE}
                fontWeight="600"
              >
                {p.etiqueta}
              </text>
            )}
          </g>
        ))}

      {/* Punto actual */}
      {puntoActual && (
        <g>
          <circle cx={px(puntoActual.x)} cy={py(puntoActual.y)} r={9} fill={puntoActual.fracturado ? C.fractura : C.actual} opacity={0.25} />
          <circle cx={px(puntoActual.x)} cy={py(puntoActual.y)} r={4.5} fill={puntoActual.fracturado ? C.fractura : C.actual} />
        </g>
      )}
    </svg>
  );
}

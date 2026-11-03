interface Punto {
  x: number;
  y: number;
}

interface Props {
  curva?: Punto[];
  puntoActual?: Punto;
  puntosRegistrados?: Punto[];
  xMax: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  colorCurva?: string;
  colorActual?: string;
}

const ANCHO = 320;
const ALTO = 220;
const MARGEN_IZQ = 48;
const MARGEN_INF = 30;
const MARGEN_SUP = 12;
const MARGEN_DER = 10;

/**
 * Gráfico XY en vivo, al estilo de los simuladores de PhET: traza la curva de
 * referencia, los puntos ya registrados y un punto "actual" grande que se
 * mueve en tiempo real mientras el estudiante opera el control de carga.
 */
export function GraficoXY({ curva, puntoActual, puntosRegistrados, xMax, yMax, xLabel, yLabel, colorCurva = '#1d5a8a', colorActual = '#b3541e' }: Props) {
  const anchoUtil = ANCHO - MARGEN_IZQ - MARGEN_DER;
  const altoUtil = ALTO - MARGEN_SUP - MARGEN_INF;
  const xPx = (x: number) => MARGEN_IZQ + (xMax > 0 ? (x / xMax) * anchoUtil : 0);
  const yPx = (y: number) => MARGEN_SUP + altoUtil - (yMax > 0 ? (y / yMax) * altoUtil : 0);

  const pathCurva = curva && curva.length > 0 ? curva.map((p, i) => `${i === 0 ? 'M' : 'L'}${xPx(p.x).toFixed(1)},${yPx(p.y).toFixed(1)}`).join(' ') : '';

  const marcasX = [0, 0.25, 0.5, 0.75, 1].map((f) => f * xMax);
  const marcasY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" height="200" role="img" aria-label={`Gráfico ${yLabel} contra ${xLabel}`}>
      {/* Cuadrícula */}
      {marcasX.map((x, i) => (
        <line key={`gx${i}`} x1={xPx(x)} y1={MARGEN_SUP} x2={xPx(x)} y2={MARGEN_SUP + altoUtil} stroke="#e4e9ed" strokeWidth={1} />
      ))}
      {marcasY.map((y, i) => (
        <line key={`gy${i}`} x1={MARGEN_IZQ} y1={yPx(y)} x2={MARGEN_IZQ + anchoUtil} y2={yPx(y)} stroke="#e4e9ed" strokeWidth={1} />
      ))}

      {/* Ejes */}
      <line x1={MARGEN_IZQ} y1={MARGEN_SUP} x2={MARGEN_IZQ} y2={MARGEN_SUP + altoUtil} stroke="#5b6b78" strokeWidth={1.3} />
      <line x1={MARGEN_IZQ} y1={MARGEN_SUP + altoUtil} x2={MARGEN_IZQ + anchoUtil} y2={MARGEN_SUP + altoUtil} stroke="#5b6b78" strokeWidth={1.3} />

      {/* Etiquetas de los extremos de cada eje */}
      <text x={MARGEN_IZQ + anchoUtil} y={MARGEN_SUP + altoUtil + 16} fontSize="9" fill="#5b6b78" textAnchor="end">{xLabel}</text>
      <text x={MARGEN_IZQ - 6} y={MARGEN_SUP + 6} fontSize="9" fill="#5b6b78" textAnchor="end">{yLabel}</text>
      <text x={MARGEN_IZQ + anchoUtil} y={MARGEN_SUP + altoUtil - 4} fontSize="8" fill="#8a97a3" textAnchor="end">{xMax.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</text>
      <text x={MARGEN_IZQ + 2} y={MARGEN_SUP + 9} fontSize="8" fill="#8a97a3">{yMax.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</text>

      {/* Curva de referencia */}
      {pathCurva && <path d={pathCurva} fill="none" stroke={colorCurva} strokeWidth={2} opacity={0.75} />}

      {/* Puntos registrados */}
      {puntosRegistrados?.map((p, i) => (
        <circle key={i} cx={xPx(p.x)} cy={yPx(p.y)} r={2.8} fill="#123f61" />
      ))}

      {/* Punto actual (en vivo) */}
      {puntoActual && (
        <circle cx={xPx(puntoActual.x)} cy={yPx(puntoActual.y)} r={5} fill={colorActual} stroke="#fff" strokeWidth={1.5} />
      )}
    </svg>
  );
}

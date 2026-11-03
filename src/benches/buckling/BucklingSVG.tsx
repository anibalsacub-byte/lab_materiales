import type { CondicionApoyo } from '../../engine/mechanics/buckling';
import { ComparadorDial } from '../../components/svg/ComparadorDial';

interface Props {
  deflexion_mm: number;
  /** Progreso de la aguja del comparador en [0,1], relativo a la deflexión máxima de referencia del ensayo actual (NO a la carga: así la aguja nunca se mueve si la deflexión real es cero, p. ej. columna perfecta). */
  progresoComparador: number;
  amplificacion: number;
  condicion: CondicionApoyo;
  cercaDeCritica: boolean;
}

/** Forma esquemática del modo de pandeo (no a escala); la AMPLITUD sí sigue el modelo validado. */
function formaModo(condicion: CondicionApoyo, t: number): number {
  switch (condicion) {
    case 'articulado-articulado':
      return Math.sin(Math.PI * t);
    case 'empotrado-libre':
      return 1 - Math.cos((Math.PI * t) / 2);
    case 'empotrado-empotrado':
      return (1 - Math.cos(2 * Math.PI * t)) / 2;
    case 'empotrado-articulado':
      return Math.sin(Math.PI * t) - 0.3 * Math.sin(2 * Math.PI * t);
  }
}

export function BucklingSVG({ deflexion_mm, progresoComparador, amplificacion, condicion, cercaDeCritica }: Props) {
  const topY = 40;
  const bottomY = 320;
  const alto = bottomY - topY;
  const xCentro = 170;
  const deflexionPx = Math.min(deflexion_mm * amplificacion, 70);

  const puntos: string[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = topY + t * alto;
    const x = xCentro + formaModo(condicion, t) * deflexionPx;
    puntos.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const esEmpotradoAbajo = condicion !== 'articulado-articulado'; // los 3 restantes tienen empotramiento en la base
  const esEmpotradoArriba = condicion === 'empotrado-empotrado';
  const esLibreArriba = condicion === 'empotrado-libre';

  const colorId = cercaDeCritica ? 'columnaCritica' : 'columnaNormal';

  return (
    <svg viewBox="0 0 340 380" width="100%" height="320" role="img" aria-label="Banco de pandeo de columnas">
      <defs>
        <linearGradient id="columnaNormal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2d74a8" />
          <stop offset="100%" stopColor="#123f61" />
        </linearGradient>
        <linearGradient id="columnaCritica" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d14545" />
          <stop offset="100%" stopColor="#7a1818" />
        </linearGradient>
        <linearGradient id="apoyoFijo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a5663" />
          <stop offset="100%" stopColor="#2c3742" />
        </linearGradient>
        <radialGradient id="apoyoPasador" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#c3ccd4" />
          <stop offset="100%" stopColor="#6b7a88" />
        </radialGradient>
        <filter id="sombraColumna" x="-30%" y="-10%" width="160%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#1f2a33" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* Apoyo inferior */}
      {esEmpotradoAbajo ? (
        <rect x={130} y={bottomY} width={80} height={14} rx={3} fill="url(#apoyoFijo)" />
      ) : (
        <circle cx={xCentro} cy={bottomY + 6} r={8} fill="url(#apoyoPasador)" stroke="#4a5663" strokeWidth={1} />
      )}
      <line x1={80} y1={bottomY + 14} x2={260} y2={bottomY + 14} stroke="#5b6b78" strokeWidth={3} strokeLinecap="round" />

      {/* Apoyo superior */}
      {esEmpotradoArriba && <rect x={130} y={topY - 14} width={80} height={14} rx={3} fill="url(#apoyoFijo)" />}
      {!esEmpotradoArriba && !esLibreArriba && <circle cx={xCentro} cy={topY - 6} r={8} fill="url(#apoyoPasador)" stroke="#4a5663" strokeWidth={1} />}
      {!esLibreArriba && <line x1={80} y1={topY - 14} x2={260} y2={topY - 14} stroke="#5b6b78" strokeWidth={3} strokeLinecap="round" />}

      {/* Flecha de carga axial */}
      <polygon points={`${xCentro},${topY - 30} ${xCentro - 8},${topY - 16} ${xCentro + 8},${topY - 16}`} fill="#b3541e" />
      <text x={xCentro + 16} y={topY - 20} fontSize="15" fill="#b3541e" fontWeight="bold">P</text>

      {/* Columna deformada */}
      <polyline points={puntos.join(' ')} fill="none" stroke={`url(#${colorId})`} strokeWidth={7} strokeLinecap="round" filter="url(#sombraColumna)" />

      {/* Cota L: longitud de la columna */}
      <g stroke="#5b6b78" strokeWidth={1}>
        <line x1={290} y1={topY} x2={290} y2={bottomY} />
        <line x1={286} y1={topY} x2={294} y2={topY} />
        <line x1={286} y1={bottomY} x2={294} y2={bottomY} />
      </g>
      <text x={298} y={topY + alto / 2} fontSize="11" fill="#5b6b78" fontStyle="italic">L</text>

      {/* Comparador lateral, montado fuera de la columna con un brazo guía */}
      <line x1={32} y1={topY + alto / 2} x2={80} y2={topY + alto / 2} stroke="#8a97a3" strokeWidth={1.5} strokeDasharray="3 2" />
      <ComparadorDial cx={32} cy={topY + alto / 2} progreso={progresoComparador} valor={deflexion_mm} etiqueta="Comparador lateral" radio={22} />

      <text x={170} y={355} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de deflexión: ×{amplificacion} (amplificada) · forma del modo esquemática
      </text>
      {cercaDeCritica && (
        <text x={170} y={20} textAnchor="middle" fontSize="11" fill="#ab2d2d" fontWeight="bold">
          Cerca de la carga crítica de Euler
        </text>
      )}
    </svg>
  );
}

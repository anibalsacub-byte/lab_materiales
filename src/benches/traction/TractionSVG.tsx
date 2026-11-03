import { ComparadorDial } from '../../components/svg/ComparadorDial';

interface Props {
  epsilon: number; // deformación unitaria actual (positivo = alargamiento)
  amplificacion: number;
  estado: 'elastico' | 'plastico' | 'destruida';
  alargamientoMm: number;
  progreso: number; // epsilon / límite del ensayo, en [0, 1] — para la aguja del extensómetro
  diametroMm?: number;
}

const ALTO_BASE = 100;
const GAUGE_TOP_Y = 120;
const ANCHO_PROBETA = 42;
const MEDIO_GRIP = 30;
const ALTO_HOMBRO = 16;
const X_CENTRO = 185;

const COLORES_ESTADO: Record<Props['estado'], { claro: string; oscuro: string }> = {
  elastico: { claro: '#2d74a8', oscuro: '#123f61' },
  plastico: { claro: '#d17a3a', oscuro: '#8a3d10' },
  destruida: { claro: '#c94747', oscuro: '#7a1818' },
};

export function TractionSVG({ epsilon, amplificacion, estado, alargamientoMm, progreso, diametroMm }: Props) {
  const alargamiento = Math.min(epsilon * amplificacion, 0.6) * ALTO_BASE;
  const altoProbeta = ALTO_BASE + alargamiento;
  const gaugeBottomY = GAUGE_TOP_Y + altoProbeta;
  const medioGauge = (ANCHO_PROBETA / Math.sqrt(altoProbeta / ALTO_BASE)) / 2; // necking aproximado, solo visual

  const { claro, oscuro } = COLORES_ESTADO[estado];
  const destruida = estado === 'destruida';
  const breakY = GAUGE_TOP_Y + altoProbeta * 0.52;
  const gap = 9;

  const xC = X_CENTRO;
  const topMordazaFin = GAUGE_TOP_Y - ALTO_HOMBRO;
  const bottomMordazaInicio = gaugeBottomY + ALTO_HOMBRO;

  return (
    <svg viewBox="0 0 400 400" width="100%" height="320" role="img" aria-label="Banco de ensayo de tracción">
      <defs>
        <linearGradient id="bastidorAceroT" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#aab4bd" />
          <stop offset="45%" stopColor="#8a97a3" />
          <stop offset="100%" stopColor="#707d88" />
        </linearGradient>
        <linearGradient id="mordazaT" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f5366" />
          <stop offset="100%" stopColor="#263544" />
        </linearGradient>
        <linearGradient id="probetaGradT" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={claro} />
          <stop offset="100%" stopColor={oscuro} />
        </linearGradient>
        <filter id="sombraSuaveT" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1f2a33" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Bastidor */}
      <rect x={xC - 90} y={20} width={14} height={356} rx={3} fill="url(#bastidorAceroT)" />
      <rect x={xC + 76} y={20} width={14} height={356} rx={3} fill="url(#bastidorAceroT)" />
      <rect x={xC - 110} y={16} width={220} height={16} rx={4} fill="#5b6b78" />
      <rect x={xC - 110} y={360} width={220} height={16} rx={4} fill="#4a5663" />
      <text x={xC} y={12} textAnchor="middle" fontSize="10" fill="#5b6b78">Mordaza superior (fija)</text>
      <text x={xC} y={384} textAnchor="middle" fontSize="10" fill="#5b6b78">Actuador (tracción)</text>

      {/* Mordaza superior + hombro (transición al diámetro calibrado) */}
      <rect x={xC - MEDIO_GRIP} y={GAUGE_TOP_Y - ALTO_HOMBRO - 26} width={MEDIO_GRIP * 2} height={26} rx={2.5} fill="url(#mordazaT)" />
      <polygon
        points={`${xC - MEDIO_GRIP},${topMordazaFin} ${xC + MEDIO_GRIP},${topMordazaFin} ${xC + medioGauge},${GAUGE_TOP_Y} ${xC - medioGauge},${GAUGE_TOP_Y}`}
        fill="url(#mordazaT)"
        opacity={0.85}
      />

      {/* Flechas de carga F (tracción) */}
      {epsilon > 0.0001 && !destruida && (
        <>
          <line x1={xC} y1={GAUGE_TOP_Y - ALTO_HOMBRO - 44} x2={xC} y2={GAUGE_TOP_Y - ALTO_HOMBRO - 28} stroke="#b3541e" strokeWidth={3.5} />
          <polygon points={`${xC},${GAUGE_TOP_Y - ALTO_HOMBRO - 44} ${xC - 7},${GAUGE_TOP_Y - ALTO_HOMBRO - 32} ${xC + 7},${GAUGE_TOP_Y - ALTO_HOMBRO - 32}`} fill="#b3541e" />
          <text x={xC + 14} y={GAUGE_TOP_Y - ALTO_HOMBRO - 34} fontSize="15" fill="#b3541e" fontWeight="bold">F</text>

          <line x1={xC} y1={bottomMordazaInicio + 28} x2={xC} y2={bottomMordazaInicio + 44} stroke="#b3541e" strokeWidth={3.5} />
          <polygon points={`${xC},${bottomMordazaInicio + 44} ${xC - 7},${bottomMordazaInicio + 32} ${xC + 7},${bottomMordazaInicio + 32}`} fill="#b3541e" />
          <text x={xC + 14} y={bottomMordazaInicio + 42} fontSize="15" fill="#b3541e" fontWeight="bold">F</text>
        </>
      )}

      {/* Probeta: sección calibrada (completa, o partida en dos si fracturó) */}
      {!destruida ? (
        <rect
          x={xC - medioGauge}
          y={GAUGE_TOP_Y}
          width={medioGauge * 2}
          height={altoProbeta}
          rx={3}
          fill="url(#probetaGradT)"
          stroke={oscuro}
          strokeWidth={1.5}
          filter="url(#sombraSuaveT)"
        />
      ) : (
        <>
          <rect x={xC - medioGauge - 2} y={GAUGE_TOP_Y} width={medioGauge * 2 + 4} height={breakY - gap - GAUGE_TOP_Y} rx={3} fill="url(#probetaGradT)" stroke={oscuro} strokeWidth={1.5} filter="url(#sombraSuaveT)" />
          <rect x={xC - medioGauge - 2} y={breakY + gap} width={medioGauge * 2 + 4} height={gaugeBottomY - (breakY + gap)} rx={3} fill="url(#probetaGradT)" stroke={oscuro} strokeWidth={1.5} filter="url(#sombraSuaveT)" />
          <text x={xC} y={breakY + 4} textAnchor="middle" fontSize="16" fill="#7a1818" fontWeight="bold">✕</text>
        </>
      )}

      {/* Hombro inferior + mordaza inferior (se aleja con el alargamiento) */}
      <polygon
        points={`${xC - medioGauge},${gaugeBottomY} ${xC + medioGauge},${gaugeBottomY} ${xC + MEDIO_GRIP},${bottomMordazaInicio} ${xC - MEDIO_GRIP},${bottomMordazaInicio}`}
        fill="url(#mordazaT)"
        opacity={0.85}
      />
      <rect x={xC - MEDIO_GRIP} y={bottomMordazaInicio} width={MEDIO_GRIP * 2} height={26} rx={2.5} fill="url(#mordazaT)" />

      {/* Cota Lo: longitud calibrada */}
      <g stroke="#5b6b78" strokeWidth={1}>
        <line x1={xC - medioGauge - 14} y1={GAUGE_TOP_Y} x2={xC - medioGauge - 14} y2={gaugeBottomY} />
        <line x1={xC - medioGauge - 18} y1={GAUGE_TOP_Y} x2={xC - medioGauge - 10} y2={GAUGE_TOP_Y} />
        <line x1={xC - medioGauge - 18} y1={gaugeBottomY} x2={xC - medioGauge - 10} y2={gaugeBottomY} />
      </g>
      <text x={xC - medioGauge - 20} y={GAUGE_TOP_Y + altoProbeta / 2} textAnchor="end" fontSize="11" fill="#5b6b78" fontStyle="italic" transform={`rotate(-90, ${xC - medioGauge - 20}, ${GAUGE_TOP_Y + altoProbeta / 2})`}>
        Lo
      </text>

      {/* Cota D / fórmula de la sección */}
      {diametroMm !== undefined && (
        <text x={xC + medioGauge + 14} y={GAUGE_TOP_Y + 14} fontSize="10.5" fill="#5b6b78">
          D = {diametroMm.toFixed(1)} mm · S = πD²/4
        </text>
      )}

      {/* Extensómetro axial, montado fuera con un brazo guía */}
      <line x1={38} y1={GAUGE_TOP_Y + altoProbeta / 2} x2={xC - 95} y2={GAUGE_TOP_Y + altoProbeta / 2} stroke="#8a97a3" strokeWidth={1.5} strokeDasharray="3 2" />
      <ComparadorDial cx={38} cy={GAUGE_TOP_Y + altoProbeta / 2} radio={24} progreso={progreso} valor={alargamientoMm} etiqueta="Extensómetro axial" />

      <text x={xC} y={396} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de alargamiento: ×{amplificacion} (amplificada para visualización)
      </text>
    </svg>
  );
}

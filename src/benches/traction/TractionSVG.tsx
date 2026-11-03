import { ComparadorDial } from '../../components/svg/ComparadorDial';

interface Props {
  epsilon: number; // deformación unitaria actual (positivo = alargamiento)
  amplificacion: number;
  estado: 'elastico' | 'plastico' | 'destruida';
  alargamientoMm: number;
  progreso: number; // epsilon / límite del ensayo, en [0, 1] — para la aguja del extensómetro
}

const ALTO_BASE = 100;
const GAUGE_TOP_Y = 110;
const ANCHO_PROBETA = 46;

const COLORES_ESTADO: Record<Props['estado'], { claro: string; oscuro: string }> = {
  elastico: { claro: '#2d74a8', oscuro: '#123f61' },
  plastico: { claro: '#d17a3a', oscuro: '#8a3d10' },
  destruida: { claro: '#c94747', oscuro: '#7a1818' },
};

export function TractionSVG({ epsilon, amplificacion, estado, alargamientoMm, progreso }: Props) {
  const alargamiento = Math.min(epsilon * amplificacion, 0.6) * ALTO_BASE;
  const altoProbeta = ALTO_BASE + alargamiento;
  const gaugeBottomY = GAUGE_TOP_Y + altoProbeta;
  const anchoActual = ANCHO_PROBETA / Math.sqrt(altoProbeta / ALTO_BASE); // necking aproximado, solo visual

  const { claro, oscuro } = COLORES_ESTADO[estado];
  const destruida = estado === 'destruida';
  const breakY = GAUGE_TOP_Y + altoProbeta * 0.52;
  const gap = 9;

  return (
    <svg viewBox="0 0 340 400" width="100%" height="320" role="img" aria-label="Banco de ensayo de tracción">
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
      <rect x={80} y={20} width={14} height={356} rx={3} fill="url(#bastidorAceroT)" />
      <rect x={246} y={20} width={14} height={356} rx={3} fill="url(#bastidorAceroT)" />
      <rect x={60} y={16} width={220} height={16} rx={4} fill="#5b6b78" />
      <rect x={60} y={360} width={220} height={16} rx={4} fill="#4a5663" />
      <text x={170} y={12} textAnchor="middle" fontSize="10" fill="#5b6b78">Mordaza superior (fija)</text>
      <text x={170} y={384} textAnchor="middle" fontSize="10" fill="#5b6b78">Actuador (tracción)</text>

      {/* Mordaza superior */}
      <rect x={170 - ANCHO_PROBETA / 2 - 8} y={GAUGE_TOP_Y - 26} width={ANCHO_PROBETA + 16} height={26} rx={2.5} fill="url(#mordazaT)" />

      {/* Flechas de carga (alejándose, tracción) */}
      {epsilon > 0.0001 && !destruida && (
        <>
          <polygon points={`170,${GAUGE_TOP_Y - 40} 162,${GAUGE_TOP_Y - 28} 178,${GAUGE_TOP_Y - 28}`} fill="#b3541e" />
          <polygon points={`170,${gaugeBottomY + 40} 162,${gaugeBottomY + 28} 178,${gaugeBottomY + 28}`} fill="#b3541e" />
        </>
      )}

      {/* Probeta (completa, o partida en dos si fracturó) */}
      {!destruida ? (
        <rect
          x={170 - anchoActual / 2}
          y={GAUGE_TOP_Y}
          width={anchoActual}
          height={altoProbeta}
          rx={3}
          fill="url(#probetaGradT)"
          stroke={oscuro}
          strokeWidth={1.5}
          filter="url(#sombraSuaveT)"
        />
      ) : (
        <>
          <rect x={170 - anchoActual / 2 - 2} y={GAUGE_TOP_Y} width={anchoActual + 4} height={breakY - gap - GAUGE_TOP_Y} rx={3} fill="url(#probetaGradT)" stroke={oscuro} strokeWidth={1.5} filter="url(#sombraSuaveT)" />
          <rect x={170 - anchoActual / 2 - 2} y={breakY + gap} width={anchoActual + 4} height={gaugeBottomY - (breakY + gap)} rx={3} fill="url(#probetaGradT)" stroke={oscuro} strokeWidth={1.5} filter="url(#sombraSuaveT)" />
          <text x={170} y={breakY + 4} textAnchor="middle" fontSize="16" fill="#7a1818" fontWeight="bold">✕</text>
        </>
      )}

      {/* Mordaza inferior (se aleja con el alargamiento) */}
      <rect x={170 - ANCHO_PROBETA / 2 - 8} y={gaugeBottomY} width={ANCHO_PROBETA + 16} height={26} rx={2.5} fill="url(#mordazaT)" />

      {/* Extensómetro axial, montado fuera con un brazo guía */}
      <line x1={32} y1={GAUGE_TOP_Y + altoProbeta / 2} x2={80} y2={GAUGE_TOP_Y + altoProbeta / 2} stroke="#8a97a3" strokeWidth={1.5} strokeDasharray="3 2" />
      <ComparadorDial cx={32} cy={GAUGE_TOP_Y + altoProbeta / 2} radio={24} progreso={progreso} valor={alargamientoMm} etiqueta="Extensómetro axial" />

      <text x={170} y={396} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de alargamiento: ×{amplificacion} (amplificada para visualización)
      </text>
    </svg>
  );
}

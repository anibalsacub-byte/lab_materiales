import { ComparadorDial } from '../../components/svg/ComparadorDial';

interface Props {
  epsilon: number; // deformación unitaria actual (positivo = acortamiento)
  amplificacion: number;
  estado: 'elastico' | 'plastico' | 'destruida';
  acortamientoMm: number;
  progreso: number; // epsilon / límite del ensayo, en [0, 1] — para la aguja del comparador
}

const ALTO_BASE = 140;
const CENTRO_Y = 185;
const ANCHO_PROBETA = 64;

const COLORES_ESTADO: Record<Props['estado'], { claro: string; oscuro: string }> = {
  elastico: { claro: '#2d74a8', oscuro: '#123f61' },
  plastico: { claro: '#d17a3a', oscuro: '#8a3d10' },
  destruida: { claro: '#c94747', oscuro: '#7a1818' },
};

export function CompressionSVG({ epsilon, amplificacion, estado, acortamientoMm, progreso }: Props) {
  const acortamiento = Math.min(epsilon * amplificacion, 0.85) * ALTO_BASE;
  const altoProbeta = Math.max(ALTO_BASE - acortamiento, 10);
  const topY = CENTRO_Y - altoProbeta / 2;
  const bottomY = CENTRO_Y + altoProbeta / 2;
  const anchoActual = ANCHO_PROBETA * Math.sqrt(ALTO_BASE / altoProbeta); // volumen aprox. constante, solo visual

  const { claro, oscuro } = COLORES_ESTADO[estado];

  return (
    <svg viewBox="0 0 340 380" width="100%" height="320" role="img" aria-label="Banco de ensayo de compresión">
      <defs>
        <linearGradient id="bastidorAcero" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#aab4bd" />
          <stop offset="45%" stopColor="#8a97a3" />
          <stop offset="100%" stopColor="#707d88" />
        </linearGradient>
        <linearGradient id="cabezalActuador" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6b7a88" />
          <stop offset="100%" stopColor="#4a5663" />
        </linearGradient>
        <linearGradient id="platoCompresion" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f5366" />
          <stop offset="100%" stopColor="#263544" />
        </linearGradient>
        <linearGradient id="probetaGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={claro} />
          <stop offset="100%" stopColor={oscuro} />
        </linearGradient>
        <filter id="sombraSuave" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1f2a33" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Bastidor */}
      <rect x={80} y={30} width={14} height={310} rx={3} fill="url(#bastidorAcero)" />
      <rect x={246} y={30} width={14} height={310} rx={3} fill="url(#bastidorAcero)" />
      <rect x={60} y={16} width={220} height={16} rx={4} fill="url(#cabezalActuador)" />
      <rect x={60} y={328} width={220} height={16} rx={4} fill="#5b6b78" />
      <text x={170} y={352} textAnchor="middle" fontSize="10" fill="#5b6b78">Base fija</text>
      <text x={170} y={12} textAnchor="middle" fontSize="10" fill="#5b6b78">Cabezal del actuador</text>

      {/* Platos de compresión */}
      <rect x={170 - anchoActual / 2 - 10} y={topY - 12} width={anchoActual + 20} height={12} rx={2.5} fill="url(#platoCompresion)" />
      <rect x={170 - anchoActual / 2 - 10} y={bottomY} width={anchoActual + 20} height={12} rx={2.5} fill="url(#platoCompresion)" />

      {/* Flechas de carga */}
      {epsilon > 0.0001 && (
        <>
          <polygon points={`170,${topY - 30} 162,${topY - 16} 178,${topY - 16}`} fill="#b3541e" />
          <polygon points={`170,${bottomY + 30} 162,${bottomY + 16} 178,${bottomY + 16}`} fill="#b3541e" />
        </>
      )}

      {/* Probeta */}
      <rect
        x={170 - anchoActual / 2}
        y={topY}
        width={anchoActual}
        height={altoProbeta}
        rx={3}
        fill="url(#probetaGrad)"
        stroke={oscuro}
        strokeWidth={1.5}
        filter="url(#sombraSuave)"
      />

      {/* Comparador axial: montado fuera del bastidor, con un brazo que lo conecta al plato móvil */}
      <line x1={32} y1={CENTRO_Y - 10} x2={80} y2={topY - 6} stroke="#8a97a3" strokeWidth={1.5} strokeDasharray="3 2" />
      <ComparadorDial cx={32} cy={CENTRO_Y - 10} radio={24} progreso={progreso} valor={acortamientoMm} etiqueta="Comparador axial" />

      <text x={170} y={370} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de deformación: ×{amplificacion} (amplificada para visualización)
      </text>
    </svg>
  );
}

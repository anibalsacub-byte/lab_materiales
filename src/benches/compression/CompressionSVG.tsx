interface Props {
  epsilon: number; // deformación unitaria actual (positivo = acortamiento)
  amplificacion: number;
  estado: 'elastico' | 'plastico' | 'destruida';
}

const ALTO_BASE = 140;
const CENTRO_Y = 185;
const ANCHO_PROBETA = 64;

export function CompressionSVG({ epsilon, amplificacion, estado }: Props) {
  const acortamiento = Math.min(epsilon * amplificacion, 0.85) * ALTO_BASE;
  const altoProbeta = Math.max(ALTO_BASE - acortamiento, 10);
  const topY = CENTRO_Y - altoProbeta / 2;
  const bottomY = CENTRO_Y + altoProbeta / 2;
  const anchoActual = ANCHO_PROBETA * Math.sqrt(ALTO_BASE / altoProbeta); // volumen aprox. constante, solo visual

  const color = estado === 'destruida' ? '#ab2d2d' : estado === 'plastico' ? '#b3541e' : '#1d5a8a';

  return (
    <svg viewBox="0 0 300 380" width="100%" height="320" role="img" aria-label="Banco de ensayo de compresión">
      {/* Bastidor */}
      <rect x={60} y={30} width={14} height={310} fill="#8a97a3" />
      <rect x={226} y={30} width={14} height={310} fill="#8a97a3" />
      <rect x={40} y={16} width={220} height={16} fill="#5b6b78" />
      <rect x={40} y={328} width={220} height={16} fill="#5b6b78" />
      <text x={150} y={352} textAnchor="middle" fontSize="10" fill="#5b6b78">Base fija</text>
      <text x={150} y={12} textAnchor="middle" fontSize="10" fill="#5b6b78">Cabezal del actuador</text>

      {/* Platos de compresión */}
      <rect x={150 - anchoActual / 2 - 10} y={topY - 12} width={anchoActual + 20} height={12} fill="#334455" />
      <rect x={150 - anchoActual / 2 - 10} y={bottomY} width={anchoActual + 20} height={12} fill="#334455" />

      {/* Flechas de carga */}
      {epsilon > 0.0001 && (
        <>
          <polygon points={`150,${topY - 30} 142,${topY - 16} 158,${topY - 16}`} fill="#b3541e" />
          <polygon points={`150,${bottomY + 30} 142,${bottomY + 16} 158,${bottomY + 16}`} fill="#b3541e" />
        </>
      )}

      {/* Probeta */}
      <rect
        x={150 - anchoActual / 2}
        y={topY}
        width={anchoActual}
        height={altoProbeta}
        fill={color}
        stroke="#123f61"
        strokeWidth={1.5}
        opacity={0.88}
      />

      {/* Comparador axial (esquemático) */}
      <circle cx={95} cy={CENTRO_Y} r={14} fill="#fff" stroke="#5b6b78" strokeWidth={1.5} />
      <line x1={95} y1={CENTRO_Y} x2={95 + 9 * Math.cos((epsilon * 400 * Math.PI) / 180)} y2={CENTRO_Y - 9 * Math.sin((epsilon * 400 * Math.PI) / 180)} stroke="#ab2d2d" strokeWidth={1.5} />
      <text x={95} y={CENTRO_Y + 28} textAnchor="middle" fontSize="8" fill="#5b6b78">Comparador</text>

      <text x={150} y={370} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de deformación: ×{amplificacion} (amplificada para visualización)
      </text>
    </svg>
  );
}

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

/** Comparador de carátula: aguja que barre de -110° a +110° según el progreso del ensayo. */
function ComparadorDial({ cx, cy, progreso, valorMm }: { cx: number; cy: number; progreso: number; valorMm: number }) {
  const r = 22;
  const anguloDeg = -110 + Math.min(Math.max(progreso, 0), 1) * 220;
  const anguloRad = (anguloDeg * Math.PI) / 180;
  const agujaX = cx + (r - 4) * Math.cos(anguloRad);
  const agujaY = cy + (r - 4) * Math.sin(anguloRad);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = (((-110 + f * 220) * Math.PI) / 180);
    return {
      x1: cx + (r - 5) * Math.cos(a),
      y1: cy + (r - 5) * Math.sin(a),
      x2: cx + r * Math.cos(a),
      y2: cy + r * Math.sin(a),
    };
  });

  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill="#fff" stroke="#5b6b78" strokeWidth={1.5} />
      {marcas.map((m, i) => (
        <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#8a97a3" strokeWidth={1} />
      ))}
      <line x1={cx} y1={cy} x2={agujaX} y2={agujaY} stroke="#ab2d2d" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2.2} fill="#123f61" />
      <text x={cx} y={cy + r + 16} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#123f61">
        {valorMm.toFixed(4)} mm
      </text>
      <text x={cx} y={cy + r + 28} textAnchor="middle" fontSize="8" fill="#5b6b78">Comparador axial</text>
    </g>
  );
}

export function CompressionSVG({ epsilon, amplificacion, estado, acortamientoMm, progreso }: Props) {
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

      {/* Comparador axial */}
      <ComparadorDial cx={88} cy={CENTRO_Y - 10} progreso={progreso} valorMm={acortamientoMm} />

      <text x={150} y={370} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de deformación: ×{amplificacion} (amplificada para visualización)
      </text>
    </svg>
  );
}

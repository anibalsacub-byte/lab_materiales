interface Props {
  cx: number;
  cy: number;
  /** Progreso de la aguja en [0, 1] respecto al fondo de escala elegido para la visualización del dial. */
  progreso: number;
  valor: number;
  unidad?: string;
  decimales?: number;
  etiqueta?: string;
  radio?: number;
}

/**
 * Comparador de carátula reutilizable: aguja que barre de -110° a +110° según
 * `progreso`, con el valor real (mm) impreso debajo. `progreso` es responsabilidad
 * de quien lo use: debe reflejar la magnitud que el instrumento mide, para que la
 * aguja nunca se mueva en contradicción con el valor numérico mostrado (p. ej. si
 * la deflexión real es cero, progreso debe ser 0 y la aguja debe quedar al centro).
 */
export function ComparadorDial({ cx, cy, progreso, valor, unidad = 'mm', decimales = 4, etiqueta = 'Comparador', radio = 22 }: Props) {
  const r = radio;
  const p = Math.min(Math.max(progreso, 0), 1);
  const anguloDeg = -110 + p * 220;
  const anguloRad = (anguloDeg * Math.PI) / 180;
  const agujaX = cx + (r - 5) * Math.cos(anguloRad);
  const agujaY = cy + (r - 5) * Math.sin(anguloRad);
  const colaX = cx - (r - 14) * Math.cos(anguloRad);
  const colaY = cy - (r - 14) * Math.sin(anguloRad);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = ((-110 + f * 220) * Math.PI) / 180;
    return {
      x1: cx + (r - 5) * Math.cos(a),
      y1: cy + (r - 5) * Math.sin(a),
      x2: cx + r * Math.cos(a),
      y2: cy + r * Math.sin(a),
    };
  });
  const idGradiente = `dialFace-${etiqueta.replace(/\s+/g, '')}`;

  return (
    <g>
      <defs>
        <radialGradient id={idGradiente} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7ecf1" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + 4} fill={`url(#${idGradiente})`} stroke="#5b6b78" strokeWidth={1.5} />
      {marcas.map((m, i) => (
        <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#8a97a3" strokeWidth={1} />
      ))}
      <line x1={colaX} y1={colaY} x2={agujaX} y2={agujaY} stroke="#ab2d2d" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2.6} fill="#123f61" />
      <text x={cx} y={cy + r + 21} textAnchor="middle" fontSize="15" fontWeight="700" fill="#123f61" style={{ fontFamily: 'var(--font-mono)' }}>
        {valor.toFixed(decimales)} {unidad}
      </text>
      <text x={cx} y={cy + r + 34} textAnchor="middle" fontSize="10" fill="#5b6b78" style={{ fontFamily: 'var(--font)' }}>{etiqueta}</text>
    </g>
  );
}

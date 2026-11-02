import type { CondicionApoyo } from '../../engine/mechanics/buckling';

interface Props {
  deflexion_mm: number;
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

export function BucklingSVG({ deflexion_mm, amplificacion, condicion, cercaDeCritica }: Props) {
  const topY = 40;
  const bottomY = 320;
  const alto = bottomY - topY;
  const xCentro = 150;
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

  const color = cercaDeCritica ? '#ab2d2d' : '#1d5a8a';

  return (
    <svg viewBox="0 0 300 380" width="100%" height="320" role="img" aria-label="Banco de pandeo de columnas">
      {/* Apoyo inferior */}
      {esEmpotradoAbajo ? (
        <rect x={110} y={bottomY} width={80} height={14} fill="#334455" />
      ) : (
        <circle cx={xCentro} cy={bottomY + 6} r={8} fill="#8a97a3" />
      )}
      <line x1={60} y1={bottomY + 14} x2={240} y2={bottomY + 14} stroke="#5b6b78" strokeWidth={3} />

      {/* Apoyo superior */}
      {esEmpotradoArriba && <rect x={110} y={topY - 14} width={80} height={14} fill="#334455" />}
      {!esEmpotradoArriba && !esLibreArriba && <circle cx={xCentro} cy={topY - 6} r={8} fill="#8a97a3" />}
      {!esLibreArriba && <line x1={60} y1={topY - 14} x2={240} y2={topY - 14} stroke="#5b6b78" strokeWidth={3} />}

      {/* Flecha de carga axial */}
      <polygon points={`${xCentro},${topY - 30} ${xCentro - 8},${topY - 16} ${xCentro + 8},${topY - 16}`} fill="#b3541e" />
      <text x={xCentro + 14} y={topY - 18} fontSize="10" fill="#b3541e">P</text>

      {/* Columna deformada */}
      <polyline points={puntos.join(' ')} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.9} />

      {/* Comparador lateral en el punto medio */}
      <circle cx={60} cy={topY + alto / 2} r={12} fill="#fff" stroke="#5b6b78" strokeWidth={1.5} />
      <text x={60} y={topY + alto / 2 + 24} textAnchor="middle" fontSize="8" fill="#5b6b78">Comparador lateral</text>

      <text x={150} y={355} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de deflexión: ×{amplificacion} (amplificada) · forma del modo esquemática
      </text>
      {cercaDeCritica && (
        <text x={150} y={20} textAnchor="middle" fontSize="11" fill="#ab2d2d" fontWeight="bold">
          Cerca de la carga crítica de Euler
        </text>
      )}
    </svg>
  );
}

import type { ApoyoViga, TipoCargaViga } from '../../engine/mechanics/bending';

interface Props {
  apoyo: ApoyoViga;
  tipoCarga: TipoCargaViga;
  L_mm: number;
  a_mm?: number;
  deflexionMax_mm: number;
  amplificacion: number;
  cercaDelLimite: boolean;
}

const X_INICIO = 60;
const X_FIN = 340;
const VIGA_Y = 150;

/** Forma esquemática de la elástica (no a escala); la AMPLITUD sí sigue la fórmula validada. */
function formaDeflexion(apoyo: ApoyoViga, t: number): number {
  if (apoyo === 'voladizo') return (t ** 2 * (3 - t)) / 2; // 0 en el empotramiento, 1 en el extremo libre
  return Math.sin(Math.PI * t); // simétrica, máxima hacia el centro
}

export function BendingSVG({ apoyo, tipoCarga, L_mm, a_mm, deflexionMax_mm, amplificacion, cercaDelLimite }: Props) {
  const anchoPx = X_FIN - X_INICIO;
  const deflexionPx = Math.min(Math.abs(deflexionMax_mm) * amplificacion, 60);

  const n = 40;
  const puntos: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = X_INICIO + t * anchoPx;
    const y = VIGA_Y + formaDeflexion(apoyo, t) * deflexionPx;
    puntos.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const colorId = cercaDelLimite ? 'vigaCritica' : 'vigaNormal';
  const posCargaFrac = tipoCarga === 'puntual' ? (apoyo === 'voladizo' ? 1 : (a_mm ?? L_mm / 2) / L_mm) : 0.5;
  const xCarga = X_INICIO + posCargaFrac * anchoPx;

  return (
    <svg viewBox="0 0 400 260" width="100%" height="280" role="img" aria-label="Banco de ensayo de flexión">
      <defs>
        <linearGradient id="vigaNormal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a90c4" />
          <stop offset="50%" stopColor="#2d74a8" />
          <stop offset="100%" stopColor="#123f61" />
        </linearGradient>
        <linearGradient id="vigaCritica" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e07a7a" />
          <stop offset="50%" stopColor="#d14545" />
          <stop offset="100%" stopColor="#7a1818" />
        </linearGradient>
        <linearGradient id="empotramientoFlexion" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a5663" />
          <stop offset="100%" stopColor="#2c3742" />
        </linearGradient>
        <filter id="sombraViga" x="-10%" y="-40%" width="120%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1f2a33" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* Apoyos */}
      {apoyo === 'simple' ? (
        <>
          <polygon points={`${X_INICIO},${VIGA_Y} ${X_INICIO - 12},${VIGA_Y + 20} ${X_INICIO + 12},${VIGA_Y + 20}`} fill="#8a97a3" stroke="#4a5663" strokeWidth={1} />
          <line x1={X_INICIO - 20} y1={VIGA_Y + 20} x2={X_INICIO + 20} y2={VIGA_Y + 20} stroke="#5b6b78" strokeWidth={3} />
          <polygon points={`${X_FIN},${VIGA_Y} ${X_FIN - 12},${VIGA_Y + 20} ${X_FIN + 12},${VIGA_Y + 20}`} fill="#8a97a3" stroke="#4a5663" strokeWidth={1} />
          <circle cx={X_FIN - 7} cy={VIGA_Y + 25} r={3.5} fill="#8a97a3" />
          <circle cx={X_FIN + 7} cy={VIGA_Y + 25} r={3.5} fill="#8a97a3" />
          <line x1={X_FIN - 20} y1={VIGA_Y + 29} x2={X_FIN + 20} y2={VIGA_Y + 29} stroke="#5b6b78" strokeWidth={3} />
        </>
      ) : (
        <>
          <rect x={X_INICIO - 16} y={VIGA_Y - 40} width={16} height={80} fill="url(#empotramientoFlexion)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={X_INICIO - 16} y1={VIGA_Y - 40 + i * 20} x2={X_INICIO - 28} y2={VIGA_Y - 40 + i * 20 + 14} stroke="#5b6b78" strokeWidth={2} />
          ))}
        </>
      )}

      {/* Carga */}
      {tipoCarga === 'puntual' ? (
        <>
          <line x1={xCarga} y1={VIGA_Y - 42} x2={xCarga} y2={VIGA_Y - 8} stroke="#b3541e" strokeWidth={3.5} />
          <polygon points={`${xCarga},${VIGA_Y - 6} ${xCarga - 7},${VIGA_Y - 18} ${xCarga + 7},${VIGA_Y - 18}`} fill="#b3541e" />
          <text x={xCarga + 10} y={VIGA_Y - 26} fontSize="15" fill="#b3541e" fontWeight="bold">P</text>
        </>
      ) : (
        <>
          <line x1={X_INICIO} y1={VIGA_Y - 30} x2={X_FIN} y2={VIGA_Y - 30} stroke="#b3541e" strokeWidth={1.5} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const x = X_INICIO + (i / 8) * anchoPx;
            return (
              <g key={i}>
                <line x1={x} y1={VIGA_Y - 30} x2={x} y2={VIGA_Y - 8} stroke="#b3541e" strokeWidth={2} />
                <polygon points={`${x},${VIGA_Y - 6} ${x - 4},${VIGA_Y - 14} ${x + 4},${VIGA_Y - 14}`} fill="#b3541e" />
              </g>
            );
          })}
          <text x={(X_INICIO + X_FIN) / 2} y={VIGA_Y - 36} textAnchor="middle" fontSize="15" fill="#b3541e" fontWeight="bold">w</text>
        </>
      )}

      {/* Viga deformada */}
      <polyline points={puntos.join(' ')} fill="none" stroke={`url(#${colorId})`} strokeWidth={8} strokeLinecap="round" filter="url(#sombraViga)" />

      <text x={200} y={230} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de deflexión: ×{amplificacion} (amplificada) · forma esquemática de la elástica
      </text>
      <text x={200} y={246} textAnchor="middle" fontSize="10" fill="#5b6b78">
        L = {L_mm.toFixed(0)} mm
      </text>
      {cercaDelLimite && (
        <text x={200} y={18} textAnchor="middle" fontSize="11" fill="#ab2d2d" fontWeight="bold">
          Cerca del límite elástico estimado
        </text>
      )}
    </svg>
  );
}

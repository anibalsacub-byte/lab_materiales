import { ComparadorDial } from '../../components/svg/ComparadorDial';

interface Props {
  phiRad: number;
  phiDeg: number;
  amplificacion: number;
  progreso: number; // |T| / Tmax, en [0,1] — para la aguja del indicador angular
  cercaDelLimite: boolean;
}

const EJE_Y = 150;
const X_FIJO = 95;
const X_LIBRE = 300;
const RADIO_EJE = 22;

export function TorsionSVG({ phiRad, phiDeg, amplificacion, progreso, cercaDelLimite }: Props) {
  const anguloVisual = Math.min(Math.abs(phiRad) * amplificacion, 0.95) * Math.sign(phiRad || 1);
  const n = 7;
  const lineas = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const x = X_FIJO + t * (X_LIBRE - X_FIJO);
    const skew = anguloVisual * RADIO_EJE * t;
    return { x, skew };
  });

  const colorId = cercaDelLimite ? 'ejeCritico' : 'ejeNormal';

  return (
    <svg viewBox="0 0 400 280" width="100%" height="280" role="img" aria-label="Banco de ensayo de torsión">
      <defs>
        <linearGradient id="ejeNormal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a90c4" />
          <stop offset="50%" stopColor="#2d74a8" />
          <stop offset="100%" stopColor="#123f61" />
        </linearGradient>
        <linearGradient id="ejeCritico" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e07a7a" />
          <stop offset="50%" stopColor="#d14545" />
          <stop offset="100%" stopColor="#7a1818" />
        </linearGradient>
        <linearGradient id="mordazaFijaT" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a5663" />
          <stop offset="100%" stopColor="#2c3742" />
        </linearGradient>
        <filter id="sombraEje" x="-20%" y="-30%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1f2a33" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* Mordaza fija (empotramiento) */}
      <rect x={40} y={EJE_Y - 45} width={55} height={90} rx={4} fill="url(#mordazaFijaT)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={40} y1={EJE_Y - 45 + i * 22.5} x2={28} y2={EJE_Y - 45 + i * 22.5 + 14} stroke="#5b6b78" strokeWidth={2} />
      ))}
      <text x={67} y={EJE_Y - 56} textAnchor="middle" fontSize="10" fill="#5b6b78">Mordaza fija</text>

      {/* Eje con cuadrícula de torsión */}
      <rect x={X_FIJO} y={EJE_Y - RADIO_EJE} width={X_LIBRE - X_FIJO} height={RADIO_EJE * 2} rx={RADIO_EJE} fill={`url(#${colorId})`} filter="url(#sombraEje)" />
      {lineas.map((l, i) => (
        <line key={i} x1={l.x} y1={EJE_Y - RADIO_EJE} x2={l.x + l.skew} y2={EJE_Y + RADIO_EJE} stroke="#0f2e47" strokeWidth={1.3} opacity={0.65} />
      ))}

      {/* Cota L: longitud del eje */}
      <g stroke="#5b6b78" strokeWidth={1}>
        <line x1={X_FIJO} y1={EJE_Y - RADIO_EJE - 14} x2={X_LIBRE} y2={EJE_Y - RADIO_EJE - 14} />
        <line x1={X_FIJO} y1={EJE_Y - RADIO_EJE - 18} x2={X_FIJO} y2={EJE_Y - RADIO_EJE - 10} />
        <line x1={X_LIBRE} y1={EJE_Y - RADIO_EJE - 18} x2={X_LIBRE} y2={EJE_Y - RADIO_EJE - 10} />
      </g>
      <text x={(X_FIJO + X_LIBRE) / 2} y={EJE_Y - RADIO_EJE - 20} textAnchor="middle" fontSize="11" fill="#5b6b78" fontStyle="italic">L</text>

      {/* Manivela / llave de torsión en el extremo libre, rota con φ */}
      <g transform={`rotate(${phiDeg}, ${X_LIBRE + 22}, ${EJE_Y})`}>
        <circle cx={X_LIBRE + 22} cy={EJE_Y} r={16} fill="#8a97a3" stroke="#4a5663" strokeWidth={1.5} />
        <line x1={X_LIBRE + 22} y1={EJE_Y} x2={X_LIBRE + 22 + 34} y2={EJE_Y} stroke="#b3541e" strokeWidth={5} strokeLinecap="round" />
        <circle cx={X_LIBRE + 22 + 34} cy={EJE_Y} r={5} fill="#b3541e" />
      </g>
      <text x={X_LIBRE + 22} y={EJE_Y - 32} textAnchor="middle" fontSize="15" fill="#b3541e" fontWeight="bold">T</text>

      {/* Indicador angular */}
      <ComparadorDial cx={200} cy={236} radio={24} progreso={progreso} valor={phiDeg} unidad="°" decimales={3} etiqueta="Indicador angular" />

      <text x={200} y={20} textAnchor="middle" fontSize="10" fill="#b3541e" fontWeight="bold">
        Escala gráfica de giro: ×{amplificacion} (amplificada) — las líneas sobre el eje marcan la torsión
      </text>
      {cercaDelLimite && (
        <text x={200} y={34} textAnchor="middle" fontSize="10.5" fill="#ab2d2d" fontWeight="bold">
          Cerca del límite elástico estimado
        </text>
      )}
    </svg>
  );
}

import type { ReactNode } from 'react';

/**
 * Marco de la máquina universal de ensayos (2D): columnas roscadas, travesaño superior fijo,
 * travesaño móvil con celda de carga, mesa y gabinete con consola. El montaje propio de cada
 * ensayo (mordazas y probeta, platos de compresión, utillaje de flexión…) llega como `children`,
 * dibujado en el mismo sistema de coordenadas (viewBox 520×600, eje en x = XC, mesa en y = MESA_Y).
 */

export const XC = 260;
export const MESA_Y = 452;
/** Altura máxima (y mínima en pantalla) a la que puede subir el travesaño móvil. */
export const Y_TRAVESANO_MIN = 48;

export interface ColoresProbeta {
  claro: string;
  medio: string;
  oscuro: string;
}

/** Gradientes y filtros compartidos por el marco y los montajes (ids con prefijo «um»). */
export function DefsMaquina({ colorProbeta }: { colorProbeta: ColoresProbeta }) {
  return (
    <defs>
      <linearGradient id="umFondo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1d2a38" />
        <stop offset="78%" stopColor="#141e29" />
        <stop offset="78%" stopColor="#0f161e" />
        <stop offset="100%" stopColor="#0b1117" />
      </linearGradient>
      <linearGradient id="umCromado" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#5d6b78" />
        <stop offset="35%" stopColor="#d3dce4" />
        <stop offset="60%" stopColor="#9aa8b5" />
        <stop offset="100%" stopColor="#4c5866" />
      </linearGradient>
      <pattern id="umRosca" width="20" height="5" patternUnits="userSpaceOnUse">
        <rect width="20" height="5" fill="url(#umCromado)" />
        <line x1="0" y1="0" x2="20" y2="5" stroke="#26313d" strokeWidth="1" opacity="0.55" />
      </pattern>
      <linearGradient id="umTravesano" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3f6e9c" />
        <stop offset="50%" stopColor="#2b5580" />
        <stop offset="100%" stopColor="#1c3c5e" />
      </linearGradient>
      <linearGradient id="umCuerpo" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#2a3542" />
        <stop offset="50%" stopColor="#4a5868" />
        <stop offset="100%" stopColor="#252f3b" />
      </linearGradient>
      <linearGradient id="umCuerpoV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4a5868" />
        <stop offset="50%" stopColor="#2f3a47" />
        <stop offset="100%" stopColor="#202932" />
      </linearGradient>
      <linearGradient id="umGabinete" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2f5f8c" />
        <stop offset="100%" stopColor="#1d3f61" />
      </linearGradient>
      {/* Probeta vertical (brillo de izquierda a derecha) y horizontal (de arriba abajo) */}
      <linearGradient id="umProbeta" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={colorProbeta.oscuro} />
        <stop offset="35%" stopColor={colorProbeta.claro} />
        <stop offset="65%" stopColor={colorProbeta.medio} />
        <stop offset="100%" stopColor={colorProbeta.oscuro} />
      </linearGradient>
      <linearGradient id="umProbetaH" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colorProbeta.claro} />
        <stop offset="45%" stopColor={colorProbeta.medio} />
        <stop offset="100%" stopColor={colorProbeta.oscuro} />
      </linearGradient>
      <filter id="umSombra" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

export interface PropsConsola {
  /** Lectura instantánea y pico retenido, ya formateados. */
  displayCarga: string;
  displayPico: string;
  unidad: string;
  enMarcha: boolean;
  onParadaEmergencia?: () => void;
  /** Dos líneas de la placa de la máquina. */
  placa?: [string, string];
}

/** Consola de mando: indicador de carga (instantánea y pico), placa, piloto de marcha y parada de emergencia. */
export function ConsolaSVG({ x, y, p }: { x: number; y: number; p: PropsConsola }) {
  const [l1, l2] = p.placa ?? ['MÁQUINA UNIVERSAL', 'DE ENSAYOS'];
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={0} y={0} width={328} height={118} rx={6} fill="url(#umGabinete)" stroke="#0f2236" />
      <rect x={18} y={12} width={150} height={78} rx={5} fill="#05090d" stroke="#2b3f52" />
      <text x={28} y={28} fontSize="8" fill="#5f7a92">{p.unidad === 'N·m' ? 'PAR' : 'CARGA'}</text>
      <text x={140} y={48} textAnchor="end" fontSize="21" fill="#59f0b0" fontFamily="'IBM Plex Mono', monospace">{p.displayCarga}</text>
      <text x={145} y={48} fontSize="9" fill="#59f0b0">{p.unidad}</text>
      <text x={28} y={64} fontSize="8" fill="#5f7a92">PICO</text>
      <text x={140} y={81} textAnchor="end" fontSize="15" fill="#f0b429" fontFamily="'IBM Plex Mono', monospace">{p.displayPico}</text>
      <text x={145} y={81} fontSize="9" fill="#f0b429">{p.unidad}</text>
      <rect x={182} y={16} width={86} height={34} rx={3} fill="#dfe6ec" stroke="#8a99a8" />
      <text x={225} y={30} textAnchor="middle" fontSize="7.5" fill="#1d2a38" fontWeight="bold">{l1}</text>
      <text x={225} y={41} textAnchor="middle" fontSize="7.5" fill="#1d2a38" fontWeight="bold">{l2}</text>
      <circle cx={204} cy={72} r={6} fill={p.enMarcha ? '#4dff9a' : '#1f4a33'} stroke="#0c1c13" />
      <text x={204} y={90} textAnchor="middle" fontSize="7" fill="#c3d2e0">EN MARCHA</text>
      <g onClick={p.onParadaEmergencia} style={{ cursor: p.onParadaEmergencia ? 'pointer' : 'default' }}>
        <title>Parada de emergencia (pausa el ensayo)</title>
        <circle cx={292} cy={52} r={22} fill="#f2c200" stroke="#7a6200" />
        <circle cx={292} cy={52} r={15} fill="#d42a2a" stroke="#7c1010" />
        <circle cx={289} cy={48} r={5} fill="#ff7a7a" opacity={0.5} />
      </g>
      <text x={292} y={86} textAnchor="middle" fontSize="7" fill="#c3d2e0">PARADA</text>
    </g>
  );
}

/**
 * Rótulo de cota sobre fondo propio (para que las columnas no lo tapen): una línea principal que
 * cambia durante el ensayo y hasta dos secundarias.
 */
export function RotuloCota({ xDerecha, yCentro, lineas }: { xDerecha: number; yCentro: number; lineas: string[] }) {
  const alto = 8 + lineas.length * 14;
  return (
    <g>
      <rect x={xDerecha - 84} y={yCentro - alto / 2} width={88} height={alto} rx={4} fill="#0c1620" opacity={0.9} stroke="#22344a" />
      {lineas.map((l, i) => (
        <text
          key={i}
          x={xDerecha}
          y={yCentro - alto / 2 + 15 + i * 14}
          textAnchor="end"
          fontSize={i === 0 ? 11.5 : 10}
          fill={i === 0 ? '#e3edf7' : i === 1 ? '#a9bdd1' : '#7f97b0'}
          fontWeight={i === 0 ? 600 : 400}
          fontStyle="italic"
        >
          {l}
        </text>
      ))}
    </g>
  );
}

interface Props extends PropsConsola {
  /** Borde superior del travesaño móvil. */
  yTravesano: number;
  colorProbeta: ColoresProbeta;
  ariaLabel: string;
  children: ReactNode;
}

export function MarcoMaquinaSVG(p: Props) {
  const yT = Math.max(p.yTravesano, Y_TRAVESANO_MIN);
  return (
    <svg viewBox="0 0 520 600" width="100%" role="img" aria-label={p.ariaLabel} style={{ display: 'block' }}>
      <DefsMaquina colorProbeta={p.colorProbeta} />
      <rect x={0} y={0} width={520} height={600} fill="url(#umFondo)" rx={10} />

      {/* Columnas roscadas */}
      {[118, 382].map((x) => (
        <rect key={x} x={x} y={36} width={20} height={MESA_Y - 36} fill="url(#umRosca)" stroke="#1a232d" strokeWidth={0.8} />
      ))}

      {/* Travesaño superior fijo */}
      <rect x={96} y={14} width={328} height={26} rx={5} fill="url(#umTravesano)" filter="url(#umSombra)" />
      <rect x={96} y={14} width={328} height={5} rx={2} fill="#ffffff" opacity={0.12} />

      {/* Travesaño móvil con la celda de carga */}
      <rect x={96} y={yT} width={328} height={24} rx={5} fill="url(#umTravesano)" filter="url(#umSombra)" />
      {[112, 376].map((x) => (
        <rect key={x} x={x} y={yT - 3} width={32} height={30} rx={4} fill="#1c3550" stroke="#0e1d2c" />
      ))}
      <rect x={232} y={yT + 6} width={56} height={12} rx={2} fill="#d4a017" />
      <text x={XC} y={yT + 15} textAnchor="middle" fontSize="7" fill="#2b2207" fontWeight="bold">CELDA DE CARGA</text>

      {/* Mesa */}
      <rect x={78} y={MESA_Y} width={364} height={18} rx={3} fill="#3b4a59" stroke="#1a232d" />

      {p.children}

      <ConsolaSVG x={96} y={MESA_Y + 18} p={p} />
    </svg>
  );
}

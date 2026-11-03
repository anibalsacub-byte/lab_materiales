import { MESA_Y, RotuloCota, XC } from '../../components/svg/MarcoMaquinaSVG';
import type { ConfiguracionFlexion } from '../../engine/mechanics/bending';

/**
 * Utillaje de flexión en la máquina universal: bancada con dos apoyos de rodillo, viga apoyada,
 * punzón de carga (uno en el centro, o dos a L/3 con un balancín para 4 puntos) colgando del
 * travesaño y deflectómetro bajo el centro del claro.
 */

const S = 300; // claro dibujado (px), fijo: la cota indica el real
const VOLADIZO = 26;
const BASE = 30;
const PEDESTAL = 22;
const R_RODILLO = 7;
const R_PUNZON = 9;
const BARRA = 70;

const yRodilloCentro = MESA_Y - BASE - PEDESTAL - R_RODILLO;
const yApoyo = yRodilloCentro - R_RODILLO;

/** Altura dibujada de la viga, proporcional a h/L (acotada para que siempre se vea). */
export function altoVisualViga(h: number, L: number): number {
  return Math.min(Math.max((S * h) / L, 6), 30);
}

/**
 * Forma de la elástica normalizada (1 en el centro) en s = x/L: elástica de carga central
 * s·(3 − 4s²), que se va volviendo una «V» (rótula plástica en el centro) a medida que la sección
 * plastifica. En 4 puntos el tramo central es casi un arco de curvatura constante.
 */
function forma(s: number, plastificacion: number, config: ConfiguracionFlexion): number {
  const sc = Math.min(s, 1 - s);
  const elastica = config === 'tres-puntos' ? sc * (3 - 4 * sc * sc) : Math.min((sc * (3 - 4 * sc * sc) * 1.05), 1 - 2.2 * (0.5 - sc) ** 2);
  const rotula = config === 'tres-puntos' ? 2 * sc : Math.min(3 * sc, 1);
  return (1 - plastificacion) * elastica + plastificacion * rotula;
}

/** Borde superior del travesaño móvil: baja con la flecha (el punzón acompaña a la viga). */
export function yTravesanoFlexion(altoViga: number, flechaVisual: number, config: ConfiguracionFlexion, enContacto: boolean): number {
  const fCarga = config === 'tres-puntos' ? 1 : forma(1 / 3, 0, config);
  const yContacto = yApoyo - altoViga + flechaVisual * fCarga - (enContacto ? 0 : 12);
  const balancin = config === 'cuatro-puntos' ? 16 : 0;
  return yContacto - 2 * R_PUNZON - balancin - BARRA - 24;
}

interface Props {
  config: ConfiguracionFlexion;
  altoViga: number;
  flechaVisual: number;
  /** 0 (elástica) a 1 (rótula plástica totalmente formada). */
  plastificacion: number;
  fracturada: boolean;
  probetaVisible: boolean;
  enContacto: boolean;
  circular: boolean;
  cotas: string[];
}

export function MontajeFlexionSVG(p: Props) {
  const xA = XC - S / 2;
  const xB = XC + S / 2;
  const n = 60;
  const w = (x: number) => {
    const s = (x - xA) / S;
    if (s < 0) return -3 * p.flechaVisual * (-s); // el voladizo gira con la pendiente del apoyo
    if (s > 1) return -3 * p.flechaVisual * (s - 1);
    return p.flechaVisual * forma(s, p.plastificacion, p.config);
  };
  const xIni = xA - VOLADIZO;
  const xFin = xB + VOLADIZO;
  const borde = (x0: number, x1: number, desplaz: number) => {
    const sup: string[] = [];
    const inf: string[] = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      sup.push(`${(x + desplaz).toFixed(1)},${(yApoyo - p.altoViga + w(x)).toFixed(1)}`);
      inf.push(`${(x + desplaz).toFixed(1)},${(yApoyo + w(x)).toFixed(1)}`);
    }
    return [...sup, ...inf.reverse()].join(' ');
  };

  const fCarga = p.config === 'tres-puntos' ? 1 : forma(1 / 3, 0, p.config);
  const yContacto = yApoyo - p.altoViga + p.flechaVisual * fCarga - (p.enContacto ? 0 : 12);
  const yPunzon = yContacto - R_PUNZON;
  const balancin = p.config === 'cuatro-puntos' ? 16 : 0;
  const yBarraInf = yPunzon - R_PUNZON - balancin;
  const xsPunzon = p.config === 'tres-puntos' ? [XC] : [XC - S / 6, XC + S / 6];

  const yInfCentro = yApoyo + w(XC);
  const gap = 4;

  return (
    <g>
      {/* Bancada de flexión y apoyos de rodillo */}
      <rect x={xA - 60} y={MESA_Y - BASE} width={S + 120} height={BASE} rx={3} fill="url(#umCuerpoV)" stroke="#0e1720" />
      {[xA, xB].map((x) => (
        <g key={x}>
          <polygon points={`${x - 16},${MESA_Y - BASE} ${x + 16},${MESA_Y - BASE} ${x + 7},${MESA_Y - BASE - PEDESTAL} ${x - 7},${MESA_Y - BASE - PEDESTAL}`} fill="url(#umCuerpo)" stroke="#0e1720" />
          <circle cx={x} cy={yRodilloCentro} r={R_RODILLO} fill="url(#umCromado)" stroke="#2a3442" />
        </g>
      ))}

      {/* Punzón (o balancín con dos punzones) colgando del travesaño */}
      <rect x={XC - 9} y={yBarraInf - BARRA} width={18} height={BARRA} fill="url(#umCuerpo)" stroke="#0e1720" />
      {p.config === 'cuatro-puntos' && <rect x={XC - S / 6 - 12} y={yBarraInf} width={S / 3 + 24} height={balancin} rx={3} fill="url(#umCuerpoV)" stroke="#0e1720" />}
      {xsPunzon.map((x) => (
        <circle key={x} cx={x} cy={yPunzon} r={R_PUNZON} fill="url(#umCromado)" stroke="#2a3442" />
      ))}

      {p.probetaVisible && (
        <>
          <g filter="url(#umSombra)">
            {!p.fracturada ? (
              <polygon points={borde(xIni, xFin, 0)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
            ) : (
              <>
                <polygon points={borde(xIni, XC - gap / 2, -2)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
                <polygon points={borde(XC + gap / 2, xFin, 2)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
              </>
            )}
          </g>
          {p.circular && !p.fracturada && <polyline points={Array.from({ length: n + 1 }, (_, i) => { const x = xIni + ((xFin - xIni) * i) / n; return `${x.toFixed(1)},${(yApoyo - p.altoViga * 0.7 + w(x)).toFixed(1)}`; }).join(' ')} fill="none" stroke="#ffffff" strokeOpacity={0.25} />}

          {/* Deflectómetro bajo el centro del claro */}
          {!p.fracturada && (
            <g>
              <rect x={XC - 2} y={yInfCentro} width={4} height={MESA_Y - BASE - yInfCentro} fill="#c9d3dc" opacity={0.75} />
              <circle cx={XC + 40} cy={MESA_Y - BASE - 18} r={12} fill="#e8edf2" stroke="#55606b" strokeWidth={1.5} />
              <line x1={XC + 2} y1={MESA_Y - BASE - 18} x2={XC + 28} y2={MESA_Y - BASE - 18} stroke="#55606b" />
              <text x={XC + 56} y={MESA_Y - BASE - 15} fontSize="9" fill="#a9bdd1">Deflectómetro</text>
            </g>
          )}

          {/* Cota del claro */}
          <g stroke="#7f97b0" strokeWidth={1}>
            <line x1={xA} y1={MESA_Y - BASE + 12} x2={xB} y2={MESA_Y - BASE + 12} />
            <line x1={xA} y1={MESA_Y - BASE + 7} x2={xA} y2={MESA_Y - BASE + 17} />
            <line x1={xB} y1={MESA_Y - BASE + 7} x2={xB} y2={MESA_Y - BASE + 17} />
          </g>
          <RotuloCota xDerecha={xA - 12} yCentro={yApoyo - p.altoViga - 34} lineas={p.cotas} />
        </>
      )}
    </g>
  );
}

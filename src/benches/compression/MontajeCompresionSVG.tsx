import { MESA_Y, RotuloCota, XC } from '../../components/svg/MarcoMaquinaSVG';

/**
 * Montaje de compresión: plato inferior sobre la mesa, plato superior (con asiento esférico)
 * colgando del travesaño, probeta cilíndrica o prismática entre ambos y comparador de
 * acortamiento. Los metales dúctiles se abarrilan (el rozamiento con los platos frena la
 * expansión de las caras); los frágiles rompen por un plano inclinado de cortante.
 */

const BASE_INF = 40;
const PLATO = 14;
const ADAPTADOR = 46;

export interface GeometriaVisualCompresion {
  ancho0: number;
  alto0: number;
}

/** Tamaño dibujado de la probeta, proporcional a su esbeltez real (L/d). */
export function geometriaVisualCompresion(L: number, ancho: number): GeometriaVisualCompresion {
  const ancho0 = 70;
  return { ancho0, alto0: Math.min(Math.max((ancho0 * L) / ancho, 50), 230) };
}

/** Borde superior del travesaño móvil para un acortamiento visual dado (baja con la probeta). */
export function yTravesanoCompresion(g: GeometriaVisualCompresion, acortamientoVisual: number): number {
  return MESA_Y - BASE_INF - PLATO - g.alto0 * (1 - acortamientoVisual) - PLATO - ADAPTADOR - 24;
}

interface Props {
  geometria: GeometriaVisualCompresion;
  /** Acortamiento visual (fracción de la altura dibujada). */
  acortamientoVisual: number;
  fracturada: boolean;
  /** true para metales dúctiles (se abarrilan); false para frágiles (rompen en un plano inclinado). */
  ductil: boolean;
  probetaVisible: boolean;
  enContacto: boolean;
  seccion: 'circular' | 'rectangular';
  cotas: string[];
}

export function MontajeCompresionSVG(p: Props) {
  const { ancho0, alto0 } = p.geometria;
  const yBase = MESA_Y - BASE_INF;
  const yCaraInf = yBase - PLATO;
  const alto = alto0 * (1 - p.acortamientoVisual);
  const yCaraSup = yCaraInf - alto;
  // Si la probeta no está montada, el plato superior queda separado.
  const holgura = p.enContacto ? 0 : 10;
  const yPlatoSup = yCaraSup - PLATO - holgura;

  // Volumen constante: el área media crece como 1/(1 − ε). El rozamiento retiene las caras
  // (ancho menor que el medio): abarrilamiento.
  const expansion = 1 / Math.max(1 - p.acortamientoVisual, 0.2);
  const anchoCara = ancho0 * Math.sqrt(expansion) ** (p.ductil ? 0.55 : 1);
  const anchoMedio = ancho0 * Math.sqrt(expansion) ** (p.ductil ? 1.35 : 1);
  const nPerfil = 24;
  const perfil: [number, number][] = [];
  for (let i = 0; i <= nPerfil; i++) {
    const t = i / nPerfil;
    const y = yCaraSup + alto * t;
    const w = anchoCara + (anchoMedio - anchoCara) * Math.sin(Math.PI * t);
    perfil.push([XC - w / 2, y]);
  }
  const contorno = [...perfil, ...perfil.map(([x, y]) => [2 * XC - x, y] as [number, number]).reverse()];
  const puntos = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // Rotura frágil por cortante: plano a ~45° (en fundición gris suele ser 45–55°), con las dos
  // mitades ligeramente desplazadas.
  const x1 = XC - anchoMedio / 2 - 2;
  const x2 = XC + anchoMedio / 2 + 2;
  const yA = yCaraSup + alto * 0.18;
  const yB = yCaraSup + alto * 0.82;
  const mitadSup: [number, number][] = [[XC - anchoCara / 2, yCaraSup], [XC + anchoCara / 2, yCaraSup], [x2 - 2, yA], [x2 - 2, yA + 2], [x1 + 2, yB - 2], [x1 + 2, yA]];
  const mitadInf: [number, number][] = [[x1 + 5, yB + 4], [x2 + 1, yA + 6], [XC + anchoCara / 2 + 3, yCaraInf], [XC - anchoCara / 2 + 3, yCaraInf]];

  const anchoPlato = Math.max(ancho0 + 60, anchoMedio + 30);
  const xComp = XC + anchoPlato / 2 + 14;

  return (
    <g>
      {/* Base y plato inferior */}
      <rect x={XC - 70} y={yBase} width={140} height={BASE_INF} rx={3} fill="url(#umCuerpo)" stroke="#0e1720" />
      <rect x={XC - anchoPlato / 2} y={yCaraInf} width={anchoPlato} height={PLATO} rx={2} fill="url(#umCromado)" stroke="#2a3442" />

      {/* Plato superior con asiento esférico y adaptador al travesaño */}
      <rect x={XC - 26} y={yPlatoSup - ADAPTADOR} width={52} height={ADAPTADOR} rx={3} fill="url(#umCuerpo)" stroke="#0e1720" />
      <path d={`M${XC - 30},${yPlatoSup} A30,14 0 0 1 ${XC + 30},${yPlatoSup} Z`} fill="#4a5868" stroke="#1a232d" />
      <rect x={XC - anchoPlato / 2} y={yPlatoSup} width={anchoPlato} height={PLATO} rx={2} fill="url(#umCromado)" stroke="#2a3442" />

      {p.probetaVisible && (
        <>
          <g filter="url(#umSombra)">
            {!p.fracturada || p.ductil ? (
              <polygon points={puntos(contorno)} fill="url(#umProbeta)" stroke="#2a3138" strokeWidth={0.8} />
            ) : (
              <>
                <polygon points={puntos(mitadSup)} fill="url(#umProbeta)" stroke="#2a3138" strokeWidth={0.8} />
                <polygon points={puntos(mitadInf)} fill="url(#umProbeta)" stroke="#2a3138" strokeWidth={0.8} />
                <line x1={x1 + 2} y1={yB} x2={x2 - 2} y2={yA + 2} stroke="#0b0f13" strokeWidth={1.2} />
              </>
            )}
          </g>
          {p.seccion === 'rectangular' && !p.fracturada && (
            <line x1={XC} y1={yCaraSup} x2={XC} y2={yCaraInf} stroke="#ffffff" strokeOpacity={0.12} />
          )}

          {/* Comparador de acortamiento: palpador apoyado en el plato superior */}
          <g>
            <rect x={xComp - 3} y={yPlatoSup + PLATO - 2} width={6} height={yCaraInf - yPlatoSup - PLATO + 2} fill="#c9d3dc" opacity={0.7} />
            <circle cx={xComp} cy={(yPlatoSup + yCaraInf) / 2 + 6} r={13} fill="#e8edf2" stroke="#55606b" strokeWidth={1.5} />
            <line x1={xComp} y1={(yPlatoSup + yCaraInf) / 2 + 6} x2={xComp + 8} y2={(yPlatoSup + yCaraInf) / 2 - 2} stroke="#c0392b" strokeWidth={1.4} />
            <text x={xComp + 18} y={(yPlatoSup + yCaraInf) / 2 + 9} fontSize="9" fill="#a9bdd1">Comparador</text>
          </g>

          {/* Cota de la altura actual */}
          <g stroke="#7f97b0" strokeWidth={1}>
            <line x1={XC - anchoPlato / 2 - 10} y1={yCaraSup} x2={XC - anchoPlato / 2 - 10} y2={yCaraInf} />
            <line x1={XC - anchoPlato / 2 - 15} y1={yCaraSup} x2={XC - anchoPlato / 2 - 5} y2={yCaraSup} />
            <line x1={XC - anchoPlato / 2 - 15} y1={yCaraInf} x2={XC - anchoPlato / 2 - 5} y2={yCaraInf} />
          </g>
          <RotuloCota xDerecha={XC - anchoPlato / 2 - 18} yCentro={(yCaraSup + yCaraInf) / 2} lineas={p.cotas} />
        </>
      )}
    </g>
  );
}

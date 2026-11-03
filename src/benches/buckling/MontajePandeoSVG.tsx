import { MESA_Y, RotuloCota, XC, type ColoresProbeta } from '../../components/svg/MarcoMaquinaSVG';
import type { CondicionApoyo } from '../../engine/mechanics/buckling';

/**
 * Montaje de pandeo en la máquina universal: columna entre un apoyo inferior sobre la mesa y uno
 * superior en el travesaño (articulado = cuchilla en una ranura en V; empotrado = mordaza), con
 * comparador lateral en el punto de máxima flecha. La forma es la del primer modo de cada
 * condición de apoyo (esquemática); su amplitud sigue el modelo.
 */

const LARGO = 300; // longitud dibujada de la columna (px)
const APOYO = 30;
const Y_BASE = MESA_Y - APOYO;

/** Base fija abajo (s = 0) para todas las condiciones con empotramiento. */
function apoyosDe(c: CondicionApoyo): { abajo: 'articulado' | 'empotrado'; arriba: 'articulado' | 'empotrado' | 'libre' } {
  switch (c) {
    case 'articulado-articulado':
      return { abajo: 'articulado', arriba: 'articulado' };
    case 'empotrado-libre':
      return { abajo: 'empotrado', arriba: 'libre' };
    case 'empotrado-articulado':
      return { abajo: 'empotrado', arriba: 'articulado' };
    case 'empotrado-empotrado':
      return { abajo: 'empotrado', arriba: 'empotrado' };
  }
}

/** Forma del primer modo, normalizada a 1 en su máximo; s = 0 en la base, 1 arriba. */
function formaModo(c: CondicionApoyo, s: number): number {
  switch (c) {
    case 'articulado-articulado':
      return Math.sin(Math.PI * s);
    case 'empotrado-libre':
      return 1 - Math.cos((Math.PI * s) / 2);
    case 'empotrado-empotrado':
      return (1 - Math.cos(2 * Math.PI * s)) / 2;
    case 'empotrado-articulado':
      return (s * s * (1 - s)) / (4 / 27); // máximo en s = 2/3
  }
}

/** Altura relativa (desde la base) donde la flecha es máxima: ahí se coloca el comparador. */
export function posicionFlechaMaxima(c: CondicionApoyo): number {
  return c === 'empotrado-libre' ? 0.97 : c === 'empotrado-articulado' ? 2 / 3 : 0.5;
}

/** Borde superior del travesaño: baja tanto como se acercan los extremos de la columna. */
export function yTravesanoPandeo(acortamiento = 0): number {
  return Y_BASE - LARGO + acortamiento - APOYO - 24;
}

/** Desplazamiento lateral dibujado en s (0 base, 1 arriba): modo de pandeo que se quiebra en una rótula al colapsar. */
function lateral(condicion: CondicionApoyo, flecha: number, colapso: number, s: number): number {
  const sMax = posicionFlechaMaxima(condicion);
  const elastica = formaModo(condicion, s);
  const rotula = s <= sMax ? s / sMax : apoyosDe(condicion).arriba === 'libre' ? 1 : (1 - s) / (1 - sMax);
  return flecha * ((1 - colapso) * elastica + colapso * Math.min(rotula, 1));
}

/**
 * Acercamiento de los extremos (px) que exige la forma dibujada si la columna no se alarga:
 * Δ = ½∫(dw/dy)² dy. Con él, el travesaño baja de forma coherente con la flecha dibujada
 * (es el acortamiento geométrico por flexión, con la misma escala gráfica que la flecha).
 */
export function acortamientoVisualPandeo(condicion: CondicionApoyo, flecha: number, colapso: number): number {
  const n = 200;
  const dy = LARGO / n;
  let delta = 0;
  for (let i = 0; i < n; i++) {
    const dw = lateral(condicion, flecha, colapso, (i + 1) / n) - lateral(condicion, flecha, colapso, i / n);
    delta += (0.5 * dw * dw) / dy;
  }
  return delta;
}

interface Props {
  condicion: CondicionApoyo;
  flechaVisual: number;
  /** Acercamiento de los extremos ya dibujado (px): el extremo superior y el travesaño bajan esto. */
  acortamiento: number;
  /** 0 (elástica) a 1 (rótula plástica formada en el punto de máxima flecha). */
  colapso: number;
  fracturada: boolean;
  grosor: number;
  probetaVisible: boolean;
  enContacto: boolean;
  colorProbeta: ColoresProbeta;
  cotas: string[];
}

export function MontajePandeoSVG(p: Props) {
  const { abajo, arriba } = apoyosDe(p.condicion);
  // La cuerda entre extremos se acorta a medida que la columna se curva: el extremo superior baja.
  const cuerda = LARGO - p.acortamiento;
  const yTop = Y_BASE - cuerda;
  const sMax = posicionFlechaMaxima(p.condicion);
  const n = 60;
  const x = (s: number) => XC + lateral(p.condicion, p.flechaVisual, p.colapso, s);
  const puntos = (s0: number, s1: number) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const s = s0 + ((s1 - s0) * i) / n;
      return `${x(s).toFixed(1)},${(Y_BASE - cuerda * s).toFixed(1)}`;
    }).join(' ');
  const xTop = x(1);
  const yComp = Y_BASE - cuerda * sMax;

  function apoyo(tipo: 'articulado' | 'empotrado' | 'libre', y: number, haciaArriba: boolean, xc: number) {
    const signo = haciaArriba ? -1 : 1;
    if (tipo === 'empotrado') {
      return (
        <g>
          <rect x={xc - 34} y={haciaArriba ? y - APOYO : y} width={68} height={APOYO} rx={3} fill="url(#umCuerpoV)" stroke="#0e1720" />
          <rect x={xc - p.grosor / 2 - 6} y={haciaArriba ? y - 18 : y} width={6} height={18} fill="#3a4654" />
          <rect x={xc + p.grosor / 2} y={haciaArriba ? y - 18 : y} width={6} height={18} fill="#3a4654" />
        </g>
      );
    }
    if (tipo === 'libre') {
      return <rect x={xc - 30} y={y - APOYO} width={60} height={12} rx={2} fill="url(#umCromado)" stroke="#2a3442" />;
    }
    // Articulado: cuchilla del extremo de la columna en una ranura en V del bloque.
    const yBloque = haciaArriba ? y - APOYO : y + 6;
    return (
      <g>
        <rect x={xc - 34} y={yBloque} width={68} height={APOYO - 6} rx={3} fill="url(#umCuerpoV)" stroke="#0e1720" />
        <polygon points={`${xc - 8},${y + signo * 6} ${xc + 8},${y + signo * 6} ${xc},${y}`} fill="#9fb0c2" stroke="#2a3442" />
      </g>
    );
  }

  const gapS = 0.012;
  return (
    <g>
      {apoyo(abajo, Y_BASE, false, XC)}
      {apoyo(arriba, yTop, true, arriba === 'libre' ? xTop : XC)}

      {p.probetaVisible && (
        <>
          <g filter="url(#umSombra)">
            {!p.fracturada ? (
              <polyline points={puntos(0, 1)} fill="none" stroke={p.colorProbeta.medio} strokeWidth={p.grosor} strokeLinejoin="round" />
            ) : (
              <>
                <polyline points={puntos(0, sMax - gapS)} fill="none" stroke={p.colorProbeta.medio} strokeWidth={p.grosor} />
                <polyline points={puntos(sMax + gapS, 1)} fill="none" stroke={p.colorProbeta.medio} strokeWidth={p.grosor} />
              </>
            )}
            <polyline points={puntos(0, 1)} fill="none" stroke={p.colorProbeta.claro} strokeWidth={Math.max(p.grosor * 0.25, 1)} opacity={p.fracturada ? 0 : 0.6} transform={`translate(${-p.grosor * 0.2},0)`} />
          </g>

          {/* Comparador lateral en el punto de máxima flecha */}
          {!p.fracturada && (
            <g>
              <line x1={x(sMax) + p.grosor / 2} y1={yComp} x2={XC + 112} y2={yComp} stroke="#c9d3dc" strokeWidth={2} />
              <circle cx={XC + 124} cy={yComp} r={13} fill="#e8edf2" stroke="#55606b" strokeWidth={1.5} />
              <line x1={XC + 124} y1={yComp} x2={XC + 124 + 9 * Math.sin(p.flechaVisual / 8)} y2={yComp - 9 * Math.cos(p.flechaVisual / 8)} stroke="#c0392b" strokeWidth={1.4} />
              <text x={XC + 106} y={yComp + 26} fontSize="9" fill="#a9bdd1">Comparador lateral</text>
            </g>
          )}

          <g stroke="#7f97b0" strokeWidth={1}>
            <line x1={XC - 70} y1={yTop} x2={XC - 70} y2={Y_BASE} />
            <line x1={XC - 75} y1={yTop} x2={XC - 65} y2={yTop} />
            <line x1={XC - 75} y1={Y_BASE} x2={XC - 65} y2={Y_BASE} />
          </g>
          <RotuloCota xDerecha={XC - 78} yCentro={(yTop + Y_BASE) / 2} lineas={p.cotas} />
        </>
      )}
    </g>
  );
}

/**
 * Modelo de pandeo elástico de columnas (teoría de Euler).
 * Unidades: E en MPa, I en mm⁴, L en mm, P en N, esfuerzo en MPa.
 */

export type CondicionApoyo = 'articulado-articulado' | 'empotrado-libre' | 'empotrado-articulado' | 'empotrado-empotrado';

export interface InfoApoyo {
  K: number;
  nombre: string;
  procedencia: string;
}

/**
 * Factores de longitud efectiva K para los cuatro casos ideales de Euler.
 * Proceden de la solución de la ecuación diferencial de la viga-columna
 * (EI·v'''' + P·v'' = 0) con las condiciones de borde de cada caso
 * (Timoshenko & Gere, Theory of Elastic Stability).
 */
export const APOYOS: Record<CondicionApoyo, InfoApoyo> = {
  'articulado-articulado': {
    K: 1.0,
    nombre: 'Articulado - Articulado',
    procedencia: 'Solución fundamental sin(πx/L): primer modo con un semiperíodo de onda en la longitud L.',
  },
  'empotrado-libre': {
    K: 2.0,
    nombre: 'Empotrado - Libre',
    procedencia: 'Equivalente a media onda de una columna articulada-articulada de longitud 2L (Le = 2L).',
  },
  'empotrado-articulado': {
    K: 0.699,
    nombre: 'Empotrado - Articulado',
    procedencia: 'Raíz trascendente tan(βL) = βL de la ecuación de estabilidad; K ≈ 0.699 (frecuentemente aproximado 0.7).',
  },
  'empotrado-empotrado': {
    K: 0.5,
    nombre: 'Empotrado - Empotrado',
    procedencia: 'Un semiperíodo de onda ocurre en la mitad central de la columna (Le = L/2).',
  },
};

export function longitudEfectiva(L_mm: number, K: number): number {
  return K * L_mm;
}

export function radioGiro(I_mm4: number, A_mm2: number): number {
  if (A_mm2 <= 0) throw new Error('El área debe ser positiva.');
  return Math.sqrt(I_mm4 / A_mm2);
}

export function esbeltez(Le_mm: number, r_mm: number): number {
  if (r_mm <= 0) throw new Error('El radio de giro debe ser positivo.');
  return Le_mm / r_mm;
}

/** Carga crítica de Euler: Pcr = π²EI / (K·L)². */
export function cargaCriticaEuler(E_MPa: number, I_mm4: number, L_mm: number, K: number): number {
  const Le = longitudEfectiva(L_mm, K);
  return (Math.PI ** 2 * E_MPa * I_mm4) / Le ** 2;
}

/** Esfuerzo crítico de Euler: σcr = π²E / (Le/r)² = Pcr / A. */
export function esfuerzoCriticoEuler(E_MPa: number, esbeltezValor: number): number {
  return (Math.PI ** 2 * E_MPa) / esbeltezValor ** 2;
}

/**
 * Esbeltez crítica: el valor de Le/r por debajo del cual el esfuerzo de Euler
 * superaría el límite de fluencia del material. Por debajo de este valor la
 * columna es "corta/intermedia": fluye antes de pandear elásticamente y la
 * fórmula de Euler ya no es aplicable.
 */
export function esbeltezCritica(E_MPa: number, sigmaY_MPa: number): number {
  return Math.sqrt((Math.PI ** 2 * E_MPa) / sigmaY_MPa);
}

export interface ResultadoAplicabilidadEuler {
  aplicable: boolean;
  esbeltezActual: number;
  esbeltezCritica?: number;
  mensaje: string;
}

/**
 * Verifica si la fórmula de Euler es válida para la esbeltez dada: requiere que
 * el esfuerzo crítico quede por debajo del límite de fluencia (régimen elástico).
 * Si el material no tiene límite de fluencia definido, solo se puede advertir,
 * no verificar cuantitativamente.
 */
export function verificarAplicabilidadEuler(
  E_MPa: number,
  esbeltezValor: number,
  sigmaY_MPa?: number,
): ResultadoAplicabilidadEuler {
  if (sigmaY_MPa === undefined) {
    return {
      aplicable: true,
      esbeltezActual: esbeltezValor,
      mensaje:
        'No se dispone del límite de fluencia de este material para verificar el régimen elástico; interprete el resultado con precaución.',
    };
  }
  const esbCrit = esbeltezCritica(E_MPa, sigmaY_MPa);
  const aplicable = esbeltezValor >= esbCrit;
  return {
    aplicable,
    esbeltezActual: esbeltezValor,
    esbeltezCritica: esbCrit,
    mensaje: aplicable
      ? `Esbeltez (${esbeltezValor.toFixed(1)}) ≥ esbeltez crítica (${esbCrit.toFixed(1)}): la columna es esbelta y el pandeo elástico de Euler gobierna la falla.`
      : `Esbeltez (${esbeltezValor.toFixed(1)}) < esbeltez crítica (${esbCrit.toFixed(1)}): la columna es corta/intermedia. Fluiría antes de alcanzar la carga de Euler; esta fórmula no es válida y se requiere un criterio inelástico fuera del alcance de este banco.`,
  };
}

export function factorSeguridad(Pcr_N: number, Paplicada_N: number): number {
  if (Paplicada_N <= 0) throw new Error('La carga aplicada debe ser positiva.');
  return Pcr_N / Paplicada_N;
}

/**
 * Deflexión lateral en el punto medio de una columna con imperfección inicial
 * δ0 (o excentricidad de carga equivalente) bajo una carga axial P < Pcr, usando
 * el modelo de amplificación elástica lineal:
 *
 *     δ(P) = δ0 / (1 − P / Pcr)
 *
 * Esta es la solución de la ecuación diferencial de la columna con una
 * imperfección senoidal inicial de amplitud δ0 (Timoshenko & Gere). Para una
 * columna perfecta (δ0 = 0) la deflexión es idénticamente nula para toda
 * P < Pcr: el equilibrio permanece recto hasta el punto de bifurcación.
 *
 * El modelo diverge en P → Pcr y no es válido para P ≥ Pcr: no existe aquí una
 * trayectoria post-pandeo determinada (se requeriría teoría no lineal de
 * grandes deflexiones, fuera del alcance de este banco). Por eso la función
 * lanza un error si P ≥ Pcr en vez de devolver una deflexión inventada.
 */
export function deflexionConImperfeccion(P_N: number, Pcr_N: number, delta0_mm: number): number {
  if (P_N < 0) throw new Error('La carga debe ser no negativa.');
  if (P_N >= Pcr_N) {
    throw new Error(
      'El modelo de amplificación lineal solo es válido para P < Pcr. En P ≥ Pcr no hay una trayectoria post-pandeo definida por este modelo.',
    );
  }
  return delta0_mm / (1 - P_N / Pcr_N);
}

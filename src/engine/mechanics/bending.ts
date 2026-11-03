/**
 * Flexión de vigas: casos clásicos con solución cerrada conocida (Hibbeler / Beer & Johnston).
 * Se cubren dos condiciones de apoyo (simplemente apoyada, en voladizo) y dos tipos de carga
 * (puntual, uniformemente distribuida en todo el claro) — las combinaciones que la especificación
 * permite limitar a "las ecuaciones implementadas". No se resuelven combinaciones de cargas ni
 * posiciones arbitrarias de carga distribuida: para eso se requeriría integración numérica, fuera
 * del alcance de este banco introductorio.
 *
 * Convención: x se mide desde el apoyo izquierdo (viga simple) o desde el empotramiento (voladizo),
 * creciendo hacia la derecha / hacia el extremo libre. M positivo = concavidad hacia arriba (fibra
 * inferior en tracción), consistente con la convención usual de vigas simplemente apoyadas; en el
 * voladizo, M resulta negativo (momento hogging), lo cual es correcto y se muestra tal cual.
 *
 * Unidades: fuerzas en N, longitudes en mm, momentos en N·mm, carga distribuida en N/mm.
 */

export type ApoyoViga = 'simple' | 'voladizo';
export type TipoCargaViga = 'puntual' | 'distribuida';

export interface ParametrosViga {
  apoyo: ApoyoViga;
  tipoCarga: TipoCargaViga;
  L_mm: number;
  /** Fuerza puntual (N). Requerida si tipoCarga = 'puntual'. */
  P_N?: number;
  /** Posición de la carga puntual desde el apoyo izquierdo (mm). Solo para apoyo 'simple' + carga
   *  'puntual'; en voladizo la carga puntual siempre se aplica en el extremo libre (x = L). */
  a_mm?: number;
  /** Carga distribuida uniforme (N/mm), aplicada en todo el claro. Requerida si tipoCarga = 'distribuida'. */
  w_N_mm?: number;
}

function validar(p: ParametrosViga): void {
  if (p.L_mm <= 0) throw new Error('La longitud de la viga debe ser positiva.');
  if (p.tipoCarga === 'puntual') {
    if (p.P_N === undefined) throw new Error('Falta la fuerza puntual P.');
    if (p.apoyo === 'simple') {
      const a = p.a_mm ?? p.L_mm / 2;
      if (a <= 0 || a >= p.L_mm) throw new Error('La posición de la carga debe estar dentro del claro (0 < a < L).');
    }
  } else {
    if (p.w_N_mm === undefined) throw new Error('Falta la carga distribuida w.');
  }
}

/** Reacción en el apoyo izquierdo (viga simple) o en el empotramiento (voladizo). */
export function reaccionIzquierda(p: ParametrosViga): number {
  validar(p);
  if (p.apoyo === 'voladizo') {
    return p.tipoCarga === 'puntual' ? p.P_N! : p.w_N_mm! * p.L_mm;
  }
  // simple
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    const b = p.L_mm - a;
    return (p.P_N! * b) / p.L_mm;
  }
  return (p.w_N_mm! * p.L_mm) / 2;
}

/** Reacción en el apoyo derecho. Es 0 en voladizo (toda la reacción está en el empotramiento). */
export function reaccionDerecha(p: ParametrosViga): number {
  validar(p);
  if (p.apoyo === 'voladizo') return 0;
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return (p.P_N! * a) / p.L_mm;
  }
  return (p.w_N_mm! * p.L_mm) / 2;
}

/** Momento de reacción en el empotramiento (solo voladizo); negativo (hogging). */
export function momentoEmpotramiento(p: ParametrosViga): number {
  validar(p);
  if (p.apoyo !== 'voladizo') throw new Error('El momento de empotramiento solo aplica a vigas en voladizo.');
  return p.tipoCarga === 'puntual' ? -p.P_N! * p.L_mm : -(p.w_N_mm! * p.L_mm ** 2) / 2;
}

/** Fuerza cortante V(x) en la posición x (mm) a lo largo de la viga. */
export function cortante(x_mm: number, p: ParametrosViga): number {
  validar(p);
  if (x_mm < 0 || x_mm > p.L_mm) throw new Error('x debe estar dentro del claro de la viga.');

  if (p.apoyo === 'voladizo') {
    if (p.tipoCarga === 'puntual') return p.P_N!; // constante: una sola carga en el extremo libre
    return p.w_N_mm! * (p.L_mm - x_mm);
  }

  // simple
  const Rizq = reaccionIzquierda(p);
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return x_mm < a ? Rizq : Rizq - p.P_N!;
  }
  return Rizq - p.w_N_mm! * x_mm;
}

/** Momento flector M(x) en la posición x (mm) a lo largo de la viga. */
export function momento(x_mm: number, p: ParametrosViga): number {
  validar(p);
  if (x_mm < 0 || x_mm > p.L_mm) throw new Error('x debe estar dentro del claro de la viga.');

  if (p.apoyo === 'voladizo') {
    if (p.tipoCarga === 'puntual') return -p.P_N! * (p.L_mm - x_mm);
    return -(p.w_N_mm! * (p.L_mm - x_mm) ** 2) / 2;
  }

  // simple
  const Rizq = reaccionIzquierda(p);
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return x_mm <= a ? Rizq * x_mm : reaccionDerecha(p) * (p.L_mm - x_mm);
  }
  return Rizq * x_mm - (p.w_N_mm! * x_mm ** 2) / 2;
}

export interface ExtremoViga {
  valor: number;
  x_mm: number;
}

/** Momento flector máximo en magnitud, y dónde ocurre. */
export function momentoMaximo(p: ParametrosViga): ExtremoViga {
  validar(p);
  if (p.apoyo === 'voladizo') {
    return { valor: momento(0, p), x_mm: 0 }; // máximo siempre en el empotramiento
  }
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return { valor: momento(a, p), x_mm: a };
  }
  const xMedio = p.L_mm / 2;
  return { valor: momento(xMedio, p), x_mm: xMedio };
}

/**
 * Deflexión máxima (mm) y su ubicación, para los casos con fórmula cerrada estándar:
 * - simple + puntual: deflexión EN el punto de aplicación de la carga (no necesariamente el máximo
 *   global de toda la viga, pero sí la referencia estándar de las tablas de vigas): δ = Pa²b²/(3EIL).
 * - simple + distribuida: máximo en el centro del claro: δ = 5wL⁴/(384EI).
 * - voladizo + puntual: máximo en el extremo libre: δ = PL³/(3EI).
 * - voladizo + distribuida: máximo en el extremo libre: δ = wL⁴/(8EI).
 */
export function deflexionMaxima(p: ParametrosViga, E_MPa: number, I_mm4: number): ExtremoViga {
  validar(p);
  if (E_MPa <= 0 || I_mm4 <= 0) throw new Error('E e I deben ser positivos.');
  const L = p.L_mm;

  if (p.apoyo === 'voladizo') {
    if (p.tipoCarga === 'puntual') return { valor: (p.P_N! * L ** 3) / (3 * E_MPa * I_mm4), x_mm: L };
    return { valor: (p.w_N_mm! * L ** 4) / (8 * E_MPa * I_mm4), x_mm: L };
  }

  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? L / 2;
    const b = L - a;
    return { valor: (p.P_N! * a ** 2 * b ** 2) / (3 * E_MPa * I_mm4 * L), x_mm: a };
  }
  return { valor: (5 * p.w_N_mm! * L ** 4) / (384 * E_MPa * I_mm4), x_mm: L / 2 };
}

/** Esfuerzo normal por flexión: σ = M·c / I, con c = distancia de la fibra extrema al eje neutro. */
export function esfuerzoFlexion(M_Nmm: number, c_mm: number, I_mm4: number): number {
  if (I_mm4 <= 0) throw new Error('I debe ser positivo.');
  return (M_Nmm * c_mm) / I_mm4;
}

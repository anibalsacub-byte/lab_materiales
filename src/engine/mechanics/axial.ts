import type { Material } from '../types';

/**
 * Modelo de carga axial (tracción / compresión). Unidades SI coherentes:
 * fuerza en N, longitud en mm, área en mm², esfuerzo en MPa (= N/mm²).
 */

export function esfuerzoAxial(P_N: number, A_mm2: number): number {
  if (A_mm2 <= 0) throw new Error('El área debe ser positiva.');
  return P_N / A_mm2;
}

export function deformacionUnitaria(deltaL_mm: number, L_mm: number): number {
  if (L_mm <= 0) throw new Error('La longitud debe ser positiva.');
  return deltaL_mm / L_mm;
}

/** Alargamiento elástico: ΔL = P·L / (A·E). Válido solo en el régimen elástico lineal. */
export function alargamientoElastico(P_N: number, L_mm: number, A_mm2: number, E_MPa: number): number {
  if (A_mm2 <= 0 || L_mm <= 0 || E_MPa <= 0) throw new Error('Área, longitud y módulo deben ser positivos.');
  return (P_N * L_mm) / (A_mm2 * E_MPa);
}

export function moduloYoungDesdeDatos(sigma_MPa: number, epsilon: number): number {
  if (epsilon === 0) throw new Error('La deformación no puede ser cero.');
  return sigma_MPa / epsilon;
}

/** Deformación transversal a partir de la longitudinal y la relación de Poisson (régimen elástico). */
export function deformacionTransversal(epsilonLongitudinal: number, nu: number): number {
  return -nu * epsilonLongitudinal;
}

export function relacionPoissonDesdeDatos(epsilonTransversal: number, epsilonLongitudinal: number): number {
  if (epsilonLongitudinal === 0) throw new Error('La deformación longitudinal no puede ser cero.');
  return -epsilonTransversal / epsilonLongitudinal;
}

export interface PuntoCurva {
  epsilon: number;
  sigma_MPa: number;
}

/**
 * Deformación de fluencia εY = σY / E. Solo definida si el material tiene
 * límite de fluencia (metales dúctiles); los materiales frágiles no lo tienen.
 */
export function deformacionFluencia(material: Material): number | undefined {
  const { E_MPa, sigmaY_MPa } = material.propiedades;
  if (E_MPa === undefined || sigmaY_MPa === undefined) return undefined;
  return sigmaY_MPa / E_MPa;
}

/** Puntos de ruptura (en ε) de la curva bilineal ampliada, derivados de las propiedades del material. */
export interface ParametrosCurvaBilineal {
  epsY: number;
  epsPlateauFin: number; // fin de la meseta de fluencia (= epsY si el material no tiene meseta)
  epsUTS: number; // deformación en la resistencia última (inicio idealizado de la estricción)
  epsF: number; // deformación a la fractura
  sigmaY: number;
  sigmaU: number;
  sigmaFractura: number; // esfuerzo ingenieril remanente en la fractura, tras la estricción
}

/** Ancho de la meseta de fluencia (deformación de Lüders), típico de orden de 1 a 2 % en aceros al carbono. */
const ANCHO_MESETA = 0.015;
/** Ubicación de εUTS como fracción del tramo entre el fin de la meseta y εF (idealizado, didáctico). */
const FRACCION_DEFORMACION_UTS = 0.7;
/** Esfuerzo ingenieril remanente en la fractura como fracción de σU (la estricción reduce el área real,
 *  por lo que el esfuerzo ingenieril —referido al área original— cae antes de la fractura). */
const FRACCION_ESFUERZO_FRACTURA = 0.82;

export function parametrosCurvaBilineal(material: Material): ParametrosCurvaBilineal | undefined {
  const { E_MPa, sigmaY_MPa, sigmaU_MPa, epsilonF } = material.propiedades;
  if (E_MPa === undefined || sigmaY_MPa === undefined || sigmaU_MPa === undefined || epsilonF === undefined || epsilonF <= sigmaY_MPa / E_MPa) {
    return undefined;
  }
  const epsY = sigmaY_MPa / E_MPa;
  const epsPlateauFin = material.mesetaFluencia ? Math.min(epsY + ANCHO_MESETA, epsilonF) : epsY;
  const epsUTS = epsPlateauFin + FRACCION_DEFORMACION_UTS * Math.max(epsilonF - epsPlateauFin, 0);
  return {
    epsY,
    epsPlateauFin,
    epsUTS,
    epsF: epsilonF,
    sigmaY: sigmaY_MPa,
    sigmaU: sigmaU_MPa,
    sigmaFractura: sigmaU_MPa * FRACCION_ESFUERZO_FRACTURA,
  };
}

/**
 * Materiales frágiles cuyos datos documentados no caben en una recta (σU < E·εF: fundición gris,
 * polímeros rígidos) tienen en la realidad una curva cóncava, sin fluencia definida. Se modela como
 * σ = σU·[1 − (1 − ε/εF)ⁿ] con n = E·εF/σU: la pendiente inicial es exactamente E, la curva nunca
 * supera σU y rompe en (εF, σU). Devuelve undefined si los datos sí son consistentes con una recta
 * (n ≤ 1) o faltan, y entonces se usa σ = E·ε.
 */
function exponenteFragil(material: Material): number | undefined {
  if (material.modelo !== 'fragil_lineal') return undefined;
  const { E_MPa, sigmaU_MPa, epsilonF } = material.propiedades;
  if (E_MPa === undefined || sigmaU_MPa === undefined || epsilonF === undefined) return undefined;
  const n = (E_MPa * epsilonF) / sigmaU_MPa;
  return n > 1 ? n : undefined;
}

/**
 * Esfuerzo ingenieril σ(ε) según el modelo constitutivo del material:
 * - elastico_lineal: σ = E·ε hasta ε = εF (fractura); más allá no está definido.
 * - fragil_lineal: sin fluencia; ver {@link exponenteFragil}. Rompe en (εF, σU) sin superar nunca σU.
 * - elastico_plastico_bilineal: tramo elástico E·ε hasta εY; luego, si el material tiene
 *   {@link Material.mesetaFluencia}, una meseta plana en σY (fenómeno de Lüders); después
 *   endurecimiento hasta (εUTS, σU); y finalmente un ablandamiento ingenieril hasta (εF,
 *   σ_fractura) que representa la estricción. Es un modelo simplificado por tramos rectos
 *   (no una curva continua real), pensado para fines didácticos, construido únicamente con
 *   σY, σU y εF documentados — εUTS y σ_fractura se estiman con fracciones fijas, no con datos
 *   propios de cada material.
 *
 * Devuelve undefined si ε supera εF (la probeta ya fracturó) o si faltan datos.
 */
export function esfuerzoEnDeformacion(material: Material, epsilon: number): number | undefined {
  const { E_MPa, epsilonF } = material.propiedades;
  if (E_MPa === undefined) return undefined;
  const epsAbs = Math.abs(epsilon);
  const signo = epsilon < 0 ? -1 : 1;

  if (material.modelo === 'fragil_lineal' || material.modelo === 'elastico_lineal') {
    if (epsilonF !== undefined && epsAbs > epsilonF) return undefined;
    const n = exponenteFragil(material);
    if (n !== undefined) return signo * material.propiedades.sigmaU_MPa! * (1 - (1 - epsAbs / epsilonF!) ** n);
    return signo * E_MPa * epsAbs;
  }

  // elastico_plastico_bilineal
  const p = parametrosCurvaBilineal(material);
  if (!p) {
    // Sin suficientes datos (σU o εF) para construir la curva completa: solo el tramo elástico/meseta.
    const sigmaY = material.propiedades.sigmaY_MPa;
    if (sigmaY === undefined) return signo * E_MPa * epsAbs;
    const epsY = sigmaY / E_MPa;
    return epsAbs <= epsY ? signo * E_MPa * epsAbs : signo * sigmaY;
  }
  if (epsAbs <= p.epsY) return signo * E_MPa * epsAbs;
  if (epsAbs <= p.epsPlateauFin) return signo * p.sigmaY;
  if (epsAbs <= p.epsUTS) {
    const Ep = (p.sigmaU - p.sigmaY) / (p.epsUTS - p.epsPlateauFin);
    return signo * (p.sigmaY + Ep * (epsAbs - p.epsPlateauFin));
  }
  if (epsAbs <= p.epsF) {
    const pendiente = (p.sigmaFractura - p.sigmaU) / (p.epsF - p.epsUTS);
    return signo * (p.sigmaU + pendiente * (epsAbs - p.epsUTS));
  }
  return undefined; // fractura
}

/**
 * Inversa de {@link esfuerzoEnDeformacion}, restringida al tramo ASCENDENTE de la curva (elástico +
 * meseta + endurecimiento, hasta εUTS). Más allá de σU la curva se dobla y deja de ser invertible
 * como función — y, físicamente, un ensayo controlado por fuerza no puede sostenerse ahí: una vez
 * alcanzado el esfuerzo último la probeta se desestabiliza (empieza la estricción) y el control por
 * fuerza no puede seguir el ablandamiento posterior, que solo se observa controlando desplazamiento.
 * Se usa para permitir controlar el ensayo por la fuerza aplicada en vez de por deformación.
 *
 * Devuelve undefined si |σ| excede σU (o la resistencia del modelo frágil) o si faltan datos.
 */
export function deformacionDesdeEsfuerzo(material: Material, sigma_MPa: number): number | undefined {
  const { E_MPa, sigmaY_MPa, epsilonF } = material.propiedades;
  if (E_MPa === undefined) return undefined;
  const sigmaAbs = Math.abs(sigma_MPa);
  const signo = sigma_MPa < 0 ? -1 : 1;

  if (material.modelo === 'fragil_lineal' || material.modelo === 'elastico_lineal') {
    const n = exponenteFragil(material);
    if (n !== undefined) {
      const sigmaU = material.propiedades.sigmaU_MPa!;
      if (sigmaAbs > sigmaU) return undefined;
      return signo * epsilonF! * (1 - (1 - sigmaAbs / sigmaU) ** (1 / n));
    }
    const sigmaMax = epsilonF !== undefined ? E_MPa * epsilonF : undefined;
    if (sigmaMax !== undefined && sigmaAbs > sigmaMax) return undefined;
    return (signo * sigmaAbs) / E_MPa;
  }

  // elastico_plastico_bilineal
  if (sigmaY_MPa === undefined) return (signo * sigmaAbs) / E_MPa;
  if (sigmaAbs <= sigmaY_MPa) return (signo * sigmaAbs) / E_MPa;
  const p = parametrosCurvaBilineal(material);
  if (!p) return undefined; // meseta sin límite superior conocido: no invertible más allá de σY
  if (sigmaAbs > p.sigmaU) return undefined;
  const Ep = (p.sigmaU - p.sigmaY) / (p.epsUTS - p.epsPlateauFin);
  return signo * (p.epsPlateauFin + (sigmaAbs - p.sigmaY) / Ep);
}

/**
 * Deformación permanente tras descargar completamente desde una deformación máxima alcanzada.
 * Si el material nunca superó la fluencia, la descarga es puramente elástica y no deja
 * deformación permanente.
 */
export function deformacionPermanenteTrasDescarga(material: Material, epsilonMaximo: number): number {
  const epsY = deformacionFluencia(material);
  const { E_MPa } = material.propiedades;
  if (epsY === undefined || E_MPa === undefined || Math.abs(epsilonMaximo) <= epsY) return 0;
  const sigmaEnMaximo = esfuerzoEnDeformacion(material, epsilonMaximo);
  if (sigmaEnMaximo === undefined) return Math.sign(epsilonMaximo) * Infinity; // fracturó: no aplica
  return epsilonMaximo - sigmaEnMaximo / E_MPa;
}

/**
 * Esfuerzo considerando la historia de carga (descarga y recarga elásticas).
 * Si ε ≥ εmax (máxima deformación alcanzada hasta ahora) se sigue la curva monótona. Si ε < εmax,
 * la probeta fue descargada: el esfuerzo baja por una recta de pendiente E desde (εmax, σ(εmax))
 * y vuelve a subir por esa misma recta al recargar. Nunca es negativo: por debajo de la deformación
 * permanente la probeta queda sin carga (las mordazas solo pueden traccionar).
 */
export function esfuerzoConHistoria(material: Material, epsilon: number, epsilonMax: number): number | undefined {
  if (epsilon >= epsilonMax) return esfuerzoEnDeformacion(material, epsilon);
  const E = material.propiedades.E_MPa;
  const sigmaMax = esfuerzoEnDeformacion(material, epsilonMax);
  if (E === undefined || sigmaMax === undefined) return undefined;
  return Math.max(0, sigmaMax - E * (epsilonMax - epsilon));
}

/**
 * Trabajo de deformación por unidad de volumen, ∫σ dε, a lo largo de una trayectoria (regla del
 * trapecio). En MPa, que equivale a MJ/m³. Los tramos de descarga restan, así que el resultado es
 * la energía neta absorbida (disipada) por el material.
 */
export function trabajoDeformacion(trayectoria: PuntoCurva[]): number {
  let w = 0;
  for (let i = 1; i < trayectoria.length; i++) {
    const a = trayectoria[i - 1];
    const b = trayectoria[i];
    w += ((a.sigma_MPa + b.sigma_MPa) / 2) * (b.epsilon - a.epsilon);
  }
  return w;
}

/**
 * Límite elástico convencional por el método del 0,2 % (offset): intersección de la recta
 * σ = E·(ε − offset) con la curva del material. Solo se define para materiales que fluyen: en los
 * frágiles la no linealidad viene del microagrietamiento, no de fluencia plástica, y la norma no
 * reporta límite convencional — devuelve undefined, igual que si no hay intersección antes de εF.
 */
export function limiteElasticoOffset(material: Material, offset = 0.002, numPuntos = 4000): PuntoCurva | undefined {
  const E = material.propiedades.E_MPa;
  const epsF = material.propiedades.epsilonF;
  if (material.modelo !== 'elastico_plastico_bilineal' || E === undefined || epsF === undefined || epsF <= offset) return undefined;
  let epsAnterior = offset;
  let fAnterior = (esfuerzoEnDeformacion(material, offset) ?? 0) - 0;
  for (let i = 1; i <= numPuntos; i++) {
    const eps = offset + ((epsF - offset) * i) / numPuntos;
    const sigma = esfuerzoEnDeformacion(material, eps);
    if (sigma === undefined) return undefined;
    const f = sigma - E * (eps - offset);
    if (f <= 0) {
      const t = fAnterior / (fAnterior - f);
      const epsCorte = epsAnterior + t * (eps - epsAnterior);
      return { epsilon: epsCorte, sigma_MPa: E * (epsCorte - offset) };
    }
    epsAnterior = eps;
    fAnterior = f;
  }
  return undefined;
}

/** Genera una curva σ-ε discretizada entre 0 y εF (o un límite dado) para graficar. */
export function generarCurvaEsfuerzoDeformacion(material: Material, numPuntos = 60, epsilonMax?: number): PuntoCurva[] {
  const limite = epsilonMax ?? material.propiedades.epsilonF ?? deformacionFluencia(material) ?? 0.01;
  const puntos: PuntoCurva[] = [];
  for (let i = 0; i <= numPuntos; i++) {
    const epsilon = (limite * i) / numPuntos;
    const sigma = esfuerzoEnDeformacion(material, epsilon);
    if (sigma !== undefined) puntos.push({ epsilon, sigma_MPa: sigma });
  }
  return puntos;
}

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

/**
 * Esfuerzo ingenieril σ(ε) según el modelo constitutivo del material:
 * - elastico_lineal / fragil_lineal: σ = E·ε hasta ε = εF (fractura); más allá no está definido.
 * - elastico_plastico_bilineal: tramo elástico E·ε hasta εY, luego endurecimiento lineal
 *   hasta (εF, σU). Es un modelo simplificado (bilineal) pensado para fines didácticos,
 *   construido únicamente con las propiedades documentadas del material (σY, σU, εF).
 *
 * Devuelve undefined si ε supera εF (la probeta ya fracturó) o si faltan datos.
 */
export function esfuerzoEnDeformacion(material: Material, epsilon: number): number | undefined {
  const { E_MPa, sigmaY_MPa, sigmaU_MPa, epsilonF } = material.propiedades;
  if (E_MPa === undefined) return undefined;
  const epsAbs = Math.abs(epsilon);
  const signo = epsilon < 0 ? -1 : 1;

  if (material.modelo === 'fragil_lineal' || material.modelo === 'elastico_lineal') {
    if (epsilonF !== undefined && epsAbs > epsilonF) return undefined;
    return signo * E_MPa * epsAbs;
  }

  // elastico_plastico_bilineal
  if (sigmaY_MPa === undefined) return signo * E_MPa * epsAbs;
  const epsY = sigmaY_MPa / E_MPa;
  if (epsAbs <= epsY) return signo * E_MPa * epsAbs;
  if (sigmaU_MPa === undefined || epsilonF === undefined || epsilonF <= epsY) return signo * sigmaY_MPa;
  if (epsAbs > epsilonF) return undefined; // fractura
  const Ep = (sigmaU_MPa - sigmaY_MPa) / (epsilonF - epsY);
  return signo * (sigmaY_MPa + Ep * (epsAbs - epsY));
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

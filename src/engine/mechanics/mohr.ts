/**
 * Transformación de esfuerzos planos y círculo de Mohr.
 *
 * Convención de signos usada en todo el módulo (debe mostrarse al usuario):
 * - σx, σy positivos en tracción.
 * - τxy positivo cuando, sobre la cara +x del elemento, apunta en +y
 *   (convención estándar de mecánica de materiales: en el círculo de Mohr,
 *   τ positivo se traza hacia ABAJO para el punto que representa la cara x).
 * - El ángulo θ se mide en sentido antihorario desde el eje x físico; en el
 *   círculo de Mohr, un giro antihorario del elemento de ángulo θ corresponde
 *   a un giro de 2θ en sentido HORARIO sobre el círculo.
 */

export interface EstadoEsfuerzoPlano {
  sigmaX_MPa: number;
  sigmaY_MPa: number;
  tauXY_MPa: number;
}

export interface ResultadoMohr {
  promedio_MPa: number;
  radio_MPa: number;
  sigma1_MPa: number;
  sigma2_MPa: number;
  tauMax_MPa: number;
  thetaP1_deg: number; // ángulo (antihorario, en el elemento físico) hacia σ1
  thetaP2_deg: number;
  thetaCortanteMax_deg: number;
}

export function esfuerzoPromedio(estado: EstadoEsfuerzoPlano): number {
  return (estado.sigmaX_MPa + estado.sigmaY_MPa) / 2;
}

export function radioCirculo(estado: EstadoEsfuerzoPlano): number {
  const { sigmaX_MPa, sigmaY_MPa, tauXY_MPa } = estado;
  return Math.sqrt(((sigmaX_MPa - sigmaY_MPa) / 2) ** 2 + tauXY_MPa ** 2);
}

export function analizarMohr(estado: EstadoEsfuerzoPlano): ResultadoMohr {
  const promedio = esfuerzoPromedio(estado);
  const radio = radioCirculo(estado);
  const sigma1 = promedio + radio;
  const sigma2 = promedio - radio;
  const tauMax = radio;

  // 0.5*atan2(2τxy, σx − σy): ángulo antihorario en el elemento físico hasta el eje principal más cercano a x.
  const thetaP1 = (0.5 * Math.atan2(2 * estado.tauXY_MPa, estado.sigmaX_MPa - estado.sigmaY_MPa) * 180) / Math.PI;
  const thetaP2 = thetaP1 + 90;
  const thetaCortanteMax = thetaP1 - 45;

  return {
    promedio_MPa: promedio,
    radio_MPa: radio,
    sigma1_MPa: sigma1,
    sigma2_MPa: sigma2,
    tauMax_MPa: tauMax,
    thetaP1_deg: thetaP1,
    thetaP2_deg: thetaP2,
    thetaCortanteMax_deg: thetaCortanteMax,
  };
}

/**
 * Esfuerzos transformados sobre un plano rotado un ángulo θ (grados, antihorario
 * en el elemento físico) respecto al eje x original.
 */
export function transformarEsfuerzo(estado: EstadoEsfuerzoPlano, theta_deg: number): EstadoEsfuerzoPlano {
  const { sigmaX_MPa: sx, sigmaY_MPa: sy, tauXY_MPa: txy } = estado;
  const theta = (theta_deg * Math.PI) / 180;
  const c = Math.cos(2 * theta);
  const s = Math.sin(2 * theta);
  const prom = (sx + sy) / 2;
  const semiDif = (sx - sy) / 2;

  const sigmaXPrima = prom + semiDif * c + txy * s;
  const sigmaYPrima = prom - semiDif * c - txy * s;
  const tauXYPrima = -semiDif * s + txy * c;

  return { sigmaX_MPa: sigmaXPrima, sigmaY_MPa: sigmaYPrima, tauXY_MPa: tauXYPrima };
}

/**
 * Recipientes cilíndricos de pared delgada.
 * Válido únicamente cuando r/t ≥ 10 (relación de pared delgada estándar en
 * mecánica de materiales); por debajo de ese límite se requiere un análisis
 * de pared gruesa, no implementado aquí.
 *
 * Unidades: presión en MPa, radio y espesor en mm, esfuerzo en MPa.
 */

export function esValidoParedDelgada(radio_mm: number, espesor_mm: number): boolean {
  return radio_mm / espesor_mm >= 10;
}

export function esfuerzoCircunferencial(P_MPa: number, radio_mm: number, espesor_mm: number): number {
  if (espesor_mm <= 0) throw new Error('El espesor debe ser positivo.');
  return (P_MPa * radio_mm) / espesor_mm;
}

/**
 * Esfuerzo longitudinal. Solo tiene sentido en un recipiente CERRADO (con
 * tapas), donde la presión genera una fuerza axial resultante sobre el área
 * tapada. Un recipiente abierto (p. ej. una tubería sin tapas, apoyada
 * externamente) no desarrolla este esfuerzo por presión interna.
 */
export function esfuerzoLongitudinal(P_MPa: number, radio_mm: number, espesor_mm: number): number {
  if (espesor_mm <= 0) throw new Error('El espesor debe ser positivo.');
  return (P_MPa * radio_mm) / (2 * espesor_mm);
}

export function factorSeguridadRecipiente(sigmaAdmisible_MPa: number, sigmaMaximo_MPa: number): number {
  if (sigmaMaximo_MPa <= 0) throw new Error('El esfuerzo máximo debe ser positivo.');
  return sigmaAdmisible_MPa / sigmaMaximo_MPa;
}

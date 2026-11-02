/**
 * Torsión elástica de ejes circulares (macizos o tubulares).
 * Válida únicamente para secciones circulares de simetría axial: el momento
 * polar de inercia J no es, en general, la constante de torsión de otros
 * perfiles (perfiles abiertos, rectangulares, etc. requieren una constante de
 * torsión propia, no implementada aquí).
 *
 * Unidades: T en N·mm, longitud en mm, G en MPa, J en mm⁴, ángulo en rad.
 */

export function momentoPolarInerciaCircular(diametroExt_mm: number, diametroInt_mm = 0): number {
  if (diametroInt_mm >= diametroExt_mm) throw new Error('El diámetro interior debe ser menor que el exterior.');
  return (Math.PI / 32) * (diametroExt_mm ** 4 - diametroInt_mm ** 4);
}

export function anguloGiro(T_Nmm: number, L_mm: number, G_MPa: number, J_mm4: number): number {
  if (G_MPa <= 0 || J_mm4 <= 0) throw new Error('G y J deben ser positivos.');
  return (T_Nmm * L_mm) / (G_MPa * J_mm4);
}

export function esfuerzoCortanteMaximoTorsion(T_Nmm: number, radioExt_mm: number, J_mm4: number): number {
  if (J_mm4 <= 0) throw new Error('J debe ser positivo.');
  return (T_Nmm * radioExt_mm) / J_mm4;
}

export function moduloCorteDesdeDatos(T_Nmm: number, L_mm: number, phi_rad: number, J_mm4: number): number {
  if (phi_rad === 0) throw new Error('El ángulo de giro no puede ser cero.');
  return (T_Nmm * L_mm) / (phi_rad * J_mm4);
}

export function rigidezTorsional(G_MPa: number, J_mm4: number, L_mm: number): number {
  return (G_MPa * J_mm4) / L_mm;
}

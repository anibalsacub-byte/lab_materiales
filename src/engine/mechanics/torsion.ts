/**
 * Torsión elástica de ejes circulares (macizos o tubulares).
 * Válida únicamente para secciones circulares de simetría axial: el momento
 * polar de inercia J no es, en general, la constante de torsión de otros
 * perfiles (perfiles abiertos, rectangulares, etc. requieren una constante de
 * torsión propia, no implementada aquí).
 *
 * Unidades: T en N·mm, longitud en mm, G en MPa, J en mm⁴, ángulo en rad.
 */

import { esfuerzoEnDeformacion, esfuerzoSinEstriccion } from './axial';
import type { Material } from '../types';

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

// ---------------------------------------------------------------------------------------------
// Ensayo de torsión hasta la rotura (plasticidad en la sección).
// ---------------------------------------------------------------------------------------------

/**
 * Curva de cortante τ(γ) del material, construida a partir de la de tracción:
 * - Dúctiles (criterio de von Mises): τ = σ(ε*)/√3 con ε* = γ·G·√3/E. Así el tramo elástico es
 *   exactamente τ = G·γ y la fluencia empieza en τY = σY/√3. En torsión no hay estricción, por lo
 *   que se usa la curva sin estricción.
 * - Frágiles (máximo esfuerzo normal): en cortante puro el esfuerzo principal es σ₁ = τ, así que la
 *   pieza rompe cuando τ alcanza σU, por tracción en una hélice a 45°: τ = σ(γ·G/E).
 * Es una construcción simplificada (la ductilidad real en torsión suele ser mayor que la estimada
 * desde εF de tracción, que incluye la estricción).
 */
export function esfuerzoCortanteMaterial(material: Material, G: number, gamma: number): number | undefined {
  const E = material.propiedades.E_MPa ?? 2 * G * 1.3;
  if (material.modelo === 'elastico_plastico_bilineal') {
    const sigma = esfuerzoSinEstriccion(material, (gamma * G * Math.sqrt(3)) / E);
    return sigma === undefined ? undefined : sigma / Math.sqrt(3);
  }
  return esfuerzoEnDeformacion(material, (gamma * G) / E);
}

/** Deformación angular de la fibra exterior a la rotura (mismo criterio que {@link esfuerzoCortanteMaterial}). */
export function deformacionAngularRotura(material: Material, G: number): number | undefined {
  const { E_MPa, epsilonF } = material.propiedades;
  if (E_MPa === undefined || epsilonF === undefined) return undefined;
  return material.modelo === 'elastico_plastico_bilineal' ? (epsilonF * E_MPa) / (G * Math.sqrt(3)) : (epsilonF * E_MPa) / G;
}

/**
 * Par torsor (N·mm) para un ángulo de giro θ (rad) en la longitud L: T = ∫ τ(γ(r))·r·dA con
 * γ = r·θ/L (las secciones planas giran sin alabearse). En régimen elástico es T = G·J·θ/L.
 */
export function parTorsor(material: Material, G: number, dExt: number, dInt: number, L: number, theta: number, nAnillos = 120): number | undefined {
  const ro = dExt / 2;
  const ri = dInt / 2;
  const dr = (ro - ri) / nAnillos;
  let T = 0;
  for (let i = 0; i < nAnillos; i++) {
    const r = ri + (i + 0.5) * dr;
    const tau = esfuerzoCortanteMaterial(material, G, (r * theta) / L);
    if (tau === undefined) return undefined;
    T += tau * 2 * Math.PI * r * r * dr;
  }
  return T;
}

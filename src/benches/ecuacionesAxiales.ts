import { fmt, type Ecuacion } from '../components/lab/PanelesEnsayo';

/**
 * Ecuaciones en vivo de los ensayos axiales (tracción y compresión), con las lecturas actuales
 * de la celda de carga, del extensómetro o comparador y del extensómetro transversal.
 */
export function ecuacionesAxiales(p: {
  circular: boolean;
  d: number;
  b: number;
  h: number;
  A: number;
  L: number;
  /** Lecturas actuales (undefined si no hay lectura o el instrumento satura). */
  F?: number;
  dL?: number;
  epsTrans?: number | null;
  /** El estado actual está sobre la recta elástica inicial. */
  elastico: boolean;
  compresion?: boolean;
}): Ecuacion[] {
  const sigma = p.F !== undefined ? p.F / p.A : undefined;
  const eps = p.dL !== undefined ? p.dL / p.L : undefined;
  const conE = p.elastico && sigma !== undefined && !!eps;
  const conNu = p.elastico && typeof p.epsTrans === 'number' && !!eps;
  // En compresión la sección se ensancha: ε_trans es positiva y ν = ε_trans/ε.
  const signo = p.compresion ? '' : '−';
  return [
    p.circular
      ? { nombre: 'Área inicial', formula: 'A₀ = π·d²/4', sustitucion: `π·(${fmt(p.d, 2)})²/4`, resultado: `${fmt(p.A, 2)} mm²` }
      : { nombre: 'Área inicial', formula: 'A₀ = b·h', sustitucion: `${fmt(p.b, 2)} · ${fmt(p.h, 2)}`, resultado: `${fmt(p.A, 2)} mm²` },
    {
      nombre: p.compresion ? 'Esfuerzo de compresión' : 'Esfuerzo ingenieril',
      formula: 'σ = F / A₀',
      sustitucion: p.F !== undefined ? `${fmt(p.F, 0)} N / ${fmt(p.A, 2)} mm²` : undefined,
      resultado: sigma !== undefined ? `${fmt(sigma, 1)} MPa` : undefined,
    },
    {
      nombre: p.compresion ? 'Acortamiento unitario' : 'Deformación unitaria',
      formula: 'ε = ΔL / Lo',
      sustitucion: p.dL !== undefined ? `${fmt(p.dL, 3)} mm / ${fmt(p.L, 1)} mm` : undefined,
      resultado: eps !== undefined ? fmt(eps, 5) : undefined,
    },
    {
      nombre: 'Módulo de Young',
      formula: 'E = σ / ε',
      sustitucion: conE ? `${fmt(sigma!, 1)} MPa / ${fmt(eps!, 5)}` : undefined,
      resultado: conE ? `${fmt(sigma! / eps! / 1000, 1)} GPa` : undefined,
      inactiva: !p.elastico,
      nota: p.elastico
        ? 'Con un punto aislado el ruido pesa; la pendiente entre varios puntos elásticos es más fiable.'
        : 'Solo en la zona elástica: fuera de ella σ/ε es un módulo secante, no E.',
    },
    {
      nombre: 'Relación de Poisson',
      formula: `ν = ${signo}ε_trans / ε`,
      sustitucion: conNu ? `${signo}(${fmt(p.epsTrans as number, 5)}) / ${fmt(eps!, 5)}` : undefined,
      resultado: conNu ? fmt(((p.compresion ? 1 : -1) * (p.epsTrans as number)) / eps!, 3) : undefined,
      inactiva: !p.elastico,
      nota: p.elastico ? undefined : 'Solo en la zona elástica: al fluir, el metal conserva su volumen y la relación tiende a 0,5.',
    },
  ];
}

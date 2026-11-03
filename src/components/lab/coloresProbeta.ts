import type { CategoriaMaterial } from '../../engine/types';
import type { ColoresProbeta } from '../svg/MarcoMaquinaSVG';

/** Colores de la probeta por familia de material (gradiente metálico o color de la pieza). */
export const COLORES_PROBETA: Record<CategoriaMaterial, ColoresProbeta> = {
  acero_carbono: { claro: '#e4e9ee', medio: '#a9b4bf', oscuro: '#5f6b77' },
  acero_aleado: { claro: '#dfe5ea', medio: '#9aa6b2', oscuro: '#55606b' },
  acero_inoxidable: { claro: '#f2f5f8', medio: '#c3ccd4', oscuro: '#7a8692' },
  aluminio: { claro: '#f4f6f8', medio: '#cfd6dc', oscuro: '#8e99a3' },
  cobre_aleacion: { claro: '#f6d2a6', medio: '#d08a4e', oscuro: '#8a4f25' },
  fundicion: { claro: '#9aa1a8', medio: '#6c737a', oscuro: '#3d4349' },
  polimero: { claro: '#f4f1e6', medio: '#d9d2bb', oscuro: '#a59d84' },
  impresion_3d: { claro: '#ffcf8a', medio: '#f29b38', oscuro: '#b4651a' },
  compuesto: { claro: '#5b6168', medio: '#3a3f45', oscuro: '#1f2327' },
  desconocido: { claro: '#e4e9ee', medio: '#a9b4bf', oscuro: '#5f6b77' },
};

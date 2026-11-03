import type { Material } from './types';

/**
 * Biblioteca central de materiales industriales.
 *
 * Los valores son típicos de referencia de literatura técnica de uso común
 * (Shigley's Mechanical Engineering Design, ASM Handbook, MatWeb, Callister)
 * para la condición indicada. Son aproximaciones didácticas: un material real
 * del mismo grado puede variar por lote, proceso y norma exacta. Cuando una
 * propiedad no tiene un valor de referencia confiable se omite (queda
 * `undefined`) en lugar de inventarse; los cálculos que dependan de ella deben
 * deshabilitarse en la interfaz (ver `propiedadDisponible`).
 */
const FUENTE_METALES =
  'Valores típicos de referencia (Shigley, Mechanical Engineering Design; ASM Handbook) — aproximados para fines didácticos.';
const FUENTE_POLIMEROS =
  'Valores típicos de referencia (Callister, Materials Science and Engineering; fichas técnicas de fabricante genéricas) — aproximados para fines didácticos.';
const FUENTE_COMPUESTOS =
  'Valores típicos de referencia para laminado unidireccional (Callister; Hibbeler, Mechanics of Materials) — aproximados y fuertemente dependientes del proceso real.';
const FUENTE_ADITIVA =
  'Valores típicos de referencia para impresión FDM con relleno 100% (literatura de caracterización de polímeros impresos) — muy sensibles a parámetros de impresión reales.';

export const MATERIALES: Material[] = [
  // ---- Aceros al carbono ----
  {
    id: 'astm-a36',
    nombre: 'Acero ASTM A36',
    nombreCorto: 'ASTM A36',
    categoria: 'acero_carbono',
    condicion: 'laminado en caliente',
    modelo: 'elastico_plastico_bilineal',
    mesetaFluencia: true,
    propiedades: { densidad_kg_m3: 7850, E_MPa: 200000, nu: 0.26, sigmaY_MPa: 250, sigmaU_MPa: 400, epsilonF: 0.20 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'sae-1018',
    nombre: 'Acero SAE 1018',
    nombreCorto: 'SAE 1018',
    categoria: 'acero_carbono',
    condicion: 'estirado en frío',
    modelo: 'elastico_plastico_bilineal',
    mesetaFluencia: true,
    propiedades: { densidad_kg_m3: 7870, E_MPa: 200000, nu: 0.29, sigmaY_MPa: 370, sigmaU_MPa: 440, epsilonF: 0.15 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'sae-1045',
    nombre: 'Acero SAE 1045',
    nombreCorto: 'SAE 1045',
    categoria: 'acero_carbono',
    condicion: 'laminado en caliente',
    modelo: 'elastico_plastico_bilineal',
    mesetaFluencia: true,
    propiedades: { densidad_kg_m3: 7850, E_MPa: 200000, nu: 0.29, sigmaY_MPa: 310, sigmaU_MPa: 565, epsilonF: 0.12 },
    fuente: FUENTE_METALES,
  },
  // ---- Aceros aleados ----
  {
    id: 'sae-4140-normalizado',
    nombre: 'Acero SAE 4140',
    nombreCorto: 'SAE 4140 N',
    categoria: 'acero_aleado',
    condicion: 'normalizado',
    modelo: 'elastico_plastico_bilineal',
    mesetaFluencia: true,
    propiedades: { densidad_kg_m3: 7850, E_MPa: 205000, nu: 0.29, sigmaY_MPa: 655, sigmaU_MPa: 1020, epsilonF: 0.08 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'sae-4140-templado',
    nombre: 'Acero SAE 4140',
    nombreCorto: 'SAE 4140 T+R',
    categoria: 'acero_aleado',
    condicion: 'templado y revenido',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 7850, E_MPa: 205000, nu: 0.29, sigmaY_MPa: 950, sigmaU_MPa: 1080, epsilonF: 0.06 },
    fuente: FUENTE_METALES,
    notas:
      'Misma composición que la condición normalizada; el tratamiento térmico cambia resistencia y ductilidad. A diferencia de esa condición, el temple y revenido produce fluencia continua, sin meseta marcada.',
  },
  // ---- Aceros inoxidables ----
  {
    id: 'aisi-304',
    nombre: 'Acero inoxidable AISI 304',
    nombreCorto: 'AISI 304',
    categoria: 'acero_inoxidable',
    condicion: 'recocido',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 8000, E_MPa: 193000, nu: 0.29, sigmaY_MPa: 215, sigmaU_MPa: 505, epsilonF: 0.40 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'aisi-316',
    nombre: 'Acero inoxidable AISI 316',
    nombreCorto: 'AISI 316',
    categoria: 'acero_inoxidable',
    condicion: 'recocido',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 8000, E_MPa: 193000, nu: 0.28, sigmaY_MPa: 205, sigmaU_MPa: 515, epsilonF: 0.40 },
    fuente: FUENTE_METALES,
  },
  // ---- Aluminios ----
  {
    id: 'al-6061-t6',
    nombre: 'Aluminio 6061-T6',
    nombreCorto: 'Al 6061-T6',
    categoria: 'aluminio',
    condicion: 'T6',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 2700, E_MPa: 68900, nu: 0.33, sigmaY_MPa: 276, sigmaU_MPa: 310, epsilonF: 0.12 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'al-7075-t6',
    nombre: 'Aluminio 7075-T6',
    nombreCorto: 'Al 7075-T6',
    categoria: 'aluminio',
    condicion: 'T6',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 2810, E_MPa: 71700, nu: 0.33, sigmaY_MPa: 503, sigmaU_MPa: 572, epsilonF: 0.11 },
    fuente: FUENTE_METALES,
  },
  // ---- Cobre y aleaciones ----
  {
    id: 'cobre-c110',
    nombre: 'Cobre C110',
    nombreCorto: 'Cobre C110',
    categoria: 'cobre_aleacion',
    condicion: 'recocido',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 8940, E_MPa: 115000, nu: 0.34, sigmaY_MPa: 69, sigmaU_MPa: 220, epsilonF: 0.45 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'laton-c360',
    nombre: 'Latón C360',
    nombreCorto: 'Latón C360',
    categoria: 'cobre_aleacion',
    condicion: 'semiduro',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 8500, E_MPa: 97000, nu: 0.34, sigmaY_MPa: 310, sigmaU_MPa: 420, epsilonF: 0.25 },
    fuente: FUENTE_METALES,
  },
  {
    id: 'bronce-c90500',
    nombre: 'Bronce al estaño C90500',
    nombreCorto: 'Bronce C90500',
    categoria: 'cobre_aleacion',
    condicion: 'colado (as-cast)',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 8800, E_MPa: 103000, nu: 0.34, sigmaY_MPa: 150, sigmaU_MPa: 310, epsilonF: 0.20 },
    fuente: FUENTE_METALES,
  },
  // ---- Fundiciones ----
  {
    id: 'fundicion-gris-clase30',
    nombre: 'Fundición gris, clase 30',
    nombreCorto: 'Fund. gris 30',
    categoria: 'fundicion',
    condicion: 'colado',
    modelo: 'fragil_lineal',
    // σUc: resistencia a compresión de la clase 30 (752 MPa ≈ 109 ksi; ASM Handbook vol. 1, propiedades de fundición gris).
    propiedades: { densidad_kg_m3: 7200, E_MPa: 100000, nu: 0.26, sigmaU_MPa: 210, epsilonF: 0.006, sigmaUc_MPa: 752 },
    fuente: FUENTE_METALES,
    notas:
      'Material frágil en tracción: no presenta límite de fluencia definido. Su resistencia a compresión (≈ 752 MPa) es unas 3,6 veces la de tracción: por eso se usa en bancadas y bases de máquinas.',
  },
  {
    id: 'fundicion-nodular-60-40-18',
    nombre: 'Fundición nodular 60-40-18',
    nombreCorto: 'Fund. nodular',
    categoria: 'fundicion',
    condicion: 'colado',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 7100, E_MPa: 165000, nu: 0.275, sigmaY_MPa: 275, sigmaU_MPa: 415, epsilonF: 0.18 },
    fuente: FUENTE_METALES,
  },
  // ---- Polímeros ----
  {
    id: 'abs',
    nombre: 'ABS (moldeado por inyección)',
    nombreCorto: 'ABS',
    categoria: 'polimero',
    modelo: 'fragil_lineal',
    propiedades: { densidad_kg_m3: 1050, E_MPa: 2300, nu: 0.35, sigmaU_MPa: 40, epsilonF: 0.20 },
    fuente: FUENTE_POLIMEROS,
  },
  {
    id: 'hdpe',
    nombre: 'HDPE (polietileno de alta densidad)',
    nombreCorto: 'HDPE',
    categoria: 'polimero',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 950, E_MPa: 1000, nu: 0.42, sigmaY_MPa: 26, sigmaU_MPa: 30, epsilonF: 0.80 },
    fuente: FUENTE_POLIMEROS,
  },
  {
    id: 'pp',
    nombre: 'PP (polipropileno homopolímero)',
    nombreCorto: 'PP',
    categoria: 'polimero',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 905, E_MPa: 1500, nu: 0.42, sigmaY_MPa: 35, sigmaU_MPa: 35, epsilonF: 0.15 },
    fuente: FUENTE_POLIMEROS,
  },
  {
    id: 'pa6',
    nombre: 'PA6 (nylon 6, seco)',
    nombreCorto: 'PA6 (nylon)',
    categoria: 'polimero',
    condicion: 'seco (as-molded)',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 1140, E_MPa: 2800, nu: 0.39, sigmaY_MPa: 80, sigmaU_MPa: 80, epsilonF: 0.30 },
    fuente: FUENTE_POLIMEROS,
    notas: 'La humedad ambiental reduce significativamente la resistencia y rigidez de las poliamidas; no modelada aquí.',
  },
  {
    id: 'pvc-rigido',
    nombre: 'PVC rígido',
    nombreCorto: 'PVC rígido',
    categoria: 'polimero',
    modelo: 'fragil_lineal',
    propiedades: { densidad_kg_m3: 1400, E_MPa: 3000, nu: 0.38, sigmaU_MPa: 52, epsilonF: 0.08 },
    fuente: FUENTE_POLIMEROS,
  },
  {
    id: 'policarbonato',
    nombre: 'Policarbonato (PC)',
    nombreCorto: 'PC',
    categoria: 'polimero',
    modelo: 'elastico_plastico_bilineal',
    propiedades: { densidad_kg_m3: 1200, E_MPa: 2400, nu: 0.37, sigmaY_MPa: 62, sigmaU_MPa: 65, epsilonF: 0.12 },
    fuente: FUENTE_POLIMEROS,
  },
  // ---- Fabricación aditiva ----
  {
    id: 'pla-fdm',
    nombre: 'PLA impreso FDM',
    nombreCorto: 'PLA (FDM)',
    categoria: 'impresion_3d',
    condicion: '100% relleno, orientación longitudinal (0°)',
    modelo: 'fragil_lineal',
    propiedades: { densidad_kg_m3: 1250, E_MPa: 3500, nu: 0.36, sigmaU_MPa: 50, epsilonF: 0.05 },
    fuente: FUENTE_ADITIVA,
    notas: 'La resistencia cae fuertemente si la carga es transversal a las capas; aquí solo se modela la orientación longitudinal.',
  },
  {
    id: 'petg-fdm',
    nombre: 'PETG impreso FDM',
    nombreCorto: 'PETG (FDM)',
    categoria: 'impresion_3d',
    condicion: '100% relleno, orientación longitudinal (0°)',
    modelo: 'fragil_lineal',
    propiedades: { densidad_kg_m3: 1270, E_MPa: 1800, nu: 0.40, sigmaU_MPa: 42, epsilonF: 0.07 },
    fuente: FUENTE_ADITIVA,
  },
  {
    id: 'abs-fdm',
    nombre: 'ABS impreso FDM',
    nombreCorto: 'ABS (FDM)',
    categoria: 'impresion_3d',
    condicion: '100% relleno, orientación longitudinal (0°)',
    modelo: 'fragil_lineal',
    propiedades: { densidad_kg_m3: 1040, E_MPa: 1800, nu: 0.38, sigmaU_MPa: 32, epsilonF: 0.04 },
    fuente: FUENTE_ADITIVA,
    notas: 'Más débil y frágil que el ABS inyectado por la unión imperfecta entre capas.',
  },
  // ---- Compuestos ----
  {
    id: 'gfrp-ud',
    nombre: 'GFRP unidireccional (fibra de vidrio/epoxi)',
    nombreCorto: 'GFRP 0°',
    categoria: 'compuesto',
    condicion: 'laminado unidireccional, carga a 0° (dirección de la fibra)',
    modelo: 'fragil_lineal',
    esOrtotropico: true,
    propiedades: {
      densidad_kg_m3: 1900, E_MPa: 40000, E2_MPa: 8000, nu: 0.28, G12_MPa: 4000, sigmaU_MPa: 800, epsilonF: 0.02,
      orientacionFibra_deg: 0,
    },
    fuente: FUENTE_COMPUESTOS,
    notas: 'Propiedades válidas solo para carga alineada con la fibra (0°). Cargar a otro ángulo requiere un análisis de laminado fuera de este banco.',
  },
  {
    id: 'cfrp-ud',
    nombre: 'CFRP unidireccional (fibra de carbono/epoxi)',
    nombreCorto: 'CFRP 0°',
    categoria: 'compuesto',
    condicion: 'laminado unidireccional, carga a 0° (dirección de la fibra)',
    modelo: 'fragil_lineal',
    esOrtotropico: true,
    propiedades: {
      densidad_kg_m3: 1600, E_MPa: 135000, E2_MPa: 10000, nu: 0.28, G12_MPa: 5000, sigmaU_MPa: 1500, epsilonF: 0.012,
      orientacionFibra_deg: 0,
    },
    fuente: FUENTE_COMPUESTOS,
    notas: 'Propiedades válidas solo para carga alineada con la fibra (0°).',
  },
  // ---- Probetas desconocidas (identificación experimental) ----
  {
    id: 'desconocida-a',
    nombre: 'Probeta desconocida A',
    nombreCorto: 'Desconocida A',
    categoria: 'desconocido',
    modelo: 'elastico_plastico_bilineal',
    esDesconocido: true,
    propiedades: { densidad_kg_m3: 7850, E_MPa: 200000, nu: 0.29, sigmaY_MPa: 400, sigmaU_MPa: 520, epsilonF: 0.10 },
    fuente: 'Propiedades generadas para la actividad de identificación; no se muestran al estudiante antes del ensayo.',
  },
  {
    id: 'desconocida-b',
    nombre: 'Probeta desconocida B',
    nombreCorto: 'Desconocida B',
    categoria: 'desconocido',
    modelo: 'elastico_plastico_bilineal',
    esDesconocido: true,
    propiedades: { densidad_kg_m3: 2700, E_MPa: 70000, nu: 0.33, sigmaY_MPa: 240, sigmaU_MPa: 290, epsilonF: 0.10 },
    fuente: 'Propiedades generadas para la actividad de identificación; no se muestran al estudiante antes del ensayo.',
  },
];

export function obtenerMaterial(id: string): Material | undefined {
  return MATERIALES.find((m) => m.id === id);
}

/** Indica si una propiedad tiene un valor de referencia disponible para este material. */
export function propiedadDisponible(material: Material, propiedad: keyof Material['propiedades']): boolean {
  return material.propiedades[propiedad] !== undefined;
}

/** Módulo de corte: usa el valor dado o lo deriva de E y nu para materiales isótropos. */
export function moduloCorte(material: Material): number | undefined {
  if (material.propiedades.G12_MPa !== undefined) return material.propiedades.G12_MPa;
  if (material.propiedades.G_MPa !== undefined) return material.propiedades.G_MPa;
  const { E_MPa, nu } = material.propiedades;
  if (E_MPa === undefined || nu === undefined || material.esOrtotropico) return undefined;
  return E_MPa / (2 * (1 + nu));
}

export const CATEGORIAS_MATERIAL: Record<string, string> = {
  acero_carbono: 'Aceros al carbono',
  acero_aleado: 'Aceros aleados',
  acero_inoxidable: 'Aceros inoxidables',
  aluminio: 'Aluminios',
  cobre_aleacion: 'Cobre y aleaciones',
  fundicion: 'Fundiciones',
  polimero: 'Polímeros',
  impresion_3d: 'Fabricación aditiva',
  compuesto: 'Compuestos',
  desconocido: 'Probetas desconocidas',
};

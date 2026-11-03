// Tipos centrales del motor físico. El motor de cálculo es independiente de
// la interfaz: estas estructuras no conocen React ni SVG.

export type CategoriaMaterial =
  | 'acero_carbono'
  | 'acero_aleado'
  | 'acero_inoxidable'
  | 'aluminio'
  | 'cobre_aleacion'
  | 'fundicion'
  | 'polimero'
  | 'impresion_3d'
  | 'compuesto'
  | 'desconocido';

/** Modelo constitutivo usado para generar la curva esfuerzo-deformación de un material. */
export type ModeloConstitutivo =
  | 'elastico_lineal' // válido hasta la fractura; sin fluencia (ideal, solo referencia)
  | 'elastico_plastico_bilineal' // metales dúctiles: tramo elástico + endurecimiento lineal hasta sigmaU
  | 'fragil_lineal'; // fundición gris, polímeros rígidos, compuestos: lineal hasta fractura, sin fluencia

export interface PropiedadesMaterial {
  densidad_kg_m3?: number;
  E_MPa?: number; // módulo de Young (o módulo longitudinal E1 en compuestos)
  nu?: number; // relación de Poisson
  G_MPa?: number; // módulo de corte (si no está disponible se deriva de E y nu para materiales isótropos)
  sigmaY_MPa?: number; // límite de fluencia (ingenieril)
  sigmaU_MPa?: number; // resistencia última (ingenieril)
  epsilonF?: number; // deformación unitaria a la fractura (adimensional)
  // Propiedades adicionales para materiales ortótropos (compuestos reforzados con fibra)
  E2_MPa?: number; // módulo transversal
  G12_MPa?: number; // módulo de corte en el plano 1-2
  orientacionFibra_deg?: number; // orientación de la fibra respecto al eje de carga
}

/** Qué propiedades del material están respaldadas por una fuente y pueden usarse en cálculos. */
export type DisponibilidadMaterial = Partial<Record<keyof PropiedadesMaterial, boolean>>;

export interface Material {
  id: string;
  nombre: string;
  /** Nombre breve para botones de selección (p. ej. "ASTM A36", "SAE 4140 T+R"). */
  nombreCorto?: string;
  categoria: CategoriaMaterial;
  condicion?: string; // p. ej. "laminado en caliente", "T6", "recocido"
  modelo: ModeloConstitutivo;
  esOrtotropico?: boolean;
  /**
   * Solo aplica a `elastico_plastico_bilineal`: indica si el material exhibe un punto de
   * fluencia marcado con meseta (fenómeno de Lüders), típico de aceros al carbono/bajo aleados
   * en estado recocido o normalizado. La mayoría de metales dúctiles (aluminios, inoxidables
   * austeníticos, cobre y sus aleaciones, aceros muy trabajados en frío o templados) fluyen de
   * forma continua, sin meseta — por eso esto es una propiedad por material, no un comportamiento
   * universal.
   */
  mesetaFluencia?: boolean;
  propiedades: PropiedadesMaterial;
  fuente: string;
  notas?: string;
  esDesconocido?: boolean; // probeta de identificación: oculta propiedades al estudiante en UI
}

export interface EspecificacionInstrumento {
  id: string;
  nombre: string;
  magnitud: string; // "fuerza", "desplazamiento axial", "deformación transversal", "ángulo de giro", ...
  unidad: string;
  rango: [number, number];
  resolucion: number;
  errorCeroMax_pct: number; // error de cero máximo posible antes de calibrar, como % del fondo de escala
  incertidumbre_pct: number; // incertidumbre relativa de medición (k=1), como % de la lectura
  /** Lectura por debajo de la cual la incertidumbre deja de bajar (en unidades del instrumento). Por defecto, 2 % del fondo de escala. */
  umbralIncertidumbre?: number;
}

export interface LecturaInstrumento {
  valor: number | null; // null si fuera de rango
  unidad: string;
  incertidumbre: number; // ± en las mismas unidades que valor
  fueraDeRango: boolean;
  advertencias: string[];
}

export type EtapaEnsayo =
  | 'preparacion'
  | 'prediccion'
  | 'instrumentacion'
  | 'ejecucion'
  | 'registro'
  | 'calculo'
  | 'validacion'
  | 'interpretacion'
  | 'exportacion';

export interface PuntoMedicion {
  id: string;
  indice: number;
  timestampSimulado: number;
  lecturas: Record<string, LecturaInstrumento>;
}

export interface PrediccionTeorica {
  variable: string;
  valor: number;
  unidad: string;
}

export interface SesionEnsayo {
  id: string;
  banco: string;
  semilla: number;
  materialId: string;
  creado: string; // ISO date
  etapaActual: EtapaEnsayo;
  configuracion: Record<string, unknown>;
  predicciones: PrediccionTeorica[];
  mediciones: PuntoMedicion[];
  calculosEstudiante: Record<string, number>;
  conclusiones: string;
  probetaDestruida: boolean;
}

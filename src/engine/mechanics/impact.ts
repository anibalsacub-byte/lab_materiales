/**
 * Ensayo de impacto Charpy (ASTM E23 / ISO 148-1): péndulo, energía absorbida y transición
 * dúctil–frágil.
 *
 * Unidades: energía en J, ángulos en grados (medidos desde la vertical, hacia el lado de partida o
 * de subida), longitudes en m, masa en kg, temperatura en °C.
 */

export const G = 9.81;

/** Péndulo de 300 J (α = 150°), con velocidad de impacto de ~5,4 m/s, dentro de lo que piden las normas (5–5,5 m/s). */
export const PENDULO_CHARPY = {
  masa_kg: 20.5,
  /** Distancia del eje de giro al centro de percusión (filo del martillo). */
  brazo_m: 0.8,
  /** Pérdidas por rozamiento en el eje y resistencia del aire en una oscilación completa (se miden con un ensayo en vacío). */
  perdidas_J: 0.6,
};

/** Energía potencial respecto del punto de impacto (péndulo vertical) con el péndulo a un ángulo θ. */
export function energiaPotencial(m: number, R: number, anguloDeg: number): number {
  return m * G * R * (1 - Math.cos((anguloDeg * Math.PI) / 180));
}

/** Velocidad del filo del martillo en el impacto: v = √(2·g·R·(1 − cos α)). */
export function velocidadImpacto(R: number, alfaDeg: number): number {
  return Math.sqrt(2 * G * R * (1 - Math.cos((alfaDeg * Math.PI) / 180)));
}

/**
 * Ángulo de subida β tras romper la probeta: m·g·R·(1 − cos β) = E₀ − KV − pérdidas.
 * Devuelve undefined si la energía disponible no alcanza (la probeta no rompe).
 */
export function anguloSubida(m: number, R: number, alfaDeg: number, KV: number, perdidas: number): number | undefined {
  const restante = energiaPotencial(m, R, alfaDeg) - KV - perdidas;
  if (restante < 0) return undefined;
  const coseno = 1 - restante / (m * G * R);
  return (Math.acos(Math.max(-1, Math.min(1, coseno))) * 180) / Math.PI;
}

/** Energía indicada por la máquina a partir de los ángulos: KV = m·g·R·(cos β − cos α) (incluye las pérdidas). */
export function energiaDesdeAngulos(m: number, R: number, alfaDeg: number, betaDeg: number): number {
  return m * G * R * (Math.cos((betaDeg * Math.PI) / 180) - Math.cos((alfaDeg * Math.PI) / 180));
}

// ---------------------------------------------------------------------------------------------
// Transición dúctil–frágil
// ---------------------------------------------------------------------------------------------

export type Entalla = 'V' | 'U';
export type EstructuraCristalina = 'BCC' | 'FCC' | 'fundicion';

export interface CurvaTransicion {
  /** Estante inferior (frágil) y superior (dúctil), J, con entalla en V y probeta normal de 10 mm. */
  inferior: number;
  superior: number;
  /** Temperatura media de la transición y semiancho de la zona de transición, °C. */
  T0: number;
  C: number;
  estructura: EstructuraCristalina;
}

/**
 * Curvas de transición típicas, ilustrativas (forma y orden de magnitud según Callister, Materials
 * Science and Engineering, cap. 8, y ASM Handbook vol. 1 y 8). No son datos certificados: la
 * energía real depende de la colada, el espesor, la dirección de laminación y el tratamiento.
 * Los aceros (BCC) tienen transición; el aumento de carbono la desplaza a temperaturas más altas y
 * baja el estante superior. Los metales FCC (aluminio, cobre, inoxidables austeníticos) no tienen
 * transición. La fundición gris es frágil a cualquier temperatura.
 */
export const DATOS_IMPACTO: Record<string, CurvaTransicion> = {
  'astm-a36': { inferior: 4, superior: 160, T0: -5, C: 18, estructura: 'BCC' },
  'sae-1018': { inferior: 4, superior: 110, T0: 0, C: 18, estructura: 'BCC' },
  'sae-1045': { inferior: 4, superior: 45, T0: 40, C: 25, estructura: 'BCC' },
  'sae-4140-normalizado': { inferior: 5, superior: 60, T0: 30, C: 30, estructura: 'BCC' },
  'sae-4140-templado': { inferior: 10, superior: 110, T0: -50, C: 25, estructura: 'BCC' },
  'aisi-304': { inferior: 140, superior: 180, T0: -120, C: 60, estructura: 'FCC' },
  'aisi-316': { inferior: 140, superior: 180, T0: -120, C: 60, estructura: 'FCC' },
  'al-6061-t6': { inferior: 16, superior: 20, T0: -100, C: 80, estructura: 'FCC' },
  'al-7075-t6': { inferior: 8, superior: 10, T0: -100, C: 80, estructura: 'FCC' },
  'cobre-c110': { inferior: 70, superior: 80, T0: -100, C: 80, estructura: 'FCC' },
  'fundicion-gris-clase30': { inferior: 2, superior: 4, T0: 50, C: 60, estructura: 'fundicion' },
  'fundicion-nodular-60-40-18': { inferior: 4, superior: 18, T0: -20, C: 15, estructura: 'BCC' },
};

/**
 * Efecto aproximado de la entalla en U (radio 1 mm), menos aguda que la V: la transición baja unos
 * 25 °C y el estante inferior sube, porque la concentración de esfuerzos es menor.
 */
function ajustarEntalla(c: CurvaTransicion, entalla: Entalla): CurvaTransicion {
  if (entalla === 'V' || c.estructura !== 'BCC') return c;
  return { ...c, T0: c.T0 - 25, inferior: c.inferior * 1.5 };
}

/** Energía absorbida a la temperatura T: ajuste de tangente hiperbólica KV = LS + (US − LS)/2·[1 + tanh((T − T0)/C)]. */
export function energiaCharpy(curva: CurvaTransicion, T: number, entalla: Entalla = 'V'): number {
  const c = ajustarEntalla(curva, entalla);
  return c.inferior + ((c.superior - c.inferior) / 2) * (1 + Math.tanh((T - c.T0) / c.C));
}

/** Temperatura a la que la curva alcanza una energía dada (p. ej. T27J, criterio habitual de tenacidad). */
export function temperaturaParaEnergia(curva: CurvaTransicion, energia: number, entalla: Entalla = 'V'): number | undefined {
  const c = ajustarEntalla(curva, entalla);
  const x = (2 * (energia - c.inferior)) / (c.superior - c.inferior) - 1;
  if (x <= -1 || x >= 1) return undefined;
  return c.T0 + c.C * Math.atanh(x);
}

/** Porcentaje de fractura dúctil (fibrosa) en la superficie de rotura, correlacionado con la posición en la transición. */
export function fraccionFracturaDuctil(curva: CurvaTransicion, KV: number, entalla: Entalla = 'V'): number {
  if (curva.estructura === 'fundicion') return 0;
  if (curva.estructura === 'FCC') return 100;
  const c = ajustarEntalla(curva, entalla);
  return Math.min(Math.max((100 * (KV - c.inferior)) / (c.superior - c.inferior), 0), 100);
}

/**
 * Temperatura de la probeta t segundos después de sacarla del baño: se acerca a la ambiente con
 * constante de tiempo τ (~60 s para una barra de 10×10 mm al aire). Por eso las normas exigen
 * romperla antes de 5 s.
 */
export function temperaturaProbeta(Tbano: number, Tambiente: number, t: number, tau = 60): number {
  return Tambiente + (Tbano - Tambiente) * Math.exp(-Math.max(t, 0) / tau);
}

/** Área del ligamento bajo la entalla (10 mm × 8 mm en la V normal; 10 × 5 en la U de 5 mm), mm². */
export function areaLigamento(entalla: Entalla): number {
  return entalla === 'V' ? 80 : 50;
}

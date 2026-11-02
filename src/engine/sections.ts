/**
 * Propiedades geométricas de secciones transversales.
 *
 * Las secciones compuestas (I, T, L) se calculan como ensamblajes de
 * rectángulos mediante el teorema de ejes paralelos — el método estándar de
 * "secciones compuestas" de mecánica de materiales. Las secciones simples
 * (circular, rectangular, tubulares) usan sus fórmulas cerradas.
 *
 * Convención: x = eje horizontal, y = eje vertical; Ix e Iy son los momentos
 * de inercia respecto a los ejes centroidales x e y respectivamente (Ix rige
 * la flexión respecto al eje horizontal, el caso usual de vigas).
 */

export type TipoSeccion =
  | 'circular_maciza'
  | 'circular_tubular'
  | 'rectangular'
  | 'rectangular_tubular'
  | 'perfil_I'
  | 'perfil_T'
  | 'perfil_L';

export interface ParametrosSeccion {
  tipo: TipoSeccion;
  // circular
  d?: number;
  dInt?: number;
  // rectangular
  b?: number;
  h?: number;
  bInt?: number;
  hInt?: number;
  // perfiles I / T / L (todas las dimensiones en mm)
  bf?: number; // ancho del ala (I, T)
  tf?: number; // espesor del ala (I, T)
  hw?: number; // altura del alma, sin contar alas (I, T)
  tw?: number; // espesor del alma (I, T, y espesor común de L)
  bL?: number; // ala horizontal de un perfil L
  hL?: number; // ala vertical de un perfil L
}

interface Rectangulo {
  ancho: number;
  alto: number;
  cx: number; // posición del centroide del rectángulo respecto a un origen arbitrario común
  cy: number;
}

export interface PropiedadesSeccion {
  area_mm2: number;
  centroide: { x_mm: number; y_mm: number }; // respecto al origen de referencia usado para construir la sección
  Ix_mm4: number;
  Iy_mm4: number;
  Ixy_mm4: number;
  rx_mm: number;
  ry_mm: number;
  I1_mm4: number;
  I2_mm4: number;
  thetaPrincipal_deg: number; // ángulo antihorario desde x hasta el eje principal 1
  esSimetrica: boolean;
}

function propiedadesDeRectangulos(rects: Rectangulo[]): Omit<PropiedadesSeccion, 'esSimetrica'> {
  const area = rects.reduce((acc, r) => acc + r.ancho * r.alto, 0);
  if (area <= 0) throw new Error('El área resultante debe ser positiva (revise las dimensiones).');

  const cx = rects.reduce((acc, r) => acc + r.ancho * r.alto * r.cx, 0) / area;
  const cy = rects.reduce((acc, r) => acc + r.ancho * r.alto * r.cy, 0) / area;

  let Ix = 0;
  let Iy = 0;
  let Ixy = 0;
  for (const r of rects) {
    const A = r.ancho * r.alto;
    const dx = r.cx - cx;
    const dy = r.cy - cy;
    Ix += (r.ancho * r.alto ** 3) / 12 + A * dy ** 2;
    Iy += (r.alto * r.ancho ** 3) / 12 + A * dx ** 2;
    Ixy += A * dx * dy; // el producto de inercia propio de un rectángulo respecto a sus propios ejes es cero
  }

  const rx = Math.sqrt(Ix / area);
  const ry = Math.sqrt(Iy / area);
  const prom = (Ix + Iy) / 2;
  const radio = Math.sqrt(((Ix - Iy) / 2) ** 2 + Ixy ** 2);
  const I1 = prom + radio;
  const I2 = prom - radio;
  const thetaPrincipal = (0.5 * Math.atan2(-2 * Ixy, Ix - Iy) * 180) / Math.PI;

  return { area_mm2: area, centroide: { x_mm: cx, y_mm: cy }, Ix_mm4: Ix, Iy_mm4: Iy, Ixy_mm4: Ixy, rx_mm: rx, ry_mm: ry, I1_mm4: I1, I2_mm4: I2, thetaPrincipal_deg: thetaPrincipal };
}

export function calcularSeccion(p: ParametrosSeccion): PropiedadesSeccion {
  switch (p.tipo) {
    case 'circular_maciza': {
      if (!p.d || p.d <= 0) throw new Error('Diámetro inválido.');
      const A = (Math.PI * p.d ** 2) / 4;
      const I = (Math.PI * p.d ** 4) / 64;
      return { area_mm2: A, centroide: { x_mm: 0, y_mm: 0 }, Ix_mm4: I, Iy_mm4: I, Ixy_mm4: 0, rx_mm: Math.sqrt(I / A), ry_mm: Math.sqrt(I / A), I1_mm4: I, I2_mm4: I, thetaPrincipal_deg: 0, esSimetrica: true };
    }
    case 'circular_tubular': {
      if (!p.d || !p.dInt || p.dInt >= p.d) throw new Error('El diámetro interior debe ser menor que el exterior.');
      const A = (Math.PI / 4) * (p.d ** 2 - p.dInt ** 2);
      const I = (Math.PI / 64) * (p.d ** 4 - p.dInt ** 4);
      return { area_mm2: A, centroide: { x_mm: 0, y_mm: 0 }, Ix_mm4: I, Iy_mm4: I, Ixy_mm4: 0, rx_mm: Math.sqrt(I / A), ry_mm: Math.sqrt(I / A), I1_mm4: I, I2_mm4: I, thetaPrincipal_deg: 0, esSimetrica: true };
    }
    case 'rectangular': {
      if (!p.b || !p.h) throw new Error('Base y altura requeridas.');
      const props = propiedadesDeRectangulos([{ ancho: p.b, alto: p.h, cx: 0, cy: 0 }]);
      return { ...props, esSimetrica: true };
    }
    case 'rectangular_tubular': {
      if (!p.b || !p.h || !p.bInt || !p.hInt || p.bInt >= p.b || p.hInt >= p.h) {
        throw new Error('Dimensiones interiores deben ser menores que las exteriores.');
      }
      const areaExt = p.b * p.h;
      const areaInt = p.bInt * p.hInt;
      const Ix = (p.b * p.h ** 3) / 12 - (p.bInt * p.hInt ** 3) / 12;
      const Iy = (p.h * p.b ** 3) / 12 - (p.hInt * p.bInt ** 3) / 12;
      const A = areaExt - areaInt;
      return { area_mm2: A, centroide: { x_mm: 0, y_mm: 0 }, Ix_mm4: Ix, Iy_mm4: Iy, Ixy_mm4: 0, rx_mm: Math.sqrt(Ix / A), ry_mm: Math.sqrt(Iy / A), I1_mm4: Math.max(Ix, Iy), I2_mm4: Math.min(Ix, Iy), thetaPrincipal_deg: 0, esSimetrica: true };
    }
    case 'perfil_I': {
      const { bf, tf, hw, tw } = p;
      if (!bf || !tf || !hw || !tw) throw new Error('Faltan dimensiones del perfil I.');
      const rects: Rectangulo[] = [
        { ancho: bf, alto: tf, cx: 0, cy: hw / 2 + tf / 2 },
        { ancho: tw, alto: hw, cx: 0, cy: 0 },
        { ancho: bf, alto: tf, cx: 0, cy: -(hw / 2 + tf / 2) },
      ];
      const props = propiedadesDeRectangulos(rects);
      return { ...props, esSimetrica: true };
    }
    case 'perfil_T': {
      const { bf, tf, hw, tw } = p;
      if (!bf || !tf || !hw || !tw) throw new Error('Faltan dimensiones del perfil T.');
      // Origen de referencia: borde superior del ala. y crece hacia arriba.
      const rects: Rectangulo[] = [
        { ancho: bf, alto: tf, cx: 0, cy: -tf / 2 },
        { ancho: tw, alto: hw, cx: 0, cy: -(tf + hw / 2) },
      ];
      const props = propiedadesDeRectangulos(rects);
      return { ...props, esSimetrica: true }; // simétrica respecto al eje vertical (Ixy = 0), no respecto al horizontal
    }
    case 'perfil_L': {
      const { bL, hL, tw } = p;
      if (!bL || !hL || !tw) throw new Error('Faltan dimensiones del perfil L.');
      if (tw >= bL || tw >= hL) throw new Error('El espesor debe ser menor que ambas alas.');
      // Origen de referencia: esquina exterior donde se unen las dos alas.
      const rects: Rectangulo[] = [
        { ancho: bL, alto: tw, cx: bL / 2, cy: tw / 2 }, // ala horizontal
        { ancho: tw, alto: hL - tw, cx: tw / 2, cy: tw + (hL - tw) / 2 }, // ala vertical (sin solapar la esquina)
      ];
      const props = propiedadesDeRectangulos(rects);
      return { ...props, esSimetrica: false }; // asimétrica: Ixy ≠ 0, ejes principales rotados
    }
    default:
      throw new Error('Tipo de sección no soportado.');
  }
}

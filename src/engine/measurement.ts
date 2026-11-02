import type { EspecificacionInstrumento, LecturaInstrumento } from './types';
import { ruidoUnitario } from './prng';

/**
 * Motor de instrumentación virtual. Separado por completo del modelo físico:
 * recibe una magnitud "verdadera" calculada por el motor mecánico y produce
 * una lectura con las limitaciones de un instrumento real (rango, resolución,
 * error de cero, incertidumbre). La variación sintética es pequeña, se deriva
 * de una semilla y es reproducible: la misma semilla + instrumento + punto
 * siempre da la misma lectura.
 */

export interface OpcionesLectura {
  /** Semilla del ensayo (determina la reproducibilidad de todas las lecturas). */
  semillaEnsayo: number;
  /** Índice del punto de medición dentro del ensayo. */
  indicePunto: number;
  /** Si el instrumento fue puesto a cero antes del ensayo (etapa de instrumentación). */
  calibrado: boolean;
}

function redondearAResolucion(valor: number, resolucion: number): number {
  if (resolucion <= 0) return valor;
  return Math.round(valor / resolucion) * resolucion;
}

export function medir(
  valorVerdadero: number,
  spec: EspecificacionInstrumento,
  opciones: OpcionesLectura,
): LecturaInstrumento {
  const advertencias: string[] = [];
  const [min, max] = spec.rango;

  if (valorVerdadero < min || valorVerdadero > max) {
    return {
      valor: null,
      unidad: spec.unidad,
      incertidumbre: 0,
      fueraDeRango: true,
      advertencias: [
        `${spec.nombre}: la magnitud (${valorVerdadero.toFixed(3)} ${spec.unidad}) excede el rango del instrumento ` +
          `[${min}, ${max}] ${spec.unidad}. El instrumento satura; reduzca la carga o elija un instrumento de mayor rango.`,
      ],
    };
  }

  // Error de cero: offset reproducible, fijo mientras el instrumento no se recalibra.
  const fondoEscala = Math.max(Math.abs(max), Math.abs(min));
  const errorCero = opciones.calibrado
    ? 0
    : ruidoUnitario(`cero:${spec.id}:${opciones.semillaEnsayo}`) * (spec.errorCeroMax_pct / 100) * fondoEscala;

  // Incertidumbre de medición: variación pequeña y reproducible proporcional a la lectura
  // (o a una fracción del fondo de escala cuando la lectura es muy pequeña, para evitar un
  // "ruido" irreal nulo cerca de cero).
  const referenciaIncertidumbre = Math.max(Math.abs(valorVerdadero), 0.02 * fondoEscala);
  const incertidumbre = (spec.incertidumbre_pct / 100) * referenciaIncertidumbre;
  const variacion = ruidoUnitario(`lectura:${spec.id}:${opciones.semillaEnsayo}:${opciones.indicePunto}`) * incertidumbre;

  const lecturaCruda = valorVerdadero + errorCero + variacion;
  const valor = redondearAResolucion(lecturaCruda, spec.resolucion);

  if (!opciones.calibrado) {
    advertencias.push(`${spec.nombre}: instrumento sin puesta a cero; la lectura puede incluir un error de cero.`);
  }
  if (Math.abs(valorVerdadero) > 0.9 * fondoEscala) {
    advertencias.push(`${spec.nombre}: la lectura está cerca del límite del rango (${min} a ${max} ${spec.unidad}).`);
  }

  return { valor, unidad: spec.unidad, incertidumbre, fueraDeRango: false, advertencias };
}

/** Biblioteca de instrumentos virtuales usados por los distintos bancos. */
export const INSTRUMENTOS: Record<string, EspecificacionInstrumento> = {
  celdaCarga50kN: {
    id: 'celda-carga-50kn',
    nombre: 'Celda de carga 50 kN',
    magnitud: 'fuerza axial',
    unidad: 'N',
    rango: [0, 50000],
    resolucion: 5,
    errorCeroMax_pct: 0.1,
    incertidumbre_pct: 0.5,
  },
  celdaCarga200kN: {
    id: 'celda-carga-200kn',
    nombre: 'Celda de carga 200 kN',
    magnitud: 'fuerza axial',
    unidad: 'N',
    rango: [0, 200000],
    resolucion: 20,
    errorCeroMax_pct: 0.1,
    incertidumbre_pct: 0.5,
  },
  celdaCarga1000kN: {
    id: 'celda-carga-1000kn',
    nombre: 'Celda de carga 1000 kN',
    magnitud: 'fuerza axial',
    unidad: 'N',
    rango: [0, 1000000],
    resolucion: 100,
    errorCeroMax_pct: 0.1,
    incertidumbre_pct: 0.5,
  },
  comparadorDigital25mm: {
    id: 'comparador-digital-25mm',
    nombre: 'Comparador digital (±25 mm)',
    magnitud: 'desplazamiento axial',
    unidad: 'mm',
    rango: [-25, 25],
    resolucion: 0.01,
    errorCeroMax_pct: 0.2,
    incertidumbre_pct: 1.0,
  },
  comparadorLateral10mm: {
    id: 'comparador-lateral-10mm',
    nombre: 'Comparador lateral (±10 mm)',
    magnitud: 'deflexión lateral',
    unidad: 'mm',
    rango: [-10, 10],
    resolucion: 0.01,
    errorCeroMax_pct: 0.2,
    incertidumbre_pct: 1.5,
  },
  extensometroTransversal: {
    id: 'extensometro-transversal',
    nombre: 'Extensómetro transversal',
    magnitud: 'deformación transversal',
    unidad: 'mm/mm',
    rango: [-0.05, 0.05],
    resolucion: 0.00001,
    errorCeroMax_pct: 0.3,
    incertidumbre_pct: 2.0,
  },
};

/**
 * Selecciona, de entre las celdas de carga disponibles, la de menor rango que
 * aún cubra la fuerza máxima esperada del ensayo (con un margen de seguridad).
 * Evita que una probeta de sección grande o material resistente sature
 * sistemáticamente un instrumento de bajo rango.
 */
export function elegirCeldaCarga(fuerzaMaxima_N: number): EspecificacionInstrumento {
  const celdas = [INSTRUMENTOS.celdaCarga50kN, INSTRUMENTOS.celdaCarga200kN, INSTRUMENTOS.celdaCarga1000kN];
  const objetivo = Math.abs(fuerzaMaxima_N) * 1.15;
  return celdas.find((c) => c.rango[1] >= objetivo) ?? celdas[celdas.length - 1];
}

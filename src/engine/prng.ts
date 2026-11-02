/**
 * Generador pseudoaleatorio determinista (mulberry32) usado para producir
 * variaciones sintéticas de medición reproducibles a partir de una semilla.
 * Nunca se usa Math.random() en el motor de medición: toda variación debe
 * poder reproducirse exactamente con la misma semilla.
 */
export function crearPRNG(semilla: number): () => number {
  let estado = semilla >>> 0;
  return function siguiente(): number {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deriva una semilla numérica estable a partir de una cadena (id de ensayo + instrumento + índice). */
export function semillaDesdeCadena(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Número pseudoaleatorio en [-1, 1] reproducible a partir de una cadena semilla. */
export function ruidoUnitario(claveSemilla: string): number {
  const rng = crearPRNG(semillaDesdeCadena(claveSemilla));
  return rng() * 2 - 1;
}

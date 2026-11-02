import type { SesionEnsayo } from '../engine/types';

export function descargarArchivo(nombre: string, contenido: string, tipoMime: string): void {
  const blob = new Blob([contenido], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sesionAJSON(sesion: SesionEnsayo): string {
  return JSON.stringify(sesion, null, 2);
}

export function exportarSesionJSON(sesion: SesionEnsayo): void {
  descargarArchivo(`${sesion.banco}-${sesion.id}.json`, sesionAJSON(sesion), 'application/json');
}

/** Aplana las mediciones de una sesión a una tabla CSV (una fila por punto). */
export function medicionesACSV(sesion: SesionEnsayo): string {
  if (sesion.mediciones.length === 0) return 'indice\n';
  const claves = Object.keys(sesion.mediciones[0].lecturas);
  const encabezado = ['indice', ...claves.map((k) => `${k}_valor`), ...claves.map((k) => `${k}_incertidumbre`)];
  const filas = sesion.mediciones.map((punto) => {
    const valores = claves.map((k) => punto.lecturas[k]?.valor ?? '');
    const incertidumbres = claves.map((k) => punto.lecturas[k]?.incertidumbre ?? '');
    return [punto.indice, ...valores, ...incertidumbres].join(',');
  });
  return [encabezado.join(','), ...filas].join('\n');
}

export function exportarMedicionesCSV(sesion: SesionEnsayo): void {
  descargarArchivo(`${sesion.banco}-mediciones-${sesion.id}.csv`, medicionesACSV(sesion), 'text/csv');
}

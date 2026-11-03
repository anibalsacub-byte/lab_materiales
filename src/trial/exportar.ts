import type { SesionEnsayo } from '../engine/types';

export function descargarArchivo(nombre: string, contenido: string, tipoMime: string): void {
  descargarBlob(nombre, new Blob([contenido], { type: tipoMime }));
}

function descargarBlob(nombre: string, blob: Blob): void {
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

/**
 * Exporta un gráfico SVG de la página como imagen PNG (a doble resolución). El SVG debe usar
 * colores literales: las variables CSS de la página no existen fuera de ella.
 */
export function exportarSvgComoPng(svgId: string, nombre: string, escala = 2): void {
  const svg = document.getElementById(svgId);
  if (!(svg instanceof SVGSVGElement)) return;
  const vb = svg.viewBox.baseVal;
  const ancho = vb && vb.width ? vb.width : svg.clientWidth;
  const alto = vb && vb.height ? vb.height : svg.clientHeight;
  const clon = svg.cloneNode(true) as SVGSVGElement;
  clon.setAttribute('width', String(ancho));
  clon.setAttribute('height', String(alto));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clon)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = ancho * escala;
    canvas.height = alto * escala;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.drawImage(img, 0, 0, ancho, alto);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) descargarBlob(nombre, blob);
    }, 'image/png');
  };
  img.src = url;
}

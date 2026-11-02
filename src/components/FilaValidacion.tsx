import type { ReactNode } from 'react';

interface Props {
  etiqueta: string;
  valorEstudiante: number | undefined;
  valorReferencia: number;
  unidad: string;
}

/** Umbrales de tolerancia para calificar el error porcentual frente al modelo de referencia. */
const TOLERANCIA_OK = 5; // %
const TOLERANCIA_ADVERTENCIA = 15; // %

export function FilaValidacion({ etiqueta, valorEstudiante, valorReferencia, unidad }: Props) {
  if (valorEstudiante === undefined || Number.isNaN(valorEstudiante)) {
    return (
      <tr>
        <td style={{ textAlign: 'left' }}>{etiqueta}</td>
        <td colSpan={3}>Sin valor introducido por el estudiante.</td>
      </tr>
    );
  }
  const errorPct = valorReferencia !== 0 ? (Math.abs(valorEstudiante - valorReferencia) / Math.abs(valorReferencia)) * 100 : Math.abs(valorEstudiante) * 100;
  const clase = errorPct <= TOLERANCIA_OK ? 'ok' : errorPct <= TOLERANCIA_ADVERTENCIA ? 'warn' : 'error';
  const mensaje = errorPct <= TOLERANCIA_OK ? 'Coherente' : errorPct <= TOLERANCIA_ADVERTENCIA ? 'Revisar' : 'Discrepante';

  return (
    <tr>
      <td style={{ textAlign: 'left' }}>{etiqueta}</td>
      <td>{valorEstudiante.toLocaleString('es-PE', { maximumFractionDigits: 4 })} {unidad}</td>
      <td>{valorReferencia.toLocaleString('es-PE', { maximumFractionDigits: 4 })} {unidad}</td>
      <td><span className={`chip ${clase}`}>{errorPct.toFixed(1)}% · {mensaje}</span></td>
    </tr>
  );
}

export function TablaValidacion({ children }: { children: ReactNode }) {
  return (
    <table className="tabla-datos">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Valor del estudiante</th>
          <th>Modelo de referencia</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

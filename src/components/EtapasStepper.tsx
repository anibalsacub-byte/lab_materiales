import type { EtapaEnsayo } from '../engine/types';
import { NOMBRE_ETAPA, ORDEN_ETAPAS } from '../trial/useSesionEnsayo';

interface Props {
  etapaActual: EtapaEnsayo;
  onIr: (etapa: EtapaEnsayo) => void;
}

export function EtapasStepper({ etapaActual, onIr }: Props) {
  const idxActual = ORDEN_ETAPAS.indexOf(etapaActual);
  return (
    <div className="stepper">
      {ORDEN_ETAPAS.map((etapa, idx) => (
        <button
          key={etapa}
          className={etapa === etapaActual ? 'activo' : idx < idxActual ? 'visitado' : ''}
          onClick={() => onIr(etapa)}
        >
          {NOMBRE_ETAPA[etapa]}
        </button>
      ))}
    </div>
  );
}

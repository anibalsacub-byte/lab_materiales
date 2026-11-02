import { useCallback, useState } from 'react';
import type { EtapaEnsayo, LecturaInstrumento, PrediccionTeorica, PuntoMedicion, SesionEnsayo } from '../engine/types';

export const ORDEN_ETAPAS: EtapaEnsayo[] = [
  'preparacion',
  'prediccion',
  'instrumentacion',
  'ejecucion',
  'registro',
  'calculo',
  'validacion',
  'interpretacion',
  'exportacion',
];

export const NOMBRE_ETAPA: Record<EtapaEnsayo, string> = {
  preparacion: '1. Preparación',
  prediccion: '2. Predicción',
  instrumentacion: '3. Instrumentación',
  ejecucion: '4. Ejecución',
  registro: '5. Registro',
  calculo: '6. Cálculo',
  validacion: '7. Validación',
  interpretacion: '8. Interpretación',
  exportacion: '9. Exportación',
};

function nuevaSesion(banco: string, materialId: string, semilla?: number): SesionEnsayo {
  return {
    id: `${banco}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    banco,
    semilla: semilla ?? Math.floor(Math.random() * 1e9),
    materialId,
    creado: new Date().toISOString(),
    etapaActual: 'preparacion',
    configuracion: {},
    predicciones: [],
    mediciones: [],
    calculosEstudiante: {},
    conclusiones: '',
    probetaDestruida: false,
  };
}

/**
 * Hook que administra el estado de una sesión de ensayo siguiendo las nueve
 * etapas del procedimiento experimental (preparación → exportación). Es
 * independiente del banco concreto: cada banco guarda su configuración
 * específica en `sesion.configuracion`.
 */
export function useSesionEnsayo(banco: string, materialIdInicial: string) {
  const [sesion, setSesion] = useState<SesionEnsayo>(() => nuevaSesion(banco, materialIdInicial));

  const irAEtapa = useCallback((etapa: EtapaEnsayo) => setSesion((s) => ({ ...s, etapaActual: etapa })), []);

  const avanzar = useCallback(() => {
    setSesion((s) => {
      const idx = ORDEN_ETAPAS.indexOf(s.etapaActual);
      if (idx < ORDEN_ETAPAS.length - 1) return { ...s, etapaActual: ORDEN_ETAPAS[idx + 1] };
      return s;
    });
  }, []);

  const retroceder = useCallback(() => {
    setSesion((s) => {
      const idx = ORDEN_ETAPAS.indexOf(s.etapaActual);
      if (idx > 0) return { ...s, etapaActual: ORDEN_ETAPAS[idx - 1] };
      return s;
    });
  }, []);

  const actualizarConfiguracion = useCallback((cfg: Record<string, unknown>) => {
    setSesion((s) => ({ ...s, configuracion: { ...s.configuracion, ...cfg } }));
  }, []);

  const setMaterial = useCallback((materialId: string) => {
    setSesion((s) => ({ ...s, materialId }));
  }, []);

  const registrarPrediccion = useCallback((pred: PrediccionTeorica) => {
    setSesion((s) => ({
      ...s,
      predicciones: [...s.predicciones.filter((p) => p.variable !== pred.variable), pred],
    }));
  }, []);

  const agregarMedicion = useCallback((lecturas: Record<string, LecturaInstrumento>) => {
    setSesion((s) => {
      const punto: PuntoMedicion = {
        id: `${s.id}-p${s.mediciones.length}`,
        indice: s.mediciones.length,
        timestampSimulado: s.mediciones.length,
        lecturas,
      };
      return { ...s, mediciones: [...s.mediciones, punto] };
    });
  }, []);

  const borrarMediciones = useCallback(() => setSesion((s) => ({ ...s, mediciones: [] })), []);

  const registrarCalculo = useCallback((variable: string, valor: number) => {
    setSesion((s) => ({ ...s, calculosEstudiante: { ...s.calculosEstudiante, [variable]: valor } }));
  }, []);

  const registrarConclusiones = useCallback((texto: string) => {
    setSesion((s) => ({ ...s, conclusiones: texto }));
  }, []);

  const marcarProbetaDestruida = useCallback(() => setSesion((s) => ({ ...s, probetaDestruida: true })), []);

  const reiniciarEnsayo = useCallback((materialId?: string) => {
    setSesion((s) => nuevaSesion(s.banco, materialId ?? s.materialId));
  }, []);

  return {
    sesion,
    irAEtapa,
    avanzar,
    retroceder,
    actualizarConfiguracion,
    setMaterial,
    registrarPrediccion,
    agregarMedicion,
    borrarMediciones,
    registrarCalculo,
    registrarConclusiones,
    marcarProbetaDestruida,
    reiniciarEnsayo,
  };
}

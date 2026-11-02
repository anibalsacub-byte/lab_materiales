import { useMemo, useState } from 'react';
import { analizarMohr, transformarEsfuerzo, type EstadoEsfuerzoPlano } from '../../engine/mechanics/mohr';
import { CirculoMohr, ElementoEsfuerzo } from './MohrSVG';

export function MohrStation({ onVolver }: { onVolver: () => void }) {
  const [sigmaX, setSigmaX] = useState(80);
  const [sigmaY, setSigmaY] = useState(20);
  const [tauXY, setTauXY] = useState(30);
  const [theta, setTheta] = useState(0);

  const estado: EstadoEsfuerzoPlano = { sigmaX_MPa: sigmaX, sigmaY_MPa: sigmaY, tauXY_MPa: tauXY };
  const resultado = useMemo(() => analizarMohr(estado), [sigmaX, sigmaY, tauXY]);
  const transformado = useMemo(() => transformarEsfuerzo(estado, theta), [sigmaX, sigmaY, tauXY, theta]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Estación B — Círculo de Mohr</div>
          <div className="subtitulo">Transformación de esfuerzos planos y esfuerzos principales.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <div className="banco-grid">
        <div className="zona-a panel">
          <div className="zona-etiqueta">Estado de esfuerzo plano</div>
          <div className="campo"><label>σx (MPa)</label><input type="number" value={sigmaX} onChange={(e) => setSigmaX(Number(e.target.value))} /></div>
          <div className="campo"><label>σy (MPa)</label><input type="number" value={sigmaY} onChange={(e) => setSigmaY(Number(e.target.value))} /></div>
          <div className="campo"><label>τxy (MPa)</label><input type="number" value={tauXY} onChange={(e) => setTauXY(Number(e.target.value))} /></div>
          <hr className="separador" />
          <div className="campo">
            <label>Ángulo de rotación del elemento θ = {theta.toFixed(1)}°</label>
            <input type="range" min={-90} max={90} step={0.5} value={theta} onChange={(e) => setTheta(Number(e.target.value))} />
          </div>
          <p className="nota">
            Convención: σ positivo en tracción; τxy positivo según la convención estándar de mecánica de materiales
            (en el círculo, τ se traza positivo hacia abajo para la cara x). θ se mide antihorario en el elemento
            físico; en el círculo, un giro antihorario θ corresponde a un giro horario 2θ.
          </p>
        </div>

        <div className="zona-b panel">
          <div className="zona-etiqueta">Elemento girado</div>
          <ElementoEsfuerzo estado={estado} thetaDeg={theta} />
        </div>

        <div className="zona-c panel">
          <div className="zona-etiqueta">Esfuerzos transformados en θ</div>
          <table className="tabla-datos">
            <tbody>
              <tr><td style={{ textAlign: 'left' }}>σx'</td><td>{transformado.sigmaX_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>σy'</td><td>{transformado.sigmaY_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>τx'y'</td><td>{transformado.tauXY_MPa.toFixed(2)} MPa</td></tr>
            </tbody>
          </table>
        </div>

        <div className="zona-d panel">
          <div className="zona-etiqueta">Círculo de Mohr y resultados</div>
          <CirculoMohr estado={estado} resultado={resultado} thetaDeg={theta} />
          <table className="tabla-datos">
            <tbody>
              <tr><td style={{ textAlign: 'left' }}>Esfuerzo promedio</td><td>{resultado.promedio_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>Radio del círculo</td><td>{resultado.radio_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>σ1 (principal máximo)</td><td>{resultado.sigma1_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>σ2 (principal mínimo)</td><td>{resultado.sigma2_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>τ máximo en el plano</td><td>{resultado.tauMax_MPa.toFixed(2)} MPa</td></tr>
              <tr><td style={{ textAlign: 'left' }}>θp1 (hacia σ1)</td><td>{resultado.thetaP1_deg.toFixed(2)}°</td></tr>
              <tr><td style={{ textAlign: 'left' }}>θp2 (hacia σ2)</td><td>{resultado.thetaP2_deg.toFixed(2)}°</td></tr>
              <tr><td style={{ textAlign: 'left' }}>θ de τ máximo</td><td>{resultado.thetaCortanteMax_deg.toFixed(2)}°</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

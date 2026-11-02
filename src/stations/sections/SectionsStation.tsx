import { useMemo, useState } from 'react';
import { calcularSeccion, type ParametrosSeccion, type TipoSeccion } from '../../engine/sections';
import { SectionSVG } from './SectionSVG';

const NOMBRES_TIPO: Record<TipoSeccion, string> = {
  circular_maciza: 'Circular maciza',
  circular_tubular: 'Circular tubular',
  rectangular: 'Rectangular',
  rectangular_tubular: 'Rectangular tubular',
  perfil_I: 'Perfil I',
  perfil_T: 'Perfil T',
  perfil_L: 'Perfil L (ángulo)',
};

const VALORES_INICIALES: Record<TipoSeccion, ParametrosSeccion> = {
  circular_maciza: { tipo: 'circular_maciza', d: 40 },
  circular_tubular: { tipo: 'circular_tubular', d: 40, dInt: 28 },
  rectangular: { tipo: 'rectangular', b: 50, h: 100 },
  rectangular_tubular: { tipo: 'rectangular_tubular', b: 60, h: 100, bInt: 44, hInt: 84 },
  perfil_I: { tipo: 'perfil_I', bf: 100, tf: 10, hw: 180, tw: 8 },
  perfil_T: { tipo: 'perfil_T', bf: 100, tf: 10, hw: 90, tw: 10 },
  perfil_L: { tipo: 'perfil_L', bL: 80, hL: 40, tw: 6 },
};

function CampoNumero({ etiqueta, valor, onChange }: { etiqueta: string; valor: number; onChange: (v: number) => void }) {
  return (
    <div className="campo">
      <label>{etiqueta} (mm)</label>
      <input type="number" value={valor} min={1} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function SectionsStation({ onVolver }: { onVolver: () => void }) {
  const [tipo, setTipo] = useState<TipoSeccion>('rectangular');
  const [parametros, setParametros] = useState<ParametrosSeccion>(VALORES_INICIALES.rectangular);

  function cambiarTipo(nuevo: TipoSeccion) {
    setTipo(nuevo);
    setParametros(VALORES_INICIALES[nuevo]);
  }

  const resultado = useMemo(() => {
    try {
      return { props: calcularSeccion(parametros), error: null as string | null };
    } catch (e) {
      return { props: null, error: (e as Error).message };
    }
  }, [parametros]);

  function set<K extends keyof ParametrosSeccion>(campo: K, valor: number) {
    setParametros((p) => ({ ...p, [campo]: valor }));
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="titulo">Estación A — Propiedades geométricas de secciones</div>
          <div className="subtitulo">Área, centroide, momentos de inercia, radios de giro y ejes principales.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <div className="banco-grid">
        <div className="zona-a panel">
          <div className="zona-etiqueta">Geometría</div>
          <div className="campo">
            <label>Tipo de sección</label>
            <select value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoSeccion)}>
              {Object.entries(NOMBRES_TIPO).map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}
            </select>
          </div>

          {tipo === 'circular_maciza' && <CampoNumero etiqueta="Diámetro d" valor={parametros.d ?? 0} onChange={(v) => set('d', v)} />}
          {tipo === 'circular_tubular' && (
            <>
              <CampoNumero etiqueta="Diámetro exterior d" valor={parametros.d ?? 0} onChange={(v) => set('d', v)} />
              <CampoNumero etiqueta="Diámetro interior" valor={parametros.dInt ?? 0} onChange={(v) => set('dInt', v)} />
            </>
          )}
          {tipo === 'rectangular' && (
            <>
              <CampoNumero etiqueta="Base b" valor={parametros.b ?? 0} onChange={(v) => set('b', v)} />
              <CampoNumero etiqueta="Altura h" valor={parametros.h ?? 0} onChange={(v) => set('h', v)} />
            </>
          )}
          {tipo === 'rectangular_tubular' && (
            <>
              <CampoNumero etiqueta="Base exterior b" valor={parametros.b ?? 0} onChange={(v) => set('b', v)} />
              <CampoNumero etiqueta="Altura exterior h" valor={parametros.h ?? 0} onChange={(v) => set('h', v)} />
              <CampoNumero etiqueta="Base interior" valor={parametros.bInt ?? 0} onChange={(v) => set('bInt', v)} />
              <CampoNumero etiqueta="Altura interior" valor={parametros.hInt ?? 0} onChange={(v) => set('hInt', v)} />
            </>
          )}
          {(tipo === 'perfil_I' || tipo === 'perfil_T') && (
            <>
              <CampoNumero etiqueta="Ancho del ala bf" valor={parametros.bf ?? 0} onChange={(v) => set('bf', v)} />
              <CampoNumero etiqueta="Espesor del ala tf" valor={parametros.tf ?? 0} onChange={(v) => set('tf', v)} />
              <CampoNumero etiqueta="Altura del alma hw" valor={parametros.hw ?? 0} onChange={(v) => set('hw', v)} />
              <CampoNumero etiqueta="Espesor del alma tw" valor={parametros.tw ?? 0} onChange={(v) => set('tw', v)} />
            </>
          )}
          {tipo === 'perfil_L' && (
            <>
              <CampoNumero etiqueta="Ala horizontal bL" valor={parametros.bL ?? 0} onChange={(v) => set('bL', v)} />
              <CampoNumero etiqueta="Ala vertical hL" valor={parametros.hL ?? 0} onChange={(v) => set('hL', v)} />
              <CampoNumero etiqueta="Espesor tw" valor={parametros.tw ?? 0} onChange={(v) => set('tw', v)} />
            </>
          )}
          {resultado.error && <p className="advertencia">{resultado.error}</p>}
        </div>

        <div className="zona-b panel" style={{ gridRow: '1 / span 2' }}>
          <div className="zona-etiqueta">Representación</div>
          {resultado.props && <SectionSVG p={parametros} props={resultado.props} />}
        </div>

        <div className="zona-d panel" style={{ gridColumn: 3, gridRow: '1 / span 2' }}>
          <div className="zona-etiqueta">Propiedades calculadas</div>
          {resultado.props && (
            <table className="tabla-datos">
              <tbody>
                <tr><td style={{ textAlign: 'left' }}>Área</td><td>{resultado.props.area_mm2.toFixed(2)} mm²</td></tr>
                <tr><td style={{ textAlign: 'left' }}>Centroide (x, y)</td><td>({resultado.props.centroide.x_mm.toFixed(2)}, {resultado.props.centroide.y_mm.toFixed(2)}) mm</td></tr>
                <tr><td style={{ textAlign: 'left' }}>Ix</td><td>{resultado.props.Ix_mm4.toExponential(3)} mm⁴</td></tr>
                <tr><td style={{ textAlign: 'left' }}>Iy</td><td>{resultado.props.Iy_mm4.toExponential(3)} mm⁴</td></tr>
                <tr><td style={{ textAlign: 'left' }}>Ixy</td><td>{resultado.props.Ixy_mm4.toExponential(3)} mm⁴</td></tr>
                <tr><td style={{ textAlign: 'left' }}>rx</td><td>{resultado.props.rx_mm.toFixed(2)} mm</td></tr>
                <tr><td style={{ textAlign: 'left' }}>ry</td><td>{resultado.props.ry_mm.toFixed(2)} mm</td></tr>
                <tr><td style={{ textAlign: 'left' }}>I principal 1</td><td>{resultado.props.I1_mm4.toExponential(3)} mm⁴</td></tr>
                <tr><td style={{ textAlign: 'left' }}>I principal 2</td><td>{resultado.props.I2_mm4.toExponential(3)} mm⁴</td></tr>
                <tr><td style={{ textAlign: 'left' }}>θ principal</td><td>{resultado.props.thetaPrincipal_deg.toFixed(2)}°</td></tr>
              </tbody>
            </table>
          )}
          <hr className="separador" />
          <p className="nota">
            Ix rige la flexión respecto al eje horizontal (relevante para el Banco de Flexión); el menor de Ix, Iy
            gobierna el pandeo por el eje débil (relevante para el Banco de Pandeo).
          </p>
        </div>
      </div>
    </div>
  );
}

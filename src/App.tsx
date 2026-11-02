import { useState } from 'react';
import { CompressionBench } from './benches/compression/CompressionBench';
import { BucklingBench } from './benches/buckling/BucklingBench';
import { SectionsStation } from './stations/sections/SectionsStation';
import { MohrStation } from './stations/mohr/MohrStation';

type Vista =
  | 'catalogo'
  | 'banco-traccion'
  | 'banco-compresion'
  | 'banco-flexion'
  | 'banco-cortante'
  | 'banco-torsion'
  | 'banco-pandeo'
  | 'banco-uniones'
  | 'banco-presion'
  | 'estacion-secciones'
  | 'estacion-mohr';

interface ItemCatalogo {
  vista: Vista;
  nombre: string;
  descripcion: string;
  disponible: boolean;
}

const BANCOS: ItemCatalogo[] = [
  { vista: 'banco-traccion', nombre: 'Banco 1 — Tracción', descripcion: 'Ensayo de tracción uniaxial. Próxima etapa.', disponible: false },
  { vista: 'banco-compresion', nombre: 'Banco 2 — Compresión', descripcion: 'Compresión axial, módulo elástico y Poisson.', disponible: true },
  { vista: 'banco-flexion', nombre: 'Banco 3 — Flexión', descripcion: 'Vigas, diagramas V-M y deflexión. Próxima etapa.', disponible: false },
  { vista: 'banco-cortante', nombre: 'Banco 4 — Cortante', descripcion: 'Cortante simple y doble. Próxima etapa.', disponible: false },
  { vista: 'banco-torsion', nombre: 'Banco 5 — Torsión', descripcion: 'Torsión de ejes circulares. Próxima etapa.', disponible: false },
  { vista: 'banco-pandeo', nombre: 'Banco 6 — Pandeo de columnas', descripcion: 'Carga crítica de Euler, esbeltez y factor de seguridad.', disponible: true },
  { vista: 'banco-uniones', nombre: 'Banco 7 — Uniones mecánicas', descripcion: 'Pernos, pasadores y placas. Próxima etapa.', disponible: false },
  { vista: 'banco-presion', nombre: 'Banco 8 — Recipientes a presión', descripcion: 'Pared delgada, esfuerzos circunferencial y longitudinal. Próxima etapa.', disponible: false },
];

const ESTACIONES: ItemCatalogo[] = [
  { vista: 'estacion-secciones', nombre: 'Estación A — Propiedades geométricas', descripcion: 'Área, centroide, momentos de inercia y ejes principales.', disponible: true },
  { vista: 'estacion-mohr', nombre: 'Estación B — Círculo de Mohr', descripcion: 'Transformación de esfuerzos y esfuerzos principales.', disponible: true },
];

function Tarjeta({ item, onSeleccionar }: { item: ItemCatalogo; onSeleccionar: (v: Vista) => void }) {
  return (
    <div
      className={`tarjeta ${item.disponible ? '' : 'deshabilitada'}`}
      onClick={() => item.disponible && onSeleccionar(item.vista)}
    >
      <div className="etiqueta">{item.disponible ? 'Disponible' : 'Próximamente'}</div>
      <h3>{item.nombre}</h3>
      <p className="desc">{item.descripcion}</p>
    </div>
  );
}

export default function App() {
  const [vista, setVista] = useState<Vista>('catalogo');
  const volver = () => setVista('catalogo');

  if (vista === 'banco-compresion') return <div className="app-shell"><CompressionBench onVolver={volver} /></div>;
  if (vista === 'banco-pandeo') return <div className="app-shell"><BucklingBench onVolver={volver} /></div>;
  if (vista === 'estacion-secciones') return <div className="app-shell"><SectionsStation onVolver={volver} /></div>;
  if (vista === 'estacion-mohr') return <div className="app-shell"><MohrStation onVolver={volver} /></div>;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="titulo">Laboratorio Virtual de Resistencia de Materiales</div>
          <div className="subtitulo">Universidad Andina del Cusco · Ingeniería Industrial · IND011</div>
        </div>
      </div>

      <div className="catalogo-grupo">
        <h2>Bancos de ensayo</h2>
        <div className="catalogo-grid">
          {BANCOS.map((b) => <Tarjeta key={b.vista} item={b} onSeleccionar={setVista} />)}
        </div>
      </div>

      <div className="catalogo-grupo">
        <h2>Estaciones de análisis</h2>
        <div className="catalogo-grid">
          {ESTACIONES.map((e) => <Tarjeta key={e.vista} item={e} onSeleccionar={setVista} />)}
        </div>
      </div>

      <p className="nota">
        Primera etapa de implementación (núcleo + tercera unidad): biblioteca de materiales, sistema de medición
        virtual, banco de compresión, banco de pandeo y las dos estaciones de análisis. Todas las lecturas mostradas
        son mediciones virtuales generadas por simulación, no datos de un equipo físico.
      </p>
    </div>
  );
}

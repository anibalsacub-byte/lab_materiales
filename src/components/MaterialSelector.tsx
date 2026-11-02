import { CATEGORIAS_MATERIAL, MATERIALES, moduloCorte } from '../engine/materials';
import type { Material } from '../engine/types';

interface Props {
  materialId: string;
  onChange: (id: string) => void;
  incluirDesconocidos?: boolean;
  soloIsotropicos?: boolean;
}

function filaPropiedad(etiqueta: string, valor: number | undefined, unidad: string) {
  return (
    <tr>
      <td style={{ textAlign: 'left' }}>{etiqueta}</td>
      <td>{valor === undefined ? '— no disponible' : `${valor.toLocaleString('es-PE', { maximumFractionDigits: 4 })} ${unidad}`}</td>
    </tr>
  );
}

export function FichaMaterial({ material }: { material: Material }) {
  const G = moduloCorte(material);
  return (
    <div>
      <h3>{material.nombre}{material.condicion ? ` — ${material.condicion}` : ''}</h3>
      <table className="tabla-datos" style={{ marginBottom: 6 }}>
        <tbody>
          {filaPropiedad('Densidad', material.propiedades.densidad_kg_m3, 'kg/m³')}
          {filaPropiedad('Módulo de Young E', material.propiedades.E_MPa, 'MPa')}
          {filaPropiedad('Relación de Poisson ν', material.propiedades.nu, '')}
          {filaPropiedad('Módulo de corte G', G, 'MPa')}
          {filaPropiedad('Límite de fluencia σY', material.propiedades.sigmaY_MPa, 'MPa')}
          {filaPropiedad('Resistencia última σU', material.propiedades.sigmaU_MPa, 'MPa')}
          {filaPropiedad('Deformación a fractura εF', material.propiedades.epsilonF, '')}
        </tbody>
      </table>
      <p className="nota">Fuente: {material.fuente}</p>
      {material.notas && <p className="nota">{material.notas}</p>}
    </div>
  );
}

export function MaterialSelector({ materialId, onChange, incluirDesconocidos, soloIsotropicos }: Props) {
  const disponibles = MATERIALES.filter((m) => {
    if (!incluirDesconocidos && m.esDesconocido) return false;
    if (soloIsotropicos && m.esOrtotropico) return false;
    return true;
  });
  const categorias = Array.from(new Set(disponibles.map((m) => m.categoria)));
  const material = disponibles.find((m) => m.id === materialId) ?? disponibles[0];

  return (
    <div className="campo">
      <label htmlFor="selector-material">Material</label>
      <select id="selector-material" value={material?.id} onChange={(e) => onChange(e.target.value)}>
        {categorias.map((cat) => (
          <optgroup key={cat} label={CATEGORIAS_MATERIAL[cat]}>
            {disponibles
              .filter((m) => m.categoria === cat)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}{m.condicion ? ` (${m.condicion})` : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {material && !material.esDesconocido && <FichaMaterial material={material} />}
      {material?.esDesconocido && <p className="nota">Probeta de identificación: sus propiedades se revelan solo en la etapa de validación.</p>}
    </div>
  );
}

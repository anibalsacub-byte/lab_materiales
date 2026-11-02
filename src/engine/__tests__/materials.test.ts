import { describe, it, expect } from 'vitest';
import { MATERIALES, obtenerMaterial, propiedadDisponible, moduloCorte, CATEGORIAS_MATERIAL } from '../materials';

describe('Biblioteca de materiales', () => {
  it('contiene al menos 20 materiales identificados', () => {
    expect(MATERIALES.length).toBeGreaterThanOrEqual(20);
  });

  it('cubre todas las categorías requeridas', () => {
    const categorias = new Set(MATERIALES.map((m) => m.categoria));
    for (const clave of Object.keys(CATEGORIAS_MATERIAL)) {
      expect(categorias.has(clave as never)).toBe(true);
    }
  });

  it('todo material tiene fuente documentada', () => {
    for (const m of MATERIALES) {
      expect(m.fuente).toBeTruthy();
    }
  });

  it('todo id es único', () => {
    const ids = MATERIALES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('obtenerMaterial encuentra por id y devuelve undefined si no existe', () => {
    expect(obtenerMaterial('astm-a36')?.nombre).toBe('Acero ASTM A36');
    expect(obtenerMaterial('no-existe')).toBeUndefined();
  });

  it('la fundición gris no declara límite de fluencia (material frágil)', () => {
    const fundicion = obtenerMaterial('fundicion-gris-clase30')!;
    expect(propiedadDisponible(fundicion, 'sigmaY_MPa')).toBe(false);
  });

  it('módulo de corte se deriva de E y ν cuando no está dado explícitamente (material isótropo)', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const G = moduloCorte(a36)!;
    const esperado = a36.propiedades.E_MPa! / (2 * (1 + a36.propiedades.nu!));
    expect(G).toBeCloseTo(esperado, 6);
  });

  it('un compuesto ortótropo no deriva G isótropo si no se da G12 (evita inventar datos)', () => {
    const cfrp = obtenerMaterial('cfrp-ud')!;
    expect(moduloCorte(cfrp)).toBe(cfrp.propiedades.G12_MPa);
  });

  it('las probetas desconocidas están marcadas como tales', () => {
    const desconocidas = MATERIALES.filter((m) => m.esDesconocido);
    expect(desconocidas.length).toBeGreaterThanOrEqual(2);
  });
});

// Unit test for the grade → age-category mapping used by the class roster.
// Pure function, no DB — guards the seed convention (students.grade = los 13
// grados reales de CIDMI, más el literal 'Sin grado') against the grouping
// convention (CIDMI arma categorías por pares de grados: U8…U18).

import { describe, expect, it } from 'vitest';
import { categoryForGrade, CATEGORY_ORDER } from '@/lib/categories';

describe('categoryForGrade', () => {
  it('maps grades in pairs, the way CIDMI builds its categories', () => {
    expect(categoryForGrade('Kinder')).toBe('U8');
    expect(categoryForGrade('1ero')).toBe('U8');
    expect(categoryForGrade('2do')).toBe('U8');

    expect(categoryForGrade('3ero')).toBe('U10');
    expect(categoryForGrade('4to')).toBe('U10');

    expect(categoryForGrade('5to')).toBe('U12');
    expect(categoryForGrade('6to')).toBe('U12');

    expect(categoryForGrade('7mo')).toBe('U14');
    expect(categoryForGrade('8vo')).toBe('U14');

    expect(categoryForGrade('9no')).toBe('U16');
    expect(categoryForGrade('10mo')).toBe('U16');

    expect(categoryForGrade('11vo')).toBe('U18');
    expect(categoryForGrade('12vo')).toBe('U18');
  });

  it('maps the Sprint 3 "Sin grado" placeholder to Otros', () => {
    // students.grade es NOT NULL: los ~39 niños que el roster no trae con grado
    // entran con este literal. Tienen que verse en la lista, agrupados en Otros.
    expect(categoryForGrade('Sin grado')).toBe('Otros');
  });

  it('falls back to "Otros" for unknown / empty grades', () => {
    expect(categoryForGrade('13vo')).toBe('Otros'); // no existe
    expect(categoryForGrade('U16')).toBe('Otros'); // not a real grade key
    expect(categoryForGrade('')).toBe('Otros');
    expect(categoryForGrade(null)).toBe('Otros');
    expect(categoryForGrade(undefined)).toBe('Otros');
  });

  it('CATEGORY_ORDER lists the mapped categories in age order, then Otros', () => {
    expect(CATEGORY_ORDER).toEqual(['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'Otros']);
  });

  it('every mapped category is in CATEGORY_ORDER (si no, el grupo no se renderiza)', () => {
    const grades = ['Kinder', '1ero', '2do', '3ero', '4to', '5to', '6to',
                    '7mo', '8vo', '9no', '10mo', '11vo', '12vo', 'Sin grado'];
    for (const g of grades) {
      expect(CATEGORY_ORDER).toContain(categoryForGrade(g));
    }
  });
});

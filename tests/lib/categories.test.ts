// Unit test for the grade → age-category mapping used by the class roster.
// Pure function, no DB — guards the seed convention (students.grade =
// 7mo/9no/11vo) against the grouping convention (U14/U16/U18).

import { describe, expect, it } from 'vitest';
import { categoryForGrade, CATEGORY_ORDER } from '@/lib/categories';

describe('categoryForGrade', () => {
  it('maps the real seed grades to age categories', () => {
    expect(categoryForGrade('7mo')).toBe('U14');
    expect(categoryForGrade('9no')).toBe('U16');
    expect(categoryForGrade('11vo')).toBe('U18');
  });

  it('falls back to "Otros" for unknown / empty grades', () => {
    expect(categoryForGrade('5to')).toBe('Otros');
    expect(categoryForGrade('U16')).toBe('Otros'); // not a real grade key
    expect(categoryForGrade('')).toBe('Otros');
    expect(categoryForGrade(null)).toBe('Otros');
    expect(categoryForGrade(undefined)).toBe('Otros');
  });

  it('CATEGORY_ORDER lists the mapped categories then Otros', () => {
    expect(CATEGORY_ORDER).toEqual(['U14', 'U16', 'U18', 'Otros']);
  });
});

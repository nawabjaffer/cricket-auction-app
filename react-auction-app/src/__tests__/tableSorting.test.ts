import { describe, expect, it } from 'vitest';
import { sortTableRows } from '../components/SortableTable';

describe('sortTableRows', () => {
  it('sorts numeric values numerically and keeps equal rows stable', () => {
    const rows = [
      { name: 'First ten', value: 10 },
      { name: 'Two', value: 2 },
      { name: 'Second ten', value: 10 },
    ];
    const result = sortTableRows(rows, { column: 'value', direction: 'ascending' }, row => row.value);
    expect(result.map(row => row.name)).toEqual(['Two', 'First ten', 'Second ten']);
  });

  it('sorts strings naturally and keeps empty values last in either direction', () => {
    const rows = [{ value: 'Team 10' }, { value: '' }, { value: 'Team 2' }];
    const ascending = sortTableRows(rows, { column: 'value', direction: 'ascending' }, row => row.value);
    const descending = sortTableRows(rows, { column: 'value', direction: 'descending' }, row => row.value);
    expect(ascending.map(row => row.value)).toEqual(['Team 2', 'Team 10', '']);
    expect(descending.map(row => row.value)).toEqual(['Team 10', 'Team 2', '']);
  });
});
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { IoArrowDown, IoArrowUp } from 'react-icons/io5';
import './SortableTable.css';

export type TableSortDirection = 'ascending' | 'descending';
export type TableSortValue = string | number | boolean | Date | null | undefined;

export interface TableSortState<Column extends string = string> {
  column: Column;
  direction: TableSortDirection;
}

function normalizeSortValue(value: TableSortValue): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const numericText = trimmed.replace(/,/g, '');
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(numericText)) {
    const numericValue = Number(numericText);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return trimmed;
}

function compareSortValues(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortTableRows<Row, Column extends string>(
  rows: readonly Row[],
  sortState: TableSortState<Column> | null,
  getValue: (row: Row, column: Column) => TableSortValue,
): Row[] {
  if (!sortState) return [...rows];

  return rows
    .map((row, index) => ({ row, index, value: getValue(row, sortState.column) }))
    .sort((left, right) => {
      const leftValue = normalizeSortValue(left.value);
      const rightValue = normalizeSortValue(right.value);
      if (leftValue == null || rightValue == null) {
        return leftValue == null ? (rightValue == null ? left.index - right.index : 1) : -1;
      }
      const order = compareSortValues(leftValue, rightValue);
      return (sortState.direction === 'ascending' ? order : -order) || left.index - right.index;
    })
    .map(({ row }) => row);
}

export function useSortableRows<Row, Column extends string>(
  rows: readonly Row[],
  getValue: (row: Row, column: Column) => TableSortValue,
  initialSort: TableSortState<Column> | null = null,
) {
  const [sortState, setSortState] = useState<TableSortState<Column> | null>(initialSort);
  const sortedRows = useMemo(() => sortTableRows(rows, sortState, getValue), [rows, sortState, getValue]);
  const requestSort = (column: Column) => {
    setSortState(previous => previous?.column === column
      ? { column, direction: previous.direction === 'ascending' ? 'descending' : 'ascending' }
      : { column, direction: 'ascending' });
  };
  return { sortedRows, sortState, requestSort };
}

export function SortableColumnHeader<Column extends string>({
  column,
  label,
  sortState,
  onSort,
  className,
  style,
}: {
  column: Column;
  label: ReactNode;
  sortState: TableSortState<Column> | null;
  onSort: (column: Column) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const active = sortState?.column === column;
  const direction = active ? sortState.direction : null;
  const accessibleLabel = typeof label === 'string' ? label : 'column';

  return (
    <th className={className} style={style} aria-sort={direction || 'none'}>
      <button
        type="button"
        className="sortable-table__header-button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${accessibleLabel}${direction ? `, ${direction}` : ''}`}
      >
        <span>{label}</span>
        <span className="sortable-table__sort-indicator" aria-hidden="true">
          {direction === 'ascending' ? <IoArrowUp size={13} /> : direction === 'descending' ? <IoArrowDown size={13} /> : '↕'}
        </span>
      </button>
    </th>
  );
}
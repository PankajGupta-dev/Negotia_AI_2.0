import React from 'react';

export interface ColumnDef<T> {
  key: string;
  title: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

interface LedgerTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  className?: string;
}

export function LedgerTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records in ledger.',
  className = '',
}: LedgerTableProps<T>) {
  return (
    <div className={`w-full overflow-x-auto border border-outline-variant/30 rounded ${className}`}>
      <table className="w-full text-left border-collapse select-none">
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant/30 text-outline font-label-sm text-label-sm uppercase tracking-wider">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 px-space-base font-semibold ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                } ${col.className || ''}`}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/20 bg-surface-container-lowest font-body-sm text-body-sm">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-outline italic font-body-md"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                onClick={() => onRowClick && onRowClick(item)}
                className={`transition-colors ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-surface-container-low/70'
                    : 'hover:bg-surface-container-low/30'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3 px-space-base text-on-surface align-middle ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.render
                      ? col.render(item, index)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

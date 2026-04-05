import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, ClipboardList } from 'lucide-react'

function SortIcon({ column }) {
  const sorted = column.getIsSorted()
  if (sorted === 'asc') return <ChevronUp size={14} className="text-blue-400" />
  if (sorted === 'desc') return <ChevronDown size={14} className="text-blue-400" />
  return <ChevronsUpDown size={14} className="text-gray-600" />
}

function ConfidenceBar({ value }) {
  if (value == null) return <span className="text-gray-500">--</span>

  const percent = value * 100
  let color = 'bg-green-500'
  let textColor = 'text-green-400'
  if (percent < 60) {
    color = 'bg-red-500'
    textColor = 'text-red-400'
  } else if (percent < 80) {
    color = 'bg-yellow-500'
    textColor = 'text-yellow-400'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${textColor}`}>
        {percent.toFixed(1)}%
      </span>
    </div>
  )
}

function ModeBadge({ mode }) {
  if (!mode) return <span className="text-gray-500">--</span>

  const isAuto = mode.toLowerCase() === 'auto'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isAuto
          ? 'bg-green-500/20 text-green-400'
          : 'bg-blue-500/20 text-blue-400'
      }`}
    >
      {isAuto ? 'Auto' : 'Manual'}
    </span>
  )
}

function SkeletonRows({ count = 5, columns = 7 }) {
  return Array.from({ length: count }).map((_, rowIdx) => (
    <tr key={rowIdx} className="border-b border-gray-700/50">
      {Array.from({ length: columns }).map((_, colIdx) => (
        <td key={colIdx} className="px-4 py-3">
          <div className="h-4 bg-gray-700 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  ))
}

function AttendanceTable({ data = [], isLoading = false }) {
  const [sorting, setSorting] = useState([])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'student_id',
        header: 'Student ID',
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-white">{getValue()}</span>
        ),
      },
      {
        accessorKey: 'student_name',
        header: 'Name',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-white">{getValue() || '--'}</span>
        ),
      },
      {
        accessorKey: 'timestamp',
        header: 'Date',
        enableSorting: true,
        cell: ({ getValue }) => {
          const val = getValue()
          if (!val) return <span className="text-gray-500">--</span>
          return (
            <span className="text-gray-400 text-xs">
              {new Date(val).toLocaleDateString()}
            </span>
          )
        },
      },
      {
        id: 'time',
        header: 'Time',
        enableSorting: false,
        accessorFn: (row) => row.timestamp,
        cell: ({ getValue }) => {
          const val = getValue()
          if (!val) return <span className="text-gray-500">--</span>
          return (
            <span className="text-gray-400 text-xs">
              {new Date(val).toLocaleTimeString()}
            </span>
          )
        },
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        enableSorting: true,
        cell: ({ getValue }) => <ConfidenceBar value={getValue()} />,
      },
      {
        accessorKey: 'mode',
        header: 'Mode',
        enableSorting: false,
        cell: ({ getValue }) => <ModeBadge mode={getValue()} />,
      },
      {
        accessorKey: 'session_id',
        header: 'Session',
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="text-gray-400 text-xs">{getValue() || '--'}</span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  })

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700/50 overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-700">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`text-left text-gray-300 font-medium px-4 py-3 ${
                      header.column.getCanSort()
                        ? 'cursor-pointer select-none hover:text-white transition-colors'
                        : ''
                    }`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <SortIcon column={header.column} />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows count={5} columns={columns.length} />
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <ClipboardList size={32} className="text-gray-600" />
                    <p className="text-gray-500">No records found</p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && data.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Rows per page:</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AttendanceTable

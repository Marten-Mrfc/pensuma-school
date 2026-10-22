'use client'

import type { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface DataTablePaginationProps {
  table: Table<any>
  totalRows: number
  isServerSide: boolean
  borderless?: boolean
}

export function DataTablePagination({ table, totalRows, isServerSide, borderless = false }: DataTablePaginationProps) {
  const selected = table.getFilteredSelectedRowModel().rows.length
  const total = isServerSide ? totalRows : table.getFilteredRowModel().rows.length
  const pageSizeLabelId = useId()

  return (
    <div
      className={[
        'flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between',
        borderless ? '' : 'border-t px-4',
      ].join(' ')}
    >
      <div className="text-muted-foreground text-sm tabular-nums">
        <span className="text-foreground font-medium">{selected}</span> van {total} {total === 1 ? 'rij' : 'rijen'}{' '}
        geselecteerd
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2">
          <span id={pageSizeLabelId} className="text-sm font-medium whitespace-nowrap">
            Rijen per pagina
          </span>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
              table.setPageIndex(0)
            }}
          >
            <SelectTrigger className="h-8 w-[4.5rem]" aria-labelledby={pageSizeLabelId}>
              <SelectValue placeholder={`${table.getState().pagination.pageSize}`} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm font-medium whitespace-nowrap tabular-nums">
          Pagina {table.getState().pagination.pageIndex + 1} van {Math.max(table.getPageCount(), 1)}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
          >
            <ChevronsLeft className="size-4" aria-hidden="true" />
            <span className="sr-only">Eerste pagina</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span className="sr-only">Vorige pagina</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
            <span className="sr-only">Volgende pagina</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
            <span className="sr-only">Laatste pagina</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

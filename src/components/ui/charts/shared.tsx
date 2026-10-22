'use client'

import {
  BarChart as EChartsBarChart,
  BoxplotChart as EChartsBoxplotChart,
  CandlestickChart as EChartsCandlestickChart,
  ChordChart as EChartsChordChart,
  CustomChart as EChartsCustomChart,
  EffectScatterChart as EChartsEffectScatter,
  FunnelChart as EChartsFunnelChart,
  GaugeChart as EChartsGaugeChart,
  GraphChart as EChartsGraphChart,
  HeatmapChart as EChartsHeatmap,
  LineChart as EChartsLineChart,
  MapChart as EChartsMapChart,
  ParallelChart as EChartsParallelChart,
  PictorialBarChart as EChartsPictorialBar,
  PieChart as EChartsPieChart,
  RadarChart as EChartsRadarChart,
  SankeyChart as EChartsSankeyChart,
  ScatterChart as EChartsScatterChart,
  SunburstChart as EChartsSunburstChart,
  TreeChart as EChartsTreeChart,
  TreemapChart as EChartsTreemapChart,
  ThemeRiverChart,
} from 'echarts/charts'
import {
  AriaComponent,
  CalendarComponent,
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echartsCore from 'echarts/core'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import ReactECharts from 'echarts-for-react/esm/core'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { withA11yOption } from './a11y-option'

export function heightToStyle(height: number | string): string {
  return /^\d+$/.test(String(height)) ? `${height}px` : String(height)
}

interface ChartFrameProps {
  height: number | string
  className?: string
  /** Make the frame a tab stop with a focus ring. Default false: a static
   *  chart image is not interactive, so it should not be a tab stop. */
  focusable?: boolean
  /** Accessible name for role="img". Defaults to "Grafiek". */
  ariaLabel?: string
}

/** Shared `<div>` wrapper around the ECharts canvas. */
export const ChartFrame = React.forwardRef<HTMLDivElement, ChartFrameProps & { children: React.ReactNode }>(
  ({ height, className, focusable = false, ariaLabel, children }, ref) => (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel || 'Grafiek'}
      tabIndex={focusable ? 0 : undefined}
      style={{ height: heightToStyle(height) }}
      className={
        focusable
          ? cn('focus-visible:ring-ring w-full focus-visible:ring-2 focus-visible:outline-none', className)
          : cn('w-full', className)
      }
    >
      {children}
    </div>
  ),
)
ChartFrame.displayName = 'ChartFrame'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** `prefers-reduced-motion: reduce` (canvas animations ignore the CSS reduced-motion floor). */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false)
}

/** ECharts canvas filling its parent frame. */
export function EChart({ option }: { option: any }) {
  const reducedMotion = usePrefersReducedMotion()
  const merged = React.useMemo(() => withA11yOption(option, reducedMotion), [option, reducedMotion])
  return (
    <ReactECharts
      echarts={echartsCore as any}
      option={merged}
      notMerge
      lazyUpdate
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export const echartsCoreModule = echartsCore
export { withA11yOption }

// Register every chart type the wrappers need once at module load.
use([
  CanvasRenderer,
  AriaComponent,
  EChartsLineChart,
  EChartsBarChart,
  EChartsPieChart,
  EChartsScatterChart,
  EChartsEffectScatter,
  EChartsPictorialBar,
  EChartsRadarChart,
  EChartsGaugeChart,
  EChartsHeatmap,
  EChartsTreemapChart,
  EChartsFunnelChart,
  EChartsBoxplotChart,
  EChartsCandlestickChart,
  EChartsCustomChart,
  EChartsChordChart,
  EChartsMapChart,
  EChartsGraphChart,
  EChartsParallelChart,
  EChartsSankeyChart,
  EChartsSunburstChart,
  ThemeRiverChart,
  EChartsTreeChart,
  GridComponent,
  PolarComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  GraphicComponent,
  RadarComponent,
  VisualMapComponent,
  CalendarComponent,
  DataZoomComponent,
  ParallelComponent,
  SingleAxisComponent,
  TitleComponent,
])

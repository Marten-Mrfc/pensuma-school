/**
 * Accessibility defaults merged into every option: the ECharts aria module
 * with decal patterns (series are not told apart by colour alone, WCAG 1.4.1)
 * and no animation when the user prefers reduced motion. The generated
 * English aria description is switched off: the ChartFrame's Dutch label
 * names the chart.
 */
export function withA11yOption(option: any, reducedMotion: boolean): any {
  const base = option ?? {}
  const userAria = base.aria ?? {}
  return {
    ...base,
    aria: {
      enabled: true,
      ...userAria,
      label: { enabled: false, ...userAria.label },
      decal: { show: true, ...userAria.decal },
    },
    animation: reducedMotion ? false : (base.animation ?? true),
  }
}

// ejemplo.spec.mjs · spec de ejemplo para render-plot.mjs. Datos de ejemplo (sintéticos): en un
// proyecto, datos reales con fuente y fecha (contrato 10).
export default (Plot, datos) => ({
  width: 640,
  height: 260,
  marginLeft: 44,
  x: { label: null, domain: datos.map((d) => d.mes) },
  y: { label: 'Sesiones', grid: true, nice: true },
  marks: [
    Plot.barY(datos, {
      x: 'mes',
      y: 'sesiones',
      fill: 'var(--color-accent-solid)',
      title: (d) => `${d.mes}: ${d.sesiones} sesiones`,
    }),
    Plot.ruleY([0], { stroke: 'var(--color-border-control)' }),
  ],
});

#!/usr/bin/env python3
"""rendimiento.py · rendimiento de laboratorio SIN descargas (verificacion.md §1, vía por defecto).

`npx lighthouse` descarga el paquete la primera vez (solo con permiso): sin él, el rendimiento quedaba
«pendiente» aunque el encargo lo pidiera. Esto usa el Chromium de Playwright ya instalado, con CDP:
móvil 412×823 (DPR 2,625, táctil), red «4G lenta» (150 ms de RTT, 1,6 Mb/s de bajada, 750 kb/s de
subida), CPU ×4 y caché fría; mediana de N cargas (3 por defecto). Mide FCP, LCP (y su elemento), CLS
(y qué se movió), TBT aproximado (Σ de lo que pasa de 50 ms en las tareas largas hasta 5 s tras load)
y bytes transferidos; con --interaccion, el coste de una interacción (p. ej. cambiar la letra de un lector).

Es un SUSTITUTO HONESTO: no es la cifra de Lighthouse ni de campo, y el informe lo dice así. Contraste
opcional, con permiso: `npx lighthouse …` (verificacion.md) o `lighthouse_audit` de chrome-devtools-mcp
(ya instalado; core-web-vitals avisa de que su puntuación no es evidencia: se leen las métricas).

  python3 kit/rendimiento.py dist/index.html --raiz dist [--tipo landing] [--veces 3]
  python3 kit/rendimiento.py http://localhost:4321/ --interaccion "js:document.documentElement.style.setProperty('--reader-scale','1.25')"
Salida: tabla con medianas + <salida>/rendimiento.json. Código 1 si una mediana supera el presupuesto
del tipo (contratos.md §8: LCP ≤ 2,5 s, lectura < 2 s; CLS ≤ 0,1, lectura < 0,05; TBT < 200 ms).
"""
import argparse, functools, http.server, json, pathlib, statistics, sys, threading

OBS = """window.__m = { lcp: 0, lcpEl: '', cls: 0, fuentes: [], largas: [] };
new PerformanceObserver((l) => { for (const e of l.getEntries()) { __m.lcp = e.startTime;
  __m.lcpEl = e.element ? e.element.tagName.toLowerCase() + (e.element.id ? '#' + e.element.id : '') + (e.element.classList[0] ? '.' + e.element.classList[0] : '') : (e.url || ''); } })
  .observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { __m.cls += e.value;
  for (const f of e.sources || []) __m.fuentes.push([e.value, f.node ? (f.node.nodeType === 1 ? f.node.tagName.toLowerCase() + (f.node.id ? '#' + f.node.id : '') + (f.node.classList[0] ? '.' + f.node.classList[0] : '') : '#texto') : '?']); } })
  .observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver((l) => { for (const e of l.getEntries()) __m.largas.push(e.duration); }).observe({ type: 'longtask', buffered: true });"""

TOPES = {  # contratos.md §8 (laboratorio): LCP ms, CLS, TBT ms
    None: (2500, 0.1, 200), "landing": (2500, 0.1, 200), "lectura": (2000, 0.05, 200), "datos": (2500, 0.1, 200),
    "app": (2500, 0.1, 200), "juego": (3000, 0.1, 200), "experiencia": (2500, 0.1, 200),
}


def servir(raiz: pathlib.Path):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(raiz)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("objetivo")
    ap.add_argument("--raiz")
    ap.add_argument("--veces", type=int, default=3)
    ap.add_argument("--tipo", choices=[k for k in TOPES if k])
    ap.add_argument("--cpu", type=float, default=4)
    ap.add_argument("--interaccion", help='"js:código" que se cronometra (con su reflujo) tras la carga')
    ap.add_argument("--salida", default=".verificacion")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright

    srv = None
    if a.objetivo.startswith(("http://", "https://")):
        url = a.objetivo
    else:
        pagina = pathlib.Path(a.objetivo).resolve()
        raiz = pathlib.Path(a.raiz).resolve() if a.raiz else pagina.parent
        srv, base = servir(raiz)
        url = f"{base}/{pagina.relative_to(raiz).as_posix()}"
    res = []
    with sync_playwright() as p:
        nav = p.chromium.launch()
        for _ in range(a.veces):
            ctx = nav.new_context(viewport={"width": 412, "height": 823}, device_scale_factor=2.625, is_mobile=True, has_touch=True)
            pg = ctx.new_page()
            cdp = ctx.new_cdp_session(pg)
            cdp.send("Network.enable")
            cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
            cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 1.6e6 / 8, "uploadThroughput": 750e3 / 8})
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})
            pg.add_init_script(OBS)
            pg.goto(url, wait_until="load", timeout=90000)
            pg.wait_for_timeout(5000)
            m = pg.evaluate("window.__m")
            m["fcp"] = pg.evaluate("(performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0")
            m["bytes"] = pg.evaluate("performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0)")
            m["tbt"] = sum(max(0, d - 50) for d in m.pop("largas"))
            if a.interaccion:
                codigo = a.interaccion[3:] if a.interaccion.startswith("js:") else a.interaccion
                m["interaccion_ms"] = pg.evaluate(f"() => {{ const t = performance.now(); {codigo}; document.body.offsetHeight; return performance.now() - t; }}")
            res.append(m)
            ctx.close()
        nav.close()
    if srv:
        srv.shutdown()

    claves = ["fcp", "lcp", "cls", "tbt", "bytes"] + (["interaccion_ms"] if a.interaccion else [])
    med = {k: statistics.median(r[k] for r in res) for k in claves}
    fuentes = sorted((f for r in res for f in r["fuentes"]), reverse=True)[:3]
    lcp_max, cls_max, tbt_max = TOPES[a.tipo]
    fallos = [f"LCP {med['lcp']:.0f} ms > {lcp_max}" for _ in [0] if med["lcp"] > lcp_max] \
        + [f"CLS {med['cls']:.3f} > {cls_max}" for _ in [0] if med["cls"] > cls_max] \
        + [f"TBT {med['tbt']:.0f} ms > {tbt_max}" for _ in [0] if med["tbt"] > tbt_max]
    informe = {"url": url, "metodo": f"Chromium + CDP, móvil 412×823, 4G lenta (150 ms, 1,6 Mb/s), CPU ×{a.cpu}, caché fría, mediana de {a.veces}",
               "aviso": "sustituto de laboratorio: no es la cifra de Lighthouse ni de campo", "tipo": a.tipo,
               "mediana": med, "elemento_lcp": res[0]["lcpEl"], "cls_fuentes": fuentes, "cargas": res, "fallos": fallos}
    out = pathlib.Path(a.salida)
    out.mkdir(parents=True, exist_ok=True)
    (out / "rendimiento.json").write_text(json.dumps(informe, ensure_ascii=False, indent=1))
    print(f"rendimiento de laboratorio (sustituto, no Lighthouse) · {informe['metodo']}")
    print(f"  FCP {med['fcp']:.0f} ms · LCP {med['lcp']:.0f} ms ({res[0]['lcpEl'] or '?'}) · CLS {med['cls']:.3f} · TBT ≈ {med['tbt']:.0f} ms · {med['bytes'] / 1024:.0f} kB transferidos"
          + (f" · interacción {med['interaccion_ms']:.0f} ms" if a.interaccion else ""))
    if fuentes:
        print("  se movió: " + ", ".join(f"{n} ({v:.3f})" for v, n in fuentes))
    print(("  FUERA DE PRESUPUESTO: " + "; ".join(fallos)) if fallos else f"  dentro del presupuesto ({a.tipo or 'genérico'}: LCP ≤ {lcp_max} ms, CLS ≤ {cls_max}, TBT < {tbt_max} ms)")
    print(f"  → {out / 'rendimiento.json'}")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())

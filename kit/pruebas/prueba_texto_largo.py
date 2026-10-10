#!/usr/bin/env python3
"""prueba_texto_largo.py · ¿text-wrap: pretty en un capítulo de 100 000 palabras? (precedencia C8)

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_texto_largo.py [--cpu 4]

Mide en Chromium, con pruebas/texto_largo.html (100 000 palabras generadas en el cliente), wrap frente
a pretty, con y sin content-visibility, todo con la CPU ralentizada: el reflujo al cambiar el ancho
de la columna (mediana de 3; es lo que paga el lector al cambiar tamaño, medida o fuente, así que
cuenta como interacción: ≤ 200 ms, el umbral de INP) y el p95 del frame mientras se desplaza
(≤ 16,7 ms, 60 fps). pretty vale en lectura larga solo si cumple las dos. Imprime la tabla y el
veredicto; sale con 0 (medido). Es una herramienta de decisión, no una puerta: se repite con el
capítulo REAL del proyecto (sus fuentes y su medida) antes de activar pretty en él.
"""
import argparse, functools, http.server, statistics, threading, pathlib, sys

KITS = pathlib.Path(__file__).resolve().parent.parent
REFLUJO = """() => { const m = document.getElementById('principal'); const t = [];
  for (const ancho of ['36ch', '46ch', '40ch']) { m.style.maxInlineSize = ancho; const t0 = performance.now(); void document.body.offsetHeight; t.push(performance.now() - t0); }
  t.sort((a, b) => a - b); return t[1]; }"""
DESPLAZAR = """(ms) => new Promise((ok) => {
  const d = []; let prev = performance.now(); const fin = prev + ms;
  (function f(t) { d.push(t - prev); prev = t; scrollBy(0, 60); if (t < fin) requestAnimationFrame(f); else {
    d.shift(); d.sort((a, b) => a - b); ok({ p95: Math.round(d[Math.floor(d.length * 0.95)] * 10) / 10, largos: d.filter((x) => x > 33.4).length, muestras: d.length }); } })(prev);
})"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cpu", type=float, default=4)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright

    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(KITS)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/pruebas/texto_largo.html"
    filas = {}
    with sync_playwright() as p:
        nav = p.chromium.launch()
        for ajuste in ("wrap", "pretty"):
            for cv in ("0", "1"):
                pg = nav.new_page(viewport={"width": 1280, "height": 800})
                pg.goto(f"{base}?ajuste={ajuste}&cv={cv}", wait_until="load")
                palabras = pg.evaluate("window.__palabras")
                pg.evaluate("void document.body.offsetHeight")
                cdp = pg.context.new_cdp_session(pg)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})
                pg.wait_for_timeout(300)
                reflujo = statistics.median(pg.evaluate(REFLUJO) for _ in range(3))
                fps = pg.evaluate(DESPLAZAR, 3000)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
                filas[(ajuste, cv)] = (reflujo, fps)
                print(f"  {ajuste:<6} content-visibility {'sí' if cv == '1' else 'no'}: {palabras} palabras · CPU ×{a.cpu}: reflujo {reflujo:.0f} ms · desplazamiento p95 {fps['p95']} ms, {fps['largos']} frames > 33 ms")
                pg.close()
        nav.close()
    srv.shutdown()
    for cv in ("0", "1"):
        w, pr = filas[("wrap", cv)], filas[("pretty", cv)]
        ok = pr[1]["p95"] <= 16.7 and pr[0] <= 200
        print(f"VEREDICTO (content-visibility {'sí' if cv == '1' else 'no'}): pretty {'SÍ' if ok else 'NO'} vale en lectura larga · "
              f"reflujo {pr[0]:.0f} ms (wrap {w[0]:.0f}; tope 200) · p95 {pr[1]['p95']} ms (wrap {w[1]['p95']}; tope 16,7)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

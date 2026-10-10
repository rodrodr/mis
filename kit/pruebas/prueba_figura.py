#!/usr/bin/env python3
"""prueba_figura.py · prueba kits/figura/ (render en el build, anatomía, pestañas, teclado y FLIP).

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_figura.py [--node-modules DIR] [--motores chromium,webkit]

1. render-plot.mjs en Node (Plot + linkedom): necesita @observablehq/plot@0.6.17 y linkedom@0.18.13 en
   DIR/node_modules (o en el cwd). Sin ellos, el caso queda INCOMPLETO (código 2), no aprobado.
2. figura/figura.html en navegadores reales:
   sin JS, las tres vistas apiladas y la tabla entera · con JS, pestañas APG (flechas, hash que se
   conserva al recargar) · una sola parada de Tab en el gráfico, flechas, Inicio/Fin, nota con el
   mismo texto que la tabla, Esc la cierra · FLIP con --dur-chart y escalonado con tope; con
   movimiento reducido, cambio sin animación · destroy() devuelve el HTML de partida ·
   navegarVirtual (figuras en canvas): una parada, región viva, nota, pasos propios, Esc y destroy().
3. verificar.py --puerta sobre la plantilla (Chromium): islas, consola, desborde, axe, objetivos.
"""
import argparse, functools, http.server, os, pathlib, shutil, subprocess, sys, tempfile, threading

KITS = pathlib.Path(__file__).resolve().parent.parent
fallos, incompletos = [], []


def check(c, t):
    print(("  ok  " if c else "  NO  ") + t)
    c or fallos.append(t)


def prueba_render(node_modules):
    print("render-plot.mjs (Node)")
    tmp = pathlib.Path(tempfile.mkdtemp())
    if node_modules:
        (tmp / "node_modules").symlink_to(pathlib.Path(node_modules).resolve())
    r = subprocess.run(["node", str(KITS / "figura/render-plot.mjs"), str(KITS / "figura/ejemplo.spec.mjs"),
                        "--datos", str(KITS / "figura/ejemplo.csv"), "--etiqueta", "Prueba", "--salida", str(tmp / "f.svg")],
                       cwd=tmp, capture_output=True, text=True)
    if r.returncode != 0 and "falta" in r.stderr:
        incompletos.append("render-plot.mjs sin dependencias (npm i -D @observablehq/plot@0.6.17 linkedom@0.18.13; --node-modules DIR)")
        print("  --  sin @observablehq/plot ni linkedom: el render queda sin probar (incompleto)")
        return
    svg = (tmp / "f.svg").read_text() if (tmp / "f.svg").exists() else ""
    check(r.returncode == 0 and svg.startswith("<svg"), f"genera SVG estático en Node con linkedom ({r.stdout.strip() or r.stderr.strip()[:120]})")
    check(svg.count("data-punto") == 12 and "<title>" not in svg and 'aria-label="ene: 12 sesiones"' in svg,
          "12 marcas con data-punto y aria-label del title (sin <title> duplicado)")
    check('role="group"' in svg and 'aria-label="Prueba"' in svg and "font-family" not in svg.split(">")[0], "raíz role=group con la frase; sin la familia de Plot")
    check("var(--color-accent-solid)" in svg, "los colores quedan como tokens (var()) en el SVG")
    shutil.rmtree(tmp)


def servir():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(KITS)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/figura/figura.html"


def prueba_navegador(p, motor, url):
    print(motor)
    try:
        nav = getattr(p, motor).launch(timeout=45000)
    except Exception as e:
        incompletos.append(f"{motor}: no arranca")
        print(f"  --  no arranca: {str(e).splitlines()[0][:100]}")
        return
    # sin JS
    ctx = nav.new_context(java_script_enabled=False)
    pg = ctx.new_page()
    pg.goto(url, wait_until="load")
    vis = pg.evaluate("[...document.querySelectorAll('.figura__vista')].map((s) => s.getBoundingClientRect().height > 0)")
    check(vis == [True, True, True] and pg.evaluate("document.querySelectorAll('tbody tr').length") == 12, "sin JS: Gráfico, Tabla y Datos apiladas; la tabla entera")
    ctx.close()

    ctx = nav.new_context(viewport={"width": 1000, "height": 900})
    pg = ctx.new_page()
    err = []
    pg.on("pageerror", lambda e: err.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and err.append(m.text))
    pg.goto(url, wait_until="networkidle")
    pg.wait_for_function("document.querySelector('maestro-isla').dataset.isla === 'activa'", timeout=10000)
    tabs = pg.evaluate("[...document.querySelectorAll('[role=tab]')].map((t) => [t.textContent, t.getAttribute('aria-selected')])")
    check(tabs == [["Gráfico", "true"], ["Tabla", "false"], ["Datos", "false"]], f"pestañas APG en lugar del índice {tabs}")
    pg.focus("[role=tab][aria-selected=true]")
    pg.keyboard.press("ArrowRight")
    estado = pg.evaluate("[document.activeElement.textContent, location.hash, document.getElementById('fig-ejemplo-tabla').hidden, document.getElementById('fig-ejemplo-grafico').hidden]")
    check(estado == ["Tabla", "#fig-ejemplo-tabla", False, True], f"→ activa Tabla, muestra su panel y conserva el hash {estado}")
    pg.reload(wait_until="networkidle")
    pg.wait_for_function("document.querySelector('maestro-isla').dataset.isla === 'activa'", timeout=10000)
    check(pg.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent") == "Tabla", "al recargar con el hash, vuelve a la Tabla")
    etiquetas = pg.evaluate("[...document.querySelectorAll('[data-punto]')].map((p) => p.getAttribute('aria-label'))")
    filas = pg.evaluate("[...document.querySelectorAll('tbody tr')].map((f) => `${f.cells[0].textContent}: ${f.cells[1].textContent} sesiones`)")
    check(etiquetas == filas, "cada marca dice lo mismo que su fila de la tabla")
    # teclado en el gráfico: una sola parada
    pg.focus("[role=tab][aria-selected=true]")
    pg.keyboard.press("Home")
    pg.keyboard.press("Tab")
    a = pg.evaluate("[document.activeElement.getAttribute('aria-label'), document.querySelector('.figura__nota')?.hidden, document.querySelector('.figura__nota')?.textContent]")
    check(a == ["ene: 12 sesiones", False, "ene: 12 sesiones"], f"Tab entra en la primera marca y la nota dice lo mismo {a}")
    pg.keyboard.press("ArrowRight")
    b = pg.evaluate("document.activeElement.getAttribute('aria-label')")
    pg.keyboard.press("End")
    c = pg.evaluate("[document.activeElement.getAttribute('aria-label'), document.querySelectorAll('[data-punto][tabindex=\"0\"]').length]")
    check(b == "feb: 18 sesiones" and c == ["dic: 16 sesiones", 1], f"→ pasa a febrero, Fin a diciembre, un solo tabindex=0 ({b}, {c})")
    pg.keyboard.press("Escape")
    check(pg.evaluate("document.querySelector('.figura__nota').hidden") is True, "Esc cierra la nota")
    pg.keyboard.press("Tab")
    check(not pg.evaluate("document.activeElement.hasAttribute('data-punto')"), "el siguiente Tab sale del gráfico (una sola parada)")
    # FLIP
    pg.click("[role=tab]:has-text('Datos')")
    pg.click("[data-flip]")
    f = pg.evaluate("""() => ({ n: (window.__flip || []).length, dur: [...new Set((window.__flip || []).map((a) => a.effect.getTiming().duration))],
        retardo: Math.max(0, ...(window.__flip || []).map((a) => a.effect.getTiming().delay)),
        primero: document.querySelector('.figura__celdas li').textContent })""")
    check(f["n"] > 0 and f["dur"] == [400] and f["retardo"] <= 300 and f["primero"].startswith("abr"),
          f"FLIP: {f['n']} animaciones de --dur-chart ({f['dur']} ms), retardo ≤ tope ({f['retardo']} ms), nuevo orden ({f['primero']})")
    # destroy
    pg.evaluate("document.querySelector('maestro-isla').remove(); document.querySelector('main').append(document.createElement('div'))")
    ctx.close()
    ctx = nav.new_context(viewport={"width": 1000, "height": 900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="networkidle")
    pg.wait_for_function("document.querySelector('maestro-isla').dataset.isla === 'activa'", timeout=10000)
    pg.evaluate("window.__fig = document.querySelector('[data-figura]'); document.querySelector('maestro-isla').destroy()")
    d = pg.evaluate("[document.querySelectorAll('[role=tab]').length, window.__fig.querySelector('.figura__indice').hidden, document.querySelectorAll('.figura__vista[hidden]').length, document.querySelectorAll('[data-punto][tabindex]').length, !!document.querySelector('.figura__nota')]")
    check(d == [0, False, 0, 0, False], f"destroy(): vuelve el índice, las vistas visibles y sin tabindex ni nota {d}")
    check(not err, f"sin errores de consola {err[:1]}")
    ctx.close()
    # movimiento reducido
    ctx = nav.new_context(reduced_motion="reduce")
    pg = ctx.new_page()
    pg.goto(url + "#fig-ejemplo-datos", wait_until="networkidle")
    pg.wait_for_function("document.querySelector('maestro-isla').dataset.isla === 'activa'", timeout=10000)
    pg.click("[data-flip]")
    r = pg.evaluate("[(window.__flip || [null]).length, document.querySelector('.figura__celdas li').textContent]")
    check(r[0] == 0 and r[1].startswith("abr"), f"movimiento reducido: cambia el orden sin animar {r}")
    ctx.close()
    nav.close()


def prueba_virtual(p, motor, url):
    """navegarVirtual: una parada de Tab para una figura en canvas, región viva y nota donde diga la pieza."""
    nav = getattr(p, motor).launch(timeout=45000)
    pg = nav.new_page(viewport={"width": 900, "height": 700})
    err = []
    pg.on("pageerror", lambda e: err.append(str(e)))
    pg.goto(url, wait_until="networkidle")
    pg.evaluate("""async () => { const { navegarVirtual } = await import('./navegar.js');
        const fig = document.createElement('figure'); fig.dataset.figura = ''; fig.className = 'figura';
        const lienzo = document.createElement('canvas'); lienzo.width = 500; lienzo.height = 200; lienzo.setAttribute('aria-label', 'Hemiciclo de prueba');
        fig.append(lienzo); document.querySelector('main').prepend(fig);
        window.__v = { resaltado: -1 };
        window.__nav = navegarVirtual(lienzo, { total: 500, describir: (i) => `Escaño ${i + 1} de 500`,
          mostrar: (i) => { __v.resaltado = i; const r = lienzo.getBoundingClientRect(); return { left: r.left + i, top: r.top + 100, width: 4, height: 4 }; },
          soltar: () => { __v.resaltado = -1; }, pasos: { ArrowUp: (i) => i + 50 } }); }""")
    pg.focus("figure canvas")
    ver = lambda: pg.evaluate("() => { const f = document.querySelector('figure'); return [f.querySelector('[role=status]').textContent, f.querySelector('.figura__nota').hidden, __v.resaltado]; }")
    a = ver()
    pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowUp")
    b = ver()
    pg.keyboard.press("End")
    c = ver()
    pg.keyboard.press("Escape")
    d = ver()
    check(a == ["Escaño 1 de 500", False, 0], f"virtual: el foco anuncia la primera marca y muestra la nota {a}")
    check(b[0] == "Escaño 53 de 500" and b[2] == 52, f"virtual: flechas y paso propio (↑ = +50) {b}")
    check(c[0] == "Escaño 500 de 500", f"virtual: Fin va a la última {c}")
    check(d[1] is True and d[2] == -1, f"virtual: Esc cierra la nota y suelta el resaltado {d}")
    pg.evaluate("__nav.destroy()")
    check(pg.evaluate("document.querySelectorAll('figure .figura__nota, figure [role=status]').length") == 0 and not err,
          f"virtual: destroy() retira nota y región, sin excepciones {err[:1]}")
    nav.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--node-modules")
    ap.add_argument("--motores", default="chromium,webkit")
    a = ap.parse_args()
    prueba_render(a.node_modules)
    from playwright.sync_api import sync_playwright
    srv, url = servir()
    with sync_playwright() as p:
        for m in a.motores.split(","):
            prueba_navegador(p, m, url)
            try:
                print(f"{m} · navegarVirtual (figuras en canvas)")
                prueba_virtual(p, m, url)
            except Exception as e:
                check(False, f"navegarVirtual en {m}: {type(e).__name__}: {str(e).splitlines()[0][:160]}")
    srv.shutdown()
    print("verificar.py --puerta sobre la plantilla (Chromium)")
    r = subprocess.run([sys.executable, str(KITS / "verificar.py"), "figura/figura.html", "--raiz", ".", "--puerta", "--motores", "chromium",
                        "--sin-detector", "--tipo", "datos", "--salida", tempfile.mkdtemp()], cwd=KITS, capture_output=True, text=True)
    check(r.returncode == 0, "puerta técnica en verde (islas, consola, desborde, axe, objetivos, presupuesto de datos)" + ("" if r.returncode == 0 else "\n" + r.stdout[-900:]))
    if fallos:
        print(f"\n{len(fallos)} FALLO(S)")
        return 1
    print("\nTODO OK" + (f" · INCOMPLETO: {'; '.join(incompletos)}" if incompletos else ""))
    return 2 if incompletos else 0


if __name__ == "__main__":
    sys.exit(main())

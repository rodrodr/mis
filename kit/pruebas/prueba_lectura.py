#!/usr/bin/env python3
"""prueba_lectura.py · prueba kits/lectura.js en Chromium y WebKit (Firefox, si arranca).

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_lectura.py
Comprueba búsqueda sin tildes y con ñ ≠ n, palabra completa, Custom Highlight API; retoma tras
reflujo de 1280 a 390 px con error ≤ 1 párrafo; TextQuoteSelector con texto repetido; paginado
(paso instantáneo con teclado; Locator por la columna visible: ir a la página N, cambiar el ancho y
volver al mismo bloque).
"""
import functools, http.server, pathlib, sys, threading

KITS = pathlib.Path(__file__).resolve().parent.parent
fallos, sin_motor = [], []


def check(c, t):
    print(("  ok  " if c else "  NO  ") + t)
    c or fallos.append(t)


class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    from playwright.sync_api import sync_playwright
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(KITS)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/pruebas/lectura.html"
    with sync_playwright() as p:
        for motor in (sys.argv[1] if len(sys.argv) > 1 else "chromium,webkit").split(","):
            print(motor)
            try:
                b = getattr(p, motor).launch(timeout=45000)
            except Exception:
                sin_motor.append(motor); print("  --  no arranca"); continue
            pg = b.new_page(viewport={"width": 1280, "height": 800})
            err = []
            pg.on("pageerror", lambda e: err.append(str(e)))
            pg.goto(url, wait_until="networkidle")
            pg.wait_for_function("window.L")
            r = pg.evaluate("() => L.buscar(document.getElementById('texto'), 'camara').map(r => r.toString())")
            check(len(r) > 0 and all(x.lower() in ("cámara",) for x in r), f"«camara» encuentra cámara/Cámara y no camarada ({len(r)}: {sorted(set(r))})")
            r2 = pg.evaluate("() => L.buscar(document.getElementById('texto'), 'año').map(r => r.toString())")
            check(r2 and set(x.lower() for x in r2) == {"año"}, "«año» no encuentra «ano» (ñ ≠ n)")
            r3 = pg.evaluate("() => L.buscar(document.getElementById('texto'), 'camara', { palabra: false }).length")
            check(r3 > len(r), f"sin palabra completa también encuentra «camarada» ({r3} > {len(r)})")
            hl = pg.evaluate("() => CSS.highlights ? CSS.highlights.get('busqueda').size : -1")
            check(hl >= 0, f"resultados pintados con ::highlight (tamaño {hl})")
            # retoma tras reflujo
            pg.evaluate("document.getElementById('p-20').scrollIntoView(); window.scrollBy(0, 30)")
            loc = pg.evaluate("() => L.posicion(document.getElementById('texto'))")
            antes = int(loc["locations"]["fragments"][0].split("-")[1])
            pg.set_viewport_size({"width": 390, "height": 844})
            pg.evaluate("document.documentElement.style.fontSize = '112.5%'")
            pg.wait_for_timeout(100)
            pg.evaluate("(loc) => L.irA(document.getElementById('texto'), loc)", loc)
            loc2 = pg.evaluate("() => L.posicion(document.getElementById('texto'))")
            despues = int(loc2["locations"]["fragments"][0].split("-")[1])
            check(abs(antes - despues) <= 1 and loc["locations"]["charOffset"] > 0, f"retoma tras 1280→390 px y fuente mayor: p-{antes} (carácter {loc['locations']['charOffset']}) → p-{despues}")
            # texto cambiado: reancla por la cita
            pg.evaluate("(loc) => { const l = structuredClone(loc); l.locations.fragments = ['no-existe']; window.__ok = L.irA(document.getElementById('texto'), l); }", loc)
            check(pg.evaluate("window.__ok"), "si el id desaparece, reancla por el texto")
            # TextQuoteSelector con repetición
            sel = pg.evaluate("""() => { const p = document.getElementById('p-30').firstChild; const t = p.data;
                const i = t.lastIndexOf('el mismo texto vuelve'); const r = new Range(); r.setStart(p, i); r.setEnd(p, i + 21);
                return L.citar(r, document.getElementById('texto')); }""")
            pg.set_viewport_size({"width": 1280, "height": 800})
            off = pg.evaluate("(s) => { const r = L.anclar(document.getElementById('texto'), s); return [r.toString(), r.startOffset, r.startContainer.parentElement.id]; }", sel)
            esperado = pg.evaluate("document.getElementById('p-30').firstChild.data.lastIndexOf('el mismo texto vuelve')")
            check(off[0] == "el mismo texto vuelve" and off[1] == esperado and off[2] == "p-30", f"la cita ancla la SEGUNDA aparición por su contexto ({off[1]} = {esperado})")
            # paginado: teclas, paso instantáneo (E10) y Locator por la columna visible
            n = pg.evaluate("() => { window.P = L.paginar(document.getElementById('pag')); return P.paginas(); }")
            pg.evaluate("document.getElementById('pag').scrollIntoView({ block: 'start' })")
            pg.focus("#pag"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(50)
            # distancia a la página más cercana (WebKit redondea scrollLeft a enteros)
            a = pg.evaluate("""() => { const el = document.getElementById('pag'), paso = el.clientWidth + parseFloat(getComputedStyle(el).columnGap);
                const r = el.scrollLeft % paso; return [P.actual(), Math.min(r, paso - r)]; }""")
            pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(50)
            check(n > 1 and a[0] == 1 and a[1] < 1 and pg.evaluate("() => P.actual()") == 0, f"paginado: {n} páginas; → pasa a 1 sin animación (a los 50 ms ya está: resto {round(a[1], 1)} px) y ← vuelve a 0")
            N = min(5, n - 2)
            loc = pg.evaluate("""(N) => { P.ir(N); const pag = document.getElementById('pag');
                const loc = L.posicion(pag, { contenedor: pag });
                // lo esperado: el primer bloque con un trozo dentro de la columna visible
                const r = pag.getBoundingClientRect(), izq = r.left + pag.clientLeft, der = izq + pag.clientWidth;
                const vis = [...pag.querySelectorAll('p[id]')].find((b) => [...b.getClientRects()].some((x) => x.width > 0 && x.right > izq + 1 && x.left < der - 1));
                return { loc, esperado: vis && vis.id, n: P.paginas() }; }""", N)
            frag = loc["loc"]["locations"]["fragments"][0]
            prog = loc["loc"]["locations"]["progression"]
            check(frag == loc["esperado"] and frag != "q-1" and abs(prog - N / (loc["n"] - 1)) < 0.02,
                  f"posicion() en la página {N}: {frag} (esperado {loc['esperado']}), progresión {round(prog, 3)} ≈ {round(N / (loc['n'] - 1), 3)}")
            despues = pg.evaluate("""(loc) => { const pag = document.getElementById('pag');
                pag.style.inlineSize = '20rem'; pag.getBoundingClientRect();
                const ok = L.irA(pag, loc, { contenedor: pag });
                const paso = pag.clientWidth + parseFloat(getComputedStyle(pag).columnGap);
                const l2 = L.posicion(pag, { contenedor: pag });
                return { ok, pagina: P.actual(), paginas: P.paginas(), alineado: Math.abs(pag.scrollLeft - Math.round(pag.scrollLeft / paso) * paso) < 1,
                         frag: l2.locations.fragments[0] }; }""", loc["loc"])
            num = lambda f: int(f.split("-")[1])
            check(despues["ok"] and despues["pagina"] > 0 and despues["alineado"] and abs(num(despues["frag"]) - num(frag)) <= 1,
                  f"cambio de ancho → irA() vuelve a {despues['frag']} (antes {frag}) en la página {despues['pagina']} de {despues['paginas']}, alineada")
            # content-visibility: auto por sección (tipos/lectura.md §2): saltos estables y posición fiable
            # en WebKit, con la sección de destino maquetada a la fuerza y recolocada durante 500 ms
            pg.set_viewport_size({"width": 1280, "height": 800})
            pg.evaluate("""() => { const st = document.createElement('style');
                st.textContent = '@layer components { .turno { content-visibility: auto; contain-intrinsic-size: auto 6em; } }';
                document.head.append(st);
                const frases = [...document.querySelectorAll('#texto p')].map((p) => p.textContent);
                const m = document.createElement('main'); m.id = 'cv'; m.className = 'center lectura';
                let html = '';
                for (let t = 1; t <= 300; t++) {
                  html += `<section class="turno" id="t-${t}"><h3 id="o-${t}">Turno ${t}</h3>`;
                  for (let k = 1; k <= 1 + (t % 4); k++) html += `<p id="c-${t}-${k}">${frases[(t * 7 + k) % frases.length]} ${frases[(t + k) % frases.length]}</p>`;
                  html += '</section>';
                }
                m.innerHTML = html; document.getElementById('texto').replaceWith(m); scrollTo(0, 0); }""")
            pg.wait_for_timeout(100)
            salto = pg.evaluate("""() => new Promise((ok) => {
                const raiz = document.getElementById('cv');
                L.irA(raiz, { locations: { fragments: ['c-203-3'], charOffset: 0 } }, { contenedores: '.turno', estable: 500 });
                // la línea del carácter 0 (no la caja del párrafo: el interlineado deja unos px por encima)
                setTimeout(() => { const r = new Range(); r.setStart(document.getElementById('c-203-3').firstChild, 0); r.collapse(true);
                  const top = [...r.getClientRects()].find((x) => x.height > 0)?.top ?? 999;
                  const loc = L.posicion(raiz, { contenedores: '.turno' });
                  ok({ top: Math.round(top), frag: loc.locations.fragments[0] }); }, 800); })""")
            check(abs(salto["top"]) <= 2 and salto["frag"] == "c-203-3",
                  f"content-visibility: el salto al párrafo c-203-3 queda en su sitio tras asentarse ({salto['top']} px) y posicion() lo devuelve ({salto['frag']})")
            retoma = pg.evaluate("""() => new Promise((ok) => {
                const raiz = document.getElementById('cv');
                const loc = L.posicion(raiz, { contenedores: '.turno' });
                document.documentElement.style.fontSize = '125%';
                L.irA(raiz, loc, { contenedores: '.turno', estable: 500 });
                setTimeout(() => { const l2 = L.posicion(raiz, { contenedores: '.turno' });
                  document.documentElement.style.fontSize = ''; ok([loc.locations.fragments[0], l2.locations.fragments[0]]); }, 800); })""")
            orden = lambda f: [int(x) for x in f.split("-")[1:]]
            check(retoma[0] == retoma[1] or abs(orden(retoma[0])[0] - orden(retoma[1])[0]) == 0,
                  f"content-visibility: retoma tras agrandar la letra, mismo párrafo o mismo turno ({retoma[0]} → {retoma[1]})")
            check(not err, f"sin excepciones {err[:1]}")
            b.close()
    srv.shutdown()
    print("\nTODO OK" if not fallos else f"\n{len(fallos)} FALLO(S)")
    return 1 if fallos else (2 if sin_motor else 0)


if __name__ == "__main__":
    sys.exit(main())

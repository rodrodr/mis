#!/usr/bin/env python3
"""prueba_kit.py · prueba cada pieza del kit en navegadores reales (Playwright).

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_kit.py [--motores chromium,firefox,webkit]

Comprueba: build-tokens.mjs (incluido un fallo de contraste provocado, el resolver por defecto junto
al script desde cualquier cwd y un error limpio si falta), tokens en los contextos (tema del sistema,
tema forzado, alto contraste, movimiento reducido), la CASCADA REAL de lectura.resolver.json (cuatro
temas con el sistema en claro y en oscuro, con y sin alto contraste: los 13 pares medidos en el
navegador) y sus preferencias tras recargar, color resuelto para canvas y para motores (hex, rgba),
base.css (capas, desborde a 320 px), movimiento.css (estado final visible sin soporte y con
movimiento reducido), isla.js (carga al entrar, pausa al salir y sin foco con pausa-sin-foco,
destroy sin rAF ni listeners),
feedback.js (sonido apagado por defecto, un solo AudioContext, limitador, región viva, preferencias
persistidas). Sale con 1 si algo falla y con 2 si un motor no arranca en el entorno.
"""
import argparse, functools, http.server, json, pathlib, shutil, subprocess, sys, tempfile, threading

KITS = pathlib.Path(__file__).resolve().parent.parent
fallos: list[str] = []
no_disponibles: list[str] = []


def check(cond, texto):
    print(("  ok  " if cond else "  NO  ") + texto)
    if not cond:
        fallos.append(texto)


def prueba_build():
    print("build-tokens.mjs")
    r = subprocess.run(["node", "build-tokens.mjs"], cwd=KITS / "tokens", capture_output=True, text=True)
    check(r.returncode == 0, "compila el resolver y mide los 13 pares en 4 contextos")
    css = (KITS / "tokens/dist/tokens.css").read_text()
    check(css.count("@layer tokens") == 1 and "light-dark(" not in css, "un único @layer tokens, bloques por contexto (sin light-dark)")
    check('[data-theme="dark"]' in css and "prefers-contrast: more" in css and "prefers-reduced-motion: reduce" in css, "emite tema, contraste y movimiento")
    # fallo provocado: gris secundario demasiado claro → el build debe negarse a escribir
    tmp = pathlib.Path(tempfile.mkdtemp())
    shutil.copytree(KITS / "tokens", tmp / "t", ignore=shutil.ignore_patterns("dist"))
    t = json.loads((tmp / "t/tokens.json").read_text())
    t["color"]["text"]["secondary"]["$value"] = "{color.neutral.400}"
    (tmp / "t/tokens.json").write_text(json.dumps(t))
    r = subprocess.run(["node", "build-tokens.mjs"], cwd=tmp / "t", capture_output=True, text=True)
    check(r.returncode == 1 and "contraste" in r.stderr and not (tmp / "t/dist/tokens.css").exists(), "un contraste insuficiente para el build (código 1, sin escribir)")
    t["color"]["text"]["secondary"]["$value"] = {"colorSpace": "oklch", "components": [0.5, 0.35, 150]}
    (tmp / "t/tokens.json").write_text(json.dumps(t))
    r = subprocess.run(["node", "build-tokens.mjs", "--sin-contraste"], cwd=tmp / "t", capture_output=True, text=True)
    check(r.returncode == 1 and "fuera de sRGB" in r.stderr, "un color fuera de sRGB para el build")
    # desde otro cwd: sin argumento usa el resolver junto al script; con uno que no existe, error limpio
    t["color"]["text"]["secondary"]["$value"] = "{color.neutral.600}"
    (tmp / "t/tokens.json").write_text(json.dumps(t))
    r = subprocess.run(["node", str(tmp / "t/build-tokens.mjs")], cwd=tmp, capture_output=True, text=True)
    check(r.returncode == 0 and (tmp / "t/dist/tokens.css").exists(), "desde otro cwd y sin argumento: usa el tokens.resolver.json de su carpeta")
    r = subprocess.run(["node", str(tmp / "t/build-tokens.mjs"), "no-existe.json"], cwd=tmp, capture_output=True, text=True)
    check(r.returncode == 1 and "no encuentro el resolver" in r.stderr and "node:fs" not in r.stderr, "resolver que no existe: mensaje limpio, sin traza de Node")
    r = subprocess.run(["node", "build-tokens.mjs"], cwd=KITS / "tokens", capture_output=True, text=True)
    check("APCA Lc" in r.stdout and (KITS / "tokens/dist/preferencias.inline.js").exists(), "APCA Lc como segunda columna y script de preferencias generado")
    # un segundo fichero en el set base (paleta de juego de ejemplo): sus pares se SUMAN a los de tokens.json
    # y los no textuales (min 3) pasan con 4,5 en alto contraste sin declarar minAlto
    r2 = json.loads((tmp / "t/tokens.resolver.json").read_text())
    r2["sets"]["base"]["sources"].append({"$ref": "juego.ejemplo.tokens.json"})
    (tmp / "t/tokens.resolver.json").write_text(json.dumps(r2))
    r = subprocess.run(["node", "build-tokens.mjs"], cwd=tmp / "t", capture_output=True, text=True)
    check(r.returncode == 0 and "23 pares" in r.stdout and "foco-papel / color.juego.ficha" in r.stdout and "(mín. 4.5)" in r.stdout,
          "juego.ejemplo.tokens.json: 13 + 10 pares medidos; foco propio de la superficie invertida")
    shutil.rmtree(tmp)


def preparar_lectura():
    """Copia del kit con los tokens construidos desde lectura.resolver.json (sepia y negro)."""
    tmp = pathlib.Path(tempfile.mkdtemp()) / "kits"
    shutil.copytree(KITS, tmp, ignore=shutil.ignore_patterns("dist", "__pycache__", ".verificacion"))
    r = subprocess.run(["node", "tokens/build-tokens.mjs", "tokens/lectura.resolver.json"], cwd=tmp, capture_output=True, text=True)
    check(r.returncode == 0, "lectura.resolver.json compila (13 pares × 8 contextos)")
    pares = json.loads((KITS / "tokens/tokens.json").read_text())["$extensions"]["es.maestro"]["contraste"]
    return tmp, pares


def servir(raiz=KITS):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(raiz)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/pruebas/demo.html"


# contraste WCAG 2 de un par con el color COMPUTADO en el navegador (la cascada real), pasado de
# oklch a sRGB con la misma matemática que build-tokens.mjs; otros formatos, por canvas
CONTRASTE = r"""([texto, fondo]) => {
  const lin = (c) => {
    const m = c.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)/);
    if (m) {
      const [L, C, H] = m.slice(1).map(Number), h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s].map((x) => Math.min(1, Math.max(0, x)));
    }
    const g = document.createElement('canvas').getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  };
  const col = (t) => { const s = document.createElement('span'); s.style.color = `var(--${t.replace(/\./g, '-')})`; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
  const Y = (t) => { const [r, g, b] = lin(col(t)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [x, y] = [Y(texto), Y(fondo)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}"""


def prueba_lectura_temas(p, motor, raiz, pares):
    """La cascada real con lectura.resolver.json: lo que mide el build es lo que pinta el navegador."""
    try:
        nav = getattr(p, motor).launch(timeout=45000)
    except Exception:
        return
    srv, url = servir(raiz)
    peores = []
    for tema in ("light", "dark", "sepia", "black"):
        for sistema in ("light", "dark"):
            for alto in ("no-preference", "more"):
                ctx = nav.new_context(color_scheme=sistema, contrast=alto)
                pg = ctx.new_page()
                pg.goto(url, wait_until="networkidle")
                pg.evaluate(f"document.documentElement.dataset.theme = '{tema}'")
                for par in pares:
                    # la misma regla que build-tokens.mjs: sin minAlto, 7:1 para texto y 4,5:1 para lo demás
                    minimo = (par.get("minAlto") or (max(par["min"], 7) if par["min"] >= 4.5 else max(par["min"], 4.5))) if alto == "more" else par["min"]
                    ratio = pg.evaluate(CONTRASTE, [par["texto"], par["fondo"]])
                    if ratio + 0.01 < minimo:
                        peores.append(f"{tema}/sistema {sistema}/{alto}: {par['texto']} sobre {par['fondo']} {ratio:.2f}:1 < {minimo}")
                ctx.close()
    check(not peores, f"cascada real de lectura: 13 pares × 4 temas × sistema claro y oscuro × alto contraste, todos en su mínimo {peores[:3]}")
    # preferencias de lectura aplicadas antes del primer pintado, tras recargar
    ctx = nav.new_context(color_scheme="dark")
    pg = ctx.new_page()
    pg.goto(url, wait_until="networkidle")
    # solo las familias marcadas con $extensions["es.maestro"].lectura (lectura.tokens.json) son elegibles:
    # 'mono' ya no compone el cuerpo (antes se aceptaba cualquier font.family.* salvo body)
    opciones = pg.evaluate("import('/preferencias.js').then((m) => m.prefs.opciones().familias)")
    check(opciones == ["serif", "sans", "dyslexic"], f"familias elegibles: solo las marcadas para lectura {opciones}")
    pg.evaluate("import('/preferencias.js').then((m) => m.prefs.set({ theme: 'sepia', scale: 1.25, leading: 1.7, measure: 60, family: 'serif' }))")
    pg.wait_for_timeout(100)
    pg.reload(wait_until="networkidle")
    st = pg.evaluate("""() => { const d = document.documentElement, s = getComputedStyle(d);
        return [d.dataset.theme, s.getPropertyValue('--reader-scale').trim(), s.getPropertyValue('--leading-reading').trim(),
                s.getPropertyValue('--measure-reading').trim(), d.style.getPropertyValue('--font-family-reading').trim()]; }""")
    check(st == ["sepia", "1.25", "1.7", "60", "var(--font-family-serif)"], f"tras recargar: sepia, tamaño, interlineado, medida y familia aplicados por el script en línea {st}")
    pg.evaluate("localStorage.setItem('prefs', JSON.stringify({ theme: 'rosa', scale: 9, family: 'mono' }))")
    pg.reload(wait_until="networkidle")
    check(pg.evaluate("[document.documentElement.dataset.theme ?? null, document.documentElement.style.getPropertyValue('--reader-scale'), document.documentElement.style.getPropertyValue('--font-family-reading')]") == [None, "", ""],
          "un tema desconocido, un tamaño fuera de rango o la familia mono no se aplican")
    # los primitivos de todos los temas están en la base: una muestra de sepia se pinta estando en negro
    pg.evaluate("document.documentElement.dataset.theme = 'black'")
    check(pg.evaluate(COLOR, "--color-sepia-paper") not in ("", "rgba(0, 0, 0, 0)"), "primitivos de sepia disponibles en el tema negro (selector de tema)")
    ctx.close()
    srv.shutdown()
    nav.close()


VAR = "(n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()"
COLOR = """(n) => { const s = document.createElement('span'); s.style.color = `var(${n})`; document.body.append(s);
  const c = getComputedStyle(s).color; s.remove(); return c; }"""


def prueba_navegador(p, motor, url):
    print(f"{motor}")
    try:
        nav = getattr(p, motor).launch(timeout=45000)
    except Exception as e:  # fallo del entorno, no del kit
        no_disponibles.append(motor)
        print(f"  --  no arranca en este entorno: {str(e).splitlines()[0][:120]}")
        return

    def pagina(**kw):
        ctx = nav.new_context(viewport=kw.pop("viewport", {"width": 390, "height": 844}), **kw)
        pg = ctx.new_page()
        errores = []
        pg.on("pageerror", lambda e: errores.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errores.append(m.text))
        pg.goto(url, wait_until="networkidle")
        return ctx, pg, errores

    # --- tokens y contextos
    ctx, pg, err = pagina(color_scheme="light")
    claro = pg.evaluate(COLOR, "--color-bg-base")
    ctx.close()
    ctx, pg, err = pagina(color_scheme="dark")
    oscuro = pg.evaluate(COLOR, "--color-bg-base")
    check(claro != oscuro, f"tema del sistema: fondo claro {claro} ≠ oscuro {oscuro}")
    pg.evaluate("document.documentElement.dataset.theme = 'light'")
    check(pg.evaluate(COLOR, "--color-bg-base") == claro, "data-theme=light gana al sistema oscuro")
    check(pg.evaluate("getComputedStyle(document.documentElement).colorScheme") == "light", "y fija color-scheme: light (controles nativos claros)")
    ctx.close()
    ctx, pg, err = pagina(color_scheme="dark", contrast="more")
    check(pg.evaluate(COLOR, "--color-text-secondary") == pg.evaluate(COLOR, "--color-text-primary"), "alto contraste en oscuro: secundario = primario del tema oscuro")
    check(pg.evaluate(COLOR, "--color-bg-base") == oscuro, "alto contraste no devuelve el fondo a claro")
    ctx.close()
    ctx, pg, err = pagina(reduced_motion="reduce")
    check(pg.evaluate(VAR, "--motion-distance") == "0px", "movimiento reducido: --motion-distance 0px")
    check(pg.evaluate(VAR, "--dur-overlay") == "150ms", "movimiento reducido: los fundidos se quedan (150ms)")
    visible = pg.evaluate("() => { const e = document.querySelector('.revela'); const s = getComputedStyle(e); return [s.opacity, s.animationName]; }")
    check(visible == ["1", "none"], f"revelado con movimiento reducido: visible y sin animación {visible}")
    ctx.close()

    # --- base y movimiento sin preferencia
    ctx, pg, err = pagina(viewport={"width": 320, "height": 700})
    check(pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), "sin desborde horizontal a 320 px")
    # [hidden] gana a cualquier componente con display (va en @layer utilities); guionado solo en la prosa
    oculto = pg.evaluate("""() => { const st = document.createElement('style'); st.textContent = '@layer components { .x-flex { display: flex } }';
        document.head.append(st); const d = document.createElement('div'); d.className = 'x-flex'; d.hidden = true; d.textContent = 'no debe verse';
        document.body.append(d); const r = [getComputedStyle(d).display, d.offsetHeight]; d.remove(); st.remove(); return r; }""")
    check(oculto == ["none", 0], f"[hidden] gana a un componente con display: flex {oculto}")
    guion = pg.evaluate("""() => { const m = document.createElement('div'); m.innerHTML = '<p>fuera</p><div class="lectura"><p>dentro <abbr class="siglas">CGOCUS</abbr></p></div>';
        document.body.append(m); const [a, b] = m.querySelectorAll('p'), s = m.querySelector('abbr');
        const r = [getComputedStyle(a).hyphens, getComputedStyle(b).hyphens, getComputedStyle(s).hyphens]; m.remove(); return r; }""")
    check(guion == ["manual", "auto", "none"], f"guionado solo en la prosa (.lectura/.prosa) y nunca en siglas {guion}")
    capas = pg.evaluate("""() => { for (const h of document.styleSheets) { try { for (const r of h.cssRules)
        if (r.constructor.name === 'CSSLayerStatementRule') return r.nameList.join(','); } catch (e) {} } return ''; }""")
    check(capas == "reset,tokens,base,layouts,components,utilities", f"orden de capas declarado una vez: {capas}")
    anim = pg.evaluate("() => getComputedStyle(document.querySelector('.revela')).animationName")
    soporta = pg.evaluate("CSS.supports('animation-timeline: view()')")
    check((anim == "revela") == soporta, f"revelado al scroll solo con soporte (soporta={soporta}, animación={anim})")
    op = pg.evaluate("() => { const e = document.querySelector('.revela'); e.scrollIntoView({block: 'center'}); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(getComputedStyle(e).opacity)))); }")
    check(float(op) > 0.5, f"el revelado deja el contenido legible al llegar a él (opacidad {op})")
    ctx.close()

    # --- view transitions: con movimiento reducido, sin desplazamiento (solo el fundido)
    ctx, pg, err = pagina()
    vt = """async (m) => { if (!document.startViewTransition) return null;
        document.documentElement.dataset.motion = m;
        const t = document.startViewTransition(() => { document.body.dataset.vt = m; });
        await t.ready; const n = document.getAnimations().map((a) => a.animationName || '');
        t.skipTransition(); await t.finished.catch(() => {}); return n; }"""
    normal, reduce = pg.evaluate(vt, "normal"), pg.evaluate(vt, "reduce")
    if normal is None:
        print("  --  sin View Transitions en este motor (se omite)")
    else:
        grupo = lambda ns: any("group" in x for x in ns)
        fundido = lambda ns: any("fade" in x for x in ns)
        check(grupo(normal) and not grupo(reduce) and fundido(reduce), f"view transition con data-motion=reduce: sin desplazamiento, con fundido ({len(normal)}→{len(reduce)} animaciones)")
    ctx.close()

    # --- isla: carga perezosa, pausa, tema, destroy sin fugas
    ctx, pg, err = pagina()
    pg.evaluate("""() => { window.__raf = 0; const r = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (f) => r((t) => { window.__raf++; f(t); }); }""")
    check(pg.evaluate("document.querySelector('#isla').dataset.isla") == "espera", "isla fuera de pantalla: no carga (espera)")
    pg.evaluate("document.querySelector('#isla').scrollIntoView()")
    pg.wait_for_function("document.querySelector('#isla').dataset.isla === 'activa'", timeout=5000)
    pg.wait_for_timeout(300)
    f1 = pg.evaluate("window.__pieza.frames")
    check(f1 > 3, f"isla en pantalla: activa y dibujando ({f1} frames)")
    check(pg.evaluate("document.querySelector('#isla canvas').getAttribute('aria-hidden')") == "true", "el canvas va con aria-hidden; la tabla sigue en el DOM")
    # lo que recibe un motor: el mismo color en sRGB de 8 bits, calculado aparte desde el oklch
    hx = pg.evaluate("""() => { const p = window.__pieza, m = p.color.match(/^oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)/);
        if (!m) return null;
        const [L, C, H] = m.slice(1).map(Number), h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
        const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
        const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s];
        const esperado = lin.map((x) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))));
        const leido = [(p.hex >> 16) & 255, (p.hex >> 8) & 255, p.hex & 255];
        return { color: p.color, hex: p.hex.toString(16), esperado, leido, rgba: p.rgba, dif: Math.max(...leido.map((v, i) => Math.abs(v - esperado[i]))) }; }""")
    check(hx and hx["dif"] <= 1 and len(hx["rgba"]) == 4 and hx["rgba"][3] == 1, f"ctx.hex/ctx.rgba: {hx and hx['color']} → 0x{hx and hx['hex']} (sRGB {hx and hx['leido']}, esperado {hx and hx['esperado']})")
    c1 = pg.evaluate("window.__pieza.color")
    pg.evaluate("document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'")
    pg.wait_for_timeout(150)
    check(pg.evaluate("window.__pieza.temas") >= 1 and pg.evaluate("window.__pieza.color") != c1, "cambio de tema: la pieza relee el color resuelto")
    # sin foco: solo con el atributo pausa-sin-foco (juegos, listón 2.1 #7)
    pg.evaluate("dispatchEvent(new Event('blur'))")
    pg.wait_for_timeout(50)
    sin_attr = pg.evaluate("document.querySelector('#isla').dataset.isla")
    pg.evaluate("dispatchEvent(new Event('focus')); document.querySelector('#isla').setAttribute('pausa-sin-foco', ''); dispatchEvent(new Event('blur'))")
    pg.wait_for_timeout(50)
    con_attr = pg.evaluate("document.querySelector('#isla').dataset.isla")
    pg.evaluate("dispatchEvent(new Event('focus'))")
    pg.wait_for_timeout(50)
    vuelve = pg.evaluate("document.querySelector('#isla').dataset.isla")
    pg.evaluate("document.querySelector('#isla').removeAttribute('pausa-sin-foco')")
    check((sin_attr, con_attr, vuelve) == ("activa", "pausada", "activa"), f"ventana sin foco: sigue sin el atributo, se pausa con pausa-sin-foco y vuelve con el foco {(sin_attr, con_attr, vuelve)}")
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_function("document.querySelector('#isla').dataset.isla === 'pausada'", timeout=5000)
    a = pg.evaluate("window.__pieza.frames"); pg.wait_for_timeout(300); b = pg.evaluate("window.__pieza.frames")
    check(a == b, f"isla fuera de pantalla: pausada, sin frames ({a}→{b})")
    pg.evaluate("document.querySelector('#isla').scrollIntoView()")
    pg.wait_for_function("document.querySelector('#isla').dataset.isla === 'activa'", timeout=5000)
    pg.evaluate("document.querySelector('#isla').remove()")
    r0 = pg.evaluate("window.__raf"); pg.wait_for_timeout(300); r1 = pg.evaluate("window.__raf")
    rs = pg.evaluate("window.__pieza.resizes"); pg.evaluate("dispatchEvent(new Event('resize'))")
    check(pg.evaluate("window.__pieza.destruida") and r0 == r1, f"destroy(): pieza liberada y ningún rAF vivo ({r0}→{r1})")
    check(pg.evaluate("window.__pieza.resizes") == rs, "destroy(): los listeners con signal ya no escuchan")
    # registro tardío (p. ej. tras load, para no competir con el LCP): la isla visible espera sin error
    pg.evaluate("""() => { const i = document.createElement('maestro-isla'); i.setAttribute('pieza', 'tardia'); i.id = 'tardia';
        i.innerHTML = '<p>Isla con registro tardío</p>'; document.querySelector('main').prepend(i); i.scrollIntoView(); }""")
    pg.wait_for_timeout(300)
    antes = pg.evaluate("document.querySelector('#tardia').dataset.isla")
    pg.evaluate("import('/isla.js').then((m) => m.registrar('tardia', () => import('/pruebas/pieza-ejemplo.js')))")
    pg.wait_for_function("document.querySelector('#tardia').dataset.isla === 'activa'", timeout=5000)
    check(antes == "espera", f"registro tardío: la isla visible espera sin error ({antes}) y se monta al registrarse")
    check(not err, f"sin errores de consola en la isla {err[:1]}")
    ctx.close()

    # --- feedback: silencio por defecto, un contexto, limitador, región viva, preferencias
    ctx, pg, err = pagina()
    pg.evaluate("""() => { window.__ac = 0; const AC = window.AudioContext;
        window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac++; } };
        window.__osc = 0; const co = AC.prototype.createOscillator;
        AC.prototype.createOscillator = function (...a) { window.__osc++; return co.apply(this, a); };
        window.__vib = 0; navigator.vibrate = () => { window.__vib++; return true; }; }""")
    pg.click("#guardar")
    check(pg.evaluate("document.querySelector('#guardar').dataset.feedback") == "success", "imagen en el mismo gesto: data-feedback=success")
    pg.wait_for_timeout(100)
    check(pg.evaluate("[...document.querySelectorAll('[role=status]')].some(r => r.textContent === 'Cambios guardados.')"), "mensaje en la región viva role=status")
    check(pg.evaluate("window.__ac") == 0, "sonido apagado por defecto: no se crea AudioContext")
    check(pg.evaluate("window.__vib") == 1, "háptica por el adaptador (navigator.vibrate)")
    pg.wait_for_timeout(600)
    check(pg.evaluate("document.querySelector('#guardar').dataset.feedback") is None, "data-feedback se retira solo")
    pg.click("#fallar")
    pg.wait_for_timeout(100)
    check(pg.evaluate("[...document.querySelectorAll('[role=alert]')].some(r => r.textContent.startsWith('No se ha podido'))"), "el error va a role=alert")
    pg.click("#sonido")
    check(pg.evaluate("JSON.parse(localStorage.getItem('prefs')).sound") is True, "activar sonido persiste en localStorage")
    pg.click("#guardar"); pg.click("#guardar")
    check(pg.evaluate("window.__ac") == 1, "con sonido: un único AudioContext compartido")
    pg.wait_for_timeout(200)
    check(pg.evaluate("window.__osc") >= 2, f"con sonido: los tonos se programan también en el primer gesto ({pg.evaluate('window.__osc')} osciladores)")
    vib0 = pg.evaluate("window.__vib")
    pg.evaluate("import('/feedback.js').then(m => { for (let i = 0; i < 30; i++) m.feedback('select'); })")
    pg.wait_for_timeout(100)
    check(pg.evaluate("window.__vib") - vib0 <= 8, f"limitador: ≤ 8 disparos por segundo ({pg.evaluate('window.__vib') - vib0} de 30)")
    pg.reload(wait_until="networkidle")
    check(pg.evaluate("document.querySelector('#sonido').getAttribute('aria-pressed')") == "true", "la preferencia de sonido sobrevive a la recarga")
    pg.click("#tema"); pg.click("#tema")
    pg.reload(wait_until="networkidle")
    check(pg.evaluate("document.documentElement.dataset.theme") == "dark", "tema elegido aplicado antes del primer pintado (script en línea)")
    check(not err, f"sin errores de consola en feedback {err[:1]}")
    ctx.close()
    nav.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--motores", default="chromium,firefox,webkit")
    a = ap.parse_args()
    prueba_build()
    lectura, pares = preparar_lectura()
    from playwright.sync_api import sync_playwright
    srv, url = servir()
    with sync_playwright() as p:
        for m in a.motores.split(","):
            prueba_navegador(p, m, url)
            if m not in no_disponibles:
                print(f"{m} · temas de lectura")
                prueba_lectura_temas(p, m, lectura, pares)
    srv.shutdown()
    shutil.rmtree(lectura.parent, ignore_errors=True)
    if fallos:
        print(f"\n{len(fallos)} FALLO(S)")
        return 1
    print("\nTODO OK" + (f" · sin probar en {', '.join(no_disponibles)} (no arranca)" if no_disponibles else ""))
    return 2 if no_disponibles else 0


if __name__ == "__main__":
    sys.exit(main())

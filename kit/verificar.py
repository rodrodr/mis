#!/usr/bin/env python3
"""verificar.py · protocolo acotado de verificación (reference/verificacion.md).

Una ejecución = una ronda. Por cada motor × ancho × tema:
  carga (load + red en calma con tope), recorre la página por pasos y monta cada <maestro-isla>
  hasta que llega a activa, pausada o error; DESPUÉS del montaje: captura, errores de consola y
  excepciones, desborde horizontal (con los culpables), axe-core (jsDelivr, versión fijada) e
  información de LCP/CLS de laboratorio (solo Chromium). Una isla en error falla la puerta.
Además, en Chromium con un contexto táctil de móvil: presupuesto de bytes (JS antes de interactuar y
con las islas montadas, peso inicial; gzip -9 medido), tamaño de los objetivos (fallo < 24 px sin la
excepción de espaciado de WCAG 2.5.8; aviso < 44 px con pointer: coarse) y, con --fps, FPS con la
isla montada, tras --accion y con CPU ralentizada, contra --p95-max y --largos-max.
Y: una captura con movimiento reducido, el detector de impeccable (modo URL, renderizado) y lectura
sin JS con --sin-js (captura con las animaciones llevadas a su final; texto contado con textContent,
que incluye lo que content-visibility no pinta).
Estados que no están al cargar (--estado nombre=acción, en orden): se ejecutan tras montar y se
capturan (y en la puerta, con axe y consola): velos de un juego, paneles de un lector, diálogos.
Lectura larga (--tipo lectura o --muestras "#a,#b"): la ronda se juzga en VENTANAS en esos anclajes,
no en una tira de página entera (con content-visibility salía en blanco más allá de la primera pantalla).

Rondas (impeccable: «pases acotados, no bucles»):
  sin --puerta  ronda de JUICIO de diseño: capturas de página entera. Cuenta en un registro global
                (~/.cache/maestro-diseno-web/rondas.json, --rondas para otro), el mismo desde
                cualquier cwd; la ronda se anota al terminar, no al empezar. El techo son 2: la
                tercera no se ejecuta salvo con --ronda-extra "motivo" (decidido con el usuario).
  --puerta      matriz TÉCNICA automatizada (contrato 9): no cuenta como ronda. Por defecto
                Chromium + WebKit × 2 temas × 3 anchos; Firefox se declara incompleto sin lanzarlo
                (no arranca en este entorno: precedencia L5). --motores chromium,firefox,webkit lo intenta.

Uso:
  python3 verificar.py pagina.html [--raiz DIR]         sirve DIR por HTTP (módulos ES y rutas ../)
  python3 verificar.py https://localhost:4321/          URL ya servida
  opciones: --anchos 1280x800,390x844  --temas light,dark  --motores chromium,webkit
            --salida .verificacion  --puerta  --sin-js  --sin-axe  --sin-detector
            --espera load|networkidle (load: red en calma 3 s como mucho; networkidle: hasta 30 s)
            --tipo landing|lectura|datos|app|juego|experiencia (presupuestos por defecto del tipo)
            --presupuesto-js KB  --presupuesto-total KB    (gzip; sustituyen a los del tipo)
            --fps 5 --cpu 4 [--p95-max 16.7] [--largos-max 0] [--accion "#jugar" | "js:código"]
                  [--fps-en "selector"] (por defecto, la primera maestro-isla)
            --estricto (los hallazgos del detector también fallan la puerta)
            --lectura ["main p"] (medida real en caracteres por línea: 45–75, ≥ 35 en móvil;
                  pasa un selector de PROSA: "main p" mezcla asientos y notas. Sin medida = incompleta)
            --estado "pausa=#pausar" --estado "fin=js:window.__juego.api.terminar()"   (repetible)
            --muestras "#t-21,#t-55,#votacion"   (ventanas de lectura; con --tipo lectura sin
                  --muestras: 0 %, 33 %, 66 % y final de la página)
            --excepciones [PRODUCT.md]  reglas del detector aceptadas por la identidad: las que cita
                  (entre `acentos graves`) la sección «Excepciones a los contratos»; salen aparte y no
                  fallan con --estricto. line-length y text-overflow no se aceptan nunca en bloque.
            --revision DIR  (ronda) dónde copiar desktop.png y mobile.png para el revisor final;
                  por defecto, la carpeta .impeccable/review más cercana hacia arriba (o la del cwd)
            --rondas FICHERO  --reiniciar-rondas (solo por decisión del usuario)
Salida: PNG por combinación + informe.json (con las 3 mayores fuentes de desplazamiento del CLS y los
candidatos de medida larga, para localizar los hallazgos del detector que llegan sin selector).
Código: 0 ok · 1 puerta fallida · 2 incompleta (un motor, una combinación o el detector no corrió) · 3 techo de rondas.
Requisitos: python3 con playwright (pip) y sus navegadores ya instalados.
"""
from __future__ import annotations

import argparse, functools, gzip, http.server, json, os, pathlib, subprocess, sys, threading, urllib.parse, urllib.request
from datetime import datetime

AXE_VERSION = "4.13.0"
AXE_URL = f"https://cdn.jsdelivr.net/npm/axe-core@{AXE_VERSION}/axe.min.js"
IMPECCABLE = pathlib.Path.home() / ".claude/skills/impeccable/scripts/impeccable"
RONDAS = pathlib.Path(os.environ.get("XDG_CACHE_HOME") or pathlib.Path.home() / ".cache") / "maestro-diseno-web" / "rondas.json"
ESTABLES = ("activa", "pausada", "error", "destruida")

# kB gzip: (JS antes de interactuar, JS con las islas montadas, peso inicial). None = sin tope.
# Contrato 8 y tabla de enrutado de SKILL.md.
PRESUPUESTOS = {
    "landing": (50, None, 1000),
    "lectura": (50, None, None),
    "datos": (50, None, None),
    "app": (100, None, None),
    "juego": (None, 500, None),
    "experiencia": (300, None, None),   # la isla del primer viewport cuenta dentro
}

DESBORDE_JS = """() => {
  const w = document.documentElement.clientWidth, culpables = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > w + 1 || r.left < -1)) {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || el.closest('[popover]:not(:popover-open), dialog:not([open]), [hidden]')) continue;
      culpables.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList[0] ? '.' + el.classList[0] : '') + ' →' + Math.round(r.right - w) + 'px');
      if (culpables.length >= 8) break;
    }
  }
  return { desborda: document.documentElement.scrollWidth > w + 1, scrollWidth: document.documentElement.scrollWidth, ancho: w, culpables };
}"""

METRICAS_JS = """() => new Promise((ok) => {
  let lcp = null, cls = 0; const fuentes = [];
  const nombre = (n) => !n ? '(nodo retirado)' : n.nodeType !== 1 ? '#texto en ' + nombre(n.parentElement) :
    n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList[0] ? '.' + n.classList[0] : '');
  const caja = (r) => r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  try {
    new PerformanceObserver((l) => { const e = l.getEntries(); if (e.length) lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
      cls += e.value;
      for (const f of e.sources || []) fuentes.push({ valor: Math.round(e.value * 1000) / 1000, nodo: nombre(f.node), antes: caja(f.previousRect), despues: caja(f.currentRect) });
    } }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  // las 3 mayores fuentes del CLS: qué se movió (nodo y cajas [x, y, ancho, alto] antes y después)
  setTimeout(() => ok({ lcp_ms: lcp && Math.round(lcp), cls: Math.round(cls * 1000) / 1000,
    cls_fuentes: fuentes.sort((a, b) => b.valor - a.valor).slice(0, 3) }), 600);
})"""

# candidatos de medida larga (> 80 caracteres por línea, aprox. ancho / (0,5 × tamaño de letra)): el
# detector da «line-length» sin selector; esto dice dónde mirar
LINEAS_JS = """() => {
  const fuera = [];
  for (const el of document.querySelectorAll('p, li, dd, dt, figcaption, caption, blockquote, td, th, label, summary, div, span')) {
    const propio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('').trim();
    if (propio.length < 80) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || s.display === 'none' || s.visibility === 'hidden') continue;
    const cpl = Math.round(r.width / (0.5 * parseFloat(s.fontSize)));
    if (cpl > 80) fuera.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList[0] ? '.' + el.classList[0] : '') + ' ~' + cpl + ' car./línea «' + propio.slice(0, 40) + '…»');
    if (fuera.length >= 8) break;
  }
  return fuera;
}"""

# texto legible sin JS: textContent (incluye lo que content-visibility no pinta y que innerText no
# cuenta: 2 956 frente a 255 185 caracteres en el lector de ejemplo), sin lo oculto con [hidden]
TEXTO_JS = """() => {
  // sin callbacks (TreeWalker con filtro): con JavaScript desactivado no se pueden ejecutar
  const raiz = document.querySelector('main') || document.body;
  const copia = raiz.cloneNode(true);
  copia.querySelectorAll('script, style, template, [hidden]:not([hidden="until-found"])').forEach((e) => e.remove());
  return { texto: copia.textContent.replace(/\\s+/g, ' ').trim().length, visible: raiz.innerText.trim().length };
}"""

# para capturar página entera: lo saltado por content-visibility se pinta (menos until-found, que es
# contenido plegado de verdad)
CV_VISIBLE = "*:not([hidden=\"until-found\"]) { content-visibility: visible !important; }"
# add_style_tag espera al evento load de la hoja y, con JavaScript desactivado, no vuelve nunca
ESTILO_JS = "(css) => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }"

MEDIDA_JS = """(sel) => {
  let chars = 0, lineas = 0, n = 0;
  for (const p of document.querySelectorAll(sel)) {
    const r = new Range(); r.selectNodeContents(p);
    const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
    if (tops.size < 3) continue;                       // solo párrafos de 3+ líneas
    chars += p.textContent.replace(/\\s+/g, ' ').trim().length; lineas += tops.size - 0.5; n++;   // la última línea cuenta media
  }
  return n ? { caracteres_por_linea: Math.round(chars / lineas), parrafos: n } : null;
}"""

FPS_JS = """(ms) => new Promise((ok) => {
  const d = []; let prev = performance.now(); const fin = prev + ms;
  (function f(t) { d.push(t - prev); prev = t; if (t < fin) requestAnimationFrame(f); else {
    d.shift(); d.sort((a, b) => a - b);
    const p95 = d[Math.floor(d.length * 0.95)] || 0, media = d.reduce((a, b) => a + b, 0) / (d.length || 1);
    ok({ fps: Math.round(1000 / media), p95_ms: Math.round(p95 * 10) / 10, frames_largos: d.filter((x) => x > 33.4).length, muestras: d.length });
  } })(prev);
})"""

# recorre la página por pasos (dispara IntersectionObserver, cargas perezosas y revelados) y vuelve arriba
RECORRER_JS = """async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let y = 0, pasos = 0;
  while (y < document.documentElement.scrollHeight && pasos < 60) { scrollTo(0, y); await espera(120); y += innerHeight * 0.8; pasos++; }
  return pasos;
}"""

ISLAS_JS = """() => [...document.querySelectorAll('maestro-isla')].map((e) => ({ pieza: e.getAttribute('pieza') || '?', id: e.id || '', estado: e.dataset.isla || '' }))"""

RECURSOS_JS = """() => [location.href, ...performance.getEntriesByType('resource').map((e) => e.name)]"""

OBJETIVOS_JS = """() => {
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"])';
  const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList[0] ? '.' + el.classList[0] : '') + (el.textContent.trim() ? ' «' + el.textContent.trim().slice(0, 24) + '»' : '');
  const cajas = [];
  for (const el of document.querySelectorAll(SEL)) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (s.visibility === 'hidden' || s.display === 'none' || r.width <= 1 || r.height <= 1) continue;
    if (el.closest('[hidden], [inert], dialog:not([open]), [popover]:not(:popover-open)')) continue;
    if (/inset\\(50%/.test(s.clipPath || '')) continue;                    // enlace de salto y visualmente-oculto
    // excepción «en línea» de 2.5.8: enlace dentro de una frase
    const linea = el.tagName === 'A' && s.display === 'inline' && (el.parentElement?.textContent.trim().length ?? 0) > el.textContent.trim().length + 1;
    cajas.push({ el, r, linea });
  }
  const centro = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  const peq = cajas.filter((c) => !c.linea && (c.r.width < 24 || c.r.height < 24));
  const fallos = [];
  for (const c of peq) {
    const [cx, cy] = centro(c.r);
    // excepción de espaciado: un círculo de 24 px centrado en el objetivo no corta ningún otro objetivo
    // ni el círculo de otro objetivo pequeño
    const corta = cajas.some((o) => {
      if (o === c || o.el.contains(c.el) || c.el.contains(o.el)) return false;
      const x = Math.max(o.r.left, Math.min(cx, o.r.right)), y = Math.max(o.r.top, Math.min(cy, o.r.bottom));
      if ((x - cx) ** 2 + (y - cy) ** 2 < 144) return true;
      if (peq.includes(o)) { const [ox, oy] = centro(o.r); return Math.hypot(ox - cx, oy - cy) < 24; }
      return false;
    });
    if (corta) fallos.push(nombre(c.el) + ' ' + Math.round(c.r.width) + '×' + Math.round(c.r.height));
  }
  const avisos = cajas.filter((c) => !c.linea && (c.r.width < 44 || c.r.height < 44)).map((c) => nombre(c.el) + ' ' + Math.round(c.r.width) + '×' + Math.round(c.r.height));
  return { objetivos: cajas.length, fallos, avisos: avisos.length, ejemplos_aviso: avisos.slice(0, 8) };
}"""


class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # sin ruido en la salida
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def servir(raiz: pathlib.Path):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Silencioso, directory=str(raiz)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def axe_fuente(cache: pathlib.Path) -> str | None:
    f = cache / f"axe-{AXE_VERSION}.min.js"
    if not f.exists():
        try:
            with urllib.request.urlopen(AXE_URL, timeout=30) as r:
                f.write_bytes(r.read())
        except Exception as e:  # sin red: se informa, no se inventa un resultado
            print(f"  aviso: no se pudo descargar axe ({e}); se omite", file=sys.stderr)
            return None
    return f.read_text(encoding="utf-8")


def detector(objetivo: str, viewport: str, aceptadas: set = frozenset()) -> dict:
    if not IMPECCABLE.exists():
        return {"error": f"no está instalado ({IMPECCABLE})"}
    try:
        p = subprocess.run([str(IMPECCABLE), "detect", "--json", "--viewport", viewport, objetivo],
                           capture_output=True, text=True, timeout=300)
        # códigos del detector: 0 sin hallazgos, 2 con hallazgos; cualquier otro es que no pudo
        # analizar (p. ej. URL inalcanzable: sale con 1 e imprime «[]»). Nunca se lee como «0 hallazgos».
        if p.returncode not in (0, 2):
            return {"error": (p.stderr.strip().splitlines() or [f"código {p.returncode}"])[-1][:200]}
        hallazgos = json.loads(p.stdout or "[]")
    except Exception as e:
        return {"error": str(e)[:200]}
    primarios = [h for h in hallazgos if not h.get("advisory")]
    aceptados = [h for h in primarios if h.get("antipattern") in aceptadas]
    return {"primarios": len(primarios) - len(aceptados), "aceptados_por_identidad": len(aceptados),
            "avisos": len(hallazgos) - len(primarios),
            "hallazgos": [f"{h.get('severity')}: {h.get('antipattern')} · {h.get('snippet', '')}" for h in primarios if h not in aceptados]
                         + [f"advisory: {h.get('antipattern')} · {h.get('snippet', '')}" for h in hallazgos if h.get("advisory")],
            "aceptados": sorted({f"{h.get('antipattern')} ×{sum(1 for x in aceptados if x.get('antipattern') == h.get('antipattern'))}" for h in aceptados})}


# reglas del detector que nunca se aceptan en bloque: miden la legibilidad, no el gusto
NUNCA_ACEPTAR = {"line-length", "text-overflow"}


def reglas_aceptadas(product: pathlib.Path | None) -> tuple[set, str | None]:
    """Reglas del detector citadas (`regla`) en la sección «Excepciones a los contratos» de PRODUCT.md
    (hasta el siguiente título de su mismo nivel o superior)."""
    if not product or not product.exists():
        return set(), None
    import re
    lineas = product.read_text(encoding="utf-8").splitlines()
    ini = next((i for i, l in enumerate(lineas) if re.match(r"#+ .*Excepciones", l)), None)
    if ini is None:
        return set(), f"{product}: sin sección «Excepciones a los contratos»"
    nivel = len(lineas[ini]) - len(lineas[ini].lstrip("#"))
    cuerpo = []
    for l in lineas[ini + 1:]:
        m = re.match(r"(#+) ", l)
        if m and len(m.group(1)) <= nivel:
            break
        cuerpo.append(l)
    reglas = set(re.findall(r"`([a-z]+(?:-[a-z]+)+)`", "\n".join(cuerpo))) - NUNCA_ACEPTAR
    return reglas, None


def tope_proyecto(desde: pathlib.Path) -> pathlib.Path:
    """Hasta dónde se busca hacia arriba: el cwd si contiene la página; si no, la carpeta de la página.
    Nunca más arriba (en el directorio personal puede haber un .impeccable ajeno al proyecto)."""
    cwd = pathlib.Path.cwd()
    return cwd if cwd == desde or cwd in desde.parents else desde


def buscar_arriba(desde: pathlib.Path, nombre: str) -> pathlib.Path | None:
    tope = tope_proyecto(desde)
    for d in [desde, *desde.parents]:
        if (d / nombre).exists():
            return d / nombre
        if d == tope:
            break
    return None


def clave_ronda(objetivo: str, pagina: pathlib.Path | None) -> str:
    """La misma página da la misma clave desde cualquier cwd; en localhost se ignora el puerto."""
    if pagina:
        return str(pagina)
    u = urllib.parse.urlsplit(objetivo)
    host = u.hostname or ""
    if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        host = "localhost"
    elif u.port:
        host = f"{host}:{u.port}"
    return urllib.parse.urlunsplit((u.scheme, host, u.path or "/", u.query, ""))


def leer_rondas(f: pathlib.Path) -> dict:
    try:
        return json.loads(f.read_text()) if f.exists() else {}
    except Exception:
        return {}


def anotar_ronda(f: pathlib.Path, clave: str, extra: str | None, carpeta: pathlib.Path) -> None:
    datos = leer_rondas(f)
    datos.setdefault(clave, []).append({"fecha": datetime.now().isoformat(timespec="seconds"), "capturas": str(carpeta),
                                        **({"motivo_extra": extra} if extra else {})})
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(datos, ensure_ascii=False, indent=1))


def gz_kb(datos: bytes, tipo: str) -> float:
    texto = any(t in tipo for t in ("javascript", "json", "css", "html", "svg", "text", "xml"))
    return round((len(gzip.compress(datos, 9)) if texto else len(datos)) / 1024, 1)


class Bytes:
    """Descarga cada recurso una vez y mide su tamaño en gzip -9 (lo que viajaría comprimido)."""
    def __init__(self):
        self.cache: dict[str, tuple[float, bool]] = {}
        self.errores: list[str] = []

    def medir(self, urls: list[str]) -> dict:
        js = total = 0.0
        for u in dict.fromkeys(urls):
            if not u.startswith(("http://", "https://")):
                continue
            if u not in self.cache:
                try:
                    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "verificar.py"}), timeout=20) as r:
                        tipo = r.headers.get("Content-Type", "")
                        cuerpo = r.read()
                    es_js = "javascript" in tipo or urllib.parse.urlsplit(u).path.endswith((".js", ".mjs"))
                    self.cache[u] = (gz_kb(cuerpo, tipo or ("javascript" if es_js else "")), es_js)
                except Exception as e:
                    self.errores.append(f"{u[:90]}: {str(e)[:80]}")
                    self.cache[u] = (0.0, False)
            kb, es_js = self.cache[u]
            total += kb
            js += kb if es_js else 0
        return {"js_kb": round(js, 1), "total_kb": round(total, 1), "recursos": len(set(urls))}


def accionar(pg, accion: str) -> None:
    """«#selector» pulsa (por coordenadas si está en una barra fija: page.click lo desplaza en Chromium);
    «js:código» lo ejecuta."""
    if accion.startswith("js:"):
        pg.evaluate(accion[3:])
        return
    loc = pg.locator(accion).first
    caja = loc.bounding_box(timeout=5000)
    vp = pg.viewport_size or {"width": 0, "height": 0}
    if caja and 0 <= caja["y"] and caja["y"] + caja["height"] <= vp["height"] and 0 <= caja["x"] <= vp["width"]:
        pg.mouse.click(caja["x"] + caja["width"] / 2, caja["y"] + caja["height"] / 2)   # visible: sin desplazar
    else:
        loc.click(timeout=5000)


def capturar_ventanas(pg, ventanas: list, carpeta: pathlib.Path, nombre: str, notas: set) -> None:
    """Lectura larga: una captura de ventana por anclaje («#id» llega por el hash, como un lector;
    «@0.5» es una fracción de la altura). Nunca la tira de página entera."""
    for k, v in enumerate(ventanas, 1):
        v = v.strip()
        try:
            if v.startswith("@"):
                pg.evaluate("(f) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f)", float(v[1:]))
            else:
                pg.evaluate("(sel) => { const el = document.querySelector(sel); if (!el) throw new Error('no existe ' + sel);"
                            " if (sel.startsWith('#')) location.hash = sel; else el.scrollIntoView({ block: 'start' }); }", v)
            pg.wait_for_timeout(700)   # content-visibility: las secciones vecinas se maquetan después del salto
            pg.screenshot(path=str(carpeta / f"{nombre}_ventana-{k}.png"), animations="disabled")
        except Exception as e:
            notas.add(f"ventana {v}: {str(e).splitlines()[0][:120]}")


def recorrer_estados(pg, estados: list, carpeta: pathlib.Path, nombre: str, axe: str | None,
                     fallos: list, incompleto: list, errores_carga: list) -> list:
    """Estados que no están al cargar, en orden (velos, paneles, diálogos): acción, captura y, en la
    puerta, axe y consola en ese estado. Con pausa-sin-foco, una isla puede quedar «pausada»: vale."""
    filas = []
    errores: list[str] = []
    pg.on("pageerror", lambda e: errores.append(f"excepción: {e}"))
    for estado, accion in estados:
        fila = {"estado": estado, "accion": accion, "ok": False}
        try:
            accionar(pg, accion)
            pg.wait_for_timeout(500)
            pg.screenshot(path=str(carpeta / f"{nombre}_estado-{estado}.png"), animations="disabled")
            fila["ok"] = True
            if axe:
                if not pg.evaluate("typeof axe !== 'undefined'"):
                    pg.add_script_tag(content=axe)
                r = pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id + '×' + v.nodes.length + ' en ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', '))")
                fila["axe_graves"] = r
                if r:
                    fallos.append(f"{nombre} · estado «{estado}»: axe {', '.join(r)}")
        except Exception as e:
            incompleto.append(f"{nombre} · estado «{estado}»: {type(e).__name__}: {str(e).splitlines()[0][:140]}")
        filas.append(fila)
    if errores:
        fallos.append(f"{nombre} · estados: {len(errores)} excepción(es) · {errores[0][:160]}")
    return filas


def cargar(pg, url: str, espera: str, notas: set) -> None:
    pg.goto(url, wait_until="load", timeout=30000)
    tope = 30000 if espera == "networkidle" else 3000
    try:
        pg.wait_for_load_state("networkidle", timeout=tope)
    except Exception:   # sondeo, SSE o balizas: la red nunca se calla; se sigue con lo cargado
        notas.add(f"la red no queda en calma en {tope // 1000} s (sondeo, SSE o balizas): se sigue tras «load»")


def montar_islas(pg, notas: set, fallos: list, nombre: str) -> list:
    """Recorre la página y lleva cada <maestro-isla> a un estado estable. Devuelve su estado."""
    pg.evaluate(RECORRER_JS)
    islas = pg.evaluate(ISLAS_JS)
    for i, isla in enumerate(islas):
        loc = pg.locator("maestro-isla").nth(i)
        try:
            loc.scroll_into_view_if_needed(timeout=5000)
            pg.wait_for_function("(el) => ['activa', 'pausada', 'error', 'destruida'].includes(el.dataset.isla)",
                                 arg=loc.element_handle(timeout=5000), timeout=15000)
        except Exception:
            notas.add(f"isla «{isla['pieza']}» sin estado estable en 15 s")
    islas = pg.evaluate(ISLAS_JS)
    for isla in islas:
        if isla["estado"] == "error":
            fallos.append(f"{nombre}: la isla «{isla['pieza']}»{' #' + isla['id'] if isla['id'] else ''} acabó en error al montarse")
        elif isla["estado"] not in ESTABLES:
            fallos.append(f"{nombre}: la isla «{isla['pieza']}» no terminó de montarse (estado «{isla['estado']}»)")
    pg.evaluate("scrollTo(0, 0)")
    pg.wait_for_timeout(300)
    return islas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("objetivo")
    ap.add_argument("--raiz")
    ap.add_argument("--salida", default=".verificacion")
    ap.add_argument("--anchos")
    ap.add_argument("--temas", default="light,dark")
    ap.add_argument("--motores")
    ap.add_argument("--puerta", action="store_true")
    ap.add_argument("--ronda-extra")
    ap.add_argument("--rondas", default=str(RONDAS))
    ap.add_argument("--reiniciar-rondas", action="store_true")
    ap.add_argument("--espera", choices=("load", "networkidle"), default="load")
    ap.add_argument("--tipo", choices=sorted(PRESUPUESTOS))
    ap.add_argument("--presupuesto-js", type=float)
    ap.add_argument("--presupuesto-total", type=float)
    ap.add_argument("--fps", type=float, default=0)
    ap.add_argument("--cpu", type=float, default=1)
    ap.add_argument("--p95-max", type=float, default=16.7)
    ap.add_argument("--largos-max", type=int, default=0)
    ap.add_argument("--accion")
    ap.add_argument("--fps-en")
    ap.add_argument("--sin-js", action="store_true")
    ap.add_argument("--sin-axe", action="store_true")
    ap.add_argument("--sin-detector", action="store_true")
    ap.add_argument("--estricto", action="store_true")
    ap.add_argument("--lectura", nargs="?", const="main p", default=None,
                    help="mide la medida REAL (caracteres por línea) de la prosa; falla fuera de 45–75 (≥ 35 por debajo de 600 px)")
    ap.add_argument("--estado", action="append", default=[], help='nombre=acción ("#selector" pulsa; "js:código" ejecuta); repetible, en orden')
    ap.add_argument("--muestras", help='anclajes de las ventanas de lectura, p. ej. "#t-21,#t-55"')
    ap.add_argument("--excepciones", nargs="?", const="auto", default=None, help="PRODUCT.md con «Excepciones a los contratos»")
    ap.add_argument("--revision", help="carpeta donde dejar desktop.png y mobile.png para el revisor final")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    anchos = a.anchos or ("1280x800,768x1024,390x844" if a.puerta else "1280x800,390x844")
    motores = (a.motores or "chromium,webkit" if a.puerta else a.motores or "chromium").split(",")
    vistas = [tuple(int(x) for x in v.split("x")) for v in anchos.split(",")]
    movil = min(vistas)
    temas = a.temas.split(",")
    salida = pathlib.Path(a.salida).resolve()
    salida.mkdir(parents=True, exist_ok=True)
    rondas_f = pathlib.Path(a.rondas).expanduser().resolve()

    srv = pagina = None
    if a.objetivo.startswith(("http://", "https://")):
        url = a.objetivo
    else:
        pagina = pathlib.Path(a.objetivo).resolve()
        if not pagina.exists():
            print(f"no existe: {pagina}", file=sys.stderr)
            return 1
        raiz = pathlib.Path(a.raiz).resolve() if a.raiz else (pathlib.Path.cwd() if pathlib.Path.cwd() in pagina.parents else pagina.parent)
        srv, base = servir(raiz)
        url = f"{base}/{pagina.relative_to(raiz).as_posix()}"
    clave = clave_ronda(a.objetivo, pagina)
    base_proyecto = pagina.parent if pagina else pathlib.Path.cwd()
    estados = []
    for e in a.estado:
        nombre_e, _, accion_e = e.partition("=")
        if not accion_e:
            print(f"--estado «{e}»: se espera nombre=acción", file=sys.stderr)
            return 1
        estados.append((nombre_e.strip(), accion_e.strip()))
    if not estados and a.accion and not a.puerta:
        estados.append(("accion", a.accion))       # la ronda también ve lo que hay tras la entrada del jugador
    ventanas = a.muestras.split(",") if a.muestras else (["@0", "@0.33", "@0.66", "@1"] if a.tipo == "lectura" else None)
    aceptadas, aviso_exc = set(), None
    if a.excepciones:
        product = buscar_arriba(base_proyecto, "PRODUCT.md") if a.excepciones == "auto" else pathlib.Path(a.excepciones).resolve()
        aceptadas, aviso_exc = reglas_aceptadas(product)
        if product is None:
            aviso_exc = "--excepciones: no encuentro PRODUCT.md hacia arriba"

    tipo = "puerta técnica (no cuenta como ronda)" if a.puerta else "ronda de juicio"
    if not a.puerta:
        if a.reiniciar_rondas:
            datos = leer_rondas(rondas_f)
            datos.pop(clave, None)
            rondas_f.parent.mkdir(parents=True, exist_ok=True)
            rondas_f.write_text(json.dumps(datos, ensure_ascii=False, indent=1))
        n = len(leer_rondas(rondas_f).get(clave, [])) + 1
        if n > 2 and not a.ronda_extra:
            print(f"TECHO: sería la ronda {n} de juicio sobre {clave}. El techo son 2 (impeccable).\n"
                  f"Registro: {rondas_f}. Decide con el usuario si se financia otra; si sí: --ronda-extra \"motivo\".")
            if srv:
                srv.shutdown()
            return 3
        tipo = f"ronda de juicio {n}/2" + (" (extra)" if n > 2 else "")
    carpeta = salida / datetime.now().strftime("%Y%m%d-%H%M%S")
    carpeta.mkdir(parents=True, exist_ok=True)
    print(f"verificar · {tipo} · {url}\n  capturas → {carpeta}")

    axe = None if a.sin_axe else axe_fuente(salida)
    notas: set[str] = set()
    informe = {"objetivo": clave, "url": url, "tipo": tipo, "combinaciones": [], "fallos": [], "incompleto": [], "omitido": []}
    fallos, incompleto = informe["fallos"], informe["incompleto"]
    if a.puerta and not a.motores:
        incompleto.append("firefox: no se lanza (no arranca en este entorno, precedencia L5); para intentarlo: --motores chromium,firefox,webkit")

    js_max, js_islas_max, total_max = PRESUPUESTOS.get(a.tipo, (None, None, None))
    js_max = a.presupuesto_js if a.presupuesto_js is not None else js_max
    total_max = a.presupuesto_total if a.presupuesto_total is not None else total_max
    bytes_ = Bytes()
    revision: dict = {}

    with sync_playwright() as p:
        for motor in motores:
            try:
                nav = getattr(p, motor).launch(timeout=45000)
            except Exception as e:  # entorno, no página: la puerta queda incompleta, no aprobada
                incompleto.append(f"{motor}: no arranca ({str(e).splitlines()[0][:120]})")
                continue
            for (w, h) in vistas:
                for tema in temas:
                    nombre = f"{motor}_{w}x{h}_{tema}"
                    ctx = nav.new_context(viewport={"width": w, "height": h}, color_scheme=tema, reduced_motion="no-preference")
                    try:
                        pg = ctx.new_page()
                        errores: list[str] = []
                        pg.on("pageerror", lambda e, errores=errores: errores.append(f"excepción: {e}"))
                        pg.on("console", lambda m, errores=errores: m.type == "error" and errores.append(f"consola: {m.text} {(m.location or {}).get('url', '')}".strip()))
                        cargar(pg, url, a.espera, notas)
                        islas = montar_islas(pg, notas, fallos, nombre)
                        if a.puerta or not ventanas:
                            if not a.puerta:
                                pg.evaluate(ESTILO_JS, CV_VISIBLE)
                            pg.screenshot(path=str(carpeta / f"{nombre}.png"), full_page=not a.puerta, animations="disabled")
                        else:   # lectura larga: ventanas en anclajes, llegando como un lector
                            capturar_ventanas(pg, ventanas, carpeta, nombre, notas)
                            pg.evaluate("scrollTo(0, 0)")
                        if not a.puerta and (w, h) in (vistas[0], movil) and tema == temas[0] and motor == motores[0]:
                            revision[(w, h)] = carpeta / f"{nombre}_primera.png"
                            pg.screenshot(path=str(revision[(w, h)]), animations="disabled")
                        # se congela ANTES de axe: su precarga de CSSOM resuelve los @import anidados
                        # contra la URL del documento y provoca 404 que no son de la página
                        errores = list(errores)
                        fila = {"combinacion": nombre, "errores": errores, "islas": islas, "desborde": pg.evaluate(DESBORDE_JS)}
                        if motor == "chromium":
                            fila["laboratorio"] = pg.evaluate(METRICAS_JS)
                            if "candidatos_medida" not in informe:
                                informe["candidatos_medida"] = pg.evaluate(LINEAS_JS)
                        if a.lectura:
                            m = pg.evaluate(MEDIDA_JS, a.lectura)
                            fila["medida"] = m
                            minimo = 45 if w >= 600 else 35
                            if not m:   # ningún párrafo de 3+ líneas con ese selector (o lejos, con content-visibility)
                                incompleto.append(f"{nombre}: medida no comprobada (ningún párrafo de 3+ líneas con «{a.lectura}» en la primera pantalla); pasa un selector de prosa")
                            elif not (minimo <= m["caracteres_por_linea"] <= 75):
                                fallos.append(f"{nombre}: medida real {m['caracteres_por_linea']} caracteres/línea (fuera de {minimo}–75); recalibra --measure-reading")
                        if axe:
                            pg.add_script_tag(content=axe)
                            r = pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, donde: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }))")
                            fila["axe"] = r
                            graves = [v for v in r if v["impacto"] in ("serious", "critical")]
                            if graves:
                                fallos.append(f"{nombre}: axe {', '.join(v['id'] + '×' + str(v['nodos']) + ' en ' + ', '.join(v['donde']) for v in graves)}")
                        if errores:
                            fallos.append(f"{nombre}: {len(errores)} error(es) de consola · {errores[0][:160]}")
                        if fila["desborde"]["desborda"]:
                            fallos.append(f"{nombre}: desborde horizontal {fila['desborde']['scrollWidth']}>{fila['desborde']['ancho']} · {', '.join(fila['desborde']['culpables'][:4])}")
                        if estados:
                            fila["estados"] = recorrer_estados(pg, estados, carpeta, nombre, axe if a.puerta else None, fallos, incompleto, errores)
                        informe["combinaciones"].append(fila)
                    except Exception as e:   # la combinación no se pudo comprobar: se declara, nunca una traza
                        incompleto.append(f"{nombre}: {type(e).__name__}: {str(e).splitlines()[0][:160]}")
                    finally:
                        ctx.close()

            # movimiento reducido: una captura en el ancho más estrecho
            w, h = movil
            ctx = nav.new_context(viewport={"width": w, "height": h}, color_scheme=temas[0], reduced_motion="reduce")
            try:
                pg = ctx.new_page()
                errores = []
                pg.on("pageerror", lambda e, errores=errores: errores.append(f"excepción: {e}"))
                pg.on("console", lambda m, errores=errores: m.type == "error" and errores.append(f"consola: {m.text}"))
                cargar(pg, url, a.espera, notas)
                islas = montar_islas(pg, notas, fallos, f"{motor} reducido")   # las piezas tienen su rama reducida
                if not a.puerta:
                    pg.evaluate(ESTILO_JS, CV_VISIBLE)
                pg.screenshot(path=str(carpeta / f"{motor}_{w}x{h}_reducido.png"), full_page=not a.puerta and not ventanas, animations="disabled")
                d = pg.evaluate(DESBORDE_JS)
                informe["combinaciones"].append({"combinacion": f"{motor}_{w}x{h}_reducido", "errores": list(errores), "islas": islas, "desborde": d})
                if d["desborda"]:
                    fallos.append(f"{motor} reducido: desborde horizontal")
                if errores:
                    fallos.append(f"{motor} reducido: {len(errores)} error(es) de consola · {errores[0][:160]}")
            except Exception as e:
                incompleto.append(f"{motor} reducido: {type(e).__name__}: {str(e).splitlines()[0][:160]}")
            finally:
                ctx.close()

            if motor == "chromium":
                # medidas en un móvil táctil: bytes, objetivos y FPS (siempre con las islas montadas)
                ctx = nav.new_context(viewport={"width": w, "height": h}, color_scheme=temas[0], has_touch=True, is_mobile=True)
                try:
                    pg = ctx.new_page()
                    cargar(pg, url, a.espera, notas)
                    inicial = bytes_.medir(pg.evaluate(RECURSOS_JS))
                    montar_islas(pg, notas, [], "medidas")
                    con_islas = bytes_.medir(pg.evaluate(RECURSOS_JS))
                    informe["presupuesto"] = {"tipo": a.tipo, "antes_de_interactuar": inicial, "con_islas": con_islas,
                                              "topes_kb": {"js": js_max, "js_con_islas": js_islas_max, "total": total_max}}
                    if js_max is not None and inicial["js_kb"] > js_max:
                        fallos.append(f"presupuesto: JS antes de interactuar {inicial['js_kb']} kB gz > {js_max} kB ({a.tipo or 'a mano'})")
                    if js_islas_max is not None and con_islas["js_kb"] > js_islas_max:
                        fallos.append(f"presupuesto: JS con las islas montadas {con_islas['js_kb']} kB gz > {js_islas_max} kB ({a.tipo})")
                    if total_max is not None and inicial["total_kb"] > total_max:
                        fallos.append(f"presupuesto: peso inicial {inicial['total_kb']} kB > {total_max} kB ({a.tipo or 'a mano'})")
                    if bytes_.errores:
                        notas.add(f"{len(bytes_.errores)} recurso(s) sin medir: {bytes_.errores[0]}")
                    obj = pg.evaluate(OBJETIVOS_JS)
                    informe["objetivos"] = obj
                    if obj["fallos"]:
                        fallos.append(f"objetivos < 24 px sin espacio alrededor (WCAG 2.5.8): {', '.join(obj['fallos'][:5])}")
                    if a.fps:
                        destino = a.fps_en or ("maestro-isla" if pg.locator("maestro-isla").count() else None)
                        if destino:
                            pg.locator(destino).first.scroll_into_view_if_needed(timeout=5000)
                        if a.accion:
                            accionar(pg, a.accion)
                        pg.wait_for_timeout(500)
                        cdp = ctx.new_cdp_session(pg)
                        if a.cpu > 1:
                            cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})
                        pg.wait_for_timeout(300)   # calentamiento tras cambiar la CPU
                        fps = {**pg.evaluate(FPS_JS, int(a.fps * 1000)), "cpu_x": a.cpu, "en": destino or "página",
                               "accion": a.accion, "islas": pg.evaluate(ISLAS_JS)}
                        informe["fps"] = fps
                        if fps["p95_ms"] > a.p95_max:
                            fallos.append(f"FPS: p95 del frame {fps['p95_ms']} ms > {a.p95_max} ms (CPU ×{a.cpu})")
                        if fps["frames_largos"] > a.largos_max:
                            fallos.append(f"FPS: {fps['frames_largos']} frames > 33 ms (tope {a.largos_max}, CPU ×{a.cpu})")
                except Exception as e:
                    incompleto.append(f"medidas en móvil (bytes, objetivos, FPS): {type(e).__name__}: {str(e).splitlines()[0][:160]}")
                finally:
                    ctx.close()

            if a.sin_js and motor == "chromium":
                ctx = nav.new_context(viewport={"width": w, "height": h}, java_script_enabled=False)
                try:
                    pg = ctx.new_page()
                    pg.goto(url, wait_until="load", timeout=30000)
                    # sin JS el CSS sí corre: las animaciones finitas se llevan a su final (el estado final es
                    # el estado por defecto, contrato 5); antes salían los arcos de un héroe a medio dibujar
                    pg.evaluate(ESTILO_JS, CV_VISIBLE)
                    pg.screenshot(path=str(carpeta / f"{motor}_{w}x{h}_sin-js.png"), full_page=not ventanas, animations="disabled")
                    t = pg.evaluate(TEXTO_JS)
                    texto = t["texto"]
                    informe["sin_js"] = {"caracteres_en_main": texto, "visibles_innerText": t["visible"]}
                    if texto < 200:
                        fallos.append(f"sin JS: el contenido principal casi no se lee ({texto} caracteres)")
                except Exception as e:
                    incompleto.append(f"sin JS: {type(e).__name__}: {str(e).splitlines()[0][:160]}")
                finally:
                    ctx.close()
            nav.close()

    if a.sin_detector:
        informe["omitido"].append("detector de impeccable (--sin-detector)")
    else:
        det = {f"{w}x{h}": detector(url, f"{w}x{h}", aceptadas) for (w, h) in dict.fromkeys((vistas[0], movil))}
        if aceptadas:
            informe["excepciones_detector"] = sorted(aceptadas)
        if aviso_exc:
            notas.add(aviso_exc)
        informe["detector_impeccable"] = det
        for vista, r in det.items():
            if r.get("error"):  # el detector no corrió: se declara, no se da por limpio
                incompleto.append(f"detector {vista}: {r['error']}")
            elif a.estricto and r.get("primarios"):
                fallos.append(f"detector {vista}: {r['primarios']} hallazgo(s)")

    if srv:
        srv.shutdown()
    informe["notas"] = sorted(notas)
    (carpeta / "informe.json").write_text(json.dumps(informe, ensure_ascii=False, indent=1))
    if not a.puerta:   # la ronda se anota al terminar: una ejecución que revienta no gasta ronda
        anotar_ronda(rondas_f, clave, a.ronda_extra, carpeta)
        # el revisor final (degraded/finish-reviewer.md) busca .impeccable/review/desktop.png y mobile.png
        if revision:
            import shutil
            destino = pathlib.Path(a.revision).resolve() if a.revision else (
                (buscar_arriba(base_proyecto, ".impeccable") or tope_proyecto(base_proyecto) / ".impeccable") / "review")
            destino.mkdir(parents=True, exist_ok=True)
            for (w, h), f in revision.items():
                if f.exists():
                    shutil.copy(f, destino / ("desktop.png" if (w, h) == vistas[0] and w >= 600 else "mobile.png"))
            informe["revision"] = str(destino)

    for c in informe["combinaciones"]:
        extra = []
        if c.get("islas"):
            extra.append("islas " + ", ".join(f"{i['pieza']}={i['estado']}" for i in c["islas"]))
        if "axe" in c:
            extra.append(f"axe {sum(1 for v in c['axe'] if v['impacto'] in ('serious', 'critical'))} graves/{len(c['axe'])}")
        if c.get("laboratorio"):
            lab = c["laboratorio"]
            extra.append(f"LCP {lab['lcp_ms']} ms · CLS {lab['cls']} (laboratorio, sin red lenta)"
                         + (f" · se movió {lab['cls_fuentes'][0]['nodo']}" if lab.get("cls") and lab.get("cls_fuentes") else ""))
        if c.get("estados"):
            extra.append("estados " + ", ".join(f"{e['estado']}={'ok' if e.get('ok') else 'NO'}" for e in c["estados"]))
        if c.get("medida"):
            extra.append(f"medida {c['medida']['caracteres_por_linea']} car./línea")
        print(f"  {c['combinacion']:<28} errores {len(c.get('errores', []))} · desborde {'SÍ' if c['desborde']['desborda'] else 'no'}" + ("".join(f" · {x}" for x in extra)))
    if "presupuesto" in informe:
        pr = informe["presupuesto"]
        print(f"  bytes (gzip -9): JS antes de interactuar {pr['antes_de_interactuar']['js_kb']} kB · con islas {pr['con_islas']['js_kb']} kB · peso inicial {pr['antes_de_interactuar']['total_kb']} kB"
              + (f" · topes {pr['topes_kb']}" if a.tipo or a.presupuesto_js or a.presupuesto_total else " · sin topes (usa --tipo)"))
    if "objetivos" in informe:
        o = informe["objetivos"]
        print(f"  objetivos táctiles: {o['objetivos']} · {len(o['fallos'])} fallos (< 24 px) · {o['avisos']} avisos (< 44 px con pointer: coarse)")
    if "fps" in informe:
        f = informe["fps"]
        print(f"  FPS {f['fps']} · p95 {f['p95_ms']} ms (tope {a.p95_max}) · largos {f['frames_largos']} (tope {a.largos_max}) · CPU ×{f['cpu_x']} · en {f['en']}")
    if "sin_js" in informe:
        print(f"  sin JS: {informe['sin_js']['caracteres_en_main']} caracteres legibles en <main>")
    for vista, r in (informe.get("detector_impeccable") or {}).items():
        if r.get("error"):
            print(f"  detector {vista}: NO CORRIÓ · {r['error']}")
        else:
            print(f"  detector {vista}: {r.get('primarios', '?')} hallazgos, {r.get('avisos', 0)} avisos"
                  + (f", {r['aceptados_por_identidad']} aceptados por la identidad ({', '.join(r['aceptados'])})" if r.get("aceptados_por_identidad") else "")
                  + "".join(f"\n    - {x}" for x in r.get("hallazgos", [])[:6]))
            if any("line-length" in x for x in r.get("hallazgos", [])) and informe.get("candidatos_medida"):
                print("    dónde mirar (line-length llega sin selector):" + "".join(f"\n      · {x}" for x in informe["candidatos_medida"][:6]))
    for n in informe["notas"]:
        print(f"  nota: {n}")
    for o in informe["omitido"]:
        print(f"  omitido: {o}")
    if fallos:
        print("PUERTA: NO\n" + "\n".join(f"  x {f}" for f in fallos) + "".join(f"\n  ? {f}" for f in incompleto))
        return 1
    if incompleto:
        solo_firefox = all(f.startswith("firefox") for f in incompleto)
        print("PUERTA: INCOMPLETA (lo ejecutado pasa, pero no se pudo comprobar todo)\n" + "\n".join(f"  ? {f}" for f in incompleto)
              + ("\n  = incompleta SOLO por Firefox (no arranca aquí, precedencia L5): vale como verde a efectos del flujo; se declara así en el informe" if solo_firefox else ""))
        return 2
    print("PUERTA: sí (islas montadas, sin errores de consola, sin desborde, axe sin infracciones graves"
          + (", presupuesto" if (js_max or js_islas_max or total_max) else "") + (", FPS" if a.fps else "") + ")")
    return 0


if __name__ == "__main__":
    sys.exit(main())

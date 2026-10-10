#!/usr/bin/env python3
"""prueba_herramientas.py · prueba las herramientas de build y de medida del kit.

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_herramientas.py [--motores chromium,webkit]

  css-en-linea.mjs   una hoja: capas primero, sin @import, espacio de descendiente y calc() intactos, < 14 kB
  empaquetar.mjs     lectura.js + preferencias.js + almacen.js + una app → un script clásico que funciona
                     abierto con doble clic (file://) en Chromium y WebKit; un paquete npm se rechaza
  almacen.js         (dentro del paquete, desde file://) set/get/claves y migración de esquema
  medir-reservas.py  Georgia contra Georgia = 100 %; salida @font-face con size-adjust
  tokens/design-md.mjs frontmatter desde tokens.css; al regenerar conserva la prosa
  rendimiento.py     una carga de la demo con 4G lenta y CPU ×4: métricas y dentro del presupuesto
Sale con 1 si algo falla y con 2 si un motor no arranca.
"""
import argparse, json, pathlib, shutil, subprocess, sys, tempfile

KITS = pathlib.Path(__file__).resolve().parent.parent
fallos, sin_motor = [], []


def check(c, t):
    print(("  ok  " if c else "  NO  ") + t)
    c or fallos.append(t)


def node(js, cwd):
    r = subprocess.run(["node", "--input-type=module", "-e", js], cwd=cwd, capture_output=True, text=True)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--motores", default="chromium,webkit")
    a = ap.parse_args()
    tmp = pathlib.Path(tempfile.mkdtemp())

    print("css-en-linea.mjs")
    r = node(f"""import {{ cssEnLinea }} from '{(KITS / "css-en-linea.mjs").as_uri()}';
const o = cssEnLinea({{ kit: '{KITS}', hojas: ['{KITS / "movimiento.css"}', '{KITS / "figura/figura.css"}'] }});
console.log(JSON.stringify({{ ini: o.css.slice(0, 60), imp: o.css.includes('@import'), desc: o.css.includes('.figura :where('),
  calc: /calc\\(var\\(--measure-reading\\) \\* 1ch\\)/.test(o.css), kb: o.kb, capas: (o.css.match(/@layer reset,/g) || []).length }}));""", KITS)
    o = json.loads(r.stdout or "{}")
    check(o.get("ini", "").startswith("@layer reset,tokens,base,layouts,components,utilities;") and o.get("capas") == 1, f"la declaración de capas va la primera y una sola vez ({o.get('ini', '')[:40]}…)")
    check(o.get("imp") is False, "sin @import (sin cadena de peticiones)")
    check(o.get("desc") and o.get("calc"), "conserva el espacio de descendiente (.figura :where) y los de calc()")
    check(0 < o.get("kb", 99) < 14, f"cabe en 14 kB gzip ({o.get('kb')} kB)")

    print("empaquetar.mjs + almacen.js (file://)")
    app = tmp / "app"
    app.mkdir()
    shutil.copytree(KITS, app / "kit", ignore=shutil.ignore_patterns("pruebas", "__pycache__", ".verificacion"))
    (app / "entrada.js").write_text("""import { buscar } from './kit/lectura.js';
import { prefs } from './kit/preferencias.js';
import { crearAlmacen } from './kit/almacen.js';
window.__prueba = (async () => {
  // datos de la versión 1 y, después, la página con la versión 2: se ejecuta su migración
  const v1 = crearAlmacen('prueba-empaquetar', { version: 1 });
  await v1.set('notas', [1]);
  const almacen = crearAlmacen('prueba-empaquetar', { version: 2, migraciones: { 2: async (a) => { await a.set('migrada', true); } } });
  await almacen.set('posicion', { p: 12 });
  return { temas: prefs.opciones().temas, hallados: buscar(document.body, 'camara').length,
           posicion: await almacen.get('posicion'), claves: (await almacen.claves()).sort(), disponible: almacen.disponible() };
})();
""")
    r = subprocess.run(["node", str(KITS / "empaquetar.mjs"), "entrada.js", "--salida", "app.js"], cwd=app, capture_output=True, text=True)
    check(r.returncode == 0 and (app / "app.js").exists(), f"empaqueta 4 módulos del kit y la app ({r.stderr.strip()[:100]})")
    (app / "index.html").write_text('<!doctype html><html lang="es"><meta charset="utf-8"><title>p</title>'
                                    '<body><p>La Cámara abrió la sesión; la cámara votó.</p><script src="app.js"></script></body></html>')
    (app / "malo.js").write_text("import { get } from 'idb-keyval';\nget('x');\n")
    r = subprocess.run(["node", str(KITS / "empaquetar.mjs"), "malo.js"], cwd=app, capture_output=True, text=True)
    check(r.returncode == 1 and "almacen.js" in r.stderr, "un paquete npm (idb-keyval) se rechaza y dice qué usar")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        for m in a.motores.split(","):
            try:
                nav = getattr(p, m).launch(timeout=45000)
            except Exception:
                sin_motor.append(m); print(f"  --  {m} no arranca"); continue
            pg = nav.new_page()
            err = []
            pg.on("pageerror", lambda e: err.append(str(e)))
            pg.goto((app / "index.html").as_uri())
            res = pg.evaluate("window.__prueba")
            check(res and res["temas"] == ["light", "dark"] and res["hallados"] == 2 and res["posicion"] == {"p": 12} and "migrada" in res["claves"] and not err,
                  f"{m}: el paquete funciona desde file:// (preferencias, búsqueda, almacén con migración; persistente={res and res['disponible']}) {err[:1]}")
            nav.close()

    print("medir-reservas.py")
    g = "/System/Library/Fonts/Supplemental/Georgia.ttf"
    r = subprocess.run([sys.executable, str(KITS / "medir-reservas.py"), g, "--reserva", "Georgia", "--familia", "X reserva"], capture_output=True, text=True)
    check(r.returncode == 0 and "size-adjust: 100.00%" in r.stdout and 'font-family: "X reserva"' in r.stdout, f"Georgia contra Georgia = 100 % ({r.stdout.strip()[:90]}…)")

    print("tokens/design-md.mjs")
    d = tmp / "DESIGN.md"
    r = subprocess.run(["node", str(KITS / "tokens/design-md.mjs"), "--salida", str(d), "--nombre", "Prueba", "--autoridad", "../mundo/DESIGN.md"], capture_output=True, text=True)
    texto = d.read_text() if d.exists() else ""
    check(r.returncode == 0 and texto.startswith("---\nname:") and "bg-base-dark:" in texto and "typography:" in texto and "../mundo/DESIGN.md" in texto,
          "frontmatter con colores por tema, tipografía y enlace a la autoridad")
    d.write_text(texto + "\n## Overview\n\nProsa del documentador.\n")
    subprocess.run(["node", str(KITS / "tokens/design-md.mjs"), "--salida", str(d)], capture_output=True, text=True)
    t2 = d.read_text()
    check("Prosa del documentador." in t2 and t2.count("\n---") == 1, "al regenerar, sustituye el frontmatter y conserva la prosa")

    print("rendimiento.py")
    r = subprocess.run([sys.executable, str(KITS / "rendimiento.py"), "pruebas/demo.html", "--raiz", ".", "--veces", "1", "--tipo", "landing", "--salida", str(tmp / "rend")],
                       cwd=KITS, capture_output=True, text=True, timeout=300)
    inf = json.loads((tmp / "rend/rendimiento.json").read_text()) if (tmp / "rend/rendimiento.json").exists() else {}
    check(r.returncode == 0 and inf.get("mediana", {}).get("lcp", 0) > 0 and "no es la cifra de Lighthouse" in inf.get("aviso", ""),
          f"mide LCP {inf.get('mediana', {}).get('lcp', 0):.0f} ms, CLS y TBT con 4G lenta y CPU ×4, y se declara sustituto")

    shutil.rmtree(tmp, ignore_errors=True)
    print("\nTODO OK" if not fallos else f"\n{len(fallos)} FALLO(S)")
    return 1 if fallos else (2 if sin_motor else 0)


if __name__ == "__main__":
    sys.exit(main())

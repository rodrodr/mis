#!/usr/bin/env python3
"""prueba_verificar.py · regresión de verificar.py contra páginas que antes pasaban la puerta sin razón.

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_verificar.py

Casos (Chromium, un ancho, sin detector para ir rápido; el registro de rondas y las capturas van a
una carpeta temporal):
  demo_rota.html     isla bajo el pliegue que lanza, desborda 3016 px, pide un 404 y trae botones de
                     16 px pegados → la puerta tiene que montarla y fallar (código 1)
  demo_sondeo.html   panel que consulta cada 300 ms → sin traza de Python, con informe y nota (0)
  demo_tirones.html  isla que bloquea 30 ms por frame tras «Jugar» → --fps con --accion falla por p95
  demo.html          presupuesto de 1 kB → falla por bytes; con --tipo landing pasa
  rondas             dos rondas de juicio desde dos cwd distintos y la tercera se niega (código 3)
  estados            --estado captura (y en la puerta pasa axe) lo que no está al cargar
  lectura            --tipo lectura: ventanas en anclajes, no página entera; capturas para el revisor
  medida nula        --lectura con un selector sin párrafos deja la puerta incompleta, no en verde
  excepciones        PRODUCT.md → reglas del detector aceptadas (nunca line-length)
Sale con 1 si algún caso no da lo esperado.
"""
import json, pathlib, subprocess, sys, tempfile

KITS = pathlib.Path(__file__).resolve().parent.parent
VERIFICAR = KITS / "verificar.py"
fallos = []


def check(c, t):
    print(("  ok  " if c else "  NO  ") + t)
    c or fallos.append(t)


def correr(args, cwd, tmp):
    r = subprocess.run([sys.executable, str(VERIFICAR), *args, "--motores", "chromium", "--anchos", "390x844",
                        "--temas", "light", "--sin-detector", "--salida", str(tmp / "salida"), "--rondas", str(tmp / "rondas.json"),
                        "--revision", str(tmp / "review")],
                       cwd=cwd, capture_output=True, text=True, timeout=600)
    carpetas = sorted((tmp / "salida").glob("2*/informe.json"))
    informe = json.loads(carpetas[-1].read_text()) if carpetas else {}
    return r, informe


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    print("demo_rota.html (isla rota bajo el pliegue)")
    r, inf = correr(["pruebas/demo_rota.html", "--raiz", ".", "--puerta"], KITS, tmp)
    txt = "\n".join(inf.get("fallos", []))
    check(r.returncode == 1, f"la puerta falla (código {r.returncode})")
    check("acabó en error" in txt, "detecta la isla en error")
    check("desborde horizontal" in txt, "ve el desborde que aparece al montar")
    check("error(es) de consola" in txt, "ve la excepción y el 404 de la pieza")
    check("2.5.8" in txt, "marca los objetivos de 16 px pegados")

    print("demo_sondeo.html (red que nunca se calla)")
    r, inf = correr(["pruebas/demo_sondeo.html", "--raiz", ".", "--puerta"], KITS, tmp)
    check("Traceback" not in r.stderr + r.stdout, "sin traza de Python")
    check(r.returncode in (0, 2) and inf.get("url", "").endswith("demo_sondeo.html"), f"termina con informe (código {r.returncode})")
    check(any("red no queda en calma" in n for n in inf.get("notas", [])), "lo declara en una nota")

    print("demo_tirones.html (30 ms por frame tras «Jugar»)")
    r, inf = correr(["pruebas/demo_tirones.html", "--raiz", ".", "--puerta", "--fps", "3", "--cpu", "4", "--accion", "#jugar"], KITS, tmp)
    p95 = inf.get("fps", {}).get("p95_ms", 0)
    check(r.returncode == 1 and any("p95" in f for f in inf.get("fallos", [])), f"--fps con --accion falla por p95 ({p95} ms)")

    print("presupuestos (contrato 8)")
    r, inf = correr(["pruebas/demo.html", "--raiz", ".", "--puerta", "--presupuesto-js", "1"], KITS, tmp)
    check(r.returncode == 1 and any("presupuesto: JS" in f for f in inf.get("fallos", [])), "JS por encima del tope: falla")
    r, inf = correr(["pruebas/demo.html", "--raiz", ".", "--puerta", "--tipo", "landing"], KITS, tmp)
    js = inf.get("presupuesto", {}).get("antes_de_interactuar", {}).get("js_kb")
    check(r.returncode == 0, f"la demo cabe en el presupuesto de landing ({js} kB gz de JS; código {r.returncode})")

    print("rondas de juicio (techo de 2, independiente del cwd)")
    r1, _ = correr([str(KITS / "pruebas/demo.html"), "--raiz", str(KITS)], KITS, tmp)
    r2, _ = correr([str(KITS / "pruebas/demo.html"), "--raiz", str(KITS)], tmp, tmp)
    r3, _ = correr([str(KITS / "pruebas/demo.html"), "--raiz", str(KITS)], KITS / "tokens", tmp)
    check("ronda de juicio 1/2" in r1.stdout and "ronda de juicio 2/2" in r2.stdout, "1/2 y 2/2 aunque cambie el cwd")
    check(r3.returncode == 3 and "TECHO" in r3.stdout, f"la tercera se niega (código {r3.returncode})")

    print("estados (--estado): lo que no está al cargar")
    r, inf = correr(["pruebas/demo_tirones.html", "--raiz", ".", "--puerta", "--estado", "jugando=#jugar"], KITS, tmp)
    est = (inf.get("combinaciones") or [{}])[0].get("estados", [])
    carpeta = sorted((tmp / "salida").glob("2*"))[-1]
    check(est and est[0]["ok"] and "axe_graves" in est[0] and list(carpeta.glob("*_estado-jugando.png")),
          f"captura el estado y pasa axe en él {est}")

    print("lectura larga: ventanas, no una tira de página entera")
    r, inf = correr(["pruebas/lectura.html", "--raiz", ".", "--tipo", "lectura", "--muestras", "#p-20,#p-40"], KITS, tmp)
    carpeta = sorted((tmp / "salida").glob("2*"))[-1]
    ventanas = sorted(x.name for x in carpeta.glob("*_ventana-*.png"))
    check(len(ventanas) == 2 and not (carpeta / "chromium_390x844_light.png").exists(), f"dos ventanas en los anclajes {ventanas}")
    check((tmp / "review/mobile.png").exists(), "copia la primera pantalla para el revisor final (.impeccable/review o --revision)")

    print("medida nula (--lectura sin párrafos)")
    r, inf = correr(["pruebas/demo.html", "--raiz", ".", "--puerta", "--lectura", "#no-existe p"], KITS, tmp)
    check(r.returncode == 2 and any("medida no comprobada" in x for x in inf.get("incompleto", [])), f"queda incompleta, no en verde (código {r.returncode})")

    print("sin JS: texto contado con textContent")
    r, inf = correr(["pruebas/lectura.html", "--raiz", ".", "--puerta", "--sin-js"], KITS, tmp)
    sj = inf.get("sin_js", {})
    check(sj.get("caracteres_en_main", 0) > 10000 and "visibles_innerText" in sj, f"cuenta el texto del DOM ({sj})")

    print("excepciones del detector (PRODUCT.md)")
    import importlib.util
    sys.dont_write_bytecode = True   # sin __pycache__ dentro del kit
    spec = importlib.util.spec_from_file_location("verificar", VERIFICAR)
    v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
    prod = tmp / "PRODUCT.md"
    prod.write_text("# Producto\n\n## Excepciones a los contratos\n\n- `italic-serif-display`: cursiva de la identidad (C2).\n"
                    "- `line-length`: nunca en bloque.\n\n### Detalle\n- `wide-tracking`: versalitas del contrato 11.\n\n## Otra sección\n- `side-tab`\n")
    reglas, aviso = v.reglas_aceptadas(prod)
    check(reglas == {"italic-serif-display", "wide-tracking"} and aviso is None, f"lee la sección y sus subsecciones, sin line-length ni lo de fuera {sorted(reglas)}")

    print("\nTODO OK" if not fallos else f"\n{len(fallos)} FALLO(S)")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())

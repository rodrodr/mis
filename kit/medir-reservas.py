#!/usr/bin/env python3
"""medir-reservas.py · métricas de la fuente de reserva para que el cambio de fuente no mueva nada (contrato 8).

Una web font que llega tarde cambia el número de líneas y empuja lo de debajo: en el juego de ejemplo,
CLS 0,489 a 768 px (la entradilla en Bodoni empujaba el escenario); con reservas medidas, CLS 0. Esto
calcula, como fontaine, `size-adjust` (ancho medio de las minúsculas frente a la reserva local) y los
`ascent/descent/line-gap-override` corregidos por ese ajuste, e imprime el @font-face de la reserva.

  python3 kit/medir-reservas.py fuente.woff2 [más.woff2 …] --reserva Georgia [--familia "Mi reserva"] [--json]
  python3 kit/medir-reservas.py cursiva.woff2 --reserva "Georgia Italic" --estilo italic

--reserva: Georgia, "Georgia Italic", Arial, "Arial Italic", "Times New Roman", "Times New Roman Italic"
(las del sistema en macOS) o la ruta de un .ttf/.otf. Elige la que el CSS pone detrás de la web font:
serif → Georgia; sans → Arial; cursiva → su cursiva.
Uso en el CSS: font-family: "Mi fuente", "Mi fuente reserva", Georgia, serif;  y precarga (rel=preload,
crossorigin) solo del woff2 que pinta el primer viewport. Requiere fontTools (y brotli para woff2).
"""
import argparse, json, pathlib, sys

SISTEMA = pathlib.Path("/System/Library/Fonts/Supplemental")
LOCAL = {  # nombre → (fichero en macOS, nombres local() para el CSS)
    "georgia": ("Georgia.ttf", ['local("Georgia")', 'local("Georgia-Regular")']),
    "georgia italic": ("Georgia Italic.ttf", ['local("Georgia Italic")', 'local("Georgia-Italic")']),
    "arial": ("Arial.ttf", ['local("Arial")', 'local("ArialMT")', 'local("Helvetica")', 'local("Liberation Sans")']),
    "arial italic": ("Arial Italic.ttf", ['local("Arial Italic")', 'local("Arial-ItalicMT")']),
    "times new roman": ("Times New Roman.ttf", ['local("Times New Roman")', 'local("TimesNewRomanPSMT")']),
    "times new roman italic": ("Times New Roman Italic.ttf", ['local("Times New Roman Italic")', 'local("TimesNewRomanPS-ItalicMT")']),
}
MUESTRA = "abcdefghijklmnopqrstuvwxyz"


def ancho_medio(f) -> float:
    cmap, hmtx = f.getBestCmap(), f["hmtx"]
    faltan = [c for c in MUESTRA if ord(c) not in cmap]
    if faltan:
        raise SystemExit(f"la fuente no trae {''.join(faltan)}: ¿es un subconjunto sin latín básico?")
    return sum(hmtx[cmap[ord(c)]][0] for c in MUESTRA) / len(MUESTRA) / f["head"].unitsPerEm


def metricas(fuente: pathlib.Path, ref: float) -> dict:
    from fontTools.ttLib import TTFont
    f = TTFont(str(fuente))
    upm, hh = f["head"].unitsPerEm, f["hhea"]
    sa = ancho_medio(f) / ref
    return {"size-adjust": f"{sa * 100:.2f}%", "ascent-override": f"{hh.ascent / upm / sa * 100:.2f}%",
            "descent-override": f"{abs(hh.descent) / upm / sa * 100:.2f}%", "line-gap-override": f"{hh.lineGap / upm / sa * 100:.2f}%"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fuentes", nargs="+")
    ap.add_argument("--reserva", default="Georgia")
    ap.add_argument("--familia", help='nombre de la familia de reserva (por defecto «<fichero> reserva»)')
    ap.add_argument("--estilo", default="normal", choices=("normal", "italic"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("falta fontTools: pip install fonttools brotli", file=sys.stderr)
        return 1
    clave = a.reserva.lower()
    if clave in LOCAL:
        fichero, locales = LOCAL[clave]
        ruta = SISTEMA / fichero
    else:
        ruta, locales = pathlib.Path(a.reserva), [f'local("{pathlib.Path(a.reserva).stem}")']
    if not ruta.exists():
        print(f"no encuentro la reserva {ruta}; pasa la ruta de un .ttf", file=sys.stderr)
        return 1
    ref = ancho_medio(TTFont(str(ruta)))
    salida = {}
    for f in a.fuentes:
        p = pathlib.Path(f)
        m = metricas(p, ref)
        salida[p.name] = m
        if not a.json:
            familia = a.familia or f"{p.stem} reserva"
            print(f'@font-face {{ font-family: "{familia}"; font-style: {a.estilo}; src: {", ".join(locales)}; '
                  + "; ".join(f"{k}: {v}" for k, v in m.items()) + "; }")
    if a.json:
        print(json.dumps(salida, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

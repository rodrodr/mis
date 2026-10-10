#!/usr/bin/env python3
"""prueba_juego.py · prueba las plantillas de juego de kits/juego/ en navegadores reales.

  cd ~/.claude/skills/maestro-diseno-web/kits && python3 pruebas/prueba_juego.py [--motores chromium,webkit] [--piezas phaser,pixi,three,p5]

Necesita red: los motores se cargan de jsDelivr con versión fijada (import map de pruebas/juego.html).
Por cada plantilla (Phaser 4.2.1, PixiJS 8.21.0, three 0.186.0, p5 2.3.3):
  monta y dibuja · el color que recibe el motor es el del token (ctx.hex) y cambia con el tema ·
  se pausa fuera de pantalla y sin foco (pausa-sin-foco) y vuelve · un solo AudioContext y nada
  conectado a la salida saltándose el limitador · destroy(): ni rAF, ni listeners, ni canvas, ni
  contexto WebGL vivo, y el AudioContext compartido no se cierra · consola limpia.
Además: bucle.js en Node (mismos pasos a 30, 60 y 144 Hz; tope de la espiral; PRNG sembrado),
acciones.js (event.code con AZERTY, flanco, sin modificadores, reasignar y persistir, soltar con blur)
y guardado.js (IndexedDB, migración, versión más nueva rechazada, exportar e importar).
Sale con 1 si algo falla y con 2 si un motor no arranca en el entorno.
"""
import argparse, functools, http.server, json, pathlib, subprocess, sys, threading

KITS = pathlib.Path(__file__).resolve().parent.parent
fallos, no_disponibles = [], []

INSTRUMENTOS = """
window.__raf = 0;
{ const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => r((t) => { window.__raf++; f(t); }); }
window.__gl = [];
{ const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (tipo, ...a) { const c = gc.call(this, tipo, ...a); if (c && /webgl/.test(tipo) && !window.__gl.includes(c)) window.__gl.push(c); return c; }; }
window.__ac = [];
{ const AC = window.AudioContext; if (AC) window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac.push(this); } }; }
window.__conex = [];
{ const con = AudioNode.prototype.connect, dis = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (d, ...a) { window.__conex.push([this, d]); return con.call(this, d, ...a); };
  AudioNode.prototype.disconnect = function (...a) {
    window.__conex = window.__conex.filter(([s, d]) => !(s === this && (!a.length || d === a[0])));
    return dis.apply(this, a); }; }
"""


def check(c, t):
    print(("  ok  " if c else "  NO  ") + t)
    c or fallos.append(t)


def prueba_bucle():
    print("bucle.js (Node)")
    js = f"""
import {{ pasoFijo, azar }} from '{(KITS / "juego/bucle.js").as_uri()}';
const res = {{}};
for (const hz of [30, 60, 144]) {{ let n = 0; const paso = pasoFijo({{ hz: 60, actualizar: () => n++ }}); for (let i = 0; i < hz; i++) paso(1000 / hz); res[hz] = n; }}
{{ let n = 0; const paso = pasoFijo({{ hz: 60, actualizar: () => n++ }}); res.espiral = paso(10000); res.despues = paso(1000 / 60); }}
const a = azar(7), b = azar(7); res.semilla = [a(), a(), a()].join() === [b(), b(), b()].join();
console.log(JSON.stringify(res));
"""
    r = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True)
    res = json.loads(r.stdout or "{}")
    check(all(abs(res.get(str(hz), 0) - 60) <= 1 for hz in (30, 60, 144)), f"paso fijo: 60 pasos por segundo a 30, 60 y 144 Hz {[res.get(str(hz)) for hz in (30, 60, 144)]}")
    check(res.get("espiral", 99) <= 5 and res.get("despues") == 1, f"tras un frame de 10 s: tope de 5 pasos y vuelta a 1 ({res.get('espiral')}, {res.get('despues')})")
    check(res.get("semilla") is True, "azar(semilla) repite la misma secuencia")


def servir():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(KITS)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/pruebas/juego.html"


def prueba_pieza(nav, url, pieza):
    # DPR 2: el búfer del canvas debe ser tamaño CSS × dpr (tope --canvas-dpr-max = 2); con Scale.RESIZE
    # Phaser pintaba a 1× y el texto salía borroso (fricción F6 del juego de ejemplo)
    ctx = nav.new_context(viewport={"width": 800, "height": 700}, device_scale_factor=2)
    ctx.add_init_script(INSTRUMENTOS)
    pg = ctx.new_page()
    err = []
    pg.on("pageerror", lambda e: err.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and err.append(m.text))
    try:
        pg.goto(f"{url}?motor={pieza}", wait_until="load")
        pg.wait_for_function("document.querySelector('#isla')?.dataset.isla === 'activa' && window.__juego", timeout=90000)
        pg.wait_for_timeout(600)
        j = pg.evaluate("window.__juego")
        check(j["frames"] > 3, f"{pieza}: monta y dibuja ({j['frames']} frames)")
        check(pg.evaluate("[...document.querySelectorAll('#isla canvas')].every((c) => c.closest('[aria-hidden=true]') || c.getAttribute('aria-hidden') === 'true') && document.querySelectorAll('#isla canvas').length > 0"),
              f"{pieza}: el canvas va con aria-hidden")
        nitidez = pg.evaluate("[...document.querySelectorAll('#isla canvas')].filter((c) => c.clientWidth > 0).map((c) => [c.width, c.clientWidth, c.height, c.clientHeight])[0]")
        check(bool(nitidez) and abs(nitidez[0] - 2 * nitidez[1]) <= 2 and abs(nitidez[2] - 2 * nitidez[3]) <= 2,
              f"{pieza}: a DPR 2 el búfer es tamaño CSS × 2 (texto nítido) {nitidez}")
        check(j["hex"] not in (0, None) and j["color_motor"] == j["hex"], f"{pieza}: el motor recibe el color del token (0x{j['hex']:06x}; el motor tiene 0x{(j['color_motor'] or 0):06x})")
        pg.evaluate("document.documentElement.dataset.theme = 'dark'")
        pg.wait_for_timeout(300)
        j2 = pg.evaluate("window.__juego")
        check(j2["hex"] != j["hex"] and j2["color_motor"] == j2["hex"], f"{pieza}: cambio de tema → nuevo color en el motor (0x{j2['hex']:06x})")
        # pausa fuera de pantalla
        pg.evaluate("document.querySelector('#campo').scrollIntoView({ block: 'end' })")
        pg.wait_for_function("document.querySelector('#isla').dataset.isla === 'pausada'", timeout=5000)
        pg.wait_for_timeout(150)
        a = pg.evaluate("window.__juego.frames"); pg.wait_for_timeout(400); b = pg.evaluate("window.__juego.frames")
        check(a == b, f"{pieza}: fuera de pantalla se pausa y no dibuja ({a}→{b})")
        pg.evaluate("document.querySelector('#isla').scrollIntoView()")
        pg.wait_for_function("document.querySelector('#isla').dataset.isla === 'activa'", timeout=5000)
        pg.wait_for_timeout(300)
        c = pg.evaluate("window.__juego.frames")
        check(c > b, f"{pieza}: vuelve a dibujar al volver ({b}→{c})")
        # sin foco (pausa-sin-foco)
        pg.evaluate("dispatchEvent(new Event('blur'))")
        pg.wait_for_timeout(150)
        a = pg.evaluate("window.__juego.frames"); pg.wait_for_timeout(300); b = pg.evaluate("window.__juego.frames")
        estado = pg.evaluate("document.querySelector('#isla').dataset.isla")
        pg.evaluate("dispatchEvent(new Event('focus'))")
        pg.wait_for_timeout(300)
        c = pg.evaluate("window.__juego.frames")
        check(estado == "pausada" and a == b and c > b, f"{pieza}: sin foco se pausa y con foco sigue ({estado}, {a}→{b}→{c})")
        # audio: el gesto dentro de la isla; nada directo a la salida salvo el limitador
        pg.click("#isla [data-lienzo]")
        pg.wait_for_timeout(200)
        audio = pg.evaluate("""() => { const ac = window.__ac[0];
            const directas = ac ? window.__conex.filter(([s, d]) => d === ac.destination).map(([s]) => s.constructor.name) : [];
            return { contextos: window.__ac.length, directas }; }""")
        check(audio["contextos"] <= 1 and all(x == "DynamicsCompressorNode" for x in audio["directas"]),
              f"{pieza}: {audio['contextos']} AudioContext; a la salida solo llega el limitador {audio['directas']}")
        # destroy
        # los contextos de la isla: los de canvas en el documento (no las sondas de detección del motor)
        pg.evaluate("window.__glIsla = window.__gl.filter((g) => g.canvas.isConnected); window.__resizes = window.__juego.resizes; document.querySelector('#isla').remove()")
        pg.wait_for_function("window.__juego.destruida", timeout=10000)
        pg.wait_for_timeout(300)
        r0 = pg.evaluate("window.__raf"); pg.wait_for_timeout(500); r1 = pg.evaluate("window.__raf")
        pg.evaluate("dispatchEvent(new Event('resize'))")
        pg.wait_for_timeout(100)
        fin = pg.evaluate("""() => ({ lienzos: document.querySelectorAll('canvas').length,
            gl: window.__glIsla.map((g) => g.isContextLost()), resizes: window.__juego.resizes - window.__resizes,
            ac: window.__ac.map((a) => a.state) })""")
        check(r0 == r1, f"{pieza}: destroy() → ningún rAF vivo ({r0}→{r1})")
        check(fin["lienzos"] == 0 and fin["resizes"] == 0, f"{pieza}: destroy() → sin canvas ni listeners ({fin['lienzos']} canvas, {fin['resizes']} resize)")
        check(all(fin["gl"]) and (pieza == "p5" or len(fin["gl"]) >= 1), f"{pieza}: destroy() → los contextos WebGL de la isla, perdidos {fin['gl']}")
        check("closed" not in fin["ac"], f"{pieza}: el AudioContext compartido sigue vivo para el bus {fin['ac']}")
        check(not err, f"{pieza}: consola limpia {err[:1]}")
    except Exception as e:
        check(False, f"{pieza}: {type(e).__name__}: {str(e).splitlines()[0][:160]}")
    finally:
        ctx.close()


def prueba_utiles(nav, url):
    ctx = nav.new_context()
    pg = ctx.new_page()
    err = []
    pg.on("pageerror", lambda e: err.append(str(e)))
    pg.goto(url, wait_until="load")
    r = pg.evaluate("""async () => { const [A, G] = await window.__utiles; const el = document.getElementById('sitio');
      localStorage.removeItem('acc-prueba');
      const acc = A.crearAcciones(el, { arriba: ['KeyW', 'ArrowUp'], saltar: ['Space'] }, { clave: 'acc-prueba' });
      el.focus();
      const tecla = (tipo, code, key, extra = {}) => { const e = new KeyboardEvent(tipo, { code, key, bubbles: true, cancelable: true, ...extra }); el.dispatchEvent(e); return e; };
      const r = { foco: document.activeElement === el };
      tecla('keydown', 'KeyW', 'z');                  // AZERTY: la tecla física W imprime «z»
      r.azerty = acc.activa('arriba') && acc.pulsada('arriba');
      tecla('keydown', 'KeyW', 'z', { repeat: true }); acc.fin(); r.flanco = !acc.pulsada('arriba');
      tecla('keyup', 'KeyW', 'z'); r.suelta = !acc.activa('arriba');
      r.prevenido = tecla('keydown', 'Space', ' ').defaultPrevented;
      r.ctrl = !tecla('keydown', 'KeyW', 'w', { ctrlKey: true }).defaultPrevented;
      window.dispatchEvent(new Event('blur')); r.blur = !acc.activa('saltar');
      // un botón DENTRO del ámbito (velo de pausa, contrato 6) conserva Espacio y Entrar
      const b = document.createElement('button'); b.textContent = 'Continuar'; let pulsado = 0; b.onclick = () => pulsado++;
      el.append(b); b.focus();
      const eb = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }); b.dispatchEvent(eb);
      r.boton = !eb.defaultPrevented && !acc.activa('saltar');
      b.remove(); el.focus();
      r.nombres = [await acc.etiqueta('ArrowLeft'), await acc.etiqueta('Space'), await acc.etiqueta('Enter'), await acc.etiqueta('Escape')];
      document.getElementById('campo').focus();
      acc.reasignar('saltar', ['KeyJ']);
      r.persiste = A.crearAcciones(document.createElement('div'), { arriba: ['KeyW'], saltar: ['Space'] }, { clave: 'acc-prueba' }).mapa().saltar.join();
      const g1 = G.crearGuardado({ nombre: 'prueba', version: 1 }); await g1.borrar(); await g1.guardar({ nivel: 3 });
      const g2 = G.crearGuardado({ nombre: 'prueba', version: 2, migraciones: { 2: (d) => ({ ...d, vidas: 3 }) } });
      r.migrado = await g2.cargar();
      await g2.guardar(r.migrado);
      const texto = await (await g2.exportar()).text();
      try { await g1.cargar(); r.nuevo = 'se abrió'; } catch (e) { r.nuevo = e.message; }
      await g2.borrar(); r.importado = await g2.importar(texto); r.ranuras = await g2.ranuras();
      try { await g2.importar('{"juego":"otro","v":1,"datos":{}}'); r.ajeno = 'se importó'; } catch (e) { r.ajeno = e.message; }
      return r; }""")
    print("acciones.js y guardado.js")
    check(r["foco"] and r["azerty"], "acciones: la tecla física W (AZERTY «z») activa «arriba» por event.code")
    check(r["flanco"] and r["suelta"], "acciones: una pulsación = un flanco (la repetición no cuenta) y keyup la suelta")
    check(r["prevenido"] and r["ctrl"], "acciones: previene solo las teclas del juego; con Ctrl la tecla sigue siendo del navegador")
    check(r["blur"], "acciones: al perder el foco se sueltan todas")
    check(r["boton"], "acciones: un botón dentro del ámbito conserva Espacio (no se previene ni activa la acción)")
    check(r["nombres"] == ["Flecha izquierda", "Espacio", "Entrar", "Esc"], f"acciones: nombres de teclas en español {r['nombres']}")
    check(r["persiste"] == "KeyJ", f"acciones: reasignar se guarda y sobrevive a otra instancia ({r['persiste']})")
    check(r["migrado"] == {"nivel": 3, "vidas": 3}, f"guardado: v1 → v2 con su migración {r['migrado']}")
    check("versión 2" in r["nuevo"], f"guardado: una partida más nueva no se abre ({r['nuevo']})")
    check(r["importado"] == {"nivel": 3, "vidas": 3} and r["ranuras"] == ["auto"], "guardado: exportar e importar, ida y vuelta")
    check("otro" in r["ajeno"], f"guardado: rechaza la partida de otro juego ({r['ajeno']})")
    check(not err, f"sin excepciones {err[:1]}")
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--motores", default="chromium,webkit")
    ap.add_argument("--piezas", default="phaser,pixi,three,p5")
    a = ap.parse_args()
    prueba_bucle()
    from playwright.sync_api import sync_playwright
    srv, url = servir()
    with sync_playwright() as p:
        for motor in a.motores.split(","):
            print(motor)
            try:
                nav = getattr(p, motor).launch(timeout=45000)
            except Exception as e:
                no_disponibles.append(motor)
                print(f"  --  no arranca en este entorno: {str(e).splitlines()[0][:120]}")
                continue
            for pieza in a.piezas.split(","):
                prueba_pieza(nav, url, pieza)
            prueba_utiles(nav, url)
            nav.close()
    srv.shutdown()
    print("\nTODO OK" + (f" · sin probar en {', '.join(no_disponibles)}" if no_disponibles else "") if not fallos else f"\n{len(fallos)} FALLO(S)")
    return 1 if fallos else (2 if no_disponibles else 0)


if __name__ == "__main__":
    sys.exit(main())

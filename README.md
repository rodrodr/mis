# MIS · Municipal Ideological Score: sitio web

Sitio estático (Astro + islas sin framework) que acompaña al **MIS v3.0** (Power & Rodrigues-Silveira, Harvard Dataverse, doi:10.7910/DVN/8USPML). Tiene tres idiomas: EN (raíz), PT y ES.

Repositorio: `git@github.com:rodrodr/mis.git`. Destino: GitHub Pages en `https://rodrodr.github.io/mis/` (`base: '/mis'`). La publicación solo ocurre al lanzar a mano el flujo «Deploy to GitHub Pages».

## Estructura

| Carpeta | Qué contiene |
|---|---|
| `Dataverse_Release_v3.0/` | Paquete de depósito. Solo se lee; nunca se escribe en él. |
| `pipeline/` | `build_data.py`: verifica las variables contra los microdatos (falla si no casan) y escribe los datos del sitio. `lisa.py`: I de Moran y clústeres LISA. Los scripts `_verify_*` sirven para la revisión manual del codebook. |
| `geo/` | Mallas del IBGE 2024 (`raw/` y `work/`, ignoradas por Dropbox y git). |
| `kit/` | Copia del kit de `maestro-diseno-web`: tokens DTCG, `base.css`, figura y verificación. |
| `sitio/` | El proyecto Astro: `src/views` (páginas), `src/i18n` (diccionarios; el build falla si las claves no coinciden en los tres idiomas), `src/lib` (datos y figuras generadas en el build), `src/scripts` (islas: mapa, ficha, comparador, pequeños múltiplos). |
| `PRODUCT.md`, `.impeccable/surfaces/sitio.md` | Verdad de producto y contrato de dirección visual («Boletim de Urna»). |
| `PROPUESTA_SITIO_MIS.md` | Propuesta aprobada y decisiones. |

## Regenerar

```bash
python3 pipeline/build_data.py
```

```bash
python3 pipeline/lisa.py
```

```bash
node kit/tokens/build-tokens.mjs
```

```bash
cd sitio && npx astro build
```

El último paso genera unas 16 700 páginas (5 571 fichas × 3 idiomas, más las secciones). Tarda alrededor de un minuto y ocupa unos 450 MB. Para iterar rápido, `PROFILE_LIMIT=20 npx astro build` genera solo 20 fichas.

Vista previa con la ruta base real:

```bash
cd sitio && npx astro preview --port 4321
```

Se abre en `http://localhost:4321/mis/`.

## Verificación

```bash
python3 kit/verificar.py http://localhost:4321/mis/ --puerta --tipo datos --sin-js
```

Las superficies de mapa, ficha y municipios se verifican con `--tipo app`.

Estado actual: todas las páginas pasan con axe sin incidencias, sin desborde, sin errores de consola y con el JS dentro del presupuesto. La matriz queda «incompleta» solo porque Firefox no arranca en esta máquina.

## Publicar

El repositorio incluye los datos ya generados del sitio (`sitio/public/data`, `sitio/src/data`). **No** incluye `Dataverse_Release_v3.0/` (paquete de depósito, 157 MB) ni las mallas en bruto del IBGE: para regenerar los datos hacen falta en local.

1. En GitHub: *Settings → Pages → Source: GitHub Actions*.
2. En *Actions*, lanzar a mano «Deploy to GitHub Pages» (`.github/workflows/deploy.yml`). Compila con Node 22 desde `sitio/` y publica `sitio/dist`.

El flujo no se dispara con cada `push`: solo se publica cuando se lanza.

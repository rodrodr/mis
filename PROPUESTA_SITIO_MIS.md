# Propuesta: sitio web de análisis del MIS v3.0 (1994–2026)

**Fecha:** 9 de octubre de 2026 · **Estado:** propuesta para aprobar. Todavía no hay nada construido.
**Revisión 2:** rehecha sobre los datos y la documentación corregidos del mismo día.

**Base:** `Dataverse_Release_v3.0/`:
- panel municipal: 93 872 filas × 61 variables;
- fichero de género: 13 variables;
- microdatos partido × municipio: 1 589 430 filas;
- ubicaciones partidarias: 510 partido-año.

---

## 0. Resumen

Un sitio de datos con un hilo narrativo: **cómo se ha movido el centro de gravedad ideológico de los municipios brasileños entre 1994 y 2026, y dónde**. Tiene seis apartados:

1. **Evolución**: el relato nacional.
2. **Mapa**: explorador espacio-temporal.
3. **Municipios**: una ficha por cada uno de los 5 571.
4. **Polarización**: Dalton como eje, con la fragmentación integrada.
5. **Género**.
6. **Metodología y datos**.

Todo se genera en el build a partir de los ficheros del depósito. El cliente solo recibe agregados ya calculados y la geometría.

La decisión que más condiciona el diseño es esta: **nunca se dibuja una sola línea a través de los 17 ciclos**. Las elecciones generales (diputado federal) y las municipales (concejal) son dos series distintas, y las propias notas lo recomiendan.

---

## 1. Qué hay en la carpeta (verificado)

He recalculado desde los microdatos todas las variables que usará el sitio y he comprobado las tablas de las notas:

- **`ideo_imp`, `pol_dalton_norm`, `enep`, `fragf`, `fragi`, `conc`, `comp`, `max_prop`, `pol_esteban_ray`, `pol_gross_sigelman`, `pol_sani_sarto2`, `pol_centrif`, `pol_ptpsdb`, `pol_range`, `MIS_Male`, `MIS_Female`, `prop_female_votes`:** r ≥ 0,9997. Las diferencias residuales se deben al redondeo de cuotas a 3 decimales, que está documentado.
- **`ideo_na`, `pol_pi`, `closeness`, `close_ideopres`, `turnout`, `dem_vhn`:** casan exactamente con sus fórmulas actuales.
- **Retardos (t−2) y regla de titulares** (`pref`, `gov`): consistentes al 100 % entre ciclos.
- **Tablas 1A, 1B y 2 y cobertura por estado y año:** reproducidas.
- **Fichero de género:** idéntico a las columnas del panel.

| Fichero | Uso en el sitio |
|---|---|
| `MIS_Ideology_1994-2026.tab` | Núcleo de todas las secciones |
| `MIS_Gender_1994-2026.tab` | Sección Género (redundante con el panel; útil como descarga) |
| `MIS_Ideology_party_data_1994-2026.zip` | Descomposición por partido en la ficha, distribuciones para el explicador de Dalton, contrafactual |
| `partidos_ano_1994_2026_completo_imputado.tab` | Metodología: ubicaciones con error típico (`IDEO.SE`) y los 7 criterios de imputación |
| `documentation/` | Fuente del apartado Metodología |

**Falta:** la geometría municipal. Hay que descargar la malla del IBGE (vía `geobr` o FTP), simplificarla a TopoJSON y comprobar que casan los 5 571 `GEOCODIG_M`. Entre ellos están Fernando de Noronha y Boa Esperança do Norte (MT), que aparece desde 2024.

---

## 2. Decisiones que imponen los datos

### 2.1 Dos arenas, dos series
Los indicadores oscilan en zigzag según el tipo de elección:

| | General 2014 | Municipal 2016 | General 2018 |
|---|---|---|---|
| ENEP medio | 5,23 | 7,63 | 6,66 |
| Brecha de género (Δ MIS) | −0,142 | −0,008 | −0,149 |
| Dalton (0–1) | 0,373 | 0,356 | 0,439 |

Desde el fin de las coaliciones proporcionales (2020), las dos arenas convergen en ENEP (5,33 en 2022 y 5,32 en 2024). En Dalton y en la brecha siguen separadas:

| | 2022 | 2024 | 2026 |
|---|---|---|---|
| Dalton | 0,426 | 0,370 | 0,512 |
| Brecha de género | −0,211 | −0,022 | −0,240 |

**Las dos arenas no cuentan la misma historia:**
- **Generales:** forman una U, con mínimo en 2010 (+0,056) y subida a +0,222 (2018), +0,190 (2022) y +0,208 (2026).
- **Municipales:** tocan fondo en 2008 (+0,098), alcanzan +0,227 en 2016 y desde entonces bajan: +0,215 en 2020 y +0,153 en 2024. En 2024, el 19 % de los municipios queda a la izquierda del cero, frente al 12 % de 2020.

Por eso:
- Toda serie temporal tiene **dos líneas o dos facetas**.
- Los mapas de cambio comparan **solo dentro de la misma arena** (2022→2026, 2020→2024).
- El selector de año del mapa muestra la arena de forma visible.

### 2.2 Municipio medio frente a votante medio
Hay dos medias nacionales distintas, y las dos son legítimas:

| Año | Media de municipios | Media ponderada por votos |
|---|---|---|
| 1994 | +0,179 | +0,059 |
| 2010 | +0,056 | −0,001 |
| 2018 | +0,222 | +0,226 |
| 2024 | +0,153 | +0,146 |
| 2026 | +0,208 | +0,181 |

El sitio muestra las dos, con etiqueta explícita: «el municipio típico» y «el electorado brasileño».

Esta divergencia es en sí un hallazgo. Hasta 2014 los municipios grandes votaban claramente más a la izquierda que los pequeños: la diferencia llega a 0,13 en 1998 y 2002. Desde 2016 la diferencia casi desaparece, e incluso se invierte en 2018.

Con Dalton ocurre lo mismo: el electorado está más polarizado que el municipio medio (0,576 frente a 0,512 en 2026).

### 2.3 Polarización: Dalton = `pol_dalton_norm`
`pol_dalton_norm` es el índice de Dalton (2008) en la escala [−1, 1]: la desviación típica ponderada por votos de las posiciones partidarias. En el sitio se muestra ×10, en la escala 0–10 de Dalton.

`pol_pi` es la especificación original del MIS. Ahora está bien documentada como una medida «tipo Dalton» distinta:
- usa desviaciones absolutas;
- usa la media no ponderada de los partidos;
- reescala las posiciones a [1, 9] con el mínimo y el máximo de todo el panel, de modo que cambia si se amplía el panel;
- está redondeada a un decimal.

**Propuesta:** `pol_dalton_norm` es la medida principal. `pol_pi` solo aparece en Metodología, como medida heredada que enlaza con la v2.0 y el artículo de BPSR.

### 2.4 Género
- **1996 queda resuelto.** El sexo de los candidatos se imputó por nombre en el 31 % del voto nominal de ese año, con una precisión validada del 99,66 %. Ese año se incluye con una nota y con `gender_imputed_share` visible en la ficha.
- **Aún hay ruido en municipios pequeños.** La DE de `MIS_Female` es 0,385 con menos de 100 votos femeninos nominales, 0,306 entre 300 y 1000, y 0,268 por encima de 1000.
  - **Propuesta:** en el mapa, umbral de **≥ 300 votos femeninos**. Por debajo, el municipio aparece rayado, «pocos votos». Como alternativa, una vista agregada por microrregión o estado.
- Se calcula **solo sobre voto nominal**, sin voto de legenda. Se dice en cada figura.
- **Dos medidas de «% de voto a mujeres»,** como en la Tabla 1B:
  - el total nacional, ponderado: en generales, 5,5 % en 1994 y 23,9 % en 2026;
  - la media de los municipios: 3,6 % y 18,5 % en esos mismos años.

  Se etiquetan igual que en §2.2.

### 2.5 Mapa: dos escalas y tres estados de «sin color»
- **Escala absoluta**, divergente y centrada en 0. Como la media es +0,19, el país se verá mayoritariamente a la derecha del centro, y eso es correcto.
- **Escala relativa:** desviación respecto a la media del año y la arena. Es la que deja ver la geografía del cambio.
- **Tres estados distintos y con leyenda:**
  - municipio aún no instalado (en 1994 había 5 019);
  - dato ausente (p. ej. los dos municipios de MA en 2000);
  - no aplica (el DF y Fernando de Noronha solo tienen elecciones generales).

### 2.6 Las ubicaciones partidarias cambian entre olas del BLS
Cada elección se puntúa con la ola del BLS más cercana. Una variación del MIS mezcla dos cosas: que los votantes cambien de partido y que los partidos sean reubicados. Ejemplo: el máximo de Dalton en 2026 (0,512) coincide con el PL en +0,91 y el PSOL en −0,95 en la ola de 2025.

Los microdatos permiten separar ambos efectos con un **contrafactual de ubicaciones fijas**: las mismas ubicaciones para todos los años, de modo que solo cambie el voto. Se propone como función avanzada, opcional, en Evolución y Polarización. `IDEO.SE` permite bandas de incertidumbre en las ubicaciones.

### 2.7 2026 es provisional
Los datos de 2026 proceden de los boletines de urna del 5 de octubre, previos a la totalización, y `supp_pres` repite el valor de 2024. El sitio lleva una marca «provisional» en cada figura que incluya 2026 y una nota de versión.

Los datos de gobernador de 2026 son correctos: con la regla de titulares, `gov` es el gobernador elegido en 2022, así que no depende de la segunda vuelta.

---

## 3. Arquitectura de información

```
/                       Inicio = Evolución (relato con scroll)
/mapa/                  Explorador espacio-temporal       ?ano=2026&var=ideo&escala=abs
/municipios/            Buscador + rankings
/municipios/3550308-sao-paulo/   Ficha (5 571 páginas estáticas)
/polarizacion/          Dalton + fragmentación
/genero/                Género
/metodologia/           Método, ubicaciones, limitaciones, versiones
/datos/                 Descargas, cita, DOI, cambios
```

- El estado del mapa vive en la URL: se puede compartir y volver atrás.
- Cada ficha tiene una URL estable y legible, lo que la hace citable y buscable.
- Selector de idioma, si se decide ofrecer varios (§8).

---

## 4. Las secciones

Cada figura se especifica con su **pregunta**, el **agregado** que la responde y la **frase de respuesta**, que será su título. Las frases son provisionales y se fijarán con las cifras del pipeline.

### 4.1 Evolución general (inicio, scrollytelling)

El relato avanza con el scroll del lector, sin secuestrarlo. La figura queda fija y cambia de estado en cada paso.

| # | Pregunta | Figura | Frase provisional |
|---|---|---|---|
| E1 | ¿Hacia dónde se ha movido Brasil? | Dos líneas (Generales / Municipales), MIS medio, con bandas de presidencia (Itamar, FHC, Lula, Dilma, Temer, Bolsonaro, Lula 3) | Una frase por arena. Generales: «una U, con deriva a la izquierda hasta 2010 y vuelta a la derecha después». Municipales: «máximo en 2016 y retroceso claro en 2024». Que el voto local no siga al nacional es en sí un hallazgo |
| E2 | ¿El municipio típico o el votante típico? | Las dos medias de §2.2 superpuestas | «Los municipios grandes tiraban a la izquierda; desde 2016 la diferencia casi desaparece» |
| E3 | ¿Se mueve todo el país a la vez o se separa? | Distribución por año (crestas o *beeswarm*), con DE anotada | «El centro se mueve y la dispersión también» (DE de 0,125 en 2008 a 0,195 en 2024) |
| E4 | ¿Cuántos municipios son de izquierda, centro o derecha? | Barras apiladas al 100 % por año y tramo de MIS | A calcular (p. ej., < 0: 33 % en 2010 frente a 5 % en 2016) |
| E5 | ¿Dónde? | Pequeños múltiplos de mapas, uno por ciclo de cada arena, que enlazan al Mapa | — |
| E6 | ¿Qué regiones y estados lideran el giro? | Gráfico de pendiente por estado y facetas por macrorregión | A calcular |

**Opcional (E7):** «¿Cambiaron los votantes o cambiaron los partidos?». Es el contrafactual de §2.6.

### 4.2 Mapa (explorador)

- **Lienzo:** coroplético de los 5 571 municipios en canvas, con contornos estatales en SVG encima. Zoom, desplazamiento y búsqueda de municipio que centra el mapa.
- **Controles:**
  - año, con deslizador que marca la arena de cada ciclo y botón de reproducir;
  - variable: MIS, Dalton, ENEP, % de voto femenino, brecha de género (con umbral), ideología del alcalde en ejercicio;
  - escala absoluta o relativa;
  - modo **cambio**: Δ entre dos años de la misma arena.
- **Interacción:**
  - nota emergente con hover y foco, cerrable con Esc: nombre, UF, valor, posición nacional y enlace a la ficha;
  - panel lateral con histograma del año, sobre el que el municipio señalado queda marcado.
- **Accesibilidad:** una sola parada de tabulador con navegación virtual (flechas por municipios ordenados por estado) y una región viva que anuncia el municipio. Una **tabla equivalente**, filtrable y descargable en CSV.
- **Capa analítica opcional:** clústeres LISA (Moran local) por año, para ver si la ideología se agrupa cada vez más en el espacio. Se calcula en el build.

### 4.3 Municipios (buscador y ficha)

**Buscador:** por nombre, con o sin tildes, y por código IBGE. Rankings: más a la izquierda, más a la derecha, mayor cambio, más polarizados.

**Ficha** (página estática; sus figuras se renderizan en SVG durante el build):

1. **Cabecera:** nombre, UF, región, electorado, tamaño de la Câmara (`dmp`) y mini-mapa.
2. **Trayectoria:** MIS en dos series (por arena), frente a las medias de su estado y de Brasil, con bandas de incertidumbre opcionales.
3. **Qué hay detrás del número:** reparto de voto por partido en cada ciclo desde los microdatos, en barras apiladas ordenadas por ideología. Así se ve qué partidos explican cada salto.
4. **Ejecutivos en ejercicio:** partido e ideología del alcalde y del gobernador en el cargo en cada elección, frente al MIS legislativo.
5. **Sistema de partidos:** Dalton, ENEP y voto del mayor partido a lo largo del tiempo.
6. **Género:** % de voto a mujeres, MIS_Male y MIS_Female, con aviso si los votos son pocos o si el sexo fue imputado (1996).
7. **Comparar:** añadir hasta 3 municipios a la trayectoria (estado en la URL).
8. **Datos:** tabla del municipio y descarga en CSV. Nota de calidad si `rebuilt_tse = 1`.

### 4.4 Polarización (Dalton como eje y fragmentación integrada)

| # | Pregunta | Figura |
|---|---|---|
| P1 | ¿Está Brasil más polarizado? | Dalton (0–10) por año, dos arenas, con media de municipios y media del electorado. Mínimo 3,41 (2020, municipal); máximo 5,12 (2026, general; 5,76 para el electorado) |
| P2 | ¿Qué significa Dalton? | Explicador con municipios reales: su distribución de voto sobre el eje ideológico (barras de partidos situadas en su θ y con altura igual a su peso), la media y la dispersión. Dos ejemplos, uno de baja y otro de alta polarización |
| P3 | ¿Dónde se polariza? | Mapa de Dalton (enlaza al Mapa con `var=dalton`) y cambio 2022→2026 |
| P4 | ¿Polarización y fragmentación van juntas? | Dispersión ENEP × Dalton por arena; pequeños múltiplos por año |
| P5 | ¿Polarización ideológica o reubicación de partidos? | Contrafactual de §2.6 aplicado a Dalton |
| P6 | ¿Es robusto? | Comparación con Esteban-Ray, Sani-Sartori (`pol_sani_sarto2`), rango ideológico y voto centrífugo, todas verificadas |
| P7 | Fragmentación | ENEP, ENP entrópico (`fragi`) y concentración de los dos mayores partidos, por arena. Anotación de reglas: el fin de las coaliciones proporcionales en 2020 hace caer el ENEP municipal de 7,63 a 5,07 |

Queda fuera: `pol_sanisarto` («brecha de contribución del mayor partido»), que tiene poca interpretación para un público general. `pol_pi` aparece solo en Metodología.

### 4.5 Género

| # | Pregunta | Figura |
|---|---|---|
| G1 | ¿Cuánto voto reciben las mujeres? | % de voto nominal a candidatas, dos arenas, con total nacional y media municipal. Generales: del 5,5 % (1994) al 23,9 % (2026). Municipales: del 12,3 % (1996) al 21,8 % (2024) |
| G2 | ¿Votar a mujeres es votar más a la izquierda? | MIS_Male frente a MIS_Female por año y arena (*dumbbell*) |
| G3 | La paradoja de las dos arenas | Brecha media de −0,14 a −0,40 en generales y de −0,01 a −0,02 en municipales, con la explicación de la cuota y la composición de las listas |
| G4 | ¿Qué partidos llevan el voto femenino? | Desde los microdatos: reparto del voto a candidatas por partido o familia ideológica y año |
| G5 | ¿Dónde? | Mapa de % de voto femenino y de brecha, con umbral de votos (§2.4) o agregado por microrregión. Por región: la brecha es mayor en el Sur (−0,18) y en el Sudeste (−0,16) y menor en el Norte (−0,06) |
| G6 | ¿Más voto a mujeres, menos brecha? | Dispersión entre `prop_female_votes` y la brecha, por arena |

### 4.6 Metodología y datos

- **El índice en una figura:** de la ubicación de cada partido (estimación BLS reescalada a [−1, 1] dentro de cada ola) al voto ponderado y al MIS, con un ejemplo numérico de un municipio real.
- **Correspondencia ola–elección:** las 9 olas del BLS usadas y qué elecciones puntúa cada una.
- **Ubicaciones partidarias:** gráfico de los partidos por ola (1993–2025), con su error típico y la marca de imputación.
- **Imputación:** tabla de los 7 criterios (HL, AVG(PDT, PSB), AVG(PTB, PL/PR), HR, PSD proxy, NOVO proxy, MP [ola]).
- **Observado frente a imputado:** `ideo_na` no se renormaliza y se encoge hacia 0 con el voto a partidos sin puntuación directa. Por eso el sitio usa `ideo_imp` y explica la diferencia. Correlación de 0,967 en total y de 0,931 a 0,989 por año.
- **Por qué legislativas y no ejecutivas;** el DF solo con diputados federales; filas reconstruidas desde el TSE (`rebuilt_tse`); Amazonas 1994; imputación de sexo en 1996.
- **Cambios respecto a la v2.0:**
  - tabla de partidos revisada;
  - regla de titulares;
  - código 97;
  - reescalado de `closeness` y `pol_pi` sobre todo el panel.
- **Limitaciones:**
  - voto nominal frente a legenda;
  - reubicaciones entre olas;
  - municipios nuevos;
  - 2026 provisional.
- **Datos:** enlace al DOI de Dataverse, CSV derivados del sitio, cita en APA y BibTeX, y declaración sobre el uso de IA.

---

## 5. Arquitectura técnica

Tu skill `maestro-diseno-web` clasifica esto como «Datos, editorial, scrollytelling»: modo Read, con Experience solo en el momento firma, que sería el mapa animado de E5 o el explicador P2.

```
Dataverse_Release_v3.0/  (solo lectura: es el paquete del depósito)
        │
        ▼
pipeline/  (Python o R; reproducible)
  1. lee .tab + microdatos + partidos
  2. verifica: recalcula MIS, Dalton, ENEP, etc. y falla si no casan
  3. agrega: series nacionales (municipio medio y electorado), por región/UF y arena; distribuciones; LISA
  4. por municipio: un JSON con su trayectoria y su reparto de partidos
  5. geometría IBGE → TopoJSON simplificado (mapshaper)
  6. valores del mapa: un binario compacto por variable (5 571 × 17)
        │
        ▼
sitio/  Astro estático + islas sin framework (kit de maestro-diseno-web)
  - Figuras renderizadas en el build: Observable Plot → SVG
  - Islas: mapa (canvas + d3-geo + topojson-client), relato, comparador
  - Fichas: 5 571 páginas generadas desde las colecciones
        │
        ▼
dist/  → hosting estático (GitHub Pages, Netlify o servidor institucional)
```

- **Por qué estático y no Shiny:** las fichas son indexables y citables, el hosting no tiene coste ni servidor, la carga es rápida y la web sigue funcionando aunque deje de mantenerse. Shiny es la alternativa si preferís iterar en R, a cambio de peor rendimiento y de un servidor que mantener.
- **Presupuesto** (tipo `datos`): ≤ 50 kB de JS crítico en la ruta de lectura. El mapa va en su propia isla, perezosa y con póster estático. La geometría, según una estimación todavía sin medir, ocupará unos 1–2 MB en TopoJSON y 400–700 kB en gzip; se carga solo donde se usa.
- **Accesibilidad:** cada figura tiene vistas Gráfico · Tabla · Datos, teclado con una sola parada, marcas a ≥ 3:1 en ambos temas y paleta divergente validada para daltonismo. Nunca es solo color: hay etiquetas directas y tramas para «pocos votos».
- **Honestidad de las cifras:** cada número del texto sale de un fichero del pipeline. El build falla si una cifra citada no coincide.
- **Identidad visual:** no hay ninguna registrada para el MIS. El paso siguiente sería `impeccable shape` → `PRODUCT.md` → dirección de arte. No hereda la identidad de `luz_site`, porque es otro producto.

---

## 6. Fases

| Fase | Entregable | Depende de |
|---|---|---|
| 0 · Decisiones | Respuestas a §8 | Vosotros |
| 1 · Pipeline y verificación | Scripts que reproducen y validan las variables expuestas, más los agregados | — |
| 2 · Dirección de arte | `PRODUCT.md`, propuesta visual (tipografía, paleta divergente izquierda–derecha, tono) | Idioma(s) |
| 3 · Mapa + ficha | El explorador y las 5 571 fichas: el núcleo exploratorio | Geometría IBGE |
| 4 · Evolución, Polarización, Género | Las secciones narrativas | Fases 1 y 3 |
| 5 · Metodología, datos, verificación final | Accesibilidad, rendimiento, revisión de cifras | Todo lo anterior |

---

## 7. Residuos menores detectados en la versión corregida

Ninguno afecta al sitio. Los anoto por si queréis pulirlos antes del depósito.

| Variable | Documentado | Datos |
|---|---|---|
| `dmp` | 9–55 | 14 filas con 0 (Coari, Itamarati y Carvalhópolis en 2016 y 2018) o con 7 (Fortaleza de Minas, Itaú de Minas, Fortuna de Minas y Nova Alvorada do Sul en algunos años) |
| `pol_sanisarto` | Fórmula de la brecha de contribución | Casa en el 99,6 % de las filas; en el 0,4 % difiere hasta 5,05. Probablemente por empates en el mayor partido o por partidos sin puntuación |

---

## 8. Decisiones (9-10-2026)

1. **Idiomas:** PT, EN y ES desde el principio.
2. **Stack:** sitio estático (Astro + islas), con mucha interactividad. Las superficies exploratorias (`/mapa/`, ficha, comparador) se tratan como tipo `app` (Operate, ≤ 100 kB de JS). Las narrativas se tratan como tipo `datos` (Read, ≤ 50 kB).
3. **Hosting:** GitHub Pages, repositorio `rodrodr/mis` (`base: '/mis'`; cambiado el 10-10-2026 desde `mis2026`). **No se publica ni se sube nada hasta nueva orden.**
4. **`pol_pi`:** solo en Metodología.
5. **Umbral de género (lo decide Claude):** el municipio se raya con la etiqueta «pocos votos» cuando tiene < 300 votos femeninos nominales. Hay un conmutador para agregar por Región Geográfica Inmediata o por estado, sumando votos desde los microdatos y calculando después. Justificación: la DE de `MIS_Female` es 0,385 por debajo de 100 votos, 0,306 entre 300 y 1000, y 0,268 por encima de 1000.
6. **Opcionales:** entran en la v1 el contrafactual (descomposición *shift-share*, pendiente de que los autores validen la definición), los clústeres LISA y el comparador.
7. **Actualización de 2026:** se decidirá más adelante.
8. **Nombre:** *Municipal Ideological Score* / *Índice Ideológico Municipal* (pendiente la forma en PT).

**Rutas (decisión de construcción):** slugs en inglés compartidos por los tres idiomas (`/map/`, `/pt/map/`, `/es/map/`), para que el estado de la URL sobreviva al cambio de idioma; sustituye a las rutas en español del §3. Fichas: `/municipalities/<código>-<nombre>/`, estáticas en los tres idiomas (≈ 20 kB por página; sitio completo ≈ 390 MB, bajo el límite de 1 GB de GitHub Pages).

**Estado:** propuesta aprobada. Ajuste pendiente de medir: si 16 713 fichas estáticas (5 571 × 3 idiomas) superan el límite de GitHub Pages, la ficha pasará a ser una plantilla por idioma con JSON por municipio. Tendrá resumen y tabla en HTML, y los gráficos en la isla.

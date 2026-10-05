# Follow the Sun

Dónde da el sol en Barcelona, ahora. Un mapa interactivo a pantalla completa con una capa de luz
solar **efectiva** y, encima, una pregunta que la app sabe contestar:

> **Dime qué quieres hacer fuera, cuándo y durante cuánto tiempo, y Follow the Sun encontrará el
> mejor lugar para ti.**

```text
                 SOL ASTRONÓMICO            solarService
                       │
                       ▼
              GEOMETRÍA URBANA              shadowService     (edificios, relieve)
                       │
                       ▼
             METEOROLOGÍA MODELADA          weatherService / cloudService      → previsión
                       │                    satelliteService / radiationService → observación
                ┌──────┴──────┐
                ▼             ▼
             MODELO       OBSERVACIÓN
                └──────┬──────┘
                       ▼
                LIGHT FUSION                lightFusionService
                       │
                       ▼
              EFFECTIVE SUNLIGHT            sunlightService
                       │
                       ▼
        VENTANAS DE SOL → SUN SCORE → RANKING      sunSearchService   ← Find the Sun
```

> **Aviso de honestidad.** Las observaciones por satélite y las previsiones del modelo son de escala
> kilométrica (celdas de ≈ 2,5 km). **No son mediciones a nivel de calle.** La sombra de los
> edificios sí se calcula a nivel de calle. La interfaz comunica esa diferencia y la confianza de
> cada resultado la refleja.

# NAVEGACIÓN

El mapa permanece montado al cambiar de sección: cambiar de herramienta no reinicia la cámara, la
hora elegida ni las capas.

| Sección | Qué resuelve | Dónde está |
| --- | --- | --- |
| **Explorar** | Ver Barcelona, la luz, las sombras y mover la hora. Es la pantalla inicial. | Desktop y navegación móvil |
| **Buscar sol** | «¿Dónde hay sol?» para una intención y un momento. | Sidebar / móvil |
| **Planificar** | «¿Cuándo y cuánto tiempo salgo?» con una franja elegida. Es el mismo motor de búsqueda con otra pregunta. | Sidebar / móvil; también alternable desde Buscar |
| **Lugares** | Explorar el inventario real de OpenStreetMap sin tener una búsqueda concreta. | Sidebar desktop; botón pequeño «Lugares» en Explore móvil |
| **Guardados** | Sitios guardados en este dispositivo. | Sidebar / móvil |
| Ajustes · Acerca de | Capas del mapa y transparencia de los datos. | Separados al pie de la sidebar; Ajustes también en la cabecera móvil |

En desktop una rail translúcida (expandible/colapsable) se superpone al mapa; en tablet queda
compacta. En móvil hay cuatro acciones —Explorar, Buscar, Plan y Guardados— y Lugares se abre desde
Explore. Los paneles son contextuales; las opciones no están todas flotando a la vez.

Para que el mapa aparezca antes, se muestra al cargar la hoja de estilo sin esperar a que terminen
todas las teselas (`style.load`). Se importa solo el proveedor de mapa que se va a usar (Mapbox o
MapLibre), las herramientas de búsqueda se descargan al abrirlas y la meteorología se inicializa en
tiempo ocioso después del primer render. Cambiar de sección no desmonta el mapa.

En Explore, el panel de luz empieza **plegado**: deja solo estado, zona y porcentaje. Al abrirlo
aparecen la explicación, la escala y la procedencia de los datos. El dial de posición solar solo se
muestra cuando se activa la trayectoria. Los edificios, las sombras, las nubes y la trayectoria se
agrupan en un único botón **Capas**. El espacio vacío de la rail de navegación deja pasar el gesto al
mapa; las acciones de mapa se agrupan en la esquina superior derecha, no en el centro. Un arrastre de
hasta 6 px no se considera una selección de punto.

La superposición distingue más claramente **luz débil** (oro pálido) de **sol directo intenso**
(ámbar cálido), con una transición continua basada en la transmisión efectiva, sin fingir bordes de
nube a nivel de calle. Al acercarse por encima del zoom 15,35, el mapa toma un pitch suave de 38° y
las huellas planas se convierten en volúmenes de altura/plantas de OpenStreetMap; al alejar, vuelve a
la vista cenital. Si se cambia manualmente la inclinación o rotación, Follow the Sun respeta la vista
del usuario y no vuelve a inclinar por su cuenta hasta alejarse a escala de ciudad. Las sombras
conservan el cálculo de alturas y geometría urbanas y ganan algo de contraste al acercar.

---

# FIND THE SUN + SUN SESSION PLANNER

Una sola experiencia: elegir intención, momento, duración, distancia y tipo de lugar; ver los
mejores sitios en el mapa; abrir uno y entender por qué gana.

## La experiencia

1. **Find the Sun** (botón) abre el planificador. Junto a él, **1 h de sol** es una acción
   instantánea: ahora, máximo sol, cerca si hay ubicación.
2. **¿Qué buscas?** Sol · Café · Leer · Playa · Atardecer · Pasear. Cada intención fija tipos de
   lugar, prioridad y duración por defecto.
3. **¿Cuándo?** Ahora · En 30 min · En 1 h · Esta tarde · Mañana · Elegir hora (día + desde + hasta).
4. **¿Cuánto tiempo?** 30 min · 1 h · 2 h · 3 h · Otra (de 15 en 15 min).
5. **¿Hasta dónde?** 5 · 10 · 20 · 30 min a pie · Cualquier sitio.
6. **¿Qué tipo de lugar?** Cualquier lugar · y **solo los tipos con datos reales cargados**
   (Playa, Parque, Plaza, Terraza, Mirador, Espacio abierto). «Más opciones»: prioridad (máximo sol /
   equilibrado), evitar nubes, pausas de sombra.

«Buscar» está siempre disponible (todo tiene un valor por defecto). Atajos en el primer paso:
**Encuéntrame 1 h de sol**, **Planear mi tarde** (14:00 → 19:00) y **Quiero sol a las [17:30] durante
[1 h]**.

Al buscar: «Buscando sol…» con tres etapas reales (Lugares · Edificios · Sol y nubes). Después, hasta
tres tarjetas con la mejor opción destacada; el mapa encuadra los resultados con un movimiento suave,
destaca el principal con su puntuación y atenúa los demás. Pulsar un resultado centra el mapa en su
**mejor punto**, muestra el mapa en el **mejor momento** de ese lugar y abre el detalle: sol directo,
mejor ventana, sombra urbana, influencia de nubes, confianza desglosada, distancia, «¿Por qué este
lugar?», tu franja en hitos («14:00 empieza con sol · 15:10 mejor sol · 16:50 sombra urbana · 17:15
vuelve el sol»), comparación con otro resultado, guardar, compartir y cómo llegar.

Decisiones sobre la lista original:

* **«Esta noche» no está.** No hay sol de noche; la intención **Atardecer** cubre el final del día.
* **«Sombra» no está como intención.** Es *Find Shade*, función futura. El motor ya recibe
  `intent`, así que se podrá añadir invirtiendo la puntuación sin tocar el resto.
* **«Cualquier lugar» no incluye terrazas** (ver «Datos de lugares»): se piden explícitamente
  (tipo «Terraza» o intención «Café»).

## El concepto central: tiempo de sol

No se mira «¿hay sol a las 18:00?». La franja se divide en pasos de 10 min (15 min si dura más de
4 h) y cada paso se clasifica: **sol** · **parcial** · **sombra** (edificios o relieve) · **nubes** ·
**incierto** · **noche**. Sobre esos tramos (`lib/sunWindows.ts`):

* **Tiempo de sol** = minutos de sol directo dentro de la mejor ventana de la duración pedida.
* **Cobertura** = tiempo de sol / duración pedida.
* **Mejor ventana** (`findBestSunWindow`): ventana deslizante de la duración pedida que maximiza la
  luz acumulada. Aunque se pida 17:00–20:00, puede ser 17:42–19:06. El tramo mostrado se recorta al
  primer y último instante de sol directo.
* **Tramo ininterrumpido más largo**, **sombra urbana** y **nubes** dentro de esa ventana.

## Sun Score (explicable)

`services/sunScoreService.ts` · pesos en `SUN_SCORE_CONFIG` (`src/config.ts`).

```text
Sun Score = 100 × ( 0,70 · cobertura + 0,20 · intensidad + 0,10 · continuidad )
  cobertura     minutos de sol directo / minutos pedidos
  intensidad    luz efectiva media (el sol pleno pesa más que el parcial)
  continuidad   tramo ininterrumpido más largo / minutos pedidos
```

Después, ajustes **visibles** (cada uno con sus puntos en «Cómo se calcula»):

* **Reparto del sol en la zona** — un lugar donde solo brilla un rincón es peor apuesta: se
  multiplica por `0,88 + 0,12 · fracción de la zona con sol comparable al mejor punto`.
* **Evitar nubes** — resta un 25 % de la influencia de las nubes.
* **Pausas de sombra** — sustituye la continuidad por un premio a tener entre un 5 % y un 25 % de
  sombra.
* **Equilibrado** — multiplica por un factor 0,6–1 según calor (sensación térmica 26 → 34 °C) y viento
  (20 → 40 km/h), con temperatura y viento del modelo de Open-Meteo. Si no hay datos, cuenta solo el
  sol y lo avisa. No es un modelo fisiológico.

La confianza **no** entra en el Sun Score (que mide sol): entra en el ranking.

## Ranking y confianza

```text
valor de ordenación = Sun Score − 20 · (1 − confianza) − min(8, 0,2 · minutos a pie)
```

Un 95 con confianza 0,35 queda en 82 y **no gana** a un 91 con confianza 0,85 (88); pero sí gana a
un 70. La distancia solo desempata a favor de lo cercano. Los resultados finales no pueden estar a
menos de 300 m entre sí (si no, tres terrazas de la misma plaza serían el podio).

La confianza se desglosa: **Geometría** (sol y edificios: hasta *muy alta*) · **Meteorología**
(escala de barrio) · **Global** (el eslabón débil de la cadena). Es exactamente la limitación que
conviene comunicar: *geometría de precisión de calle, meteorología de varios kilómetros*.

## Datos de lugares: reales o ninguno

`services/placeService.ts`. **No hay lugares escritos a mano** (la lista curada con «exposición»
inventada de la fase anterior se ha eliminado).

| Tipo | Etiquetas OpenStreetMap |
| --- | --- |
| Playa | `natural=beach` |
| Parque | `leisure=park`, `leisure=garden` |
| Plaza | `place=square` |
| Mirador | `tourism=viewpoint` |
| Espacio abierto | `leisure=common`, `landuse=recreation_ground`, zonas peatonales (`highway=pedestrian` + `area=yes`) |
| Terraza | cafés, bares, restaurantes… con `outdoor_seating=yes` |

* Fuente: **API Overpass** (datos abiertos, ODbL; atribución en la interfaz). Se descarga el
  inventario una vez por semana y navegador (caché en `localStorage`, hasta dos meses como
  respaldo), con tres servidores de reserva y `VITE_OVERPASS_URL` para uno propio.
* Solo se ofrecen en la interfaz los **tipos con datos reales**. Si faltan datos de una categoría,
  salen menos resultados antes que inventarlos. Sin inventario (sin red y sin caché) la búsqueda lo
  dice: «No hemos podido cargar los lugares de Barcelona».
* Áreas pequeñas (< 2.500 m² un parque, < 600 m² una plaza…) y lugares sin nombre se descartan.
* **Las terrazas son un punto, no sus mesas.** Se desconoce dónde están: se analiza un anillo de 7 m
  alrededor del local (descartando lo que cae dentro de edificios) y la ubicación se marca como
  aproximada. Por eso no entran en «Cualquier lugar».
* Reservado, sin datos todavía: `bench`, `cafe`, `restaurant` (`RESERVED_PLACE_TYPES`).

## Candidatos, muestreo y sombras en cualquier zona

```text
lugares de Barcelona → filtro de candidatos → puntos de análisis → edificios → sol y nubes → ranking
```

* **Candidatos** (`selectCandidates`): tipo (el elegido, o el de la intención, o los espacios
  públicos), distancia a pie (solo con ubicación) y tope de 450 (los más cercanos, o los mayores si no
  hay ubicación).
* **Muestreo** (`lib/placeSampling.ts`): un parque no tiene la misma luz en todas partes. Polígonos →
  rejilla de hasta 12 puntos dentro; líneas → puntos a lo largo; terrazas → el local y un anillo;
  miradores → el punto. Los puntos dentro de un edificio se descartan. El resultado señala el **mejor
  punto** («dónde sentarse») y la fracción de la zona con sol comparable.
* **Edificios** (`services/urbanGeometryService.ts`): la capa del mapa solo conoce los edificios
  visibles, así que se descargan las **teselas vectoriales de OpenFreeMap (OpenStreetMap, z14)** de
  las zonas necesarias y se decodifican con `@mapbox/vector-tile`. Es la misma fuente que el mapa, sin
  token. Solo se descargan las teselas que rodean a los puntos (radio de sombra de 420 m); se guardan
  en memoria; un fallo no se recuerda; **un punto solo cuenta con «edificios conocidos» si todas sus
  teselas se cargaron** (nunca se confunde «no se pudo descargar» con «no hay edificios»). Si
  faltan, el resultado lo dice y baja la confianza.
* **Meteorología**: una serie por *lugar* (es de escala kilométrica, igual para todos sus puntos);
  lo que cambia punto a punto es la sombra.

## Distancia

`services/routeService.ts`. **Todavía no hay routing**: el proveedor por defecto *estima* en línea
recta × 1,3 a 80 m/min (4,8 km/h) y lo marca como estimación («≈ 8 min a pie»). `getWalkingDistance`
y `getWalkingDuration` están listos; para un proveedor real (OSRM, Valhalla, OpenRouteService) basta
implementar `RouteProvider` (con `estimateMany` para matrices) y registrarlo con `setProvider`.

La ubicación **nunca se pide por sorpresa**: sin ella se busca en toda Barcelona. Se pide solo cuando
se limita la distancia o se pulsa «Cerca de mí». Fuera de Barcelona se busca en toda la ciudad.

## Estados y errores

`idle · searching · results · no_results · partial_data · weather_unavailable · places_unavailable`,
nunca un error técnico:

* **Sin resultados completos**: «Ningún lugar cumple tus 3 h completas» + «Mejor opción disponible:
  1 h 47 min de sol directo» + los mejores disponibles. Si no hay sol en absoluto se explica por qué
  (ya es de noche · las nubes tapan el sol · los edificios dejan todo en sombra · no hay lugares de ese
  tipo) y se ofrecen «Probar mañana», «Menos tiempo» y «Ampliar distancia».
* **Datos parciales** (meteorología desactualizada o parcial, faltan edificios, inventario de lugares
  guardado sin conexión, parte de la franja fuera de la previsión): se muestran los resultados con un
  aviso discreto y la confianza reducida.
* **Sin datos meteorológicos**: se muestran con «sol posible, no confirmado» (jamás «sol directo»).

## Rendimiento

Mover controles del planificador **no hace ninguna petición**. Una búsqueda hace: inventario (caché
semanal), teselas (solo las nuevas), meteorología (ya en memoria). El análisis cede el hilo cada
~24 ms para que el mapa siga fluido, es cancelable y solo la última búsqueda actualiza la interfaz.

## Guardar y compartir

* **Guardar** (`savedPlacesService`): `localStorage` (`fts:saved-places:v1`); aparecen como atajos en
  el primer paso. La interfaz ya es la de un almacenamiento remoto futuro.
* **Compartir** (`planShareService`): texto («Follow the Sun · sábado, 10 de octubre · 17:30–19:00 ·
  Bogatell · 1 h 42 min de sol directo · confianza alta») con la hoja del sistema o copiando al
  portapapeles. No hay sistema social ni enlaces profundos todavía.

---

# SOL, NUBES Y LUZ EFECTIVA

## Qué hace cada capa

| Capa | Servicio | Qué aporta | Resolución | Naturaleza |
| --- | --- | --- | --- | --- |
| Geometría solar | `solarService` | azimut, elevación, orto/ocaso | exacta (astronomía) | calculada |
| Geometría urbana | `shadowService` | sombra de edificios y relieve | edificio (decenas de m) | calculada a partir de OSM; alturas a veces estimadas |
| Modelo | `weatherService` + `cloudService` | nubes por capas, DNI y GHI del modelo | 2,5 km (AROME) / 11 km (ARPEGE), horaria | **previsión** |
| Satélite | `satelliteService` | GHI, directa, difusa, DNI observadas | ≈ 2,5 km, **10 min nativos** | **observación** (no es una medición en tierra) |
| Cielo despejado | `radiationService` | referencia para normalizar a una transmisión 0-1 | — | calculada, calibrada con el satélite |
| Fusión | `lightFusionService` | mejor estimación de la transmisión del haz directo | — | combina las anteriores |
| Luz efectiva | `sunlightService` | puntuación, estado, confianza desglosada | — | solo combina |

## NOW frente a FORECAST

* **Ventana de presente** — `CURRENT_OBSERVATION_WINDOW_MINUTES = 60` (`src/config.ts`), medida
  **desde la última observación**. Dentro manda la observación (el modelo aporta como máximo el
  30 %); fuera, gobierna la calidad relativa y el satélite pierde peso (vida media de 75 min).
* Se persiste el **índice de transmisión** (DNI / DNI de cielo despejado), no la DNI.
* Para instantes pasados con muestra real, el dato es observado (±90 s); entre dos muestras es
  **interpolado**; nunca se extrapola antes de la primera muestra.

`DataOrigin`: `observed · forecast · interpolated · estimated · stale · unavailable`.

## Fusión (no es un promedio)

Cada fuente recibe un peso 0-1 (`calculateSourceWeight`):
`base × temporal × espacial × resolución temporal × elevación solar × acuerdo × cobertura`. La cuota
se acentúa hacia la fuente más fiable; si `|satélite − modelo| > 0,35` hay **conflicto** (se marca y
baja la confianza). La confianza se limita a 0,90 (observación) / 0,78 (previsión). Todos los pesos
viven en **`LIGHT_MODEL_CONFIG`** y son juicios documentados, **no** calibrados con mediciones.

## Directa frente a global

`GHI = directa + difusa`. La luz directa se basa en la **transmisión del haz directo**, no en el GHI
ni en el porcentaje de nubes: unos cirros al 100 % dejan pasar más sol que unos estratos bajos al
80 %.

## `sunshine_duration`

Marcas siempre en GMT+0; intervalo = suma de la **hora anterior**; se alinea en `t − 30 min`.
Comprobado con datos reales de AROME (error acumulado ≈ 1.295 s con «hora anterior» frente a
≈ 7.875 s con «hora siguiente»). Es una cantidad derivada: peso 0,1 en la transmisión del modelo.

## Cachés y actualización

| Fuente | TTL | Fallback |
| --- | --- | --- |
| Satélite | 10 min | última observación hasta 6 h, marcada `stale` |
| Modelo | 30 min | último dato hasta 8 h, marcado desactualizado |
| Lugares (OSM) | 7 días | último inventario hasta 60 días |

El satélite se vuelve a consultar solo cuando se espera una muestra nueva.

## Modo de validación: `?debug=weather`

Panel con, para un punto y un instante: el modelo, el satélite, la referencia de cielo despejado, la
fusión (**modelo vs satélite vs fusionado**), el registro de decisión y una gráfica del día.

---

# ARQUITECTURA

```text
src/
  components/
    Map/        BarcelonaMap · SolarOverlay · ShadowLayer · CloudLayer · BuildingLayer · MapMarkers
                MapControls · SunIndicator · TimeSlider
    FindSun/    FindSunSheet · Planner · SearchProgress · ResultCards · SunDetails · WindowStrip · ui
  engine/       capa solar sobre el mapa (canvas)
  hooks/        useSunSearch · usePlaceInventory · useSavedPlaces · useLightSource · …
  services/
    sunSearchService      findBestSunPlaces(request) → el núcleo de Find the Sun
    sunScoreService       Sun Score, ranking y «¿por qué este lugar?»
    placeService          lugares reales (OpenStreetMap / Overpass)
    urbanGeometryService  edificios de cualquier zona (teselas OSM z14)
    routeService          distancia y tiempo a pie (estimación; proveedor sustituible)
    comfortService        temperatura y viento (solo modo equilibrado)
    savedPlacesService · planShareService
    sunlightService · lightFusionService · satelliteService · cloudService · weatherService
    shadowService · solarService · mapService
  lib/
    sunWindows · planning · planningTime · placeSampling · placeTypes · geometry · formatSun
    solarCalculations · cloudInterpolation · satelliteInterpolation · sunlightCalculations
    radiationCalculations · sourceWeights · coordinates · cache
```

`findBestSunPlaces(request)` es la función única que usan la interfaz y, mañana, una API, las
notificaciones o las recomendaciones: recibe intención, ubicación, franja, duración y preferencias, y
devuelve lugares ordenados. También acepta candidatos propios (`options.places`): un punto exacto es
un lugar más (`createCoordinatePlace`).

**Preparado, sin implementar**: routing real · bancos, cafés y restaurantes como lugares ·
muestreo en rejilla para zonas sin POIs · *Find Shade* · notificaciones · itinerarios de varios lugares
· cuentas · calibración con sensores (`LightObservation`).

## Tests

```bash
npx vitest run
```

Cubren geometría y muestreo, ventanas de sol y mejor ventana, planificación de franjas (incluido el
cambio de hora), Sun Score y ranking (un 95 poco fiable no gana a un 91 fiable), normalización de
lugares de OpenStreetMap, la búsqueda de extremo a extremo sin meteorología («Sol posible»), y los
escenarios de luz efectiva, fusión y satélite de la fase anterior.
**No se han podido ejecutar en el entorno de desarrollo** (solo se dispone de `npm run build`); se
han revisado a mano. Ejecútalos antes de fiarte.

## Variables de entorno

Ver `.env.example`. Mapbox: `VITE_MAPBOX_TOKEN` (sin token, mapa abierto equivalente).

**Licencias.** Open-Meteo: gratis solo para uso **no comercial** (< 10.000 llamadas/día); para
producción, `VITE_OPEN_METEO_API_KEY` o, mejor, un proxy propio. **Overpass**: servidores públicos con
política de uso justo (una descarga semanal por navegador); para producción, `VITE_OVERPASS_URL` o una
copia propia del inventario. Atribuciones (Open-Meteo / Météo-France / EUMETSAT, OpenStreetMap) en la
interfaz.

## Limitaciones conocidas

* **La respuesta real de Overpass no se ha podido verificar.** Desde el entorno de desarrollo el
  servidor respondía al estado pero no a consultas, así que la consulta y la normalización están
  escritas contra el formato documentado y probadas con elementos de ejemplo, **no** contra datos
  reales de Barcelona. Cuántos lugares hay de cada tipo (sobre todo terrazas con `outdoor_seating` y
  espacios abiertos) es una incógnita hasta la primera ejecución real; la interfaz solo ofrece los
  tipos con datos.
* **Las terrazas son aproximadas** (se conoce el local, no las mesas) y las alturas de edificios de
  OpenStreetMap a veces están estimadas.
* **No hay routing**: los minutos a pie son una estimación en línea recta con rodeo.
* **Escala kilométrica.** Satélite y modelo no distinguen una calle soleada de la contigua.
* **Las observaciones del satélite no son verdad de terreno** y la directa puede estar derivada del
  GHI. Sin estaciones en tierra no hay forma de medir el error real.
* **Los pesos son heurísticos** (Sun Score, ranking, fusión, confort, persistencia). Están en un solo
  sitio para calibrarlos; no están calibrados.
* **Una búsqueda «en toda Barcelona» descarga unas decenas de teselas de edificios** la primera vez
  (varios MB) y tarda unos segundos; después quedan en memoria. «Cerca de mí» descarga muy pocas.
* **Más allá de mañana no hay previsión**: solo geometría solar y sombras («sol posible»).
* **Sin verificación visual en navegador** de la nueva interfaz ni ejecución de tests en esta fase.

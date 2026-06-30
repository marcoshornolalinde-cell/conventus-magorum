# Inventario de assets para interfaz grafica

Este documento sirve como briefing para implantar una primera interfaz grafica del motor headless. La fuente de verdad sigue siendo `data/content_bundle.json`; los assets deben representar tipos, zonas y arquetipos, no cartas individuales.

## Objetivo visual

Crear una interfaz clara para jugar, depurar y narrar partidas sin producir un arte distinto para cada carta.

La primera version debe permitir reconocer:

- que tipo de carta es cada elemento;
- a que arquetipo/color pertenece;
- en que zona esta;
- si esta girada, atacando, bloqueando, marcada con dano, con contadores o con habilidades temporales;
- que fase/ventana de decision esta activa.

## Fuera de alcance por ahora

- Ilustracion unica por carta.
- Animaciones complejas de combate.
- Tablero 3D.
- Constructor de mazos visual completo.
- Edicion visual de cartas.

## Estilo recomendado

Direccion: fantasia tactica legible, mas tablero de juego que landing page. La UI debe priorizar claridad y lectura rapida.

Evitar:

- fondos demasiado oscuros que oculten cartas;
- arte muy detallado dentro de cartas pequenas;
- paletas de un solo color para toda la app;
- exceso de brillo o particulas en zonas funcionales.

Preferir:

- tablero con textura sutil;
- zonas delimitadas con bajo contraste;
- cartas genericas por tipo con siluetas grandes;
- iconos consistentes para mana, keywords y estados.

## Resoluciones base

Assets raster recomendados:

- Fondos grandes: `2560x1440`, version adicional `1920x1080`.
- Tablero/mesa: `2560x1440`.
- Fondos de panel o zona: `1024x1024` tileable o `1600x900`.
- Arte generico de carta: `768x1024` o `1024x1365`, ratio aproximado `3:4`.
- Iconos: SVG preferible; si son raster, `256x256` con transparencia.
- Avatares/arquetipos: `512x512` o `768x768`.

Formatos:

- `webp` para fondos e ilustraciones.
- `png` para assets con transparencia si no hay SVG.
- `svg` para iconos, simbolos, overlays y marcadores.

## Estructura propuesta de carpetas

```text
assets/
  ui/
    icons/
    counters/
    frames/
    overlays/
  backgrounds/
    boards/
    zones/
    archetypes/
  cards/
    types/
    backs/
    tokens/
  fx/
```

## Fondos requeridos

| Asset | Prioridad | Uso | Notas de revision |
| --- | --- | --- | --- |
| `backgrounds/boards/default_board.webp` | MVP | Fondo principal de partida | Debe dejar leer cartas y texto encima. |
| `backgrounds/boards/debug_board.webp` | MVP | Vista de depuracion/selfplay | Mas plana, poco decorativa. |
| `backgrounds/zones/battlefield_zone.webp` | MVP | Banda o textura de campo de batalla | Sutil; no debe parecer una carta. |
| `backgrounds/zones/hand_zone.webp` | MVP | Zona de mano | Debe separar claramente cartas jugables. |
| `backgrounds/zones/deck_zone.webp` | MVP | Spell deck y land deck | Puede ser textura compartida. |
| `backgrounds/zones/graveyard_zone.webp` | MVP | Cementerio | Visualmente apagado, pero legible. |
| `backgrounds/zones/exile_zone.webp` | MVP | Exilio | Diferente del cementerio. |
| `backgrounds/zones/stack_zone.webp` | P2 | Pila/resolucion | Aunque la pila sea simple ahora, reservar espacio visual. |
| `backgrounds/zones/combat_lane.webp` | MVP | Carril atacante/bloqueador | Debe ayudar a explicar emparejamientos. |
| `backgrounds/zones/log_panel.webp` | P2 | Registro/narracion | Muy sobrio. |

## Cartas genericas por tipo

No se requiere arte por carta. Para la primera UI basta con plantillas por tipo principal y variaciones de color.

| Asset | Prioridad | Uso | Variantes necesarias |
| --- | --- | --- | --- |
| `cards/types/creature.webp` | MVP | Criaturas | W, U, B, R, G, multicolor, colorless. |
| `cards/types/land.webp` | MVP | Tierras | W, U, B, R, G. |
| `cards/types/instant.webp` | MVP | Hechizos instantaneos/combat tricks | W, U, B, R, G. |
| `cards/types/sorcery.webp` | MVP | Removal y hechizos no criatura | W, U, B, R, G. |
| `cards/types/enchantment.webp` | MVP | Auras/encantamientos | W, U, B, R, G. |
| `cards/types/artifact.webp` | MVP | Artefactos | Colorless y color asociado si aplica. |
| `cards/types/token_creature.webp` | MVP | Tokens genericos | Zombie, Goblin, Soldier/Cat si aparecen. |
| `cards/backs/spell_deck_back.webp` | MVP | Reverso spellDeck | Distinto de landDeck. |
| `cards/backs/land_deck_back.webp` | MVP | Reverso landDeck | Distinto de spellDeck. |

Revision importante:

- El nombre, coste, fuerza/resistencia y texto salen de datos, no de la imagen.
- La imagen debe tener espacio visual para overlays de UI.
- Las cartas pequenas deben seguir siendo distinguibles por tipo/color.

## Marcos y overlays de carta

| Asset | Prioridad | Uso |
| --- | --- | --- |
| `ui/frames/card_frame_creature.svg` | MVP | Marco para criaturas. |
| `ui/frames/card_frame_noncreature.svg` | MVP | Marco para hechizos/permanentes no criatura. |
| `ui/frames/card_frame_land.svg` | MVP | Marco para tierras. |
| `ui/overlays/tapped.svg` | MVP | Estado girado. |
| `ui/overlays/attacking.svg` | MVP | Criatura atacante. |
| `ui/overlays/blocking.svg` | MVP | Criatura bloqueadora. |
| `ui/overlays/summoning_sick.svg` | P2 | Criatura que no puede girarse/atacar aun. |
| `ui/overlays/targetable.svg` | MVP | Objetivo legal. |
| `ui/overlays/selected.svg` | MVP | Seleccion actual. |
| `ui/overlays/illegal.svg` | MVP | Accion no disponible. |
| `ui/overlays/damage_badge.svg` | MVP | Dano marcado. |
| `ui/overlays/counter_badge.svg` | MVP | Contadores +1/+1. |
| `ui/overlays/temporary_buff.svg` | P2 | Efectos hasta fin de turno. |
| `ui/overlays/exiled_binding.svg` | P2 | Carta exiliada por otro permanente. |

## Iconos de mana

| Asset | Prioridad | Uso |
| --- | --- | --- |
| `ui/icons/mana_w.svg` | MVP | Mana blanco. |
| `ui/icons/mana_u.svg` | MVP | Mana azul. |
| `ui/icons/mana_b.svg` | MVP | Mana negro. |
| `ui/icons/mana_r.svg` | MVP | Mana rojo. |
| `ui/icons/mana_g.svg` | MVP | Mana verde. |
| `ui/icons/mana_c.svg` | MVP | Mana generico/colorless. |
| `ui/icons/tap.svg` | MVP | Coste de girar. |

Los iconos deben funcionar a `16px`, `24px` y `32px`.

## Iconos de keywords y mecanicas

| Keyword/mecanica | Prioridad | Asset |
| --- | --- | --- |
| Flying | MVP | `ui/icons/keyword_flying.svg` |
| Reach | MVP | `ui/icons/keyword_reach.svg` |
| First strike | MVP | `ui/icons/keyword_first_strike.svg` |
| Double strike | MVP | `ui/icons/keyword_double_strike.svg` |
| Trample | MVP | `ui/icons/keyword_trample.svg` |
| Lifelink | MVP | `ui/icons/keyword_lifelink.svg` |
| Deathtouch | MVP | `ui/icons/keyword_deathtouch.svg` |
| Menace | MVP | `ui/icons/keyword_menace.svg` |
| Vigilance | MVP | `ui/icons/keyword_vigilance.svg` |
| Haste | MVP | `ui/icons/keyword_haste.svg` |
| Indestructible | P2 | `ui/icons/keyword_indestructible.svg` |
| Ward | P2 | `ui/icons/keyword_ward.svg` |
| Unblockable temporal | MVP | `ui/icons/status_unblockable.svg` |
| Sacrificio tras dano | P2 | `ui/icons/status_sacrifice_after_damage.svg` |
| Trigger pendiente | P2 | `ui/icons/status_trigger.svg` |
| Habilidad activada | MVP | `ui/icons/action_activate.svg` |

## Arquetipos

Necesitamos assets por arquetipo para avatares, insignias y fondos suaves de seleccion. No son ilustraciones por carta.

| Arquetipo | Tema | Prioridad | Assets |
| --- | --- | --- | --- |
| `cats` | Gatos | MVP | Avatar, badge, fondo de selector. |
| `vampires` | Vampiros | MVP | Avatar, badge, fondo de selector. |
| `healing` | Curacion / vidas | MVP | Avatar, badge, fondo de selector. |
| `pirates` | Piratas | MVP | Avatar, badge, fondo de selector. |
| `wizards` | Magos | MVP | Avatar, badge, fondo de selector. |
| `undead` | No muertos | MVP | Avatar, badge, fondo de selector. |
| `goblins` | Goblins | MVP | Avatar, badge, fondo de selector. |
| `inferno` | Dragones / dano | MVP | Avatar, badge, fondo de selector. |
| `elves` | Elfos | MVP | Avatar, badge, fondo de selector. |
| `primal` | Bestias / contadores | MVP | Avatar, badge, fondo de selector. |

Nombres sugeridos:

```text
backgrounds/archetypes/cats_panel.webp
backgrounds/archetypes/cats_avatar.webp
ui/icons/archetype_cats.svg
```

## UI funcional

| Asset | Prioridad | Uso |
| --- | --- | --- |
| `ui/icons/play.svg` | MVP | Ejecutar selfplay / avanzar. |
| `ui/icons/pause.svg` | P2 | Pausar narracion. |
| `ui/icons/step.svg` | MVP | Avanzar accion/fase. |
| `ui/icons/restart.svg` | MVP | Reiniciar partida. |
| `ui/icons/shuffle.svg` | MVP | Barajar/seed. |
| `ui/icons/log.svg` | MVP | Abrir historial. |
| `ui/icons/settings.svg` | MVP | Opciones. |
| `ui/icons/inspect.svg` | MVP | Inspeccionar carta. |
| `ui/icons/close.svg` | MVP | Cerrar modal. |
| `ui/icons/confirm.svg` | MVP | Confirmar accion. |
| `ui/icons/cancel.svg` | MVP | Cancelar/pasar. |

## Estados de partida que deben representarse

La UI debe poder mostrar estos estados aunque el asset sea simple:

- `setup`
- `start`
- `main1`
- `combat`
- `main2`
- `final`
- `gameOver`
- prioridad de jugador;
- accion legal disponible;
- stack vacia o con elementos;
- atacante declarado;
- bloqueador asignado;
- dano marcado;
- criatura muerta/exiliada/devuelta;
- mano inicial;
- spellDeck y landDeck separados;
- mana pool actual;
- habilidades activadas disponibles.

## Efectos visuales opcionales

Estos no bloquean MVP, pero ayudan mucho a leer la partida.

| FX | Prioridad | Uso |
| --- | --- | --- |
| `fx/damage_hit.webp` o sprite | P2 | Dano a criatura/jugador. |
| `fx/life_gain.webp` | P2 | Lifelink/curacion. |
| `fx/death.webp` | P2 | Muere criatura. |
| `fx/exile.webp` | P2 | Exilio. |
| `fx/draw_card.webp` | P2 | Robo. |
| `fx/mana_produced.webp` | P2 | Activacion de tierra/mana. |
| `fx/counter_added.webp` | P2 | Contador +1/+1. |
| `fx/keyword_gain.webp` | P2 | Gana keyword temporal. |

## Componentes visuales sin asset complejo

Estos pueden resolverse con CSS/SVG simple:

- barras de vida;
- contador de turno;
- badges de power/toughness;
- borde de prioridad;
- linea atacante-bloqueador;
- tooltip de keyword;
- tabla/resumen final;
- log de eventos.

## Checklist de revision de imagenes

Cada asset recibido debe revisarse con esta lista:

- Se entiende su funcion a tamano pequeno.
- No compite con texto de carta.
- Tiene suficiente contraste en fondo claro y oscuro.
- No contiene texto embebido salvo que sea un icono universal.
- Mantiene un estilo coherente con el resto.
- Funciona en escritorio y movil.
- Tiene licencia/propiedad clara para uso en el proyecto.
- Nombre de archivo estable y en minusculas.
- Peso razonable para web.

## Tabla de seguimiento

| Asset | Estado | Responsable | Fuente/proveedor | Decision | Notas |
| --- | --- | --- | --- | --- | --- |
| `backgrounds/boards/default_board.webp` | Pendiente |  |  |  |  |
| `cards/types/creature.webp` | Pendiente |  |  |  |  |
| `cards/types/land.webp` | Pendiente |  |  |  |  |
| `cards/types/instant.webp` | Pendiente |  |  |  |  |
| `cards/types/sorcery.webp` | Pendiente |  |  |  |  |
| `cards/types/enchantment.webp` | Pendiente |  |  |  |  |
| `cards/types/artifact.webp` | Pendiente |  |  |  |  |
| `cards/backs/spell_deck_back.webp` | Pendiente |  |  |  |  |
| `cards/backs/land_deck_back.webp` | Pendiente |  |  |  |  |
| `ui/icons/mana_w.svg` | Pendiente |  |  |  |  |
| `ui/icons/mana_u.svg` | Pendiente |  |  |  |  |
| `ui/icons/mana_b.svg` | Pendiente |  |  |  |  |
| `ui/icons/mana_r.svg` | Pendiente |  |  |  |  |
| `ui/icons/mana_g.svg` | Pendiente |  |  |  |  |
| `ui/icons/tap.svg` | Pendiente |  |  |  |  |
| `ui/icons/keyword_flying.svg` | Pendiente |  |  |  |  |
| `ui/icons/keyword_first_strike.svg` | Pendiente |  |  |  |  |
| `ui/icons/keyword_trample.svg` | Pendiente |  |  |  |  |
| `ui/icons/keyword_lifelink.svg` | Pendiente |  |  |  |  |
| `ui/icons/keyword_deathtouch.svg` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/cats_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/vampires_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/healing_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/pirates_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/wizards_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/undead_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/goblins_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/inferno_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/elves_avatar.webp` | Pendiente |  |  |  |  |
| `backgrounds/archetypes/primal_avatar.webp` | Pendiente |  |  |  |  |

## Paquete minimo para empezar UI

Para una primera interfaz jugable, pediria solo esto:

1. Un fondo de tablero.
2. Fondos o estilos para battlefield, hand, decks, graveyard y exile.
3. Seis plantillas genericas de carta: creature, land, instant, sorcery, enchantment, artifact.
4. Dos reversos: spellDeck y landDeck.
5. Iconos de mana W/U/B/R/G/C y girar.
6. Iconos de keywords principales: flying, first strike, double strike, trample, lifelink, deathtouch, menace, vigilance, haste.
7. Avatares o badges de los 10 arquetipos.
8. Overlays de tapped, attacking, blocking, selected, targetable, damage y counters.

Con ese paquete ya se puede construir una UI funcional sin bloquearse por arte especifico de cada carta.

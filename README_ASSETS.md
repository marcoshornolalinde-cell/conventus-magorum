# Conventus Magorum — MVP asset pack

Paquete de assets generados para arrancar la primera UI del motor headless.

## Uso recomendado

Copia la carpeta `assets/` en la raiz del proyecto o ajusta el path base del frontend.

El paquete prioriza claridad de lectura:

- los nombres, costes, fuerza/resistencia y textos de reglas deben venir de `data/content_bundle.json`;
- las imagenes de `cards/types/` son plantillas genericas por tipo/color, no cartas individuales;
- los SVG de `ui/icons/`, `ui/frames/` y `ui/overlays/` estan pensados para escalar sin perder nitidez;
- los fondos tienen textura suave para no competir con texto ni overlays.

## Estructura

```text
assets/
  ui/
    icons/       mana, keywords, controles, badges de arquetipo
    frames/      marcos SVG por tipo de carta
    overlays/    tapped, attacking, blocking, selected, targetable, etc.
  backgrounds/
    boards/      tablero normal y tablero debug
    zones/       zonas funcionales de la partida
    archetypes/  avatares y paneles de los 10 arquetipos
  cards/
    types/       plantillas genericas por tipo/color
    backs/       reversos de spellDeck y landDeck
    tokens/      tokens genericos iniciales
  fx/            sprites opcionales P2
```

## Convencion de color de carta

- `_w`: blanco
- `_u`: azul
- `_b`: negro
- `_r`: rojo
- `_g`: verde
- `_m`: multicolor
- `_c`: incoloro

Ejemplos:

```text
assets/cards/types/creature_g.webp
assets/cards/types/instant_u.webp
assets/cards/types/artifact_c.webp
```

## Sugerencia de mapeo rapido

```ts
const CARD_ART_BY_TYPE = {
  creature: '/assets/cards/types/creature.webp',
  land: '/assets/cards/types/land.webp',
  instant: '/assets/cards/types/instant.webp',
  sorcery: '/assets/cards/types/sorcery.webp',
  enchantment: '/assets/cards/types/enchantment.webp',
  artifact: '/assets/cards/types/artifact.webp',
};

const CARD_ART_BY_TYPE_AND_COLOR = (type: string, color: string) =>
  `/assets/cards/types/${type}_${color.toLowerCase()}.webp`;
```

## Licencia / procedencia

Todos los assets de este paquete han sido generados proceduralmente para este proyecto. No contienen iconos, ilustraciones ni texturas de terceros.

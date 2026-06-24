# Plan de arranque en Codex: motor headless e IA vs IA

Objetivo inicial: implementar el juego sin interfaz gráfica, con un motor determinista capaz de ejecutar partidas completas entre dos jugadores controlados por computadora.

La prioridad no es tener una UI bonita, sino conseguir:

1. Cargar cartas y arquetipos desde JSON.
2. Construir mazos automáticamente.
3. Ejecutar el turno general compartido.
4. Validar acciones legales.
5. Resolver pila, fases, combate y final de turno.
6. Implementar una IA heurística inicial.
7. Ejecutar partidas IA vs IA en modo headless.
8. Guardar logs para análisis y futuro aprendizaje.

---

## 1. Tecnología recomendada

Para este proyecto recomiendo empezar con **TypeScript + Node.js**.

Motivos:

- Es fácil reutilizar el motor después en web, móvil o Electron.
- Permite usar los JSON ya generados directamente.
- Facilita tests rápidos.
- Codex trabaja muy bien con TypeScript.
- Más adelante se puede conectar con Python para machine learning usando logs exportados.

Estructura recomendada:

```text
card-game/
  package.json
  tsconfig.json
  data/
    cards.json
    archetypes.json
    content_bundle.json
    match_setup_rules.json
  docs/
    reglas-base-juego-cartas-v5.md
    diseno-ia-selfplay-codex.md
  src/
    core/
      types.ts
      gameState.ts
      engine.ts
      actions.ts
      legalActions.ts
      stack.ts
      phases.ts
      combat.ts
      costs.ts
      effects.ts
      triggers.ts
      zones.ts
      attachments.ts
      graveyard.ts
      exile.ts
      keywords.ts
    data/
      loadContent.ts
      validateContent.ts
      buildDecks.ts
    ai/
      aiTypes.ts
      heuristicAI.ts
      evaluation.ts
      combatPlanner.ts
      targetPicker.ts
    selfplay/
      runMatch.ts
      runTournament.ts
      logger.ts
      metrics.ts
    cli/
      selfplay.ts
  tests/
    engine/
    combat/
    cards/
    ai/
```

---

## 2. Principio más importante

El motor debe ser la autoridad.

La IA nunca debe poder hacer trampas.

La IA no debe modificar el estado directamente.

Siempre debe pedir:

```ts
getLegalActions(gameState, playerId)
```

Y después elegir una acción de esa lista.

Flujo correcto:

```text
Motor genera acciones legales.
IA elige una acción legal.
Motor valida otra vez.
Motor aplica la acción.
Motor actualiza estado.
Motor genera disparos, pila y acciones basadas en estado.
```

---

## 3. Primera meta funcional

La primera versión debe poder ejecutar esto:

```bash
npm run selfplay -- --games 100 --aiA heuristic_v1 --aiB heuristic_v1
```

Y producir algo así:

```text
Games: 100
AI A wins: 53
AI B wins: 47
Average turns: 8.4
Average actions: 71
Errors: 0
```

Sin UI.

---

## 4. Fase 0: preparar datos

Copiar a `data/`:

```text
cards.json
archetypes.json
content_bundle.json
match_setup_rules.json
engine_tags.json
```

El motor debe consumir principalmente:

```text
content_bundle.json
```

Ese archivo contiene:

- cartas;
- arquetipos;
- cambios de texto;
- reglas de construcción de partida;
- tags/módulos.

---

## 5. Fase 1: modelo de datos

Codex debe empezar creando tipos fuertes.

Archivos:

```text
src/core/types.ts
src/core/gameState.ts
```

Tipos mínimos:

```ts
type PlayerId = "A" | "B";

type Zone =
  | "spellDeck"
  | "landDeck"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "stack";

type Phase =
  | "start"
  | "main1"
  | "combat_positioning"
  | "combat_resolution"
  | "main2"
  | "end"
  | "cleanup";

type CardType =
  | "Creature"
  | "Instant"
  | "Sorcery"
  | "Artifact"
  | "Enchantment"
  | "Land";
```

Estado mínimo:

```ts
interface GameState {
  seed: number;
  turnNumber: number;
  phase: Phase;
  attackingPriority: PlayerId;
  activePlayer: PlayerId;
  players: Record<PlayerId, PlayerState>;
  battlefield: Permanent[];
  stack: StackItem[];
  pendingTriggers: Trigger[];
  combat?: CombatState;
  winner?: PlayerId;
  lossReason?: string;
}
```

---

## 6. Fase 2: carga de contenido

Archivos:

```text
src/data/loadContent.ts
src/data/validateContent.ts
src/data/buildDecks.ts
```

Debe hacer:

1. Cargar `content_bundle.json`.
2. Validar que hay 10 arquetipos.
3. Validar que cada arquetipo tiene 20 cartas.
4. Elegir 2 arquetipos distintos por jugador.
5. Crear pool de 40 cartas.
6. Separar:
   - mazo de hechizos;
   - mazo de tierras.
7. Barajar ambos mazos con seed reproducible.
8. Robar 4 cartas iniciales del mazo de hechizos.

Función objetivo:

```ts
createInitialGame(config: MatchConfig): GameState
```

---

## 7. Fase 3: bucle de partida

Archivo:

```text
src/core/engine.ts
```

Funciones principales:

```ts
advanceGame(state: GameState): GameState;
applyAction(state: GameState, action: GameAction): GameState;
isGameOver(state: GameState): boolean;
```

El motor debe avanzar fase a fase:

```text
Inicio
Principal 1
Combate
Principal 2
Final
Limpieza
```

Para headless, los temporizadores reales no importan. Se sustituyen por decisiones de pasar.

En la versión sin UI:

```text
Una fase principal termina cuando ambos jugadores pasan consecutivamente con la pila vacía.
Una ventana de respuesta termina cuando ambos jugadores pasan consecutivamente.
```

Esto simula los tiempos sin depender de reloj.

Más adelante, la UI puede convertir esos pases en temporizadores de 15s y 5s.

---

## 8. Fase 4: acciones legales

Archivo:

```text
src/core/legalActions.ts
```

Debe generar acciones según fase.

Acciones mínimas:

```ts
type GameAction =
  | CastSpellAction
  | ActivateAbilityAction
  | ChooseCombatPositionAction
  | ChooseDamageOrderAction
  | PassAction;
```

### En fase principal con pila vacía

Acciones legales:

- jugar criaturas;
- jugar permanentes;
- jugar conjuros;
- activar habilidades tipo sorcery;
- pasar.

### En ventana de respuesta

Acciones legales:

- jugar instantáneos;
- jugar cartas con flash;
- activar habilidades válidas;
- pasar.

### En combate

Acciones legales:

- elegir posición de criaturas;
- ordenar atacantes;
- ordenar defensores;
- elegir orden de daño;
- jugar trucos durante ventanas de respuesta;
- pasar.

---

## 9. Fase 5: pila y respuestas

Archivos:

```text
src/core/stack.ts
src/core/effects.ts
src/core/triggers.ts
```

Primera implementación:

```text
Hechizo entra en pila.
Ambos jugadores pueden responder.
Si ambos pasan, se resuelve el objeto superior.
Después se revisan disparos.
Si la pila queda vacía, se vuelve a fase normal.
```

Para headless:

```text
responsePasses = número de jugadores que han pasado consecutivamente.
Si llega a 2, resolver.
```

---

## 10. Fase 6: combate

Archivo:

```text
src/core/combat.ts
```

Primera versión debe implementar:

- posicionamiento secreto simulado por cada IA;
- ataque/defensa/a salvo;
- restricciones:
  - girada no puede atacar/defender;
  - recién jugada no puede atacar salvo haste;
  - vigilancia no gira al atacar;
- prioridad atacante;
- emparejamiento automático;
- defensores sobrantes;
- vista previa lógica;
- ventana de trucos antes de cada combate;
- daño simultáneo;
- first strike;
- double strike;
- trample;
- menace simplificado;
- deathtouch;
- lifelink;
- destrucción por resistencia 0 o menor.

Para headless, el posicionamiento no necesita ser “secreto” visualmente, pero debe resolverse como si ambos eligieran antes de revelar.

Flujo:

```text
IA A decide posicionamiento.
IA B decide posicionamiento.
Motor revela ambos a la vez.
Motor resuelve ataque del jugador con prioridad.
Motor resuelve ataque del otro jugador.
```

---

## 11. Fase 7: implementación parcial de cartas

No hace falta implementar todas las cartas de golpe.

Primero implementar efectos genéricos suficientes:

- criaturas vanilla;
- flying;
- reach;
- vigilance;
- haste;
- lifelink;
- deathtouch;
- first strike;
- double strike;
- trample;
- menace;
- robar;
- descartar;
- daño directo;
- destruir criatura;
- exiliar criatura;
- +N/+N hasta fin de turno;
- contadores +1/+1;
- tokens 1/1;
- auras simples;
- equipos simples.

Cartas complejas pueden marcarse como:

```ts
implemented: false
```

o resolverse con una versión simplificada.

---

## 12. Fase 8: IA heurística v1

Archivos:

```text
src/ai/heuristicAI.ts
src/ai/evaluation.ts
src/ai/combatPlanner.ts
src/ai/targetPicker.ts
```

Interfaz:

```ts
interface AIPlayer {
  chooseAction(state: GameState, playerId: PlayerId, legalActions: GameAction[]): GameAction;
}
```

Primera IA:

1. Busca letal.
2. Juega una buena criatura si puede.
3. Usa removal contra la mejor criatura rival.
4. Ataca si parece favorable.
5. Defiende si está en riesgo.
6. Guarda instantáneos si puede usarlos como respuesta.
7. Pasa si no tiene acción útil.

No debe ser perfecta. Debe jugar partidas completas.

---

## 13. Fase 9: self-play

Archivos:

```text
src/selfplay/runMatch.ts
src/selfplay/runTournament.ts
src/selfplay/logger.ts
src/selfplay/metrics.ts
src/cli/selfplay.ts
```

Función principal:

```ts
runSelfPlayMatch(config: SelfPlayConfig): MatchResult
```

Debe permitir:

```bash
npm run selfplay -- --games 10
npm run selfplay -- --games 100 --seed 123
npm run selfplay -- --archetypesA cats,goblins --archetypesB vampires,undead
```

Resultado:

```json
{
  "winner": "A",
  "turns": 9,
  "lossReason": "life_zero",
  "playerA": {
    "archetypes": ["cats", "goblins"],
    "finalLife": 4
  },
  "playerB": {
    "archetypes": ["vampires", "undead"],
    "finalLife": 0
  }
}
```

---

## 14. Fase 10: logs para aprendizaje

Cada partida debe guardar:

```text
logs/matches/match_000001.json
```

Contenido:

- seed;
- arquetipos;
- versión de IA;
- acciones;
- estados resumidos;
- ganador;
- razón de victoria;
- turnos;
- estadísticas.

Cada decisión debe guardar:

```json
{
  "turn": 3,
  "phase": "main1",
  "player": "A",
  "legalActionsCount": 7,
  "chosenAction": {
    "type": "cast_spell",
    "cardId": "leonin_vanguard"
  },
  "score": 5.4,
  "stateFeatures": {
    "myLife": 18,
    "opponentLife": 15,
    "myBoardValue": 8.2,
    "opponentBoardValue": 5.1,
    "myHandCount": 3,
    "availableMana": 2
  }
}
```

---

## 15. Tests obligatorios iniciales

Antes de auto-play largo, crear tests.

```text
tests/engine/deckConstruction.test.ts
tests/engine/startPhase.test.ts
tests/engine/stack.test.ts
tests/combat/basicCombat.test.ts
tests/combat/keywords.test.ts
tests/ai/heuristicAI.test.ts
tests/selfplay/runMatch.test.ts
```

Tests mínimos:

1. Construir mazo con dos arquetipos.
2. Separar tierras y hechizos.
3. Mano inicial de 4.
4. Entra tierra al inicio.
5. Ambos roban en primer turno.
6. Criatura recién jugada no puede atacar.
7. Haste permite atacar.
8. Vigilance no gira al atacar.
9. Flying solo bloqueado por flying/reach.
10. Trample pasa daño sobrante.
11. Menace simplificado funciona.
12. Ward aumenta coste.
13. Una partida IA vs IA termina sin errores.

---

## 16. Primer prompt para Codex

Pegar esto como primera tarea:

```text
Queremos crear un motor headless en TypeScript para un juego de cartas.

No implementes interfaz gráfica.

Crea la estructura inicial del proyecto Node + TypeScript con tests.

Usa los JSON de data/ como fuente de cartas y arquetipos.

Objetivo de esta primera iteración:
1. Cargar content_bundle.json.
2. Validar cartas y arquetipos.
3. Crear partida inicial con dos jugadores.
4. Asignar dos arquetipos distintos a cada jugador.
5. Crear pool de 40 cartas por jugador.
6. Separar spellDeck y landDeck.
7. Barajar ambos mazos con seed reproducible.
8. Robar mano inicial de 4 cartas del spellDeck.
9. Implementar estado básico de partida.
10. Crear un comando npm run selfplay que por ahora solo inicialice una partida y muestre resumen.

No implementes todavía todo el combate ni toda la pila.

Añade tests para:
- cargar datos;
- validar que hay 10 arquetipos;
- validar que cada arquetipo tiene 20 cartas;
- crear mazos de jugador con 2 arquetipos;
- separar tierras y hechizos;
- robar mano inicial.
```

---

## 17. Segundo prompt para Codex

Después de que lo anterior funcione:

```text
Ahora implementa el bucle básico de partida headless.

Objetivo:
1. Fase de inicio.
2. Entrada automática de tierra desde landDeck.
3. Producción de maná.
4. Robo de carta desde spellDeck.
5. Fase principal simplificada.
6. Acciones legales básicas: jugar criatura si se puede pagar, pasar.
7. Pila básica para resolver criaturas.
8. Limpieza final simplificada.
9. Alternar prioridad atacante cada turno general.
10. Terminar partida si un jugador no puede robar.

Crea una IA básica que:
- juega la primera criatura que pueda pagar;
- pasa si no puede jugar nada.

Haz que npm run selfplay ejecute una partida IA vs IA hasta 30 turnos o hasta que alguien pierda.
```

---

## 18. Tercer prompt para Codex

Después:

```text
Implementa combate headless.

Objetivo:
1. Posicionamiento de criaturas: attack / defend / safe.
2. IA básica de combate:
   - ataca con criaturas que puedan atacar;
   - defiende con criaturas enderezadas si su vida es baja;
   - deja a salvo criaturas que no puedan atacar ni defender.
3. Revelación simultánea.
4. Prioridad atacante.
5. Emparejamiento automático.
6. Daño de combate.
7. Destrucción de criaturas con resistencia 0 o menor.
8. Daño al jugador.
9. Victoria por vida 0.

Añade tests de combate básico.
```

---

## 19. Cuándo meter machine learning

No meter ML hasta que:

- una partida IA vs IA pueda terminar;
- haya 100 partidas sin errores;
- existan logs de decisiones;
- las reglas básicas estén testeadas;
- el estado se pueda convertir a features numéricas.

Antes de eso, el ML solo añadirá ruido.

---

## 20. Objetivo del primer hito

Primer hito realista:

```text
Hito 1:
El juego puede ejecutar 100 partidas IA vs IA en modo consola usando cartas simples, sin bloquearse y generando logs.
```

No hace falta que todas las cartas estén implementadas.

No hace falta que la IA juegue bien.

Sí hace falta que:

- el motor no se rompa;
- las acciones sean legales;
- las partidas terminen;
- los logs existan;
- las semillas permitan reproducir bugs.

---

## 21. Orden recomendado de trabajo

1. Proyecto TypeScript limpio.
2. Carga de JSON.
3. Construcción de mazos.
4. Estado inicial.
5. Fase de inicio.
6. Pila mínima.
7. Jugar criaturas.
8. Fase final/limpieza.
9. IA básica.
10. Self-play básico.
11. Combate básico.
12. Keywords de combate.
13. Efectos de cartas.
14. Logs.
15. Métricas.
16. Mejora heurística.
17. Auto-play masivo.
18. ML simple.

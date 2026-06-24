# Diseño de IA para el juego de cartas

Documento para Codex.

Objetivo: definir cómo debe jugar inicialmente la computadora y cómo preparar el motor para que pueda jugar contra sí misma, recopilar datos y mejorar su lógica con auto-partidas.

---

## 1. Filosofía general

La IA no debe empezar directamente con machine learning puro.

Primero necesitamos:

1. Un motor de reglas determinista.
2. Un sistema de acciones legales.
3. Una IA heurística inicial.
4. Un sistema de auto-partidas.
5. Registro de estados, acciones y resultados.
6. Evaluación de partidas.
7. Mejora progresiva mediante simulación.

La IA inicial debe ser suficientemente razonable para generar partidas útiles. Después podrá mejorarse con auto-play, búsqueda, pesos ajustables o aprendizaje automático.

---

## 2. Objetivo de la IA

La computadora debe intentar ganar reduciendo la vida del rival a 0 o menos.

Para ello debe aprender a valorar:

- ventaja de mesa;
- ventaja de cartas;
- ventaja de vida;
- tempo;
- uso eficiente del maná;
- presión ofensiva;
- defensa necesaria;
- trucos de combate;
- respuestas en la pila;
- sinergias de arquetipo;
- riesgo de perder criaturas importantes;
- posibilidad de letal.

---

## 3. Arquitectura recomendada

La IA debe separarse en varias capas.

```text
Game Engine
    └── genera estado legal y acciones legales

AI Controller
    ├── evalúa estado
    ├── puntúa acciones
    ├── elige acción
    └── registra decisión

Self-Play Runner
    ├── ejecuta partidas IA vs IA
    ├── guarda logs
    ├── calcula métricas
    └── actualiza pesos o modelos

Evaluation Suite
    ├── enfrenta versiones antiguas vs nuevas
    ├── calcula winrate
    ├── detecta partidas absurdas
    └── evita regresiones
```

---

## 4. Regla fundamental para la IA

La IA nunca debe inventar acciones.

Siempre debe pedir al motor:

```text
getLegalActions(gameState, playerId)
```

Y elegir únicamente entre esas acciones legales.

Esto evita que la IA aprenda jugadas imposibles.

---

## 5. Tipos de acciones que debe manejar la IA

El motor debe exponer acciones estructuradas.

Ejemplos:

```json
{
  "type": "cast_spell",
  "cardInstanceId": "hand_12",
  "targets": ["creature_44"],
  "payKicker": false,
  "xValue": null
}
```

```json
{
  "type": "activate_ability",
  "sourceId": "permanent_31",
  "abilityIndex": 0,
  "targets": ["creature_18"]
}
```

```json
{
  "type": "combat_positioning",
  "attackers": ["creature_1", "creature_2"],
  "defenders": ["creature_3"],
  "safe": ["creature_4"],
  "attackOrder": ["creature_2", "creature_1"],
  "defenseOrder": ["creature_3"]
}
```

```json
{
  "type": "pass"
}
```

---

## 6. Estados que debe observar la IA

La IA debe recibir un estado del juego simplificado, no necesariamente todo el estado interno completo.

Debe poder ver:

- vidas de ambos jugadores;
- maná disponible;
- fase actual;
- tiempo restante de fase o ventana;
- pila actual;
- cartas propias en mano;
- permanentes propios;
- permanentes visibles del rival;
- cementerios;
- exilio;
- cartas conocidas;
- arquetipos propios;
- arquetipos del rival si son públicos;
- prioridad atacante;
- criaturas que pueden atacar;
- criaturas que pueden defender;
- criaturas giradas;
- daño marcado;
- contadores;
- habilidades relevantes;
- si el rival perdió vida este turno;
- si se atacó este turno;
- cartas robadas este turno.

La IA no debe ver cartas ocultas del rival salvo que una regla permita conocerlas.

---

## 7. Evaluación heurística inicial

La IA inicial debe puntuar estados con una función simple.

Ejemplo:

```text
score =
    vidaPropia * 2
  - vidaRival * 2
  + valorMesaPropia
  - valorMesaRival
  + cartasManoPropias * 1.5
  - cartasManoRivalEstimadas * 1.2
  + manaDisponiblePropio * 0.3
  + presionLetal
  + sinergias
  - riesgoDeMuerte
```

Esta evaluación no tiene que ser perfecta. Solo debe evitar jugadas claramente malas.

---

## 8. Valor básico de criaturas

Para cada criatura:

```text
valorCriatura =
    fuerza * 1.2
  + resistencia * 1.0
  + valorHabilidades
  + valorContadores
  - dañoMarcado
```

Valores iniciales sugeridos:

| Habilidad | Valor |
|---|---:|
| Flying | +1.5 |
| Reach | +0.8 |
| Vigilance | +1.0 |
| Haste | +1.0 |
| First strike | +1.2 |
| Double strike | +2.0 |
| Deathtouch | +1.5 |
| Lifelink | +1.3 |
| Trample | +1.2 |
| Menace | +1.0 |
| Ward | +1.0 |
| Flash | +0.6 |

Estos valores deben estar en configuración para poder ajustarlos después.

---

## 9. Valor de cartas en mano

La IA debe valorar cartas en mano según:

- si puede jugarlas este turno;
- coste;
- impacto inmediato;
- si son respuesta;
- si son removal;
- si son truco de combate;
- si generan ventaja de cartas;
- si encajan con la mesa actual.

Regla básica:

```text
Una carta jugable ahora vale más que una carta fuerte que no se puede pagar.
```

---

## 10. Plan de juego por arquetipo

Cada tema debe tener una intención básica.

Ejemplos:

| Arquetipo | Plan inicial |
|---|---|
| Cats | Curva agresiva, atacar pronto, usar criaturas eficientes. |
| Vampires | Presionar vida rival y aprovechar disparos por pérdida de vida. |
| Healing | Ganar vida, estabilizar mesa y crecer con sinergias. |
| Pirates | Tempo, evasión, robo y trucos. |
| Wizards | Instantáneos, flash, segunda carta y control ligero. |
| Undead | Cementerio, recursión y valor al morir. |
| Goblins | Agresivo, muchas criaturas, daño rápido. |
| Inferno | Dragones, daño directo y remates. |
| Elves | Desarrollo de mesa, contadores y sinergia tribal. |
| Primal | Criaturas grandes, trample y contadores. |

Si un jugador tiene dos arquetipos, la IA debe mezclar ambos planes.

Ejemplo:

```text
Cats + Goblins = estrategia muy agresiva.
Healing + Primal = estabilizar y ganar con criaturas grandes.
Wizards + Pirates = tempo y respuestas.
Undead + Vampires = desgaste y disparos por muerte/pérdida de vida.
```

---

# 11. IA durante la fase principal

Durante una fase principal, la IA debe decidir si juega cartas o pasa.

Prioridades iniciales:

1. Si puede ganar este turno, buscar línea letal.
2. Si está en peligro de morir, jugar defensas o removal.
3. Usar el maná de forma eficiente.
4. Jugar criaturas si la mesa está vacía o necesita presión.
5. Jugar removal si elimina una amenaza relevante.
6. Jugar cartas de ventaja si no hay presión urgente.
7. Guardar instantáneos para ventanas de respuesta si son mejores como respuesta.

---

## 11.1. Cuándo jugar criaturas

La IA debe jugar criaturas si:

- tiene maná suficiente;
- la pila está vacía;
- está en fase principal;
- necesita presencia en mesa;
- la criatura mejora ataque o defensa;
- la criatura tiene habilidad de entrada útil;
- no conviene guardar maná para una respuesta mejor.

Regla simple:

```text
Si tienes maná libre y puedes jugar una criatura buena sin perder una respuesta crítica, juégala.
```

---

## 11.2. Cuándo jugar removal

La IA debe usar removal sobre criaturas que:

- puedan causar letal;
- tengan evasión como flying o menace;
- tengan habilidades de crecimiento;
- tengan lifelink si el rival está estabilizando;
- tengan double strike o trample en mesa avanzada;
- sean pieza de sinergia del rival;
- tengan mucho valor de mesa.

No debe gastar removal caro en criaturas pequeñas si no hay peligro.

---

## 11.3. Cuándo guardar maná

La IA debe guardar maná si:

- tiene instantáneos útiles;
- tiene trucos de combate;
- el rival puede atacar fuerte;
- el rival tiene una criatura clave que puede ser respondida;
- el maná guardado permite una respuesta de alto valor.

---

# 12. IA durante ventanas de respuesta

La IA no debe responder a todo.

Debe responder si:

- puede evitar perder la partida;
- puede ganar la partida;
- puede proteger una criatura clave;
- puede destruir una amenaza antes de que genere valor;
- puede ganar un combate importante;
- puede contrarrestar un hechizo muy fuerte;
- puede usar maná que probablemente se perderá sin mejor uso.

Debe pasar si:

- la respuesta tiene poco impacto;
- el rival está usando un cebo;
- la carta puede ser mejor después;
- gastar la respuesta empeora la posición futura.

---

## 12.1. Responder a hechizos en pila

La IA debe valorar el hechizo en pila.

Criterios:

```text
amenazaHechizo =
    dañoPotencial
  + cartasQueGenera
  + criaturasQueDestruye
  + permanentesQueExilia
  + bonusQueConcede
  + sinergiaConMesaRival
```

Si `amenazaHechizo` supera un umbral, responder.

---

## 12.2. Responder con trucos de combate

Antes de un combate individual, la IA debe considerar trucos si:

- salvan una criatura importante;
- permiten matar una criatura rival importante;
- convierten un ataque en letal;
- activan lifelink o daño adicional;
- hacen que trample pase daño suficiente;
- cambian first strike/double strike de forma decisiva.

Debe evitar trucos si el rival puede responder con ventaja clara.

---

# 13. IA durante posicionamiento de combate

El combate es la parte más importante de la IA.

La IA debe decidir para cada criatura:

```text
a salvo / atacando / defendiendo
```

Y también ordenar:

```text
fila de ataque
fila de defensa
```

---

## 13.1. Principios de ataque

La IA debe atacar si:

- puede hacer daño relevante;
- el rival tiene pocos defensores;
- tiene evasión;
- tiene trample;
- tiene lifelink y necesita ganar vida;
- tiene first strike o deathtouch favorable;
- el ataque fuerza malos bloqueos;
- tiene trucos de combate;
- puede amenazar letal.

La IA debe evitar atacar si:

- perdería una criatura clave sin compensación;
- necesita defender para no morir;
- el rival tiene mejores bloqueadores;
- la criatura tiene una habilidad estática importante y conviene protegerla;
- el ataque no hace daño ni fuerza pérdida rival.

---

## 13.2. Principios de defensa

La IA debe defender si:

- el rival puede hacer mucho daño;
- está baja de vida;
- tiene criaturas con buena resistencia;
- tiene criaturas con deathtouch;
- tiene reach contra flying;
- tiene criaturas que no son útiles atacando;
- necesita protegerse hasta jugar cartas grandes.

La IA debe evitar defender con:

- criaturas clave de sinergia si pueden morir;
- criaturas que conviene dejar a salvo;
- criaturas con poca resistencia contra atacantes grandes;
- criaturas que pueden ganar la partida atacando en la segunda resolución.

---

## 13.3. Principios de criaturas a salvo

Una criatura debe quedarse a salvo si:

- es pieza clave de sinergia;
- moriría en ataque o defensa sin aportar suficiente valor;
- tiene habilidad activada importante;
- el rival probablemente tiene removal o truco;
- no puede atacar ni defender legalmente;
- ya está girada;
- es mejor conservarla para turnos futuros.

---

## 13.4. Orden de ataque

La IA debe ordenar atacantes así:

1. Primero atacantes que quieren absorber los mejores bloqueadores.
2. Después atacantes con evasión o trample.
3. Después atacantes pequeños.
4. Al final atacantes que buscan colar daño si se agotan defensores.

Pero puede invertir este orden si busca letal.

Regla de prototipo:

```text
Ordenar primero atacantes con mayor valor de presión.
```

Presión sugerida:

```text
presion =
    fuerza
  + bonus por flying
  + bonus por trample
  + bonus por menace
  + bonus por lifelink si estamos bajos de vida
  + bonus por double strike
```

---

## 13.5. Orden de defensa

La IA debe ordenar defensores así:

1. Defensores con deathtouch delante si interesa matar atacantes grandes.
2. Defensores de alta resistencia contra atacantes pequeños.
3. Defensores con reach antes si hay flying rival.
4. Criaturas sacrificables antes que piezas clave.
5. Criaturas importantes al final o a salvo.

Regla de prototipo:

```text
Ordenar defensores de menor valor estratégico a mayor valor estratégico, salvo que una habilidad concreta mejore el bloqueo.
```

---

## 13.6. Posicionamiento secreto y predicción

Como el posicionamiento es secreto, la IA debe estimar qué hará el rival.

Al principio usar estimación simple:

```text
Si el rival tiene ventaja de mesa, esperar ataque.
Si el rival está bajo de vida, esperar defensa.
Si el rival tiene evasión, esperar ataque evasivo.
Si el rival tiene muchas cartas en mano y maná abierto, esperar trucos.
```

Más adelante, el sistema de auto-play puede aprender probabilidades.

---

# 14. Detección de letal

Antes de actuar en cualquier fase, la IA debe comprobar si puede ganar.

Debe buscar:

- daño directo suficiente;
- ataque no bloqueable probable;
- trample con suficiente fuerza;
- removal para quitar defensores;
- bonus temporal que permite letal;
- double strike o first strike decisivo;
- combinación de hechizos y combate.

Función sugerida:

```text
findLethalLine(gameState, playerId)
```

Si existe una línea de letal con alta probabilidad, priorizarla.

---

# 15. Defensa contra letal

La IA también debe comprobar si puede morir en el siguiente combate o por daño directo.

Función sugerida:

```text
estimateOpponentLethalThreat(gameState, playerId)
```

Si el riesgo es alto:

- dejar más criaturas en defensa;
- guardar removal;
- matar atacantes evasivos;
- ganar vida;
- evitar girar criaturas defensivas;
- conservar respuestas.

---

# 16. Selección de objetivos

La IA debe puntuar objetivos.

## 16.1. Objetivos para removal

Prioridad:

1. Criatura que permite letal al rival.
2. Criatura con evasión.
3. Criatura con habilidad de crecimiento.
4. Criatura con double strike/trample/lifelink fuerte.
5. Criatura de mayor valor de mesa.
6. Criatura que habilita sinergias.

---

## 16.2. Objetivos para bonus

Prioridad:

1. Criatura que hará daño al jugador.
2. Criatura con trample.
3. Criatura con double strike.
4. Criatura con lifelink si estamos bajos.
5. Criatura que sobrevivirá gracias al bonus.
6. Criatura clave que necesita protección.

---

## 16.3. Objetivos para contadores +1/+1

Prioridad:

1. Criatura evasiva.
2. Criatura con lifelink.
3. Criatura con trample.
4. Criatura con double strike.
5. Criatura que ya tenga otros contadores o sinergia.
6. Criatura que sobreviva mejor a removal/combate.

---

# 17. Uso de maná

El maná se genera al inicio y dura todo el turno general.

La IA debe intentar gastar bien el maná, pero no de forma ciega.

Reglas:

- No gastar todo el maná si hay una respuesta crítica en mano.
- Priorizar jugadas que usen el maná completo si tienen impacto parecido.
- Guardar maná para trucos de combate si se espera combate importante.
- Pagar Ward solo si el objetivo lo merece.
- Pagar kicker si el efecto extra es relevante y no impide una jugada mejor.
- Elegir X buscando el mayor impacto sin vaciar recursos necesarios.

---

# 18. Gestión de cartas con costes especiales

## 18.1. Kicker

Pagar kicker si:

- el efecto adicional es relevante ahora;
- no impide jugar otra carta mejor;
- mejora una línea de letal;
- genera ventaja de cartas.

No pagar kicker si:

- se necesita tempo;
- el efecto base ya es suficiente;
- el maná extra debe guardarse para respuesta.

---

## 18.2. Coste X

Elegir X según objetivo:

- Para criaturas que entran con X contadores: usar X alto si hay tiempo y mesa estable.
- Para daño: elegir X mínimo que mate el objetivo o consiga letal.
- Para efectos escalables: comparar impacto por maná.

---

## 18.3. Costes adicionales

Pagar costes adicionales solo si el resultado lo compensa.

Ejemplos:

- Sacrificar una criatura pequeña para exiliar una amenaza grande.
- Descartar una carta mala para crear Treasure y robar.
- Exiliar carta del cementerio si no rompe otra sinergia importante.

---

# 19. Uso de cementerio

La IA debe valorar el cementerio como recurso.

Debe:

- devolver criaturas si necesita mesa;
- devolver cartas clave;
- no exiliar cartas del cementerio si reducen costes importantes;
- aprovechar disparos al morir;
- usar criaturas recursivas como bloqueadores si pueden volver;
- valorar mill si alimenta cementerio propio.

---

# 20. Uso de exilio vinculado

Para cartas tipo Prayer of Binding:

- priorizar permanentes de alto valor;
- priorizar amenazas que no pueda destruir fácilmente;
- evitar exiliar criaturas poco relevantes;
- recordar que si la fuente sale del campo, el objetivo vuelve;
- proteger la fuente si el exilio es importante.

---

# 21. Dificultades de IA por nivel

Se recomienda crear niveles de IA.

## 21.1. Nivel 1: Básico

- Juega criaturas si puede.
- Ataca con criaturas fuertes.
- Defiende si está bajo de vida.
- Usa removal contra la criatura más grande.
- No calcula demasiados trucos.

## 21.2. Nivel 2: Normal

- Evalúa mesa.
- Guarda respuestas.
- Usa trucos de combate razonablemente.
- Detecta letal simple.
- Usa sinergias básicas.

## 21.3. Nivel 3: Avanzado

- Simula combates.
- Evalúa varias acciones.
- Hace rollouts cortos.
- Conserva recursos.
- Detecta letal complejo.
- Predice posicionamiento rival.

## 21.4. Nivel 4: Aprendido

- Usa pesos ajustados por auto-play.
- Mezcla exploración y explotación.
- Actualiza valoración de cartas.
- Aprende qué arquetipos combinan bien.
- Aprende patrones de combate.

---

# 22. Auto-play

El juego debe poder ejecutar partidas IA vs IA sin interfaz gráfica.

Modo recomendado:

```text
headless self-play
```

La partida debe poder correr rápidamente y producir logs.

---

## 22.1. Requisitos del modo auto-play

Debe existir una función:

```text
runSelfPlayMatch(config)
```

Entrada:

```json
{
  "seed": 12345,
  "playerA": {
    "ai": "heuristic_v1",
    "archetypes": ["cats", "goblins"]
  },
  "playerB": {
    "ai": "heuristic_v1",
    "archetypes": ["wizards", "pirates"]
  },
  "maxGeneralTurns": 30,
  "logDecisions": true
}
```

Salida:

```json
{
  "winner": "A",
  "lossReason": "life_zero",
  "turns": 8,
  "finalLife": {
    "A": 6,
    "B": 0
  },
  "stats": {
    "actionsTaken": 84,
    "combatSteps": 14,
    "cardsDrawn": {
      "A": 11,
      "B": 10
    }
  }
}
```

---

## 22.2. Logs de decisión

Cada decisión de la IA debe guardarse.

Ejemplo:

```json
{
  "matchId": "match_000123",
  "turn": 4,
  "phase": "combat_positioning",
  "player": "A",
  "stateFeatures": {
    "myLife": 12,
    "opponentLife": 9,
    "myBoardValue": 14.2,
    "opponentBoardValue": 10.5,
    "myHandCount": 3,
    "opponentHandCount": 4,
    "availableMana": 3
  },
  "legalActionsCount": 18,
  "chosenAction": {
    "type": "combat_positioning"
  },
  "actionScore": 6.8,
  "topAlternatives": [
    {
      "actionId": "attack_all",
      "score": 5.9
    },
    {
      "actionId": "defensive_position",
      "score": 4.2
    }
  ],
  "resultAfterGame": {
    "winner": "A"
  }
}
```

Estos datos luego sirven para entrenar o ajustar pesos.

---

# 23. Mejora inicial sin machine learning complejo

Antes de redes neuronales, recomiendo tres técnicas simples.

## 23.1. Ajuste de pesos por resultados

Los valores de habilidades, criaturas y acciones deben estar en un archivo configurable.

Ejemplo:

```json
{
  "flying": 1.5,
  "lifelink": 1.3,
  "trample": 1.2,
  "cardInHand": 1.5,
  "lifePoint": 2.0
}
```

El sistema puede probar variantes y medir winrate.

---

## 23.2. Rollouts cortos

Para una acción importante, la IA puede simular varias continuaciones rápidas.

Ejemplo:

```text
Acción A: atacar con todo.
Simular 20 partidas rápidas desde ese estado.
Winrate estimado: 58%.

Acción B: dejar dos defensores.
Simular 20 partidas rápidas.
Winrate estimado: 62%.

Elegir Acción B.
```

Esto es más fácil que entrenar una red neuronal al principio.

---

## 23.3. Bandits por acción

Para decisiones repetidas, usar exploración tipo epsilon-greedy.

Ejemplo:

```text
90% elegir la mejor acción conocida.
10% probar una acción alternativa legal.
```

Así la IA descubre líneas nuevas sin jugar completamente al azar.

---

# 24. Machine learning progresivo

Cuando el motor ya sea estable, se puede añadir machine learning.

## 24.1. Fase 1: aprendizaje de evaluación

Entrenar un modelo que prediga probabilidad de victoria desde un estado.

Entrada:

```text
features del estado
```

Salida:

```text
winProbability
```

Datos:

```text
estados de auto-partidas + resultado final
```

Modelo inicial recomendado:

- regresión logística;
- random forest;
- gradient boosting;
- red neuronal pequeña.

No empezar con una red grande.

---

## 24.2. Fase 2: política de acciones

Entrenar un modelo que sugiera acciones.

Entrada:

```text
estado + acción candidata
```

Salida:

```text
score de acción
```

El modelo aprende qué acciones llevaron a ganar en auto-play.

---

## 24.3. Fase 3: self-play iterativo

Ciclo:

```text
1. IA juega miles de partidas contra sí misma.
2. Se guardan estados, acciones y resultados.
3. Se entrena un evaluador.
4. Se genera una IA nueva.
5. La IA nueva juega contra la anterior.
6. Si mejora el winrate, se acepta.
7. Si no mejora, se descarta.
```

---

# 25. Recompensas para aprendizaje

La recompensa final principal debe ser:

```text
Victoria: +1
Derrota: -1
Empate o partida agotada: 0
```

Para aprendizaje temprano se pueden usar recompensas intermedias:

| Evento | Recompensa |
|---|---:|
| Hacer daño al rival | +0.03 por punto |
| Ganar vida | +0.01 por punto |
| Robar carta | +0.05 |
| Destruir criatura rival | +0.1 a +0.4 según valor |
| Perder criatura propia | -0.1 a -0.4 según valor |
| Conseguir letal | +1 |
| Evitar letal rival | +0.5 |
| Malgastar carta sin efecto | -0.2 |
| Jugar acción ilegal | No permitido por motor |

Importante:

```text
La recompensa intermedia no debe superar la importancia de ganar la partida.
```

---

# 26. Evaluación de versiones

Cada nueva IA debe enfrentarse a baselines fijos.

Baselines recomendados:

```text
random_legal
heuristic_v1
heuristic_v2
previous_best
```

Una IA nueva solo se acepta si:

- gana al menos 55% contra la versión anterior;
- no empeora contra random;
- no genera partidas bloqueadas;
- no aumenta errores de reglas;
- no explota bugs del motor.

---

# 27. Evitar que la IA aprenda trampas o bugs

En auto-play, la IA puede encontrar bugs del motor.

Por eso:

- todas las acciones deben validarse;
- registrar acciones ilegales intentadas;
- abortar partidas con estados imposibles;
- crear tests automáticos para bugs descubiertos;
- no aceptar una IA que gane explotando errores;
- congelar semillas para reproducir partidas raras.

---

# 28. Formato recomendado de configuración de IA

Archivo:

```text
ai_config.json
```

Ejemplo:

```json
{
  "version": "heuristic_v1",
  "weights": {
    "lifePoint": 2.0,
    "cardInHand": 1.5,
    "availableMana": 0.3,
    "flying": 1.5,
    "reach": 0.8,
    "vigilance": 1.0,
    "haste": 1.0,
    "firstStrike": 1.2,
    "doubleStrike": 2.0,
    "deathtouch": 1.5,
    "lifelink": 1.3,
    "trample": 1.2,
    "menace": 1.0,
    "ward": 1.0
  },
  "behavior": {
    "aggression": 0.55,
    "riskTolerance": 0.35,
    "saveRemovalThreshold": 6.0,
    "combatTrickThreshold": 3.0,
    "lethalSearch": true,
    "rolloutsEnabled": false,
    "explorationRate": 0.05
  }
}
```

---

# 29. Implementación mínima para Codex

Primera tarea recomendada:

```text
Implementar una IA heurística que:
1. Consulte acciones legales.
2. Puntúe cada acción.
3. Elija la mejor acción.
4. Pueda jugar una partida completa.
5. Guarde logs de decisiones.
6. Pueda jugar IA vs IA en modo headless.
```

No implementar machine learning todavía.

---

# 30. Roadmap recomendado

## Paso 1

Implementar IA legal básica:

- juega criaturas;
- usa removal;
- ataca;
- defiende;
- pasa.

## Paso 2

Añadir evaluación de mesa:

- valor de criaturas;
- valor de habilidades;
- vida;
- cartas;
- maná.

## Paso 3

Añadir simulador de combate:

- probar posiciones;
- estimar resultado;
- elegir ataque/defensa.

## Paso 4

Añadir auto-play:

- 100 partidas;
- logs;
- métricas;
- winrate por arquetipo.

## Paso 5

Añadir ajuste de pesos:

- probar configuraciones;
- comparar versiones;
- aceptar mejoras.

## Paso 6

Añadir ML simple:

- predictor de victoria;
- entrenamiento con logs;
- comparación contra heurística.

---

# 31. Métricas que debe producir el auto-play

Por partida:

- ganador;
- turnos;
- vidas finales;
- arquetipos de cada jugador;
- cartas robadas;
- cartas jugadas;
- daño hecho;
- criaturas destruidas;
- número de combates;
- duración;
- razón de victoria.

Por arquetipo:

- winrate individual;
- winrate por pareja de arquetipos;
- daño medio;
- turnos medios para ganar;
- cartas más jugadas;
- cartas con mayor impacto;
- cartas muertas en mano.

Por IA:

- winrate contra baselines;
- errores;
- acciones promedio por partida;
- porcentaje de maná gastado;
- porcentaje de ataques rentables;
- porcentaje de respuestas útiles.

---

# 32. Resultado esperado

Con este sistema, primero tendremos una computadora que juega de forma razonable.

Después, con auto-play, podremos mejorar:

- cuándo atacar;
- cuándo defender;
- cuándo guardar cartas;
- cuándo usar removal;
- qué cartas son más valiosas;
- qué combinaciones de arquetipos son fuertes;
- qué pesos heurísticos funcionan mejor;
- qué cartas necesitan ajuste de balance.

La meta no es que la IA sea perfecta desde el inicio.

La meta es que el juego pueda generar partidas completas, registrarlas y aprender de ellas.

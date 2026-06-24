# Reglas base del juego de cartas

Documento de diseño de reglas para el prototipo.

Este juego toma como referencia general algunas estructuras de juegos de cartas tipo *Magic: The Gathering*, pero modifica partes esenciales del sistema: el turno es compartido, las fases tienen tiempo real controlado, las tierras se gestionan desde un mazo separado y el combate usa posicionamiento secreto con filas de ataque y defensa.

---

## 1. Visión general

Juego de cartas para **2 jugadores**.

Cada jugador empieza con **20 puntos de vida**.

El objetivo es reducir los puntos de vida del rival a **0 o menos**.

La partida se desarrolla mediante **turnos generales compartidos**, en los que ambos jugadores actúan dentro de las mismas fases.

---

## 2. Regla subsidiaria de referencia

Para cualquier interacción no definida expresamente en este documento, se usará como referencia subsidiaria el ruling de *Magic: The Gathering*, siempre que no contradiga las reglas específicas de este juego.

Si una regla de este juego contradice una regla de *Magic: The Gathering*, prevalece la regla de este juego.

Esta regla subsidiaria sirve para resolver interacciones generales como:
- acciones basadas en estado;
- daño marcado;
- destrucción;
- efectos continuos;
- duración de modificadores;
- habilidades disparadas;
- habilidades activadas;
- orden de resolución de la pila;
- daño letal;
- conceptos generales de permanentes, criaturas, hechizos y zonas.

---

## 3. Preparación de la partida

Al inicio de la partida:

1. Cada jugador baraja su mazo de hechizos.
2. Cada jugador baraja su mazo de tierras.
3. Cada jugador roba **4 cartas** de su mazo de hechizos.
4. Se sortea qué jugador tendrá la **prioridad atacante** en el turno general 1.
5. La prioridad atacante alternará entre jugadores en cada turno general posterior.

No existe mulligan en la versión inicial.

---

## 4. Mazos

Cada jugador tiene dos mazos separados:

1. **Mazo de hechizos**
2. **Mazo de tierras**

---

### 4.1. Mazo de hechizos

El mazo de hechizos contiene las cartas jugables principales:

- criaturas;
- instantáneos;
- otros hechizos;
- artefactos;
- encantamientos;
- permanentes especiales;
- cualquier otra carta no considerada tierra básica.

Las cartas se roban del mazo de hechizos.

Si un jugador debe robar una carta de su mazo de hechizos y no puede porque el mazo está vacío, ese jugador pierde la partida.

Si ambos jugadores deberían perder simultáneamente por no poder robar de su mazo de hechizos, pierde el jugador que tenga la prioridad atacante en ese turno general.

---

### 4.2. Mazo de tierras

El mazo de tierras contiene únicamente tierras básicas.

Las tierras no se roban a la mano.

Las tierras no se juegan manualmente.

Al inicio de cada turno general, cada jugador saca una tierra de su mazo de tierras y la pone directamente en juego.

Si el mazo de tierras de un jugador está vacío, simplemente no entra tierra para ese jugador ese turno.

---

## 5. Turno general

Un **turno general** es un ciclo compartido por ambos jugadores.

Cada turno general está compuesto por las siguientes fases:

1. Inicio
2. Principal 1
3. Combate
4. Principal 2 / Calma de la batalla
5. Final

Ambos jugadores participan en el mismo turno general.

Cuando una regla necesite determinar quién es el “jugador activo”, se considera jugador activo al jugador que tenga la **prioridad atacante** durante ese turno general.

---

## 6. Prioridad atacante

Cada turno general tiene un jugador con **prioridad atacante**.

La prioridad atacante se sortea al inicio de la partida para el turno general 1.

Después, la prioridad atacante alterna cada turno general.

Ejemplo:

```text
Turno general 1: prioridad atacante para Jugador A.
Turno general 2: prioridad atacante para Jugador B.
Turno general 3: prioridad atacante para Jugador A.
Turno general 4: prioridad atacante para Jugador B.
```

La prioridad atacante se usa para:

- decidir qué jugador resuelve primero su ataque durante la fase de combate;
- determinar el jugador activo cuando haga falta ordenar habilidades simultáneas;
- resolver ciertos empates o pérdidas simultáneas, salvo que una regla específica diga otra cosa.

---

## 7. Fase de inicio

Durante la fase de inicio ocurren estos pasos:

1. Entra una tierra desde el mazo de tierras de cada jugador.
2. Todas las tierras de cada jugador producen maná.
3. Cada jugador roba una carta de su mazo de hechizos.
4. Se disparan las habilidades de inicio de turno o mantenimiento.

Ambos jugadores roban carta también en el primer turno general.

---

### 7.1. Entrada de tierras

Al inicio de cada turno general, cada jugador toma la primera tierra de su mazo de tierras y la pone directamente en juego.

Esta acción no usa la pila salvo que alguna carta indique explícitamente lo contrario.

Si una tierra entrando en juego dispara una habilidad, esa habilidad se pondrá en la pila en el momento correspondiente.

---

### 7.2. Producción de maná

Después de que entren las tierras del turno, todas las tierras de cada jugador producen maná.

Ese maná queda disponible durante todo el turno general.

El maná generado al inicio permanece disponible durante:

- Principal 1;
- Combate;
- Principal 2;
- Final, mientras se puedan jugar respuestas o habilidades.

El maná no gastado desaparece durante la limpieza final del turno general.

---

### 7.3. Robo de carta

Después de producir maná, cada jugador roba una carta de su mazo de hechizos.

Si un jugador debe robar y no puede, pierde la partida.

Si ambos jugadores deberían perder simultáneamente por no poder robar, pierde el jugador con prioridad atacante en ese turno general.

---

### 7.4. Habilidades de inicio o mantenimiento

Después de la entrada de tierras, producción de maná y robo, se disparan las habilidades de inicio de turno o mantenimiento.

Ejemplos:

- “Al inicio del turno...”
- “Durante el mantenimiento...”
- “Cuando robes tu primera carta del turno...”
- “Cuando una tierra entre en juego...”

Estas habilidades van a la pila y permiten respuesta.

Si se disparan habilidades simultáneas de ambos jugadores, se usa la prioridad atacante para determinar el orden de colocación en la pila, tomando al jugador con prioridad atacante como jugador activo.

---

## 8. Fases principales

Hay dos fases principales:

1. **Principal 1**
2. **Principal 2**, también llamada **Calma de la batalla**

Ambas funcionan con las mismas reglas.

Durante una fase principal, ambos jugadores pueden jugar cartas y activar habilidades.

El sistema es de tiempo real controlado mediante pila y ventanas de respuesta.

---

### 8.1. Acciones normales

Cuando la pila está vacía, ambos jugadores pueden iniciar acciones normales.

Se consideran acciones normales, entre otras:

- jugar criaturas;
- jugar permanentes;
- jugar hechizos que solo puedan jugarse en fase principal;
- activar habilidades que solo puedan usarse en fase principal.

Las criaturas y otros permanentes solo pueden jugarse durante una fase principal y cuando la pila está vacía, salvo que una carta indique otra cosa.

---

### 8.2. Modo respuesta

En cuanto una acción entra en la pila, el juego pasa a **modo respuesta**.

En modo respuesta no se pueden iniciar acciones normales.

Durante el modo respuesta solo pueden jugarse:

- instantáneos;
- habilidades activadas que puedan usarse en ese momento;
- otros efectos que indiquen que pueden responder.

Los instantáneos pueden jugarse durante ventanas de respuesta.

Las habilidades activadas pueden jugarse durante ventanas de respuesta si su texto lo permite.

---

### 8.3. Pila

La pila es la zona temporal donde se colocan cartas, habilidades y efectos antes de resolverse.

Pueden ir a la pila:

- cartas jugadas desde la mano;
- instantáneos;
- habilidades activadas;
- habilidades disparadas;
- respuestas a otras respuestas.

La pila se resuelve de arriba hacia abajo.

Una respuesta puede ser respondida por el otro jugador.

Cada vez que algo entra en la pila, se abre una nueva ventana de respuesta.

---

### 8.4. Temporizadores de fase principal

Cada fase principal tiene un tiempo base aproximado de **15 segundos**.

Mientras la pila esté vacía, corre el reloj de la fase.

Si alguien juega una carta o activa una habilidad, esa acción entra en la pila y se abre una ventana corta de respuesta.

Después de cualquier respuesta o hechizo, siempre se abre otra ventana de respuesta.

Cuando se agota una ventana de respuesta sin nuevas acciones, se resuelve el objeto superior de la pila.

Después de resolver un objeto de la pila:

1. Se comprueban habilidades disparadas.
2. Si se disparan habilidades, entran en la pila.
3. Se abre una nueva ventana de respuesta.
4. Si no hay nuevas respuestas, continúa la resolución.

Cuando la pila queda vacía, se añade una ventana de acción libre de unos **5 segundos**.

Si durante esa ventana algún jugador inicia una acción, el ciclo de pila y respuestas vuelve a comenzar.

La fase principal no termina mientras haya una pila activa o una ventana de acción/respuesta abierta.

Cuando el tiempo base y todos los tiempos añadidos se agotan, y la pila está vacía, se pasa a la siguiente fase.

---

## 9. Criaturas y estado de combate

Cada criatura puede ocupar como máximo una posición de combate.

Las posiciones posibles son:

1. A salvo
2. Atacando
3. Defendiendo

Una criatura solo puede ocupar una de estas posiciones durante un combate.

Una criatura girada no puede colocarse ni en ataque ni en defensa.

Una criatura recién jugada no puede atacar salvo que tenga prisa.

Una criatura recién jugada sí puede defender.

Una criatura que ataca se gira, salvo que tenga vigilancia.

---

---

## 9.5. Sistema de adjuntos: Auras y Equipos

Algunas cartas pueden quedar anexadas a otros permanentes. A estas cartas se las llama **adjuntos**.

Los dos tipos principales de adjuntos de esta versión son:

1. **Auras**
2. **Equipos**

Un adjunto permanece en el campo de batalla, pero está asociado a otro permanente.

---

### 10.1. Permanente anexado

Un permanente está **anexado** a otro permanente cuando una regla o efecto indica que queda unido a él.

El permanente al que se anexa se llama **objeto anexado** o **permanente encantado/equipado**, según el caso.

Un adjunto puede modificar al permanente al que está anexado mediante:

- bonus de fuerza/resistencia;
- habilidades concedidas;
- restricciones;
- cambios de estado;
- efectos continuos.

Ejemplos:

```text
Enchanted creature gets +2/+1.
Equipped creature has first strike.
Enchanted creature can't attack or defend.
```

---

### 10.2. Auras

Las Auras son permanentes que entran al campo de batalla anexadas a un objetivo legal.

Una carta de Aura debe indicar qué puede encantar mediante una línea de tipo:

```text
Enchant creature
Enchant land
Enchant permanent
```

Cuando un jugador lanza un Aura, debe elegir un objetivo legal compatible con su restricción de `Enchant`.

Ejemplo:

```text
Enchant creature
```

Esta Aura solo puede lanzarse haciendo objetivo a una criatura legal.

---

### 10.3. Entrada de un Aura

Cuando un Aura se resuelve:

1. Se comprueba si su objetivo sigue siendo legal.
2. Si el objetivo sigue siendo legal, el Aura entra al campo de batalla anexada a ese objetivo.
3. Si el objetivo ya no es legal, el Aura no entra anexada y va al descarte/cementerio.

Regla para Codex:

```text
Si un Aura se resuelve y su objetivo ya no es legal, mover el Aura al cementerio.
```

---

### 10.4. Permanencia de un Aura

Un Aura permanece anexada mientras el objeto encantado siga siendo legal.

Si el objeto encantado abandona el campo de batalla, el Aura va al cementerio.

Si el objeto encantado deja de ser un objeto legal para esa Aura, el Aura va al cementerio.

Ejemplo:

```text
Un Aura con "Enchant creature" está anexada a una criatura.
Si esa criatura deja de ser criatura, el Aura va al cementerio.
```

---

### 10.5. Controlador de un Aura

El controlador de un Aura no tiene por qué ser el controlador del permanente encantado.

Ejemplo:

```text
Jugador A puede controlar un Aura anexada a una criatura del Jugador B.
```

Los efectos del Aura se aplican al objeto encantado aunque pertenezca al rival.

---

### 10.6. Equipos

Los Equipos son permanentes que pueden anexarse a criaturas.

A diferencia de las Auras:

- un Equipo puede entrar al campo de batalla sin estar anexado;
- si la criatura equipada abandona el campo de batalla, el Equipo permanece en el campo;
- el Equipo queda desanexado, no va al cementerio.

---

### 10.7. Habilidad Equip

`Equip` es una habilidad activada de los Equipos.

Formato:

```text
Equip {cost}
```

Significa:

```text
{cost}: Attach this Equipment to target creature you control. Equip only as a sorcery.
```

En este juego, “Equip only as a sorcery” significa:

```text
Solo puedes activar Equip durante una fase principal, cuando la pila está vacía.
```

La habilidad Equip usa la pila y puede ser respondida.

---

### 10.8. Resolver Equip

Cuando una habilidad Equip se resuelve:

1. Se comprueba si el objetivo sigue siendo legal.
2. Si sigue siendo legal, el Equipo se anexa a esa criatura.
3. Si el Equipo estaba anexado a otra criatura, se desanexa de la anterior y se anexa a la nueva.
4. Si el objetivo ya no es legal, la habilidad no hace nada.

---

### 10.9. Restricciones de Equip

Por defecto, un Equipo solo puede anexarse a una criatura que controle el controlador del Equipo.

Si una carta dice otra cosa, prevalece el texto de la carta.

Un Equipo solo puede estar anexado a una criatura a la vez, salvo que una carta indique lo contrario.

Una criatura puede tener varios Equipos anexados.

---

### 10.10. Desanexar Equipos

Un Equipo se desanexa si:

- la criatura equipada abandona el campo de batalla;
- la criatura equipada deja de ser un objetivo legal para ese Equipo;
- otro efecto indica que se desanexe;
- el Equipo se anexa a otra criatura.

Cuando un Equipo se desanexa, permanece en el campo de batalla.

---

### 10.11. Adjuntos y zonas

Si un adjunto abandona el campo de batalla, deja de estar anexado.

Si un permanente con adjuntos abandona el campo de batalla:

- las Auras anexadas van al cementerio;
- los Equipos anexados permanecen en el campo de batalla desanexados;
- otros adjuntos futuros seguirán la regla que se defina para su tipo.

---

### 10.12. Adjuntos y combate

Un adjunto puede modificar a una criatura durante combate.

Si el adjunto concede una habilidad o bonus condicionado a que la criatura esté atacando, ese efecto solo se aplica mientras la criatura esté en posición de ataque.

Ejemplo:

```text
Equipped creature gets +2/+0 and has first strike while it's attacking.
```

Este bonus no se aplica si la criatura está a salvo o defendiendo.

---

### 10.13. Adjuntos y efectos continuos

Los adjuntos suelen crear efectos continuos.

Codex debe recalcular las estadísticas y habilidades de una criatura cuando:

- se le anexa un Aura;
- se le desanexa un Aura;
- se le anexa un Equipo;
- se le desanexa un Equipo;
- cambia de posición de combate;
- cambia de estado girado/enderezado;
- recibe o pierde contadores;
- empieza o termina un efecto hasta fin de turno;
- cambia de zona;
- cambia el controlador de un permanente relevante.

---

### 10.14. Orden recomendado de aplicación para prototipo

Hasta que exista un sistema completo de capas, Codex puede usar este orden simplificado:

1. Fuerza/resistencia base de la carta.
2. Efectos que fijan fuerza/resistencia base.
3. Contadores +1/+1 y -1/-1.
4. Bonus o penalizadores continuos de Auras, Equipos y otros permanentes.
5. Efectos hasta fin de turno.
6. Daño marcado.

Este orden es una simplificación práctica para el prototipo.

Si más adelante se implementa un sistema completo de capas, este apartado puede reemplazarse por un sistema más fiel al ruling subsidiario.


## 10. Fase de combate

La fase de combate se divide en dos grandes partes:

1. Posicionamiento secreto
2. Resolución de combates

---

### 10.1. Posicionamiento secreto

Al comienzo de la fase de combate, todas las criaturas están **a salvo** por defecto, salvo que algún efecto obligue a una criatura a atacar o defender.

Cada jugador coloca en secreto sus criaturas en una de las siguientes posiciones:

- a salvo;
- defendiendo;
- atacando.

Las criaturas a salvo no interactúan en el combate y no están ordenadas.

Las criaturas defensoras se colocan en una fila ordenada.

Las criaturas atacantes se colocan en una fila ordenada.

El posicionamiento y el orden son secretos para el oponente hasta que ambos jugadores hayan terminado de posicionar.

---

### 10.2. Restricciones para atacar

Una criatura no puede atacar el turno en que entra en juego, salvo que tenga prisa.

Una criatura girada no puede atacar.

Una criatura que ataca se gira, salvo que tenga vigilancia.

---

### 10.3. Restricciones para defender

Una criatura girada no puede defender.

Una criatura recién jugada sí puede defender.

Una criatura a salvo no puede defender ni ser asignada como bloqueadora durante ese combate, salvo que algún efecto indique lo contrario.

---

### 10.4. Revelación de posiciones

Una vez ambos jugadores han terminado de posicionar, se revelan:

- criaturas atacantes de cada jugador;
- criaturas defensoras de cada jugador;
- orden de la fila atacante de cada jugador;
- orden de la fila defensora de cada jugador.

Las criaturas a salvo permanecen fuera del combate.

---

## 11. Resolución general del combate

Primero se resuelve el ataque del jugador con prioridad atacante contra la defensa del rival.

Después se resuelve el ataque del otro jugador contra la defensa del primero.

Cada uno de estos ataques usa el mismo sistema:

1. Emparejamiento básico de atacantes y defensores.
2. Asignación de defensores sobrantes.
3. Vista previa de combate.
4. Resolución de cada combate individual.
5. Ventanas de respuesta antes de cada combate.
6. Aplicación de daño.
7. Comprobación de acciones basadas en estado.
8. Resolución de habilidades disparadas antes de pasar al siguiente combate.

---

## 12. Emparejamiento básico

Para resolver un ataque, se revisa la fila de atacantes en orden.

El primer atacante intenta ser bloqueado por el primer defensor libre que pueda bloquearlo.

Si ese defensor no puede bloquearlo, se prueba con el siguiente defensor libre, y así sucesivamente.

Si ningún defensor libre puede bloquearlo, el atacante queda no bloqueado.

Después se repite el proceso con el segundo atacante, luego con el tercero, y así sucesivamente.

Si quedan atacantes pero no quedan defensores libres, esos atacantes quedan no bloqueados.

Un atacante no bloqueado hará daño al jugador defensor igual a su fuerza, salvo que algún efecto modifique esa regla.

---

## 13. Defensores sobrantes

Si después del emparejamiento básico ya no quedan atacantes por asignar, pero sí quedan defensores libres, esos defensores pueden reforzar combates existentes.

Cada defensor libre revisa los combates en orden.

Para decidir si un defensor sobrante se une a un combate, se calcula si el atacante sobreviviría al daño total de los defensores ya asignados, usando fuerza y resistencia actuales en ese instante.

No se tienen en cuenta posibles trucos de combate futuros.

Si el atacante de un combate sobreviviría, el defensor libre se une a ese combate, siempre que pueda bloquear a ese atacante.

Después se recalcula el combate y se continúa con el siguiente defensor libre.

Ejemplo conceptual:

```text
Combate 1: Atacante A1 bloqueado por Defensor B1.
A1 sobreviviría al daño de B1.
Defensor libre B2 puede bloquear a A1.
B2 se une al Combate 1.
Se recalcula si A1 sobreviviría contra B1 + B2.
```

---

## 14. Vista previa de combate

Cuando los emparejamientos están hechos, se muestran durante unos **5 segundos** antes de empezar la resolución.

Durante esta vista previa, los jugadores pueden ver:

- qué atacantes están bloqueados;
- qué atacantes no están bloqueados;
- qué defensores bloquean a cada atacante;
- qué criaturas parecen destinadas a morir si no se modifican las condiciones;
- qué daños directos al jugador parecen previstos.

Esta vista previa no resuelve daño por sí misma.

---

## 15. Resolución individual de combates

Los combates se resuelven en orden según la fila de atacantes.

Antes de resolver cada combate individual, se abre una ventana de respuesta.

Este es el momento principal para jugar trucos de combate.

Ejemplos de trucos de combate:

- aumentar fuerza o resistencia;
- prevenir daño;
- destruir una criatura antes del daño;
- retirar una criatura del combate;
- dar evasión;
- dar dañar primero;
- modificar bloqueadores;
- enderezar o girar criaturas;
- activar habilidades relevantes.

Después de la ventana de respuesta, se resuelve ese combate.

---

### 15.1. Atacante no bloqueado

Si el atacante no está bloqueado, hace daño al jugador defensor igual a su fuerza.

Si el jugador defensor queda a 0 vidas o menos, pierde la partida.

---

### 15.2. Atacante bloqueado

Si el atacante está bloqueado por una o varias criaturas, el atacante ordena los bloqueadores.

El atacante debe asignar daño suficiente para destruir al primer bloqueador antes de poder asignar daño al siguiente.

Después debe asignar daño suficiente para destruir al segundo antes de poder asignar daño al tercero, y así sucesivamente.

Esta regla usa como referencia el concepto de daño letal de *Magic: The Gathering*, salvo que una regla específica del juego diga otra cosa.

---

### 15.3. Daño de los defensores

Todos los defensores asignados a ese combate hacen daño al atacante.

Los defensores suman sus fuerzas contra el atacante.

El daño del atacante y el daño de los defensores se aplican simultáneamente durante la resolución de ese combate, salvo que alguna habilidad modifique esta regla.

---

### 15.4. Daño y destrucción

Después de aplicar daño, se comprueban acciones basadas en estado.

Las criaturas con resistencia actual 0 o menor son destruidas.

Una criatura destruida abandona el combate y va al descarte.

Una criatura asignada a un combate que abandone el campo antes de que su combate se resuelva se retira de la fila correspondiente.

---

## 16. Habilidades disparadas durante combate

Las habilidades disparadas durante la resolución de un combate van a la pila después de terminar esa resolución de combate.

Ejemplos:

- “Cuando esta criatura muera...”
- “Cuando esta criatura haga daño...”
- “Cuando una criatura rival sea destruida...”
- “Cuando esta criatura sobreviva al combate...”

Estas habilidades permiten respuesta.

Antes de pasar al siguiente combate individual, deben resolverse las habilidades disparadas pendientes y cualquier pila generada por ellas.

Cuando la pila queda vacía, se continúa con el siguiente combate.

---

## 17. Cambio de papeles en combate

Después de resolver todos los ataques del jugador con prioridad atacante, se resuelve el ataque del otro jugador.

Para ello se repite el mismo procedimiento:

1. Emparejamiento básico.
2. Defensores sobrantes.
3. Vista previa de combate.
4. Resolución individual de combates.
5. Ventanas de respuesta.
6. Daño.
7. Acciones basadas en estado.
8. Habilidades disparadas.

---

## 18. Segunda fase principal / Calma de la batalla

Después del combate llega la segunda fase principal, llamada también **Calma de la batalla**.

Funciona igual que Principal 1.

Durante esta fase:

- ambos jugadores pueden jugar cartas si la pila está vacía;
- se pueden activar habilidades;
- se pueden jugar instantáneos durante ventanas de respuesta;
- las habilidades disparadas van a la pila;
- la pila se resuelve de arriba hacia abajo;
- se aplican los mismos temporizadores de fase principal.

---

## 19. Fase final

La fase final tiene dos partes:

1. Efectos de fin de turno.
2. Limpieza final.

---

### 19.1. Efectos de fin de turno

Primero se disparan los efectos de fin de turno.

Ejemplos:

- “Al final del turno...”
- “Al comienzo de la fase final...”
- “Cuando termine el turno...”
- “Hasta el final del turno, cuando...”

Estos efectos van a la pila y permiten respuesta.

Si se disparan habilidades simultáneas de ambos jugadores, se usa la prioridad atacante para determinar el orden de colocación en la pila, tomando al jugador con prioridad atacante como jugador activo.

---

### 19.2. Limpieza final

Después de resolver todos los efectos de fin de turno, llega la limpieza final.

La limpieza final no usa la pila y no permite respuestas.


En este juego, el **untap step** se define como una subparte de la limpieza final de la fase final.

Esto significa que cualquier carta que haga referencia al `untap step` se refiere al momento de la limpieza final en el que se enderezan criaturas, artefactos, encantamientos y demás permanentes.

Durante la limpieza final:

1. Las criaturas vivas recuperan la resistencia perdida.
2. Desaparecen los efectos “hasta fin de turno”.
3. Las criaturas jugadas este turno pierden el mareo de invocación.
4. Se enderezan criaturas, artefactos, encantamientos y demás permanentes.
5. El maná no gastado desaparece.

A estas acciones no se puede responder.

---

## 20. Fin del turno general

Cuando termina la limpieza final, termina el turno general.

Comienza un nuevo turno general.

La prioridad atacante pasa al otro jugador.

---

## 21. Resumen rápido del turno general

```text
INICIO
- Entra una tierra de cada mazo de tierras.
- Todas las tierras producen maná.
- Ambos jugadores roban una carta.
- Se disparan habilidades de inicio/mantenimiento.

PRINCIPAL 1
- Acciones en tiempo real.
- Si la pila está vacía, ambos pueden actuar.
- Si algo entra en pila, se pasa a modo respuesta.
- Temporizador base + ventanas de respuesta + ventanas extra.

COMBATE
- Posicionamiento secreto.
- Criaturas a salvo / atacando / defendiendo.
- Se revelan filas.
- Resuelve primero el jugador con prioridad atacante.
- Después resuelve el otro jugador.
- Cada combate individual tiene ventana de respuesta.
- Se aplican daños y acciones basadas en estado.

PRINCIPAL 2 / CALMA DE LA BATALLA
- Igual que Principal 1.

FINAL
- Habilidades de fin de turno con respuesta.
- Limpieza final sin respuesta.
- Se recupera daño.
- Terminan efectos temporales.
- Se pierde mareo de invocación.
- Se endereza todo.
- Desaparece el maná.
```

---

## 22. Reglas clave resumidas

- Ambos jugadores empiezan con 20 vidas.
- Cada jugador roba 4 cartas al inicio de la partida.
- No existe mulligan.
- Hay dos mazos: hechizos y tierras.
- Las tierras entran automáticamente desde el mazo de tierras.
- Las tierras producen maná al inicio del turno general.
- El maná dura todo el turno general y desaparece en la limpieza final.
- Ambos jugadores roban carta en todos los turnos generales, incluido el primero.
- Si un jugador no puede robar del mazo de hechizos, pierde.
- Si ambos deberían perder simultáneamente por no poder robar, pierde quien tenga la prioridad atacante.
- El turno es compartido por ambos jugadores.
- La prioridad atacante se sortea en el turno 1 y luego alterna.
- El jugador con prioridad atacante se considera jugador activo para ordenar efectos simultáneos.
- Cuando la pila está vacía, ambos jugadores pueden iniciar acciones.
- En cuanto algo entra en la pila, el juego pasa a modo respuesta.
- Las criaturas y permanentes solo se juegan en fase principal con la pila vacía.
- Los instantáneos se juegan durante ventanas de respuesta.
- Las habilidades activadas se juegan durante ventanas de respuesta si su texto lo permite.
- El combate usa posicionamiento secreto.
- Cada criatura está a salvo, atacando o defendiendo.
- Las criaturas a salvo no combaten.
- Las criaturas giradas no pueden atacar ni defender.
- Las criaturas recién jugadas no pueden atacar salvo que tengan prisa, pero sí pueden defender.
- Atacar gira a la criatura salvo que tenga vigilancia.
- El daño de combate se aplica simultáneamente dentro de cada combate individual.
- Las criaturas con resistencia actual 0 o menor son destruidas.
- Las habilidades disparadas durante combate van a la pila antes del siguiente combate.
- La limpieza final no permite respuestas.
- Las reglas de este documento prevalecen sobre las reglas subsidiarias de *Magic: The Gathering*.

---

## 23. Textos adaptados de cartas importadas

Esta sección recoge cambios de texto necesarios para que ciertas cartas funcionen correctamente con el turno general compartido y el combate con posicionamiento secreto.

Los textos de esta sección sustituyen al texto original de las cartas dentro de este prototipo.

---

### 23.1. Leonin Vanguard

Texto adaptado:

```text
At the beginning of combat, if you control three or more creatures, Leonin Vanguard gets +1/+1 until end of turn and you gain 1 life.
```

Implementación:

- Se dispara al comienzo de todos los combates.
- No depende de quién tenga la prioridad atacante.
- Comprueba si su controlador controla tres o más criaturas al resolver.

---

### 23.2. Battle-Rattle Shaman

Texto adaptado:

```text
At the end of the combat positioning step, target attacking creature you control gets +2/+0 until end of turn.
```

Implementación:

- Se dispara al final de la fase de posicionamiento de combate, después de revelar posiciones.
- No es opcional.
- Solo puede hacer objetivo a una criatura que controle su controlador.
- Solo puede hacer objetivo a una criatura que esté posicionada atacando.
- Si no hay objetivo legal, la habilidad no se pone en la pila o se retira sin efecto, según la implementación elegida para habilidades disparadas obligatorias sin objetivo.

---

### 23.3. Stromkirk Bloodthief

Texto adaptado:

```text
At the beginning of the end step, if an opponent lost life this turn, put a +1/+1 counter on target Vampire you control.
```

Implementación:

- Se dispara al comienzo de la fase final de todos los turnos generales.
- No depende de quién tenga la prioridad atacante.
- Comprueba si algún oponente perdió vida durante ese turno general.
- Si la condición se cumple, hace objetivo a un Vampire que controles.
- Al resolver, pone un contador +1/+1 sobre ese Vampire.

---

### 23.4. Quick-Draw Katana

Texto adaptado:

```text
Equipped creature gets +2/+0 and has first strike while it's attacking. (It deals combat damage before creatures without first strike.)

Equip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)
```

Implementación:

- El bonus +2/+0 solo se aplica mientras la criatura equipada esté posicionada atacando.
- First strike solo se concede mientras la criatura equipada esté posicionada atacando.
- Si la criatura equipada está defendiendo o a salvo, no recibe ni el bonus ni first strike por esta carta.
- Equip se activa solo durante una fase principal con la pila vacía.
- Equip usa la pila y permite respuesta.

---

### 23.5. Brineborn Cutthroat

Texto adaptado:

```text
Flash (You may cast this spell any time you could cast an instant.)

Whenever you cast an instant spell or a spell with flash, put a +1/+1 counter on Brineborn Cutthroat.
```

Implementación:

- Puede lanzarse durante ventanas de respuesta.
- La habilidad se dispara cuando su controlador lanza un hechizo instantáneo.
- La habilidad también se dispara cuando su controlador lanza un hechizo con flash.
- No depende de la prioridad atacante ni de si es “turno del oponente”.
- Si Brineborn Cutthroat se lanza a sí mismo, no debería disparar su propia habilidad porque todavía no está en el campo de batalla cuando se lanza, salvo que el motor implemente otra regla específica.

---

### 23.6. Starlight Snare y el untap step

El texto puede conservar la referencia al untap step si el motor define ese paso dentro de la fase final.

Regla de adaptación:

```text
The untap step is part of the final cleanup of the end phase.
```

Implementación:

- En este juego, el untap step ocurre dentro de la limpieza final.
- Cuando una carta diga que un permanente no se endereza durante su untap step, significa que no se endereza durante la parte de enderezar de la limpieza final.
- Starlight Snare impide que la criatura encantada se enderece durante esa parte de la limpieza final.

---

## 24. Referencias descartadas a planeswalkers

El prototipo inicial no implementa planeswalkers.

Por tanto, todas las referencias a planeswalkers se eliminan del texto funcional de las cartas.

Ejemplos de adaptación:

```text
Destroy target creature or planeswalker.
```

pasa a ser:

```text
Destroy target creature.
```

```text
Exile target creature or planeswalker.
```

pasa a ser:

```text
Exile target creature.
```

```text
This spell deals damage to target creature or planeswalker.
```

pasa a ser:

```text
This spell deals damage to target creature.
```

No se deben crear objetivos ni validaciones de tipo `planeswalker` en esta versión del motor.


---

## 25. Texto adaptado: Eaten by Piranhas

El texto funcional de `Eaten by Piranhas` se simplifica para el prototipo.

Texto adaptado:

```text
Enchanted creature loses all abilities and has base power and toughness 1/1.
```

Implementación:

- Es un Aura.
- Debe estar anexada a una criatura legal.
- Mientras esté anexada, la criatura encantada pierde todas sus habilidades.
- Mientras esté anexada, la fuerza/resistencia base de la criatura encantada pasa a ser 1/1.
- Los contadores, otros modificadores continuos y efectos hasta fin de turno se aplican después de fijar la fuerza/resistencia base en 1/1.
- Para el prototipo, se descartan cambios de color, tipo o subtipo.

Orden simplificado de aplicación:

```text
1. Efectos que fijan fuerza/resistencia base, como Eaten by Piranhas.
2. Contadores.
3. Bonus o penalizadores de Auras, Equipos y otros permanentes.
4. Efectos hasta fin de turno.
5. Daño marcado.
```

Si una criatura pierde todas sus habilidades, no se eliminan los efectos ya creados por habilidades que se hayan resuelto antes de perderlas.

---

## 26. Exilio vinculado

Algunas cartas exilian un permanente hasta que la fuente que lo exilió abandone el campo de batalla.

Ejemplo de carta afectada:

- Prayer of Binding

Este tipo de efecto se llama **exilio vinculado**.

---

### 26.1. Definición

Un efecto de exilio vinculado mueve un objeto a la zona de exilio y registra qué permanente es responsable de mantenerlo allí.

Ejemplo conceptual:

```text
Exile target nonland permanent an opponent controls until Prayer of Binding leaves the battlefield.
```

Esto significa:

```text
Mientras Prayer of Binding permanezca en el campo de batalla, el permanente exiliado permanece en el exilio.
Cuando Prayer of Binding abandone el campo de batalla, el permanente exiliado vuelve al campo de batalla.
```

---

### 26.2. Registro interno

Codex debe registrar una relación entre:

- el permanente que crea el exilio vinculado;
- el objeto exiliado;
- el propietario del objeto exiliado;
- el controlador que tenía el objeto antes de ser exiliado, si se quiere conservar esa información;
- la zona desde la que fue exiliado;
- el efecto que debe devolverlo.

Ejemplo de estructura interna:

```json
{
  "sourcePermanentId": "prayer_of_binding_123",
  "exiledObjectId": "creature_456",
  "returnCondition": "source_leaves_battlefield",
  "returnTo": "battlefield",
  "returnController": "owner"
}
```

Para el prototipo, el objeto exiliado vuelve al campo de batalla bajo el control de su propietario, salvo que una carta indique otra cosa.

---

### 26.3. Resolver el exilio vinculado

Cuando un efecto de exilio vinculado se resuelve:

1. Se comprueba que el objetivo siga siendo legal.
2. Si el objetivo es legal, se mueve al exilio.
3. Se registra el vínculo entre la fuente y el objeto exiliado.
4. Si el objetivo no es legal, el efecto no exilia nada.

---

### 26.4. Devolución del objeto exiliado

Cuando el permanente que mantiene el vínculo abandona el campo de batalla:

1. Se buscan todos los objetos exiliados vinculados a ese permanente.
2. Esos objetos vuelven al campo de batalla.
3. El vínculo se elimina.
4. La devolución no usa la pila, salvo que una carta indique otra cosa.
5. Si el objeto que debe volver ya no está en el exilio, no ocurre nada.

---

### 26.5. Si la fuente abandona antes de exiliar

Si el permanente que debería mantener el exilio abandona el campo de batalla antes de que se resuelva el efecto de exilio, el objeto no debe quedar exiliado indefinidamente.

Regla recomendada:

```text
Si la fuente del exilio vinculado ya no está en el campo de batalla cuando el efecto se resuelve, el objetivo no se exilia.
```

Esto evita exilios permanentes accidentales.

---

### 26.6. Tokens exiliados

Si un token es exiliado mediante exilio vinculado, deja de existir como acción basada en estado.

Cuando la fuente abandone el campo de batalla, ese token no vuelve.

---

### 26.7. Adjuntos y contadores al exiliar

Cuando un permanente es exiliado:

- pierde sus contadores;
- se desanexan sus Equipos;
- las Auras anexadas a él van al cementerio;
- los efectos hasta fin de turno dejan de aplicarle porque cambia de zona.

Cuando vuelve al campo de batalla, vuelve como un nuevo objeto sin memoria de su existencia anterior.

---

## 27. Costes especiales y modificación de costes

Algunas cartas requieren reglas adicionales para calcular o pagar costes.

Cartas afectadas, entre otras:

- Wildwood Scourge
- Into the Roil
- Eaten Alive
- Seize the Spoils
- Incinerating Blast
- Tolarian Terror
- Arcane Epiphany
- Dragonlord's Servant
- Carnelian Orb of Dragonkind

---

### 27.1. Orden general para lanzar un hechizo

Para lanzar un hechizo, Codex debe seguir este orden:

```text
1. Elegir la carta que se quiere lanzar.
2. Elegir modos, si los tiene.
3. Elegir valor de X, si el coste contiene X.
4. Elegir si se paga kicker u otros costes opcionales.
5. Elegir costes alternativos, si existen.
6. Elegir objetivos legales.
7. Calcular coste base.
8. Aplicar aumentos de coste.
9. Aplicar reducciones de coste.
10. Añadir costes adicionales obligatorios.
11. Añadir costes adicionales opcionales elegidos.
12. Comprobar si el jugador puede pagar.
13. Pagar maná y costes adicionales.
14. Poner el hechizo en la pila.
15. Disparar habilidades de “whenever you cast”.
```

Si en cualquier punto no se puede completar una elección obligatoria o pagar el coste total, el hechizo no puede lanzarse.

---

### 27.2. Coste X

Algunas cartas tienen `{X}` en su coste.

Regla:

```text
El jugador elige el valor de X al lanzar el hechizo.
```

El valor de X:

- debe ser un número entero igual o mayor que 0;
- se suma al coste total;
- queda registrado en el hechizo mientras está en la pila;
- puede usarse por el efecto al resolver.

Ejemplo:

```text
Wildwood Scourge enters with X +1/+1 counters on it.
```

Implementación:

- El jugador elige X al lanzar.
- Paga el coste correspondiente.
- Al resolver, el permanente entra con X contadores +1/+1.

---

### 27.3. Kicker

`Kicker` es un coste adicional opcional.

Formato:

```text
Kicker {cost}
```

Significa:

```text
You may pay an additional {cost} as you cast this spell.
```

Reglas:

- El jugador decide si paga kicker al lanzar el hechizo.
- Esa decisión queda registrada en el hechizo.
- Al resolver, el hechizo comprueba si fue kickeado.
- Si fue kickeado, aplica el efecto adicional.

Ejemplo:

```text
Into the Roil
```

Implementación conceptual:

```text
Return target nonland permanent to its owner's hand.
If this spell was kicked, draw a card.
```

---

### 27.4. Costes adicionales obligatorios

Algunas cartas exigen pagar un coste adicional para poder lanzarse.

Ejemplos:

```text
As an additional cost to cast this spell, discard a card.
As an additional cost to cast this spell, sacrifice a creature.
```

Reglas:

- El coste adicional se paga durante el lanzamiento.
- Si el jugador no puede pagarlo, no puede lanzar el hechizo.
- Si el coste adicional implica elegir entre opciones, el jugador elige una opción válida.
- Los costes adicionales no son efectos y no pueden ser respondidos directamente.
- Lo que ocurra por pagar el coste sí puede disparar habilidades.

Ejemplos de cartas:

- Seize the Spoils: descartar una carta como coste adicional.
- Eaten Alive: sacrificar una criatura o pagar maná adicional, según la versión usada.
- Incinerating Blast: puede requerir condiciones o costes especiales según el texto final.

---

### 27.5. Costes alternativos y elección entre costes

Algunas cartas permiten elegir entre distintas formas de pagar.

Regla:

```text
Si una carta ofrece un coste alternativo, el jugador elige una forma de pago al lanzar la carta.
```

Ejemplo conceptual:

```text
As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}.
```

Implementación:

1. El jugador elige una opción válida.
2. Codex comprueba si puede pagarla.
3. El coste elegido se paga durante el lanzamiento.
4. Las opciones no elegidas no se pagan ni producen efectos.

---

### 27.6. Reducción de coste

Algunos efectos reducen el coste de lanzar hechizos.

Ejemplos:

- Dragonlord's Servant reduce el coste de hechizos de Dragón.
- Tolarian Terror cuesta menos por instantáneos y conjuros en el cementerio.
- Arcane Epiphany puede tener reducción según cartas o tipos, según texto final.

Reglas:

- Las reducciones se aplican después de aumentos de coste y antes del pago.
- Una reducción no puede reducir el componente de maná genérico por debajo de 0.
- Una reducción genérica no reduce costes de maná de color, salvo que el efecto lo diga.
- Si varias reducciones se aplican, se suman.

Ejemplo:

```text
This spell costs {1} less to cast for each instant and sorcery card in your graveyard.
```

Implementación:

1. Contar cartas instantáneo y conjuro en el cementerio del jugador.
2. Reducir el coste genérico en esa cantidad.
3. El coste genérico mínimo es 0.

---

### 27.7. Comprobación de tipos en cementerio o en mesa

Algunos costes o efectos dependen de tipos de carta en ciertas zonas.

Codex debe poder consultar:

- tipos de cartas en cementerio;
- subtipos de permanentes en campo;
- si controlas una criatura de un tipo concreto;
- si una carta en cementerio es criatura, instantáneo, conjuro, etc.;
- si un hechizo en la pila tiene un tipo concreto.

Ejemplos:

```text
This spell costs {1} less for each instant and sorcery card in your graveyard.
Dragon spells you cast cost {1} less to cast.
Return target creature card from your graveyard to your hand.
```

---

### 27.8. Maná con efecto asociado

Algunas cartas producen maná que añade un efecto si se usa para lanzar cierto tipo de hechizo.

Ejemplo:

```text
Spend this mana only to cast a Dragon creature spell. It gains haste until end of turn.
```

Reglas:

- Codex debe etiquetar el maná producido con una restricción o efecto asociado.
- Al pagar un hechizo, debe registrarse qué maná se ha usado.
- Si el maná con efecto asociado se usa correctamente, el hechizo o permanente resultante recibe el efecto indicado.
- Si el maná no puede usarse legalmente para ese hechizo, no puede gastarse en él.

Ejemplo de estructura interna:

```json
{
  "amount": 1,
  "color": "red",
  "restriction": "dragon_creature_spell_only",
  "onSpentEffect": "that_creature_gains_haste_until_end_of_turn"
}
```

---

### 27.9. Costes y habilidades disparadas

Pagar costes puede provocar eventos.

Ejemplos:

- descartar una carta;
- sacrificar una criatura;
- exiliar cartas del cementerio;
- girar un permanente.

Estos eventos pueden disparar habilidades.

Las habilidades disparadas por pagar costes se ponen en la pila después de que el hechizo o habilidad que se está lanzando haya sido puesto en la pila.

---

## 28. Cementerio, descarte y retorno de cartas

El cementerio es una zona pública donde van muchas cartas después de usarse, morir o descartarse.

Cartas afectadas, entre otras:

- Reassembling Skeleton
- Cemetery Recruitment
- Crow of Dark Tidings
- Deadly Plot
- Suspicious Shambler
- Elvish Regrower
- Undying Malice

---

### 28.1. Cementerio y descarte

Para este prototipo, `cementerio` y `descarte` se consideran la misma zona funcional.

Nombre recomendado para código:

```text
graveyard
```

Van al cementerio:

- criaturas destruidas;
- criaturas con resistencia 0 o menor;
- hechizos instantáneos o conjuros después de resolverse;
- cartas descartadas de la mano;
- cartas sacrificadas;
- cartas molidas desde el mazo;
- Auras que dejan de estar anexadas legalmente;
- permanentes destruidos.

---

### 28.2. Zona pública

El cementerio es público.

Ambos jugadores pueden consultar:

- número de cartas;
- nombres;
- tipos;
- subtipos;
- costes;
- texto;
- orden, si el motor decide conservarlo.

Para el prototipo, no es necesario que el orden del cementerio importe salvo que una carta futura lo requiera.

---

### 28.3. Morir

Una criatura **muere** cuando va del campo de batalla al cementerio.

Regla:

```text
A creature dies when it is put into a graveyard from the battlefield.
```

No se considera morir si:

- es exiliada;
- vuelve a la mano;
- vuelve al mazo;
- cambia de controlador;
- deja de ser criatura pero permanece en el campo;
- es un token que abandona el campo hacia una zona distinta del cementerio.

Si un token criatura va del campo al cementerio, sí cuenta como morir antes de dejar de existir.

---

### 28.4. Habilidades disparadas al morir

Las habilidades de muerte se disparan cuando una criatura muere.

Ejemplos:

```text
When this creature dies...
Whenever another creature you control dies...
When this creature enters or dies...
```

Implementación:

1. La criatura va al cementerio.
2. Se registra el evento `dies`.
3. Las habilidades que correspondan se disparan.
4. Esas habilidades van a la pila.
5. Los jugadores pueden responder.

---

### 28.5. Cartas con habilidades activadas desde el cementerio

Algunas cartas pueden activar habilidades desde el cementerio.

Ejemplo:

```text
Reassembling Skeleton
{1}{B}: Return Reassembling Skeleton from your graveyard to the battlefield tapped.
```

Reglas:

- La carta debe estar en el cementerio para activar la habilidad.
- El controlador de la habilidad es el propietario de la carta, salvo que una carta indique otra cosa.
- La habilidad usa la pila.
- Los jugadores pueden responder.
- Si la carta ya no está en el cementerio al resolver, la habilidad no hace nada.

---

### 28.6. Retorno al campo de batalla girado

Algunos efectos devuelven cartas del cementerio al campo de batalla giradas.

Regla:

```text
Return this card from your graveyard to the battlefield tapped.
```

Implementación:

1. Comprobar que la carta está en el cementerio.
2. Moverla al campo de batalla.
3. Marcarla como girada.
4. Tratarla como un nuevo objeto.
5. Si es criatura, entra con mareo de invocación salvo que tenga prisa o una regla indique otra cosa.
6. Disparar habilidades de entrada al campo de batalla.

---

### 28.7. Retorno a la mano

Algunos efectos devuelven cartas del cementerio a la mano.

Ejemplos:

```text
Return target creature card from your graveyard to your hand.
Return a card from your graveyard to your hand.
```

Reglas:

- El objetivo debe estar en el cementerio al lanzar o resolver, según corresponda.
- Si el objetivo ya no está en el cementerio al resolver, el efecto no hace nada.
- La carta vuelve a la mano de su propietario.

---

### 28.8. Exiliar desde el cementerio como coste

Algunos efectos requieren exiliar cartas del cementerio como coste.

Ejemplo conceptual:

```text
As an additional cost to cast this spell, exile a creature card from your graveyard.
```

Reglas:

- Exiliar desde el cementerio como coste ocurre durante el lanzamiento o activación.
- No se puede responder al pago del coste.
- Si no hay una carta válida para exiliar, no se puede pagar ese coste.
- La carta exiliada deja el cementerio antes de que el hechizo o habilidad vaya a la pila.
- Este movimiento puede disparar habilidades si existen efectos que miren cartas que abandonan el cementerio.

---

### 28.9. Mill

Algunas cartas ponen cartas de la parte superior del mazo en el cementerio.

Regla:

```text
Mill N means put the top N cards of your spell deck into your graveyard.
```

Implementación:

- Solo se muele el mazo de hechizos.
- El mazo de tierras no se muele salvo que una carta lo diga explícitamente.
- Si hay menos de N cartas, se mueven todas las cartas posibles.
- Moler no es robar.
- No perderás por intentar moler más cartas de las disponibles, salvo que una regla futura lo indique.

---

### 28.10. Discard

Descartar significa mover una carta de la mano al cementerio.

Reglas:

- Si un efecto dice que un jugador descarta, ese jugador elige una carta de su mano, salvo que el efecto diga otra cosa.
- Si el descarte es un coste, se realiza durante el lanzamiento o activación.
- Si el descarte es un efecto, ocurre al resolver.
- Descartar puede disparar habilidades.

---

### 28.11. Sacrifice

Sacrificar significa que el controlador de un permanente lo pone en el cementerio.

Reglas:

- Solo puedes sacrificar permanentes que controlas.
- Sacrificar no es destruir.
- Un permanente sacrificado no puede ser regenerado por efectos que solo eviten destrucción, salvo que una carta diga otra cosa.
- Si una criatura sacrificada va al cementerio, cuenta como morir.
- Sacrificar puede ser coste o efecto.

---

### 28.12. Efectos de retorno temporal al morir

Algunas cartas crean un efecto que devuelve una criatura cuando muere durante ese turno.

Ejemplo:

```text
When that creature dies this turn, return it to the battlefield tapped under its owner's control.
```

Implementación:

1. Crear un efecto retardado hasta fin de turno sobre la criatura objetivo.
2. Si esa criatura muere este turno, disparar el retorno.
3. Al resolver, devolverla al campo de batalla girada bajo el control de su propietario.
4. La criatura vuelve como un nuevo objeto.
5. El efecto retardado se consume aunque la criatura no pueda volver.

Carta afectada:

- Undying Malice

---

### 28.13. Retorno condicionado por tipo

Algunas cartas devuelven cartas de un tipo concreto.

Ejemplos:

```text
Return target creature card from your graveyard to your hand.
If it's a Zombie card, draw a card.
```

Codex debe poder comprobar:

- si una carta en cementerio es criatura;
- si tiene subtipo Zombie, Vampire, Elf, etc.;
- si cumple condiciones adicionales.

---

### 28.14. Interacción con reducción de costes

El cementerio puede afectar a costes.

Ejemplo:

```text
This spell costs {1} less to cast for each instant and sorcery card in your graveyard.
```

Codex debe poder contar cartas por tipo en el cementerio en el momento de calcular el coste.

---

## 29. Recomendación de implementación actualizada

Con estas reglas, las siguientes cartas pasan de “complejas” a “implementables con módulo”:

| Carta | Módulo necesario |
|---|---|
| Prayer of Binding | Exilio vinculado |
| Wildwood Scourge | Coste X y contadores +1/+1 |
| Into the Roil | Kicker |
| Eaten Alive | Coste adicional o alternativo, exilio |
| Seize the Spoils | Coste adicional de descarte y Treasure |
| Incinerating Blast | Coste/condición especial según texto final |
| Tolarian Terror | Reducción de coste por cementerio y Ward |
| Arcane Epiphany | Reducción de coste y robo |
| Dragonlord's Servant | Reducción de coste por tipo Dragón |
| Carnelian Orb of Dragonkind | Maná con efecto asociado |
| Reassembling Skeleton | Habilidad desde cementerio y retorno girado |
| Cemetery Recruitment | Retorno a mano y comprobación de subtipo |
| Crow of Dark Tidings | Mill |
| Deadly Plot | Destrucción y posible coste adicional |
| Suspicious Shambler | Disparos al morir o cementerio según texto final |
| Elvish Regrower | Retorno desde cementerio |
| Undying Malice | Efecto retardado de retorno al morir |


---

## 30. Ward, first strike, double strike, trample y menace

Esta sección define habilidades de combate o protección que modifican el funcionamiento normal del motor.

Estas reglas prevalecen sobre el comportamiento subsidiario de *Magic: The Gathering* cuando haya diferencia.

---

### 30.1. Ward

En este juego, `Ward` no se implementa como una habilidad disparada que pueda contrarrestar el hechizo o habilidad.

En su lugar, `Ward` funciona como un **incremento obligatorio de coste**.

Texto conceptual:

```text
Ward {cost}
```

Significa:

```text
Spells and abilities your opponents control that target this permanent cost {cost} more to cast or activate.
```

Reglas:

- Si un jugador quiere lanzar un hechizo o activar una habilidad que haga objetivo a un permanente del oponente con Ward, debe pagar el coste adicional de Ward.
- Este pago no es opcional.
- Si el jugador no puede pagar el coste adicional, no puede lanzar ese hechizo ni activar esa habilidad con ese objetivo.
- Ward se aplica durante el cálculo de costes, antes de pagar.
- Ward no usa la pila.
- Ward no puede ser respondido directamente.
- Ward no contrarresta nada, porque el hechizo o habilidad nunca llega a lanzarse si el coste no puede pagarse.

Ejemplo:

```text
Tolarian Terror has ward {2}.
An opponent wants to cast a spell targeting Tolarian Terror.
That spell costs {2} more to cast.
If the opponent cannot pay {2}, they cannot choose Tolarian Terror as the target.
```

---

### 30.2. Varios objetivos con Ward

Si un mismo hechizo o habilidad hace objetivo a varios permanentes con Ward, se suman todos los costes de Ward aplicables.

Ejemplo:

```text
A spell targets two permanents with ward {2}.
That spell costs {4} more to cast.
```

Si un hechizo o habilidad hace objetivo al mismo permanente con Ward más de una vez, solo se aplica Ward una vez para ese permanente, salvo que una carta indique otra cosa.

---

### 30.3. Ward y reducción de costes

El coste adicional de Ward se añade durante el cálculo de coste total.

Orden recomendado:

```text
1. Coste base.
2. Costes adicionales obligatorios.
3. Costes adicionales por Ward.
4. Aumentos de coste.
5. Reducciones de coste.
6. Coste final a pagar.
```

Una reducción de coste puede reducir el coste genérico añadido por Ward si la reducción es aplicable al coste total del hechizo o habilidad.

---

### 30.4. First strike

`First strike` modifica la resolución del daño de combate.

Una criatura con first strike hace daño de combate antes que las criaturas sin first strike.

En este juego, dentro de cada combate individual, si al menos una criatura tiene first strike o double strike, la resolución de daño se divide en dos pasos:

1. Paso de daño de first strike.
2. Paso de daño común.

Regla:

```text
Las criaturas con first strike hacen daño en el paso de daño de first strike.
Las criaturas sin first strike ni double strike hacen daño en el paso de daño común.
```

---

### 30.5. Double strike

`Double strike` significa que la criatura hace daño en ambos pasos de daño.

Regla:

```text
Una criatura con double strike hace daño en el paso de daño de first strike y también en el paso de daño común.
```

Una criatura con double strike no necesita tener first strike además. Double strike ya incluye la capacidad de hacer daño en el primer paso.

---

### 30.6. Resolución con first strike y double strike

Cuando un combate individual incluye first strike o double strike, se resuelve así:

```text
1. Se abre la ventana de respuesta normal antes de resolver el combate individual.
2. Cuando la ventana termina, empieza la resolución de daño.
3. Se aplica el daño de first strike:
   - criaturas con first strike;
   - criaturas con double strike.
4. Se comprueban acciones basadas en estado.
5. Las criaturas con resistencia actual 0 o menor son destruidas.
6. Se comprueban habilidades disparadas.
7. Si se han disparado habilidades, van a la pila y permiten respuesta.
8. Cuando la pila queda vacía, se continúa con el daño común.
9. Se aplica el daño común:
   - criaturas sin first strike;
   - criaturas con double strike que sigan en combate.
10. Se comprueban acciones basadas en estado.
11. Se resuelven habilidades disparadas antes de pasar al siguiente combate individual.
```

---

### 30.7. No hay ventana libre entre first strike y daño común

No existe una ventana de respuesta automática entre el paso de daño de first strike y el paso de daño común.

Los jugadores no pueden lanzar trucos de combate entre ambos pasos simplemente porque haya terminado el daño de first strike.

Excepción:

```text
Si el daño de first strike dispara una o más habilidades, esas habilidades van a la pila y sí permiten respuesta.
```

Por tanto:

- Si no se dispara ninguna habilidad tras el daño de first strike, se pasa directamente al daño común.
- Si se dispara alguna habilidad, se resuelve la pila antes del daño común.
- Durante esa pila, los jugadores pueden responder de forma normal.

---

### 30.8. Criaturas destruidas antes del daño común

Si una criatura es destruida durante el paso de daño de first strike, no hará daño en el paso de daño común.

Ejemplo:

```text
Una criatura 2/2 sin first strike bloquea a una criatura 2/2 con first strike.
La criatura con first strike hace 2 daños primero.
La criatura 2/2 sin first strike es destruida.
Como ya no está en combate, no hace daño común.
```

---

### 30.9. Trample

`Trample` permite asignar daño sobrante al jugador defensor.

Regla:

```text
Si un atacante con trample está bloqueado, debe asignar daño letal a sus bloqueadores en orden. Cualquier daño sobrante puede asignarse al jugador defensor.
```

Trample solo importa si el atacante está bloqueado.

Si el atacante no está bloqueado, hace todo su daño al jugador defensor igualmente.

---

### 30.10. Asignación de daño con trample

Cuando un atacante con trample está bloqueado:

1. El atacante ordena sus bloqueadores.
2. Debe asignar daño letal al primer bloqueador antes de pasar al siguiente.
3. Debe asignar daño letal al segundo bloqueador antes de pasar al tercero.
4. Cuando todos los bloqueadores tienen asignado daño letal, el daño sobrante puede asignarse al jugador defensor.

Ejemplo:

```text
Atacante 6/6 con trample.
Bloqueadores:
- Defensor A: resistencia 2
- Defensor B: resistencia 3

Debe asignar al menos:
- 2 daños a Defensor A
- 3 daños a Defensor B

Sobra 1 daño.
Puede asignar ese 1 daño al jugador defensor.
```

---

### 30.11. Daño letal con deathtouch y trample

Si un atacante tiene deathtouch y trample, 1 punto de daño se considera daño letal para cada bloqueador.

Ejemplo:

```text
Atacante 4/4 con deathtouch y trample.
Tiene dos bloqueadores.

Puede asignar:
- 1 daño al primer bloqueador
- 1 daño al segundo bloqueador
- 2 daños al jugador defensor
```

---

### 30.12. Trample en first strike y double strike

Si una criatura con trample hace daño en el paso de first strike, puede asignar daño sobrante al jugador defensor durante ese paso.

Si una criatura con double strike y trample sigue en combate durante el daño común, puede volver a asignar daño con trample en el paso de daño común.

El daño marcado en bloqueadores durante el paso de first strike cuenta para determinar cuánto daño letal hace falta asignar en el paso de daño común.

---

### 30.13. Menace

En este juego, `Menace` se simplifica respecto a *Magic: The Gathering*.

Texto conceptual:

```text
Menace
```

Significa:

```text
This creature can't be blocked if the defending opponent has only one creature in defense position.
```

Regla:

```text
Una criatura con menace no puede ser bloqueada si el oponente tiene exactamente una criatura posicionada en defensa.
```

---

### 30.14. Menace y el algoritmo de bloqueo

Para este prototipo, no se requiere formar grupos de dos bloqueadores.

El algoritmo debe aplicar esta regla simple:

```text
Si el atacante tiene menace y el jugador defensor tiene exactamente una criatura en posición de defensa, ese atacante no puede ser bloqueado.
```

Si el jugador defensor tiene cero criaturas en defensa, el atacante tampoco será bloqueado porque no hay defensores.

Si el jugador defensor tiene dos o más criaturas en defensa, menace no impide el bloqueo y el algoritmo normal continúa.

Ejemplos:

```text
Caso 1:
El rival tiene 0 criaturas defendiendo.
La criatura con menace no es bloqueada.

Caso 2:
El rival tiene 1 criatura defendiendo.
La criatura con menace no puede ser bloqueada.

Caso 3:
El rival tiene 2 o más criaturas defendiendo.
La criatura con menace puede ser bloqueada por el algoritmo normal.
```

Esta es una aproximación propia del juego y prevalece sobre la regla subsidiaria de Magic.

---

## 31. Actualización del cálculo de costes con Ward

El orden general para lanzar un hechizo se actualiza para incluir Ward como incremento obligatorio de coste.

Orden recomendado actualizado:

```text
1. Elegir la carta que se quiere lanzar.
2. Elegir modos, si los tiene.
3. Elegir valor de X, si el coste contiene X.
4. Elegir si se paga kicker u otros costes opcionales.
5. Elegir costes alternativos, si existen.
6. Elegir objetivos legales provisionales.
7. Detectar si algún objetivo tiene Ward aplicable.
8. Calcular coste base.
9. Añadir costes adicionales obligatorios.
10. Añadir costes adicionales por Ward.
11. Aplicar aumentos de coste.
12. Aplicar reducciones de coste.
13. Comprobar si el jugador puede pagar.
14. Pagar maná y costes adicionales.
15. Confirmar objetivos.
16. Poner el hechizo en la pila.
17. Disparar habilidades de “whenever you cast”.
```

Si el jugador no puede pagar el coste total incluyendo Ward, no puede lanzar ese hechizo o activar esa habilidad con esos objetivos.


---

## 32. Catálogo canónico de habilidades y mecánicas

Esta sección define las habilidades, acciones, disparos, efectos continuos y estados de motor que Codex debe implementar.

Las reglas de esta sección son parte del ruling del juego.

Cuando una habilidad esté definida de forma distinta a *Magic: The Gathering*, prevalece la definición de este documento.

---

# 33. Palabras clave de combate

---

## 33.1. Flying

Texto funcional:

```text
Flying
```

Regla:

```text
A creature with flying can be blocked only by creatures with flying or reach.
```

Implementación:

- Una criatura atacante con flying solo puede ser bloqueada por criaturas defensoras con flying o reach.
- Una criatura con flying puede bloquear criaturas con flying.
- Una criatura con flying puede bloquear criaturas sin flying si el algoritmo de bloqueo la asigna legalmente.
- Flying solo afecta a la legalidad de bloqueo.

---

## 33.2. Reach

Texto funcional:

```text
Reach
```

Regla:

```text
A creature with reach can block creatures with flying.
```

Implementación:

- Reach permite que una criatura defensora bloquee criaturas con flying.
- Reach no hace que una criatura sea flying.
- Reach solo importa cuando la criatura está en posición de defensa.

---

## 33.3. Vigilance

Texto funcional:

```text
Vigilance
```

Regla:

```text
Attacking doesn't cause this creature to tap.
```

Implementación:

- Una criatura con vigilance puede colocarse en posición de ataque sin girarse.
- Si ya estaba girada antes del combate, no puede atacar ni defender.
- Vigilance no permite defender y atacar en el mismo combate: cada criatura solo puede ocupar una posición.

---

## 33.4. Haste

Texto funcional:

```text
Haste
```

Regla:

```text
This creature can attack and use tap abilities even if it entered this turn.
```

Implementación:

- Una criatura con haste puede colocarse en ataque aunque haya entrado este turno.
- Una criatura con haste puede activar habilidades con coste de girar aunque haya entrado este turno.
- Haste no permite atacar si la criatura está girada.
- Haste no elimina otras restricciones como “can't attack”.

---

## 33.5. First strike

Texto funcional:

```text
First strike
```

Regla:

```text
This creature deals combat damage before creatures without first strike.
```

Implementación:

- Si en un combate individual existe first strike o double strike, el combate se divide en:
  1. Paso de daño de first strike.
  2. Paso de daño común.
- Las criaturas con first strike hacen daño en el paso de first strike.
- Las criaturas con first strike no hacen daño en el paso común, salvo que también tengan double strike.
- No hay ventana de respuesta automática entre first strike y daño común, salvo que se dispare alguna habilidad.

---

## 33.6. Double strike

Texto funcional:

```text
Double strike
```

Regla:

```text
This creature deals both first-strike and regular combat damage.
```

Implementación:

- Una criatura con double strike hace daño en el paso de first strike.
- Si sigue en combate, también hace daño en el paso de daño común.
- Double strike incluye implícitamente la capacidad de hacer daño en el primer paso.
- Si la criatura muere o abandona el combate después del daño de first strike, no hará daño común.

---

## 33.7. Deathtouch

Texto funcional:

```text
Deathtouch
```

Regla:

```text
Any amount of damage this creature deals to another creature is lethal damage.
```

Implementación:

- Cualquier cantidad de daño mayor que 0 hecha por una criatura con deathtouch a otra criatura se considera daño letal.
- En asignación de daño, 1 daño de una fuente con deathtouch es suficiente para considerar que se ha asignado daño letal.
- Deathtouch funciona con daño de combate y con daño no combatiente si la fuente sigue siendo la criatura.
- Si una criatura con deathtouch y trample está bloqueada, 1 daño a cada bloqueador cuenta como letal para poder asignar el sobrante al jugador defensor.

---

## 33.8. Lifelink

Texto funcional:

```text
Lifelink
```

Regla:

```text
Damage dealt by this creature also causes its controller to gain that much life.
```

Implementación:

- Cuando una criatura con lifelink hace daño, su controlador gana esa misma cantidad de vida.
- La vida se gana al mismo tiempo que se aplica el daño.
- Funciona con daño de combate y daño no combatiente si la fuente del daño es la criatura con lifelink.
- Si una criatura con lifelink hace daño a varias criaturas o jugadores a la vez, se suma todo el daño hecho y su controlador gana esa cantidad total de vida.

---

## 33.9. Trample

Texto funcional:

```text
Trample
```

Regla:

```text
If this attacking creature is blocked, it must assign lethal damage to its blockers in order. Any excess damage may be assigned to the defending player.
```

Implementación:

- Trample solo importa cuando la criatura está atacando y ha sido bloqueada.
- El atacante debe asignar daño letal a los bloqueadores en el orden elegido.
- El daño sobrante puede asignarse al jugador defensor.
- Si el atacante tiene deathtouch, 1 daño cuenta como letal para cada bloqueador.
- Si el atacante tiene double strike y trample, puede aplicar trample en el paso de first strike y también en el paso común si sigue en combate.

---

## 33.10. Menace

Texto funcional adaptado para este juego:

```text
Menace
```

Regla propia del juego:

```text
This creature can't be blocked if the defending opponent has exactly one creature in defense position.
```

Implementación:

- Menace difiere de *Magic: The Gathering*.
- Si el oponente tiene 0 criaturas en defensa, no hay bloqueadores y la criatura no será bloqueada.
- Si el oponente tiene exactamente 1 criatura en defensa, una criatura atacante con menace no puede ser bloqueada.
- Si el oponente tiene 2 o más criaturas en defensa, menace no impide el bloqueo y se usa el algoritmo normal.
- No se exige formar un grupo de dos bloqueadores.

---

# 34. Palabras clave de lanzamiento y timing

---

## 34.1. Flash

Texto funcional:

```text
Flash
```

Regla:

```text
You may cast this spell any time you could cast an instant.
```

Implementación:

- Una carta con flash puede jugarse durante ventanas de respuesta.
- Una criatura con flash sigue siendo una criatura, pero su timing de lanzamiento se amplía.
- Lanzar una carta con flash puede disparar habilidades que digan “whenever you cast a spell with flash”.
- Flash no cambia el tipo de carta.

---

## 34.2. Kicker

Texto funcional:

```text
Kicker {cost}
```

Regla:

```text
You may pay an additional {cost} as you cast this spell.
```

Implementación:

- Kicker es un coste adicional opcional.
- El jugador decide si paga kicker al lanzar el hechizo.
- La decisión queda registrada en el objeto de la pila.
- Al resolver, el hechizo puede comprobar si fue kickeado.
- Si el hechizo fue kickeado, aplica su efecto adicional.
- Kicker se paga durante el lanzamiento y no puede responderse directamente.

---

## 34.3. Equip

Texto funcional:

```text
Equip {cost}
```

Regla:

```text
{cost}: Attach this Equipment to target creature you control. Equip only as a sorcery.
```

Implementación:

- Equip es una habilidad activada de los Equipos.
- Solo puede activarse durante una fase principal y con la pila vacía.
- Usa la pila y permite respuesta.
- Al resolver, si el objetivo sigue siendo legal, el Equipo se anexa a esa criatura.
- Si el objetivo ya no es legal, la habilidad no hace nada.
- Un Equipo desanexado permanece en el campo de batalla.

---

## 34.4. Enchant

Texto funcional:

```text
Enchant creature
Enchant land
Enchant permanent
```

Regla:

```text
This Aura can enchant only the kind of object indicated after the word Enchant.
```

Implementación:

- Enchant define qué objetivos son legales para lanzar un Aura.
- Si el Aura se resuelve y su objetivo sigue siendo legal, entra anexada.
- Si el objetivo ya no es legal al resolver, el Aura va al cementerio.
- Si el objeto encantado deja de ser legal después, el Aura va al cementerio.
- Enchant no es una habilidad activada; es una restricción de anexado.

---

## 34.5. Ward

Texto funcional propio del juego:

```text
Ward {cost}
```

Regla propia:

```text
Spells and abilities your opponents control that target this permanent cost {cost} more to cast or activate.
```

Implementación:

- Ward no es una habilidad disparada en este juego.
- Ward no contrarresta hechizos ni habilidades.
- Elegir como objetivo un permanente con Ward incrementa obligatoriamente el coste del hechizo o habilidad.
- Si el jugador no puede pagar el coste aumentado, no puede elegir ese objetivo.
- Ward no usa la pila y no puede responderse directamente.
- Si un hechizo o habilidad hace objetivo a varios permanentes con Ward, se suman los costes de Ward aplicables.

---

# 35. Mecánicas de cartas y acciones de juego

---

## 35.1. Draw

Texto funcional:

```text
Draw a card.
```

Implementación:

- Robar significa mover la primera carta del mazo de hechizos a la mano.
- Si un jugador debe robar y no puede porque su mazo de hechizos está vacío, pierde la partida.
- Si ambos jugadores pierden simultáneamente por no poder robar, pierde el jugador con prioridad atacante.

---

## 35.2. Discard

Texto funcional:

```text
Discard a card.
```

Implementación:

- Descartar significa mover una carta de la mano al cementerio.
- Si el efecto no especifica quién elige, el jugador que descarta elige la carta.
- Si descartar es un coste, se realiza durante el lanzamiento o activación.
- Si descartar es un efecto, se realiza al resolver.
- Descartar puede disparar habilidades.

---

## 35.3. Mill

Texto funcional:

```text
Mill N.
```

Implementación:

- Moler significa poner las N primeras cartas del mazo de hechizos en el cementerio.
- No afecta al mazo de tierras, salvo que una carta lo diga explícitamente.
- Si hay menos de N cartas, se mueven todas las posibles.
- Moler no es robar.
- Un jugador no pierde por intentar moler más cartas de las que tiene.

---

## 35.4. Scry

Texto funcional:

```text
Scry N.
```

Implementación:

- El jugador mira las N primeras cartas de su mazo de hechizos.
- Puede poner cualquier número de esas cartas en la parte inferior de su mazo.
- Las demás vuelven a la parte superior en cualquier orden elegido por ese jugador.
- Scry no es robar.
- Scry no revela cartas al oponente salvo que una carta lo indique.

---

## 35.5. Create token

Texto funcional:

```text
Create a token.
```

Implementación:

- Crear un token significa crear un permanente que no procede de una carta física del mazo.
- El token entra en el campo de batalla bajo el control del jugador indicado.
- Si el token es criatura, puede tener fuerza, resistencia, color, tipos, subtipos y habilidades.
- Si un token abandona el campo de batalla, deja de existir después de llegar a la nueva zona.
- Un token criatura que va del campo al cementerio cuenta como que ha muerto antes de dejar de existir.

---

## 35.6. Treasure token

Texto funcional:

```text
Create a Treasure token.
```

Definición:

```text
Treasure token is an artifact token with "{T}, Sacrifice this artifact: Add one mana of any color."
```

Implementación:

- Treasure es un artefacto token.
- Su habilidad es activada.
- Coste: girar el Treasure y sacrificarlo.
- Efecto: añadir un maná de cualquier color.
- La habilidad usa la pila salvo que se decida implementar habilidades de maná como acción especial sin pila.
- Recomendación para prototipo: las habilidades de maná no usan la pila y no permiten respuesta.

---

## 35.7. +1/+1 counter

Texto funcional:

```text
Put a +1/+1 counter on target creature.
```

Implementación:

- Un contador +1/+1 es un modificador permanente mientras permanezca sobre la criatura.
- Cada contador +1/+1 da +1 a la fuerza y +1 a la resistencia.
- Los contadores permanecen al final del turno.
- Los contadores se pierden si la criatura cambia de zona.
- Poner contadores puede disparar habilidades.

---

## 35.8. Double counters

Texto funcional:

```text
Double the number of +1/+1 counters on target creature.
```

Implementación:

- Se cuenta el número actual de contadores +1/+1 sobre la criatura.
- Se añade esa misma cantidad de contadores +1/+1.
- Si la criatura tiene 0 contadores, no se añade ninguno.
- Añadir estos contadores puede disparar habilidades de “whenever counters are put”.

---

## 35.9. Damage to target

Texto funcional:

```text
This spell deals N damage to target creature/player.
```

Implementación:

- El daño a una criatura se marca sobre esa criatura.
- Si su resistencia actual queda en 0 o menos, será destruida por acciones basadas en estado.
- El daño a un jugador reduce sus vidas.
- Si un jugador queda a 0 vidas o menos, pierde.
- El daño no reduce permanentemente la resistencia; el daño marcado se limpia en la limpieza final.

---

## 35.10. Destroy

Texto funcional:

```text
Destroy target creature.
```

Implementación:

- Destruir un permanente lo mueve del campo de batalla al cementerio.
- Si una criatura es destruida y va al cementerio, cuenta como morir.
- Destruir no afecta a permanentes indestructibles si esa habilidad se implementa en el futuro.
- Destruir no es sacrificar.
- Destruir no es exiliar.

---

## 35.11. Exile

Texto funcional:

```text
Exile target permanent/card.
```

Implementación:

- Exiliar mueve el objeto a la zona de exilio.
- Si una criatura es exiliada desde el campo, no cuenta como morir.
- Un token exiliado deja de existir después de llegar al exilio.
- Las cartas en exilio se mantienen visibles para ambos jugadores salvo que una carta indique lo contrario.

---

## 35.12. Exile instead

Texto funcional:

```text
If that creature would die this turn, exile it instead.
```

Implementación:

- Es un efecto de reemplazo.
- Si el evento que debería ocurrir es “ir al cementerio desde el campo”, se reemplaza por “ir al exilio”.
- Como no va al cementerio, no cuenta como morir.
- El efecto dura el tiempo indicado, normalmente hasta fin de turno.
- Se elimina durante la limpieza final.

---

## 35.13. Sacrifice

Texto funcional:

```text
Sacrifice a creature.
```

Implementación:

- Sacrificar significa que el controlador de un permanente lo pone en el cementerio.
- Solo puedes sacrificar permanentes que controlas.
- Sacrificar puede ser coste o efecto.
- Sacrificar no es destruir.
- Si una criatura sacrificada va al cementerio, cuenta como morir.

---

## 35.14. Return to hand

Texto funcional:

```text
Return target permanent to its owner's hand.
```

Implementación:

- Mueve el permanente a la mano de su propietario.
- Si el permanente era token, deja de existir después de llegar a la mano.
- Si una criatura vuelve a la mano, no cuenta como morir.
- Si un Aura o Equipo estaba anexado a ese permanente, se aplican las reglas de adjuntos.

---

## 35.15. Return from graveyard

Texto funcional:

```text
Return target card from your graveyard to your hand.
Return target creature card from your graveyard to the battlefield.
```

Implementación:

- El objetivo debe estar en el cementerio al elegirlo y al resolver.
- Si ya no está en el cementerio al resolver, el efecto no hace nada.
- Si vuelve al campo, entra como nuevo objeto.
- Si entra como criatura, entra con mareo de invocación salvo que tenga haste.
- Si el efecto dice que entra girada, entra girada.

---

## 35.16. Tap

Texto funcional:

```text
Tap target permanent.
```

Implementación:

- Girar un permanente cambia su estado a girado.
- Una criatura girada no puede colocarse en ataque ni defensa.
- Un permanente girado no puede pagar costes que incluyan girarse.
- Girar una criatura que ya está en combate no la retira del combate salvo que una carta lo indique.

---

## 35.17. Untap

Texto funcional:

```text
Untap target permanent.
```

Implementación:

- Enderezar un permanente cambia su estado a enderezado.
- El untap step forma parte de la limpieza final.
- Los efectos que enderezan durante el turno pueden ocurrir antes de la limpieza final si una carta lo indica.
- Enderezar una criatura no la cambia automáticamente de posición de combate.

---

## 35.18. Enters tapped

Texto funcional:

```text
This permanent enters tapped.
```

Implementación:

- El permanente entra al campo de batalla en estado girado.
- Si es criatura, no puede atacar ni defender mientras esté girada.
- Puede enderezarse durante la limpieza final salvo que algún efecto lo impida.

---

## 35.19. Does not untap

Texto funcional:

```text
This permanent doesn't untap during its controller's untap step.
```

Implementación:

- En este juego, el untap step es la parte de enderezar dentro de la limpieza final.
- Un permanente afectado por “does not untap” no se endereza durante esa parte de la limpieza final.
- Puede enderezarse por otros efectos si la carta no lo prohíbe expresamente.

---

## 35.20. Can't attack

Texto funcional:

```text
This creature can't attack.
```

Implementación:

- La criatura no puede ponerse en posición de ataque.
- Sí puede ponerse a salvo o en defensa, salvo que otra restricción lo impida.

---

## 35.21. Can't block

Texto funcional:

```text
This creature can't block.
```

Adaptación al sistema de posiciones:

```text
This creature can't be assigned to defense position and can't be assigned as a blocker.
```

Implementación:

- La criatura no puede ponerse en posición de defensa.
- Si por algún efecto ya estuviera en defensa, no puede ser asignada como bloqueadora.
- Sí puede estar a salvo o atacar si cumple las reglas para atacar.

---

## 35.22. Can't be blocked

Texto funcional:

```text
This creature can't be blocked.
```

Implementación:

- Si está atacando, el algoritmo de bloqueo no puede asignarle defensores.
- La criatura hará daño al jugador defensor salvo que otro efecto la retire del combate o prevenga el daño.
- No importa cuántos defensores tenga el oponente.

---

## 35.23. Must be blocked if able

Texto funcional:

```text
This creature must be blocked if able.
```

Implementación:

- Durante el emparejamiento, el algoritmo debe intentar asignar un defensor legal a esta criatura si existe alguno.
- Si hay varios atacantes con esta obligación, se respeta el orden de la fila de atacantes.
- Si no existe ningún defensor legal, la criatura no es bloqueada.
- Esta obligación no permite ignorar restricciones como flying, menace, can't block o protección futura.

---

## 35.24. Counter target spell

Texto funcional:

```text
Counter target spell.
```

Implementación:

- Solo puede hacer objetivo a un hechizo en la pila.
- Al resolver, mueve ese hechizo de la pila al cementerio de su propietario.
- El hechizo contrarrestado no resuelve.
- Si el hechizo objetivo ya no está en la pila al resolver, el efecto no hace nada.
- Contrarrestar una habilidad funciona solo si el texto dice que puede contrarrestar habilidades.

---

## 35.25. Cost reduction

Texto funcional:

```text
This spell costs {N} less to cast.
```

Implementación:

- Reduce el coste durante el cálculo del coste total.
- No puede reducir costes genéricos por debajo de 0.
- Solo reduce costes de color si el efecto lo dice expresamente.
- Se aplica junto con otros aumentos o reducciones según el orden definido en reglas de costes.

---

## 35.26. Additional cost

Texto funcional:

```text
As an additional cost to cast this spell, [cost].
```

Implementación:

- Es un coste que debe pagarse además del coste base.
- Si no puede pagarse, no se puede lanzar el hechizo.
- El pago del coste no usa la pila.
- Los eventos producidos por pagar el coste pueden disparar habilidades.

---

## 35.27. Alternative cost

Texto funcional:

```text
You may cast this spell by paying [cost] rather than paying its mana cost.
```

Implementación:

- El jugador elige el coste alternativo al lanzar el hechizo.
- Solo puede aplicarse un coste alternativo salvo que una carta indique lo contrario.
- Los costes adicionales pueden sumarse al coste alternativo.
- Las reducciones y aumentos se aplican después según el orden de cálculo de costes.

---

## 35.28. X cost

Texto funcional:

```text
{X}
```

Implementación:

- El jugador elige el valor de X al lanzar el hechizo.
- X debe ser un entero igual o mayor que 0.
- El valor elegido se registra en el objeto de la pila.
- El efecto puede usar ese valor al resolver.

---

## 35.29. Activate only as a sorcery

Texto funcional:

```text
Activate only as a sorcery.
```

Adaptación:

```text
Activate only during a main phase while the stack is empty.
```

Implementación:

- Solo puede activarse en Principal 1 o Principal 2.
- La pila debe estar vacía.
- No puede activarse durante combate, inicio, final ni ventanas de respuesta.

---

## 35.30. Activate only once

Texto funcional:

```text
Activate only once.
```

Implementación:

- El motor debe registrar si esa habilidad ya se ha activado.
- Si la carta dice “activate only once”, por defecto se interpreta como una vez mientras ese objeto permanezca en el campo.
- Si la carta cambia de zona y vuelve, se considera un nuevo objeto y puede activarse otra vez.
- Si el texto dice “activate only once each turn”, se reinicia al comenzar cada turno general.
- Si el texto dice “activate only once each game”, se registra a nivel de partida.

---

# 36. Habilidades disparadas detectadas

Codex debe implementar un sistema de eventos.

Una habilidad disparada se detecta cuando ocurre un evento del juego y su condición se cumple.

Las habilidades disparadas van a la pila y permiten respuesta, salvo que una regla indique lo contrario.

---

## 36.1. When this creature enters

Evento:

```text
creature_enters_battlefield
```

Regla:

```text
When this creature enters, [effect].
```

Se dispara cuando el permanente con la habilidad entra al campo de batalla como criatura.

---

## 36.2. When another creature you control enters

Evento:

```text
another_creature_you_control_enters
```

Se dispara cuando una criatura distinta a la fuente entra al campo bajo tu control.

No se dispara por la propia entrada de la fuente si dice “another”.

---

## 36.3. Whenever you gain life

Evento:

```text
player_gains_life
```

Se dispara cada vez que el jugador gana vida.

Si un efecto hace ganar vida varias veces por separado, se dispara varias veces.

Si un único evento hace ganar N vidas, se dispara una vez.

---

## 36.4. Whenever you draw a card

Evento:

```text
player_draws_card
```

Se dispara cada vez que el jugador roba una carta.

Si un efecto dice “draw two cards”, se trata como dos robos individuales salvo que el motor decida agruparlos. Para compatibilidad con disparos de segunda carta, se recomienda tratarlos como robos individuales secuenciales.

---

## 36.5. Whenever you draw your second card each turn

Estado requerido:

```text
cards_drawn_this_turn[player]
```

Regla:

- Se dispara cuando el contador de cartas robadas por ese jugador durante el turno general pasa de 1 a 2.
- Solo puede dispararse una vez por jugador por turno general para cada fuente con este texto, salvo que la fuente salga y vuelva como nuevo objeto.

---

## 36.6. Whenever this creature attacks

Evento:

```text
creature_declared_attacking
```

Adaptación al combate secreto:

- Se dispara cuando la criatura se revela en posición de ataque al terminar el posicionamiento.
- No se dispara al colocarla en secreto, sino al revelar posiciones.
- Si la criatura es puesta atacando por un efecto después de la revelación, también puede dispararse si el motor genera el evento correspondiente.

---

## 36.7. Whenever one or more creatures you control attack

Evento:

```text
one_or_more_creatures_you_control_attack
```

Regla:

- Se dispara cuando se revelan una o más criaturas propias en posición de ataque.
- Se dispara una vez por evento de ataque, no una vez por criatura.
- Si varias criaturas atacan a la vez durante el posicionamiento, se dispara una sola vez.

---

## 36.8. Raid — if you attacked this turn

Estado requerido:

```text
attacked_this_turn[player]
```

Regla:

- Un jugador “ha atacado este turno” si al menos una criatura que controlaba fue revelada en posición de ataque durante ese turno general.
- Raid no es necesariamente una habilidad disparada; puede ser una condición de resolución o de efecto.
- Si una criatura fue retirada del combate después de atacar, Raid sigue contando como verdadero.

---

## 36.9. Whenever a creature dies

Evento:

```text
creature_dies
```

Regla:

- Se dispara cuando cualquier criatura va del campo de batalla al cementerio.
- Exiliar, devolver a la mano o devolver al mazo no cuenta como morir.
- Un token que va del campo al cementerio sí genera evento de muerte antes de dejar de existir.

---

## 36.10. Whenever this creature or another creature you control dies

Evento:

```text
controlled_creature_dies
```

Regla:

- Se dispara si muere la propia fuente.
- También se dispara si muere otra criatura que controlas.
- Si varias criaturas mueren a la vez, se dispara una vez por cada criatura que cumpla la condición, salvo que el texto diga “one or more”.

---

## 36.11. When this creature enters or dies

Eventos:

```text
creature_enters_battlefield
creature_dies
```

Regla:

- La misma habilidad puede dispararse por cualquiera de los dos eventos.
- Al entrar, usa el evento de entrada.
- Al morir, usa el evento de muerte.

---

## 36.12. At the beginning of combat on your turn

Texto importado.

Adaptación por defecto:

```text
At the beginning of combat on your turn
```

se interpreta como:

```text
At the beginning of combat, if you have attacking priority this turn.
```

Importante:

- Algunas cartas concretas pueden tener texto adaptado distinto.
- Por ejemplo, Leonin Vanguard se ha cambiado a “At the beginning of combat” y se dispara en todos los combates.

---

## 36.13. At the beginning of your end step

Texto importado.

Adaptación por defecto:

```text
At the beginning of your end step
```

se interpreta como:

```text
At the beginning of the end step, if you have attacking priority this turn.
```

Importante:

- Algunas cartas concretas pueden tener texto adaptado distinto.
- Por ejemplo, Stromkirk Bloodthief se ha cambiado a “At the beginning of the end step” y puede dispararse en todos los turnos generales.

---

## 36.14. Whenever you cast a spell during an opponent's turn

Texto importado.

Adaptación por defecto:

```text
Whenever you cast a spell during an opponent's turn
```

se interpreta como:

```text
Whenever you cast a spell during a general turn in which your opponent has attacking priority.
```

Importante:

- Algunas cartas concretas pueden tener texto adaptado distinto.
- Por ejemplo, Brineborn Cutthroat se ha cambiado para dispararse al lanzar instantáneos o hechizos con flash, independientemente de la prioridad atacante.

---

## 36.15. Whenever you cast a noncreature or Dragon spell

Evento:

```text
spell_cast
```

Regla:

- Se dispara cuando el jugador lanza un hechizo.
- El motor comprueba si el hechizo es no criatura o si tiene subtipo Dragon.
- Si cumple al menos una condición, la habilidad se dispara.
- Si un hechizo es no criatura y Dragon a la vez, se dispara una sola vez salvo que el texto indique lo contrario.

---

## 36.16. Whenever one or more +1/+1 counters are put on another non-Hydra creature you control

Evento:

```text
counters_put_on_creature
```

Regla:

- Se dispara cuando se ponen uno o más contadores +1/+1.
- La criatura debe ser otra criatura que controlas.
- La criatura no debe tener subtipo Hydra.
- Si se ponen varios contadores a la vez sobre una criatura válida, se dispara una vez.
- Si se ponen contadores sobre varias criaturas válidas a la vez, se dispara una vez por cada criatura válida.

---

## 36.17. Whenever this creature becomes the target of a spell or ability an opponent controls

Evento:

```text
becomes_target
```

Regla:

- Se dispara cuando el oponente elige esta criatura como objetivo de un hechizo o habilidad.
- Este evento existe aunque Ward en este juego no sea disparado.
- Si una carta tiene una habilidad explícita de “becomes the target”, esa habilidad sí se dispara y va a la pila.
- Ward, en cambio, se aplica como aumento obligatorio de coste y no usa la pila.

---

# 37. Efectos continuos detectados

Los efectos continuos no son eventos puntuales. Se mantienen mientras su fuente exista, su duración no haya terminado o su condición siga siendo verdadera.

Codex debe recalcularlos cuando cambie el estado del juego.

---

## 37.1. Other creatures of type X get +1/+1

Ejemplo:

```text
Other Goblins you control get +1/+1.
```

Implementación:

- Se aplica a criaturas que controles y tengan el tipo/subtipo indicado.
- Si dice “other”, no se aplica a la fuente del efecto.
- Se recalcula cuando:
  - entra o sale una criatura;
  - cambia un tipo;
  - cambia el controlador;
  - desaparece la fuente del efecto.

---

## 37.2. Attacking creatures you control get +N/+M

Implementación:

- Se aplica solo a criaturas que controles y estén en posición de ataque.
- No se aplica a criaturas a salvo ni defendiendo.
- Se recalcula cuando cambian las posiciones de combate o termina el combate.

---

## 37.3. Equipped creature gets +N/+M

Implementación:

- Se aplica a la criatura equipada mientras el Equipo esté anexado.
- Si el Equipo se desanexa, el efecto deja de aplicarse.
- Puede estar condicionado, por ejemplo: “while it's attacking”.

---

## 37.4. Enchanted creature gets +N/+M

Implementación:

- Se aplica a la criatura encantada mientras el Aura esté anexada legalmente.
- Si el Aura se va al cementerio o se desanexa, el efecto deja de aplicarse.

---

## 37.5. Enchanted creature can't attack or block

Adaptación:

```text
Enchanted creature can't attack or defend.
```

Implementación:

- La criatura encantada no puede ponerse en ataque.
- La criatura encantada no puede ponerse en defensa.
- Puede quedarse a salvo.
- Si ya estaba posicionada de forma ilegal por un cambio posterior, debe retirarse de esa posición en cuanto el motor compruebe legalidad.

---

## 37.6. Enchanted creature loses all abilities

Implementación:

- La criatura encantada pierde habilidades impresas.
- También pierde habilidades concedidas por otros efectos, salvo que el sistema de capas futuro determine otra cosa.
- Para el prototipo, se aplica de forma simple: el objeto no aporta habilidades activadas, disparadas, estáticas ni palabras clave.
- No elimina efectos ya resueltos.
- No elimina contadores.
- No elimina daño marcado.

---

## 37.7. Base power and toughness 1/1

Implementación:

- Cambia la fuerza/resistencia base de la criatura a 1/1.
- Se aplica antes de contadores y modificadores.
- Ejemplo:
  - Criatura base 5/5.
  - Efecto: base 1/1.
  - Tiene dos contadores +1/+1.
  - Resultado antes de otros bonus: 3/3.

---

## 37.8. As long as condition, this creature has ability

Implementación:

- El motor evalúa continuamente la condición.
- Si la condición es verdadera, la criatura tiene la habilidad.
- Si la condición deja de ser verdadera, la pierde.
- Ejemplos:
  - Mientras controles un Dragon, esta criatura tiene flying.
  - Mientras esta criatura esté atacando, tiene first strike.

---

## 37.9. Other creatures you control have trample

Implementación:

- Otorga trample a otras criaturas que controlas.
- Si dice “other”, no se aplica a la fuente.
- Se recalcula cuando cambia el controlador, entran o salen criaturas, o desaparece la fuente.

---

## 37.10. Spell costs less

Implementación:

- Es un modificador de coste.
- Se aplica durante el cálculo de coste.
- Puede depender de:
  - tipo del hechizo;
  - cartas en cementerio;
  - permanentes controlados;
  - subtipos como Dragon;
  - otras condiciones.
- No puede reducir costes genéricos por debajo de 0.

---

# 38. Estados que debe rastrear el motor

Codex debe mantener estos estados para que las reglas anteriores funcionen.

---

## 38.1. Vida de cada jugador

Uso:

- condición de victoria/derrota;
- efectos de ganar vida;
- efectos de perder vida;
- comprobar si un oponente perdió vida este turno.

---

## 38.2. Maná disponible por jugador

Uso:

- pagar hechizos;
- pagar habilidades;
- pagar Ward;
- pagar kicker;
- pagar costes adicionales;
- mantener maná durante todo el turno general;
- vaciar maná en limpieza final.

Debe registrar:

- cantidad;
- color, si se implementan colores;
- restricciones;
- efectos asociados al maná.

---

## 38.3. Prioridad atacante

Uso:

- resolver primero el ataque de ese jugador;
- determinar jugador activo para ordenar disparos simultáneos;
- adaptar “tu turno”;
- adaptar “turno del oponente”;
- resolver empates definidos.

---

## 38.4. Cartas robadas este turno por jugador

Uso:

- disparos de “segunda carta robada”;
- estadísticas del turno;
- posibles efectos futuros.

Se reinicia al comienzo de cada turno general.

---

## 38.5. Si el jugador atacó este turno

Uso:

- Raid;
- efectos que preguntan si atacaste;
- efectos de final de turno ligados a haber atacado.

Se marca como verdadero cuando una o más criaturas de ese jugador son reveladas en posición de ataque.

Se reinicia al comienzo de cada turno general.

---

## 38.6. Si el oponente perdió vida este turno

Uso:

- efectos de Vampiros;
- disparos de fase final;
- condiciones tipo “if an opponent lost life this turn”.

Debe actualizarse cuando:

- un jugador recibe daño;
- un jugador pierde vida por un efecto;
- un pago de vida hace perder vida si se implementa.

Se reinicia al comienzo de cada turno general.

---

## 38.7. Criaturas que entraron este turno

Uso:

- mareo de invocación;
- haste;
- restricciones de ataque;
- habilidades con coste de girar.

Una criatura que entró este turno no puede atacar ni usar habilidades con coste de girar salvo que tenga haste.

El estado se limpia durante la limpieza final.

---

## 38.8. Permanentes girados/enderezados

Uso:

- ataque;
- defensa;
- costes de girar;
- efectos de tap/untap;
- limpieza final.

Una criatura girada no puede ponerse en ataque ni en defensa.

---

## 38.9. Daño marcado en criaturas

Uso:

- comprobar destrucción por resistencia 0 o menor;
- limpiar daño durante la limpieza final;
- calcular daño letal;
- trample;
- deathtouch.

El daño marcado desaparece durante la limpieza final.

---

## 38.10. Contadores +1/+1

Uso:

- modificar fuerza/resistencia;
- disparos por poner contadores;
- duplicar contadores;
- condiciones de cartas.

Los contadores permanecen al final del turno.

Se pierden si el permanente cambia de zona.

---

## 38.11. Efectos hasta fin de turno

Uso:

- bonus temporales;
- habilidades temporales;
- restricciones temporales;
- efectos de reemplazo temporales.

Se eliminan durante la limpieza final.

---

## 38.12. Objetos anexados

Uso:

- Auras;
- Equipos;
- criatura encantada/equipada;
- efectos continuos;
- desanexar;
- caída de Auras;
- mantener Equipos en campo.

Debe registrar:

- adjunto;
- objeto anexado;
- controlador del adjunto;
- restricciones de anexado;
- efectos concedidos.

---

## 38.13. Objetos exiliados vinculados

Uso:

- Prayer of Binding;
- efectos “until this leaves the battlefield”.

Debe registrar:

- fuente que mantiene el vínculo;
- objeto exiliado;
- condición de retorno;
- controlador/propietario para devolver;
- si el objeto sigue en exilio.

---

## 38.14. Cartas en cementerio

Uso:

- costes;
- retorno;
- mill;
- reducción de coste;
- disparos de muerte;
- comprobar tipos y subtipos.

Debe permitir consultar:

- tipo;
- subtipo;
- propietario;
- controlador anterior si es necesario;
- si la carta es objetivo legal.

---

## 38.15. Cartas en exilio

Uso:

- efectos de exiliar;
- exilio vinculado;
- reemplazos de muerte por exilio;
- posibles cartas futuras que interactúen con exilio.

Debe permitir consultar:

- qué cartas están exiliadas;
- si están vinculadas a una fuente;
- si deben volver al campo;
- propietario.

---

## 38.16. Objetivos elegidos

Uso:

- validar hechizos y habilidades;
- aplicar Ward como incremento de coste;
- disparos de “becomes target”;
- comprobar legalidad al resolver.

Debe registrar:

- fuente del hechizo o habilidad;
- controlador;
- lista de objetivos;
- si cada objetivo sigue siendo legal;
- costes adicionales generados por esos objetivos.

---

## 38.17. Hechizos lanzados este turno

Uso:

- disparos de “whenever you cast”;
- contar instantáneos;
- contar hechizos con flash;
- posibles restricciones futuras.

Debe registrar:

- jugador que lanzó el hechizo;
- tipo de carta;
- subtipos;
- si tenía flash;
- si era instantáneo;
- si era criatura;
- si era Dragon;
- si fue kickeado;
- valor de X.

---

## 38.18. Eventos pendientes y pila de disparos

Uso:

- habilidades disparadas;
- ordenar disparos simultáneos;
- permitir respuestas;
- resolver disparos antes de avanzar de subfase o combate.

Debe registrar:

- evento ocurrido;
- fuentes que se disparan;
- controlador de cada disparo;
- orden de colocación en pila;
- si requieren objetivo;
- si siguen siendo legales al resolver.


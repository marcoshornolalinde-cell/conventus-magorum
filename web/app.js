(function () {
  const ASSET_BASE = "../assets";
  const replayStates = Array.isArray(window.CONVENTUS_REPLAY_STATES) && window.CONVENTUS_REPLAY_STATES.length > 0
    ? window.CONVENTUS_REPLAY_STATES
    : Array.isArray(window.CONVENTUS_REPLAY) && window.CONVENTUS_REPLAY[0]?.players
      ? window.CONVENTUS_REPLAY
      : [window.CONVENTUS_MATCH].filter(Boolean);
  const replay = Array.isArray(window.CONVENTUS_REPLAY) && window.CONVENTUS_REPLAY.length > 0
    ? window.CONVENTUS_REPLAY
    : replayStates.map((state, index) => ({
        frameIndex: index,
        stateIndex: index,
        label: state.label || "Snapshot",
        newLog: [],
      }));
  let frameIndex = replay.length > 1 ? 0 : replay.length - 1;
  let snapshot = getFrameSnapshot(frameIndex);
  let autoplayTimer = null;
  let isPlaying = false;

  const archetypeNames = {
    cats: "Gatos",
    vampires: "Vampiros",
    healing: "Curacion",
    pirates: "Piratas",
    wizards: "Magos",
    undead: "No muertos",
    goblins: "Goblins",
    inferno: "Inferno",
    elves: "Elfos",
    primal: "Primal",
  };

  const manaOrder = ["W", "U", "B", "R", "G", "C"];
  const keywordIcons = {
    flying: "keyword_flying.svg",
    reach: "keyword_reach.svg",
    "first strike": "keyword_first_strike.svg",
    "double strike": "keyword_double_strike.svg",
    trample: "keyword_trample.svg",
    lifelink: "keyword_lifelink.svg",
    deathtouch: "keyword_deathtouch.svg",
    menace: "keyword_menace.svg",
    vigilance: "keyword_vigilance.svg",
    haste: "keyword_haste.svg",
    indestructible: "keyword_indestructible.svg",
    ward: "keyword_ward.svg",
    unblockable: "status_unblockable.svg",
  };

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function getFrameSnapshot(index) {
    const frame = replay[index];
    if (frame?.players) return frame;
    return replayStates[frame?.stateIndex ?? index] || window.CONVENTUS_MATCH;
  }

  function normalize(value) {
    return String(value || "").toLowerCase();
  }

  function getPrimaryType(card) {
    if (card.isToken) return "token_creature";
    if (card.isLand || card.cardTypes.includes("Land")) return "land";
    if (card.cardTypes.includes("Creature")) return "creature";
    if (card.cardTypes.includes("Instant")) return "instant";
    if (card.cardTypes.includes("Sorcery")) return "sorcery";
    if (card.cardTypes.includes("Enchantment")) return "enchantment";
    if (card.cardTypes.includes("Artifact")) return "artifact";
    return "artifact";
  }

  function getColorSuffix(card) {
    const colors = card.colorIdentity || [];
    if (colors.length > 1) return "m";
    if (colors.length === 1) return colors[0].toLowerCase();
    if (card.isLand && card.cardId.includes("plains")) return "w";
    if (card.isLand && card.cardId.includes("island")) return "u";
    if (card.isLand && card.cardId.includes("swamp")) return "b";
    if (card.isLand && card.cardId.includes("mountain")) return "r";
    if (card.isLand && card.cardId.includes("forest")) return "g";
    return "c";
  }

  function getTokenArt(card) {
    const name = normalize(card.name);
    if (name.includes("zombie")) return `${ASSET_BASE}/cards/types/token_creature_zombie.webp`;
    if (name.includes("goblin")) return `${ASSET_BASE}/cards/types/token_creature_goblin.webp`;
    if (name.includes("cat") || name.includes("soldier")) return `${ASSET_BASE}/cards/types/token_creature_soldier_cat.webp`;
    return `${ASSET_BASE}/cards/types/token_creature.webp`;
  }

  function getCardArt(card) {
    if (card.isToken) return getTokenArt(card);

    const type = getPrimaryType(card);
    const suffix = getColorSuffix(card);
    const supportsColor = type !== "token_creature";
    return supportsColor
      ? `${ASSET_BASE}/cards/types/${type}_${suffix}.webp`
      : `${ASSET_BASE}/cards/types/${type}.webp`;
  }

  function getEffectivePower(card) {
    const base = Number.parseInt(card.power || "0", 10) || 0;
    return base + card.plusOneCounters + card.powerModifier + card.staticPowerModifier;
  }

  function getEffectiveToughness(card) {
    const base = Number.parseInt(card.toughness || "0", 10) || 0;
    return base + card.plusOneCounters + card.toughnessModifier + card.staticToughnessModifier;
  }

  function getKeywordList(card) {
    const all = [
      ...(card.keywords || []),
      ...(card.staticKeywords || []),
      ...(card.temporaryKeywords || []),
    ];
    return Array.from(new Set(all.map((keyword) => keyword.trim()).filter(Boolean)));
  }

  function icon(src, className, title) {
    const image = document.createElement("img");
    image.src = src;
    image.className = className;
    image.alt = "";
    if (title) image.title = title;
    return image;
  }

  function getIsLand(card) {
    return card.isLand || card.cardTypes.includes("Land");
  }

  function getStackKey(card) {
    return [
      card.cardId,
      card.tapped && !getIsLand(card) ? "tapped" : "untapped",
      card.damageMarked,
      card.deathtouchDamageMarked,
      card.plusOneCounters,
      card.powerModifier,
      card.toughnessModifier,
      [...(card.temporaryKeywords || [])].sort().join(","),
      [...(card.staticKeywords || [])].sort().join(","),
    ].join("|");
  }

  function groupBattlefieldCards(cards) {
    const groups = new Map();

    for (const card of cards) {
      const key = getStackKey(card);
      const existing = groups.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        groups.set(key, { card, count: 1 });
      }
    }

    return [...groups.values()];
  }

  function ensureInspector() {
    let inspector = document.getElementById("card-inspector");

    if (inspector) {
      return inspector;
    }

    inspector = createElement("dialog", "card-inspector");
    inspector.id = "card-inspector";
    inspector.innerHTML = `
      <form method="dialog">
        <button class="icon-button" value="close" aria-label="Cerrar">
          <img src="${ASSET_BASE}/ui/icons/close.svg" alt="" />
        </button>
      </form>
      <div class="inspector-body"></div>
    `;
    document.body.append(inspector);
    inspector.addEventListener("click", (event) => {
      if (event.target === inspector) {
        inspector.close();
      }
    });
    return inspector;
  }

  function openCardInspector(card, stackCount) {
    const inspector = ensureInspector();
    const body = inspector.querySelector(".inspector-body");
    body.replaceChildren();

    const preview = renderCard(card, "inspect", stackCount);
    const details = createElement("section", "inspector-details");
    details.append(
      createElement("h2", null, card.name),
      createElement("p", "inspector-type", card.typeLine),
    );

    if (card.manaCost) {
      details.append(createElement("p", "inspector-line", `Coste: ${card.manaCost}`));
    }

    if (card.cardTypes.includes("Creature")) {
      details.append(createElement("p", "inspector-line", `F/R: ${getEffectivePower(card)}/${getEffectiveToughness(card)}`));
    }

    const keywords = getKeywordList(card);
    if (keywords.length > 0) {
      details.append(createElement("p", "inspector-line", `Keywords: ${keywords.join(", ")}`));
    }

    if (stackCount && stackCount > 1) {
      details.append(createElement("p", "inspector-line", `Copias apiladas: ${stackCount}`));
    }

    details.append(createElement("p", "inspector-text", card.gameText || "Sin texto de reglas."));
    body.append(preview, details);
    inspector.showModal();
  }

  function openZoneInspector(title, cards) {
    const inspector = ensureInspector();
    const body = inspector.querySelector(".inspector-body");
    body.replaceChildren();

    const details = createElement("section", "zone-inspector");
    details.append(createElement("h2", null, title), createElement("p", "inspector-line", `${cards.length} carta(s)`));

    const list = createElement("div", "zone-card-list");
    if (cards.length === 0) {
      list.append(createElement("span", "empty", "Vacio"));
    } else {
      for (const card of [...cards].reverse()) {
        const row = createElement("button", "zone-card-row");
        row.type = "button";
        row.append(createElement("strong", null, card.name), createElement("span", null, card.typeLine));
        row.addEventListener("click", () => openCardInspector(card));
        list.append(row);
      }
    }

    details.append(list);
    body.append(details);
    inspector.showModal();
  }

  function openLogInspector() {
    const inspector = ensureInspector();
    const body = inspector.querySelector(".inspector-body");
    body.replaceChildren();

    const details = createElement("section", "log-inspector");
    details.append(
      createElement("h2", null, "Registro"),
      createElement("p", "inspector-line", `${snapshot.log.length} entrada(s)`),
    );

    const list = createElement("ol", "match-log-list");
    const entries = snapshot.log.slice().reverse();

    for (const entry of entries) {
      const item = createElement("li");
      item.append(
        createElement("span", "meta", `T${entry.turn} - ${entry.phase}`),
        document.createTextNode(entry.message),
      );
      list.append(item);
    }

    details.append(list);
    body.append(details);
    inspector.showModal();
  }

  function getFrameMessage(frame) {
    const latest = frame?.newLog?.length
      ? frame.newLog[frame.newLog.length - 1]
      : getFrameSnapshot(frameIndex)?.log?.[getFrameSnapshot(frameIndex).log.length - 1];

    return latest ? latest.message : "La partida esta lista.";
  }

  function renderCard(card, context, stackCount) {
    const isTapped = card.tapped && !getIsLand(card);
    const element = createElement("article", `card ${isTapped ? "tapped" : ""}`);
    element.style.backgroundImage = `url("${getCardArt(card)}")`;
    element.title = `${card.name}\n${card.typeLine}`;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Consultar ${card.name}`);
    element.addEventListener("click", () => openCardInspector(card, stackCount));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCardInspector(card, stackCount);
      }
    });

    const inner = createElement("div", "card-inner");
    const name = createElement("div", "card-name", card.name);
    const type = createElement("div", "card-type", card.typeLine.replace(/^Token /, ""));
    const bottom = createElement("div");

    inner.append(name, createElement("span"), bottom);
    bottom.append(type);

    if (card.manaCost) {
      inner.append(createElement("div", "card-cost", card.manaCost));
    }

    if (card.cardTypes.includes("Creature")) {
      const pt = createElement("div", "pt", `${getEffectivePower(card)}/${getEffectiveToughness(card)}`);
      element.append(pt);
    }

    const badges = createElement("div", "badge-strip");
    const keywords = getKeywordList(card).slice(0, 4);
    for (const keyword of keywords) {
      const asset = keywordIcons[normalize(keyword)];
      if (asset) badges.append(icon(`${ASSET_BASE}/ui/icons/${asset}`, "keyword-icon", keyword));
    }

    if (isTapped) {
      badges.append(icon(`${ASSET_BASE}/ui/overlays/tapped.svg`, "status-icon", "Tapped"));
    }

    if (card.damageMarked > 0 || card.deathtouchDamageMarked > 0) {
      badges.append(createElement("span", "counter damage", String(card.damageMarked + card.deathtouchDamageMarked)));
    }

    if (card.plusOneCounters > 0) {
      badges.append(createElement("span", "counter", `+${card.plusOneCounters}`));
    }

    if (context === "hand") {
      element.classList.add("in-hand");
    }

    if (stackCount && stackCount > 1) {
      element.append(createElement("span", "stack-count", `x${stackCount}`));
    }

    element.append(inner);
    if (badges.childNodes.length > 0) element.append(badges);
    return element;
  }

  function renderCards(cards, context, options = {}) {
    const row = createElement("div", "card-row");
    if (cards.length === 0) {
      row.append(createElement("span", "empty", "Vacio"));
      return row;
    }

    if (options.stackBattlefield) {
      for (const group of groupBattlefieldCards(cards)) {
        row.append(renderCard(group.card, context, group.count));
      }
      return row;
    }

    for (const card of cards) {
      row.append(renderCard(card, context));
    }

    return row;
  }

  function renderGraveyardPile(player) {
    const pile = createElement("button", "deck-pile graveyard-pile");
    pile.type = "button";
    pile.append(createElement("span", null, "Cementerio"), createElement("strong", null, String(player.graveyard.length)));
    pile.addEventListener("click", () => openZoneInspector(`${player.playerId} - Cementerio`, player.graveyard));
    return pile;
  }

  function renderManaPool(manaPool) {
    const row = createElement("div", "mana-row");
    for (const mana of manaOrder) {
      const amount = manaPool[mana] || 0;
      if (amount <= 0) continue;
      const pill = createElement("span", "mana");
      pill.append(icon(`${ASSET_BASE}/ui/icons/mana_${mana.toLowerCase()}.svg`, "", mana), document.createTextNode(String(amount)));
      row.append(pill);
    }

    if (row.childNodes.length === 0) {
      row.append(createElement("span", "empty", "Sin mana"));
    }

    return row;
  }

  function renderArchetypes(player) {
    const row = createElement("div", "archetypes");
    for (const archetypeId of player.archetypeIds) {
      const chip = createElement("span", "archetype-chip");
      chip.append(
        icon(`${ASSET_BASE}/ui/icons/archetype_${archetypeId}.svg`, "", archetypeId),
        document.createTextNode(archetypeNames[archetypeId] || archetypeId),
      );
      row.append(chip);
    }
    return row;
  }

  function renderPlayer(player) {
    const panel = createElement("section", "player-panel");
    if (snapshot.game.attackingPriorityPlayerId === player.playerId) {
      panel.classList.add("priority");
      panel.append(createElement("span", "resolution-priority", "Prioridad de resolucion"));
    }

    const primaryArchetype = player.archetypeIds[0];
    const sidebar = createElement("aside", "player-sidebar");
    const identity = createElement("div", "identity");
    identity.append(
      icon(`${ASSET_BASE}/backgrounds/archetypes/${primaryArchetype}_avatar.webp`, "avatar", primaryArchetype),
    );

    const identityText = createElement("div");
    identityText.append(createElement("h2", null, player.playerId), renderArchetypes(player));
    identity.append(identityText);

    const vitals = createElement("div", "vitals");
    const life = createElement("div", "vital");
    life.append(createElement("span", null, "Vida"), createElement("strong", null, String(player.lifeTotal)));
    const mana = createElement("div", "vital");
    mana.append(createElement("span", null, "Mana"), renderManaPool(player.manaPool));
    vitals.append(life, mana);

    const deckGrid = createElement("div", "deck-grid");
    const spellDeck = createElement("div", "deck-pile spell");
    spellDeck.append(createElement("span", null, "Spell deck"), createElement("strong", null, String(player.spellDeckCount)));
    const landDeck = createElement("div", "deck-pile land");
    landDeck.append(createElement("span", null, "Land deck"), createElement("strong", null, String(player.landDeckCount)));
    deckGrid.append(spellDeck, landDeck, renderGraveyardPile(player));

    sidebar.append(identity, vitals, deckGrid);

    const playArea = createElement("div", "play-area");
    const battlefield = createElement("section", "battlefield");
    const title = createElement("div", "zone-title");
    title.append(createElement("span", null, "Campo de batalla"), createElement("strong", "zone-count", String(player.battlefield.length)));

    const creatures = player.battlefield.filter((card) => card.cardTypes.includes("Creature"));
    const lands = player.battlefield.filter((card) => card.isLand || card.cardTypes.includes("Land"));
    const others = player.battlefield.filter(
      (card) => !card.cardTypes.includes("Creature") && !card.isLand && !card.cardTypes.includes("Land"),
    );

    const lanes = createElement("div", "lane-group");
    const landLane = createElement("div", "lane");
    landLane.append(createElement("h3", null, "Tierras"), renderCards(lands, "battlefield", { stackBattlefield: true }));
    const creatureLane = createElement("div", "lane combat");
    creatureLane.append(createElement("h3", null, "Criaturas"), renderCards(creatures, "battlefield", { stackBattlefield: true }));
    const otherLane = createElement("div", "lane");
    otherLane.append(createElement("h3", null, "Otros"), renderCards(others, "battlefield", { stackBattlefield: true }));
    lanes.append(landLane, creatureLane, otherLane);
    battlefield.append(title, lanes);

    const hand = createElement("section", "hand-zone");
    const handTitle = createElement("div", "zone-title");
    handTitle.append(createElement("span", null, "Mano"), createElement("strong", "zone-count", String(player.hand.length)));
    hand.append(handTitle, renderCards(player.hand, "hand"));

    playArea.append(battlefield, hand);
    panel.append(sidebar, playArea);
    return panel;
  }

  function renderStats() {
    const stats = document.getElementById("match-stats");
    stats.replaceChildren();
    const values = [
      ["Turno", snapshot.game.turnNumber],
      ["Fase", snapshot.game.phase],
      ["Estado", snapshot.game.status],
      ["Ganador", snapshot.game.winnerId || "none"],
      ["IA", snapshot.game.aiModel || "base"],
      ["Hechizos", snapshot.eventSummary.spellsCast],
      ["Activadas", snapshot.eventSummary.abilityActivations],
    ];

    for (const [label, value] of values) {
      const stat = createElement("div", "stat");
      stat.append(createElement("span", null, label), createElement("strong", null, String(value)));
      stats.append(stat);
    }
  }

  function updateReplayReadout() {
    const label = document.getElementById("replay-label");
    const message = document.getElementById("replay-message");
    const frame = replay[frameIndex];
    label.textContent = replay.length > 1
      ? `${frameIndex + 1}/${replay.length} - ${frame.label || "Paso"}`
      : "Snapshot final";
    message.textContent = getFrameMessage(frame);
  }

  function updatePlayButton() {
    const button = document.getElementById("replay-play");
    const image = button.querySelector("img");
    image.src = isPlaying ? `${ASSET_BASE}/ui/icons/pause.svg` : `${ASSET_BASE}/ui/icons/play.svg`;
    button.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproducir");
  }

  function renderCurrentFrame() {
    snapshot = getFrameSnapshot(frameIndex);
    renderStats();

    const board = document.getElementById("board");
    board.replaceChildren();
    for (const player of [...snapshot.players].reverse()) {
      board.append(renderPlayer(player));
    }

    updateReplayReadout();
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    isPlaying = false;
    updatePlayButton();
  }

  function stepReplay(delta) {
    const nextIndex = Math.max(0, Math.min(replay.length - 1, frameIndex + delta));
    frameIndex = nextIndex;
    renderCurrentFrame();

    if (frameIndex >= replay.length - 1) {
      stopAutoplay();
    }
  }

  function startAutoplay() {
    if (replay.length <= 1) {
      return;
    }

    if (frameIndex >= replay.length - 1) {
      frameIndex = 0;
      renderCurrentFrame();
    }

    isPlaying = true;
    updatePlayButton();
    const speed = Number.parseInt(document.getElementById("replay-speed").value, 10) || 1400;
    autoplayTimer = window.setInterval(() => stepReplay(1), speed);
  }

  function toggleAutoplay() {
    if (isPlaying) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  }

  function initializeReplayControls() {
    document.getElementById("replay-prev").addEventListener("click", () => {
      stopAutoplay();
      stepReplay(-1);
    });
    document.getElementById("replay-next").addEventListener("click", () => {
      stopAutoplay();
      stepReplay(1);
    });
    document.getElementById("replay-play").addEventListener("click", toggleAutoplay);
    document.getElementById("replay-speed").addEventListener("change", () => {
      if (isPlaying) {
        stopAutoplay();
        startAutoplay();
      }
    });
  }

  function render() {
    if (!snapshot) {
      document.body.textContent = "No hay snapshot de partida.";
      return;
    }

    document.getElementById("match-subtitle").textContent =
      `Seed ${snapshot.seed} · generado ${new Date(snapshot.generatedAt).toLocaleString()}`;

    initializeReplayControls();
    renderCurrentFrame();
    document.getElementById("open-log").addEventListener("click", openLogInspector);
  }

  render();
})();

/* ============ Supabase ============ */
const SUPABASE_URL = "https://umozumbmjfjdmmppelwa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb3p1bWJtamZqZG1tcHBlbHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MjA2MjAsImV4cCI6MjEwNDk5NjYyMH0.t01eyAh46XaeIP85ch-aSvjMmlGfEE92UiH2hSEM7K8";
const MAX_PLAYERS = 10;
const sb = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
        },
      },
    })
  : null;

function metaFromRow(row) {
  return {
    hostId: row.host_id,
    status: row.status,
    phase: row.phase,
    round: row.round,
    log: row.log || [],
    lastDeathName: row.last_death_name,
    lastEliminatedName: row.last_eliminated_name,
    winner: row.winner,
    discussionSeconds: row.discussion_seconds || 60,
    votingSeconds: row.voting_seconds || 45,
    phaseEndsAt: row.phase_ends_at
      ? new Date(row.phase_ends_at).getTime()
      : null,
    investigationGameId: row.investigation_game_id || null,
    scenarioKey: row.scenario_key || "prefeitura",
    traitCategories: Array.isArray(row.trait_categories)
      ? row.trait_categories
      : ["local", "objeto", "vestimenta"],
    cluesPerRound: Number(row.clues_per_round) || 1,
    revealOrder: Array.isArray(row.reveal_order) ? row.reveal_order : [],
    revealedTraits: Array.isArray(row.revealed_traits)
      ? row.revealed_traits
      : [],
    roleCounts: {
      assassino: Math.max(1, Number(row.assassin_count) || 1),
      detetive:
        row.detective_count == null
          ? 1
          : Math.max(0, Number(row.detective_count) || 0),
      anjo:
        row.angel_count == null
          ? 1
          : Math.max(0, Number(row.angel_count) || 0),
    },
  };
}
function rowFromMeta(code, meta) {
  return {
    code,
    host_id: meta.hostId,
    status: meta.status,
    phase: meta.phase,
    round: meta.round,
    log: meta.log,
    last_death_name: meta.lastDeathName,
    last_eliminated_name: meta.lastEliminatedName,
    winner: meta.winner,
    discussion_seconds: meta.discussionSeconds,
    voting_seconds: meta.votingSeconds,
    phase_ends_at: meta.phaseEndsAt
      ? new Date(meta.phaseEndsAt).toISOString()
      : null,
    investigation_game_id: meta.investigationGameId || null,
    scenario_key: meta.scenarioKey || "prefeitura",
    trait_categories: Array.isArray(meta.traitCategories)
      ? meta.traitCategories
      : ["local", "objeto", "vestimenta"],
    clues_per_round: Number(meta.cluesPerRound) || 1,
    reveal_order: Array.isArray(meta.revealOrder) ? meta.revealOrder : [],
    revealed_traits: Array.isArray(meta.revealedTraits)
      ? meta.revealedTraits
      : [],
    assassin_count: Math.max(1, Number(meta.roleCounts?.assassino) || 1),
    detective_count: Math.max(0, Number(meta.roleCounts?.detetive) || 0),
    angel_count: Math.max(0, Number(meta.roleCounts?.anjo) || 0),
  };
}
async function dbGetRoom(code) {
  if (!sb) return null;
  const { data, error } = await sb
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("dbGetRoom", error);
    return null;
  }
  return data ? metaFromRow(data) : null;
}
async function dbCreateRoom(code, meta) {
  const { error } = await sb.from("rooms").insert(rowFromMeta(code, meta));
  if (error) console.error("dbCreateRoom", error);
}
async function dbUpdateRoom(code, meta) {
  const row = rowFromMeta(code, meta);
  delete row.code;
  const { error } = await sb.from("rooms").update(row).eq("code", code);
  if (error) console.error("dbUpdateRoom", error);
}
async function dbUpsertPlayer(code, player) {
  const { error } = await sb.from("players").upsert(
    {
      room_code: code,
      id: player.id,
      name: player.name,
      alive: player.alive,
      role: player.role,
      ready_round: player.readyRound ?? 0,
      trait_local: player.traitLocal || null,
      trait_objeto: player.traitObjeto || null,
      trait_vestimenta: player.traitVestimenta || null,
      trait_intencao: player.traitIntencao || null,
      trait_testemunha_axis: player.traitTestemunhaAxis || null,
      trait_testemunha_value: player.traitTestemunhaValue || null,
    },
    { onConflict: "room_code,id" },
  );
  if (error) console.error("dbUpsertPlayer", error);
}
async function dbFetchPlayers(code) {
  if (!sb) return [];
  let { data, error } = await sb
    .from("players")
    .select("*")
    .eq("room_code", code)
    .order("joined_at");
  if (error) {
    console.error("ERRO AO BUSCAR PLAYERS:", error);
    console.error("Código:", error.code);
    console.error("Mensagem:", error.message);
    console.error("Detalhes:", error.details);
    console.error("Hint:", error.hint);
    state.error = `Erro ao carregar jogadores: ${error.message}`;
    return null;
  }
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    alive: r.alive,
    role: r.role,
    readyRound: r.ready_round ?? 0,
    traitLocal: r.trait_local || null,
    traitObjeto: r.trait_objeto || null,
    traitVestimenta: r.trait_vestimenta || null,
    traitIntencao: r.trait_intencao || null,
    traitTestemunhaAxis: r.trait_testemunha_axis || null,
    traitTestemunhaValue: r.trait_testemunha_value || null,
    joinedAt: r.joined_at ? new Date(r.joined_at).getTime() : 0,
  }));
}
async function dbMarkReady(code, playerId, round) {
  const { error } = await sb
    .from("players")
    .update({ ready_round: round })
    .eq("room_code", code)
    .eq("id", playerId);
  if (error) console.error("dbMarkReady", error);
  return !error;
}

async function allPlayersReady(code, round) {
  const players = await fetchPlayers(code);
  if (!players?.length) return false;
  const participants = players.filter((p) => p.alive);
  return (
    participants.length > 0 &&
    participants.every((p) => Number(p.readyRound || 0) === Number(round))
  );
}

async function tryAdvanceRoleReveal() {
  if (!state.room || state.room.phase !== "role_reveal" || state.busy) return;
  const round = state.room.round;
  if (!(await allPlayersReady(state.roomCode, round))) return;

  const duration = NIGHT_TRANSITION_SECONDS;
  const phaseEndsAt = new Date(Date.now() + duration * 1000).toISOString();
  const { error } = await sb
    .from("rooms")
    .update({ phase: "night_transition", phase_ends_at: phaseEndsAt })
    .eq("code", state.roomCode)
    .eq("phase", "role_reveal")
    .eq("round", round);
  if (error) {
    console.error("tryAdvanceRoleReveal", error);
    return false;
  }
  await refresh();
  return true;
}

async function dbSubmitNightAction(
  code,
  round,
  role,
  playerId,
  targetId,
  targetAxis = null,
) {
  const { error } = await sb.from("night_actions").upsert(
    {
      room_code: code,
      round,
      role,
      player_id: playerId,
      target_id: targetId,
      target_axis: targetAxis,
    },
    { onConflict: "room_code,round,role,player_id" },
  );
  if (error) console.error("dbSubmitNightAction", error);
}
async function dbGetNightActions(code, round, role) {
  const { data, error } = await sb
    .from("night_actions")
    .select("player_id,target_id,target_axis")
    .eq("room_code", code)
    .eq("round", round)
    .eq("role", role);
  if (error) {
    console.error("dbGetNightActions", error);
    return [];
  }
  return data.map((r) => ({
    playerId: r.player_id,
    targetId: r.target_id,
    targetAxis: r.target_axis || null,
  }));
}
async function dbGetAllNightActions(code, round) {
  const { data, error } = await sb
    .from("night_actions")
    .select("player_id,target_id,target_axis,role")
    .eq("room_code", code)
    .eq("round", round);
  if (error) {
    console.error("dbGetAllNightActions", error);
    return [];
  }
  return (data || []).map((r) => ({
    playerId: r.player_id,
    targetId: r.target_id,
    targetAxis: r.target_axis || null,
    role: r.role,
  }));
}
async function dbSubmitVote(code, round, voterId, targetId) {
  const { error } = await sb.from("votes").upsert(
    {
      room_code: code,
      round,
      voter_id: voterId,
      target_id: targetId,
    },
    { onConflict: "room_code,round,voter_id" },
  );
  if (error) console.error("dbSubmitVote", error);
}
async function dbGetVotes(code, round) {
  const { data, error } = await sb
    .from("votes")
    .select("voter_id,target_id")
    .eq("room_code", code)
    .eq("round", round);
  if (error) {
    console.error("dbGetVotes", error);
    return [];
  }
  return (data || []).map((r) => ({
    voterId: r.voter_id,
    targetId: r.target_id,
  }));
}
async function dbGetMyVote(code, round, playerId) {
  const { data, error } = await sb
    .from("votes")
    .select("target_id")
    .eq("room_code", code)
    .eq("round", round)
    .eq("voter_id", playerId)
    .maybeSingle();
  if (error) {
    console.error("dbGetMyVote", error);
    return null;
  }
  return data?.target_id ?? null;
}

/* ============ trait investigation system ============ */
const TRAIT_CATEGORIES = {
  local: { label: "Local", description: "Onde estava" },
  objeto: { label: "Objeto", description: "O que levava" },
  vestimenta: { label: "Vestimenta", description: "O que vestia" },
  intencao: {
    label: "Intenção",
    description: "O que pretendia fazer",
    flavor: true,
  },
  testemunha: { label: "Testemunha", description: "Viu alguém", flavor: true },
};

const DEDUCIBLE_AXES = ["local", "objeto", "vestimenta"];
const INTENTIONS = [
  "buscar algo",
  "encontrar alguém",
  "apenas passando por ali",
  "fugir de alguma coisa",
  "resolver um assunto",
  "pegar um objeto esquecido",
];

const SCENARIO_PRESETS = {
  prefeitura: {
    name: "Prefeitura",
    description: "Prédios públicos, arquivos e a praça central.",
    local: ["escritório", "salão de reuniões", "banheiro"],
    objeto: ["tesoura", "chave inglesa", "pasta com documentos"],
    vestimenta: ["terno escuro", "camisa social clara", "casaco"],
  },
  cassino: {
    name: "Cassino",
    description: "Luzes, mesas de jogo e corredores reservados.",
    local: ["salão principal", "sala VIP", "banheiro"],
    objeto: ["faca de cozinha", "abridor de cartas", "ficha metálica"],
    vestimenta: ["terno preto", "camisa vermelha", "jaqueta escura"],
  },
  praia: {
    name: "Praia",
    description: "Calçadão, quiosques e areia à noite.",
    local: ["quiosque", "estacionamento", "vestiário"],
    objeto: ["canivete", "tesoura", "garrafa de vidro"],
    vestimenta: ["camiseta clara", "regata escura", "jaqueta"],
  },
  festa: {
    name: "Festa",
    description: "Música, salão e áreas de serviço movimentadas.",
    local: ["salão da festa", "cozinha", "área externa"],
    objeto: ["faca de cozinha", "saca-rolhas", "tesoura"],
    vestimenta: ["camisa preta", "camisa branca", "jaqueta jeans"],
  },
};

function normalizeTraitCategories(value) {
  const input = Array.isArray(value)
    ? value
    : ["local", "objeto", "vestimenta"];
  const allowed = Object.keys(TRAIT_CATEGORIES);
  const result = [...new Set(input.filter((x) => allowed.includes(x)))];
  const axes = result.filter((x) => DEDUCIBLE_AXES.includes(x));
  if (!axes.length) result.unshift("local");
  return [...new Set(result)];
}

function getScenarioPreset(key) {
  return SCENARIO_PRESETS[key] || SCENARIO_PRESETS.prefeitura;
}

function getActiveAxes(meta) {
  return normalizeTraitCategories(meta?.traitCategories).filter((x) =>
    DEDUCIBLE_AXES.includes(x),
  );
}

function traitValue(player, axis) {
  if (!player) return null;
  if (axis === "testemunha") {
    if (!player.traitTestemunhaAxis || !player.traitTestemunhaValue)
      return null;
    const label =
      TRAIT_CATEGORIES[player.traitTestemunhaAxis]?.description ||
      player.traitTestemunhaAxis;
    return `${label}: ${player.traitTestemunhaValue}`;
  }
  return player[`trait${axis.charAt(0).toUpperCase()}${axis.slice(1)}`] || null;
}

function getInvestigationAxes(meta) {
  return normalizeTraitCategories(meta?.traitCategories).filter(
    (axis) =>
      DEDUCIBLE_AXES.includes(axis) ||
      axis === "intencao" ||
      axis === "testemunha",
  );
}

function traitField(axis) {
  return `trait${axis.charAt(0).toUpperCase()}${axis.slice(1)}`;
}

function randomTraitValue(preset, axis) {
  const values = preset[axis] || [];
  return values[Math.floor(Math.random() * values.length)] || null;
}

function assignDistributedTraitValues(players, preset, axis) {
  const values = shuffle((preset[axis] || []).slice());
  if (!values.length) return;

  // Garante que os 3 valores do eixo apareçam antes de qualquer repetição.
  // Com 4 jogadores, os três primeiros recebem valores diferentes e o quarto
  // recebe aleatoriamente um dos três, em vez de repetir sempre o primeiro.
  players.forEach((player, index) => {
    if (index < values.length) {
      player[traitField(axis)] = values[index];
      return;
    }

    const randomValue = values[Math.floor(Math.random() * values.length)];
    player[traitField(axis)] = randomValue;
  });
}

function preserveAllTraitValues(players, preset, axis) {
  const available = (preset[axis] || []).slice();
  if (available.length < 3 || players.length < 3) return;

  const present = new Set(
    players.map((p) => traitValue(p, axis)).filter(Boolean),
  );
  const missing = available.filter((value) => !present.has(value));
  if (!missing.length) return;

  // Se alguma alteração posterior à distribuição deixou um valor sem uso,
  // troca um jogador que esteja repetindo outro valor.
  for (const value of missing) {
    const candidates = players.filter((p) => {
      const current = traitValue(p, axis);
      return (
        current &&
        players.filter((x) => traitValue(x, axis) === current).length > 1
      );
    });
    const player = candidates[Math.floor(Math.random() * candidates.length)];
    if (!player) break;
    player[traitField(axis)] = value;
  }
}

function hasSameActiveCombination(a, b, axes) {
  return (
    axes.length > 0 &&
    axes.every((axis) => traitValue(a, axis) === traitValue(b, axis))
  );
}

async function dbAssignTraits(code, players, meta) {
  const preset = getScenarioPreset(meta.scenarioKey);
  const axes = getActiveAxes(meta);
  const enriched = players.map((p) => ({ ...p }));

  for (const axis of axes) assignDistributedTraitValues(enriched, preset, axis);

  for (const p of enriched) {
    if (meta.traitCategories.includes("intencao")) {
      p.traitIntencao =
        INTENTIONS[Math.floor(Math.random() * INTENTIONS.length)];
    } else p.traitIntencao = null;
    p.traitTestemunhaAxis = null;
    p.traitTestemunhaValue = null;
  }

  for (const axis of axes) preserveAllTraitValues(enriched, preset, axis);

  const assassin = enriched.find((p) => p.role === "assassino");
  if (assassin && axes.length) {
    for (const p of enriched) {
      if (p.id === assassin.id) continue;
      if (hasSameActiveCombination(p, assassin, axes)) {
        const axis = axes[Math.floor(Math.random() * axes.length)];
        const choices = (preset[axis] || []).filter(
          (v) => v !== traitValue(assassin, axis),
        );
        p[traitField(axis)] =
          choices[Math.floor(Math.random() * choices.length)] ||
          randomTraitValue(preset, axis);
      }
    }
  }

  for (const axis of axes) preserveAllTraitValues(enriched, preset, axis);

  if (meta.traitCategories.includes("testemunha")) {
    const alive = enriched.filter((p) => p.alive);
    const count = Math.max(1, Math.round(alive.length * 0.3));
    shuffle(alive)
      .slice(0, count)
      .forEach((witness) => {
        const axis = axes[Math.floor(Math.random() * axes.length)];
        const others = alive.filter((p) => p.id !== witness.id);
        const seen = others[Math.floor(Math.random() * others.length)];
        if (axis && seen) {
          witness.traitTestemunhaAxis = axis;
          witness.traitTestemunhaValue = traitValue(seen, axis);
        }
      });
  }

  const updates = enriched.map((p) => ({
    room_code: code,
    id: p.id,
    name: p.name,
    alive: p.alive,
    role: p.role,
    ready_round: 0,
    trait_local: p.traitLocal || null,
    trait_objeto: p.traitObjeto || null,
    trait_vestimenta: p.traitVestimenta || null,
    trait_intencao: p.traitIntencao || null,
    trait_testemunha_axis: p.traitTestemunhaAxis || null,
    trait_testemunha_value: p.traitTestemunhaValue || null,
  }));
  const { error } = await sb
    .from("players")
    .upsert(updates, { onConflict: "room_code,id" });
  if (error) {
    console.error("dbAssignTraits", error);
    return null;
  }
  return enriched;
}

async function dbRevealNextTraits(code, meta, players) {
  const axes = getActiveAxes(meta);
  const revealed = Array.isArray(meta.revealedTraits)
    ? meta.revealedTraits.slice()
    : [];
  const order =
    Array.isArray(meta.revealOrder) && meta.revealOrder.length
      ? meta.revealOrder.slice()
      : shuffle(axes);
  const revealedAxes = new Set(revealed.map((x) => x.axis));
  const assassin = (players || []).find(
    (p) => p.alive && p.role === "assassino",
  );
  if (!assassin || !axes.length) return meta;

  // Rodada 1 não revela pista. A partir da rodada 2, cada rodada acrescenta
  // apenas a quantidade configurada em "Traços revelados por rodada".
  const cluesPerRound = Math.max(1, Number(meta.cluesPerRound) || 1);
  const targetTotal = Math.min(
    Math.max(0, (Number(meta.round) || 1) - 1) * cluesPerRound,
    axes.length,
  );
  if (revealed.length >= targetTotal) return meta;

  let added = 0;
  const max = targetTotal - revealed.length;
  const queue = order.slice();
  const fallback = [];

  while (queue.length && added < max) {
    const axis = queue.shift();
    if (revealedAxes.has(axis)) continue;
    const value = traitValue(assassin, axis);
    const aliveCount = (players || []).filter(
      (p) => p.alive && traitValue(p, axis) === value,
    ).length;

    if (aliveCount < 3) {
      fallback.push(axis);
      continue;
    }

    revealed.push({ axis, value });
    revealedAxes.add(axis);
    added++;
  }

  while (added < max && fallback.length) {
    const axis = fallback.shift();
    if (revealedAxes.has(axis)) continue;
    revealed.push({ axis, value: traitValue(assassin, axis) });
    revealedAxes.add(axis);
    added++;
  }

  if (!added) return meta;

  const log = Array.isArray(meta.log) ? meta.log.slice() : [];
  revealed.slice(-added).forEach(({ axis, value }) => {
    const label = TRAIT_CATEGORIES[axis]?.label || axis;
    const line = `Descobriu-se que o assassino estava com ${label.toLowerCase()}: ${value}.`;
    if (!log.includes(line)) log.push(line);
  });

  const nextMeta = {
    ...meta,
    revealOrder: queue.concat(fallback),
    revealedTraits: revealed,
    log,
  };

  const { error } = await sb
    .from("rooms")
    .update({
      reveal_order: nextMeta.revealOrder,
      revealed_traits: revealed,
      log,
    })
    .eq("code", code)
    .eq("phase", "role_reveal");

  if (error) {
    console.error("dbRevealNextTraits", error);
    return meta;
  }
  return nextMeta;
}

async function dbGetMyInvestigationItems(gameId, playerId, playerRole) {
  if (!state.roomCode || !playerId) return [];
  const player = (state.players || []).find((p) => p.id === playerId);
  if (!player) return [];
  const meta = state.room;
  const axes = getActiveAxes(meta);
  const items = [];
  axes.forEach((axis) => {
    const value = traitValue(player, axis);
    if (value)
      items.push({
        item_type: "trait",
        axis,
        text_snapshot: `${TRAIT_CATEGORIES[axis].description}: ${value}`,
      });
  });
  if (meta?.traitCategories?.includes("intencao") && player.traitIntencao) {
    items.push({
      item_type: "trait",
      axis: "intencao",
      text_snapshot: `Intenção: ${player.traitIntencao}`,
    });
  }
  if (
    meta?.traitCategories?.includes("testemunha") &&
    player.traitTestemunhaAxis &&
    player.traitTestemunhaValue
  ) {
    const label =
      TRAIT_CATEGORIES[player.traitTestemunhaAxis]?.description ||
      player.traitTestemunhaAxis;
    items.push({
      item_type: "trait",
      axis: "testemunha",
      text_snapshot: `Você viu alguém ${player.traitTestemunhaValue} (${label.toLowerCase()}).`,
    });
  }
  return items;
}

/* ============ helpers: misc ============ */
function genId() {
  return (
    "p_" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genRoomCode() {
  let out = "";
  for (let i = 0; i < 5; i++)
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function computeRoleCounts(n, configured = null) {
  if (n < 4) return { assassino: 0, detetive: 0, anjo: 0, cidadao: n };

  const assassino = Math.max(1, Number(configured?.assassino) || 1);
  const detetive = Math.max(0, Number(configured?.detetive) || 0);
  const anjo = Math.max(0, Number(configured?.anjo) || 0);
  const special = assassino + detetive + anjo;

  return {
    assassino,
    detetive,
    anjo,
    cidadao: Math.max(0, n - special),
  };
}

function normalizeRoleCountsForPlayers(playerCount, configured) {
  if (playerCount < 4) return { assassino: 1, detetive: 1, anjo: 1 };

  let assassino = Math.max(1, Math.floor(Number(configured?.assassino) || 1));
  let detetive = Math.max(0, Math.floor(Number(configured?.detetive) || 0));
  let anjo = Math.max(0, Math.floor(Number(configured?.anjo) || 0));

  // Sempre preserva pelo menos um lugar para não-especiais.
  const maxSpecial = Math.max(1, playerCount - 1);
  if (assassino > maxSpecial) assassino = maxSpecial;
  if (assassino + detetive + anjo > maxSpecial) {
    let remaining = maxSpecial - assassino;
    detetive = Math.min(detetive, remaining);
    remaining -= detetive;
    anjo = Math.min(anjo, remaining);
  }

  return { assassino, detetive, anjo };
}

function roleCountLabel(counts) {
  return `${counts.assassino} assassino(s), ${counts.detetive} detetive(s), ${counts.anjo} anjo(s) e ${counts.cidadao} cidadão(s)`;
}
const ROLE_INFO = {
  assassino: {
    name: "Assassino",
    desc: "Toda noite, escolha uma vítima para eliminar. De dia, finja ser inocente.",
  },
  detetive: {
    name: "Detetive",
    desc: "Toda noite, investigue uma pessoa. O resultado indica apenas se ela tem um papel especial ou se é cidadã.",
  },
  anjo: {
    name: "Anjo",
    desc: "Toda noite, escolha alguém para proteger. Se essa pessoa for atacada, ela sobrevive.",
  },
  cidadao: {
    name: "Cidadão",
    desc: "Você não tem poderes especiais. Use a conversa e o voto para descobrir quem são os assassinos.",
  },
};
const ROLE_IMAGES = {
  assassino: "assets/roles/assassino.jpg",
  detetive: "assets/roles/detetive.png",
  anjo: "assets/roles/anjo.png",
  cidadao: "assets/roles/cidadao.png",
};

const ROLE_REVEAL_SECONDS = 5;
const DAY_REVEAL_SECONDS = 10;
const DAY_RESULTS_SECONDS = 7;
const NIGHT_TRANSITION_SECONDS = 11;
const AUDIO_ASSETS = {
  bell: "assets/audio/church-bell.mp3",
  owl: "assets/audio/owl.mp3",
  death: "assets/audio/heart-stop.mp3",
  finalWin: "assets/audio/final-win.mp3",
};

const SESSION_KEY = "cidade-dorme-session-v1";
const TAB_SESSION_KEY = "cidade-dorme-tab-session-v1";

function saveSession() {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        playerId: state.playerId,
        playerName: state.playerName,
        roomCode: state.roomCode,
        isHost: state.isHost,
      }),
    );

    // sessionStorage sobrevive ao F5 na mesma aba, mas não é reutilizado
    // quando o site é aberto novamente em uma nova sessão de aba.
    sessionStorage.setItem(TAB_SESSION_KEY, "1");
  } catch (err) {
    console.warn("Não foi possível salvar a sessão.", err);
  }
}
function clearSavedSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch (err) {
    console.warn("Não foi possível limpar a sessão.", err);
  }
}
function restoreSavedSession() {
  try {
    // O localStorage mantém a identidade para o F5, mas não deve sozinho
    // fazer uma nova abertura do site voltar para a partida anterior.
    // O marcador de aba confirma que esta é a mesma sessão de navegador/aba.
    if (sessionStorage.getItem(TAB_SESSION_KEY) !== "1") {
      return false;
    }

    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!saved?.playerId || !saved?.roomCode || !saved?.playerName)
      return false;
    state.playerId = saved.playerId;
    state.playerName = saved.playerName;
    state.roomCode = saved.roomCode;
    state.isHost = !!saved.isHost;
    return true;
  } catch (err) {
    clearSavedSession();
    return false;
  }
}
async function restoreRoomAfterRefresh() {
  if (!state.roomCode) return false;
  const meta = await dbGetRoom(state.roomCode);
  if (!meta) {
    clearSavedSession();
    Object.assign(state, {
      screen: "landing",
      roomCode: null,
      isHost: false,
      room: null,
      players: [],
    });
    return false;
  }
  const players = await fetchPlayers(state.roomCode);
  if (!players) return true;
  const me = players.find((p) => p.id === state.playerId);
  if (!me) {
    clearSavedSession();
    Object.assign(state, {
      screen: "landing",
      roomCode: null,
      isHost: false,
      room: null,
      players: [],
      error: "Sua participação nessa sala não foi encontrada.",
    });
    return false;
  }
  state.room = meta;
  state.players = players;
  state.isHost = meta.hostId === state.playerId;
  state.screen = meta.status === "lobby" ? "lobby" : "game";
  state.error = "";
  saveSession();
  return true;
}

/* ============ app state ============ */
const state = {
  screen: "landing", // landing | create | join | lobby | game
  playerId: genId(),
  playerName: "",
  roomCode: null,
  isHost: false,
  room: null, // meta object
  players: [], // array of player objects
  error: "",
  busy: false,
  selectedTarget: null,
  selectedAxis: null,
  voteConfirmed: false,
  nightActionConfirmed: false,
  pollHandle: null,
  lastPhaseSeen: null,
  discussionEndsAt: null,
  phaseTimerHandle: null,
  nightResolving: false,
  autoResolvingVotes: false,
  lastNightTransitionRound: null,
  audioContext: null,
  audioUnlocked: false,
  nightEnteredAt: null,
  phaseClientDeadline: null,
  lastDataSignature: null,
  lastRenderedPhase: null,
  chat: [],
  showInvestigation: false,
  showLobbySettings: false,
  currentVotes: [],
  spectatorNightActions: [],
  lastDeathSoundRound: null,
  deathSequenceActive: false,
  deathSequenceRound: null,
  gameOverCelebrationKey: null,
  gameOverAudio: null,
  nightRoleDone: { assassino: false, detetive: false, anjo: false },
  refreshInFlight: false,
  refreshQueued: false,
  refreshTimer: null,
  investigationItems: [],
  investigationCase: null,
};

/* ============ room meta shape ============
{
  hostId, status:'lobby'|'active', phase:'role_reveal'|'night_transition'|'night'|'day_reveal'|'day_discussion'|'day_voting'|'day_results'|'gameover',
  round, log:[strings], lastDeathName, lastEliminatedName, winner: 'cidade'|'assassinos'|null,
  discussionSeconds
}
*/

/* ============ core actions ============ */
async function createRoom(name) {
  let code = genRoomCode();
  const meta = {
    hostId: state.playerId,
    status: "lobby",
    phase: null,
    round: 0,
    log: [],
    lastDeathName: null,
    lastEliminatedName: null,
    winner: null,
    discussionSeconds: 60,
    votingSeconds: 45,
    phaseEndsAt: null,
    investigationGameId: null,
    scenarioKey: "prefeitura",
    traitCategories: ["local", "objeto", "vestimenta"],
    cluesPerRound: 1,
    revealOrder: [],
    revealedTraits: [],
    roleCounts: { assassino: 1, detetive: 1, anjo: 1 },
  };
  await dbCreateRoom(code, meta);
  await dbUpsertPlayer(code, {
    id: state.playerId,
    name,
    alive: true,
    role: null,
  });
  state.roomCode = code;
  state.isHost = true;
  state.playerName = name;
  saveSession();
  enterLobby();
}

async function updateRoomSettings(
  discussionSeconds,
  votingSeconds,
  scenarioKey,
  traitCategories,
  cluesPerRound,
  roleCounts,
) {
  if (!state.isHost || !state.roomCode || state.room?.status !== "lobby")
    return;
  const meta = await dbGetRoom(state.roomCode);
  if (!meta || meta.status !== "lobby") return;
  meta.discussionSeconds = Number(discussionSeconds) || 90;
  meta.votingSeconds = Number(votingSeconds) || 30;
  meta.scenarioKey = SCENARIO_PRESETS[scenarioKey] ? scenarioKey : "prefeitura";
  meta.traitCategories = normalizeTraitCategories(traitCategories);
  meta.cluesPerRound = Math.max(
    1,
    Math.min(Number(cluesPerRound) || 1, getActiveAxes(meta).length),
  );

  const players = (await fetchPlayers(state.roomCode)) || [];
  if (players.length >= 4) {
    const normalized = normalizeRoleCountsForPlayers(players.length, roleCounts);
    const specialTotal =
      normalized.assassino + normalized.detetive + normalized.anjo;
    if (specialTotal > players.length - 1) {
      state.error =
        "A configuração de papéis precisa deixar pelo menos 1 jogador para cidadão.";
      return false;
    }
    meta.roleCounts = normalized;
  }

  await dbUpdateRoom(state.roomCode, meta);
  state.room = meta;
  return true;
}

async function joinRoom(code, name) {
  code = code.trim().toUpperCase();
  const meta = await dbGetRoom(code);
  if (!meta) {
    state.error = "Sala não encontrada. Confira o código.";
    render();
    return;
  }
  if (meta.status !== "lobby") {
    state.error = "Esse jogo já começou. Peça um novo código.";
    render();
    return;
  }
  const already = (await fetchPlayers(code)) || [];
  if (already.length >= MAX_PLAYERS) {
    state.error = "Essa sala já está cheia.";
    render();
    return;
  }
  await dbUpsertPlayer(code, {
    id: state.playerId,
    name,
    alive: true,
    role: null,
  });
  state.roomCode = code;
  state.isHost = meta.hostId === state.playerId;
  state.playerName = name;
  state.error = "";
  saveSession();
  enterLobby();
}

function enterLobby() {
  state.screen = "lobby";
  state.error = "";
  render();
  startPolling();
}

async function fetchPlayers(code) {
  return await dbFetchPlayers(code);
}

async function refresh() {
  if (!state.roomCode) return;
  if (state.refreshInFlight) {
    state.refreshQueued = true;
    return;
  }
  state.refreshInFlight = true;
  try {
    await refreshOnce();
  } catch (err) {
    console.error("refresh", err);
  } finally {
    state.refreshInFlight = false;
    if (state.refreshQueued) {
      state.refreshQueued = false;
      refresh();
    }
  }
}

async function refreshOnce() {
  if (!state.roomCode) return;

  const meta = await dbGetRoom(state.roomCode);
  if (!meta) return;

  const players = (await fetchPlayers(state.roomCode)) || [];
  const previousPhase = state.lastPhaseSeen;

  // Detecta somente a transição deste jogador: vivo -> morto.
  // Os demais jogadores continuam vendo o fluxo normal da rodada.
  const previousMe = (state.players || []).find(
    (p) => p.id === state.playerId,
  );
  const nextMe = players.find((p) => p.id === state.playerId);
  const justDied =
    previousMe?.alive === true &&
    nextMe?.alive === false &&
    meta.status === "active";

  if (justDied && state.deathSequenceRound !== Number(meta.round)) {
    state.deathSequenceActive = true;
    state.deathSequenceRound = Number(meta.round);
    playDeathSequenceSound();

    window.setTimeout(() => {
      state.deathSequenceActive = false;
      render();
    }, 5200);
  }

  state.room = meta;
  state.players = players;

  if (meta.status === "active") {
    const me = players.find((p) => p.id === state.playerId);
    state.investigationItems = me
      ? await dbGetMyInvestigationItems(
          meta.investigationGameId,
          me.id,
          me.role,
        )
      : [];
    state.investigationCase = null;
    state.currentVotes =
      meta.phase === "day_voting"
        ? await dbGetVotes(state.roomCode, meta.round)
        : [];
    state.spectatorNightActions =
      meta.phase === "night" && me && !me.alive
        ? await dbGetAllNightActions(state.roomCode, meta.round)
        : [];
  } else {
    state.investigationItems = [];
    state.investigationCase = null;
    state.currentVotes = [];
    state.spectatorNightActions = [];
  }

  if (meta.status === "lobby" && state.screen === "game") {
    state.screen = "lobby";
    state.selectedTarget = null;
    state.selectedAxis = null;
    state.voteConfirmed = false;
    state.nightActionConfirmed = false;
    state.lastPhaseSeen = null;
    state.phaseClientDeadline = null;
    state.lastDataSignature = null;
    state.deathSequenceActive = false;
    state.deathSequenceRound = null;
    state.gameOverCelebrationKey = null;
    stopGameOverCelebrationAudio();
  } else if (meta.status === "active" && state.screen !== "game") {
    state.screen = "game";
    state.selectedTarget = null;
    state.selectedAxis = null;
    state.voteConfirmed = false;
    state.nightActionConfirmed = false;
  }

  const phaseChanged = meta.phase !== previousPhase;

  if (phaseChanged) {
    state.selectedTarget = null;
    state.selectedAxis = null;
    state.voteConfirmed = false;
    state.nightActionConfirmed = false;
    state.lastPhaseSeen = meta.phase;

    if (meta.phase === "night") state.nightEnteredAt = Date.now();
    if (meta.phase !== "night") {
      state.showInvestigation = false;
      state.nightRoleDone = { assassino: false, detetive: false, anjo: false };
    }
    if (meta.phase === "day_discussion") state.chat = [];

    // Cada navegador inicia o relógio visual no momento em que recebe a fase.
    // Isso evita diferenças causadas pelo relógio local dos aparelhos.
    // O servidor define o instante exato de término. Assim todos os jogadores
    // enxergam a mesma contagem, mesmo entrando na fase alguns segundos depois.
    state.phaseClientDeadline = meta.phaseEndsAt || null;
  }

  const me = (state.players || []).find((p) => p.id === state.playerId);

  if (
    meta.phase === "night" &&
    me &&
    me.alive &&
    ["assassino", "anjo", "detetive"].includes(me.role)
  ) {
    const rows = await dbGetNightActions(state.roomCode, meta.round, me.role);
    const ownAction = rows.find((row) => row.playerId === state.playerId);
    if (ownAction) {
      state.selectedTarget = ownAction.targetId;
      state.selectedAxis = ownAction.targetAxis || null;
      state.nightActionConfirmed = true;
    }
  }

  if (meta.phase === "day_voting" && me?.alive) {
    const savedVote = await dbGetMyVote(
      state.roomCode,
      meta.round,
      state.playerId,
    );
    if (savedVote !== null) {
      state.selectedTarget = savedVote;
      state.voteConfirmed = true;
    }
  }

  const signature = JSON.stringify({
    status: meta.status,
    phase: meta.phase,
    round: meta.round,
    lastDeathName: meta.lastDeathName,
    lastEliminatedName: meta.lastEliminatedName,
    winner: meta.winner,
    discussionSeconds: meta.discussionSeconds,
    votingSeconds: meta.votingSeconds,
    scenarioKey: meta.scenarioKey,
    traitCategories: meta.traitCategories,
    cluesPerRound: meta.cluesPerRound,
    roleCounts: meta.roleCounts,
    revealedTraits: meta.revealedTraits,
    votes: (state.currentVotes || []).map((v) => ({
      voterId: v.voterId,
      targetId: v.targetId,
    })),
    nightActions: (state.spectatorNightActions || []).map((a) => ({
      playerId: a.playerId,
      targetId: a.targetId,
      targetAxis: a.targetAxis,
      role: a.role,
    })),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      role: p.role,
    })),
  });

  // No lobby, não recriamos o DOM a cada polling. Isso evita que o <select>
  // seja destruído enquanto o usuário está abrindo/escolhendo uma opção.
  const shouldRender =
    phaseChanged ||
    state.lastDataSignature === null ||
    signature !== state.lastDataSignature;
  if (shouldRender) {
    render();
    state.lastDataSignature = signature;
  }

  // A confirmação de outro jogador só altera o contador de prontos.
  // Não recriamos a tela inteira, evitando saltos de scroll e interferência
  // enquanto o jogador lê ou interage com a tela.
  if (meta.phase === "role_reveal" && state.screen === "game") {
    updateReadyCountDisplay(players, meta.round);
  }

  // A partir da segunda rodada, a pista do assassino é preparada antes da
  // tela de informações/"Li tudo — estou pronto". Na primeira rodada não há
  // pista do assassino.
  if (
    meta.phase === "role_reveal" &&
    Number(meta.round || 1) > 1 &&
    state.isHost
  ) {
    const revealedMeta = await dbRevealNextTraits(
      state.roomCode,
      meta,
      players,
    );
    if (revealedMeta !== meta) {
      state.room = revealedMeta;
      return refresh();
    }
  }

  if (
    meta.phase === "night_transition" ||
    meta.phase === "day_reveal" ||
    meta.phase === "day_results" ||
    meta.phase === "day_discussion" ||
    meta.phase === "day_voting"
  ) {
    if (phaseChanged || !state.phaseTimerHandle) startPhaseTimer(meta);
  } else if (meta.phase === "night") {
    await loadNightProgress();
    if (state.isHost) tryAutoResolveNight();
  } else if (meta.phase === "role_reveal") {
    await tryAdvanceRoleReveal();
  }
}

function getPhaseDuration(meta) {
  if (!meta) return 0;
  switch (meta.phase) {
    case "role_reveal":
      return 0;
    case "night_transition":
      return NIGHT_TRANSITION_SECONDS;
    case "day_reveal":
      return DAY_REVEAL_SECONDS;
    case "day_discussion":
      return Number(meta.discussionSeconds) || 90;
    case "day_voting":
      return Number(meta.votingSeconds) || 30;
    case "day_results":
      return DAY_RESULTS_SECONDS;
    default:
      return 0;
  }
}

function getPhaseRemainingMs(meta) {
  if (state.phaseClientDeadline)
    return Math.max(0, state.phaseClientDeadline - Date.now());
  if (meta?.phaseEndsAt) return Math.max(0, meta.phaseEndsAt - Date.now());
  return 0;
}

function formatSeconds(total) {
  total = Number(total) || 0;
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60),
    s = total % 60;
  return s ? `${m}m ${s}s` : `${m} min`;
}

function formatTimer(ms) {
  const remain = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(remain / 60)).padStart(2, "0");
  const s = String(remain % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function startPhaseTimer(meta) {
  clearTimeout(state.phaseTimerHandle);
  state.phaseTimerHandle = null;

  const duration = getPhaseDuration(meta);
  if (!duration && !meta.phaseEndsAt) return;

  if (!state.phaseClientDeadline) {
    state.phaseClientDeadline =
      meta.phaseEndsAt || (duration ? Date.now() + duration * 1000 : null);
  }

  const check = async () => {
    const current = await dbGetRoom(state.roomCode);
    if (!current || current.phase !== meta.phase) return;

    const remain = getPhaseRemainingMs(current);
    if (remain > 0) {
      state.phaseTimerHandle = setTimeout(check, Math.min(remain, 250));
      return;
    }

    state.phaseTimerHandle = null;

    // Pequena pausa depois do 00:00 para a mudança de tela não parecer
    // instantânea/cortada. O relógio já chegou a zero, mas a próxima ação
    // só acontece após este intervalo curto.
    await new Promise((resolve) => setTimeout(resolve, 850));

    const latest = await dbGetRoom(state.roomCode);
    if (!latest || latest.phase !== current.phase) {
      await refresh();
      return;
    }

    if (latest.phase === "night_transition") {
      await dbAdvancePhase(state.roomCode, "night_transition", "night");
    } else if (latest.phase === "day_reveal") {
      await dbAdvancePhase(state.roomCode, "day_reveal", "day_discussion");
    } else if (latest.phase === "day_discussion") {
      await dbAdvancePhase(state.roomCode, "day_discussion", "day_voting");
    } else if (latest.phase === "day_voting") {
      await autoResolveVotes();
    } else if (latest.phase === "day_results") {
      await advanceToNextNight();
    }

    // Não dependemos exclusivamente do realtime para mostrar a nova tela.
    await refresh();
  };

  check();
}

async function dbAdvancePhase(code, fromPhase, toPhase) {
  const meta = await dbGetRoom(code);
  if (!meta || meta.phase !== fromPhase) return;

  const duration = getNextPhaseDuration(meta, toPhase);
  const phaseEndsAt = duration
    ? new Date(Date.now() + duration * 1000).toISOString()
    : null;

  const { error } = await sb
    .from("rooms")
    .update({
      phase: toPhase,
      phase_ends_at: phaseEndsAt,
    })
    .eq("code", code)
    .eq("phase", fromPhase);

  if (error) {
    console.error("dbAdvancePhase", error);
    return false;
  }
  return true;
}

function getNextPhaseDuration(meta, phase) {
  if (phase === "night_transition") return NIGHT_TRANSITION_SECONDS;
  if (phase === "day_discussion") return Number(meta.discussionSeconds) || 90;
  if (phase === "day_voting") return Number(meta.votingSeconds) || 30;
  if (phase === "day_reveal") return DAY_REVEAL_SECONDS;
  if (phase === "day_results") return DAY_RESULTS_SECONDS;
  return 0;
}

async function dbClearMatchActions(code) {
  if (!code) return false;

  const { error: nightError } = await sb
    .from("night_actions")
    .delete()
    .eq("room_code", code);

  if (nightError) {
    console.error("dbClearMatchActions.night_actions", nightError);
    return false;
  }

  const { error: voteError } = await sb
    .from("votes")
    .delete()
    .eq("room_code", code);

  if (voteError) {
    console.error("dbClearMatchActions.votes", voteError);
    return false;
  }

  // Não basta o DELETE não retornar erro: em caso de policy/RLS inadequada,
  // o Supabase pode simplesmente não afetar nenhuma linha. Conferimos se
  // realmente não sobrou ação da sala antes de permitir uma nova partida.
  const [
    { data: remainingNight, error: checkNightError },
    { data: remainingVotes, error: checkVoteError },
  ] = await Promise.all([
    sb.from("night_actions").select("room_code").eq("room_code", code).limit(1),
    sb.from("votes").select("room_code").eq("room_code", code).limit(1),
  ]);

  if (checkNightError || checkVoteError) {
    console.error("dbClearMatchActions.verify", {
      night: checkNightError,
      votes: checkVoteError,
    });
    return false;
  }

  if ((remainingNight || []).length || (remainingVotes || []).length) {
    console.error("dbClearMatchActions: ainda existem ações antigas", {
      roomCode: code,
      nightActionsRemaining: (remainingNight || []).length,
      votesRemaining: (remainingVotes || []).length,
    });
    return false;
  }

  return true;
}

async function dbResetPlayersForLobby(code) {
  const { error } = await sb
    .from("players")
    .update({
      alive: true,
      role: null,
      ready_round: 0,
      trait_local: null,
      trait_objeto: null,
      trait_vestimenta: null,
      trait_intencao: null,
      trait_testemunha_axis: null,
      trait_testemunha_value: null,
    })
    .eq("room_code", code);

  if (error) {
    console.error("dbResetPlayersForLobby", error);
    return false;
  }

  return true;
}

function startPolling() {
  stopPolling();
  refresh();
  subscribeRealtime(state.roomCode);
  state.pollHandle = setInterval(refresh, 8000);
}
function stopPolling() {
  if (state.pollHandle) {
    clearInterval(state.pollHandle);
    state.pollHandle = null;
  }
  clearTimeout(state.phaseTimerHandle);
  state.phaseTimerHandle = null;
  clearTimeout(state.refreshTimer);
  state.refreshTimer = null;
  if (state.channel && sb) {
    sb.removeChannel(state.channel);
    state.channel = null;
  }
}
function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(refresh, 280);
}
function subscribeRealtime(code) {
  if (!sb) return;
  state.channel = sb
    .channel("room-" + code)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `code=eq.${code}`,
      },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: `room_code=eq.${code}`,
      },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "night_actions",
        filter: `room_code=eq.${code}`,
      },
      scheduleRefresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "votes",
        filter: `room_code=eq.${code}`,
      },
      scheduleRefresh,
    )
    .on("broadcast", { event: "chat" }, (msg) => {
      const payload = msg.payload || {};
      if (!payload.text) return;
      if (state.chat.some((m) => m.id === payload.id && m.t === payload.t))
        return;
      state.chat.push(payload);
      if (state.screen === "game" && state.room?.phase === "day_discussion") {
        render();
      }
    })
    .subscribe();
}

/* ---- host: start game ---- */
async function hostStartGame() {
  if (!state.isHost || state.busy) return;

  // O clique em “Iniciar jogo” é uma interação do usuário: aproveitamos para
  // liberar o áudio antes da sequência cinematográfica.
  await unlockAudio();

  state.busy = true;
  render();

  const players = await fetchPlayers(state.roomCode);

  if (!players) {
    state.busy = false;
    render();
    return;
  }

  if (!players.length) {
    state.busy = false;
    state.error = "Nenhum jogador foi encontrado na sala.";
    render();
    return;
  }

  if (players.length < 4) {
    state.busy = false;
    state.error = "São necessários pelo menos 4 jogadores para começar.";
    render();
    return;
  }

  // Uma nova partida reutiliza a mesma sala e reinicia a rodada em 1.
  // Portanto, votos e ações noturnas da partida anterior não podem permanecer,
  // pois usam room_code + round e seriam interpretados como ações da nova partida.
  const clearedActions = await dbClearMatchActions(state.roomCode);
  if (!clearedActions) {
    state.busy = false;
    state.error =
      "Não foi possível limpar as ações da partida anterior. A nova partida não foi iniciada.";
    render();
    return;
  }

  // A configuração dos papéis é feita pelo host no lobby.
  // A partir de 4 jogadores, ela define quantos assassinos, detetives e anjos
  // existirão; os lugares restantes são preenchidos por cidadãos.
  const roomSettings = await dbGetRoom(state.roomCode);
  if (!roomSettings || roomSettings.status !== "lobby") {
    state.busy = false;
    return;
  }
  const roleCounts = normalizeRoleCountsForPlayers(
    players.length,
    roomSettings.roleCounts,
  );
  const counts = computeRoleCounts(players.length, roleCounts);
  const pool = shuffle([
    ...Array(counts.assassino).fill("assassino"),
    ...Array(counts.detetive).fill("detetive"),
    ...Array(counts.anjo).fill("anjo"),
    ...Array(counts.cidadao).fill("cidadao"),
  ]);
  const shuffledPlayers = shuffle(players);

  if (pool.length !== shuffledPlayers.length) {
    state.busy = false;
    state.error = "Não foi possível distribuir os papéis corretamente.";
    render();
    return;
  }

  await Promise.all(
    shuffledPlayers.map((p, idx) =>
      dbUpsertPlayer(state.roomCode, {
        ...p,
        role: pool[idx],
        alive: true,
        readyRound: 0,
      }),
    ),
  );

  const meta = roomSettings;

  if (!meta || meta.status !== "lobby") {
    state.busy = false;
    return;
  }

  meta.roleCounts = roleCounts;
  meta.status = "active";
  meta.phase = "role_reveal";
  meta.round = (meta.round || 0) + 1;
  meta.phaseEndsAt = null;
  meta.lastDeathName = null;
  meta.lastEliminatedName = null;
  meta.winner = null;
  meta.log = [
    "Os papéis foram distribuídos. A cidade se prepara para a primeira noite.",
  ];

  const assignedPlayers = shuffledPlayers.map((p, idx) => ({
    ...p,
    role: pool[idx],
    alive: true,
    readyRound: 0,
    traitLocal: null,
    traitObjeto: null,
    traitVestimenta: null,
    traitIntencao: null,
    traitTestemunhaAxis: null,
    traitTestemunhaValue: null,
  }));

  meta.revealOrder = shuffle(getActiveAxes(meta));
  meta.revealedTraits = [];
  const traitPlayers = await dbAssignTraits(
    state.roomCode,
    assignedPlayers,
    meta,
  );
  if (!traitPlayers) {
    state.busy = false;
    state.error = "Não foi possível sortear os traços desta partida.";
    render();
    return;
  }
  meta.investigationGameId = null;

  await dbUpdateRoom(state.roomCode, meta);

  state.busy = false;
  state.selectedTarget = null;
  state.voteConfirmed = false;
  state.nightActionConfirmed = false;
  state.lastPhaseSeen = null;

  refresh();
}

/* ---- night actions ---- */
function selectNightTarget(targetId) {
  if (state.nightActionConfirmed) return;
  state.selectedTarget = targetId;
  render();
}

async function confirmNightAction() {
  if (state.nightActionConfirmed || !state.selectedTarget) return;
  const me = myPlayer();
  if (!me || !me.alive) return;
  const validRoles = ["assassino", "anjo", "detetive"];
  if (!validRoles.includes(me.role)) return;
  if (me.role === "detetive" && !state.selectedAxis) return;
  const target = (state.players || []).find(
    (p) => p.id === state.selectedTarget,
  );
  if (!target || !target.alive || (target.id === me.id && me.role !== "anjo"))
    return;
  await dbSubmitNightAction(
    state.roomCode,
    state.room.round,
    me.role,
    state.playerId,
    state.selectedTarget,
    me.role === "detetive" ? state.selectedAxis : null,
  );
  state.nightActionConfirmed = true;
  render();
  await tryAutoResolveNight();
}

function tally(counts) {
  let best = null,
    bestN = -1,
    tie = false;
  Object.entries(counts).forEach(([k, v]) => {
    if (v > bestN) {
      best = k;
      bestN = v;
      tie = false;
    } else if (v === bestN) {
      tie = true;
    }
  });
  return { winner: tie ? null : best, tie };
}

async function tryAutoResolveNight() {
  if (state.nightResolving || !state.room || state.room.phase !== "night")
    return;

  const players = (await fetchPlayers(state.roomCode)) || [];
  if (!players.length) return;
  const required = players.filter(
    (p) => p.alive && ["assassino", "anjo", "detetive"].includes(p.role),
  );

  if (!required.length) return;

  const actions = [];

  for (const role of ["assassino", "anjo", "detetive"]) {
    const rows = await dbGetNightActions(
      state.roomCode,
      state.room.round,
      role,
    );
    actions.push(...rows);
  }

  const acted = new Set(actions.map((a) => a.playerId));

  if (required.some((p) => !acted.has(p.id))) return;

  state.nightResolving = true;

  try {
    await hostResolveNight();
  } finally {
    state.nightResolving = false;
  }
}

async function loadNightProgress() {
  if (!state.room) return;
  const done = { assassino: false, detetive: false, anjo: false };
  for (const role of ["assassino", "detetive", "anjo"]) {
    const rows = await dbGetNightActions(
      state.roomCode,
      state.room.round,
      role,
    );
    done[role] = rows.length > 0;
  }
  state.nightRoleDone = done;
}

async function sendChat(text) {
  const payload = {
    id: state.playerId,
    name: state.playerName || "Jogador",
    text,
    t: Date.now(),
  };
  state.chat.push(payload);
  if (state.channel) {
    await state.channel.send({ type: "broadcast", event: "chat", payload });
  }
}

async function hostResolveNight() {
  if (state.busy) return;
  state.busy = true;

  try {
    const roomBefore = await dbGetRoom(state.roomCode);
    if (!roomBefore || roomBefore.phase !== "night") return;

    const round = roomBefore.round;
    const players = await fetchPlayers(state.roomCode);
    const aliveAssassinos = players.filter(
      (p) => p.alive && p.role === "assassino",
    );
    const assassinoVotes = await dbGetNightActions(
      state.roomCode,
      round,
      "assassino",
    );
    const counts = {};
    assassinoVotes.forEach((a) => {
      if (a.targetId) counts[a.targetId] = (counts[a.targetId] || 0) + 1;
    });

    let victimId = null;
    if (Object.keys(counts).length) {
      const t = tally(counts);
      const candidates = t.winner ? [t.winner] : Object.keys(counts);
      victimId = candidates[Math.floor(Math.random() * candidates.length)];
    } else if (aliveAssassinos.length) {
      const targets = players.filter((p) => p.alive && p.role !== "assassino");
      if (targets.length)
        victimId = targets[Math.floor(Math.random() * targets.length)].id;
    }

    const anjoPicks = await dbGetNightActions(state.roomCode, round, "anjo");
    const anjoPick = anjoPicks[0]?.targetId || null;

    let deathName = null;
    if (victimId && victimId !== anjoPick) {
      const victim = players.find((p) => p.id === victimId);
      if (victim && victim.alive) {
        const { data: killedRows, error: killError } = await sb
          .from("players")
          .update({ alive: false })
          .eq("room_code", state.roomCode)
          .eq("id", victimId)
          .eq("alive", true)
          .select("id,name")
          .limit(1);

        if (killError) console.error("hostResolveNight.kill", killError);
        if (killedRows?.length) deathName = killedRows[0].name;
      }
    }

    // Só quem conseguiu alterar o jogador vivo para morto deve concluir a noite.
    // Se não houve morte, ainda usamos a mudança condicional da fase como trava.
    const updatedPlayers = await fetchPlayers(state.roomCode);
    const current = await dbGetRoom(state.roomCode);
    if (!current || current.phase !== "night") return;

    const win = checkWinner(updatedPlayers);
    const nextPhase = win ? "gameover" : "day_reveal";
    const nextWinner = win || null;
    const nextEndsAt = win
      ? null
      : new Date(Date.now() + DAY_REVEAL_SECONDS * 1000).toISOString();

    const logLine = deathName
      ? `Ao amanhecer, ${deathName} foi encontrado(a) sem vida.`
      : `A cidade acorda e, surpreendentemente, ninguém morreu esta noite.`;

    const nextLog = Array.isArray(current.log) ? current.log.slice() : [];
    if (!nextLog.includes(logLine)) nextLog.push(logLine);
    if (win) {
      const winnerLine =
        win === "cidade"
          ? "Os cidadãos descobriram e eliminaram todos os assassinos!"
          : "Os assassinos dominaram a cidade!";
      if (!nextLog.includes(winnerLine)) nextLog.push(winnerLine);
    }

    const { error: phaseError } = await sb
      .from("rooms")
      .update({
        phase: nextPhase,
        phase_ends_at: nextEndsAt,
        last_death_name: deathName,
        winner: nextWinner,
        log: nextLog,
      })
      .eq("code", state.roomCode)
      .eq("phase", "night");

    if (phaseError) console.error("hostResolveNight.phase", phaseError);
  } finally {
    state.busy = false;
    refresh();
  }
}

function checkWinner(players) {
  const alive = players.filter((p) => p.alive);
  const assassinosVivos = alive.filter((p) => p.role === "assassino").length;
  const outros = alive.length - assassinosVivos;
  if (assassinosVivos === 0) return "cidade";
  if (assassinosVivos >= outros) return "assassinos";
  return null;
}

async function advanceToNextNight() {
  const meta = await dbGetRoom(state.roomCode);
  if (!meta || meta.phase !== "day_results") return;
  const nextRound = (meta.round || 0) + 1;
  const nextLog = Array.isArray(meta.log) ? meta.log.slice() : [];
  const line = `A cidade se prepara para a rodada ${nextRound}.`;
  if (!nextLog.includes(line)) nextLog.push(line);

  const { data: updatedRoom, error } = await sb
    .from("rooms")
    .update({
      round: nextRound,
      phase: "role_reveal",
      phase_ends_at: null,
      log: nextLog,
    })
    .eq("code", state.roomCode)
    .eq("phase", "day_results")
    .select("code")
    .maybeSingle();

  if (error) {
    console.error("advanceToNextNight", error);
    return;
  }
  if (updatedRoom) await refresh();
}

async function submitVote(targetId) {
  await dbSubmitVote(
    state.roomCode,
    state.room.round,
    state.playerId,
    targetId,
  );
  state.selectedTarget = targetId;
  render();

  // A votação termina imediatamente quando todos os jogadores vivos votaram.
  await resolveVotesIfEveryoneVoted();
}

async function resolveVotesIfEveryoneVoted() {
  const meta = await dbGetRoom(state.roomCode);
  if (!meta || meta.phase !== "day_voting") return;

  const players = await fetchPlayers(state.roomCode);
  const aliveIds = new Set(
    (players || []).filter((p) => p.alive).map((p) => p.id),
  );
  if (!aliveIds.size) return;

  const votes = await dbGetVotes(state.roomCode, meta.round);
  const votedIds = new Set(
    votes.filter((v) => aliveIds.has(v.voterId)).map((v) => v.voterId),
  );

  if (votedIds.size >= aliveIds.size) {
    await autoResolveVotes();
  }
}

async function autoResolveVotes() {
  if (state.busy || !state.room || state.room.phase !== "day_voting") return;

  state.autoResolvingVotes = true;
  try {
    await hostResolveVotes();
  } finally {
    state.autoResolvingVotes = false;
  }
}

async function hostResolveVotes() {
  if (state.busy && !state.autoResolvingVotes) return;
  state.busy = true;

  try {
    const before = await dbGetRoom(state.roomCode);
    if (!before || before.phase !== "day_voting") return;

    const round = before.round;
    const players = await fetchPlayers(state.roomCode);
    const votes = await dbGetVotes(state.roomCode, round);
    const alivePlayers = players.filter((p) => p.alive);
    const aliveIds = new Set(alivePlayers.map((p) => p.id));

    // Cada jogador vivo tem um voto. Se não votou, seu voto conta como Pular.
    const voteByPlayer = new Map(
      votes
        .filter((v) => aliveIds.has(v.voterId))
        .map((v) => [v.voterId, v.targetId]),
    );

    const counts = { abstain: 0 };
    alivePlayers.forEach((player) => {
      const targetId = voteByPlayer.get(player.id) || "abstain";
      counts[targetId] = (counts[targetId] || 0) + 1;
    });

    let eliminatedName = null;
    const t = tally(counts);
    // Pular só vence se tiver a maior quantidade de votos. Em empate, ninguém é eliminado.
    if (t.winner && t.winner !== "abstain") {
      const p = players.find((pl) => pl.id === t.winner);
      if (p && p.alive) {
        const { data: eliminatedRows, error: eliminateError } = await sb
          .from("players")
          .update({ alive: false })
          .eq("room_code", state.roomCode)
          .eq("id", p.id)
          .eq("alive", true)
          .select("id,name")
          .limit(1);
        if (eliminateError)
          console.error("hostResolveVotes.eliminate", eliminateError);
        if (eliminatedRows?.length) eliminatedName = eliminatedRows[0].name;
      }
    }

    const updatedPlayers = await fetchPlayers(state.roomCode);
    const current = await dbGetRoom(state.roomCode);
    if (!current || current.phase !== "day_voting") return;

    const win = checkWinner(updatedPlayers);
    const nextPhase = win ? "gameover" : "day_results";
    const nextEndsAt = win
      ? null
      : new Date(Date.now() + DAY_RESULTS_SECONDS * 1000).toISOString();
    const logLine = eliminatedName
      ? `A cidade votou e eliminou ${eliminatedName}.`
      : t.winner === "abstain"
        ? `A maioria escolheu Pular — ninguém foi eliminado.`
        : `Os votos empataram — ninguém foi eliminado.`;

    const nextLog = Array.isArray(current.log) ? current.log.slice() : [];
    if (!nextLog.includes(logLine)) nextLog.push(logLine);
    if (win) {
      const winnerLine =
        win === "cidade"
          ? "Os cidadãos descobriram e eliminaram todos os assassinos!"
          : "Os assassinos dominaram a cidade!";
      if (!nextLog.includes(winnerLine)) nextLog.push(winnerLine);
    }

    const { error } = await sb
      .from("rooms")
      .update({
        phase: nextPhase,
        phase_ends_at: nextEndsAt,
        last_eliminated_name: eliminatedName,
        winner: win || null,
        log: nextLog,
      })
      .eq("code", state.roomCode)
      .eq("phase", "day_voting");

    if (error) console.error("hostResolveVotes.phase", error);
  } finally {
    state.busy = false;
    refresh();
  }
}
async function hostNextNight() {
  await advanceToNextNight();
}

async function hostReplayRoom() {
  if (!state.isHost || state.busy) return;

  stopGameOverCelebrationAudio();
  state.busy = true;

  const previousMeta = await dbGetRoom(state.roomCode);
  // Encerra todos os registros de investigação ativos desta partida.
  // Assim a próxima partida pode sortear uma nova história normalmente.
  await sb
    .from("game_investigations")
    .update({
      status: "finished",
      truth_revealed_at: new Date().toISOString(),
    })
    .eq("room_code", state.roomCode)
    .eq("status", "active");
  const clearedActions = await dbClearMatchActions(state.roomCode);
  if (!clearedActions) {
    state.busy = false;
    state.error =
      "Não foi possível limpar as ações da partida anterior. Tente reiniciar novamente.";
    render();
    return;
  }

  const resetPlayersOk = await dbResetPlayersForLobby(state.roomCode);
  if (!resetPlayersOk) {
    state.busy = false;
    state.error =
      "Não foi possível preparar os jogadores para uma nova partida.";
    render();
    return;
  }

  const meta = await dbGetRoom(state.roomCode);

  if (meta) {
    meta.status = "lobby";
    meta.phase = null;
    meta.round = 0;
    meta.winner = null;
    meta.lastDeathName = null;
    meta.lastEliminatedName = null;
    meta.phaseEndsAt = null;
    meta.investigationGameId = null;
    meta.revealOrder = [];
    meta.revealedTraits = [];
    meta.log = ["A sala foi reiniciada. Todos podem jogar novamente."];
    await dbUpdateRoom(state.roomCode, meta);
  }

  state.busy = false;
  state.screen = "lobby";
  state.lastPhaseSeen = null;
  state.phaseClientDeadline = null;
  state.lastDataSignature = null;
  state.selectedTarget = null;
  state.voteConfirmed = false;
  state.nightActionConfirmed = false;
  state.deathSequenceActive = false;
  state.deathSequenceRound = null;
  state.gameOverCelebrationKey = null;
  state.gameOverAudio = null;
  refresh();
}

function leaveToLanding() {
  stopPolling();
  stopGameOverCelebrationAudio();
  clearSavedSession();
  Object.assign(state, {
    screen: "landing",
    roomCode: null,
    isHost: false,
    room: null,
    players: [],
    error: "",
    busy: false,
    selectedTarget: null,
    selectedAxis: null,
    voteConfirmed: false,
    nightActionConfirmed: false,
    lastPhaseSeen: null,
    investigationItems: [],
    investigationCase: null,
    currentVotes: [],
    spectatorNightActions: [],
    showLobbySettings: false,
    deathSequenceActive: false,
    deathSequenceRound: null,
    gameOverCelebrationKey: null,
    gameOverAudio: null,
  });
  render();
}

/* ============ rendering ============ */
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function skylineSvg() {
  return `<svg class="skyline-svg" viewBox="0 0 400 220" preserveAspectRatio="xMidYEnd slice" aria-hidden="true">
    <defs>
      <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f6d48a" stop-opacity=".9"/>
        <stop offset="1" stop-color="#f0b429" stop-opacity=".05"/>
      </linearGradient>
    </defs>
    <circle cx="200" cy="58" r="28" fill="#f6d48a"/>
    <circle cx="188" cy="50" r="22" fill="#141a48"/>
    <g fill="#0b1028">
      <rect x="0" y="128" width="38" height="92"/>
      <rect x="36" y="108" width="42" height="112"/>
      <rect x="78" y="92" width="36" height="128"/>
      <rect x="112" y="118" width="48" height="102"/>
      <rect x="156" y="84" width="28" height="136"/>
      <polygon points="184,84 198,52 212,84"/>
      <rect x="210" y="100" width="54" height="120"/>
      <rect x="262" y="74" width="32" height="146"/>
      <rect x="292" y="112" width="46" height="108"/>
      <rect x="336" y="90" width="64" height="130"/>
    </g>
    <g fill="#f4c056" opacity=".75">
      <rect x="46" y="120" width="4" height="6"/><rect x="56" y="132" width="4" height="6"/>
      <rect x="86" y="108" width="4" height="6"/><rect x="96" y="124" width="4" height="6"/>
      <rect x="168" y="110" width="4" height="6"/><rect x="222" y="118" width="4" height="6"/>
      <rect x="236" y="136" width="4" height="6"/><rect x="270" y="96" width="4" height="6"/>
      <rect x="348" y="108" width="4" height="6"/><rect x="362" y="128" width="4" height="6"/>
    </g>
    <rect x="0" y="200" width="400" height="20" fill="#080c22"/>
  </svg>`;
}
function moonSvg(size = 44) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 6C20 8 13 17 13 27c0 11 9 20 20 20 5 0 9.5-1.8 13-4.8C40.5 45 33.7 48 26 48 12.7 48 2 37.3 2 24S12.7 0 26 0c1.4 0 2.7.1 4 .3-1.4 1.7-2 3.7 0 5.7z" fill="#f2c078" transform="translate(4,0) scale(0.85)"/>
  </svg>`;
}

function chromeHeader(right = "") {
  return `<div class="cd-header"><div class="cd-logo">${moonSvg(18)} CIDADE DORME</div><div class="cd-meta">${right}</div></div>`;
}
function sunSvg(size = 44) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="11" fill="#e8a54b"/>
    <g stroke="#e8a54b" stroke-width="3" stroke-linecap="round">
      <line x1="24" y1="2" x2="24" y2="8"/><line x1="24" y1="40" x2="24" y2="46"/>
      <line x1="2" y1="24" x2="8" y2="24"/><line x1="40" y1="24" x2="46" y2="24"/>
      <line x1="8" y1="8" x2="12.5" y2="12.5"/><line x1="35.5" y1="35.5" x2="40" y2="40"/>
      <line x1="40" y1="8" x2="35.5" y2="12.5"/><line x1="12.5" y1="35.5" x2="8" y2="40"/>
    </g>
  </svg>`;
}

function renderStars() {
  const c = document.getElementById("stars");
  if (c.childElementCount) return;
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("div");
    s.className = "star";
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 70 + "%";
    s.style.animationDelay = Math.random() * 4 + "s";
    c.appendChild(s);
  }
}

function render() {
  renderStars();
  const app = document.getElementById("app");
  app.innerHTML = "";
  let node;
  if (state.screen === "landing") node = renderLanding();
  else if (state.screen === "create") node = renderCreate();
  else if (state.screen === "join") node = renderJoin();
  else if (state.screen === "lobby") node = renderLobby();
  else if (state.screen === "game") node = renderGame();
  app.appendChild(node);
}

function renderLanding() {
  const wrap = el(`<div class="wrap">
    <div class="skyline-hero">
      <div class="hero-copy">
        <h1>CIDADE<br>DORME</h1>
        <p class="hero-kicker">Estratégia, conversa e dedução em uma cidade que nunca dorme.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="btn-create">Criar sala</button>
          <button class="btn btn-ghost" id="btn-join">Entrar na sala</button>
        </div>
        <p class="error-msg">${esc(state.error || (!sb ? "Falha ao carregar o jogo. Recarregue a página." : ""))}</p>
        <p class="hero-foot">Mesmas pessoas. Novas histórias.</p>
      </div>
    </div>
  </div>`);
  wrap.querySelector("#btn-create").onclick = () => {
    state.screen = "create";
    state.error = "";
    render();
  };
  wrap.querySelector("#btn-join").onclick = () => {
    state.screen = "join";
    state.error = "";
    render();
  };
  return wrap;
}

function renderCreate() {
  const wrap = el(`<div class="wrap">
    ${chromeHeader()}
    <button class="link-btn" id="btn-back">← Voltar</button>
    <div class="card" style="margin-top:8px;">
      <h2>Criar sala</h2>
      <div class="field" style="margin-top:16px;">
        <label for="in-name">Seu nome</label>
        <input id="in-name" maxlength="18" placeholder="Digite seu nome" autocomplete="off">
      </div>
      <button class="btn btn-primary" id="btn-go">Criar sala</button>
      <p class="footnote">Um código será gerado automaticamente.</p>
      <p class="error-msg">${esc(state.error)}</p>
    </div>
  </div>`);
  const input = wrap.querySelector("#in-name");
  wrap.querySelector("#btn-go").onclick = async () => {
    const name = input.value.trim();
    if (!name) {
      state.error = "Digite um nome.";
      render();
      return;
    }
    state.error = "";
    await createRoom(name);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") wrap.querySelector("#btn-go").click();
  });
  wrap.querySelector("#btn-back").onclick = () => {
    state.screen = "landing";
    render();
  };
  return wrap;
}

function renderJoin() {
  const wrap = el(`<div class="wrap">
    ${chromeHeader()}
    <button class="link-btn" id="btn-back2">← Voltar</button>
    <div class="card" style="margin-top:8px;">
      <h2>Entrar na sala</h2>
      <div class="field" style="margin-top:16px;">
        <label for="in-code">Código da sala</label>
        <input id="in-code" class="code-input" maxlength="5" placeholder="XXXXX" autocomplete="off">
      </div>
      <div class="field">
        <label for="in-name2">Seu nome</label>
        <input id="in-name2" maxlength="18" placeholder="Seu nome" autocomplete="off">
      </div>
      <button class="btn btn-primary" id="btn-go2">Entrar na sala</button>
      <p class="error-msg">${esc(state.error)}</p>
    </div>
  </div>`);
  const codeInput = wrap.querySelector("#in-code");
  const nameInput = wrap.querySelector("#in-name2");
  wrap.querySelector("#btn-go2").onclick = async () => {
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    if (!code || !name) {
      state.error = "Preencha o código e o nome.";
      render();
      return;
    }
    await joinRoom(code, name);
  };
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") wrap.querySelector("#btn-go2").click();
  });
  wrap.querySelector("#btn-back2").onclick = () => {
    state.screen = "landing";
    render();
  };
  return wrap;
}

function renderLobby() {
  const players = state.players || [];
  const canStart = players.length >= 4 && state.isHost && !state.busy;
  const discussionSeconds = state.room?.discussionSeconds || 60;
  const votingSeconds = state.room?.votingSeconds || 45;
  const categories = normalizeTraitCategories(state.room?.traitCategories);
  const activeAxes = categories.filter((x) => DEDUCIBLE_AXES.includes(x));
  const clueValue = Math.min(
    Number(state.room?.cluesPerRound) || 1,
    Math.max(1, activeAxes.length),
  );
  const roleCounts = computeRoleCounts(players.length, state.room?.roleCounts);
  const roleConfigEnabled = players.length >= 4;

  const wrap = el(`<div class="wrap lobby-screen">
    <div class="top-bar">
      <span class="room-pill">Sala ${esc(state.roomCode || "")}</span>
      <div class="lobby-top-actions">
        <button class="link-btn" id="btn-leave">Sair</button>
      </div>
    </div>

    <div class="room-code-card">
      <p class="room-code-label">código da sala</p>
      <div class="room-code">${esc(state.roomCode || "")}</div>
      <p class="tagline">Compartilhe esse código com os outros jogadores.</p>
    </div>

    <div class="lobby-players-heading">
      <h3>Jogadores (${players.length}/${MAX_PLAYERS})</h3>
    </div>
    <div class="player-list" id="lobby-players"></div>

    ${
      players.length < 4
        ? `<p class="status-line">São necessários pelo menos 4 jogadores para começar e configurar os papéis.</p>`
        : `<p class="tagline lobby-role-summary">Com ${players.length} jogadores: ${esc(roleCountLabel(roleCounts))}.</p>`
    }

<div class="card lobby-settings-summary"> 
  <div class="lobby-settings-content">
    <div class="lobby-settings-header">
      <p class="eyebrow">CONFIGURAÇÕES</p>

      ${
        state.isHost
          ? `
        <button class="btn btn-ghost settings-summary-btn" id="btn-settings-summary">
          Editar
        </button>
      `
          : ""
      }
    </div>

    <h3>${esc(getScenarioPreset(state.room?.scenarioKey).name)}</h3>

    <div class="lobby-settings-info">
      <span>Discussão: ${formatSeconds(discussionSeconds)}</span>
      <span>Votação: ${formatSeconds(votingSeconds)}</span>
      <span>${clueValue} pista(s) por rodada</span>
    </div>

    <div class="lobby-settings-role-summary">
      Papéis: ${esc(roleCountLabel(roleCounts))}
    </div>

    <div class="lobby-settings-categories">
      Traços a serem revelados: ${categories
        .map(
          (x) => `
        <span>${esc(TRAIT_CATEGORIES[x]?.label || x)}</span>
      `,
        )
        .join("")}
    </div>
  </div>
</div>

    ${
      state.showLobbySettings && state.isHost
        ? `<div class="settings-modal-backdrop" id="settings-modal">
            <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
              <div class="settings-modal-head">
                <div>
                  <p class="eyebrow">SALA</p>
                  <h2 id="settings-title">Configurações da partida</h2>
                </div>
                <button class="settings-close" id="btn-settings-close" aria-label="Fechar">×</button>
              </div>

              <div class="field role-settings-field">
                <label>Distribuição de papéis</label>
                ${
                  roleConfigEnabled
                    ? `<div class="role-settings-grid">
                        <label class="role-setting-item">
                          <span>Assassinos</span>
                          <select id="role-count-assassino">${Array.from({ length: players.length }, (_, i) => i + 1)
                            .map((v) => `<option value="${v}" ${roleCounts.assassino === v ? "selected" : ""}>${v}</option>`)
                            .join("")}</select>
                        </label>
                        <label class="role-setting-item">
                          <span>Detetives</span>
                          <select id="role-count-detetive">${Array.from({ length: players.length }, (_, i) => i)
                            .map((v) => `<option value="${v}" ${roleCounts.detetive === v ? "selected" : ""}>${v}</option>`)
                            .join("")}</select>
                        </label>
                        <label class="role-setting-item">
                          <span>Anjos</span>
                          <select id="role-count-anjo">${Array.from({ length: players.length }, (_, i) => i)
                            .map((v) => `<option value="${v}" ${roleCounts.anjo === v ? "selected" : ""}>${v}</option>`)
                            .join("")}</select>
                        </label>
                        <div class="role-setting-item role-setting-readonly">
                          <span>Cidadãos</span>
                          <strong id="role-count-cidadao">${roleCounts.cidadao}</strong>
                        </div>
                      </div>
                      <p class="footnote">Disponível com 4 ou mais jogadores. Os cidadãos são calculados automaticamente. Deve sobrar pelo menos 1 cidadão.</p>`
                    : `<div class="role-settings-disabled">Entre pelo menos 4 jogadores para configurar a quantidade de cada papel.</div>`
                }
              </div>

              <div class="field">
                <label for="discussion-time">Tempo de discussão</label>
                <select id="discussion-time">
                  ${[15, 30, 45, 60, 90, 120, 180]
                    .map(
                      (v) =>
                        `<option value="${v}" ${Number(discussionSeconds) === v ? "selected" : ""}>${v} segundos</option>`,
                    )
                    .join("")}
                </select>
              </div>

              <div class="field">
                <label for="voting-time">Tempo de votação</label>
                <select id="voting-time">
                  ${[15, 30, 45, 60, 90, 120]
                    .map(
                      (v) =>
                        `<option value="${v}" ${Number(votingSeconds) === v ? "selected" : ""}>${v} segundos</option>`,
                    )
                    .join("")}
                </select>
              </div>

              <div class="field">
                <label for="scenario-select">Cenário</label>
                <select id="scenario-select">
                  ${Object.entries(SCENARIO_PRESETS)
                    .map(
                      ([key, scenario]) =>
                        `<option value="${key}" ${state.room?.scenarioKey === key ? "selected" : ""}>${esc(scenario.name)}</option>`,
                    )
                    .join("")}
                </select>
                <p class="footnote" id="scenario-description">${esc(getScenarioPreset(state.room?.scenarioKey).description)}</p>
              </div>

              <div class="field">
                <label>Informações ativas</label>
                <div class="settings-check-grid">
                  ${Object.entries(TRAIT_CATEGORIES)
                    .map(
                      ([key, info]) =>
                        `<label class="settings-check">
                      <input type="checkbox" class="trait-category" value="${key}" ${categories.includes(key) ? "checked" : ""}>
                      <span>${esc(info.label)}</span>
                    </label>`,
                    )
                    .join("")}
                </div>
                <p class="footnote">Local, objeto e vestimenta são dedutíveis. Intenção é narrativa. Testemunha fornece uma informação vista por outro jogador.</p>
              </div>

              <div class="field">
                <label for="clues-per-round">Traços revelados por rodada</label>
                <input id="clues-per-round" type="number" min="1" max="${Math.max(1, activeAxes.length)}" value="${clueValue}">
                <p class="footnote">A primeira rodada não revela pista do assassino. A partir da segunda, entra a quantidade definida aqui por rodada.</p>
              </div>

              <div class="settings-modal-actions">
                <button class="btn btn-ghost" id="btn-settings-cancel">Cancelar</button>
                <button class="btn btn-primary" id="btn-settings-save">Salvar configurações</button>
              </div>
              <p class="error-msg">${esc(state.error)}</p>
            </div>
          </div>`
        : ""
    }

    <hr class="divider">

    ${
      state.isHost
        ? `<button class="btn btn-primary" id="btn-start" ${canStart ? "" : "disabled"}>${state.busy ? "Iniciando..." : "Iniciar jogo"}</button>`
        : `<p class="waiting-block">Aguardando o anfitrião iniciar o jogo...</p>`
    }
    <p class="error-msg">${esc(state.error)}</p>
  </div>`);

  const list = wrap.querySelector("#lobby-players");
  players.forEach((p, i) => {
    const chip = el(
      `<div class="player-chip">
        <span class="num-badge">${i + 1}</span>
        <span>${esc(p.name)}</span>
      </div>`,
    );
    if (p.id === state.playerId) {
      chip.appendChild(el(`<span class="you-tag">VOCÊ</span>`));
    } else if (state.room && p.id === state.room.hostId) {
      chip.appendChild(el(`<span class="host-tag">anfitrião</span>`));
    }
    list.appendChild(chip);
  });

  wrap.querySelector("#btn-leave").onclick = leaveToLanding;
  const startBtn = wrap.querySelector("#btn-start");
  if (startBtn) startBtn.onclick = hostStartGame;

  const openSettings = () => {
    if (!state.isHost) return;
    state.error = "";
    state.showLobbySettings = true;
    render();
  };

  const settingsBtn = wrap.querySelector("#btn-settings");
  const settingsSummaryBtn = wrap.querySelector("#btn-settings-summary");
  if (settingsBtn) settingsBtn.onclick = openSettings;
  if (settingsSummaryBtn) settingsSummaryBtn.onclick = openSettings;

  if (state.showLobbySettings && state.isHost) {
    const modal = wrap.querySelector("#settings-modal");
    const closeSettings = () => {
      state.showLobbySettings = false;
      state.error = "";
      render();
    };

    wrap.querySelector("#btn-settings-close").onclick = closeSettings;
    wrap.querySelector("#btn-settings-cancel").onclick = closeSettings;
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeSettings();
    });

    const discussionSelect = wrap.querySelector("#discussion-time");
    const votingSelect = wrap.querySelector("#voting-time");
    const assassinCountSelect = wrap.querySelector("#role-count-assassino");
    const detectiveCountSelect = wrap.querySelector("#role-count-detetive");
    const angelCountSelect = wrap.querySelector("#role-count-anjo");
    const citizenCountDisplay = wrap.querySelector("#role-count-cidadao");
    const scenarioSelect = wrap.querySelector("#scenario-select");
    const clueInput = wrap.querySelector("#clues-per-round");
    const categoryChecks = [...wrap.querySelectorAll(".trait-category")];

    const updateRoleCount = () => {
      if (!assassinCountSelect || !detectiveCountSelect || !angelCountSelect) return;
      const assassino = Math.max(1, Number(assassinCountSelect.value) || 1);
      const detetive = Math.max(0, Number(detectiveCountSelect.value) || 0);
      const anjo = Math.max(0, Number(angelCountSelect.value) || 0);
      const totalSpecial = assassino + detetive + anjo;
      const maxSpecial = Math.max(1, players.length - 1);

      if (totalSpecial > maxSpecial) {
        const excess = totalSpecial - maxSpecial;
        const values = [
          [angelCountSelect, anjo],
          [detectiveCountSelect, detetive],
          [assassinCountSelect, assassino - 1],
        ];
        let left = excess;
        for (const [select, value] of values) {
          if (!left) break;
          const min = select === assassinCountSelect ? 1 : 0;
          const reduction = Math.min(left, Math.max(0, value - min));
          select.value = String(value - reduction);
          left -= reduction;
        }
      }

      const currentTotal =
        Number(assassinCountSelect.value) +
        Number(detectiveCountSelect.value) +
        Number(angelCountSelect.value);
      if (citizenCountDisplay) citizenCountDisplay.textContent = String(Math.max(0, players.length - currentTotal));
    };

    [assassinCountSelect, detectiveCountSelect, angelCountSelect].forEach((input) => {
      if (input) input.onchange = updateRoleCount;
    });
    updateRoleCount();

    const updateClueLimit = () => {
      const axesCount = categoryChecks.filter(
        (c) => c.checked && DEDUCIBLE_AXES.includes(c.value),
      ).length;
      if (!axesCount) {
        const local = categoryChecks.find((c) => c.value === "local");
        if (local) local.checked = true;
      }
      const max = Math.max(
        1,
        categoryChecks.filter(
          (c) => c.checked && DEDUCIBLE_AXES.includes(c.value),
        ).length,
      );
      clueInput.max = String(max);
      if (Number(clueInput.value) > max) clueInput.value = String(max);
    };

    categoryChecks.forEach((input) => {
      input.onchange = updateClueLimit;
    });

    scenarioSelect.onchange = () => {
      const scenario = getScenarioPreset(scenarioSelect.value);
      const description = wrap.querySelector("#scenario-description");
      if (description) description.textContent = scenario.description;
    };

    wrap.querySelector("#btn-settings-save").onclick = async () => {
      if (state.busy) return;
      updateClueLimit();
      const selected = categoryChecks
        .filter((c) => c.checked)
        .map((c) => c.value);
      const roleCountsToSave = {
        assassino: assassinCountSelect ? Number(assassinCountSelect.value) : roleCounts.assassino,
        detetive: detectiveCountSelect ? Number(detectiveCountSelect.value) : roleCounts.detetive,
        anjo: angelCountSelect ? Number(angelCountSelect.value) : roleCounts.anjo,
      };
      const ok = await updateRoomSettings(
        discussionSelect.value,
        votingSelect.value,
        scenarioSelect.value,
        selected,
        clueInput.value,
        roleCountsToSave,
      );
      if (ok !== false) {
        state.showLobbySettings = false;
        state.error = "";
        render();
      }
    };
  }

  return wrap;
}
function myPlayer() {
  return (state.players || []).find((p) => p.id === state.playerId) || null;
}

function renderGame() {
  const meta = state.room;
  if (!meta) return el(`<div class="wrap"><p>Carregando...</p></div>`);
  if (meta.phase === "gameover") return renderGameOver();
  const me = myPlayer();
  if (!me) return el(`<div class="wrap"><p>Carregando jogador...</p></div>`);

  // A morte do próprio jogador acontece por cima da fase atual.
  // Depois da animação, o render normal continua e ele vira espectador.
  if (state.deathSequenceActive) {
    return renderDeathSequence(me);
  }

  // A tela "Você morreu" é exclusiva da sequência imediata da morte.
  // Depois dela, o jogador morto continua vendo a mesma fase que os demais,
  // apenas com o marcador de fantasma.
  if (meta.phase === "role_reveal") {
    const screen = renderRoleReveal(meta, me);
    if (!me.alive) screen.appendChild(renderGhostIndicator());
    return screen;
  }
  if (meta.phase === "night_transition") {
    const screen = renderNightTransition(meta, me);
    if (!me.alive) screen.appendChild(renderGhostIndicator());
    return screen;
  }

  const wrap = el(
    `<div class="wrap ${!me.alive ? "dead-player-view" : ""}"></div>`,
  );
  wrap.appendChild(
    el(`<div class="top-bar">
    <span class="room-pill">Sala ${esc(state.roomCode)} · Rodada ${meta.round}</span>
    <button class="link-btn" id="btn-leave">Sair</button>
  </div>`),
  );
  wrap.querySelector("#btn-leave").onclick = leaveToLanding;

  const isNight = meta.phase === "night";
  // A própria tela de discussão já possui seu cabeçalho "FASE DE DISCUSSÃO".
  // Não renderizamos o banner global nessa fase para evitar dois blocos
  // visualmente repetidos.
  if (meta.phase !== "day_discussion") {
    const banner = el(`<div class="phase-banner ${isNight ? "night" : "day"}">
      ${isNight ? moonSvg(38) : sunSvg(38)}
      <div>
        <div class="phase-title">${phaseTitle(meta.phase)}</div>
        <div class="phase-sub">${phaseSubtitle(meta, me)}</div>
      </div>
    </div>`);
    wrap.appendChild(banner);
  }

  if (!me.alive) {
    wrap.appendChild(renderGhostIndicator());
    if (meta.phase === "night") {
      wrap.appendChild(renderSpectatorNight(meta, me));
    } else if (meta.phase === "day_reveal") {
      wrap.appendChild(renderDayReveal(meta, me));
    } else if (meta.phase === "day_discussion") {
      wrap.appendChild(renderDiscussion(meta, me, true));
    } else if (meta.phase === "day_voting") {
      wrap.appendChild(renderVoting(meta, me, true));
    } else if (meta.phase === "day_results") {
      wrap.appendChild(renderDayResults(meta, me, true));
    }
  } else if (meta.phase === "night") {
    wrap.appendChild(renderNightPanel(meta, me));
  } else if (meta.phase === "day_reveal") {
    wrap.appendChild(renderDayReveal(meta, me));
  } else if (meta.phase === "day_discussion") {
    wrap.appendChild(renderDiscussion(meta, me));
  } else if (meta.phase === "day_voting") {
    wrap.appendChild(renderVoting(meta, me));
  } else if (meta.phase === "day_results") {
    wrap.appendChild(renderDayResults(meta, me));
  }

  wrap.appendChild(renderRosterCollapsed());
  wrap.appendChild(renderLog(meta));
  return wrap;
}

function phaseTitle(phase) {
  return (
    {
      role_reveal: "Revelando seu papel",
      night_transition: "A noite chega...",
      night: "A cidade dorme",
      day_reveal: "O amanhecer",
      day_discussion: "Discussão",
      day_voting: "Votação",
      day_results: "Resultado da votação",
    }[phase] || ""
  );
}
function phaseSubtitle(meta, me) {
  if (meta.phase === "role_reveal")
    return "Memorize seu papel. A noite está chegando...";
  if (meta.phase === "night_transition")
    return "A noite chega... cidade dorme.";
  if (meta.phase === "night")
    return me.alive
      ? "Aja em silêncio, se seu papel permitir."
      : "Você está observando desta rodada.";
  if (meta.phase === "day_reveal")
    return "Veja o que aconteceu durante a noite.";
  if (meta.phase === "day_discussion")
    return "Conversem e tentem descobrir quem são os assassinos.";
  if (meta.phase === "day_voting")
    return "Escolha em quem votar para eliminar.";
  if (meta.phase === "day_results")
    return "Veja quem a cidade decidiu eliminar.";
  return "";
}

/* ============ sons e transição da noite ============ */
function getAudioContext() {
  if (!state.audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    state.audioContext = new AudioCtx();
  }
  return state.audioContext;
}

async function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") await ctx.resume();
    state.audioUnlocked = ctx.state === "running";
  } catch (error) {
    console.warn("Áudio indisponível:", error);
  }
}

function getNightAudio(name) {
  const audio = new Audio(AUDIO_ASSETS[name]);
  audio.preload = "auto";
  audio.volume = name === "bell" ? 0.72 : 0.62;
  return audio;
}

async function playNightSounds() {
  if (state.lastNightTransitionRound === state.room?.round) return;
  state.lastNightTransitionRound = state.room?.round ?? null;

  const bell = getNightAudio("bell");
  const owl = getNightAudio("owl");

  try {
    // O sino começa praticamente junto com a chegada das nuvens.
    await bell.play();
  } catch (error) {
    console.warn("Não foi possível reproduzir o sino:", error);
  }

  // O arquivo da coruja entra depois do sino, criando a sensação de meia-noite.
  // O atraso é intencional e não depende da duração exata do arquivo do sino.
  window.setTimeout(async () => {
    try {
      await owl.play();
    } catch (error) {
      console.warn("Não foi possível reproduzir a coruja:", error);
    }
  }, 4200);
}

function renderNightTransition(meta, me = null) {
  const transitionTotalMs = NIGHT_TRANSITION_SECONDS * 1000;
  const remainingMs = getPhaseRemainingMs(meta);
  const elapsedMs = Math.min(
    transitionTotalMs,
    Math.max(0, transitionTotalMs - remainingMs),
  );

  const wrap =
    el(`<div class="night-transition-screen" aria-live="polite" style="--transition-elapsed:${elapsedMs}ms;">
    <div class="night-cloud cloud-a"></div>
    <div class="night-cloud cloud-b"></div>
    <div class="night-cloud cloud-c"></div>
    <div class="night-cloud cloud-d"></div>
    <div class="night-cloud cloud-e"></div>
    <div class="night-transition-content">
      <div class="transition-moon">${moonSvg(72)}</div>
      <p class="transition-eyebrow">MEIA-NOITE</p>
      <h1>A noite chega...</h1>
      <p>cidade dorme</p>
    </div>
  </div>`);

  playNightSounds();
  return wrap;
}

function renderInvestigationItemsHtml(me, meta) {
  const items = state.investigationItems || [];
  if (!items.length) return "";
  const title =
    me.role === "detetive" ? "🔎 Seus traços" : "📜 Suas informações";
  return `<div class="investigation-private-info"><div class="investigation-private-title">${title}</div><ol>${items.map((item) => `<li>${esc(item.text_snapshot)}</li>`).join("")}</ol><small>Todos os traços mostrados são verdadeiros. A mentira só pode existir no que os jogadores contam.</small></div>`;
}

function updateReadyCountDisplay(players, round) {
  const readyCount = document.querySelector("#ready-count");
  if (!readyCount) return;

  const participants = (players || []).filter((p) => p.alive);
  const ready = participants.filter(
    (p) => Number(p.readyRound || 0) === Number(round),
  ).length;
  const total = participants.length;

  readyCount.textContent = total
    ? `${ready}/${total} jogadores prontos`
    : "Aguardando jogadores...";
}

function renderRoundTraitRevealHtml(meta) {
  const revealed = Array.isArray(meta.revealedTraits)
    ? meta.revealedTraits
    : [];
  const cluesPerRound = Math.max(1, Number(meta.cluesPerRound) || 1);
  const round = Number(meta.round) || 1;
  const current =
    round > 1
      ? revealed.slice(Math.max(0, revealed.length - cluesPerRound))
      : [];

  if (!current.length) {
    return `<div class="investigation-private-info round-trait-reveal"><div class="investigation-private-title">Nenhuma nova informação nesta rodada.</div></div>`;
  }

  return `<div class="investigation-private-info round-trait-reveal">
    <div class="investigation-private-title">🔎 Nova informação sobre o assassino</div>
    <ol>${current
      .map((item) => {
        const label = TRAIT_CATEGORIES[item.axis]?.label || item.axis;
        return `<li><strong>${esc(label)}:</strong> ${esc(item.value)}</li>`;
      })
      .join("")}</ol>
    <small>Essa informação é verdadeira e fica disponível para todos.</small>
  </div>`;
}

function renderRoleReveal(meta, me) {
  const firstRound = Number(meta.round || 1) === 1;
  const info = ROLE_INFO[me.role] || ROLE_INFO.cidadao;
  const image = ROLE_IMAGES[me.role] || ROLE_IMAGES.cidadao;
  const card = el(`<div class="card role-reveal-screen">
    <div class="role-reveal-visual cinematic-role-card">
      <p class="eyebrow">CIDADE DORME</p>
      <h2 class="reveal-heading">${firstRound ? "Revelando seu papel..." : `Informações da rodada ${meta.round}`}</h2>
      ${
        firstRound
          ? `
        <div class="role-image-frame cinematic-role-image"><img src="${image}" alt="${esc(info.name)}" class="role-image"></div>
        <p class="role-you">Você é</p>
        <h1 class="role-name role-${esc(me.role)}">${esc(info.name)}</h1>
        <p class="tagline role-description">${esc(info.desc)}</p>
      `
          : `
        <p class="tagline role-description">Seu papel já foi revelado. Confira novamente apenas suas informações da investigação.</p>
      `
      }
      ${firstRound ? renderInvestigationItemsHtml(me, meta) : renderRoundTraitRevealHtml(meta)}
      <div class="ready-status" id="ready-status">
        ${Number(me.readyRound || 0) === Number(meta.round) ? "Você já confirmou que está pronto." : "Leia suas informações antes de confirmar."}
      </div>
      <button class="btn btn-primary" id="btn-ready" ${Number(me.readyRound || 0) === Number(meta.round) ? "disabled" : ""}>${Number(me.readyRound || 0) === Number(meta.round) ? "✓ Pronto" : "Li tudo — estou pronto"}</button>
      <p class="footnote" id="ready-count">Carregando jogadores prontos...</p>
    </div>
  </div>`);

  const readyButton = card.querySelector("#btn-ready");

  const updateReadyCount = () => {
    updateReadyCountDisplay(state.players, meta.round);
  };

  if (readyButton && Number(me.readyRound || 0) !== Number(meta.round)) {
    readyButton.onclick = async () => {
      readyButton.disabled = true;
      const ok = await dbMarkReady(state.roomCode, me.id, meta.round);
      if (ok) {
        readyButton.textContent = "✓ Pronto";
        card.querySelector("#ready-status").textContent =
          "Você já confirmou que está pronto.";
        updateReadyCount();
      } else {
        readyButton.disabled = false;
      }
    };
  }
  updateReadyCount();
  return card;
}

function renderGhostIndicator() {
  return el(`<div class="ghost-indicator" aria-label="Você está morto e acompanhando a partida">
    <span class="ghost-symbol">👻</span>
    <span>ESPECTADOR — VOCÊ ESTÁ MORTO</span>
  </div>`);
}

function renderSpectator(meta, me) {
  return el(`<div class="card death-banner death-screen-cinematic">
    <div class="death-screen-glow"></div>
    ${skullSvg(58)}
    <h2>Você morreu</h2>
    <p>Você foi eliminado(a) da partida.</p>
    <p style="margin-top:8px;color:var(--ui-muted);">Seu papel era <strong>${esc(ROLE_INFO[me.role]?.name || "não identificado")}</strong>.</p>
    <p style="margin-top:8px;color:var(--ui-muted);">Acompanhe a partida como um fantasma até o fim.</p>
  </div>`);
}

function renderSpectatorNight(meta, me) {
  const players = (state.players || []).filter((p) => p.alive);
  const actions = state.spectatorNightActions || [];
  const actionByPlayer = new Map(actions.map((a) => [a.playerId, a]));

  const card = el(`<div class="card spectator-night-card">
    <div class="discussion-head">
      ${moonSvg(42)}
      <div><p class="eyebrow">FASE DAS AÇÕES</p><h2>Você observa a cidade.</h2></div>
    </div>
    <p class="tagline">Como fantasma, você pode acompanhar as ações noturnas em tempo real.</p>
    <div class="spectator-action-list" id="spectator-actions"></div>
  </div>`);

  const list = card.querySelector("#spectator-actions");
  players.forEach((p) => {
    const action = actionByPlayer.get(p.id);
    let text = "aguardando ação";
    let tone = "waiting";

    if (action) {
      const target =
        players.find((x) => x.id === action.targetId) ||
        (state.players || []).find((x) => x.id === action.targetId);
      const targetName = target?.name || "alguém";

      if (action.role === "detetive") {
        const axis = action.targetAxis
          ? TRAIT_CATEGORIES[action.targetAxis]?.label || action.targetAxis
          : "traço";
        text = `investigou ${targetName} — ${axis}`;
      } else if (action.role === "anjo") {
        text = `protegeu ${targetName}`;
      } else if (action.role === "assassino") {
        text = `atacou ${targetName}`;
      } else {
        text = "realizou sua ação";
      }
      tone = "done";
    }

    const roleName = ROLE_INFO[p.role]?.name || p.role;
    const row = el(`<div class="spectator-action-row ${tone}">
      ${playerAvatar(p.name)}
      <div class="spectator-action-main">
        <strong>${esc(p.name)}</strong>
        <span>${esc(roleName)}</span>
      </div>
      <span class="spectator-action-dot" aria-hidden="true"></span>
      <div class="spectator-action-text">${esc(text)}</div>
    </div>`);
    list.appendChild(row);
  });

  return card;
}

function roleAvatar(role, className = "role-avatar") {
  const src = ROLE_IMAGES[role] || ROLE_IMAGES.cidadao;
  const alt = ROLE_INFO[role]?.name || "Papel";
  return `<img src="${src}" alt="${esc(alt)}" class="${className}">`;
}

function playerAvatar(name, className = "player-avatar") {
  const initials =
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase() || "?";
  return `<span class="${className}">${esc(initials)}</span>`;
}

function roleActionIcon(role, size = 46) {
  const stroke =
    role === "assassino" ? "#e85b65" : role === "anjo" ? "#f2c078" : "#8ec7ff";
  const paths = {
    assassino: `<path d="M11 37 28 20"/><path d="m26 12 10 10"/><path d="M21 27 12 36"/><path d="M31 9c3 0 6 2 8 5"/>`,
    detetive: `<circle cx="22" cy="22" r="12"/><path d="m31 31 9 9"/>`,
    anjo: `<path d="M24 38V16"/><path d="M24 16c-7-7-16-4-17 3 0 7 8 10 17 13"/><path d="M24 16c7-7 16-4 17 3 0 7-8 10-17 13"/>`,
    cidadao: `<circle cx="24" cy="17" r="7"/><path d="M11 40c1-9 7-13 13-13s12 4 13 13"/>`,
  };
  return `<svg class="role-action-icon" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[role] || paths.cidadao}</svg>`;
}

function aliveOthers(playerId) {
  return (state.players || []).filter((p) => p.alive && p.id !== playerId);
}

function renderNightPanel(meta, me) {
  const shouldAnimate =
    state.nightEnteredAt && Date.now() - state.nightEnteredAt < 1400;
  const card = el(
    `<div class="card night-action-card${shouldAnimate ? " night-action-enter" : ""}"></div>`,
  );
  if (me.role === "cidadao") {
    card.innerHTML = `${roleAvatar("cidadao")}<div><p class="eyebrow">NOITE — SUA VEZ DE OBSERVAR</p><h2>Você é o Cidadão</h2><p>Você não tem ação nesta noite. Observe em silêncio.</p></div>`;
    return card;
  }

  const headings = {
    assassino: ["Escolha uma vítima", "Escolha uma pessoa para eliminar."],
    anjo: ["Escolha quem proteger", "Escolha uma pessoa para proteger."],
    detetive: [
      "Escolha uma pessoa",
      "Clique em um nome para escolher qual traço investigar.",
    ],
  };
  const [title, subtitle] = headings[me.role] || headings.cidadao;
  const targets =
    me.role === "assassino"
      ? aliveOthers(me.id).filter((p) => p.role !== "assassino")
      : me.role === "detetive"
        ? aliveOthers(me.id)
        : (state.players || []).filter((p) => p.alive);

  const box = el(`<div>
    <div class="night-role-header">
      ${roleAvatar(me.role)}
      <div><p class="eyebrow">NOITE — SUA AÇÃO</p><h2>Você é o <strong>${esc(ROLE_INFO[me.role].name)}</strong></h2></div>
    </div>
    <div class="action-heading">${roleActionIcon(me.role, 52)}<div><h3>${title}</h3><p>${subtitle}</p></div></div>
    <div class="target-grid visual-target-grid" id="night-targets"></div>
  </div>`);

  const grid = box.querySelector("#night-targets");

  targets.forEach((t) => {
    const selected = state.selectedTarget === t.id;
    const row = el(
      `<div class="action-target-row visual-target-row${selected && me.role === "detetive" ? " investigation-open-row" : ""}"></div>`,
    );
    const button = el(
      `<button class="target-btn action-target-button visual-target-button"></button>`,
    );
    button.innerHTML = `${playerAvatar(t.name)}<span>${esc(t.name)}</span>`;
    if (selected) button.classList.add("selected");
    button.disabled = state.nightActionConfirmed;

    button.onclick = () => {
      if (state.nightActionConfirmed) return;
      if (selected && me.role === "detetive") {
        state.selectedTarget = null;
        state.selectedAxis = null;
      } else {
        state.selectedTarget = t.id;
        state.selectedAxis = null;
      }
      render();
    };
    row.appendChild(button);

    if (selected && !state.nightActionConfirmed && me.role === "detetive") {
      const popover = el(`<div class="trait-investigation-popover">
        <div class="trait-popover-title">O que investigar?</div>
        <div class="trait-popover-options" id="axis-options"></div>
      </div>`);
      const options = popover.querySelector("#axis-options");

      getInvestigationAxes(meta).forEach((axis) => {
        const optionRow = el(`<div class="trait-popover-option-row"></div>`);
        const option = el(
          `<button class="trait-popover-option ${state.selectedAxis === axis ? "selected" : ""}"><span>${esc(TRAIT_CATEGORIES[axis].label)}</span></button>`,
        );
        option.onclick = () => {
          state.selectedAxis = axis;
          render();
        };
        optionRow.appendChild(option);

        if (state.selectedAxis === axis) {
          const confirm = el(
            `<button class="trait-popover-confirm" title="Confirmar investigação" aria-label="Confirmar investigação">Confirmar</button>`,
          );
          confirm.onclick = (event) => {
            event.stopPropagation();
            confirmNightAction();
          };
          optionRow.appendChild(confirm);
        }
        options.appendChild(optionRow);
      });
      row.appendChild(popover);
    }

    if (selected && !state.nightActionConfirmed && me.role !== "detetive") {
      const confirm = el(
        `<button class="action-confirm-btn" title="Confirmar ação" aria-label="Confirmar ação">✓</button>`,
      );
      confirm.onclick = confirmNightAction;
      row.appendChild(confirm);
    }

    grid.appendChild(row);
  });

  if (state.nightActionConfirmed) {
    if (me.role === "detetive") {
      const chosen = targets.find((t) => t.id === state.selectedTarget);
      const value = chosen ? traitValue(chosen, state.selectedAxis) : null;
      const label =
        TRAIT_CATEGORIES[state.selectedAxis]?.description || "Traço";
      if (chosen && value) {
        box.appendChild(
          el(
            `<div class="investigation-result"><div><strong>${esc(chosen.name)} — ${esc(label)}</strong><p>${esc(value)}</p></div></div>`,
          ),
        );
      } else if (chosen) {
        box.appendChild(
          el(
            `<div class="investigation-result"><div><strong>${esc(chosen.name)} — ${esc(label)}</strong><p>Nenhuma informação registrada.</p></div></div>`,
          ),
        );
      }
    } else {
      box.appendChild(
        el(
          `<div class="action-confirmed"><span class="confirm-check">✓</span><span>Ação confirmada.</span></div>`,
        ),
      );
    }
  }

  card.appendChild(box);
  return card;
}

function playDeathSequenceSound() {
  try {
    const audio = new Audio(AUDIO_ASSETS.death);
    audio.preload = "auto";
    audio.volume = 0.72;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_) {}
}

function renderDeathSequence(me) {
  return el(`
    <div class="death-sequence-screen">
      <div class="death-sequence-eyelid death-sequence-eyelid-top"></div>
      <div class="death-sequence-eyelid death-sequence-eyelid-bottom"></div>

      <div class="death-sequence-message">
        <div class="death-sequence-skull">
          ${skullSvg(64)}
        </div>

        <p class="eyebrow">A NOITE TERMINOU</p>
        <h1>Você morreu</h1>
        <p>
          Seu papel era
          <strong>${esc(ROLE_INFO[me.role]?.name || "não identificado")}</strong>.
        </p>
        <p class="death-sequence-ghost">
          Agora você continuará acompanhando a cidade como um fantasma.
        </p>
      </div>
    </div>
  `);
}

function renderDayReveal(meta, me) {
  const hasDeath = Boolean(meta.lastDeathName);
  const message = hasDeath
    ? `${esc(meta.lastDeathName)} não sobreviveu à noite.`
    : "Ninguém morreu esta noite.";

  const card =
    el(`<div class="card day-event-card day-reveal-screen ${hasDeath ? "death-awakening" : ""}">
    <div class="event-icon death-icon">${hasDeath ? skullSvg(58) : sunriseSvg(58)}</div>
    <p class="eyebrow">AO AMANHECER</p>
    <h2>${message}</h2>
    <p class="tagline">${hasDeath ? "A cidade desperta lentamente para a notícia." : "A cidade desperta. Ninguém foi perdido esta noite."}</p>
    <div class="phase-mini-timer" id="day-reveal-timer">00:07</div>
  </div>`);

  attachCountdown(card.querySelector("#day-reveal-timer"), meta);
  return card;
}

function renderInvestigationPanelHtml(me) {
  const items = state.investigationItems || [];
  if (!items.length) return "";
  return `<div class="investigation-panel"><div class="investigation-panel-title">${me.role === "detetive" ? "🔎 Seus traços" : "📜 Suas informações"}</div><ol>${items.map((item) => `<li>${esc(item.text_snapshot)}</li>`).join("")}</ol><small>Informações reais da partida.</small></div>`;
}

function renderDiscussion(meta, me, spectator = false) {
  const card =
    el(`<div class="card discussion-card ${spectator ? "spectator-phase-card" : ""}">
    <div class="discussion-head">
      ${sunSvg(42)}
      <div><p class="eyebrow">FASE DE DISCUSSÃO</p><h2>Conversem e descubram os assassinos.</h2></div>
    </div>
    ${spectator ? `<div class="ghost-phase-note">👻 Você está morto, mas continua acompanhando a discussão.</div>` : ""}
    <div class="timer-panel"><span>Tempo restante</span><strong id="timer-display">--:--</strong></div>
    <p class="footnote">A discussão termina automaticamente. Depois começa a votação.</p>
  </div>`);
  attachCountdown(card.querySelector("#timer-display"), meta);
  return card;
}

function getVoteCount(targetId) {
  return (state.currentVotes || []).filter((v) => v.targetId === targetId)
    .length;
}

function voteBubblesHtml(count) {
  if (!count)
    return `<span class="vote-bubbles empty" aria-label="Nenhum voto"></span>`;
  return `<span class="vote-bubbles" aria-label="${count} voto(s)">${"👤".repeat(Math.min(count, 8))}${count > 8 ? ` +${count - 8}` : ""}</span>`;
}

function renderVoting(meta, me, spectator = false) {
  const alivePlayers = (state.players || []).filter((p) => p.alive);
  const confirmed = state.voteConfirmed;
  const selectedName =
    state.selectedTarget === "abstain"
      ? "Pular"
      : alivePlayers.find((p) => p.id === state.selectedTarget)?.name || null;

  const box =
    el(`<div class="card voting-card ${spectator ? "spectator-phase-card" : ""}">
    <div class="discussion-head">
      ${ballotSvg(42)}
      <div><p class="eyebrow">FASE DE VOTAÇÃO</p><h2>Escolha uma pessoa para votar.</h2></div>
    </div>
    ${spectator ? `<div class="ghost-phase-note">👻 Você está morto. Pode acompanhar os votos, mas não pode votar.</div>` : ""}
    <div class="timer-panel"><span>Tempo restante</span><strong id="vote-timer">--:--</strong></div>
    ${spectator ? `<p class="vote-instruction">Os bonecos mostram quantas pessoas já votaram em cada opção.</p>` : `<p class="vote-instruction">Selecione sua escolha e confirme o voto.</p>`}
    <div class="target-grid visual-target-grid" id="vote-targets"></div>
    <div class="vote-skip-row">
      <div class="target-btn skip-button ${state.selectedTarget === "abstain" ? "selected" : ""} ${spectator ? "spectator-option" : ""}">
        <span>Pular</span>${voteBubblesHtml(getVoteCount("abstain"))}
        ${!spectator && state.selectedTarget === "abstain" ? '<span class="selection-check">✓</span>' : ""}
      </div>
    </div>
    ${
      spectator
        ? ""
        : `<div class="vote-confirmation-area">
          ${selectedName ? `<div class="selected-vote-summary"><span>Escolha:</span><strong>${esc(selectedName)}</strong>${confirmed ? '<span class="confirmed-vote-check">✓ Confirmado</span>' : '<span class="pending-vote-check">✓ Selecionado</span>'}</div>` : '<div class="selected-vote-summary empty">Nenhuma escolha selecionada.</div>'}
          <button class="btn btn-primary vote-confirm-btn" id="btn-confirm-vote" ${!state.selectedTarget || confirmed ? "disabled" : ""}>${confirmed ? "✓ Voto confirmado" : "Confirmar votação"}</button>
        </div>`
    }
    <p class="footnote">A votação termina automaticamente quando todos votarem ou quando o tempo acabar. Se você não confirmar, contará como Pular ao final.</p>
  </div>`);

  const grid = box.querySelector("#vote-targets");
  alivePlayers.forEach((t) => {
    const isMe = t.id === me.id;
    if (!spectator && isMe) return;

    const count = getVoteCount(t.id);
    const b = el(
      `<button class="target-btn visual-target-button ${spectator ? "spectator-option" : ""}" ${spectator || confirmed ? "disabled" : ""}></button>`,
    );
    b.innerHTML = `<span>${esc(t.name)}</span>${voteBubblesHtml(count)}${!spectator && state.selectedTarget === t.id ? '<span class="selection-check">✓</span>' : ""}`;
    if (!spectator && state.selectedTarget === t.id)
      b.classList.add("selected");

    if (!spectator) {
      b.onclick = () => {
        if (!state.voteConfirmed) {
          state.selectedTarget = t.id;
          render();
        }
      };
    }
    grid.appendChild(b);
  });

  if (!spectator) {
    const confirmBtn = box.querySelector("#btn-confirm-vote");
    if (confirmBtn) confirmBtn.onclick = confirmVote;
  }

  attachCountdown(box.querySelector("#vote-timer"), meta);
  return box;
}

async function confirmVote() {
  if (state.voteConfirmed || !state.selectedTarget) return;
  const me = myPlayer();
  if (!me?.alive || state.room?.phase !== "day_voting") return;

  const targetId = state.selectedTarget;
  if (targetId !== "abstain") {
    const target = (state.players || []).find((p) => p.id === targetId);
    if (!target?.alive || target.id === me.id) return;
  }

  await dbSubmitVote(
    state.roomCode,
    state.room.round,
    state.playerId,
    targetId,
  );
  state.voteConfirmed = true;
  render();
  await resolveVotesIfEveryoneVoted();
}

function renderDayResults(meta, me) {
  const card = el(`<div class="card day-event-card">
    <div class="event-icon">${resultSvg(58)}</div>
    <p class="eyebrow">RESULTADO DA VOTAÇÃO</p>
    <h2>${meta.lastEliminatedName ? `${esc(meta.lastEliminatedName)} foi eliminado(a).` : "Ninguém foi eliminado."}</h2>
    <p class="tagline">O próximo ciclo começa automaticamente.</p>
    <div class="phase-mini-timer" id="day-result-timer">00:07</div>
  </div>`);
  attachCountdown(card.querySelector("#day-result-timer"), meta);
  return card;
}

function renderTruthHtml() {
  const meta = state.room;
  const scenario = getScenarioPreset(meta?.scenarioKey);
  const revealed = Array.isArray(meta?.revealedTraits)
    ? meta.revealedTraits
    : [];
  return `<div class="card truth-card"><p class="eyebrow">A VERDADE DA PARTIDA</p><h2>${esc(scenario.name)}</h2><div class="truth-facts"><h3>Traços reais revelados</h3>${revealed.length ? `<ul>${revealed.map((r) => `<li>${esc(TRAIT_CATEGORIES[r.axis]?.label || r.axis)}: ${esc(r.value)}</li>`).join("")}</ul>` : `<p class="truth-summary">Nenhum traço foi revelado antes do fim.</p>`}</div></div>`;
}

function stopGameOverCelebrationAudio() {
  try {
    if (state.gameOverAudio) {
      state.gameOverAudio.pause();
      state.gameOverAudio.currentTime = 0;
    }
  } catch (_) {}
  state.gameOverAudio = null;
}

function playGameOverCelebration(meta) {
  const key = `${state.roomCode}:${Number(meta.round) || 0}:${meta.winner || "unknown"}`;
  if (state.gameOverCelebrationKey === key) return;

  state.gameOverCelebrationKey = key;
  stopGameOverCelebrationAudio();

  try {
    const audio = new Audio(AUDIO_ASSETS.finalWin);
    audio.preload = "auto";
    audio.volume = 0.78;
    audio.currentTime = 0;
    state.gameOverAudio = audio;
    audio.play().catch(() => {});
  } catch (_) {
    state.gameOverAudio = null;
  }
}

function renderConfettiHtml(count = 44) {
  return Array.from({ length: count }, (_, i) => {
    const x = ((i * 37) % 100) - 8;
    const drift = ((i * 19) % 140) - 70;
    const rotate = (i * 73) % 360;
    const delay = (i % 9) * 0.07;
    const duration = 1.9 + (i % 6) * 0.16;
    const scale = 0.72 + (i % 5) * 0.09;

    return `<span class="confetti-piece" style="--confetti-x:${x}vw;--confetti-drift:${drift}px;--confetti-rotate:${rotate}deg;--confetti-delay:${delay}s;--confetti-duration:${duration}s;--confetti-scale:${scale};"></span>`;
  }).join("");
}

function renderGameOver() {
  const meta = state.room;
  const cidadeVenceu = meta.winner === "cidade";

  const wrap = el(`<div class="wrap game-over-wrap">
    <div class="game-over-celebration" aria-hidden="true">
      <div class="confetti-layer">${renderConfettiHtml()}</div>
    </div>

    <div class="center-stage">
      <div class="card winner-banner">
        <div class="winner-trophy-wrap">
          ${trophySvg(72)}
        </div>
        <p class="eyebrow">FIM DA PARTIDA</p>
        <h1>${cidadeVenceu ? "Os cidadãos venceram!" : "Os assassinos venceram!"}</h1>
        <p class="tagline">${cidadeVenceu ? "Todos os assassinos foram eliminados." : "Os assassinos dominaram a cidade."}</p>
      </div>

      <div class="card final-roles-card">
        <h3>Papéis da partida</h3>
        <div class="player-list" id="final-roles"></div>
      </div>

      ${renderTruthHtml()}

      ${
        state.isHost
          ? `<button class="btn btn-primary" id="btn-replay">Jogar novamente nesta sala</button>`
          : `<p class="waiting-block">Aguardando a nova partida nesta mesma sala...</p>`
      }

      <button class="btn btn-ghost" id="btn-newgame">Sair da sala</button>
    </div>
  </div>`);

  const list = wrap.querySelector("#final-roles");
  (state.players || []).forEach((p) => {
    const info = ROLE_INFO[p.role] || { name: "Papel não atribuído" };
    const chip = el(
      `<div class="player-chip final-role-chip ${p.alive ? "" : "dead"}">${roleAvatar(p.role, "final-role-avatar")}<span>${esc(p.name)}</span><strong>${esc(info.name)}</strong></div>`,
    );
    list.appendChild(chip);
  });

  wrap.querySelector("#btn-newgame").onclick = leaveToLanding;

  const replayBtn = wrap.querySelector("#btn-replay");
  if (replayBtn) {
    replayBtn.onclick = async () => {
      await unlockAudio();
      await hostReplayRoom();
    };
  }

  playGameOverCelebration(meta);
  return wrap;
}

function renderRosterCollapsed() {
  const details = el(
    `<details class="card roster-card" style="margin-top:18px;"><summary>Jogadores (${(state.players || []).length})</summary><div class="player-list" style="margin-top:14px;" id="roster-list"></div></details>`,
  );
  const list = details.querySelector("#roster-list");
  (state.players || []).forEach((p) => {
    const chip = el(
      `<div class="player-chip ${p.alive ? "" : "dead"}">${playerAvatar(p.name)}<span>${esc(p.name)}</span></div>`,
    );
    if (p.id === state.playerId)
      chip.appendChild(el(`<span class="you-tag">VOCÊ</span>`));
    list.appendChild(chip);
  });
  return details;
}

function renderLog(meta) {
  const box = el(
    `<div class="log-box narrator-log"><div class="log-title">Narrador</div></div>`,
  );
  const lines = [];
  (meta.log || []).forEach((line) => {
    const clean = String(line)
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trim();
    if (!lines.includes(clean)) lines.push(clean);
  });
  lines.slice(-8).forEach((line) => box.appendChild(el(`<p>${esc(line)}</p>`)));
  return box;
}

function attachCountdown(element, meta) {
  if (!element) return;
  const tick = () => {
    element.textContent = formatTimer(getPhaseRemainingMs(meta));
  };
  tick();
  const iv = setInterval(() => {
    tick();
    if (getPhaseRemainingMs(meta) <= 0) clearInterval(iv);
  }, 100);
}

function skullSvg(size = 54) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 7c-14 0-24 10-24 24 0 9 5 16 12 20v6h8v-6h8v6h8v-6c7-4 12-11 12-20C56 17 46 7 32 7Z"/><circle cx="23" cy="31" r="5"/><circle cx="41" cy="31" r="5"/><path d="M29 45h6M32 38v7"/></svg>`;
}
function sunriseSvg(size = 54) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M10 49h44"/><path d="M18 42a14 14 0 0 1 28 0"/><path d="M32 11v9M16 18l6 6M48 18l-6 6M11 32h9M53 32h-9"/></svg>`;
}
function ballotSvg(size = 54) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8h32v48H16z"/><path d="m23 22 5 5 12-13M23 38h18"/></svg>`;
}
function resultSvg(size = 54) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 18h44M14 18l3 38h30l3-38"/><path d="M24 28v18M32 28v18M40 28v18M22 10h20"/></svg>`;
}
function trophySvg(size = 64) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="#f2c078" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10h24v13c0 9-5 16-12 16S20 32 20 23V10Z"/><path d="M20 16H9c0 11 5 17 13 17M44 16h11c0 11-5 17-13 17M32 39v11M22 54h20"/></svg>`;
}

/* ============ extra UI styles ============ */
(function injectGameStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .role-reveal-screen {
      position:fixed;
      inset:0;
      z-index:9998;
      width:100%;
      min-height:100dvh;
      box-sizing:border-box;
      margin:0;
      border-radius:0;
      border-left:0;
      border-right:0;
      display:grid;
      place-items:center;
      overflow:auto;
      background:
        radial-gradient(circle at 50% 20%, rgba(46,65,112,.32), transparent 34%),
        linear-gradient(180deg, #07152f 0%, #030a19 100%);
    }
    .role-reveal-visual {
      width:min(92vw, 520px);
      text-align:center;
      padding:28px 18px 34px;
    }
    .role-reveal-visual { text-align:center; padding:10px 0 4px; }
    .role-image-frame {
      width:min(100%, 390px);
      aspect-ratio:4/5;
      margin:0 auto 18px;
      border-radius:18px;
      overflow:hidden;
      border:2px solid var(--lantern, #f2c078);
      box-shadow:0 12px 40px rgba(0,0,0,.45);
      background:var(--night-deep, #07152f);
    }
    .role-image {
      width:100%;
      height:100%;
      display:block;
      object-fit:cover;
    }
    .role-you { margin:0; font-family:var(--serif, Georgia, serif); font-size:1.05rem; }
    .role-name {
      margin:2px 0 8px;
      font-family:var(--serif, Georgia, serif);
      font-size:clamp(2rem, 7vw, 3.1rem);
      letter-spacing:.04em;
      text-transform:uppercase;
    }
    .role-assassino { color:var(--blood, #e85b65); }
    .role-detetive { color:#b9d7ff; }
    .role-anjo { color:var(--lantern, #f2c078); }
    .role-cidadao { color:var(--lantern, #f2c078); }
    .role-description { max-width:540px; margin:0 auto; }
    .role-countdown {
      width:64px;
      height:64px;
      display:grid;
      place-items:center;
      margin:20px auto 8px;
      border:2px solid var(--lantern, #f2c078);
      border-radius:50%;
      font-size:1.8rem;
      font-weight:700;
    }
    .action-target-row {
      display:flex;
      gap:8px;
      align-items:stretch;
      margin-bottom:8px;
    }
    .action-target-button {
      flex:1;
      margin:0;
      text-align:left;
    }
    .action-target-button:disabled {
      opacity:.85;
      cursor:default;
    }
    .action-confirm-btn {
      min-width:52px;
      border:1px solid var(--lantern, #f2c078);
      border-radius:10px;
      background:var(--lantern, #f2c078);
      color:#101522;
      font-size:1.25rem;
      font-weight:800;
      cursor:pointer;
    }
    .action-confirm-btn:hover { filter:brightness(1.08); }

    /* ===== identidade visual Cidade Dorme ===== */
    body {
      background:
        radial-gradient(circle at 50% -10%, rgba(38,61,111,.48), transparent 42%),
        linear-gradient(180deg,#020817 0%,#041126 48%,#020817 100%) !important;
      color:#eef3ff !important;
    }
    #app { min-height:100dvh; }
    .wrap { width:min(94vw,1080px) !important; margin:0 auto !important; padding:20px 0 42px !important; }
    .card, .phase-banner, .room-code-card, .lobby-settings {
      background:linear-gradient(180deg,rgba(7,24,56,.94),rgba(3,13,31,.96)) !important;
      border:1px solid rgba(106,139,198,.28) !important;
      box-shadow:0 18px 55px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.035) !important;
      backdrop-filter:blur(10px);
    }
    .top-bar { border-bottom:1px solid rgba(120,150,205,.18) !important; margin-bottom:18px !important; }
    .room-pill { background:rgba(8,27,61,.9) !important; border:1px solid rgba(120,150,205,.25) !important; }
    .phase-banner { display:flex !important; align-items:center !important; gap:14px !important; padding:16px 18px !important; border-radius:16px !important; }
    .phase-title { font-family:Georgia,serif !important; font-size:1.2rem !important; letter-spacing:.03em !important; }
    .phase-sub { color:#aebbd2 !important; }
    .target-btn, .player-chip, .choice, select, input {
      background:rgba(5,20,47,.92) !important;
      border-color:rgba(111,146,208,.30) !important;
      color:#edf3ff !important;
    }
    .target-btn:hover, .player-chip:hover { border-color:rgba(244,190,77,.7) !important; transform:translateY(-1px); }
    .target-btn.selected { border-color:#f4be4d !important; box-shadow:0 0 0 1px rgba(244,190,77,.25),0 8px 22px rgba(0,0,0,.25) !important; }
    .btn-primary, .action-confirm-btn { background:linear-gradient(180deg,#f7c85a,#e9a92f) !important; color:#111827 !important; border:0 !important; box-shadow:0 8px 24px rgba(225,163,44,.18) !important; }
    .btn-primary:hover, .action-confirm-btn:hover { filter:brightness(1.06); transform:translateY(-1px); }
    .role-reveal-screen {
      background:
        radial-gradient(circle at 50% 12%,rgba(41,67,120,.46),transparent 32%),
        linear-gradient(180deg,#071631 0%,#020816 100%) !important;
    }
    .role-reveal-visual { width:min(92vw,620px) !important; }
    .cinematic-role-card{padding:20px 18px 30px !important;}
    .reveal-heading{font-family:Georgia,serif;font-weight:500;font-size:clamp(1.35rem,4vw,2rem);margin:0 0 18px;}
    .cinematic-role-image{width:min(82vw,430px) !important;aspect-ratio:4/5 !important;}
    .role-image-frame {
      width:min(78vw,410px) !important;
      aspect-ratio:4/5 !important;
      border-radius:20px !important;
      border:1px solid rgba(244,190,77,.75) !important;
      box-shadow:0 22px 70px rgba(0,0,0,.55),0 0 40px rgba(244,190,77,.08) !important;
    }
    .role-image { object-position:center !important; }
    .role-countdown {
      width:68px !important; height:68px !important; margin:18px auto 8px !important;
      border:2px solid #f4be4d !important; color:#fff !important;
      box-shadow:0 0 25px rgba(244,190,77,.15) !important;
    }
    .role-reveal-screen.role-reveal-fading { animation:roleFadeOut .8s ease forwards !important; }
    @keyframes roleFadeOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(1.025)} }
    .night-transition-screen {
      background:radial-gradient(circle at 50% 35%,rgba(25,44,81,.35),transparent 35%),linear-gradient(180deg,#020713,#00030a) !important;
    }
    .night-transition-content h1 { font-family:Georgia,serif !important; letter-spacing:.02em !important; text-shadow:0 5px 30px rgba(0,0,0,.7) !important; }
    .night-transition-content p { color:#f4be4d !important; text-transform:uppercase !important; letter-spacing:.28em !important; }
    .night-action-enter { animation:nightPanelIn 1.15s cubic-bezier(.2,.8,.2,1) both !important; }
    @keyframes nightPanelIn { from{opacity:0;transform:translateY(18px) scale(.985);filter:blur(5px)} to{opacity:1;transform:none;filter:none} }
    .investigation-result { background:rgba(5,18,42,.95) !important; border-color:rgba(244,190,77,.35) !important; }
    .waiting-block { color:#c8d3e7 !important; }
    .footnote { color:#7f91af !important; }
    .tagline { color:#aebbd2 !important; }

    .action-confirmed {
      display:flex;
      align-items:center;
      gap:9px;
      margin-top:12px;
      padding:12px 14px;
      border:1px solid var(--sage, #63d49a);
      border-radius:10px;
      color:var(--sage, #63d49a);
    }
    .confirm-check { font-size:1.2rem; font-weight:800; }
    .investigation-result {
      display:flex;
      justify-content:center;
      align-items:center;
      min-height:110px;
      margin-top:18px;
      border-radius:14px;
      border:1px solid var(--line, #24375c);
      background:rgba(255,255,255,.03);
    }
    
    .lobby-settings .field { margin-top:14px; }
    .lobby-settings select {
      width:100%;
      box-sizing:border-box;
      background:var(--night-deep, #07152f);
      border:1px solid var(--line, #24375c);
      border-radius:10px;
      padding:13px 14px;
      color:var(--ink, #f5f2ea);
      font-size:1rem;
      font-family:var(--sans, Arial, sans-serif);
    }
    .lobby-settings select:focus {
      outline:2px solid var(--lantern, #f2c078);
      outline-offset:1px;
      border-color:var(--lantern, #f2c078);
    }
    .night-transition-screen {
      position:fixed;
      inset:0;
      z-index:9999;
      overflow:hidden;
      display:grid;
      place-items:center;
      background:
        radial-gradient(circle at 50% 42%, rgba(45,57,95,.72), transparent 34%),
        linear-gradient(180deg, #020713 0%, #071329 48%, #020713 100%);
      color:var(--ink, #f5f2ea);
      isolation:isolate;
    }
    .night-transition-screen::before {
      content:"";
      position:absolute;
      inset:0;
      background:radial-gradient(circle at 50% 35%, rgba(242,192,120,.12), transparent 18%);
      animation:nightPulse 11s ease-in-out both;
      animation-delay:calc(-1 * var(--transition-elapsed, 0ms));
      z-index:1;
    }
    .night-transition-content {
      position:relative;
      z-index:10;
      text-align:center;
      opacity:0;
      transform:translateY(12px) scale(.98);
      animation:nightTitleIn 1.1s 2.2s ease-out forwards;
      animation-delay:calc(2.2s - var(--transition-elapsed, 0ms));
      padding:24px;
      text-shadow:0 5px 30px rgba(0,0,0,.75);
    }
    .transition-moon {
      margin:0 auto 12px;
      filter:drop-shadow(0 0 24px rgba(242,192,120,.34));
      animation:moonFloat 11s ease-in-out both;
      animation-delay:calc(-1 * var(--transition-elapsed, 0ms));
    }
    .transition-eyebrow {
      margin:0 0 4px;
      font-size:.76rem;
      letter-spacing:.34em;
      color:var(--lantern-soft, #f6d49e);
      font-weight:700;
    }
    .night-transition-content h1 {
      margin:0;
      font-family:var(--serif, Georgia, serif);
      font-size:clamp(2rem, 8vw, 4.2rem);
      font-weight:500;
    }
    .night-transition-content > p:last-child {
      margin:2px 0 0;
      font-family:var(--serif, Georgia, serif);
      font-size:clamp(1.3rem, 5vw, 2rem);
      color:var(--lantern, #f2c078);
      letter-spacing:.14em;
      text-transform:uppercase;
    }
    .night-cloud {
      position:absolute;
      z-index:4;
      width:52vw;
      height:17vh;
      min-width:420px;
      border-radius:999px;
      background:rgba(1,5,14,.92);
      filter:blur(18px);
      box-shadow:
        0 0 50px rgba(0,0,0,.85),
        100px 24px 0 20px rgba(1,5,14,.9),
        -120px 14px 0 28px rgba(1,5,14,.88),
        210px 42px 0 12px rgba(1,5,14,.82),
        -220px 36px 0 18px rgba(1,5,14,.85);
      opacity:.94;
      transform:translateX(115vw) scale(1.25);
      animation:cloudSweep 8.8s cubic-bezier(.18,.72,.2,1) forwards;
      animation-delay:calc(-1 * var(--transition-elapsed, 0ms));
    }
    .cloud-a { top:7%; animation-delay:0s; }
    .cloud-b { top:28%; width:64vw; animation-delay:.16s; animation-duration:8.5s; }
    .cloud-c { top:49%; width:70vw; animation-delay:.05s; animation-duration:9.0s; }
    .cloud-d { top:68%; width:62vw; animation-delay:.22s; animation-duration:8.7s; }
    .cloud-e { top:84%; width:76vw; animation-delay:.1s; animation-duration:9.1s; }
    .role-reveal-screen.role-reveal-fading .role-reveal-visual {
      animation:roleRevealFade .8s ease-in forwards;
    }
    .role-reveal-screen .role-countdown {
      animation:countdownGlow 1s infinite alternate;
    }
    @keyframes roleRevealFade {
      from { opacity:1; transform:scale(1); }
      to { opacity:0; transform:scale(.96); }
    }
    @keyframes countdownGlow {
      from { box-shadow:0 0 0 rgba(242,192,120,0); }
      to { box-shadow:0 0 22px rgba(242,192,120,.25); }
    }
    @keyframes cloudSweep {
      0% { transform:translateX(115vw) scale(1.25); }
      55% { transform:translateX(5vw) scale(1.35); }
      100% { transform:translateX(-125vw) scale(1.5); }
    }
    @keyframes nightTitleIn {
      0% { opacity:0; transform:translateY(12px) scale(.98); }
      100% { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes nightPulse {
      0%,100% { opacity:.25; }
      35% { opacity:.8; }
      65% { opacity:.45; }
    }
    @keyframes moonFloat {
      0%,100% { transform:translateY(0); }
      50% { transform:translateY(-8px); }
    }
    @media (prefers-reduced-motion:reduce) {
      .night-cloud, .night-transition-content, .transition-moon, .role-reveal-visual { animation:none !important; }
      .night-transition-content { opacity:1; transform:none; }
    }

    .night-action-enter {
      animation:nightActionEnter .9s cubic-bezier(.2,.7,.2,1) both;
    }
    @keyframes nightActionEnter {
      from { opacity:0; transform:translateY(16px) scale(.985); filter:blur(3px); }
      to { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
    }

    .death-banner {
      text-align:center;
      border-color:var(--blood, #e85b65);
    }

    .role-reveal-screen > .ghost-indicator,
    .night-transition-screen > .ghost-indicator{
      position:fixed;
      top:18px;
      left:50%;
      transform:translateX(-50%);
      margin:0;
      z-index:10001;
    }

    .death-banner h2 { color:var(--blood, #e85b65); margin:6px 0; }

    /* ===== VISUAL SYSTEM — referência cinematográfica ===== */
    :root{
      --ui-bg:#020817;
      --ui-panel:#071832;
      --ui-panel-2:#041127;
      --ui-line:rgba(120,154,216,.24);
      --ui-gold:#f2c078;
      --ui-text:#edf3ff;
      --ui-muted:#9eabc1;
      --ui-red:#e85b65;
    }
    body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;}
    .wrap{width:min(94vw,1120px) !important;}
    .card{border-radius:16px !important;}
    .eyebrow{margin:0 0 5px;font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:var(--ui-gold);font-weight:700;}
    .night-role-header,.discussion-head{display:flex;align-items:center;gap:14px;margin-bottom:20px;}
    .night-role-header h2,.discussion-head h2{margin:0;font-family:Georgia,serif;font-weight:500;}
    .role-avatar{width:58px;height:58px;min-width:58px;border-radius:50%;object-fit:cover;border:2px solid var(--ui-gold);box-shadow:0 0 0 4px rgba(242,192,120,.08),0 10px 30px rgba(0,0,0,.35);}
    .role-avatar-large{width:90px;height:90px;min-width:90px;}
    .player-avatar{width:34px;height:34px;min-width:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#172c51,#0a1731);border:1px solid rgba(137,170,225,.38);color:#e7efff;font-size:.72rem;font-weight:700;letter-spacing:.04em;}
    .visual-target-grid{display:grid;gap:8px;}
    .visual-target-row{display:flex;gap:8px;position:relative;z-index:1;}
    .visual-target-row:has(.trait-investigation-popover){z-index:30;}
    .visual-target-button{display:flex !important;align-items:center;gap:12px;text-align:left !important;padding:10px 12px !important;min-height:56px;}
    .trait-investigation-popover{
      position:absolute;
      left:0;
      right:0;
      top:calc(100% + 6px);
      z-index:50;
      padding:10px;
      border:1px solid rgba(244,190,77,.5);
      border-radius:12px;
      background:rgba(4,16,38,.98);
      box-shadow:0 18px 45px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.025);
    }
    .trait-popover-title{font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;color:var(--ui-muted);margin:0 2px 8px;}
    .trait-popover-options{display:grid;gap:6px;}
    .trait-popover-option-row{display:flex;gap:6px;min-width:0;}
    .trait-popover-option{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border:1px solid rgba(111,146,208,.3);border-radius:9px;background:rgba(5,20,47,.92);color:var(--ui-text);text-align:left;cursor:pointer;}
    .trait-popover-option:hover{border-color:rgba(244,190,77,.7);}
    .trait-popover-option.selected{border-color:#f4be4d;box-shadow:0 0 0 1px rgba(244,190,77,.2);}
    .trait-popover-confirm{flex:none;padding:9px 12px;border:0;border-radius:9px;background:linear-gradient(180deg,#f7c85a,#e9a92f);color:#111827;font-weight:700;cursor:pointer;white-space:nowrap;}
    .trait-popover-confirm:hover{filter:brightness(1.06);}
    .round-trait-reveal{margin-top:14px;}
    .round-trait-reveal ol{margin-bottom:8px;}
    .visual-target-button span:last-child{flex:1;}
    .visual-target-button small{color:var(--ui-muted);}
    .action-confirm-btn{width:54px;min-width:54px;display:grid;place-items:center;}
    .action-heading{display:flex;align-items:center;gap:12px;margin:8px 0 16px;padding:14px;border:1px solid var(--ui-line);border-radius:14px;background:rgba(255,255,255,.025);}
    .action-heading h3{margin:0 0 3px;font-family:Georgia,serif;font-size:1.18rem;}
    .action-heading p{margin:0;color:var(--ui-muted);font-size:.9rem;}
    .role-action-icon{display:block;flex:none;}
    .waiting-role-panel{text-align:center;padding:34px 20px;border:1px solid var(--ui-line);border-radius:15px;background:rgba(255,255,255,.018);}
    .waiting-role-panel .role-action-icon{margin:0 auto 12px;}
    .waiting-role-panel h3{margin:8px 0;font-family:Georgia,serif;}
    .waiting-role-panel p{max-width:520px;margin:0 auto;color:var(--ui-muted);}
    .investigation-result{display:flex !important;align-items:center;justify-content:center;gap:16px;min-height:92px;margin-top:16px;border-radius:14px !important;}
    
    .investigation-result p{margin:3px 0 0;color:var(--ui-muted);}
    .timer-panel{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border:1px solid var(--ui-line);border-radius:13px;background:rgba(2,10,25,.55);margin:14px 0 16px;}
    .timer-panel span{color:var(--ui-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;}
    .timer-panel strong{font-family:Georgia,serif;font-size:2rem;color:var(--ui-gold);font-weight:500;letter-spacing:.05em;}
    .phase-mini-timer{display:inline-block;margin-top:18px;padding:8px 18px;border:1px solid rgba(242,192,120,.35);border-radius:999px;color:var(--ui-gold);font-family:Georgia,serif;font-size:1.2rem;}
    .day-event-card{text-align:center;padding:38px 24px !important;}
    .event-icon{display:grid;place-items:center;width:88px;height:88px;margin:0 auto 16px;border-radius:50%;color:var(--ui-gold);border:1px solid rgba(242,192,120,.35);background:rgba(242,192,120,.05);}
    .death-icon{color:var(--ui-red);border-color:rgba(232,91,101,.4);}
    .day-event-card h2{font-family:Georgia,serif;font-weight:500;margin:6px auto;max-width:650px;}
    .winner-banner{text-align:center;padding:34px 24px !important;}
    .winner-banner svg{margin:0 auto 10px;display:block;}
    .winner-banner h1{font-family:Georgia,serif;font-weight:500;color:var(--ui-gold);}
    .death-banner{text-align:center !important;padding:28px !important;color:var(--ui-red);}
    .death-banner svg{display:block;margin:0 auto 8px;}
    .death-banner h2{color:var(--ui-red) !important;font-family:Georgia,serif;}
    .final-role-chip{display:grid !important;grid-template-columns:42px 1fr auto;align-items:center;gap:10px;}
    .final-role-avatar{width:42px !important;height:42px !important;min-width:42px !important;border-width:1px !important;}
    .final-role-chip strong{color:var(--ui-gold);font-family:Georgia,serif;font-weight:500;}
    .roster-card summary{cursor:pointer;font-family:Georgia,serif;font-size:1.05rem;}
    .narrator-log{margin-top:18px;}
    .log-title{font-family:Georgia,serif;color:var(--ui-gold);margin-bottom:8px;}
    .narrator-log p{margin:6px 0;color:#b6c2d7;}
    .skip-button{display:flex !important;align-items:center;gap:12px;justify-content:flex-start;margin-top:10px !important;}
    .status-dot{width:8px;height:8px;border-radius:50%;background:#58d99b;display:inline-block;box-shadow:0 0 10px rgba(88,217,155,.5);}
    .lobby-settings{position:relative;z-index:2;}
    .lobby-settings select{appearance:auto !important;-webkit-appearance:auto !important;position:relative;z-index:3;cursor:pointer;}
    .lobby-settings{overflow:visible !important;}
    .lobby-settings select{min-height:48px;display:block;}
    .lobby-settings .field{position:relative;z-index:3;}
    .center-stage .card{box-shadow:0 20px 70px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.035) !important;}
    .lobby-top-actions{display:flex;align-items:center;gap:10px;}
    .settings-gear{width:42px;height:42px;border:1px solid rgba(242,192,120,.34);border-radius:12px;background:rgba(7,23,54,.72);color:var(--ui-gold);font-size:1.2rem;cursor:pointer;transition:.18s ease;}
    .settings-gear:hover{transform:translateY(-1px);border-color:rgba(242,192,120,.7);background:rgba(12,31,67,.9);}
    .lobby-settings-summary{width:min(100%,720px);margin:18px auto 0;display:flex;align-items:center;justify-content:space-between;gap:18px;box-sizing:border-box;}
    .settings-summary-btn{width:auto;min-width:0;padding:6px 10px;border-radius:10px;font-size:.7rem;line-height:1.2;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;}
    .settings-modal-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:20px;background:rgba(1,7,20,.78);backdrop-filter:blur(8px);}
    .settings-modal{width:min(620px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid rgba(242,192,120,.36);border-radius:18px;background:linear-gradient(180deg,#081a3a,#041127);box-shadow:0 30px 90px rgba(0,0,0,.6);}
    .settings-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px;}
    .settings-modal-head h2{margin:0;font-family:Georgia,serif;font-weight:500;}
    .settings-close{width:38px;height:38px;border:1px solid var(--ui-line);border-radius:10px;background:rgba(255,255,255,.025);color:var(--ui-muted);font-size:1.5rem;cursor:pointer;}
    .settings-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:9px;}
    .settings-check{display:flex;align-items:center;gap:9px;padding:11px 12px;border:1px solid var(--ui-line);border-radius:10px;background:rgba(255,255,255,.018);cursor:pointer;}
    .settings-check input{accent-color:#f2c078;}
    .settings-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px;}
    .ghost-indicator{position:relative;z-index:20;display:flex;align-items:center;justify-content:center;gap:9px;width:max-content;max-width:100%;margin:0 auto 14px;padding:7px 12px;border:1px solid rgba(180,194,220,.25);border-radius:999px;background:rgba(10,20,42,.82);color:#aab6ca;font-size:.68rem;font-weight:700;letter-spacing:.12em;box-shadow:0 8px 24px rgba(0,0,0,.22);}
    .ghost-symbol{font-size:1rem;line-height:1;}
    .dead-player-view .phase-banner{opacity:.86;}
    .ghost-phase-note{margin:0 0 14px;padding:10px 12px;border:1px solid rgba(180,194,220,.2);border-radius:10px;background:rgba(255,255,255,.018);color:#aab6ca;text-align:center;font-size:.86rem;}
    .spectator-night-card{overflow:visible;}
    .spectator-action-list{display:grid;gap:8px;margin-top:18px;}
    .spectator-action-row{display:grid;grid-template-columns:34px minmax(120px,180px) 10px minmax(0,1fr);align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--ui-line);border-radius:12px;background:rgba(255,255,255,.018);}
    .spectator-action-main{display:grid;gap:2px;min-width:0;}
    .spectator-action-main strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .spectator-action-main span{font-size:.75rem;color:var(--ui-muted);}
    .spectator-action-dot{width:8px;height:8px;border-radius:50%;background:#7d8ba3;box-shadow:0 0 0 4px rgba(125,139,163,.08);}
    .spectator-action-row.done .spectator-action-dot{background:#f2c078;box-shadow:0 0 0 4px rgba(242,192,120,.08);}
    .spectator-action-text{color:#d8e1f2;font-size:.88rem;}
    .vote-bubbles{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:1px;white-space:nowrap;font-size:1rem;letter-spacing:-.2em;min-width:24px;}
    .vote-bubbles.empty{min-width:24px;}
    .vote-skip-row{margin-top:10px;}
    .vote-skip-row .skip-button{margin-top:0 !important;}
    .spectator-option{cursor:default !important;}
    .day-reveal-screen{position:relative;overflow:hidden;}
    .death-awakening{animation:deathAwakening 10s cubic-bezier(.2,.6,.2,1) both;}
    .death-awakening .event-icon,.death-awakening .eyebrow,.death-awakening h2,.death-awakening .tagline,.death-awakening .phase-mini-timer{animation:deathContentIn 9.2s ease both;}
    @keyframes deathAwakening{
      0%{opacity:0;transform:scale(.985);filter:blur(7px);}
      32%{opacity:.18;filter:blur(5px);}
      68%{opacity:.58;filter:blur(2px);}
      100%{opacity:1;transform:scale(1);filter:blur(0);}
    }
    @keyframes deathContentIn{
      0%{opacity:0;transform:translateY(12px);}
      60%{opacity:.35;transform:translateY(4px);}
      100%{opacity:1;transform:translateY(0);}
    }
    .death-screen-cinematic{animation:deathScreenFade 4.8s cubic-bezier(.2,.65,.2,1) both;}
    @keyframes deathScreenFade{
      from{opacity:0;transform:scale(.985);filter:blur(5px);}
      to{opacity:1;transform:scale(1);filter:blur(0);}
    }
    .death-screen-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 45%,rgba(232,91,101,.07),transparent 58%);}
    @media(max-width:640px){
      .settings-check-grid{grid-template-columns:1fr;}
      .settings-modal-actions{flex-direction:column-reverse;}
      .settings-modal-actions .btn{width:100%;}
      .lobby-settings-summary{align-items:flex-start;flex-direction:column;}
      .spectator-action-row{grid-template-columns:34px 1fr;gap:8px;}
      .spectator-action-dot{display:none;}
      .spectator-action-text{grid-column:2;}
    }

    @media(max-width:640px){
      .role-image-frame{width:min(84vw,350px) !important;}
      .final-role-chip{grid-template-columns:42px 1fr;}
      .final-role-chip strong{grid-column:2;}
      .timer-panel strong{font-size:1.7rem;}
    }
  `;
  document.head.appendChild(style);
})();

/* ============ home original visual ============ */
(function injectHomeOriginalStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .home-menu-card{
      width:min(650px, calc(100vw - 32px)) !important;
      margin:28px auto 0 !important;
      padding:28px !important;
      box-sizing:border-box;
      border-radius:18px !important;
      background:rgba(6,20,48,.72) !important;
      border:1px solid rgba(73,105,157,.48) !important;
      box-shadow:0 18px 55px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.025) !important;
    }

    .choice-row{
      display:grid !important;
      grid-template-columns:repeat(2,minmax(0,1fr)) !important;
      gap:12px !important;
    }

    .home-choice{
      min-height:128px !important;
      padding:22px 16px !important;
      border-radius:17px !important;
      border:1px solid rgba(73,105,157,.58) !important;
      background:rgba(7,23,54,.62) !important;
      color:var(--ink,#eef3ff) !important;
      display:flex !important;
      flex-direction:column !important;
      align-items:center !important;
      justify-content:center !important;
      gap:10px !important;
      box-shadow:none !important;
      transition:transform .18s ease, border-color .18s ease, background .18s ease !important;
    }

    .home-choice:hover{
      transform:translateY(-2px);
      border-color:rgba(242,192,120,.65) !important;
      background:rgba(12,31,67,.82) !important;
    }

    .home-choice-icon{
      display:block !important;
      font-size:34px !important;
      line-height:1 !important;
      height:40px !important;
      width:48px !important;
      text-align:center !important;
      filter:saturate(.92);
    }

    .home-choice .label{
      font-family:var(--serif,Georgia,serif) !important;
      font-size:1.08rem !important;
      font-weight:700 !important;
      letter-spacing:.01em;
    }

    .home-roles{
      margin-top:214px !important;
      text-align:center !important;
      font-size:.82rem !important;
      letter-spacing:.02em;
      opacity:.8;
    }

    @media(max-width:640px){
      .home-menu-card{
        width:calc(100vw - 28px) !important;
        padding:18px !important;
      }
      .home-choice{min-height:112px !important;}
      .home-roles{margin-top:100px !important;}
    }

    /* ===== celebração do fim da partida ===== */
    .game-over-wrap{position:relative;overflow:hidden;min-height:calc(100dvh - 40px);}
    .game-over-celebration{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
    .game-over-wrap .center-stage{position:relative;z-index:2;}
    .winner-trophy-wrap{position:relative;width:92px;height:92px;margin:0 auto 8px;display:grid;place-items:center;}
    .winner-trophy-wrap::before{content:"";position:absolute;inset:6px;border-radius:50%;background:radial-gradient(circle,rgba(242,192,120,.18),transparent 68%);animation:trophyPulse 1.8s ease-in-out infinite;}
    .winner-trophy-wrap svg{position:relative;z-index:1;margin:0 !important;filter:drop-shadow(0 0 18px rgba(242,192,120,.24));}
    .confetti-layer{position:absolute;inset:0;overflow:hidden;}
    .confetti-piece{position:absolute;top:-24px;left:var(--confetti-x);width:8px;height:14px;border-radius:2px;opacity:0;transform:rotate(var(--confetti-rotate)) scale(var(--confetti-scale));animation:confettiFall var(--confetti-duration) cubic-bezier(.18,.72,.25,1) var(--confetti-delay) both;}
    .confetti-piece:nth-child(4n){background:#f2c078;}
    .confetti-piece:nth-child(4n+1){background:#e85b65;}
    .confetti-piece:nth-child(4n+2){background:#8ec7ff;}
    .confetti-piece:nth-child(4n+3){background:#7ee2a8;}
    @keyframes confettiFall{0%{opacity:0;transform:translate3d(0,-20px,0) rotate(var(--confetti-rotate)) scale(var(--confetti-scale));}10%{opacity:1;}72%{opacity:1;}100%{opacity:0;transform:translate3d(var(--confetti-drift),108vh,0) rotate(calc(var(--confetti-rotate) + 540deg)) scale(var(--confetti-scale));}}
    @keyframes trophyPulse{0%,100%{transform:scale(.94);opacity:.45;}50%{transform:scale(1.08);opacity:.9;}}
    @media (prefers-reduced-motion:reduce){.confetti-piece,.winner-trophy-wrap::before{animation:none !important;}.confetti-piece{opacity:.8;top:10%;}}

  `;
  document.head.appendChild(style);
})();

/* ===== Traços: controles adicionais ===== */
(function injectTraitStyles() {
  const style = document.createElement("style");
  style.textContent = `.trait-axis-picker{margin-top:10px;padding:10px;border:1px solid var(--ui-line);border-radius:10px;background:rgba(255,255,255,.025)}.trait-axis-picker .target-grid{margin-top:6px}.trait-axis-picker .target-btn{min-height:42px}`;
  document.head.appendChild(style);
})();

/* ============ boot ============ */
document.addEventListener("pointerdown", unlockAudio, { passive: true });

// Pré-carrega os arquivos reais para reduzir atraso entre o sino e a coruja.
(function preloadNightAudio() {
  Object.values(AUDIO_ASSETS).forEach((src) => {
    const audio = new Audio(src);
    audio.preload = "auto";
  });
})();

(async function boot() {
  if (restoreSavedSession()) {
    const restored = await restoreRoomAfterRefresh();
    if (restored) {
      render();
      startPolling();
      return;
    }
  }
  render();
})();

/* ===== Revelação: pronto por jogador ===== */
(function injectReadyRevealStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .ready-status{margin:16px 0 10px;padding:12px 14px;border:1px solid var(--ui-line);border-radius:12px;background:rgba(255,255,255,.025);color:var(--ui-muted);text-align:center;}
    #btn-ready{width:min(100%,420px);margin:8px auto 0;display:block;}
    #btn-ready:disabled{opacity:.75;cursor:default;}
    #ready-count{margin-top:10px;text-align:center;}
  

    /* =========================================================
       MORTE — TRANSIÇÃO CINEMATOGRÁFICA DA VÍTIMA
       ========================================================= */
    .death-sequence-screen {
      position: fixed;
      inset: 0;
      z-index: 10000;
      width: 100vw;
      height: 100dvh;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: #000;
      color: #eef3ff;
      isolation: isolate;
    }
    .death-sequence-eyelid {
      position: absolute;
      left: 0;
      right: 0;
      height: 50%;
      background: #000;
      z-index: 2;
      pointer-events: none;
    }
    .death-sequence-eyelid-top {
      top: 0;
      transform: translateY(-100%);
      animation: deathEyeTop 5.2s cubic-bezier(.7, 0, .2, 1) both;
    }
    .death-sequence-eyelid-bottom {
      bottom: 0;
      transform: translateY(100%);
      animation: deathEyeBottom 5.2s cubic-bezier(.7, 0, .2, 1) both;
    }
    .death-sequence-message {
      position: relative;
      z-index: 3;
      width: min(90vw, 520px);
      text-align: center;
      opacity: 0;
      animation: deathMessage 5.2s ease both;
      padding: 24px;
      box-sizing: border-box;
    }
    .death-sequence-skull { color: #e85b65; margin-bottom: 14px; }
    .death-sequence-message h1 {
      margin: 6px 0 12px;
      color: #e85b65;
      font-family: Georgia, serif;
      font-size: clamp(2.4rem, 8vw, 4rem);
      font-weight: 500;
    }
    .death-sequence-message p { color: #aebbd2; font-size: .95rem; line-height: 1.5; }
    .death-sequence-message strong { color: #f2c078; }
    .death-sequence-ghost { margin-top: 16px !important; color: #7f91af !important; font-size: .82rem !important; }
    @keyframes deathEyeTop {
      0% { transform: translateY(-100%); }
      7% { transform: translateY(-100%); }
      30% { transform: translateY(0); }
      47% { transform: translateY(0); }
      100% { transform: translateY(-100%); }
    }
    @keyframes deathEyeBottom {
      0% { transform: translateY(100%); }
      7% { transform: translateY(100%); }
      30% { transform: translateY(0); }
      47% { transform: translateY(0); }
      100% { transform: translateY(100%); }
    }
    @keyframes deathMessage {
      0%, 47% { opacity: 0; transform: scale(.96); filter: blur(5px); }
      61% { opacity: 0; }
      73%, 100% { opacity: 1; transform: scale(1); filter: blur(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .death-sequence-eyelid { animation-duration: 1ms !important; }
      .death-sequence-message { animation-duration: 1ms !important; opacity: 1; }
    }
`;
  document.head.appendChild(style);
})();

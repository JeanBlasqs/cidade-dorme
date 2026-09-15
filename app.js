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
  return participants.length > 0 && participants.every((p) => Number(p.readyRound || 0) === Number(round));
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
  if (error) console.error("tryAdvanceRoleReveal", error);
}

async function dbSubmitNightAction(code, round, role, playerId, targetId) {
  const { error } = await sb.from("night_actions").upsert(
    {
      room_code: code,
      round,
      role,
      player_id: playerId,
      target_id: targetId,
    },
    { onConflict: "room_code,round,role,player_id" },
  );
  if (error) console.error("dbSubmitNightAction", error);
}
async function dbGetNightActions(code, round, role) {
  const { data, error } = await sb
    .from("night_actions")
    .select("player_id,target_id")
    .eq("room_code", code)
    .eq("round", round)
    .eq("role", role);
  if (error) {
    console.error("dbGetNightActions", error);
    return [];
  }
  return data.map((r) => ({ playerId: r.player_id, targetId: r.target_id }));
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

/* ============ investigation system ============ */
async function dbCreateInvestigationGame(code, round, players) {
  // A história deve permanecer a mesma durante todas as rodadas da partida.
  // Só as informações distribuídas mudam a cada rodada.
  const { data: previousGame, error: previousError } = await sb
    .from("game_investigations")
    .select("id,scenario_id")
    .eq("room_code", code)
    .eq("status", "active")
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  let chosen = null;

  if (previousError) {
    console.error("dbCreateInvestigationGame.previous", previousError);
    return null;
  }

  if (previousGame?.scenario_id) {
    const { data: previousScenario, error: previousScenarioError } = await sb
      .from("investigation_scenarios")
      .select("id,title,description,truth_summary")
      .eq("id", previousGame.scenario_id)
      .maybeSingle();
    if (previousScenarioError || !previousScenario) {
      console.error("dbCreateInvestigationGame.previousScenario", previousScenarioError);
      return null;
    }
    chosen = previousScenario;
  } else {
    const { data: scenarios, error: scenarioError } = await sb
      .from("investigation_scenarios")
      .select("id,title,description,truth_summary")
      .eq("active", true)
      .order("id", { ascending: false });
    if (scenarioError || !scenarios?.length) {
      console.error("dbCreateInvestigationGame.scenarios", scenarioError);
      return null;
    }
    chosen = scenarios[Math.floor(Math.random() * scenarios.length)];
  }

  const { data: game, error: gameError } = await sb
    .from("game_investigations")
    .insert({ room_code: code, round, scenario_id: chosen.id, status: "active" })
    .select("id,room_code,round,scenario_id")
    .single();
  if (gameError || !game) {
    console.error("dbCreateInvestigationGame.game", gameError);
    return null;
  }

  const { data: facts, error: factsError } = await sb
    .from("investigation_facts")
    .select("id,text,category,value,audience")
    .eq("scenario_id", chosen.id)
    .eq("active", true)
    .order("id");

  // O Detetive recebe UMA pista nova por rodada. As pistas anteriores ficam
  // preservadas e serão mostradas junto com a nova nas rodadas seguintes.
  const { data: previousClueItems, error: previousClueError } = await sb
    .from("game_investigations")
    .select("id")
    .eq("room_code", code)
    .eq("status", "active");
  if (previousClueError) {
    console.error("dbCreateInvestigationGame.previousGames", previousClueError);
    return null;
  }

  const previousGameIds = (previousClueItems || []).map(g => g.id);
  let usedClueIds = [];
  if (previousGameIds.length) {
    const { data: usedClues, error: usedCluesError } = await sb
      .from("game_investigation_items")
      .select("source_id")
      .in("game_id", previousGameIds)
      .eq("item_type", "clue");
    if (usedCluesError) {
      console.error("dbCreateInvestigationGame.usedClues", usedCluesError);
      return null;
    }
    usedClueIds = (usedClues || []).map(item => item.source_id);
  }

  const { data: availableClues, error: cluesError } = await sb
    .from("investigation_clues")
    .select("id,text,category,value,is_true")
    .eq("scenario_id", chosen.id)
    .eq("active", true)
    .order("id");

  if (factsError || cluesError) {
    console.error("dbCreateInvestigationGame.items", factsError || cluesError);
    return null;
  }

  const unusedClues = (availableClues || []).filter(c => !usedClueIds.includes(c.id));
  const cluePool = unusedClues.length ? unusedClues : (availableClues || []);
  if (!cluePool.length) {
    console.error("Pistas insuficientes para o cenário", chosen.id);
    return null;
  }

  const assignments = [];

  // Rodada 1: todos recebem suas informações iniciais.
  // Rodadas seguintes: somente o Detetive recebe UMA pista nova.
  if (Number(round) === 1) {
    const trueClues = cluePool.filter((c) => c.is_true);
    const falseClues = cluePool.filter((c) => !c.is_true);
    if (trueClues.length < 1 || falseClues.length < 2) {
      console.error("O cenário precisa ter pelo menos 1 pista verdadeira e 2 falsas.", chosen.id);
      await sb.from("game_investigations").delete().eq("id", game.id);
      return null;
    }

    const initialClues = [
      shuffle(trueClues)[0],
      ...shuffle(falseClues).slice(0, 2),
    ];

    const factsByAudience = {
      cidadao: shuffle((facts || []).filter(f => f.audience === "cidadao" || f.audience === "todos")),
      anjo: shuffle((facts || []).filter(f => f.audience === "anjo" || f.audience === "todos")),
      assassino: shuffle((facts || []).filter(f => f.audience === "assassino" || f.audience === "todos")),
    };
    if (factsByAudience.cidadao.length < 3 || factsByAudience.anjo.length < 3 || factsByAudience.assassino.length < 3) {
      console.error("Fatos insuficientes por papel para o cenário", chosen.id);
      await sb.from("game_investigations").delete().eq("id", game.id);
      return null;
    }

    const addFactsForPlayers = (role, list) => {
      players.filter(p => p.role === role).forEach(player => {
        shuffle(list.slice()).slice(0, 3).forEach((f, i) => assignments.push({
          game_id: game.id, player_id: player.id, role: player.role, item_type: "fact",
          source_id: f.id, text_snapshot: f.text, is_true: true, sort_order: i + 1,
        }));
      });
    };
    addFactsForPlayers("cidadao", factsByAudience.cidadao);
    addFactsForPlayers("anjo", factsByAudience.anjo);
    addFactsForPlayers("assassino", factsByAudience.assassino);

    const detective = players.find(p => p.role === "detetive");
    if (detective) {
      initialClues.forEach((clue, i) => assignments.push({
        game_id: game.id, player_id: detective.id, role: detective.role, item_type: "clue",
        source_id: clue.id, text_snapshot: clue.text, is_true: clue.is_true, sort_order: i + 1,
      }));
    }
  } else {
    const detective = players.find(p => p.role === "detetive");
    if (detective) {
      const newDetectiveClue = shuffle(cluePool)[0];
      assignments.push({
        game_id: game.id, player_id: detective.id, role: detective.role, item_type: "clue",
        source_id: newDetectiveClue.id, text_snapshot: newDetectiveClue.text,
        is_true: newDetectiveClue.is_true, sort_order: Number(round),
      });
    }
  }

  const { error: assignmentError } = await sb.from("game_investigation_items").insert(assignments);
  if (assignmentError) {
    console.error("dbCreateInvestigationGame.assignments", assignmentError);
    await sb.from("game_investigations").delete().eq("id", game.id);
    return null;
  }

  return game;
}

async function dbGetMyInvestigationItems(gameId, playerId) {
  if (!gameId || !playerId) return [];

  const { data: currentGame, error: currentGameError } = await sb
    .from("game_investigations")
    .select("id,room_code,round")
    .eq("id", gameId)
    .maybeSingle();
  if (currentGameError || !currentGame) {
    console.error("dbGetMyInvestigationItems.game", currentGameError);
    return [];
  }

  const { data: me, error: meError } = await sb
    .from("players")
    .select("id,role")
    .eq("id", playerId)
    .maybeSingle();
  if (meError) {
    console.error("dbGetMyInvestigationItems.player", meError);
    return [];
  }

  // Detetive acumula as pistas: uma nova a cada rodada.
  if (me?.role === "detetive") {
    const { data: games, error: gamesError } = await sb
      .from("game_investigations")
      .select("id,round")
      .eq("room_code", currentGame.room_code)
      .order("round");
    if (gamesError) {
      console.error("dbGetMyInvestigationItems.games", gamesError);
      return [];
    }

    const gameIds = (games || []).map(g => g.id);
    if (!gameIds.length) return [];

    const { data, error } = await sb
      .from("game_investigation_items")
      .select("id,item_type,text_snapshot,is_true,sort_order,game_id")
      .in("game_id", gameIds)
      .eq("player_id", playerId)
      .eq("item_type", "clue")
      .order("created_at");
    if (error) {
      console.error("dbGetMyInvestigationItems.detective", error);
      return [];
    }
    return data || [];
  }

  // Cidadão, Anjo e Assassino recebem apenas os 3 fatos da primeira rodada.
  const { data: games, error: gamesError } = await sb
    .from("game_investigations")
    .select("id,round")
    .eq("room_code", currentGame.room_code)
    .eq("round", 1)
    .limit(1);
  if (gamesError) {
    console.error("dbGetMyInvestigationItems.initialGame", gamesError);
    return [];
  }
  const initialGameId = games?.[0]?.id;
  if (!initialGameId) return [];
  const { data, error } = await sb
    .from("game_investigation_items")
    .select("id,item_type,text_snapshot,is_true,sort_order")
    .eq("game_id", initialGameId)
    .eq("player_id", playerId)
    .eq("item_type", "fact")
    .order("sort_order");
  if (error) {
    console.error("dbGetMyInvestigationItems", error);
    return [];
  }
  return data || [];
}

async function dbGetInvestigationTruth(gameId) {
  if (!gameId) return null;
  const { data: game, error: gameError } = await sb
    .from("game_investigations")
    .select("id,scenario_id,truth_revealed_at")
    .eq("id", gameId)
    .maybeSingle();
  if (gameError || !game) return null;
  const { data: scenario, error: scenarioError } = await sb
    .from("investigation_scenarios")
    .select("id,title,description,truth_summary")
    .eq("id", game.scenario_id)
    .maybeSingle();
  const { data: facts, error: factsError } = await sb
    .from("investigation_facts")
    .select("id,text,category,value")
    .eq("scenario_id", game.scenario_id)
    .eq("active", true)
    .order("id");
  if (scenarioError || factsError || !scenario) return null;
  return { ...game, scenario, facts: facts || [] };
}

async function dbMarkInvestigationFinished(gameId) {
  if (!gameId) return;
  const { error } = await sb.from("game_investigations").update({
    status: "finished",
    truth_revealed_at: new Date().toISOString(),
  }).eq("id", gameId);
  if (error) console.error("dbMarkInvestigationFinished", error);
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
function computeRoleCounts(n) {
  if (n < 4) return { assassino: 0, detetive: 0, anjo: 0, cidadao: n };

  // A partir de 4 jogadores existem obrigatoriamente:
  // 1 Assassino + 1 Detetive + 1 Anjo + 1 Cidadão.
  // Acima de 4, todos os demais são cidadãos comuns.
  return { assassino: 1, detetive: 1, anjo: 1, cidadao: n - 3 };
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
const DAY_REVEAL_SECONDS = 7;
const DAY_RESULTS_SECONDS = 7;
const NIGHT_TRANSITION_SECONDS = 11;
const AUDIO_ASSETS = {
  bell: "assets/audio/church-bell.mp3",
  owl: "assets/audio/owl.mp3",
};

const SESSION_KEY = "cidade-dorme-session-v1";

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      playerId: state.playerId, playerName: state.playerName,
      roomCode: state.roomCode, isHost: state.isHost,
    }));
  } catch (err) { console.warn("Não foi possível salvar a sessão.", err); }
}
function clearSavedSession() {
  try { localStorage.removeItem(SESSION_KEY); }
  catch (err) { console.warn("Não foi possível limpar a sessão.", err); }
}
function restoreSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!saved?.playerId || !saved?.roomCode || !saved?.playerName) return false;
    state.playerId = saved.playerId; state.playerName = saved.playerName;
    state.roomCode = saved.roomCode; state.isHost = !!saved.isHost;
    return true;
  } catch (err) { clearSavedSession(); return false; }
}
async function restoreRoomAfterRefresh() {
  if (!state.roomCode) return false;
  const meta = await dbGetRoom(state.roomCode);
  if (!meta) {
    clearSavedSession();
    Object.assign(state, { screen:"landing", roomCode:null, isHost:false, room:null, players:[] });
    return false;
  }
  const players = await fetchPlayers(state.roomCode);
  if (!players) return true;
  const me = players.find((p) => p.id === state.playerId);
  if (!me) {
    clearSavedSession();
    Object.assign(state, { screen:"landing", roomCode:null, isHost:false, room:null, players:[], error:"Sua participação nessa sala não foi encontrada." });
    return false;
  }
  state.room = meta; state.players = players; state.isHost = meta.hostId === state.playerId;
  state.screen = meta.status === "lobby" ? "lobby" : "game"; state.error = "";
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

async function updateRoomSettings(discussionSeconds, votingSeconds) {
  if (!state.isHost || !state.roomCode || state.room?.status !== "lobby")
    return;

  const meta = await dbGetRoom(state.roomCode);
  if (!meta || meta.status !== "lobby") return;

  meta.discussionSeconds = Number(discussionSeconds) || 90;
  meta.votingSeconds = Number(votingSeconds) || 30;

  await dbUpdateRoom(state.roomCode, meta);
  state.room = meta;
  render();
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

  state.room = meta;
  state.players = players;

  if (meta.status === "active" && meta.investigationGameId) {
    const me = players.find(p => p.id === state.playerId);
    state.investigationItems = me ? await dbGetMyInvestigationItems(meta.investigationGameId, me.id) : [];
    if (meta.phase === "gameover") {
      state.investigationCase = await dbGetInvestigationTruth(meta.investigationGameId);
    } else {
      state.investigationCase = null;
    }
  } else {
    state.investigationItems = [];
    state.investigationCase = null;
  }

  if (meta.status === "lobby" && state.screen === "game") {
    state.screen = "lobby";
    state.selectedTarget = null;
    state.nightActionConfirmed = false;
    state.lastPhaseSeen = null;
    state.phaseClientDeadline = null;
    state.lastDataSignature = null;
  } else if (meta.status === "active" && state.screen !== "game") {
    state.screen = "game";
    state.selectedTarget = null;
    state.nightActionConfirmed = false;
  }

  const phaseChanged = meta.phase !== previousPhase;

  if (phaseChanged) {
    state.selectedTarget = null;
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
    const duration = getPhaseDuration(meta);
    state.phaseClientDeadline = duration ? Date.now() + duration * 1000 : null;
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
      state.nightActionConfirmed = true;
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
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      role: p.role,
      readyRound: p.readyRound,
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
    state.phaseClientDeadline = Date.now() + duration * 1000;
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

    if (current.phase === "night_transition") {
      await dbAdvancePhase(state.roomCode, "night_transition", "night");
    } else if (current.phase === "day_reveal") {
      await dbAdvancePhase(state.roomCode, "day_reveal", "day_discussion");
    } else if (current.phase === "day_discussion") {
      await dbAdvancePhase(state.roomCode, "day_discussion", "day_voting");
    } else if (current.phase === "day_voting") {
      await autoResolveVotes();
    } else if (current.phase === "day_results") {
      await advanceToNextNight();
    }
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

  if (error) console.error("dbAdvancePhase", error);
}

function getNextPhaseDuration(meta, phase) {
  if (phase === "night_transition") return NIGHT_TRANSITION_SECONDS;
  if (phase === "day_discussion") return Number(meta.discussionSeconds) || 90;
  if (phase === "day_voting") return Number(meta.votingSeconds) || 30;
  if (phase === "day_reveal") return DAY_REVEAL_SECONDS;
  if (phase === "day_results") return DAY_RESULTS_SECONDS;
  return 0;
}

async function dbResetPlayersForLobby(code) {
  const { error } = await sb
    .from("players")
    .update({ alive: true, role: null })
    .eq("room_code", code);

  if (error) console.error("dbResetPlayersForLobby", error);
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

  // Com 4 jogadores, os 4 papéis existem obrigatoriamente.
  // Acima de 4, os jogadores extras são cidadãos.
  const pool = shuffle([
    "assassino",
    "detetive",
    "anjo",
    ...Array(Math.max(1, players.length - 3)).fill("cidadao"),
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

  const meta = await dbGetRoom(state.roomCode);

  if (!meta || meta.status !== "lobby") {
    state.busy = false;
    return;
  }

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
  }));
  const investigationGame = await dbCreateInvestigationGame(
    state.roomCode,
    meta.round,
    assignedPlayers,
  );
  if (!investigationGame) {
    state.busy = false;
    state.error = "Não foi possível preparar a história e as pistas desta partida.";
    render();
    return;
  }
  meta.investigationGameId = investigationGame.id;

  await dbUpdateRoom(state.roomCode, meta);

  state.busy = false;
  state.selectedTarget = null;
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

  const { error } = await sb
    .from("rooms")
    .update({
      round: nextRound,
      phase: "role_reveal",
      phase_ends_at: null,
      log: nextLog,
    })
    .eq("code", state.roomCode)
    .eq("phase", "day_results");

  if (error) {
    console.error("advanceToNextNight", error);
    return;
  }

  const players = await fetchPlayers(state.roomCode);
  const investigationGame = await dbCreateInvestigationGame(
    state.roomCode,
    nextRound,
    players || [],
  );
  if (!investigationGame) {
    console.error("advanceToNextNight: não foi possível criar a nova pista da rodada");
    return;
  }

  await sb
    .from("rooms")
    .update({ investigation_game_id: investigationGame.id })
    .eq("code", state.roomCode)
    .eq("round", nextRound);
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
  await dbResetPlayersForLobby(state.roomCode);

  const meta = await dbGetRoom(state.roomCode);

  if (meta) {
    meta.status = "lobby";
    meta.phase = null;
    meta.winner = null;
    meta.lastDeathName = null;
    meta.lastEliminatedName = null;
    meta.phaseEndsAt = null;
    meta.investigationGameId = null;
    meta.log = ["A sala foi reiniciada. Todos podem jogar novamente."];
    await dbUpdateRoom(state.roomCode, meta);
  }

  state.busy = false;
  state.screen = "lobby";
  state.lastPhaseSeen = null;
  state.phaseClientDeadline = null;
  state.lastDataSignature = null;
  state.selectedTarget = null;
  state.nightActionConfirmed = false;
  refresh();
}

function leaveToLanding() {
  stopPolling();
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
    nightActionConfirmed: false,
    lastPhaseSeen: null,
    investigationItems: [],
    investigationCase: null,
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
        <input id="in-name" maxlength="18" placeholder="Lucas" autocomplete="off">
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

  const wrap = el(`<div class="wrap lobby-screen">
    <div class="top-bar">
      <span class="room-pill">Sala ${esc(state.roomCode || "")}</span>
      <button class="link-btn" id="btn-leave">Sair</button>
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

    ${players.length < 4
      ? `<p class="status-line">São necessários pelo menos 4 jogadores para começar.</p>`
      : `<p class="tagline lobby-role-summary">Com ${players.length} jogadores: 1 assassino, 1 detetive, 1 anjo e ${Math.max(1, players.length - 3)} cidadão(s).</p>`}

    <div class="card lobby-settings" style="margin-top:18px;">
      <h3>Configurações da sala</h3>
      <p class="tagline" style="margin-top:6px;">O anfitrião pode alterar os tempos enquanto a sala estiver no lobby.</p>

      <div class="field" style="margin-top:14px;">
        <label for="discussion-time">Tempo de discussão</label>
        <select id="discussion-time" ${state.isHost ? "" : "disabled"}>
          ${[30, 45, 60, 90, 120, 180]
            .map(
              (v) =>
                `<option value="${v}" ${Number(discussionSeconds) === v ? "selected" : ""}>${v} segundos</option>`,
            )
            .join("")}
        </select>
      </div>

      <div class="field">
        <label for="voting-time">Tempo de votação</label>
        <select id="voting-time" ${state.isHost ? "" : "disabled"}>
          ${[15, 30, 45, 60, 90, 120]
            .map(
              (v) =>
                `<option value="${v}" ${Number(votingSeconds) === v ? "selected" : ""}>${v} segundos</option>`,
            )
            .join("")}
        </select>
      </div>
      <p class="footnote">${state.isHost ? "Você pode mudar essas opções a qualquer momento antes de iniciar." : "Somente o anfitrião pode alterar os tempos."}</p>
    </div>

    <hr class="divider">

    ${state.isHost
      ? `<button class="btn btn-primary" id="btn-start" ${canStart ? "" : "disabled"}>${state.busy ? "Iniciando..." : "Iniciar jogo"}</button>`
      : `<p class="waiting-block">Aguardando o anfitrião iniciar o jogo...</p>`}
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

  const discussionSelect = wrap.querySelector("#discussion-time");
  const votingSelect = wrap.querySelector("#voting-time");
  if (state.isHost) {
    const saveSettings = async () => {
      if (state.busy) return;
      await updateRoomSettings(discussionSelect.value, votingSelect.value);
    };
    discussionSelect.onchange = saveSettings;
    votingSelect.onchange = saveSettings;
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

  // As duas fases cinematográficas ocupam a tela inteira.
  // Assim a revelação e a chegada da noite não ficam presas dentro do layout normal.
  if (meta.phase === "role_reveal") return me.alive ? renderRoleReveal(meta, me) : renderSpectator(meta, me);
  if (meta.phase === "night_transition") return renderNightTransition(meta);

  const wrap = el(`<div class="wrap"></div>`);
  wrap.appendChild(
    el(`<div class="top-bar">
    <span class="room-pill">Sala ${esc(state.roomCode)} · Rodada ${meta.round}</span>
    <button class="link-btn" id="btn-leave">Sair</button>
  </div>`),
  );
  wrap.querySelector("#btn-leave").onclick = leaveToLanding;

  const isNight = meta.phase === "night";
  const banner = el(`<div class="phase-banner ${isNight ? "night" : "day"}">
    ${isNight ? moonSvg(38) : sunSvg(38)}
    <div>
      <div class="phase-title">${phaseTitle(meta.phase)}</div>
      <div class="phase-sub">${phaseSubtitle(meta, me)}</div>
    </div>
  </div>`);
  wrap.appendChild(banner);

  if (!me.alive) {
    wrap.appendChild(renderSpectator(meta, me));
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

function renderNightTransition(meta) {
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

function renderInvestigationItemsHtml(me) {
  const items = state.investigationItems || [];
  if (!items.length) return "";
  const title = me.role === "detetive" ? "🔎 Suas pistas" : me.role === "assassino" ? "🔪 O que você sabe sobre sua noite" : "📜 Seus fatos";
  return `<div class="investigation-private-info"><div class="investigation-private-title">${title}</div><ol>${items.map(item => `<li>${esc(item.text_snapshot)}</li>`).join("")}</ol>${me.role === "detetive" ? `<small>Uma das pistas é verdadeira e duas são falsas. Você não sabe qual.</small>` : `<small>Essas informações fazem parte da história desta partida.</small>`}</div>`;
}

function renderRoleReveal(meta, me) {
  const info = ROLE_INFO[me.role] || ROLE_INFO.cidadao;
  const image = ROLE_IMAGES[me.role] || ROLE_IMAGES.cidadao;
  const card = el(`<div class="card role-reveal-screen">
    <div class="role-reveal-visual cinematic-role-card">
      <p class="eyebrow">CIDADE DORME</p>
      <h2 class="reveal-heading">Revelando seu papel...</h2>
      <div class="role-image-frame cinematic-role-image"><img src="${image}" alt="${esc(info.name)}" class="role-image"></div>
      <p class="role-you">Você é</p>
      <h1 class="role-name role-${esc(me.role)}">${esc(info.name)}</h1>
      <p class="tagline role-description">${esc(info.desc)}</p>
      ${renderInvestigationItemsHtml(me)}
      <div class="ready-status" id="ready-status">
        ${Number(me.readyRound || 0) === Number(meta.round) ? "Você já confirmou que está pronto." : "Leia tudo com atenção antes de confirmar."}
      </div>
      <button class="btn btn-primary" id="btn-ready" ${Number(me.readyRound || 0) === Number(meta.round) ? "disabled" : ""}>${Number(me.readyRound || 0) === Number(meta.round) ? "✓ Pronto" : "Li tudo — estou pronto"}</button>
      <p class="footnote" id="ready-count">Carregando jogadores prontos...</p>
    </div>
  </div>`);

  const readyButton = card.querySelector("#btn-ready");
  const readyCount = card.querySelector("#ready-count");

  const updateReadyCount = async () => {
    const players = await fetchPlayers(state.roomCode);
    const participants = (players || []).filter(p => p.alive);
    const ready = participants.filter(p => Number(p.readyRound || 0) === Number(meta.round)).length;
    const total = participants.length;
    readyCount.textContent = total ? `${ready}/${total} jogadores prontos` : "Aguardando jogadores...";
    if (readyButton && ready === total && total > 0) await tryAdvanceRoleReveal();
  };

  if (readyButton && Number(me.readyRound || 0) !== Number(meta.round)) {
    readyButton.onclick = async () => {
      readyButton.disabled = true;
      const ok = await dbMarkReady(state.roomCode, me.id, meta.round);
      if (ok) {
        readyButton.textContent = "✓ Pronto";
        card.querySelector("#ready-status").textContent = "Você já confirmou que está pronto.";
        await updateReadyCount();
        refresh();
      } else {
        readyButton.disabled = false;
      }
    };
  }
  updateReadyCount();
  return card;
}

function renderSpectator(meta, me) {
  return el(`<div class="card death-banner">
    ${skullSvg(58)}
    <h2>Você morreu</h2>
    <p>Você foi eliminado(a) da partida.</p>
    <p style="margin-top:8px;color:var(--ui-muted);">Seu papel era <strong>${esc(ROLE_INFO[me.role]?.name || "não identificado")}</strong>.</p>
    <p style="margin-top:8px;color:var(--ui-muted);">Continue na sala e acompanhe o que acontece até o fim.</p>
  </div>`);
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
  return (state.players || []).filter(
    (p) => p.alive && p.id !== playerId,
  );
}

function renderNightPanel(meta, me) {
  const shouldAnimate =
    state.nightEnteredAt && Date.now() - state.nightEnteredAt < 1400;
  const card = el(
    `<div class="card night-action-card${shouldAnimate ? " night-action-enter" : ""}"></div>`,
  );

  if (me.role === "cidadao") {
    card.appendChild(
      el(`<div class="night-role-header citizen-header">
      ${roleAvatar("cidadao")}
      <div><p class="eyebrow">NOITE — SUA VEZ DE OBSERVAR</p><h2>Você é o Cidadão</h2></div>
    </div>`),
    );
    card.appendChild(
      el(`<div class="waiting-role-panel">
      ${roleActionIcon("cidadao", 58)}
      <h3>A cidade dorme.</h3>
      <p>Você não tem ação nesta noite. Observe em silêncio e guarde suas suspeitas para o dia.</p>
    </div>`),
    );
    return card;
  }

  if (!["assassino", "anjo", "detetive"].includes(me.role)) {
    card.appendChild(
      el(
        `<div class="waiting-role-panel">${roleAvatar("cidadao", "role-avatar role-avatar-large")}<h3>Seu papel não possui ação nesta noite.</h3></div>`,
      ),
    );
    return card;
  }

  const headings = {
    assassino: ["Escolha uma vítima", "Escolha uma pessoa para eliminar."],
    anjo: ["Escolha quem proteger", "Escolha uma pessoa para proteger."],
    detetive: [
      "Escolha uma pessoa para investigar",
      "O resultado será apenas um sinal de papel especial ou cidadão.",
    ],
  };

  const [title, subtitle] = headings[me.role];
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
    <div class="action-heading">
      ${roleActionIcon(me.role, 52)}
      <div><h3>${title}</h3><p>${subtitle}</p></div>
    </div>
    <div class="target-grid visual-target-grid" id="night-targets"></div>
    <p class="footnote">Selecione uma pessoa. Depois confirme no botão de check.</p>
  </div>`);

  const grid = box.querySelector("#night-targets");
  targets.forEach((t) => {
    const row = el(`<div class="action-target-row visual-target-row"></div>`);
    const button = el(
      `<button class="target-btn action-target-button visual-target-button"></button>`,
    );
    button.innerHTML = `${playerAvatar(t.name)}<span>${esc(t.name)}${t.id === me.id ? " <small>(você)</small>" : ""}</span>`;
    if (state.selectedTarget === t.id) button.classList.add("selected");
    button.disabled = state.nightActionConfirmed;
    button.onclick = () => selectNightTarget(t.id);
    row.appendChild(button);

    if (state.selectedTarget === t.id && !state.nightActionConfirmed) {
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
      if (chosen) {
        const special = chosen.role === "assassino" || chosen.role === "anjo";
        box.appendChild(
          el(`<div class="investigation-result ${special ? "positive" : "negative"}">
          <span class="investigation-symbol">${special ? "✓" : "×"}</span>
          <div><strong>${special ? "Papel especial" : "Cidadão"}</strong><p>Investigação concluída.</p></div>
        </div>`),
        );
      }
    } else {
      box.appendChild(
        el(
          `<div class="action-confirmed"><span class="confirm-check">✓</span><span>Ação confirmada.</span></div>`,
        ),
      );
    }
    box.appendChild(
      el(
        `<p class="footnote">Sua ação já foi registrada e não pode ser alterada nesta noite.</p>`,
      ),
    );
  }

  card.appendChild(box);
  return card;
}

function renderDayReveal(meta, me) {
  const card = el(`<div class="card day-event-card">
    <div class="event-icon death-icon">${meta.lastDeathName ? skullSvg(58) : sunriseSvg(58)}</div>
    <p class="eyebrow">AO AMANHECER</p>
    <h2>${meta.lastDeathName ? `${esc(meta.lastDeathName)} não sobreviveu à noite.` : "Ninguém morreu esta noite."}</h2>
    <p class="tagline">A cidade terá alguns segundos para absorver o que aconteceu.</p>
    <div class="phase-mini-timer" id="day-reveal-timer">00:07</div>
  </div>`);
  attachCountdown(card.querySelector("#day-reveal-timer"), meta);
  return card;
}

function renderInvestigationPanelHtml(me) {
  const items = state.investigationItems || [];
  if (!items.length) return "";
  const title = me.role === "detetive" ? "🔎 Suas pistas" : me.role === "assassino" ? "🔪 O que você sabe" : "📜 Seus fatos";
  const note = me.role === "detetive" ? "Uma é verdadeira e duas são falsas. O sistema não revela qual." : "Essas informações são verdadeiras dentro da história desta partida.";
  return `<div class="investigation-panel"><div class="investigation-panel-title">${title}</div><ol>${items.map(item => `<li>${esc(item.text_snapshot)}</li>`).join("")}</ol><small>${note}</small></div>`;
}

function renderDiscussion(meta, me) {
  const card = el(`<div class="card discussion-card">
    <div class="discussion-head">
      ${sunSvg(42)}
      <div><p class="eyebrow">FASE DE DISCUSSÃO</p><h2>Conversem e descubram os assassinos.</h2></div>
    </div>
    ${renderInvestigationPanelHtml(me)}
    <div class="timer-panel"><span>Tempo restante</span><strong id="timer-display">--:--</strong></div>
    <p class="footnote">A discussão termina automaticamente. Depois começa a votação.</p>
  </div>`);
  attachCountdown(card.querySelector("#timer-display"), meta);
  return card;
}

function renderVoting(meta, me) {
  const alivePlayers = (state.players || []).filter((p) => p.alive);
  const box = el(`<div class="card voting-card">
    <div class="discussion-head">
      ${ballotSvg(42)}
      <div><p class="eyebrow">FASE DE VOTAÇÃO</p><h2>Escolha uma pessoa para votar.</h2></div>
    </div>
    <div class="timer-panel"><span>Tempo restante</span><strong id="vote-timer">--:--</strong></div>
    <div class="target-grid visual-target-grid" id="vote-targets"></div>
    <button class="target-btn skip-button" id="vote-abstain">Pular</button>
    <p class="footnote">A votação termina automaticamente quando o tempo acabar.</p>
  </div>`);

  const grid = box.querySelector("#vote-targets");
  alivePlayers
    .filter((p) => p.id !== me.id)
    .forEach((t) => {
      const b = el(`<button class="target-btn visual-target-button"></button>`);
      b.innerHTML = `${playerAvatar(t.name)}<span>${esc(t.name)}</span>`;
      if (state.selectedTarget === t.id) b.classList.add("selected");
      b.onclick = () => submitVote(t.id);
      grid.appendChild(b);
    });

  const abstainBtn = box.querySelector("#vote-abstain");
  abstainBtn.innerHTML = `${playerAvatar("P")}<span>Pular</span>`;
  if (state.selectedTarget === "abstain") abstainBtn.classList.add("selected");
  abstainBtn.onclick = () => submitVote("abstain");

  attachCountdown(box.querySelector("#vote-timer"), meta);
  return box;
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
  const truth = state.investigationCase;
  if (!truth?.scenario) return `<div class="card truth-card"><h3>A história verdadeira</h3><p class="footnote">A história desta partida não foi carregada. Verifique se o banco de investigação foi criado corretamente.</p></div>`;
  return `<div class="card truth-card"><p class="eyebrow">A VERDADE DO CASO</p><h2>${esc(truth.scenario.title)}</h2><p class="truth-summary">${esc(truth.scenario.truth_summary || truth.scenario.description || "")}</p><div class="truth-facts"><h3>O que realmente aconteceu</h3><ol>${truth.facts.map(f => `<li>${esc(f.text)}</li>`).join("")}</ol></div></div>`;
}

function renderGameOver() {
  const meta = state.room;
  const cidadeVenceu = meta.winner === "cidade";
  const me = myPlayer();

  const wrap = el(`<div class="wrap game-over-wrap">
    ${me && !me.alive ? `<div class="card death-banner">${skullSvg(54)}<h2>Você morreu</h2><p>Você foi eliminado(a), mas pode continuar na sala e acompanhar o resultado.</p></div>` : ""}
    <div class="center-stage">
      <div class="card winner-banner">
        ${trophySvg(64)}
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
  if (replayBtn) replayBtn.onclick = hostReplayRoom;
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
    .investigation-symbol {
      font-size:4.5rem;
      line-height:1;
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
    .visual-target-row{display:flex;gap:8px;}
    .visual-target-button{display:flex !important;align-items:center;gap:12px;text-align:left !important;padding:10px 12px !important;min-height:56px;}
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
    .investigation-result.positive{border-color:rgba(92,218,157,.5) !important;}
    .investigation-result.negative{border-color:rgba(232,91,101,.45) !important;}
    .investigation-symbol{font-size:3.3rem;line-height:1;font-weight:700;}
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
  `;
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
    if (restored) { render(); startPolling(); return; }
  }
  render();
})();


/* ===== Revelação: pronto por jogador ===== */
(function injectReadyRevealStyles(){
  const style=document.createElement("style");
  style.textContent=`
    .ready-status{margin:16px 0 10px;padding:12px 14px;border:1px solid var(--ui-line);border-radius:12px;background:rgba(255,255,255,.025);color:var(--ui-muted);text-align:center;}
    #btn-ready{width:min(100%,420px);margin:8px auto 0;display:block;}
    #btn-ready:disabled{opacity:.75;cursor:default;}
    #ready-count{margin-top:10px;text-align:center;}
  `;
  document.head.appendChild(style);
})();

/* ============ Supabase ============ */
const SUPABASE_URL = 'https://umozumbmjfjdmmppelwa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb3p1bWJtamZqZG1tcHBlbHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MjA2MjAsImV4cCI6MjEwNDk5NjYyMH0.t01eyAh46XaeIP85ch-aSvjMmlGfEE92UiH2hSEM7K8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function metaFromRow(row){
  return {
    hostId: row.host_id, status: row.status, phase: row.phase, round: row.round,
    log: row.log || [], lastDeathName: row.last_death_name, lastEliminatedName: row.last_eliminated_name,
    winner: row.winner, discussionSeconds: row.discussion_seconds || 75,
    votingSeconds: row.voting_seconds || 30,
    phaseEndsAt: row.phase_ends_at ? new Date(row.phase_ends_at).getTime() : null
  };
}
function rowFromMeta(code, meta){
  return {
    code, host_id: meta.hostId, status: meta.status, phase: meta.phase, round: meta.round,
    log: meta.log, last_death_name: meta.lastDeathName, last_eliminated_name: meta.lastEliminatedName,
    winner: meta.winner, discussion_seconds: meta.discussionSeconds,
    voting_seconds: meta.votingSeconds,
    phase_ends_at: meta.phaseEndsAt ? new Date(meta.phaseEndsAt).toISOString() : null
  };
}
async function dbGetRoom(code){
  const { data, error } = await sb.from('rooms').select('*').eq('code', code).maybeSingle();
  if(error){ console.error('dbGetRoom', error); return null; }
  return data ? metaFromRow(data) : null;
}
async function dbCreateRoom(code, meta){
  const { error } = await sb.from('rooms').insert(rowFromMeta(code, meta));
  if(error) console.error('dbCreateRoom', error);
}
async function dbUpdateRoom(code, meta){
  const row = rowFromMeta(code, meta);
  delete row.code;
  const { error } = await sb.from('rooms').update(row).eq('code', code);
  if(error) console.error('dbUpdateRoom', error);
}
async function dbUpsertPlayer(code, player){
  const { error } = await sb.from('players').upsert({
    room_code: code, id: player.id, name: player.name, alive: player.alive, role: player.role
  }, { onConflict: 'room_code,id' });
  if(error) console.error('dbUpsertPlayer', error);
}
async function dbFetchPlayers(code){
  const { data, error } = await sb.from('players').select('*').eq('room_code', code).order('joined_at');
  if(error){ console.error('dbFetchPlayers', error); return []; }
  return data.map(r => ({ id:r.id, name:r.name, alive:r.alive, role:r.role, joinedAt: new Date(r.joined_at).getTime() }));
}
async function dbSubmitNightAction(code, round, role, playerId, targetId){
  const { error } = await sb.from('night_actions').upsert({
    room_code: code, round, role, player_id: playerId, target_id: targetId
  }, { onConflict: 'room_code,round,role,player_id' });
  if(error) console.error('dbSubmitNightAction', error);
}
async function dbGetNightActions(code, round, role){
  const { data, error } = await sb.from('night_actions').select('player_id,target_id').eq('room_code', code).eq('round', round).eq('role', role);
  if(error){ console.error('dbGetNightActions', error); return []; }
  return data.map(r => ({ playerId:r.player_id, targetId:r.target_id }));
}
async function dbSubmitVote(code, round, voterId, targetId){
  const { error } = await sb.from('votes').upsert({
    room_code: code, round, voter_id: voterId, target_id: targetId
  }, { onConflict: 'room_code,round,voter_id' });
  if(error) console.error('dbSubmitVote', error);
}
async function dbGetVotes(code, round){
  const { data, error } = await sb.from('votes').select('target_id').eq('room_code', code).eq('round', round);
  if(error){ console.error('dbGetVotes', error); return []; }
  return data.map(r => r.target_id);
}

/* ============ helpers: misc ============ */
function genId(){
  return 'p_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genRoomCode(){
  let out = '';
  for(let i=0;i<5;i++) out += CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];
  return out;
}
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function computeRoleCounts(n){
  if(n < 4) return { assassino:0, detetive:0, anjo:0, cidadao:n };

  // A partir de 4 jogadores existem obrigatoriamente:
  // 1 Assassino + 1 Detetive + 1 Anjo + 1 Cidadão.
  // Acima de 4, todos os demais são cidadãos comuns.
  return { assassino:1, detetive:1, anjo:1, cidadao:n-4 };
}
const ROLE_INFO = {
  assassino: { glyph:'🔪', name:'Assassino', desc:'Toda noite, você e os outros assassinos escolhem uma vítima para eliminar. De dia, finja ser inocente.' },
  detetive:  { glyph:'🔎', name:'Detetive', desc:'Toda noite, você investiga uma pessoa. O resultado indica apenas se ela tem uma função especial ou se é um cidadão comum.' },
  anjo:      { glyph:'🕊️', name:'Anjo', desc:'Toda noite, você escolhe alguém para proteger. Se essa pessoa for atacada, ela sobrevive.' },
  cidadao:   { glyph:'🌾', name:'Cidadão', desc:'Você não tem poderes especiais. Use a conversa e o voto para descobrir quem são os assassinos.' }
};
const ROLE_IMAGES = {
  assassino: 'assets/roles/assassino.svg',
  detetive: 'assets/roles/detetive.png',
  anjo: 'assets/roles/anjo.png',
  cidadao: 'assets/roles/cidadao.png'
};

/* ============ app state ============ */
const state = {
  screen:'landing',        // landing | create | join | lobby | game
  playerId: genId(),
  playerName:'',
  roomCode:null,
  isHost:false,
  room:null,               // meta object
  players:[],              // array of player objects
  error:'',
  busy:false,
  selectedTarget:null,
  nightActionConfirmed:false,
  pollHandle:null,
  lastPhaseSeen:null,
  discussionEndsAt:null,
  phaseTimerHandle:null,
  nightResolving:false,
  autoResolvingVotes:false,
  lastNightTransitionRound:null,
  audioContext:null,
  audioUnlocked:false,
  nightEnteredAt:null
};

/* ============ room meta shape ============
{
  hostId, status:'lobby'|'active', phase:'role_reveal'|'night_transition'|'night'|'day_reveal'|'day_discussion'|'day_voting'|'day_results'|'gameover',
  round, log:[strings], lastDeathName, lastEliminatedName, winner: 'cidade'|'assassinos'|null,
  discussionSeconds
}
*/

/* ============ core actions ============ */
async function createRoom(name){
  let code = genRoomCode();
  const meta = {
    hostId: state.playerId, status:'lobby', phase:null, round:0,
    log:[], lastDeathName:null, lastEliminatedName:null, winner:null,
    discussionSeconds:90,
    votingSeconds:30,
    phaseEndsAt:null
  };
  await dbCreateRoom(code, meta);
  await dbUpsertPlayer(code, { id: state.playerId, name, alive:true, role:null });
  state.roomCode = code;
  state.isHost = true;
  state.playerName = name;
  enterLobby();
}

async function updateRoomSettings(discussionSeconds, votingSeconds){
  if(!state.isHost || !state.roomCode || state.room?.status !== 'lobby') return;

  const meta = await dbGetRoom(state.roomCode);
  if(!meta || meta.status !== 'lobby') return;

  meta.discussionSeconds = Number(discussionSeconds) || 90;
  meta.votingSeconds = Number(votingSeconds) || 30;

  await dbUpdateRoom(state.roomCode, meta);
  state.room = meta;
  render();
}

async function joinRoom(code, name){
  code = code.trim().toUpperCase();
  const meta = await dbGetRoom(code);
  if(!meta){ state.error = 'Sala não encontrada. Confira o código.'; render(); return; }
  if(meta.status !== 'lobby'){ state.error = 'Esse jogo já começou. Peça um novo código.'; render(); return; }
  await dbUpsertPlayer(code, { id: state.playerId, name, alive:true, role:null });
  state.roomCode = code;
  state.isHost = (meta.hostId === state.playerId);
  state.playerName = name;
  state.error = '';
  enterLobby();
}

function enterLobby(){
  state.screen = 'lobby';
  state.error='';
  render();
  startPolling();
}

async function fetchPlayers(code){
  return await dbFetchPlayers(code);
}

async function refresh(){
  if(!state.roomCode) return;

  const meta = await dbGetRoom(state.roomCode);
  if(!meta) return;

  const players = await fetchPlayers(state.roomCode);

  state.room = meta;
  state.players = players;

  if(meta.status === 'lobby' && state.screen === 'game'){
    state.screen = 'lobby';
    state.selectedTarget = null;
    state.nightActionConfirmed = false;
    state.lastPhaseSeen = null;
  } else if(meta.status === 'active' && state.screen !== 'game'){
    state.screen = 'game';
    state.selectedTarget = null;
    state.nightActionConfirmed = false;
  }

  if(meta.phase !== state.lastPhaseSeen){
    state.selectedTarget = null;
    state.nightActionConfirmed = false;
    if(meta.phase === 'night') state.nightEnteredAt = Date.now();
    state.lastPhaseSeen = meta.phase;
  }

  const me = (state.players || []).find(p => p.id === state.playerId);

  // Recupera do banco a ação já confirmada pelo próprio jogador.
  // Isso impede que um refresh permita escolher outra pessoa.
  if(meta.phase === 'night' && me && me.alive && ['assassino','anjo','detetive'].includes(me.role)){
    const rows = await dbGetNightActions(state.roomCode, meta.round, me.role);
    const ownAction = rows.find(row => row.playerId === state.playerId);

    if(ownAction){
      state.selectedTarget = ownAction.targetId;
      state.nightActionConfirmed = true;
    }
  }

  render();

  if(meta.phase === 'role_reveal'){
    startPhaseTimer(meta);
  } else if(meta.phase === 'night'){
    tryAutoResolveNight();
  } else if(meta.phase === 'day_discussion' || meta.phase === 'day_voting'){
    startPhaseTimer(meta);
  }
}

function formatSeconds(total){
  total = Number(total)||0;
  if(total < 60) return `${total}s`;
  const m = Math.floor(total/60), s = total%60;
  return s ? `${m}m ${s}s` : `${m} min`;
}

function formatTimer(ms){
  const remain = Math.max(0, Math.ceil(ms/1000));
  const m = String(Math.floor(remain/60)).padStart(2,'0');
  const s = String(remain%60).padStart(2,'0');
  return `${m}:${s}`;
}

function startPhaseTimer(meta){
  clearTimeout(state.phaseTimerHandle);

  if(!meta.phaseEndsAt) return;

  const check = async ()=>{
    const current = await dbGetRoom(state.roomCode);
    if(!current || current.phase !== meta.phase) return;

    const remain = current.phaseEndsAt - Date.now();

    if(remain > 0){
      state.phaseTimerHandle = setTimeout(check, Math.min(remain, 500));
      return;
    }

    if(current.phase === 'role_reveal'){
      await dbAdvancePhase(state.roomCode, 'role_reveal', 'night_transition');
    } else if(current.phase === 'night_transition'){
      await dbAdvancePhase(state.roomCode, 'night_transition', 'night');
    } else if(current.phase === 'day_discussion'){
      await dbAdvancePhase(state.roomCode, 'day_discussion', 'day_voting');
    } else if(current.phase === 'day_voting'){
      await autoResolveVotes();
    }
  };

  check();
}

async function dbAdvancePhase(code, fromPhase, toPhase){
  const meta = await dbGetRoom(code);
  if(!meta || meta.phase !== fromPhase) return;

  const duration = toPhase === 'day_voting'
    ? (meta.votingSeconds || 30)
    : toPhase === 'night_transition'
      ? 4200
      : 0;

  const phaseEndsAt = duration
    ? new Date(Date.now() + duration * 1000).toISOString()
    : null;

  const { error } = await sb.from('rooms').update({
    phase: toPhase,
    phase_ends_at: phaseEndsAt
  }).eq('code', code).eq('phase', fromPhase);

  if(error) console.error('dbAdvancePhase', error);
}

async function dbResetPlayersForLobby(code){
  const { error } = await sb.from('players')
    .update({ alive:true, role:null })
    .eq('room_code', code);

  if(error) console.error('dbResetPlayersForLobby', error);
}

function startPolling(){
  stopPolling();
  refresh();
  subscribeRealtime(state.roomCode);
  state.pollHandle = setInterval(refresh, 4000); // reforço, caso o realtime perca algum evento
}
function stopPolling(){
  if(state.pollHandle){ clearInterval(state.pollHandle); state.pollHandle=null; }
  clearTimeout(state.phaseTimerHandle);
  state.phaseTimerHandle=null;
  if(state.channel){ sb.removeChannel(state.channel); state.channel=null; }
}
function subscribeRealtime(code){
  state.channel = sb.channel('room-'+code)
    .on('postgres_changes', { event:'*', schema:'public', table:'rooms', filter:`code=eq.${code}` }, refresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'players', filter:`room_code=eq.${code}` }, refresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'night_actions', filter:`room_code=eq.${code}` }, refresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'votes', filter:`room_code=eq.${code}` }, refresh)
    .subscribe();
}

/* ---- host: start game ---- */
async function hostStartGame(){
  if(!state.isHost || state.busy) return;

  state.busy = true;
  render();

  const players = await fetchPlayers(state.roomCode);

  if(players.length < 4){
    state.busy = false;
    state.error = 'São necessários pelo menos 4 jogadores para começar.';
    render();
    return;
  }

  const counts = computeRoleCounts(players.length);
  let pool = [];

  for(let i=0;i<counts.assassino;i++) pool.push('assassino');
  for(let i=0;i<counts.detetive;i++) pool.push('detetive');
  for(let i=0;i<counts.anjo;i++) pool.push('anjo');
  for(let i=0;i<counts.cidadao;i++) pool.push('cidadao');

  pool = shuffle(pool);
  const shuffledPlayers = shuffle(players);

  await Promise.all(shuffledPlayers.map((p, idx) =>
    dbUpsertPlayer(state.roomCode, {
      ...p,
      role: pool[idx],
      alive:true
    })
  ));

  const meta = await dbGetRoom(state.roomCode);

  if(!meta || meta.status !== 'lobby'){
    state.busy = false;
    return;
  }

  meta.status = 'active';
  meta.phase = 'role_reveal';
  meta.round = (meta.round || 0) + 1;
  meta.phaseEndsAt = new Date(Date.now() + 5000).toISOString();
  meta.lastDeathName = null;
  meta.lastEliminatedName = null;
  meta.winner = null;
  meta.log = [`Os papéis foram distribuídos. A cidade se prepara para a primeira noite...`];

  await dbUpdateRoom(state.roomCode, meta);

  state.busy = false;
  state.selectedTarget = null;
  state.nightActionConfirmed = false;
  state.lastPhaseSeen = null;

  refresh();
}

/* ---- night actions ---- */
function selectNightTarget(targetId){
  if(state.nightActionConfirmed) return;
  state.selectedTarget = targetId;
  render();
}

async function confirmNightAction(){
  if(state.nightActionConfirmed || !state.selectedTarget) return;

  const me = myPlayer();
  if(!me || !me.alive) return;

  const validRoles = ['assassino','anjo','detetive'];
  if(!validRoles.includes(me.role)) return;

  const target = (state.players || []).find(p => p.id === state.selectedTarget);
  if(!target || !target.alive || target.id === me.id && me.role !== 'anjo') return;

  await dbSubmitNightAction(
    state.roomCode,
    state.room.round,
    me.role,
    state.playerId,
    state.selectedTarget
  );

  state.nightActionConfirmed = true;
  render();

  await tryAutoResolveNight();
}

function tally(counts){
  let best=null, bestN=-1, tie=false;
  Object.entries(counts).forEach(([k,v])=>{
    if(v>bestN){ best=k; bestN=v; tie=false; }
    else if(v===bestN){ tie=true; }
  });
  return { winner: tie? null : best, tie };
}

async function tryAutoResolveNight(){
  if(state.nightResolving || !state.room || state.room.phase !== 'night') return;

  const players = await fetchPlayers(state.roomCode);

  const required = players.filter(
    p => p.alive && ['assassino','anjo','detetive'].includes(p.role)
  );

  if(!required.length) return;

  const actions = [];

  for(const role of ['assassino','anjo','detetive']){
    const rows = await dbGetNightActions(state.roomCode, state.room.round, role);
    actions.push(...rows);
  }

  const acted = new Set(actions.map(a => a.playerId));

  if(required.some(p => !acted.has(p.id))) return;

  state.nightResolving = true;

  try{
    await hostResolveNight();
  }finally{
    state.nightResolving = false;
  }
}

async function hostResolveNight(){
  if(state.busy) return;
  state.busy = true; render();
  const round = state.room.round;
  const players = await fetchPlayers(state.roomCode);
  const aliveAssassinos = players.filter(p=>p.alive && p.role==='assassino');
  const assassinoVotes = await dbGetNightActions(state.roomCode, round, 'assassino');
  const counts = {};
  assassinoVotes.forEach(a=>{
    if(a.targetId) counts[a.targetId] = (counts[a.targetId]||0)+1;
  });
  let victimId = null;
  if(Object.keys(counts).length){
    const t = tally(counts);
    const candidates = t.winner ? [t.winner] : Object.keys(counts);
    victimId = candidates[Math.floor(Math.random()*candidates.length)];
  } else if(aliveAssassinos.length){
    const targets = players.filter(p=>p.alive && p.role!=='assassino');
    if(targets.length) victimId = targets[Math.floor(Math.random()*targets.length)].id;
  }
  const anjoPicks = await dbGetNightActions(state.roomCode, round, 'anjo');
  const anjoPick = anjoPicks[0]?.targetId || null;
  let deathName = null;
  if(victimId && victimId !== anjoPick){
    const victim = players.find(p=>p.id===victimId);
    if(victim){
      await dbUpsertPlayer(state.roomCode, { ...victim, alive:false });
      deathName = victim.name;
    }
  }
  const updatedPlayers = await fetchPlayers(state.roomCode);
  const meta = await dbGetRoom(state.roomCode);
  meta.lastDeathName = deathName;
  meta.phaseEndsAt = null;
  meta.log.push(deathName ? `🌅 Ao amanhecer, ${deathName} foi encontrado(a) sem vida.` : `🌅 A cidade acorda e, surpreendentemente, ninguém morreu esta noite.`);
  const win = checkWinner(updatedPlayers);
  if(win){
    meta.phase = 'gameover';
    meta.winner = win;
    meta.log.push(win==='cidade' ? '🌾 Os cidadãos descobriram e eliminaram todos os assassinos!' : '🔪 Os assassinos dominaram a cidade!');
  } else {
    meta.phase = 'day_reveal';
  }
  await dbUpdateRoom(state.roomCode, meta);
  state.busy = false;
  refresh();
}

function checkWinner(players){
  const alive = players.filter(p=>p.alive);
  const assassinosVivos = alive.filter(p=>p.role==='assassino').length;
  const outros = alive.length - assassinosVivos;
  if(assassinosVivos === 0) return 'cidade';
  if(assassinosVivos >= outros) return 'assassinos';
  return null;
}

async function hostGoToDiscussion(){
  const meta = await dbGetRoom(state.roomCode);
  meta.phase = 'day_discussion';
  meta.phaseEndsAt = Date.now() + (meta.discussionSeconds||90)*1000;
  await dbUpdateRoom(state.roomCode, meta);
  refresh();
}
async function submitVote(targetId){
  await dbSubmitVote(state.roomCode, state.room.round, state.playerId, targetId);
  state.selectedTarget = targetId;
  render();
}
async function autoResolveVotes(){
  if(state.busy || !state.room || state.room.phase !== 'day_voting') return;

  state.autoResolvingVotes = true;
  try {
    await hostResolveVotes();
  } finally {
    state.autoResolvingVotes = false;
  }
}

async function hostResolveVotes(){
  if(state.busy && !state.autoResolvingVotes) return;
  state.busy = true; render();
  const round = state.room.round;
  const players = await fetchPlayers(state.roomCode);
  const votes = await dbGetVotes(state.roomCode, round);
  const counts = {};
  votes.forEach(v=>{ if(v && v!=='abstain') counts[v]=(counts[v]||0)+1; });
  let eliminatedName = null;
  if(Object.keys(counts).length){
    const t = tally(counts);
    if(t.winner){
      const p = players.find(pl=>pl.id===t.winner);
      if(p){
        await dbUpsertPlayer(state.roomCode, { ...p, alive:false });
        eliminatedName = p.name;
      }
    }
  }
  const updatedPlayers = await fetchPlayers(state.roomCode);
  const meta = await dbGetRoom(state.roomCode);
  meta.lastEliminatedName = eliminatedName;
  meta.phaseEndsAt = null;
  meta.log.push(eliminatedName ? `🗳️ A cidade votou e eliminou ${eliminatedName}.` : `🗳️ Os votos empataram — ninguém foi eliminado.`);
  const win = checkWinner(updatedPlayers);
  if(win){
    meta.phase = 'gameover';
    meta.winner = win;
    meta.log.push(win==='cidade' ? '🌾 Os cidadãos descobriram e eliminaram todos os assassinos!' : '🔪 Os assassinos dominaram a cidade!');
  } else {
    meta.phase = 'day_results';
  }
  await dbUpdateRoom(state.roomCode, meta);
  state.busy = false;
  refresh();
}
async function hostNextNight(){
  const meta = await dbGetRoom(state.roomCode);
  if(!meta || meta.phase !== 'day_results') return;

  meta.round += 1;
  meta.phase = 'role_reveal';
  meta.phaseEndsAt = new Date(Date.now() + 5000).toISOString();
  meta.log.push(`🌙 A cidade se prepara para a rodada ${meta.round}...`);
  await dbUpdateRoom(state.roomCode, meta);
  refresh();
}

async function hostReplayRoom(){
  if(!state.isHost || state.busy) return;

  state.busy = true;

  await dbResetPlayersForLobby(state.roomCode);

  const meta = await dbGetRoom(state.roomCode);

  if(meta){
    meta.status = 'lobby';
    meta.phase = null;
    meta.winner = null;
    meta.lastDeathName = null;
    meta.lastEliminatedName = null;
    meta.phaseEndsAt = null;
    meta.log = ['A sala foi reiniciada. Todos podem jogar novamente.'];
    await dbUpdateRoom(state.roomCode, meta);
  }

  state.busy = false;
  state.screen = 'lobby';
  state.lastPhaseSeen = null;
  state.selectedTarget = null;
  state.nightActionConfirmed = false;
  refresh();
}

function leaveToLanding(){
  stopPolling();
  Object.assign(state, {
    screen:'landing', roomCode:null, isHost:false, room:null, players:[],
    error:'', busy:false, selectedTarget:null, nightActionConfirmed:false, lastPhaseSeen:null
  });
  render();
}

/* ============ rendering ============ */
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function esc(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }

function moonSvg(size=44){
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 6C20 8 13 17 13 27c0 11 9 20 20 20 5 0 9.5-1.8 13-4.8C40.5 45 33.7 48 26 48 12.7 48 2 37.3 2 24S12.7 0 26 0c1.4 0 2.7.1 4 .3-1.4 1.7-2 3.7 0 5.7z" fill="#f2c078" transform="translate(4,0) scale(0.85)"/>
  </svg>`;
}
function sunSvg(size=44){
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

function renderStars(){
  const c = document.getElementById('stars');
  if(c.childElementCount) return;
  for(let i=0;i<40;i++){
    const s = document.createElement('div');
    s.className='star';
    s.style.left = Math.random()*100+'%';
    s.style.top = Math.random()*70+'%';
    s.style.animationDelay = (Math.random()*4)+'s';
    c.appendChild(s);
  }
}

function render(){
  renderStars();
  const app = document.getElementById('app');
  app.innerHTML = '';
  let node;
  if(state.screen==='landing') node = renderLanding();
  else if(state.screen==='create') node = renderCreate();
  else if(state.screen==='join') node = renderJoin();
  else if(state.screen==='lobby') node = renderLobby();
  else if(state.screen==='game') node = renderGame();
  app.appendChild(node);
}

function renderLanding(){
  const wrap = el(`<div class="wrap">
    <div class="center-stage">
      <div>
        <div class="brand">${moonSvg(40)}<h1>Cidade Dorme</h1></div>
        <p class="tagline">Um jogo de dedução social. Descubra os assassinos antes que seja tarde — ou disfarce-se entre os cidadãos.</p>
      </div>
      <div class="card">
        <div class="choice-row">
          <button class="choice" id="btn-create"><span class="glyph">🏮</span><span class="label">Criar sala</span></button>
          <button class="choice" id="btn-join"><span class="glyph">🚪</span><span class="label">Entrar em sala</span></button>
        </div>
        <p class="footnote" style="margin-top:0;">Jogue com 4 ou mais pessoas, cada uma no seu próprio celular.</p>
      </div>
    </div>
    <p class="footnote">Papéis: Assassino 🔪 · Cidadão 🌾 · Detetive 🔎 · Anjo 🕊️</p>
  </div>`);
  wrap.querySelector('#btn-create').onclick = ()=>{ state.screen='create'; state.error=''; render(); };
  wrap.querySelector('#btn-join').onclick = ()=>{ state.screen='join'; state.error=''; render(); };
  return wrap;
}

function renderCreate(){
  const wrap = el(`<div class="wrap">
    <div class="center-stage">
      <div class="brand">${moonSvg(34)}<h2>Criar uma sala</h2></div>
      <div class="card">
        <div class="field">
          <label for="in-name">Seu nome</label>
          <input id="in-name" maxlength="18" placeholder="Como quer ser chamado(a)?" autocomplete="off">
        </div>
        <div class="field">
          <label for="in-discussion">Tempo de discussão</label>
          <select id="in-discussion">
            <option value="30">30 segundos</option>
            <option value="60">1 minuto</option>
            <option value="90" selected>1 minuto e 30 segundos</option>
            <option value="120">2 minutos</option>
            <option value="180">3 minutos</option>
          </select>
        </div>
        <div class="field">
          <label for="in-voting">Tempo de votação</label>
          <select id="in-voting">
            <option value="15">15 segundos</option>
            <option value="30" selected>30 segundos</option>
            <option value="60">1 minuto</option>
            <option value="90">1 minuto e 30 segundos</option>
            <option value="120">2 minutos</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-go">Criar sala</button>
        <p class="error-msg">${esc(state.error)}</p>
      </div>
      <button class="link-btn" id="btn-back">← Voltar</button>
    </div>
  </div>`);
  const input = wrap.querySelector('#in-name');
  wrap.querySelector('#btn-go').onclick = async ()=>{
    const name = input.value.trim();
    if(!name){ state.error='Digite um nome.'; render(); return; }
    state.error='';
    const discussionSeconds = Number(wrap.querySelector('#in-discussion').value);
    const votingSeconds = Number(wrap.querySelector('#in-voting').value);
    await createRoom(name, discussionSeconds, votingSeconds);
  };
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') wrap.querySelector('#btn-go').click(); });
  wrap.querySelector('#btn-back').onclick = ()=>{ state.screen='landing'; render(); };
  return wrap;
}

function renderJoin(){
  const wrap = el(`<div class="wrap">
    <div class="center-stage">
      <div class="brand">${moonSvg(34)}<h2>Entrar em uma sala</h2></div>
      <div class="card">
        <div class="field">
          <label for="in-code">Código da sala</label>
          <input id="in-code" class="code-input" maxlength="5" placeholder="XXXXX" autocomplete="off">
        </div>
        <div class="field">
          <label for="in-name2">Seu nome</label>
          <input id="in-name2" maxlength="18" placeholder="Como quer ser chamado(a)?" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="btn-go2">Entrar</button>
        <p class="error-msg">${esc(state.error)}</p>
      </div>
      <button class="link-btn" id="btn-back2">← Voltar</button>
    </div>
  </div>`);
  const codeInput = wrap.querySelector('#in-code');
  const nameInput = wrap.querySelector('#in-name2');
  wrap.querySelector('#btn-go2').onclick = async ()=>{
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    if(!code || !name){ state.error='Preencha o código e o nome.'; render(); return; }
    await joinRoom(code, name);
  };
  nameInput.addEventListener('keydown', e=>{ if(e.key==='Enter') wrap.querySelector('#btn-go2').click(); });
  wrap.querySelector('#btn-back2').onclick = ()=>{ state.screen='landing'; render(); };
  return wrap;
}

function renderLobby(){
  const players = state.players || [];
  const canStart = players.length >= 4 && state.isHost;
  const counts = computeRoleCounts(players.length);
  const discussionSeconds = state.room?.discussionSeconds || 90;
  const votingSeconds = state.room?.votingSeconds || 30;

  const wrap = el(`<div class="wrap">
    <div class="top-bar">
      <span class="room-pill">Sala ${esc(state.roomCode || '')}</span>
      <button class="link-btn" id="btn-leave">Sair</button>
    </div>

    <div class="card" style="text-align:center;">
      <p class="room-code-label">código da sala</p>
      <div class="room-code">${esc(state.roomCode || '')}</div>
      <p class="tagline">Compartilhe esse código com os outros jogadores.</p>
    </div>

    <h3 style="margin:22px 0 12px;">Jogadores (${players.length})</h3>
    <div class="player-list" id="lobby-players"></div>

    ${players.length < 4
      ? `<p class="status-line"><span class="pulse"></span>São necessários pelo menos 4 jogadores para começar.</p>`
      : `<p class="tagline">Com ${players.length} jogadores: 1 assassino, 1 detetive, 1 anjo e ${counts.cidadao} cidadão(s).</p>`}

    <div class="card lobby-settings" style="margin-top:18px;">
      <h3>⚙️ Configurações da sala</h3>
      <p class="tagline">O anfitrião pode alterar os tempos enquanto a sala estiver no lobby.</p>

      <div class="field">
        <label for="discussion-time">Tempo de discussão</label>
        <select id="discussion-time" ${state.isHost ? '' : 'disabled'}>
          ${[30,45,60,90,120,180].map(v =>
            `<option value="${v}" ${Number(discussionSeconds)===v?'selected':''}>${formatSeconds(v)}</option>`
          ).join('')}
        </select>
      </div>

      <div class="field">
        <label for="voting-time">Tempo de votação</label>
        <select id="voting-time" ${state.isHost ? '' : 'disabled'}>
          ${[15,30,45,60,90,120].map(v =>
            `<option value="${v}" ${Number(votingSeconds)===v?'selected':''}>${formatSeconds(v)}</option>`
          ).join('')}
        </select>
      </div>

      ${state.isHost
        ? `<p class="footnote">Você pode mudar essas opções a qualquer momento antes de iniciar — inclusive depois de uma partida terminar.</p>`
        : `<p class="footnote">Somente o anfitrião pode alterar os tempos.</p>`}
    </div>

    <hr class="divider">

    ${state.isHost
      ? `<button class="btn btn-primary" id="btn-start" ${canStart ? '' : 'disabled'}>Iniciar jogo</button>`
      : `<p class="waiting-block"><span class="glyph">🕯️</span>Aguardando o anfitrião iniciar o jogo...</p>`
    }
  </div>`);

  const list = wrap.querySelector('#lobby-players');

  players.forEach(p=>{
    const chip = el(`<div class="player-chip">
      <span class="dot"></span>
      <span>${esc(p.name)}</span>
    </div>`);

    if(p.id === state.playerId){
      chip.appendChild(el(`<span class="you-tag">VOCÊ</span>`));
    } else if(state.room && p.id === state.room.hostId){
      chip.appendChild(el(`<span class="host-tag">anfitrião</span>`));
    }

    list.appendChild(chip);
  });

  wrap.querySelector('#btn-leave').onclick = leaveToLanding;

  const startBtn = wrap.querySelector('#btn-start');
  if(startBtn) startBtn.onclick = hostStartGame;

  const discussionSelect = wrap.querySelector('#discussion-time');
  const votingSelect = wrap.querySelector('#voting-time');

  if(state.isHost){
    const saveSettings = async ()=>{
      if(state.busy) return;
      await updateRoomSettings(discussionSelect.value, votingSelect.value);
    };

    discussionSelect.onchange = saveSettings;
    votingSelect.onchange = saveSettings;
  }

  return wrap;
}

function myPlayer(){
  return (state.players||[]).find(p=>p.id===state.playerId) || null;
}

function renderGame(){
  const meta = state.room;
  if(!meta) return el(`<div class="wrap"><p>Carregando...</p></div>`);
  if(meta.phase === 'gameover') return renderGameOver();
  const me = myPlayer();
  if(!me) return el(`<div class="wrap"><p>Carregando jogador...</p></div>`);

  const wrap = el(`<div class="wrap"></div>`);
  wrap.appendChild(el(`<div class="top-bar">
    <span class="room-pill">Sala ${esc(state.roomCode)} · Rodada ${meta.round}</span>
    <button class="link-btn" id="btn-leave">Sair</button>
  </div>`));
  wrap.querySelector('#btn-leave').onclick = leaveToLanding;

  const isNight = meta.phase === 'night';
  const banner = el(`<div class="phase-banner ${isNight?'night':'day'}">
    ${isNight ? moonSvg(38) : sunSvg(38)}
    <div>
      <div class="phase-title">${phaseTitle(meta.phase)}</div>
      <div class="phase-sub">${phaseSubtitle(meta, me)}</div>
    </div>
  </div>`);
  wrap.appendChild(banner);

  if(meta.phase === 'role_reveal'){
    wrap.appendChild(renderRoleReveal(meta, me));
    return wrap;
  } else if(meta.phase === 'night_transition'){
    wrap.appendChild(renderNightTransition(meta));
    return wrap;
  } else if(!me.alive){
    wrap.appendChild(renderSpectator(meta, me));
  } else if(meta.phase === 'night'){
    wrap.appendChild(renderNightPanel(meta, me));
  } else if(meta.phase === 'day_reveal'){
    wrap.appendChild(renderDayReveal(meta, me));
  } else if(meta.phase === 'day_discussion'){
    wrap.appendChild(renderDiscussion(meta, me));
  } else if(meta.phase === 'day_voting'){
    wrap.appendChild(renderVoting(meta, me));
  } else if(meta.phase === 'day_results'){
    wrap.appendChild(renderDayResults(meta, me));
  }

  wrap.appendChild(renderRosterCollapsed());
  wrap.appendChild(renderLog(meta));
  return wrap;
}

function phaseTitle(phase){
  return {
    role_reveal:'Revelando seu papel', night_transition:'A noite chega...', night:'A cidade dorme', day_reveal:'O sol nasce', day_discussion:'Discussão',
    day_voting:'Hora de votar', day_results:'Resultado da votação'
  }[phase] || '';
}
function phaseSubtitle(meta, me){
  if(meta.phase==='role_reveal') return 'Memorize seu papel. A noite está chegando...';
  if(meta.phase==='night_transition') return 'A noite chega... cidade dorme.';
  if(meta.phase==='night') return me.alive ? 'Aja em silêncio, se seu papel permitir.' : 'Você está observando desta rodada.';
  if(meta.phase==='day_reveal') return 'Veja o que aconteceu durante a noite.';
  if(meta.phase==='day_discussion') return 'Conversem e tentem descobrir quem são os assassinos.';
  if(meta.phase==='day_voting') return 'Escolha em quem votar para eliminar.';
  if(meta.phase==='day_results') return 'Veja quem a cidade decidiu eliminar.';
  return '';
}

/* ============ sons e transição da noite ============ */
function getAudioContext(){
  if(!state.audioContext){
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx) return null;
    state.audioContext = new AudioCtx();
  }
  return state.audioContext;
}

async function unlockAudio(){
  const ctx = getAudioContext();
  if(!ctx) return;
  try{
    if(ctx.state === 'suspended') await ctx.resume();
    state.audioUnlocked = ctx.state === 'running';
  }catch(error){
    console.warn('Áudio indisponível:', error);
  }
}

function playTone(ctx, frequency, start, duration, type='sine', gainValue=.04){
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .03);
}

async function playMidnightSounds(){
  if(state.lastNightTransitionRound === state.room?.round) return;
  state.lastNightTransitionRound = state.room?.round ?? null;

  const ctx = getAudioContext();
  if(!ctx) return;

  try{
    await ctx.resume();

    const now = ctx.currentTime + .05;

    // Sino grave de meia-noite, sintetizado com harmônicos para evitar depender de arquivo externo.
    [196, 392, 588].forEach((freq, index)=>{
      playTone(ctx, freq, now + index * .08, 2.6, 'sine', index === 0 ? .065 : .028);
    });
    [196, 392, 588].forEach((freq, index)=>{
      playTone(ctx, freq, now + 1.05 + index * .07, 2.45, 'sine', index === 0 ? .06 : .025);
    });

    // Duas notas curtas descendentes lembrando o chamado de uma coruja.
    const owlStart = now + 2.35;
    playTone(ctx, 760, owlStart, .42, 'triangle', .035);
    playTone(ctx, 540, owlStart + .33, .58, 'triangle', .04);
    playTone(ctx, 690, owlStart + .88, .38, 'triangle', .03);
    playTone(ctx, 480, owlStart + 1.18, .62, 'triangle', .035);
  }catch(error){
    console.warn('Não foi possível tocar os sons da noite:', error);
  }
}

function renderNightTransition(meta){
  const transitionTotalMs = 4200;
  const remainingMs = Math.max(0, (meta.phaseEndsAt || Date.now()) - Date.now());
  const elapsedMs = Math.max(0, transitionTotalMs - remainingMs);
  const animationOffset = `animation-delay:-${elapsedMs}ms`;

  const wrap = el(`<div class="night-transition-screen" aria-live="polite" style="--transition-elapsed:${elapsedMs}ms;">
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

  playMidnightSounds();
  return wrap;
}

function renderRoleReveal(meta, me){
  const info = ROLE_INFO[me.role] || ROLE_INFO.cidadao;
  const image = ROLE_IMAGES[me.role] || ROLE_IMAGES.cidadao;
  const remainingMs = Math.max(0, (meta.phaseEndsAt || Date.now()) - Date.now());
  const fadingClass = remainingMs <= 1500 ? ' role-reveal-fading' : '';

  const card = el(`<div class="card role-reveal-screen${fadingClass}">
    <div class="role-reveal-visual">
      <div class="role-image-frame">
        <img src="${image}" alt="${esc(info.name)}" class="role-image">
      </div>
      <p class="role-you">Você é</p>
      <h1 class="role-name role-${esc(me.role)}">${esc(info.name)}</h1>
      <p class="tagline role-description">${esc(info.desc)}</p>
      <div class="role-countdown" id="role-countdown">5</div>
      <p class="footnote">O jogo vai começar...</p>
    </div>
  </div>`);

  const countdown = card.querySelector('#role-countdown');

  const tick = ()=>{
    const remain = Math.max(0, Math.ceil(((meta.phaseEndsAt || Date.now()) - Date.now()) / 1000));
    countdown.textContent = String(remain);
  };

  tick();

  const iv = setInterval(()=>{
    tick();
    if(meta.phaseEndsAt && meta.phaseEndsAt <= Date.now()){
      clearInterval(iv);
    }
  }, 100);

  return card;
}

function renderSpectator(meta, me){
  return el(`<div class="card">
    <div class="waiting-block">
      <span class="glyph">👻</span>
      <p>Você morreu e foi eliminado(a) da partida.</p>
       <p style="margin-top:8px;">Seu papel era <strong style="color:var(--ink)">${ROLE_INFO[me.role]?.name || 'não identificado'}</strong>.</p>
      <p style="margin-top:8px;">Continue acompanhando em silêncio até o fim da partida.</p>
    </div>
  </div>`);
}

function aliveOthers(exceptId){
  return (state.players||[]).filter(p=>p.alive && p.id!==exceptId);
}

function renderNightPanel(meta, me){
  const shouldAnimate = state.nightEnteredAt && Date.now() - state.nightEnteredAt < 1400;
  const card = el(`<div class="card${shouldAnimate ? ' night-action-enter' : ''}"></div>`);

  if(me.role === 'cidadao'){
    card.appendChild(el(`<div class="waiting-block">
      <span class="glyph">😴</span>
      <h3>Você é Cidadão</h3>
      <p>Você não tem ação noturna. Observe, escute e guarde suas suspeitas para o dia.</p>
    </div>`));
    return card;
  }

  if(!['assassino','anjo','detetive'].includes(me.role)){
    card.appendChild(el(`<div class="waiting-block"><span class="glyph">❓</span><p>Seu papel não possui uma ação nesta noite.</p></div>`));
    return card;
  }

  const headings = {
    assassino: ['🔪 Escolha uma vítima', 'Escolha uma pessoa para eliminar.'],
    anjo: ['🕊️ Escolha quem proteger', 'Escolha uma pessoa para proteger.'],
    detetive: ['🔎 Escolha uma pessoa para investigar', 'O resultado será apenas 👍 ou 👎.']
  };

  const [title, subtitle] = headings[me.role];
  const targets = me.role === 'assassino'
    ? aliveOthers(me.id).filter(p => p.role !== 'assassino')
    : me.role === 'detetive'
      ? aliveOthers(me.id)
      : (state.players || []).filter(p => p.alive);

  const box = el(`<div>
    <h3>${title}</h3>
    <p class="tagline" style="margin:6px 0 14px;">${subtitle}</p>
    <div class="target-grid" id="night-targets"></div>
    <p class="footnote" style="margin-top:12px;">Escolha uma pessoa. Depois confirme no botão ✓ ao lado do nome.</p>
  </div>`);

  const grid = box.querySelector('#night-targets');

  targets.forEach(t=>{
    const row = el(`<div class="action-target-row"></div>`);
    const button = el(`<button class="target-btn action-target-button">${esc(t.name)}${t.id===me.id?' (você)':''}</button>`);

    if(state.selectedTarget === t.id) button.classList.add('selected');
    button.disabled = state.nightActionConfirmed;

    button.onclick = ()=>selectNightTarget(t.id);
    row.appendChild(button);

    if(state.selectedTarget === t.id && !state.nightActionConfirmed){
      const confirm = el(`<button class="action-confirm-btn" title="Confirmar ação" aria-label="Confirmar ação">✓</button>`);
      confirm.onclick = confirmNightAction;
      row.appendChild(confirm);
    }

    grid.appendChild(row);
  });

  if(state.nightActionConfirmed){
    const chosen = targets.find(t => t.id === state.selectedTarget);

    if(me.role === 'detetive' && chosen){
      const special = chosen.role === 'assassino' || chosen.role === 'anjo';

      box.appendChild(el(`<div class="investigation-result ${special?'positive':'negative'}">
        <div class="investigation-symbol">${special ? '👍' : '👎'}</div>
      </div>`));
    } else {
      box.appendChild(el(`<div class="action-confirmed">
        <span class="confirm-check">✓</span>
        <span>Ação confirmada.</span>
      </div>`));
    }

    box.appendChild(el(`<p class="footnote">Sua ação já foi registrada e não pode ser alterada nesta noite.</p>`));
  }

  card.appendChild(box);
  card.appendChild(el(`<p class="footnote">A noite termina automaticamente quando todos os papéis especiais vivos confirmarem sua ação.</p>`));

  return card;
}

function renderDayReveal(meta, me){
  const card = el(`<div class="card">
    <div class="role-reveal">
      <span class="glyph">${meta.lastDeathName ? '💀' : '🌤️'}</span>
      <p style="font-size:1.1rem;">${meta.lastDeathName ? `<strong>${esc(meta.lastDeathName)}</strong> não sobreviveu à noite.` : 'Ninguém morreu esta noite.'}</p>
    </div>
    ${state.isHost ? `<button class="btn btn-primary" id="btn-to-discussion">Ir para a discussão</button>` : `<p class="waiting-block"><span class="glyph">🕯️</span>Aguardando o anfitrião continuar...</p>`}
  </div>`);
  const btn = card.querySelector('#btn-to-discussion');
  if(btn) btn.onclick = hostGoToDiscussion;
  return card;
}

function renderDiscussion(meta, me){
  const card = el(`<div class="card">
    <div style="text-align:center; padding:10px 0 4px;">
      <p class="tagline">Conversem em voz alta sobre quem parece suspeito.</p>
      <h2 id="timer-display" style="margin-top:14px; color:var(--lantern-soft);">--:--</h2>
    </div>
    <p class="footnote">A discussão termina automaticamente. Depois começa a votação.</p>
  </div>`);

  const disp = card.querySelector('#timer-display');
  const tick = ()=>{
    disp.textContent = formatTimer((meta.phaseEndsAt || Date.now()) - Date.now());
  };

  const iv = setInterval(()=>{
    tick();
    if(meta.phaseEndsAt && meta.phaseEndsAt <= Date.now()) clearInterval(iv);
  }, 250);

  tick();
  return card;
}

function renderVoting(meta, me){
  const alivePlayers = (state.players||[]).filter(p=>p.alive);

  const box = el(`<div class="card">
    <h3>🗳️ Em quem você vota?</h3>
    <h2 id="vote-timer" style="text-align:center; margin:12px 0; color:var(--lantern-soft);">--:--</h2>
    <div class="target-grid" id="vote-targets" style="margin-top:14px;"></div>
    <button class="target-btn" id="vote-abstain" style="margin-top:4px;">Pular</button>
    <p class="footnote">A votação termina automaticamente quando o tempo acabar.</p>
  </div>`);

  const grid = box.querySelector('#vote-targets');

  alivePlayers.filter(p=>p.id!==me.id).forEach(t=>{
    const b = el(`<button class="target-btn">${esc(t.name)}</button>`);
    if(state.selectedTarget===t.id) b.classList.add('selected');
    b.onclick = ()=>submitVote(t.id);
    grid.appendChild(b);
  });

  const abstainBtn = box.querySelector('#vote-abstain');
  if(state.selectedTarget==='abstain') abstainBtn.classList.add('selected');
  abstainBtn.onclick = ()=>submitVote('abstain');

  const timer = box.querySelector('#vote-timer');
  const tick = ()=>{
    timer.textContent = formatTimer((meta.phaseEndsAt || Date.now()) - Date.now());
  };

  const iv = setInterval(()=>{
    tick();
    if(meta.phaseEndsAt && meta.phaseEndsAt <= Date.now()) clearInterval(iv);
  }, 250);

  tick();
  return box;
}

function renderDayResults(meta, me){
  const card = el(`<div class="card">
    <div class="role-reveal">
      <span class="glyph">${meta.lastEliminatedName ? '⚖️' : '🤝'}</span>
      <p style="font-size:1.1rem;">${meta.lastEliminatedName ? `<strong>${esc(meta.lastEliminatedName)}</strong> foi eliminado(a) pela cidade.` : 'A votação empatou — ninguém foi eliminado.'}</p>
    </div>
    ${state.isHost ? `<button class="btn btn-primary" id="btn-next-night">Próxima noite</button>` : `<p class="waiting-block"><span class="glyph">🕯️</span>Aguardando o anfitrião continuar...</p>`}
  </div>`);
  const btn = card.querySelector('#btn-next-night');
  if(btn) btn.onclick = hostNextNight;
  return card;
}

function renderGameOver(){
  const meta = state.room;
  const cidadeVenceu = meta.winner === 'cidade';
  const me = myPlayer();

  const wrap = el(`<div class="wrap">
    ${me && !me.alive ? `<div class="card death-banner">
      <span class="glyph">💀</span>
      <h2>Você morreu</h2>
      <p>Você foi eliminado(a), mas pode continuar na sala e acompanhar o resultado.</p>
    </div>` : ''}
    <div class="center-stage">
      <div class="card winner-banner">
        <span class="glyph">${cidadeVenceu?'🌾':'🔪'}</span>
        <h1>${cidadeVenceu? 'A cidade venceu!' : 'Os assassinos venceram!'}</h1>
        <p class="tagline">${cidadeVenceu? 'Todos os assassinos foram eliminados.' : 'Os assassinos dominaram a cidade.'}</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:12px;">Papéis da partida</h3>
        <div class="player-list" id="final-roles"></div>
      </div>

      ${state.isHost
        ? `<button class="btn btn-primary" id="btn-replay">Jogar novamente nesta sala</button>`
        : `<p class="waiting-block"><span class="glyph">🕯️</span>Aguardando o anfitrião iniciar uma nova partida nesta sala...</p>`}

      <button class="btn btn-ghost" id="btn-newgame">Sair da sala</button>
    </div>
  </div>`);

  const list = wrap.querySelector('#final-roles');

  (state.players || []).forEach(p=>{
    const info = ROLE_INFO[p.role] || { glyph:'❓', name:'Papel não atribuído' };
    const chip = el(`<div class="player-chip ${p.alive?'':'dead'}">
      <span class="dot"></span>
      <span>${esc(p.name)} — ${info.glyph} ${info.name}</span>
    </div>`);
    list.appendChild(chip);
  });

  wrap.querySelector('#btn-newgame').onclick = leaveToLanding;

  const replayBtn = wrap.querySelector('#btn-replay');
  if(replayBtn) replayBtn.onclick = hostReplayRoom;

  return wrap;
}

function renderRosterCollapsed(){
  const me = myPlayer();
  const details = el(`<details class="card" style="margin-top:18px;">
    <summary style="cursor:pointer; font-family:var(--serif); font-size:1.05rem;">Jogadores (${(state.players||[]).length})</summary>
    <div class="player-list" style="margin-top:14px;" id="roster-list"></div>
  </details>`);
  const list = details.querySelector('#roster-list');
  (state.players||[]).forEach(p=>{
    const chip = el(`<div class="player-chip ${p.alive?'':'dead'}"><span class="dot"></span><span>${esc(p.name)}</span></div>`);
    if(p.id===state.playerId){
      const info = ROLE_INFO[p.role] || null;
      chip.appendChild(el(`<span class="you-tag">${info? info.glyph+' '+info.name : 'VOCÊ'}</span>`));
    }
    list.appendChild(chip);
  });
  return details;
}

function renderLog(meta){
  const box = el(`<div class="log-box"></div>`);
  (meta.log||[]).slice(-8).forEach(line=>{
    box.appendChild(el(`<p>${esc(line)}</p>`));
  });
  return box;
}

/* ============ extra UI styles ============ */
(function injectGameStyles(){
  const style = document.createElement('style');
  style.textContent = `
    .role-reveal-screen { overflow:hidden; }
    .role-reveal-visual { text-align:center; padding:10px 0 4px; }
    .role-image-frame {
      width:min(100%, 340px);
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
      animation:nightPulse 4.2s ease-in-out both;
      animation-delay:calc(-1 * var(--transition-elapsed, 0ms));
      z-index:1;
    }
    .night-transition-content {
      position:relative;
      z-index:10;
      text-align:center;
      opacity:0;
      transform:translateY(12px) scale(.98);
      animation:nightTitleIn 1s .45s ease-out forwards;
      animation-delay:calc(.45s - var(--transition-elapsed, 0ms));
      padding:24px;
      text-shadow:0 5px 30px rgba(0,0,0,.75);
    }
    .transition-moon {
      margin:0 auto 12px;
      filter:drop-shadow(0 0 24px rgba(242,192,120,.34));
      animation:moonFloat 4.2s ease-in-out both;
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
      animation:cloudSweep 3.75s cubic-bezier(.18,.72,.2,1) forwards;
      animation-delay:calc(-1 * var(--transition-elapsed, 0ms));
    }
    .cloud-a { top:7%; animation-delay:0s; }
    .cloud-b { top:28%; width:64vw; animation-delay:.16s; animation-duration:3.55s; }
    .cloud-c { top:49%; width:70vw; animation-delay:.05s; animation-duration:3.85s; }
    .cloud-d { top:68%; width:62vw; animation-delay:.22s; animation-duration:3.65s; }
    .cloud-e { top:84%; width:76vw; animation-delay:.1s; animation-duration:3.9s; }
    .role-reveal-screen.role-reveal-fading .role-reveal-visual {
      animation:roleRevealFade 1.45s ease-in forwards;
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
  `;
  document.head.appendChild(style);
})();

/* ============ boot ============ */
document.addEventListener('pointerdown', unlockAudio, { passive:true });
render();

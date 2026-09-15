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
  const { data, error } = await sb.from('night_actions').select('target_id').eq('room_code', code).eq('round', round).eq('role', role);
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
  pollHandle:null,
  lastPhaseSeen:null,
  discussionEndsAt:null,
  phaseTimerHandle:null,
  nightResolving:false,
  autoResolvingVotes:false
};

/* ============ room meta shape ============
{
  hostId, status:'lobby'|'active', phase:'night'|'day_reveal'|'day_discussion'|'day_voting'|'day_results'|'gameover',
  round, log:[strings], lastDeathName, lastEliminatedName, winner: 'cidade'|'assassinos'|null,
  discussionSeconds
}
*/

/* ============ core actions ============ */
async function createRoom(name, discussionSeconds=90, votingSeconds=30){
  let code = genRoomCode();
  const meta = {
    hostId: state.playerId, status:'lobby', phase:null, round:0,
    log:[], lastDeathName:null, lastEliminatedName:null, winner:null,
    discussionSeconds:Number(discussionSeconds)||90,
    votingSeconds:Number(votingSeconds)||30,
    phaseEndsAt:null
  };
  await dbCreateRoom(code, meta);
  await dbUpsertPlayer(code, { id: state.playerId, name, alive:true, role:null });
  state.roomCode = code;
  state.isHost = true;
  state.playerName = name;
  enterLobby();
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
    state.lastPhaseSeen = null;
  } else if(meta.status === 'active' && state.screen !== 'game'){
    state.screen = 'game';
    state.selectedTarget = null;
  }

  if(meta.phase !== state.lastPhaseSeen){
    state.selectedTarget = null;
    state.lastPhaseSeen = meta.phase;
  }

  render();

  if(meta.phase === 'night') tryAutoResolveNight();
  if(meta.phase === 'day_discussion' || meta.phase === 'day_voting') startPhaseTimer(meta);
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
    const remain = meta.phaseEndsAt - Date.now();

    if(remain > 0){
      state.phaseTimerHandle = setTimeout(check, Math.min(remain, 500));
      return;
    }

    if(meta.phase === 'day_discussion'){
      await dbAdvancePhase(state.roomCode, 'day_discussion', 'day_voting');
    } else if(meta.phase === 'day_voting'){
      await autoResolveVotes();
    }
  };

  check();
}

async function dbAdvancePhase(code, fromPhase, toPhase){
  const votingSeconds = state.room?.votingSeconds || 30;

  const { error } = await sb.from('rooms').update({
    phase: toPhase,
    phase_ends_at: toPhase === 'day_voting'
      ? new Date(Date.now() + votingSeconds*1000).toISOString()
      : null
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
  if(state.busy) return;
  state.busy = true; render();
  const players = await fetchPlayers(state.roomCode);
  const counts = computeRoleCounts(players.length);
  let pool = [];
  for(let i=0;i<counts.assassino;i++) pool.push('assassino');
  for(let i=0;i<counts.detetive;i++) pool.push('detetive');
  for(let i=0;i<counts.anjo;i++) pool.push('anjo');
  for(let i=0;i<counts.cidadao;i++) pool.push('cidadao');
  pool = shuffle(pool);
  const shuffledPlayers = shuffle(players);
  await Promise.all(shuffledPlayers.map((p, idx) =>
    dbUpsertPlayer(state.roomCode, { ...p, role: pool[idx] || 'cidadao', alive:true })
  ));
  const meta = await dbGetRoom(state.roomCode);
  meta.status = 'active';
  meta.phase = 'night';
  meta.round = (meta.round || 0) + 1;
  meta.phaseEndsAt = null;
  meta.log = [`A cidade adormece pela primeira vez... (Rodada 1)`];
  meta.winner = null;
  await dbUpdateRoom(state.roomCode, meta);
  state.busy = false;
  refresh();
}

/* ---- night actions ---- */
async function submitWolfVote(targetId){
  await dbSubmitNightAction(state.roomCode, state.room.round, 'assassino', state.playerId, targetId);
  state.selectedTarget = targetId;
  render();
}
async function submitDoctorPick(targetId){
  await dbSubmitNightAction(state.roomCode, state.room.round, 'anjo', state.playerId, targetId);
  state.selectedTarget = targetId;
  render();
}
async function submitSeerPick(targetId){
  await dbSubmitNightAction(state.roomCode, state.room.round, 'detetive', state.playerId, targetId);
  state.selectedTarget = targetId;
  render();
  tryAutoResolveNight();
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
  try {
    await hostResolveNight();
  } finally {
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
  meta.round += 1;
  meta.phase = 'night';
  meta.log.push(`🌙 A cidade dorme novamente... (Rodada ${meta.round})`);
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
  refresh();
}

function leaveToLanding(){
  stopPolling();
  Object.assign(state, {
    screen:'landing', roomCode:null, isHost:false, room:null, players:[],
    error:'', busy:false, selectedTarget:null, lastPhaseSeen:null
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
  const canStart = players.length>=4 && state.isHost;
  const counts = computeRoleCounts(players.length);
  const wrap = el(`<div class="wrap">
    <div class="top-bar">
      <span class="room-pill">Sala ${esc(state.roomCode||'')}</span>
      <button class="link-btn" id="btn-leave">Sair</button>
    </div>
    <div class="card" style="text-align:center;">
      <p class="room-code-label">código da sala</p>
      <div class="room-code">${esc(state.roomCode||'')}</div>
      <p class="tagline">Compartilhe esse código com os outros jogadores.</p>
    </div>
    <h3 style="margin:22px 0 12px;">Jogadores (${players.length})</h3>
    <div class="player-list" id="lobby-players"></div>
    ${players.length < 4 ? `<p class="status-line"><span class="pulse"></span>São necessários pelo menos 4 jogadores para começar.</p>` : ''}
    ${players.length>=4 ? `<p class="tagline">Com ${players.length} jogadores: 1 assassino, 1 detetive, 1 anjo e ${counts.cidadao} cidadão(s).</p>` : ''}
    ${state.room ? `<p class="tagline" style="margin-top:8px;">Discussão: ${formatSeconds(state.room.discussionSeconds)} · Votação: ${formatSeconds(state.room.votingSeconds)}</p>` : ''}
    <hr class="divider">
    ${state.isHost
      ? `<button class="btn btn-primary" id="btn-start" ${canStart?'':'disabled'}>Iniciar jogo</button>`
      : `<p class="waiting-block"><span class="glyph">🕯️</span>Aguardando o anfitrião iniciar o jogo...</p>`
    }
  </div>`);
  const list = wrap.querySelector('#lobby-players');
  players.forEach(p=>{
    const chip = el(`<div class="player-chip"><span class="dot"></span><span>${esc(p.name)}</span></div>`);
    if(p.id === state.playerId) chip.appendChild(el(`<span class="you-tag">VOCÊ</span>`));
    else if(state.room && p.id === state.room.hostId) chip.appendChild(el(`<span class="host-tag">anfitrião</span>`));
    list.appendChild(chip);
  });
  wrap.querySelector('#btn-leave').onclick = leaveToLanding;
  const startBtn = wrap.querySelector('#btn-start');
  if(startBtn) startBtn.onclick = hostStartGame;
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

  if(!me.alive){
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
    night:'A cidade dorme', day_reveal:'O sol nasce', day_discussion:'Discussão',
    day_voting:'Hora de votar', day_results:'Resultado da votação'
  }[phase] || '';
}
function phaseSubtitle(meta, me){
  if(meta.phase==='night') return me.alive ? 'Aja em silêncio, se seu papel permitir.' : 'Você está observando desta rodada.';
  if(meta.phase==='day_reveal') return 'Veja o que aconteceu durante a noite.';
  if(meta.phase==='day_discussion') return 'Conversem e tentem descobrir quem são os assassinos.';
  if(meta.phase==='day_voting') return 'Escolha em quem votar para eliminar.';
  if(meta.phase==='day_results') return 'Veja quem a cidade decidiu eliminar.';
  return '';
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
  const card = el(`<div class="card"></div>`);
  const round = meta.round;

  if(me.role === 'cidadao'){
    card.appendChild(el(`<div class="waiting-block"><span class="glyph">😴</span><p>Você não tem ação noturna. Durma tranquilo(a)... por enquanto.</p></div>`));
  }
  if(me.role === 'assassino'){
    const colegas = (state.players||[]).filter(p=>p.role==='assassino' && p.id!==me.id && p.alive);
    const targets = aliveOthers(me.id).filter(p=>p.role!=='assassino');
    const box = el(`<div>
      <h3>🐺 Escolha uma vítima</h3>
      ${colegas.length ? `<p class="tagline" style="margin:6px 0 14px;">Seus companheiros assassinos: ${colegas.map(t=>esc(t.name)).join(', ')}</p>` : `<p class="tagline" style="margin:6px 0 14px;">Você é o único assassino restante.</p>`}
      <div class="target-grid" id="assassino-targets"></div>
    </div>`);
    const grid = box.querySelector('#assassino-targets');
    targets.forEach(t=>{
      const b = el(`<button class="target-btn">${esc(t.name)}</button>`);
      if(state.selectedTarget===t.id) b.classList.add('selected');
      b.onclick = ()=>submitWolfVote(t.id);
      grid.appendChild(b);
    });
    card.appendChild(box);
  }
  if(me.role === 'anjo'){
    const targets = aliveOthers(null).concat(me.alive? [me]:[]).filter((p,i,arr)=>arr.findIndex(x=>x.id===p.id)===i);
    const box = el(`<div>
      <h3>🩹 Escolha quem proteger</h3>
      <div class="target-grid" id="doc-targets"></div>
    </div>`);
    const grid = box.querySelector('#doc-targets');
    (state.players||[]).filter(p=>p.alive).forEach(t=>{
      const b = el(`<button class="target-btn">${esc(t.name)}${t.id===me.id?' (você)':''}</button>`);
      if(state.selectedTarget===t.id) b.classList.add('selected');
      b.onclick = ()=>submitDoctorPick(t.id);
      grid.appendChild(b);
    });
    card.appendChild(box);
  }
  if(me.role === 'detetive'){
    const targets = aliveOthers(me.id);
    const box = el(`<div>
      <h3>🔮 Investigar alguém</h3>
      <div class="target-grid" id="detetive-targets"></div>
      <p id="detetive-result" class="status-line" style="margin-top:14px;"></p>
    </div>`);
    const grid = box.querySelector('#detetive-targets');
    targets.forEach(t=>{
      const b = el(`<button class="target-btn">${esc(t.name)}</button>`);
      if(state.selectedTarget===t.id) b.classList.add('selected');
      b.onclick = async ()=>{
        await submitSeerPick(t.id);
        const resultEl = box.querySelector('#detetive-result');
        const isAssassino = t.role === 'assassino';
        resultEl.innerHTML = `<span style="color:${isAssassino?'var(--blood)':'var(--sage)'}">● </span> ${esc(t.name)} ${isAssassino? 'é um assassino!' : 'não é um assassino.'}`;
      };
      grid.appendChild(b);
    });
    if(state.selectedTarget){
      const chosen = targets.find(t=>t.id===state.selectedTarget);
      if(chosen){
        const isAssassino = chosen.role==='assassino';
        box.querySelector('#detetive-result').innerHTML = `<span style="color:${isAssassino?'var(--blood)':'var(--sage)'}">● </span> ${esc(chosen.name)} ${isAssassino? 'é um assassino!' : 'não é um assassino.'}`;
      }
    }
    card.appendChild(box);
  }

  card.appendChild(el(`<p class="footnote">A noite termina automaticamente quando todos os papéis especiais vivos fizerem sua escolha.</p>`));
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
  const wrap = el(`<div class="wrap">
    <div class="center-stage">
      <div class="card winner-banner">
        <span class="glyph">${cidadeVenceu?'🌾':'🔪'}</span>
        <h1>${cidadeVenceu? 'A cidade venceu!' : 'Os assassinos venceram!'}</h1>
        <p class="tagline">${cidadeVenceu? 'Todos os assassinos foram eliminados.' : 'Os assassinos dominaram a cidade.'}</p>
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px;">Todos os papéis</h3>
        <div class="player-list" id="final-roles"></div>
      </div>
      ${state.isHost
        ? `<button class="btn btn-primary" id="btn-replay">Jogar novamente nesta sala</button>`
        : `<p class="waiting-block"><span class="glyph">🕯️</span>Aguardando o anfitrião iniciar uma nova partida nesta sala...</p>`}
      <button class="btn btn-ghost" id="btn-newgame">Sair da sala</button>
    </div>
  </div>`);
  const list = wrap.querySelector('#final-roles');
  (state.players||[]).forEach(p=>{
    const info = ROLE_INFO[p.role] || { glyph:'❓', name:'Papel não atribuído' };
    const chip = el(`<div class="player-chip ${p.alive?'':'dead'}"><span class="dot"></span><span>${esc(p.name)} — ${info.glyph} ${info.name}</span></div>`);
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

/* ============ boot ============ */
render();

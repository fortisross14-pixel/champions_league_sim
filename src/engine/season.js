import { S, autoSave } from '../store.js'
import { GUARANTEED, POOL, ALL_TEAMS } from '../data/teams.js'
import { simMatch, rand, clamp, pick, shuffle, gaussRand, ovr, getEffStats } from './match.js'

// ── Tier helpers ─────────────────────────────────────────────
export const tierOf = f => f>=2000?'legendary':f>=800?'epic':f>=300?'rare':f>=80?'uncommon':'common'
export const tierLabel = t => ({legendary:'Legendary',epic:'Epic',rare:'Rare',uncommon:'Uncommon',common:'Common'})[t]||t
export const tierColor = t => ({legendary:'#ff9800',epic:'#9c27b0',rare:'#2196f3',uncommon:'#4caf50',common:'#6a7a9a'})[t]||'#6a7a9a'

// ── Rarity roll: 2% leg, 5% epic, 10% rare, 18% uncommon, 65% common ──
function rollTier() {
  const r = Math.random()
  if (r < 0.02) return 'legendary'
  if (r < 0.07) return 'epic'
  if (r < 0.17) return 'rare'
  if (r < 0.35) return 'uncommon'
  return 'common'
}

// ── Team base stats from base rating ─────────────────────────
function buildStats(base) {
  const n = () => Math.round(gaussRand(4))
  return {
    attack:    clamp(base + n(), 40, 110),
    defense:   clamp(base + n(), 40, 110),
    stamina:   clamp(base + n(), 40, 110),
    mental:    clamp(base + n(), 40, 110),
    setPieces: clamp(base + n(), 40, 110),
  }
}

// ── History points (raw) for a team ──────────────────────────
// Title=12, Final=8, Semi=4, Quarter=2, Participation=1
// Extra +1 for each local league title (hist field on team)
function rawHistPts(teamId) {
  if (!S.history?.length) return 0
  const pts = { Winner:12, Final:8, 'Semi-finals':4, 'Quarter-finals':2, 'Round of 16':1 }
  let total = 0
  S.history.forEach(h => {
    const reached = h.roundReached?.[teamId]
    if (reached) total += pts[reached] || 0
  })
  // Bonus for base team's domestic record (hist field = local history proxy)
  const teamData = [...(S.allTeams||[])].find(t=>t.id===teamId)
  if (teamData?.hist) total += Math.round(teamData.hist / 20) // small domestic bonus
  return total
}

// ── Normalize history score to 50-100 range across all teams ─
function normalizeHistScore(teamId) {
  // Compute raw for all known teams to find min/max
  const allIds = [...(S.allTeams||[])].map(t=>t.id)
  const allRaw = allIds.map(id => rawHistPts(id))
  const minR = Math.min(...allRaw), maxR = Math.max(...allRaw)
  const raw = rawHistPts(teamId)
  if (maxR === minR) return 75 // no history yet, neutral
  // Normalize to 50-100
  return Math.round(50 + ((raw - minR) / (maxR - minR)) * 50)
}

// ── Season rating = base(80%) + normalizedHist(20%), then ±7 noise ──
function seasonRating(team) {
  const base = team.base || 75
  const hist = normalizeHistScore(team.id) // 50-100
  // 80% base + 20% history, then small noise ±7
  const raw = base * 0.80 + hist * 0.20
  const noise = Math.round(gaussRand(2)) // sigma=2, very rarely ±7
  return clamp(Math.round(raw + noise), 40, 110)
}

// ── Star stat bonuses by position ────────────────────────────
const STAR_BONUSES = {
  // Raw values multiplied by STAR_TIER_MULT (leg=2.5, epic=2.0, rare=1.5)
  // Legendary FWD effective attack: ~10. Epic: ~8. Rare: ~6.
  FWD: { attack:4, setPieces:2 },
  MID: { attack:3, defense:1, mental:3 },
  DEF: { defense:4, stamina:1, setPieces:1 },
  GK:  { defense:4, mental:2 },
}
const COACH_BONUSES = {
  // Raw values multiplied by COACH_TIER_MULT (leg=2.2, epic=1.8, rare=1.4)
  // Legendary effective: ~9-11 per stat max. Epic: ~5-7. Rare: ~3-4.
  legendary: { attack:5, defense:5, stamina:3, mental:5, setPieces:3 },
  epic:      { attack:3, defense:3, stamina:2, mental:3, setPieces:2 },
  rare:      { attack:2, defense:2, stamina:1, mental:2, setPieces:1 },
  uncommon:  { attack:1, defense:1, stamina:1, mental:1, setPieces:1 },
  common:    { attack:1, defense:1, stamina:0, mental:0, setPieces:0 },
}

// ── Generate a star player ────────────────────────────────────
const POSITIONS = ['FWD','FWD','FWD','MID','MID','GK','DEF']
const FIRST_NAMES = ['Luca','Marco','Carlos','Luis','Antoine','Erling','Kylian','Harry','Thomas','Jamal','Bukayo','Phil','Pedri','Gavi','Vini','Rodri','Bellingham','Modric','Kroos','Musiala']
const LAST_NAMES = ['Silva','García','Müller','Fernandes','Mbappé','Haaland','Kane','Sané','Salah','De Bruyne','Wirtz','Musiala','Rodri','Bonucci','Hernández','Kroos','Alonso','Coman','Griezmann','Sterling']
const usedNames = new Set()

function genPlayerName() {
  let name, attempts=0
  do { name=`${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; attempts++ } while(usedNames.has(name)&&attempts<50)
  usedNames.add(name); return name
}

export function genStar(team) {
  const tier = rollTier()
  const pos = pick(POSITIONS)
  const bonus = STAR_BONUSES[pos] || {}
  return {
    id: `s_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name: genPlayerName(), pos, tier,
    teamId: team.id, teamName: team.name, cc: team.cc,
    season: S.season||1,
    lifespan: rand(9,12),
    goals: 0, ratings: [], wcsPlayed: 0, fame: 0,
    medals: { gold:0, silver:0, bronze:0 },
    statBonus: bonus,
  }
}

// ── Coach pool ────────────────────────────────────────────────
const COACH_POOL = [
  // Legendary (2%)
  { id:'c_leg1', name:'Carlo Ancelotti',  tier:'legendary', jogoBonito:false, ironWall:false, cancelGoal:true,  alwaysQualify:true },
  { id:'c_leg2', name:'Pep Guardiola',    tier:'legendary', jogoBonito:true,  ironWall:false, cancelGoal:false, alwaysQualify:true },
  { id:'c_leg3', name:'Jürgen Klopp',     tier:'legendary', jogoBonito:true,  ironWall:false, cancelGoal:false, alwaysQualify:true },
  { id:'c_leg4', name:'José Mourinho',    tier:'legendary', jogoBonito:false, ironWall:true,  cancelGoal:false, alwaysQualify:true },
  { id:'c_leg5', name:'Diego Simeone',    tier:'legendary', jogoBonito:false, ironWall:true,  cancelGoal:false, alwaysQualify:true },
  // Epic (5%)
  { id:'c_ep1',  name:'Luis Enrique',     tier:'epic',  jogoBonito:false, ironWall:false, cancelGoal:true,  alwaysQualify:true },
  { id:'c_ep2',  name:'Thomas Tuchel',    tier:'epic',  jogoBonito:false, ironWall:false, cancelGoal:true,  alwaysQualify:true },
  { id:'c_ep3',  name:'Antonio Conte',    tier:'epic',  jogoBonito:false, ironWall:true,  cancelGoal:false, alwaysQualify:true },
  { id:'c_ep4',  name:'Xabi Alonso',      tier:'epic',  jogoBonito:true,  ironWall:false, cancelGoal:false, alwaysQualify:true },
  { id:'c_ep5',  name:'Unai Emery',       tier:'epic',  jogoBonito:false, ironWall:false, cancelGoal:true,  alwaysQualify:true },
  { id:'c_ep6',  name:'Roberto De Zerbi', tier:'epic',  jogoBonito:true,  ironWall:false, cancelGoal:false, alwaysQualify:true },
  // Rare (10%)
  ...['Arne Slot','Oliver Glasner','Enzo Maresca','Ruben Amorim','Marco Silva',
      'Mauricio Pochettino','Roger Schmidt','Abel Ferreira','Julen Lopetegui','Igor Tudor'].map((name,i) => ({
    id:`c_r${i}`, name, tier:'rare', jogoBonito:false, ironWall:false, cancelGoal:false, alwaysQualify:false
  })),
  // Uncommon/Common pool
  ...['Marco Rossi','Jan Müller','David Walsh','Pierre Martin','Andrei Popescu',
      'Carlos Vega','Ivan Petrov','Mikael Andersen','Stefan Kovač','Nuno Almeida',
      'Fabio Ricci','Hans Weber','James Cooper','Luca Ferrari','Miguel Santos',
      'Pablo Herrera','Robert Klein','Alex Thompson','Gianni Conti','Erik Larsen',
      'Pedro Oliveira','Franz Bauer','Viktor Novak','Sven Lindqvist','Karim Abdi',
      'Toni Rausch','Liam Murphy','Bruno Esposito','Nico Deschamps','Artem Koval'].map((name,i) => ({
    id:`c_c${i}`, name, tier:i<10?'uncommon':'common',
    jogoBonito:false, ironWall:false, cancelGoal:false, alwaysQualify:false
  }))
]

COACH_POOL.forEach(c => { c.statBonus = COACH_BONUSES[c.tier] || COACH_BONUSES.common })

// Generate a new coach with rarity-rolled tier, picking a matching template from pool
export function genCoach(team) {
  const tier = rollTier() // 2% leg, 5% epic, 10% rare, 18% uncommon, 65% common
  const templates = COACH_POOL.filter(c => c.tier === tier)
  const template = templates.length ? pick(templates) : COACH_POOL[COACH_POOL.length-1]
  return {
    ...template,
    id: `coach_${team.id}_s${S.season||1}_${Math.random().toString(36).slice(2,6)}`,
    teamId: team.id, teamName: team.name,
    season: S.season||1,
    lifespan: rand(5,15),
    statBonus: COACH_BONUSES[tier] || COACH_BONUSES.common
  }
}

// ── Initialize stars and coaches for ALL teams ────────────────
export function initStarsAndCoaches() {
  if (!S.allTeams) S.allTeams = ALL_TEAMS.map(t => ({ ...t, stars:[], coachId:null }))

  // Assign 1-3 stars per team (all teams, not just qualified)
  S.allTeams.forEach(team => {
    if (!team.stars) team.stars = []
    const target = rand(1,3)
    while (team.stars.length < target) {
      const star = genStar(team)
      team.stars.push(star)
    }
  })

  // One coach per team — rarity rolled same as players (2% leg, 5% epic, 10% rare, 18% uncommon, 65% common)
  if (!S.coaches) S.coaches = []
  S.allTeams.forEach(team => {
    if (team.coachId && S.coaches.find(c=>c.teamId===team.id)) return
    const coach = genCoach(team)
    team.coachId = coach.id
    S.coaches.push(coach)
  })
}

// ── Attach stars/coaches to qualified teams ───────────────────
export function linkStarsToTeams() {
  if (!S.allTeams) return
  S.teams.forEach(team => {
    const allTeam = S.allTeams.find(t => t.id === team.id)
    if (!allTeam) return
    // Pick highest-tier star for this team for the tournament
    const stars = allTeam.stars || []
    const tierOrder = ['legendary','epic','rare','uncommon','common']
    stars.sort((a,b) => tierOrder.indexOf(a.tier)-tierOrder.indexOf(b.tier))
    team.star = stars[0] || null
    // Attach coach
    team.coach = S.coaches?.find(c => c.teamId === team.id) || null
  })
}

// ── Qualification ─────────────────────────────────────────────
export function runQualification() {
  // Legend/Epic coaches and stars force their team to qualify
  const forcedIds = new Set()
  if (S.allTeams) {
    S.allTeams.forEach(at => {
      const coach = S.coaches?.find(c => c.teamId===at.id)
      if (coach?.alwaysQualify) forcedIds.add(at.id)
      if (at.stars?.some(s => ['legendary','epic'].includes(s.tier))) forcedIds.add(at.id)
    })
  }

  const buildTeam = t => ({
    ...t,
    stats: buildStats(seasonRating(t)),
    rating: seasonRating(t),
    hist: histPts(t.id),
    pts:0, w:0, d:0, l:0, gf:0, ga:0, gd:0,
    star:null, coach:null
  })

  // Guaranteed 26 slots from fixed nations
  const guaranteed = GUARANTEED.map(buildTeam)

  // Force in teams with legend/epic if not already guaranteed
  const guaranteedIds = new Set(guaranteed.map(t=>t.id))
  const forced = (S.allTeams || POOL).filter(t => forcedIds.has(t.id) && !guaranteedIds.has(t.id)).map(buildTeam)

  // Fill remaining 12-(forced) slots from pool by score
  const usedIds = new Set([...guaranteed.map(t=>t.id), ...forced.map(t=>t.id)])
  const poolScored = POOL.filter(t => !usedIds.has(t.id)).map(t => ({
    ...t, score: t.base*0.8 + histPts(t.id) + Math.round(gaussRand(2))
  })).sort((a,b) => b.score-a.score)

  const slotsLeft = Math.max(0, 32 - guaranteed.length - forced.length)
  const fromPool = poolScored.slice(0, slotsLeft).map(buildTeam)

  S.teams = shuffle([...guaranteed, ...forced, ...fromPool]).slice(0,32)
  S.roundReached = {}
  S.teamGoals = {}; S.teamGoalsConceded = {}
  S.allMatchResults = []; S.scorers = {}
  S.seasonAwards = {}

  linkStarsToTeams()
}

// ── Group Draw (8 groups of 4) ────────────────────────────────
export function drawGroups() {
  const sorted = [...S.teams].sort((a,b) => b.rating-a.rating)
  const pot1 = sorted.slice(0,8)
  const rest = shuffle(sorted.slice(8))

  S.groups = Array.from({length:8}, (_,i) => ({ id:String.fromCharCode(65+i), teams:[pot1[i]] }))

  // Fill groups — max 1 team per country per group
  for (const team of rest) {
    const eligible = S.groups.filter(g => {
      if (g.teams.length >= 4) return false
      return !g.teams.some(t => t.cc === team.cc)
    })
    const fallback = S.groups.filter(g => g.teams.length < 4)
    const target = eligible.length ? eligible[Math.floor(Math.random()*eligible.length)] : fallback[Math.floor(Math.random()*fallback.length)]
    if (target) target.teams.push(team)
  }

  S.groupMatches = []
  S.groups.forEach((grp, gi) => {
    const t = grp.teams
    ;[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]].forEach(([a,b]) => {
      if (t[a]&&t[b]) S.groupMatches.push({ gi, t1:t[a], t2:t[b], played:false, result:null })
    })
  })
}

// ── Group stats update ────────────────────────────────────────
export function updateGroupStats(r) {
  const {t1,t2,g1,g2}=r
  t1.gf=(t1.gf||0)+g1; t1.ga=(t1.ga||0)+g2; t1.gd=t1.gf-t1.ga
  t2.gf=(t2.gf||0)+g2; t2.ga=(t2.ga||0)+g1; t2.gd=t2.gf-t2.ga
  if (g1>g2)      { t1.w=(t1.w||0)+1; t1.pts=(t1.pts||0)+3; t2.l=(t2.l||0)+1 }
  else if (g2>g1) { t2.w=(t2.w||0)+1; t2.pts=(t2.pts||0)+3; t1.l=(t1.l||0)+1 }
  else            { t1.d=(t1.d||0)+1; t1.pts=(t1.pts||0)+1; t2.d=(t2.d||0)+1; t2.pts=(t2.pts||0)+1 }
}

export function playGroupMatch(match) {
  if (match.played) return
  const r = simMatch(match.t1, match.t2, true, false)
  match.played=true; match.result=r
  updateGroupStats(r)
  trackMatchStats(r, 'group', match.gi)
  autoSave(); return r
}

function trackMatchStats(r, phase, gi) {
  S.allMatchResults = S.allMatchResults||[]
  S.allMatchResults.push({ t1id:r.t1.id,t1name:r.t1.name,t1cc:r.t1.cc, t2id:r.t2.id,t2name:r.t2.name,t2cc:r.t2.cc, g1:r.g1,g2:r.g2, phase, gi, shots1:r.shots1,shots2:r.shots2, corners1:r.corners1,corners2:r.corners2, possession1:r.possession1 })
  if (!S.teamGoals) S.teamGoals={}
  if (!S.teamGoalsConceded) S.teamGoalsConceded={}
  S.teamGoals[r.t1.id]=(S.teamGoals[r.t1.id]||0)+r.g1
  S.teamGoals[r.t2.id]=(S.teamGoals[r.t2.id]||0)+r.g2
  S.teamGoalsConceded[r.t1.id]=(S.teamGoalsConceded[r.t1.id]||0)+r.g2
  S.teamGoalsConceded[r.t2.id]=(S.teamGoalsConceded[r.t2.id]||0)+r.g1
  // Scorers
  ;[r.t1,r.t2].forEach(t => { if(t.star?.goals) S.scorers[t.star.name]=(t.star.goals||0) })
  // Team all-time stats
  if (!S.teamStats) S.teamStats={}
  ;[[r.t1,r.g1,r.g2],[r.t2,r.g2,r.g1]].forEach(([t,gf,ga]) => {
    if (!S.teamStats[t.id]) S.teamStats[t.id]={name:t.name,cc:t.cc,played:0,wins:0,draws:0,losses:0,gf:0,ga:0}
    const st=S.teamStats[t.id]; st.played++; st.gf+=gf; st.ga+=ga
    if (gf>ga) st.wins++; else if (gf===ga) st.draws++; else st.losses++
  })
}

export function buildKnockout() {
  const qualifiers=[]
  S.groups.forEach(grp => {
    const s=[...grp.teams].sort((a,b)=>(b.pts||0)-(a.pts||0)||(b.gd||0)-(a.gd||0)||(b.gf||0)-(a.gf||0))
    s.slice(0,2).forEach(t => { qualifiers.push(t); if(!S.roundReached[t.id]) S.roundReached[t.id]='Round of 16' })
  })
  const winners=S.groups.map(g=>[...g.teams].sort((a,b)=>(b.pts||0)-(a.pts||0)||(b.gd||0)-(a.gd||0))[0])
  const runners=S.groups.map(g=>[...g.teams].sort((a,b)=>(b.pts||0)-(a.pts||0)||(b.gd||0)-(a.gd||0))[1])
  const r16 = [[0,1],[1,0],[2,3],[3,2],[4,5],[5,4],[6,7],[7,6]].map(([wi,ri]) => ({
    t1:winners[wi], t2:runners[ri], played:false, result:null
  }))
  S.knockoutRounds=[{name:'Round of 16',matches:r16}]
}

export function playKnockoutMatch(match) {
  if (match.played) return
  const r=simMatch(match.t1,match.t2,false,true)
  match.played=true; match.result=r
  trackMatchStats(r,'knockout')
  autoSave(); return r
}

export function advanceKnockout() {
  const round=S.knockoutRounds[S.knockoutRounds.length-1]
  const winners=round.matches.map(m=>m.result?.winner).filter(Boolean)
  const losers=round.matches.map(m=>{
    if (!m.result?.winner) return null
    return m.result.winner===m.t1?m.t2:m.t1
  }).filter(Boolean)

  losers.forEach(t => { if(!S.roundReached[t.id]) S.roundReached[t.id]=round.name })

  if (winners.length===1) {
    S.champion=winners[0]; S.roundReached[winners[0].id]='Winner'
    if (losers[0]) S.roundReached[losers[0].id]='Final'
    S.phase='done'; finalizeSeasonStats(); return
  }
  const names={8:'Quarter-finals',4:'Semi-finals',2:'Final'}
  const newMatches=[]
  for (let i=0;i<winners.length;i+=2) newMatches.push({t1:winners[i],t2:winners[i+1],played:false,result:null})
  S.knockoutRounds.push({name:names[winners.length]||'Next Round',matches:newMatches})
  autoSave()
}

function finalizeSeasonStats() {
  const famePts={Winner:300,Final:150,'Semi-finals':75,'Quarter-finals':30,'Round of 16':10}
  // Awards: top scorer, offensive MVP, defensive MVP
  const allStars = S.teams.map(t=>t.star).filter(Boolean)
  let topScorer=null, offMVP=null, defMVP=null
  let topGoals=0, topOffRating=0, topDefRating=0

  allStars.forEach(s => {
    const reached=S.roundReached[s.teamId]||'Group'
    s.fame=(s.fame||0)+(famePts[reached]||0)+(s.goals||0)*20
    s.wcsPlayed=(s.wcsPlayed||0)
    if(reached==='Winner') s.medals.gold++
    else if(reached==='Final') s.medals.silver++
    else if(reached==='Semi-finals') s.medals.bronze++
    // Awards
    if (s.goals>(topGoals)) { topGoals=s.goals; topScorer=s }
    const avgR=s.ratings?.length?(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length):0
    if (['FWD','MID'].includes(s.pos) && avgR>topOffRating) { topOffRating=avgR; offMVP=s }
    if (['DEF','GK'].includes(s.pos) && avgR>topDefRating) { topDefRating=avgR; defMVP=s }
  })

  S.seasonAwards = {
    topScorer: topScorer?{name:topScorer.name,goals:topGoals,team:topScorer.teamName,tier:topScorer.tier}:null,
    offMVP:    offMVP   ?{name:offMVP.name,   rating:topOffRating.toFixed(1),team:offMVP.teamName,pos:offMVP.pos,tier:offMVP.tier}:null,
    defMVP:    defMVP   ?{name:defMVP.name,   rating:topDefRating.toFixed(1),team:defMVP.teamName,pos:defMVP.pos,tier:defMVP.tier}:null,
  }

  S.history=S.history||[]
  S.history.push({
    season:S.season, champion:S.champion.id, championName:S.champion.name, cc:S.champion.cc,
    roundReached:{...S.roundReached},
    topScorers:Object.entries(S.scorers||{}).sort((a,b)=>b[1]-a[1]).slice(0,5),
    totalGoals:Object.values(S.teamGoals||{}).reduce((a,b)=>a+b,0),
    awards:{...S.seasonAwards},
    stars:allStars.map(s=>({name:s.name,teamName:s.teamName,pos:s.pos,tier:s.tier,goals:s.goals||0,medals:{...s.medals},avgRating:s.ratings?.length?(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length):0}))
  })
  autoSave()
}

// ── Transfer window ───────────────────────────────────────────
export function runTransfers() {
  if (!S.allTeams) return { playerMoves:[], coachMoves:[] }
  const results = { playerMoves:[], coachMoves:[] }
  const histScore = id => normalizeHistScore(id)

  // ── Star transfers (~10% so 80 stars → 8-12 moves) ─────────────
  let playerMoveCount = 0
  const MAX_PLAYER_MOVES = 12
  S.allTeams.forEach(team => {
    if (!team.stars) team.stars=[]
    team.stars.forEach(star => {
      if (playerMoveCount >= MAX_PLAYER_MOVES) return
      if (Math.random() > 0.10) return
      // Find destination weighted by history
      const otherTeams = S.allTeams.filter(t => t.id!==team.id)
      const total=otherTeams.reduce((s,t)=>s+histScore(t.id),0)
      let r=Math.random()*total, dest=otherTeams[otherTeams.length-1]
      for (const t of otherTeams) { r-=histScore(t.id); if(r<=0){dest=t;break} }

      // Destination must have < 3 stars, else drop lowest
      if (!dest.stars) dest.stars=[]
      if (dest.stars.length>=3) {
        const tierOrder=['legendary','epic','rare','uncommon','common']
        dest.stars.sort((a,b)=>tierOrder.indexOf(a.tier)-tierOrder.indexOf(b.tier))
        const dropped=dest.stars.pop()
        results.playerMoves.push({name:dropped.name,from:dest.name,to:'Free agent',tier:dropped.tier,type:'released'})
      }

      const from=team.name
      team.stars=team.stars.filter(s=>s!==star)
      star.teamId=dest.id; star.teamName=dest.name; star.cc=dest.cc
      dest.stars.push(star)
      results.playerMoves.push({name:star.name,from,to:dest.name,tier:star.tier,type:'transfer'})
      playerMoveCount++

      // If source team now has 0 stars, create a new one
      if (team.stars.length===0) {
        // Find a team with >1 star to take from, or create new
        const donor=S.allTeams.filter(t=>t.id!==team.id&&(t.stars||[]).length>1).sort((a,b)=>(b.stars?.length||0)-(a.stars?.length||0))[0]
        if (donor) {
          const tierOrder=['common','uncommon','rare','epic','legendary']
          donor.stars.sort((a,b)=>tierOrder.indexOf(a.tier)-tierOrder.indexOf(b.tier))
          const moved=donor.stars.pop()
          moved.teamId=team.id; moved.teamName=team.name; moved.cc=team.cc
          team.stars.push(moved)
          results.playerMoves.push({name:moved.name,from:donor.name,to:team.name,tier:moved.tier,type:'transfer'})
        } else {
          const newStar=genStar(team)
          team.stars.push(newStar)
          results.playerMoves.push({name:newStar.name,from:'Academy',to:team.name,tier:newStar.tier,type:'new'})
        }
      }
    })
  })

  // ── Coach swaps (15% chance each) ─────────────────────────────
  const movingCoaches=[]
  S.coaches=S.coaches||[]
  S.coaches.forEach(coach => {
    const age=S.season-(coach.season||1)
    if (age>=coach.lifespan) {
      results.coachMoves.push({name:coach.name,from:coach.teamName,type:'retired',tier:coach.tier})
      movingCoaches.push({coach,reason:'retired'})
    } else if (Math.random()<0.08) {
      movingCoaches.push({coach,reason:'transfer'})
    }
  })

  movingCoaches.forEach(({coach,reason}) => {
    const oldTeam=coach.teamName
    const otherTeams=S.allTeams.filter(t=>t.id!==coach.teamId)
    const dest=pick(otherTeams)
    const destCoach=S.coaches.find(c=>c.teamId===dest.id&&c.id!==coach.id)
    if (destCoach && reason!=='retired') {
      // Swap
      const tmp=destCoach.teamId; const tmpName=destCoach.teamName
      destCoach.teamId=coach.teamId; destCoach.teamName=coach.teamName
      coach.teamId=tmp; coach.teamName=tmpName
      results.coachMoves.push({name:coach.name,from:oldTeam,to:coach.teamName,tier:coach.tier,type:'swap'})
      results.coachMoves.push({name:destCoach.name,from:tmpName,to:destCoach.teamName,tier:destCoach.tier,type:'swap'})
    } else if (reason==='retired') {
      S.coaches=S.coaches.filter(c=>c.id!==coach.id)
      // Assign new coach to that team
      const usedIds=new Set(S.coaches.map(c=>c.id))
      const available=COACH_POOL.filter(c=>!usedIds.has(c.id))
      const team=S.allTeams.find(t=>t.id===coach.teamId)
      if (team) {
        const newCoach = genCoach(team)
        S.coaches.push(newCoach)
        results.coachMoves.push({name:newCoach.name,from:'Free agent',to:team.name,tier:newCoach.tier,type:'signed'})
      }
    }
  })

  // Age out stars
  S.allTeams.forEach(team => {
    if (!team.stars) return
    team.stars=team.stars.filter(s=>{
      const age=(S.season||1)-(s.season||1)
      return age<s.lifespan
    })
    // Ensure minimum 1 star per team
    if (team.stars.length===0) {
      const s=genStar(team); team.stars.push(s)
      results.playerMoves.push({name:s.name,from:'Youth Academy',to:team.name,tier:s.tier,type:'new'})
    }
  })

  return results
}

export function startNewSeason() {
  S.season=(S.season||1)+1
  S.phase='idle'; S.champion=null
  S.groups=[]; S.groupMatches=[]; S.knockoutRounds=[]
  S.scorers={}; S.teamGoals={}; S.teamGoalsConceded={}
  S.allMatchResults=[]; S.roundReached={}; S.seasonAwards={}
  S.teams?.forEach(t=>{ t.pts=0;t.w=0;t.d=0;t.l=0;t.gf=0;t.ga=0;t.gd=0;t.star=null;t.coach=null })
  // Reset star goals and ratings for new season
  S.allTeams?.forEach(t => { (t.stars||[]).forEach(s=>{ s.goals=0; s.ratings=[] }) })
}

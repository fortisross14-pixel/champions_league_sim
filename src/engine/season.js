import { S, autoSave } from '../store.js'
import { LEAGUES, LEAGUE_TEAMS, ALL_TEAMS } from '../data/teams.js'
import { simMatch, rand, clamp, pick, shuffle, gaussRand, ovr, getEffStats } from './match.js'
import {
  genNameForCC, genCoachName, pickPlayerNationality, COUNTRY_NAME
} from '../data/players.js'

// ── Tier helpers ─────────────────────────────────────────────
export const tierOf = f => f>=2000?'legendary':f>=800?'epic':f>=300?'rare':f>=80?'uncommon':'common'
export const tierLabel = t => ({legendary:'Legendary',epic:'Epic',rare:'Rare',uncommon:'Uncommon',common:'Common'})[t]||t
export const tierColor = t => ({legendary:'#ff9800',epic:'#9c27b0',rare:'#2196f3',uncommon:'#4caf50',common:'#6a7a9a'})[t]||'#6a7a9a'

// Rarity distribution: 2% legendary, 5% epic, 10% rare, 18% uncommon, 65% common
function rollTier() {
  const r = Math.random()
  if (r < 0.02) return 'legendary'
  if (r < 0.07) return 'epic'
  if (r < 0.17) return 'rare'
  if (r < 0.35) return 'uncommon'
  return 'common'
}

// ── Stat bonuses by position × rarity ────────────────────────
// Each position gets a stat profile that scales up with rarity.
// Stats: attack, defense, stamina, mental, setPieces.
// ── Player skill bonuses by position × rarity ────────────────
// Power 1 — these directly add to the team's five ratings when
// the player is on the side. Calibration follows the design doc:
//   Legendary: 10-12 to 3-4 stats
//   Epic:      6-8 to 2-3 stats, plus 5-6 to a couple more
//   Rare:      similar magnitude to epic but NO trait (Power 2)
//   Uncommon:  5-6 to one or two stats, 1-2 to a couple more
//   Common:    2-3 to a couple of stats
//
// Forwards: heavy attack/mentality/stamina, some set pieces
// (heading & free kicks). No defense — defenders defend.
// Midfielders: spread across all five (the most balanced role).
// Defenders: heavy defense/stamina/mentality, some set pieces
// (corner-kick header threats). Light attack on top tiers only.
// GK: defense + mentality only (a goalkeeper doesn't add attack).
const STAT_BONUSES = {
  FWD: {
    common:    { attack:3, stamina:2 },
    uncommon:  { attack:5, stamina:5, mental:2, setPieces:2 },
    rare:      { attack:7, stamina:6, mental:6, setPieces:5 },
    epic:      { attack:8, stamina:7, mental:7, setPieces:6 },
    legendary: { attack:11, stamina:10, mental:11, setPieces:9 },
  },
  MID: {
    common:    { mental:2, attack:2, defense:2 },
    uncommon:  { mental:5, attack:5, defense:3, stamina:2 },
    rare:      { mental:7, attack:6, defense:5, stamina:5, setPieces:4 },
    epic:      { mental:8, attack:7, defense:6, stamina:6, setPieces:5 },
    legendary: { mental:11, attack:10, defense:9, stamina:9, setPieces:8 },
  },
  DEF: {
    common:    { defense:3, stamina:2 },
    uncommon:  { defense:5, stamina:5, mental:2, setPieces:2 },
    rare:      { defense:7, stamina:6, mental:6, setPieces:5, attack:2 },
    epic:      { defense:8, stamina:7, mental:7, setPieces:6, attack:3 },
    legendary: { defense:11, stamina:10, mental:11, setPieces:8, attack:4 },
  },
  GK: {
    common:    { defense:3 },
    uncommon:  { defense:5, mental:2 },
    rare:      { defense:7, mental:5 },
    epic:      { defense:8, mental:7 },
    legendary: { defense:11, mental:11 },
  },
}

// Per-game goal distribution by position × rarity.
// Indices = [P(0g), P(1g), P(2g), P(3g), P(4g)] (must sum ≤ 1.0).
// Any leftover probability mass is implicit "no goals beyond 4".
export const GOAL_DIST = {
  FWD: {
    common:    [0.60, 0.30, 0.10, 0.00, 0.00],
    uncommon:  [0.50, 0.35, 0.13, 0.02, 0.00],
    rare:      [0.38, 0.38, 0.18, 0.05, 0.01],
    epic:      [0.22, 0.35, 0.28, 0.12, 0.03],
    legendary: [0.10, 0.25, 0.35, 0.22, 0.08],
  },
  MID: {
    common:    [0.80, 0.17, 0.03, 0.00, 0.00],
    uncommon:  [0.72, 0.22, 0.05, 0.01, 0.00],
    rare:      [0.60, 0.28, 0.10, 0.02, 0.00],
    epic:      [0.45, 0.35, 0.15, 0.05, 0.00],
    legendary: [0.30, 0.35, 0.25, 0.08, 0.02],
  },
  DEF: {
    common:    [0.92, 0.07, 0.01, 0.00, 0.00],
    uncommon:  [0.88, 0.11, 0.01, 0.00, 0.00],
    rare:      [0.80, 0.16, 0.03, 0.01, 0.00],
    epic:      [0.70, 0.22, 0.07, 0.01, 0.00],
    legendary: [0.55, 0.30, 0.12, 0.03, 0.00],
  },
  GK: {
    common:    [1.00, 0, 0, 0, 0],
    uncommon:  [1.00, 0, 0, 0, 0],
    rare:      [0.99, 0.01, 0, 0, 0],
    epic:      [0.98, 0.02, 0, 0, 0],
    legendary: [0.95, 0.05, 0, 0, 0],
  },
}

// Per opposing-goal "save / block" probability — defenders & GKs may
// cancel an enemy goal entirely.
export const SAVE_PROB = {
  GK:  { common:0.12, uncommon:0.20, rare:0.32, epic:0.50, legendary:0.70 },
  DEF: { common:0.08, uncommon:0.14, rare:0.22, epic:0.35, legendary:0.50 },
}

// ── Star Traits (Power 2) ────────────────────────────────────
// Only legendary and epic players get a trait. They split into two
// flavours: "stat-side" boost a match stat (shots, corners, possession)
// directly; "conversion-side" change how stats translate into goals.
// The match engine reads `trait.id` and applies the effect.
//
// Each trait declares which positions it suits via `positions`.
export const STAR_TRAITS = [
  // ── FWD: stat-side ──────────────────────────────────────────
  { id:'goal_mentality', name:'Goal Mentality',
    description:'Adds extra shots to the team in the first 60 minutes (+5/6 Leg, +3/4 Epic).',
    positions:['FWD'], side:'stat' },
  { id:'look_for_corner', name:'Look for the Corner',
    description:'Hunts corners — adds team corners in the first 60 minutes (+5/6 Leg, +3/4 Epic).',
    positions:['FWD','MID'], side:'stat' },
  // ── FWD: conversion-side ────────────────────────────────────
  { id:'precise_shooting', name:'Precise Shooting',
    description:'Team shot conversion is 20-50% Leg / 10-40% Epic instead of the 0-20% baseline.',
    positions:['FWD'], side:'conv' },
  { id:'penalty_box_predator', name:'Penalty Box Predator',
    description:'If the team scores, the first goal of the match is theirs.',
    positions:['FWD'], side:'conv' },

  // ── MID: stat-side ──────────────────────────────────────────
  { id:'control_tempo', name:'Control the Tempo',
    description:'Anchors midfield — team possession +12% Leg / +6% Epic in the first 60 minutes.',
    positions:['MID'], side:'stat' },
  { id:'engine', name:'Engine of the Team',
    description:'Tireless runner — team stamina effectively never drops in the last 30 minutes.',
    positions:['MID'], side:'stat' },
  // ── MID: conversion-side ────────────────────────────────────
  { id:'useful_possession', name:'Useful Possession',
    description:'Possession converts harder — bonus goals from possession are doubled.',
    positions:['MID'], side:'conv' },
  { id:'dead_ball_specialist', name:'Dead-Ball Specialist',
    description:'Free kicks & corners convert at 2× the team baseline (Juninho-style).',
    positions:['MID','FWD','DEF'], side:'conv' },

  // ── DEF: stat-side ──────────────────────────────────────────
  { id:'kick_it_far', name:'Kick It Far',
    description:'Clears danger — opponent shots in the first 60 minutes are reduced (-5/6 Leg, -3/4 Epic).',
    positions:['DEF'], side:'stat' },
  { id:'aerial_wall', name:'Aerial Wall',
    description:'Wins everything in the air — opponent corners in the first 60 minutes are reduced (-4/5 Leg, -2/3 Epic).',
    positions:['DEF','GK'], side:'stat' },
  // ── DEF: conversion-side ────────────────────────────────────
  { id:'nullify', name:'Nullifier',
    description:'Marks the opponent\'s best player out of the game — their stat bonuses are ignored this match.',
    positions:['DEF'], side:'conv', tierLock:'legendary' },
  { id:'last_ditch', name:'Last-Ditch Block',
    description:'Caps opponent shot conversion at 10% Leg / 15% Epic.',
    positions:['DEF'], side:'conv' },

  // ── GK: conversion-side ─────────────────────────────────────
  { id:'wall_keeper', name:'The Wall',
    description:'Opponent can never score more than 1 goal in this match.',
    positions:['GK'], side:'conv', tierLock:'legendary' },
  { id:'penalty_specialist', name:'Penalty Specialist',
    description:'+1 mental in close games and tilts penalty shootouts in the team\'s favour.',
    positions:['GK'], side:'conv' },
  { id:'catlike_reflexes', name:'Catlike Reflexes',
    description:'Each shot the opponent takes has a 6-10% chance of being saved spectacularly.',
    positions:['GK'], side:'conv' },
]

// Pick a trait suitable for this position & tier.
function pickStarTrait(pos, tier) {
  if (tier !== 'legendary' && tier !== 'epic') return null
  const eligible = STAR_TRAITS.filter(t => {
    if (!t.positions.includes(pos)) return false
    if (t.tierLock && t.tierLock !== tier) return false
    return true
  })
  if (!eligible.length) return null
  return pick(eligible)
}

// Roll a goal count from a distribution.
export function rollGoalsFromDist(dist) {
  const r = Math.random()
  let acc = 0
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i]
    if (r < acc) return i
  }
  return 0
}

// ── Regenerate skills for an existing star ──────────────────
// Keeps identity (id, name, nationality, position, tier, team,
// age/lifespan, career stats); only refreshes Power 1 (statBonus,
// goalDist, saveProb) and Power 2 (trait) per the latest catalog.
export function regenStarSkills(star) {
  if (!star?.pos || !star?.tier) return
  star.statBonus = STAT_BONUSES[star.pos]?.[star.tier] || {}
  star.goalDist  = GOAL_DIST[star.pos]?.[star.tier]   || [1,0,0,0,0]
  star.saveProb  = SAVE_PROB[star.pos]?.[star.tier]   || 0
  star.trait     = pickStarTrait(star.pos, star.tier)
}

// ── Regenerate skills for an existing coach ─────────────────
// Keeps identity & career history; refreshes statBonus and trait.
export function regenCoachSkills(coach) {
  if (!coach?.tier) return
  coach.statBonus = COACH_BONUSES[coach.tier] || {}
  // Only legendary/epic coaches get a trait.
  if (coach.tier === 'legendary' || coach.tier === 'epic') {
    const eligible = COACH_TRAITS.filter(t => t.tier === coach.tier)
    coach.trait = eligible.length ? pick(eligible) : null
  } else {
    coach.trait = null
  }
}

// Build a human-readable description of a star's skills.
export function describeStarSkills(star) {
  const lines = []
  const stats = STAT_BONUSES[star.pos]?.[star.tier] || {}
  const statBits = Object.entries(stats).map(([k,v]) => `+${v} ${k.toUpperCase().slice(0,3)}`).join(', ')
  if (statBits) lines.push(statBits)

  const dist = GOAL_DIST[star.pos]?.[star.tier]
  if (dist && dist.some((p,i) => i>0 && p>0.005)) {
    const parts = dist.map((p,i) => p>0.005 ? `${Math.round(p*100)}% ${i}g` : null).filter(Boolean)
    lines.push(`Scoring: ${parts.join(' / ')}`)
  }

  if (['GK','DEF'].includes(star.pos)) {
    const sp = SAVE_PROB[star.pos]?.[star.tier] || 0
    lines.push(`${Math.round(sp*100)}% chance to deny each opponent goal`)
  }

  // Power 2 trait — only legendary/epic players have one.
  if (star.trait) {
    lines.push(`✦ ${star.trait.name}: ${star.trait.description}`)
  }
  return lines
}

// ── Team season stats update ─────────────────────────────────
// Every team has a permanent `base` rating (set in teams.js — Real
// Madrid 98, Bayern/Liverpool/Milan 95, midtable ~80, smallest ~70).
//
// Each season the team's five stats (attack, defense, stamina,
// mental, setPieces) are *re-rolled* around `base`, with two
// constraints:
//   1. The target is base + N(0, 7), so most teams stay within ±7 of
//      base, with progressively rarer chance of ±10, ±14, etc.
//   2. The change from last season is capped at ±8 per stat, so a
//      team can't oscillate wildly year over year.
//
// Stats are stored on team.seasonStats (the live numbers used by
// the engine) and on S.allTeams's `lastSeasonStats` for the cap.
// We also track:
//   - team.lastSeasonOverall = round(avg of last season's stats),
//     used for the "PS-Ov" column. 0 in season 1.
//   - team.currentOverall = round(avg of THIS season's stats),
//     used for the "CS-Ov" column.
export function runStatsUpdate() {
  if (!S.allTeams) return
  S.allTeams.forEach(t => {
    const base = t.base || 75
    const prev = t.seasonStats   // may be undefined on first run
    // Snapshot what we had (becomes "previous season" for the column).
    if (prev) {
      const prevOv = Math.round((prev.attack + prev.defense + prev.stamina + prev.mental + prev.setPieces) / 5)
      t.lastSeasonOverall = prevOv
      t.lastSeasonStats = { ...prev }
    } else {
      t.lastSeasonOverall = 0
      t.lastSeasonStats = null
    }

    // For each of the 5 stats, roll a new value.
    // EXCEPT mental — that's intentionally a fixed 60 baseline for
    // every team every season. The only variance in mental comes
    // from (a) star/coach statBonus.mental, applied at match time,
    // and (b) the tournament mentality delta that builds with wins
    // and erodes with losses. This makes "team confidence" purely
    // an in-tournament narrative arc, not a stat-rollover artifact.
    const rollStat = key => {
      if (key === 'mental') return 60
      const target = clamp(Math.round(base + gaussRand(7)), 40, 110)
      if (!prev) return target  // first season — no cap, just take the roll
      const previousVal = prev[key] || base
      const minVal = previousVal - 8
      const maxVal = previousVal + 8
      return clamp(target, minVal, maxVal)
    }
    const newStats = {
      attack:    rollStat('attack'),
      defense:   rollStat('defense'),
      stamina:   rollStat('stamina'),
      mental:    rollStat('mental'),
      setPieces: rollStat('setPieces'),
    }
    t.seasonStats = newStats
    t.currentOverall = Math.round(
      (newStats.attack + newStats.defense + newStats.stamina + newStats.mental + newStats.setPieces) / 5
    )
  })
}

// Build the per-match `stats` object from the team's seasonStats. This
// is what getEffStats() will read. Falls back to a base-derived
// estimate if seasonStats hasn't been generated yet (legacy saves).
function buildStats(team) {
  if (team.seasonStats) return { ...team.seasonStats }
  // Legacy fallback: cluster around the team's base with light noise.
  const base = team.base || 75
  const n = () => Math.round(gaussRand(4))
  return {
    attack:    clamp(base + n(), 40, 110),
    defense:   clamp(base + n(), 40, 110),
    stamina:   clamp(base + n(), 40, 110),
    mental:    clamp(base + n(), 40, 110),
    setPieces: clamp(base + n(), 40, 110),
  }
}

// History points (0-20) for a team — used to weight transfers etc.
export function histPts(teamId) {
  if (!S.history?.length) return 0
  const pts = { Winner:20, Final:15, 'Semi-finals':10, 'Quarter-finals':6, 'Round of 16':3 }
  const recent = [...S.history].reverse().slice(0,5)
  let ws=0, ss=0
  recent.forEach((h,i) => {
    const w=recent.length-i; ws+=w
    ss += w*(pts[h.roundReached?.[teamId]]||0)
  })
  return ws ? Math.round((ss/(ws*20))*20) : 0
}

// ── Random POSITION for a star ───────────────────────────────
const POSITIONS = ['FWD','FWD','FWD','MID','MID','GK','DEF']

// ── Generate a star player ────────────────────────────────────
//
// Order per spec: born into a team → assigned nationality (60% team,
// 40% foreign) → assigned rarity → assigned position → skills →
// random name from country DB → career length (8-12 yrs).
export function genStar(team) {
  const nationality = pickPlayerNationality(team.cc)
  const tier = rollTier()
  const pos = pick(POSITIONS)
  const statBonus = STAT_BONUSES[pos]?.[tier] || {}
  const goalDist  = GOAL_DIST[pos]?.[tier] || [1,0,0,0,0]
  const saveProb  = SAVE_PROB[pos]?.[tier] || 0
  const trait     = pickStarTrait(pos, tier)
  return {
    id: `s_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name: genNameForCC(nationality),
    nationality,
    pos, tier,
    teamId: team.id, teamName: team.name, cc: team.cc,
    season: S.season || 1,
    lifespan: rand(8, 12),
    goals: 0, ratings: [], wcsPlayed: 0, fame: 0,
    medals: { gold:0, silver:0, bronze:0 },
    statBonus,
    goalDist,
    saveProb,
    trait,
  }
}

// ── Coach skills by rarity ────────────────────────────────────
// Common / uncommon / rare coaches just add stats. Epic and
// legendary coaches additionally get a *named trait* (Power 2)
// with a rich match-time effect (resolved in match.js).
//
// Coaches affect the whole side; their per-stat bonuses are
// smaller than a single legendary player's, but spread across
// every stat. Tuning roughly:
//   Legendary: ~7-9 to most stats (sums to ~38 across 5)
//   Epic:      ~5-7
//   Rare:      ~3-5
//   Uncommon:  ~2-3
//   Common:    ~1-2
const COACH_BONUSES = {
  legendary: { attack:8, defense:8, stamina:7, mental:9, setPieces:7 },
  epic:      { attack:6, defense:6, stamina:5, mental:7, setPieces:5 },
  rare:      { attack:4, defense:4, stamina:3, mental:5, setPieces:3 },
  uncommon:  { attack:3, defense:2, stamina:2, mental:3, setPieces:1 },
  common:    { attack:2, defense:2, stamina:1, mental:2, setPieces:1 },
}

// Legendary / epic trait pool. Each trait has:
//   id          — referenced by match.js
//   name        — display label
//   description — human-readable effect
//   tier        — 'legendary' | 'epic' (for selection)
// Effects fire inside simMatch() based on the id.
//
// The new engine reads these in two phases: stat-side traits modify
// shots/possession/corners/stamina; conversion-side traits modify
// how those stats translate to goals.
export const COACH_TRAITS = [
  // ── Legendary — stat-side ───────────────────────────────────
  {
    id: 'tiki_taka',
    name: 'Tiki-Taka Master',
    description: 'Team possession +12% in the first 60 minutes.',
    tier: 'legendary',
  },
  {
    id: 'gegenpress',
    name: 'Gegenpress',
    description: 'Team shots +5 and opponent shots -3 in the first 60 minutes; team stamina drains slightly faster.',
    tier: 'legendary',
  },
  // ── Legendary — conversion-side ─────────────────────────────
  {
    id: 'catenaccio',
    name: 'Catenaccio Master',
    description: 'Team never concedes more than 1 goal per match.',
    tier: 'legendary',
  },
  {
    id: 'iron_curtain',
    name: 'Iron Curtain',
    description: 'Opposing star players have their goal contribution capped at 1.',
    tier: 'legendary',
  },
  {
    id: 'counter_attack',
    name: 'Counter-Attack Genius',
    description: 'When team possession is below 50%, +2 bonus goals from devastating counter-attacks.',
    tier: 'legendary',
  },
  {
    id: 'big_match',
    name: 'Big-Match Player',
    description: 'In knockout matches, all five team stats receive an extra +5 boost.',
    tier: 'legendary',
  },

  // ── Epic — stat-side ────────────────────────────────────────
  {
    id: 'high_press',
    name: 'High Press',
    description: 'Team shots +3 and opponent shots -2 in the first 60 minutes; opponent gets +1 shot in the last 30.',
    tier: 'epic',
  },
  {
    id: 'set_piece_specialist',
    name: 'Set-Piece Specialist',
    description: 'Team corners +3 in the first 60 minutes and corner→goal conversion is doubled.',
    tier: 'epic',
  },
  {
    id: 'park_the_bus',
    name: 'Park the Bus',
    description: 'Opponent shots -4 in the first 60 minutes; team possession capped at 45%.',
    tier: 'epic',
  },
  // ── Epic — conversion-side ──────────────────────────────────
  {
    id: 'comeback_king',
    name: 'Comeback King',
    description: 'In the last 30 minutes, if the team is losing, 50% chance of one equaliser goal.',
    tier: 'epic',
  },
  {
    id: 'man_motivator',
    name: 'Man Motivator',
    description: '40% chance per match of a "tactical masterclass" extra goal.',
    tier: 'epic',
  },
  {
    id: 'youth_whisperer',
    name: 'Youth Whisperer',
    description: 'All non-legendary players on this team gain +2 to their statBonus values.',
    tier: 'epic',
  },
]

function rollCoachTier() {
  const r = Math.random()
  if (r < 0.04) return 'legendary'
  if (r < 0.12) return 'epic'
  if (r < 0.30) return 'rare'
  if (r < 0.55) return 'uncommon'
  return 'common'
}

function pickCoachTrait(tier) {
  const pool = COACH_TRAITS.filter(t => t.tier === tier)
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// Render a human-readable list of bullet points describing a coach's
// effect on their team — used in the Stars & Coaches tab.
export function describeCoachSkills(coach) {
  if (!coach) return []
  const lines = []
  const sb = coach.statBonus || {}
  const stats = ['attack','defense','stamina','mental','setPieces']
    .filter(k => sb[k])
    .map(k => `+${sb[k]} ${k === 'setPieces' ? 'set pieces' : k}`)
  if (stats.length) lines.push('Team boost: ' + stats.join(', '))
  if (coach.trait) {
    lines.push(`✦ ${coach.trait.name}: ${coach.trait.description}`)
  }
  return lines
}

export function genCoach(team) {
  const tier = rollCoachTier()
  const trait = (tier === 'legendary' || tier === 'epic') ? pickCoachTrait(tier) : null
  return {
    id: `coach_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    name: genCoachName(team.cc),
    nationality: team.cc,
    tier,
    teamId: team.id, teamName: team.name,
    season: S.season || 1,
    lifespan: rand(5, 12),
    statBonus: COACH_BONUSES[tier],
    trait,             // legendary / epic only
  }
}

// ── Initialize stars and coaches for ALL teams ────────────────
// Seeds the world: every team gets at least one star + exactly one
// coach. Re-runnable: it only adds what's missing.
export function initStarsAndCoaches() {
  // Brand-new world: just create the team containers and the all-time
  // stats records. NO stars or coaches are generated here — those are
  // produced by the first run of `runMarket()` (which on season 1
  // finds every team empty and fills exactly one academy graduate +
  // one new manager per team).
  if (!S.allTeams) {
    S.allTeams = ALL_TEAMS.map(t => ({ ...t, stars: [], coachId: null }))
  }
  S.coaches = S.coaches || []

  // Initialize the all-time team stats container.
  if (!S.teamStats) S.teamStats = {}
  S.allTeams.forEach(t => {
    if (!t.stars) t.stars = []
    if (!S.teamStats[t.id]) {
      S.teamStats[t.id] = {
        id: t.id, name: t.name, cc: t.cc,
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0,
        participations: 0, titles: 0, finals: 0, semiFinals: 0,
        quarterFinals: 0, roundOf16: 0,
        localTitles: 0,
      }
    }
  })
}

// Attach the strongest star + coach to each qualified team for the
// upcoming Champions League. Also exposes team.stars (the FULL
// array of all stars on the team) so the match popup can show all
// of them and the engine can apply effects from every star.
export function linkStarsToTeams() {
  if (!S.allTeams) return
  const tierOrder = ['legendary','epic','rare','uncommon','common']
  S.teams.forEach(team => {
    const allTeam = S.allTeams.find(t => t.id === team.id)
    if (!allTeam) return
    const stars = [...(allTeam.stars || [])]
    stars.sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
    team.stars = stars                  // full array
    team.star  = stars[0] || null       // best star (legacy code paths)
    team.coach = S.coaches?.find(c => c.teamId === team.id) || null
  })
}

// ── Local-league simulation & qualifying ─────────────────────
// For each league, compute a season "score" for every team, sort, and
// take the top N (the league's slot count). The #1 team is the local
// champion and gets a `localTitles` increment.
//
// SPECIAL RULE: Teams hosting at least one *legendary* star or coach
// always qualify. If there are more legend-led teams in one league
// than there are qualification slots, they are ranked among themselves
// by score and the lowest-ranked legend team(s) get bumped to non-
// qualifying spots.
export function runLocalLeagues() {
  const allTeamMap = {}
  S.allTeams?.forEach(t => { allTeamMap[t.id] = t })

  const hasLegend = team => {
    const stars = team.stars || []
    if (stars.some(s => s.tier === 'legendary')) return true
    const coach = S.coaches?.find(c => c.teamId === team.id)
    if (coach?.tier === 'legendary') return true
    return false
  }

  const leagueResults = {}

  LEAGUES.forEach(L => {
    const teams = LEAGUE_TEAMS[L.id] || []
    const scored = teams.map(t => {
      const at = allTeamMap[t.id] || t
      const stars = at.stars || []
      const tierWeight = { legendary:8, epic:5, rare:3, uncommon:1, common:0 }
      const starBoost = stars.reduce((s,x) => s + (tierWeight[x.tier]||0), 0)
      const coach = S.coaches?.find(c => c.teamId === at.id)
      const coachBoost = tierWeight[coach?.tier] || 0
      // Use this season's actual overall (drift around base) as the
      // foundation, NOT the raw base — so a team that has a down year
      // really does play like a down-year team.
      const seasonOv = at.currentOverall || at.base || t.base || 70
      const score = seasonOv
        + Math.round(gaussRand(6))
        + starBoost
        + coachBoost
        + (histPts(t.id) * 0.3)
      return {
        team: t,
        score: Math.round(score),
        hasLegend: hasLegend(at),
      }
    }).sort((a,b) => b.score - a.score)

    // Apply legend-guarantee: if a team with a legend would otherwise
    // miss out, swap it into the qualifying band by demoting the
    // lowest-scoring non-legend team in the band.
    const slots = L.slots
    const inBand   = scored.slice(0, slots)
    const outBand  = scored.slice(slots)
    // For each legend that's outside the band, swap with the lowest-
    // scoring non-legend inside the band.
    outBand.forEach((entry, i) => {
      if (!entry.hasLegend) return
      // Find lowest-scoring non-legend currently inside the band.
      let weakestIdx = -1, weakestScore = Infinity
      for (let j = 0; j < inBand.length; j++) {
        if (inBand[j].hasLegend) continue
        if (inBand[j].score < weakestScore) {
          weakestScore = inBand[j].score
          weakestIdx = j
        }
      }
      if (weakestIdx === -1) return // every band slot is already a legend — skip
      // Swap.
      const demoted = inBand[weakestIdx]
      inBand[weakestIdx] = entry
      outBand[i] = demoted
    })
    // Re-sort the in-band by score so the champion (top of inBand)
    // remains the highest-scoring qualifying team. (Stable: equal
    // scores keep original sort order.)
    inBand.sort((a,b) => b.score - a.score)
    const finalStandings = [...inBand, ...outBand]

    leagueResults[L.id] = {
      league: L,
      standings: finalStandings,
      qualified: inBand.map(x => x.team),
    }

    // Mark the local champion: increment titles & remember name.
    const champion = inBand[0]?.team
    if (champion && S.teamStats?.[champion.id]) {
      S.teamStats[champion.id].localTitles = (S.teamStats[champion.id].localTitles || 0) + 1
    }
  })

  S.localLeagueResults = leagueResults
  return leagueResults
}

// Build the 32-team Champions League roster from local-league outcomes.
export function runQualification() {
  // Compute the local leagues first.
  if (!S.localLeagueResults) runLocalLeagues()

  const qualified = []
  LEAGUES.forEach(L => {
    const r = S.localLeagueResults[L.id]
    if (!r) return
    r.qualified.forEach((t, idx) => qualified.push({ team:t, league:L, isChampion: idx === 0 }))
  })

  const buildTeam = (entry) => {
    const t = entry.team
    // CRITICAL: t is from teams.js (the static data), which doesn't
    // carry the per-season `seasonStats` we generated in
    // runStatsUpdate(). Look that up on the LIVE allTeams entry.
    const live = S.allTeams?.find(at => at.id === t.id) || t
    const stats = live.seasonStats ? { ...live.seasonStats } : buildStats(live)
    const overall = Math.round(
      (stats.attack + stats.defense + stats.stamina + stats.mental + stats.setPieces) / 5
    )
    return {
      ...t,
      stats,                              // live numbers used by getEffStats
      seasonStats: stats,                 // mirror — preview/UI reads either name
      currentOverall: overall,            // for tiebreakers and Teams view
      lastSeasonOverall: live.lastSeasonOverall || 0,  // for UI
      rating: overall,                    // legacy alias kept for any old code paths
      hist: histPts(t.id),
      isLocalChampion: entry.isChampion,
      leagueId: entry.league.id,
      leagueName: entry.league.name,
      pts:0, w:0, d:0, l:0, gf:0, ga:0, gd:0,
      // Tournament mentality: starts at 0 delta (so effective = 60
      // baseline + 0). Updates after every match based on result vs
      // expected. Persists through groups and knockout. Resets each
      // season when runQualification is called fresh.
      mentalityDelta: 0,
      star:null, coach:null,
    }
  }

  S.teams = qualified.map(buildTeam).slice(0, 32)
  S.roundReached = {}
  S.teamGoals = {}
  S.teamGoalsConceded = {}
  S.teamShots = {}
  S.teamPossession = {}
  S.teamPossessionMatches = {}
  S.allMatchResults = []
  S.scorers = {}
  S.seasonAwards = {}

  // Bump participation count.
  S.teams.forEach(t => {
    if (S.teamStats?.[t.id]) S.teamStats[t.id].participations++
  })

  linkStarsToTeams()
}

// ── Group draw (8 groups of 4) ────────────────────────────────
export function drawGroups() {
  // True random group draw — the only hard constraint is that two
  // teams from the same country can't be in the same group. We use
  // backtracking because a greedy pass occasionally paints itself
  // into a corner (the last few teams' country is over-represented
  // in every remaining group with an open slot).
  //
  // Earlier versions seeded eight pots by team rating, which made
  // the top eight rated clubs always land in groups A–H in the
  // same order. Now every team is shuffled into the same pool and
  // dealt out randomly.
  const teams = shuffle([...S.teams])
  const groups = Array.from({length: 8}, (_, i) => ({
    id: String.fromCharCode(65 + i),
    teams: [],
  }))

  // Assign team i into a group; return true if the whole roster
  // could be placed without violating the same-country rule.
  const place = (i) => {
    if (i >= teams.length) return true
    const team = teams[i]
    // Try groups in random order so we don't bias toward A.
    const order = shuffle(groups.map((_, gi) => gi))
    for (const gi of order) {
      const g = groups[gi]
      if (g.teams.length >= 4) continue
      if (g.teams.some(t => t.cc === team.cc)) continue
      g.teams.push(team)
      if (place(i + 1)) return true
      g.teams.pop()
    }
    return false
  }

  if (!place(0)) {
    // Pathological case (e.g. 5+ teams from one country across the 32).
    // Fall back to ignoring the country rule rather than crashing.
    groups.forEach(g => { g.teams = [] })
    teams.forEach(team => {
      const target = pick(groups.filter(g => g.teams.length < 4))
      if (target) target.teams.push(team)
    })
  }

  S.groups = groups

  S.groupMatches = []
  S.groups.forEach((grp, gi) => {
    const t = grp.teams
    ;[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]].forEach(([a,b]) => {
      if (t[a] && t[b]) S.groupMatches.push({ gi, t1:t[a], t2:t[b], played:false, result:null })
    })
  })
}

// ── Group stats update ────────────────────────────────────────
export function updateGroupStats(r) {
  const {t1,t2,g1,g2} = r
  t1.gf=(t1.gf||0)+g1; t1.ga=(t1.ga||0)+g2; t1.gd=t1.gf-t1.ga
  t2.gf=(t2.gf||0)+g2; t2.ga=(t2.ga||0)+g1; t2.gd=t2.gf-t2.ga
  if (g1>g2)      { t1.w=(t1.w||0)+1; t1.pts=(t1.pts||0)+3; t2.l=(t2.l||0)+1 }
  else if (g2>g1) { t2.w=(t2.w||0)+1; t2.pts=(t2.pts||0)+3; t1.l=(t1.l||0)+1 }
  else            { t1.d=(t1.d||0)+1; t1.pts=(t1.pts||0)+1; t2.d=(t2.d||0)+1; t2.pts=(t2.pts||0)+1 }
}

// Apply the mentality changes from a match result onto the team
// objects. Both group and knockout matches do this — mentality
// persists for the whole tournament.
function applyMentalityDelta(r) {
  if (!r.mentalityChanges) return
  r.t1.mentalityDelta = r.mentalityChanges.team1.after
  r.t2.mentalityDelta = r.mentalityChanges.team2.after
}

export function playGroupMatch(match) {
  if (match.played) return
  const r = simMatch(match.t1, match.t2, true, false)
  match.played = true
  match.result = r
  updateGroupStats(r)
  applyMentalityDelta(r)
  trackMatchStats(r, 'group', match.gi)
  autoSave()
  return r
}

function trackMatchStats(r, phase, gi) {
  S.allMatchResults = S.allMatchResults || []
  S.allMatchResults.push({
    t1id:r.t1.id, t1name:r.t1.name, t1cc:r.t1.cc,
    t2id:r.t2.id, t2name:r.t2.name, t2cc:r.t2.cc,
    g1:r.g1, g2:r.g2,
    phase, gi,
    shots1:r.shots1, shots2:r.shots2,
    corners1:r.corners1, corners2:r.corners2,
    possession1:r.possession1,
  })
  S.teamGoals = S.teamGoals || {}
  S.teamGoalsConceded = S.teamGoalsConceded || {}
  S.teamShots = S.teamShots || {}
  S.teamPossession = S.teamPossession || {}     // sum of possession %
  S.teamPossessionMatches = S.teamPossessionMatches || {}  // count of matches
  S.teamGoals[r.t1.id] = (S.teamGoals[r.t1.id]||0) + r.g1
  S.teamGoals[r.t2.id] = (S.teamGoals[r.t2.id]||0) + r.g2
  S.teamGoalsConceded[r.t1.id] = (S.teamGoalsConceded[r.t1.id]||0) + r.g2
  S.teamGoalsConceded[r.t2.id] = (S.teamGoalsConceded[r.t2.id]||0) + r.g1
  S.teamShots[r.t1.id] = (S.teamShots[r.t1.id]||0) + (r.shots1||0)
  S.teamShots[r.t2.id] = (S.teamShots[r.t2.id]||0) + (r.shots2||0)
  S.teamPossession[r.t1.id] = (S.teamPossession[r.t1.id]||0) + (r.possession1||50)
  S.teamPossession[r.t2.id] = (S.teamPossession[r.t2.id]||0) + (100 - (r.possession1||50))
  S.teamPossessionMatches[r.t1.id] = (S.teamPossessionMatches[r.t1.id]||0) + 1
  S.teamPossessionMatches[r.t2.id] = (S.teamPossessionMatches[r.t2.id]||0) + 1

  // Top-scorers leaderboard (every star on each team).
  ;[r.t1, r.t2].forEach(t => {
    const stars = t.stars && t.stars.length ? t.stars : (t.star ? [t.star] : [])
    stars.forEach(s => {
      if (s.goals) S.scorers[s.name] = s.goals
    })
  })

  // All-time team stats: goals + W/D/L tracking.
  if (!S.teamStats) S.teamStats = {}
  ;[[r.t1, r.g1, r.g2], [r.t2, r.g2, r.g1]].forEach(([t, gf, ga]) => {
    if (!S.teamStats[t.id]) {
      S.teamStats[t.id] = {
        id:t.id, name:t.name, cc:t.cc,
        played:0, wins:0, draws:0, losses:0,
        goalsFor:0, goalsAgainst:0,
        participations:0, titles:0, finals:0, semiFinals:0,
        quarterFinals:0, roundOf16:0, localTitles:0,
      }
    }
    const st = S.teamStats[t.id]
    st.played++
    st.goalsFor += gf
    st.goalsAgainst += ga
    if (gf > ga) st.wins++
    else if (gf === ga) st.draws++
    else st.losses++
  })
}

export function buildKnockout() {
  // Tiebreaker chain: points → GD → GF → team rating. Matches the
  // sort used by the UI (renderGroups) so the displayed table and
  // the actual qualifying picks always agree.
  const cmp = (a,b) =>
    (b.pts||0) - (a.pts||0)
    || (b.gd||0) - (a.gd||0)
    || (b.gf||0) - (a.gf||0)
    || (b.rating||0) - (a.rating||0)
  S.groups.forEach(grp => {
    const sorted = [...grp.teams].sort(cmp)
    // Top 2 advance to R16.
    sorted.slice(0, 2).forEach(t => {
      if (!S.roundReached[t.id]) S.roundReached[t.id] = 'Round of 16'
    })
    // Bottom 2 are eliminated in the group stage.
    sorted.slice(2).forEach(t => {
      if (!S.roundReached[t.id]) S.roundReached[t.id] = 'Group'
    })
  })
  const winners = S.groups.map(g => [...g.teams].sort(cmp)[0])
  const runners = S.groups.map(g => [...g.teams].sort(cmp)[1])

  // ── True R16 draw + bracket placement ────────────────────────
  //
  // Two constraints:
  //   1. A R16 match pairs a group winner with a runner-up from a
  //      DIFFERENT group.
  //   2. Once placed in the bracket, two teams from the same group
  //      must not be able to meet again before the FINAL — i.e.
  //      they have to land in opposite halves of the bracket
  //      (slots 0–3 vs slots 4–7).
  //
  // We solve both with backtracking. We assign group winner i (in
  // a random order) to a bracket slot, then pair them with a random
  // eligible runner-up. "Eligible" = different group AND, if the
  // other team from runner's group is already placed, must be in
  // the opposite half.
  //
  // Bracket slots 0–7 map to:
  //   slot 0,1 → QF top-upper       │  half A
  //   slot 2,3 → QF top-lower       │
  //   slot 4,5 → QF bottom-upper    │  half B
  //   slot 6,7 → QF bottom-lower    │
  // SF crosses QF top vs QF top, QF bottom vs QF bottom.
  // Final is half-A winner vs half-B winner.
  const halfOf = slot => slot < 4 ? 0 : 1
  const NUM_SLOTS = 8

  // Picks a random R16 layout. Returns array of {slot, winner, runner}
  // or null if the constraints can't be satisfied (extremely rare).
  function drawR16() {
    const slotOrder = shuffle([0,1,2,3,4,5,6,7])
    const winnerOrder = shuffle(winners.map((_, i) => i))
    const placement = new Array(NUM_SLOTS).fill(null)
    // Per-group: which halves are already in use? Both teams in a
    // group must end up in different halves.
    const groupHalves = winners.map(() => new Set())

    // Step 1 — place each winner into a slot. Group winner i goes
    // into a randomly chosen slot. The winner's group then occupies
    // that slot's half.
    function placeWinner(idx) {
      if (idx === winnerOrder.length) return true
      const gi = winnerOrder[idx]
      for (const s of slotOrder) {
        if (placement[s]) continue
        placement[s] = { slot:s, winnerGroup: gi, runnerGroup: -1 }
        groupHalves[gi].add(halfOf(s))
        if (placeWinner(idx + 1)) return true
        placement[s] = null
        groupHalves[gi].delete(halfOf(s))
      }
      return false
    }
    if (!placeWinner(0)) return null

    // Step 2 — pair each slot's winner with a random eligible
    // runner-up. "Eligible" = different group and (if that group's
    // winner is already in the same half) only opposite half.
    const usedRunners = new Set()
    function pairRunner(idx) {
      if (idx === NUM_SLOTS) return true
      const slotInfo = placement[idx]
      const slotHalf = halfOf(slotInfo.slot)
      const candidateOrder = shuffle(winners.map((_, gi) => gi))
      for (const rgi of candidateOrder) {
        if (usedRunners.has(rgi)) continue
        if (rgi === slotInfo.winnerGroup) continue
        // Same-group constraint: the other team from rgi (the
        // winner) must not already be in this same half.
        if (groupHalves[rgi].has(slotHalf)) continue
        slotInfo.runnerGroup = rgi
        usedRunners.add(rgi)
        groupHalves[rgi].add(slotHalf)
        if (pairRunner(idx + 1)) return true
        usedRunners.delete(rgi)
        groupHalves[rgi].delete(slotHalf)
        slotInfo.runnerGroup = -1
      }
      return false
    }
    if (!pairRunner(0)) return null
    return placement
  }

  // Try a few times — any single attempt is overwhelmingly likely
  // to succeed, but the placement is randomized, so the occasional
  // dead end is normal. The constraints are easily satisfiable in
  // theory (8 winners, 8 runners, 4 slots per half).
  let layout = null
  for (let i = 0; i < 30 && !layout; i++) layout = drawR16()
  if (!layout) {
    // Last-resort fallback: deterministic pairing (legacy behaviour).
    // Should essentially never run.
    const pairs = [[0,1],[1,0],[2,3],[3,2],[4,5],[5,4],[6,7],[7,6]]
    layout = pairs.map(([wi, ri], slot) => ({ slot, winnerGroup: wi, runnerGroup: ri }))
  }

  const r16 = new Array(NUM_SLOTS)
  layout.forEach(p => {
    r16[p.slot] = {
      t1: winners[p.winnerGroup],
      t2: runners[p.runnerGroup],
      played: false, result: null,
    }
  })

  S.knockoutRounds = [{ name:'Round of 16', matches:r16 }]
}

export function playKnockoutMatch(match) {
  if (match.played) return
  const r = simMatch(match.t1, match.t2, false, true)
  match.played = true
  match.result = r
  applyMentalityDelta(r)
  trackMatchStats(r, 'knockout')
  autoSave()
  return r
}

export function advanceKnockout() {
  const round = S.knockoutRounds[S.knockoutRounds.length - 1]
  const winners = round.matches.map(m => m.result?.winner).filter(Boolean)
  const losers = round.matches.map(m => {
    if (!m.result?.winner) return null
    return m.result.winner === m.t1 ? m.t2 : m.t1
  }).filter(Boolean)

  losers.forEach(t => {
    if (!S.roundReached[t.id]) S.roundReached[t.id] = round.name
  })
  // Clear winners' markers — they're still alive and shouldn't be
  // tagged with a round they haven't been eliminated from. They'll
  // get a fresh marker the next time they actually lose (or 'Winner'
  // if they take the whole thing).
  winners.forEach(t => {
    if (S.roundReached[t.id] === round.name) delete S.roundReached[t.id]
  })

  if (winners.length === 1) {
    S.champion = winners[0]
    S.roundReached[winners[0].id] = 'Winner'
    if (losers[0]) S.roundReached[losers[0].id] = 'Final'
    S.phase = 'done'
    finalizeSeasonStats()
    return
  }
  const names = { 8:'Quarter-finals', 4:'Semi-finals', 2:'Final' }
  const newMatches = []
  for (let i = 0; i < winners.length; i += 2) {
    newMatches.push({ t1:winners[i], t2:winners[i+1], played:false, result:null })
  }
  S.knockoutRounds.push({ name: names[winners.length] || 'Next Round', matches:newMatches })
  autoSave()
}

function finalizeSeasonStats() {
  const famePts = { Winner:300, Final:150, 'Semi-finals':75, 'Quarter-finals':30, 'Round of 16':10 }
  // Players whose team made it to at least the quarterfinals are
  // eligible for the offensive/defensive MVP awards. Group-stage and
  // round-of-16 exits don't qualify, no matter how good their average
  // rating was — winning when it matters is the bar.
  const QF_OR_BETTER = new Set(['Quarter-finals', 'Semi-finals', 'Final', 'Winner'])

  // Gather every star on every qualified team — not just the headline one.
  const allStars = S.teams.flatMap(t => (t.stars && t.stars.length ? t.stars : (t.star ? [t.star] : []))).filter(Boolean)
  let topScorer=null, offMVP=null, defMVP=null
  let topGoals=0, topOffRating=0, topDefRating=0
  // Fallback candidates: best off/def regardless of round reached,
  // used only if no QF qualifier exists for that category. (Rare for
  // offense, but very possible for defense in season 1 when there's
  // only 1 star per team.)
  let fallbackOff=null, fallbackOffR=0
  let fallbackDef=null, fallbackDefR=0

  allStars.forEach(s => {
    const reached = S.roundReached[s.teamId] || 'Group'
    s.fame = (s.fame||0) + (famePts[reached]||0) + (s.goals||0)*20
    if (reached === 'Winner') s.medals.gold++
    else if (reached === 'Final') s.medals.silver++
    else if (reached === 'Semi-finals') s.medals.bronze++

    // Top scorer is OPEN to anyone — goals are goals.
    if ((s.goals||0) > topGoals) { topGoals = s.goals; topScorer = s }

    const avgR = s.ratings?.length ? (s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length) : 0
    if (avgR <= 0) return

    // Track fallback candidates across the whole field.
    if (['FWD','MID'].includes(s.pos) && avgR > fallbackOffR) { fallbackOffR = avgR; fallbackOff = s }
    if (['DEF','GK'].includes(s.pos) && avgR > fallbackDefR)  { fallbackDefR = avgR; fallbackDef = s }

    // Preferred MVP candidates: only QF or better.
    if (!QF_OR_BETTER.has(reached)) return
    if (['FWD','MID'].includes(s.pos) && avgR > topOffRating) { topOffRating = avgR; offMVP = s }
    if (['DEF','GK'].includes(s.pos) && avgR > topDefRating)  { topDefRating = avgR; defMVP = s }
  })

  // If no QF-qualified DEF/GK (or FWD/MID) exists, fall back to the
  // best across the field. This guarantees an MVP every season,
  // which matters most for season 1 / early seasons when there are
  // few stars to go around.
  if (!offMVP && fallbackOff) { offMVP = fallbackOff; topOffRating = fallbackOffR }
  if (!defMVP && fallbackDef) { defMVP = fallbackDef; topDefRating = fallbackDefR }

  S.seasonAwards = {
    topScorer: topScorer ? { name:topScorer.name, goals:topGoals, team:topScorer.teamName, tier:topScorer.tier } : null,
    offMVP:    offMVP    ? { name:offMVP.name, rating:topOffRating.toFixed(1), team:offMVP.teamName, pos:offMVP.pos, tier:offMVP.tier } : null,
    defMVP:    defMVP    ? { name:defMVP.name, rating:topDefRating.toFixed(1), team:defMVP.teamName, pos:defMVP.pos, tier:defMVP.tier } : null,
  }

  // Update all-time team stats from final positions reached.
  Object.entries(S.roundReached).forEach(([tid, reached]) => {
    const st = S.teamStats?.[tid]
    if (!st) return
    if (reached === 'Winner') st.titles++
    else if (reached === 'Final') st.finals++
    else if (reached === 'Semi-finals') st.semiFinals++
    else if (reached === 'Quarter-finals') st.quarterFinals++
    else if (reached === 'Round of 16') st.roundOf16++
  })

  // Find the runner-up — the team that lost the final.
  const runnerUpId = Object.keys(S.roundReached).find(tid => S.roundReached[tid] === 'Final')
  const runnerUp = runnerUpId ? S.teams.find(t => t.id === runnerUpId) : null

  // Per-team season record: one row per CL-qualified team with the
  // numbers we need to render the Team detail view (Year - OVR -
  // Round - Wins - Goals - Coach - Stars). Group-stage exits get
  // "Group" as their round; non-qualifiers (DNQ) are recorded
  // separately so we can show "DNQ" rows for all 81 teams.
  //
  // W/D/L/GF/GA are tallied across the entire tournament (group +
  // knockout). The team objects themselves only carry group-stage
  // counters (used for live group standings), so we re-aggregate
  // from S.allMatchResults — which trackMatchStats populates for
  // both phases — to get full-season totals.
  const fullStats = {}
  ;(S.allMatchResults || []).forEach(m => {
    const a = fullStats[m.t1id] || (fullStats[m.t1id] = { w:0, d:0, l:0, gf:0, ga:0 })
    const b = fullStats[m.t2id] || (fullStats[m.t2id] = { w:0, d:0, l:0, gf:0, ga:0 })
    a.gf += m.g1; a.ga += m.g2
    b.gf += m.g2; b.ga += m.g1
    if (m.g1 > m.g2)      { a.w++; b.l++ }
    else if (m.g2 > m.g1) { b.w++; a.l++ }
    else                  { a.d++; b.d++ }
  })

  // ── All-time coach stats accumulator ────────────────────────
  // Mirrors S.teamStats but keyed by coach.id, so coach detail
  // screens can show career totals across every club they've led.
  // A coach gets credit for whatever happened to whichever team
  // they led this season. Local titles are awarded by walking
  // S.localLeagueResults (each league's #1 team's coach).
  if (!S.coachStats) S.coachStats = {}
  const ensureCoachStat = (c, teamName, teamCC) => {
    if (!c?.id) return null
    if (!S.coachStats[c.id]) {
      S.coachStats[c.id] = {
        id: c.id, name: c.name, tier: c.tier, nationality: c.nationality,
        // Final-snapshot info kept fresh so retired coaches still render.
        lastTeamName: teamName, lastTeamCC: teamCC,
        firstSeason: S.season || 1,
        // Career totals (CL only — local-league games aren't simulated).
        seasons: 0,
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0,
        titles: 0, finals: 0, semiFinals: 0, quarterFinals: 0, roundOf16: 0,
        groupExits: 0, dnqs: 0,
        localTitles: 0,
      }
    }
    const cs = S.coachStats[c.id]
    cs.lastTeamName = teamName
    cs.lastTeamCC = teamCC
    cs.tier = c.tier   // tier never changes, but cheap to refresh
    return cs
  }

  // 1) Credit CL coaches (qualified teams) with games + round reached.
  S.teams.forEach(t => {
    if (!t.coach?.id) return
    const cs = ensureCoachStat(t.coach, t.name, t.cc)
    if (!cs) return
    cs.seasons++
    const fs = fullStats[t.id] || { w:0, d:0, l:0, gf:0, ga:0 }
    cs.played += fs.w + fs.d + fs.l
    cs.wins   += fs.w
    cs.draws  += fs.d
    cs.losses += fs.l
    cs.goalsFor      += fs.gf
    cs.goalsAgainst  += fs.ga
    const reached = S.roundReached[t.id] || 'Group'
    if      (reached === 'Winner')         cs.titles++
    else if (reached === 'Final')          cs.finals++
    else if (reached === 'Semi-finals')    cs.semiFinals++
    else if (reached === 'Quarter-finals') cs.quarterFinals++
    else if (reached === 'Round of 16')    cs.roundOf16++
    else                                   cs.groupExits++
  })

  // 2) Credit DNQ coaches with a "season managed" + DNQ marker.
  //    No CL games to add — they sat out — but they did manage a club.
  const qualifiedIdSet = new Set(S.teams.map(t => t.id))
  ;(S.allTeams || []).forEach(t => {
    if (qualifiedIdSet.has(t.id)) return
    const coach = (S.coaches || []).find(c => c.teamId === t.id)
    if (!coach?.id) return
    const cs = ensureCoachStat(coach, t.name, t.cc)
    if (!cs) return
    cs.seasons++
    cs.dnqs++
  })

  // 3) Local titles: each league's #1 team's coach gets +1.
  Object.values(S.localLeagueResults || {}).forEach(r => {
    const champTeamId = r.qualified?.[0]?.id
    if (!champTeamId) return
    const champCoach = (S.coaches || []).find(c => c.teamId === champTeamId)
    if (!champCoach?.id) return
    if (S.coachStats[champCoach.id]) S.coachStats[champCoach.id].localTitles++
  })

  const teamSeasons = S.teams.map(t => {
    const stars = (t.stars && t.stars.length ? t.stars : (t.star ? [t.star] : []))
    const fs = fullStats[t.id] || { w:0, d:0, l:0, gf:0, ga:0 }
    return {
      teamId: t.id,
      teamName: t.name,
      cc: t.cc,
      overall: t.currentOverall || 0,
      reached: S.roundReached[t.id] || 'Group',
      played: fs.w + fs.d + fs.l,
      wins:   fs.w,
      draws:  fs.d,
      losses: fs.l,
      gf:     fs.gf,
      ga:     fs.ga,
      coach:  t.coach ? { id: t.coach.id, name: t.coach.name, tier: t.coach.tier } : null,
      stars:  stars.map(s => ({ id: s.id, name: s.name, pos: s.pos, tier: s.tier })),
    }
  })
  // Non-qualified teams: every team in S.allTeams that wasn't in S.teams.
  const qualifiedIds = new Set(S.teams.map(t => t.id))
  const dnqTeams = (S.allTeams || []).filter(t => !qualifiedIds.has(t.id)).map(t => {
    const stars = (t.stars && t.stars.length ? t.stars : [])
    const coach = (S.coaches || []).find(c => c.teamId === t.id)
    return {
      teamId: t.id,
      teamName: t.name,
      cc: t.cc,
      overall: t.currentOverall || 0,
      reached: 'DNQ',
      coach: coach ? { id: coach.id, name: coach.name, tier: coach.tier } : null,
      stars: stars.map(s => ({ id: s.id, name: s.name, pos: s.pos, tier: s.tier })),
    }
  })

  S.history = S.history || []
  S.history.push({
    season: S.season,
    champion: S.champion.id,
    championName: S.champion.name,
    cc: S.champion.cc,
    runnerUpId: runnerUp?.id || null,
    runnerUpName: runnerUp?.name || null,
    runnerUpCC: runnerUp?.cc || null,
    roundReached: { ...S.roundReached },
    topScorers: Object.entries(S.scorers||{}).sort((a,b) => b[1]-a[1]).slice(0,5),
    totalGoals: Object.values(S.teamGoals||{}).reduce((a,b)=>a+b, 0),
    awards: { ...S.seasonAwards },
    localChampions: Object.values(S.localLeagueResults || {}).map(r => ({
      league: r.league.name,
      cc: r.league.cc,
      champion: r.qualified[0]?.name || '—',
      championId: r.qualified[0]?.id || null,
    })),
    teamSeasons,
    dnqTeams,
    stars: allStars.map(s => ({
      id: s.id,                           // for linking to detail screens
      name: s.name, teamName: s.teamName, teamId: s.teamId,
      pos: s.pos, tier: s.tier,
      goals: s.goals||0, games: s.wcsPlayed||0, medals: { ...s.medals },
      avgRating: s.ratings?.length ? (s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length) : 0,
      // What round did this player's team reach this season?
      roundReached: S.roundReached[s.teamId] || 'Group',
    })),
  })

  // ── Discard the per-match log now that the season is over ──
  // We've extracted what we need into the season record above. The
  // raw match-by-match data (which can be ~hundreds of KB by mid-
  // tournament) is no longer needed.
  S.allMatchResults = []

  autoSave()
}

// ── Transfer window ───────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// MARKET — runs in order: retirements → player signings →
// player overflow releases → coach swaps → coach replacements →
// fill empty teams. Returns a flat ordered list of moves so the
// "Season → Market" screen can show the timeline.
// ─────────────────────────────────────────────────────────────
export function runMarket() {
  if (!S.allTeams) return { moves: [] }
  const moves = []
  const tierOrder = ['legendary','epic','rare','uncommon','common']

  const histScore = id => {
    if (!S.history?.length) return 1
    const recent = [...S.history].reverse().slice(0, 3)
    let s = 0
    recent.forEach(hr => {
      if (hr.roundReached?.[id])
        s += ({ Winner:10, Final:7, 'Semi-finals':4, 'Quarter-finals':2, 'Round of 16':1 })[hr.roundReached[id]] || 0
    })
    return s + 1
  }

  // Recent qualification rate: how many of the last 3 seasons did this
  // team appear in the Champions League at all? Used as a proxy for
  // "is this team a desirable place for a star to play".
  const recentQualifications = id => {
    if (!S.history?.length) return 0
    const recent = [...S.history].reverse().slice(0, 3)
    let q = 0
    recent.forEach(hr => { if (hr.roundReached?.[id]) q++ })
    return q
  }

  // Team appeal: high = stars want to stay, low = stars want out.
  // Combines base team quality (clubs like Real Madrid stay strong even
  // after a bad year), recent CL appearances, and whether they
  // qualified this very season.
  const teamAppeal = team => {
    const base = team.base || 70
    const baseScore = (base - 60) * 0.6  // base 60 → 0, base 90 → 18
    const histPart = histScore(team.id) * 0.7
    const recentQual = recentQualifications(team.id) * 2.5  // 0..7.5
    const inFieldNow = S.teams?.some(t => t.id === team.id) ? 4 : 0
    return baseScore + histPart + recentQual + inFieldNow
  }
  const findTeam = id => S.allTeams.find(t => t.id === id)

  // ── 1. Player retirements ────────────────────────────────────
  // A player retires when their lifespan is up.
  S.allTeams.forEach(team => {
    if (!team.stars) return
    const survivors = []
    team.stars.forEach(s => {
      const age = (S.season || 1) - (s.season || 1)
      if (age >= s.lifespan) {
        moves.push({
          phase: 'retirement', kind: 'player',
          star: s, name: s.name, tier: s.tier, pos: s.pos,
          from: team.name, fromId: team.id, fromCC: team.cc,
        })
      } else {
        survivors.push(s)
      }
    })
    team.stars = survivors
  })

  // ── 2. Player signings ───────────────────────────────────────
  // Each surviving star has 10–15% chance to switch teams. Process
  // in random order so big-club poaching doesn't always go first.
  const allStarsList = []
  S.allTeams.forEach(team => {
    (team.stars || []).forEach(s => allStarsList.push({ team, star: s }))
  })
  shuffle(allStarsList).forEach(({ team, star }) => {
    // Re-check the star is still on this team (in case it got moved
    // by a previous iteration).
    if (!team.stars.includes(star)) return

    // Move chance scales with how unhappy the star is at their team.
    // Baseline is intentionally low (~5–8%): real-world transfers
    // are rare. Stars at low-appeal teams (weak base, no recent CL,
    // missed this year's group stage) push it up, capped at ~30% for
    // legendary players stuck at the worst clubs. On a roster of
    // ~90 stars the expected total signings should be ~10–12.
    const appeal = teamAppeal(team)              // ~0..30
    const unhappiness = Math.max(0, 18 - appeal) // 0..18
    const tierMul = { legendary:1.8, epic:1.4, rare:1.2, uncommon:1.05, common:1.0 }[star.tier] || 1
    const moveChance = Math.min(0.30, (0.05 + Math.random() * 0.03) + unhappiness * 0.011 * tierMul)
    if (Math.random() > moveChance) return

    // Pick a destination. Weight by appeal — stars chase strong clubs.
    // Stars from low-appeal teams skew their destination weights even
    // harder toward top-tier clubs (so a Scotland legend almost always
    // ends up at Real / Bayern / etc.).
    const others = S.allTeams.filter(t => t.id !== team.id)
    const fromAppeal = appeal
    // The poorer the source team, the more aggressively the player
    // shops for prestige (exponent goes from 1.0 → ~2.5).
    const exp = 1.0 + Math.max(0, (15 - fromAppeal) / 10)
    const weights = others.map(t => Math.max(0.5, Math.pow(teamAppeal(t) + 1, exp)))
    const total = weights.reduce((s,w) => s + w, 0)
    let r = Math.random() * total, dest = others[others.length-1]
    for (let i = 0; i < others.length; i++) { r -= weights[i]; if (r <= 0) { dest = others[i]; break } }
    if (!dest.stars) dest.stars = []

    const fromName = team.name, fromId = team.id, fromCC = team.cc

    // Move the star.
    team.stars = team.stars.filter(s => s !== star)
    star.teamId = dest.id
    star.teamName = dest.name
    dest.stars.push(star)
    moves.push({
      phase: 'signing', kind: 'player',
      star, name: star.name, tier: star.tier, pos: star.pos,
      from: fromName, fromId, fromCC,
      to:   dest.name, toId: dest.id, toCC: dest.cc,
    })

    // Cap of 3: if dest now has 4+, release the lowest-tier. The
    // released player goes to the FIRST team with 0 stars; if none,
    // a random under-cap club; if all are at cap, they retire.
    while (dest.stars.length > 3) {
      dest.stars.sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
      const dropped = dest.stars[dest.stars.length - 1]
      dest.stars = dest.stars.filter(s => s !== dropped)

      const empty = S.allTeams.find(t => t.id !== dest.id && (!t.stars || t.stars.length === 0))
      if (empty) {
        if (!empty.stars) empty.stars = []
        dropped.teamId = empty.id
        dropped.teamName = empty.name
        empty.stars.push(dropped)
        moves.push({
          phase: 'overflow', kind: 'player',
          star: dropped, name: dropped.name, tier: dropped.tier, pos: dropped.pos,
          from: dest.name, fromId: dest.id, fromCC: dest.cc,
          to: empty.name, toId: empty.id, toCC: empty.cc,
          reason: 'released to a team without stars',
        })
        continue
      }
      const underCap = S.allTeams.filter(t => t.id !== dest.id && (t.stars?.length || 0) < 3)
      if (underCap.length) {
        const target = pick(underCap)
        if (!target.stars) target.stars = []
        dropped.teamId = target.id
        dropped.teamName = target.name
        target.stars.push(dropped)
        moves.push({
          phase: 'overflow', kind: 'player',
          star: dropped, name: dropped.name, tier: dropped.tier, pos: dropped.pos,
          from: dest.name, fromId: dest.id, fromCC: dest.cc,
          to: target.name, toId: target.id, toCC: target.cc,
          reason: 'squad cap forced a transfer',
        })
        continue
      }
      moves.push({
        phase: 'overflow', kind: 'player',
        star: dropped, name: dropped.name, tier: dropped.tier, pos: dropped.pos,
        from: dest.name, fromId: dest.id, fromCC: dest.cc,
        reason: 'released — no room in any squad',
      })
    }
  })

  // ── 3. Coach retirements ─────────────────────────────────────
  S.coaches = S.coaches || []
  const coachSurvivors = []
  S.coaches.forEach(c => {
    const age = (S.season || 1) - (c.season || 1)
    if (age >= c.lifespan) {
      moves.push({
        phase: 'retirement', kind: 'coach',
        coach: c, name: c.name, tier: c.tier,
        from: c.teamName, fromId: c.teamId, fromCC: findTeam(c.teamId)?.cc,
      })
      const t = findTeam(c.teamId)
      if (t && t.coachId === c.id) t.coachId = null
    } else {
      coachSurvivors.push(c)
    }
  })
  S.coaches = coachSurvivors

  // ── 4. Coach swaps (~7% per coach — pairs swap, so on a roster
  // of 81 coaches expect roughly 5–6 swap-moves logged per market) ─
  const swapping = S.coaches.filter(() => Math.random() < 0.07)
  const swapped = new Set()  // coach ids already involved this round
  shuffle(swapping).forEach(coach => {
    if (swapped.has(coach.id)) return
    const destTeam = pick(S.allTeams.filter(t => t.id !== coach.teamId))
    if (!destTeam) return
    const destCoach = S.coaches.find(c => c.teamId === destTeam.id && c.id !== coach.id)
    const oldTeamId = coach.teamId
    const oldTeam = findTeam(oldTeamId)

    if (destCoach) {
      // Pairwise swap — log it once with a "↔" so the market screen
      // shows both directions on a single card.
      moves.push({
        phase: 'signing', kind: 'coach',
        coach, name: coach.name, tier: coach.tier, trait: coach.trait,
        from: coach.teamName, fromId: coach.teamId, fromCC: findTeam(coach.teamId)?.cc,
        to:   destTeam.name,  toId: destTeam.id,    toCC: destTeam.cc,
        swap: { withName: destCoach.name, withTier: destCoach.tier },
      })
      coach.teamId = destTeam.id; coach.teamName = destTeam.name
      destCoach.teamId = oldTeamId; destCoach.teamName = oldTeam?.name
      destTeam.coachId = coach.id
      if (oldTeam) oldTeam.coachId = destCoach.id
      swapped.add(coach.id)
      swapped.add(destCoach.id)
    } else {
      moves.push({
        phase: 'signing', kind: 'coach',
        coach, name: coach.name, tier: coach.tier, trait: coach.trait,
        from: coach.teamName, fromId: coach.teamId, fromCC: findTeam(coach.teamId)?.cc,
        to:   destTeam.name,  toId: destTeam.id,    toCC: destTeam.cc,
      })
      coach.teamId = destTeam.id; coach.teamName = destTeam.name
      destTeam.coachId = coach.id
      if (oldTeam) oldTeam.coachId = null
      swapped.add(coach.id)
    }
  })

  // ── 5. Generate new stars for empty teams ────────────────────
  // Exactly one academy graduate — the rest of the squad fills in
  // through future market signings.
  S.allTeams.forEach(team => {
    if (!team.stars) team.stars = []
    if (team.stars.length === 0) {
      const ns = genStar(team)
      team.stars.push(ns)
      moves.push({
        phase: 'youth', kind: 'player',
        star: ns, name: ns.name, tier: ns.tier, pos: ns.pos,
        from: 'Youth Academy', to: team.name, toId: team.id, toCC: team.cc,
      })
    }
  })

  // ── 6. Generate new coaches for empty teams ──────────────────
  S.allTeams.forEach(team => {
    if (team.coachId && S.coaches.find(c => c.id === team.coachId)) return
    const nc = genCoach(team)
    team.coachId = nc.id
    S.coaches.push(nc)
    moves.push({
      phase: 'youth', kind: 'coach',
      coach: nc, name: nc.name, tier: nc.tier, trait: nc.trait,
      from: 'New manager', to: team.name, toId: team.id, toCC: team.cc,
    })
  })

  S.lastMarket = moves
  return { moves }
}

// Backwards-compat: older callers may still invoke runTransfers.
export function runTransfers() {
  const { moves } = runMarket()
  return {
    playerMoves: moves.filter(m => m.kind === 'player').map(m => ({
      name: m.name, from: m.from || '—', to: m.to || 'Free agent', tier: m.tier,
      type: m.phase === 'retirement' ? 'retired' : m.phase === 'youth' ? 'new' : 'transfer',
    })),
    coachMoves: moves.filter(m => m.kind === 'coach').map(m => ({
      name: m.name, from: m.from || '—', to: m.to, tier: m.tier,
      type: m.phase === 'retirement' ? 'retired' : m.phase === 'youth' ? 'signed' : 'swap',
    })),
  }
}

// ── Reset for a new season ────────────────────────────────────
export function startNewSeason() {
  S.season = (S.season || 1) + 1
  S.phase = 'idle'
  S.champion = null
  S.groups = []
  S.groupMatches = []
  S.knockoutRounds = []
  S.scorers = {}
  S.teamGoals = {}
  S.teamGoalsConceded = {}
  S.teamShots = {}
  S.teamPossession = {}
  S.teamPossessionMatches = {}
  S.allMatchResults = []
  S.roundReached = {}
  S.seasonAwards = {}
  S.localLeagueResults = null
  S.lastMarket = null
  S.teams?.forEach(t => {
    t.pts=0; t.w=0; t.d=0; t.l=0; t.gf=0; t.ga=0; t.gd=0
    t.star=null; t.stars=null; t.coach=null
    t.isLocalChampion=false
  })
  S.allTeams?.forEach(t => {
    (t.stars||[]).forEach(s => { s.goals = 0; s.ratings = []; s.wcsPlayed = 0 })
  })
}

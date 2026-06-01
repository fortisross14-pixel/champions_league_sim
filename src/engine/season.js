import { S, autoSave } from '../store.js'
import { LEAGUES, LEAGUE_TEAMS, ALL_TEAMS } from '../data/teams.js'
import { simMatch, rand, clamp, pick, shuffle, gaussRand, ovr, getEffStats } from './match.js'
import {
  genNameForCC, genCoachName, pickPlayerNationality, COUNTRY_NAME
} from '../data/players.js'

// ── Tier helpers ─────────────────────────────────────────────
export const tierOf = f => f>=5000?'generational':f>=2000?'legendary':f>=800?'epic':f>=300?'rare':f>=80?'uncommon':'common'
export const tierLabel = t => ({generational:'Generational',legendary:'Legendary',epic:'Epic',rare:'Rare',uncommon:'Uncommon',common:'Common'})[t]||t
export const tierColor = t => ({generational:'#e91e63',legendary:'#ff9800',epic:'#9c27b0',rare:'#2196f3',uncommon:'#4caf50',common:'#6a7a9a'})[t]||'#6a7a9a'

// Rarity distribution: 0.5% generational, 5% legendary (was 2%),
// Tier probabilities for a fresh-spawned star. Tuned so a world of
// ~80 teams gets 1-2 Generationals, 3-4 Legendaries, 8-10 Epics,
// 8-10 Rares, ~25 Uncommons, and the remainder Common.
//   Generational 2%, Legendary 4%, Epic 12%, Rare 12%,
//   Uncommon 30%, Common 40%.
// Generational has a hard cap of 2 in the world — see genStar.
function rollTier() {
  const r = Math.random()
  if (r < 0.02) return 'generational'
  if (r < 0.06) return 'legendary'
  if (r < 0.18) return 'epic'
  if (r < 0.30) return 'rare'
  if (r < 0.60) return 'uncommon'
  return 'common'
}

// Count active generational stars across all teams + FA pool.
// Used to enforce the world cap (max 2 at any time).
function countGenerationalsInWorld() {
  let n = 0
  ;(S.allTeams || []).forEach(t => {
    for (const s of (t.stars || [])) if (s.tier === 'generational') n++
  })
  for (const s of (S.freeAgents?.stars || [])) if (s.tier === 'generational') n++
  return n
}

// ── Career arc ───────────────────────────────────────────────
// Players ramp into their potential and ramp out before retirement:
//   Year 1 (rookie):       80%
//   Year 2 (sophomore):    90%
//   Year 3 → second-last:  100% (prime)
//   Last playing year:     90% (farewell tour)
// Lifespan handles retirement. Stored on the star as `careerMult`
// and re-computed every offseason so getEffStats can read it cheaply.
export function computeCareerMult(star, currentSeason) {
  const age = (currentSeason || S.season || 1) - (star.season || 1)
  if (age <= 1) return 0.80
  if (age === 2) return 0.90
  const lifespan = star.lifespan || 10
  if (age >= lifespan - 1) return 0.90
  return 1.00
}

// Refresh careerMult on every star (on-team + free-agent) at the
// start of a new season. Cheap loop, easy to keep stats display
// and match engine in sync.
export function refreshCareerMults() {
  const cs = S.season || 1
  ;(S.allTeams || []).forEach(t => {
    for (const s of (t.stars || [])) s.careerMult = computeCareerMult(s, cs)
  })
  for (const s of (S.freeAgents?.stars || [])) s.careerMult = computeCareerMult(s, cs)
}

// ── Economy constants ────────────────────────────────────────
// Each rarity has a salary (paid annually while contracted), a
// signing fee (paid once when joining a club via transfer, NOT
// when renewing), and a sale value (received by the SELLING club
// when a player is bought by another). Commons can only be signed
// as free agents — they have no signing fee or transfer value.
//
// Per-tier economy (tuned via parameter sweep):
//   Gen $10 fee / $5 salary, Leg $7/$4, Epic $4/$3,
//   Rare $4/$2, Uncommon $2/$1, Common $0/$1.
// Sale value = round(signFee / 2).
export const RARITY_ECON = {
  generational: { salary: 5, signFee: 10, saleValue: 5 },
  legendary:    { salary: 4, signFee:  7, saleValue: 3 },
  epic:         { salary: 3, signFee:  4, saleValue: 2 },
  rare:         { salary: 2, signFee:  4, saleValue: 2 },
  uncommon:     { salary: 1, signFee:  2, saleValue: 1 },
  common:       { salary: 1, signFee:  0, saleValue: 0 },
}

// Champion penalty: -2M cash on hand for the winner of the CL.
// Anti-dynasty mechanic.
export const CHAMPION_PENALTY = 2

// Base spend — reads from ECON.baseSpend table (mutable for sweeps).
export const BASE_SPEND = 3
export function baseSpend(team) {
  const m = effectiveMoney(team)
  return ECON.baseSpend[m] ?? 3
}

// Annual income — reads from ECON.income table (mutable for sweeps).
export function annualIncome(team) {
  const m = effectiveMoney(team)
  return ECON.income[m] ?? m
}

// Total salary the team owes per year (sum of star + coach salaries
// for those still under contract).
export function teamAnnualSalary(team) {
  let s = 0
  for (const star of team.stars || []) {
    if (!star.contract || star.contract.yearsLeft <= 0) continue
    s += RARITY_ECON[star.tier]?.salary || 0
  }
  const coach = (S.coaches || []).find(c => c.teamId === team.id)
  if (coach?.contract && coach.contract.yearsLeft > 0) {
    s += RARITY_ECON[coach.tier]?.salary || 0
  }
  return s
}

// Splurge bonus: a top-tier club ($12M+ effective money) with
// fewer than 3 premium stars and surplus cash spends $5M for a
// +5 boost to all team stats next season. Threshold lowered from
// v6.3's $13M because absolute cash is now lower across the board.
export const SPLURGE_THRESHOLD = 8
export const SPLURGE_COST = 5
export const SPLURGE_BOOST = 5

// Cash on hand hard ceiling. Anything above this at the end of an
// offseason is burned as "owner takeout / unused operating
// budget". Prevents perpetual hoarding by clubs that can't find
// targets to spend on.
export const CASH_CAP = 25

// ── Tunable economy parameters (mutable for sweep harness) ──
// All numeric levers in one place. runMarket reads from here, so
// the parameter-sweep test can write into ECON and re-run without
// reloading the module.
export const ECON = {
  // Income & base spend per money tier (5→18 inclusive).
  // Income = team.money exactly. Base spend = $1 flat.
  income:    { 5:5, 6:6, 7:7, 8:8, 9:9, 10:10, 11:11, 12:12, 13:13, 14:14, 15:15, 16:16, 17:17, 18:18 },
  baseSpend: { 5:1, 6:1, 7:1, 8:1, 9:1, 10:1,  11:1,  12:1,  13:1,  14:1,  15:1,  16:1,  17:1,  18:1  },

  // Decay: stat loses round(coef × (stat - 60)) + random[-wig, +wig].
  // Higher coef → harder to maintain high stats.
  decayCoef:   0.4,
  decayWiggle: 1,

  // Investment yield (flat): $1M → yieldFlat points per stat,
  // capped at 90. Higher = faster growth.
  yieldFlat: 2,
  yieldCoef: 0.125,           // (legacy, unused with flat yield)

  // Willingness: random in [min, max] of cash goes to investment.
  investMin: 0.4,
  investMax: 0.7,
}


// Generational cap: world maintains 1-3 Generational stars at a
// time. Hard cap of 3 enforced in genStar; soft floor of 1 enforced
// by forced-spawn at end of rookie phase in runMarket.
export const GENERATIONAL_CAP_MAX = 3
export const GENERATIONAL_CAP_MIN = 1

// Happiness thresholds for each tier (out of 100). A player's
// happiness must reach this value for them to want to stay with
// their current club (renewal) or accept a free-agent offer.
// Lower values = more loyal stars. Premium tiers tuned lower so
// Gens/Legends don't bounce every single offseason.
export const HAPPINESS_THRESHOLDS = {
  generational: 25,
  legendary:    20,
  epic:         15,
  rare:         10,
  uncommon:      5,
  common:        0,
}

// CL round → happiness points for that season.
const ROUND_POINTS = {
  Winner: 100, Final: 80, 'Semi-finals': 60, 'Quarter-finals': 40,
  'Round of 16': 20, 'Group stage': 10, 'Groups': 10, DNQ: 0,
}
function roundPoints(reached) {
  if (!reached) return 0
  return ROUND_POINTS[reached] ?? 0
}

// Compute happiness for an entity (star or coach) currently at
// teamId. Uses the team's last two CL results from S.history.
// If the entity joined recently (signedSeason within window),
// missing seasons count as 100 (honeymoon period — they're happy
// because they just signed).
export function computeHappiness(entity, teamId) {
  if (!entity || !teamId) return 0
  const currentSeason = S.season || 1
  const lastYear = currentSeason - 1
  const priorYear = currentSeason - 2
  const signed = entity.contract?.signedSeason ?? entity.season ?? 1

  // Pull the team's CL round-reached for those years from S.history.
  const yearResult = (yr) => {
    const hr = (S.history || []).find(h => h.season === yr)
    if (!hr) return null
    if (hr.roundReached?.[teamId]) return roundPoints(hr.roundReached[teamId])
    // No record for this team in that year → DNQ
    return 0
  }

  // For the "last year" (just-finished season), happiness = 100 if
  // signed *this* offseason (signedSeason == currentSeason) since
  // they're just joining. For "prior year", same logic with one
  // year earlier cutoff.
  const lastScore = (signed >= currentSeason)
    ? 100                                           // just signed → honeymoon
    : (yearResult(lastYear) ?? 0)
  const priorScore = (signed > priorYear)
    ? 100                                           // joined within window
    : (yearResult(priorYear) ?? 0)

  return Math.round(0.67 * lastScore + 0.33 * priorScore)
}

// Roll a fresh contract — yearsLeft in 3..6 inclusive.
function rollContract(signedSeason) {
  const years = rand(3, 6)
  return { yearsLeft: years, yearsTotal: years, signedSeason }
}

// Set up initial contracts for any star/coach who doesn't have
// one yet. Randomizes yearsLeft so they don't all expire on the
// same offseason.
export function ensureContracts() {
  const startingSeason = S.season || 1
  ;(S.allTeams || []).forEach(t => {
    (t.stars || []).forEach(s => {
      if (!s.contract) {
        const total = rand(3, 6)
        s.contract = {
          yearsLeft: rand(1, total),
          yearsTotal: total,
          signedSeason: startingSeason - (total - rand(1, total)),
        }
      }
    })
  })
  ;(S.coaches || []).forEach(c => {
    if (!c.contract) {
      const total = rand(3, 6)
      c.contract = {
        yearsLeft: rand(1, total),
        yearsTotal: total,
        signedSeason: startingSeason - (total - rand(1, total)),
      }
    }
  })
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
    common:       { attack:3, stamina:2 },
    uncommon:     { attack:5, stamina:5, mental:2, setPieces:2 },
    rare:         { attack:7, stamina:6, mental:6, setPieces:5 },
    epic:         { attack:8, stamina:7, mental:7, setPieces:6 },
    legendary:    { attack:11, stamina:10, mental:11, setPieces:9 },
    generational: { attack:14, stamina:13, mental:14, setPieces:11 },
  },
  MID: {
    common:       { mental:2, attack:2, defense:2 },
    uncommon:     { mental:5, attack:5, defense:3, stamina:2 },
    rare:         { mental:7, attack:6, defense:5, stamina:5, setPieces:4 },
    epic:         { mental:8, attack:7, defense:6, stamina:6, setPieces:5 },
    legendary:    { mental:11, attack:10, defense:9, stamina:9, setPieces:8 },
    generational: { mental:14, attack:13, defense:11, stamina:11, setPieces:10 },
  },
  DEF: {
    common:       { defense:3, stamina:2 },
    uncommon:     { defense:5, stamina:5, mental:2, setPieces:2 },
    rare:         { defense:7, stamina:6, mental:6, setPieces:5, attack:2 },
    epic:         { defense:8, stamina:7, mental:7, setPieces:6, attack:3 },
    legendary:    { defense:11, stamina:10, mental:11, setPieces:8, attack:4 },
    generational: { defense:14, stamina:13, mental:14, setPieces:10, attack:5 },
  },
  GK: {
    common:       { defense:3 },
    uncommon:     { defense:5, mental:2 },
    rare:         { defense:7, mental:5 },
    epic:         { defense:8, mental:7 },
    legendary:    { defense:11, mental:11 },
    generational: { defense:14, mental:14 },
  },
}

// Per-game goal distribution by position × rarity.
// Indices = [P(0g), P(1g), P(2g), P(3g), P(4g)] (must sum ≤ 1.0).
// Any leftover probability mass is implicit "no goals beyond 4".
export const GOAL_DIST = {
  FWD: {
    common:       [0.60, 0.30, 0.10, 0.00, 0.00],
    uncommon:     [0.50, 0.35, 0.13, 0.02, 0.00],
    rare:         [0.38, 0.38, 0.18, 0.05, 0.01],
    epic:         [0.22, 0.35, 0.28, 0.12, 0.03],
    legendary:    [0.10, 0.25, 0.35, 0.22, 0.08],
    generational: [0.04, 0.18, 0.34, 0.28, 0.14],
  },
  MID: {
    common:       [0.80, 0.17, 0.03, 0.00, 0.00],
    uncommon:     [0.72, 0.22, 0.05, 0.01, 0.00],
    rare:         [0.60, 0.28, 0.10, 0.02, 0.00],
    epic:         [0.45, 0.35, 0.15, 0.05, 0.00],
    legendary:    [0.30, 0.35, 0.25, 0.08, 0.02],
    generational: [0.18, 0.32, 0.30, 0.14, 0.05],
  },
  DEF: {
    common:       [0.92, 0.07, 0.01, 0.00, 0.00],
    uncommon:     [0.88, 0.11, 0.01, 0.00, 0.00],
    rare:         [0.80, 0.16, 0.03, 0.01, 0.00],
    epic:         [0.70, 0.22, 0.07, 0.01, 0.00],
    legendary:    [0.55, 0.30, 0.12, 0.03, 0.00],
    generational: [0.42, 0.34, 0.18, 0.05, 0.01],
  },
  GK: {
    common:       [1.00, 0, 0, 0, 0],
    uncommon:     [1.00, 0, 0, 0, 0],
    rare:         [0.99, 0.01, 0, 0, 0],
    epic:         [0.98, 0.02, 0, 0, 0],
    legendary:    [0.95, 0.05, 0, 0, 0],
    generational: [0.92, 0.07, 0.01, 0, 0],
  },
}

// Per opposing-goal "save / block" probability — defenders & GKs may
// cancel an enemy goal entirely.
export const SAVE_PROB = {
  GK:  { common:0.12, uncommon:0.20, rare:0.32, epic:0.50, legendary:0.70, generational:0.85 },
  DEF: { common:0.08, uncommon:0.14, rare:0.22, epic:0.35, legendary:0.50, generational:0.62 },
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
  if (tier !== 'legendary' && tier !== 'epic' && tier !== 'generational') return null
  const eligible = STAR_TRAITS.filter(t => {
    if (!t.positions.includes(pos)) return false
    // Generational players treat themselves as legendary for trait
    // eligibility (so they get the leg-locked super-traits).
    if (t.tierLock) {
      const effTier = tier === 'generational' ? 'legendary' : tier
      if (t.tierLock !== effTier) return false
    }
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

  // Contract + salary.
  if (star.contract) {
    const sal = RARITY_ECON[star.tier]?.salary || 0
    lines.push(`📜 Contract: ${star.contract.yearsLeft}/${star.contract.yearsTotal} yr · ${sal}M/yr`)
  }

  // Career stage (rookie / sophomore / prime / farewell).
  const mult = typeof star.careerMult === 'number' ? star.careerMult : 1.0
  if (mult < 1.0) {
    const cs = S.season || 1
    const age = cs - (star.season || 1)
    let label
    if (age <= 1)                        label = 'Rookie year'
    else if (age === 2)                  label = 'Sophomore'
    else                                 label = 'Farewell tour'
    lines.push(`📈 ${label} — ${Math.round(mult * 100)}% of potential`)
  }
  return lines
}

// Structured form of star skills for the visual modal. Returns:
//   stats: { attack, defense, stamina, mental, setPieces }  (delta from base)
//   scoring: array of { goals, percent } where percent >= 0.5%
//   savePct: number 0..1 (only for GK/DEF; null otherwise)
//   trait: { name, description } | null
//   contract: { yearsLeft, yearsTotal, salary } | null
//   careerStage: { label, percent } | null
export function getStarSkillData(star) {
  const stats = { ...(STAT_BONUSES[star.pos]?.[star.tier] || {}) }
  const dist = GOAL_DIST[star.pos]?.[star.tier]
  let scoring = null
  if (dist && dist.some((p,i) => i>0 && p>0.005)) {
    scoring = dist.map((p,i) => ({ goals: i, percent: p })).filter(x => x.percent > 0.005)
  }
  const savePct = ['GK','DEF'].includes(star.pos) ? (SAVE_PROB[star.pos]?.[star.tier] || 0) : null
  const trait = star.trait ? { name: star.trait.name, description: star.trait.description } : null
  const contract = star.contract ? {
    yearsLeft: star.contract.yearsLeft,
    yearsTotal: star.contract.yearsTotal,
    salary: RARITY_ECON[star.tier]?.salary || 0,
  } : null
  let careerStage = null
  const mult = typeof star.careerMult === 'number' ? star.careerMult : 1.0
  if (mult < 1.0) {
    const cs = S.season || 1
    const age = cs - (star.season || 1)
    let label
    if (age <= 1) label = 'Rookie year'
    else if (age === 2) label = 'Sophomore'
    else label = 'Farewell tour'
    careerStage = { label, percent: Math.round(mult * 100) }
  }
  return { stats, scoring, savePct, trait, contract, careerStage }
}

// ── Team season stats update ─────────────────────────────────
// Every team has a permanent `money` rating (set in teams.js — Real
// Madrid 12, mid-tier 8-9, minnows 6). Effective money for stat
// purposes adds the team's GM/Director moneyBonus, capped at 14.
//
// Each season the team's five stats (attack, defense, stamina,
// mental, setPieces) are re-rolled around a money-derived center:
//   target_center = 41 + 4 × effective_money
// So income 12 → 89, 11 → 85, 10 → 81, 9 → 77, 8 → 73, 7 → 69,
// 6 → 65.
//
// Two constraints:
//   1. Roll is target_center + N(0, 2.5), clamped to ±5 from center
//      (so the stat lives in [center-5, center+5] each season).
//   2. Year-over-year change is capped at ±3 per stat. So a team
//      that was 93 in Attack can't drop below 90 next year.
//
// ─────────────────────────────────────────────────────────────
// Team stats update (called at start of each Champions League
// season). In v6.7+, team stats persist year-over-year and are
// shaped during the offseason by decay + cash investment (see
// runMarket steps 8 & 9). This function only:
//   - Seeds initial stats (65 ±5) for any team that has never
//     played yet.
//   - Refreshes lastSeasonStats / lastSeasonOverall snapshots
//     for the UI's PS-Ov vs CS-Ov drift columns.
//   - Forces mental = 60 (it's always 60 by spec).
//
// Stats are stored on team.seasonStats (the live numbers used by
// the engine) and on team.lastSeasonStats for the cap.
//   - team.lastSeasonOverall = round(avg of last season's stats),
//     used for the "PS-Ov" column. 0 in season 1.
//   - team.currentOverall = round(avg of THIS season's stats),
//     used for the "CS-Ov" column.
export function runStatsUpdate() {
  if (!S.allTeams) return
  S.allTeams.forEach(t => {
    const prev = t.seasonStats
    if (prev) {
      const prevOv = Math.round((prev.attack + prev.defense + prev.stamina + prev.mental + prev.setPieces) / 5)
      t.lastSeasonOverall = prevOv
      t.lastSeasonStats = { ...prev }
    }
    // Seed initial stats for fresh teams: 71 ±5 across the board.
    // Mental forced to 60 (spec — stars/coach traits push it).
    if (!t.seasonStats) {
      t.lastSeasonOverall = 0
      t.lastSeasonStats = null
      t.seasonStats = {
        attack:    rand(66, 76),
        defense:   rand(66, 76),
        stamina:   rand(66, 76),
        mental:    60,
        setPieces: rand(66, 76),
      }
    } else {
      // Mental is always 60 (forced every season).
      t.seasonStats.mental = 60
    }
    const s = t.seasonStats
    t.currentOverall = Math.round((s.attack + s.defense + s.stamina + s.mental + s.setPieces) / 5)
  })
}

// Effective money for a team — base money + GM bonus, capped at 14.
export function effectiveMoney(team) {
  const base = team.money || 6
  const gmBonus = team.gm?.moneyBonus || 0
  return clamp(base + gmBonus, 5, 18)
}

// Build the per-match `stats` object from the team's seasonStats. This
// is what getEffStats() will read. Falls back to a money-derived
// estimate if seasonStats hasn't been generated yet.
function buildStats(team) {
  if (team.seasonStats) return { ...team.seasonStats }
  const center = 41 + 4 * effectiveMoney(team)
  const n = () => Math.round(gaussRand(2.5))
  return {
    attack:    clamp(center + n(), 40, 110),
    defense:   clamp(center + n(), 40, 110),
    stamina:   clamp(center + n(), 40, 110),
    mental:    60,
    setPieces: clamp(center + n(), 40, 110),
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
export function genStar(team, forceTier = null) {
  const nationality = pickPlayerNationality(team.cc)
  let tier = forceTier || rollTier()
  // Hard cap of 3 Generational players in the world.
  // If a roll comes up Gen but the cap is reached, downgrade to Legendary.
  // (forceTier bypasses this — used to enforce the floor of 1.)
  if (!forceTier && tier === 'generational' && countGenerationalsInWorld() >= GENERATIONAL_CAP_MAX) {
    tier = 'legendary'
  }
  const pos = pick(POSITIONS)
  const statBonus = STAT_BONUSES[pos]?.[tier] || {}
  const goalDist  = GOAL_DIST[pos]?.[tier] || [1,0,0,0,0]
  const saveProb  = SAVE_PROB[pos]?.[tier] || 0
  const trait     = pickStarTrait(pos, tier)
  // Generational players live a touch longer — they earn the "career
  // arc" treatment.
  const lifespan  = tier === 'generational' ? rand(11, 15) : rand(8, 12)
  const currentSeason = S.season || 1
  return {
    id: `s_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name: genNameForCC(nationality),
    nationality,
    pos, tier,
    teamId: team.id, teamName: team.name, cc: team.cc,
    season: currentSeason,
    lifespan,
    goals: 0, ratings: [], wcsPlayed: 0, fame: 0,
    medals: { gold:0, silver:0, bronze:0 },
    statBonus,
    goalDist,
    saveProb,
    trait,
    contract: rollContract(currentSeason),
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
  if (coach.contract) {
    const sal = RARITY_ECON[coach.tier]?.salary || 0
    lines.push(`📜 Contract: ${coach.contract.yearsLeft}/${coach.contract.yearsTotal} yr · ${sal}M/yr`)
  }
  return lines
}

export function genCoach(team) {
  const tier = rollCoachTier()
  const trait = (tier === 'legendary' || tier === 'epic') ? pickCoachTrait(tier) : null
  const currentSeason = S.season || 1
  return {
    id: `coach_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    name: genCoachName(team.cc),
    nationality: team.cc,
    tier,
    teamId: team.id, teamName: team.name,
    season: currentSeason,
    lifespan: rand(5, 12),
    statBonus: COACH_BONUSES[tier],
    trait,             // legendary / epic only
    contract: rollContract(currentSeason),
  }
}

// ── GM / Director traits ─────────────────────────────────────
// Power-2 abilities for epic/legendary GMs. Effects (other than
// the always-on statBonus + moneyBonus) fire during the season
// flow. Pass 1 just stores them; Pass 2 wires their behaviour.
export const GM_TRAITS = [
  {
    id: 'good_fa_negotiator',
    name: 'Good FA Negotiator',
    description: 'First crack at free agents each offseason.',
    tier: 'legendary',
  },
  {
    id: 'good_fa_negotiator_epic',
    name: 'FA Negotiator',
    description: 'Bumped to the top of the free-agent priority list when tied on open slots.',
    tier: 'epic',
  },
]

function pickGMTrait(tier) {
  const pool = GM_TRAITS.filter(t => t.tier === tier)
  if (!pool.length) return null
  return pick(pool)
}

// GM tier roller — same distribution as players/coaches. Legendary
// GMs are very rare (~2% per roll); since each team rolls a fresh
// GM every 3-10 years, this works out to roughly 1-2 legendary GMs
// in circulation across the 81-team world at any given time.
function rollGMTier() {
  const r = Math.random()
  if (r < 0.02) return 'legendary'
  if (r < 0.07) return 'epic'
  if (r < 0.17) return 'rare'
  if (r < 0.35) return 'uncommon'
  return 'common'
}

// Roll a GM's stat bonuses based on tier. Returns a partial stats
// object — keys are stats that get a non-zero bonus.
//   Legendary: all 5 stats, each rand(5,7), moneyBonus 4
//   Epic:      all 5 stats, each rand(4,5), moneyBonus 3
//   Rare:      pick 2 stats, each rand(3,4), moneyBonus 1
//   Uncommon:  pick 2 stats, each rand(3,4), moneyBonus 0
//   Common:    pick 1-2 stats, each rand(1,2), moneyBonus 0
function rollGMBonuses(tier) {
  const STATS = ['attack','defense','stamina','mental','setPieces']
  const out = {}
  const allFive = () => STATS.reduce((acc, k) => { acc[k] = 0; return acc }, {})
  if (tier === 'legendary') {
    const all = allFive()
    STATS.forEach(k => all[k] = rand(5, 7))
    return { statBonus: all, moneyBonus: 4 }
  }
  if (tier === 'epic') {
    const all = allFive()
    STATS.forEach(k => all[k] = rand(4, 5))
    return { statBonus: all, moneyBonus: 3 }
  }
  if (tier === 'rare') {
    const shuffled = [...STATS].sort(() => Math.random() - 0.5)
    shuffled.slice(0, 2).forEach(k => out[k] = rand(3, 4))
    return { statBonus: out, moneyBonus: 1 }
  }
  if (tier === 'uncommon') {
    const shuffled = [...STATS].sort(() => Math.random() - 0.5)
    shuffled.slice(0, 2).forEach(k => out[k] = rand(3, 4))
    return { statBonus: out, moneyBonus: 0 }
  }
  // common
  const shuffled = [...STATS].sort(() => Math.random() - 0.5)
  const count = rand(1, 2)
  shuffled.slice(0, count).forEach(k => out[k] = rand(1, 2))
  return { statBonus: out, moneyBonus: 0 }
}

// Generate a fresh GM for a team. New GMs come with a random
// 3-10 year tenure. They do not change clubs and do not renew
// — when tenure hits zero, a new GM spawns.
//
// `partialTenure` is true for season-1 setup, where we randomize
// the *remaining* tenure so GMs don't all expire on the same year.
export function genGM(team, partialTenure = false) {
  const tier = rollGMTier()
  const { statBonus, moneyBonus } = rollGMBonuses(tier)
  const trait = (tier === 'legendary' || tier === 'epic') ? pickGMTrait(tier) : null
  const tenureTotal = rand(3, 10)
  const tenureLeft = partialTenure ? rand(1, tenureTotal) : tenureTotal
  return {
    id: `gm_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    name: genCoachName(team.cc),    // reuses coach-name generator
    nationality: team.cc,
    tier,
    teamId: team.id, teamName: team.name,
    joinedSeason: S.season || 1,
    tenureTotal,
    tenureLeft,
    statBonus,
    moneyBonus,
    trait,
  }
}

// Tick down each team's GM tenure by one year. If tenure hits 0,
// spawn a fresh GM for that team.
export function tickGMTenure() {
  if (!S.allTeams) return
  for (const t of S.allTeams) {
    if (!t.gm) {
      t.gm = genGM(t)
      continue
    }
    t.gm.tenureLeft = (t.gm.tenureLeft || 0) - 1
    if (t.gm.tenureLeft <= 0) {
      // Old GM cycles out; new one spawns. We don't archive yet
      // (Pass 3 financials tab can render a GM history later if
      //  wanted).
      t.gm = genGM(t)
    }
  }
}

// Ensure every team has a GM. Called once per fresh-game init.
export function ensureGMs() {
  if (!S.allTeams) return
  for (const t of S.allTeams) {
    if (!t.gm) t.gm = genGM(t, true)   // partialTenure on initial setup
  }
}

// Human-readable description of a GM's effect.
export function describeGMSkills(gm) {
  const lines = []
  const stats = gm.statBonus || {}
  const statBits = Object.entries(stats)
    .filter(([,v]) => v > 0)
    .map(([k,v]) => `+${v} ${k.toUpperCase().slice(0,3)}`)
    .join(', ')
  if (statBits) lines.push(statBits)
  if (gm.moneyBonus > 0) lines.push(`+${gm.moneyBonus}M annual income`)
  if (gm.trait) lines.push(`✦ ${gm.trait.name}: ${gm.trait.description}`)
  lines.push(`Tenure: ${gm.tenureLeft}/${gm.tenureTotal} years remaining`)
  return lines
}

// ── Initialize stars and coaches for ALL teams ────────────────
// Seeds the world: every team gets at least one star + exactly one
// coach + one GM. Re-runnable: it only adds what's missing.
export function initStarsAndCoaches() {
  // Brand-new world: just create the team containers and the all-time
  // stats records. NO stars or coaches are generated here — those are
  // produced by the first run of `runMarket()` (which on season 1
  // finds every team empty and fills exactly one academy graduate +
  // one new manager per team).
  if (!S.allTeams) {
    S.allTeams = ALL_TEAMS.map(t => ({ ...t, stars: [], coachId: null, cashOnHand: 0 }))
  }
  S.coaches = S.coaches || []

  // Initialize the all-time team stats container.
  if (!S.teamStats) S.teamStats = {}
  S.allTeams.forEach(t => {
    if (!t.stars) t.stars = []
    if (typeof t.cashOnHand !== 'number') t.cashOnHand = 0   // Pass 2 will use this
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

  // GMs: every team needs one from day one. Existing GMs are kept.
  ensureGMs()

  // Free agent pool (Pass 2 economy). Initialized empty; populated
  // when contracts expire during the offseason.
  S.freeAgents = S.freeAgents || { stars: [], coaches: [] }

  // Initial contract assignment for any star/coach lacking one
  // (legacy save or fresh world). Randomized yearsLeft so they
  // don't all expire on the same offseason.
  ensureContracts()
  refreshCareerMults()
}

// Attach the strongest star + coach to each qualified team for the
// upcoming Champions League. Also exposes team.stars (the FULL
// array of all stars on the team) so the match popup can show all
// of them and the engine can apply effects from every star.
export function linkStarsToTeams() {
  if (!S.allTeams) return
  const tierOrder = ['generational','legendary','epic','rare','uncommon','common']
  S.teams.forEach(team => {
    const allTeam = S.allTeams.find(t => t.id === team.id)
    if (!allTeam) return
    const stars = [...(allTeam.stars || [])]
    stars.sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
    team.stars = stars                  // full array
    team.star  = stars[0] || null       // best star (legacy code paths)
    team.coach = S.coaches?.find(c => c.teamId === team.id) || null
    team.gm    = allTeam.gm || null     // mirror GM onto qualified-team object
    team.money = allTeam.money          // and money / cashOnHand for UI access
    team.cashOnHand = allTeam.cashOnHand
    team.splurgeActive = !!allTeam.splurgeActive  // mirror the +5 stat boost
    team.colors = allTeam.colors                // mirror the team colors
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
      // Use the real effective overall — same calc the match engine
      // uses — so bonuses from stars/coach/GM count toward league
      // table position, not just the base team stats.
      const eff = getEffStats(at)
      const effOv = Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
      // Add some season-to-season noise so the league isn't fully
      // deterministic (form, injuries, motivation).
      const score = effOv
        + Math.round(gaussRand(6))
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
  // Guard: if the season has already been finalized (history entry
  // exists for this season number), bail out. Otherwise double
  // taps could double-count champions / titles / awards.
  if ((S.history || []).some(h => h.season === S.season)) return

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
// ── OFFSEASON FLOW (Pass 2) ───────────────────────────────────
// Replaces the old market. Runs in fixed order:
//   1. Retirements (stars + coaches whose lifespan is up)
//   2. Contract resolution (renew or send to free agency)
//   3. Income update (annual money + champion penalty)
//   4. Rookie spawn (only for teams with 0 stars / coachless)
//   5. Free agent signings (priority: more open slots first; GM
//      "Good FA Negotiator" trait jumps the queue; one per team)
//   6. Salary deduction (annual salaries pulled from cashOnHand)
//   7. Transfers (deferred — Pass 2.5)
//
// Returns { moves } — an ordered timeline used by the Market UI.
export function runMarket() {
  if (!S.allTeams) return { moves: [] }
  const moves = []
  const currentSeason = S.season || 1
  const findTeam = id => S.allTeams.find(t => t.id === id)
  const tierRank = { generational: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 }

  // Ensure structures.
  S.coaches = S.coaches || []
  S.freeAgents = S.freeAgents || { stars: [], coaches: [] }
  S.allTeams.forEach(t => {
    if (typeof t.cashOnHand !== 'number') t.cashOnHand = 0
    if (!t.stars) t.stars = []
  })

  // ── 1. Retirements ────────────────────────────────────────
  S.allTeams.forEach(team => {
    const survivors = []
    for (const s of team.stars || []) {
      const age = currentSeason - (s.season || 1)
      if (age >= s.lifespan) {
        moves.push({
          phase: 'retirement', kind: 'player',
          star: s, name: s.name, tier: s.tier, pos: s.pos,
          from: team.name, fromId: team.id, fromCC: team.cc,
        })
      } else survivors.push(s)
    }
    team.stars = survivors
  })
  // Retire any free-agent stars whose lifespan expired.
  S.freeAgents.stars = (S.freeAgents.stars || []).filter(s => {
    const age = currentSeason - (s.season || 1)
    if (age >= s.lifespan) {
      moves.push({
        phase: 'retirement', kind: 'player',
        star: s, name: s.name, tier: s.tier, pos: s.pos,
        from: 'Free agency',
      })
      return false
    }
    return true
  })

  // Coaches
  const coachSurvivors = []
  S.coaches.forEach(c => {
    const age = currentSeason - (c.season || 1)
    if (age >= c.lifespan) {
      moves.push({
        phase: 'retirement', kind: 'coach',
        coach: c, name: c.name, tier: c.tier,
        from: c.teamName, fromId: c.teamId, fromCC: findTeam(c.teamId)?.cc,
      })
      const t = findTeam(c.teamId)
      if (t && t.coachId === c.id) t.coachId = null
    } else coachSurvivors.push(c)
  })
  S.coaches = coachSurvivors
  S.freeAgents.coaches = (S.freeAgents.coaches || []).filter(c => {
    const age = currentSeason - (c.season || 1)
    if (age >= c.lifespan) {
      moves.push({
        phase: 'retirement', kind: 'coach',
        coach: c, name: c.name, tier: c.tier,
        from: 'Free agency',
      })
      return false
    }
    return true
  })

  // ── 2. Contract resolution ────────────────────────────────
  // Tick each contract. yearsLeft >= 1 after tick → keep on roster.
  // yearsLeft == 0 → decide renew (happy + team can afford) or FA.
  S.allTeams.forEach(team => {
    const keep = []
    for (const star of team.stars || []) {
      if (!star.contract) star.contract = rollContract(currentSeason - 1)
      star.contract.yearsLeft = (star.contract.yearsLeft || 0) - 1
      if (star.contract.yearsLeft > 0) { keep.push(star); continue }

      const happiness = computeHappiness(star, team.id)
      const threshold = HAPPINESS_THRESHOLDS[star.tier] || 0
      const salary = RARITY_ECON[star.tier]?.salary || 0
      const happy = happiness >= threshold
      // Surplus excluding this expiring contract (already cleared above).
      const surplus = annualIncome(team) - baseSpend(team) - teamAnnualSalary(team)
      const canAfford = surplus >= salary

      if (happy && canAfford) {
        star.contract = rollContract(currentSeason)
        keep.push(star)
        moves.push({
          phase: 'renew', kind: 'player',
          star, name: star.name, tier: star.tier, pos: star.pos,
          from: team.name, fromId: team.id, fromCC: team.cc,
          to:   team.name, toId:   team.id, toCC:   team.cc,
          contractYears: star.contract.yearsTotal,
          happiness,
        })
      } else {
        const reason = !happy ? 'unhappy with results' : 'team couldn\'t afford'
        star.teamId = null
        star.teamName = null
        star.contract = null
        S.freeAgents.stars.push(star)
        moves.push({
          phase: 'expire', kind: 'player',
          star, name: star.name, tier: star.tier, pos: star.pos,
          from: team.name, fromId: team.id, fromCC: team.cc,
          to: 'Free agency',
          reason, happiness,
        })
      }
    }
    team.stars = keep
  })

  // Coaches — same logic
  const keptCoaches = []
  for (const coach of S.coaches) {
    if (!coach.contract) coach.contract = rollContract(currentSeason - 1)
    coach.contract.yearsLeft = (coach.contract.yearsLeft || 0) - 1
    if (coach.contract.yearsLeft > 0) { keptCoaches.push(coach); continue }
    const team = findTeam(coach.teamId)
    if (!team) {
      // No team to renew with — drop to FA.
      coach.teamId = null
      coach.teamName = null
      coach.contract = null
      S.freeAgents.coaches.push(coach)
      continue
    }
    const happiness = computeHappiness(coach, team.id)
    const threshold = HAPPINESS_THRESHOLDS[coach.tier] || 0
    const salary = RARITY_ECON[coach.tier]?.salary || 0
    const happy = happiness >= threshold
    const surplus = annualIncome(team) - baseSpend(team) - teamAnnualSalary(team)
    const canAfford = surplus >= salary

    if (happy && canAfford) {
      coach.contract = rollContract(currentSeason)
      keptCoaches.push(coach)
      moves.push({
        phase: 'renew', kind: 'coach',
        coach, name: coach.name, tier: coach.tier,
        from: team.name, fromId: team.id, fromCC: team.cc,
        to:   team.name, toId:   team.id, toCC:   team.cc,
        contractYears: coach.contract.yearsTotal,
        happiness,
      })
    } else {
      const reason = !happy ? 'unhappy with results' : 'team couldn\'t afford'
      const oldName = coach.teamName, oldId = coach.teamId, oldCC = team.cc
      if (team.coachId === coach.id) team.coachId = null
      coach.teamId = null
      coach.teamName = null
      coach.contract = null
      S.freeAgents.coaches.push(coach)
      moves.push({
        phase: 'expire', kind: 'coach',
        coach, name: coach.name, tier: coach.tier,
        from: oldName, fromId: oldId, fromCC: oldCC,
        to: 'Free agency',
        reason, happiness,
      })
    }
  }
  S.coaches = keptCoaches

  // ── 3. Income, base spend, champion penalty ───────────────
  // Income climbs faster for top clubs (see annualIncome curve).
  // Base spend ($3M) is deducted from every team — sustains the 11
  // non-star players running the team's base 65 rating.
  const championId = S.champion?.id || null
  S.allTeams.forEach(team => {
    const income = annualIncome(team)
    team.cashOnHand = (team.cashOnHand || 0) + income
    moves.push({
      phase: 'income', kind: 'team',
      teamId: team.id, teamName: team.name, teamCC: team.cc,
      amount: income, cashAfter: team.cashOnHand,
    })
    // Base operating cost (scales with income tier).
    const bs = baseSpend(team)
    team.cashOnHand = Math.max(0, team.cashOnHand - bs)
    moves.push({
      phase: 'base_spend', kind: 'team',
      teamId: team.id, teamName: team.name, teamCC: team.cc,
      amount: -bs, cashAfter: team.cashOnHand,
    })
    if (championId === team.id) {
      const penalty = Math.min(CHAMPION_PENALTY, team.cashOnHand)
      team.cashOnHand = Math.max(0, team.cashOnHand - penalty)
      moves.push({
        phase: 'champion_penalty', kind: 'team',
        teamId: team.id, teamName: team.name, teamCC: team.cc,
        amount: -penalty, cashAfter: team.cashOnHand,
      })
    }
  })

  // ── 4. Rookie spawn (empty rosters only) ──────────────────
  const isOpeningMarket = (S.season || 1) === 1
  S.allTeams.forEach(team => {
    if (team.stars.length === 0) {
      const ns = genStar(team)
      // First market of the world: stagger ages and contracts so the
      // initial roster isn't all year-1 rookies. Pretend each star
      // signed somewhere in the past — `season` shifts back by 0..(lifespan-1)
      // years; contract yearsLeft also gets shuffled across 1..total.
      if (isOpeningMarket) {
        const startedAgo = rand(0, Math.max(0, (ns.lifespan || 10) - 2))
        ns.season = 1 - startedAgo
        if (ns.contract) {
          const total = ns.contract.yearsTotal || rand(3, 6)
          ns.contract.yearsTotal = total
          ns.contract.yearsLeft = rand(1, total)
          ns.contract.signedSeason = 1 - rand(0, total - 1)
        }
      }
      team.stars.push(ns)
      moves.push({
        phase: 'youth', kind: 'player',
        star: ns, name: ns.name, tier: ns.tier, pos: ns.pos,
        from: 'Youth Academy', to: team.name, toId: team.id, toCC: team.cc,
      })
    }
  })
  // Every team needs a coach to play matches. If a coach contract
  // expired and that team didn't sign a FA, spawn a new coach.
  S.allTeams.forEach(team => {
    if (team.coachId && S.coaches.find(c => c.id === team.coachId)) return
    const nc = genCoach(team)
    // Opening-market stagger so coaches aren't all year-1 either.
    if (isOpeningMarket) {
      const startedAgo = rand(0, Math.max(0, (nc.lifespan || 8) - 2))
      nc.season = 1 - startedAgo
      if (nc.contract) {
        const total = nc.contract.yearsTotal || rand(3, 6)
        nc.contract.yearsTotal = total
        nc.contract.yearsLeft = rand(1, total)
        nc.contract.signedSeason = 1 - rand(0, total - 1)
      }
    }
    team.coachId = nc.id
    S.coaches.push(nc)
    moves.push({
      phase: 'youth', kind: 'coach',
      coach: nc, name: nc.name, tier: nc.tier, trait: nc.trait,
      from: 'New manager', to: team.name, toId: team.id, toCC: team.cc,
    })
  })

  // Generational floor: world must hold at least 1 Gen at all times.
  // If we just dropped to zero (retirement, etc.), debut a fresh Gen
  // rookie at the wealthiest team that still has an open roster slot.
  if (countGenerationalsInWorld() < GENERATIONAL_CAP_MIN) {
    const cands = S.allTeams
      .filter(t => (t.stars?.length || 0) < 3)
      .sort((a, b) => (b.money || 0) - (a.money || 0))
    if (cands.length) {
      const team = cands[0]
      const gen = genStar(team, 'generational')
      team.stars.push(gen)
      moves.push({
        phase: 'youth', kind: 'player',
        star: gen, name: gen.name, tier: gen.tier, pos: gen.pos,
        from: 'Generational debut', to: team.name, toId: team.id, toCC: team.cc,
      })
    }
  }

  // ── 5. Free agent signings ────────────────────────────────
  // Priority bucket: 3-open → 2-open → 1-open. Within bucket,
  // teams with a "Good FA Negotiator" GM jump the queue; rest
  // randomized. Each team signs AT MOST ONE FA per offseason.
  // Affordability checks: annual salary ≤ surplus AND signing
  // fee ≤ cashOnHand AND player happy with this team.
  const openSlots = team => 3 - (team.stars?.length || 0)
  const considerHappiness = (entity, team) => {
    const temp = { ...entity, contract: { signedSeason: currentSeason } }
    return computeHappiness(temp, team.id)
  }

  for (let bucket = 3; bucket >= 1; bucket--) {
    const teamsInBucket = S.allTeams.filter(t => openSlots(t) === bucket)
        const sorted = teamsInBucket.slice().sort((a, b) => {
      const aFA = a.gm?.trait?.id?.startsWith('good_fa_negotiator') ? 1 : 0
      const bFA = b.gm?.trait?.id?.startsWith('good_fa_negotiator') ? 1 : 0
      if (aFA !== bFA) return bFA - aFA
      return Math.random() - 0.5
    })

    for (const team of sorted) {
      if (openSlots(team) <= 0) continue
      const surplus = annualIncome(team) - baseSpend(team) - teamAnnualSalary(team)
      const cash = team.cashOnHand || 0
      const currentSalaries = teamAnnualSalary(team)
      const candidates = S.freeAgents.stars.filter(s => {
        const econ = RARITY_ECON[s.tier] || {}
        if ((econ.salary  || 0) > surplus) return false
        // Cash must cover signing fee + this year's TOTAL salary
        // (existing roster + new player). Otherwise the team will be
        // forced to release stars in step 7.
        const totalCashNeeded = (econ.signFee || 0) + currentSalaries + (econ.salary || 0)
        if (totalCashNeeded > cash) return false
        const h = considerHappiness(s, team)
        const threshold = HAPPINESS_THRESHOLDS[s.tier] || 0
        return h >= threshold
      })
      if (!candidates.length) continue
      // Prefer the highest tier we can afford. Within same tier,
      // random pick (no scouting hint).
      candidates.sort((a, b) => (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0))
      const topTier = candidates[0].tier
      const topCandidates = candidates.filter(c => c.tier === topTier)
      const star = topCandidates[Math.floor(Math.random() * topCandidates.length)]
      const econ = RARITY_ECON[star.tier] || {}
      team.cashOnHand = Math.max(0, cash - (econ.signFee || 0))
      star.teamId = team.id
      star.teamName = team.name
      star.cc = team.cc
      star.contract = rollContract(currentSeason)
      team.stars.push(star)
      S.freeAgents.stars = S.freeAgents.stars.filter(s => s !== star)
      moves.push({
        phase: 'fa_sign', kind: 'player',
        star, name: star.name, tier: star.tier, pos: star.pos,
        from: 'Free agency',
        to: team.name, toId: team.id, toCC: team.cc,
        signFee: econ.signFee || 0, salary: econ.salary || 0,
        contractYears: star.contract.yearsTotal,
      })
    }
  }

  // ── 6. Transfers ─────────────────────────────────────────
  // Rich clubs poach UNHAPPY non-common stars from other teams.
  // Buyer pays full signing fee; seller receives half (saleValue).
  // Player joins with fresh contract; happiness resets to 100.
  //
  // Cap-replacement: a team at the 3-star cap can sign a
  // tier-upgrade by releasing their worst star to free agency.
  //
  // Max one incoming acquisition per team per offseason (FA OR
  // transfer — combined). buyersUsed tracks teams that already
  // signed an FA in step 5.
  const buyersUsed = new Set(
    moves.filter(m => m.phase === 'fa_sign' && m.kind === 'player').map(m => m.toId)
  )

  // Collect for-sale players: under contract, non-common, unhappy.
  // Each unhappy player has ~60% chance to actively shop this offseason
  // (the rest are "stuck" for another year — failed negotiations,
  // wage demands, family reasons, etc.). Tunes movement rate to roughly
  // half of unhappy stars per offseason.
  const forSale = []
  // Per-tier chance an unhappy player actively shops in any given
  // offseason. Premium players are harder to convince to actually
  // leave (loyalty, comfort, established networks). Lower-tier
  // players move more readily.
  const shopChance = {
    generational: 0.20,
    legendary:    0.30,
    epic:         0.40,
    rare:         0.50,
    uncommon:     0.60,
  }
  S.allTeams.forEach(seller => {
    for (const star of seller.stars || []) {
      if (star.tier === 'common') continue
      if (!star.contract || star.contract.yearsLeft <= 0) continue
      const happiness = computeHappiness(star, seller.id)
      const threshold = HAPPINESS_THRESHOLDS[star.tier] || 0
      if (happiness >= threshold) continue
      const chance = shopChance[star.tier] ?? 0.5
      if (Math.random() > chance) continue
      forSale.push({ star, seller, happiness })
    }
  })
  // Premium players move first (a Legend's storyline shouldn't be
  // gated by a Rare's earlier match).
  forSale.sort((a, b) => (tierRank[b.star.tier] || 0) - (tierRank[a.star.tier] || 0))

  for (const item of forSale) {
    const { star, seller } = item
    const econ = RARITY_ECON[star.tier] || {}
    const starRank = tierRank[star.tier] || 0

    // Find candidate buyers.
    const candidates = []
    for (const buyer of S.allTeams) {
      if (buyer.id === seller.id) continue
      if (buyersUsed.has(buyer.id)) continue
      const surplus = annualIncome(buyer) - baseSpend(buyer) - teamAnnualSalary(buyer)
      const cash = buyer.cashOnHand || 0
      const currentSalaries = teamAnnualSalary(buyer)
      if ((econ.salary  || 0) > surplus) continue
      const totalCashNeeded = (econ.signFee || 0) + currentSalaries + (econ.salary || 0)
      if (totalCashNeeded > cash) continue

      const stars = buyer.stars || []
      let upgradeBenefit = 0
      let displaced = null
      if (stars.length < 3) {
        // Open slot — any non-common is fine.
        upgradeBenefit = starRank
      } else {
        // Cap-replacement: must out-rank the worst current star.
        const worst = stars.reduce(
          (w, s) => (tierRank[s.tier] || 0) < (tierRank[w.tier] || Infinity) ? s : w,
          stars[0]
        )
        const worstRank = tierRank[worst.tier] || 0
        if (starRank <= worstRank) continue
        upgradeBenefit = starRank - worstRank
        displaced = worst
      }

      candidates.push({ buyer, displaced, upgradeBenefit })
    }
    if (!candidates.length) continue

    // Buyer priority. Top tier ($12-$14M effective) bids first
    // because that's how real football works for marquee transfers.
    // But to prevent mid-rich clubs from being permanently boxed
    // out, we bucket money into [12+, 10-11, ≤9] tiers — within
    // a bucket, the team with more cash on hand wins (they can
    // afford the fee right now), tiebreak by upgrade benefit.
    const moneyBucket = m => m >= 12 ? 0 : m >= 10 ? 1 : 2
    candidates.sort((a, b) => {
      const ba = moneyBucket(a.buyer.money || 0)
      const bb = moneyBucket(b.buyer.money || 0)
      if (ba !== bb) return ba - bb                                    // lower bucket = priority
      const ca = (b.buyer.cashOnHand || 0) - (a.buyer.cashOnHand || 0)
      if (ca !== 0) return ca                                          // cash-richer wins
      return b.upgradeBenefit - a.upgradeBenefit
    })
    const { buyer, displaced } = candidates[0]

    // Cap-release first, so the slot is actually open before the
    // new star pushes in.
    if (displaced) {
      buyer.stars = buyer.stars.filter(s => s !== displaced)
      displaced.teamId = null
      displaced.teamName = null
      displaced.contract = null
      S.freeAgents.stars.push(displaced)
      moves.push({
        phase: 'cap_release', kind: 'player',
        star: displaced, name: displaced.name, tier: displaced.tier, pos: displaced.pos,
        from: buyer.name, fromId: buyer.id, fromCC: buyer.cc,
        to: 'Free agency',
        reason: 'displaced by transfer',
      })
    }

    // Move the player and money.
    buyer.cashOnHand  = Math.max(0, (buyer.cashOnHand || 0) - (econ.signFee || 0))
    seller.cashOnHand = (seller.cashOnHand || 0) + (econ.saleValue || 0)
    seller.stars = seller.stars.filter(s => s !== star)
    star.teamId   = buyer.id
    star.teamName = buyer.name
    star.cc       = buyer.cc
    star.contract = rollContract(currentSeason)
    buyer.stars.push(star)
    buyersUsed.add(buyer.id)

    moves.push({
      phase: 'transfer', kind: 'player',
      star, name: star.name, tier: star.tier, pos: star.pos,
      from: seller.name, fromId: seller.id, fromCC: seller.cc,
      to:   buyer.name,  toId:   buyer.id,  toCC:   buyer.cc,
      signFee: econ.signFee || 0, saleValue: econ.saleValue || 0, salary: econ.salary || 0,
      contractYears: star.contract.yearsTotal,
      happiness: item.happiness,
      displaced: displaced ? { name: displaced.name, tier: displaced.tier } : null,
    })
  }

  // ── 7. Salary deduction ──────────────────────────────────
  // Every team pays the sum of their current roster's salaries.
  // Cash is HARD-FLOORED at 0 — if salary commitments exceed cash
  // on hand (rare; happens when a GM's moneyBonus expires and the
  // team is left with contracts it can't sustain), the team forces
  // out its highest-paid star to free agency until salaries fit.
  S.allTeams.forEach(team => {
    let sal = teamAnnualSalary(team)
    const cash = team.cashOnHand || 0

    // If salary exceeds cash, release highest-paid star(s).
    while (sal > cash) {
      const stars = team.stars || []
      if (stars.length === 0) break  // nothing left to release
      // Pick the highest-salary star to drop. Tiebreaker: lowest tier
      // (rather drop an Epic than a Legend if same salary).
      const tierVal = { generational:6, legendary:5, epic:4, rare:3, uncommon:2, common:1 }
      const ranked = [...stars].sort((a, b) => {
        const sa = RARITY_ECON[a.tier]?.salary || 0
        const sb = RARITY_ECON[b.tier]?.salary || 0
        if (sb !== sa) return sb - sa
        return (tierVal[a.tier]||0) - (tierVal[b.tier]||0)
      })
      const dropped = ranked[0]
      team.stars = stars.filter(s => s !== dropped)
      dropped.teamId = null
      dropped.teamName = null
      dropped.contract = null
      S.freeAgents.stars.push(dropped)
      moves.push({
        phase: 'cap_release', kind: 'player',
        star: dropped, name: dropped.name, tier: dropped.tier, pos: dropped.pos,
        from: team.name, fromId: team.id, fromCC: team.cc,
        to: 'Free agency',
        reason: 'salary cap exceeded',
      })
      sal = teamAnnualSalary(team)
    }

    if (sal > 0) {
      team.cashOnHand = Math.max(0, cash - sal)
      moves.push({
        phase: 'salary', kind: 'team',
        teamId: team.id, teamName: team.name, teamCC: team.cc,
        amount: -sal, cashAfter: team.cashOnHand,
      })
    }
  })

  // ── 8. Stat decay ────────────────────────────────────────
  // Each non-mental stat regresses toward 60: lose round(coef × (stat - 60))
  // points ± wiggle. Higher coef means harder to maintain high stats.
  S.allTeams.forEach(team => {
    if (!team.seasonStats) return
    const s = team.seasonStats
    const decayFor = (v) => {
      const above = Math.max(0, v - 60)
      const base = Math.round(above * ECON.decayCoef)
      const wig = ECON.decayWiggle
      return Math.max(0, base + (wig > 0 ? rand(-wig, wig) : 0))
    }
    const decayed = {
      attack:    Math.max(50, s.attack    - decayFor(s.attack)),
      defense:   Math.max(50, s.defense   - decayFor(s.defense)),
      stamina:   Math.max(50, s.stamina   - decayFor(s.stamina)),
      mental:    60,
      setPieces: Math.max(50, s.setPieces - decayFor(s.setPieces)),
    }
    team.seasonStats = decayed
  })

  // ── 9. Stat investment ───────────────────────────────────
  // Teams spend a random fraction (ECON.investMin..investMax) of
  // cash on stat upgrades; rest saved for signings. Yield per $1M
  // = (90 - current) × ECON.yieldCoef. Stats capped at 90. Cash
  // above CASH_CAP after the willing spend is forced into more.
  S.allTeams.forEach(team => {
    const cash = team.cashOnHand || 0
    if (cash <= 0 || !team.seasonStats) return

    const willingRatio = ECON.investMin + Math.random() * (ECON.investMax - ECON.investMin)
    let spend = Math.round(cash * willingRatio)
    const overCap = Math.max(0, cash - spend - CASH_CAP)
    if (overCap > 0) spend += overCap
    if (spend <= 0) return

    const s = team.seasonStats
    // Linear yield: $1M = ECON.yieldFlat points per stat (default 3).
    // Each stat gets the spend × yieldFlat + ±1 random.
    const gain = () => {
      return Math.max(0, Math.round(spend * ECON.yieldFlat + gaussRand(1)))
    }
    const newStats = {
      attack:    Math.min(90, s.attack    + gain()),
      defense:   Math.min(90, s.defense   + gain()),
      stamina:   Math.min(90, s.stamina   + gain()),
      mental:    60,
      setPieces: Math.min(90, s.setPieces + gain()),
    }
    team.seasonStats = newStats
    team.cashOnHand = cash - spend

    moves.push({
      phase: 'invest', kind: 'team',
      teamId: team.id, teamName: team.name, teamCC: team.cc,
      amount: -spend, cashAfter: team.cashOnHand,
      newOverall: Math.round((newStats.attack + newStats.defense + newStats.stamina + newStats.mental + newStats.setPieces) / 5),
    })
  })

  // Refresh currentOverall snapshot for UI after decay+investment.
  S.allTeams.forEach(team => {
    if (!team.seasonStats) return
    const s = team.seasonStats
    team.currentOverall = Math.round((s.attack + s.defense + s.stamina + s.mental + s.setPieces) / 5)
  })

  // Career mults stay fresh — newly spawned rookies need 0.80,
  // veterans who tipped into their last year need 0.90, etc.
  refreshCareerMults()

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
  // GM tenure ticks down each new season. If a tenure expires,
  // a fresh GM spawns for that team.
  tickGMTenure()
  // Player career arc: refresh the 80/90/100/90 multipliers since
  // every star aged one year.
  refreshCareerMults()
}

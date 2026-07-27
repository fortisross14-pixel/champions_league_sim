import { S, autoSave } from '../store.js'
import { LEAGUES, LEAGUE_TEAMS, ALL_TEAMS } from '../data/teams.js'
import { HISTORIC_LEGENDS } from '../data/legends.js'
import { simMatch, rand, clamp, pick, shuffle, gaussRand, ovr, getEffStats } from './match.js'
import {
  genNameForCC, genCoachName, pickPlayerNationality, COUNTRY_NAME
} from '../data/players.js'
import {
  PLAYER_BASE_SALARY, COACH_BASE_SALARY,
  ensureClubFinance, annualIncome, baseSpend, baseSquadSalary, operatingCosts,
  teamAnnualSalary, teamStarSalary, teamCoachSalary, projectedAnnualSurplus,
  playerSalaryDemand, coachSalaryDemand, playerMarketValue, freeAgentSigningBonus,
  playerAge, financeSnapshot, addTreasury, setTreasury,
  effectiveMoney as financeEffectiveMoney,
} from './finance.js'

export {
  annualIncome, baseSpend, baseSquadSalary, operatingCosts,
  teamAnnualSalary, teamStarSalary, teamCoachSalary, projectedAnnualSurplus,
  playerMarketValue, playerAge, financeSnapshot,
}

// ── Tier helpers ─────────────────────────────────────────────
export const tierOf = f => f>=5000?'generational':f>=2000?'legendary':f>=800?'epic':f>=300?'rare':f>=80?'uncommon':'common'
export const tierLabel = t => ({generational:'Generational',legendary:'Legendary',epic:'Epic',rare:'Rare',uncommon:'Uncommon',common:'Common'})[t]||t
export const tierColor = t => ({generational:'#e91e63',legendary:'#ff9800',epic:'#9c27b0',rare:'#2196f3',uncommon:'#4caf50',common:'#6a7a9a'})[t]||'#6a7a9a'

export const currentCalendarYear = () => Number(S.year) || (1955 + (S.season || 1))

// World roster targets. The simulator keeps roughly 200 contracted
// stars across 82 clubs plus 20-30 free agents. New players are generated
// against the current rarity deficits rather than by an isolated random roll,
// so a 20-year universe remains close to the intended football pyramid.
export const WORLD_STAR_TARGET = 225
export const WORLD_STAR_MIN = 220
export const WORLD_STAR_MAX = 230
export const CLUB_STAR_TARGET = 200
export const CLUB_STAR_MIN = 2
export const CLUB_STAR_MAX = 3
export const FREE_AGENT_TARGET = 25
export const FREE_AGENT_MIN = 20
export const FREE_AGENT_MAX = 30

export const STAR_TIER_TARGETS = {
  generational: 3,
  legendary: 10,
  epic: 20,
  rare: 40,
  uncommon: 64,
  common: 88,
}

const STAR_TIER_HARD_MAX = {
  generational: 3,
  legendary: 13,
  epic: 22,
  rare: 44,
  uncommon: 78,
  common: 105,
}

function rollTier() {
  const tiers = ['generational','legendary','epic','rare','uncommon','common']
  const counts = Object.fromEntries(tiers.map(t => [t, countTierInWorld(t)]))
  const candidates = tiers.filter(t => counts[t] < STAR_TIER_HARD_MAX[t])
  if (!candidates.length) return 'common'
  candidates.sort((a,b) => {
    const deficitA = (STAR_TIER_TARGETS[a] - counts[a]) / Math.max(1, STAR_TIER_TARGETS[a])
    const deficitB = (STAR_TIER_TARGETS[b] - counts[b]) / Math.max(1, STAR_TIER_TARGETS[b])
    return (deficitB + Math.random()*0.08) - (deficitA + Math.random()*0.08)
  })
  return candidates[0]
}

// Count active premium stars across all teams + free agency. Named
// historical players count against the same world caps as generated ones.
function countTierInWorld(tier) {
  let n = 0
  ;(S.allTeams || []).forEach(t => {
    for (const s of (t.stars || [])) if (s.tier === tier) n++
  })
  for (const s of (S.freeAgents?.stars || [])) if (s.tier === tier) n++
  return n
}
function countGenerationalsInWorld() { return countTierInWorld('generational') }
function countLegendariesInWorld() { return countTierInWorld('legendary') }

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
  if (star?.historicLegend) {
    if (age <= 0) return 0.90
    if (age >= (star.lifespan || 9) - 1) return 0.90
    return 1.00
  }
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

// ── Economy model ───────────────────────────────────────────
// Finances use realistic €/$-million scale: recurring club revenue,
// base-squad payroll, operating costs, named-star/coach wages, and a
// persistent treasury. Transfer fees and wages are calculated from
// tier, age, source-club strength, contract length, and happiness.
// The detailed formulas live in finance.js so they can be reused by
// the UI and by long-run balance tests.
export const RARITY_ECON = Object.fromEntries(
  Object.entries(PLAYER_BASE_SALARY).map(([tier, salary]) => [tier, { salary }])
)

export const ECON = {
  decayCoef: 0.34,
  decayWiggle: 1,
  investmentPointCost: 18,
  investMin: 0.45,
  investMax: 0.75,
}

// Premium guardrails. Named historical players count against these
// same limits. Generic stars stop spawning above the preferred targets;
// historic debuts may replace generated premium stars but never push the
// active world beyond three Generationals or thirteen Legends.
export const GENERATIONAL_CAP_MAX = 3
export const GENERATIONAL_CAP_MIN = 2
export const LEGENDARY_CAP_MAX = 13
export const LEGENDARY_CAP_MIN = 8

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

// Roll a fresh contract. Named-player wages live on the contract so
// salary history survives future tier and finance-model changes.
function rollContract(signedSeason, entity = null, team = null, happiness = 70, yearsOverride = null) {
  const years = yearsOverride || rand(3, 6)
  const salary = entity
    ? (entity.pos
      ? playerSalaryDemand(entity, team, happiness, signedSeason)
      : coachSalaryDemand(entity, team, happiness, signedSeason))
    : 0
  return { yearsLeft: years, yearsTotal: years, signedSeason, salary }
}

// Set up initial contracts for any star/coach who doesn't have
// one yet. Randomizes yearsLeft so they don't all expire on the
// same offseason.
export function ensureContracts() {
  const startingSeason = S.season || 1
  ;(S.allTeams || []).forEach(t => {
    ensureClubFinance(t)
    ;(t.stars || []).forEach(star => {
      if (!star.contract) {
        const total = rand(3, 6)
        const yearsLeft = rand(1, total)
        star.contract = rollContract(startingSeason - (total - yearsLeft), star, t, 70, total)
        star.contract.yearsLeft = yearsLeft
      } else if (typeof star.contract.salary !== 'number') {
        star.contract.salary = playerSalaryDemand(star, t, computeHappiness(star, t.id) || 70, startingSeason)
      }
      if (typeof star.debutAge !== 'number') star.debutAge = 18
    })
  })
  ;(S.coaches || []).forEach(coach => {
    const team = (S.allTeams || []).find(t => t.id === coach.teamId)
    if (!coach.contract) {
      const total = rand(3, 6)
      const yearsLeft = rand(1, total)
      coach.contract = rollContract(startingSeason - (total - yearsLeft), coach, team, 70, total)
      coach.contract.yearsLeft = yearsLeft
    } else if (typeof coach.contract.salary !== 'number') {
      coach.contract.salary = coachSalaryDemand(coach, team, computeHappiness(coach, coach.teamId) || 70, startingSeason)
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
    const sal = star.contract.salary ?? PLAYER_BASE_SALARY[star.tier] ?? 0
    lines.push(`📜 Contract: ${star.contract.yearsLeft}/${star.contract.yearsTotal} yr · $${Number(sal).toFixed(1)}M/yr`)
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
    salary: star.contract.salary ?? PLAYER_BASE_SALARY[star.tier] ?? 0,
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

// Effective sporting resources still use the original compact team
// rating scale. Financial revenue is calculated separately in finance.js.
export function effectiveMoney(team) {
  return financeEffectiveMoney(team)
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
  if (!forceTier && tier === 'generational' && countGenerationalsInWorld() >= GENERATIONAL_CAP_MAX) {
    tier = 'legendary'
  }
  if (!forceTier && tier === 'legendary' && countLegendariesInWorld() >= LEGENDARY_CAP_MAX) {
    tier = 'epic'
  }
  const pos = pick(POSITIONS)
  const statBonus = STAT_BONUSES[pos]?.[tier] || {}
  const goalDist  = GOAL_DIST[pos]?.[tier] || [1,0,0,0,0]
  const saveProb  = SAVE_PROB[pos]?.[tier] || 0
  const trait     = pickStarTrait(pos, tier)
  const lifespan  = tier === 'generational' ? rand(11, 15) : rand(8, 12)
  const currentSeason = S.season || 1
  const star = {
    id: `s_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name: genNameForCC(nationality),
    nationality,
    pos, tier,
    teamId: team.id, teamName: team.name, cc: team.cc,
    season: currentSeason,
    debutAge: 18,
    lifespan,
    goals: 0, ratings: [], wcsPlayed: 0, fame: 0,
    medals: { gold:0, silver:0, bronze:0 },
    statBonus,
    goalDist,
    saveProb,
    trait,
    lastTransferSeason: null,
    contract: null,
  }
  star.contract = rollContract(currentSeason, star, team, 75)
  return star
}

function contractedStarCount() {
  return (S.allTeams || []).reduce((sum, team) => sum + (team.stars || []).length, 0)
}
function worldStarCount() {
  return contractedStarCount() + (S.freeAgents?.stars || []).length
}
function tierRankValue(tier) {
  return ({ common:1, uncommon:2, rare:3, epic:4, legendary:5, generational:6 })[tier] || 0
}
function prepareOpeningPlayer(star, team) {
  const startedAgo = rand(0, Math.max(0, (star.lifespan || 10) - 2))
  star.season = 1 - startedAgo
  star.debutAge = 18
  const total = star.contract?.yearsTotal || rand(3, 6)
  star.contract = rollContract(1 - rand(0, Math.max(0, total - 1)), star, team, 70, total)
  star.contract.yearsLeft = rand(1, total)
  star.careerMult = computeCareerMult(star, S.season || 1)
}
function createProceduralFreeAgent(currentSeason, opening = false) {
  const origin = pick(S.allTeams || [])
  if (!origin) return null
  const star = genStar(origin)
  if (opening) prepareOpeningPlayer(star, origin)
  star.teamId = null
  star.teamName = null
  star.cc = null
  star.contract = null
  star.lastTransferSeason = null
  star.freeAgentSince = currentSeason
  return star
}

// Maintain the full football world, not only the qualified clubs. The target
// is about 200 contracted players and 25 free agents at all times. Existing
// compatible saves are gently normalized by releasing the weakest third stars
// and retiring only surplus low-tier free agents.
function maintainStarPopulation(moves, currentSeason, { opening = false, finalPass = false } = {}) {
  S.freeAgents = S.freeAgents || { stars: [], coaches: [] }
  S.freeAgents.stars = S.freeAgents.stars || []
  const moveToFreeAgency = (team, star, reason) => {
    team.stars = (team.stars || []).filter(s => s !== star)
    star.teamId = null
    star.teamName = null
    star.cc = null
    star.contract = null
    star.freeAgentSince = currentSeason
    if (!S.freeAgents.stars.includes(star)) S.freeAgents.stars.push(star)
    moves.push({ phase:'pool_balance', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:team.name, fromId:team.id, fromCC:team.cc, to:'Free agency', reason })
  }

  // Never retain more than three named stars at a club.
  for (const team of S.allTeams || []) {
    team.stars = team.stars || []
    while (team.stars.length > CLUB_STAR_MAX) {
      const removable = [...team.stars].sort((a,b) =>
        Number(!!a.historicLegend) - Number(!!b.historicLegend) ||
        tierRankValue(a.tier) - tierRankValue(b.tier) ||
        (a.fame || 0) - (b.fame || 0)
      )[0]
      moveToFreeAgency(team, removable, 'club roster reduced to three stars')
    }
  }

  // Every club carries at least two stars. On a fresh 1956 world their career
  // stages are staggered so retirements do not arrive in one giant wave.
  for (const team of shuffle([...(S.allTeams || [])])) {
    while (team.stars.length < CLUB_STAR_MIN) {
      const star = genStar(team)
      if (opening) prepareOpeningPlayer(star, team)
      team.stars.push(star)
      moves.push({ phase:'youth', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Youth Academy', to:team.name, toId:team.id, toCC:team.cc, salary:star.contract?.salary, reason:'roster expansion' })
    }
  }

  // Normalize oversized legacy rosters by releasing the least important third
  // stars first. Historical legends and premium stars are protected.
  while (contractedStarCount() > CLUB_STAR_TARGET) {
    const candidates = (S.allTeams || []).flatMap(team => (team.stars || []).length > CLUB_STAR_MIN
      ? team.stars.map(star => ({ team, star })) : [])
      .sort((a,b) =>
        Number(!!a.star.historicLegend) - Number(!!b.star.historicLegend) ||
        tierRankValue(a.star.tier) - tierRankValue(b.star.tier) ||
        (a.star.fame || 0) - (b.star.fame || 0) ||
        playerAge(b.star, currentSeason) - playerAge(a.star, currentSeason)
      )
    if (!candidates.length) break
    moveToFreeAgency(candidates[0].team, candidates[0].star, 'club roster normalized')
  }

  // Fill third-star slots until the contracted world reaches ~200. Rich and
  // ambitious clubs are somewhat more likely to carry three, but randomness
  // keeps the same giants from monopolizing every extra player.
  let safety = 0
  while (contractedStarCount() < CLUB_STAR_TARGET && safety++ < 500) {
    const candidates = (S.allTeams || []).filter(team => (team.stars || []).length < CLUB_STAR_MAX)
    if (!candidates.length) break
    candidates.sort((a,b) => {
      const scoreA = annualIncome(a, currentSeason)/70 + (a.financeProfile?.ambition || 1)*2 + Math.random()*10
      const scoreB = annualIncome(b, currentSeason)/70 + (b.financeProfile?.ambition || 1)*2 + Math.random()*10
      return scoreB - scoreA
    })
    const team = candidates[0]
    const star = genStar(team)
    if (opening) prepareOpeningPlayer(star, team)
    team.stars.push(star)
    moves.push({ phase:'youth', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Youth Academy', to:team.name, toId:team.id, toCC:team.cc, salary:star.contract?.salary, reason:'expanded three-star roster' })
  }

  // Keep a genuine free-agent market. New unattached players use the same
  // rarity-deficit generator as academy products, so the global distribution
  // stays near 3/10/20/40 for the four premium tiers.
  while (S.freeAgents.stars.length < FREE_AGENT_TARGET && worldStarCount() < WORLD_STAR_MAX) {
    const star = createProceduralFreeAgent(currentSeason, opening)
    if (!star) break
    S.freeAgents.stars.push(star)
    moves.push({ phase:'fa_arrival', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Released player pool', to:'Free agency', reason:'market depth' })
  }

  // Transfers and contract releases can push free agency above thirty. Remove
  // older Common/Uncommon surplus first; premium players remain available.
  const trimOneFreeAgent = () => {
    const ordered = [...S.freeAgents.stars].sort((a,b) =>
      Number(!!a.historicLegend) - Number(!!b.historicLegend) ||
      tierRankValue(a.tier) - tierRankValue(b.tier) ||
      playerAge(b, currentSeason) - playerAge(a, currentSeason) ||
      (a.fame || 0) - (b.fame || 0)
    )
    const victim = ordered[0]
    if (!victim) return false
    S.freeAgents.stars = S.freeAgents.stars.filter(s => s !== victim)
    moves.push({ phase:'retirement', kind:'player', star:victim, name:victim.name, tier:victim.tier, pos:victim.pos, from:'Free agency', reason:'left the professional player pool' })
    return true
  }
  while (S.freeAgents.stars.length > FREE_AGENT_MAX) if (!trimOneFreeAgent()) break
  while (worldStarCount() > WORLD_STAR_MAX && S.freeAgents.stars.length > FREE_AGENT_MIN) if (!trimOneFreeAgent()) break

  // A final pass repairs rare edge cases after transfer activity: a club that
  // lost two players still gets back to two, and the world never falls below
  // 220 active professionals.
  if (finalPass) {
    for (const team of shuffle([...(S.allTeams || [])])) {
      while (team.stars.length < CLUB_STAR_MIN && worldStarCount() < WORLD_STAR_MAX) {
        const star = genStar(team)
        team.stars.push(star)
        moves.push({ phase:'youth', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Youth Academy', to:team.name, toId:team.id, toCC:team.cc, salary:star.contract?.salary, reason:'late roster replacement' })
      }
    }
    while (worldStarCount() < WORLD_STAR_MIN && S.freeAgents.stars.length < FREE_AGENT_MAX) {
      const star = createProceduralFreeAgent(currentSeason, false)
      if (!star) break
      S.freeAgents.stars.push(star)
      moves.push({ phase:'fa_arrival', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Released player pool', to:'Free agency', reason:'world roster replacement' })
    }
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
    const sal = coach.contract?.salary ?? COACH_BASE_SALARY[coach.tier] ?? 0
    lines.push(`📜 Contract: ${coach.contract.yearsLeft}/${coach.contract.yearsTotal} yr · $${Number(sal).toFixed(1)}M/yr`)
  }
  return lines
}

export function genCoach(team) {
  const tier = rollCoachTier()
  const trait = (tier === 'legendary' || tier === 'epic') ? pickCoachTrait(tier) : null
  const currentSeason = S.season || 1
  const coach = {
    id: `coach_${team.id}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    name: genCoachName(team.cc),
    nationality: team.cc,
    tier,
    teamId: team.id, teamName: team.name,
    season: currentSeason,
    lifespan: rand(5, 12),
    statBonus: COACH_BONUSES[tier],
    trait,
    contract: null,
  }
  coach.contract = rollContract(currentSeason, coach, team, 70)
  return coach
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
  if (gm.moneyBonus > 0) lines.push(`+${(gm.moneyBonus * 0.8).toFixed(1)}% commercial revenue`)
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
    S.allTeams = ALL_TEAMS.map(t => ({ ...t, stars: [], coachId: null, treasury: 0, cashOnHand: 0 }))
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
    team.treasury = allTeam.treasury
    team.cashOnHand = allTeam.cashOnHand
    team.financeProfile = allTeam.financeProfile
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

// Build the tournament roster from local-league outcomes. The historic
// European Cup uses 16 clubs and a pure knockout bracket; the modern era
// keeps the existing 32-team group-stage qualification.
function buildQualifiedTeam(entry) {
  const t = entry.team
  const live = S.allTeams?.find(at => at.id === t.id) || t
  const stats = live.seasonStats ? { ...live.seasonStats } : buildStats(live)
  const overall = Math.round((stats.attack + stats.defense + stats.stamina + stats.mental + stats.setPieces) / 5)
  return {
    ...t,
    stats,
    seasonStats: stats,
    currentOverall: overall,
    lastSeasonOverall: live.lastSeasonOverall || 0,
    rating: overall,
    hist: histPts(t.id),
    isLocalChampion: !!entry.isChampion,
    isDefendingChampion: !!entry.isDefendingChampion,
    leagueId: entry.league?.id || t.league,
    leagueName: entry.league?.name || t.league,
    pts:0, w:0, d:0, l:0, gf:0, ga:0, gd:0,
    mentalityDelta:0,
    star:null, coach:null,
  }
}

function resetTournamentState() {
  S.roundReached = {}
  S.teamGoals = {}
  S.teamGoalsConceded = {}
  S.teamShots = {}
  S.teamShotsOnTarget = {}
  S.teamXG = {}
  S.teamYellowCards = {}
  S.teamRedCards = {}
  S.teamPossession = {}
  S.teamPossessionMatches = {}
  S.allMatchResults = []
  S.scorers = {}
  S.seasonAwards = {}
  S.groups = []
  S.groupMatches = []
  S.knockoutRounds = []
}

function effectiveOverallForTeam(team) {
  const live = S.allTeams?.find(t => t.id === team.id) || team
  const eff = getEffStats(live)
  return Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
}

function classicQualificationEntries() {
  const entries = []
  const seen = new Set()
  const add = (team, league, extra={}) => {
    if (!team || seen.has(team.id)) return
    seen.add(team.id)
    entries.push({ team, league, ...extra })
  }

  const lastChampionId = [...(S.history || [])].reverse().find(h => h.champion)?.champion || null
  if (lastChampionId) {
    const defending = S.allTeams?.find(t => t.id === lastChampionId)
    const league = LEAGUES.find(l => l.id === defending?.league)
    add(defending, league, { isDefendingChampion:true, isChampion:false, protected:true })
  }

  // Every national champion enters. This automatically adds the champion
  // from the defending holder's country if the holder did not retain it.
  LEAGUES.forEach(L => {
    const r = S.localLeagueResults?.[L.id]
    const champion = r?.standings?.[0]?.team || r?.qualified?.[0]
    add(champion, L, { isChampion:true, protected:true })
  })

  // Fill vacancies with the strongest runners-up from the major leagues.
  const leaguePriority = { ENG:9, ESP:9, ITA:8, GER:8, FRA:6, POR:5, NED:5, SCO:3, TUR:3, RUS:3, UKR:3, GRE:2, ROE:2 }
  const runners = []
  LEAGUES.forEach(L => {
    const standings = S.localLeagueResults?.[L.id]?.standings || []
    standings.slice(1).forEach((row, index) => runners.push({
      team:row.team, league:L, isChampion:false,
      score:(leaguePriority[L.id] || 1) * 100 + effectiveOverallForTeam(row.team) - index * 4,
    }))
  })
  runners.sort((a,b) => b.score - a.score)
  for (const entry of runners) {
    if (entries.length >= 16) break
    add(entry.team, entry.league, entry)
  }

  // Future data expansions may create more than 16 champions. The hidden
  // preliminary round is represented by retaining protected clubs first,
  // then selecting the strongest remaining sides.
  if (entries.length > 16) {
    const protectedEntries = entries.filter(e => e.protected)
    const others = entries.filter(e => !e.protected).sort((a,b) => effectiveOverallForTeam(b.team) - effectiveOverallForTeam(a.team))
    return [...protectedEntries, ...others].slice(0,16)
  }
  return entries.slice(0,16)
}

export function runQualification() {
  if (!S.localLeagueResults) runLocalLeagues()
  let qualified = []

  if (S.era === 'european_cup') {
    qualified = classicQualificationEntries()
  } else {
    LEAGUES.forEach(L => {
      const r = S.localLeagueResults[L.id]
      if (!r) return
      r.qualified.forEach((t, idx) => qualified.push({ team:t, league:L, isChampion:idx===0 }))
    })
    qualified = qualified.slice(0,32)
  }

  S.teams = qualified.map(buildQualifiedTeam)
  resetTournamentState()
  S.teams.forEach(t => {
    if (S.teamStats?.[t.id]) S.teamStats[t.id].participations++
  })
  linkStarsToTeams()
}

// Historic draw: sixteen teams, no seeding and no country protection.
// The entire tournament is visible as a bracket from the beginning.
export function buildClassicBracket() {
  const teams = shuffle([...S.teams])
  const matches = []
  for (let i=0; i<teams.length; i+=2) {
    if (teams[i] && teams[i+1]) matches.push({
      t1:teams[i], t2:teams[i+1], played:false, result:null,
      leg:1, firstLegResult:null, secondLegResult:null,
    })
  }
  S.groups = []
  S.groupMatches = []
  S.knockoutRounds = [{ name:'Round of 16', matches }]
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
    shotsOnTarget1:r.shotsOnTarget1, shotsOnTarget2:r.shotsOnTarget2,
    xG1:r.xG1, xG2:r.xG2,
    corners1:r.corners1, corners2:r.corners2,
    possession1:r.possession1, possession2:r.possession2,
    yellowCards1:r.yellowCards1, yellowCards2:r.yellowCards2,
    redCards1:r.redCards1, redCards2:r.redCards2,
    starRatings:r.starRatings,
  })
  S.teamGoals = S.teamGoals || {}
  S.teamGoalsConceded = S.teamGoalsConceded || {}
  S.teamShots = S.teamShots || {}
  S.teamShotsOnTarget = S.teamShotsOnTarget || {}
  S.teamXG = S.teamXG || {}
  S.teamYellowCards = S.teamYellowCards || {}
  S.teamRedCards = S.teamRedCards || {}
  S.teamPossession = S.teamPossession || {}     // sum of possession %
  S.teamPossessionMatches = S.teamPossessionMatches || {}  // count of matches
  S.teamGoals[r.t1.id] = (S.teamGoals[r.t1.id]||0) + r.g1
  S.teamGoals[r.t2.id] = (S.teamGoals[r.t2.id]||0) + r.g2
  S.teamGoalsConceded[r.t1.id] = (S.teamGoalsConceded[r.t1.id]||0) + r.g2
  S.teamGoalsConceded[r.t2.id] = (S.teamGoalsConceded[r.t2.id]||0) + r.g1
  S.teamShots[r.t1.id] = (S.teamShots[r.t1.id]||0) + (r.shots1||0)
  S.teamShots[r.t2.id] = (S.teamShots[r.t2.id]||0) + (r.shots2||0)
  S.teamShotsOnTarget[r.t1.id] = (S.teamShotsOnTarget[r.t1.id]||0) + (r.shotsOnTarget1||0)
  S.teamShotsOnTarget[r.t2.id] = (S.teamShotsOnTarget[r.t2.id]||0) + (r.shotsOnTarget2||0)
  S.teamXG[r.t1.id] = Math.round(((S.teamXG[r.t1.id]||0) + (r.xG1||0)) * 100) / 100
  S.teamXG[r.t2.id] = Math.round(((S.teamXG[r.t2.id]||0) + (r.xG2||0)) * 100) / 100
  S.teamYellowCards[r.t1.id] = (S.teamYellowCards[r.t1.id]||0) + (r.yellowCards1||0)
  S.teamYellowCards[r.t2.id] = (S.teamYellowCards[r.t2.id]||0) + (r.yellowCards2||0)
  S.teamRedCards[r.t1.id] = (S.teamRedCards[r.t1.id]||0) + (r.redCards1||0)
  S.teamRedCards[r.t2.id] = (S.teamRedCards[r.t2.id]||0) + (r.redCards2||0)
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

function eliteGoalkeeperTier(team) {
  const keepers = (team.stars || []).filter(s => s?.pos === 'GK')
  if (keepers.some(s => s.tier === 'generational')) return 'generational'
  if (keepers.some(s => s.tier === 'legendary')) return 'legendary'
  return null
}

// Shootouts are intentionally independent of team rating. Ordinary teams are
// a pure coin flip. Only an elite named goalkeeper changes the odds.
function resolveAggregatePenaltyWinner(t1, t2) {
  const gk1 = eliteGoalkeeperTier(t1)
  const gk2 = eliteGoalkeeperTier(t2)
  let chanceT1 = 0.50
  if (gk1 === 'generational' && gk2 !== 'generational') chanceT1 = 0.80
  else if (gk2 === 'generational' && gk1 !== 'generational') chanceT1 = 0.20
  else if (gk1 === 'legendary' && !gk2) chanceT1 = 0.67
  else if (gk2 === 'legendary' && !gk1) chanceT1 = 0.33
  return Math.random() < chanceT1 ? t1 : t2
}

export function playKnockoutMatch(match) {
  if (match.played) return

  // The historic European Cup is played over two legs. The first leg may
  // finish level. After the second leg, aggregate goal difference decides
  // the tie; an aggregate draw goes straight to penalties (no extra time).
  if (S.era === 'european_cup') {
    const currentRound = (S.knockoutRounds || []).find(r => r.matches?.includes(match))
    const isFinal = currentRound?.name === 'Final'

    // The European Cup final is always a single neutral-site match.
    if (isFinal) {
      const finalResult = simMatch(match.t1, match.t2, false, true)
      match.played = true
      match.result = finalResult
      applyMentalityDelta(finalResult)
      trackMatchStats(finalResult, 'knockout')
      autoSave()
      return finalResult
    }

    if (!match.firstLegResult) {
      const first = simMatch(match.t1, match.t2, true, true)
      first.tieLeg = 1
      first.tieT1 = match.t1
      first.tieT2 = match.t2
      first.aggregate1 = first.g1
      first.aggregate2 = first.g2
      first.aggregateWinner = null
      match.firstLegResult = first
      match.leg = 2
      applyMentalityDelta(first)
      trackMatchStats(first, 'knockout')
      autoSave()
      return first
    }

    const second = simMatch(match.t2, match.t1, true, true)
    const aggregate1 = match.firstLegResult.g1 + second.g2
    const aggregate2 = match.firstLegResult.g2 + second.g1
    const winner = aggregate1 === aggregate2
      ? resolveAggregatePenaltyWinner(match.t1, match.t2)
      : (aggregate1 > aggregate2 ? match.t1 : match.t2)
    const penalties = aggregate1 === aggregate2

    second.tieLeg = 2
    second.tieT1 = match.t1
    second.tieT2 = match.t2
    second.aggregate1 = aggregate1
    second.aggregate2 = aggregate2
    second.aggregateWinner = winner
    second.winner = winner
    second.penalties = penalties
    second.effects = [...(second.effects || []), penalties
      ? `🥅 Aggregate level — ${winner.name} win on penalties!`
      : `🏁 ${winner.name} advance ${aggregate1}–${aggregate2} on aggregate.`]

    match.secondLegResult = second
    match.played = true
    match.leg = 2
    // The bracket continues to show the tie score in the original draw order.
    match.result = {
      ...second,
      t1:match.t1, t2:match.t2,
      g1:aggregate1, g2:aggregate2,
      winner, penalties,
      firstLegResult:match.firstLegResult,
      secondLegResult:second,
      aggregate1, aggregate2,
    }
    applyMentalityDelta(second)
    trackMatchStats(second, 'knockout')
    autoSave()
    return second
  }

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
    newMatches.push({ t1:winners[i], t2:winners[i+1], played:false, result:null, leg:1, firstLegResult:null, secondLegResult:null })
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

  const localFinishByTeam = {}
  Object.values(S.localLeagueResults || {}).forEach(result => {
    ;(result.standings || []).forEach((entry, index) => {
      localFinishByTeam[entry.team.id] = {
        localPosition: index + 1,
        localLeagueId: result.league.id,
        localLeagueName: result.league.name,
      }
    })
  })

  const teamSeasons = S.teams.map(t => {
    const stars = (t.stars && t.stars.length ? t.stars : (t.star ? [t.star] : []))
    const fs = fullStats[t.id] || { w:0, d:0, l:0, gf:0, ga:0 }
    return {
      teamId: t.id,
      teamName: t.name,
      cc: t.cc,
      overall: t.currentOverall || 0,
      reached: S.roundReached[t.id] || (S.era === 'european_cup' ? 'Round of 16' : 'Group'),
      ...(localFinishByTeam[t.id] || {}),
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
      ...(localFinishByTeam[t.id] || {}),
      coach: coach ? { id: coach.id, name: coach.name, tier: coach.tier } : null,
      stars: stars.map(s => ({ id: s.id, name: s.name, pos: s.pos, tier: s.tier })),
    }
  })

  S.history = S.history || []
  S.history.push({
    season: S.season,
    year: currentCalendarYear(),
    era: S.era || 'champions_league',
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
      leagueId: r.league.id,
      league: r.league.name,
      leagueName: r.league.name,
      cc: r.league.cc,
      champion: r.standings?.[0]?.team?.name || r.qualified?.[0]?.name || '—',
      championName: r.standings?.[0]?.team?.name || r.qualified?.[0]?.name || '—',
      championId: r.standings?.[0]?.team?.id || r.qualified?.[0]?.id || null,
      runnerUp: r.standings?.[1]?.team?.name || '—',
      runnerUpName: r.standings?.[1]?.team?.name || '—',
      runnerUpId: r.standings?.[1]?.team?.id || null,
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
      roundReached: S.roundReached[s.teamId] || (S.era === 'european_cup' ? 'Round of 16' : 'Group'),
    })),
  })

  // ── Discard the per-match log now that the season is over ──
  // We've extracted what we need into the season record above. The
  // raw match-by-match data (which can be ~hundreds of KB by mid-
  // tournament) is no longer needed.
  S.allMatchResults = []

  autoSave()
}

// ── Real-world legend arrivals ────────────────────────────────
// These named stars enter close to their historical breakthrough year.
// They use the same rarity caps and three-star squad slots as generated
// players, so they enrich rather than overwhelm the fictional universe.
function ensureHistoricLegendSchedule() {
  S.namedLegendSchedule = S.namedLegendSchedule || {}
  for (const def of HISTORIC_LEGENDS) {
    if (typeof S.namedLegendSchedule[def.key] === 'number') continue
    // The opening 1956 cohort is present immediately. Later arrivals have
    // a subtle ±1-year variation so universes do not unfold identically.
    const jitter = def.year <= 1956 ? 0 : pick([-1,0,0,0,1])
    S.namedLegendSchedule[def.key] = Math.max(1956, def.year + jitter)
  }
}

function historicLegendTeam(def) {
  const teams = S.allTeams || []
  const preferred = (def.preferredTeams || []).map(id => teams.find(t => t.id === id)).filter(Boolean)
  const home = teams.filter(t => t.league === def.league)
  const room = list => list.filter(t => (t.stars || []).length < 3)

  let candidates = room(preferred)
  if (!candidates.length) candidates = room(home)
  if (!candidates.length) {
    // Create the requested home-country slot by retiring a Common player.
    const replacementHosts = [...preferred, ...home].filter((t,i,a) => t && a.findIndex(x => x.id === t.id) === i)
    const host = replacementHosts
      .map(team => ({ team, common:(team.stars || []).find(s => s.tier === 'common') }))
      .filter(x => x.common)
      .sort((a,b) => (b.team.money || 0) - (a.team.money || 0))[0]
    if (host) return { team:host.team, displaced:host.common }
  }
  if (!candidates.length) candidates = room(teams)
  if (!candidates.length) return null

  // Preferred historical clubs are strongly favoured, but the exact club
  // can vary when several sensible destinations exist.
  candidates.sort((a,b) => (b.money || 0) - (a.money || 0) || Math.random() - .5)
  const top = candidates.slice(0, Math.min(3, candidates.length))
  return { team:pick(top), displaced:null }
}

function createHistoricLegend(def, team, currentSeason) {
  const trait = STAR_TRAITS.find(t => t.id === def.trait) || pickStarTrait(def.pos, def.tier)
  const star = {
    id:`legend_${def.key}`,
    legacyKey:def.key,
    name:def.name,
    nationality:def.nationality,
    pos:def.pos,
    tier:def.tier,
    teamId:team.id,
    teamName:team.name,
    cc:team.cc,
    season:currentSeason,
    debutYear:currentCalendarYear(),
    debutAge:21,
    lifespan:def.lifespan || 9,
    goals:0,
    ratings:[],
    wcsPlayed:0,
    fame:0,
    medals:{ gold:0, silver:0, bronze:0 },
    statBonus:{ ...(def.profile || STAT_BONUSES[def.pos]?.[def.tier] || {}) },
    goalDist:GOAL_DIST[def.pos]?.[def.tier] || [1,0,0,0,0],
    saveProb:SAVE_PROB[def.pos]?.[def.tier] || 0,
    trait,
    historicLegend:true,
    realWorldLegend:true,
    lastTransferSeason:currentSeason,
    contract:null,
  }
  star.contract = rollContract(currentSeason, star, team, 82, rand(3,5))
  star.careerMult = computeCareerMult(star, currentSeason)
  return star
}

function injectHistoricLegends(moves, currentSeason) {
  ensureHistoricLegendSchedule()
  S.namedLegendsIntroduced = S.namedLegendsIntroduced || []
  const introduced = new Set(S.namedLegendsIntroduced)
  const year = currentCalendarYear()
  const due = HISTORIC_LEGENDS
    .filter(def => !introduced.has(def.key) && (S.namedLegendSchedule[def.key] || def.year) <= year)
    .sort((a,b) => a.year - b.year)

  for (const def of due) {
    // Real historical stars have priority over generated players at the
    // same rarity. They still obey the global caps: if the rarity is full,
    // the least-established generated player is retired. If every occupied
    // slot already belongs to a named legend, this debut waits.
    const cap = def.tier === 'generational' ? GENERATIONAL_CAP_MAX
      : def.tier === 'legendary' ? LEGENDARY_CAP_MAX
      : def.tier === 'epic' ? STAR_TIER_HARD_MAX.epic
      : def.tier === 'rare' ? STAR_TIER_HARD_MAX.rare
      : null
    if (cap != null && countTierInWorld(def.tier) >= cap) {
      const generated = (S.allTeams || []).flatMap(team => (team.stars || []).map(star => ({ team, star })))
        .filter(x => x.star.tier === def.tier && !x.star.historicLegend)
        .sort((a,b) => ((b.star.season || 1) - (a.star.season || 1)) || ((a.star.fame || 0) - (b.star.fame || 0)))
      const victim = generated[0]
      if (!victim) continue
      victim.team.stars = victim.team.stars.filter(s => s !== victim.star)
      moves.push({
        phase:'retirement', kind:'player', star:victim.star, name:victim.star.name,
        tier:victim.star.tier, pos:victim.star.pos, from:victim.team.name,
        fromId:victim.team.id, fromCC:victim.team.cc,
        reason:'made way for a defining talent of the era',
      })
    }
    const destination = historicLegendTeam(def)
    if (!destination?.team) continue
    const { team, displaced } = destination
    if (displaced) {
      team.stars = team.stars.filter(s => s !== displaced)
      moves.push({
        phase:'retirement', kind:'player', star:displaced, name:displaced.name,
        tier:displaced.tier, pos:displaced.pos, from:team.name, fromId:team.id,
        fromCC:team.cc, reason:'academy slot opened for a historic talent',
      })
    }
    if ((team.stars || []).length >= 3) continue
    const star = createHistoricLegend(def, team, currentSeason)
    team.stars.push(star)
    S.namedLegendsIntroduced.push(def.key)
    introduced.add(def.key)
    moves.push({
      phase:'historic_debut', kind:'player', star, name:star.name, tier:star.tier,
      pos:star.pos, from:'Historic breakthrough', to:team.name, toId:team.id,
      toCC:team.cc, salary:star.contract?.salary, contractYears:star.contract?.yearsTotal,
      debutYear:year,
    })
  }
}

// ── OFFSEASON FLOW (Pass 2) ───────────────────────────────────
// Replaces the old market. Runs in fixed order:
//   1. Retirements (stars + coaches whose lifespan is up)
//   2. Contract resolution (renew or send to free agency)
//   3. Recurring revenue, base payroll, and operating costs
//   4. Rookie/manager generation where a club has a vacancy
//   5. Permanent transfers and free-agent signings
//   6. Named-player and coach salaries
//   7. Treasury-funded team development
//
// Returns { moves } — an ordered timeline used by the Market UI.
export function runMarket() {
  if (!S.allTeams) return { moves: [] }
  const moves = []
  const currentSeason = S.season || 1
  const findTeam = id => S.allTeams.find(t => t.id === id)
  const tierRank = { generational: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 }
  const premiumTiers = new Set(['rare', 'epic'])
  const marqueeTiers = new Set(['legendary', 'generational'])
  const round1 = n => Math.round((Number(n) || 0) * 10) / 10

  S.coaches = S.coaches || []
  S.freeAgents = S.freeAgents || { stars: [], coaches: [] }
  S.transferHistory = S.transferHistory || []
  S.financeHistory = S.financeHistory || []
  S.allTeams.forEach(team => {
    ensureClubFinance(team)
    if (!team.stars) team.stars = []
  })
  ensureContracts()

  const detachPlayer = (star, team, reason = null) => {
    team.stars = (team.stars || []).filter(s => s !== star)
    star.teamId = null
    star.teamName = null
    star.cc = null
    star.contract = null
    if (!S.freeAgents.stars.includes(star)) S.freeAgents.stars.push(star)
    if (reason) moves.push({
      phase: 'expire', kind: 'player', star, name: star.name, tier: star.tier, pos: star.pos,
      from: team.name, fromId: team.id, fromCC: team.cc, to: 'Free agency', reason,
    })
  }

  const detachCoach = (coach, team, reason = null) => {
    S.coaches = S.coaches.filter(c => c !== coach)
    if (team?.coachId === coach.id) team.coachId = null
    coach.teamId = null
    coach.teamName = null
    coach.contract = null
    if (!S.freeAgents.coaches.includes(coach)) S.freeAgents.coaches.push(coach)
    if (reason) moves.push({
      phase: 'expire', kind: 'coach', coach, name: coach.name, tier: coach.tier,
      from: team?.name || '—', fromId: team?.id, fromCC: team?.cc,
      to: 'Free agency', reason,
    })
  }

  // 1) Retirements.
  for (const team of S.allTeams) {
    for (const star of [...(team.stars || [])]) {
      const careerYear = currentSeason - (star.season || 1)
      if (careerYear < (star.lifespan || 10)) continue
      team.stars = team.stars.filter(s => s !== star)
      moves.push({
        phase: 'retirement', kind: 'player', star, name: star.name, tier: star.tier, pos: star.pos,
        from: team.name, fromId: team.id, fromCC: team.cc,
      })
    }
  }
  S.freeAgents.stars = (S.freeAgents.stars || []).filter(star => {
    const retired = currentSeason - (star.season || 1) >= (star.lifespan || 10)
    if (retired) moves.push({ phase:'retirement', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Free agency' })
    return !retired
  })
  for (const coach of [...S.coaches]) {
    if (currentSeason - (coach.season || 1) < (coach.lifespan || 8)) continue
    const team = findTeam(coach.teamId)
    S.coaches = S.coaches.filter(c => c !== coach)
    if (team?.coachId === coach.id) team.coachId = null
    moves.push({ phase:'retirement', kind:'coach', coach, name:coach.name, tier:coach.tier, from:team?.name || coach.teamName, fromId:team?.id, fromCC:team?.cc })
  }
  S.freeAgents.coaches = (S.freeAgents.coaches || []).filter(coach => currentSeason - (coach.season || 1) < (coach.lifespan || 8))

  // 2) Contract decisions. Wages are negotiated dynamically; unhappy
  // players ask for less, but may still choose a new challenge.
  for (const team of S.allTeams) {
    for (const star of [...(team.stars || [])]) {
      if (!star.contract) star.contract = rollContract(currentSeason - 1, star, team, 70)
      star.contract.yearsLeft = Math.max(0, (star.contract.yearsLeft || 0) - 1)
      if (star.contract.yearsLeft > 0) continue
      const happiness = computeHappiness(star, team.id)
      const salary = playerSalaryDemand(star, team, happiness, currentSeason)
      const happyEnough = happiness >= (HAPPINESS_THRESHOLDS[star.tier] || 0)
      const affordable = projectedAnnualSurplus(team, salary, currentSeason) >= -annualIncome(team, currentSeason) * 0.035
      if (happyEnough && affordable) {
        star.contract = rollContract(currentSeason, star, team, happiness)
        moves.push({
          phase:'renew', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos,
          from:team.name, fromId:team.id, fromCC:team.cc,
          to:team.name, toId:team.id, toCC:team.cc,
          contractYears:star.contract.yearsTotal, salary:star.contract.salary, happiness,
        })
      } else {
        detachPlayer(star, team, !happyEnough ? 'wanted a new challenge' : 'club could not match wage demands')
      }
    }
  }
  for (const coach of [...S.coaches]) {
    if (!coach.contract) coach.contract = rollContract(currentSeason - 1, coach, findTeam(coach.teamId), 70)
    coach.contract.yearsLeft = Math.max(0, (coach.contract.yearsLeft || 0) - 1)
    if (coach.contract.yearsLeft > 0) continue
    const team = findTeam(coach.teamId)
    if (!team) { detachCoach(coach, null); continue }
    const happiness = computeHappiness(coach, team.id)
    const salary = coachSalaryDemand(coach, team, happiness, currentSeason)
    const affordable = projectedAnnualSurplus(team, salary, currentSeason) >= -annualIncome(team, currentSeason) * 0.025
    if (happiness >= (HAPPINESS_THRESHOLDS[coach.tier] || 0) && affordable) {
      coach.contract = rollContract(currentSeason, coach, team, happiness)
      moves.push({
        phase:'renew', kind:'coach', coach, name:coach.name, tier:coach.tier,
        from:team.name, fromId:team.id, fromCC:team.cc,
        to:team.name, toId:team.id, toCC:team.cc,
        contractYears:coach.contract.yearsTotal, salary:coach.contract.salary, happiness,
      })
    } else {
      detachCoach(coach, team, happiness < (HAPPINESS_THRESHOLDS[coach.tier] || 0) ? 'wanted a new challenge' : 'club could not match wage demands')
    }
  }

  // 3) Recurring finances: revenue arrives, then the base squad and
  // club operations are paid. Named-star and coach salaries are paid
  // after the market closes so the final roster drives the wage bill.
  for (const team of S.allTeams) {
    const income = annualIncome(team, currentSeason)
    const squad = baseSquadSalary(team, currentSeason)
    const ops = operatingCosts(team, currentSeason)
    addTreasury(team, income)
    moves.push({ phase:'income', kind:'team', teamId:team.id, teamName:team.name, teamCC:team.cc, amount:income, cashAfter:team.treasury })
    addTreasury(team, -squad)
    moves.push({ phase:'base_spend', kind:'team', teamId:team.id, teamName:team.name, teamCC:team.cc, amount:-squad, cashAfter:team.treasury, label:'Base squad salaries' })
    addTreasury(team, -ops)
    moves.push({ phase:'operations', kind:'team', teamId:team.id, teamName:team.name, teamCC:team.cc, amount:-ops, cashAfter:team.treasury })
  }

  // 4) Historic debuts are processed before generic youth generation.
  // This reserves the correct premium-rarity slots for the real-world
  // legends due in the current calendar year instead of letting a random
  // rookie occupy them first.
  injectHistoricLegends(moves, currentSeason)

  // Guarantee every club has a coach and at least one initial star.
  const isOpeningMarket = currentSeason === 1
  for (const team of S.allTeams) {
    if (!(team.stars || []).length) {
      const star = genStar(team)
      if (isOpeningMarket) {
        const startedAgo = rand(0, Math.max(0, (star.lifespan || 10) - 2))
        star.season = 1 - startedAgo
        star.debutAge = 18
        const total = star.contract?.yearsTotal || rand(3, 6)
        star.contract = rollContract(1 - rand(0, total - 1), star, team, 70, total)
        star.contract.yearsLeft = rand(1, total)
      }
      team.stars.push(star)
      moves.push({ phase:'youth', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Youth Academy', to:team.name, toId:team.id, toCC:team.cc, salary:star.contract?.salary })
    }
    if (!team.coachId || !S.coaches.find(c => c.id === team.coachId)) {
      const coach = genCoach(team)
      if (isOpeningMarket) {
        const startedAgo = rand(0, Math.max(0, (coach.lifespan || 8) - 2))
        coach.season = 1 - startedAgo
        const total = coach.contract?.yearsTotal || rand(3, 6)
        coach.contract = rollContract(1 - rand(0, total - 1), coach, team, 70, total)
        coach.contract.yearsLeft = rand(1, total)
      }
      team.coachId = coach.id
      S.coaches.push(coach)
      moves.push({ phase:'youth', kind:'coach', coach, name:coach.name, tier:coach.tier, trait:coach.trait, from:'New manager', to:team.name, toId:team.id, toCC:team.cc, salary:coach.contract?.salary })
    }
  }

  // Expand the complete football world before clubs enter the market:
  // roughly 200 contracted stars and 25 free agents, with 2-3 per club.
  maintainStarPopulation(moves, currentSeason, { opening:isOpeningMarket })

  // Keep at least two Generational players in the active world.
  if (countGenerationalsInWorld() < GENERATIONAL_CAP_MIN) {
    const team = [...S.allTeams].filter(t => (t.stars?.length || 0) < 3).sort((a,b) => annualIncome(b)-annualIncome(a))[0]
    if (team) {
      const star = genStar(team, 'generational')
      team.stars.push(star)
      moves.push({ phase:'youth', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Generational debut', to:team.name, toId:team.id, toCC:team.cc, salary:star.contract?.salary })
    }
  }

  const buyersUsed = new Set()
  const canMove = star => star.lastTransferSeason == null || currentSeason - star.lastTransferSeason >= 2
  const worstStar = team => [...(team.stars || [])].sort((a,b) => (tierRank[a.tier] || 0) - (tierRank[b.tier] || 0))[0] || null

  const executeTransfer = (star, seller, force = false) => {
    if (!star || !seller || !canMove(star)) return false
    const happiness = computeHappiness(star, seller.id)
    const baseFee = playerMarketValue(star, seller, happiness, currentSeason)
    const candidates = []
    for (const buyer of S.allTeams) {
      if (buyer.id === seller.id || buyersUsed.has(buyer.id)) continue
      let displaced = null
      if ((buyer.stars?.length || 0) >= 3) {
        displaced = worstStar(buyer)
        if ((tierRank[star.tier] || 0) <= (tierRank[displaced?.tier] || 0)) continue
      }
      const joiningMood = Math.min(72, Math.max(20, happiness + 24))
      const salary = playerSalaryDemand(star, buyer, joiningMood, currentSeason)
      const feeFlex = force ? 0.94 : 0.98
      const fee = round1(baseFee * (feeFlex + Math.random() * (force ? 0.08 : 0.05)))
      if ((buyer.treasury || 0) < fee + 4) continue
      if (projectedAnnualSurplus(buyer, salary, currentSeason) < -annualIncome(buyer, currentSeason) * 0.045) continue
      const need = (buyer.stars?.length || 0) < 3 ? 2 : Math.max(0, (tierRank[star.tier] || 0) - (tierRank[displaced?.tier] || 0))
      const cashPower = (buyer.treasury || 0) / Math.max(1, annualIncome(buyer, currentSeason))
      const ambition = buyer.financeProfile?.ambition || 1
      const prestige = (buyer.money || 6) * 0.8
      candidates.push({ buyer, displaced, salary, fee, score:need*18 + cashPower*20 + ambition*10 + prestige + Math.random()*12 })
    }
    if (!candidates.length) return false
    candidates.sort((a,b) => b.score - a.score)
    const { buyer, displaced, salary, fee } = candidates[0]

    if (displaced) {
      buyer.stars = buyer.stars.filter(s => s !== displaced)
      displaced.teamId = null
      displaced.teamName = null
      displaced.cc = null
      displaced.contract = null
      displaced.lastTransferSeason = currentSeason
      S.freeAgents.stars.push(displaced)
      moves.push({ phase:'cap_release', kind:'player', star:displaced, name:displaced.name, tier:displaced.tier, pos:displaced.pos, from:buyer.name, fromId:buyer.id, fromCC:buyer.cc, to:'Free agency', reason:'displaced by a major signing' })
    }

    addTreasury(buyer, -fee)
    addTreasury(seller, fee)
    seller.stars = seller.stars.filter(s => s !== star)
    star.previousTeamId = seller.id
    star.teamId = buyer.id
    star.teamName = buyer.name
    star.cc = buyer.cc
    star.lastTransferSeason = currentSeason
    const years = rand(3, 5)
    star.contract = { yearsLeft:years, yearsTotal:years, signedSeason:currentSeason, salary }
    buyer.stars.push(star)
    buyersUsed.add(buyer.id)

    const record = {
      id:`tr_${currentSeason}_${star.id}_${buyer.id}`,
      season:currentSeason,
      year:currentCalendarYear(),
      playerId:star.id, playerName:star.name, pos:star.pos, tier:star.tier,
      age:playerAge(star, currentSeason), fee, salary,
      fromId:seller.id, from:seller.name, fromCC:seller.cc,
      toId:buyer.id, to:buyer.name, toCC:buyer.cc,
      contractYears:years, happiness,
    }
    S.transferHistory.push(record)
    moves.push({ phase:'transfer', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:seller.name, fromId:seller.id, fromCC:seller.cc, to:buyer.name, toId:buyer.id, toCC:buyer.cc, signFee:fee, saleValue:fee, salary, contractYears:years, happiness, displaced:displaced ? { name:displaced.name, tier:displaced.tier } : null })
    return true
  }

  // 5) Transfer market. Every season targets several Rare/Epic moves;
  // every second season targets one Legendary/Generational blockbuster.
  const marketCandidates = () => S.allTeams.flatMap(seller => (seller.stars || []).map(star => ({
    seller, star,
    happiness:computeHappiness(star, seller.id),
    intent:(100 - computeHappiness(star, seller.id)) * 0.55 + (star.contract?.yearsLeft <= 2 ? 18 : 0) + Math.random()*32,
  }))).filter(x => x.star.tier !== 'common' && x.star.contract?.yearsLeft > 0 && canMove(x.star))

  const marqueeTarget = currentSeason % 2 === 0 ? 1 : (Math.random() < 0.08 ? 1 : 0)
  let marqueeDone = 0
  const desiredMarqueeTier = Math.random() < 0.55 ? 'legendary' : 'generational'
  const marqueeCandidates = marketCandidates().filter(x => marqueeTiers.has(x.star.tier)).sort((a,b) => {
    const ap = a.star.tier === desiredMarqueeTier ? 1 : 0
    const bp = b.star.tier === desiredMarqueeTier ? 1 : 0
    return (bp-ap) || b.intent-a.intent
  })
  for (const item of marqueeCandidates) {
    if (marqueeDone >= marqueeTarget) break
    if (executeTransfer(item.star, item.seller, true)) marqueeDone++
  }

  const premiumTarget = rand(3, 4)
  let premiumDone = 0
  const premiumCandidates = marketCandidates().filter(x => premiumTiers.has(x.star.tier)).sort((a,b) => b.intent-a.intent)
  for (const item of premiumCandidates) {
    if (premiumDone >= premiumTarget) break
    if (executeTransfer(item.star, item.seller, premiumDone < 3)) premiumDone++
  }

  // Additional organic moves, mostly unhappy players and short contracts.
  const organic = marketCandidates().filter(x => !marqueeTiers.has(x.star.tier) && !buyersUsed.has(x.seller.id)).sort((a,b) => b.intent-a.intent)
  for (const item of organic) {
    if (item.intent < 62 || Math.random() > 0.22) continue
    executeTransfer(item.star, item.seller, false)
  }

  // 6) Free agents. Clubs may still sign one if they did not already
  // buy a player; the signing bonus is much smaller than a transfer fee.
  const freeAgents = [...(S.freeAgents.stars || [])].sort((a,b) => (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0))
  for (const star of freeAgents) {
    if (!canMove(star)) continue
    const candidates = []
    for (const team of S.allTeams) {
      if (buyersUsed.has(team.id) || (team.stars?.length || 0) >= 3) continue
      const happiness = 48
      const salary = playerSalaryDemand(star, team, happiness, currentSeason)
      const bonus = freeAgentSigningBonus(star, team, happiness, currentSeason)
      if ((team.treasury || 0) < bonus + 3) continue
      if (projectedAnnualSurplus(team, salary, currentSeason) < -annualIncome(team, currentSeason) * 0.035) continue
      candidates.push({ team, salary, bonus, score:(tierRank[star.tier]||0)*12 + (team.money||6) + (team.treasury||0)/25 + Math.random()*8 })
    }
    if (!candidates.length) continue
    candidates.sort((a,b) => b.score-a.score)
    const { team, salary, bonus } = candidates[0]
    addTreasury(team, -bonus)
    star.teamId = team.id
    star.teamName = team.name
    star.cc = team.cc
    const years = rand(2, 5)
    star.contract = { yearsLeft:years, yearsTotal:years, signedSeason:currentSeason, salary }
    star.lastTransferSeason = currentSeason
    team.stars.push(star)
    S.freeAgents.stars = S.freeAgents.stars.filter(s => s !== star)
    buyersUsed.add(team.id)
    moves.push({ phase:'fa_sign', kind:'player', star, name:star.name, tier:star.tier, pos:star.pos, from:'Free agency', to:team.name, toId:team.id, toCC:team.cc, signFee:bonus, salary, contractYears:years })
  }

  // Restore the target world after transfers, releases, and signings.
  maintainStarPopulation(moves, currentSeason, { finalPass:true })

  // 7) Pay named-player and coach salaries from treasury.
  for (const team of S.allTeams) {
    const salary = teamAnnualSalary(team)
    const paid = Math.min(team.treasury || 0, salary)
    addTreasury(team, -paid)
    moves.push({ phase:'salary', kind:'team', teamId:team.id, teamName:team.name, teamCC:team.cc, amount:-paid, scheduled:salary, shortfall:round1(Math.max(0, salary-paid)), cashAfter:team.treasury })
  }

  // 8) Team development. Strength decays gradually, then clubs invest
  // a portion of treasury above their strategic transfer reserve.
  for (const team of S.allTeams) {
    if (!team.seasonStats) continue
    const s = team.seasonStats
    const decayFor = value => Math.max(0, Math.round(Math.max(0, value - 60) * ECON.decayCoef) + rand(-ECON.decayWiggle, ECON.decayWiggle))
    team.seasonStats = {
      attack:Math.max(50, s.attack-decayFor(s.attack)),
      defense:Math.max(50, s.defense-decayFor(s.defense)),
      stamina:Math.max(50, s.stamina-decayFor(s.stamina)),
      mental:60,
      setPieces:Math.max(50, s.setPieces-decayFor(s.setPieces)),
    }
  }

  for (const team of S.allTeams) {
    if (!team.seasonStats) continue
    const income = annualIncome(team, currentSeason)
    const premiumCount = (team.stars || []).filter(s => ['rare','epic','legendary','generational'].includes(s.tier)).length
    const reserve = Math.max(18, income * (premiumCount < 2 ? 0.28 : 0.14))
    const excess = Math.max(0, (team.treasury || 0) - reserve)
    if (excess < 10) continue
    let spend = excess * (ECON.investMin + Math.random() * (ECON.investMax - ECON.investMin))
    if ((team.treasury || 0) > income * 0.48) spend += (team.treasury - income * 0.48) * 0.72
    spend = round1(Math.min(125, Math.max(10, spend), team.treasury || 0))
    if (spend <= 0) continue
    addTreasury(team, -spend)
    const statKeys = ['attack','defense','stamina','setPieces']
    const points = Math.max(1, Math.round(spend / ECON.investmentPointCost))
    for (let i=0; i<points; i++) {
      const ordered = [...statKeys].sort((a,b) => team.seasonStats[a]-team.seasonStats[b] || Math.random()-0.5)
      const key = ordered[Math.random() < 0.7 ? 0 : rand(0, ordered.length-1)]
      team.seasonStats[key] = Math.min(92, team.seasonStats[key] + 1)
    }
    moves.push({ phase:'invest', kind:'team', teamId:team.id, teamName:team.name, teamCC:team.cc, amount:-spend, cashAfter:team.treasury, points, newOverall:Math.round((team.seasonStats.attack+team.seasonStats.defense+team.seasonStats.stamina+team.seasonStats.mental+team.seasonStats.setPieces)/5) })
  }

  for (const team of S.allTeams) {
    if (team.seasonStats) {
      const s = team.seasonStats
      team.currentOverall = Math.round((s.attack+s.defense+s.stamina+s.mental+s.setPieces)/5)
    }
    team.cashOnHand = round1(team.treasury || 0)
  }

  const seasonTransfers = moves.filter(m => m.phase === 'transfer')
  const seasonInvestments = moves.filter(m => m.phase === 'invest')
  S.financeHistory = S.financeHistory.filter(x => x.season !== currentSeason)
  S.financeHistory.push({
    season:currentSeason,
    year:currentCalendarYear(),
    clubs:S.allTeams.map(team => {
      const snap = financeSnapshot(team, currentSeason)
      return {
        teamId:team.id, teamName:team.name, teamCC:team.cc, ...snap,
        transferSpend:round1(seasonTransfers.filter(m => m.toId === team.id).reduce((sum,m) => sum+(m.signFee||0),0)),
        transferSales:round1(seasonTransfers.filter(m => m.fromId === team.id).reduce((sum,m) => sum+(m.signFee||0),0)),
        investment:round1(-seasonInvestments.filter(m => m.teamId === team.id).reduce((sum,m) => sum+(m.amount||0),0)),
      }
    }),
  })

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
  S.year = currentCalendarYear() + 1
  S.phase = 'idle'
  S.champion = null
  S.groups = []
  S.groupMatches = []
  S.knockoutRounds = []
  S.scorers = {}
  S.teamGoals = {}
  S.teamGoalsConceded = {}
  S.teamShots = {}
  S.teamShotsOnTarget = {}
  S.teamXG = {}
  S.teamYellowCards = {}
  S.teamRedCards = {}
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

import { S } from '../store.js'

const REVENUE_BY_MONEY = {
  5: 118, 6: 142, 7: 172, 8: 210, 9: 252, 10: 302,
  11: 350, 12: 402, 13: 448, 14: 486, 15: 522, 16: 552,
  17: 580, 18: 606,
}

export const PLAYER_BASE_SALARY = {
  generational: 24.0,
  legendary: 17.0,
  epic: 11.0,
  rare: 7.0,
  uncommon: 4.0,
  common: 2.1,
}

export const COACH_BASE_SALARY = {
  generational: 13.0,
  legendary: 10.0,
  epic: 7.0,
  rare: 4.6,
  uncommon: 3.0,
  common: 2.0,
}

export const PLAYER_BASE_VALUE = {
  generational: 225,
  legendary: 172,
  epic: 135,
  rare: 90,
  uncommon: 34,
  common: 14,
}

const round1 = n => Math.round((Number(n) || 0) * 10) / 10
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

function hash01(input) {
  let h = 2166136261
  const s = String(input)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function seasonNoise(teamId, season, key = 'revenue') {
  return 0.965 + hash01(`${teamId}:${season}:${key}`) * 0.07
}

function recentPerformanceFactor(team) {
  const last = (S.history || [])[S.history?.length - 1]
  if (!last) return 0
  const reached = last.roundReached?.[team.id]
  const bonus = {
    Winner: 0.045,
    Final: 0.035,
    'Semi-finals': 0.025,
    'Quarter-finals': 0.016,
    'Round of 16': 0.008,
  }[reached] || 0
  const local = (last.localChampions || []).some(x => (x.championId || x.teamId) === team.id) ? 0.01 : 0
  return Math.min(0.05, bonus + local)
}

export function ensureClubFinance(team) {
  if (!team) return team
  if (!team.financeProfile) {
    team.financeProfile = {
      presidentFactor: round1((0.955 + hash01(`${team.id}:president`) * 0.09) * 1000) / 1000,
      wageFactor: round1((0.95 + hash01(`${team.id}:wages`) * 0.10) * 1000) / 1000,
      ambition: round1((0.88 + hash01(`${team.id}:ambition`) * 0.24) * 1000) / 1000,
    }
  }
  if (typeof team.treasury !== 'number') {
    // Migrate the previous miniature economy (where 25 was a huge balance)
    // into the realistic-million scale. Fresh worlds begin at zero and build
    // their first transfer budget from recurring revenue.
    const legacy = typeof team.cashOnHand === 'number' ? team.cashOnHand : 0
    team.treasury = legacy > 0 ? round1(legacy * 8) : 0
  }
  team.cashOnHand = round1(team.treasury)
  return team
}

export function effectiveMoney(team) {
  const base = team?.money || 6
  const gmBonus = team?.gm?.moneyBonus || 0
  return clamp(base + gmBonus, 5, 18)
}

export function annualIncome(team, season = S.season || 1) {
  ensureClubFinance(team)
  const base = REVENUE_BY_MONEY[clamp(team.money || 6, 5, 18)] || 142
  const president = team.financeProfile?.presidentFactor || 1
  // GM income bonuses remain meaningful but no longer add literal millions.
  const gm = 1 + (team.gm?.moneyBonus || 0) * 0.008
  const performance = 1 + recentPerformanceFactor(team)
  return round1(base * president * gm * performance * seasonNoise(team.id, season, 'revenue'))
}

export function baseSquadSalary(team, season = S.season || 1) {
  ensureClubFinance(team)
  const revenue = annualIncome(team, season)
  const tier = clamp(team.money || 6, 5, 18)
  // Elite squads consume a greater share of income even before named stars.
  const ratio = 0.535 + (tier - 5) * 0.0072
  const noise = 0.975 + hash01(`${team.id}:${season}:squad-wages`) * 0.05
  return round1(revenue * ratio * (team.financeProfile?.wageFactor || 1) * noise)
}

export function operatingCosts(team, season = S.season || 1) {
  const revenue = annualIncome(team, season)
  const scale = 0.09 + clamp((team.money || 6) - 5, 0, 13) * 0.0015
  return round1(revenue * scale + 4)
}

// Compatibility name used by older UI code. It now represents all recurring
// non-star costs: base squad wages plus club operations.
export function baseSpend(team, season = S.season || 1) {
  return round1(baseSquadSalary(team, season) + operatingCosts(team, season))
}

export function playerAge(star, season = S.season || 1) {
  if (!star) return 18
  if (typeof star.age === 'number') return star.age
  const debutAge = typeof star.debutAge === 'number' ? star.debutAge : 18
  return Math.max(17, debutAge + season - (star.season || season))
}

function ageSalaryFactor(age) {
  if (age <= 20) return 0.74
  if (age <= 23) return 0.90
  if (age <= 29) return 1.05
  if (age <= 31) return 0.91
  return 0.73
}

function ageValueFactor(age) {
  if (age <= 19) return 0.80
  if (age <= 22) return 0.93
  if (age <= 27) return 1.05
  if (age <= 30) return 0.94
  if (age === 31) return 0.78
  return 0.62
}

function contractValueFactor(years) {
  if (years <= 1) return 0.62
  if (years === 2) return 0.78
  if (years === 3) return 0.95
  if (years === 4) return 1.06
  return 1.14
}

function clubPriceFactor(team) {
  if (!team) return 0.90
  return clamp(0.90 + ((team.money || 6) - 5) * 0.021, 0.90, 1.18)
}

export function playerSalaryDemand(star, team, happiness = 70, season = S.season || 1) {
  if (!star) return 0
  const base = PLAYER_BASE_SALARY[star.tier] || PLAYER_BASE_SALARY.common
  const age = playerAge(star, season)
  const club = clamp(0.94 + ((team?.money || 6) - 5) * 0.009, 0.94, 1.07)
  // Very unhappy players accept less to escape; happy stars demand a premium.
  const mood = 0.72 + clamp(happiness, 0, 100) * 0.0036
  const noise = 0.95 + hash01(`${star.id}:${season}:${team?.id || 'fa'}:salary`) * 0.10
  return round1(base * ageSalaryFactor(age) * club * mood * noise)
}

export function coachSalaryDemand(coach, team, happiness = 70, season = S.season || 1) {
  if (!coach) return 0
  const base = COACH_BASE_SALARY[coach.tier] || COACH_BASE_SALARY.common
  const mood = 0.80 + clamp(happiness, 0, 100) * 0.0028
  const club = clamp(0.95 + ((team?.money || 6) - 5) * 0.007, 0.95, 1.05)
  const noise = 0.96 + hash01(`${coach.id}:${season}:${team?.id || 'fa'}:coach-salary`) * 0.08
  return round1(base * mood * club * noise)
}

export function playerMarketValue(star, seller, happiness = 70, season = S.season || 1) {
  if (!star) return 0
  const base = PLAYER_BASE_VALUE[star.tier] || PLAYER_BASE_VALUE.common
  const years = star.contract?.yearsLeft ?? 1
  const age = playerAge(star, season)
  const mood = 0.78 + clamp(happiness, 0, 100) * 0.0022
  const fame = 1 + Math.min(0.10, (star.fame || 0) / 50000)
  const noise = 0.95 + hash01(`${star.id}:${season}:${seller?.id || 'fa'}:value`) * 0.10
  const raw = base * clubPriceFactor(seller) * ageValueFactor(age) * contractValueFactor(years) * mood * fame * noise
  // A distressed veteran or expiring contract can still become a bargain,
  // while prime stars at elite clubs sit in recognizable market bands.
  const bands = {
    common:[4, 24], uncommon:[12, 48], rare:[34, 88], epic:[55, 118],
    legendary:[78, 152], generational:[106, 164],
  }
  const [lo, hi] = bands[star.tier] || [4, 178]
  return round1(clamp(raw, lo, hi))
}

export function freeAgentSigningBonus(star, team, happiness = 60, season = S.season || 1) {
  const notional = playerMarketValue(star, team, happiness, season)
  return round1(Math.max(1.5, notional * 0.11))
}

export function playerSalary(star) {
  if (!star?.contract || star.contract.yearsLeft <= 0) return 0
  return round1(star.contract.salary ?? PLAYER_BASE_SALARY[star.tier] ?? 0)
}

export function coachSalary(coach) {
  if (!coach?.contract || coach.contract.yearsLeft <= 0) return 0
  return round1(coach.contract.salary ?? COACH_BASE_SALARY[coach.tier] ?? 0)
}

export function teamStarSalary(team) {
  return round1((team?.stars || []).reduce((sum, star) => sum + playerSalary(star), 0))
}

export function teamCoachSalary(team) {
  const coach = (S.coaches || []).find(c => c.teamId === team?.id)
  return round1(coachSalary(coach))
}

export function teamAnnualSalary(team) {
  return round1(teamStarSalary(team) + teamCoachSalary(team))
}

export function projectedAnnualSurplus(team, extraSalary = 0, season = S.season || 1) {
  return round1(annualIncome(team, season) - baseSpend(team, season) - teamAnnualSalary(team) - extraSalary)
}

export function financeSnapshot(team, season = S.season || 1) {
  ensureClubFinance(team)
  const income = annualIncome(team, season)
  const baseSquad = baseSquadSalary(team, season)
  const operations = operatingCosts(team, season)
  const stars = teamStarSalary(team)
  const coach = teamCoachSalary(team)
  return {
    season,
    income,
    baseSquad,
    operations,
    starSalary: stars,
    coachSalary: coach,
    wageBill: round1(baseSquad + stars + coach),
    projectedSurplus: round1(income - baseSquad - operations - stars - coach),
    treasury: round1(team.treasury || 0),
  }
}

export function addTreasury(team, amount) {
  ensureClubFinance(team)
  team.treasury = round1(Math.max(0, (team.treasury || 0) + amount))
  team.cashOnHand = team.treasury
  return team.treasury
}

export function setTreasury(team, amount) {
  ensureClubFinance(team)
  team.treasury = round1(Math.max(0, amount))
  team.cashOnHand = team.treasury
  return team.treasury
}

export function money(n) {
  return `$${round1(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
}

// ── Match Engine v4 ──────────────────────────────────────────
// Pipeline: Ratings → Stats → Goals → Normalize.
//
//   1. Effective ratings (base + star bonuses + coach bonuses
//      + tournament mentality delta + active traits).
//   2. Match stats — shots, possession, corners — computed in
//      two phases: first 60' and last 30'. Stat-side traits add
//      to / subtract from these. Stamina shapes the last 30.
//   3. Raw goals — shot-conversion + possession bonus + corner
//      conversion. Conversion-side traits change the formulas.
//   4. Star/coach goal effects (extras, defensive caps, saves).
//   5. Normalize raw goals into a real-feeling scoreline,
//      preserving the winner.
//   6. Attribute goals to stars (weighted by tier and trait fit).
//   7. Build timeline, tranches, mentality changes, ratings.
//
// The simMatch return shape stays compatible with what the UI
// reads (g1, g2, shots, possession, corners, timeline, tranches,
// effects, starRatings, mentalityChanges).

export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const pick = arr => arr[Math.floor(Math.random() * arr.length)]
export const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]} return b }
export const gaussRand = (sig=1) => {
  let u=0,v=0
  while(!u) u=Math.random()
  while(!v) v=Math.random()
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*sig
}
export const ovr = s => s ? Math.round((s.attack+s.defense+s.stamina+s.mental+s.setPieces)/5) : 0

// ── Helpers: trait lookup on stars ───────────────────────────
function teamHasStarTrait(stars, id) {
  return stars.some(s => s?.trait?.id === id)
}
function findStarTraitTier(stars, id) {
  const s = stars.find(x => x?.trait?.id === id)
  return s ? s.tier : null
}

// ── Effective stats: base + star bonuses + coach bonuses ─────
//
// `opts.nullifyStarId` — when set, the named star (on the same
// team) has their stat bonuses ignored. Used by the Nullifier
// trait, which marks an opposing star out of the game.
export function getEffStats(team, isKO = false, opts = {}) {
  let s = team.stats
    ? { ...team.stats }
    : { attack:75, defense:75, stamina:75, mental:75, setPieces:75 }

  const stars = team.stars && team.stars.length ? team.stars : (team.star ? [team.star] : [])
  // Youth Whisperer coach: non-legendary players get +2 to non-zero stat lines.
  const youth = team.coach?.trait?.id === 'youth_whisperer'
  for (const star of stars) {
    if (!star?.statBonus) continue
    if (opts.nullifyStarId && star.id === opts.nullifyStarId) continue
    const fx = star.statBonus
    const youthBoost = (youth && star.tier !== 'legendary') ? 2 : 0
    const add = (k) => fx[k] ? (fx[k] + youthBoost) : 0
    s.attack    = clamp(s.attack    + add('attack'),    10, 130)
    s.defense   = clamp(s.defense   + add('defense'),   10, 130)
    s.stamina   = clamp(s.stamina   + add('stamina'),   10, 130)
    s.mental    = clamp(s.mental    + add('mental'),    10, 130)
    s.setPieces = clamp(s.setPieces + add('setPieces'), 10, 130)
  }

  if (team.coach?.statBonus) {
    const fx = team.coach.statBonus
    s.attack    = clamp(s.attack    + (fx.attack    || 0), 10, 130)
    s.defense   = clamp(s.defense   + (fx.defense   || 0), 10, 130)
    s.stamina   = clamp(s.stamina   + (fx.stamina   || 0), 10, 130)
    s.mental    = clamp(s.mental    + (fx.mental    || 0), 10, 130)
    s.setPieces = clamp(s.setPieces + (fx.setPieces || 0), 10, 130)
  }

  // Big-Match Player coach trait: +5 to all in knockout.
  if (team.coach?.trait?.id === 'big_match' && isKO) {
    s.attack    = clamp(s.attack    + 5, 10, 130)
    s.defense   = clamp(s.defense   + 5, 10, 130)
    s.stamina   = clamp(s.stamina   + 5, 10, 130)
    s.mental    = clamp(s.mental    + 5, 10, 130)
    s.setPieces = clamp(s.setPieces + 5, 10, 130)
  }

  // Tournament mentality delta — building confidence from wins.
  // Full delta on mental, smaller nudge on attack/defense.
  const md = team.mentalityDelta || 0
  if (md !== 0) {
    s.mental  = clamp(s.mental  + md,        10, 130)
    s.attack  = clamp(s.attack  + md * 0.4,  10, 130)
    s.defense = clamp(s.defense + md * 0.4,  10, 130)
  }

  return s
}

// ── Goal-minute helper ──────────────────────────────────────
// High stamina → late goals, low stamina → early goals.
function pickGoalMinute(stamina) {
  const s = clamp(stamina, 40, 110)
  const shift = ((s - 75) / 35) * 15
  const center = 45 + shift
  const m = Math.round(center + gaussRand(18))
  return clamp(m, 1, 90)
}

// ── Compute shots / possession / corners for a team ──────────
// Returns full-match totals plus internal phase numbers for goal
// attribution. Shots and corners are integer counts; possession
// share is a 0..1 fraction (re-normalized later for display).
function computeMatchStats(myEff, oppEff, myStars, oppStars, myCoachTraitId, oppCoachTraitId) {
  // ── Phase 1: first 60 minutes ────────────────────────────
  // Shots: ~9 base. Use a damped (signed-sqrt) differential so a
  // 20-point gap doesn't murder the underdog's shot count. Mental
  // diff (now ~0 at start of season) gives a small relative nudge.
  const dampDiff = (gap) => Math.sign(gap) * Math.sqrt(Math.abs(gap)) * 1.1
  let shots60 = 9 + dampDiff(myEff.attack - oppEff.defense) + (myEff.mental - oppEff.mental) * 0.04
  shots60 += gaussRand(2.5)
  const goalMentTier = findStarTraitTier(myStars, 'goal_mentality')
  if (goalMentTier === 'legendary') shots60 += 5 + Math.random() * 1.5
  if (goalMentTier === 'epic')      shots60 += 3 + Math.random() * 1.5
  const oppKickTier = findStarTraitTier(oppStars, 'kick_it_far')
  if (oppKickTier === 'legendary') shots60 -= 5 + Math.random() * 1.5
  if (oppKickTier === 'epic')      shots60 -= 3 + Math.random() * 1.5
  if (myCoachTraitId === 'gegenpress')   shots60 += 5
  if (oppCoachTraitId === 'gegenpress')  shots60 -= 3
  if (myCoachTraitId === 'high_press')   shots60 += 3
  if (oppCoachTraitId === 'high_press')  shots60 -= 2
  if (oppCoachTraitId === 'park_the_bus') shots60 -= 4
  shots60 = clamp(shots60, 2, 20)

  // Possession share. Damped diffs again so blowout possession
  // is reserved for matchup + trait combos, not raw rating gaps.
  let possShare60 = 0.5 +
    (dampDiff(myEff.attack - oppEff.attack) * 0.012 + dampDiff(myEff.mental - oppEff.mental) * 0.012) +
    gaussRand(0.04)
  const tempoTier = findStarTraitTier(myStars, 'control_tempo')
  if (tempoTier === 'legendary') possShare60 += 0.12
  if (tempoTier === 'epic')      possShare60 += 0.06
  const oppTempoTier = findStarTraitTier(oppStars, 'control_tempo')
  if (oppTempoTier === 'legendary') possShare60 -= 0.12
  if (oppTempoTier === 'epic')      possShare60 -= 0.06
  if (myCoachTraitId === 'tiki_taka')  possShare60 += 0.12
  if (oppCoachTraitId === 'tiki_taka') possShare60 -= 0.12
  if (myCoachTraitId === 'park_the_bus' && possShare60 > 0.45) possShare60 = 0.45
  possShare60 = clamp(possShare60, 0.30, 0.70)

  // Corners (first 60'): driven by attack diff + setPieces.
  let corners60 = 4 +
    dampDiff(myEff.attack - oppEff.defense) * 0.55 +
    (myEff.setPieces - 70) * 0.04
  corners60 += gaussRand(1)
  const lookCornerTier = findStarTraitTier(myStars, 'look_for_corner')
  if (lookCornerTier === 'legendary') corners60 += 5 + Math.random()
  if (lookCornerTier === 'epic')      corners60 += 3 + Math.random()
  const oppAerialTier = findStarTraitTier(oppStars, 'aerial_wall')
  if (oppAerialTier === 'legendary') corners60 -= 4 + Math.random()
  if (oppAerialTier === 'epic')      corners60 -= 2 + Math.random()
  if (myCoachTraitId === 'set_piece_specialist') corners60 += 3
  corners60 = clamp(corners60, 0, 14)

  // ── Phase 2: last 30 minutes ─────────────────────────────
  const myStaminaEff = teamHasStarTrait(myStars, 'engine')
    ? myEff.stamina + 30
    : myEff.stamina
  const staminaDiff = myStaminaEff - oppEff.stamina

  let shots30 = (shots60 / 2) + dampDiff(staminaDiff) * 0.7 + gaussRand(1)
  if (oppCoachTraitId === 'high_press') shots30 += 1
  shots30 = clamp(shots30, 1, 12)

  const staminaPull = clamp(staminaDiff / 100, -0.20, 0.20)
  let possShare30 = clamp(0.5 + (possShare60 - 0.5) * 0.6 + staminaPull, 0.30, 0.70)
  if (myCoachTraitId === 'tiki_taka')  possShare30 += 0.06
  if (oppCoachTraitId === 'tiki_taka') possShare30 -= 0.06
  possShare30 = clamp(possShare30, 0.30, 0.70)

  let corners30 = (corners60 / 2) + dampDiff(staminaDiff) * 0.18 + gaussRand(0.7)
  corners30 = clamp(corners30, 0, 10)

  const totalShots   = Math.round(shots60 + shots30)
  const totalCorners = Math.round(corners60 + corners30)
  const finalShare   = clamp(possShare60 * 0.67 + possShare30 * 0.33, 0.25, 0.75)

  return {
    shots: totalShots,
    corners: totalCorners,
    possessionShare: finalShare,
    shots60: Math.round(shots60), shots30: Math.round(shots30),
    corners60: Math.round(corners60), corners30: Math.round(corners30),
    possShare60, possShare30,
    myStaminaEff,
  }
}

// ── Convert match stats to raw goals ─────────────────────────
function statsToGoals(myStats, myEff, myStars, oppStars, possessionPct, myCoachTraitId, oppCoachTraitId) {
  // 1. Shot conversion. Baseline 0..20% (mean ~10%).
  // We pull from a distribution skewed toward the middle so the
  // typical match doesn't get extreme luck, but variance stays high
  // enough that even matches occasionally produce 4-1 results.
  let convMin = 0, convMax = 0.25
  const preciseTier = findStarTraitTier(myStars, 'precise_shooting')
  if (preciseTier === 'legendary') { convMin = 0.20; convMax = 0.50 }
  else if (preciseTier === 'epic') { convMin = 0.10; convMax = 0.40 }
  // setPieces contributes a small uplift to the high end.
  convMax += clamp((myEff.setPieces - 70) / 800, -0.02, 0.04)

  const lastDitchTier = findStarTraitTier(oppStars, 'last_ditch')
  if (lastDitchTier === 'legendary') convMax = Math.min(convMax, 0.10)
  if (lastDitchTier === 'epic')      convMax = Math.min(convMax, 0.15)

  // Use a uniform distribution over the conversion range to give
  // the match plenty of variance — sometimes the mega-attack team
  // converts 5%, sometimes 35%. This prevents every blowout from
  // hitting the normalization cap.
  const conv = convMin + Math.random() * (convMax - convMin)
  let shotGoals = myStats.shots * conv

  const catlikeTier = findStarTraitTier(oppStars, 'catlike_reflexes')
  if (catlikeTier === 'legendary' || catlikeTier === 'epic') {
    const p = catlikeTier === 'legendary' ? 0.10 : 0.06
    let saved = 0
    for (let i = 0; i < Math.round(shotGoals); i++) if (Math.random() < p) saved++
    shotGoals = Math.max(0, shotGoals - saved)
  }
  shotGoals = Math.max(0, shotGoals)

  // 2. Possession bonus.
  let possGoals = 0
  if      (possessionPct >= 65) possGoals = 2
  else if (possessionPct >= 55) possGoals = 1
  if (teamHasStarTrait(myStars, 'useful_possession')) possGoals *= 2
  if (myCoachTraitId === 'counter_attack' && possessionPct < 50) possGoals += 2

  // 3. Corner conversion. Baseline 5%, scaled by setPieces gap.
  const setPiecesGap = myEff.setPieces - 70
  let cornerConv = clamp(0.05 + setPiecesGap * 0.0015, 0.01, 0.15)
  let cornerGoals = myStats.corners * cornerConv
  if (myCoachTraitId === 'set_piece_specialist') cornerGoals *= 2
  if (teamHasStarTrait(myStars, 'dead_ball_specialist')) cornerGoals *= 2

  return {
    rawGoals: shotGoals + possGoals + cornerGoals,
    breakdown: { shotGoals, possGoals, cornerGoals, shotConv: conv },
  }
}

// ── Star/coach goal-roll effects ─────────────────────────────
// Per-star goal-distribution rolls (moments of brilliance).
function applyStarOffense(star, coachTraitId) {
  if (!star || !['FWD','MID'].includes(star.pos)) return 0
  const dist = star.goalDist || [1,0,0,0,0]
  const r = Math.random()
  let acc = 0
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i]
    if (r < acc) return i
  }
  return 0
}

function applyStarDefense(star, oppG) {
  if (!star || !['GK','DEF'].includes(star.pos)) return 0
  const p = star.saveProb || 0
  let saved = 0
  for (let i = 0; i < oppG; i++) if (Math.random() < p) saved++
  return saved
}

function applyCoachOffense(coach) {
  if (!coach?.trait) return { goals: 0, label: null }
  if (coach.trait.id === 'man_motivator' && Math.random() < 0.40) {
    return { goals: 1, label: 'tactical masterclass' }
  }
  return { goals: 0, label: null }
}

// ── Normalization ────────────────────────────────────────────
// G_norm = round(0.65 * (G - 1)), capped at 7. The slightly lower
// coefficient (vs 0.7) plus a small additional dampening above
// raw=10 keeps blowouts in the 5-1 / 6-0 range rather than always
// hitting the 7 cap.
//   raw 0 → 0,  raw 1 → 1, raw 2 → 1, raw 3 → 1, raw 4 → 2,
//   raw 5 → 3, raw 6 → 3, raw 7 → 4, raw 8 → 5, raw 9 → 5,
//   raw 10 → 6, raw 11 → 6, raw 12 → 7, raw 13+ → 7.
function normalizeGoals(raw) {
  if (raw <= 1) return raw
  if (raw >= 11) return Math.min(7, Math.round(0.55 * (raw - 1)))
  return Math.min(Math.round(0.65 * (raw - 1)), 7)
}
function preserveWinner(rawA, rawB, normA, normB) {
  if (rawA > rawB) {
    if (normA <= normB) normA = Math.min(7, normB + 1)
  } else if (rawB > rawA) {
    if (normB <= normA) normB = Math.min(7, normA + 1)
  } else {
    if (normA !== normB) normB = normA
  }
  return [normA, normB]
}

// ── Star goal attribution ────────────────────────────────────
// Distribute the team's final goals among its stars, weighted by
// trait fit + position + tier. Goals not assigned to a star are
// labelled with the team name.
function attributeGoals(team, totalGoals, breakdown) {
  const result = new Map()
  if (totalGoals <= 0) return result
  const stars = team.stars && team.stars.length ? team.stars : (team.star ? [team.star] : [])
  if (!stars.length) return result

  // Build the queue of "kinds" of goal (shot/poss/corner) using the
  // breakdown proportions from statsToGoals.
  const breakdownTotal = breakdown.shotGoals + breakdown.possGoals + breakdown.cornerGoals
  const kinds = []
  if (breakdownTotal > 0) {
    const pShot   = breakdown.shotGoals   / breakdownTotal
    const pPoss   = breakdown.possGoals   / breakdownTotal
    for (let i = 0; i < totalGoals; i++) {
      const r = Math.random()
      if      (r < pShot)         kinds.push('shot')
      else if (r < pShot + pPoss) kinds.push('poss')
      else                         kinds.push('corner')
    }
  } else {
    for (let i = 0; i < totalGoals; i++) kinds.push('shot')
  }

  const tierWeight = { legendary:5, epic:4, rare:3, uncommon:2, common:1 }
  function scoreFor(star, kind) {
    let score = 0
    if (kind === 'shot') {
      if      (star.pos === 'FWD') score += 6
      else if (star.pos === 'MID') score += 3
      else                         score += 0.5
    } else if (kind === 'poss') {
      if      (star.pos === 'MID') score += 5
      else if (star.pos === 'FWD') score += 4
      else                         score += 1
    } else { // corner
      if      (star.pos === 'FWD') score += 4
      else if (star.pos === 'MID') score += 3
      else if (star.pos === 'DEF') score += 4   // headers from set pieces
      else                         score += 0.5
    }
    score += tierWeight[star.tier] || 1
    const tid = star.trait?.id
    if (tid === 'precise_shooting'      && kind === 'shot')   score += 6
    if (tid === 'penalty_box_predator')                       score += 2
    if (tid === 'useful_possession'     && kind === 'poss')   score += 5
    if (tid === 'dead_ball_specialist'  && kind === 'corner') score += 6
    if (tid === 'goal_mentality'        && kind === 'shot')   score += 2
    if (tid === 'look_for_corner'       && kind === 'corner') score += 3
    return score
  }

  // Penalty Box Predator: gets the FIRST goal of the match (we'll
  // enforce the minute later; here just claim one slot).
  const predator = stars.find(s => s.trait?.id === 'penalty_box_predator')
  if (predator && kinds.length > 0) {
    result.set(predator, 1)
    kinds.shift()
  }

  for (const kind of kinds) {
    const scores = stars.map(s => scoreFor(s, kind))
    const sum = scores.reduce((a,b) => a+b, 0)
    if (sum <= 0) continue
    let r = Math.random() * sum
    let chosen = stars[0]
    for (let i = 0; i < stars.length; i++) {
      r -= scores[i]
      if (r <= 0) { chosen = stars[i]; break }
    }
    // Soft cap so one star doesn't claim every goal in a 5-goal match.
    const cap = (chosen.pos === 'FWD' && chosen.tier === 'legendary') ? 5 : 3
    if ((result.get(chosen) || 0) >= cap) continue
    result.set(chosen, (result.get(chosen) || 0) + 1)
  }

  return result
}

// ── Main simulator ────────────────────────────────────────────
export function simMatch(t1, t2, allowDraw = true, isKO = false) {
  const t1Trait = t1.coach?.trait?.id || null
  const t2Trait = t2.coach?.trait?.id || null

  const stars1 = t1.stars && t1.stars.length ? t1.stars : (t1.star ? [t1.star] : [])
  const stars2 = t2.stars && t2.stars.length ? t2.stars : (t2.star ? [t2.star] : [])

  // Nullifier resolution — pick the opponent's best attacking star.
  const orderTier = ['legendary','epic','rare','uncommon','common']
  const bestAttacker = stars => {
    const cand = stars.filter(s => ['FWD','MID'].includes(s.pos))
    if (!cand.length) return null
    return [...cand].sort((a,b) => orderTier.indexOf(a.tier) - orderTier.indexOf(b.tier))[0]
  }
  const nullifiedFor1 = stars1.some(s => s.trait?.id === 'nullify') ? bestAttacker(stars2)?.id : null
  const nullifiedFor2 = stars2.some(s => s.trait?.id === 'nullify') ? bestAttacker(stars1)?.id : null

  const e1 = getEffStats(t1, isKO, { nullifyStarId: nullifiedFor2 })
  const e2 = getEffStats(t2, isKO, { nullifyStarId: nullifiedFor1 })

  const effects = []
  if (nullifiedFor1) {
    const star = stars2.find(s => s.id === nullifiedFor1)
    if (star) effects.push(`⛓ ${t1.name}'s defender nullifies ${star.name}!`)
  }
  if (nullifiedFor2) {
    const star = stars1.find(s => s.id === nullifiedFor2)
    if (star) effects.push(`⛓ ${t2.name}'s defender nullifies ${star.name}!`)
  }

  // Stage 1 — match stats.
  const m1 = computeMatchStats(e1, e2, stars1, stars2, t1Trait, t2Trait)
  const m2 = computeMatchStats(e2, e1, stars2, stars1, t2Trait, t1Trait)
  const totalShare = m1.possessionShare + m2.possessionShare
  const possession1 = clamp(Math.round(m1.possessionShare / totalShare * 100), 25, 75)
  const possession2 = 100 - possession1
  const shots1 = m1.shots, shots2 = m2.shots
  const corners1 = m1.corners, corners2 = m2.corners

  // Stage 2 — convert stats to raw goals.
  const conv1 = statsToGoals(m1, e1, stars1, stars2, possession1, t1Trait, t2Trait)
  const conv2 = statsToGoals(m2, e2, stars2, stars1, possession2, t2Trait, t1Trait)
  let raw1 = conv1.rawGoals
  let raw2 = conv2.rawGoals

  // Stage 3 — star/coach offensive bumps (moments of brilliance).
  let starOff1 = 0
  for (const s of stars1) starOff1 += applyStarOffense(s, t1Trait)
  let starOff2 = 0
  for (const s of stars2) starOff2 += applyStarOffense(s, t2Trait)
  // Soften — the stats pipeline already accounts for most scoring.
  raw1 += starOff1 * 0.4
  raw2 += starOff2 * 0.4

  const off1 = applyCoachOffense(t1.coach)
  const off2 = applyCoachOffense(t2.coach)
  if (off1.goals) { raw1 += off1.goals; effects.push(`📋 ${t1.coach.name}: ${off1.label}! +${off1.goals}`) }
  if (off2.goals) { raw2 += off2.goals; effects.push(`📋 ${t2.coach.name}: ${off2.label}! +${off2.goals}`) }

  // Stage 4 — defensive saves.
  let g1 = Math.max(0, Math.round(raw1))
  let g2 = Math.max(0, Math.round(raw2))

  const tierOrder = ['legendary','epic','rare','uncommon','common']
  const defenders1 = stars1.filter(s => ['GK','DEF'].includes(s.pos))
    .sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
  const defenders2 = stars2.filter(s => ['GK','DEF'].includes(s.pos))
    .sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
  const savesByStar = new Map()
  for (const s of defenders1) {
    if (g2 <= 0) break
    const saved = applyStarDefense(s, g2)
    if (saved > 0) {
      g2 = Math.max(0, g2 - saved)
      savesByStar.set(s, (savesByStar.get(s) || 0) + saved)
      effects.push(`⭐ ${s.name} ${s.pos==='GK'?'huge save':'crucial block'} (×${saved})!`)
    }
  }
  for (const s of defenders2) {
    if (g1 <= 0) break
    const saved = applyStarDefense(s, g1)
    if (saved > 0) {
      g1 = Math.max(0, g1 - saved)
      savesByStar.set(s, (savesByStar.get(s) || 0) + saved)
      effects.push(`⭐ ${s.name} ${s.pos==='GK'?'huge save':'crucial block'} (×${saved})!`)
    }
  }

  // Stage 5 — coach goal caps & extras.
  if (t1Trait === 'iron_curtain' && starOff2 > 1) {
    const cut = Math.round(starOff2 * 0.4 - 0.4)
    if (cut > 0) g2 = Math.max(0, g2 - cut)
    effects.push(`📋 ${t1.coach.name} (Iron Curtain): smothers ${t2.name}'s stars!`)
  }
  if (t2Trait === 'iron_curtain' && starOff1 > 1) {
    const cut = Math.round(starOff1 * 0.4 - 0.4)
    if (cut > 0) g1 = Math.max(0, g1 - cut)
    effects.push(`📋 ${t2.coach.name} (Iron Curtain): smothers ${t1.name}'s stars!`)
  }
  if (t1Trait === 'catenaccio' && g2 > 1) { effects.push(`📋 ${t1.coach.name} (Catenaccio): wall holds firm!`); g2 = 1 }
  if (t2Trait === 'catenaccio' && g1 > 1) { effects.push(`📋 ${t2.coach.name} (Catenaccio): wall holds firm!`); g1 = 1 }

  // The Wall (legendary GK trait): cap opponent at 1.
  if (teamHasStarTrait(stars1, 'wall_keeper') && g2 > 1) {
    const wall = stars1.find(s => s.trait?.id === 'wall_keeper')
    effects.push(`⭐ ${wall.name} (The Wall): nothing past me!`); g2 = 1
  }
  if (teamHasStarTrait(stars2, 'wall_keeper') && g1 > 1) {
    const wall = stars2.find(s => s.trait?.id === 'wall_keeper')
    effects.push(`⭐ ${wall.name} (The Wall): nothing past me!`); g1 = 1
  }

  // Comeback King: late equaliser if losing.
  if (t1Trait === 'comeback_king' && g1 < g2 && Math.random() < 0.50) {
    g1++; effects.push(`📋 ${t1.coach.name} (Comeback King): late equaliser!`)
  }
  if (t2Trait === 'comeback_king' && g2 < g1 && Math.random() < 0.50) {
    g2++; effects.push(`📋 ${t2.coach.name} (Comeback King): late equaliser!`)
  }

  // Stage 6 — normalize.
  const rawScore1 = g1, rawScore2 = g2
  let n1 = normalizeGoals(rawScore1)
  let n2 = normalizeGoals(rawScore2)
  ;[n1, n2] = preserveWinner(rawScore1, rawScore2, n1, n2)
  g1 = n1; g2 = n2

  // Stage 7 — attribute goals to stars (against final score).
  const starGoalsByStar1 = attributeGoals(t1, g1, conv1.breakdown)
  const starGoalsByStar2 = attributeGoals(t2, g2, conv2.breakdown)

  // Stage 8 — build timeline.
  const timeline = []
  function pushGoals(team, totalCount, starGoalsMap, stamina, sideIdx) {
    const actualByStar = new Map()
    let starGoalsTotal = 0
    for (const [, n] of starGoalsMap) starGoalsTotal += n
    let starsLeft = Math.min(starGoalsTotal, totalCount)
    for (const [star, n] of starGoalsMap) {
      const give = Math.min(n, starsLeft)
      if (give > 0) actualByStar.set(star, give)
      for (let i = 0; i < give; i++) {
        timeline.push({
          minute: pickGoalMinute(stamina),
          team: sideIdx, scorerName: star.name, starId: star.id, isStar: true,
        })
      }
      starsLeft -= give
      if (starsLeft <= 0) break
    }
    const generic = totalCount - Math.min(starGoalsTotal, totalCount)
    for (let i = 0; i < generic; i++) {
      timeline.push({
        minute: pickGoalMinute(stamina),
        team: sideIdx, scorerName: team.name, isStar: false,
      })
    }
    return actualByStar
  }
  const actualGoals1 = pushGoals(t1, g1, starGoalsByStar1, e1.stamina, 1)
  const actualGoals2 = pushGoals(t2, g2, starGoalsByStar2, e2.stamina, 2)

  // Penalty Box Predator: ensure their goal is the earliest on their team.
  const enforcePredator = (team, sideIdx) => {
    const stars = team.stars || []
    const predator = stars.find(s => s.trait?.id === 'penalty_box_predator')
    if (!predator) return
    const teamGoals = timeline.filter(g => g.team === sideIdx)
    if (!teamGoals.length) return
    const predatorGoal = teamGoals.find(g => g.starId === predator.id)
    if (!predatorGoal) return
    const earliest = teamGoals.reduce((a,b) => a.minute < b.minute ? a : b)
    if (predatorGoal !== earliest) {
      const tmp = predatorGoal.minute
      predatorGoal.minute = earliest.minute
      earliest.minute = tmp
    }
  }
  enforcePredator(t1, 1)
  enforcePredator(t2, 2)
  timeline.sort((a, b) => a.minute - b.minute)

  // Credit star totals.
  for (const [star, g] of actualGoals1) {
    if (g <= 0) continue
    star.goals = (star.goals || 0) + g
    effects.push(`⭐ ${star.name} scores ${g} for ${t1.name}!`)
  }
  for (const [star, g] of actualGoals2) {
    if (g <= 0) continue
    star.goals = (star.goals || 0) + g
    effects.push(`⭐ ${star.name} scores ${g} for ${t2.name}!`)
  }

  // Stage 9 — tranche snapshots.
  const tranches = [15, 30, 45, 60, 75, 90].map(minute => {
    const score1 = timeline.filter(x => x.team === 1 && x.minute <= minute).length
    const score2 = timeline.filter(x => x.team === 2 && x.minute <= minute).length
    const newGoals = timeline.filter(x => x.minute > (minute-15) && x.minute <= minute)
    return { minute, score1, score2, newGoals }
  })

  // Stage 10 — extra time / penalties.
  let winner = null, penalties = false, etGoals = null
  if (!allowDraw && g1 === g2) {
    const eg1 = Math.random() < 0.20 ? 1 : 0
    const eg2 = Math.random() < 0.20 ? 1 : 0
    g1 += eg1; g2 += eg2
    etGoals = { g1: eg1, g2: eg2 }
    for (let i = 0; i < eg1; i++) timeline.push({ minute: 100 + rand(1,30), team:1, scorerName:t1.name, isStar:false, et:true })
    for (let i = 0; i < eg2; i++) timeline.push({ minute: 100 + rand(1,30), team:2, scorerName:t2.name, isStar:false, et:true })
    timeline.sort((a,b) => a.minute - b.minute)

    if (g1 !== g2) {
      winner = g1 > g2 ? t1 : t2
    } else {
      let m1Bias = e1.mental, m2Bias = e2.mental
      if (teamHasStarTrait(stars1, 'penalty_specialist')) m1Bias += 8
      if (teamHasStarTrait(stars2, 'penalty_specialist')) m2Bias += 8
      winner = (m1Bias + rand(-10,10)) >= (m2Bias + rand(-10,10)) ? t1 : t2
      penalties = true
      effects.push(`🥅 Penalties — ${winner.name} win!`)
    }
  } else {
    winner = g1 > g2 ? t1 : g2 > g1 ? t2 : null
  }

  // Stage 11 — per-star match ratings.
  const starRatingsT1 = []
  const starRatingsT2 = []
  for (const s of stars1) {
    const goals = actualGoals1.get(s) || 0
    const saves = savesByStar.get(s) || 0
    const r = calcStarMatchRating({
      pos: s.pos, tier: s.tier,
      gf: g1, ga: g2,
      myShots: shots1, oppShots: shots2,
      poss: possession1,
      starGoals: goals, starSaves: saves,
      myEff: e1, oppEff: e2,
    })
    if (!s.ratings) s.ratings = []
    s.ratings.push(r)
    s.wcsPlayed = (s.wcsPlayed || 0) + 1
    starRatingsT1.push({ id: s.id, name: s.name, pos: s.pos, tier: s.tier, rating: r, goals, saves })
  }
  for (const s of stars2) {
    const goals = actualGoals2.get(s) || 0
    const saves = savesByStar.get(s) || 0
    const r = calcStarMatchRating({
      pos: s.pos, tier: s.tier,
      gf: g2, ga: g1,
      myShots: shots2, oppShots: shots1,
      poss: possession2,
      starGoals: goals, starSaves: saves,
      myEff: e2, oppEff: e1,
    })
    if (!s.ratings) s.ratings = []
    s.ratings.push(r)
    s.wcsPlayed = (s.wcsPlayed || 0) + 1
    starRatingsT2.push({ id: s.id, name: s.name, pos: s.pos, tier: s.tier, rating: r, goals, saves })
  }

  // Stage 12 — mentality changes.
  const r1 = t1.currentOverall || t1.rating || 75
  const r2 = t2.currentOverall || t2.rating || 75
  const calcMentalityChange = (myRating, oppRating, myGoals, oppGoals) => {
    const myGap = oppRating - myRating
    const myGoalDiff = myGoals - oppGoals
    const myExpectedDiff = -myGap / 6
    let delta = 0
    if (myGoalDiff > 0) {
      delta += 5
      if (myGap > 0) delta += myGap * 0.4
      if (myGoalDiff >= 3) delta += 3
      if (myGoalDiff >= 5) delta += 2
    } else if (myGoalDiff < 0) {
      const surprise = myExpectedDiff - myGoalDiff
      if (myGap >= 8 && myGoalDiff >= -1) delta += 2
      else if (surprise < -1) {
        delta -= 4
        if (myGoalDiff <= -3) delta -= 2
      } else delta -= 3
    } else {
      if (myGap >= 5) delta += 1
      else if (myGap <= -5) delta -= 1
    }
    return Math.round(delta)
  }
  const t1Delta = calcMentalityChange(r1, r2, g1, g2)
  const t2Delta = calcMentalityChange(r2, r1, g2, g1)
  const t1Before = t1.mentalityDelta || 0
  const t2Before = t2.mentalityDelta || 0
  const t1After = clamp(t1Before + t1Delta, -20, 20)
  const t2After = clamp(t2Before + t2Delta, -20, 20)
  const mentalityChanges = {
    team1: { before: t1Before, change: t1Delta, after: t1After },
    team2: { before: t2Before, change: t2Delta, after: t2After },
  }

  return {
    t1, t2, g1, g2,
    winner, penalties,
    effects, tranches, timeline, etGoals,
    shots1, shots2, corners1, corners2, possession1, possession2,
    starRatings: { team1: starRatingsT1, team2: starRatingsT2 },
    mentalityChanges,
  }
}

// ── Per-star match rating (kept from v3) ──────────────────────
function calcStarMatchRating({ pos, tier, gf, ga, myShots, oppShots, poss, starGoals, starSaves, myEff, oppEff }) {
  const won  = gf >  ga
  const drew = gf === ga
  const cs   = ga === 0
  const heavyPress = oppShots >= 14

  let r = 6.0
  r += won ? 0.4 : drew ? 0.0 : -0.3
  r += starGoals * 0.6

  if (pos === 'FWD') {
    r += starGoals * 1.0
    if (starGoals >= 2) r += 0.6
    if (starGoals >= 3) r += 1.0
    if (starGoals === 0 && !won) r -= 0.4
    r += (poss - 50) * 0.012
    r += Math.max(0, gf - 1) * 0.15
    if (ga >= 3) r -= 0.2
  } else if (pos === 'MID') {
    r += (poss - 50) * 0.035
    if (poss >= 60) r += 0.5
    if (poss <= 35) r -= 0.4
    r += starGoals * 0.7
    r += gf * 0.25 - ga * 0.20
    r += (myEff.mental - 75) / 60
  } else if (pos === 'DEF') {
    if (cs) r += 1.2
    if (cs && heavyPress) r += 0.6
    r -= ga * 0.55
    if (ga >= 3) r -= 0.5
    r += starSaves * 0.5
    if (won && ga > 0) r += 0.2
  } else if (pos === 'GK') {
    if (cs) r += 1.6
    if (cs && oppEff.attack >= 80) r += 0.6
    if (cs && oppShots >= 12) r += 0.5
    r += starSaves * 0.7
    r -= ga * 0.85
    if (ga >= 3) r -= 0.6
    if (ga > 0 && oppShots <= 7) r -= 0.4
  }

  r += { legendary:0.5, epic:0.3, rare:0.18, uncommon:0.08, common:0.0 }[tier] || 0
  r += gaussRand(0.35)

  return Math.round(clamp(r, 4.0, 10.0) * 10) / 10
}

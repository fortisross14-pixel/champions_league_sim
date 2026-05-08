// ── Match Engine v3 ──────────────────────────────────────────
// Core principles:
//  1. Compute a *baseline* score from team stats with bounded randomness
//     (most games end with normal scores — no 8-0 spam).
//  2. Apply each team's star skill (extra goals from FWD/MID, saves
//     by GK/DEF, set-piece headers, etc.)
//  3. Apply coach specials (extra goal / deny goal) once per match.
//  4. Assign each goal a minute. High-stamina teams skew late; lower
//     stamina skews early. Result = a timeline the UI can replay.

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

// ── Effective stats: base + star bonuses + coach bonuses ─────
export function getEffStats(team, isKO = false) {
  let s = team.stats
    ? { ...team.stats }
    : { attack:75, defense:75, stamina:75, mental:75, setPieces:75 }

  // Apply EVERY star's stat bonus on this team (not just the headline one).
  const stars = team.stars && team.stars.length ? team.stars : (team.star ? [team.star] : [])
  for (const star of stars) {
    if (!star?.statBonus) continue
    const fx = star.statBonus
    s.attack    = clamp(s.attack    + (fx.attack    || 0), 10, 130)
    s.defense   = clamp(s.defense   + (fx.defense   || 0), 10, 130)
    s.stamina   = clamp(s.stamina   + (fx.stamina   || 0), 10, 130)
    s.mental    = clamp(s.mental    + (fx.mental    || 0), 10, 130)
    s.setPieces = clamp(s.setPieces + (fx.setPieces || 0), 10, 130)
  }

  if (team.coach?.statBonus) {
    const fx = team.coach.statBonus
    s.attack    = clamp(s.attack    + (fx.attack    || 0), 10, 130)
    s.defense   = clamp(s.defense   + (fx.defense   || 0), 10, 130)
    s.stamina   = clamp(s.stamina   + (fx.stamina   || 0), 10, 130)
    s.mental    = clamp(s.mental    + (fx.mental    || 0), 10, 130)
    s.setPieces = clamp(s.setPieces + (fx.setPieces || 0), 10, 130)
  }
  // ── Coach trait stat effects (those that always apply) ───────
  const trait = team.coach?.trait
  if (trait) {
    if (trait.id === 'revolutionary') {
      s.attack    = clamp(s.attack    + 5, 10, 130)
      s.defense   = clamp(s.defense   + 5, 10, 130)
      s.stamina   = clamp(s.stamina   + 5, 10, 130)
      s.mental    = clamp(s.mental    + 5, 10, 130)
      s.setPieces = clamp(s.setPieces + 5, 10, 130)
    } else if (trait.id === 'high_press') {
      s.attack  = clamp(s.attack  + 6, 10, 130)
      s.stamina = clamp(s.stamina + 6, 10, 130)
    } else if (trait.id === 'gegenpress' && isKO) {
      s.mental = clamp(s.mental + 5, 10, 130)
    }
  }
  return s
}

// ── Goal-count baseline ───────────────────────────────────────
// Realistic football: ~2.6 goals per game on average, weighted by
// attack-vs-defense matchups. We use a Poisson-flavored sampler and
// clamp the high tail so blowouts are rare but possible.
//
// xg formula: scaled diff between team A's attack and team B's defense
// plus a small base. Set-pieces add a small bump. Mental gives a tiny
// edge in close games.
function computeXG(myEff, oppEff) {
  // Normalize to a 0..1 ratio.
  const att = myEff.attack
  const def = oppEff.defense
  const sp  = myEff.setPieces
  // Diff is roughly in -30..+30. Map to 0.4..2.2 expected goals.
  const diff = (att - def) / 25            // ~ -1..+1
  const base = 1.15 + diff                  // 0.15..2.15
  const setPieceBonus = (sp - 75) * 0.005   // ±0.15
  const xg = clamp(base + setPieceBonus, 0.25, 2.6)
  return xg
}

// Sample integer goals from a Poisson(lambda). Capped at 5 to avoid
// silly cricket scores.
function samplePoisson(lambda) {
  const L = Math.exp(-lambda)
  let k = 0, p = 1
  do { k++; p *= Math.random() } while (p > L)
  return clamp(k - 1, 0, 5)
}

// ── Goal timing ───────────────────────────────────────────────
// A team with HIGH stamina scores later (stronger in last 15 min);
// LOW stamina scores earlier. We pull each goal's minute from a
// distribution centered on a stamina-shifted midpoint.
function pickGoalMinute(stamina) {
  // Normalize stamina (40..110) to a shift in [-15..+15].
  const s = clamp(stamina, 40, 110)
  const shift = ((s - 75) / 35) * 15
  // Center = 45 + shift, so high-stamina teams center around minute 60.
  const center = 45 + shift
  // Minutes 1..90, gaussian noise around center.
  const m = Math.round(center + gaussRand(18))
  return clamp(m, 1, 90)
}

// ── Star "skill" effects ──────────────────────────────────────
// Each star fires once per match.
// FWD/MID add extra goals using their goal distribution.
// GK/DEF roll once *per opponent goal* and may deny it.
function applyStarOffense(star, coachTraitId) {
  if (!star || !['FWD','MID'].includes(star.pos)) return 0
  const dist = star.goalDist || [1,0,0,0,0]
  const r = Math.random()
  let acc = 0
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i]
    if (r < acc) {
      // Jogo Bonito: bump the rolled bucket up by 1 (capped at length-1).
      if (coachTraitId === 'jogo_bonito') return Math.min(i + 1, dist.length - 1)
      return i
    }
  }
  return 0
}

// Returns the number of opponent goals to remove (saves).
function applyStarDefense(star, oppG) {
  if (!star || !['GK','DEF'].includes(star.pos)) return 0
  const p = star.saveProb || 0
  let saved = 0
  for (let i = 0; i < oppG; i++) {
    if (Math.random() < p) saved++
  }
  return saved
}

// Coach trait effects fire inside simMatch with full match context.
function applyCoachOffense(coach) {
  if (!coach) return { goals: 0, label: null }
  if (!coach.trait) return { goals: 0, label: null }
  const t = coach.trait
  if (t.id === 'man_motivator' && Math.random() < 0.40) {
    return { goals: 1, label: 'tactical masterclass' }
  }
  return { goals: 0, label: null }
}

function applyCoachDefense(coach, oppG) {
  if (!coach || oppG <= 0) return { saved: 0, label: null }
  if (!coach.trait) return { saved: 0, label: null }
  const t = coach.trait
  if (t.id === 'park_the_bus' && Math.random() < 0.50) {
    return { saved: 1, label: 'parked the bus' }
  }
  return { saved: 0, label: null }
}

// ── Main simulator ────────────────────────────────────────────
//
// Returns an object with:
//   t1, t2          — references to the input teams
//   g1, g2          — final score
//   winner          — team object or null (only if !allowDraw)
//   penalties       — true if decided on penalties
//   timeline        — sorted [{ minute, team:1|2, scorerName, isStar }]
//   tranches        — [{ minute:15|30|45|60|75|90, score1, score2 }]
//   shots1/2, corners1/2, possession1/2, ratings, effects[]
//
export function simMatch(t1, t2, allowDraw = true, isKO = false) {
  const e1 = getEffStats(t1, isKO)
  const e2 = getEffStats(t2, isKO)

  const t1Trait = t1.coach?.trait?.id || null
  const t2Trait = t2.coach?.trait?.id || null

  // ── Baseline goal counts (xG-driven Poisson) ────────────────
  let xg1 = computeXG(e1, e2)
  let xg2 = computeXG(e2, e1)

  // Gegenpress: +0.4 xG in knockout matches.
  if (isKO && t1Trait === 'gegenpress') xg1 += 0.4
  if (isKO && t2Trait === 'gegenpress') xg2 += 0.4

  // High Press: also concedes more — opponent xG +0.3 each side
  // that runs the press.
  if (t1Trait === 'high_press') xg2 += 0.3
  if (t2Trait === 'high_press') xg1 += 0.3

  let g1 = samplePoisson(xg1)
  let g2 = samplePoisson(xg2)

  // Track effect log (shown after the match)
  const effects = []

  // Helper to fetch all stars on a team (handles legacy single-star).
  const teamStars = team => team.stars && team.stars.length
    ? team.stars
    : (team.star ? [team.star] : [])
  const stars1 = teamStars(t1)
  const stars2 = teamStars(t2)

  // ── Star offensive contributions ───────────────────────────
  // Each FWD/MID star rolls their own goal distribution. Stars who
  // actually scored have their `goals` counter incremented and their
  // contribution recorded so the timeline can name them.
  const starGoalsByStar1 = new Map()  // star → goals scored this match
  const starGoalsByStar2 = new Map()
  let starGoals1 = 0
  let starGoals2 = 0
  for (const s of stars1) {
    const g = applyStarOffense(s, t1Trait)
    if (g > 0) { starGoalsByStar1.set(s, g); starGoals1 += g }
  }
  for (const s of stars2) {
    const g = applyStarOffense(s, t2Trait)
    if (g > 0) { starGoalsByStar2.set(s, g); starGoals2 += g }
  }

  // Iron Curtain: opposing star players' total goal contribution capped at 1.
  if (t1Trait === 'iron_curtain' && starGoals2 > 1) {
    effects.push(`📋 ${t1.coach.name} (Iron Curtain): smothers ${t2.name}'s stars!`)
    // Reduce each scorer proportionally so the total sums to 1.
    let leftToRemove = starGoals2 - 1
    for (const [star, g] of [...starGoalsByStar2.entries()].sort((a,b) => b[1] - a[1])) {
      if (leftToRemove <= 0) break
      const reduce = Math.min(g, leftToRemove)
      starGoalsByStar2.set(star, g - reduce)
      leftToRemove -= reduce
    }
    // Drop any zeroed entries.
    for (const [star, g] of [...starGoalsByStar2.entries()]) if (g <= 0) starGoalsByStar2.delete(star)
    starGoals2 = 1
  }
  if (t2Trait === 'iron_curtain' && starGoals1 > 1) {
    effects.push(`📋 ${t2.coach.name} (Iron Curtain): smothers ${t1.name}'s stars!`)
    let leftToRemove = starGoals1 - 1
    for (const [star, g] of [...starGoalsByStar1.entries()].sort((a,b) => b[1] - a[1])) {
      if (leftToRemove <= 0) break
      const reduce = Math.min(g, leftToRemove)
      starGoalsByStar1.set(star, g - reduce)
      leftToRemove -= reduce
    }
    for (const [star, g] of [...starGoalsByStar1.entries()]) if (g <= 0) starGoalsByStar1.delete(star)
    starGoals1 = 1
  }

  // Add to team totals. We'll emit per-star credit messages later,
  // *after* defensive saves are resolved and we know the actual goal
  // counts each star contributed to the final score.
  if (starGoals1 > 0) g1 += starGoals1
  if (starGoals2 > 0) g2 += starGoals2

  // ── Coach offensive contributions ──────────────────────────
  const off1 = applyCoachOffense(t1.coach)
  const off2 = applyCoachOffense(t2.coach)
  if (off1.goals) { g1 += off1.goals; effects.push(`📋 ${t1.coach.name}: ${off1.label}! +${off1.goals}`) }
  if (off2.goals) { g2 += off2.goals; effects.push(`📋 ${t2.coach.name}: ${off2.label}! +${off2.goals}`) }

  // ── Set-Piece Specialist: 60% extra goal if setPieces >= 80 ─
  if (t1Trait === 'set_piece_specialist' && e1.setPieces >= 80 && Math.random() < 0.60) {
    g1++; effects.push(`📋 ${t1.coach.name}: set-piece routine pays off!`)
  }
  if (t2Trait === 'set_piece_specialist' && e2.setPieces >= 80 && Math.random() < 0.60) {
    g2++; effects.push(`📋 ${t2.coach.name}: set-piece routine pays off!`)
  }

  // ── Defensive saves (per star, then coach) ─────────────────
  // Each GK/DEF star rolls saves against opponent goals. We process
  // them in order: best tier first, capped at the current opponent
  // goal count so saves can never go negative.
  const tierOrder = ['legendary','epic','rare','uncommon','common']
  const defenders1 = stars1.filter(s => ['GK','DEF'].includes(s.pos))
    .sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
  const defenders2 = stars2.filter(s => ['GK','DEF'].includes(s.pos))
    .sort((a,b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
  // Track per-star saves so the rating function can credit them.
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

  const def1 = applyCoachDefense(t1.coach, g2)
  const def2 = applyCoachDefense(t2.coach, g1)
  if (def1.saved) { g2 = Math.max(0, g2 - def1.saved); effects.push(`📋 ${t1.coach.name}: ${def1.label}!`) }
  if (def2.saved) { g1 = Math.max(0, g1 - def2.saved); effects.push(`📋 ${t2.coach.name}: ${def2.label}!`) }

  // ── Catenaccio Master: cap goals against at 1 ───────────────
  if (t1Trait === 'catenaccio' && g2 > 1) {
    effects.push(`📋 ${t1.coach.name} (Catenaccio): wall holds firm!`)
    g2 = 1
  }
  if (t2Trait === 'catenaccio' && g1 > 1) {
    effects.push(`📋 ${t2.coach.name} (Catenaccio): wall holds firm!`)
    g1 = 1
  }

  // ── Possession (computed early so Tiki-Taka can use it) ─────
  const shots1 = clamp(Math.round(xg1 * 6 + rand(2, 5)), 1, 22)
  const shots2 = clamp(Math.round(xg2 * 6 + rand(2, 5)), 1, 22)
  const corners1 = clamp(Math.round(shots1 * 0.4 + rand(0, 2)), 0, 12)
  const corners2 = clamp(Math.round(shots2 * 0.4 + rand(0, 2)), 0, 12)
  const pw1 = e1.attack*0.5 + e1.mental*0.3 + e1.setPieces*0.2
  const pw2 = e2.attack*0.5 + e2.mental*0.3 + e2.setPieces*0.2
  let possession1 = clamp(Math.round((pw1 / (pw1+pw2)) * 100 + gaussRand(3)), 30, 70)
  if (t1Trait === 'tiki_taka') possession1 = clamp(possession1 + 5, 30, 70)
  if (t2Trait === 'tiki_taka') possession1 = clamp(possession1 - 5, 30, 70)
  let possession2 = 100 - possession1

  // ── Tiki-Taka: +1 goal if possession >= 60% ─────────────────
  if (t1Trait === 'tiki_taka' && possession1 >= 60) {
    g1++; effects.push(`📋 ${t1.coach.name} (Tiki-Taka): suffocating possession converts!`)
  }
  if (t2Trait === 'tiki_taka' && possession2 >= 60) {
    g2++; effects.push(`📋 ${t2.coach.name} (Tiki-Taka): suffocating possession converts!`)
  }

  // ── Comeback King: if losing, 50% equaliser ─────────────────
  if (t1Trait === 'comeback_king' && g1 < g2 && Math.random() < 0.50) {
    g1++; effects.push(`📋 ${t1.coach.name} (Comeback King): late equaliser!`)
  }
  if (t2Trait === 'comeback_king' && g2 < g1 && Math.random() < 0.50) {
    g2++; effects.push(`📋 ${t2.coach.name} (Comeback King): late equaliser!`)
  }

  // ── Build timeline ─────────────────────────────────────────
  // Each star who actually scored gets their individual goals named in
  // the timeline. Generic (non-star) goals are labelled with the team.
  // Returns a Map<star, actualGoals> reflecting post-save reality.
  const timeline = []
  function pushGoalsForTeam(team, totalCount, starGoalsMap, stamina, sideIdx) {
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
          team: sideIdx,
          scorerName: star.name,
          starId: star.id,
          isStar: true,
        })
      }
      starsLeft -= give
      if (starsLeft <= 0) break
    }
    const generic = totalCount - Math.min(starGoalsTotal, totalCount)
    for (let i = 0; i < generic; i++) {
      timeline.push({
        minute: pickGoalMinute(stamina),
        team: sideIdx,
        scorerName: team.name,
        isStar: false,
      })
    }
    return actualByStar
  }
  const actualGoals1 = pushGoalsForTeam(t1, g1, starGoalsByStar1, e1.stamina, 1)
  const actualGoals2 = pushGoalsForTeam(t2, g2, starGoalsByStar2, e2.stamina, 2)
  timeline.sort((a, b) => a.minute - b.minute)

  // Now that we know what actually made it onto the scoreboard, credit
  // each scorer's career total and emit the "scored X" effect messages.
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

  // ── Tranche snapshots at minutes 15/30/45/60/75/90 ─────────
  const tranches = [15, 30, 45, 60, 75, 90].map(minute => {
    const score1 = timeline.filter(x => x.team === 1 && x.minute <= minute).length
    const score2 = timeline.filter(x => x.team === 2 && x.minute <= minute).length
    const newGoals = timeline.filter(x => x.minute > (minute-15) && x.minute <= minute)
    return { minute, score1, score2, newGoals }
  })

  // ── Knockout draws → ET / penalties ────────────────────────
  let winner = null, penalties = false, etGoals = null
  if (!allowDraw && g1 === g2) {
    // Extra time: small chance of one or two extra goals decided by xg.
    const etXG1 = xg1 * 0.25, etXG2 = xg2 * 0.25
    const eg1 = samplePoisson(etXG1), eg2 = samplePoisson(etXG2)
    g1 += eg1
    g2 += eg2
    etGoals = { g1:eg1, g2:eg2 }
    // Add to timeline at minute 105 / 120.
    for (let i = 0; i < eg1; i++) timeline.push({ minute: 100 + rand(1,30), team:1, scorerName:t1.name, isStar:false, et:true })
    for (let i = 0; i < eg2; i++) timeline.push({ minute: 100 + rand(1,30), team:2, scorerName:t2.name, isStar:false, et:true })
    timeline.sort((a,b) => a.minute - b.minute)

    if (g1 !== g2) {
      winner = g1 > g2 ? t1 : t2
    } else {
      // Penalties — favour the side with higher mental.
      winner = (e1.mental + rand(-10,10)) >= (e2.mental + rand(-10,10)) ? t1 : t2
      penalties = true
      effects.push(`🥅 Penalties — ${winner.name} win!`)
    }
  } else {
    winner = g1 > g2 ? t1 : g2 > g1 ? t2 : null
  }

  // ── Per-star match ratings ──────────────────────────────────
  // One rating per star on each team, reflecting THIS match's events.
  // The rating function below considers their position, whether they
  // scored, the team's result, their personal saves (for keepers/defs),
  // possession, and a small random component.
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

  return {
    t1, t2, g1, g2,
    winner, penalties,
    effects, tranches, timeline, etGoals,
    shots1, shots2, corners1, corners2, possession1, possession2,
    // New: per-star ratings (the popup uses this).
    starRatings: { team1: starRatingsT1, team2: starRatingsT2 },
  }
}

// Per-star rating for a single match. Range 4.0..10.0.
//
// FWD: rewarded for scoring, penalised lightly for losing badly.
// MID: rewarded for possession-rich wins, penalised for blowouts the
//      wrong way.
// DEF: rewarded for clean sheets, especially against high-volume
//      opposition; penalised for conceding.
// GK:  same as DEF but bigger swings — heroic save-spam vs lopsided
//      losses. Personal saves boost rating.
function calcStarMatchRating({ pos, tier, gf, ga, myShots, oppShots, poss, starGoals, starSaves, myEff, oppEff }) {
  const won  = gf >  ga
  const drew = gf === ga
  const cs   = ga === 0           // clean sheet
  const heavyPress = oppShots >= 14   // opponent peppered our goal

  let r = 6.0  // baseline
  // Universal modifiers.
  r += won ? 0.4 : drew ? 0.0 : -0.3
  r += starGoals * 0.6           // any star scoring nudges up

  if (pos === 'FWD') {
    // Goals are king. Two-goal performances are great, hat-tricks elite.
    r += starGoals * 1.0
    if (starGoals >= 2) r += 0.6
    if (starGoals >= 3) r += 1.0
    // No goals + team lost = punishment.
    if (starGoals === 0 && !won) r -= 0.4
    // Possession & team form give a small lift.
    r += (poss - 50) * 0.012
    r += Math.max(0, gf - 1) * 0.15
    if (ga >= 3) r -= 0.2
  } else if (pos === 'MID') {
    // Midfielders thrive on possession + team success.
    r += (poss - 50) * 0.035
    if (poss >= 60) r += 0.5
    if (poss <= 35) r -= 0.4
    r += starGoals * 0.7
    r += gf * 0.25 - ga * 0.20
    r += (myEff.mental - 75) / 60
  } else if (pos === 'DEF') {
    // Clean sheet > everything else for defenders.
    if (cs) r += 1.2
    if (cs && heavyPress) r += 0.6
    r -= ga * 0.55
    if (ga >= 3) r -= 0.5
    // Personal blocks (saves) credit the defender.
    r += starSaves * 0.5
    // Mild boost for winning even with a leaky defence.
    if (won && ga > 0) r += 0.2
  } else if (pos === 'GK') {
    // Keepers swing the most. Full house: clean sheet vs an attacking team.
    if (cs) r += 1.6
    if (cs && oppEff.attack >= 80) r += 0.6
    if (cs && oppShots >= 12) r += 0.5
    r += starSaves * 0.7
    r -= ga * 0.85
    if (ga >= 3) r -= 0.6
    // Soft penalty when keeper concedes against a low-shot opponent
    // (i.e. let in goals despite not facing much).
    if (ga > 0 && oppShots <= 7) r -= 0.4
  }

  // Tier bonus: better players have a higher floor.
  r += { legendary:0.5, epic:0.3, rare:0.18, uncommon:0.08, common:0.0 }[tier] || 0

  // A bit of randomness — same situation can feel different match to match.
  r += gaussRand(0.35)

  return Math.round(clamp(r, 4.0, 10.0) * 10) / 10
}

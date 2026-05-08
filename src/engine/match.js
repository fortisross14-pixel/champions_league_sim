// ── Match Engine v2 ──────────────────────────────────────────
export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const pick = arr => arr[Math.floor(Math.random() * arr.length)]
export const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]} return b }
export const gaussRand = (sig=1) => { let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*sig }
export const ovr = s => s ? Math.round((s.attack+s.defense+s.stamina+s.mental+s.setPieces)/5) : 0

export const STAR_TIER_MULT  = { legendary:2.5, epic:2.0, rare:1.5, uncommon:1.2, common:1.0 }
export const COACH_TIER_MULT = { legendary:2.2, epic:1.8, rare:1.4, uncommon:1.1, common:1.0 }

export function getEffStats(team) {
  let s = team.stats ? { ...team.stats } : { attack:75, defense:75, stamina:75, mental:75, setPieces:75 }
  if (team.star) {
    const m = STAR_TIER_MULT[team.star.tier] || 1.0
    const fx = team.star.statBonus || {}
    s.attack    = clamp(s.attack    + Math.round((fx.attack||0)*m),    10, 130)
    s.defense   = clamp(s.defense   + Math.round((fx.defense||0)*m),   10, 130)
    s.stamina   = clamp(s.stamina   + Math.round((fx.stamina||0)*m),   10, 130)
    s.mental    = clamp(s.mental    + Math.round((fx.mental||0)*m),    10, 130)
    s.setPieces = clamp(s.setPieces + Math.round((fx.setPieces||0)*m), 10, 130)
  }
  if (team.coach) {
    const m = COACH_TIER_MULT[team.coach.tier] || 1.0
    const fx = team.coach.statBonus || {}
    s.attack    = clamp(s.attack    + Math.round((fx.attack||0)*m),    10, 130)
    s.defense   = clamp(s.defense   + Math.round((fx.defense||0)*m),   10, 130)
    s.stamina   = clamp(s.stamina   + Math.round((fx.stamina||0)*m),   10, 130)
    s.mental    = clamp(s.mental    + Math.round((fx.mental||0)*m),    10, 130)
    s.setPieces = clamp(s.setPieces + Math.round((fx.setPieces||0)*m), 10, 130)
  }
  return s
}

function simulateTranche(e1, e2, minute, mentalMod1, mentalMod2) {
  const staminaMod1 = minute >= 60 ? clamp(0.75 + (e1.stamina/100)*0.25, 0.75, 1.0) : 1.0
  const staminaMod2 = minute >= 60 ? clamp(0.75 + (e2.stamina/100)*0.25, 0.75, 1.0) : 1.0

  // Noise reduced to gaussRand(2) — was 4. Stops 75-rated teams randomly rolling like 95s
  const att1 = e1.attack * staminaMod1 * mentalMod1 + gaussRand(2)
  const att2 = e2.attack * staminaMod2 * mentalMod2 + gaussRand(2)
  // Defense weight increased to 0.85 — better teams defend more effectively
  const def1 = e1.defense * staminaMod1 + gaussRand(1.5)
  const def2 = e2.defense * staminaMod2 + gaussRand(1.5)

  // xg formula: the gap between attack and weighted defense drives chances
  // Dividing by 100 (was 80) and using 0.85 defense weight means bigger teams win more
  const xg1 = Math.max(0, (att1 - def2*0.85) / 100 + 0.09 + (e1.setPieces/100)*0.03)
  const xg2 = Math.max(0, (att2 - def1*0.85) / 100 + 0.09 + (e2.setPieces/100)*0.03)

  // Max one goal per tranche (no more random double goals per tranche)
  const g1 = Math.random() < xg1 ? 1 : 0
  const g2 = Math.random() < xg2 ? 1 : 0
  const shots1 = Math.round(clamp(xg1*20 + rand(0,2), 0, 6))
  const shots2 = Math.round(clamp(xg2*20 + rand(0,2), 0, 6))
  return { g1, g2, shots1, shots2 }
}

export function simMatch(t1, t2, allowDraw=true, isKO=false) {
  const e1 = getEffStats(t1), e2 = getEffStats(t2)
  let g1=0, g2=0, shots1=0, shots2=0, corners1=0, corners2=0
  let mm1=1.0, mm2=1.0
  const tranches=[], MINUTES=[15,30,45,60,75,90]

  MINUTES.forEach(minute => {
    const t = simulateTranche(e1, e2, minute, mm1, mm2)
    g1+=t.g1; g2+=t.g2; shots1+=t.shots1; shots2+=t.shots2
    corners1 += Math.round(t.shots1*0.4+rand(0,1))
    corners2 += Math.round(t.shots2*0.4+rand(0,1))
    if (t.g1>0||t.g2>0) {
      const mf1=(e1.mental-75)/100, mf2=(e2.mental-75)/100
      if (t.g2>0) mm1 = clamp(mm1+0.05+mf1, 0.75, 1.25)
      if (t.g1>0) mm2 = clamp(mm2+0.05+mf2, 0.75, 1.25)
    }
    mm1 = clamp(mm1*0.97+0.03, 0.8, 1.2)
    mm2 = clamp(mm2*0.97+0.03, 0.8, 1.2)
    tranches.push({ minute, g1:t.g1, g2:t.g2, score1:g1, score2:g2 })
  })

  const effects = []
  const applyStarFx = (star, myG, oppG, myName) => {
    if (!star) return [myG, oppG]
    if (star.pos === 'FWD') {
      const gc = {legendary:0.70,epic:0.50,rare:0.32,uncommon:0.18,common:0.10}[star.tier]||0.10
      if (Math.random() < gc) {
        myG++; star.goals=(star.goals||0)+1; effects.push(`⭐ ${star.name} scores for ${myName}!`)
        if (['legendary','epic'].includes(star.tier) && Math.random()<0.35) {
          myG++; star.goals++; effects.push(`⭐ ${star.name} doubles up!`)
        }
      }
    } else if (star.pos === 'MID') {
      const gc = {legendary:0.30,epic:0.18,rare:0.10,uncommon:0.05,common:0.02}[star.tier]||0.02
      if (Math.random()<gc) { myG++; star.goals=(star.goals||0)+1; effects.push(`⭐ ${star.name} scores from midfield!`) }
    } else if (star.pos === 'GK') {
      const sc = {legendary:0.60,epic:0.45,rare:0.28,uncommon:0.16,common:0.08}[star.tier]||0.08
      if (oppG>0 && Math.random()<sc) { oppG--; effects.push(`⭐ ${star.name} incredible save!`) }
    } else if (star.pos === 'DEF') {
      const cc = {legendary:0.50,epic:0.35,rare:0.22,uncommon:0.12,common:0.06}[star.tier]||0.06
      if (oppG>0 && Math.random()<cc) { oppG--; effects.push(`⭐ ${star.name} clears off the line!`) }
      const sp = {legendary:0.20,epic:0.12,rare:0.07,uncommon:0.03,common:0.01}[star.tier]||0.01
      if (Math.random()<sp) { myG++; star.goals=(star.goals||0)+1; effects.push(`⭐ ${star.name} heads in a corner!`) }
    }
    return [myG, oppG]
  }
  ;[g1,g2] = applyStarFx(t1.star, g1, g2, t1.name)
  ;[g2,g1] = applyStarFx(t2.star, g2, g1, t2.name)

  const applyCoachFx = (coach, myG, oppG) => {
    if (!coach) return [myG, oppG]
    if (coach.jogoBonito) { myG+=2; effects.push(`📋 ${coach.name}: Attacking masterclass! +2`) }
    if (coach.ironWall && oppG>0) { oppG=Math.max(0,oppG-1); effects.push(`📋 ${coach.name}: Iron Wall!`) }
    if (coach.cancelGoal && oppG>0) { oppG--; effects.push(`📋 ${coach.name}: Tactical sub kills a goal!`) }
    return [myG, oppG]
  }
  ;[g1,g2] = applyCoachFx(t1.coach, g1, g2)
  ;[g2,g1] = applyCoachFx(t2.coach, g2, g1)

  g1=Math.max(0,g1); g2=Math.max(0,g2)

  const pw1 = e1.attack*0.5+e1.mental*0.3+e1.setPieces*0.2
  const pw2 = e2.attack*0.5+e2.mental*0.3+e2.setPieces*0.2
  const possession1 = Math.round(clamp((pw1/(pw1+pw2))*100+gaussRand(3),30,70))
  const possession2 = 100-possession1

  let winner=null, penalties=false, etGoals=null
  if (!allowDraw && g1===g2) {
    const et1=simulateTranche(e1,e2,105,mm1*0.9,mm2*0.9)
    const et2=simulateTranche(e1,e2,120,mm1*0.85,mm2*0.85)
    g1+=et1.g1+et2.g1; g2+=et1.g2+et2.g2
    etGoals={g1:et1.g1+et2.g1, g2:et1.g2+et2.g2}
    if (g1!==g2) {
      winner=g1>g2?t1:t2
    } else {
      winner=(e1.mental+rand(-10,10))>=(e2.mental+rand(-10,10))?t1:t2
      penalties=true; effects.push(`🥅 Penalties — ${winner.name} win!`)
    }
  } else {
    winner = g1>g2?t1:g2>g1?t2:null
  }

  ;[t1,t2].forEach((t,ti) => {
    if (!t.star) return
    const myG=ti===0?g1:g2, oppG=ti===0?g2:g1
    const myShots=ti===0?shots1:shots2, oppShots=ti===0?shots2:shots1
    const myPoss=ti===0?possession1:possession2
    const eff=ti===0?e1:e2, oppEff=ti===0?e2:e1
    const r = calcStarRating(t.star.pos, myG, oppG, myShots, oppShots, myPoss, eff, oppEff, t.star)
    if (!t.star.ratings) t.star.ratings=[]
    t.star.ratings.push(r)
    t.star.wcsPlayed=(t.star.wcsPlayed||0)+1
  })

  const ratings = {
    team1: calcTeamRatings(g1,g2,shots1,shots2,possession1,e1,e2,t1.star),
    team2: calcTeamRatings(g2,g1,shots2,shots1,possession2,e2,e1,t2.star)
  }

  return { t1,t2,g1,g2,winner,penalties,effects,tranches,etGoals,shots1,shots2,corners1,corners2,possession1,possession2,ratings }
}

function calcStarRating(pos, gf, ga, sf, sa, poss, myE, oppE, star) {
  const r = calcTeamRatings(gf,ga,sf,sa,poss,myE,oppE,star)
  return r[pos] || 6.0
}

function calcTeamRatings(gf, ga, sf, sa, poss, myE, oppE, star) {
  const base=6.0, poss2=100-poss

  let fwd=base
  fwd += gf*1.2 + (gf>=2?0.5:0)
  fwd -= Math.max(0, sf-gf*3)*0.08
  fwd += (poss-50)*0.015
  if (star?.pos==='FWD') { fwd+={legendary:0.8,epic:0.5,rare:0.3,uncommon:0.15,common:0.05}[star.tier]||0; if(star.goals>0)fwd+=star.goals*0.4; if(ga>2)fwd-=0.15 }

  let mid=base
  mid += (poss-50)*0.025
  mid += gf*0.6 - ga*0.3
  mid += (myE.mental-75)/50
  if (poss>=60) mid+=0.4; if (poss<=35) mid-=0.3
  if (star?.pos==='MID') { mid+={legendary:0.7,epic:0.4,rare:0.25,uncommon:0.12,common:0.05}[star.tier]||0; if(star.goals>0)mid+=star.goals*0.5 }

  let def=base
  if (ga===0) def+=1.2; if (ga===0&&sa>=8) def+=0.4
  def -= ga*0.8; def += Math.max(0,sa-ga*3)*0.06; def -= Math.max(0,ga-2)*0.2
  if (star?.pos==='DEF') { def+={legendary:0.9,epic:0.5,rare:0.3,uncommon:0.15,common:0.05}[star.tier]||0; if(ga===0)def+=0.3; if(ga>=3)def-=0.4 }

  let gk=base
  if (ga===0) gk+=1.5; if (ga===0&&oppE.attack>=80) gk+=0.5
  gk -= ga*0.9; gk += Math.max(0,sa-ga*3)*0.07
  if (star?.pos==='GK') { gk+={legendary:1.0,epic:0.6,rare:0.35,uncommon:0.15,common:0.05}[star.tier]||0; if(ga===0)gk+=0.4; if(ga>=3)gk-=0.5 }

  const g = s => Math.round(clamp(s+gaussRand(0.2),4.0,10.0)*10)/10
  return { FWD:g(fwd), MID:g(mid), DEF:g(def), GK:g(gk) }
}

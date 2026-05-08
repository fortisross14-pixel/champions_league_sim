import { S, autoSave, loadGame, clearGame, exportSave, importSave, saveSlot, loadSlot, allSlots, deleteSlot } from './store.js'
import { runQualification, drawGroups, initStarsAndCoaches, linkStarsToTeams,
  playGroupMatch, buildKnockout, playKnockoutMatch, advanceKnockout,
  runTransfers, startNewSeason, tierOf, tierLabel, tierColor, genStar } from './engine/season.js'
import { ovr, getEffStats, rand } from './engine/match.js'

const $ = id => document.getElementById(id)
const pick = arr => arr[Math.floor(Math.random()*arr.length)]
const FLAG = { es:'🇪🇸',de:'🇩🇪',it:'🇮🇹','gb-eng':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',fr:'🇫🇷',pt:'🇵🇹',nl:'🇳🇱',ru:'🇷🇺','gb-sct':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',tr:'🇹🇷',gr:'🇬🇷',be:'🇧🇪',ch:'🇨🇭',at:'🇦🇹',ua:'🇺🇦',ro:'🇷🇴',cz:'🇨🇿',pl:'🇵🇱',no:'🇳🇴',se:'🇸🇪',dk:'🇩🇰',hr:'🇭🇷',hu:'🇭🇺',bg:'🇧🇬',md:'🇲🇩',lv:'🇱🇻',si:'🇸🇮',gi:'🇬🇮' }
const flag = cc => FLAG[cc]||'🏳️'
const tierBadge = t => `<span class="badge badge-${t}">${tierLabel(t)}</span>`
const TIER_ORDER = ['legendary','epic','rare','uncommon','common']

function toast(msg,type='info') {
  let el=$('toast')
  if (!el){el=document.createElement('div');el.id='toast';el.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--bg5);color:var(--txt);font-family:var(--font-head);font-size:12px;letter-spacing:.06em;padding:8px 18px;border-radius:20px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;';document.body.appendChild(el)}
  el.textContent=msg; el.style.borderColor=type==='error'?'var(--red)':'var(--blue)'; el.style.opacity='1'
  clearTimeout(el._t); el._t=setTimeout(()=>el.style.opacity='0',3000)
}

window.switchTab = function(tab) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'))
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'))
  $(`tab-${tab}`)?.classList.add('active')
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')
  if (tab==='groups') renderGroups()
  if (tab==='bracket') renderBracket()
  if (tab==='stars') renderStars()
  if (tab==='teams') renderTeams()
  if (tab==='history') renderHistory()
  if (tab==='play') renderPlay()
}

function updatePhaseUI() {
  $('cur-season').textContent = S.season||1
  const btn=$('btn-main')
  const map = { idle:`▶ Begin Season ${S.season||1}`, qualifying:'▶ Draw Groups', groups:'▶ Play Next Match', knockout:'▶ Play Next Match', done:'▶ Transfer Window', transfers:'▶ Start New Season' }
  btn.textContent = map[S.phase]||'▶ New Season'
  btn.disabled = false
  const phases = { idle:'Pre-Season', qualifying:'Qualification', groups:'Group Stage', knockout:'Knockout', done:'Season Complete', transfers:'Transfer Window' }
  $('phase-label').textContent = phases[S.phase]||''
  renderPlay()
}

window.handleMain = async function() {
  const p=S.phase||'idle'
  if (p==='idle') {
    if (!S.allTeams) initStarsAndCoaches()
    runQualification()
    S.phase='qualifying'; await autoSave(); updatePhaseUI()
    toast('32 teams qualified!'); switchTab('teams')
  } else if (p==='qualifying') {
    drawGroups(); S.phase='groups'; await autoSave(); updatePhaseUI()
    toast('Groups drawn!'); switchTab('groups')
  } else if (p==='groups') {
    playNextGroupMatch()
  } else if (p==='knockout') {
    playNextKnockoutMatch()
  } else if (p==='done') {
    S.phase='transfers'
    const res=runTransfers(); await autoSave(); updatePhaseUI()
    renderTransferSummary(res)
  } else if (p==='transfers') {
    startNewSeason(); await autoSave(); updatePhaseUI(); renderPlay()
    toast(`Season ${S.season} begins!`)
  }
}

// ── Group stage ───────────────────────────────────────────────
function playNextGroupMatch() {
  const unplayed=S.groupMatches.filter(m=>!m.played)
  if (!unplayed.length) {
    buildKnockout(); S.phase='knockout'; autoSave(); updatePhaseUI()
    switchTab('bracket'); toast('Group stage done — Round of 16 ready!'); return
  }
  const match=unplayed[0]
  const result=playGroupMatch(match)
  showMatchPopup(result,'Group Stage')
  renderGroups(); updatePhaseUI()
  const left=S.groupMatches.filter(m=>!m.played).length
  $('btn-main').textContent = left>0?`▶ Play Next (${left} left)`:'▶ Complete Group Stage'
}

// ── Knockout stage ────────────────────────────────────────────
function playNextKnockoutMatch() {
  const round=S.knockoutRounds[S.knockoutRounds.length-1]
  if (!round) return
  const unplayed=round.matches.filter(m=>!m.played)
  if (!unplayed.length) {
    advanceKnockout(); autoSave()
    if (S.phase==='done') {
      updatePhaseUI(); renderBracket()
      toast(`🏆 ${S.champion?.name} are Champions of Europe!`)
    } else {
      updatePhaseUI(); renderBracket()
      toast(`${S.knockoutRounds[S.knockoutRounds.length-1]?.name} begins!`)
    }
    return
  }
  const match=unplayed[0]
  const result=playKnockoutMatch(match)
  showMatchPopup(result, round.name)
  renderBracket(); updatePhaseUI()
  const left=round.matches.filter(m=>!m.played).length
  $('btn-main').textContent = left>0?`▶ Play Next (${left} left)`:'▶ Advance Round'
}

// ── Match popup ───────────────────────────────────────────────
function showMatchPopup(r, roundName) {
  if (!r) return
  const {t1,t2,g1,g2,shots1,shots2,corners1,corners2,possession1,possession2,penalties,effects,ratings} = r
  const popup=$('match-popup'), inner=$('match-popup-inner')
  const r1=ratings?.team1||{}, r2=ratings?.team2||{}

  inner.innerHTML = `
    <div class="match-result-card">
      <div style="font-size:10px;color:var(--txt3);font-family:var(--font-head);letter-spacing:.1em;margin-bottom:8px">${roundName.toUpperCase()}</div>
      <div class="match-teams">
        <div class="match-team">${flag(t1.cc)} ${t1.name}</div>
        <div class="match-score">${g1} – ${g2}${penalties?' <sup style="font-size:10px;color:var(--txt3)">P</sup>':''}</div>
        <div class="match-team right">${t2.name} ${flag(t2.cc)}</div>
      </div>
      <div class="match-stats-row">
        <span>${shots1} 🥅 ${shots2}</span>
        <span style="color:var(--txt3)">Shots</span>
        <span>${shots2} 🥅 ${shots1}</span>
      </div>
      <div class="match-stats-row">
        <span>${corners1}</span>
        <span style="color:var(--txt3)">Corners</span>
        <span>${corners2}</span>
      </div>
      <div class="match-stats-row">
        <span style="color:${possession1>=50?'var(--blue2)':'var(--txt2)'}">${possession1}%</span>
        <span style="color:var(--txt3)">Possession</span>
        <span style="color:${possession2>=50?'var(--blue2)':'var(--txt2)'}">${possession2}%</span>
      </div>
      <div class="ratings-row">
        <div class="ratings-side">
          ${['FWD','MID','DEF','GK'].map(pos=>`<div class="rating-item"><span class="pos-tag">${pos}</span><span class="rating-val ${ratingClass(r1[pos])}">${r1[pos]||'—'}</span></div>`).join('')}
        </div>
        <div style="font-size:10px;color:var(--txt3);writing-mode:vertical-lr;text-align:center;letter-spacing:.1em">RATINGS</div>
        <div class="ratings-side right">
          ${['FWD','MID','DEF','GK'].map(pos=>`<div class="rating-item"><span class="rating-val ${ratingClass(r2[pos])}">${r2[pos]||'—'}</span><span class="pos-tag">${pos}</span></div>`).join('')}
        </div>
      </div>
      ${effects?.length?`<div class="match-effects">${effects.map(e=>`<div class="match-effect ${e.includes('⭐')?'star':e.includes('📋')?'coach':''}">${e}</div>`).join('')}</div>`:''}
    </div>`

  popup.style.display='block'; clearTimeout(popup._t)
  popup._t=setTimeout(()=>popup.style.display='none',6000)
}

function ratingClass(r) {
  if (!r) return ''
  if (r>=8.5) return 'rating-gold'
  if (r>=7.5) return 'rating-green'
  if (r>=6.0) return 'rating-white'
  return 'rating-red'
}

// ── Play tab ──────────────────────────────────────────────────
function renderPlay() {
  const el=$('tab-play'); if(!el) return
  if (!S.teams?.length) {
    el.innerHTML=`<div style="text-align:center;padding:48px 20px">
      <div style="font-size:64px;margin-bottom:16px">★</div>
      <div style="font-family:var(--font-head);font-size:32px;font-weight:900;color:var(--blue2);letter-spacing:.12em">CHAMPIONS LEAGUE</div>
      <div style="color:var(--txt2);margin:8px 0 28px">32 clubs. One trophy. Your story starts here.</div>
      <button class="btn btn-primary" onclick="handleMain()" style="padding:12px 32px;font-size:14px">▶ Begin Season 1</button>
    </div>`; return
  }
  const phase=S.phase
  let html=''

  if (phase==='done') {
    const aw=S.seasonAwards||{}
    html=`
      <div class="champion-banner">
        <div style="font-size:56px">🏆</div>
        <div class="champion-title">CHAMPIONS OF EUROPE</div>
        <div class="champion-name">${flag(S.champion?.cc||'')} ${S.champion?.name}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:6px">Season ${S.season}</div>
      </div>
      ${aw.topScorer||aw.offMVP||aw.defMVP?`
      <div class="sec">SEASON AWARDS</div>
      <div class="awards-grid">
        ${aw.topScorer?`<div class="award-card"><div class="award-icon">⚽</div><div class="award-label">Top Scorer</div><div class="award-name">${aw.topScorer.name}</div><div class="award-sub">${aw.topScorer.goals} goals · ${aw.topScorer.team}</div></div>`:''}
        ${aw.offMVP?`<div class="award-card"><div class="award-icon">🌟</div><div class="award-label">Offensive MVP</div><div class="award-name">${aw.offMVP.name}</div><div class="award-sub">${aw.offMVP.rating} avg · ${aw.offMVP.pos} · ${aw.offMVP.team}</div></div>`:''}
        ${aw.defMVP?`<div class="award-card"><div class="award-icon">🛡️</div><div class="award-label">Defensive MVP</div><div class="award-name">${aw.defMVP.name}</div><div class="award-sub">${aw.defMVP.rating} avg · ${aw.defMVP.pos} · ${aw.defMVP.team}</div></div>`:''}
      </div>`:''}
      ${renderTopScorers()}`
  } else if (phase==='groups') {
    const played=S.groupMatches.filter(m=>m.played).length, total=S.groupMatches.length
    html=`<div class="sec">GROUP STAGE — ${played}/${total}</div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${(played/total)*100}%"></div></div>
      ${renderRecentResults()}`
  } else if (phase==='knockout') {
    const round=S.knockoutRounds[S.knockoutRounds.length-1]
    html=`<div class="sec">${round?.name?.toUpperCase()||'KNOCKOUT'}</div>${renderRecentResults()}`
  } else if (phase==='qualifying') {
    html=`<div class="sec">QUALIFIED — ${S.teams?.length||0} TEAMS</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px">
        ${[...(S.teams||[])].sort((a,b)=>b.rating-a.rating).map(t=>`
          <div class="card" style="padding:8px 10px">
            <div class="row"><span>${flag(t.cc)}</span><span style="font-weight:600;font-size:13px">${t.name}</span><span class="spacer"></span><span style="font-family:var(--font-head);color:var(--blue2)">${t.rating}</span></div>
            ${t.star?`<div style="font-size:10px;color:${tierColor(t.star.tier)};margin-top:3px">⭐ ${t.star.name}</div>`:''}
          </div>`).join('')}
      </div>`
  } else if (phase==='transfers') {
    html=`<div id="transfer-summary"></div>`
  }
  el.innerHTML=html
}

function renderTopScorers() {
  const sc=Object.entries(S.scorers||{}).sort((a,b)=>b[1]-a[1]).slice(0,5)
  if (!sc.length) return ''
  return `<div class="sec">TOP SCORERS</div><div class="card"><table class="data-table"><tbody>
    ${sc.map(([name,g],i)=>`<tr><td style="color:var(--txt3);width:24px">${i+1}</td><td style="font-weight:600">${name}</td><td style="color:var(--gold);font-family:var(--font-head);font-weight:700">${g}⚽</td></tr>`).join('')}
  </tbody></table></div>`
}

function renderRecentResults() {
  const recent=[...(S.allMatchResults||[])].reverse().slice(0,4)
  if (!recent.length) return ''
  return `<div class="sec">RECENT RESULTS</div>`+recent.map(r=>`
    <div class="match-result-card" style="cursor:pointer">
      <div class="match-teams">
        <div class="match-team">${flag(r.t1cc)} ${r.t1name}</div>
        <div class="match-score" style="font-size:20px">${r.g1} – ${r.g2}</div>
        <div class="match-team right">${r.t2name} ${flag(r.t2cc)}</div>
      </div>
    </div>`).join('')
}

function renderTransferSummary(res) {
  const el=$('tab-play'); if(!el) return
  let html='<div class="sec">TRANSFER WINDOW</div>'
  const moves=[...res.playerMoves,...res.coachMoves]
  if (!moves.length) { html+='<div class="empty">Quiet window.</div>'; el.innerHTML=html; return }

  const players=res.playerMoves, coaches=res.coachMoves
  if (players.length) {
    html+='<div class="sec" style="color:var(--blue2)">PLAYER MOVES ('+players.length+')</div>'
    html+=players.map(m=>`<div class="card" style="padding:8px 12px">
      <div class="row"><span style="font-weight:600">${m.name}</span>${tierBadge(m.tier)}<span style="font-size:10px;color:var(--txt3)">${m.type}</span></div>
      <div style="font-size:11px;color:var(--txt3)">${m.from} → <span style="color:var(--blue2)">${m.to}</span></div>
    </div>`).join('')
  }
  if (coaches.length) {
    html+='<div class="sec" style="color:var(--legendary)">COACHING CHANGES</div>'
    html+=coaches.map(m=>`<div class="card" style="padding:8px 12px">
      <div class="row"><span style="font-weight:600">${m.name}</span>${tierBadge(m.tier)}</div>
      <div style="font-size:11px;color:var(--txt3)">${m.type==='retired'?`Retired from ${m.from}`:m.type==='signed'?`Signed by <span style="color:var(--green)">${m.to}</span>`:`${m.from} → <span style="color:var(--blue2)">${m.to}</span>`}</div>
    </div>`).join('')
  }
  el.innerHTML=html
}

// ── Groups tab ────────────────────────────────────────────────
function renderGroups() {
  const el=$('tab-groups'); if(!el||!S.groups?.length){if(el)el.innerHTML='<div class="empty">Groups not drawn yet</div>';return}
  let html='<div class="groups-grid">'
  S.groups.forEach(grp=>{
    const sorted=[...grp.teams].sort((a,b)=>(b.pts||0)-(a.pts||0)||(b.gd||0)-(a.gd||0)||(b.gf||0)-(a.gf||0))
    html+=`<div class="group-card"><div class="group-title">Group ${grp.id}</div>
      ${sorted.map((t,i)=>`<div class="group-team ${i<2?'qualifies':''}">
        <span>${flag(t.cc)}</span><span style="flex:1;font-size:12px">${t.name}</span>
        ${t.star?`<span style="font-size:9px;color:${tierColor(t.star.tier)}" title="${t.star.name}">⭐</span>`:''}
        <span class="team-record">${t.w||0}/${t.d||0}/${t.l||0}</span>
        <span class="team-pts">${t.pts||0}</span>
      </div>`).join('')}
    </div>`
  })
  html+='</div>'
  const played=S.groupMatches?.filter(m=>m.played)||[]
  if (played.length) {
    html+='<div class="sec">RESULTS</div>'
    html+=played.slice(-12).reverse().map(m=>`<div class="match-result-card" style="padding:8px 12px">
      <div style="font-size:9px;color:var(--txt3);font-family:var(--font-head)">GROUP ${S.groups[m.gi]?.id}</div>
      <div class="match-teams" style="margin-top:3px">
        <div class="match-team">${flag(m.t1.cc)} ${m.t1.name}</div>
        <div class="match-score" style="font-size:18px">${m.result.g1} – ${m.result.g2}</div>
        <div class="match-team right">${m.t2.name} ${flag(m.t2.cc)}</div>
      </div>
    </div>`).join('')
  }
  el.innerHTML=html
}

// ── Bracket tab ───────────────────────────────────────────────
function renderBracket() {
  const el=$('tab-bracket'); if(!el||!S.knockoutRounds?.length){if(el)el.innerHTML='<div class="empty">Knockout not started</div>';return}
  let html='<div class="bracket-scroll"><div class="bracket-rounds">'
  S.knockoutRounds.forEach(round=>{
    html+=`<div class="bracket-col"><div class="bracket-round-name">${round.name}</div>`
    round.matches.forEach(m=>{
      const w=m.result?.winner
      html+=`<div class="bracket-match">
        <div class="bracket-team ${w?w===m.t1?'winner':'loser':''}">${m.t1?`${flag(m.t1.cc)} ${m.t1.name}`:'-'}${m.result?`<span class="bracket-score">${m.result.g1}</span>`:''}</div>
        <div class="bracket-team ${w?w===m.t2?'winner':'loser':''}">${m.t2?`${flag(m.t2.cc)} ${m.t2.name}`:'-'}${m.result?`<span class="bracket-score">${m.result.g2}</span>`:''}</div>
      </div>`
    })
    html+='</div>'
  })
  // Add pending rounds as empty columns so user can see the full path
  const roundNames=['Round of 16','Quarter-finals','Semi-finals','Final']
  const existingNames=S.knockoutRounds.map(r=>r.name)
  roundNames.forEach(name=>{
    if (existingNames.includes(name)) return
    const prevRound=S.knockoutRounds[S.knockoutRounds.length-1]
    if (!prevRound) return
    // Only show next pending round
    const nextIdx=roundNames.indexOf(name)
    const prevIdx=roundNames.indexOf(existingNames[existingNames.length-1])
    if (nextIdx!==prevIdx+1) return
    const slots=prevRound.matches.length/2
    html+=`<div class="bracket-col"><div class="bracket-round-name">${name}</div>`
    for(let i=0;i<slots;i++) html+=`<div class="bracket-match"><div class="bracket-team tbd">TBD</div><div class="bracket-team tbd">TBD</div></div>`
    html+='</div>'
  })
  if (S.champion) html+=`<div class="bracket-col"><div class="bracket-round-name">CHAMPION</div><div class="bracket-match" style="border-color:var(--gold)"><div class="bracket-team winner" style="color:var(--gold)">🏆 ${flag(S.champion.cc)} ${S.champion.name}</div></div></div>`
  html+='</div></div>'
  el.innerHTML=html
}

// ── Teams tab (with effective stats) ─────────────────────────
function renderTeams() {
  const el=$('tab-teams'); if(!el||!S.teams?.length){if(el)el.innerHTML='<div class="empty">No teams yet</div>';return}
  const sorted=[...S.teams].sort((a,b)=>b.rating-a.rating)
  let html=`<div class="table-wrap"><table class="data-table">
    <thead><tr><th>#</th><th>Club</th><th>ATT</th><th>DEF</th><th>STA</th><th>MEN</th><th>SET</th><th>OVR</th><th>Star</th><th>Coach</th></tr></thead><tbody>`
  sorted.forEach((t,i)=>{
    const allTeam=S.allTeams?.find(at=>at.id===t.id)
    const stars=allTeam?.stars||[]
    const eff=getEffStats(t)
    const o=Math.round((eff.attack+eff.defense+eff.stamina+eff.mental+eff.setPieces)/5)
    html+=`<tr>
      <td style="color:var(--txt3)">${i+1}</td>
      <td><strong style="cursor:pointer;color:var(--blue2)" onclick="openTeamModal('${t.id}')">${flag(t.cc)} ${t.name}</strong></td>
      <td class="num" style="color:var(--blue2)">${eff.attack}</td>
      <td class="num" style="color:var(--blue2)">${eff.defense}</td>
      <td class="num" style="color:var(--blue2)">${eff.stamina}</td>
      <td class="num" style="color:var(--blue2)">${eff.mental}</td>
      <td class="num" style="color:var(--blue2)">${eff.setPieces}</td>
      <td class="num" style="color:var(--gold);font-weight:700;font-family:var(--font-head)">${o}</td>
      <td style="font-size:11px">
        <span style="color:var(--gold);font-family:var(--font-head);font-weight:700">${stars.length}⭐</span>
        ${stars.length?`<span style="color:${tierColor(stars[0].tier)};font-size:10px;margin-left:4px">${stars[0].name}</span>`:''}
      </td>
      <td>${t.coach?`<span style="color:${tierColor(t.coach.tier)};font-size:11px">📋 ${t.coach.name}</span>`:'—'}</td>
    </tr>`
  })
  html+='</tbody></table></div>'
  el.innerHTML=html
}

// ── Stars & Coaches tab ───────────────────────────────────────
let starSort='tier', coachSort='tier'

function renderStars() {
  const el=$('tab-stars'); if(!el) return
  // Collect ALL stars from allTeams
  const allStars=[]
  ;(S.allTeams||[]).forEach(t=>(t.stars||[]).forEach(s=>allStars.push({...s,teamName:t.name,cc:t.cc})))
  const coaches=S.coaches||[]

  const sortFn = k => k==='tier'?(a,b)=>TIER_ORDER.indexOf(a.tier)-TIER_ORDER.indexOf(b.tier)
    :k==='goals'?(a,b)=>(b.goals||0)-(a.goals||0)
    :k==='fame'?(a,b)=>(b.fame||0)-(a.fame||0)
    :(a,b)=>(b.fame||0)-(a.fame||0)

  const sortedStars=[...allStars].sort(sortFn(starSort))
  const sortedCoaches=[...coaches].sort((a,b)=>TIER_ORDER.indexOf(a.tier)-TIER_ORDER.indexOf(b.tier))

  let html=`<div class="sec">STAR PLAYERS (${allStars.length})</div>
    <div class="sort-row">
      Sort: 
      ${['tier','goals','fame'].map(k=>`<button class="sort-btn ${starSort===k?'active':''}" onclick="setStarSort('${k}')">${k}</button>`).join('')}
    </div>
    <div class="star-grid">`

  sortedStars.forEach(s=>{
    const avgR=s.ratings?.length?(s.ratings.reduce((a,b)=>a+b,0)/s.ratings.length).toFixed(1):null
    const bonusStr=Object.entries(s.statBonus||{}).filter(([,v])=>v>0).map(([k,v])=>`+${v} ${k.slice(0,3).toUpperCase()}`).join(' ')
    html+=`<div class="star-card ${s.tier}">
      <div class="row" style="margin-bottom:4px">${tierBadge(s.tier)}<span class="star-pos">${s.pos}</span><span class="spacer"></span><span style="font-size:10px;color:var(--txt3)">⚡${s.fame||0}</span></div>
      <div class="star-name">${s.name}</div>
      <div class="star-team">${flag(s.cc)} ${s.teamName}</div>
      <div style="font-size:10px;color:${tierColor(s.tier)};margin-top:4px">${bonusStr}</div>
      <div class="star-stats">
        <span class="star-stat">⚽ <span>${s.goals||0}</span></span>
        ${avgR?`<span class="star-stat">★ <span>${avgR}</span></span>`:''}
        <span class="star-stat">🥇 <span>${s.medals?.gold||0}</span></span>
      </div>
    </div>`
  })
  html+='</div>'

  html+=`<div class="sec">COACHES (${coaches.length})</div>`
  sortedCoaches.forEach(c=>{
    const team=S.allTeams?.find(t=>t.id===c.teamId)
    const bonusStr=Object.entries(c.statBonus||{}).filter(([,v])=>v>0).map(([k,v])=>`+${v} ${k.slice(0,3).toUpperCase()}`).join(' ')
    const specials=[c.jogoBonito&&'Jogo Bonito',c.ironWall&&'Iron Wall',c.cancelGoal&&'Tactical Cancel',c.alwaysQualify&&'Always Qualifies'].filter(Boolean)
    html+=`<div class="coach-card">
      <div class="coach-tier-bar" style="background:${tierColor(c.tier)}"></div>
      <div style="flex:1">
        <div class="coach-name">${c.name}</div>
        <div class="coach-team">${flag(team?.cc||'eu')} ${c.teamName}</div>
        <div style="font-size:10px;color:var(--txt2);margin-top:2px">${bonusStr}</div>
        ${specials.length?`<div style="font-size:10px;color:var(--gold);margin-top:2px">${specials.join(' · ')}</div>`:''}
      </div>
      ${tierBadge(c.tier)}
    </div>`
  })
  el.innerHTML=html
}

window.setStarSort = function(k) { starSort=k; renderStars() }

// ── History tab ───────────────────────────────────────────────
function getPlayerCurrentTeam(playerName) {
  for (const t of (S.allTeams||[])) {
    if ((t.stars||[]).some(s=>s.name===playerName)) return t.name
  }
  return ''
}

function renderHistory() {
  const el=$('tab-history'); if(!el) return
  if (!S.history?.length){el.innerHTML='<div class="empty">No history yet</div>';return}

  // Team ranking: gold > final > semifinal
  const teamRank={}
  S.history.forEach(h=>{
    Object.entries(h.roundReached||{}).forEach(([id,reached])=>{
      const tname=S.allTeams?.find(t=>t.id===id)?.name||id
      if (!teamRank[id]) teamRank[id]={name:tname,gold:0,final:0,semi:0,qf:0,r16:0}
      if (reached==='Winner') teamRank[id].gold++
      else if (reached==='Final') teamRank[id].final++
      else if (reached==='Semi-finals') teamRank[id].semi++
      else if (reached==='Quarter-finals') teamRank[id].qf++
      else if (reached==='Round of 16') teamRank[id].r16++
    })
  })
  const teamRankList=Object.values(teamRank).sort((a,b)=>b.gold-a.gold||b.final-a.final||b.semi-a.semi)

  // All-time team stats
  const teamStatsList=Object.entries(S.teamStats||{}).map(([id,st])=>({...st,id})).sort((a,b)=>b.wins-a.wins||b.gf-a.gf)

  // Player history: medals, awards
  const playerStats={}
  S.history.forEach(h=>{
    ;(h.stars||[]).forEach(s=>{
      if (!playerStats[s.name]) playerStats[s.name]={name:s.name,pos:s.pos,tier:s.tier,gold:0,silver:0,bronze:0,offMVP:0,defMVP:0,topScorer:0,goals:0,participations:0,games:0,ratings:[]}
      const p=playerStats[s.name]
      p.participations++; p.goals+=(s.goals||0)
      if (s.medals?.gold) p.gold+=s.medals.gold
      if (s.medals?.silver) p.silver+=s.medals.silver
      if (s.medals?.bronze) p.bronze+=s.medals.bronze
      if (s.avgRating) p.ratings.push(s.avgRating)
      if (h.awards?.topScorer?.name===s.name) p.topScorer++
      if (h.awards?.offMVP?.name===s.name) p.offMVP++
      if (h.awards?.defMVP?.name===s.name) p.defMVP++
    })
  })
  const playerList=Object.values(playerStats)

  let html=`
    <div class="sec">SEASON HISTORY</div>
    ${[...S.history].reverse().map(h=>`
      <div class="history-card">
        <div class="history-season">SEASON ${h.season}</div>
        <div class="history-champion">🏆 ${flag(h.cc||'')} ${h.championName}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:4px">${h.totalGoals||0} goals · Top scorer: ${h.topScorers?.[0]?.[0]||'—'} (${h.topScorers?.[0]?.[1]||0}⚽)</div>
        ${h.awards?.offMVP?`<div style="font-size:11px;color:var(--txt3)">🌟 ${h.awards.offMVP.name} Off MVP · 🛡️ ${h.awards.defMVP?.name||'—'} Def MVP</div>`:''}
      </div>`).join('')}

    <div class="sec">TEAM RANKINGS</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Team</th><th class="num">🥇</th><th class="num">🥈</th><th class="num">SF</th><th class="num">QF</th></tr></thead><tbody>
      ${teamRankList.slice(0,20).map((t,i)=>`<tr>
        <td style="color:var(--txt3)">${i+1}</td>
        <td><strong>${t.name}</strong></td>
        <td class="num" style="color:var(--gold)">${t.gold||'—'}</td>
        <td class="num">${t.final||'—'}</td>
        <td class="num" style="color:var(--txt3)">${t.semi||'—'}</td>
        <td class="num" style="color:var(--txt3)">${t.qf||'—'}</td>
      </tr>`).join('')}
      </tbody></table></div>

    ${teamStatsList.length?`
    <div class="sec">ALL-TIME TEAM STATS</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th></tr></thead><tbody>
      ${teamStatsList.slice(0,20).map(t=>`<tr>
        <td>${flag(t.cc)} <strong>${t.name}</strong></td>
        <td class="num">${t.played}</td>
        <td class="num" style="color:var(--green)">${t.wins}</td>
        <td class="num">${t.draws}</td>
        <td class="num" style="color:var(--red)">${t.losses}</td>
        <td class="num">${t.gf}</td>
        <td class="num" style="color:var(--txt3)">${t.ga}</td>
      </tr>`).join('')}
      </tbody></table></div>`:''}

    <div class="sec">PLAYER TITLES</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Player</th><th>Pos</th><th>Current Team</th><th class="num">🥇</th><th class="num">🥈</th><th class="num">🥉</th><th class="num">Goals</th></tr></thead><tbody>
      ${[...playerList].sort((a,b)=>b.gold-a.gold||b.silver-a.silver).slice(0,10).map(p=>{
        // Find current team from allTeams stars
        const currentTeam = S.allTeams?.find(t=>(t.stars||[]).some(s=>s.name===p.name))
        return`<tr>
          <td><strong>${p.name}</strong><br><span style="font-size:10px;color:var(--txt3)">${getPlayerCurrentTeam(p.name)}</span></td><td>${p.pos}</td>
          <td style="color:var(--txt2);font-size:11px">${currentTeam?`${flag(currentTeam.cc)} ${currentTeam.name}`:'—'}</td>
          <td class="num" style="color:var(--gold)">${p.gold||'—'}</td>
          <td class="num">${p.silver||'—'}</td>
          <td class="num" style="color:#cd7f32">${p.bronze||'—'}</td>
          <td class="num">${p.goals}</td>
        </tr>`}).join('')}
      </tbody></table></div>

    <div class="sec">TOP OFFENSIVE MVPs</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Player</th><th>Pos</th><th>Current Team</th><th class="num">Off MVPs</th><th class="num">Avg Rating</th></tr></thead><tbody>
      ${[...playerList].filter(p=>['FWD','MID'].includes(p.pos)).sort((a,b)=>b.offMVP-a.offMVP).slice(0,5).map(p=>{
        const ct=S.allTeams?.find(t=>(t.stars||[]).some(s=>s.name===p.name))
        return`<tr>
          <td><strong>${p.name}</strong><br><span style="font-size:10px;color:var(--txt3)">${getPlayerCurrentTeam(p.name)}</span></td><td>${p.pos}</td>
          <td style="font-size:11px;color:var(--txt2)">${ct?`${flag(ct.cc)} ${ct.name}`:'—'}</td>
          <td class="num" style="color:var(--gold)">${p.offMVP}</td>
          <td class="num">${p.ratings.length?(p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length).toFixed(1):'—'}</td>
        </tr>`}).join('')}
      </tbody></table></div>

    <div class="sec">TOP DEFENSIVE MVPs</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Player</th><th>Pos</th><th>Current Team</th><th class="num">Def MVPs</th><th class="num">Avg Rating</th></tr></thead><tbody>
      ${[...playerList].filter(p=>['DEF','GK'].includes(p.pos)).sort((a,b)=>b.defMVP-a.defMVP).slice(0,5).map(p=>{
        const ct=S.allTeams?.find(t=>(t.stars||[]).some(s=>s.name===p.name))
        return`<tr>
          <td><strong>${p.name}</strong><br><span style="font-size:10px;color:var(--txt3)">${getPlayerCurrentTeam(p.name)}</span></td><td>${p.pos}</td>
          <td style="font-size:11px;color:var(--txt2)">${ct?`${flag(ct.cc)} ${ct.name}`:'—'}</td>
          <td class="num" style="color:var(--blue2)">${p.defMVP}</td>
          <td class="num">${p.ratings.length?(p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length).toFixed(1):'—'}</td>
        </tr>`}).join('')}
      </tbody></table></div>`

  el.innerHTML=html
}

// ── Settings ──────────────────────────────────────────────────
window.openSettings  = () => { $('settings-overlay').style.display='flex' }
window.closeSettings = () => { $('settings-overlay').style.display='none' }

window.openSaveManager = async function() {
  closeSettings(); $('saves-overlay').style.display='flex'; await renderSaveSlots()
}
window.closeSaveManager = () => { $('saves-overlay').style.display='none' }

async function renderSaveSlots() {
  const slots=await allSlots(), el=$('saves-list')
  if (!slots.length){el.innerHTML='<div class="empty">No saves yet</div>';return}
  el.innerHTML=slots.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)).map(s=>`
    <div class="save-slot">
      <div class="save-slot-info"><div class="save-slot-name">${s.slotName}</div><div class="save-slot-meta">Season ${s.season} · ${new Date(s.savedAt).toLocaleDateString()}</div></div>
      <button class="btn btn-primary btn-sm" onclick="doLoadSlot('${s.slotName.replace(/'/g,"\\'")}')">Load</button>
      <button class="btn btn-sm" onclick="doDeleteSlot('${s.slotName.replace(/'/g,"\\'")}')">Del</button>
    </div>`).join('')
}

window.doSaveSlot = async function() {
  const name=$('save-name').value.trim(); if(!name){toast('Enter a name','error');return}
  await saveSlot(name); $('save-name').value=''; toast('Saved: '+name); renderSaveSlots()
}
window.doLoadSlot = async function(name) {
  await loadSlot('slot__'+name.replace(/[^\w\s-]/g,'_')); closeSaveManager(); updatePhaseUI(); renderPlay(); toast('Loaded: '+name)
}
window.doDeleteSlot = async function(name) {
  await deleteSlot('slot__'+name.replace(/[^\w\s-]/g,'_')); renderSaveSlots()
}
window.doExport = function() { closeSettings(); exportSave(); toast('Exported!') }
window.doImport = async function(ev) {
  const file=ev.target.files[0]; if(!file) return
  try { await importSave(file); updatePhaseUI(); renderPlay(); toast('Imported Season '+S.season) }
  catch(e) { toast('Import failed: '+e.message,'error') }
  ev.target.value=''
}

let _confirmCb=null
window.confirmReset = function() {
  closeSettings()
  $('confirm-icon').textContent='🗑️'; $('confirm-title').textContent='Reset World?'
  $('confirm-msg').textContent='All seasons, history and saves will be deleted forever.'
  $('confirm-ok').textContent='Delete Everything'; $('confirm-ok').className='btn btn-danger'
  _confirmCb=async()=>{await clearGame();location.reload()}
  $('confirm-overlay').style.display='flex'
}
window.confirmAccept = () => { $('confirm-overlay').style.display='none'; _confirmCb?.(); _confirmCb=null }
window.confirmDeny   = () => { $('confirm-overlay').style.display='none'; _confirmCb=null }

// ── Init ──────────────────────────────────────────────────────
window.openTeamModal = function(teamId) {
  const team = S.teams?.find(t=>t.id===teamId) || S.allTeams?.find(t=>t.id===teamId)
  if (!team) return
  const allTeam = S.allTeams?.find(t=>t.id===teamId)
  const stars = allTeam?.stars || []
  const coach = S.coaches?.find(c=>c.teamId===teamId)
  const eff = getEffStats(team)
  const ovr = Math.round((eff.attack+eff.defense+eff.stamina+eff.mental+eff.setPieces)/5)
  const TIER_ORDER2 = ['legendary','epic','rare','uncommon','common']
  const sortedStars = [...stars].sort((a,b)=>TIER_ORDER2.indexOf(a.tier)-TIER_ORDER2.indexOf(b.tier))

  // History for this team
  const reached = S.history?.map(h=>h.roundReached?.[teamId]).filter(Boolean) || []
  const titles = reached.filter(r=>r==='Winner').length
  const finals = reached.filter(r=>r==='Final').length
  const semis  = reached.filter(r=>r==='Semi-finals').length

  const statNames = {attack:'Attack',defense:'Defense',stamina:'Stamina',mental:'Mental',setPieces:'Set Pieces'}
  const baseStats = team.stats || {}

  $('team-modal-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="font-size:32px">${flag(team.cc)}</div>
      <div>
        <div style="font-family:var(--font-head);font-size:22px;font-weight:900;color:var(--txt)">${team.name}</div>
        <div style="font-size:12px;color:var(--txt2)">Rating: ${team.rating||ovr} · Overall: <span style="color:var(--gold);font-weight:700">${ovr}</span></div>
      </div>
      <button class="btn btn-icon" style="margin-left:auto" onclick="closeTeamModal()">✕</button>
    </div>

    ${titles||finals||semis?`
    <div class="sec">TOURNAMENT HISTORY</div>
    <div class="row" style="gap:16px;margin-bottom:10px">
      ${titles?`<div style="text-align:center"><div style="font-size:24px">🏆</div><div style="font-family:var(--font-head);font-size:18px;color:var(--gold)">${titles}</div><div style="font-size:10px;color:var(--txt3)">TITLES</div></div>`:''}
      ${finals?`<div style="text-align:center"><div style="font-size:24px">🥈</div><div style="font-family:var(--font-head);font-size:18px">${finals}</div><div style="font-size:10px;color:var(--txt3)">FINALS</div></div>`:''}
      ${semis?`<div style="text-align:center"><div style="font-size:24px">🏅</div><div style="font-family:var(--font-head);font-size:18px">${semis}</div><div style="font-size:10px;color:var(--txt3)">SEMIS</div></div>`:''}
    </div>`:'<div class="empty" style="padding:8px">No CL history yet</div>'}

    <div class="sec">CURRENT STATS (effective)</div>
    ${Object.entries(statNames).map(([k,label])=>`
      <div class="stat-row">
        <span class="stat-lbl">${label}</span>
        <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.round(eff[k]/1.3)}%"></div></div>
        <span class="stat-val">${eff[k]}</span>
        ${baseStats[k]&&eff[k]!==baseStats[k]?`<span style="font-size:10px;color:var(--green)">+${eff[k]-baseStats[k]}</span>`:''}
      </div>`).join('')}

    <div class="sec">STARS (${stars.length})</div>
    ${sortedStars.length?sortedStars.map(s=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bg4)">
        <div style="width:3px;height:32px;background:${tierColor(s.tier)};border-radius:2px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${s.name}</div>
          <div style="font-size:11px;color:var(--txt2)">${s.pos} · ${tierBadge(s.tier)}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:var(--txt3)">
          ⚽ ${s.goals||0} · ⚡ ${s.fame||0}
          ${s.medals?.gold?`<br>🥇${s.medals.gold}`:''}
        </div>
      </div>`).join(''):'<div class="empty" style="padding:8px">No stars</div>'}

    ${coach?`
    <div class="sec">COACH</div>
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
      <div style="width:3px;height:40px;background:${tierColor(coach.tier)};border-radius:2px"></div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px">${coach.name}</div>
        <div style="font-size:11px;color:var(--txt2)">${tierBadge(coach.tier)}</div>
        <div style="font-size:10px;color:var(--txt3);margin-top:3px">${[coach.jogoBonito&&'Jogo Bonito',coach.ironWall&&'Iron Wall',coach.cancelGoal&&'Tactical Cancel',coach.alwaysQualify&&'Always Qualifies'].filter(Boolean).join(' · ')||'No specials'}</div>
      </div>
    </div>`:'<div class="empty">No coach assigned</div>'}
  `
  $('team-modal-overlay').style.display='flex'
}
window.closeTeamModal = () => { $('team-modal-overlay').style.display='none' }

async function init() {
  const loaded=await loadGame()
  if (!loaded) { S.phase=S.phase||'idle'; S.season=S.season||1 }
  updatePhaseUI(); renderPlay()
  if (S.groups?.length) renderGroups()
  if (S.knockoutRounds?.length) renderBracket()
}
init()

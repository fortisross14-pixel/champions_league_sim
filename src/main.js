import {
  S, autoSave, loadGame, clearGame, exportSave, importSave,
  saveSlot, loadSlot, allSlots, deleteSlot, dbLoad,
  snapshotPreSeason, snapshotPreTournament,
  hasPreSeasonSnapshot, hasPreTournamentSnapshot,
  restartSeason, restartTournament,
  getActiveSlot, setActiveSlot, clearActiveSlot,
  getSlotSummaries, startFreshInSlot, SLOT_KEYS,
} from './store.js'
import {
  runQualification, drawGroups, buildClassicBracket, initStarsAndCoaches, linkStarsToTeams,
  playGroupMatch, buildKnockout, playKnockoutMatch, advanceKnockout,
  runMarket, runTransfers, startNewSeason, runLocalLeagues,
  runStatsUpdate,
  tierOf, tierLabel, tierColor,
  describeStarSkills, describeCoachSkills, describeGMSkills, getStarSkillData,
  COACH_TRAITS,
  regenStarSkills, regenCoachSkills,
  annualIncome, baseSpend, baseSquadSalary, operatingCosts,
  teamAnnualSalary, teamStarSalary, teamCoachSalary, effectiveMoney,
  playerAge, playerMarketValue, financeSnapshot, currentCalendarYear,
} from './engine/season.js'
import { ovr, getEffStats } from './engine/match.js'
import { COUNTRY_NAME } from './data/players.js'
import { LEAGUES } from './data/teams.js'

const $ = id => document.getElementById(id)
const FLAG_PATTERNS = {
  es:{type:'h',c:['#AA151B','#F1BF00','#AA151B'],w:[1,2,1]},
  de:{type:'h',c:['#000','#DD0000','#FFCE00']}, it:{type:'v',c:['#009246','#fff','#CE2B37']},
  fr:{type:'v',c:['#0055A4','#fff','#EF4135']}, pt:{type:'v',c:['#046A38','#DA291C'],w:[2,3]},
  nl:{type:'h',c:['#AE1C28','#fff','#21468B']}, ru:{type:'h',c:['#fff','#0039A6','#D52B1E']},
  ua:{type:'h',c:['#0057B7','#FFD700']}, tr:{type:'solid',c:['#E30A17'],mark:'crescent'},
  gr:{type:'stripes',c:['#0D5EAF','#fff']}, br:{type:'solid',c:['#009C3B'],mark:'diamond'},
  ar:{type:'h',c:['#74ACDF','#fff','#74ACDF'],mark:'sun'}, uy:{type:'stripes',c:['#fff','#5CB8E6']},
  mx:{type:'v',c:['#006847','#fff','#CE1126']}, co:{type:'h',c:['#FCD116','#003893','#CE1126'],w:[2,1,1]},
  cl:{type:'h',c:['#fff','#D52B1E'],mark:'triangle'}, pe:{type:'v',c:['#D91023','#fff','#D91023']},
  ec:{type:'h',c:['#FFD100','#034EA2','#ED1C24'],w:[2,1,1]}, py:{type:'h',c:['#D52B1E','#fff','#0038A8']},
  ve:{type:'h',c:['#F4C300','#003DA5','#CF142B']}, cr:{type:'h',c:['#002B7F','#fff','#CE1126','#fff','#002B7F'],w:[1,1,2,1,1]},
  us:{type:'stripes',c:['#B22234','#fff']}, ca:{type:'v',c:['#D80621','#fff','#D80621']},
  ie:{type:'v',c:['#169B62','#fff','#FF883E']}, au:{type:'solid',c:['#012169'],mark:'saltire'},
  sn:{type:'v',c:['#00853F','#FDEF42','#E31B23']}, ng:{type:'v',c:['#008751','#fff','#008751']},
  gh:{type:'h',c:['#CE1126','#FCD116','#006B3F']}, ci:{type:'v',c:['#F77F00','#fff','#009E60']},
  cm:{type:'v',c:['#007A5E','#CE1126','#FCD116']}, ml:{type:'v',c:['#14B53A','#FCD116','#CE1126']},
  za:{type:'h',c:['#007749','#FFB81C','#DE3831']}, ao:{type:'h',c:['#CC092F','#000']},
  cv:{type:'h',c:['#003893','#fff','#CF2027','#fff','#003893'],w:[4,1,1,1,2]}, mz:{type:'h',c:['#009739','#000','#FCE300']},
  ma:{type:'solid',c:['#C1272D'],mark:'crescent'}, dz:{type:'v',c:['#006233','#fff'],mark:'crescent'},
  tn:{type:'solid',c:['#E70013'],mark:'crescent'}, eg:{type:'h',c:['#CE1126','#fff','#000']},
  sa:{type:'solid',c:['#006C35']}, qa:{type:'v',c:['#fff','#8A1538'],w:[1,3]},
  jp:{type:'solid',c:['#fff'],mark:'redsun'}, kr:{type:'solid',c:['#fff'],mark:'taegeuk'},
  rs:{type:'h',c:['#C6363C','#0C4076','#fff']}, ba:{type:'solid',c:['#002395'],mark:'triangle'},
  'gb-wls':{type:'h',c:['#fff','#00AB39']},
  be:{type:'v',c:['#000','#FFD90C','#EF3340']}, ch:{type:'solid',c:['#D52B1E'],mark:'cross'},
  at:{type:'h',c:['#ED2939','#fff','#ED2939']}, ro:{type:'v',c:['#002B7F','#FCD116','#CE1126']},
  cz:{type:'h',c:['#fff','#D7141A'],mark:'triangle'}, pl:{type:'h',c:['#fff','#DC143C']},
  no:{type:'solid',c:['#BA0C2F'],mark:'nordic-blue'}, se:{type:'solid',c:['#006AA7'],mark:'nordic-yellow'},
  dk:{type:'solid',c:['#C8102E'],mark:'nordic-white'}, hr:{type:'h',c:['#FF0000','#fff','#171796'],mark:'checker'},
  hu:{type:'h',c:['#CE2939','#fff','#477050']}, bg:{type:'h',c:['#fff','#00966E','#D62612']},
  md:{type:'v',c:['#003F87','#FFD200','#CE1126']}, lv:{type:'h',c:['#9E3039','#fff','#9E3039'],w:[2,1,2]},
  si:{type:'h',c:['#fff','#005DA4','#ED1C24']}, gi:{type:'h',c:['#fff','#DA000C']},
  'gb-eng':{type:'solid',c:['#fff'],mark:'england'}, 'gb-sct':{type:'solid',c:['#0065BD'],mark:'saltire'},
  eu:{type:'solid',c:['#003399'],mark:'eu'},
}
function flag(cc) {
  const p = FLAG_PATTERNS[cc] || {type:'solid',c:['#6b7280']}
  const w=30,h=20, parts=[]
  if(p.type==='h'){
    const weights=p.w||p.c.map(()=>1), total=weights.reduce((a,b)=>a+b,0); let y=0
    p.c.forEach((c,i)=>{const hh=h*weights[i]/total;parts.push(`<rect x="0" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`);y+=hh})
  } else if(p.type==='v'){
    const weights=p.w||p.c.map(()=>1), total=weights.reduce((a,b)=>a+b,0); let x=0
    p.c.forEach((c,i)=>{const ww=w*weights[i]/total;parts.push(`<rect x="${x}" y="0" width="${ww}" height="${h}" fill="${c}"/>`);x+=ww})
  } else if(p.type==='stripes'){
    for(let i=0;i<9;i++) parts.push(`<rect x="0" y="${i*h/9}" width="${w}" height="${h/9+0.2}" fill="${p.c[i%2]}"/>`)
  } else parts.push(`<rect width="${w}" height="${h}" fill="${p.c[0]}"/>`)
  const m=p.mark
  if(m==='england') parts.push('<rect x="12" width="6" height="20" fill="#CE1124"/><rect y="7" width="30" height="6" fill="#CE1124"/>')
  if(m==='saltire') parts.push('<path d="M0 0 L4 0 L30 16 L30 20 L26 20 L0 4Z" fill="#fff"/><path d="M30 0 L26 0 L0 16 L0 20 L4 20 L30 4Z" fill="#fff"/>')
  if(m?.startsWith('nordic')){const col=m==='nordic-blue'?'#00205B':m==='nordic-yellow'?'#FECC00':'#fff';parts.push(`<rect x="9" width="4" height="20" fill="${col}"/><rect y="8" width="30" height="4" fill="${col}"/>`)}
  if(m==='cross') parts.push('<rect x="12" y="4" width="6" height="12" fill="#fff"/><rect x="8" y="7" width="14" height="6" fill="#fff"/>')
  if(m==='crescent') parts.push('<circle cx="13" cy="10" r="6" fill="#fff"/><circle cx="15.5" cy="8.5" r="5" fill="#E30A17"/><circle cx="20" cy="10" r="1.6" fill="#fff"/>')
  if(m==='diamond') parts.push('<path d="M15 3 L27 10 L15 17 L3 10Z" fill="#FFDF00"/><circle cx="15" cy="10" r="4" fill="#002776"/>')
  if(m==='sun') parts.push('<circle cx="15" cy="10" r="2.1" fill="#F6B40E"/>')
  if(m==='redsun') parts.push('<circle cx="15" cy="10" r="4.2" fill="#BC002D"/>')
  if(m==='taegeuk') parts.push('<path d="M10 10a5 5 0 0 1 10 0a2.5 2.5 0 0 0-5 0a2.5 2.5 0 0 1-5 0" fill="#CD2E3A"/><path d="M20 10a5 5 0 0 1-10 0a2.5 2.5 0 0 0 5 0a2.5 2.5 0 0 1 5 0" fill="#0047A0"/>')
  if(m==='triangle') parts.push('<path d="M0 0 L12 10 L0 20Z" fill="#11457E"/>')
  if(m==='checker') parts.push('<rect x="12" y="7" width="6" height="6" fill="#fff" stroke="#D00" stroke-width="1"/>')
  if(m==='eu'){for(let i=0;i<8;i++){const a=i*Math.PI/4;parts.push(`<circle cx="${15+5*Math.cos(a)}" cy="${10+5*Math.sin(a)}" r="0.8" fill="#FFCC00"/>`)}}
  return `<span class="flag-svg" title="${COUNTRY_NAME[cc] || cc || ''}"><svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${parts.join('')}</svg></span>`
}
const tierBadge = t => `<span class="badge badge-${t}">${tierLabel(t)}</span>`
const TIER_ORDER = ['generational','legendary','epic','rare','uncommon','common']
const fmtMoney = n => `$${(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})}M`
const gameYear = () => currentCalendarYear()
const yearForSeason = season => gameYear() - Math.max(0, (S.season || 1) - (season || 1))
const historyYear = row => row?.year || yearForSeason(row?.season || S.season || 1)

// Render the team's name as a colored pill (F1-style). Uses the
// team's two-color scheme: a vertical accent bar on the left + a
// tinted text block. The bar is the primary color; the text is the
// secondary. Falls back to neutral grey if no colors.
function teamPill(team, opts = {}) {
  const colors = team?.colors || ['#444', '#fff']
  const primary = colors[0]
  const secondary = colors[1]
  const flagHtml = opts.noFlag ? '' : `${flag(team.cc)} `
  const extra = opts.extra || ''
  return `<span class="team-pill" style="--team-primary:${primary};--team-secondary:${secondary}">
    <span class="team-pill-bar"></span>
    <span class="team-pill-name">${flagHtml}${team.name}${extra}</span>
  </span>`
}

// Returns an orange star marker if the team has a legendary star or coach,
// otherwise empty string. Used on the Groups and Bracket tabs to flag
// legend-led sides at a glance. Includes the title attr so hovering on
// desktop reveals which legend it is.
function legendStar(team) {
  if (!team) return ''
  const stars = team.stars && team.stars.length ? team.stars : (team.star ? [team.star] : [])
  const genPlayer = stars.find(s => s?.tier === 'generational')
  const legendPlayer = stars.find(s => s?.tier === 'legendary')
  const legendCoach = team.coach?.tier === 'legendary' ? team.coach : null
  if (!genPlayer && !legendPlayer && !legendCoach) return ''
  const bits = []
  if (genPlayer)    bits.push(`★ Generational: ${genPlayer.name}`)
  if (legendPlayer) bits.push(`Legendary player: ${legendPlayer.name}`)
  if (legendCoach)  bits.push(`Legendary coach: ${legendCoach.name}`)
  // Pink star for generational, gold for legendary.
  const cls = genPlayer ? 'gen-star' : 'legend-star'
  const glyph = genPlayer ? '✦' : '★'
  return ` <span class="${cls}" title="${bits.join(' · ')}">${glyph}</span>`
}

// Parse emoji in the given element using Twemoji, which swaps emoji
// chars for inline SVG/PNG images. Critically, this is what makes
// flag emoji actually render on Windows (whose system fonts have no
// emoji glyphs). Country flags use local inline SVG and do not depend on it.
let _twemojiUnavailableLogged = false
function parseEmoji(target) {
  if (typeof window === 'undefined' || !target) return
  if (!window.twemoji) {
    if (!_twemojiUnavailableLogged) {
      console.warn('[emoji] Twemoji failed to load; native system emoji will be used. Country flags remain available as local SVG.')
      _twemojiUnavailableLogged = true
    }
    return
  }
  try {
    window.twemoji.parse(target, {
      folder: 'svg',
      ext: '.svg',
      base: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/',
      className: 'twemoji-img',
    })
  } catch (e) {
    console.warn('[emoji] Twemoji.parse threw:', e)
  }
}

function toast(msg, type='info') {
  let el = $('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--bg5);color:var(--txt);font-family:var(--font-head);font-size:12px;letter-spacing:.06em;padding:8px 18px;border-radius:20px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--blue)'
  el.style.opacity = '1'
  clearTimeout(el._t)
  el._t = setTimeout(() => el.style.opacity = '0', 3000)
}

window.switchTab = function (tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  $(`tab-${tab}`)?.classList.add('active')
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')
  if (tab === 'groups')   renderGroups()
  if (tab === 'bracket')  renderBracket()
  if (tab === 'stars')    renderStars()
  if (tab === 'teams')    renderTeams()
  if (tab === 'history')  renderHistory()
  if (tab === 'magazine') renderMagazine()
  if (tab === 'season')   renderSeason()
  if (tab === 'play')     renderPlay()
  parseEmoji(document.body)
}

function updatePhaseUI() {
  const classic = S.era === 'european_cup'
  document.body.classList.toggle('era-classic', classic)
  $('cur-season').textContent = gameYear()
  const title = document.querySelector('.header-title')
  const sub = document.querySelector('.header-sub')
  if (title) title.textContent = classic ? 'EUROPEAN CUP' : 'CHAMPIONS LEAGUE'
  if (sub) sub.textContent = classic ? 'THE CHAMPION CLUBS’ ERA' : 'SIMULATOR'
  const btn = $('btn-main')
  const map = {
    idle:        `▶ Begin ${gameYear()}`,
    stats:       '▶ Open Transfer Market',
    market:      '▶ Run Local Leagues',
    qualifying:  classic ? '▶ Draw European Cup' : '▶ Draw Groups',
    groups:      '▶ Play Next Match',
    knockout:    '▶ Play Next Match',
    done:        `▶ Continue to ${gameYear() + 1}`,
  }
  btn.textContent = map[S.phase] || '▶ New Season'
  btn.disabled = false
  const phases = {
    idle:        'Pre-Season',
    stats:       'Stats Update',
    market:      'Transfer Market',
    qualifying:  'Domestic Champions',
    groups:      'Group Stage',
    knockout:    classic ? 'European Cup Knockout' : 'Knockout',
    done:        `${gameYear()} Complete`,
  }
  $('phase-label').textContent = phases[S.phase] || ''
  renderPlay()
  parseEmoji(document.body)
}

window.handleMain = async function () {
  const p = S.phase || 'idle'
  if (p === 'idle') {
    // First time? Set up the world skeleton (teams + coach/star
    // containers, but no actual players yet).
    if (!S.allTeams) initStarsAndCoaches()
    // RESTART POINT: capture the world *before* we touch anything,
    // so "Restart Season" can roll back here. This overwrites the
    // previous season's pre-season snapshot (only one ever kept).
    await snapshotPreSeason()
    // STEP 1 of the season: roll new per-team season stats around
    // each team's permanent base rating, capped at ±8 from last
    // year's value.
    runStatsUpdate()
    S.phase = 'stats'
    await autoSave()
    updatePhaseUI()
    toast('Pre-season form is set. Open the market when ready.')
    switchTab('play')
  } else if (p === 'stats') {
    // STEP 2: market window (retirements, signings, overflow,
    // coach changes, youth fills).
    runMarket()
    S.phase = 'market'
    S.magazineReadSeason = 0
    await autoSave()
    updatePhaseUI()
    toast('Transfer market closed. Local leagues next.')
    showTransferReveal()
  } else if (p === 'market') {
    runLocalLeagues()
    runQualification()
    S.phase = 'qualifying'
    await autoSave()
    updatePhaseUI()
    toast(S.era === 'european_cup' ? 'Domestic champions decided. The final 16 are ready.' : 'Local leagues decided! 32 teams qualified.')
    switchTab('play')
  } else if (p === 'qualifying') {
    if (S.era === 'european_cup') {
      buildClassicBracket()
      S.phase = 'knockout'
      await snapshotPreTournament()
      await autoSave()
      updatePhaseUI()
      toast('The European Cup bracket has been drawn — no seeds, no protection.')
      magazineSubTab = 'guide'
      switchTab('magazine')
    } else {
      drawGroups()
      S.phase = 'groups'
      // RESTART POINT: capture the world right after the draw, before
      // any match has been played. "Restart Tournament" rolls back
      // here.
      await snapshotPreTournament()
      await autoSave()
      updatePhaseUI()
      toast('Groups drawn!')
      magazineSubTab = 'guide'
      switchTab('magazine')
    }
  } else if (p === 'groups') {
    playNextGroupMatch()
  } else if (p === 'knockout') {
    playNextKnockoutMatch()
  } else if (p === 'done') {
    const enterModernEra = !!S.pendingEraTransition
    startNewSeason()
    if (enterModernEra) {
      S.era = 'champions_league'
      S.pendingEraTransition = false
    }
    await autoSave()
    updatePhaseUI()
    renderPlay()
    toast(`${gameYear()} begins!`)
  }
}

window.advanceToChampionsLeagueEra = async function () {
  if (S.era !== 'european_cup' || S.pendingEraTransition) return
  S.pendingEraTransition = true
  S.eraTransitionYear = gameYear() + 1
  await autoSave()
  renderPlay()
  toast(`The Champions League era will begin in ${S.eraTransitionYear}.`)
}

// ── Group stage ───────────────────────────────────────────────
function playNextGroupMatch() {
  const unplayed = S.groupMatches.filter(m => !m.played)
  if (!unplayed.length) {
    buildKnockout()
    S.phase = 'knockout'
    autoSave()
    updatePhaseUI()
    switchTab('bracket')
    toast('Group stage done — Round of 16 ready!')
    return
  }
  const match = unplayed[0]
  // Show the preview first; only play the match when the user hits Start.
  showMatchPreview(match.t1, match.t2, 'Group Stage', () => {
    const result = playGroupMatch(match)
    showMatchPopup(result, 'Group Stage', () => {
      renderGroups()
      updatePhaseUI()
      const left = S.groupMatches.filter(m => !m.played).length
      $('btn-main').textContent = left > 0 ? `▶ Play Next (${left} left)` : '▶ Complete Group Stage'
    })
  })
}

// ── Knockout stage ────────────────────────────────────────────
function playNextKnockoutMatch() {
  const round = S.knockoutRounds[S.knockoutRounds.length - 1]
  if (!round) return
  const unplayed = round.matches.filter(m => !m.played)
  if (!unplayed.length) {
    advanceKnockout()
    autoSave()
    if (S.phase === 'done') {
      updatePhaseUI()
      renderBracket()
      toast(`🏆 ${S.champion?.name} are Champions of Europe!`)
    } else {
      updatePhaseUI()
      renderBracket()
      toast(`${S.knockoutRounds[S.knockoutRounds.length - 1]?.name} begins!`)
    }
    return
  }
  const match = unplayed[0]
  showMatchPreview(match.t1, match.t2, round.name, () => {
    const result = playKnockoutMatch(match)
    showMatchPopup(result, round.name, () => {
      renderBracket()
      updatePhaseUI()
      const left = round.matches.filter(m => !m.played).length
      $('btn-main').textContent = left > 0 ? `▶ Play Next (${left} left)` : '▶ Advance Round'
    })
  })
}

// ─────────────────────────────────────────────────────────────
// MATCH PREVIEW MODAL — shows both teams' stars/coach/stats
// before kicking off the playback popup.
// ─────────────────────────────────────────────────────────────
function showMatchPreview(t1, t2, roundName, onStart) {
  const popup = $('match-popup')
  const inner = $('match-popup-inner')
  popup.classList.add('match-popup-modal')
  popup.style.display = 'flex'
  document.body.classList.add('modal-open')

  // Per-team CL stats this season (read from S.teams which holds the
  // running counters that getEffStats also reads).
  const overall = team => {
    const e = getEffStats(team, false)
    return Math.round((e.attack + e.defense + e.stamina + e.mental + e.setPieces) / 5)
  }
  const teamBlock = (team, side) => {
    const stars = team.stars && team.stars.length ? team.stars : (team.star ? [team.star] : [])
    const e = getEffStats(team, false)
    const ovr = overall(team)
    const games = (team.w || 0) + (team.d || 0) + (team.l || 0)
    return `
      <div class="preview-team ${side}">
        <div class="preview-team-head">
          <span class="preview-team-flag">${flag(team.cc)}</span>
          <span class="preview-team-name">${team.name}</span>
          <span class="preview-team-ovr">OVR ${ovr}</span>
        </div>
        <div class="preview-stat-grid">
          <div><span class="preview-stat-label">ATT</span><span>${e.attack}</span></div>
          <div><span class="preview-stat-label">DEF</span><span>${e.defense}</span></div>
          <div><span class="preview-stat-label">STA</span><span>${e.stamina}</span></div>
          <div><span class="preview-stat-label">MEN</span><span>${e.mental}</span></div>
          <div><span class="preview-stat-label">SP</span><span>${e.setPieces}</span></div>
        </div>
        <div class="preview-form-row">
          <div><span class="preview-stat-label">G</span> ${games}</div>
          <div><span class="preview-stat-label">W</span> <span style="color:var(--green)">${team.w || 0}</span></div>
          <div><span class="preview-stat-label">D</span> ${team.d || 0}</div>
          <div><span class="preview-stat-label">L</span> <span style="color:var(--red)">${team.l || 0}</span></div>
          <div><span class="preview-stat-label">GF</span> ${team.gf || 0}</div>
          <div><span class="preview-stat-label">GA</span> ${team.ga || 0}</div>
        </div>
        <div class="preview-section-label">STARS (${stars.length})</div>
        ${stars.length ? stars.map(s => `
          <div class="preview-star-row" style="color:${tierColor(s.tier)}">
            <span class="badge badge-${s.tier}">${s.pos}</span>
            <span class="preview-star-name">${s.name}</span>
            <span class="muted">${flag(s.nationality || s.cc || '')}</span>
          </div>`).join('') : '<div class="muted" style="font-size:11px">No stars</div>'}
        <div class="preview-section-label">COACH</div>
        ${team.coach ? `<div class="preview-coach-row" style="color:${tierColor(team.coach.tier)}">
          <span class="badge badge-${team.coach.tier}">${tierLabel(team.coach.tier)}</span>
          <span class="preview-star-name">${team.coach.name}</span>
        </div>
        ${team.coach.trait ? `<div class="preview-coach-trait">✦ ${team.coach.trait.name}<div class="muted" style="font-size:10px">${team.coach.trait.description}</div></div>` : ''}
        ` : '<div class="muted" style="font-size:11px">No coach</div>'}
      </div>`
  }

  // Build skip buttons depending on phase. Group stage gets both
  // "Skip Game" (instant) and "Skip Group" (all unplayed matches in
  // the same group). Knockout matches only get "Skip Game".
  const isGroupPhase = S.phase === 'groups'
  let nextMatch = null
  if (isGroupPhase) nextMatch = (S.groupMatches || []).filter(m => !m.played)[0]
  const sameGroupLeft = isGroupPhase && nextMatch
    ? (S.groupMatches || []).filter(m => !m.played && m.gi === nextMatch.gi).length
    : 0

  const skipButtons = isGroupPhase
    ? `<button class="btn btn-secondary" onclick="window.skipPreviewedMatch()" title="Sim this match instantly (no playback)">Skip Game ⏭</button>
       <button class="btn btn-secondary" onclick="window.skipPreviewedGroup()" title="Sim all ${sameGroupLeft} remaining matches in this group">Skip Group ⏭⏭ (${sameGroupLeft})</button>`
    : `<button class="btn btn-secondary" onclick="window.skipPreviewedMatch()" title="Sim this match instantly (no playback)">Skip Game ⏭</button>`

  inner.innerHTML = `
    <div class="playback-card preview-card">
      <div class="playback-header">
        <div class="playback-round">${roundName.toUpperCase()} — PREVIEW</div>
      </div>
      <div class="preview-grid">
        ${teamBlock(t1, 'left')}
        <div class="preview-vs">VS</div>
        ${teamBlock(t2, 'right')}
      </div>
      <div class="playback-actions" style="flex-wrap:wrap;gap:8px">
        <button class="btn btn-sm" onclick="window.cancelPreview()">Cancel</button>
        ${skipButtons}
        <button class="btn btn-primary" onclick="window.startPreviewedMatch()">Start Game ▶</button>
      </div>
    </div>`
  parseEmoji(inner)

  window._previewOnStart = onStart
}

window.startPreviewedMatch = function () {
  const cb = window._previewOnStart
  window._previewOnStart = null
  // Close the preview popup; the match-play function will reopen it
  // for the live playback.
  if (cb) cb()
}

// Sim the next match instantly (no playback). Works for both group
// and knockout phases.
window.skipPreviewedMatch = function () {
  window._previewOnStart = null
  const popup = $('match-popup')
  popup.style.display = 'none'

  if (S.phase === 'groups') {
    const match = (S.groupMatches || []).find(m => !m.played)
    if (!match) return
    const result = playGroupMatch(match)
    showGroupResultsPopup([result], 'Group Stage', () => {
      renderGroups()
      updatePhaseUI()
      const left = S.groupMatches.filter(m => !m.played).length
      $('btn-main').textContent = left > 0 ? `▶ Play Next (${left} left)` : '▶ Complete Group Stage'
    })
  } else if (S.phase === 'knockout') {
    const round = S.knockoutRounds[S.knockoutRounds.length - 1]
    if (!round) return
    const match = round.matches.find(m => !m.played)
    if (!match) return
    const result = playKnockoutMatch(match)
    showGroupResultsPopup([result], round.name, () => {
      renderBracket()
      updatePhaseUI()
      const left = round.matches.filter(m => !m.played).length
      $('btn-main').textContent = left > 0 ? `▶ Play Next (${left} left)` : '▶ Advance Round'
    })
  }
}

// Sim every remaining match in the next match's group, all at once.
window.skipPreviewedGroup = function () {
  window._previewOnStart = null
  const popup = $('match-popup')
  popup.style.display = 'none'
  if (S.phase !== 'groups') return

  const nextMatch = (S.groupMatches || []).find(m => !m.played)
  if (!nextMatch) return
  const gi = nextMatch.gi
  const toPlay = (S.groupMatches || []).filter(m => !m.played && m.gi === gi)
  const results = toPlay.map(m => playGroupMatch(m))
  showGroupResultsPopup(results, `Group ${S.groups[gi]?.id || ''}`, () => {
    renderGroups()
    updatePhaseUI()
    const left = S.groupMatches.filter(m => !m.played).length
    $('btn-main').textContent = left > 0 ? `▶ Play Next (${left} left)` : '▶ Complete Group Stage'
  })
}

// Show a multi-match results popup with a vertical tab list of all
// the games on the left and the full completed-game view on the
// right. For a single match, it just shows the one result with no
// tabs.
function showGroupResultsPopup(results, roundName, onClose) {
  const popup = $('match-popup')
  const inner = $('match-popup-inner')
  popup.classList.add('match-popup-modal')
  popup.style.display = 'flex'
  document.body.classList.add('modal-open')

  let selected = 0
  const render = () => {
    const r = results[selected]
    const tabs = results.map((res, i) => {
      const winner = res.g1 > res.g2 ? res.t1 : res.g2 > res.g1 ? res.t2 : null
      const winnerName = winner ? winner.name : 'Draw'
      return `<div class="group-result-tab ${i === selected ? 'active' : ''}" onclick="window.selectGroupResult(${i})">
        <div class="group-result-tab-num">M${i + 1}</div>
        <div class="group-result-tab-score">${res.g1}–${res.g2}</div>
        <div class="group-result-tab-winner">${winnerName.slice(0, 12)}</div>
      </div>`
    }).join('')

    const t1 = r.t1, t2 = r.t2
    const star1 = t1.star, star2 = t2.star
    const t1Colors = t1.colors || ['#444','#fff']
    const t2Colors = t2.colors || ['#444','#fff']
    const events = (r.timeline || []).filter(ev => ev.team && !ev.et)

    // Same playback card as a freshly completed match (header,
    // colored team blocks, goal events list, full final summary
    // with possession bar / shots / star ratings).
    const matchCard = `
      <div class="playback-card group-result-card-inner">
        <div class="playback-header">
          <div class="playback-round">${roundName.toUpperCase()} ${results.length > 1 ? `· MATCH ${selected + 1}/${results.length}` : ''}</div>
          <div class="playback-clock final">FT</div>
        </div>
        <div class="playback-score-row">
          <div class="playback-team-block" style="--team-primary:${t1Colors[0]};--team-secondary:${t1Colors[1]}">
            <div class="playback-team-stripe"></div>
            <div class="playback-team-inner">
              <div class="playback-team-name">${flag(t1.cc)} ${t1.name}</div>
              ${star1 ? `<div class="playback-team-star" style="color:${tierColor(star1.tier)}">⭐ ${star1.name} (${star1.pos})</div>` : ''}
            </div>
          </div>
          <div class="playback-score">
            <span class="${r.g1 > r.g2 ? 'lead' : ''}">${r.g1}</span>
            <span class="dash">–</span>
            <span class="${r.g2 > r.g1 ? 'lead' : ''}">${r.g2}</span>
          </div>
          <div class="playback-team-block right" style="--team-primary:${t2Colors[0]};--team-secondary:${t2Colors[1]}">
            <div class="playback-team-inner">
              <div class="playback-team-name">${t2.name} ${flag(t2.cc)}</div>
              ${star2 ? `<div class="playback-team-star" style="color:${tierColor(star2.tier)}">⭐ ${star2.name} (${star2.pos})</div>` : ''}
            </div>
            <div class="playback-team-stripe"></div>
          </div>
        </div>
        <div class="playback-events">
          ${events.length === 0
            ? '<div class="playback-event muted">No goals.</div>'
            : events.map(ev => `
                <div class="playback-event ${ev.team === 1 ? 'left' : 'right'} ${ev.isStar ? 'star' : ''}">
                  <span class="event-min">${ev.minute}'</span>
                  <span class="event-icon">⚽</span>
                  <span class="event-name">${ev.scorerName}</span>
                  ${ev.team === 1 ? '' : '<span class="event-side">› ' + t2.name + '</span>'}
                </div>`).join('')}
        </div>
        ${renderFinalSummary(r)}
      </div>`

    inner.innerHTML = `
      <div class="group-results-wrap">
        ${results.length > 1 ? `<div class="group-results-tabs">${tabs}</div>` : ''}
        <div class="group-results-detail">
          ${matchCard}
          <div class="playback-actions" style="margin-top:8px">
            <button class="btn btn-primary" onclick="window.closeGroupResultsPopup()">Continue</button>
          </div>
        </div>
      </div>`
    parseEmoji(inner)
  }
  window.selectGroupResult = function(i) { selected = i; render() }
  window.closeGroupResultsPopup = function() {
    popup.style.display = 'none'
    window.selectGroupResult = null
    window.closeGroupResultsPopup = null
    if (onClose) onClose()
  }
  render()
}
window.cancelPreview = function () {
  window._previewOnStart = null
  const popup = $('match-popup')
  popup.style.display = 'none'
  popup.classList.remove('match-popup-modal')
  document.body.classList.remove('modal-open')
}

// ─────────────────────────────────────────────────────────────
// MATCH PLAYBACK POPUP — animates minute-by-minute reveal of
// the result, then shows a full summary card. The popup blocks
// interaction until the user clicks "Continue".
// ─────────────────────────────────────────────────────────────
let _playbackTimer = null
let _playbackSkip = false

function showMatchPopup(r, roundName, onClose) {
  if (!r) return
  const popup = $('match-popup')
  const inner = $('match-popup-inner')
  popup.classList.add('match-popup-modal')
  popup.style.display = 'flex'
  document.body.classList.add('modal-open')
  _playbackSkip = false
  if (_playbackTimer) { clearTimeout(_playbackTimer); _playbackTimer = null }

  // Pre-build the static frame: team names, score (initially 0-0),
  // a vertical timeline, and a Skip button.
  const t1 = r.t1, t2 = r.t2
  const star1 = t1.star, star2 = t2.star

  function renderFrame(currentMinute, score1, score2, events, finished) {
    const isFinal = finished
    const skipBtn = isFinal ? '' : `<button class="btn btn-sm" onclick="window.skipPlayback()">Skip ⏭</button>`
    const closeBtn = isFinal ? `<button class="btn btn-primary" onclick="window.closePlayback()">Continue ▶</button>` : ''

    const t1Colors = t1.colors || ['#444', '#fff']
    const t2Colors = t2.colors || ['#444', '#fff']
    inner.innerHTML = `
      <div class="playback-card">
        <div class="playback-header">
          <div class="playback-round">${roundName.toUpperCase()}</div>
          <div class="playback-clock ${isFinal?'final':''}">${isFinal ? 'FT' : currentMinute + "'"}</div>
        </div>
        <div class="playback-score-row">
          <div class="playback-team-block" style="--team-primary:${t1Colors[0]};--team-secondary:${t1Colors[1]}">
            <div class="playback-team-stripe"></div>
            <div class="playback-team-inner">
              <div class="playback-team-name">${flag(t1.cc)} ${t1.name}</div>
              ${star1 ? `<div class="playback-team-star" style="color:${tierColor(star1.tier)}">⭐ ${star1.name} (${star1.pos})</div>` : ''}
            </div>
          </div>
          <div class="playback-score">
            <span class="${score1 > score2 ? 'lead' : ''}">${score1}</span>
            <span class="dash">–</span>
            <span class="${score2 > score1 ? 'lead' : ''}">${score2}</span>
          </div>
          <div class="playback-team-block right" style="--team-primary:${t2Colors[0]};--team-secondary:${t2Colors[1]}">
            <div class="playback-team-inner">
              <div class="playback-team-name">${t2.name} ${flag(t2.cc)}</div>
              ${star2 ? `<div class="playback-team-star" style="color:${tierColor(star2.tier)}">⭐ ${star2.name} (${star2.pos})</div>` : ''}
            </div>
            <div class="playback-team-stripe"></div>
          </div>
        </div>

        <div class="playback-progress-wrap">
          <div class="playback-progress" style="width:${Math.min(100, (currentMinute/90)*100)}%"></div>
        </div>

        <div class="playback-events">
          ${events.length === 0
            ? `<div class="playback-event muted">${isFinal ? 'No goals.' : "And we're underway…"}</div>`
            : events.map(ev => `
                <div class="playback-event ${ev.team === 1 ? 'left' : 'right'} ${ev.isStar ? 'star' : ''}">
                  <span class="event-min">${ev.minute}'</span>
                  <span class="event-icon">⚽</span>
                  <span class="event-name">${ev.scorerName}</span>
                  ${ev.team === 1 ? '' : '<span class="event-side">› ' + t2.name + '</span>'}
                </div>`).join('')}
        </div>

        ${isFinal ? renderFinalSummary(r) : ''}

        <div class="playback-actions">${skipBtn}${closeBtn}</div>
      </div>`
    parseEmoji(inner)
  }

  // Initial frame: 0-0 at minute 0.
  renderFrame(0, 0, 0, [], false)

  // Step through tranches with delays.
  const tranches = r.tranches || []
  const events = []   // accumulating list of goal events to display
  const stepDelay = 900   // ms per tranche reveal
  let i = 0

  function nextStep() {
    if (_playbackSkip) {
      // Show the final state immediately.
      finishPlayback()
      return
    }
    if (i >= tranches.length) {
      finishPlayback()
      return
    }
    const tr = tranches[i]
    // Append any goals from this tranche to the running events list.
    ;(tr.newGoals || []).forEach(g => events.push(g))
    renderFrame(tr.minute, tr.score1, tr.score2, events, false)
    i++
    _playbackTimer = setTimeout(nextStep, stepDelay)
  }

  function finishPlayback() {
    if (_playbackTimer) { clearTimeout(_playbackTimer); _playbackTimer = null }
    // All goals in timeline (incl. ET if any) are shown.
    const allEvents = [...(r.timeline || [])]
    renderFrame(90, r.g1, r.g2, allEvents, true)
    window._matchOnClose = onClose
  }

  // Kick the auto-advance off after a short pause.
  _playbackTimer = setTimeout(nextStep, 600)
}

function renderFinalSummary(r) {
  const sr1 = r.starRatings?.team1 || []
  const sr2 = r.starRatings?.team2 || []
  const ratingClass = v => !v ? '' : v >= 8.5 ? 'rating-gold' : v >= 7.5 ? 'rating-green' : v >= 6.0 ? 'rating-white' : 'rating-red'
  const fmt = v => v == null ? '—' : v.toFixed(1)

  // Goals per star this match — straight from the timeline.
  const star1GoalsByName = {}
  const star2GoalsByName = {}
  ;(r.timeline || []).forEach(g => {
    if (!g.isStar) return
    const map = g.team === 1 ? star1GoalsByName : star2GoalsByName
    map[g.scorerName] = (map[g.scorerName] || 0) + 1
  })

  const starsBlock = (label, srList, goalsMap, alignRight) => {
    if (!srList.length) return ''
    return `<div class="playback-team-block ${alignRight ? 'right' : ''}">
      <div class="playback-block-label">${label}</div>
      ${srList.map(s => {
        const g = goalsMap[s.name] || 0
        return `<div class="playback-star-row" style="color:${tierColor(s.tier)}">
          <span class="star-name">⭐ ${s.name}</span>
          <span class="muted">${s.pos}${g > 0 ? ` · ${g}⚽` : ''}</span>
          <span class="rating-val ${ratingClass(s.rating)}">${fmt(s.rating)}</span>
        </div>`
      }).join('')}
    </div>`
  }

  // Coach lines — show the trait if any.
  const coachBlock = (label, coach, alignRight) => {
    if (!coach) return ''
    const traitLine = coach.trait ? `<div class="muted" style="font-size:10px">✦ ${coach.trait.name}</div>` : ''
    return `<div class="playback-team-block ${alignRight ? 'right' : ''}">
      <div class="playback-block-label">${label}</div>
      <div class="playback-coach-row" style="color:${tierColor(coach.tier)}">
        <span>📋 ${coach.name}</span>
        <span class="muted">${tierLabel(coach.tier)}</span>
      </div>
      ${traitLine}
    </div>`
  }

  return `
    <div class="playback-stats-grid">
      <div class="stat-cell stat-team-l">${r.t1.name}</div>
      <div class="stat-cell stat-label">SHOTS</div>
      <div class="stat-cell stat-team-r">${r.t2.name}</div>

      <div class="stat-cell stat-num">${r.shots1}</div>
      <div class="stat-cell"></div>
      <div class="stat-cell stat-num">${r.shots2}</div>

      <div class="stat-cell stat-num">${r.corners1}</div>
      <div class="stat-cell stat-label">CORNERS</div>
      <div class="stat-cell stat-num">${r.corners2}</div>

      <div class="stat-cell stat-num">${r.possession1}%</div>
      <div class="stat-cell stat-label">POSSESSION</div>
      <div class="stat-cell stat-num">${r.possession2}%</div>
    </div>

    <div class="playback-pair">
      ${starsBlock('STARS — ' + r.t1.name.toUpperCase(), sr1, star1GoalsByName, false)}
      ${starsBlock('STARS — ' + r.t2.name.toUpperCase(), sr2, star2GoalsByName, true)}
    </div>

    <div class="playback-pair">
      ${coachBlock('COACH — ' + r.t1.name.toUpperCase(), r.t1.coach, false)}
      ${coachBlock('COACH — ' + r.t2.name.toUpperCase(), r.t2.coach, true)}
    </div>

    ${r.mentalityChanges ? renderMentalityBlock(r) : ''}

    ${r.effects?.length ? `<div class="playback-effects">
      ${r.effects.map(e => `<div class="effect-line ${e.includes('⭐')?'star':e.includes('📋')?'coach':''}">${e}</div>`).join('')}
    </div>` : ''}
  `
}

// Render the mentality-change box for the post-match summary.
function renderMentalityBlock(r) {
  const fmt = (mc) => {
    const total = 60 + mc.after  // displayed "real" mentality
    const sign = mc.change > 0 ? '+' : ''
    const cls  = mc.change > 0 ? 'rating-green' : mc.change < 0 ? 'rating-red' : ''
    return { total, sign, cls }
  }
  const a = fmt(r.mentalityChanges.team1)
  const b = fmt(r.mentalityChanges.team2)
  return `
    <div class="mentality-block">
      <div class="mentality-row">
        <div class="mentality-side left">
          <div class="mentality-team">${flag(r.t1.cc)} ${r.t1.name}</div>
          <div class="mentality-val">
            <span class="mentality-num">${a.total}</span>
            <span class="rating-val ${a.cls}">${a.sign}${r.mentalityChanges.team1.change}</span>
          </div>
        </div>
        <div class="mentality-label">MENTALITY</div>
        <div class="mentality-side right">
          <div class="mentality-team">${r.t2.name} ${flag(r.t2.cc)}</div>
          <div class="mentality-val">
            <span class="rating-val ${b.cls}">${b.sign}${r.mentalityChanges.team2.change}</span>
            <span class="mentality-num">${b.total}</span>
          </div>
        </div>
      </div>
    </div>`
}

window.skipPlayback = function () { _playbackSkip = true }
window.closePlayback = function () {
  const popup = $('match-popup')
  popup.style.display = 'none'
  popup.classList.remove('match-popup-modal')
  document.body.classList.remove('modal-open')
  if (_playbackTimer) { clearTimeout(_playbackTimer); _playbackTimer = null }
  if (window._matchOnClose) {
    const cb = window._matchOnClose
    window._matchOnClose = null
    cb()
  }
}

// ─────────────────────────────────────────────────────────────
// MAGAZINE & TRANSFER REVEAL
// ─────────────────────────────────────────────────────────────
function marketHeadlineMove() {
  const moves = (S.lastMarket || []).filter(m => ['transfer','fa_sign','renew','retirement','historic_debut'].includes(m.phase) && m.kind !== 'team')
  const tierRank = { generational:6, legendary:5, epic:4, rare:3, uncommon:2, common:1 }
  return [...moves].sort((a,b) => {
    const tr = (tierRank[b.tier]||0) - (tierRank[a.tier]||0)
    if (tr) return tr
    return (b.signFee||0) - (a.signFee||0)
  })[0] || null
}

function transferHeadline(m) {
  if (!m) return 'A quiet market leaves Europe waiting for the football to begin.'
  if (m.phase === 'retirement') return `${m.name} closes the book on a memorable career.`
  if (m.phase === 'renew') return `${m.name} rejects the market and commits to ${m.to}.`
  if (m.phase === 'fa_sign') return `${m.to} win the race for free agent ${m.name}.`
  if (m.phase === 'historic_debut') return `${m.name} arrives — a new name with the potential to define an era.`
  return `${m.to} land ${m.name} in the deal of the summer.`
}

function buildMagazineStories() {
  const stories = []
  const lead = marketHeadlineMove()
  if (lead) stories.push({ kicker:'TRANSFER EXCLUSIVE', icon:'🚨', title:transferHeadline(lead), body: lead.phase === 'transfer'
    ? `${lead.from} receive ${fmtMoney(lead.saleValue||lead.signFee||0)}, while ${lead.to} add a ${tierLabel(lead.tier).toLowerCase()} ${lead.pos || 'star'} on a ${lead.contractYears||'?'}-year deal. The balance of power may have shifted before a ball is kicked.`
    : `${lead.name} becomes one of the defining names of ${gameYear()}'s offseason.`, tone:'lead' })

  const transfers=(S.lastMarket||[]).filter(m=>m.phase==='transfer')
  if (transfers.length) {
    const spenders={}
    transfers.forEach(m=>spenders[m.to]=(spenders[m.to]||0)+(m.signFee||0))
    const top=Object.entries(spenders).sort((a,b)=>b[1]-a[1])[0]
    if(top) stories.push({kicker:'MARKET WATCH',icon:'💰',title:`${top[0]} are the summer's biggest buyers`,body:`${transfers.length} permanent transfers were completed. ${top[0]} led the spending with ${fmtMoney(top[1])} in fees.`,tone:'market'})
  }

  const leagues=Object.values(S.localLeagueResults||{})
  leagues.slice(0,6).forEach(r=>{
    const champ=r.standings?.[0], runner=r.standings?.[1]
    if(!champ) return
    const gap=runner ? champ.score-runner.score : 0
    stories.push({kicker:r.league?.name?.toUpperCase()||'DOMESTIC LEAGUE',icon:'🏆',title:`${champ.team.name} rule ${r.league?.name||'their league'}`,body: gap >= 8 ? `A dominant campaign ended with a ${gap}-point performance gap over ${runner.team.name}.` : runner ? `${runner.team.name} pushed them to the finish, but ${champ.team.name} held their nerve.` : 'A championship season earns them a place among Europe’s elite.',tone:'league'})
  })

  const recent=[...(S.allMatchResults||[])].reverse().slice(0,8)
  recent.forEach(r=>{
    const margin=Math.abs(r.g1-r.g2), total=r.g1+r.g2
    if(total>=6 || margin>=4) stories.push({kicker:'EUROPEAN NIGHT',icon:'⚽',title:`${r.t1name} ${r.g1}–${r.g2} ${r.t2name}`,body: total>=6 ? 'A chaotic classic delivered goals, momentum swings and a result that will live in this season’s memory.' : 'One side delivered a statement performance that the rest of Europe cannot ignore.',tone:'match'})
  })

  const hist=(S.history||[]).slice(-1)[0]
  if(hist) stories.push({kicker:'FROM THE ARCHIVE',icon:'📚',title:`${hist.championName} remain the team everyone is chasing`,body:`Last season’s champions return as the reference point after defeating ${hist.runnerUpName||'their final opponent'} in the decisive match.`,tone:'archive'})
  return stories
}

let magazineSubTab = 'front'
window.setMagazineSubTab = function(k) { magazineSubTab = k; renderMagazine(); parseEmoji(document.body) }

function premiumRank(tier) {
  return ({ generational:6, legendary:5, epic:4, rare:3, uncommon:2, common:1 })[tier] || 0
}
function effectiveTeamOverall(team) {
  const eff = getEffStats(team)
  return Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
}
function starRoomScore(team) {
  return (team.stars || []).reduce((sum, star) => {
    const skill = Object.values(star.statBonus || {}).reduce((a,b) => a + (Number(b)||0), 0)
    return sum + premiumRank(star.tier) * 35 + skill
  }, 0)
}
function preseasonContenders() {
  const teams = [...(S.teams || [])]
  if (!teams.length) return []
  const reasons = new Map()
  const selected = []
  const add = (team, reason) => {
    if (!team || selected.some(x => x.id === team.id)) return
    selected.push(team)
    reasons.set(team.id, [reason])
  }
  const addReason = (team, reason) => {
    if (!team) return
    const arr = reasons.get(team.id) || []
    if (!arr.includes(reason)) arr.push(reason)
    reasons.set(team.id, arr)
  }

  const last = [...(S.history || [])].reverse()[0]
  const defending = teams.find(t => t.id === last?.champion)
  add(defending, 'defending')

  const byOverall = [...teams].sort((a,b) => effectiveTeamOverall(b) - effectiveTeamOverall(a))
  byOverall.slice(0,2).forEach((team, index) => {
    if (selected.some(x => x.id === team.id)) addReason(team, index === 0 ? 'highest' : 'elite')
    else add(team, index === 0 ? 'highest' : 'elite')
  })
  const starStudded = [...teams].sort((a,b) => starRoomScore(b) - starRoomScore(a))[0]
  if (selected.some(x => x.id === starStudded?.id)) addReason(starStudded, 'stars')
  else add(starStudded, 'stars')
  for (const team of byOverall) {
    if (selected.length >= 4) break
    add(team, 'form')
  }

  return selected.slice(0,4).map(team => ({ team, reasons:reasons.get(team.id) || [] }))
}
function contenderNarrative(team, reasons) {
  const bits = []
  if (reasons.includes('defending')) bits.push(`${team.name} lifted the trophy last year and now face the harder task: doing it again.`)
  if (reasons.includes('highest')) bits.push(`They enter as the highest-rated side in Europe and the narrow preseason favorite.`)
  else if (reasons.includes('elite')) bits.push(`Their complete team rating places them among the two strongest squads in the field.`)
  if (reasons.includes('stars')) bits.push(`No qualified club can match the concentrated quality of their star room.`)
  if (!bits.length) bits.push(`Their balance, recent strength and tournament pedigree make them a genuine threat.`)
  return bits.join(' ')
}
function clickableStar(star) {
  return `<button class="guide-person" onclick="window.openStarDetail('${star.id}')">${tierBadge(star.tier)} <strong>${star.name}</strong><span>${star.pos}</span></button>`
}
function contenderCard(item, index) {
  const { team, reasons } = item
  const coach = team.coach
  return `<article class="guide-contender" style="--club-a:${team.colors?.[0]||'#777'};--club-b:${team.colors?.[1]||'#eee'}">
    <div class="guide-rank">${index + 1}</div>
    <div class="guide-team-top"><div>${teamPill(team)}</div><div class="guide-ovr">${effectiveTeamOverall(team)}<small>OVR</small></div></div>
    <p>${contenderNarrative(team,reasons)}</p>
    <div class="guide-label">Stars</div><div class="guide-people">${(team.stars || []).map(clickableStar).join('') || '<span class="muted">No named stars</span>'}</div>
    <div class="guide-label">Coach</div>${coach ? `<button class="guide-person coach" onclick="window.openCoachDetail('${coach.id}')">${tierBadge(coach.tier)} <strong>${coach.name}</strong><span>${coach.trait?.name || 'Head coach'}</span></button>` : '<span class="muted">No coach assigned</span>'}
  </article>`
}

function careerGoalsFor(star) {
  let total = 0
  ;(S.history || []).forEach(h => {
    const rec = (h.stars || []).find(x => x.id === star.id)
    if (rec) total += rec.goals || 0
  })
  total += star.goals || 0
  return total
}
function allTimeGoalTable() {
  const totals = new Map()
  ;(S.history || []).forEach(h => (h.stars || []).forEach(rec => totals.set(rec.id, (totals.get(rec.id)||0) + (rec.goals||0))))
  ;(S.teams || []).flatMap(t => t.stars || []).forEach(star => totals.set(star.id, (totals.get(star.id)||0) + (star.goals||0)))
  return [...totals.entries()].sort((a,b) => b[1]-a[1])
}
function playerWatchNarrative(star) {
  const careerYear = (S.season || 1) - (star.season || 1)
  const lastYear = careerYear >= (star.lifespan || 9) - 1
  const firstYear = careerYear <= 0
  const titles = star.medals?.gold || 0
  const goals = careerGoalsFor(star)
  const leaders = allTimeGoalTable()
  const leader = leaders[0]
  const gap = leader && leader[0] !== star.id ? leader[1] - goals + 1 : null
  if (lastYear && titles === 0) return `Last chance to grab the European title that has escaped ${star.name}'s entire career.`
  if (lastYear && titles > 0) return `${star.name} wants one more European Cup before retirement closes the story.`
  if (gap != null && gap > 0 && gap <= 10) return `${star.name} needs ${gap} goal${gap===1?'':'s'} to become the leading scorer in tournament history.`
  if (leader?.[0] === star.id && goals > 0) return `${star.name} begins the campaign defending the all-time scoring lead with ${goals} goals.`
  if (firstYear) return `A first European campaign for one of football's most exciting new names.`
  if (titles === 0) return `Elite ability, but still no European crown — this season could define the career.`
  return `${titles} title${titles===1?'':'s'} already won, and the appetite for another has not disappeared.`
}

function renderPreseasonGuide() {
  if (!(S.teams || []).length || ['idle','stats','market','qualifying'].includes(S.phase)) {
    return `<div class="guide-empty"><div>PRE-SEASON GUIDE</div><p>The guide publishes immediately after the European draw, once the full field is known.</p></div>`
  }
  const contenders = preseasonContenders()
  const contenderIds = new Set(contenders.map(x => x.team.id))
  const qualifiedIds = new Set((S.teams || []).map(t => t.id))
  const keyMoves = (S.lastMarket || []).filter(m =>
    ['transfer','fa_sign'].includes(m.phase) &&
    ['generational','legendary','epic'].includes(m.tier) &&
    qualifiedIds.has(m.toId)
  ).sort((a,b) => premiumRank(b.tier)-premiumRank(a.tier) || (b.signFee||0)-(a.signFee||0))
  const keyIds = new Set(keyMoves.map(m => m.star?.id).filter(Boolean))
  const watchers = (S.teams || []).flatMap(team => (team.stars || []).map(star => ({star,team})))
    .filter(x => ['generational','legendary','epic'].includes(x.star.tier) && !keyIds.has(x.star.id))
    .sort((a,b) => {
      const aOutside = contenderIds.has(a.team.id) ? 0 : 1
      const bOutside = contenderIds.has(b.team.id) ? 0 : 1
      const aEdge = ((S.season||1)-(a.star.season||1) <= 0 || (S.season||1)-(a.star.season||1) >= (a.star.lifespan||9)-1) ? 1 : 0
      const bEdge = ((S.season||1)-(b.star.season||1) <= 0 || (S.season||1)-(b.star.season||1) >= (b.star.lifespan||9)-1) ? 1 : 0
      return bEdge-aEdge || bOutside-aOutside || premiumRank(b.star.tier)-premiumRank(a.star.tier)
    }).slice(0,10)

  return `<section class="preseason-guide">
    <div class="guide-hero"><div class="mag-kicker">SPECIAL EDITION · ${gameYear()}</div><h1>${S.era==='european_cup'?'THE EUROPEAN CUP':'THE CHAMPIONS LEAGUE'} PREVIEW</h1><p>Four contenders, the moves that changed the field, and the careers carrying the weight of history.</p></div>
    <div class="sec">TOP 4 CONTENDERS</div><div class="guide-contender-grid">${contenders.map(contenderCard).join('')}</div>
    <div class="sec">KEY SIGNINGS</div>
    ${keyMoves.length ? `<div class="guide-signings">${keyMoves.map(m => {
      const seller=(S.allTeams||[]).find(t=>t.id===m.fromId), buyer=(S.allTeams||[]).find(t=>t.id===m.toId)
      const value=m.star ? playerMarketValue(m.star, seller || buyer, m.happiness ?? 65, S.season) : (m.signFee||0)
      return `<article class="guide-signing" style="--club-a:${buyer?.colors?.[0]||'#777'}"><div>${tierBadge(m.tier)} <button onclick="window.openStarDetail('${m.star?.id||''}')">${m.name}</button></div><div class="guide-transfer-route">${m.from||'Free agency'} → <strong>${m.to}</strong></div><div class="guide-money"><span>${fmtMoney(m.signFee||0)} cost</span><span>${fmtMoney(value)} value</span></div></article>`
    }).join('')}</div>` : '<div class="empty">No Epic, Legendary or Generational signing reached this season’s field.</div>'}
    <div class="sec">OTHER PLAYERS TO WATCH</div>
    <div class="watch-grid">${watchers.map(({star,team}) => `<article class="watch-card"><div class="watch-head">${tierBadge(star.tier)} <button onclick="window.openStarDetail('${star.id}')">${star.name}</button></div><div class="watch-team">${flag(team.cc)} ${team.name} · ${star.pos} · ${careerGoalsFor(star)} career goals</div><p>${playerWatchNarrative(star)}</p></article>`).join('') || '<div class="empty">The premium watch list will grow as stars qualify.</div>'}</div>
  </section>`
}

function renderMagazine() {
  const el=$('tab-magazine'); if(!el) return
  const stories=buildMagazineStories()
  const lead=stories[0]
  const guideReady = (S.teams || []).length && !['idle','stats','market','qualifying'].includes(S.phase)
  el.innerHTML=`
    <div class="magazine-masthead">
      <div><div class="magazine-name">EUROPE TODAY</div><div class="magazine-date">${gameYear()} · ${S.era==='european_cup'?'THE EUROPEAN CUP WORLD':'THE CHAMPIONS LEAGUE WORLD'}</div></div>
      <div class="magazine-edition">DAILY<br>EDITION</div>
    </div>
    <div class="sub-tab-row magazine-tab-row">
      <button class="sub-tab ${magazineSubTab==='front'?'active':''}" onclick="setMagazineSubTab('front')">📰 Front Page</button>
      <button class="sub-tab ${magazineSubTab==='guide'?'active':''}" onclick="setMagazineSubTab('guide')">📖 Pre-season Guide${guideReady?' <span class="sub-tab-count">NEW</span>':''}</button>
    </div>
    ${magazineSubTab === 'guide' ? renderPreseasonGuide() : `
      ${lead ? `<article class="mag-lead"><div class="mag-kicker">${lead.icon} ${lead.kicker}</div><h1>${lead.title}</h1><p>${lead.body}</p></article>` : `<div class="empty">Begin the season to create the first edition.</div>`}
      <div class="mag-story-grid">${stories.slice(1).map(x=>`<article class="mag-story mag-${x.tone}"><div class="mag-kicker">${x.icon} ${x.kicker}</div><h2>${x.title}</h2><p>${x.body}</p></article>`).join('')}</div>`}
  `
}

window.closeTransferReveal=function(){
  const p=$('match-popup'); p.style.display='none'; p.classList.remove('match-popup-modal'); document.body.classList.remove('modal-open'); switchTab('magazine')
}
window.revealTransferAt=function(i){
  const cards=[...(S.lastMarket||[])].filter(m=>['transfer','fa_sign','renew','retirement','historic_debut'].includes(m.phase)&&m.kind!=='team')
    .sort((a,b)=>({generational:6,legendary:5,epic:4,rare:3,uncommon:2,common:1}[b.tier]||0)-({generational:6,legendary:5,epic:4,rare:3,uncommon:2,common:1}[a.tier]||0)||(b.signFee||0)-(a.signFee||0)).slice(0,8)
  const m=cards[i]; if(!m) return closeTransferReveal()
  const destination=(S.allTeams||[]).find(t=>t.id===m.toId)
  const source=(S.allTeams||[]).find(t=>t.id===m.fromId)
  const revealColors=destination?.colors || source?.colors || ['#2056d8','#ffffff']
  const inner=$('match-popup-inner')
  const movement=m.phase==='retirement' ? `${flag(m.fromCC)} ${m.from} → Retirement` : m.phase==='renew' ? `${flag(m.toCC)} ${m.to}` : m.phase==='historic_debut' ? `${m.from} <span>→</span> ${flag(m.toCC)} ${m.to}` : `${m.from?flag(m.fromCC)+' '+m.from:'Free Agency'} <span>→</span> ${flag(m.toCC)} ${m.to}`
  inner.innerHTML=`<button class="modal-x" onclick="closeTransferReveal()" aria-label="Close">✕</button>
    <div class="transfer-reveal" style="--sign-primary:${revealColors[0]};--sign-secondary:${revealColors[1]}">
      <div class="transfer-club-shade"></div>
      <div class="transfer-reveal-count">DEAL ${i+1} / ${cards.length}</div>
      <div class="transfer-reveal-kicker">${i===0?'🚨 BREAKING NEWS':'TRANSFER WINDOW'}</div>
      <div class="transfer-reveal-tier">${m.tier?tierBadge(m.tier):''}</div>
      <h1>${m.name}</h1><div class="transfer-reveal-pos">${m.pos|| (m.kind==='coach'?'HEAD COACH':'')}</div>
      <div class="transfer-route">${movement}</div>
      <div class="transfer-figures">${m.signFee?`<span><b>${fmtMoney(m.signFee)}</b> fee</span>`:''}${m.salary?`<span><b>${fmtMoney(m.salary)}</b> / year</span>`:''}${m.contractYears?`<span><b>${m.contractYears}</b> years</span>`:''}</div>
      <div class="transfer-reveal-headline">${transferHeadline(m)}</div>
      <div class="transfer-actions"><button class="btn" onclick="closeTransferReveal()">Read Magazine</button><button class="btn btn-primary" onclick="revealTransferAt(${i+1})">${i+1<cards.length?'Reveal next deal':'Finish window'} →</button></div>
    </div>`
}
function showTransferReveal(){
  const cards=(S.lastMarket||[]).filter(m=>['transfer','fa_sign','renew','retirement','historic_debut'].includes(m.phase)&&m.kind!=='team')
  if(!cards.length){ switchTab('play'); return }
  const p=$('match-popup'); p.classList.add('match-popup-modal'); p.style.display='flex'; document.body.classList.add('modal-open'); revealTransferAt(0)
}

// ─────────────────────────────────────────────────────────────
// PLAY TAB
// ─────────────────────────────────────────────────────────────
function renderPlay() {
  const el = $('tab-play')
  if (!el) return

  if (!S.teams?.length && S.phase !== 'qualifying' && S.phase !== 'market' && S.phase !== 'stats') {
    el.innerHTML = `
      <div style="text-align:center;padding:48px 20px">
        <div style="font-size:64px;margin-bottom:16px">★</div>
        <div style="font-family:var(--font-head);font-size:32px;font-weight:900;color:var(--blue2);letter-spacing:.12em">${S.era==='european_cup'?'EUROPEAN CUP':'CHAMPIONS LEAGUE'}</div>
        <div style="color:var(--txt2);margin:8px 0 28px">${S.era==='european_cup'?'16 clubs. A completely open knockout draw. European history begins in 1956.':'32 clubs. One trophy. Your story continues.'}</div>
        <button class="btn btn-primary" onclick="handleMain()" style="padding:12px 32px;font-size:14px">▶ Begin ${gameYear()}</button>
      </div>`
    return
  }

  const phase = S.phase
  let html = ''

  if (phase === 'stats') {
    html = renderStatsScreen()
  } else if (phase === 'market') {
    html = renderMarketScreen()
  } else if (phase === 'qualifying') {
    html = renderQualifyingScreen()
  } else if (phase === 'done') {
    const aw = S.seasonAwards || {}
    html = `
      <div class="champion-banner">
        <div style="font-size:56px">🏆</div>
        <div class="champion-title">CHAMPIONS OF EUROPE</div>
        <div class="champion-name">${flag(S.champion?.cc || '')} ${S.champion?.name}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:6px">${gameYear()} · ${S.era==='european_cup'?'European Cup':'Champions League'}</div>
      </div>
      ${(aw.topScorer || aw.offMVP || aw.defMVP) ? `
      <div class="sec">SEASON AWARDS</div>
      <div class="awards-grid">
        ${aw.topScorer ? `<div class="award-card"><div class="award-icon">⚽</div><div class="award-label">Top Scorer</div><div class="award-name">${aw.topScorer.name}</div><div class="award-sub">${aw.topScorer.goals} goals · ${aw.topScorer.team}</div></div>` : ''}
        ${aw.offMVP   ? `<div class="award-card"><div class="award-icon">🌟</div><div class="award-label">Offensive MVP</div><div class="award-name">${aw.offMVP.name}</div><div class="award-sub">${aw.offMVP.rating} avg · ${aw.offMVP.pos} · ${aw.offMVP.team}</div></div>` : ''}
        ${aw.defMVP   ? `<div class="award-card"><div class="award-icon">🛡️</div><div class="award-label">Defensive MVP</div><div class="award-name">${aw.defMVP.name}</div><div class="award-sub">${aw.defMVP.rating} avg · ${aw.defMVP.pos} · ${aw.defMVP.team}</div></div>` : ''}
      </div>` : ''}
      ${renderTopScorers()}
      ${S.era === 'european_cup' ? (S.pendingEraTransition ? `
        <section class="era-transition-card era-transition-confirmed">
          <div class="era-transition-kicker">A NEW ERA HAS BEEN APPROVED</div>
          <h2>The Champions League begins in ${S.eraTransitionYear}</h2>
          <p>Continue to the next year to unveil the 32-team group-stage competition. European Cup history will remain in the archive.</p>
        </section>` : `
        <section class="era-transition-card">
          <div class="era-transition-kicker">THE FUTURE OF EUROPEAN FOOTBALL</div>
          <h2>Advance to the Champions League era?</h2>
          <p>The next year will permanently adopt the modern 32-team group-stage format, full-color presentation and current Champions League identity. The history already created remains intact.</p>
          <button class="btn btn-primary" onclick="advanceToChampionsLeagueEra()">Advance from ${gameYear()+1} →</button>
        </section>`) : (S.eraTransitionYear ? `<div class="era-transition-note">The Champions League era began in ${S.eraTransitionYear}.</div>` : '')}`
  } else if (phase === 'groups') {
    const played = S.groupMatches.filter(m => m.played).length
    const total = S.groupMatches.length
    // The "current" group is whichever group has the next unplayed match.
    const nextMatch = S.groupMatches.find(m => !m.played)
    const currentGroup = nextMatch ? S.groups[nextMatch.gi] : null
    const groupHeader = currentGroup
      ? `<div class="now-playing-banner">
          <div class="now-playing-label">NOW PLAYING</div>
          <div class="now-playing-title">Group ${currentGroup.id}</div>
          <div class="now-playing-sub">${currentGroup.teams.map(t => `${flag(t.cc)} ${t.name}`).join(' · ')}</div>
        </div>` : ''
    html = `${groupHeader}
      <div class="sec">GROUP STAGE — ${played}/${total}</div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${(played/total)*100}%"></div></div>
      ${renderUpcomingGames()}
      ${renderRecentResults()}`
  } else if (phase === 'knockout') {
    const round = S.knockoutRounds[S.knockoutRounds.length - 1]
    const roundName = round?.name || 'Knockout'
    const knockoutHeader = round
      ? `<div class="now-playing-banner">
          <div class="now-playing-label">NOW PLAYING</div>
          <div class="now-playing-title">${roundName}</div>
          <div class="now-playing-sub">${round.matches.length} match${round.matches.length === 1 ? '' : 'es'}</div>
        </div>` : ''
    html = `${knockoutHeader}
      <div class="sec">${roundName.toUpperCase()}</div>
      ${renderUpcomingGames()}
      ${renderRecentResults()}`
  } else {
    // idle: pre-season splash
    html = `<div style="text-align:center;padding:48px 20px">
      <div style="font-size:64px;margin-bottom:16px">★</div>
      <div style="font-family:var(--font-head);font-size:32px;font-weight:900;color:var(--blue2);letter-spacing:.12em">${gameYear()}</div>
      <div style="color:var(--txt2);margin:8px 0 28px">The market opens first. Then the local leagues decide who qualifies for ${S.era==='european_cup'?'the European Cup':'Europe'}.</div>
      <button class="btn btn-primary" onclick="handleMain()" style="padding:12px 32px;font-size:14px">▶ Begin ${gameYear()}</button>
    </div>`
  }
  el.innerHTML = html
}

// ── QUALIFYING SCREEN — local-league results & qualifiers ────
function renderQualifyingScreen() {
  const lr = S.localLeagueResults || {}
  let html = `
    <div class="sec">LOCAL LEAGUES — ${gameYear()} CHAMPIONS</div>
    <div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
      Each league has been decided. The team in <span style="color:var(--gold)">gold</span> is this season's local champion.
      Click "${S.era==='european_cup'?'Draw European Cup':'Draw Groups'}" above when ready.
    </div>
    <div class="qualify-grid">`

  LEAGUES.forEach(L => {
    const r = lr[L.id]
    if (!r) return
    const standings = r.standings || []
    html += `
      <div class="qualify-card">
        <div class="qualify-card-head">
          <span class="qualify-flag">${flag(L.cc)}</span>
          <span class="qualify-league">${L.name}</span>
          <span class="qualify-slots">${L.slots} slot${L.slots === 1 ? '' : 's'}</span>
        </div>
        <div class="qualify-body">`
    standings.forEach((entry, idx) => {
      const t = entry.team
      const isChampion = idx === 0
      const qualifies = idx < L.slots
      const legend = entry.hasLegend ? ' <span style="color:var(--legendary);font-size:10px" title="Has a legendary star or coach">★</span>' : ''
      html += `
        <div class="qualify-row ${qualifies?'qualifies':''} ${isChampion?'champion':''}">
          <span class="qualify-rank">${idx + 1}</span>
          <span class="qualify-name">
            ${isChampion ? '🏆 ' : ''}${t.name}${legend}
          </span>
          <span class="qualify-score">${entry.score}</span>
        </div>`
    })
    html += `</div></div>`
  })
  html += `</div>`
  return html
}

function renderTopScorers() {
  const sc = Object.entries(S.scorers || {}).sort((a,b) => b[1] - a[1]).slice(0, 5)
  if (!sc.length) return ''
  return `<div class="sec">TOP SCORERS</div><div class="card"><table class="data-table"><tbody>
    ${sc.map(([name, g], i) => `<tr><td style="color:var(--txt3);width:24px">${i+1}</td><td style="font-weight:600">${name}</td><td style="color:var(--gold);font-family:var(--font-head);font-weight:700">${g}⚽</td></tr>`).join('')}
  </tbody></table></div>`
}

function renderRecentResults() {
  const recent = [...(S.allMatchResults || [])].reverse().slice(0, 4)
  if (!recent.length) return ''
  return `<div class="sec">RECENT RESULTS</div>` + recent.map(r => `
    <div class="match-result-card" style="cursor:pointer">
      <div class="match-teams">
        <div class="match-team">${flag(r.t1cc)} ${r.t1name}</div>
        <div class="match-score" style="font-size:20px">${r.g1} – ${r.g2}</div>
        <div class="match-team right">${r.t2name} ${flag(r.t2cc)}</div>
      </div>
    </div>`).join('')
}

// Show the next handful of matches the player will play through.
// During the group stage these are read in order from S.groupMatches.
// During knockout they're the unplayed matches in the current round.
function renderUpcomingGames() {
  let upcoming = []
  let label = 'NEXT UP'
  if (S.phase === 'groups') {
    upcoming = S.groupMatches.filter(m => !m.played).slice(0, 4)
  } else if (S.phase === 'knockout') {
    const round = S.knockoutRounds[S.knockoutRounds.length - 1]
    if (round) {
      upcoming = round.matches.filter(m => !m.played)
      label = `NEXT UP — ${round.name?.toUpperCase() || 'KNOCKOUT'}`
    }
  }
  if (!upcoming.length) return ''
  // Effective overall — includes star, coach, and GM bonuses.
  const ovrEff = t => {
    const eff = getEffStats(t)
    return Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
  }
  return `<div class="sec">${label}</div>` + upcoming.map((m, i) => {
    const groupTag = S.phase === 'groups' && S.groups[m.gi]
      ? `<span class="upcoming-tag">Group ${S.groups[m.gi].id}</span>`
      : ''
    const nextBadge = i === 0 ? '<span class="upcoming-next">NEXT</span>' : ''
    return `<div class="match-result-card upcoming-match">
      <div class="match-teams">
        <div class="match-team">${flag(m.t1.cc)} ${m.t1.name} <span class="ovr-pill">${ovrEff(m.t1)}</span></div>
        <div class="upcoming-vs">vs ${groupTag}${nextBadge}</div>
        <div class="match-team right"><span class="ovr-pill">${ovrEff(m.t2)}</span> ${m.t2.name} ${flag(m.t2.cc)}</div>
      </div>
    </div>`
  }).join('')
}

// ── Stats Update screen — shown during phase 'stats' ─────────
function renderStatsScreen() {
  const seasonNum = S.season || 1
  return `
    <div class="sec">STATS UPDATE — ${gameYear()}</div>
    <div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
      Each team's five stats have been re-rolled around their permanent
      <strong>Base</strong> rating. Drift is normally distributed (±7 typical, rarely more)
      and capped at ±8 from last season. Stars and coaches will be added next.
    </div>
    ${renderStatsTable()}`
}

// Sortable stats table. Used by both the Stats Update screen (Play
// tab during phase 'stats') and the Season tab.
let statsTableSort = { col: 'csOv', dir: 'desc' }
window.setStatsTableSort = function(col) {
  if (statsTableSort.col === col) statsTableSort.dir = statsTableSort.dir === 'desc' ? 'asc' : 'desc'
  else { statsTableSort.col = col; statsTableSort.dir = 'desc' }
  // Pick the right re-render based on which tab/phase we're on.
  if (S.phase === 'stats') renderPlay()
  else renderSeason()
  parseEmoji(document.body)
}

function renderStatsTable() {
  if (!S.allTeams?.length) return '<div class="empty">No teams loaded yet.</div>'
  const tierWeight = { generational:12, legendary:8, epic:5, rare:3, uncommon:1, common:0 }

  // Build the row data once.
  const rows = S.allTeams.map(t => {
    const stats = t.seasonStats || {
      attack:0, defense:0, stamina:0, mental:0, setPieces:0,
    }
    const csOv = t.currentOverall ||
      (stats.attack ? Math.round((stats.attack+stats.defense+stats.stamina+stats.mental+stats.setPieces)/5) : 0)
    const stars = t.stars || []
    const starBoost = stars.reduce((s,x) => s + (tierWeight[x.tier]||0), 0)
    const coach = S.coaches?.find(c => c.teamId === t.id)
    const coachBoost = tierWeight[coach?.tier] || 0
    const moneyBase = t.money || 6
    const gmBonus = t.gm?.moneyBonus || 0
    const moneyEff = Math.min(18, moneyBase + gmBonus)
    return {
      id: t.id,
      name: t.name,
      cc: t.cc,
      money: moneyBase,
      moneyEff,
      moneyCenter: 41 + 4 * moneyEff,   // for drift coloring
      psOv: t.lastSeasonOverall || 0,
      csOv: csOv,
      csOvWith: csOv + starBoost + coachBoost,
      attack: stats.attack || 0,
      defense: stats.defense || 0,
      stamina: stats.stamina || 0,
      mental: stats.mental || 0,
      setPieces: stats.setPieces || 0,
      starCount: stars.length,
      coachTier: coach?.tier || null,
    }
  })

  // Sort.
  const { col, dir } = statsTableSort
  const mul = dir === 'desc' ? -1 : 1
  rows.sort((a,b) => {
    const av = a[col], bv = b[col]
    if (col === 'name') return mul * String(av).localeCompare(String(bv))
    return mul * ((av || 0) - (bv || 0))
  })

  const cols = [
    { id: 'name',      label: 'Team',     isText: true },
    { id: 'money',     label: 'Tier',     title: 'Club financial and sporting tier; actual annual revenue is shown in Finance' },
    { id: 'psOv',      label: 'PS-Ov',    title: 'Prior season overall (0 if first season)' },
    { id: 'csOv',      label: 'CS-Ov',    title: 'Current season overall (avg of 5 stats)' },
    { id: 'csOvWith',  label: 'CS-Ov+',   title: 'Current season overall including stars + coach bonus' },
    { id: 'attack',    label: 'ATT' },
    { id: 'defense',   label: 'DEF' },
    { id: 'stamina',   label: 'STA' },
    { id: 'mental',    label: 'MEN' },
    { id: 'setPieces', label: 'SP' },
    { id: 'starCount', label: '⭐',       title: 'Stars on team' },
  ]

  return `<div class="table-wrap"><table class="data-table sortable stats-table">
    <thead><tr>
      <th class="num">#</th>
      ${cols.map(c => `<th class="${c.isText?'':'num'}" ${c.title?`title="${c.title}"`:''}
        onclick="setStatsTableSort('${c.id}')" style="cursor:pointer">
        ${c.label}${sortIndicator(statsTableSort, c.id)}
      </th>`).join('')}
    </tr></thead><tbody>
    ${rows.map((t, i) => {
      // Compare CS-Ov to money-derived center to show drift coloring.
      const drift = t.csOv - t.moneyCenter
      const driftCol = drift > 2 ? 'var(--green)' : drift < -2 ? 'var(--red)' : 'var(--txt2)'
      const psOvCell = t.psOv ? t.psOv : '<span style="color:var(--txt3)">—</span>'
      const psDelta = t.psOv ? (t.csOv - t.psOv) : 0
      const psDeltaStr = t.psOv
        ? ` <span style="color:${psDelta>0?'var(--green)':psDelta<0?'var(--red)':'var(--txt3)'};font-size:10px">${psDelta>0?'+':''}${psDelta}</span>`
        : ''
      const gmStr = (t.moneyEff > t.money)
        ? ` <span style="color:var(--green);font-size:10px">+${t.moneyEff - t.money}</span>`
        : ''
      return `<tr>
        <td class="num" style="color:var(--txt3)">${i + 1}</td>
        <td><strong>${flag(t.cc)} ${t.name}</strong></td>
        <td class="num" style="color:var(--gold);font-weight:700">${t.money}${gmStr}</td>
        <td class="num">${psOvCell}</td>
        <td class="num" style="color:${driftCol};font-weight:700">${t.csOv || '—'}${psDeltaStr}</td>
        <td class="num" style="color:var(--gold);font-weight:700">${t.csOvWith || '—'}</td>
        <td class="num">${t.attack || '—'}</td>
        <td class="num">${t.defense || '—'}</td>
        <td class="num">${t.stamina || '—'}</td>
        <td class="num">${t.mental || '—'}</td>
        <td class="num">${t.setPieces || '—'}</td>
        <td class="num" style="color:var(--blue2)">${t.starCount}</td>
      </tr>`
    }).join('')}
    </tbody></table></div>`
}

// ── Market screen — shown in Play tab during phase 'market' ─
function renderMarketScreen() {
  const moves = S.lastMarket || []
  const seasonNum = S.season || 1
  let html = `
    <div class="sec">OFFSEASON — ${gameYear()}</div>
    <div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
      Revenue, squad payroll, transfers, free agents, contract renewals,
      named-player wages, and club investment. Click "Run Local Leagues"
      above when you're ready to continue.
    </div>`

  if (!moves.length) {
    html += '<div class="empty">Quiet window — nothing to report.</div>'
    return html
  }

  // Quick economy summary banner.
  const teamMoves = moves.filter(m => m.kind === 'team')
  if (teamMoves.length) {
    const incomeTotal = teamMoves.filter(m => m.phase === 'income').reduce((s,m) => s + m.amount, 0)
    const salaryTotal = teamMoves.filter(m => m.phase === 'salary').reduce((s,m) => s + Math.abs(m.amount || 0), 0)
    const baseCostTotal = teamMoves.filter(m => ['base_spend','operations'].includes(m.phase)).reduce((s,m) => s + Math.abs(m.amount || 0), 0)
    const investmentTotal = teamMoves.filter(m => m.phase === 'invest').reduce((s,m) => s + Math.abs(m.amount || 0), 0)
    // Transfer flow.
    const transfers = moves.filter(m => m.phase === 'transfer')
    const transferCount = transfers.length
    const feesPaid = transfers.reduce((s,m) => s + (m.signFee || 0), 0)
    // FA flow.
    const faMoves = moves.filter(m => m.phase === 'fa_sign')
    const faCount = faMoves.length
    const faFees = faMoves.reduce((s,m) => s + (m.signFee || 0), 0)
    html += `<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div style="padding:8px 12px;background:rgba(76,175,80,.1);border:1px solid rgba(76,175,80,.3);border-radius:6px">
        <div style="font-size:10px;color:var(--txt3);text-transform:uppercase">Total income</div>
        <div style="font-size:16px;color:var(--green);font-weight:700">+${fmtMoney(incomeTotal)}</div>
      </div>
      <div style="padding:8px 12px;background:rgba(244,67,54,.1);border:1px solid rgba(244,67,54,.3);border-radius:6px">
        <div style="font-size:10px;color:var(--txt3);text-transform:uppercase">Total salaries</div>
        <div style="font-size:16px;color:var(--red);font-weight:700">−${fmtMoney(salaryTotal)}</div>
      </div>
      <div style="padding:8px 12px;background:rgba(244,67,54,.08);border:1px solid rgba(244,67,54,.22);border-radius:6px">
        <div style="font-size:10px;color:var(--txt3);text-transform:uppercase">Base squads + operations</div>
        <div style="font-size:16px;color:var(--txt2);font-weight:700">−${fmtMoney(baseCostTotal)}</div>
      </div>
      ${investmentTotal ? `<div style="padding:8px 12px;background:rgba(171,71,188,.1);border:1px solid rgba(171,71,188,.3);border-radius:6px"><div style="font-size:10px;color:var(--txt3);text-transform:uppercase">Team development</div><div style="font-size:16px;color:#ce93d8;font-weight:700">−${fmtMoney(investmentTotal)}</div></div>` : ''}
      ${transferCount ? `<div style="padding:8px 12px;background:rgba(33,150,243,.1);border:1px solid rgba(33,150,243,.3);border-radius:6px">
        <div style="font-size:10px;color:var(--txt3);text-transform:uppercase">Transfers (${transferCount})</div>
        <div style="font-size:16px;color:var(--blue2);font-weight:700">${fmtMoney(feesPaid)} moved between clubs</div>
      </div>` : ''}
      ${faCount ? `<div style="padding:8px 12px;background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.3);border-radius:6px">
        <div style="font-size:10px;color:var(--txt3);text-transform:uppercase">FA signings (${faCount})</div>
        <div style="font-size:16px;color:var(--gold);font-weight:700">−${fmtMoney(faFees)}</div>
      </div>` : ''}
    </div>`
  }

  html += renderMarketMoveList(moves)
  return html
}

// Shared renderer (used by Market screen and Season → Market tab).
function renderMarketMoveList(moves) {
  if (!moves.length) return '<div class="empty">No market moves this season.</div>'
  const phaseTitle = {
    retirement:  'RETIREMENTS',
    expire:      'CONTRACTS EXPIRED (→ FREE AGENCY)',
    renew:       'CONTRACT RENEWALS',
    youth:       'ROOKIES & NEW MANAGERS',
    fa_sign:     'FREE AGENT SIGNINGS',
    transfer:    'TRANSFERS',
    cap_release: 'SQUAD CAP RELEASES',
    signing:     'SIGNINGS',          // legacy
    overflow:    'SQUAD CAP RELEASES', // legacy
  }
  const phaseColor = {
    retirement:  'var(--silver)',
    expire:      'var(--red)',
    renew:       'var(--green)',
    youth:       'var(--blue2)',
    fa_sign:     'var(--gold)',
    transfer:    'var(--blue2)',
    cap_release: 'var(--silver)',
    signing:     'var(--blue2)',
    overflow:    'var(--gold)',
  }
  const order = ['retirement', 'expire', 'renew', 'transfer', 'cap_release', 'fa_sign', 'youth', 'signing', 'overflow']
  let html = ''
  order.forEach(ph => {
    const here = moves.filter(m => m.phase === ph && m.kind !== 'team')
    if (!here.length) return
    html += `<div class="sec" style="color:${phaseColor[ph]}">${phaseTitle[ph]} (${here.length})</div>`
    html += '<div class="market-list">'
    here.forEach(m => {
      html += renderMarketMoveCard(m)
    })
    html += '</div>'
  })
  return html
}

function renderMarketMoveCard(m) {
  const kindIcon = m.kind === 'coach' ? '📋' : '⚽'
  const fromCC = m.fromCC || ''
  const toCC = m.toCC || ''
  let summary = ''
  if (m.phase === 'retirement') {
    summary = `Retires from ${flag(fromCC)} ${m.from}`
  } else if (m.phase === 'expire') {
    summary = `${flag(fromCC)} ${m.from} → <span style="color:var(--red)">Free agency</span>`
    if (m.reason) summary += ` <span style="color:var(--txt3);font-size:10px">(${m.reason})</span>`
    if (typeof m.happiness === 'number') {
      summary += `<div style="margin-top:2px;color:var(--txt3);font-size:10px">Happiness ${m.happiness} · mood also affected the salary demand</div>`
    }
  } else if (m.phase === 'renew') {
    summary = `<span style="color:var(--green)">Renews with ${flag(toCC)} ${m.to}</span>`
    if (m.contractYears) summary += ` <span style="color:var(--txt3);font-size:10px">(${m.contractYears} yr)</span>`
  } else if (m.phase === 'fa_sign') {
    summary = `<span style="color:var(--gold)">Free agency → ${flag(toCC)} ${m.to}</span>`
    const bits = []
    if (m.signFee)      bits.push(`bonus ${fmtMoney(m.signFee)}`)
    if (m.salary)       bits.push(`${fmtMoney(m.salary)}/yr`)
    if (m.contractYears) bits.push(`${m.contractYears} yr`)
    if (bits.length) summary += ` <span style="color:var(--txt3);font-size:10px">(${bits.join(' · ')})</span>`
  } else if (m.phase === 'transfer') {
    summary = `${flag(fromCC)} ${m.from} → <span style="color:var(--blue2)">${flag(toCC)} ${m.to}</span>`
    const bits = []
    if (m.signFee)   bits.push(`fee ${fmtMoney(m.signFee)}`)
    if (m.saleValue) bits.push(`seller +${fmtMoney(m.saleValue)}`)
    if (m.salary)    bits.push(`${fmtMoney(m.salary)}/yr`)
    if (m.contractYears) bits.push(`${m.contractYears} yr`)
    if (bits.length) summary += `<div style="margin-top:2px;color:var(--txt3);font-size:10px">${bits.join(' · ')}</div>`
    if (m.displaced) {
      summary += `<div style="margin-top:2px;color:var(--txt3);font-size:10px">↳ displaced <strong>${m.displaced.name}</strong> (${m.displaced.tier})</div>`
    }
  } else if (m.phase === 'cap_release') {
    summary = `Released from ${flag(fromCC)} ${m.from} <span style="color:var(--txt3);font-size:10px">(${m.reason || 'displaced'})</span>`
  } else if (m.phase === 'signing') {
    summary = `${flag(fromCC)} ${m.from} → <span style="color:var(--blue2)">${flag(toCC)} ${m.to}</span>`
    if (m.swap) {
      summary += `<div style="margin-top:2px;color:var(--txt3)">↔ swapped with <strong>${m.swap.withName}</strong></div>`
    }
  } else if (m.phase === 'overflow') {
    if (m.to) summary = `${flag(fromCC)} ${m.from} → <span style="color:var(--gold)">${flag(toCC)} ${m.to}</span>${m.reason ? ` <span style="color:var(--txt3);font-size:10px">(${m.reason})</span>` : ''}`
    else summary = `Released from ${flag(fromCC)} ${m.from} <span style="color:var(--txt3);font-size:10px">(${m.reason || 'no destination'})</span>`
  } else if (m.phase === 'youth') {
    summary = `${m.from} → <span style="color:var(--green)">${flag(toCC)} ${m.to}</span>`
  }
  const meta = m.kind === 'player'
    ? `<span style="font-size:10px;color:var(--txt3);margin-left:4px">${m.pos || ''}</span>`
    : ''
  const onClick = m.kind === 'player' && m.star?.id
    ? `onclick="window.openStarDetail('${m.star.id}')" style="cursor:pointer"`
    : m.kind === 'coach' && m.coach?.id
    ? `onclick="window.openCoachDetail('${m.coach.id}')" style="cursor:pointer"`
    : ''
  return `<div class="market-card" ${onClick}>
    <div class="row" style="gap:6px">
      <span style="font-size:14px">${kindIcon}</span>
      <span style="font-weight:600">${m.name}</span>
      ${tierBadge(m.tier)}
      ${meta}
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-top:4px">${summary}</div>
  </div>`
}

// ── Star/coach detail popups ────────────────────────────────
window.openStarDetail = function(starId) {
  // Check team rosters first
  const teamStars = (S.allTeams || []).flatMap(t => t.stars || [])
  let star = teamStars.find(s => s.id === starId)
  if (star) return showDetailModal(renderStarDetailHTML(star))
  // Check free agents
  star = (S.freeAgents?.stars || []).find(s => s.id === starId)
  if (star) return showDetailModal(renderStarDetailHTML(star))
  // Check historical snapshots for retired/lost players
  const histStar = [...(S.history || [])].reverse()
    .flatMap(h => [...(h.teamSeasons || []), ...(h.dnqTeams || [])])
    .flatMap(ts => ts.stars || [])
    .find(s => s?.id === starId)
  if (histStar) {
    // Build a stub for retired players with available data
    const career = S.playerStats?.[starId]
    return showDetailModal(renderStarDetailHTML({
      ...histStar,
      retired: true,
      career,
    }))
  }
  toast('Player not found.')
}
window.openCoachDetail = function(coachId) {
  const live = (S.coaches || []).find(c => c.id === coachId)
  // Even retired coaches can be opened — their per-season records
  // and career totals live in S.coachStats / S.history. Build a stub
  // when we don't have the live object.
  if (live) return showDetailModal(renderCoachDetailHTML(live))
  const career = S.coachStats?.[coachId]
  if (!career) return toast('Coach not found.')
  // Find any historical snapshot to recover trait/skills info if any.
  const histCoach = [...(S.history || [])].reverse()
    .flatMap(h => [...(h.teamSeasons || []), ...(h.dnqTeams || [])])
    .map(ts => ts.coach).find(c => c?.id === coachId)
  showDetailModal(renderCoachDetailHTML({
    id: coachId,
    name: career.name,
    tier: career.tier || histCoach?.tier,
    nationality: career.nationality || 'eu',
    teamId: null,
    teamName: career.lastTeamName || '—',
    retired: true,
  }))
}
window.openTeamDetail = function(teamId) {
  const team = (S.allTeams || []).find(t => t.id === teamId)
  // For teams not currently in S.allTeams (extremely unlikely — every
  // team should be there), fall back to a stub from the most recent
  // history record.
  if (!team) {
    const fromHist = [...(S.history || [])].reverse()
      .flatMap(h => [...(h.teamSeasons || []), ...(h.dnqTeams || [])])
      .find(ts => ts.teamId === teamId)
    if (!fromHist) return toast('Team not found.')
    return showDetailModal(renderTeamDetailHTML({
      id: fromHist.teamId, name: fromHist.teamName, cc: fromHist.cc,
      money: 0, currentOverall: fromHist.overall || 0,
    }))
  }
  showDetailModal(renderTeamDetailHTML(team))
}
window.closeDetailModal = function() {
  const m = $('detail-modal')
  if (m) m.remove()
}

function showDetailModal(innerHTML) {
  let m = $('detail-modal')
  if (m) m.remove()
  m = document.createElement('div')
  m.id = 'detail-modal'
  m.className = 'match-popup-modal'
  m.onclick = (e) => { if (e.target === m) window.closeDetailModal() }
  m.innerHTML = `<div class="playback-card">${innerHTML}
    <div class="playback-actions">
      <button class="btn btn-primary" onclick="window.closeDetailModal()">Close</button>
    </div>
  </div>`
  document.body.appendChild(m)
  parseEmoji(m)
}

function renderStarDetailHTML(star) {
  const team = (S.allTeams || []).find(t => t.id === star.teamId)
  const skills = describeStarSkills(star)
  const age = (S.season || 1) - (star.season || 1)
  const country = COUNTRY_NAME[star.nationality] || star.nationality || '—'

  // Walk S.history to assemble the career row-by-row. Match by ID
  // (added in the season-end snapshot) for new saves; fall back to
  // name match for legacy saves missing the id field.
  const careerRows = []
  let totalGoals = 0
  let totalGames = 0
  let ratingSum = 0, ratingCount = 0
  let totalGold = 0, totalSilver = 0, totalBronze = 0
  let topScorerCount = 0, offMVPCount = 0, defMVPCount = 0
  ;(S.history || []).forEach(h => {
    const rec = (h.stars || []).find(s => s.id === star.id) ||
                (h.stars || []).find(s => s.name === star.name && s.pos === star.pos)
    if (!rec) return
    totalGoals += rec.goals || 0
    totalGames += rec.games || 0
    if (rec.avgRating) { ratingSum += rec.avgRating; ratingCount++ }
    if (rec.medals?.gold) totalGold     += rec.medals.gold
    if (rec.medals?.silver) totalSilver += rec.medals.silver
    if (rec.medals?.bronze) totalBronze += rec.medals.bronze

    const awards = []
    if (h.awards?.topScorer?.name === star.name) { awards.push('Top Scorer'); topScorerCount++ }
    if (h.awards?.offMVP?.name    === star.name) { awards.push('Off MVP');    offMVPCount++ }
    if (h.awards?.defMVP?.name    === star.name) { awards.push('Def MVP');    defMVPCount++ }

    careerRows.push({
      season: h.season,
      year: historyYear(h),
      teamName: rec.teamName,
      avgRating: rec.avgRating,
      goals: rec.goals || 0,
      reached: rec.roundReached || 'Group',
      awards,
    })
  })
  // Newest first.
  careerRows.sort((a,b) => b.season - a.season)

  // Add a row for the CURRENT in-progress season if the player is
  // active and the season hasn't been finalized yet.
  if (star.ratings?.length) {
    const alreadyHasCurrent = careerRows.some(r => r.season === S.season)
    if (!alreadyHasCurrent) {
      const reached = S.roundReached?.[star.teamId] || (S.phase === 'done' ? (S.era === 'european_cup' ? 'Round of 16' : 'Group') : 'In progress')
      careerRows.unshift({
        season: S.season,
        year: gameYear(),
        teamName: star.teamName,
        avgRating: star.ratings.reduce((a,b)=>a+b,0) / star.ratings.length,
        goals: star.goals || 0,
        reached,
        awards: [],
        current: true,
      })
    }
  }

  const reachLabel = (r) => {
    if (r === 'Group')          return '<span style="color:var(--txt3)">Group stage</span>'
    if (r === 'Round of 16')    return '<span style="color:var(--txt2)">R16</span>'
    if (r === 'Quarter-finals') return '<span style="color:#f0c040">QF</span>'
    if (r === 'Semi-finals')    return '<span style="color:#f0c040">SF</span>'
    if (r === 'Final')          return '<span style="color:var(--gold)">Final</span>'
    if (r === 'Winner')         return '<span style="color:var(--gold)">🏆 Champion</span>'
    if (r === 'In progress')    return '<span style="color:var(--blue2)">In progress</span>'
    return r
  }
  const careerAvg = ratingCount ? (ratingSum / ratingCount) : 0

  // Awards summary cards.
  const awardsSummary = `
    <div class="career-awards">
      <div class="career-award-card"><div class="career-award-num" style="color:var(--gold)">${totalGold || 0}</div><div class="career-award-label">European Titles</div></div>
      <div class="career-award-card"><div class="career-award-num">${topScorerCount}</div><div class="career-award-label">Top Scorer</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--blue2)">${offMVPCount}</div><div class="career-award-label">Off MVP</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--green)">${defMVPCount}</div><div class="career-award-label">Def MVP</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--gold)">${totalGoals}</div><div class="career-award-label">Career Goals</div></div>
      <div class="career-award-card"><div class="career-award-num">${careerAvg ? careerAvg.toFixed(2) : '—'}</div><div class="career-award-label">Career Avg</div></div>
    </div>`

  const careerTable = careerRows.length ? `
    <div class="career-section-title">CAREER</div>
    <div class="table-wrap"><table class="data-table compact career-table"><thead><tr>
      <th class="num">Yr</th><th>Team</th>
      <th class="num">Rating</th><th class="num">Goals</th>
      <th>Result</th><th>Awards</th>
    </tr></thead><tbody>
    ${careerRows.map(row => `<tr ${row.current ? 'class="career-current"' : ''}>
      <td class="num"><strong>${row.year || yearForSeason(row.season)}</strong></td>
      <td>${row.teamName}</td>
      <td class="num" style="color:var(--blue2)">${row.avgRating ? row.avgRating.toFixed(2) : '—'}</td>
      <td class="num" style="color:var(--gold)">${row.goals || '—'}</td>
      <td style="font-size:11px">${reachLabel(row.reached)}</td>
      <td style="font-size:11px;color:var(--gold)">${row.awards.length ? row.awards.join(', ') : '—'}</td>
    </tr>`).join('')}
    </tbody></table></div>` : ''

  // Visual skill data
  const skillData = getStarSkillData(star)
  const STAT_COLORS = { attack:'#ff7043', defense:'#42a5f5', stamina:'#66bb6a', mental:'#ab47bc', setPieces:'#ffca28' }
  const STAT_LABELS = { attack:'ATTACK', defense:'DEFENSE', stamina:'STAMINA', mental:'MENTAL', setPieces:'SET PIECES' }
  const statKeys = ['attack','defense','stamina','mental','setPieces']
  const maxStat = Math.max(...statKeys.map(k => skillData.stats[k] || 0), 1)

  const statBarsHTML = statKeys.filter(k => (skillData.stats[k] || 0) > 0).map(k => `
    <div class="skill-stat-row">
      <div class="skill-stat-label">${STAT_LABELS[k]}</div>
      <div class="skill-stat-bar"><div class="skill-stat-fill" style="width:${(skillData.stats[k]/maxStat)*100}%;background:${STAT_COLORS[k]}"></div></div>
      <div class="skill-stat-value">+${skillData.stats[k]}</div>
    </div>`).join('')

  const scoringHTML = skillData.scoring ? `
    <div class="skill-block">
      <div class="skill-block-title">⚽ SCORING POTENTIAL</div>
      <div class="skill-scoring-bar">
        ${skillData.scoring.map(s => `<div class="skill-scoring-seg seg-${s.goals}" style="flex:${s.percent}" title="${Math.round(s.percent*100)}% chance of scoring ${s.goals} goal${s.goals===1?'':'s'}">
          <div class="skill-scoring-pct">${Math.round(s.percent*100)}%</div>
          <div class="skill-scoring-sub">${s.goals}g</div>
        </div>`).join('')}
      </div>
    </div>` : ''

  const saveHTML = skillData.savePct !== null ? `
    <div class="skill-block">
      <div class="skill-block-title">🧤 DEFENSIVE PRESENCE</div>
      <div class="skill-save-card">
        <div class="skill-save-num">${Math.round(skillData.savePct*100)}<span style="font-size:14px">%</span></div>
        <div class="skill-save-label">chance to deny each opposing goal</div>
      </div>
    </div>` : ''

  const traitHTML = skillData.trait ? `
    <div class="skill-trait-card">
      <div class="skill-trait-icon">✦</div>
      <div class="skill-trait-body">
        <div class="skill-trait-name">${skillData.trait.name}</div>
        <div class="skill-trait-desc">${skillData.trait.description}</div>
      </div>
    </div>` : ''

  const careerStageHTML = skillData.careerStage ? `
    <div class="skill-meta-pill">
      📈 ${skillData.careerStage.label} — ${skillData.careerStage.percent}% potential
    </div>` : ''

  const contractHTML = skillData.contract ? `
    <div class="skill-meta-pill">
      📜 ${skillData.contract.yearsLeft}/${skillData.contract.yearsTotal} yr · ${fmtMoney(skillData.contract.salary)}/yr
    </div>` : ''

  return `
    <div class="playback-header">
      <div class="playback-round">Player Profile</div>
      ${star.historicLegend ? '<span class="historic-legend-badge">HISTORIC LEGEND</span>' : ''}
      ${tierBadge(star.tier)}
    </div>
    <div style="font-family:var(--font-head);font-size:26px;font-weight:800;margin-bottom:4px">${star.name}</div>
    <div style="font-size:12px;color:var(--txt2);margin-bottom:4px">
      ${flag(star.nationality)} ${country} · ${star.pos} ·
      ${flag(team?.cc || '')} ${team?.name || star.teamName || '—'}
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:10px">
      Age: ${playerAge(star, S.season)} (${age}/${star.lifespan} seasons in career) ·
      Career goals: <span style="color:var(--gold)">${careerGoalsFor(star)}</span>
    </div>
    <div class="skill-meta-row">
      ${contractHTML}
      ${careerStageHTML}
    </div>
    ${awardsSummary}
    <div class="skill-block">
      <div class="skill-block-title">📊 SKILL BOOST TO TEAM</div>
      ${statBarsHTML || '<div style="color:var(--txt3);font-size:12px">No direct stat impact for this position/tier</div>'}
    </div>
    ${scoringHTML}
    ${saveHTML}
    ${traitHTML}
    ${careerTable}`
}

function renderCoachDetailHTML(coach) {
  const team = (S.allTeams || []).find(t => t.id === coach.teamId)
  const skills = describeCoachSkills(coach)
  const career = S.coachStats?.[coach.id]
  const isRetired = !!coach.retired || !S.coaches?.find(c => c.id === coach.id)
  const age = !isRetired && coach.season ? (S.season || 1) - coach.season : null

  // Walk S.history newest-first to build per-season rows for this
  // coach. Each season they led a team (CL or DNQ), pick up which
  // team and how that team performed. The team's per-season W/D/L/GF/
  // GA come straight off the snapshot we made in finalizeSeasonStats.
  const rows = []
  ;[...(S.history || [])].reverse().forEach(h => {
    let entry = null, isDNQ = false
    const qual = (h.teamSeasons || []).find(ts => ts.coach?.id === coach.id)
    if (qual) entry = qual
    else {
      const dnq = (h.dnqTeams || []).find(ts => ts.coach?.id === coach.id)
      if (dnq) { entry = dnq; isDNQ = true }
    }
    if (!entry) return
    rows.push({
      season: h.season,
      year: historyYear(h),
      teamId: entry.teamId,
      teamName: entry.teamName,
      teamCC: entry.cc,
      reached: isDNQ ? 'DNQ' : entry.reached,
      played: isDNQ ? 0 : (entry.played ?? 0),
      wins:   isDNQ ? 0 : (entry.wins ?? 0),
      gf:     isDNQ ? 0 : (entry.gf ?? 0),
      ga:     isDNQ ? 0 : (entry.ga ?? 0),
    })
  })

  // Inject the in-progress current season at the top (only if the
  // coach is actively leading a CL team this season).
  const liveTeam = team && S.teams?.find(t => t.id === team.id)
  if (liveTeam && S.phase !== 'idle' && S.phase !== 'done') {
    rows.unshift({
      season: S.season,
      year: gameYear(),
      teamId: liveTeam.id,
      teamName: liveTeam.name,
      teamCC: liveTeam.cc,
      reached: 'In progress',
      played: (liveTeam.w || 0) + (liveTeam.d || 0) + (liveTeam.l || 0),
      wins:   liveTeam.w || 0,
      gf:     liveTeam.gf || 0,
      ga:     liveTeam.ga || 0,
      current: true,
    })
  }

  const reachLabel = (r) => {
    if (r === 'In progress')    return '<span style="color:var(--blue2)">In progress</span>'
    if (r === 'DNQ')            return '<span style="color:var(--txt3)">DNQ</span>'
    if (r === 'Group')          return '<span style="color:var(--txt2)">Group</span>'
    if (r === 'Round of 16')    return '<span style="color:var(--txt2)">R16</span>'
    if (r === 'Quarter-finals') return '<span style="color:#f0c040">QF</span>'
    if (r === 'Semi-finals')    return '<span style="color:#f0c040">SF</span>'
    if (r === 'Final')          return '<span style="color:var(--gold)">Final</span>'
    if (r === 'Winner')         return '<span style="color:var(--gold)">🏆 Champion</span>'
    return r
  }

  // Career-totals strip — UCL titles, local titles, totals across
  // every team they've led.
  const summary = career ? `
    <div class="career-awards">
      <div class="career-award-card"><div class="career-award-num" style="color:var(--gold)">${career.titles || 0}</div><div class="career-award-label">European Titles</div></div>
      <div class="career-award-card"><div class="career-award-num">${career.finals || 0}</div><div class="career-award-label">Finals lost</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--txt2)">${career.semiFinals || 0}</div><div class="career-award-label">Semis</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--txt2)">${career.quarterFinals || 0}</div><div class="career-award-label">QFs</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--legendary)">${career.localTitles || 0}</div><div class="career-award-label">Local Titles</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--blue2)">${career.seasons || 0}</div><div class="career-award-label">Seasons</div></div>
    </div>
    <div class="career-awards" style="margin-top:8px">
      <div class="career-award-card"><div class="career-award-num">${career.played || 0}</div><div class="career-award-label">European Games</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--green)">${career.wins || 0}</div><div class="career-award-label">Wins</div></div>
      <div class="career-award-card"><div class="career-award-num">${career.draws || 0}</div><div class="career-award-label">Draws</div></div>
      <div class="career-award-card"><div class="career-award-num">${career.losses || 0}</div><div class="career-award-label">Losses</div></div>
      <div class="career-award-card"><div class="career-award-num">${career.goalsFor || 0}</div><div class="career-award-label">Goals For</div></div>
      <div class="career-award-card"><div class="career-award-num">${career.goalsAgainst || 0}</div><div class="career-award-label">Goals Against</div></div>
    </div>` : ''

  const careerTable = rows.length ? `
    <div class="career-section-title">SEASON-BY-SEASON</div>
    <div class="table-wrap"><table class="data-table compact career-table"><thead><tr>
      <th class="num">Yr</th>
      <th>Club</th>
      <th>Result</th>
      <th class="num">P</th>
      <th class="num">W</th>
      <th class="num">GF</th>
      <th class="num">GA</th>
    </tr></thead><tbody>
    ${rows.map(row => `<tr ${row.current ? 'class="career-current"' : ''}>
      <td class="num"><strong>${row.year || yearForSeason(row.season)}</strong></td>
      <td><span class="team-name-link" onclick="window.openTeamDetail('${row.teamId}')">${flag(row.teamCC)} ${row.teamName}</span></td>
      <td style="font-size:11px">${reachLabel(row.reached)}</td>
      <td class="num">${row.played != null ? row.played : '—'}</td>
      <td class="num" style="color:var(--green)">${row.wins != null ? row.wins : '—'}</td>
      <td class="num">${row.gf != null ? row.gf : '—'}</td>
      <td class="num">${row.ga != null ? row.ga : '—'}</td>
    </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No completed seasons logged yet for this coach.</div>'

  // Header club line: live team if active, else "Retired" + last club.
  const clubLine = isRetired
    ? `<span style="color:var(--txt3)">Retired</span>${career?.lastTeamName ? ` · last at ${flag(career.lastTeamCC || '')} ${career.lastTeamName}` : ''}`
    : `${flag(team?.cc || coach.nationality || '')} ${team?.name || coach.teamName || '—'}`

  return `
    <div class="playback-header">
      <div class="playback-round">Coach Profile</div>
      ${coach.tier ? tierBadge(coach.tier) : ''}
    </div>
    <div style="font-family:var(--font-head);font-size:24px;font-weight:700;margin-bottom:4px">${coach.name}</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:12px">
      ${flag(coach.nationality || '')} ${COUNTRY_NAME[coach.nationality] || coach.nationality || '—'} ·
      ${clubLine}
    </div>
    ${age != null ? `<div style="font-size:11px;color:var(--txt3);margin-bottom:12px">
      ${age}/${coach.lifespan} seasons at the club
    </div>` : ''}
    ${coach.trait ? `
    <div style="background:linear-gradient(135deg, rgba(255,152,0,.12), rgba(255,152,0,.04)); border:1px solid rgba(255,152,0,.3); border-radius:var(--r); padding:10px 12px; margin-bottom:12px">
      <div style="font-family:var(--font-head); font-size:11px; letter-spacing:.14em; color:var(--gold); text-transform:uppercase; margin-bottom:4px">${coach.trait.tier === 'legendary' ? '★ Legendary Trait' : '★ Epic Trait'}</div>
      <div style="font-weight:700; margin-bottom:2px">${coach.trait.name}</div>
      <div style="font-size:11px; color:var(--txt2)">${coach.trait.description}</div>
    </div>` : ''}
    ${skills?.length ? `<div class="star-skills">
      ${skills.map(s => `<div class="star-skill-line">${s}</div>`).join('')}
    </div>` : ''}
    ${summary}
    ${careerTable}`
}

function renderTeamDetailHTML(team) {
  // Walk S.history newest first to build per-season rows for this
  // team. Each year may be a "qualified" entry (with games/goals/
  // coach/stars) or a "DNQ" entry (sparser data).
  const rows = []
  const seasonStats = (S.teamStats || {})[team.id]

  ;[...(S.history || [])].reverse().forEach(h => {
    const qual = (h.teamSeasons || []).find(ts => ts.teamId === team.id)
    if (qual) {
      rows.push({
        season: h.season,
        year: historyYear(h),
        overall: qual.overall || 0,
        localPosition: qual.localPosition || null,
        localLeagueName: qual.localLeagueName || null,
        reached: qual.reached,
        played: qual.played, wins: qual.wins, gf: qual.gf, ga: qual.ga,
        coach: qual.coach,
        stars: qual.stars || [],
      })
      return
    }
    const dnq = (h.dnqTeams || []).find(ts => ts.teamId === team.id)
    if (dnq) {
      rows.push({
        season: h.season,
        year: historyYear(h),
        overall: dnq.overall || 0,
        localPosition: dnq.localPosition || null,
        localLeagueName: dnq.localLeagueName || null,
        reached: 'DNQ',
        played: 0, wins: 0, gf: 0, ga: 0,
        coach: dnq.coach,
        stars: dnq.stars || [],
      })
      return
    }
    // Pre-existing-data row: history entry exists but no team-by-
    // team data was captured (older save). Fall back to roundReached
    // map if it has the team id.
    if (h.roundReached?.[team.id]) {
      rows.push({
        season: h.season,
        year: historyYear(h),
        overall: 0,
        localPosition: null,
        localLeagueName: null,
        reached: h.roundReached[team.id],
        played: null, wins: null, gf: null, ga: null,
        coach: null,
        stars: [],
        legacy: true,
      })
    }
  })

  // Inject the in-progress current season at the top.
  const liveTeam = S.teams?.find(t => t.id === team.id)
  if (liveTeam && S.phase !== 'idle' && S.phase !== 'done') {
    const stars = (liveTeam.stars || []).map(s => ({ id: s.id, name: s.name, pos: s.pos, tier: s.tier, salary: s.contract?.salary }))
    let liveLocal = null
    Object.values(S.localLeagueResults || {}).some(result => {
      const idx = (result.standings || []).findIndex(entry => entry.team.id === liveTeam.id)
      if (idx < 0) return false
      liveLocal = { position: idx + 1, league: result.league.name }
      return true
    })
    rows.unshift({
      season: S.season,
      year: gameYear(),
      overall: liveTeam.currentOverall || 0,
      localPosition: liveLocal?.position || null,
      localLeagueName: liveLocal?.league || null,
      reached: 'In progress',
      played: (liveTeam.w || 0) + (liveTeam.d || 0) + (liveTeam.l || 0),
      wins: liveTeam.w || 0,
      gf: liveTeam.gf || 0, ga: liveTeam.ga || 0,
      coach: liveTeam.coach ? { id: liveTeam.coach.id, name: liveTeam.coach.name, tier: liveTeam.coach.tier, salary: liveTeam.coach.contract?.salary } : null,
      stars,
      current: true,
    })
  }

  const reachLabel = (r) => {
    if (r === 'In progress')    return '<span style="color:var(--blue2)">In progress</span>'
    if (r === 'DNQ')            return '<span style="color:var(--txt3)">DNQ</span>'
    if (r === 'Group')          return '<span style="color:var(--txt2)">Group</span>'
    if (r === 'Round of 16')    return '<span style="color:var(--txt2)">R16</span>'
    if (r === 'Quarter-finals') return '<span style="color:#f0c040">QF</span>'
    if (r === 'Semi-finals')    return '<span style="color:#f0c040">SF</span>'
    if (r === 'Final')          return '<span style="color:var(--gold)">Final</span>'
    if (r === 'Winner')         return '<span style="color:var(--gold)">🏆 Champion</span>'
    return r
  }

  const renderStarsCell = (stars) => {
    if (!stars?.length) return '<span style="color:var(--txt3)">—</span>'
    return stars.map(s =>
      `<button class="detail-inline-link" style="color:${tierColor(s.tier)}" onclick="event.stopPropagation();window.openStarDetail('${s.id}')">⭐ ${s.name}<span> · ${s.pos}</span></button>`
    ).join('')
  }
  const renderCoachCell = (coach) => {
    if (!coach) return '<span style="color:var(--txt3)">—</span>'
    return `<button class="detail-inline-link" style="color:${tierColor(coach.tier)}" onclick="event.stopPropagation();window.openCoachDetail('${coach.id}')">📋 ${coach.name}</button>`
  }

  // Top-level totals (from S.teamStats — the all-time accumulator).
  const summary = seasonStats ? `
    <div class="career-awards">
      <div class="career-award-card"><div class="career-award-num" style="color:var(--gold)">${seasonStats.titles || 0}</div><div class="career-award-label">European Titles</div></div>
      <div class="career-award-card"><div class="career-award-num">${seasonStats.finals || 0}</div><div class="career-award-label">Finals lost</div></div>
      <div class="career-award-card"><div class="career-award-num">${seasonStats.semiFinals || 0}</div><div class="career-award-label">Semis</div></div>
      <div class="career-award-card"><div class="career-award-num">${seasonStats.quarterFinals || 0}</div><div class="career-award-label">QFs</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--legendary)">${seasonStats.localTitles || 0}</div><div class="career-award-label">Local Titles</div></div>
      <div class="career-award-card"><div class="career-award-num" style="color:var(--blue2)">${seasonStats.participations || 0}</div><div class="career-award-label">European appearances</div></div>
    </div>` : ''

  const careerTable = rows.length ? `
    <div class="career-section-title">SEASON-BY-SEASON</div>
    <div class="table-wrap"><table class="data-table compact career-table"><thead><tr>
      <th class="num">Yr</th>
      <th class="num">OVR</th>
      <th title="Position in the domestic league">Local</th>
      <th>Europe</th>
      <th class="num">P</th>
      <th class="num">W</th>
      <th class="num">GF</th>
      <th class="num">GA</th>
      <th>Coach</th>
      <th>Stars</th>
    </tr></thead><tbody>
    ${rows.map(row => `<tr ${row.current ? 'class="career-current"' : ''}>
      <td class="num"><strong>${row.year || yearForSeason(row.season)}</strong></td>
      <td class="num" style="color:var(--gold)">${row.overall || '—'}</td>
      <td style="font-size:11px">${row.localPosition ? `<strong>${row.localPosition}${row.localPosition===1?'st':row.localPosition===2?'nd':row.localPosition===3?'rd':'th'}</strong>${row.localLeagueName?` <span style="color:var(--txt3)">${row.localLeagueName}</span>`:''}` : '—'}</td>
      <td style="font-size:11px">${reachLabel(row.reached)}</td>
      <td class="num">${row.played != null ? row.played : '—'}</td>
      <td class="num" style="color:var(--green)">${row.wins != null ? row.wins : '—'}</td>
      <td class="num">${row.gf != null ? row.gf : '—'}</td>
      <td class="num">${row.ga != null ? row.ga : '—'}</td>
      <td>${renderCoachCell(row.coach)}</td>
      <td>${renderStarsCell(row.stars)}</td>
    </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No history for this team yet.</div>'

  // GM/Director card — only render if this team has a GM (i.e. the
  // game has been initialized; team comes from S.allTeams which has
  // `.gm` attached after initStarsAndCoaches → ensureGMs).
  const gm = team.gm
  const gmCard = gm ? `
    <div class="career-section-title">DIRECTOR</div>
    <div class="gm-card" style="display:flex;gap:12px;align-items:flex-start;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid var(--brd);border-radius:8px;margin-bottom:14px">
      <div style="font-size:24px;line-height:1">🎩</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700;color:${tierColor(gm.tier)}">${gm.name}</span>
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${tierColor(gm.tier)}22;color:${tierColor(gm.tier)};text-transform:uppercase;letter-spacing:.5px">${gm.tier}</span>
          <span style="font-size:10px;color:var(--txt3)">${gm.tenureLeft}/${gm.tenureTotal} yr</span>
        </div>
        <div style="font-size:11px;color:var(--txt2);margin-top:4px;line-height:1.5">
          ${describeGMSkills(gm).map(line => `<div>${line}</div>`).join('')}
        </div>
      </div>
    </div>` : ''

  // Cash on hand — color-coded for solvency.
  const cash = typeof team.treasury === 'number' ? team.treasury : (typeof team.cashOnHand === 'number' ? team.cashOnHand : null)
  const cashColor = cash == null ? 'var(--txt3)'
                  : cash < 0      ? 'var(--red)'
                  : cash < 5      ? 'var(--gold)'
                                  : 'var(--green)'
  const cashBadge = cash != null
    ? `<span class="badge" style="background:${cashColor}22;color:${cashColor};border:1px solid ${cashColor}66;font-size:10px">💰 ${fmtMoney(cash)}</span>`
    : ''

  const splurgeBadge = ''

  const colors = team.colors || ['#444', '#fff']
  const [primary, secondary] = colors

  return `
    <div class="team-hero" style="--team-primary:${primary};--team-secondary:${secondary}">
      <div class="team-hero-bar"></div>
      <div class="team-hero-content">
        <div class="team-hero-eyebrow">Club Profile</div>
        <div class="team-hero-name">${flag(team.cc)} ${team.name}</div>
        <div class="team-hero-meta">
          <span class="badge" style="background:rgba(240,192,64,.15);color:var(--gold);border:1px solid rgba(240,192,64,.4);font-size:10px">Revenue ${fmtMoney(annualIncome(team))}</span>
          ${cashBadge}
          ${splurgeBadge}
          <span style="font-size:12px;color:var(--txt3)">Overall <strong style="color:var(--gold)">${team.currentOverall || '—'}</strong></span>
        </div>
      </div>
    </div>
    <div class="team-current-grid">
      <div class="team-current-card">
        <div class="career-section-title">CURRENT COACH</div>
        ${(() => { const c=(S.coaches||[]).find(x=>x.teamId===team.id); return c ? `<button class="current-person" onclick="window.openCoachDetail('${c.id}')"><span>📋</span><strong style="color:${tierColor(c.tier)}">${c.name}</strong><small>${tierLabel(c.tier)} · ${fmtMoney(c.contract?.salary||0)}/yr</small></button>` : '<div class="empty compact-empty">No coach</div>' })()}
      </div>
      <div class="team-current-card">
        <div class="career-section-title">CURRENT STARS</div>
        <div class="current-stars-list">${(team.stars||[]).map(star=>`<button class="current-person" onclick="window.openStarDetail('${star.id}')"><span>⭐</span><strong style="color:${tierColor(star.tier)}">${star.name}</strong><small>${star.pos} · ${tierLabel(star.tier)} · ${fmtMoney(star.contract?.salary||0)}/yr</small></button>`).join('') || '<div class="empty compact-empty">No stars</div>'}</div>
      </div>
    </div>
    <div class="team-finance-strip">
      <div><span>Revenue</span><strong>${fmtMoney(annualIncome(team))}</strong></div>
      <div><span>Base squad</span><strong>−${fmtMoney(baseSquadSalary(team))}</strong></div>
      <div><span>Operations</span><strong>−${fmtMoney(operatingCosts(team))}</strong></div>
      <div><span>Stars + coach</span><strong>−${fmtMoney(teamAnnualSalary(team))}</strong></div>
      <div><span>Treasury</span><strong>${fmtMoney(cash||0)}</strong></div>
    </div>
    ${gmCard}
    ${summary}
    ${careerTable}`
}

// ─────────────────────────────────────────────────────────────
// GROUPS TAB
// ─────────────────────────────────────────────────────────────
function renderGroups() {
  const el = $('tab-groups')
  if (!el || !S.groups?.length) {
    if (el) el.innerHTML = '<div class="empty">Groups not drawn yet</div>'
    return
  }
  // Tiebreaker chain: points → goal difference → goals for → team rating.
  // (Last step uses the team's overall rating so a tied finish defaults
  // to the higher-quality squad rather than alphabetical.)
  const sortStandings = teams => [...teams].sort((a,b) =>
    (b.pts||0) - (a.pts||0)
    || (b.gd||0) - (a.gd||0)
    || (b.gf||0) - (a.gf||0)
    || (b.rating||0) - (a.rating||0))

  let html = '<div class="groups-grid">'
  S.groups.forEach(grp => {
    const sorted = sortStandings(grp.teams)
    html += `<div class="group-card"><div class="group-title">Group ${grp.id}</div>
      <div class="group-headers">
        <span class="team-flag-cell"></span>
        <span class="team-name-cell"></span>
        <span class="hcell" title="Overall rating">OVR</span>
        <span class="hcell">P</span>
        <span class="hcell">W</span>
        <span class="hcell">D</span>
        <span class="hcell">L</span>
        <span class="hcell">GF</span>
        <span class="hcell">GA</span>
        <span class="hcell strong">PTS</span>
      </div>
      ${sorted.map((t, i) => {
        const played = (t.w||0) + (t.d||0) + (t.l||0)
        const eff = getEffStats(t)
        const ovr = Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
        const colors = t.colors || ['#444','#fff']
        return `<div class="group-team ${i < 2 ? 'qualifies' : ''}" style="--team-primary:${colors[0]};--team-secondary:${colors[1]}">
          <span class="team-flag-cell">${flag(t.cc)}</span>
          <span class="team-name-cell"><span class="team-color-dot"></span><span class="team-name-link" onclick="window.openTeamDetail('${t.id}')">${t.name}</span>${legendStar(t)}</span>
          <span class="hcell ovr-cell">${ovr}</span>
          <span class="hcell">${played}</span>
          <span class="hcell">${t.w||0}</span>
          <span class="hcell">${t.d||0}</span>
          <span class="hcell">${t.l||0}</span>
          <span class="hcell">${t.gf||0}</span>
          <span class="hcell">${t.ga||0}</span>
          <span class="hcell strong">${t.pts||0}</span>
        </div>`
      }).join('')}
    </div>`
  })
  html += '</div>'
  const played = S.groupMatches?.filter(m => m.played) || []
  if (played.length) {
    html += '<div class="sec">RESULTS</div>'
    html += played.slice(-12).reverse().map(m => `<div class="match-result-card" style="padding:8px 12px">
      <div style="font-size:9px;color:var(--txt3);font-family:var(--font-head)">GROUP ${S.groups[m.gi]?.id}</div>
      <div class="match-teams" style="margin-top:3px">
        <div class="match-team">${flag(m.t1.cc)} <span class="team-name-link" onclick="window.openTeamDetail('${m.t1.id}')">${m.t1.name}</span></div>
        <div class="match-score" style="font-size:18px">${m.result.g1} – ${m.result.g2}</div>
        <div class="match-team right"><span class="team-name-link" onclick="window.openTeamDetail('${m.t2.id}')">${m.t2.name}</span> ${flag(m.t2.cc)}</div>
      </div>
    </div>`).join('')
  }
  el.innerHTML = html
}

// ─────────────────────────────────────────────────────────────
// BRACKET TAB
// ─────────────────────────────────────────────────────────────
function renderBracket() {
  const el = $('tab-bracket')
  if (!el || !S.knockoutRounds?.length) {
    if (el) el.innerHTML = '<div class="empty">Knockout not started</div>'
    return
  }
  let html = '<div class="bracket-scroll"><div class="bracket-rounds">'
  S.knockoutRounds.forEach(round => {
    html += `<div class="bracket-col"><div class="bracket-round-name">${round.name}</div>`
    round.matches.forEach(m => {
      const w = m.result?.winner
      const cell = (t) => t
        ? `${flag(t.cc)} <span class="team-name-link" onclick="window.openTeamDetail('${t.id}')">${t.name}</span>${legendStar(t)}`
        : '-'
      html += `<div class="bracket-match">
        <div class="bracket-team ${w ? (w === m.t1 ? 'winner' : 'loser') : ''}">${cell(m.t1)}${m.result ? `<span class="bracket-score">${m.result.g1}</span>` : ''}</div>
        <div class="bracket-team ${w ? (w === m.t2 ? 'winner' : 'loser') : ''}">${cell(m.t2)}${m.result ? `<span class="bracket-score">${m.result.g2}</span>` : ''}</div>
      </div>`
    })
    html += '</div>'
  })
  if (S.champion) {
    html += `<div class="bracket-col"><div class="bracket-round-name">CHAMPION</div>
      <div class="bracket-match" style="border-color:var(--gold)">
        <div class="bracket-team winner" style="color:var(--gold)">🏆 ${flag(S.champion.cc)} <span class="team-name-link" onclick="window.openTeamDetail('${S.champion.id}')">${S.champion.name}</span>${legendStar(S.champion)}</div>
      </div></div>`
  }
  html += '</div></div>'
  el.innerHTML = html
}

// ─────────────────────────────────────────────────────────────
// TEAMS TAB
// ─────────────────────────────────────────────────────────────
let teamSort = 'overall'

let teamsSubTab = 'ratings'   // 'ratings' | 'finance'

function renderTeams() {
  const el = $('tab-teams')
  // Show every team in the world, not just the 32 CL-qualified ones.
  const allTeams = S.allTeams || []
  if (!el || !allTeams.length) {
    if (el) el.innerHTML = '<div class="empty">No teams yet — qualify first.</div>'
    return
  }

  // Build view-model rows: getEffStats expects `team.stats` and
  // `team.coach`, but allTeams entries store stats as `seasonStats`
  // and only carry a coachId. Resolve both here so sorts work and
  // the coach badge can render.
  const coachById = {}
  ;(S.coaches || []).forEach(c => { coachById[c.teamId] = c })
  const rows = allTeams.map(t => {
    const stats = t.seasonStats || t.stats || null
    const coach = coachById[t.id] || null
    const stars = t.stars || []
    const topStar = [...stars].sort((a,b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))[0] || null
    return { ...t, stats, coach, stars, star: topStar }
  })

  const subBtn = (k, label) => `
    <button class="sub-tab ${teamsSubTab===k?'active':''}" onclick="setTeamsSubTab('${k}')">
      ${label}
    </button>`

  let html = `<div class="sub-tab-row">
    ${subBtn('ratings', '📊 Ratings')}
    ${subBtn('finance', '💰 Finance')}
  </div>`

  if (teamsSubTab === 'finance') {
    html += renderTeamsFinance(rows)
  } else {
    html += renderTeamsRatings(rows)
  }
  el.innerHTML = html
}

function renderTeamsRatings(rows) {
  const sorters = {
    overall:    (a,b) => ovr(getEffStats(b)) - ovr(getEffStats(a)),
    attack:     (a,b) => getEffStats(b).attack - getEffStats(a).attack,
    defense:    (a,b) => getEffStats(b).defense - getEffStats(a).defense,
    stamina:    (a,b) => getEffStats(b).stamina - getEffStats(a).stamina,
    mental:     (a,b) => getEffStats(b).mental - getEffStats(a).mental,
    setPieces:  (a,b) => getEffStats(b).setPieces - getEffStats(a).setPieces,
    alphabetical: (a,b) => a.name.localeCompare(b.name),
  }
  const sorted = [...rows].sort(sorters[teamSort] || sorters.overall)
  let html = `<div class="sort-row">Sort: ${['overall','attack','defense','stamina','mental','setPieces','alphabetical'].map(k =>
    `<button class="sort-btn ${teamSort===k?'active':''}" onclick="setTeamSort('${k}')">${k}</button>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:8px">Showing all ${rows.length} clubs. Stats include star/coach/GM bonuses.</div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Club</th><th>ATT</th><th>DEF</th><th>STA</th><th>MEN</th><th>SET</th><th>OVR</th><th>Star</th><th>Coach</th></tr></thead>
      <tbody>`
  sorted.forEach((t, i) => {
    const eff = getEffStats(t)
    const o = Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
    html += `<tr style="cursor:pointer" onclick="window.openTeamDetail('${t.id}')">
      <td style="color:var(--txt3)">${i+1}</td>
      <td>${teamPill(t, { extra: t.isLocalChampion ? ' <span class="badge badge-legendary" style="font-size:8px">CHAMP</span>' : '' })}</td>
      <td class="num" style="color:var(--blue2)">${eff.attack}</td>
      <td class="num" style="color:var(--blue2)">${eff.defense}</td>
      <td class="num" style="color:var(--blue2)">${eff.stamina}</td>
      <td class="num" style="color:var(--blue2)">${eff.mental}</td>
      <td class="num" style="color:var(--blue2)">${eff.setPieces}</td>
      <td class="num" style="color:var(--gold);font-weight:700;font-family:var(--font-head)">${o}</td>
      <td>${t.star ? `<span style="color:${tierColor(t.star.tier)};font-size:11px">⭐ ${t.star.name}<br><span style="color:var(--txt3)">${t.star.pos}</span></span>` : '—'}</td>
      <td>${t.coach ? `<span style="color:${tierColor(t.coach.tier)};font-size:11px">📋 ${t.coach.name}</span>` : '—'}</td>
    </tr>`
  })
  html += '</tbody></table></div>'
  return html
}

function renderTeamsFinance(rows) {
  const currentLedger = [...(S.financeHistory || [])].reverse().find(x => x.season === S.season)
  const ledgerByTeam = Object.fromEntries((currentLedger?.clubs || []).map(x => [x.teamId, x]))
  const finance = rows.map(team => {
    const snap = financeSnapshot(team)
    return { ...team, ...snap, ...(ledgerByTeam[team.id] || {}) }
  })
  const sorters = {
    income:(a,b)=>b.income-a.income,
    wages:(a,b)=>b.wageBill-a.wageBill,
    surplus:(a,b)=>b.projectedSurplus-a.projectedSurplus,
    treasury:(a,b)=>b.treasury-a.treasury,
    spending:(a,b)=>(b.transferSpend||0)-(a.transferSpend||0),
    name:(a,b)=>a.name.localeCompare(b.name),
  }
  const sorted = [...finance].sort(sorters[financeSort] || sorters.income)
  let html = `<div class="sort-row">Sort: ${['income','wages','surplus','treasury','spending','name'].map(key=>`<button class="sort-btn ${financeSort===key?'active':''}" onclick="setFinanceSort('${key}')">${key}</button>`).join('')}</div>
    <div class="finance-explainer">Revenue varies by club scale, president/director quality, recent results, and annual noise. Base squad payroll rises with club size; star and coach contracts are paid separately. Everything left flows into treasury for transfers or team development.</div>
    <div class="table-wrap"><table class="data-table finance-table"><thead><tr>
      <th>Club</th><th class="num">Revenue</th><th class="num">Base squad</th><th class="num">Operations</th><th class="num">Stars</th><th class="num">Coach</th><th class="num">Surplus</th><th class="num">Transfer spend</th><th class="num">Treasury</th><th>President / Director</th>
    </tr></thead><tbody>`
  sorted.forEach(team => {
    const surplusColor = team.projectedSurplus >= 0 ? 'var(--green)' : 'var(--red)'
    const gm = team.gm
    html += `<tr style="cursor:pointer" onclick="window.openTeamDetail('${team.id}')">
      <td>${teamPill(team)}</td>
      <td class="num finance-income">${fmtMoney(team.income)}</td>
      <td class="num">−${fmtMoney(team.baseSquad)}</td>
      <td class="num">−${fmtMoney(team.operations)}</td>
      <td class="num">−${fmtMoney(team.starSalary)}</td>
      <td class="num">−${fmtMoney(team.coachSalary)}</td>
      <td class="num" style="color:${surplusColor};font-weight:700">${team.projectedSurplus>=0?'+':''}${fmtMoney(team.projectedSurplus)}</td>
      <td class="num" style="color:var(--legendary)">${fmtMoney(team.transferSpend||0)}</td>
      <td class="num finance-treasury">${fmtMoney(team.treasury)}</td>
      <td>${gm?`<strong style="color:${tierColor(gm.tier)}">${gm.name}</strong><small class="finance-gm-note">President factor ${(team.financeProfile?.presidentFactor||1).toFixed(3)} · ambition ${(team.financeProfile?.ambition||1).toFixed(2)}</small>`:'—'}</td>
    </tr>`
  })
  return html + '</tbody></table></div>'
}
window.setTeamsSubTab = function(k) { teamsSubTab = k; renderTeams(); parseEmoji(document.body) }
window.setFinanceSort = function(k) { financeSort = k; renderTeams(); parseEmoji(document.body) }
let financeSort = 'income'

// ─────────────────────────────────────────────────────────────
// STARS TAB — players + coaches with filters & sorts
// ─────────────────────────────────────────────────────────────
let starSort = 'rarity'
let positionFilter = 'ALL'
let starsSubTab = 'players'   // 'players' | 'coaches'
let nationalityFilter = 'ALL'

function renderStars() {
  const el = $('tab-stars')
  if (!el) return

  const allStars = []
  ;(S.allTeams || []).forEach(t => {
    (t.stars || []).forEach(s => {
      allStars.push({ ...s, teamName: t.name, teamCC: t.cc })
    })
  })
  const coaches = S.coaches || []

  // Sub-tab buttons
  const subBtn = (k, label, count) => `
    <button class="sub-tab ${starsSubTab===k?'active':''}" onclick="setStarsSubTab('${k}')">
      ${label}${count!=null?` <span class="sub-tab-count">${count}</span>`:''}
    </button>`

  let html = `<div class="sub-tab-row">
    ${subBtn('players', '⭐ Players', allStars.length)}
    ${subBtn('coaches', '🎯 Coaches', coaches.length)}
  </div>`

  if (starsSubTab === 'players') {
    html += renderStarsPlayers(allStars)
  } else {
    html += renderStarsCoaches(coaches)
  }
  el.innerHTML = html
}

function renderStarsPlayers(allStars) {
  // Build the unique nationality list for the dropdown.
  const allNationalities = Array.from(new Set(allStars.map(s => s.nationality || s.cc))).sort()

  const sortFn = k =>
    k === 'rarity'
      ? (a,b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
      : k === 'goals'
      ? (a,b) => (b.goals||0) - (a.goals||0)
      : k === 'rating'
      ? (a,b) => {
          const avg = x => x.ratings?.length ? x.ratings.reduce((p,q)=>p+q,0)/x.ratings.length : 0
          return avg(b) - avg(a)
        }
      : k === 'salary'
      ? (a,b) => (b.contract?.salary||0) - (a.contract?.salary||0)
      : (a,b) => a.name.localeCompare(b.name)

  const filtered = allStars.filter(s =>
    (positionFilter === 'ALL' || s.pos === positionFilter) &&
    (nationalityFilter === 'ALL' || (s.nationality || s.cc) === nationalityFilter)
  )
  const sorted = [...filtered].sort(sortFn(starSort))

  let html = `<div class="sec">STAR PLAYERS (${filtered.length} of ${allStars.length})</div>
    <div class="sort-row">Sort:
      ${['rarity','salary','goals','rating','name'].map(k => `<button class="sort-btn ${starSort===k?'active':''}" onclick="setStarSort('${k}')">${k}</button>`).join('')}
    </div>
    <div class="sort-row">Position:
      ${['ALL','FWD','MID','DEF','GK'].map(p => `<button class="sort-btn ${positionFilter===p?'active':''}" onclick="setPositionFilter('${p}')">${p}</button>`).join('')}
    </div>
    <div class="sort-row">Nationality:
      <select class="sort-select" onchange="setNationalityFilter(this.value)">
        <option value="ALL" ${nationalityFilter==='ALL'?'selected':''}>All countries</option>
        ${allNationalities.map(cc => `<option value="${cc}" ${nationalityFilter===cc?'selected':''}>${COUNTRY_NAME[cc] || cc}</option>`).join('')}
      </select>
    </div>
    <div class="salary-leaders">
      <div class="salary-leaders-title">HIGHEST SALARIES</div>
      ${[...allStars].sort((a,b)=>(b.contract?.salary||0)-(a.contract?.salary||0)).slice(0,5).map((star,index)=>`<button onclick="window.openStarDetail('${star.id}')"><span>${index+1}</span><strong>${star.name}</strong><small>${star.teamName}</small><b>${fmtMoney(star.contract?.salary||0)}/yr</b></button>`).join('')}
    </div>
    <div class="star-grid">`

  sorted.forEach(s => {
    const avgR = s.ratings?.length
      ? (s.ratings.reduce((a,b) => a+b, 0) / s.ratings.length).toFixed(1)
      : null
    const skills = describeStarSkills(s)
    const nat = s.nationality || s.teamCC
    html += `<div class="star-card ${s.tier}" style="cursor:pointer" onclick="window.openStarDetail('${s.id}')">
      <div class="row" style="margin-bottom:4px">
        ${tierBadge(s.tier)}
        <span class="star-pos">${s.pos}</span>
        <span class="spacer"></span>
        <span class="years-left" title="Years remaining in career">⏳${Math.max(0, (s.lifespan || 0) - ((S.season || 1) - (s.season || 1)))}y</span>
      </div>
      <div class="star-name">${s.name}${s.historicLegend?'<span class="historic-name-mark">HISTORIC</span>':''}</div>
      <div class="star-team">
        <span title="${COUNTRY_NAME[nat] || nat}">${flag(nat)}</span>
        ${flag(s.teamCC)} ${s.teamName}
      </div>
      <div class="star-skills">
        ${skills.map(line => `<div class="star-skill-line">${line}</div>`).join('')}
      </div>
      <div class="star-stats">
        <span class="star-stat">⚽ <span>${s.goals || 0}</span></span>
        ${avgR ? `<span class="star-stat">★ <span>${avgR}</span></span>` : ''}
        <span class="star-stat">🥇 <span>${s.medals?.gold || 0}</span></span>
        <span class="star-stat salary-stat">💵 <span>${fmtMoney(s.contract?.salary||0)}/yr</span></span>
      </div>
    </div>`
  })
  html += '</div>'
  return html
}

function renderStarsCoaches(coaches) {
  const sortedCoaches = [...coaches].sort((a,b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
  let html = `<div class="sec">COACHES (${coaches.length})</div>`
  sortedCoaches.forEach(c => {
    const team = S.allTeams?.find(t => t.id === c.teamId)
    const bonusStr = Object.entries(c.statBonus || {})
      .filter(([,v]) => v > 0)
      .map(([k,v]) => `+${v} ${k.toUpperCase().slice(0,3)}`)
      .join(' ')
    html += `<div class="coach-card" style="cursor:pointer" onclick="window.openCoachDetail('${c.id}')">
      <div class="coach-tier-bar" style="background:${tierColor(c.tier)}"></div>
      <div style="flex:1">
        <div class="coach-name">${c.name}</div>
        <div class="coach-team">${flag(team?.cc || c.nationality || 'eu')} ${c.teamName}</div>
        <div style="font-size:10px;color:var(--txt2);margin-top:2px">${bonusStr}</div>
        ${c.trait ? `<div style="font-size:10px;color:var(--gold);margin-top:2px">✦ ${c.trait.name}</div>` : ''}
        <div style="font-size:10px;color:var(--green);margin-top:2px">${fmtMoney(c.contract?.salary||0)}/year</div>
      </div>
      ${tierBadge(c.tier)}
    </div>`
  })
  return html
}

window.setStarsSubTab = function(k) { starsSubTab = k; renderStars(); parseEmoji(document.body) }

window.setStarSort = function (k) { starSort = k; renderStars(); parseEmoji(document.body) }
window.setPositionFilter = function (p) { positionFilter = p; renderStars(); parseEmoji(document.body) }
window.setNationalityFilter = function (v) { nationalityFilter = v; renderStars(); parseEmoji(document.body) }
window.setTeamSort = function (k) { teamSort = k; renderTeams(); parseEmoji(document.body) }

// ─────────────────────────────────────────────────────────────
// HISTORY TAB — Teams / Players sub-tabs, with sortable columns.
// ─────────────────────────────────────────────────────────────
let historySubTab = 'seasons'   // seasons | domestic | teams | players | transfers
let historyTeamSort = { col: 'titles', dir: 'desc' }
let historyPlayerSort = { col: 'avgRating', dir: 'desc' }
window.setHistorySubTab = function(k) { historySubTab = k; renderHistory(); parseEmoji(document.body) }
window.setHistoryTeamSort = function(col) {
  if (historyTeamSort.col === col) historyTeamSort.dir = historyTeamSort.dir === 'desc' ? 'asc' : 'desc'
  else { historyTeamSort.col = col; historyTeamSort.dir = 'desc' }
  renderHistory(); parseEmoji(document.body)
}
window.setHistoryPlayerSort = function(col) {
  if (historyPlayerSort.col === col) historyPlayerSort.dir = historyPlayerSort.dir === 'desc' ? 'asc' : 'desc'
  else { historyPlayerSort.col = col; historyPlayerSort.dir = 'desc' }
  renderHistory(); parseEmoji(document.body)
}

function sortIndicator(currentSort, col) {
  if (currentSort.col !== col) return ''
  return currentSort.dir === 'desc' ? ' ▼' : ' ▲'
}

function renderHistory() {
  const el = $('tab-history')
  if (!el) return

  const playerStats = {}
  S.history?.forEach(h => {
    ;(h.stars || []).forEach(star => {
      const key = star.id || `${star.name}:${star.pos}`
      if (!playerStats[key]) {
        playerStats[key] = {
          id:star.id, name:star.name, pos:star.pos, tier:star.tier,
          gold:0, silver:0, bronze:0, offMVP:0, defMVP:0, topScorer:0,
          goals:0, games:0, participations:0, ratings:[],
        }
      }
      const p = playerStats[key]
      p.participations++
      p.goals += star.goals || 0
      p.games += star.games || 0
      p.gold += star.medals?.gold || 0
      p.silver += star.medals?.silver || 0
      p.bronze += star.medals?.bronze || 0
      if (star.avgRating) p.ratings.push(star.avgRating)
      if (h.awards?.topScorer?.name === star.name) p.topScorer++
      if (h.awards?.offMVP?.name === star.name) p.offMVP++
      if (h.awards?.defMVP?.name === star.name) p.defMVP++
    })
  })
  const playerList = Object.values(playerStats).map(p => ({
    ...p,
    avgRating:p.ratings.length ? p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length : 0,
  }))
  const teamStatsList = Object.values(S.teamStats || {})
  const transferCount = (S.transferHistory || []).length

  const subBtn = (key, label, count = null) => `<button class="sub-tab ${historySubTab===key?'active':''}" onclick="setHistorySubTab('${key}')">${label}${count!=null?` <span class="sub-tab-count">${count}</span>`:''}</button>`

  let body = ''
  if (historySubTab === 'seasons') {
    if (!S.history?.length) body = '<div class="empty">Complete a season to begin the archive.</div>'
    else body = `<div class="sec">CHAMPIONS OF EUROPE BY YEAR</div>${[...S.history].reverse().map(h => `
      <div class="history-card">
        <div class="history-season">${historyYear(h)} · ${h.era==='european_cup'?'EUROPEAN CUP':'CHAMPIONS LEAGUE'}</div>
        <div class="history-podium">
          <div class="history-podium-champ">
            <div class="history-podium-trophy">🏆</div><div class="history-podium-label">CHAMPION</div>
            <div class="history-podium-name"><span class="team-name-link" onclick="window.openTeamDetail('${h.champion}')">${flag(h.cc||'')} ${h.championName}</span></div>
          </div>
          ${h.runnerUpName?`<div class="history-podium-runner"><div class="history-podium-runner-icon">🥈</div><div class="history-podium-label">FINALIST</div><div class="history-podium-runner-name"><span class="team-name-link" onclick="window.openTeamDetail('${h.runnerUpId}')">${flag(h.runnerUpCC||'')} ${h.runnerUpName}</span></div></div>`:''}
        </div>
        <div style="font-size:12px;color:var(--txt2);margin-top:8px">${h.totalGoals||0} goals · Top scorer: ${h.topScorers?.[0]?.[0] || '—'} (${h.topScorers?.[0]?.[1] || 0}⚽)</div>
        ${h.awards?.offMVP?`<div style="font-size:11px;color:var(--txt3)">🌟 ${h.awards.offMVP.name} Off MVP · 🛡️ ${h.awards.defMVP?.name || '—'} Def MVP</div>`:''}
      </div>`).join('')}`
  } else if (historySubTab === 'domestic') {
    body = renderDomesticWinnersHistory()
  } else if (historySubTab === 'teams') {
    body = renderHistoryTeams(teamStatsList)
  } else if (historySubTab === 'players') {
    body = renderHistoryPlayers(playerList)
  } else if (historySubTab === 'transfers') {
    body = renderTransferHistory()
  }

  el.innerHTML = `
    <div class="sub-tab-row history-tab-row">
      ${subBtn('seasons','🏆 Europe',S.history?.length||null)}
      ${subBtn('domestic','🏠 Winners by year',S.history?.length||null)}
      ${subBtn('teams','📊 Teams',teamStatsList.length||null)}
      ${subBtn('players','⭐ Players',playerList.length||null)}
      ${subBtn('transfers','💰 Transfers',transferCount||null)}
    </div>
    ${body}`
}

function renderDomesticWinnersHistory() {
  const major = [
    { id:'ENG', name:'England' }, { id:'ESP', name:'Spain' },
    { id:'ITA', name:'Italy' }, { id:'GER', name:'Germany' },
    { id:'FRA', name:'France' }, { id:'POR', name:'Portugal' },
    { id:'NED', name:'Netherlands' },
  ]
  if (!S.history?.length) return '<div class="empty">No domestic winners recorded yet.</div>'
  const findLeague = (h, league) => (h.localChampions || []).find(x => x.leagueId === league.id || x.league === league.name || x.leagueName === league.name)
  return `<div class="sec">WINNERS BY YEAR</div>
    <div class="history-intro">Champion and runner-up for the seven most relevant domestic leagues. Scroll horizontally on mobile.</div>
    <div class="table-wrap domestic-winners-wrap"><table class="data-table domestic-winners-table">
      <thead><tr><th>Year</th>${major.map(l=>`<th>${l.name}</th>`).join('')}</tr></thead>
      <tbody>${[...S.history].reverse().map(h=>`<tr><td class="num"><strong>${historyYear(h)}</strong></td>${major.map(league=>{
        const row=findLeague(h,league)
        if(!row) return '<td>—</td>'
        const champion=row.championName||row.champion||'—'
        const runner=row.runnerUpName||row.runnerUp||'—'
        return `<td><div class="domestic-cell"><button onclick="window.openTeamDetail('${row.championId||''}')"><span>🏆</span><span><em>Champion</em><strong>${champion}</strong></span></button><button class="runner" ${row.runnerUpId?`onclick="window.openTeamDetail('${row.runnerUpId}')"`:''}><span>🥈</span><span><em>Runner-up</em><small>${runner}</small></span></button></div></td>`
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>`
}

function renderTransferHistory() {
  const rows = [...(S.transferHistory || [])].sort((a,b)=>(b.fee||0)-(a.fee||0))
  if (!rows.length) return '<div class="empty">No permanent transfers recorded yet.</div>'
  return `<div class="sec">MOST EXPENSIVE TRANSFERS</div>
    <div class="history-intro">Permanent moves are ranked by fee. A player cannot be transferred in consecutive seasons.</div>
    <div class="table-wrap"><table class="data-table transfer-history-table"><thead><tr>
      <th>#</th><th>Player</th><th>Tier</th><th class="num">Year</th><th>From</th><th>To</th><th class="num">Fee</th><th class="num">Salary</th>
    </tr></thead><tbody>${rows.map((tr,index)=>`<tr>
      <td class="num">${index+1}</td>
      <td><button class="history-player-link" onclick="window.openStarDetail('${tr.playerId}')"><strong>${tr.playerName}</strong><small>${tr.pos||''}${tr.age?` · age ${tr.age}`:''}</small></button></td>
      <td>${tierBadge(tr.tier)}</td><td class="num">${tr.year || yearForSeason(tr.season)}</td>
      <td><span class="team-name-link" onclick="window.openTeamDetail('${tr.fromId}')">${flag(tr.fromCC||'')} ${tr.from}</span></td>
      <td><span class="team-name-link" onclick="window.openTeamDetail('${tr.toId}')">${flag(tr.toCC||'')} ${tr.to}</span></td>
      <td class="num transfer-fee"><strong>${fmtMoney(tr.fee)}</strong></td>
      <td class="num">${fmtMoney(tr.salary||0)}/yr</td>
    </tr>`).join('')}</tbody></table></div>`
}
function renderHistoryTeams(teamStatsList) {
  if (!teamStatsList.length) return '<div class="empty">No team records yet</div>'
  const cols = [
    { id: 'name',          label: 'Team',          isText: true },
    { id: 'titles',        label: '🏆',            title: 'UCL Titles' },
    { id: 'finals',        label: '🥈',            title: 'Finals (lost)' },
    { id: 'semiFinals',    label: 'SF',            title: 'Semi-finals' },
    { id: 'quarterFinals', label: 'QF',            title: 'Quarter-finals' },
    { id: 'localTitles',   label: '🏠🏆',          title: 'Local league titles' },
    { id: 'participations',label: 'P',             title: 'UCL participations' },
    { id: 'played',        label: 'G',             title: 'Games' },
    { id: 'wins',          label: 'W',             title: 'Wins' },
    { id: 'goalsFor',      label: 'GF',            title: 'Goals for' },
  ]

  // Sort.
  const { col, dir } = historyTeamSort
  const mul = dir === 'desc' ? -1 : 1
  const sorted = [...teamStatsList].sort((a,b) => {
    const av = a[col] ?? 0, bv = b[col] ?? 0
    if (col === 'name') return mul * String(av).localeCompare(String(bv))
    return mul * (av - bv)
  })

  return `<div class="table-wrap"><table class="data-table sortable">
    <thead><tr>
      ${cols.map(c => `<th class="${c.isText?'':'num'}" ${c.title?`title="${c.title}"`:''}
        onclick="setHistoryTeamSort('${c.id}')" style="cursor:pointer">
        ${c.label}${sortIndicator(historyTeamSort, c.id)}
      </th>`).join('')}
    </tr></thead><tbody>
    ${sorted.map(t => `<tr style="cursor:pointer" onclick="window.openTeamDetail('${t.id}')">
      <td><strong>${flag(t.cc)} ${t.name}</strong></td>
      <td class="num" style="color:var(--gold)">${t.titles || '—'}</td>
      <td class="num">${t.finals || '—'}</td>
      <td class="num" style="color:var(--txt3)">${t.semiFinals || '—'}</td>
      <td class="num" style="color:var(--txt3)">${t.quarterFinals || '—'}</td>
      <td class="num" style="color:var(--legendary)">${t.localTitles || '—'}</td>
      <td class="num">${t.participations || 0}</td>
      <td class="num">${t.played || 0}</td>
      <td class="num" style="color:var(--green)">${t.wins || 0}</td>
      <td class="num">${t.goalsFor || 0}</td>
    </tr>`).join('')}
    </tbody></table></div>`
}

function renderHistoryPlayers(playerList) {
  if (!playerList.length) return '<div class="empty">No player history yet</div>'
  const cols = [
    { id: 'name',           label: 'Player',     isText: true },
    { id: 'pos',            label: 'Pos',        isText: true },
    { id: 'participations', label: 'P',          title: 'Participations (seasons)' },
    { id: 'games',          label: 'G',          title: 'Games played' },
    { id: 'avgRating',      label: 'Avg',        title: 'Average match rating' },
    { id: 'goals',          label: '⚽',         title: 'Career goals' },
    { id: 'gold',           label: '🥇',         title: 'UCL titles' },
    { id: 'topScorer',      label: 'TS',         title: 'Top Scorer awards' },
    { id: 'offMVP',         label: 'Off',        title: 'Offensive MVP awards' },
    { id: 'defMVP',         label: 'Def',        title: 'Defensive MVP awards' },
  ]

  const { col, dir } = historyPlayerSort
  const mul = dir === 'desc' ? -1 : 1
  const sorted = [...playerList].sort((a,b) => {
    const av = a[col] ?? 0, bv = b[col] ?? 0
    if (col === 'name' || col === 'pos') return mul * String(av).localeCompare(String(bv))
    return mul * (av - bv)
  })

  return `<div class="table-wrap"><table class="data-table sortable">
    <thead><tr>
      ${cols.map(c => `<th class="${c.isText?'':'num'}" ${c.title?`title="${c.title}"`:''}
        onclick="setHistoryPlayerSort('${c.id}')" style="cursor:pointer">
        ${c.label}${sortIndicator(historyPlayerSort, c.id)}
      </th>`).join('')}
    </tr></thead><tbody>
    ${sorted.map(p => `<tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.pos}</td>
      <td class="num">${p.participations || '—'}</td>
      <td class="num">${p.games || '—'}</td>
      <td class="num" style="color:var(--blue2)">${p.avgRating ? p.avgRating.toFixed(2) : '—'}</td>
      <td class="num" style="color:var(--gold)">${p.goals || '—'}</td>
      <td class="num" style="color:var(--gold)">${p.gold || '—'}</td>
      <td class="num">${p.topScorer || '—'}</td>
      <td class="num" style="color:var(--blue2)">${p.offMVP || '—'}</td>
      <td class="num" style="color:var(--green)">${p.defMVP || '—'}</td>
    </tr>`).join('')}
    </tbody></table></div>`
}

// ─────────────────────────────────────────────────────────────
// SEASON TAB — three sub-views: local leagues, market, current CL
// ─────────────────────────────────────────────────────────────
let seasonSubTab = 'stats'   // 'stats' | 'local' | 'market' | 'cl'
window.setSeasonSubTab = function(k) { seasonSubTab = k; renderSeason(); parseEmoji(document.body) }

function renderSeason() {
  const el = $('tab-season')
  if (!el) return
  const subBtn = (k, label, count) => `
    <button class="sub-tab ${seasonSubTab===k?'active':''}" onclick="setSeasonSubTab('${k}')">
      ${label}${count!=null?` <span class="sub-tab-count">${count}</span>`:''}
    </button>`
  const teamsKnown = (S.allTeams?.length) || 0
  const llCount = Object.keys(S.localLeagueResults || {}).length
  const mktCount = (S.lastMarket || []).length
  const matchesPlayed = (S.allMatchResults || []).length

  let body = ''
  if (seasonSubTab === 'stats') {
    body = renderSeasonStats()
  } else if (seasonSubTab === 'local') {
    body = renderSeasonLocal()
  } else if (seasonSubTab === 'market') {
    body = renderSeasonMarket()
  } else {
    body = renderSeasonCL()
  }

  el.innerHTML = `
    <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.14em;color:var(--txt3);margin-bottom:6px">YEAR ${gameYear()}</div>
    <div class="sub-tab-row">
      ${subBtn('stats',  '📊 Stats',          teamsKnown || null)}
      ${subBtn('local',  '🏆 Local Leagues', llCount || null)}
      ${subBtn('market', '🔄 Market',        mktCount || null)}
      ${subBtn('cl',     S.era==='european_cup'?'⚽ European Cup':'⚽ Champions League', matchesPlayed || null)}
    </div>
    ${body}`
}

function renderSeasonStats() {
  if (!S.allTeams?.length) return '<div class="empty">Stats haven\'t been generated yet — start the season first.</div>'
  return `<div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
    Every team's permanent <strong>Base</strong> rating, last season's overall (<strong>PS-Ov</strong>),
    this season's overall (<strong>CS-Ov</strong>), and overall <em>including</em> stars and coach
    bonuses (<strong>CS-Ov+</strong>). Click any column header to sort.
  </div>${renderStatsTable()}`
}

function renderSeasonLocal() {
  const lr = S.localLeagueResults || {}
  if (!Object.keys(lr).length) {
    return '<div class="empty">Local leagues haven\'t been decided this season. Run the market and qualifiers first.</div>'
  }
  let html = `<div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
    Final standings for every domestic league this season. The team in <span style="color:var(--gold)">gold</span> is the local champion.
  </div>
  <div class="qualify-grid">`
  LEAGUES.forEach(L => {
    const r = lr[L.id]
    if (!r) return
    const standings = r.standings || []
    html += `
      <div class="qualify-card">
        <div class="qualify-card-head">
          <span class="qualify-flag">${flag(L.cc)}</span>
          <span class="qualify-league">${L.name}</span>
          <span class="qualify-slots">${L.slots} slot${L.slots === 1 ? '' : 's'}</span>
        </div>
        <div class="qualify-body">`
    standings.forEach((entry, idx) => {
      const t = entry.team
      const isChampion = idx === 0
      const qualifies = idx < L.slots
      const legend = entry.hasLegend ? ' <span style="color:var(--legendary);font-size:10px" title="Has a legendary star or coach">★</span>' : ''
      html += `
        <div class="qualify-row ${qualifies?'qualifies':''} ${isChampion?'champion':''}">
          <span class="qualify-rank">${idx + 1}</span>
          <span class="qualify-name">
            ${isChampion ? '🏆 ' : ''}${t.name}${legend}
          </span>
          <span class="qualify-score">${entry.score}</span>
        </div>`
    })
    html += `</div></div>`
  })
  html += `</div>`
  return html
}

function renderSeasonMarket() {
  const moves = S.lastMarket || []
  if (!moves.length) {
    return '<div class="empty">No market window has run yet this season.</div>'
  }
  let html = `<div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
    Every transfer this market window, in order. Click a player or coach for full details.
  </div>`
  html += renderMarketMoveList(moves)
  return html
}

function renderSeasonCL() {
  if (!S.teams?.length) return '<div class="empty">No Champions League in progress.</div>'

  const matchesPlayed = (S.allMatchResults || []).length
  if (!matchesPlayed) {
    return '<div class="empty">No Champions League matches played yet this season.</div>'
  }

  // Top scorers (stars only).
  const topScorers = Object.entries(S.scorers || {}).sort((a,b) => b[1] - a[1]).slice(0, 8)

  // Highest-rated offensive (FWD/MID) and defensive (DEF/GK) stars.
  // Walks EVERY star on every qualified team.
  //
  // ELIGIBILITY: once we know who's made the quarter-finals, only
  // their players are eligible. A team is "in" the QF if either:
  //   1. They're playing in (or beyond) the QF round — i.e., their
  //      roundReached marker isn't 'Round of 16' or 'Group'.
  //   2. The R16 round hasn't finished yet, in which case we can't
  //      filter at all (we don't know who made it).
  //
  // The filter activates the moment the R16 round is fully played
  // — i.e., advanceKnockout has run and a QF round exists.
  const currentRound = S.knockoutRounds?.[S.knockoutRounds.length - 1]
  const r16Done = currentRound && currentRound.name !== 'Round of 16'
                  && currentRound.name !== 'Group Stage'

  const isMVPEligible = (s) => {
    if (!r16Done) return true       // R16 not yet finished — everyone visible
    const reached = S.roundReached?.[s.teamId]
    // Eliminated in groups or R16 → out. Still active or eliminated
    // later (QF, SF, Final) → eligible.
    if (reached === 'Group' || reached === 'Round of 16') return false
    return true
  }

  const ratedStars = (S.teams || [])
    .flatMap(t => t.stars && t.stars.length ? t.stars : (t.star ? [t.star] : []))
    .filter(s => s && s.ratings?.length && isMVPEligible(s))
  const avg = s => s.ratings.reduce((a,b) => a+b, 0) / s.ratings.length
  const offensives = ratedStars.filter(s => ['FWD','MID'].includes(s.pos)).map(s => ({ s, r: avg(s) }))
    .sort((a,b) => b.r - a.r).slice(0, 5)
  const defensives = ratedStars.filter(s => ['DEF','GK'].includes(s.pos)).map(s => ({ s, r: avg(s) }))
    .sort((a,b) => b.r - a.r).slice(0, 5)

  // Team aggregates.
  const tname = id => S.teams.find(t => t.id === id)
  const tcc   = id => tname(id)?.cc
  const teamGoalsList = Object.entries(S.teamGoals || {})
    .filter(([id]) => tname(id))
    .sort((a,b) => b[1] - a[1]).slice(0, 6)
  const teamShotsList = Object.entries(S.teamShots || {})
    .filter(([id]) => tname(id))
    .sort((a,b) => b[1] - a[1]).slice(0, 6)
  const teamPossList = Object.entries(S.teamPossession || {})
    .filter(([id]) => tname(id))
    .map(([id, sum]) => [id, sum / (S.teamPossessionMatches?.[id] || 1)])
    .sort((a,b) => b[1] - a[1]).slice(0, 6)

  let html = '<div class="cl-stats-grid">'

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">⚽ Top Scorers</div>
    ${topScorers.length ? `<table class="data-table compact"><tbody>
      ${topScorers.map(([name, g], i) => `<tr>
        <td style="color:var(--txt3);width:24px">${i+1}</td>
        <td style="font-weight:600">${name}</td>
        <td class="num" style="color:var(--gold);font-family:var(--font-head);font-weight:700">${g}</td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">No goals yet</div>'}
  </div>`

  // Subtitle hint shown when the QF eligibility filter is in effect.
  const qfHint = r16Done
    ? '<div class="cl-stat-sub">QF qualifiers only</div>'
    : ''

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">🌟 Highest-Rated Attackers</div>
    ${qfHint}
    ${offensives.length ? `<table class="data-table compact"><tbody>
      ${offensives.map(({s,r}, i) => `<tr style="cursor:pointer" onclick="window.openStarDetail('${s.id}')">
        <td style="color:var(--txt3);width:24px">${i+1}</td>
        <td style="font-weight:600">${s.name} <span style="color:var(--txt3);font-size:10px">${s.pos}</span></td>
        <td class="num" style="color:var(--blue2);font-family:var(--font-head);font-weight:700">${r.toFixed(1)}</td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">No ratings yet</div>'}
  </div>`

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">🛡️ Highest-Rated Defenders</div>
    ${qfHint}
    ${defensives.length ? `<table class="data-table compact"><tbody>
      ${defensives.map(({s,r}, i) => `<tr style="cursor:pointer" onclick="window.openStarDetail('${s.id}')">
        <td style="color:var(--txt3);width:24px">${i+1}</td>
        <td style="font-weight:600">${s.name} <span style="color:var(--txt3);font-size:10px">${s.pos}</span></td>
        <td class="num" style="color:var(--green);font-family:var(--font-head);font-weight:700">${r.toFixed(1)}</td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">No ratings yet</div>'}
  </div>`

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">⚽ Most Goals Scored</div>
    <table class="data-table compact"><tbody>
      ${teamGoalsList.map(([id, g], i) => `<tr>
        <td style="color:var(--txt3);width:24px">${i+1}</td>
        <td style="font-weight:600">${flag(tcc(id))} ${tname(id)?.name}</td>
        <td class="num" style="color:var(--gold);font-family:var(--font-head);font-weight:700">${g}</td>
      </tr>`).join('')}
    </tbody></table>
  </div>`

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">🎯 Most Shots</div>
    <table class="data-table compact"><tbody>
      ${teamShotsList.map(([id, s], i) => `<tr>
        <td style="color:var(--txt3);width:24px">${i+1}</td>
        <td style="font-weight:600">${flag(tcc(id))} ${tname(id)?.name}</td>
        <td class="num" style="color:var(--blue2);font-family:var(--font-head);font-weight:700">${s}</td>
      </tr>`).join('')}
    </tbody></table>
  </div>`

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">📊 Most Possession (avg %)</div>
    <table class="data-table compact"><tbody>
      ${teamPossList.map(([id, p], i) => `<tr>
        <td style="color:var(--txt3);width:24px">${i+1}</td>
        <td style="font-weight:600">${flag(tcc(id))} ${tname(id)?.name}</td>
        <td class="num" style="color:var(--silver);font-family:var(--font-head);font-weight:700">${p.toFixed(1)}%</td>
      </tr>`).join('')}
    </tbody></table>
  </div>`

  html += '</div>'
  return html
}

// ─────────────────────────────────────────────────────────────
// SETTINGS / SAVES
// ─────────────────────────────────────────────────────────────
window.openSettings = async () => {
  $('settings-overlay').style.display = 'flex'
  // Update enabled state of the two restart buttons based on
  // whether the corresponding snapshots exist.
  const [hasPre, hasTour] = await Promise.all([
    hasPreSeasonSnapshot(),
    hasPreTournamentSnapshot(),
  ])
  const seasonBtn = $('restart-season-btn')
  const tourBtn   = $('restart-tournament-btn')
  if (seasonBtn) {
    seasonBtn.disabled = !hasPre
    seasonBtn.title = hasPre ? '' : 'Available after you start a season'
  }
  if (tourBtn) {
    tourBtn.disabled = !hasTour
    tourBtn.title = hasTour ? '' : 'Available after groups are drawn'
  }
}
window.closeSettings = () => { $('settings-overlay').style.display = 'none' }

window.openSaveManager = async function () {
  closeSettings()
  $('saves-overlay').style.display = 'flex'
  await renderSaveSlots()
}
window.closeSaveManager = () => { $('saves-overlay').style.display = 'none' }

// Friendly description of what's happening in a saved game.
function describeSave(s) {
  const phaseLabel = {
    idle:        'Pre-Season',
    stats:       'Stats Update',
    market:      'Transfer Market',
    qualifying:  'Local Leagues',
    groups:      'Group Stage',
    knockout:    'Knockout',
    done:        'Champion Crowned',
  }[s.phase] || s.phase || ''

  let detail = phaseLabel
  if (s.phase === 'done' && s.champion) {
    detail = `🏆 ${s.champion.name}`
  } else if (s.phase === 'groups' && s.groupMatches) {
    const played = s.groupMatches.filter(m => m.played).length
    const total = s.groupMatches.length
    detail = `Group Stage · ${played}/${total}`
  } else if (s.phase === 'knockout' && s.knockoutRounds?.length) {
    const r = s.knockoutRounds[s.knockoutRounds.length - 1]
    detail = r.name
  }

  const when = s.savedAt
    ? new Date(s.savedAt).toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'
  return { detail, when }
}

async function renderSaveSlots() {
  const el = $('saves-list')
  el.innerHTML = '<div class="empty">Loading saves…</div>'

  const [slots, auto] = await Promise.all([
    allSlots(),
    dbLoad('autosave'),
  ])

  let html = ''

  // Autosave row first.
  if (auto) {
    const { detail, when } = describeSave(auto)
    html += `
      <div class="save-slot save-slot-auto">
        <div class="save-slot-info">
          <div class="save-slot-name">⚡ Autosave</div>
          <div class="save-slot-meta">${auto.year || yearForSeason(auto.season)} · ${detail} · saved ${when}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="doLoadAuto()">Load</button>
      </div>`
  }

  // Then named slots, newest first.
  if (slots.length) {
    html += '<div class="saves-divider">Named saves</div>'
    html += slots
      .sort((a,b) => (b.savedAt||0) - (a.savedAt||0))
      .map(s => {
        const { detail, when } = describeSave(s)
        const safe = s.slotName.replace(/'/g, "\\'").replace(/"/g, '&quot;')
        return `
          <div class="save-slot">
            <div class="save-slot-info">
              <div class="save-slot-name">${s.slotName}</div>
              <div class="save-slot-meta">${s.year || yearForSeason(s.season)} · ${detail} · saved ${when}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="doLoadSlot('${safe}')">Load</button>
            <button class="btn btn-sm btn-danger-subtle" onclick="doDeleteSlot('${safe}')" title="Delete this save">🗑</button>
          </div>`
      }).join('')
  } else if (!auto) {
    html += '<div class="empty">No saves yet — play a season then come back to save it.</div>'
  }

  el.innerHTML = html
}

window.doSaveSlot = async function () {
  const name = $('save-name').value.trim()
  if (!name) { toast('Enter a name first', 'error'); return }
  // Detect overwrite of an existing slot.
  const slots = await allSlots()
  const exists = slots.some(s => s.slotName === name)
  const proceed = exists
    ? confirm(`A save called "${name}" already exists. Overwrite it?`)
    : true
  if (!proceed) return
  await saveSlot(name)
  $('save-name').value = ''
  toast('Saved: ' + name)
  renderSaveSlots()
}

window.doLoadAuto = async function () {
  if (!confirm('Load the autosave? Anything currently in play will be replaced.')) return
  const ok = await loadGame()
  closeSaveManager()
  if (!ok) { toast('Autosave not found', 'error'); return }
  updatePhaseUI()
  renderPlay()
  toast('Autosave loaded — ' + gameYear())
}

window.doLoadSlot = async function (name) {
  if (!confirm(`Load "${name}"? Anything currently in play will be replaced.`)) return
  try {
    await loadSlot('slot__' + name.replace(/[^\w\s-]/g, '_'))
    closeSaveManager()
    updatePhaseUI()
    renderPlay()
    toast('Loaded: ' + name)
  } catch (e) {
    toast('Load failed: ' + e.message, 'error')
  }
}

window.doDeleteSlot = async function (name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
  await deleteSlot('slot__' + name.replace(/[^\w\s-]/g, '_'))
  toast('Deleted: ' + name)
  renderSaveSlots()
}

window.doExport = function () {
  closeSettings()
  exportSave()
  toast('Exported! Check your Downloads folder.')
}
window.doImport = async function (ev) {
  const file = ev.target.files[0]
  if (!file) return
  const proceed = confirm(`Import "${file.name}"? Anything currently in play will be replaced.`)
  if (!proceed) { ev.target.value = ''; return }
  try {
    await importSave(file)
    closeSaveManager()
    closeSettings()
    updatePhaseUI()
    renderPlay()
    toast('Imported — now in ' + gameYear())
  } catch (e) {
    toast('Import failed: ' + e.message, 'error')
  }
  ev.target.value = ''
}

let _confirmCb = null
window.confirmReset = function () {
  closeSettings()
  $('confirm-icon').textContent = '🗑️'
  $('confirm-title').textContent = 'Reset World?'
  $('confirm-msg').textContent = 'All seasons, history and saves will be deleted forever.'
  $('confirm-ok').textContent = 'Delete Everything'
  $('confirm-ok').className = 'btn btn-danger'
  _confirmCb = async () => { await clearGame(); location.reload() }
  $('confirm-overlay').style.display = 'flex'
}

window.confirmRestartSeason = async function () {
  closeSettings()
  if (!(await hasPreSeasonSnapshot())) {
    toast('No pre-season snapshot to restart from.', 'error')
    return
  }
  $('confirm-icon').textContent = '⏮'
  $('confirm-title').textContent = 'Restart Season?'
  $('confirm-msg').textContent =
    'Roll back to the start of this season — before stats update, market, and draw. ' +
    'All matches, transfers, and stat changes from this season will be undone. This cannot be reversed.'
  $('confirm-ok').textContent = 'Restart Season'
  $('confirm-ok').className = 'btn btn-danger'
  _confirmCb = async () => {
    try {
      await restartSeason()
      updatePhaseUI()
      renderPlay()
      toast('Season restarted from the very beginning.')
    } catch (e) {
      toast('Restart failed: ' + e.message, 'error')
    }
  }
  $('confirm-overlay').style.display = 'flex'
}

window.confirmRestartTournament = async function () {
  closeSettings()
  if (!(await hasPreTournamentSnapshot())) {
    toast('No tournament snapshot to restart from.', 'error')
    return
  }
  $('confirm-icon').textContent = '↩'
  $('confirm-title').textContent = 'Restart Tournament?'
  $('confirm-msg').textContent =
    'Roll back to the moment after the draw, before any match was played. ' +
    'The groups stay the same; standings and results are wiped. This cannot be reversed.'
  $('confirm-ok').textContent = 'Restart Tournament'
  $('confirm-ok').className = 'btn btn-danger'
  _confirmCb = async () => {
    try {
      await restartTournament()
      updatePhaseUI()
      renderPlay()
      toast('Tournament restarted — all teams back to 0/0/0.')
    } catch (e) {
      toast('Restart failed: ' + e.message, 'error')
    }
  }
  $('confirm-overlay').style.display = 'flex'
}

// Regenerate Power 1 (statBonus, goalDist, saveProb) and Power 2
// (trait) for every player and every coach in the world. Identity,
// position, tier, nationality, and career history are untouched.
window.confirmRestartSkills = async function () {
  closeSettings()
  $('confirm-icon').textContent = '🔄'
  $('confirm-title').textContent = 'Restart Player & Coach Skills?'
  $('confirm-msg').textContent =
    'Recompute every existing player and coach\'s Power 1 (stat bonuses) and Power 2 (special trait) ' +
    'using the latest formulas. Names, nationalities, positions, tiers, teams, and career stats stay the same. ' +
    'This is useful after the engine is re-tuned. Cannot be undone.'
  $('confirm-ok').textContent = 'Restart Skills'
  $('confirm-ok').className = 'btn btn-primary'
  _confirmCb = async () => {
    try {
      let starCount = 0, coachCount = 0
      // Walk every team's stars (S.allTeams covers all 81 leagues teams).
      const teams = S.allTeams || []
      for (const t of teams) {
        if (Array.isArray(t.stars)) {
          for (const s of t.stars) { regenStarSkills(s); starCount++ }
        }
        // Legacy single-star field — handle just in case.
        if (t.star) { regenStarSkills(t.star); starCount++ }
      }
      // Coaches live in S.coaches (one per team).
      for (const c of (S.coaches || [])) { regenCoachSkills(c); coachCount++ }
      await autoSave()
      // Re-render whatever's on screen so updated descriptions show up.
      renderPlay()
      toast(`Refreshed ${starCount} player skills and ${coachCount} coach skills.`)
    } catch (e) {
      toast('Skills refresh failed: ' + e.message, 'error')
    }
  }
  $('confirm-overlay').style.display = 'flex'
}

window.confirmAccept = () => { $('confirm-overlay').style.display = 'none'; _confirmCb?.(); _confirmCb = null }
window.confirmDeny   = () => { $('confirm-overlay').style.display = 'none'; _confirmCb = null }

// ─────────────────────────────────────────────────────────────
// HOME PAGE — slot selection
// ─────────────────────────────────────────────────────────────
async function showHomePage() {
  // Hide the main app shell, render the home overlay
  const app = $('app')
  if (app) app.style.display = 'none'

  // Remove any prior home overlay
  let home = $('home-overlay')
  if (home) home.remove()

  const slots = await getSlotSummaries()
  home = document.createElement('div')
  home.id = 'home-overlay'
  home.className = 'home-overlay'

  const fmtSavedAt = (t) => {
    if (!t) return '—'
    const d = new Date(t)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return 'Today, ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const slotCards = slots.map((s, i) => {
    const num = i + 1
    if (!s.exists) {
      return `
        <div class="home-slot home-slot-empty" onclick="window.startSlot('${s.key}')">
          <div class="home-slot-num">SLOT ${num}</div>
          <div class="home-slot-empty-icon">＋</div>
          <div class="home-slot-empty-label">Empty</div>
          <div class="home-slot-empty-cta">Tap to start new game</div>
        </div>`
    }
    return `
      <div class="home-slot home-slot-active" onclick="window.continueSlot('${s.key}')">
        <div class="home-slot-num">SLOT ${num}</div>
        <div class="home-slot-season">${s.year || (1955 + (s.season || 1))}</div>
        ${s.championName ? `
          <div class="home-slot-champ">
            <div class="home-slot-champ-trophy">🏆</div>
            <div class="home-slot-champ-info">
              <div class="home-slot-champ-label">Last Champion</div>
              <div class="home-slot-champ-name">${flag(s.championCC || '')} ${s.championName}</div>
            </div>
          </div>` : `
          <div class="home-slot-champ" style="opacity:.6">
            <div class="home-slot-champ-trophy">⚽</div>
            <div class="home-slot-champ-info">
              <div class="home-slot-champ-label">In progress</div>
              <div class="home-slot-champ-name">No champion yet</div>
            </div>
          </div>`}
        <div class="home-slot-meta">${fmtSavedAt(s.savedAt)}</div>
        <div class="home-slot-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation();window.continueSlot('${s.key}')">▶ Continue</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();window.deleteSlotConfirm('${s.key}',${num})">🗑</button>
        </div>
      </div>`
  }).join('')

  home.innerHTML = `
    <div class="home-stars-bg"></div>
    <div class="home-content">
      <div class="home-header">
        <div class="home-star">★</div>
        <div>
          <div class="home-title">CHAMPIONS LEAGUE</div>
          <div class="home-sub">SIMULATOR</div>
        </div>
      </div>
      <div class="home-slots">${slotCards}</div>
      <div class="home-footer">
        Pick a save slot to continue or start a new game. Progress auto-saves after each action.
      </div>
    </div>`
  document.body.appendChild(home)
  parseEmoji(home)
}

window.startSlot = async function(slotKey) {
  startFreshInSlot(slotKey)
  await hideHomeAndBoot(true)
}

window.continueSlot = async function(slotKey) {
  setActiveSlot(slotKey)
  await hideHomeAndBoot(false)
}

window.deleteSlotConfirm = async function(slotKey, num) {
  if (!confirm(`Delete Slot ${num}? This cannot be undone.`)) return
  const { deleteSlot } = await import('./store.js')
  await deleteSlot(slotKey)
  await showHomePage()
}

window.returnToHome = async function() {
  if (!confirm('Return to home? Current progress is auto-saved.')) return
  clearActiveSlot()
  // Hard reload so all in-memory state resets cleanly.
  location.reload()
}

async function hideHomeAndBoot(isFresh) {
  const home = $('home-overlay')
  if (home) home.remove()
  const app = $('app')
  if (app) app.style.display = ''

  if (!isFresh) {
    // Try to load existing data from the slot
    const ok = await loadGame()
    if (!ok) {
      S.phase = 'idle'
      S.season = 1
    }
  } else {
    S.phase = 'idle'
    S.season = 1
  }
  updatePhaseUI()
  renderPlay()
  if (S.groups?.length) renderGroups()
  if (S.knockoutRounds?.length) renderBracket()
  parseEmoji(document.body)
  await autoSave()
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
async function init() {
  // Always show the home page first. The user picks a slot;
  // hideHomeAndBoot() takes care of loading or starting fresh.
  await showHomePage()
}
init()

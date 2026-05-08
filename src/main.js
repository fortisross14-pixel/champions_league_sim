import {
  S, autoSave, loadGame, clearGame, exportSave, importSave,
  saveSlot, loadSlot, allSlots, deleteSlot, dbLoad,
} from './store.js'
import {
  runQualification, drawGroups, initStarsAndCoaches, linkStarsToTeams,
  playGroupMatch, buildKnockout, playKnockoutMatch, advanceKnockout,
  runMarket, runTransfers, startNewSeason, runLocalLeagues,
  runStatsUpdate,
  tierOf, tierLabel, tierColor,
  describeStarSkills, describeCoachSkills,
  COACH_TRAITS,
} from './engine/season.js'
import { ovr, getEffStats } from './engine/match.js'
import { COUNTRY_NAME } from './data/players.js'
import { LEAGUES } from './data/teams.js'

const $ = id => document.getElementById(id)
const FLAG = {
  es:'🇪🇸', de:'🇩🇪', it:'🇮🇹', 'gb-eng':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', fr:'🇫🇷', pt:'🇵🇹', nl:'🇳🇱', ru:'🇷🇺',
  'gb-sct':'🏴󠁧󠁢󠁳󠁣󠁴󠁿', tr:'🇹🇷', gr:'🇬🇷', ua:'🇺🇦',
  br:'🇧🇷', ar:'🇦🇷', uy:'🇺🇾', mx:'🇲🇽', sn:'🇸🇳', kr:'🇰🇷', ng:'🇳🇬',
  be:'🇧🇪', ch:'🇨🇭', at:'🇦🇹', ro:'🇷🇴', cz:'🇨🇿', pl:'🇵🇱', no:'🇳🇴', se:'🇸🇪',
  dk:'🇩🇰', hr:'🇭🇷', hu:'🇭🇺', bg:'🇧🇬', md:'🇲🇩', lv:'🇱🇻', si:'🇸🇮', gi:'🇬🇮',
  eu:'🇪🇺',
}
const flag = cc => `<span class="flag-emoji">${FLAG[cc] || '🏳️'}</span>`
const tierBadge = t => `<span class="badge badge-${t}">${tierLabel(t)}</span>`
const TIER_ORDER = ['legendary','epic','rare','uncommon','common']

// Parse emoji in the given element using Twemoji, which swaps emoji
// chars for inline SVG/PNG images. Critically, this is what makes
// flag emoji actually render on Windows (whose system fonts have no
// flag glyphs). Falls back gracefully if twemoji didn't load.
let _twemojiUnavailableLogged = false
function parseEmoji(target) {
  if (typeof window === 'undefined' || !target) return
  if (!window.twemoji) {
    if (!_twemojiUnavailableLogged) {
      console.warn('[flags] Twemoji failed to load (network/CSP blocked cdnjs.cloudflare.com). Flags will fall back to system fonts; on Windows this means country codes show as text.')
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
    console.warn('[flags] Twemoji.parse threw:', e)
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
  if (tab === 'season')   renderSeason()
  if (tab === 'play')     renderPlay()
  parseEmoji(document.body)
}

function updatePhaseUI() {
  $('cur-season').textContent = S.season || 1
  const btn = $('btn-main')
  const map = {
    idle:        `▶ Begin Season ${S.season || 1}`,
    stats:       '▶ Open Transfer Market',
    market:      '▶ Run Local Leagues',
    qualifying:  '▶ Draw Groups',
    groups:      '▶ Play Next Match',
    knockout:    '▶ Play Next Match',
    done:        '▶ Start New Season',
  }
  btn.textContent = map[S.phase] || '▶ New Season'
  btn.disabled = false
  const phases = {
    idle:        'Pre-Season',
    stats:       'Stats Update',
    market:      'Transfer Market',
    qualifying:  'Local Leagues',
    groups:      'Group Stage',
    knockout:    'Knockout',
    done:        'Season Complete',
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
    await autoSave()
    updatePhaseUI()
    toast('Transfer market closed. Local leagues next.')
    switchTab('play')
  } else if (p === 'market') {
    runLocalLeagues()
    runQualification()
    S.phase = 'qualifying'
    await autoSave()
    updatePhaseUI()
    toast('Local leagues decided! 32 teams qualified.')
    switchTab('play')
  } else if (p === 'qualifying') {
    drawGroups()
    S.phase = 'groups'
    await autoSave()
    updatePhaseUI()
    toast('Groups drawn!')
    switchTab('groups')
  } else if (p === 'groups') {
    playNextGroupMatch()
  } else if (p === 'knockout') {
    playNextKnockoutMatch()
  } else if (p === 'done') {
    startNewSeason()
    await autoSave()
    updatePhaseUI()
    renderPlay()
    toast(`Season ${S.season} begins!`)
  }
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
      <div class="playback-actions">
        <button class="btn btn-sm" onclick="window.cancelPreview()">Cancel</button>
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
window.cancelPreview = function () {
  window._previewOnStart = null
  const popup = $('match-popup')
  popup.style.display = 'none'
  popup.classList.remove('match-popup-modal')
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

    inner.innerHTML = `
      <div class="playback-card">
        <div class="playback-header">
          <div class="playback-round">${roundName.toUpperCase()}</div>
          <div class="playback-clock ${isFinal?'final':''}">${isFinal ? 'FT' : currentMinute + "'"}</div>
        </div>
        <div class="playback-score-row">
          <div class="playback-team-block">
            <div class="playback-team-name">${flag(t1.cc)} ${t1.name}</div>
            ${star1 ? `<div class="playback-team-star" style="color:${tierColor(star1.tier)}">⭐ ${star1.name} (${star1.pos})</div>` : ''}
          </div>
          <div class="playback-score">
            <span class="${score1 > score2 ? 'lead' : ''}">${score1}</span>
            <span class="dash">–</span>
            <span class="${score2 > score1 ? 'lead' : ''}">${score2}</span>
          </div>
          <div class="playback-team-block right">
            <div class="playback-team-name">${t2.name} ${flag(t2.cc)}</div>
            ${star2 ? `<div class="playback-team-star" style="color:${tierColor(star2.tier)}">⭐ ${star2.name} (${star2.pos})</div>` : ''}
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

    ${r.effects?.length ? `<div class="playback-effects">
      ${r.effects.map(e => `<div class="effect-line ${e.includes('⭐')?'star':e.includes('📋')?'coach':''}">${e}</div>`).join('')}
    </div>` : ''}
  `
}

window.skipPlayback = function () { _playbackSkip = true }
window.closePlayback = function () {
  const popup = $('match-popup')
  popup.style.display = 'none'
  popup.classList.remove('match-popup-modal')
  if (_playbackTimer) { clearTimeout(_playbackTimer); _playbackTimer = null }
  if (window._matchOnClose) {
    const cb = window._matchOnClose
    window._matchOnClose = null
    cb()
  }
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
        <div style="font-family:var(--font-head);font-size:32px;font-weight:900;color:var(--blue2);letter-spacing:.12em">CHAMPIONS LEAGUE</div>
        <div style="color:var(--txt2);margin:8px 0 28px">32 clubs. One trophy. Your story starts here.</div>
        <button class="btn btn-primary" onclick="handleMain()" style="padding:12px 32px;font-size:14px">▶ Begin Season ${S.season || 1}</button>
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
        <div style="font-size:12px;color:var(--txt2);margin-top:6px">Season ${S.season}</div>
      </div>
      ${(aw.topScorer || aw.offMVP || aw.defMVP) ? `
      <div class="sec">SEASON AWARDS</div>
      <div class="awards-grid">
        ${aw.topScorer ? `<div class="award-card"><div class="award-icon">⚽</div><div class="award-label">Top Scorer</div><div class="award-name">${aw.topScorer.name}</div><div class="award-sub">${aw.topScorer.goals} goals · ${aw.topScorer.team}</div></div>` : ''}
        ${aw.offMVP   ? `<div class="award-card"><div class="award-icon">🌟</div><div class="award-label">Offensive MVP</div><div class="award-name">${aw.offMVP.name}</div><div class="award-sub">${aw.offMVP.rating} avg · ${aw.offMVP.pos} · ${aw.offMVP.team}</div></div>` : ''}
        ${aw.defMVP   ? `<div class="award-card"><div class="award-icon">🛡️</div><div class="award-label">Defensive MVP</div><div class="award-name">${aw.defMVP.name}</div><div class="award-sub">${aw.defMVP.rating} avg · ${aw.defMVP.pos} · ${aw.defMVP.team}</div></div>` : ''}
      </div>` : ''}
      ${renderTopScorers()}`
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
      <div style="font-family:var(--font-head);font-size:32px;font-weight:900;color:var(--blue2);letter-spacing:.12em">SEASON ${S.season || 1}</div>
      <div style="color:var(--txt2);margin:8px 0 28px">The market opens first. Then the local leagues decide who qualifies for Europe.</div>
      <button class="btn btn-primary" onclick="handleMain()" style="padding:12px 32px;font-size:14px">▶ Begin Season ${S.season || 1}</button>
    </div>`
  }
  el.innerHTML = html
}

// ── QUALIFYING SCREEN — local-league results & qualifiers ────
function renderQualifyingScreen() {
  const lr = S.localLeagueResults || {}
  let html = `
    <div class="sec">LOCAL LEAGUES — SEASON ${S.season} CHAMPIONS</div>
    <div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
      Each league has been decided. The team in <span style="color:var(--gold)">gold</span> is this season's local champion.
      Click "Draw Groups" above when ready.
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
  return `<div class="sec">${label}</div>` + upcoming.map((m, i) => {
    const groupTag = S.phase === 'groups' && S.groups[m.gi]
      ? `<span class="upcoming-tag">Group ${S.groups[m.gi].id}</span>`
      : ''
    const nextBadge = i === 0 ? '<span class="upcoming-next">NEXT</span>' : ''
    return `<div class="match-result-card upcoming-match">
      <div class="match-teams">
        <div class="match-team">${flag(m.t1.cc)} ${m.t1.name}</div>
        <div class="upcoming-vs">vs ${groupTag}${nextBadge}</div>
        <div class="match-team right">${m.t2.name} ${flag(m.t2.cc)}</div>
      </div>
    </div>`
  }).join('')
}

// ── Stats Update screen — shown during phase 'stats' ─────────
function renderStatsScreen() {
  const seasonNum = S.season || 1
  return `
    <div class="sec">STATS UPDATE — SEASON ${seasonNum}</div>
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
  const tierWeight = { legendary:8, epic:5, rare:3, uncommon:1, common:0 }

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
    return {
      id: t.id,
      name: t.name,
      cc: t.cc,
      base: t.base || 0,
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
    { id: 'base',      label: 'Base',     title: 'Permanent base rating' },
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
      // Compare CS-Ov to base to show drift coloring.
      const drift = t.csOv - t.base
      const driftCol = drift > 2 ? 'var(--green)' : drift < -2 ? 'var(--red)' : 'var(--txt2)'
      const psOvCell = t.psOv ? t.psOv : '<span style="color:var(--txt3)">—</span>'
      const psDelta = t.psOv ? (t.csOv - t.psOv) : 0
      const psDeltaStr = t.psOv
        ? ` <span style="color:${psDelta>0?'var(--green)':psDelta<0?'var(--red)':'var(--txt3)'};font-size:10px">${psDelta>0?'+':''}${psDelta}</span>`
        : ''
      return `<tr>
        <td class="num" style="color:var(--txt3)">${i + 1}</td>
        <td><strong>${flag(t.cc)} ${t.name}</strong></td>
        <td class="num" style="color:var(--silver);font-weight:700">${t.base}</td>
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
    <div class="sec">TRANSFER MARKET — SEASON ${seasonNum}</div>
    <div style="color:var(--txt2);font-size:12px;margin-bottom:14px">
      Retirements first, then transfers between clubs, then any squad overflow,
      then coaching changes. Click "Run Local Leagues" above when you're ready.
    </div>`

  if (!moves.length) {
    html += '<div class="empty">Quiet window — nothing to report.</div>'
    return html
  }

  html += renderMarketMoveList(moves)
  return html
}

// Shared renderer (used by Market screen and Season → Market tab).
function renderMarketMoveList(moves) {
  if (!moves.length) return '<div class="empty">No market moves this season.</div>'
  const phaseTitle = {
    retirement: 'RETIREMENTS',
    signing:    'SIGNINGS',
    overflow:   'SQUAD CAP RELEASES',
    youth:      'NEW FROM YOUTH / NEW MANAGERS',
  }
  const phaseColor = {
    retirement: 'var(--silver)',
    signing:    'var(--blue2)',
    overflow:   'var(--gold)',
    youth:      'var(--green)',
  }
  const order = ['retirement', 'signing', 'overflow', 'youth']
  let html = ''
  order.forEach(ph => {
    const here = moves.filter(m => m.phase === ph)
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
  } else if (m.phase === 'signing') {
    summary = `${flag(fromCC)} ${m.from} → <span style="color:var(--blue2)">${flag(toCC)} ${m.to}</span>`
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
  const allStars = (S.allTeams || []).flatMap(t => t.stars || [])
  const star = allStars.find(s => s.id === starId)
  if (!star) return toast('Player not found.')
  showDetailModal(renderStarDetailHTML(star))
}
window.openCoachDetail = function(coachId) {
  const coach = (S.coaches || []).find(c => c.id === coachId)
  if (!coach) return toast('Coach not found.')
  showDetailModal(renderCoachDetailHTML(coach))
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
  return `
    <div class="playback-header">
      <div class="playback-round">Player Profile</div>
      ${tierBadge(star.tier)}
    </div>
    <div style="font-family:var(--font-head);font-size:24px;font-weight:700;margin-bottom:4px">${star.name}</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:12px">
      ${flag(star.nationality)} ${country} · ${star.pos} ·
      ${flag(team?.cc || '')} ${team?.name || star.teamName || '—'}
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:12px">
      Age: ${age + 22} (${age}/${star.lifespan} seasons in career) ·
      Career goals: <span style="color:var(--gold)">${star.goals || 0}</span>
    </div>
    <div class="star-skills">
      ${skills.map(s => `<div class="star-skill-line">${s}</div>`).join('')}
    </div>`
}

function renderCoachDetailHTML(coach) {
  const team = (S.allTeams || []).find(t => t.id === coach.teamId)
  const skills = describeCoachSkills(coach)
  const age = (S.season || 1) - (coach.season || 1)
  return `
    <div class="playback-header">
      <div class="playback-round">Coach Profile</div>
      ${tierBadge(coach.tier)}
    </div>
    <div style="font-family:var(--font-head);font-size:24px;font-weight:700;margin-bottom:4px">${coach.name}</div>
    <div style="font-size:12px;color:var(--txt3);margin-bottom:12px">
      ${flag(coach.nationality)} ${COUNTRY_NAME[coach.nationality] || coach.nationality || '—'} ·
      ${flag(team?.cc || '')} ${team?.name || coach.teamName || '—'}
    </div>
    <div style="font-size:11px;color:var(--txt3);margin-bottom:12px">
      ${age}/${coach.lifespan} seasons at the club
    </div>
    ${coach.trait ? `
    <div style="background:linear-gradient(135deg, rgba(255,152,0,.12), rgba(255,152,0,.04)); border:1px solid rgba(255,152,0,.3); border-radius:var(--r); padding:10px 12px; margin-bottom:12px">
      <div style="font-family:var(--font-head); font-size:11px; letter-spacing:.14em; color:var(--gold); text-transform:uppercase; margin-bottom:4px">${coach.trait.tier === 'legendary' ? '★ Legendary Trait' : '★ Epic Trait'}</div>
      <div style="font-weight:700; margin-bottom:2px">${coach.trait.name}</div>
      <div style="font-size:11px; color:var(--txt2)">${coach.trait.description}</div>
    </div>` : ''}
    <div class="star-skills">
      ${skills.map(s => `<div class="star-skill-line">${s}</div>`).join('')}
    </div>`
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
        return `<div class="group-team ${i < 2 ? 'qualifies' : ''}">
          <span class="team-flag-cell">${flag(t.cc)}</span>
          <span class="team-name-cell">${t.name}</span>
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
        <div class="match-team">${flag(m.t1.cc)} ${m.t1.name}</div>
        <div class="match-score" style="font-size:18px">${m.result.g1} – ${m.result.g2}</div>
        <div class="match-team right">${m.t2.name} ${flag(m.t2.cc)}</div>
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
      html += `<div class="bracket-match">
        <div class="bracket-team ${w ? (w === m.t1 ? 'winner' : 'loser') : ''}">${m.t1 ? `${flag(m.t1.cc)} ${m.t1.name}` : '-'}${m.result ? `<span class="bracket-score">${m.result.g1}</span>` : ''}</div>
        <div class="bracket-team ${w ? (w === m.t2 ? 'winner' : 'loser') : ''}">${m.t2 ? `${flag(m.t2.cc)} ${m.t2.name}` : '-'}${m.result ? `<span class="bracket-score">${m.result.g2}</span>` : ''}</div>
      </div>`
    })
    html += '</div>'
  })
  if (S.champion) {
    html += `<div class="bracket-col"><div class="bracket-round-name">CHAMPION</div>
      <div class="bracket-match" style="border-color:var(--gold)">
        <div class="bracket-team winner" style="color:var(--gold)">🏆 ${flag(S.champion.cc)} ${S.champion.name}</div>
      </div></div>`
  }
  html += '</div></div>'
  el.innerHTML = html
}

// ─────────────────────────────────────────────────────────────
// TEAMS TAB
// ─────────────────────────────────────────────────────────────
let teamSort = 'overall'

function renderTeams() {
  const el = $('tab-teams')
  if (!el || !S.teams?.length) {
    if (el) el.innerHTML = '<div class="empty">No teams yet — qualify first.</div>'
    return
  }
  const sorters = {
    overall:    (a,b) => ovr(getEffStats(b)) - ovr(getEffStats(a)),
    attack:     (a,b) => getEffStats(b).attack - getEffStats(a).attack,
    defense:    (a,b) => getEffStats(b).defense - getEffStats(a).defense,
    stamina:    (a,b) => getEffStats(b).stamina - getEffStats(a).stamina,
    mental:     (a,b) => getEffStats(b).mental - getEffStats(a).mental,
    setPieces:  (a,b) => getEffStats(b).setPieces - getEffStats(a).setPieces,
    alphabetical: (a,b) => a.name.localeCompare(b.name),
  }
  const sorted = [...S.teams].sort(sorters[teamSort] || sorters.overall)
  let html = `<div class="sort-row">Sort: ${['overall','attack','defense','stamina','mental','setPieces','alphabetical'].map(k =>
    `<button class="sort-btn ${teamSort===k?'active':''}" onclick="setTeamSort('${k}')">${k}</button>`).join('')}
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Club</th><th>ATT</th><th>DEF</th><th>STA</th><th>MEN</th><th>SET</th><th>OVR</th><th>Star</th><th>Coach</th></tr></thead>
      <tbody>`
  sorted.forEach((t, i) => {
    const eff = getEffStats(t)
    const o = Math.round((eff.attack + eff.defense + eff.stamina + eff.mental + eff.setPieces) / 5)
    html += `<tr>
      <td style="color:var(--txt3)">${i+1}</td>
      <td><strong>${flag(t.cc)} ${t.name}</strong>${t.isLocalChampion ? ' <span class="badge badge-legendary" style="font-size:8px">CHAMP</span>' : ''}</td>
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
  el.innerHTML = html
}

// ─────────────────────────────────────────────────────────────
// STARS TAB — players + coaches with filters & sorts
// ─────────────────────────────────────────────────────────────
let starSort = 'rarity'
let positionFilter = 'ALL'
let nationalityFilter = 'ALL'

function renderStars() {
  const el = $('tab-stars')
  if (!el) return

  const allStars = []
  ;(S.allTeams || []).forEach(t => {
    (t.stars || []).forEach(s => {
      // Use the latest team info from allTeams (in case of transfers).
      allStars.push({
        ...s,
        teamName: t.name,
        teamCC: t.cc,
      })
    })
  })
  const coaches = S.coaches || []

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
      : (a,b) => a.name.localeCompare(b.name)

  const filtered = allStars.filter(s =>
    (positionFilter === 'ALL' || s.pos === positionFilter) &&
    (nationalityFilter === 'ALL' || (s.nationality || s.cc) === nationalityFilter)
  )
  const sorted = [...filtered].sort(sortFn(starSort))

  let html = `<div class="sec">STAR PLAYERS (${filtered.length} of ${allStars.length})</div>
    <div class="sort-row">Sort:
      ${['rarity','goals','rating','name'].map(k => `<button class="sort-btn ${starSort===k?'active':''}" onclick="setStarSort('${k}')">${k}</button>`).join('')}
    </div>
    <div class="sort-row">Position:
      ${['ALL','FWD','MID','DEF','GK'].map(p => `<button class="sort-btn ${positionFilter===p?'active':''}" onclick="setPositionFilter('${p}')">${p}</button>`).join('')}
    </div>
    <div class="sort-row">Nationality:
      <select class="sort-select" onchange="setNationalityFilter(this.value)">
        <option value="ALL" ${nationalityFilter==='ALL'?'selected':''}>All countries</option>
        ${allNationalities.map(cc => `<option value="${cc}" ${nationalityFilter===cc?'selected':''}>${flag(cc)} ${COUNTRY_NAME[cc] || cc}</option>`).join('')}
      </select>
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
      <div class="star-name">${s.name}</div>
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
      </div>
    </div>`
  })
  html += '</div>'

  // Coaches
  const sortedCoaches = [...coaches].sort((a,b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
  html += `<div class="sec">COACHES (${coaches.length})</div>`
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
      </div>
      ${tierBadge(c.tier)}
    </div>`
  })
  el.innerHTML = html
}

window.setStarSort = function (k) { starSort = k; renderStars(); parseEmoji(document.body) }
window.setPositionFilter = function (p) { positionFilter = p; renderStars(); parseEmoji(document.body) }
window.setNationalityFilter = function (v) { nationalityFilter = v; renderStars(); parseEmoji(document.body) }
window.setTeamSort = function (k) { teamSort = k; renderTeams(); parseEmoji(document.body) }

// ─────────────────────────────────────────────────────────────
// HISTORY TAB — Teams / Players sub-tabs, with sortable columns.
// ─────────────────────────────────────────────────────────────
let historySubTab = 'teams'   // 'teams' | 'players'
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

  // Build per-player career stats from the season-by-season log.
  const playerStats = {}
  S.history?.forEach(h => {
    (h.stars || []).forEach(s => {
      if (!playerStats[s.name]) {
        playerStats[s.name] = {
          name: s.name, pos: s.pos, tier: s.tier,
          gold:0, silver:0, bronze:0,
          offMVP:0, defMVP:0, topScorer:0,
          goals:0, games:0, participations:0, ratings:[],
        }
      }
      const p = playerStats[s.name]
      p.participations++
      p.goals += (s.goals || 0)
      p.games += (s.games || 0)
      if (s.medals?.gold)   p.gold   += s.medals.gold
      if (s.medals?.silver) p.silver += s.medals.silver
      if (s.medals?.bronze) p.bronze += s.medals.bronze
      if (s.avgRating)      p.ratings.push(s.avgRating)
      if (h.awards?.topScorer?.name === s.name) p.topScorer++
      if (h.awards?.offMVP?.name   === s.name) p.offMVP++
      if (h.awards?.defMVP?.name   === s.name) p.defMVP++
    })
  })
  const playerList = Object.values(playerStats).map(p => ({
    ...p,
    avgRating: p.ratings.length ? (p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length) : 0,
  }))
  const teamStatsList = Object.values(S.teamStats || {})

  // Sub-tab buttons.
  const subBtn = (k, label, count) => `
    <button class="sub-tab ${historySubTab===k?'active':''}" onclick="setHistorySubTab('${k}')">
      ${label}${count!=null?` <span class="sub-tab-count">${count}</span>`:''}
    </button>`

  // Season-by-season scroll on top.
  let seasonsHTML = ''
  if (S.history?.length) {
    seasonsHTML = `<div class="sec">SEASON HISTORY</div>` + [...S.history].reverse().map(h => `
      <div class="history-card">
        <div class="history-season">SEASON ${h.season}</div>
        <div class="history-champion">🏆 ${flag(h.cc || '')} ${h.championName}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:4px">${h.totalGoals||0} goals · Top scorer: ${h.topScorers?.[0]?.[0] || '—'} (${h.topScorers?.[0]?.[1] || 0}⚽)</div>
        ${h.awards?.offMVP ? `<div style="font-size:11px;color:var(--txt3)">🌟 ${h.awards.offMVP.name} Off MVP · 🛡️ ${h.awards.defMVP?.name || '—'} Def MVP</div>` : ''}
        ${h.localChampions?.length ? `<details style="margin-top:6px">
          <summary style="cursor:pointer;font-size:11px;color:var(--txt3)">Local champions →</summary>
          <div style="font-size:11px;color:var(--txt2);margin-top:4px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:4px">
            ${h.localChampions.map(lc => `<span>${flag(lc.cc)} ${lc.league}: <b>${lc.champion}</b></span>`).join('')}
          </div>
        </details>` : ''}
      </div>`).join('')
  }

  // Body — pick which sub-tab to render.
  let body = ''
  if (historySubTab === 'teams') {
    body = renderHistoryTeams(teamStatsList)
  } else {
    body = renderHistoryPlayers(playerList)
  }

  el.innerHTML = `
    ${seasonsHTML}
    <div class="sub-tab-row" style="margin-top:14px">
      ${subBtn('teams',   '📊 Teams',   teamStatsList.length || null)}
      ${subBtn('players', '⭐ Players', playerList.length || null)}
    </div>
    ${body}`
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
    ${sorted.slice(0, 30).map(t => `<tr>
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
    ${sorted.slice(0, 50).map(p => `<tr>
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
    <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.14em;color:var(--txt3);margin-bottom:6px">SEASON ${S.season || 1}</div>
    <div class="sub-tab-row">
      ${subBtn('stats',  '📊 Stats',          teamsKnown || null)}
      ${subBtn('local',  '🏆 Local Leagues', llCount || null)}
      ${subBtn('market', '🔄 Market',        mktCount || null)}
      ${subBtn('cl',     '⚽ Champions League', matchesPlayed || null)}
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
  // Walks EVERY star on every qualified team — not just team.star —
  // because per-match ratings are written to individual stars in
  // team.stars[]. (After save/load t.star may even reference a stale
  // copy, so reading from t.stars is also more reliable.)
  const ratedStars = (S.teams || [])
    .flatMap(t => t.stars && t.stars.length ? t.stars : (t.star ? [t.star] : []))
    .filter(s => s && s.ratings?.length)
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

  html += `<div class="card cl-stat-card">
    <div class="cl-stat-title">🌟 Highest-Rated Attackers</div>
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
window.openSettings  = () => { $('settings-overlay').style.display = 'flex' }
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
          <div class="save-slot-meta">Season ${auto.season} · ${detail} · saved ${when}</div>
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
              <div class="save-slot-meta">Season ${s.season} · ${detail} · saved ${when}</div>
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
  toast('Autosave loaded — Season ' + (S.season || 1))
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
    toast('Imported — now in Season ' + (S.season || 1))
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
window.confirmAccept = () => { $('confirm-overlay').style.display = 'none'; _confirmCb?.(); _confirmCb = null }
window.confirmDeny   = () => { $('confirm-overlay').style.display = 'none'; _confirmCb = null }

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
async function init() {
  const loaded = await loadGame()
  if (!loaded) {
    S.phase = S.phase || 'idle'
    S.season = S.season || 1
  }
  updatePhaseUI()
  renderPlay()
  if (S.groups?.length) renderGroups()
  if (S.knockoutRounds?.length) renderBracket()
  parseEmoji(document.body)
}
init()

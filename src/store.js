// ── Game State Store ─────────────────────────────────────────
const DB_NAME = 'cls', DB_VER = 1, STORE = 'saves', AUTO_KEY = 'autosave'
let _db = null

async function getDB() {
  if (_db) return _db
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'key' })
    req.onsuccess = e => { _db = e.target.result; res(_db) }
    req.onerror = () => rej(req.error)
  })
}

export async function dbSave(key, data) {
  const db = await getDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ key, data })
    tx.oncomplete = () => res(true)
    tx.onerror = () => rej(tx.error)
  })
}

export async function dbLoad(key) {
  const db = await getDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => res(req.result?.data || null)
    req.onerror = () => rej(req.error)
  })
}

export async function dbDelete(key) {
  const db = await getDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => res(true)
    tx.onerror = () => rej(tx.error)
  })
}

export async function dbAll() {
  const db = await getDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => res(req.result || [])
    req.onerror = () => rej(req.error)
  })
}

// ── State ────────────────────────────────────────────────────
// NOTE: this object enumerates the keys we *start* with, but the
// engine adds more fields at runtime (allTeams, teamStats,
// seasonStats, lastMarket, etc). buildSave() does a deep clone of
// the live S object, so anything attached to S at the time of save
// is captured. resetState() and import() reset back to this same
// shape so loading a save can never leak stale fields.
const INITIAL_STATE = {
  season: 1,
  phase: 'idle', // idle | stats | market | qualifying | groups | knockout | done
  teams: [],
  groups: [],
  groupMatches: [],
  knockoutRounds: [],
  scorers: {},
  stars: [],
  coaches: [],
  history: [],
  roundReached: {},
  champion: null,
  teamGoals: {},
  teamGoalsConceded: {},
  teamShots: {},
  teamPossession: {},
  teamPossessionMatches: {},
  allMatchResults: [],
  allTeams: null,
  teamStats: null,
  localLeagueResults: null,
  lastMarket: null,
  seasonAwards: {},
  nextId: 1,
}

export const S = JSON.parse(JSON.stringify(INITIAL_STATE))

// Wipe S back to a clean slate. Used before applying a loaded save
// so values from the current session can't leak through into the
// loaded one.
function resetState() {
  Object.keys(S).forEach(k => { delete S[k] })
  Object.assign(S, JSON.parse(JSON.stringify(INITIAL_STATE)))
}

// Bump this whenever the save-state shape changes in a
// breaking way. importSave() warns when it sees an older version
// so users know why their save might not look right.
const SAVE_VERSION = 2

export function buildSave() {
  // Deep clone of the live S — captures every field present at
  // save time, including ones that aren't in INITIAL_STATE.
  const data = JSON.parse(JSON.stringify(S))
  data.savedAt = Date.now()
  data.saveVersion = SAVE_VERSION
  return data
}

export async function autoSave() {
  try {
    await dbSave(AUTO_KEY, buildSave())
    const el = document.getElementById('last-saved')
    if (el) el.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) { console.warn('autosave failed', e) }
}

// After deserializing a save, the same team that lives in
// S.groups[*].teams[j] no longer points at the same object as
// S.groupMatches[k].t1 / .t2 — JSON.parse always creates fresh
// objects. We need to rebind those references so when
// updateGroupStats mutates match.t1, the standings render sees
// the change. Same for knockout matches and stars/coaches.
function rehydrateRefs() {
  if (!S.teams?.length) return
  // Build an id → live team object map (the "canonical" one we
  // want all references to point to).
  const teamById = new Map()
  S.teams.forEach(t => teamById.set(t.id, t))

  // Rebind groups: each group's teams[] entries should be the
  // same object as S.teams[same id].
  if (Array.isArray(S.groups)) {
    S.groups.forEach(grp => {
      if (Array.isArray(grp.teams)) {
        grp.teams = grp.teams.map(t => teamById.get(t.id) || t)
      }
    })
  }
  // Rebind groupMatches: t1/t2 are team refs.
  if (Array.isArray(S.groupMatches)) {
    S.groupMatches.forEach(m => {
      if (m.t1) m.t1 = teamById.get(m.t1.id) || m.t1
      if (m.t2) m.t2 = teamById.get(m.t2.id) || m.t2
    })
  }
  // Knockout rounds: same pattern.
  if (Array.isArray(S.knockoutRounds)) {
    S.knockoutRounds.forEach(round => {
      if (Array.isArray(round.matches)) {
        round.matches.forEach(m => {
          if (m.t1) m.t1 = teamById.get(m.t1.id) || m.t1
          if (m.t2) m.t2 = teamById.get(m.t2.id) || m.t2
          if (m.winner) m.winner = teamById.get(m.winner.id) || m.winner
        })
      }
    })
  }
  // Champion (if a season finished pre-save).
  if (S.champion?.id) {
    S.champion = teamById.get(S.champion.id) || S.champion
  }
  // Restore stars[] arrays on each team in S.teams to point at the
  // same star objects as the canonical S.allTeams entries (so per-
  // match stat tracking and rendering see consistent data).
  if (Array.isArray(S.allTeams)) {
    const allTeamById = new Map()
    S.allTeams.forEach(t => allTeamById.set(t.id, t))
    S.teams.forEach(t => {
      const live = allTeamById.get(t.id)
      if (live) {
        t.stars = live.stars || []
        t.star = (t.stars && t.stars[0]) || null
        // Keep coach reference fresh too.
        if (Array.isArray(S.coaches)) {
          t.coach = S.coaches.find(c => c.teamId === t.id) || null
        }
      }
    })
  }
}

export async function loadGame() {
  try {
    const d = await dbLoad(AUTO_KEY)
    if (!d) return false
    resetState()
    Object.assign(S, d)
    rehydrateRefs()
    return true
  } catch (e) { return false }
}

export async function clearGame() {
  await dbDelete(AUTO_KEY)
}

// Named slots
export async function saveSlot(name) {
  const key = 'slot__' + name.replace(/[^\w\s-]/g, '_')
  const data = buildSave()
  data.slotName = name
  await dbSave(key, data)
}

export async function loadSlot(key) {
  const d = await dbLoad(key)
  if (!d) throw new Error('Save not found')
  resetState()
  Object.assign(S, d)
  rehydrateRefs()
  await autoSave()
}

export async function allSlots() {
  const all = await dbAll()
  return all.filter(x => x.key.startsWith('slot__')).map(x => x.data)
}

export async function deleteSlot(key) {
  await dbDelete(key)
}

// ── Restart-point snapshots ──────────────────────────────────
// Two reserved slots, both prefixed with __ so allSlots() (which
// filters by slot__*) doesn't show them in the user-visible list:
//
//   __preSeason     — taken right before runStatsUpdate runs.
//                     Restoring it puts the user back at "Begin
//                     Season N" with no stats rolled and no market
//                     activity yet. ALWAYS overwrites — only ever
//                     one of these exists (the most recent).
//
//   __preTournament — taken right after drawGroups, before the
//                     first match. Restoring it keeps the draw,
//                     market, and stats but resets all standings
//                     and match results. Same overwrite policy.
const PRE_SEASON_KEY = '__preSeason'
const PRE_TOURNAMENT_KEY = '__preTournament'

export async function snapshotPreSeason() {
  await dbSave(PRE_SEASON_KEY, buildSave())
  // A new season's pre-tournament snapshot doesn't exist yet — clear
  // any stale one from the previous season so we don't accidentally
  // roll forward onto the wrong groups.
  await dbDelete(PRE_TOURNAMENT_KEY)
}

export async function snapshotPreTournament() {
  await dbSave(PRE_TOURNAMENT_KEY, buildSave())
}

// "Has restart points?" — for enabling/disabling the menu items.
export async function hasPreSeasonSnapshot() {
  return !!(await dbLoad(PRE_SEASON_KEY))
}
export async function hasPreTournamentSnapshot() {
  return !!(await dbLoad(PRE_TOURNAMENT_KEY))
}

// Restore to before-stats state. Wipes both snapshots since the
// pre-tournament one (if any) belongs to the season we just unwound.
export async function restartSeason() {
  const d = await dbLoad(PRE_SEASON_KEY)
  if (!d) throw new Error('No pre-season snapshot found')
  resetState()
  Object.assign(S, d)
  rehydrateRefs()
  await dbDelete(PRE_TOURNAMENT_KEY)
  await autoSave()    // make autosave match the restored state
}

// Restore to before-first-match state. Pre-season snapshot stays —
// the user might still want to roll back further.
export async function restartTournament() {
  const d = await dbLoad(PRE_TOURNAMENT_KEY)
  if (!d) throw new Error('No pre-tournament snapshot found')
  resetState()
  Object.assign(S, d)
  rehydrateRefs()
  await autoSave()    // make autosave match the restored state
}

// Export to JSON file. Filename includes the season + timestamp so
// you can keep multiple snapshots side by side on disk.
export function exportSave() {
  const data = buildSave()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cls_save_season${S.season}_${new Date().toISOString().slice(0,10)}.json`
  a.click()
  // Free up the blob URL after a moment.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

export function importSave(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => {
      try {
        const d = JSON.parse(e.target.result)
        // Basic sanity checks — make sure this looks like one of
        // *our* save files and not something random.
        if (typeof d !== 'object' || d === null) throw new Error('Not a JSON object')
        if (typeof d.season !== 'number') throw new Error('Missing "season" — not a save file?')
        if (!Array.isArray(d.history) && d.history !== undefined) throw new Error('Corrupt history')
        // Older saves don't have a saveVersion. We still accept them
        // but warn so the user knows things might look slightly off.
        if (d.saveVersion && d.saveVersion > SAVE_VERSION) {
          console.warn('Save was made by a newer version (' + d.saveVersion + '); some fields may be ignored.')
        }
        // Wipe stale state before applying the loaded data so
        // nothing from the running session can leak through.
        resetState()
        Object.assign(S, d)
        rehydrateRefs()
        autoSave().then(() => res(d)).catch(rej)
      } catch (err) { rej(err) }
    }
    r.onerror = () => rej(r.error || new Error('Failed to read file'))
    r.readAsText(file)
  })
}

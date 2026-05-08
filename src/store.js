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

export async function loadGame() {
  try {
    const d = await dbLoad(AUTO_KEY)
    if (!d) return false
    resetState()
    Object.assign(S, d)
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
  await autoSave()
}

export async function allSlots() {
  const all = await dbAll()
  return all.filter(x => x.key.startsWith('slot__')).map(x => x.data)
}

export async function deleteSlot(key) {
  await dbDelete(key)
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
        autoSave().then(() => res(d)).catch(rej)
      } catch (err) { rej(err) }
    }
    r.onerror = () => rej(r.error || new Error('Failed to read file'))
    r.readAsText(file)
  })
}

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
export const S = {
  season: 1,
  phase: 'idle', // idle | groups | knockout | transfers | done
  teams: [],
  groups: [],        // 8 groups of 4
  groupMatches: [],
  knockoutRounds: [],
  scorers: {},
  stars: [],         // active player stars
  coaches: [],       // active coaches (5)
  history: [],       // past season results
  roundReached: {},
  champion: null,
  teamGoals: {},
  teamGoalsConceded: {},
  allMatchResults: [],
  nextId: 1,
}

export function buildSave() {
  return { ...JSON.parse(JSON.stringify(S)), savedAt: Date.now() }
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

// Export to JSON file
export function exportSave() {
  const data = buildSave()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cls_save_season${S.season}_${Date.now()}.json`
  a.click()
}

export function importSave(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => {
      try {
        const d = JSON.parse(e.target.result)
        if (!d.season) throw new Error('Invalid save')
        Object.assign(S, d)
        autoSave().then(res).catch(rej)
      } catch (err) { rej(err) }
    }
    r.onerror = rej
    r.readAsText(file)
  })
}

import { useState, useEffect, useRef, useCallback } from 'react'

// ── API helpers ──────────────────────────────────────────────────────────────
function getAdminCode() { return localStorage.getItem('derby_admin_code') || '' }

async function apiFetch(url, opts = {}) {
  const code = getAdminCode()
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (code) headers['X-Admin-Code'] = code
  const res = await fetch(url, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const api = {
  get: (url) => apiFetch(url),
  post: (url, body) => apiFetch(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => apiFetch(url, { method: 'PUT', body: JSON.stringify(body) }),
  del: (url) => apiFetch(url, { method: 'DELETE' }),
}

// ── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'info') => {
    const id = Date.now()
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])
  return { toasts, show }
}

function Toasts({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`font-condensed text-sm px-4 py-2 rounded-lg shadow-lg ${
            t.type === 'error' ? 'bg-red-800 text-red-100' :
            t.type === 'success' ? 'bg-green-800 text-green-100' :
            'bg-gray-800 text-gray-100'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Confirm dialog ───────────────────────────────────────────────────────────
function useConfirm() {
  const [state, setState] = useState(null)
  const confirm = (msg) => new Promise((resolve) => setState({ msg, resolve }))
  const dialog = state ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="card max-w-sm w-full mx-4">
        <div className="text-sm text-white/70 mb-4">{state.msg}</div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={() => { state.resolve(false); setState(null) }}>Cancel</button>
          <button className="btn btn-danger" onClick={() => { state.resolve(true); setState(null) }}>Confirm</button>
        </div>
      </div>
    </div>
  ) : null
  return { confirm, dialog }
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 1: Event Setup
// ══════════════════════════════════════════════════════════════════════════
function EventSetupTab({ toast }) {
  const [form, setForm] = useState(null)
  const [codes, setCodes] = useState({ adminCode: '', trackOfficialCode: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [adminCodeInput, setAdminCodeInput] = useState(getAdminCode())

  useEffect(() => {
    api.get('/api/event').then(setForm).catch(() => {})
  }, [])

  if (!form) return <div className="text-white/30 text-sm p-8">Loading…</div>

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function save() {
    setLoading(true)
    try {
      await api.post('/api/event', form)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      toast.show('Event settings saved', 'success')
    } catch (e) { toast.show(e.message, 'error') }
    setLoading(false)
  }

  async function saveCodes() {
    try {
      await api.post('/api/access/set-codes', codes)
      toast.show('Access codes updated', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  function applyLocalAdminCode() {
    localStorage.setItem('derby_admin_code', adminCodeInput)
    toast.show('Admin code saved to browser', 'success')
  }

  const scheduleModes = [
    { value: 'roundRobin', label: 'Round Robin' },
    { value: 'singleElim', label: 'Single Elimination' },
    { value: 'doubleElim', label: 'Double Elimination' },
    { value: 'points', label: 'Points-Based' },
  ]
  const winnerLogics = [
    { value: 'fastestRun', label: 'Fastest Run' },
    { value: 'bestAvg', label: 'Best Average' },
    { value: 'points', label: 'Points' },
  ]
  const tiebreakerRules = [
    { value: 'fastestRun', label: 'Fastest Run' },
    { value: 'headToHead', label: 'Head to Head' },
    { value: 'coinFlip', label: 'Coin Flip' },
    { value: 'none', label: 'None' },
  ]
  const pointsTables = [
    { value: 'standard', label: 'Standard (10-7-5-3-2-1)' },
    { value: 'generous', label: 'Generous (12-10-8-6-4-2)' },
    { value: 'participation', label: 'Participation (5-4-3-2-1-1)' },
    { value: 'winnerTakeAll', label: 'Winner Take All (10-0-0…)' },
  ]
  const divisionModes = [
    { value: 'none', label: 'None (All Together)' },
    { value: 'separate', label: 'Separate Divisions' },
    { value: 'shared', label: 'Shared Track' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card space-y-4">
        <div className="font-display text-2xl tracking-wider text-white/80">Event Details</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Event Name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Pack 123 Derby 2025" />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Schedule Mode</label>
            <select value={form.scheduleMode} onChange={(e) => set('scheduleMode', e.target.value)}>
              {scheduleModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Division Mode</label>
            <select value={form.divisionMode} onChange={(e) => set('divisionMode', e.target.value)}>
              {divisionModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Lanes Per Heat</label>
            <select value={form.lanesPerHeat} onChange={(e) => set('lanesPerHeat', Number(e.target.value))}>
              {[2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Runs Per Heat</label>
            <select value={form.runsPerHeat} onChange={(e) => set('runsPerHeat', Number(e.target.value))}>
              {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Heat Winner Logic</label>
            <select value={form.heatWinnerLogic} onChange={(e) => set('heatWinnerLogic', e.target.value)}>
              {winnerLogics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tiebreaker Rule</label>
            <select value={form.tiebreakerRule} onChange={(e) => set('tiebreakerRule', e.target.value)}>
              {tiebreakerRules.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Points Table</label>
            <select value={form.pointsTable} onChange={(e) => set('pointsTable', e.target.value)}>
              {pointsTables.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Bracket Visibility (Guest Display)</label>
          <select value={form.bracketVisibility} onChange={(e) => set('bracketVisibility', e.target.value)}>
            <option value="leaderboardOnly">Leaderboard Only</option>
            <option value="currentHeat">Current Heat</option>
            <option value="fullBracket">Full Bracket</option>
          </select>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
          <span className="font-condensed text-xs text-white/30 uppercase tracking-wider">
            Status: {form.status}
          </span>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="font-display text-2xl tracking-wider text-white/80">Access Codes</div>
        <div className="text-sm text-white/40">
          Leave blank to allow open access. Codes are stored on the server.
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Admin Code</label>
            <input type="password" placeholder="Set admin code…" value={codes.adminCode} onChange={(e) => setCodes((c) => ({ ...c, adminCode: e.target.value }))} />
          </div>
          <div>
            <label className="label">Track Official Code</label>
            <input type="password" placeholder="Set track official code…" value={codes.trackOfficialCode} onChange={(e) => setCodes((c) => ({ ...c, trackOfficialCode: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-secondary" onClick={saveCodes}>Update Access Codes</button>
      </div>

      <div className="card space-y-3">
        <div className="font-display text-2xl tracking-wider text-white/80">Your Admin Code</div>
        <div className="text-sm text-white/40">Stored in this browser's localStorage. Required to make admin API calls.</div>
        <div className="flex gap-2">
          <input type="password" value={adminCodeInput} onChange={(e) => setAdminCodeInput(e.target.value)} placeholder="Enter your admin code…" />
          <button className="btn btn-secondary whitespace-nowrap" onClick={applyLocalAdminCode}>Save Locally</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 2: Racers
// ══════════════════════════════════════════════════════════════════════════
function RacersTab({ toast }) {
  const [racers, setRacers] = useState([])
  const [divisions, setDivisions] = useState([])
  const [form, setForm] = useState({ name: '', carName: '', carNumber: '', division: '', seed: '', notes: '' })
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const { confirm, dialog } = useConfirm()

  const load = () => {
    api.get('/api/racers').then(setRacers).catch(() => {})
    api.get('/api/divisions').then(setDivisions).catch(() => {})
  }
  useEffect(load, [])

  async function addRacer() {
    if (!form.name.trim()) { toast.show('Name is required', 'error'); return }
    try {
      await api.post('/api/racers', { ...form, seed: form.seed ? Number(form.seed) : null })
      setForm({ name: '', carName: '', carNumber: '', division: '', seed: '', notes: '' })
      load(); toast.show('Racer added', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function saveEdit(id) {
    try {
      await api.put(`/api/racers/${id}`, { ...editForm, seed: editForm.seed ? Number(editForm.seed) : null })
      setEditId(null); load(); toast.show('Racer updated', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function deleteRacer(id) {
    const ok = await confirm('Delete this racer? This cannot be undone.')
    if (!ok) return
    try {
      await api.del(`/api/racers/${id}`)
      load(); toast.show('Racer removed', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function toggleActive(r) {
    try {
      await api.put(`/api/racers/${r.id}`, { active: !r.active })
      load()
    } catch (e) { toast.show(e.message, 'error') }
  }

  function startEdit(r) {
    setEditId(r.id)
    setEditForm({ name: r.name, carName: r.carName, carNumber: r.carNumber, division: r.division || '', seed: r.seed ?? '', notes: r.notes })
  }

  return (
    <div className="space-y-5">
      {dialog}
      {/* Add Racer Form */}
      <div className="card">
        <div className="font-display text-xl tracking-wider text-white/70 mb-4">Add Racer</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div><label className="label">Name *</label><input placeholder="Racer name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Car Name</label><input placeholder="Car name" value={form.carName} onChange={(e) => setForm((f) => ({ ...f, carName: e.target.value }))} /></div>
          <div><label className="label">Car #</label><input placeholder="#" value={form.carNumber} onChange={(e) => setForm((f) => ({ ...f, carNumber: e.target.value }))} /></div>
          <div>
            <label className="label">Division</label>
            <select value={form.division} onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}>
              <option value="">— None —</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><label className="label">Seed</label><input type="number" min="1" placeholder="1" value={form.seed} onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))} /></div>
          <div><label className="label">Notes</label><input placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <button className="btn btn-primary" onClick={addRacer}>+ Add Racer</button>
      </div>

      {/* Racer Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="font-condensed text-xs uppercase tracking-widest text-white/40">
            {racers.length} Racer{racers.length !== 1 ? 's' : ''} registered
          </span>
        </div>
        {racers.length === 0 ? (
          <div className="text-center py-12 text-white/20 text-sm">No racers yet. Add some above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Car #', 'Name', 'Car Name', 'Division', 'Seed', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-condensed text-xs uppercase tracking-wider text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {racers.map((r) => {
                  const div = divisions.find((d) => d.id === r.division)
                  if (editId === r.id) {
                    return (
                      <tr key={r.id} className="border-b border-white/5 bg-white/5">
                        <td className="px-2 py-1"><input value={editForm.carNumber} onChange={(e) => setEditForm((f) => ({ ...f, carNumber: e.target.value }))} /></td>
                        <td className="px-2 py-1"><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></td>
                        <td className="px-2 py-1"><input value={editForm.carName} onChange={(e) => setEditForm((f) => ({ ...f, carName: e.target.value }))} /></td>
                        <td className="px-2 py-1">
                          <select value={editForm.division} onChange={(e) => setEditForm((f) => ({ ...f, division: e.target.value }))}>
                            <option value="">—</option>
                            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1"><input type="number" value={editForm.seed} onChange={(e) => setEditForm((f) => ({ ...f, seed: e.target.value }))} /></td>
                        <td className="px-2 py-1" colSpan={2}>
                          <div className="flex gap-2">
                            <button className="btn btn-success" onClick={() => saveEdit(r.id)}>Save</button>
                            <button className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={r.id} className={`border-b border-white/5 hover:bg-white/3 ${!r.active ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-2 font-condensed">{r.carNumber || '—'}</td>
                      <td className="px-4 py-2 font-semibold">{r.name}</td>
                      <td className="px-4 py-2 text-white/60">{r.carName || '—'}</td>
                      <td className="px-4 py-2">
                        {div ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: div.color }} />
                            <span className="font-condensed text-xs">{div.name}</span>
                          </span>
                        ) : <span className="text-white/20">—</span>}
                      </td>
                      <td className="px-4 py-2 text-white/40">{r.seed ?? '—'}</td>
                      <td className="px-4 py-2">
                        <button
                          className={`font-condensed text-xs px-2 py-0.5 rounded border ${r.active !== false ? 'border-green-700 text-green-400' : 'border-white/10 text-white/30'}`}
                          onClick={() => toggleActive(r)}
                        >
                          {r.active !== false ? 'Active' : 'Withdrawn'}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button className="btn btn-secondary" style={{ padding: '3px 10px' }} onClick={() => startEdit(r)}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '3px 10px' }} onClick={() => deleteRacer(r.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 3: Divisions
// ══════════════════════════════════════════════════════════════════════════
function DivisionsTab({ toast }) {
  const [divisions, setDivisions] = useState([])
  const [form, setForm] = useState({ name: '', color: '#f97316', description: '' })
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const { confirm, dialog } = useConfirm()

  const load = () => api.get('/api/divisions').then(setDivisions).catch(() => {})
  useEffect(load, [])

  async function add() {
    if (!form.name.trim()) { toast.show('Name is required', 'error'); return }
    try {
      await api.post('/api/divisions', form)
      setForm({ name: '', color: '#f97316', description: '' })
      load(); toast.show('Division added', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function saveEdit(id) {
    try {
      await api.put(`/api/divisions/${id}`, editForm)
      setEditId(null); load(); toast.show('Division updated', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function del(id) {
    const ok = await confirm('Delete this division?')
    if (!ok) return
    try {
      await api.del(`/api/divisions/${id}`)
      load(); toast.show('Division removed', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  return (
    <div className="max-w-xl space-y-5">
      {dialog}
      <div className="card space-y-3">
        <div className="font-display text-xl tracking-wider text-white/70 mb-1">Add Division</div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Name *</label><input placeholder="Tigers" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Color</label><input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ padding: '2px', height: '36px' }} /></div>
          <div><label className="label">Description</label><input placeholder="Ages 8-10" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <button className="btn btn-primary" onClick={add}>+ Add Division</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <span className="font-condensed text-xs uppercase tracking-widest text-white/40">{divisions.length} Divisions</span>
        </div>
        {divisions.length === 0 ? (
          <div className="text-center py-8 text-white/20 text-sm">No divisions yet.</div>
        ) : (
          <div>
            {divisions.map((d, i) => (
              <div key={d.id} className={`flex items-center gap-3 px-5 py-3 ${i < divisions.length - 1 ? 'border-b border-white/5' : ''}`}>
                {editId === d.id ? (
                  <>
                    <input type="color" value={editForm.color} onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))} style={{ padding: '2px', height: '32px', width: '44px', flexShrink: 0 }} />
                    <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    <input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" />
                    <button className="btn btn-success" style={{ whiteSpace: 'nowrap' }} onClick={() => saveEdit(d.id)}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="font-semibold flex-1">{d.name}</span>
                    <span className="text-white/40 text-sm">{d.description}</span>
                    <button className="btn btn-secondary" style={{ padding: '3px 10px' }} onClick={() => { setEditId(d.id); setEditForm({ name: d.name, color: d.color, description: d.description }) }}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '3px 10px' }} onClick={() => del(d.id)}>✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 4: Bracket
// ══════════════════════════════════════════════════════════════════════════
function BracketTab({ toast }) {
  const [bracket, setBracket] = useState(null)
  const [racers, setRacers] = useState([])
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [swapFirst, setSwapFirst] = useState(null) // { heatId, lane }
  const { confirm, dialog } = useConfirm()

  const load = async () => {
    const [b, r, e] = await Promise.all([
      api.get('/api/bracket').catch(() => null),
      api.get('/api/racers').catch(() => []),
      api.get('/api/event').catch(() => ({})),
    ])
    setBracket(b); setRacers(r); setEvent(e)
  }
  useEffect(() => { load() }, [])

  const racerMap = Object.fromEntries(racers.map((r) => [r.id, r]))

  async function generate() {
    setLoading(true)
    try {
      const b = await api.post('/api/bracket/generate', {})
      setBracket(b); setEvent((e) => e ? { ...e, status: 'bracketGenerated' } : e)
      toast.show('Bracket generated!', 'success')
    } catch (e) { toast.show(e.message, 'error') }
    setLoading(false)
  }

  async function regenerate() {
    const ok = await confirm('Discard current bracket and regenerate? This will clear all results.')
    if (!ok) return
    try {
      await api.post('/api/bracket/unlock', {})
      await api.post('/api/bracket/regenerate', {})
      setBracket(null); toast.show('Bracket cleared', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function toggleLock() {
    try {
      if (event?.bracketLocked) {
        await api.post('/api/bracket/unlock', {})
        setEvent((e) => ({ ...e, bracketLocked: false }))
        toast.show('Bracket unlocked', 'success')
      } else {
        await api.post('/api/bracket/lock', {})
        setEvent((e) => ({ ...e, bracketLocked: true }))
        toast.show('Bracket locked', 'success')
      }
    } catch (e) { toast.show(e.message, 'error') }
  }

  function handleLaneClick(heatId, lane) {
    if (event?.bracketLocked) return
    if (!swapFirst) {
      setSwapFirst({ heatId, lane })
      toast.show('Select second lane to swap with', 'info')
    } else {
      if (swapFirst.heatId === heatId && swapFirst.lane === lane) {
        setSwapFirst(null); return
      }
      api.post('/api/bracket/swap', {
        heat1Id: swapFirst.heatId, lane1: swapFirst.lane,
        heat2Id: heatId, lane2: lane,
      }).then(() => { setSwapFirst(null); load(); toast.show('Swapped!', 'success') })
        .catch((e) => { setSwapFirst(null); toast.show(e.message, 'error') })
    }
  }

  const activeRacers = racers.filter((r) => r.active !== false)

  return (
    <div className="space-y-4">
      {dialog}
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          className="btn btn-primary"
          onClick={generate}
          disabled={loading || activeRacers.length < 2 || (event?.bracketLocked)}
        >
          {loading ? '…' : bracket ? 'Regenerate Bracket' : 'Generate Bracket'}
        </button>
        {bracket && (
          <>
            <button className="btn btn-secondary" onClick={regenerate} disabled={event?.bracketLocked}>
              Clear &amp; Regenerate
            </button>
            <button className={`btn ${event?.bracketLocked ? 'btn-secondary' : 'btn-danger'}`} onClick={toggleLock}>
              {event?.bracketLocked ? '🔓 Unlock Bracket' : '🔒 Lock Bracket'}
            </button>
          </>
        )}
        {swapFirst && (
          <span className="font-condensed text-xs text-orange-400 animate-pulse uppercase tracking-wider">
            Click another lane to swap…
          </span>
        )}
        {activeRacers.length < 2 && (
          <span className="font-condensed text-xs text-white/30 uppercase tracking-wider">
            Need ≥2 active racers to generate
          </span>
        )}
      </div>

      {bracket ? (
        <div className="space-y-6">
          {bracket.rounds.map((round) => (
            <div key={round.id}>
              <div className="font-display text-xl tracking-wider text-white/60 mb-3">
                {round.name}
                {round.bracket && <span className="font-condensed text-xs ml-2 text-white/30 uppercase">{round.bracket}</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {round.heats.map((heat) => (
                  <div key={heat.id} className={`heat-card ${heat.status}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-condensed text-xs uppercase tracking-wider text-white/40">
                        Heat #{heat.number}
                      </span>
                      <span className={`font-condensed text-xs uppercase tracking-wider ${
                        heat.status === 'active' ? 'text-green-400' :
                        heat.status === 'completed' ? 'text-orange-400' :
                        heat.status === 'skipped' ? 'text-white/20' :
                        'text-white/30'
                      }`}>
                        {heat.status}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {heat.lanes.map((lane) => {
                        const racer = lane.racerId ? racerMap[lane.racerId] : null
                        const isSwapFirst = swapFirst?.heatId === heat.id && swapFirst?.lane === lane.lane
                        return (
                          <div
                            key={lane.lane}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer hover:bg-white/5 ${isSwapFirst ? 'bg-orange-900/30 ring-1 ring-orange-500' : ''}`}
                            onClick={() => racer && handleLaneClick(heat.id, lane.lane)}
                          >
                            <span className="font-condensed text-xs text-white/30 w-4">L{lane.lane}</span>
                            {racer ? (
                              <>
                                <span className="font-condensed text-xs bg-white/10 px-1.5 py-0.5 rounded">{racer.carNumber || '#?'}</span>
                                <span className="flex-1 truncate">{racer.name}</span>
                              </>
                            ) : (
                              <span className="text-white/20 text-xs">
                                {lane.racerId ? 'Unknown' : 'TBD'}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="font-display text-4xl text-white/10 mb-4">🏁</div>
          <div className="font-display text-2xl text-white/20 tracking-widest">NO BRACKET YET</div>
          <div className="text-sm text-white/20 mt-2">
            Add racers and click Generate Bracket.
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 5: Race Management
// ══════════════════════════════════════════════════════════════════════════
function RaceManagementTab({ toast }) {
  const [bracket, setBracket] = useState(null)
  const [racers, setRacers] = useState([])
  const [resultForm, setResultForm] = useState({}) // { lane: { time, place } }
  const [activeHeatId, setActiveHeatId] = useState(null)

  const load = async () => {
    const [b, r] = await Promise.all([
      api.get('/api/bracket').catch(() => null),
      api.get('/api/racers').catch(() => []),
    ])
    setBracket(b); setRacers(r)
    if (b) {
      for (const round of b.rounds) {
        const active = round.heats.find((h) => h.status === 'active')
        if (active) { setActiveHeatId(active.id); break }
      }
    }
  }
  useEffect(() => { load() }, [])

  const racerMap = Object.fromEntries(racers.map((r) => [r.id, r]))

  function allHeats() {
    if (!bracket) return []
    return bracket.rounds.flatMap((r) => r.heats)
  }

  const activeHeat = allHeats().find((h) => h.id === activeHeatId) ||
    allHeats().find((h) => h.status === 'active') ||
    allHeats().find((h) => h.status === 'pending')
  const pendingHeats = allHeats().filter((h) => h.status === 'pending')
  const completedHeats = allHeats().filter((h) => h.status === 'completed').slice(-5).reverse()

  async function startHeat(heatId) {
    try {
      await api.post(`/api/heats/${heatId}/start`, {})
      setActiveHeatId(heatId)
      setResultForm({})
      load(); toast.show('Heat started!', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function recordResult(heat) {
    const runs = heat.lanes
      .filter((l) => l.racerId)
      .map((l) => {
        const f = resultForm[l.lane] || {}
        return {
          lane: l.lane,
          time: f.time ? parseFloat(f.time) : null,
          place: f.place ? parseInt(f.place) : null,
        }
      })
    try {
      await api.post(`/api/heats/${heat.id}/result`, { runs })
      setResultForm({}); load(); toast.show('Result recorded!', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function rerunHeat(heatId) {
    try {
      await api.post(`/api/heats/${heatId}/rerun`, {})
      load(); toast.show('Heat reset for re-run', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function skipHeat(heatId) {
    try {
      await api.post(`/api/heats/${heatId}/skip`, {})
      load(); toast.show('Heat skipped', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  if (!bracket) {
    return <div className="card text-center py-16 text-white/20">No bracket generated yet. Go to the Bracket tab first.</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Active Heat */}
      <div className="lg:col-span-2 space-y-4">
        {activeHeat ? (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-condensed text-xs uppercase tracking-widest text-white/30">Current Heat</div>
                <div className="font-display text-2xl tracking-wider">Heat #{activeHeat.number}</div>
              </div>
              <span className={`font-condensed text-sm uppercase tracking-wider px-3 py-1 rounded-full border ${
                activeHeat.status === 'active' ? 'border-green-700 text-green-400' :
                activeHeat.status === 'completed' ? 'border-orange-700 text-orange-400' :
                'border-white/10 text-white/30'
              }`}>
                {activeHeat.status}
              </span>
            </div>

            {/* Lane assignments */}
            <div className="space-y-2 mb-5">
              {activeHeat.lanes.map((lane) => {
                const racer = lane.racerId ? racerMap[lane.racerId] : null
                return (
                  <div key={lane.lane} className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/5">
                    <span className="font-condensed text-sm text-white/40 w-6">L{lane.lane}</span>
                    {racer ? (
                      <>
                        <span className="font-condensed text-sm bg-white/10 px-2 py-0.5 rounded">{racer.carNumber || '#?'}</span>
                        <span className="flex-1 font-semibold">{racer.name}</span>
                        {racer.carName && <span className="text-white/30 text-sm">{racer.carName}</span>}
                      </>
                    ) : (
                      <span className="text-white/20 text-sm">Empty lane</span>
                    )}

                    {/* Result inputs */}
                    {(activeHeat.status === 'active' || activeHeat.status === 'pending') && racer && (
                      <div className="flex gap-2 ml-auto">
                        <div className="text-right">
                          <div className="font-condensed text-xs text-white/30 mb-1">Time (s)</div>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="3.456"
                            style={{ width: '90px' }}
                            value={resultForm[lane.lane]?.time || ''}
                            onChange={(e) => setResultForm((f) => ({ ...f, [lane.lane]: { ...f[lane.lane], time: e.target.value } }))}
                          />
                        </div>
                        <div className="text-right">
                          <div className="font-condensed text-xs text-white/30 mb-1">Place</div>
                          <select
                            style={{ width: '65px' }}
                            value={resultForm[lane.lane]?.place || ''}
                            onChange={(e) => setResultForm((f) => ({ ...f, [lane.lane]: { ...f[lane.lane], place: e.target.value } }))}
                          >
                            <option value="">—</option>
                            {activeHeat.lanes.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {activeHeat.status === 'pending' && (
                <button className="btn btn-success" onClick={() => startHeat(activeHeat.id)}>▶ Start Heat</button>
              )}
              {(activeHeat.status === 'active' || activeHeat.status === 'pending') && (
                <button className="btn btn-primary" onClick={() => recordResult(activeHeat)}>✓ Record Result</button>
              )}
              {activeHeat.status === 'completed' && (
                <button className="btn btn-secondary" onClick={() => rerunHeat(activeHeat.id)}>↺ Re-run</button>
              )}
              {activeHeat.status !== 'completed' && (
                <button className="btn btn-secondary" onClick={() => skipHeat(activeHeat.id)}>⏭ Skip</button>
              )}
            </div>
          </div>
        ) : (
          <div className="card text-center py-12 text-white/20">
            All heats are complete!
          </div>
        )}

        {/* Recent Results */}
        {completedHeats.length > 0 && (
          <div className="card">
            <div className="font-condensed text-xs uppercase tracking-widest text-white/30 mb-3">Recent Results</div>
            <div className="space-y-2">
              {completedHeats.map((heat) => (
                <div key={heat.id} className="flex items-center gap-3 p-2 rounded bg-white/3 text-sm">
                  <span className="font-condensed text-xs text-white/30 w-14">Heat #{heat.number}</span>
                  <div className="flex gap-2 flex-wrap flex-1">
                    {(heat.result?.runs || [])
                      .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                      .map((run) => {
                        const l = heat.lanes.find((x) => x.lane === run.lane)
                        const r = l?.racerId ? racerMap[l.racerId] : null
                        return (
                          <span key={run.lane} className="font-condensed text-xs px-2 py-0.5 rounded bg-white/10">
                            {run.place ? `${run.place}.` : ''} {r?.name || `L${run.lane}`}
                            {run.time ? ` (${run.time.toFixed(3)}s)` : ''}
                          </span>
                        )
                      })
                    }
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => rerunHeat(heat.id)}>↺</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Heat Queue */}
      <div className="space-y-3">
        <div className="font-condensed text-xs uppercase tracking-widest text-white/30">
          Queue ({pendingHeats.length} remaining)
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {pendingHeats.slice(0, 20).map((heat) => (
            <div
              key={heat.id}
              className={`heat-card pending cursor-pointer hover:border-white/20 ${activeHeat?.id === heat.id ? 'selected' : ''}`}
              onClick={() => setActiveHeatId(heat.id)}
            >
              <div className="font-condensed text-xs text-white/30 mb-1">Heat #{heat.number}</div>
              <div className="space-y-0.5">
                {heat.lanes.filter((l) => l.racerId).map((l) => {
                  const r = racerMap[l.racerId]
                  return (
                    <div key={l.lane} className="flex gap-1.5 items-center text-xs">
                      <span className="text-white/20">L{l.lane}</span>
                      <span>{r?.name || '?'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {pendingHeats.length === 0 && (
            <div className="text-center py-4 text-white/20 text-sm">No pending heats</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 6: Leaderboard
// ══════════════════════════════════════════════════════════════════════════
function LeaderboardTab({ toast }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [divisions, setDivisions] = useState([])
  const [filterDiv, setFilterDiv] = useState('')

  const load = async () => {
    const [lb, divs] = await Promise.all([
      api.get('/api/leaderboard').catch(() => []),
      api.get('/api/divisions').catch(() => []),
    ])
    setLeaderboard(lb); setDivisions(divs)
  }
  useEffect(() => { load() }, [])

  const filtered = filterDiv
    ? leaderboard.filter((e) => e.division === filterDiv)
    : leaderboard

  async function exportCsv() {
    window.location.href = '/api/export/csv'
  }

  const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} style={{ width: 'auto', minWidth: '160px' }}>
          <option value="">All Divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={load}>↺ Refresh</button>
        <button className="btn btn-primary" onClick={exportCsv}>⬇ Export CSV</button>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16 text-white/20">
          No results yet. Race some heats first!
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Rank', 'Car #', 'Name', 'Car Name', 'Division', 'Points', 'Wins', 'Heats', 'Best Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-condensed text-xs uppercase tracking-wider text-white/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const div = entry.division ? divMap[entry.division] : null
                return (
                  <tr key={entry.racerId} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/2'}`}>
                    <td className="px-4 py-3">
                      <span className={`font-display text-xl ${
                        entry.rank === 1 ? 'text-yellow-400' :
                        entry.rank === 2 ? 'text-gray-300' :
                        entry.rank === 3 ? 'text-amber-600' :
                        'text-white/40'
                      }`}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-condensed">{entry.carNumber || '—'}</td>
                    <td className="px-4 py-3 font-semibold">{entry.name}</td>
                    <td className="px-4 py-3 text-white/50">{entry.carName || '—'}</td>
                    <td className="px-4 py-3">
                      {div ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: div.color }} />
                          <span className="font-condensed text-xs">{div.name}</span>
                        </span>
                      ) : <span className="text-white/20">—</span>}
                    </td>
                    <td className="px-4 py-3 font-display text-lg text-orange-400">{entry.points}</td>
                    <td className="px-4 py-3 text-white/60">{entry.wins}</td>
                    <td className="px-4 py-3 text-white/60">{entry.heatsRaced}</td>
                    <td className="px-4 py-3 font-condensed">
                      {entry.bestTime != null ? (
                        <span className="text-green-400">{entry.bestTime.toFixed(3)}s</span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'setup', label: 'Event Setup' },
  { id: 'racers', label: 'Racers' },
  { id: 'divisions', label: 'Divisions' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'race', label: 'Race Manager' },
  { id: 'leaderboard', label: 'Leaderboard' },
]

export default function App() {
  const [tab, setTab] = useState('setup')
  const [eventName, setEventName] = useState('')
  const toast = useToast()

  useEffect(() => {
    api.get('/api/event').then((e) => e.name && setEventName(e.name)).catch(() => {})
  }, [tab])

  function renderTab() {
    switch (tab) {
      case 'setup': return <EventSetupTab toast={toast} />
      case 'racers': return <RacersTab toast={toast} />
      case 'divisions': return <DivisionsTab toast={toast} />
      case 'bracket': return <BracketTab toast={toast} />
      case 'race': return <RaceManagementTab toast={toast} />
      case 'leaderboard': return <LeaderboardTab toast={toast} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Toasts toasts={toast.toasts} />

      {/* Header */}
      <header className="bg-black/50 border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div>
          <div className="font-display text-3xl tracking-widest leading-none text-white">
            DERBY ADMIN
          </div>
          {eventName && (
            <div className="font-condensed text-xs tracking-widest uppercase text-orange-400/70 mt-0.5">
              {eventName}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="font-condensed text-xs uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors">Guest Display</a>
          <a href="/manage" className="font-condensed text-xs uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors">Track Manager</a>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-black/30 border-b border-white/5 px-6 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-condensed text-sm uppercase tracking-wider py-3 px-4 transition-colors whitespace-nowrap ${
              tab === t.id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 p-6 overflow-x-auto">
        {renderTab()}
      </main>
    </div>
  )
}

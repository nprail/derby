import { useState, useEffect, useCallback } from 'react'

// ── API helpers ──────────────────────────────────────────────────────────────
function getAdminCode() { return localStorage.getItem('derby_admin_code') || '' }

async function apiFetch(url, opts = {}) {
  const code = getAdminCode()
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (code) headers['X-Admin-Code'] = code
  const res = await fetch(url, { ...opts, headers })
  let data
  try { data = await res.json() } catch (e) { data = {} }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`)
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
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return { toasts, show }
}

function Toasts({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`font-condensed text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 ${
            t.type === 'error' ? 'bg-red-900 text-red-100 border border-red-700' :
            t.type === 'success' ? 'bg-green-900 text-green-100 border border-green-700' :
            'bg-gray-900 text-gray-100 border border-white/10'
          }`}
        >
          <span>{t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ'}</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="card max-w-sm w-full mx-4 shadow-2xl">
        <div className="font-display text-xl tracking-wider mb-2">Are you sure?</div>
        <div className="text-sm text-white/60 mb-5 leading-relaxed">{state.msg}</div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={() => { state.resolve(false); setState(null) }}>Cancel</button>
          <button className="btn btn-danger" onClick={() => { state.resolve(true); setState(null) }}>Confirm</button>
        </div>
      </div>
    </div>
  ) : null
  return { confirm, dialog }
}

// ── Shared UI pieces ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full spin" />
    </div>
  )
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-white/5 mb-4">
      {icon && <span className="text-xl">{icon}</span>}
      <div>
        <div className="font-display text-lg tracking-wider text-white/90">{title}</div>
        {subtitle && <div className="text-xs text-white/30 font-condensed mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center py-14">
      <div className="text-5xl mb-4 opacity-20">{icon || '📭'}</div>
      <div className="font-display text-xl text-white/20 tracking-widest uppercase">{title}</div>
      {subtitle && <div className="text-sm text-white/20 mt-2 max-w-xs mx-auto leading-relaxed">{subtitle}</div>}
    </div>
  )
}

function PageTitle({ children }) {
  return <div className="font-display text-3xl tracking-wider mb-5">{children}</div>
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

  useEffect(() => { api.get('/api/event').then(setForm).catch(() => {}) }, [])

  if (!form) return <Spinner />

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function save() {
    setLoading(true)
    try {
      await api.post('/api/event', form)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
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

  const STATUS_STYLE = {
    setup:            'bg-white/5 text-white/40 border-white/10',
    registration:     'bg-blue-900/40 text-blue-300 border-blue-800/60',
    bracketGenerated: 'bg-orange-900/40 text-orange-300 border-orange-800/60',
    racing:           'bg-green-900/40 text-green-300 border-green-800/60',
    complete:         'bg-yellow-900/40 text-yellow-300 border-yellow-800/60',
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <PageTitle>Event Setup</PageTitle>
        <span className={`font-condensed text-xs uppercase tracking-widest px-3 py-1 rounded-full border mb-5 ${STATUS_STYLE[form.status] || 'bg-white/5 text-white/30 border-white/10'}`}>
          {form.status}
        </span>
      </div>

      <div className="card space-y-5">
        <SectionHeader icon="🏁" title="Event Details" />
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
              <option value="roundRobin">Round Robin</option>
              <option value="singleElim">Single Elimination</option>
              <option value="doubleElim">Double Elimination</option>
              <option value="points">Points-Based</option>
            </select>
          </div>
          <div>
            <label className="label">Division Mode</label>
            <select value={form.divisionMode} onChange={(e) => set('divisionMode', e.target.value)}>
              <option value="none">None (All Together)</option>
              <option value="separate">Separate Divisions</option>
              <option value="shared">Shared Track</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Lanes Per Heat</label>
            <select value={form.lanesPerHeat} onChange={(e) => set('lanesPerHeat', Number(e.target.value))}>
              {[2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n} lanes</option>)}
            </select>
          </div>
          <div>
            <label className="label">Runs Per Heat</label>
            <select value={form.runsPerHeat} onChange={(e) => set('runsPerHeat', Number(e.target.value))}>
              {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n} run{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Heat Winner Logic</label>
            <select value={form.heatWinnerLogic} onChange={(e) => set('heatWinnerLogic', e.target.value)}>
              <option value="fastestRun">Fastest Run</option>
              <option value="bestAvg">Best Average</option>
              <option value="points">Points</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Tiebreaker</label>
            <select value={form.tiebreakerRule} onChange={(e) => set('tiebreakerRule', e.target.value)}>
              <option value="fastestRun">Fastest Run</option>
              <option value="headToHead">Head to Head</option>
              <option value="coinFlip">Coin Flip</option>
              <option value="none">None</option>
            </select>
          </div>
          <div>
            <label className="label">Points Table</label>
            <select value={form.pointsTable} onChange={(e) => set('pointsTable', e.target.value)}>
              <option value="standard">Standard (10-7-5-3-2-1)</option>
              <option value="generous">Generous (12-10-8-6-4-2)</option>
              <option value="participation">Participation (5-4-3-2-1-1)</option>
              <option value="winnerTakeAll">Winner Take All</option>
            </select>
          </div>
          <div>
            <label className="label">Guest Display</label>
            <select value={form.bracketVisibility} onChange={(e) => set('bracketVisibility', e.target.value)}>
              <option value="leaderboardOnly">Leaderboard Only</option>
              <option value="currentHeat">Current Heat</option>
              <option value="fullBracket">Full Bracket</option>
            </select>
          </div>
        </div>
        <div className="pt-1">
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '…' : saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <SectionHeader icon="🔐" title="Access Codes" subtitle="Leave blank to allow open access. Codes are stored on the server." />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Admin Code</label>
            <input type="password" placeholder="Set admin code…" value={codes.adminCode}
              onChange={(e) => setCodes((c) => ({ ...c, adminCode: e.target.value }))} />
          </div>
          <div>
            <label className="label">Track Official Code</label>
            <input type="password" placeholder="Set track official code…" value={codes.trackOfficialCode}
              onChange={(e) => setCodes((c) => ({ ...c, trackOfficialCode: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-secondary" onClick={saveCodes}>Update Access Codes</button>
      </div>

      <div className="card space-y-3">
        <SectionHeader icon="🖥️" title="Your Browser Admin Code"
          subtitle="Stored in localStorage. Required for admin API calls from this browser." />
        <div className="flex gap-2">
          <input type="password" value={adminCodeInput}
            onChange={(e) => setAdminCodeInput(e.target.value)} placeholder="Enter your admin code…" />
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
  const [search, setSearch] = useState('')
  const { confirm, dialog } = useConfirm()

  const load = () => {
    api.get('/api/racers').then((r) => setRacers(Array.isArray(r) ? r : [])).catch(() => {})
    api.get('/api/divisions').then((d) => setDivisions(Array.isArray(d) ? d : [])).catch(() => {})
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
    setEditForm({ name: r.name, carName: r.carName || '', carNumber: r.carNumber || '',
      division: r.division || '', seed: r.seed ?? '', notes: r.notes || '' })
  }

  const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]))
  const filtered = search
    ? racers.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.carName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.carNumber || '').includes(search))
    : racers
  const activeCount = racers.filter((r) => r.active !== false).length

  return (
    <div className="space-y-5">
      {dialog}
      <div className="flex items-center gap-3 flex-wrap">
        <PageTitle>Racers</PageTitle>
        <div className="flex gap-2 mb-5">
          <span className="font-condensed text-xs px-2.5 py-1 rounded-full bg-green-900/30 border border-green-800/50 text-green-400">
            {activeCount} active
          </span>
          <span className="font-condensed text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">
            {racers.length} total
          </span>
        </div>
      </div>

      <div className="card">
        <SectionHeader icon="➕" title="Add Racer" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div><label className="label">Name *</label><input placeholder="Racer name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Car Name</label><input placeholder="Lightning McQueen" value={form.carName} onChange={(e) => setForm((f) => ({ ...f, carName: e.target.value }))} /></div>
          <div><label className="label">Car #</label><input placeholder="42" value={form.carNumber} onChange={(e) => setForm((f) => ({ ...f, carNumber: e.target.value }))} /></div>
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

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3">
          <input
            className="search-input"
            placeholder="Search by name, car or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="ml-auto font-condensed text-xs uppercase tracking-widest text-white/25">
            {filtered.length} racer{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="👥" title={racers.length === 0 ? 'No racers yet' : 'No match'}
            subtitle={racers.length === 0 ? 'Add some racers above to get started.' : 'Try a different search.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Car #', 'Name', 'Car Name', 'Division', 'Seed', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-condensed text-xs uppercase tracking-wider text-white/25">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const div = divMap[r.division]
                  if (editId === r.id) {
                    return (
                      <tr key={r.id} className="border-b border-white/5 bg-white/5">
                        <td className="px-2 py-1.5"><input value={editForm.carNumber} onChange={(e) => setEditForm((f) => ({ ...f, carNumber: e.target.value }))} /></td>
                        <td className="px-2 py-1.5"><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></td>
                        <td className="px-2 py-1.5"><input value={editForm.carName} onChange={(e) => setEditForm((f) => ({ ...f, carName: e.target.value }))} /></td>
                        <td className="px-2 py-1.5">
                          <select value={editForm.division} onChange={(e) => setEditForm((f) => ({ ...f, division: e.target.value }))}>
                            <option value="">—</option>
                            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><input type="number" value={editForm.seed} onChange={(e) => setEditForm((f) => ({ ...f, seed: e.target.value }))} /></td>
                        <td className="px-2 py-1.5" colSpan={2}>
                          <div className="flex gap-2">
                            <button className="btn btn-success" onClick={() => saveEdit(r.id)}>Save</button>
                            <button className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={r.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${!r.active ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3">
                        {r.carNumber
                          ? <span className="font-display text-base bg-orange-500/10 border border-orange-500/25 text-orange-400 px-2 py-0.5 rounded-md">#{r.carNumber}</span>
                          : <span className="text-white/20">—</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold">{r.name}</td>
                      <td className="px-4 py-3 text-white/50">{r.carName || '—'}</td>
                      <td className="px-4 py-3">
                        {div
                          ? <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: div.color }} />
                              <span className="font-condensed text-xs">{div.name}</span>
                            </span>
                          : <span className="text-white/20">—</span>}
                      </td>
                      <td className="px-4 py-3 text-white/40 font-condensed">{r.seed ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          className={`font-condensed text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            r.active !== false
                              ? 'border-green-700 text-green-400 hover:bg-green-900/20'
                              : 'border-white/10 text-white/30 hover:bg-white/5'
                          }`}
                          onClick={() => toggleActive(r)}
                        >
                          {r.active !== false ? '● Active' : '○ Withdrawn'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => startEdit(r)}>Edit</button>
                          <button className="btn btn-danger" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => deleteRacer(r.id)}>✕</button>
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

  const load = () => api.get('/api/divisions').then((d) => setDivisions(Array.isArray(d) ? d : [])).catch(() => {})
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
    const ok = await confirm('Delete this division? Racers assigned to it will be unassigned.')
    if (!ok) return
    try {
      await api.del(`/api/divisions/${id}`)
      load(); toast.show('Division removed', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  return (
    <div className="max-w-xl space-y-5">
      {dialog}
      <PageTitle>Divisions</PageTitle>

      <div className="card space-y-4">
        <SectionHeader icon="🏷️" title="Add Division" />
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Name *</label><input placeholder="Tigers" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div>
            <label className="label">Color</label>
            <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              style={{ padding: '3px', height: '36px' }} />
          </div>
          <div><label className="label">Description</label><input placeholder="Ages 8-10" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <button className="btn btn-primary" onClick={add}>+ Add Division</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <span className="font-condensed text-xs uppercase tracking-widest text-white/30">
            {divisions.length} Division{divisions.length !== 1 ? 's' : ''}
          </span>
        </div>
        {divisions.length === 0
          ? <EmptyState icon="🏷️" title="No divisions yet" subtitle="Add divisions to group your racers by age or category." />
          : (
            <div>
              {divisions.map((d, i) => (
                <div key={d.id} className={`px-5 py-4 ${i < divisions.length - 1 ? 'border-b border-white/5' : ''}`}>
                  {editId === d.id ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <input type="color" value={editForm.color} onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                        style={{ padding: '2px', height: '34px', width: '44px', flexShrink: 0 }} />
                      <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={{ flex: 1, minWidth: '100px' }} />
                      <input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Description" style={{ flex: 2, minWidth: '120px' }} />
                      <button className="btn btn-success whitespace-nowrap" onClick={() => saveEdit(d.id)}>Save</button>
                      <button className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 shadow-lg" style={{ background: d.color }} />
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{d.name}</div>
                        {d.description && <div className="text-white/35 text-xs mt-0.5">{d.description}</div>}
                      </div>
                      <div className="flex gap-1.5">
                        <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '12px' }}
                          onClick={() => { setEditId(d.id); setEditForm({ name: d.name, color: d.color, description: d.description }) }}>
                          Edit
                        </button>
                        <button className="btn btn-danger" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => del(d.id)}>✕</button>
                      </div>
                    </div>
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
  const [swapFirst, setSwapFirst] = useState(null)
  const { confirm, dialog } = useConfirm()

  const load = async () => {
    const [b, r, e] = await Promise.all([
      api.get('/api/bracket').catch(() => null),
      api.get('/api/racers').catch(() => []),
      api.get('/api/event').catch(() => ({})),
    ])
    // Validate bracket structure before storing
    setBracket(b && Array.isArray(b.rounds) ? b : null)
    setRacers(Array.isArray(r) ? r : [])
    setEvent(e || {})
  }
  useEffect(() => { load() }, [])

  const racerMap = Object.fromEntries(racers.map((r) => [r.id, r]))
  const activeRacers = racers.filter((r) => r.active !== false)
  const rounds = Array.isArray(bracket?.rounds) ? bracket.rounds : []

  const totalHeats = rounds.reduce((acc, r) => acc + (r.heats?.length ?? 0), 0)
  const completedCount = rounds.reduce((acc, r) => acc + (r.heats?.filter((h) => h.status === 'completed').length ?? 0), 0)
  const progress = totalHeats > 0 ? Math.round((completedCount / totalHeats) * 100) : 0

  async function generate() {
    setLoading(true)
    try {
      const b = await api.post('/api/bracket/generate', {})
      if (b && Array.isArray(b.rounds)) {
        setBracket(b)
        setEvent((e) => e ? { ...e, status: 'bracketGenerated' } : e)
        toast.show('Bracket generated!', 'success')
      } else {
        toast.show('Bracket generated — reloading…', 'info')
        await load()
      }
    } catch (e) { toast.show(e.message, 'error') }
    setLoading(false)
  }

  async function regenerate() {
    const ok = await confirm('Discard current bracket and regenerate? This will clear all heat results.')
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
      toast.show('Select another lane to swap with', 'info')
    } else {
      if (swapFirst.heatId === heatId && swapFirst.lane === lane) { setSwapFirst(null); return }
      api.post('/api/bracket/swap', {
        heat1Id: swapFirst.heatId, lane1: swapFirst.lane,
        heat2Id: heatId, lane2: lane,
      })
        .then(() => { setSwapFirst(null); load(); toast.show('Swapped!', 'success') })
        .catch((e) => { setSwapFirst(null); toast.show(e.message, 'error') })
    }
  }

  return (
    <div className="space-y-5">
      {dialog}

      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageTitle>Bracket</PageTitle>
        <div className="flex flex-wrap gap-2 items-center mb-5">
          {activeRacers.length < 2 && !bracket && (
            <span className="font-condensed text-xs text-amber-400/70 bg-amber-900/20 border border-amber-800/40 px-3 py-1.5 rounded-full">
              Need ≥2 active racers
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={generate}
            disabled={loading || activeRacers.length < 2 || event?.bracketLocked}
          >
            {loading ? '…' : bracket ? '⟳ Regenerate' : '✦ Generate Bracket'}
          </button>
          {bracket && (
            <>
              <button className="btn btn-secondary" onClick={regenerate} disabled={event?.bracketLocked}>
                Clear &amp; Reset
              </button>
              <button className={`btn ${event?.bracketLocked ? 'btn-secondary' : 'btn-danger'}`} onClick={toggleLock}>
                {event?.bracketLocked ? '🔓 Unlock' : '🔒 Lock'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Swap mode banner */}
      {swapFirst && (
        <div className="bg-orange-900/25 border border-orange-700/40 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-orange-400 text-lg">⟳</span>
          <span className="font-condensed text-sm text-orange-300 uppercase tracking-wide">
            Swap mode — click another racer lane to swap positions
          </span>
          <button className="ml-auto font-condensed text-xs text-orange-400/50 hover:text-orange-400 transition-colors" onClick={() => setSwapFirst(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Progress bar */}
      {totalHeats > 0 && (
        <div className="card py-3 px-5">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-700 to-orange-400 transition-all duration-700 rounded-full"
                style={{ width: `${progress}%` }} />
            </div>
            <span className="font-condensed text-xs text-white/40 whitespace-nowrap">
              {completedCount} / {totalHeats} heats · {progress}%
            </span>
          </div>
        </div>
      )}

      {/* Rounds */}
      {rounds.length > 0 ? (
        <div className="space-y-7">
          {rounds.map((round) => {
            const roundHeats = Array.isArray(round.heats) ? round.heats : []
            const roundDone = roundHeats.filter((h) => h.status === 'completed').length
            return (
              <div key={round.id}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="font-display text-xl tracking-wider text-white/70">{round.name}</div>
                  {round.bracket && (
                    <span className="font-condensed text-xs bg-white/5 border border-white/8 px-2 py-0.5 rounded text-white/30 uppercase tracking-wider">
                      {round.bracket}
                    </span>
                  )}
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="font-condensed text-xs text-white/25">
                    {roundDone}/{roundHeats.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {roundHeats.map((heat) => {
                    const heatLanes = Array.isArray(heat.lanes) ? heat.lanes : []
                    return (
                      <div key={heat.id} className={`heat-card ${heat.status}`}>
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="font-condensed text-xs font-semibold text-white/50 uppercase tracking-wider">
                            Heat #{heat.number}
                          </span>
                          <span className={`font-condensed text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            heat.status === 'active'    ? 'bg-green-900/50 text-green-400' :
                            heat.status === 'completed' ? 'bg-orange-900/40 text-orange-400' :
                            heat.status === 'skipped'   ? 'bg-white/5 text-white/20' :
                            'bg-white/4 text-white/30'
                          }`}>
                            {heat.status}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {heatLanes.map((lane) => {
                            const racer = lane.racerId ? racerMap[lane.racerId] : null
                            const isSwapFirst = swapFirst?.heatId === heat.id && swapFirst?.lane === lane.lane
                            const winner = heat.result?.runs?.find((r) => r.lane === lane.lane && r.place === 1)
                            return (
                              <div
                                key={lane.lane}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                                  racer && !event?.bracketLocked ? 'cursor-pointer hover:bg-white/8' : ''
                                } ${isSwapFirst ? 'bg-orange-900/40 ring-1 ring-orange-500/50' : ''}`}
                                onClick={() => racer && handleLaneClick(heat.id, lane.lane)}
                              >
                                <span className="font-condensed text-xs text-white/25 w-5 flex-shrink-0">L{lane.lane}</span>
                                {racer ? (
                                  <>
                                    {racer.carNumber && (
                                      <span className="font-condensed text-xs bg-orange-500/12 text-orange-400/70 px-1.5 py-0.5 rounded">
                                        #{racer.carNumber}
                                      </span>
                                    )}
                                    <span className="flex-1 truncate text-sm text-white/80">{racer.name}</span>
                                    {winner && <span className="text-yellow-400 text-xs flex-shrink-0">🥇</span>}
                                  </>
                                ) : (
                                  <span className="text-white/15 text-xs italic">
                                    {lane.racerId === null ? 'BYE' : lane.racerId ? 'Unknown' : 'TBD'}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="🏁"
            title="No bracket yet"
            subtitle={activeRacers.length < 2
              ? 'Add at least 2 active racers, then click Generate Bracket.'
              : 'Click Generate Bracket to create the schedule.'}
          />
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
  const [resultForm, setResultForm] = useState({})
  const [activeHeatId, setActiveHeatId] = useState(null)

  const load = async () => {
    const [b, r] = await Promise.all([
      api.get('/api/bracket').catch(() => null),
      api.get('/api/racers').catch(() => []),
    ])
    const validBracket = b && Array.isArray(b.rounds) ? b : null
    setBracket(validBracket)
    setRacers(Array.isArray(r) ? r : [])
    if (validBracket) {
      for (const round of validBracket.rounds) {
        const active = (round.heats || []).find((h) => h.status === 'active')
        if (active) { setActiveHeatId(active.id); break }
      }
    }
  }
  useEffect(() => { load() }, [])

  const racerMap = Object.fromEntries(racers.map((r) => [r.id, r]))

  function allHeats() {
    if (!bracket || !Array.isArray(bracket.rounds)) return []
    return bracket.rounds.flatMap((r) => Array.isArray(r.heats) ? r.heats : [])
  }

  const heats = allHeats()
  const activeHeat = heats.find((h) => h.id === activeHeatId)
    || heats.find((h) => h.status === 'active')
    || heats.find((h) => h.status === 'pending')
  const pendingHeats = heats.filter((h) => h.status === 'pending')
  const completedHeats = heats.filter((h) => h.status === 'completed').slice(-5).reverse()
  const completedHeatCount = heats.filter((h) => h.status === 'completed').length
  const progressPct = heats.length ? Math.round((completedHeatCount / heats.length) * 100) : 0

  async function startHeat(heatId) {
    try {
      await api.post(`/api/heats/${heatId}/start`, {})
      setActiveHeatId(heatId); setResultForm({})
      load(); toast.show('Heat started!', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function recordResult(heat) {
    const runs = (heat.lanes || [])
      .filter((l) => l.racerId)
      .map((l) => {
        const f = resultForm[l.lane] || {}
        return { lane: l.lane, time: f.time ? parseFloat(f.time) : null, place: f.place ? parseInt(f.place) : null }
      })
    try {
      await api.post(`/api/heats/${heat.id}/result`, { runs })
      setResultForm({}); load(); toast.show('Result recorded!', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  async function rerunHeat(heatId) {
    try { await api.post(`/api/heats/${heatId}/rerun`, {}); load(); toast.show('Heat reset for re-run', 'success') }
    catch (e) { toast.show(e.message, 'error') }
  }

  async function skipHeat(heatId) {
    try { await api.post(`/api/heats/${heatId}/skip`, {}); load(); toast.show('Heat skipped', 'success') }
    catch (e) { toast.show(e.message, 'error') }
  }

  if (!bracket) {
    return (
      <div className="card">
        <EmptyState icon="🗓️" title="No bracket" subtitle="Generate a bracket from the Bracket tab first." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PageTitle>Race Manager</PageTitle>
        <div className="flex gap-2 mb-5">
          <span className="font-condensed text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/35">
            {pendingHeats.length} pending
          </span>
          <span className="font-condensed text-xs px-2.5 py-1 rounded-full bg-green-900/25 border border-green-800/40 text-green-400">
            {completedHeatCount} done
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="card py-3 px-5">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-white/5 rounded-full h-2.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-orange-700 to-orange-400 transition-all duration-700 rounded-full"
              style={{ width: `${progressPct}%` }} />
          </div>
          <span className="font-condensed text-xs text-white/40 whitespace-nowrap">
            {completedHeatCount} / {heats.length} heats
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Active Heat panel */}
        <div className="lg:col-span-2 space-y-4">
          {activeHeat ? (
            <div className={`card ${activeHeat.status === 'active' ? 'border-green-800/50' : ''}`}
              style={activeHeat.status === 'active' ? { background: 'linear-gradient(135deg, #0a160a, #12121c)' } : {}}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-condensed text-[11px] uppercase tracking-widest text-white/30 mb-1">
                    {activeHeat.status === 'active' ? '▶ NOW RACING' :
                     activeHeat.status === 'completed' ? '✓ COMPLETED' : 'NEXT UP'}
                  </div>
                  <div className="font-display text-4xl tracking-wider leading-none">Heat #{activeHeat.number}</div>
                </div>
                <span className={`font-condensed text-xs uppercase tracking-wider px-3 py-1.5 rounded-full border ${
                  activeHeat.status === 'active'    ? 'border-green-700 text-green-400 bg-green-900/20' :
                  activeHeat.status === 'completed' ? 'border-orange-700 text-orange-400 bg-orange-900/20' :
                  'border-white/10 text-white/30'
                }`}>
                  {activeHeat.status}
                </span>
              </div>

              <div className="space-y-2 mb-5">
                {(activeHeat.lanes || []).map((lane) => {
                  const racer = lane.racerId ? racerMap[lane.racerId] : null
                  const showInputs = (activeHeat.status === 'active' || activeHeat.status === 'pending') && racer
                  return (
                    <div key={lane.lane} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
                      <span className="font-condensed text-sm text-white/30 w-7 flex-shrink-0">L{lane.lane}</span>
                      {racer ? (
                        <>
                          {racer.carNumber && (
                            <span className="font-condensed text-sm bg-orange-500/12 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded flex-shrink-0">
                              #{racer.carNumber}
                            </span>
                          )}
                          <span className="flex-1 font-semibold min-w-0 truncate">{racer.name}</span>
                          {racer.carName && <span className="text-white/25 text-xs hidden sm:block flex-shrink-0">{racer.carName}</span>}
                        </>
                      ) : (
                        <span className="text-white/20 text-sm flex-1">Empty lane</span>
                      )}
                      {showInputs && (
                        <div className="flex gap-2 ml-auto flex-shrink-0">
                          <div>
                            <div className="font-condensed text-[10px] text-white/30 mb-1 text-right">TIME (s)</div>
                            <input
                              type="number" step="0.001" min="0" placeholder="3.456"
                              style={{ width: '86px', textAlign: 'right' }}
                              value={resultForm[lane.lane]?.time || ''}
                              onChange={(e) => setResultForm((f) => ({ ...f, [lane.lane]: { ...f[lane.lane], time: e.target.value } }))}
                            />
                          </div>
                          <div>
                            <div className="font-condensed text-[10px] text-white/30 mb-1 text-right">PLACE</div>
                            <select
                              style={{ width: '62px' }}
                              value={resultForm[lane.lane]?.place || ''}
                              onChange={(e) => setResultForm((f) => ({ ...f, [lane.lane]: { ...f[lane.lane], place: e.target.value } }))}
                            >
                              <option value="">—</option>
                              {Array.from({ length: (activeHeat.lanes || []).filter((l) => l.racerId).length }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{i + 1}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2 flex-wrap pt-3 border-t border-white/5">
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
            <div className="card">
              <EmptyState icon="🏆" title="All heats complete!" subtitle="Head to the Leaderboard tab to see final standings." />
            </div>
          )}

          {/* Recent Results */}
          {completedHeats.length > 0 && (
            <div className="card">
              <div className="font-condensed text-xs uppercase tracking-widest text-white/30 mb-3">Recent Results</div>
              <div className="space-y-2">
                {completedHeats.map((heat) => {
                  const medals = ['🥇', '🥈', '🥉']
                  return (
                    <div key={heat.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/3 border border-white/5 text-sm">
                      <span className="font-condensed text-xs text-white/30 w-14 flex-shrink-0">Heat #{heat.number}</span>
                      <div className="flex gap-1.5 flex-wrap flex-1">
                        {((heat.result?.runs || []).sort((a, b) => (a.place ?? 99) - (b.place ?? 99))).map((run) => {
                          const l = (heat.lanes || []).find((x) => x.lane === run.lane)
                          const r = l?.racerId ? racerMap[l.racerId] : null
                          return (
                            <span key={run.lane} className="font-condensed text-xs px-2 py-0.5 rounded-full bg-white/8 border border-white/8">
                              {run.place && run.place <= 3 ? medals[run.place - 1] : run.place ? `${run.place}.` : ''}{' '}
                              {r?.name || `L${run.lane}`}
                              {run.time ? ` ${run.time.toFixed(3)}s` : ''}
                            </span>
                          )
                        })}
                      </div>
                      <button className="btn btn-secondary flex-shrink-0" style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => rerunHeat(heat.id)}>↺</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Heat Queue */}
        <div className="space-y-3">
          <div className="font-condensed text-xs uppercase tracking-widest text-white/30 flex items-center justify-between">
            <span>Queue</span>
            <span className="text-orange-400">{pendingHeats.length} remaining</span>
          </div>
          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
            {pendingHeats.slice(0, 30).map((heat) => (
              <div
                key={heat.id}
                className={`heat-card pending cursor-pointer hover:border-white/20 transition-colors ${activeHeat?.id === heat.id ? 'selected' : ''}`}
                onClick={() => setActiveHeatId(heat.id)}
              >
                <div className="font-condensed text-xs text-white/30 mb-1.5">Heat #{heat.number}</div>
                <div className="space-y-0.5">
                  {(heat.lanes || []).filter((l) => l.racerId).map((l) => {
                    const r = racerMap[l.racerId]
                    return (
                      <div key={l.lane} className="flex gap-1.5 items-center text-xs">
                        <span className="text-white/20">L{l.lane}</span>
                        <span className="text-white/60">{r?.name || '?'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {pendingHeats.length === 0 && (
              <div className="text-center py-6 text-white/20 text-sm font-condensed">No pending heats</div>
            )}
          </div>
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
    setLeaderboard(Array.isArray(lb) ? lb : [])
    setDivisions(Array.isArray(divs) ? divs : [])
  }
  useEffect(() => { load() }, [])

  const filtered = filterDiv ? leaderboard.filter((e) => e.division === filterDiv) : leaderboard
  const divMap = Object.fromEntries(divisions.map((d) => [d.id, d]))
  const top3 = filtered.slice(0, 3)

  // Podium: left=2nd, center=1st, right=3rd
  const podiumSlots = [
    { idx: 1, height: 'h-24', color: 'from-slate-800/50 to-slate-700/30 border-slate-600/40', label: '2nd', medal: '🥈', textColor: 'text-slate-300' },
    { idx: 0, height: 'h-32', color: 'from-yellow-900/50 to-yellow-800/30 border-yellow-700/40', label: '1st', medal: '🥇', textColor: 'text-yellow-400' },
    { idx: 2, height: 'h-20', color: 'from-amber-900/40 to-amber-800/20 border-amber-800/30', label: '3rd', medal: '🥉', textColor: 'text-amber-600' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageTitle>Leaderboard</PageTitle>
        <div className="flex gap-2 flex-wrap mb-5">
          <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
            <option value="">All Divisions</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={load}>↺ Refresh</button>
          <button className="btn btn-primary" onClick={() => { window.location.href = '/api/export/csv' }}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Podium */}
      {top3.length >= 2 && (
        <div className="card">
          <div className="flex items-end justify-center gap-4 py-4">
            {podiumSlots.map(({ idx, height, color, label, medal, textColor }) => {
              const entry = top3[idx]
              if (!entry) return <div key={idx} className="w-28" />
              const div = entry.division ? divMap[entry.division] : null
              return (
                <div key={idx} className="flex flex-col items-center gap-2 w-28">
                  <div className="text-3xl">{medal}</div>
                  <div className="text-center px-1">
                    <div className="font-semibold text-sm leading-tight truncate w-full">{entry.name}</div>
                    {entry.carName && <div className="font-condensed text-xs text-white/30 truncate">{entry.carName}</div>}
                    {entry.carNumber && <div className="font-condensed text-xs text-orange-400/60">#{entry.carNumber}</div>}
                    {div && (
                      <span className="inline-flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: div.color }} />
                        <span className="font-condensed text-[10px] text-white/25">{div.name}</span>
                      </span>
                    )}
                  </div>
                  <div className={`w-full ${height} rounded-t-xl flex flex-col items-center justify-center bg-gradient-to-t border ${color}`}>
                    <div className={`font-display text-3xl ${textColor}`}>{entry.points}</div>
                    <div className="font-condensed text-[10px] text-white/30 uppercase tracking-wider">pts</div>
                  </div>
                  <div className={`font-condensed text-xs uppercase tracking-widest ${textColor}`}>{label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon="🏆" title="No results yet" subtitle="Race some heats to populate the leaderboard." />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/2">
                {['Rank', 'Car #', 'Name', 'Car Name', 'Division', 'Points', 'Wins', 'Heats', 'Best Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-condensed text-xs uppercase tracking-wider text-white/25">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const div = entry.division ? divMap[entry.division] : null
                return (
                  <tr key={entry.racerId} className={`border-b border-white/5 transition-colors ${
                    entry.rank === 1 ? 'bg-yellow-900/8 hover:bg-yellow-900/12' :
                    entry.rank === 2 ? 'bg-slate-800/20 hover:bg-slate-800/30' :
                    entry.rank === 3 ? 'bg-amber-900/6 hover:bg-amber-900/10' :
                    i % 2 === 0 ? 'hover:bg-white/2' : 'bg-white/2 hover:bg-white/3'
                  }`}>
                    <td className="px-4 py-3">
                      <span className={`font-display text-xl ${
                        entry.rank === 1 ? 'text-yellow-400' :
                        entry.rank === 2 ? 'text-slate-300' :
                        entry.rank === 3 ? 'text-amber-600' : 'text-white/30'
                      }`}>
                        {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.carNumber
                        ? <span className="font-condensed text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400/80 px-1.5 py-0.5 rounded">#{entry.carNumber}</span>
                        : <span className="text-white/20">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{entry.name}</td>
                    <td className="px-4 py-3 text-white/50">{entry.carName || '—'}</td>
                    <td className="px-4 py-3">
                      {div
                        ? <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: div.color }} />
                            <span className="font-condensed text-xs">{div.name}</span>
                          </span>
                        : <span className="text-white/20">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-display text-lg ${entry.rank <= 3 ? 'text-orange-400' : 'text-white/60'}`}>
                        {entry.points}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50 font-condensed">{entry.wins}</td>
                    <td className="px-4 py-3 text-white/50 font-condensed">{entry.heatsRaced}</td>
                    <td className="px-4 py-3">
                      {entry.bestTime != null
                        ? <span className="font-condensed text-sm text-green-400">{entry.bestTime.toFixed(3)}s</span>
                        : <span className="text-white/20">—</span>}
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
  { id: 'setup',       label: 'Event Setup',   icon: '⚙️'  },
  { id: 'racers',      label: 'Racers',         icon: '👥'  },
  { id: 'divisions',   label: 'Divisions',      icon: '🏷️'  },
  { id: 'bracket',     label: 'Bracket',        icon: '🗓️'  },
  { id: 'race',        label: 'Race Manager',   icon: '🚀'  },
  { id: 'leaderboard', label: 'Leaderboard',    icon: '🏆'  },
]

export default function App() {
  const [tab, setTab] = useState('setup')
  const [eventName, setEventName] = useState('')
  const [eventStatus, setEventStatus] = useState('')
  const toast = useToast()

  useEffect(() => {
    api.get('/api/event').then((e) => {
      if (e && e.name) setEventName(e.name)
      if (e && e.status) setEventStatus(e.status)
    }).catch(() => {})
  }, [tab])

  function renderTab() {
    switch (tab) {
      case 'setup':       return <EventSetupTab toast={toast} />
      case 'racers':      return <RacersTab toast={toast} />
      case 'divisions':   return <DivisionsTab toast={toast} />
      case 'bracket':     return <BracketTab toast={toast} />
      case 'race':        return <RaceManagementTab toast={toast} />
      case 'leaderboard': return <LeaderboardTab toast={toast} />
      default:            return null
    }
  }

  const STATUS_STYLE = {
    setup:            'bg-white/5 text-white/30 border-white/10',
    registration:     'bg-blue-900/40 text-blue-300 border-blue-800/60',
    bracketGenerated: 'bg-orange-900/40 text-orange-300 border-orange-800/60',
    racing:           'bg-green-900/40 text-green-300 border-green-800/60',
    complete:         'bg-yellow-900/40 text-yellow-300 border-yellow-800/60',
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Toasts toasts={toast.toasts} />

      {/* Header */}
      <header className="border-b border-white/8 px-6 py-3 flex items-center justify-between flex-shrink-0"
        style={{ background: 'linear-gradient(to right, #08080f, #0f0f1e)' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏎</span>
          <div>
            <div className="font-display text-2xl tracking-widest leading-none text-white">DERBY ADMIN</div>
            {eventName && (
              <div className="font-condensed text-xs tracking-widest uppercase text-orange-400/60 mt-0.5">{eventName}</div>
            )}
          </div>
          {eventStatus && (
            <span className={`font-condensed text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border hidden sm:inline-block ml-2 ${STATUS_STYLE[eventStatus] || 'bg-white/5 text-white/30 border-white/10'}`}>
              {eventStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="font-condensed text-xs uppercase tracking-wider text-white/30 hover:text-white/70 transition-colors">Guest</a>
          <a href="/manage" className="font-condensed text-xs uppercase tracking-wider text-white/30 hover:text-white/70 transition-colors">Track</a>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-white/5 px-4 flex gap-0 overflow-x-auto flex-shrink-0"
        style={{ background: '#0a0a16' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-condensed text-sm uppercase tracking-wider py-3 px-4 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              tab === t.id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <span className="hidden sm:inline text-base leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 p-5 overflow-x-auto">
        {renderTab()}
      </main>
    </div>
  )
}

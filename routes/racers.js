'use strict'
const express = require('express')
const crypto = require('crypto')

module.exports = function racersRouter({ eventState, broadcast, requireAdmin, saveEvent }) {
  const router = express.Router()

  router.get('/racers', (req, res) => res.json(eventState.racers))

  router.post('/racers', requireAdmin, (req, res) => {
    const { name, carName, carNumber, division, seed, notes } = req.body
    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: 'Name is required' })
    const racer = {
      id: crypto.randomUUID(),
      name: name.trim(),
      carName: (carName || '').trim(),
      carNumber: (carNumber || '').toString().trim(),
      division: division || null,
      seed: seed != null ? Number(seed) : null,
      notes: (notes || '').trim(),
      active: true,
    }
    eventState.racers.push(racer)
    saveEvent()
    broadcast('racers')
    res.status(201).json(racer)
  })

  router.put('/racers/:id', requireAdmin, (req, res) => {
    const idx = eventState.racers.findIndex((r) => r.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Racer not found' })
    const allowed = ['name', 'carName', 'carNumber', 'division', 'seed', 'notes', 'active']
    const updated = { ...eventState.racers[idx] }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updated[key] = req.body[key]
    }
    eventState.racers[idx] = updated
    saveEvent()
    broadcast('racers')
    res.json(updated)
  })

  router.delete('/racers/:id', requireAdmin, (req, res) => {
    const idx = eventState.racers.findIndex((r) => r.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Racer not found' })
    eventState.racers.splice(idx, 1)
    saveEvent()
    broadcast('racers')
    res.json({ ok: true })
  })

  return router
}

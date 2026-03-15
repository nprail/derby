'use strict'
const express = require('express')
const crypto = require('crypto')

module.exports = function divisionsRouter({ eventState, requireAdmin, saveEvent }) {
  const router = express.Router()

  router.get('/divisions', (req, res) => res.json(eventState.divisions))

  router.post('/divisions', requireAdmin, (req, res) => {
    const { name, color, description } = req.body
    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: 'Name is required' })
    const division = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color: color || '#ffffff',
      description: (description || '').trim(),
    }
    eventState.divisions.push(division)
    saveEvent()
    res.status(201).json(division)
  })

  router.put('/divisions/:id', requireAdmin, (req, res) => {
    const idx = eventState.divisions.findIndex((d) => d.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Division not found' })
    const allowed = ['name', 'color', 'description']
    const updated = { ...eventState.divisions[idx] }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updated[key] = req.body[key]
    }
    eventState.divisions[idx] = updated
    saveEvent()
    res.json(updated)
  })

  router.delete('/divisions/:id', requireAdmin, (req, res) => {
    const idx = eventState.divisions.findIndex((d) => d.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Division not found' })
    eventState.divisions.splice(idx, 1)
    saveEvent()
    res.json({ ok: true })
  })

  return router
}

'use strict'
const express = require('express')

module.exports = function heatsRouter({
  eventState,
  broadcast,
  requireAdmin,
  saveEvent,
  findHeat,
  computeLeaderboard,
}) {
  const router = express.Router()

  router.post('/heats/:heatId/start', requireAdmin, (req, res) => {
    const heat = findHeat(req.params.heatId)
    if (!heat) return res.status(404).json({ error: 'Heat not found' })
    if (heat.status !== 'pending')
      return res.status(400).json({ error: 'Heat is not pending' })

    // Mark any previously active heat as pending again (only one active at a time)
    if (eventState.bracket) {
      for (const round of eventState.bracket.rounds) {
        for (const h of round.heats) {
          if (h.status === 'active') h.status = 'pending'
        }
      }
    }

    heat.status = 'active'
    eventState.event.status = 'racing'
    saveEvent()
    broadcast('heatStarted', { heatId: heat.id })
    res.json({ ok: true, heat })
  })

  router.post('/heats/:heatId/result', requireAdmin, (req, res) => {
    const heat = findHeat(req.params.heatId)
    if (!heat) return res.status(404).json({ error: 'Heat not found' })

    const { runs } = req.body // [{ lane, time, place }]
    if (!Array.isArray(runs))
      return res.status(400).json({ error: 'runs must be an array' })

    heat.status = 'completed'
    heat.result = { runs, completedAt: new Date().toISOString() }
    eventState.heatResults[heat.id] = { runs, result: heat.result }

    computeLeaderboard()
    saveEvent()
    broadcast('heatResult', { heatId: heat.id })
    res.json({ ok: true, heat })
  })

  router.post('/heats/:heatId/rerun', requireAdmin, (req, res) => {
    const heat = findHeat(req.params.heatId)
    if (!heat) return res.status(404).json({ error: 'Heat not found' })
    heat.status = 'pending'
    heat.result = null
    delete eventState.heatResults[heat.id]
    computeLeaderboard()
    saveEvent()
    broadcast('heatRerun', { heatId: heat.id })
    res.json({ ok: true })
  })

  router.post('/heats/:heatId/skip', requireAdmin, (req, res) => {
    const heat = findHeat(req.params.heatId)
    if (!heat) return res.status(404).json({ error: 'Heat not found' })
    heat.status = 'skipped'
    saveEvent()
    broadcast('bracket')
    res.json({ ok: true })
  })

  return router
}

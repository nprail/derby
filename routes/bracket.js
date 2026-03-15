'use strict'
const express = require('express')

module.exports = function bracketRouter({
  eventState,
  broadcast,
  requireAdmin,
  saveEvent,
  getActiveRacers,
  findHeat,
  generateRoundRobin,
  generateSingleElim,
  generateDoubleElim,
  generatePoints,
}) {
  const router = express.Router()

  router.get('/bracket', (req, res) => res.json(eventState.bracket))

  router.post('/bracket/generate', requireAdmin, (req, res) => {
    if (eventState.event.bracketLocked)
      return res.status(400).json({ error: 'Bracket is locked' })

    const activeRacers = getActiveRacers()
    if (activeRacers.length < 2)
      return res.status(400).json({ error: 'Need at least 2 active racers' })

    const { scheduleMode, lanesPerHeat } = eventState.event
    let bracket

    switch (scheduleMode) {
      case 'singleElim':
        bracket = generateSingleElim(activeRacers, lanesPerHeat)
        break
      case 'doubleElim':
        bracket = generateDoubleElim(activeRacers, lanesPerHeat)
        break
      case 'points':
        bracket = generatePoints(activeRacers, lanesPerHeat, 3)
        break
      default:
        bracket = generateRoundRobin(activeRacers, lanesPerHeat)
    }

    eventState.bracket = bracket
    eventState.heatQueue = []
    eventState.heatResults = {}
    // Build heat queue from bracket
    for (const round of bracket.rounds) {
      for (const heat of round.heats) {
        eventState.heatQueue.push(heat.id)
      }
    }
    eventState.event.status = 'bracketGenerated'
    saveEvent()
    broadcast('bracket')
    res.json(bracket)
  })

  router.post('/bracket/regenerate', requireAdmin, (req, res) => {
    if (eventState.event.bracketLocked)
      return res.status(400).json({ error: 'Bracket is locked. Unlock first.' })

    eventState.bracket = null
    eventState.heatQueue = []
    eventState.heatResults = {}
    eventState.event.status = 'registration'
    saveEvent()
    broadcast('bracket')
    res.json({ ok: true })
  })

  router.post('/bracket/lock', requireAdmin, (req, res) => {
    if (!eventState.bracket)
      return res.status(400).json({ error: 'No bracket to lock' })
    eventState.event.bracketLocked = true
    saveEvent()
    res.json({ ok: true })
  })

  router.post('/bracket/unlock', requireAdmin, (req, res) => {
    eventState.event.bracketLocked = false
    saveEvent()
    res.json({ ok: true })
  })

  router.post('/bracket/swap', requireAdmin, (req, res) => {
    if (eventState.event.bracketLocked)
      return res.status(400).json({ error: 'Bracket is locked' })

    const { heat1Id, lane1, heat2Id, lane2 } = req.body
    if (!heat1Id || !lane1 || !heat2Id || !lane2)
      return res.status(400).json({ error: 'heat1Id, lane1, heat2Id, and lane2 are required.' })

    const heat1 = findHeat(heat1Id)
    const heat2 = findHeat(heat2Id)
    if (!heat1 || !heat2) return res.status(404).json({ error: 'Heat not found' })

    const l1 = heat1.lanes.find((l) => l.lane === Number(lane1))
    const l2 = heat2.lanes.find((l) => l.lane === Number(lane2))
    if (!l1 || !l2) return res.status(404).json({ error: 'Lane not found' })

    const tmp = l1.racerId
    l1.racerId = l2.racerId
    l2.racerId = tmp

    saveEvent()
    broadcast('bracket')
    res.json({ ok: true })
  })

  return router
}

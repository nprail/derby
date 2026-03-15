'use strict'
const express = require('express')

module.exports = function eventRouter({ eventState, broadcast, requireAdmin, saveEvent }) {
  const router = express.Router()

  router.get('/event', (req, res) => res.json(eventState.event))

  router.post('/event', requireAdmin, (req, res) => {
    const allowed = [
      'name', 'date', 'scheduleMode', 'lanesPerHeat', 'runsPerHeat',
      'heatWinnerLogic', 'laneRotation', 'divisionMode', 'tiebreakerRule',
      'pointsTable', 'customPointsTable', 'bracketVisibility', 'status',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) eventState.event[key] = req.body[key]
    }
    saveEvent()
    broadcast('event')
    res.json(eventState.event)
  })

  return router
}

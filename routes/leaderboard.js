'use strict'
const express = require('express')

module.exports = function leaderboardRouter({ eventState }) {
  const router = express.Router()

  router.get('/leaderboard', (req, res) => res.json(eventState.leaderboard))

  router.get('/export/csv', (req, res) => {
    const rows = ['Rank,Car #,Name,Car Name,Division,Points,Wins,Heats Raced,Best Time (s)']
    for (const entry of eventState.leaderboard) {
      rows.push(
        [
          entry.rank,
          entry.carNumber,
          `"${entry.name}"`,
          `"${entry.carName}"`,
          `"${entry.division || ''}"`,
          entry.points,
          entry.wins,
          entry.heatsRaced,
          entry.bestTime != null ? entry.bestTime.toFixed(4) : '',
        ].join(','),
      )
    }
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="derby_leaderboard.csv"')
    res.send(rows.join('\n'))
  })

  return router
}

'use strict'
const express = require('express')

module.exports = function accessRouter({ eventState, requireAdmin, saveEvent }) {
  const router = express.Router()

  router.post('/access/set-codes', requireAdmin, (req, res) => {
    const { adminCode, trackOfficialCode } = req.body
    if (adminCode !== undefined) eventState.adminCode = adminCode || null
    if (trackOfficialCode !== undefined) eventState.trackOfficialCode = trackOfficialCode || null
    saveEvent()
    res.json({ ok: true })
  })

  router.post('/access/verify', (req, res) => {
    const { code } = req.body
    if (!code) return res.json({ role: 'spectator' })
    if (eventState.adminCode && code === eventState.adminCode)
      return res.json({ role: 'admin' })
    if (eventState.trackOfficialCode && code === eventState.trackOfficialCode)
      return res.json({ role: 'trackOfficial' })
    res.json({ role: 'spectator' })
  })

  return router
}

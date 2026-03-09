// zcam.js — ZCam E2M4 HTTP API client
//
// Uses the ZCam E2 series HTTP API to:
//   1. Start recording when the first lane trigger fires
//   2. Stop recording when the heat finishes
//   3. Download the new clip from the camera's SD card
//   4. Save it under public/videos/ so the dashboard can play it back
//
// Reference: https://github.com/imaginevision/Z-Camera-Doc/blob/master/E2/protocol/http/http.md

const axios = require('axios')
const fs = require('fs')
const path = require('path')

// Time (ms) between each poll when waiting for the new clip to appear.
const POLL_INTERVAL_MS = 1000

// Maximum time (ms) to wait for the new clip to appear before giving up.
const POLL_TIMEOUT_MS = 30000

// Recognized clip extensions (lower-cased for comparison)
const VIDEO_EXTS = new Set(['.mov', '.mp4'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Creates a ZCam E2M4 manager that can start/stop recording and retrieve the
 * latest clip.
 *
 * @param {object} options
 * @param {string} options.cameraIp  - IP address of the ZCam (default: 10.98.32.1)
 * @param {string} options.videoDir  - Local directory to save downloaded clips
 * @returns {{ setup, startRecording, stopAndFetchVideo, disconnect }}
 */
function createZCamManager({ cameraIp = '10.98.32.1', videoDir = 'public/videos' } = {}) {
  // Axios instance pre-configured for this camera
  const cam = axios.create({
    baseURL: `http://${cameraIp}`,
    timeout: 8000,
  })

  // Ensure the local video directory exists
  fs.mkdirSync(videoDir, { recursive: true })

  // Set to true after setup() succeeds; recording calls are skipped when false.
  let ready = false

  // Snapshot of { folder, name } objects present before recording started,
  // used to identify the newly created clip after stopping.
  let filesBeforeRec = []

  // Timestamp (ms) when startRecording() succeeded, used to measure duration.
  let recordingStartedAt = null

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** GET a ZCam API endpoint and return its parsed JSON data. */
  async function get(apiPath) {
    const { data } = await cam.get(apiPath)
    return data
  }

  /** Acquires a control session (required before any /ctrl/* commands). */
  async function acquireSession() {
    const data = await get('/ctrl/session')
    if (data?.code !== 0) {
      throw new Error(`ZCam: failed to acquire session: ${JSON.stringify(data)}`)
    }
  }

  /** Releases the session — best-effort, errors are only warned. */
  async function releaseSession() {
    await get('/ctrl/session?action=quit').catch((err) =>
      console.warn('ZCam: session release warning:', err.message),
    )
  }

  /** Syncs the camera clock to the host system time. */
  async function syncDatetime() {
    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().split(' ')[0]
    const data = await get(`/datetime?date=${date}&time=${encodeURIComponent(time)}`)
    if (data?.code !== 0) {
      console.warn('ZCam: datetime sync returned non-zero code:', JSON.stringify(data))
    }
  }

  /**
   * Lists all video clip files across every DCIM subfolder on the SD card.
   *
   * Two-step API:
   *   GET /DCIM/          → { files: ["100ZCAME", ...] }
   *   GET /DCIM/<folder>  → { files: ["ZCAM0001.MOV", ...] }
   *
   * @returns {Array<{folder: string, name: string}>}
   */
  async function listAllClips() {
    const foldersData = await get('/DCIM/')
    if (foldersData?.code !== 0 || !Array.isArray(foldersData.files)) return []

    const clips = []
    for (const folder of foldersData.files) {
      const filesData = await get(`/DCIM/${folder}`)
      if (filesData?.code === 0 && Array.isArray(filesData.files)) {
        for (const name of filesData.files) {
          if (VIDEO_EXTS.has(path.extname(name).toLowerCase())) {
            clips.push({ folder, name })
          }
        }
      }
    }
    return clips
  }

  /**
   * Ensures the camera is in record-ready mode.
   * Mode values: rec | rec_ing | rec_paused | pb | standby
   */
  async function ensureRecordMode() {
    const data = await get('/ctrl/mode?action=query')
    if (data?.code !== 0) {
      throw new Error(`ZCam: mode query failed: ${JSON.stringify(data)}`)
    }
    if (data.msg === 'rec' || data.msg === 'rec_ing') return // already correct

    const switchData = await get('/ctrl/mode?action=to_rec')
    if (switchData?.code !== 0) {
      throw new Error(`ZCam: failed to switch to rec mode: ${JSON.stringify(switchData)}`)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Acquires a session and syncs the camera clock to the host time.
   * Should be called once at server startup before any recording.
   * Sets an internal `ready` flag so that startRecording() and
   * stopAndFetchVideo() are no-ops if setup never succeeded.
   */
  async function setup() {
    await acquireSession()
    await syncDatetime()
    ready = true
    console.log('ZCam: session acquired and clock synced')
  }

  /**
   * Releases the session. Should be called on server shutdown.
   */
  async function disconnect() {
    ready = false
    await releaseSession()
  }

  /**
   * Snapshots the current file list, ensures record mode, then starts
   * recording. Should be called on the first lane trigger.
   * Returns false without attempting anything if setup() did not succeed.
   */
  async function startRecording() {
    if (!ready) {
      console.warn('ZCam: skipping startRecording — setup() has not succeeded')
      return false
    }
    try {
      filesBeforeRec = await listAllClips()
      await ensureRecordMode()

      const data = await get('/ctrl/rec?action=start')
      if (data?.code !== 0) {
        throw new Error(`ZCam: start recording failed: ${JSON.stringify(data)}`)
      }

      recordingStartedAt = Date.now()
      console.log('ZCam: recording started')
      return true
    } catch (err) {
      console.error('ZCam: failed to start recording:', err.message)
      return false
    }
  }

  /**
   * Stops recording, waits for the file to be finalised, then downloads it
   * to `videoDir`.
   * Returns null without attempting anything if setup() did not succeed.
   *
   * @param {number} heat  - Current heat number, used to name the local file
   * @returns {string|null}  Web-accessible path like "/videos/heat-3.mov",
   *                         or null if anything went wrong.
   */
  async function stopAndFetchVideo(heat) {
    if (!ready) {
      console.warn('ZCam: skipping stopAndFetchVideo — setup() has not succeeded')
      return null
    }
    // Stop recording
    try {
      const data = await get('/ctrl/rec?action=stop')
      if (data?.code !== 0) {
        console.warn('ZCam: stop recording returned non-zero code:', JSON.stringify(data))
      }
      const durationMs = recordingStartedAt !== null ? Date.now() - recordingStartedAt : null
      recordingStartedAt = null
      if (durationMs !== null) {
        console.log(`ZCam: recording duration — ${(durationMs / 1000).toFixed(3)} s`)
      }
      console.log('ZCam: recording stopped')
    } catch (err) {
      console.error('ZCam: failed to stop recording:', err.message)
    }

    // Poll until a new clip appears on the SD card (the camera needs time to
    // flush and finalise the file after stopping).
    try {
      const deadline = Date.now() + POLL_TIMEOUT_MS
      let newClip = null

      while (Date.now() < deadline) {
        const filesAfter = await listAllClips()
        newClip = filesAfter.find(
          (f) => !filesBeforeRec.some((b) => b.folder === f.folder && b.name === f.name),
        )
        if (newClip) break
        await sleep(POLL_INTERVAL_MS)
      }

      if (!newClip) {
        console.warn('ZCam: no new clip found after stopping')
        return null
      }

      const ext = path.extname(newClip.name).toLowerCase()
      const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
      const localName = `heat-${heat}_${ts}${ext}`
      const localPath = path.join(videoDir, localName)

      console.log(`ZCam: downloading ${newClip.name} → ${localPath}`)

      const downloadStartedAt = Date.now()
      const response = await cam.get(`/DCIM/${newClip.folder}/${newClip.name}`, {
        responseType: 'stream',
        timeout: 60000,
      })
      await new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(localPath)
        response.data.pipe(dest)
        dest.on('finish', resolve)
        dest.on('error', reject)
        response.data.on('error', reject)
      })
      const downloadMs = Date.now() - downloadStartedAt

      console.log(`ZCam: download complete — /videos/${localName} (${(downloadMs / 1000).toFixed(3)} s)`)
      return `/videos/${localName}`
    } catch (err) {
      console.error('ZCam: failed to fetch video:', err.message)
      return null
    }
  }

  return { setup, startRecording, stopAndFetchVideo, disconnect }
}

module.exports = { createZCamManager }

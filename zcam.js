// zcam.js — ZCam E2M4 HTTP API client
//
// Uses the ZCam E2 series HTTP API to:
//   1. Start recording when the first lane trigger fires
//   2. Stop recording when the heat finishes
//   3. Download the new clip from the camera's SD card
//   4. Save it under public/videos/ so the dashboard can play it back
//
// Reference: https://github.com/imaginevision/Z-Camera-Doc/blob/master/E2/protocol/http/http.md

const http = require('http')
const fs = require('fs')
const path = require('path')

// Time (ms) to wait after stop before querying for the new file.
// The camera needs a moment to flush and close the file.
const STOP_SETTLE_MS = 3000

// Recognized clip extensions (lower-cased for comparison)
const VIDEO_EXTS = new Set(['.mov', '.mp4'])

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Performs a GET request against the ZCam HTTP API and returns the parsed JSON
 * body (or the raw string if the response is not valid JSON).
 */
function zcamGet(baseUrl, apiPath, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${apiPath}`
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch {
          resolve(raw)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`ZCam request timed out: ${url}`))
    })
    req.on('error', reject)
  })
}

/**
 * Streams a file from the ZCam onto local disk.
 * Returns a promise that resolves when the download is complete.
 */
function downloadFile(baseUrl, remotePath, localPath, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}${remotePath}`
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume() // drain to free socket
        req.destroy()
        return reject(
          new Error(`ZCam download failed: HTTP ${res.statusCode} for ${url}`),
        )
      }
      const dest = fs.createWriteStream(localPath)
      res.pipe(dest)
      dest.on('finish', resolve)
      dest.on('error', (err) => {
        dest.destroy()
        res.destroy()
        reject(err)
      })
      res.on('error', (err) => {
        dest.destroy()
        reject(err)
      })
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`ZCam download timed out: ${url}`))
    })
    req.on('error', reject)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Creates a ZCam E2M4 manager that can start/stop recording and retrieve the
 * latest clip.
 *
 * @param {object} options
 * @param {string} options.cameraIp  - IP address of the ZCam (default: 10.98.32.1)
 * @param {string} options.videoDir  - Local directory to save downloaded clips
 * @returns {{ startRecording, stopAndFetchVideo }}
 */
function createZCamManager({ cameraIp = '10.98.32.1', videoDir = 'public/videos' } = {}) {
  const baseUrl = `http://${cameraIp}`

  // Ensure the local video directory exists
  fs.mkdirSync(videoDir, { recursive: true })

  // Snapshot of { folder, name } objects present before recording started, used
  // to identify the newly created clip after stopping.
  let filesBeforeRec = []

  // ── Session management ──────────────────────────────────────────────────────

  /**
   * Acquires a control session.
   * Most /ctrl/* commands require session ownership.
   * The camera returns HTTP 409 when the session is already held by another client.
   */
  async function acquireSession() {
    const res = await zcamGet(baseUrl, '/ctrl/session')
    if (!res || res.code !== 0) {
      throw new Error(`ZCam: failed to acquire session: ${JSON.stringify(res)}`)
    }
  }

  /**
   * Releases the control session so other clients can connect.
   * Errors are swallowed because release is best-effort cleanup.
   */
  async function releaseSession() {
    await zcamGet(baseUrl, '/ctrl/session?action=quit').catch((err) =>
      console.warn('ZCam: session release warning:', err.message),
    )
  }

  // ── Date/time sync ──────────────────────────────────────────────────────────

  /**
   * Syncs the camera clock to the host system time.
   * The ZCam docs recommend doing this on every connection.
   */
  async function syncDatetime() {
    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().split(' ')[0]
    const res = await zcamGet(baseUrl, `/datetime?date=${date}&time=${encodeURIComponent(time)}`)
    if (res && res.code !== 0) {
      console.warn('ZCam: datetime sync returned non-zero code:', JSON.stringify(res))
    }
  }

  // ── File management ─────────────────────────────────────────────────────────

  /**
   * Lists all video clip files across every DCIM subfolder on the SD card.
   *
   * The ZCam file-management API works in two steps:
   *   1. GET /DCIM/           → { files: ["100ZCAME", "101ZCAME", ...] }
   *   2. GET /DCIM/<folder>   → { files: ["ZCAM0001_...MOV", ...] }
   *
   * @returns {Array<{folder: string, name: string}>}
   */
  async function listAllClips() {
    const foldersRes = await zcamGet(baseUrl, '/DCIM/')
    if (!foldersRes || foldersRes.code !== 0 || !Array.isArray(foldersRes.files)) {
      return []
    }

    const clips = []
    for (const folder of foldersRes.files) {
      const filesRes = await zcamGet(baseUrl, `/DCIM/${folder}`)
      if (filesRes && filesRes.code === 0 && Array.isArray(filesRes.files)) {
        for (const name of filesRes.files) {
          if (VIDEO_EXTS.has(path.extname(name).toLowerCase())) {
            clips.push({ folder, name })
          }
        }
      }
    }
    return clips
  }

  // ── Working mode ────────────────────────────────────────────────────────────

  /**
   * Ensures the camera is in record-ready mode.
   *
   * Mode values (from the API docs):
   *   rec        — record mode, ready to start
   *   rec_ing    — actively recording
   *   rec_paused — recording paused
   *   pb         — playback mode
   *   standby    — standby
   *
   * If the camera is already recording we leave it as-is.
   * If it's in any other mode we switch to rec.
   */
  async function ensureRecordMode() {
    const modeRes = await zcamGet(baseUrl, '/ctrl/mode?action=query')
    if (!modeRes || modeRes.code !== 0) {
      throw new Error(`ZCam: mode query failed: ${JSON.stringify(modeRes)}`)
    }

    const mode = modeRes.msg
    if (mode === 'rec' || mode === 'rec_ing') return // already correct

    const switchRes = await zcamGet(baseUrl, '/ctrl/mode?action=to_rec')
    if (!switchRes || switchRes.code !== 0) {
      throw new Error(`ZCam: failed to switch to rec mode: ${JSON.stringify(switchRes)}`)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Acquires a camera session, syncs the clock, snapshots the current file
   * list, then starts recording.
   * Should be called on the first lane trigger.
   */
  async function startRecording() {
    try {
      // Acquire session before issuing any /ctrl/* commands
      await acquireSession()

      // Sync camera clock to host time (recommended by ZCam docs)
      await syncDatetime()

      // Snapshot the file list so we can diff for the new clip after stopping
      filesBeforeRec = await listAllClips()

      // Switch to record mode if needed, then start
      await ensureRecordMode()

      const recRes = await zcamGet(baseUrl, '/ctrl/rec?action=start')
      if (recRes && recRes.code !== 0) {
        throw new Error(`ZCam: start recording failed: ${JSON.stringify(recRes)}`)
      }

      console.log('ZCam: recording started')
      return true
    } catch (err) {
      console.error('ZCam: failed to start recording:', err.message)
      // Release session so we don't leave the camera locked
      await releaseSession()
      return false
    }
  }

  /**
   * Stops the current recording, releases the session, waits for the file to
   * be finalised, then downloads it to `videoDir`.
   *
   * @param {number} heat  - Current heat number, used to name the local file
   * @returns {string|null}  Web-accessible path like "/videos/heat-3.mov",
   *                         or null if anything went wrong.
   */
  async function stopAndFetchVideo(heat) {
    // ── Step 1: stop recording and release session ──────────────────────────
    try {
      const stopRes = await zcamGet(baseUrl, '/ctrl/rec?action=stop')
      if (stopRes && stopRes.code !== 0) {
        console.warn('ZCam: stop recording returned non-zero code:', JSON.stringify(stopRes))
      }
      console.log('ZCam: recording stopped')
    } catch (err) {
      console.error('ZCam: failed to stop recording:', err.message)
    } finally {
      // Always release the session, even if stop failed
      await releaseSession()
    }

    // ── Step 2: wait, then find and download the new clip ───────────────────
    try {
      // Give the camera time to close and flush the file to the SD card
      await sleep(STOP_SETTLE_MS)

      const filesAfter = await listAllClips()
      const newClip = filesAfter.find(
        (f) => !filesBeforeRec.some((b) => b.folder === f.folder && b.name === f.name),
      )

      if (!newClip) {
        console.warn('ZCam: no new clip found after stopping')
        return null
      }

      const ext = path.extname(newClip.name).toLowerCase()
      const localName = `heat-${heat}${ext}`
      const localPath = path.join(videoDir, localName)
      // Download path: GET /DCIM/<folder>/<filename>
      const remotePath = `/DCIM/${newClip.folder}/${newClip.name}`

      console.log(`ZCam: downloading ${newClip.name} → ${localPath}`)
      await downloadFile(baseUrl, remotePath, localPath)
      console.log(`ZCam: download complete — /videos/${localName}`)

      return `/videos/${localName}`
    } catch (err) {
      console.error('ZCam: failed to fetch video:', err.message)
      return null
    }
  }

  return { startRecording, stopAndFetchVideo }
}

module.exports = { createZCamManager }

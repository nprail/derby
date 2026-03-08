// zcam.js — ZCam E2M4 HTTP API client
//
// Uses the ZCam E2 series HTTP API to:
//   1. Start recording when the first lane trigger fires
//   2. Stop recording when the heat finishes
//   3. Download the new clip from the camera's SD card
//   4. Save it under public/videos/ so the dashboard can play it back

const http = require('http')
const fs = require('fs')
const path = require('path')

// Time (ms) to wait after stop before querying for the new file.
// The camera needs a moment to flush and close the file.
const STOP_SETTLE_MS = 3000

// ZCam E2 series stores recordings here by default
const DCIM_FOLDER = '/DCIM/100ZCAME/'

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

  // Snapshot of filenames present before the recording started, used to
  // identify the newly created clip after stopping.
  let filesBeforeRec = []

  /**
   * Returns the list of clip filenames (basenames only) currently on the
   * camera's SD card in DCIM_FOLDER.
   */
  async function listClips() {
    const data = await zcamGet(baseUrl, `/ctrl/list?p=${encodeURIComponent(DCIM_FOLDER)}`)
    // Expected response: { files: ["CLIP001.MOV", ...], dirs: [] }
    if (data && Array.isArray(data.files)) {
      return data.files.filter((f) =>
        VIDEO_EXTS.has(path.extname(f).toLowerCase()),
      )
    }
    return []
  }

  /**
   * Switches the camera to record mode and starts recording.
   * Should be called on the first lane trigger.
   */
  async function startRecording() {
    try {
      // Snapshot current file list before we start so we can diff later
      filesBeforeRec = await listClips()

      // Ensure the camera is in record-ready mode then start
      await zcamGet(baseUrl, '/ctrl/mode?action=to_rec')
      const res = await zcamGet(baseUrl, '/ctrl/rec?action=start')
      console.log('ZCam: recording started', JSON.stringify(res))
      return true
    } catch (err) {
      console.error('ZCam: failed to start recording:', err.message)
      return false
    }
  }

  /**
   * Stops the current recording, waits for the file to be finalised, then
   * downloads it to `videoDir`.
   *
   * @param {number} heat  - Current heat number, used to name the local file
   * @returns {string|null}  Web-accessible path like "/videos/heat-3.mov",
   *                         or null if anything went wrong.
   */
  async function stopAndFetchVideo(heat) {
    try {
      const stopRes = await zcamGet(baseUrl, '/ctrl/rec?action=stop')
      console.log('ZCam: recording stopped', JSON.stringify(stopRes))

      // Give the camera time to close and flush the file
      await sleep(STOP_SETTLE_MS)

      // Identify the new clip
      const filesAfter = await listClips()
      const newClip = filesAfter.find((f) => !filesBeforeRec.includes(f))

      if (!newClip) {
        console.warn('ZCam: no new clip found after stopping')
        return null
      }

      const ext = path.extname(newClip).toLowerCase()
      const localName = `heat-${heat}${ext}`
      const localPath = path.join(videoDir, localName)
      const remotePath = `${DCIM_FOLDER}${newClip}`

      console.log(`ZCam: downloading ${newClip} → ${localPath}`)
      await downloadFile(baseUrl, remotePath, localPath)
      console.log(`ZCam: download complete — /videos/${localName}`)

      return `/videos/${localName}`
    } catch (err) {
      console.error('ZCam: failed to stop/fetch video:', err.message)
      return null
    }
  }

  return { startRecording, stopAndFetchVideo }
}

module.exports = { createZCamManager }

import express from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'server-data.json')
const PORT = process.env.PORT || 3001

function readData() {
  if (!existsSync(DATA_FILE)) return {}
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) } catch { return {} }
}

function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data), 'utf-8')
}

const app = express()
app.use(express.json({ limit: '20mb' }))

// Allow requests from frontend dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// GET /api/storage?key=xxx
app.get('/api/storage', (req, res) => {
  const { key } = req.query
  if (!key) return res.json({ value: null })
  const data = readData()
  const value = data[key] !== undefined ? data[key] : null
  res.json({ value })
})

// POST /api/storage  { key, value }
app.post('/api/storage', (req, res) => {
  const { key, value } = req.body
  if (!key) return res.json({ ok: false })
  const data = readData()
  if (value === null || value === undefined) {
    delete data[key]
  } else {
    data[key] = value
  }
  writeData(data)
  res.json({ ok: true })
})

// Serve built frontend (production mode)
const distPath = join(__dirname, 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(join(distPath, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`)
  console.log(`📦 Data saved to: ${DATA_FILE}`)
})

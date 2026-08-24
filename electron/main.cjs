const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, safeStorage, shell, screen } = require('electron')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')

const smokeMode = process.argv.includes('--smoke-test')
const COMPACT_SIZE = { width: 370, height: 360 }
const PANEL_SIZE = { width: 390, height: 520 }
const BUBBLE_SIZE = { width: 370, height: 620 }
const projectRoot = path.join(__dirname, '..')

if (smokeMode) app.setPath('userData', path.join(process.cwd(), '.smoke-user-data'))

let mainWindow
let tray
let quitting = false
let modules
let store
let configPath
let dragTimer = null
let dragAnchor = null
let chatInFlight = false
let lastChatAt = 0
let panelOpen = false
let bubbleExpanded = false

const defaultConfig = {
  alwaysOnTop: true,
  clickThrough: false,
  apiKeyEncrypted: '',
  pricing: {
    flash: { hit: 0.02, miss: 1, output: 2 },
    pro: { hit: 0.025, miss: 3, output: 6 },
  },
}

async function loadModules() {
  const root = path.join(__dirname, '..')
  const [pricing, summaryModule, storeModule, securityModule, chatModule] = await Promise.all([
    import(pathToFileURL(path.join(root, 'src', 'pricing.mjs')).href),
    import(pathToFileURL(path.join(root, 'src', 'summary.mjs')).href),
    import(pathToFileURL(path.join(root, 'src', 'store.mjs')).href),
    import(pathToFileURL(path.join(root, 'src', 'security.mjs')).href),
    import(pathToFileURL(path.join(root, 'src', 'chat.mjs')).href),
  ])
  modules = { ...pricing, ...summaryModule, ...storeModule, ...securityModule, ...chatModule }
}

async function readConfig() {
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'))
    return {
      ...defaultConfig,
      ...parsed,
      pricing: {
        flash: { ...defaultConfig.pricing.flash, ...parsed?.pricing?.flash },
        pro: { ...defaultConfig.pricing.pro, ...parsed?.pricing?.pro },
      },
    }
  } catch {
    return structuredClone(defaultConfig)
  }
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  const temp = `${configPath}.${process.pid}.tmp`
  await fs.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temp, configPath)
  await fs.chmod(configPath, 0o600).catch(() => {})
}

function decryptApiKey(config) {
  if (config.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(config.apiKeyEncrypted, 'base64')) } catch {}
  }
  return ''
}

async function initializeSecureConfig() {
  const config = await readConfig()
  let changed = false
  if (config.integrationToken) { delete config.integrationToken; changed = true }
  if (config.apiKeyPlainFallback) {
    if (safeStorage.isEncryptionAvailable()) config.apiKeyEncrypted = safeStorage.encryptString(config.apiKeyPlainFallback).toString('base64')
    config.apiKeyPlainFallback = ''
    changed = true
  }
  if (config.animationMode) { delete config.animationMode; changed = true }
  if (config.monitor) { delete config.monitor; changed = true }
  if (changed) await writeConfig(config)
}

async function publicConfig() {
  const config = await readConfig()
  return {
    alwaysOnTop: config.alwaysOnTop,
    clickThrough: config.clickThrough,
    hasApiKey: Boolean(decryptApiKey(config)),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    pricing: config.pricing,
  }
}

async function snapshot() {
  const [data, config] = await Promise.all([store.read(), readConfig()])
  const balance = data.balanceHistory.at(-1) || null
  return {
    balance,
    latest: data.records.at(-1) || null,
    summary: modules.summarize(data.records, config.pricing),
    records: data.records.slice(-12).reverse(),
  }
}

async function broadcastSnapshot() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('whale:snapshot', await snapshot())
}

async function recordUsage(input, source = 'loopback') {
  const config = await readConfig()
  const model = String(input.model || 'deepseek-v4-flash').slice(0, 80)
  const usage = modules.normalizeUsage(input.usage || input)
  if (usage.total <= 0) throw new Error('usage must contain at least one token')
  const { family, rates } = modules.resolveRates(model, config.pricing)
  const calculated = modules.calculateCost(usage, rates)
  const record = {
    id: randomUUID(),
    timestamp: Date.now(),
    source,
    model,
    family,
    usage,
    rates,
    cost: calculated.totalCost,
  }
  await store.update((data) => {
    data.records.push(record)
    if (data.records.length > 50_000) data.records.splice(0, data.records.length - 50_000)
    return data
  })
  await broadcastSnapshot()
  return record
}

async function refreshBalance() {
  const config = await readConfig()
  const apiKey = decryptApiKey(config)
  if (!apiKey) throw new Error('请先在设置中保存 DeepSeek API Key')
  const response = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`余额接口返回 HTTP ${response.status}`)
  const payload = await readResponseJson(response, 256 * 1024)
  const info = Array.isArray(payload.balance_infos) ? payload.balance_infos[0] : null
  const balance = {
    timestamp: Date.now(),
    available: Boolean(payload.is_available),
    currency: info?.currency || 'CNY',
    total: Number(info?.total_balance || 0),
    granted: Number(info?.granted_balance || 0),
    toppedUp: Number(info?.topped_up_balance || 0),
  }
  await store.update((data) => {
    data.balanceHistory.push(balance)
    if (data.balanceHistory.length > 366) data.balanceHistory.shift()
    return data
  })
  mainWindow?.webContents.send('whale:pet-state', { state: 'success', balance })
  await broadcastSnapshot()
  return balance
}

async function askWhale(question) {
  const now = Date.now()
  if (chatInFlight) throw new Error('小鲸鱼还在回答上一条问题，请稍等一下')
  if (now - lastChatAt < 1500) throw new Error('问得太快啦，让小鲸鱼喘口气～')
  const config = await readConfig()
  const apiKey = decryptApiKey(config)
  if (!apiKey) throw new Error('请先在设置中安全保存 DeepSeek API Key')
  const requestBody = modules.createChatRequest(question)
  chatInFlight = true
  lastChatAt = now
  emitPetState('working', { message: '让我甩甩鲸尾想一想…' })
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`问答接口返回 HTTP ${response.status}`)
    const result = modules.parseChatResponse(await readResponseJson(response, 1024 * 1024))
    if (result.usage) await recordUsage({ model: result.model, usage: result.usage }, 'pet-chat')
    emitPetState('chat', { message: result.answer })
    return result
  } finally {
    chatInFlight = false
  }
}

function emitPetState(state, detail = {}) {
  mainWindow?.webContents.send('whale:pet-state', { state, ...detail })
}

async function readResponseJson(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new Error('远端响应超过安全大小限制')
  if (!response.body) return {}
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('远端响应超过安全大小限制')
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  try { return text ? JSON.parse(text) : {} } catch { throw new Error('远端返回了无效 JSON') }
}

function applyWindowSize() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const target = panelOpen ? PANEL_SIZE : bubbleExpanded ? BUBBLE_SIZE : COMPACT_SIZE
  const bounds = mainWindow.getBounds()
  if (bounds.width === target.width && bounds.height === target.height) return
  mainWindow.setBounds({ x: bounds.x + bounds.width - target.width, y: bounds.y + bounds.height - target.height, ...target }, true)
}

function trayIcon() {
  const character = nativeImage.createFromPath(path.join(projectRoot, 'assets', 'whale', 'whale-maid.png'))
  if (!character.isEmpty()) return character
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect rx="9" width="32" height="32" fill="#0ea5e9"/><path d="M7 18c2.5 5 12.5 6 17-1-3 1-5-1-5-4-4 4-8 2-12 5Z" fill="white"/><circle cx="12" cy="15" r="1.5" fill="#0c4a6e"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

function createTray() {
  tray = new Tray(trayIcon().resize({ width: 20, height: 20 }))
  tray.setToolTip('小鲸鱼看板娘')
  const show = () => { mainWindow.show(); mainWindow.focus() }
  tray.on('click', show)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示小鲸鱼', click: show },
    { label: '刷新余额', click: () => refreshBalance().catch((error) => mainWindow.webContents.send('whale:pet-state', { state: 'error', message: error.message })) },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
}

async function createWindow() {
  const config = await readConfig()
  mainWindow = new BrowserWindow({
    ...COMPACT_SIZE,
    transparent: true,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  if (smokeMode) {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const artifactDir = path.join(process.cwd(), 'artifacts')
      await fs.mkdir(artifactDir, { recursive: true })
      mainWindow.webContents.send('whale:pet-state', { state: 'dragging' })
      await new Promise((resolve) => setTimeout(resolve, 350))
      const dragImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-drag.png'), dragImage.toPNG())
      mainWindow.webContents.send('whale:pet-state', { state: 'headpat' })
      await new Promise((resolve) => setTimeout(resolve, 350))
      const headpatUi = await mainWindow.webContents.executeJavaScript(`({state:document.getElementById('petStage').className,label:document.getElementById('statusPill').textContent})`)
      if (!headpatUi.state.includes('state-headpat') || headpatUi.label !== '小鲸鱼蹭蹭') throw new Error(`smoke headpat label failed: ${JSON.stringify(headpatUi)}`)
      const headpatImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-headpat.png'), headpatImage.toPNG())
      mainWindow.webContents.send('whale:pet-state', { state: 'chat', message: '好呀～' })
      await new Promise((resolve) => setTimeout(resolve, 250))
      const shortBubbleLayout = await mainWindow.webContents.executeJavaScript(`(()=>{const rect=document.getElementById('speechBubble').getBoundingClientRect();return {height:rect.height,top:rect.top,bottom:rect.bottom,windowHeight:innerHeight}})()`)
      if (shortBubbleLayout.height > 56 || shortBubbleLayout.top < 0 || mainWindow.getBounds().height !== COMPACT_SIZE.height) throw new Error(`smoke short bubble sizing failed: ${JSON.stringify(shortBubbleLayout)}`)
      const shortBubbleImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-short-bubble.png'), shortBubbleImage.toPNG())
      mainWindow.webContents.send('whale:pet-state', { state: 'idle' })
      await new Promise((resolve) => setTimeout(resolve, 300))
      const staticSources = await mainWindow.webContents.executeJavaScript(`(async()=>{const first=document.querySelector('.pet-image.is-visible').getAttribute('src');await new Promise(r=>setTimeout(r,500));return [first,document.querySelector('.pet-image.is-visible').getAttribute('src'),Boolean(document.getElementById('actionWheel')),Boolean(document.getElementById('animationMode'))]})()`)
      if (staticSources[0] !== staticSources[1] || !/whale-(maid|idle-(swing|game|movie|running))\.png/.test(staticSources[0]) || !staticSources[2] || staticSources[3]) throw new Error(`smoke static idle mode failed: ${staticSources.join(',')}`)
      await mainWindow.webContents.executeJavaScript("document.getElementById('petStage').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))")
      await new Promise((resolve) => setTimeout(resolve, 250))
      const wheelImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-wheel.png'), wheelImage.toPNG())
      await mainWindow.webContents.executeJavaScript("document.querySelector('[data-idle=game]').click()")
      await new Promise((resolve) => setTimeout(resolve, 300))
      const gameSources = await mainWindow.webContents.executeJavaScript(`(async()=>{const first=document.querySelector('.pet-image.is-visible').getAttribute('src');await new Promise(r=>setTimeout(r,450));return [first,document.querySelector('.pet-image.is-visible').getAttribute('src')]})()`)
      if (gameSources[0] !== gameSources[1] || !/whale-idle-game\.png/.test(gameSources[0])) throw new Error(`smoke static game idle failed: ${gameSources.join(',')}`)
      await mainWindow.webContents.executeJavaScript("document.getElementById('statusPill').click()")
      await new Promise((resolve) => setTimeout(resolve, 300))
      const chatUi = await mainWindow.webContents.executeJavaScript(`({chatVisible:!document.getElementById('petChat').classList.contains('hidden'),hasQuestion:Boolean(document.getElementById('chatQuestion')),hasMonitor:Boolean(document.getElementById('monitorEnabled')),button:document.getElementById('statusPill').textContent})`)
      if (!chatUi.chatVisible || !chatUi.hasQuestion || chatUi.hasMonitor) throw new Error(`smoke direct pet chat failed: ${JSON.stringify(chatUi)}`)
      const petChatImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-pet-chat.png'), petChatImage.toPNG())
      await mainWindow.webContents.executeJavaScript("document.getElementById('closePetChat').click()")
      await new Promise((resolve) => setTimeout(resolve, 250))
      mainWindow.webContents.send('whale:pet-state', { state: 'chat', message: `今天的大概要点是：${'经济和科技新闻都有新变化，小鲸鱼会认真说明。'.repeat(10)}` })
      await new Promise((resolve) => setTimeout(resolve, 500))
      const bubbleLayout = await mainWindow.webContents.executeJavaScript(`(()=>{const rect=document.getElementById('speechBubble').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,height:innerHeight,text:document.getElementById('bubbleText').textContent}})()`)
      if (mainWindow.getBounds().height !== BUBBLE_SIZE.height || bubbleLayout.top < 0 || bubbleLayout.bottom > bubbleLayout.height || bubbleLayout.text.includes('…')) throw new Error(`smoke long bubble layout failed: ${JSON.stringify(bubbleLayout)}`)
      const longBubbleImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-long-bubble.png'), longBubbleImage.toPNG())
      await mainWindow.webContents.executeJavaScript("document.getElementById('petStage').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))")
      await new Promise((resolve) => setTimeout(resolve, 350))
      const securityUi = await mainWindow.webContents.executeJavaScript(`({security:document.getElementById('securityStatus').textContent,hasIntegration:Boolean(document.getElementById('integrationToken') || document.querySelector('.integration-box')),hasMonitor:Boolean(document.getElementById('monitorEnabled')),hasChat:Boolean(document.getElementById('chatQuestion'))})`)
      if (!securityUi.security.includes('加密已启用') || securityUi.hasIntegration || securityUi.hasMonitor || !securityUi.hasChat) throw new Error(`smoke security UI failed: ${JSON.stringify(securityUi)}`)
      const settingsImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-settings.png'), settingsImage.toPNG())
      await mainWindow.webContents.executeJavaScript("document.getElementById('settings').classList.add('hidden');document.getElementById('dashboard').classList.remove('hidden')")
      await new Promise((resolve) => setTimeout(resolve, 350))
      const textLayout = await mainWindow.webContents.executeJavaScript(`(()=>{const bubble=getComputedStyle(document.getElementById('speechBubble'));return {dashboardVisible:!document.getElementById('dashboard').classList.contains('hidden'),dashboardHasChat:Boolean(document.querySelector('#dashboard .chat-box')),bubbleHidden:bubble.display==='none'}})()`)
      if (!textLayout.dashboardVisible || textLayout.dashboardHasChat || !textLayout.bubbleHidden) throw new Error(`smoke dashboard layout failed: ${JSON.stringify(textLayout)}`)
      const dashboardImage = await mainWindow.webContents.capturePage()
      await fs.writeFile(path.join(artifactDir, 'smoke-dashboard.png'), dashboardImage.toPNG())
      quitting = true
      app.quit()
      } catch (error) {
        console.error('[smoke]', error)
        quitting = true
        app.exit(1)
      }
    })
  }
  mainWindow.on('close', (event) => {
    if (!quitting) { event.preventDefault(); mainWindow.hide() }
  })
}

function assertTrustedRenderer(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || ''
  const expected = pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href
  if (senderUrl !== expected) throw new Error('拒绝来自非本地界面的请求')
}

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedRenderer(event)
    return listener(event, ...args)
  })
}

function registerIpc() {
  handle('whale:get-snapshot', () => snapshot())
  handle('whale:get-config', () => publicConfig())
  handle('whale:refresh-balance', () => refreshBalance())
  handle('whale:ask', (_event, question) => askWhale(question))
  handle('whale:save-config', async (_event, patch) => {
    const current = await readConfig()
    if (typeof patch.apiKey === 'string') {
      const apiKey = patch.apiKey.trim()
      if (apiKey) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，已拒绝以明文保存 API Key')
        current.apiKeyEncrypted = safeStorage.encryptString(apiKey).toString('base64')
        current.apiKeyPlainFallback = ''
      } else {
        current.apiKeyEncrypted = ''
        current.apiKeyPlainFallback = ''
      }
    }
    if (patch.pricing) current.pricing = {
      flash: { ...current.pricing.flash, ...patch.pricing.flash },
      pro: { ...current.pricing.pro, ...patch.pricing.pro },
    }
    if (typeof patch.alwaysOnTop === 'boolean') current.alwaysOnTop = patch.alwaysOnTop
    if (typeof patch.clickThrough === 'boolean') current.clickThrough = patch.clickThrough
    await writeConfig(current)
    return publicConfig()
  })
  handle('whale:set-always-on-top', async (_event, value) => {
    mainWindow.setAlwaysOnTop(Boolean(value))
    const current = await readConfig(); current.alwaysOnTop = Boolean(value); await writeConfig(current)
  })
  handle('whale:set-click-through', async (_event, value) => {
    mainWindow.setIgnoreMouseEvents(Boolean(value), { forward: true })
    const current = await readConfig(); current.clickThrough = Boolean(value); await writeConfig(current)
  })
  handle('whale:open-data-directory', () => shell.openPath(app.getPath('userData')))
  handle('whale:set-panel-open', (_event, value) => { panelOpen = Boolean(value); if (panelOpen) bubbleExpanded = false; applyWindowSize() })
  handle('whale:set-bubble-expanded', (_event, value) => { bubbleExpanded = Boolean(value) && !panelOpen; applyWindowSize() })
  handle('whale:begin-drag', () => {
    if (dragTimer || !mainWindow) return
    dragAnchor = { cursor: screen.getCursorScreenPoint(), bounds: mainWindow.getBounds() }
    dragTimer = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !dragAnchor) return
      const cursor = screen.getCursorScreenPoint()
      mainWindow.setPosition(
        dragAnchor.bounds.x + cursor.x - dragAnchor.cursor.x,
        dragAnchor.bounds.y + cursor.y - dragAnchor.cursor.y,
        false,
      )
    }, 16)
  })
  handle('whale:end-drag', () => {
    clearInterval(dragTimer)
    dragTimer = null
    dragAnchor = null
  })
  handle('whale:minimize', () => mainWindow.hide())
  handle('whale:quit', () => { quitting = true; app.quit() })
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) return app.quit()
  await loadModules()
  const userData = app.getPath('userData')
  store = new modules.JsonStore(path.join(userData, 'usage.json'))
  configPath = path.join(userData, 'config.json')
  await initializeSecureConfig()
  registerIpc()
  await createWindow()
  createTray()
})

app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
app.on('window-all-closed', (event) => event.preventDefault())
app.on('before-quit', () => { quitting = true; clearInterval(dragTimer) })

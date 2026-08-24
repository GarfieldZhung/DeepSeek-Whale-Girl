import { pickDialogue } from './dialogues.js'

const api = window.whaleAPI
const $ = (id) => document.getElementById(id)
const dashboard = $('dashboard')
const settings = $('settings')
const petChat = $('petChat')
const petLayers = [$('petSprite'), $('petSpriteNext')]
const petStage = $('petStage')
const bubble = $('speechBubble')
const actionWheel = $('actionWheel')
const staticIdleAssets = {
  hover: '../assets/whale/whale-maid.png',
  swing: '../assets/whale/whale-idle-swing.png',
  game: '../assets/whale/whale-idle-game.png',
  movie: '../assets/whale/whale-idle-movie.png',
  running: '../assets/whale/whale-idle-running.png',
}
const petAssets = {
  idle: staticIdleAssets.hover,
  working: '../assets/whale/whale-working-desk.png',
  dragging: '../assets/whale/whale-drag-panic.png',
  busy: '../assets/whale/whale-busy-cry.png',
  headpat: '../assets/whale/whale-headpat.png',
  success: '../assets/whale/whale-satiated.png',
  error: '../assets/whale/whale-maid.png',
  bite: '../assets/whale/whale-bite-hand.png',
  chat: '../assets/whale/whale-maid.png',
}
Object.values({ ...petAssets, ...staticIdleAssets }).forEach((src) => { const image = new Image(); image.src = src })
let stateVersion = 0
let longPressTimer
let dragging = false
let suppressClickUntil = 0
let activePetLayer = 0
let selectedIdle = localStorage.getItem('whaleIdleMode') || 'hover'
if (!staticIdleAssets[selectedIdle]) selectedIdle = 'hover'
let patCount = 0
let patResetTimer
let patCooldownUntil = 0
let singleClickTimer
let idleChatterTimer
let currentPetState = 'idle'
let duckAudioContext
let bubbleVersion = 0

const fmtTokens = (value = 0) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}
const fmtYuan = (value = 0) => `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: value >= 1 ? 2 : 4, maximumFractionDigits: value >= 1 ? 2 : 6 })}`

function playDuckSqueak() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  duckAudioContext ||= new AudioContext()
  const now = duckAudioContext.currentTime
  const oscillator = duckAudioContext.createOscillator()
  const gain = duckAudioContext.createGain()
  const filter = duckAudioContext.createBiquadFilter()
  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(760, now)
  oscillator.frequency.exponentialRampToValueAtTime(430, now + 0.075)
  oscillator.frequency.exponentialRampToValueAtTime(610, now + 0.18)
  filter.type = 'bandpass'
  filter.frequency.value = 1150
  filter.Q.value = 2.1
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  oscillator.connect(filter).connect(gain).connect(duckAudioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.23)
}

const thinkingLines = ['让我甩甩鲸尾想想…', '正在把问题揉成小蛋糕…', '唔，答案快浮上来啦…', '再眨一下眼就想好啦…']

async function askQuestion() {
  const question = $('chatQuestion').value.trim()
  if (!question) return setPetState('error', { message: '先写下想问的问题呀～' })
  const button = $('askWhale')
  button.disabled = true
  setPetChat(false)
  let index = 0
  $('chatStatus').textContent = thinkingLines[index]
  speak(thinkingLines[index], true)
  const chatter = setInterval(() => {
    index = (index + 1) % thinkingLines.length
    $('chatStatus').textContent = thinkingLines[index]
    speak(thinkingLines[index], true)
  }, 1800)
  try {
    const result = await api.ask(question)
    $('chatStatus').textContent = '回答完成 · 内容未在本地留存'
    $('chatQuestion').value = ''
    setPetState('chat', { message: result.answer })
  } catch (error) {
    $('chatStatus').textContent = '这次没答上来'
    setPetState('error', { message: error.message })
  } finally {
    clearInterval(chatter)
    button.disabled = false
  }
}

function speak(text, persistent = false) {
  const version = ++bubbleVersion
  const content = String(text || '')
  $('bubbleText').textContent = content
  bubble.classList.remove('is-busy')
  bubble.classList.remove('pop')
  bubble.classList.toggle('is-short', content.length <= 28 && !content.includes('\n'))
  bubble.classList.toggle('is-long', content.length > 120 || content.split('\n').length > 4)
  void bubble.offsetWidth
  if (!persistent) bubble.classList.add('pop')
  requestAnimationFrame(() => {
    if (version !== bubbleVersion || bubble.classList.contains('is-panel-hidden')) return
    api.setBubbleExpanded(bubble.scrollHeight > 92)
  })
  if (!persistent) setTimeout(() => {
    if (version === bubbleVersion) api.setBubbleExpanded(false)
  }, 2850)
}

function scheduleIdleChatter() {
  clearTimeout(idleChatterTimer)
  if (currentPetState !== 'idle') return
  idleChatterTimer = setTimeout(() => {
    if (currentPetState !== 'idle' || !dashboard.classList.contains('hidden') || !settings.classList.contains('hidden') || !petChat.classList.contains('hidden')) return scheduleIdleChatter()
    speak(pickDialogue(selectedIdle === 'hover' ? 'idle' : selectedIdle))
    scheduleIdleChatter()
  }, 18000 + Math.random() * 12000)
}

function transitionPet(state, assetOverride = null, extraClass = '') {
  clearTimeout(idleChatterTimer)
  currentPetState = state
  const previous = petLayers[activePetLayer]
  const nextIndex = 1 - activePetLayer
  const next = petLayers[nextIndex]
  next.src = assetOverride || (state === 'idle' ? staticIdleAssets[selectedIdle] : (petAssets[state] || petAssets.idle))
  next.className = `pet-image state-${state}${state === 'idle' ? ` idle-${selectedIdle} idle-float` : ''}${extraClass ? ` ${extraClass}` : ''}`
  void next.offsetWidth
  previous.classList.remove('is-visible')
  next.classList.add('is-visible')
  setTimeout(() => {
    if (activePetLayer === nextIndex) previous.className = 'pet-image'
  }, 260)
  activePetLayer = nextIndex
  petStage.className = `pet-stage state-${state} idle-${selectedIdle}${dragging ? ' is-long-pressing' : ''}`
  if (state === 'idle') scheduleIdleChatter()
}

function changeIdleMode(mode) {
  if (!staticIdleAssets[mode]) return
  selectedIdle = mode
  localStorage.setItem('whaleIdleMode', selectedIdle)
  actionWheel.classList.add('hidden')
  actionWheel.querySelectorAll('[data-idle]').forEach((button) => button.classList.toggle('selected', button.dataset.idle === selectedIdle))
  speak(pickDialogue(mode === 'hover' ? 'idle' : mode))
  setPetState('idle')
}

function setPetState(state, detail = {}) {
  const version = ++stateVersion
  transitionPet(state)
  const label = { idle: '问问小鲸鱼', working: '小鲸鱼思考中…', dragging: '放我下来！', headpat: '小鲸鱼蹭蹭', bite: '摸头冷却中', busy: '小鲸鱼忙不过来啦', success: '小鲸鱼吃饱啦', chat: '继续问小鲸鱼', error: '小鲸鱼出错了' }[state] || state
  $('statusPill').textContent = label
  if (state === 'working') {
    speak(detail.message || pickDialogue('working'), true)
  } else if (state === 'dragging') {
    speak(pickDialogue('dragging'), true)
  } else if (state === 'headpat') {
    speak(pickDialogue('headpat'))
  } else if (state === 'bite') {
    speak(pickDialogue('bite'), true)
  } else if (state === 'busy') {
    bubble.classList.add('is-busy')
    speak(detail.message || pickDialogue('busy'), true)
    bubble.classList.add('is-busy')
  } else if (state === 'success' && detail.record) {
    speak(`${pickDialogue('success')} 这轮 ${fmtTokens(detail.record.usage.total)} tokens，${fmtYuan(detail.record.cost)}。`)
  } else if (state === 'success' && detail.balance) {
    speak(`余额还有 ${fmtYuan(detail.balance.total)}。${pickDialogue('balance')}`)
  } else if (state === 'success') {
    speak(pickDialogue('success'))
  } else if (state === 'chat') {
    speak(detail.message || '回答送到啦～', true)
  } else if (state === 'error') {
    speak(detail.message || pickDialogue('error'))
  }
  const resumeState = detail.resumeState || 'idle'
  const duration = state === 'busy' ? 3800 : state === 'success' ? 10000 : state === 'headpat' ? 2200 : state === 'bite' ? 4200 : state === 'error' ? 3000 : 0
  if (duration) setTimeout(() => { if (version === stateVersion) setPetState(resumeState) }, duration)
}

function render(snapshot) {
  const today = snapshot.summary.today
  const month = snapshot.summary.month
  $('todayCost').textContent = fmtYuan(today.cost)
  $('todayTokens').textContent = fmtTokens(today.total)
  $('monthCost').textContent = fmtYuan(month.cost)
  $('monthRequests').textContent = String(month.requests)
  $('hitTokens').textContent = fmtTokens(today.hit)
  $('missTokens').textContent = fmtTokens(today.miss)
  $('outputTokens').textContent = fmtTokens(today.output)
  $('balance').textContent = snapshot.balance ? fmtYuan(snapshot.balance.total) : '未连接'
  $('settingsBalance').textContent = snapshot.balance ? fmtYuan(snapshot.balance.total) : '未连接'
  $('togglePanel').textContent = snapshot.balance ? fmtYuan(snapshot.balance.total) : '余额'
}

async function load() {
  render(await api.getSnapshot())
  const config = await api.getConfig()
  $('alwaysOnTop').checked = config.alwaysOnTop
  $('securityStatus').textContent = config.encryptionAvailable ? '系统加密已启用' : '系统加密不可用'
  $('securityStatus').classList.toggle('warning', !config.encryptionAvailable)
  actionWheel.querySelectorAll('[data-idle]').forEach((button) => button.classList.toggle('selected', button.dataset.idle === selectedIdle))
  setPetState('idle')
}

function setPanel(panel = null) {
  dashboard.classList.toggle('hidden', panel !== 'dashboard')
  settings.classList.toggle('hidden', panel !== 'settings')
  petChat.classList.add('hidden')
  bubble.classList.toggle('is-panel-hidden', Boolean(panel))
  if (panel) api.setBubbleExpanded(false)
  actionWheel.classList.add('hidden')
  api.setPanelOpen(Boolean(panel))
}

function setPetChat(open) {
  petChat.classList.toggle('hidden', !open)
  dashboard.classList.add('hidden')
  settings.classList.add('hidden')
  bubble.classList.toggle('is-panel-hidden', open)
  actionWheel.classList.add('hidden')
  api.setBubbleExpanded(false)
  api.setPanelOpen(open)
  if (open) {
    $('chatStatus').textContent = '对话不会保存在本地'
    setTimeout(() => $('chatQuestion').focus(), 120)
  }
}

$('togglePanel').addEventListener('click', () => setPanel(dashboard.classList.contains('hidden') ? 'dashboard' : null))
petStage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  if (event.target.closest('#statusPill')) return
  petStage.setPointerCapture(event.pointerId)
  longPressTimer = setTimeout(async () => {
    dragging = true
    suppressClickUntil = Date.now() + 500
    petStage.classList.add('is-long-pressing')
    setPetState('dragging')
    await api.beginDrag()
  }, 360)
})
const finishLongPress = async () => {
  clearTimeout(longPressTimer)
  if (!dragging) return
  dragging = false
  petStage.classList.remove('is-long-pressing')
  await api.endDrag()
  setPetState('idle')
}
petStage.addEventListener('pointerup', finishLongPress)
petStage.addEventListener('pointercancel', finishLongPress)
petStage.addEventListener('lostpointercapture', finishLongPress)
petStage.addEventListener('click', (event) => {
  if (event.target.closest('#statusPill')) return
  if (Date.now() < suppressClickUntil) return
  clearTimeout(singleClickTimer)
  singleClickTimer = setTimeout(() => {
    playDuckSqueak()
    if (Date.now() < patCooldownUntil) {
      speak(pickDialogue('patCooldown'))
      return
    }
    patCount += 1
    clearTimeout(patResetTimer)
    patResetTimer = setTimeout(() => { patCount = 0 }, 15000)
    if (patCount >= 5) {
      patCount = 0
      patCooldownUntil = Date.now() + 30000
      setPetState('bite')
    } else setPetState('headpat')
  }, 240)
})
petStage.addEventListener('dblclick', () => {
  clearTimeout(singleClickTimer)
  actionWheel.classList.toggle('hidden')
})
petStage.addEventListener('contextmenu', (event) => { event.preventDefault(); setPanel('settings') })
$('statusPill').addEventListener('click', (event) => { event.stopPropagation(); setPetChat(true) })
$('statusPill').addEventListener('dblclick', (event) => event.stopPropagation())
actionWheel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-idle]')
  if (button) changeIdleMode(button.dataset.idle)
})
$('closePanel').addEventListener('click', () => setPanel())
$('openSettings').addEventListener('click', () => setPanel('settings'))
$('closeSettings').addEventListener('click', () => setPanel())
$('closePetChat').addEventListener('click', () => setPetChat(false))
$('askWhale').addEventListener('click', askQuestion)
$('chatQuestion').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); askQuestion() }
})
$('refreshBalance').addEventListener('click', async () => { try { await api.refreshBalance() } catch (error) { setPetState('error', { message: error.message }) } })
$('settingsRefreshBalance').addEventListener('click', async () => { try { await api.refreshBalance() } catch (error) { setPetState('error', { message: error.message }) } })
$('saveSettings').addEventListener('click', async () => {
  const apiKey = $('apiKey').value
  try {
    await api.saveConfig({ apiKey: apiKey || undefined, alwaysOnTop: $('alwaysOnTop').checked })
    await api.setAlwaysOnTop($('alwaysOnTop').checked)
    $('apiKey').value = ''
    setPanel()
    speak('设置保存好啦～')
  } catch (error) { setPetState('error', { message: error.message }) }
})
$('openData').addEventListener('click', () => api.openDataDirectory())
$('minimize').addEventListener('click', () => api.minimize())
$('quit').addEventListener('click', () => api.quit())

api.onSnapshot(render)
api.onPetState((detail) => setPetState(detail.state, detail))
load().catch((error) => setPetState('error', { message: error.message }))

import { catalog, statusText, type Locale } from './i18n'

type ProcessInfo = { pid: number; state: 'running' | 'exited' }
type ProcessHandle = { info: ProcessInfo; stop(): Promise<void> }
type TabId = 'access' | 'status'
type StatusAvailability = 'loading' | 'fresh' | 'stale' | 'unavailable'
type StatusSource = 'unknown' | 'share-gateway' | 'supervisor-cli'
type StartPhase = 'idle' | 'preparing' | 'connecting' | 'cancelling'
type StartAttempt = {
  generationId?: string
  process?: ProcessHandle
  cancelRequested: boolean
  cancelPromise?: Promise<boolean>
}

type PluginContext = {
  reactive<T extends object>(value: T): T
  computed<T>(getter: () => T): { value: T }
  h: (...args: any[]) => any
  i18n?: {
    getLocale(): Locale
    onDidChangeLocale(callback: (locale: Locale) => void): { dispose(): void }
  }
  exec: { run(args: string[], options?: { timeout?: number }): Promise<{ code: number; stdout: string; stderr: string }> }
  process: { start(args: string[]): Promise<ProcessHandle> }
  storage: {
    get<T = any>(key: string): Promise<T | undefined>
    set(key: string, value: any): Promise<void>
  }
  commands: { register(id: string, handler: () => void): { dispose(): void } }
  ui: {
    notify(message: string, level?: 'info' | 'warn' | 'error', title?: string): void
    confirm(message: string): Promise<boolean>
  }
  open(): void
}

type TunnelStatus = {
  ok?: boolean
  state: string
  generationId?: string | null
  publicUrl?: string | null
  edgeLocation?: string | null
  error?: string | null
  gateway?: { healthy: boolean; authenticatedSessions: number; previewEnabled: boolean }
  metrics?: { streamsTotal: number; bytesIn: number; bytesOut: number; reconnects: number; authFailures: number }
}

type PublicTunnelStatus = {
  schemaVersion: number
  source: 'share-gateway'
  state: string
  generationId?: string | null
  publicUrl?: string | null
  edgeLocation?: string | null
  gateway?: TunnelStatus['gateway']
  metrics?: TunnelStatus['metrics']
  error?: { code?: string; message?: string } | null
}

type StoredSettings = {
  accessKey?: string
  customAccessKey?: string
}
type StoredAccess = { generationId: string; accessKey: string }

function generateAccessKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function parseJson<T>(stdout: unknown, locale: Locale, acceptErrorState = false): T {
  const text = catalog(locale)
  if (typeof stdout !== 'string') throw new Error(text.supervisorNoOutput)
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  if (!line) throw new Error(text.supervisorNoJson)
  const value = JSON.parse(line)
  if (!acceptErrorState && value.ok === false) throw new Error(value.error || text.supervisorFailed)
  return value as T
}

function bytes(value = 0) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function activate(ctx: PluginContext) {
  const state = ctx.reactive({
    status: { state: 'unknown' } as TunnelStatus,
    statusAvailability: 'loading' as StatusAvailability,
    statusSource: 'unknown' as StatusSource,
    statusError: null as string | null,
    lastStatusAt: null as number | null,
    statusFailures: 0,
    busy: false,
    startPhase: 'idle' as StartPhase,
    loaded: false,
    activeTab: 'access' as TabId,
    accessKey: '',
    keyVisible: true,
    locale: ctx.i18n?.getLocale() ?? 'en' as Locale,
  })
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let refreshInFlight: Promise<TunnelStatus | null> | undefined
  let statusAbort: AbortController | undefined
  let activeStart: StartAttempt | undefined
  let disposed = false
  const localeSubscription = ctx.i18n?.onDidChangeLocale((locale) => { state.locale = locale })
  const text = () => catalog(state.locale)

  async function run(args: string[], timeout = 30_000, acceptErrorState = false) {
    const result = await ctx.exec.run([...args, '--json'], { timeout }) as Partial<{
      code: number
      stdout: string
      stderr: string
      error: string
    }>
    if (typeof result?.code !== 'number') {
      throw new Error(result?.error || text().invalidCommandResponse)
    }
    if (result.code !== 0) {
      if (typeof result.stdout === 'string' && result.stdout.trim()) {
        try { parseJson(result.stdout, state.locale) } catch (error) { throw error }
      }
      throw new Error(result.stderr || text().commandFailed(result.code))
    }
    return parseJson<any>(result.stdout, state.locale, acceptErrorState)
  }

  async function storageSet(key: string, value: any) {
    try {
      await ctx.storage.set(key, value)
    } catch (error: any) {
      const message = String(error?.message || error)
      if (message.includes("Response with null body status cannot have body")) return
      throw error
    }
  }

  async function loadGatewayStatus(timeout: number): Promise<TunnelStatus | null> {
    if (state.statusSource === 'supervisor-cli') return null
    const controller = new AbortController()
    statusAbort = controller
    const timer = setTimeout(() => controller.abort(), Math.min(timeout, 3_000))
    try {
      const response = await fetch('/.dinotty-share/tunnel-status', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(text().statusHttpError(response.status))
      if (!response.headers.get('content-type')?.includes('application/json')) return null
      const value = await response.json() as Partial<PublicTunnelStatus>
      if (value.schemaVersion !== 1 || value.source !== 'share-gateway' || typeof value.state !== 'string') {
        return null
      }
      state.statusSource = 'share-gateway'
      return {
        ok: value.state !== 'error',
        state: value.state,
        generationId: value.generationId,
        publicUrl: value.publicUrl,
        edgeLocation: value.edgeLocation,
        gateway: value.gateway,
        metrics: value.metrics,
        error: value.error?.message || null,
      }
    } catch (error) {
      if (state.statusSource === 'unknown') return null
      throw error
    } finally {
      clearTimeout(timer)
      if (statusAbort === controller) statusAbort = undefined
    }
  }

  async function readStatus(timeout: number): Promise<TunnelStatus> {
    const gatewayStatus = await loadGatewayStatus(timeout)
    if (gatewayStatus) return gatewayStatus
    const status = await run(['status'], timeout, true) as TunnelStatus
    state.statusSource = 'supervisor-cli'
    return status
  }

  async function refreshOnce(silent: boolean, timeout: number): Promise<TunnelStatus | null> {
    try {
      const status = await readStatus(timeout)
      if (disposed) return null
      state.status = status
      state.statusAvailability = 'fresh'
      state.statusError = null
      state.lastStatusAt = Date.now()
      state.statusFailures = 0
      return status
    } catch (error: any) {
      if (disposed) return null
      const message = error?.name === 'AbortError'
        ? text().statusRequestFailed
        : error?.message || text().statusRequestFailed
      state.statusFailures += 1
      state.statusAvailability = state.lastStatusAt === null ? 'unavailable' : 'stale'
      state.statusError = message
      if (!silent) ctx.ui.notify(message, 'error', text().pluginName)
      return null
    }
  }

  function refresh(silent = false, timeout = 5_000): Promise<TunnelStatus | null> {
    if (refreshInFlight) return refreshInFlight
    const request = refreshOnce(silent, timeout).finally(() => {
      if (refreshInFlight === request) refreshInFlight = undefined
    })
    refreshInFlight = request
    return request
  }

  function schedulePoll() {
    if (disposed) return
    if (pollTimer) clearTimeout(pollTimer)
    const delay = state.statusFailures === 0
      ? 2_000
      : Math.min(15_000, 2_000 * 2 ** Math.min(state.statusFailures, 3))
    pollTimer = setTimeout(async () => {
      await refresh(true)
      schedulePoll()
    }, delay)
  }

  async function initialize() {
    try {
      const settings = await ctx.storage.get<StoredSettings>('settings')
      const current = await ctx.storage.get<StoredAccess>('current-access')
      state.accessKey = settings?.accessKey
        || settings?.customAccessKey
        || current?.accessKey
        || generateAccessKey()
      // Rewriting the compact schema removes proxy fields saved by older versions.
      await storageSet('settings', { accessKey: state.accessKey } satisfies StoredSettings)
      await refresh(true)
    } finally {
      state.loaded = true
      schedulePoll()
    }
  }

  async function saveSettings() {
    const accessKey = state.accessKey
    if (accessKey.length < 12 || accessKey.length > 256) {
      ctx.ui.notify(text().invalidAccessKeyMessage, 'error', text().invalidAccessKey)
      return
    }
    try {
      await storageSet('settings', { accessKey } satisfies StoredSettings)
      ctx.ui.notify(text().settingsSaved, 'info', text().pluginName)
    } catch (error: any) {
      ctx.ui.notify(error.message || String(error), 'error', text().unableToSave)
    }
  }

  async function start() {
    if (state.busy || state.status.state === 'connected') return
    const attempt: StartAttempt = { cancelRequested: false }
    activeStart = attempt
    state.busy = true
    state.startPhase = 'preparing'
    try {
      const args = ['prepare']
      args.push('--access-key', state.accessKey)
      args.push('--locale', state.locale)
      const prepared = await run(args)
      attempt.generationId = prepared.generationId
      state.accessKey = prepared.accessKey
      await storageSet('current-access', {
        generationId: prepared.generationId,
        accessKey: prepared.accessKey,
      } satisfies StoredAccess)
      state.status = { state: 'starting_gateway', generationId: prepared.generationId }
      state.statusAvailability = 'fresh'
      state.statusError = null
      attempt.process = await ctx.process.start(['run', '--generation', prepared.generationId, '--json'])
      state.startPhase = 'connecting'
      const timeoutSeconds = 50
      const deadline = Date.now() + timeoutSeconds * 1_000
      while (Date.now() < deadline) {
        if (attempt.cancelRequested && await attempt.cancelPromise) return
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, deadline - Date.now())))
        const remaining = deadline - Date.now()
        if (remaining <= 0) break
        const status = await refresh(true, Math.min(1_000, remaining))
        if (attempt.cancelRequested && await attempt.cancelPromise) return
        if (status?.state === 'connected') {
          return
        }
        if (status && (status.ok === false || status.state === 'error')) {
          throw new Error(status.error || text().tunnelStateError(status.state))
        }
      }
      throw new Error(text().tunnelTimeout(timeoutSeconds))
    } catch (error: any) {
      const cancelled = attempt.cancelRequested && await attempt.cancelPromise
      if (!cancelled) ctx.ui.notify(error.message, 'error', text().unableToConnect)
      await refresh(true)
    } finally {
      if (activeStart === attempt) {
        activeStart = undefined
        state.startPhase = 'idle'
        state.busy = false
      }
    }
  }

  async function cancelStart() {
    const attempt = activeStart
    if (!attempt?.process || state.startPhase !== 'connecting') return
    const markStopped = () => {
      state.status = { state: 'stopped' }
      state.statusAvailability = 'fresh'
      state.statusError = null
      state.lastStatusAt = Date.now()
      state.statusFailures = 0
    }
    attempt.cancelRequested = true
    state.startPhase = 'cancelling'
    attempt.cancelPromise = (async () => {
      let processStopError: unknown
      try {
        await attempt.process!.stop()
        await refresh(true)
        markStopped()
        return true
      } catch (error) {
        processStopError = error
      }

      try {
        if (!attempt.generationId) throw processStopError
        await run(['stop', '--generation', attempt.generationId], 20_000)
        await refresh(true)
        markStopped()
        return true
      } catch (error: any) {
        const status = await refresh(true)
        if (status && (status.state === 'stopped' || status.state === 'error')) {
          markStopped()
          return true
        }
        if (activeStart === attempt) {
          attempt.cancelRequested = false
          state.startPhase = 'connecting'
          ctx.ui.notify(error?.message || String(processStopError), 'error', text().unableToCancel)
        }
        return false
      }
    })()
    await attempt.cancelPromise
  }

  async function stop() {
    const generation = state.status.generationId
    if (!generation || !(await ctx.ui.confirm(text().stopConfirmation))) return
    state.busy = true
    try {
      await run(['stop', '--generation', generation], 20_000)
      await refresh(true)
    } catch (error: any) {
      ctx.ui.notify(error.message, 'error', text().unableToStop)
    } finally {
      state.busy = false
    }
  }

  const connected = ctx.computed(() => state.status.state === 'connected')
  const displayedStatus = ctx.computed(() => {
    if (state.statusAvailability === 'unavailable') return text().statusUnavailable
    const value = statusText(state.locale, state.status.state)
    return state.statusAvailability === 'stale'
      ? `${value} · ${text().statusStaleSuffix}`
      : value
  })
  const tunnelUrl = ctx.computed(() => {
    if (!state.status.publicUrl || !state.accessKey) return state.status.publicUrl || ''
    const url = new URL(state.status.publicUrl)
    url.searchParams.set('access_key', state.accessKey)
    return url.toString()
  })

  async function copy(value: string, label: string, silent = false) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    if (!silent) ctx.ui.notify(text().copied(label), 'info', text().pluginName)
  }

  function button(label: any, action: () => unknown, className = '', disabled = false, allowWhileBusy = false) {
    return ctx.h('button', { type: 'button', class: `cfqt-button ${className}`, disabled: (!allowWhileBusy && state.busy) || disabled, onClick: action }, label)
  }

  function connectButton() {
    const cancellable = state.startPhase === 'connecting'
    const starting = state.startPhase !== 'idle'
    const label = cancellable
      ? ctx.h('span', { class: 'cfqt-connect-label' }, [
          ctx.h('span', { class: 'cfqt-connect-label--connecting' }, text().connecting),
          ctx.h('span', { class: 'cfqt-connect-label--cancel' }, text().cancel),
        ])
      : ctx.h('span', null, state.startPhase === 'cancelling'
        ? text().cancelling
        : starting ? text().connecting : text().connect)
    const disabled = state.startPhase === 'idle'
      ? !state.loaded || state.statusAvailability !== 'fresh'
      : !cancellable
    const className = `cfqt-button--primary cfqt-generate cfqt-generate--cloudflare${starting ? ' is-busy' : ''}${cancellable ? ' is-cancellable' : ''}`
    return button([cloudflareMark(), label], cancellable ? cancelStart : start, className, disabled, cancellable)
  }

  function cloudflareMark() {
    return ctx.h('svg', { class: 'cfqt-cloudflare-mark', viewBox: '54 2 50 25', 'aria-hidden': 'true', focusable: 'false' }, [
      ctx.h('path', { d: 'M88.1 24c.3-1 .2-2-.3-2.6-.5-.6-1.2-1-2.1-1.1l-17.4-.2c-.1 0-.2-.1-.3-.1-.1-.1-.1-.2 0-.3.1-.2.2-.3.4-.3l17.5-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6c0-.1.1-.2 0-.3-1.1-5.1-5.7-8.9-11.1-8.9-5 0-9.3 3.2-10.8 7.7-1-.7-2.2-1.1-3.6-1-2.4.2-4.3 2.2-4.6 4.6-.1.6 0 1.2.1 1.8-3.9.1-7.1 3.3-7.1 7.3 0 .4 0 .7.1 1.1 0 .2.2.3.3.3h32.1c.2 0 .4-.1.4-.3l.3-1.1z' }),
      ctx.h('path', { d: 'M93.6 12.8h-.5c-.1 0-.2.1-.3.2l-.7 2.4c-.3 1-.2 2 .3 2.6.5.6 1.2 1 2.1 1.1l3.7.2c.1 0 .2.1.3.1.1.1.1.2 0 .3-.1.2-.2.3-.4.3l-3.8.2c-2.1.1-4.3 1.8-5.1 3.8l-.2.9c-.1.1 0 .3.2.3h13.2c.2 0 .3-.1.3-.3.2-.8.4-1.7.4-2.6 0-5.2-4.3-9.5-9.5-9.5' }),
    ])
  }

  function field(label: string, value: string) {
    return ctx.h('div', { class: 'cfqt-fact' }, [ctx.h('span', null, label), ctx.h('strong', null, value)])
  }

  function accessPanel() {
    return ctx.h('div', { class: 'cfqt-tab-panel' }, [
      ctx.h('div', { class: 'cfqt-setting' }, [
        ctx.h('div', { class: 'cfqt-setting-copy' }, [
          ctx.h('strong', null, text().accessKey),
          ctx.h('p', null, connected.value
            ? text().activeKeyDescription
            : text().inactiveKeyDescription),
        ]),
        ctx.h('div', { class: 'cfqt-secret-row' }, [
          ctx.h('input', {
            type: state.keyVisible ? 'text' : 'password',
            value: state.accessKey,
            disabled: connected.value || state.busy,
            placeholder: text().keyPlaceholder,
            onInput: (event: any) => { state.accessKey = event.target.value },
          }),
          button(state.keyVisible ? text().hide : text().show, () => { state.keyVisible = !state.keyVisible }),
          button(text().copy, () => copy(state.accessKey, text().accessKey), '', !state.accessKey),
          button(text().random, () => { state.accessKey = generateAccessKey() }, '', connected.value),
        ]),
      ]),
      ctx.h('div', { class: 'cfqt-panel-actions' }, [button(text().saveConfiguration, saveSettings, 'cfqt-button--primary')]),
    ])
  }

  function statusPanel() {
    const metrics = state.status.metrics
    return ctx.h('div', { class: 'cfqt-tab-panel' }, [
      ctx.h('div', { class: 'cfqt-fact-grid' }, [
        field(text().state, displayedStatus.value),
        field(text().statusSource, state.statusSource === 'share-gateway'
          ? text().sourceGateway
          : state.statusSource === 'supervisor-cli' ? text().sourceSupervisor : text().sourceUnknown),
        field(text().lastChecked, state.lastStatusAt === null
          ? text().neverChecked
          : Date.now() - state.lastStatusAt < 2_000
            ? text().checkedJustNow
            : text().checkedSecondsAgo(Math.floor((Date.now() - state.lastStatusAt) / 1_000))),
        field(text().cloudflareEdge, state.status.edgeLocation || text().pending),
        field(text().streams, String(metrics?.streamsTotal ?? 0)),
        field(text().reconnects, String(metrics?.reconnects ?? 0)),
        field(text().received, bytes(metrics?.bytesIn)),
        field(text().sent, bytes(metrics?.bytesOut)),
      ]),
      ctx.h('div', { class: 'cfqt-panel-actions' }, [button(text().refreshStatus, () => refresh())]),
    ])
  }

  const component = { setup() {
    void initialize()
    return () => ctx.h('div', { class: 'cfqt-shell' }, [ctx.h('main', { class: 'cfqt-window' }, [
      ctx.h('header', { class: 'cfqt-window-header' }, [
        ctx.h('div', null, [ctx.h('h1', null, text().pluginName), ctx.h('p', null, text().subtitle)]),
        ctx.h('span', { class: `cfqt-status cfqt-status--${state.statusAvailability === 'fresh' ? state.status.state : state.statusAvailability}` }, [ctx.h('i'), displayedStatus.value]),
      ]),
      ctx.h('section', { class: 'cfqt-search' }, [
        ctx.h('div', { class: 'cfqt-url-field' }, [
          ctx.h('span', { 'aria-hidden': 'true' }, '\u2315'),
          tunnelUrl.value
            ? ctx.h('a', { href: tunnelUrl.value, target: '_blank', rel: 'noreferrer' }, tunnelUrl.value)
            : ctx.h('span', { class: 'cfqt-placeholder' }, state.busy ? text().requestingTunnel : text().tunnelUrlPlaceholder),
          tunnelUrl.value ? button(text().copy, () => copy(tunnelUrl.value, text().tunnelLink, true), 'cfqt-button--compact') : null,
        ]),
        connected.value
          ? button(text().stop, stop, 'cfqt-button--danger cfqt-generate')
          : connectButton(),
      ]),
      state.status.error || state.statusError
        ? ctx.h('div', {
          class: state.statusAvailability === 'stale' ? 'cfqt-warning' : 'cfqt-error',
          role: 'alert',
        }, state.status.error || state.statusError)
        : null,
      ctx.h('nav', { class: 'cfqt-tabs', 'aria-label': text().tunnelSettings }, (['access', 'status'] as TabId[]).map((tab) =>
        ctx.h('button', { type: 'button', class: state.activeTab === tab ? 'active' : '', onClick: () => { state.activeTab = tab } }, tab === 'access' ? text().accessTab : text().statusTab))),
      state.activeTab === 'access' ? accessPanel() : statusPanel(),
    ])])
  } }

  const openCommand = ctx.commands.register('cloudflare-quick-tunnel.open', () => ctx.open())
  const stopCommand = ctx.commands.register('cloudflare-quick-tunnel.stop', stop)
  return { component, dispose() {
    disposed = true
    if (pollTimer) clearTimeout(pollTimer)
    statusAbort?.abort()
    localeSubscription?.dispose()
    openCommand.dispose()
    stopCommand.dispose()
  } }
}

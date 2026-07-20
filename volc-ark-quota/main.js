/**
 * volc-ark-quota
 *
 * Monitor series showing Volcano Engine Ark Flow Plan (AFP) quota:
 *   - 5-hour rolling window
 *   - weekly
 *   - monthly
 *
 * Each window is a MonitorSeries: framework samples `current()` at ~1s
 * and renders a 60-point percent Line chart in Settings -> Monitor,
 * plus a compact status bar entry with click-through popover.
 *
 * API: POST https://ark.cn-beijing.volcengineapi.com/?Action=GetAFPUsage&Version=2024-01-01
 * Auth: Volcano Engine signature v4 (HMAC-SHA256) with AK/SK.
 *
 *       The Agent Plan dedicated API Key (ark-...) only authorizes the
 *       inference API (/api/v3/*). It is NOT accepted by the Volcano
 *       OpenAPI quota endpoint, which requires AK/SK signing.
 *
 * Multi-account:
 *   The plugin manages a list of Volcano accounts in plugin storage.
 *   One account is "active" at a time -- its quota drives the 3 monitor
 *   series. Switch active account via the plugin's config tab or the
 *   command palette. Model mirrors cc-switch (multiple providers, one active).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ARK_HOST = 'ark.cn-beijing.volcengineapi.com'
const ARK_REGION = 'cn-beijing'
const ARK_SERVICE = 'ark'
const ARK_API_VERSION = '2024-01-01'
const ARK_ACTION = 'GetAFPUsage'
const ARK_ENDPOINT = `https://${ARK_HOST}`

const REFRESH_INTERVAL_MS = 300_000
const STORAGE_ACCOUNTS_KEY = 'accounts'
const STORAGE_ACTIVE_KEY = 'activeAccountId'

const WINDOWS = /** @type {const} */ (['fiveHour', 'weekly', 'monthly'])

const WINDOW_TO_API = {
  fiveHour: 'AFPFiveHour',
  weekly: 'AFPWeekly',
  monthly: 'AFPMonthly',
}

const WINDOW_META = {
  fiveHour: { label: '5h', tooltip: 'Volcano Ark · 5-hour rolling window', priority: 50 },
  weekly: { label: 'W', tooltip: 'Volcano Ark · weekly quota', priority: 52 },
  monthly: { label: 'M', tooltip: 'Volcano Ark · monthly quota', priority: 53 },
}

// ─── Crypto helpers (delegated to ctx.crypto so the plugin keeps working
// in non-secure HTTP contexts where crypto.subtle is unavailable) ───────────

/**
 * @param {PluginContext} ctx
 * @param {string} data
 * @returns {Promise<string>} lowercase hex
 */
async function sha256Hex(ctx, data) {
  const bytes = await ctx.crypto.hash('sha256', data)
  return ctx.crypto.toHex(bytes)
}

/**
 * @param {PluginContext} ctx
 * @param {Uint8Array | string} key
 * @param {string} data
 * @returns {Promise<Uint8Array>}
 */
async function hmacSha256(ctx, key, data) {
  return ctx.crypto.hmac('sha256', key, data)
}

// ─── Volcano Engine Signature v4 ────────────────────────────────────────────

function formatVolcDatetime(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

/**
 * Canonical AWS Sig v4 signing key derivation:
 *   k_date    = HMAC(secret, date)
 *   k_region  = HMAC(k_date,    region)
 *   k_service = HMAC(k_region,  service)
 *   k_signing = HMAC(k_service, "request")
 *
 * Matches the official volcenginesdkcore SignerV4.get_signing_secret_key_v4.
 *
 * @param {PluginContext} ctx
 * @param {string} secretKey
 * @param {string} shortDate  // YYYYMMDD
 * @returns {Promise<Uint8Array>}
 */
async function deriveSigningKey(ctx, secretKey, shortDate) {
  const kDate = await hmacSha256(ctx, secretKey, shortDate)
  const kRegion = await hmacSha256(ctx, kDate, ARK_REGION)
  const kService = await hmacSha256(ctx, kRegion, ARK_SERVICE)
  const kSigning = await hmacSha256(ctx, kService, 'request')
  return kSigning
}

/**
 * Sign and execute GetAFPUsage via curl (bypasses browser CORS).
 *
 * @param {PluginContext} ctx
 * @param {{ run: (args: string[], opts?: any) => Promise<{ code: number, stdout: string, stderr: string }> }} exec
 * @param {{ accessKey: string, secretKey: string }} creds
 * @returns {Promise<Record<string, { used: number, total: number, resetAt?: string }>>}
 */
async function fetchQuota(ctx, exec, creds) {
  const now = new Date()
  const datetime = formatVolcDatetime(now)
  const shortDate = datetime.slice(0, 8)

  const method = 'POST'
  const pathName = '/'
  const query = `Action=${ARK_ACTION}&Version=${ARK_API_VERSION}`
  const payload = '{}'
  const payloadHash = await sha256Hex(ctx, payload)

  // Match the official volcenginesdkcore SignerV4 exactly:
  // signed headers = {content-type, content-md5, host} ∪ {any X-* header}.
  // Each canonical header line ends with '\n' (creating a blank line before
  // the signed-headers list in canonical_request).
  const headers = {
    'Content-Type': 'application/json',
    'Host': ARK_HOST,
    'X-Content-Sha256': payloadHash,
    'X-Date': datetime,
  }
  const signedKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .filter((k) => k === 'content-type' || k === 'content-md5' || k === 'host' || k.startsWith('x-'))
    .sort()
  const canonicalHeaders = signedKeys
    .map((k) => {
      const originalKey = Object.keys(headers).find((h) => h.toLowerCase() === k)
      return `${k}:${headers[originalKey]}\n`
    })
    .join('')
  const signedHeaders = signedKeys.join(';')

  const canonicalRequest = [
    method,
    pathName,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const canonicalHash = await sha256Hex(ctx, canonicalRequest)

  const credentialScope = `${shortDate}/${ARK_REGION}/${ARK_SERVICE}/request`
  const stringToSign = `HMAC-SHA256\n${datetime}\n${credentialScope}\n${canonicalHash}`

  const signingKey = await deriveSigningKey(ctx, creds.secretKey, shortDate)
  const signatureBytes = await hmacSha256(ctx, signingKey, stringToSign)
  const signature = ctx.crypto.toHex(signatureBytes)

  const authorization =
    `HMAC-SHA256 Credential=${creds.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const curlArgs = [
    '-s',
    '-X',
    method,
    `${ARK_ENDPOINT}${pathName}?${query}`,
    '-H',
    `Host: ${ARK_HOST}`,
    '-H',
    `X-Date: ${datetime}`,
    '-H',
    `X-Content-Sha256: ${payloadHash}`,
    '-H',
    `Authorization: ${authorization}`,
    '-H',
    'Content-Type: application/json',
    '-d',
    payload,
    '--max-time',
    '10',
  ]

  const res = await exec.run(curlArgs)
  if (res.code !== 0) {
    throw new Error(`curl exited ${res.code}: ${res.stderr || res.stdout}`)
  }

  /** @type {{ ResponseMetadata?: { Error?: { Message?: string, Code?: string } }, error?: { code?: string, message?: string }, Result?: any }} */
  const parsed = JSON.parse(res.stdout)
  if (parsed.ResponseMetadata?.Error) {
    throw new Error(
      `Volcano API ${parsed.ResponseMetadata.Error.Code ?? 'Error'}: ${parsed.ResponseMetadata.Error.Message ?? ''}`,
    )
  }
  if (parsed.error) {
    throw new Error(
      `Volcano API ${parsed.error.code ?? 'Error'}: ${parsed.error.message ?? ''}`,
    )
  }
  if (!parsed.Result) {
    throw new Error(`Volcano API returned no Result: ${res.stdout.slice(0, 200)}`)
  }

  /** @param {any} raw */
  const toWindow = (raw) => {
    if (!raw) return null
    return {
      used: raw.Used,
      total: raw.Quota,
      resetAt: raw.ResetTime > 0 ? new Date(raw.ResetTime * 1000).toISOString() : undefined,
    }
  }

  const result = {}
  for (const w of WINDOWS) {
    result[w] = toWindow(parsed.Result[WINDOW_TO_API[w]])
  }
  return result
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

/**
 * @param {PluginContext} ctx
 * @returns {PluginExports}
 */
export function activate(ctx) {
  const h = ctx.h

  /** @typedef {{ id: string, label: string, accessKey: string, secretKey: string }} Account */

  /** @type {import('vue').Ref<Account[]>} */
  const accounts = ctx.ref(/** @type {Account[]} */ ([]))

  /** @type {import('vue').Ref<string | null>} */
  const activeAccountId = ctx.ref(/** @type {string | null} */ (null))

  /** Quota data for the active account, keyed by window. */
  const quota = ctx.reactive({
    fiveHour: /** @type {null | { used: number, total: number, resetAt?: string }} */ (null),
    daily: /** @type {null | { used: number, total: number, resetAt?: string }} */ (null),
    weekly: /** @type {null | { used: number, total: number, resetAt?: string }} */ (null),
    monthly: /** @type {null | { used: number, total: number, resetAt?: string }} */ (null),
  })

  const lastError = ctx.ref('')
  const lastRefreshedAt = ctx.ref(/** @type {string | null} */ (null))

  // Config UI state
  const editing = ctx.ref(/** @type {null | { id: string, label: string, accessKey: string, secretKey: string, isNew: boolean }} */ (null))
  const showSecret = ctx.ref(false)
  const formError = ctx.ref('')

  // ─── Storage sync ────────────────────────────────────────────────────────

  async function loadFromStorage() {
    const stored = await ctx.storage.get(STORAGE_ACCOUNTS_KEY)
    if (Array.isArray(stored)) {
      accounts.value = stored.filter(
        (a) => a && typeof a.id === 'string' && typeof a.accessKey === 'string' && typeof a.secretKey === 'string',
      )
    }
    const activeId = await ctx.storage.get(STORAGE_ACTIVE_KEY)
    if (typeof activeId === 'string' && accounts.value.some((a) => a.id === activeId)) {
      activeAccountId.value = activeId
    } else if (accounts.value.length > 0) {
      activeAccountId.value = accounts.value[0].id
      await ctx.storage.set(STORAGE_ACTIVE_KEY, activeAccountId.value)
    } else {
      activeAccountId.value = null
    }
  }

  async function persistAccounts() {
    await ctx.storage.set(STORAGE_ACCOUNTS_KEY, accounts.value)
  }

  async function persistActive() {
    await ctx.storage.set(STORAGE_ACTIVE_KEY, activeAccountId.value)
  }

  // ─── Account CRUD ────────────────────────────────────────────────────────

  function startAddAccount() {
    editing.value = {
      id: `acc_${Date.now()}`,
      label: '',
      accessKey: '',
      secretKey: '',
      isNew: true,
    }
    formError.value = ''
    showSecret.value = false
  }

  function startEditAccount(/** @type {Account} */ acc) {
    editing.value = { ...acc, isNew: false }
    formError.value = ''
    showSecret.value = false
  }

  function cancelEdit() {
    editing.value = null
    formError.value = ''
  }

  async function saveAccount() {
    const e = editing.value
    if (!e) return
    if (!e.label.trim()) {
      formError.value = 'Label is required'
      return
    }
    if (!e.accessKey.trim() || !e.secretKey.trim()) {
      formError.value = 'Access Key and Secret Key are both required'
      return
    }

    const trimmed = {
      id: e.id,
      label: e.label.trim(),
      accessKey: e.accessKey.trim(),
      secretKey: e.secretKey.trim(),
    }

    if (e.isNew) {
      accounts.value = [...accounts.value, trimmed]
      if (!activeAccountId.value) {
        activeAccountId.value = trimmed.id
        await persistActive()
      }
    } else {
      accounts.value = accounts.value.map((a) => (a.id === trimmed.id ? trimmed : a))
    }
    await persistAccounts()
    editing.value = null
    formError.value = ''
    refresh().catch(() => {})
  }

  async function deleteAccount(/** @type {string} */ id) {
    const confirmed = await ctx.ui.confirm('Delete this account?')
    if (!confirmed) return
    accounts.value = accounts.value.filter((a) => a.id !== id)
    if (activeAccountId.value === id) {
      activeAccountId.value = accounts.value[0]?.id ?? null
      await persistActive()
    }
    await persistAccounts()
    refresh().catch(() => {})
  }

  async function setActive(/** @type {string} */ id) {
    if (!accounts.value.some((a) => a.id === id)) return
    activeAccountId.value = id
    await persistActive()
    refresh().catch(() => {})
  }

  // ─── Refresh ─────────────────────────────────────────────────────────────

  function activeAccount() {
    if (!activeAccountId.value) return null
    return accounts.value.find((a) => a.id === activeAccountId.value) ?? null
  }

  async function refresh() {
    try {
      const acc = activeAccount()
      if (!acc) {
        for (const w of WINDOWS) quota[w] = null
        lastError.value = ''
        return
      }
      const data = await fetchQuota(ctx, ctx.exec, {
        accessKey: acc.accessKey,
        secretKey: acc.secretKey,
      })
      for (const w of WINDOWS) {
        quota[w] = data[w] ?? null
      }
      lastError.value = ''
      lastRefreshedAt.value = new Date().toISOString()
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      console.warn('[volc-ark-quota] refresh failed:', e)
    }
  }

  // ─── Monitor series ──────────────────────────────────────────────────────

  function hasActiveAccount() {
    return activeAccount() !== null
  }

  /** @param {keyof typeof WINDOW_META} window */
  function pctFor(window) {
    const q = quota[window]
    if (!q || q.total <= 0) return null
    return (q.used / q.total) * 100
  }

  /** @param {keyof typeof WINDOW_META} window */
  function detailFor(window) {
    const acc = activeAccount()
    const rows = []
    if (acc) rows.push({ label: 'Account', value: acc.label })
    const q = quota[window]
    if (q) {
      const pct = q.total > 0 ? Math.round((q.used / q.total) * 100) : 0
      rows.push(
        { label: 'Used', value: String(q.used) },
        { label: 'Total', value: String(q.total) },
        { label: 'Percent', value: `${pct}%` },
      )
      if (q.resetAt) {
        rows.push({ label: 'Resets', value: new Date(q.resetAt).toLocaleString() })
      }
    }
    if (lastError.value) {
      rows.push({ label: 'Error', value: lastError.value })
    }
    if (lastRefreshedAt.value) {
      rows.push({ label: 'Last refresh', value: new Date(lastRefreshedAt.value).toLocaleString() })
    }
    return rows
  }

  const series = WINDOWS.map((window) => {
    const meta = WINDOW_META[window]
    return {
      id: `volc-ark-quota:${window}`,
      label: meta.tooltip,
      scale: /** @type {'percent'} */ ('percent'),
      statusIcon: 'Gauge',
      current: () => pctFor(window),
      statusText: () => {
        const pct = pctFor(window)
        if (pct == null) return null
        return `${meta.label}: ${Math.round(pct)}%`
      },
      detail: () => detailFor(window),
      defaultVisible: true,
      visible: hasActiveAccount,
    }
  })

  // ─── Config UI ──────────────────────────────────────────────────────────

  function renderHeader() {
    return h('div', { class: 'volc-header' }, [
      h('h2', { class: 'volc-title' }, 'Volcano Ark Quota'),
      h('p', { class: 'volc-subtitle' },
        'Configure one or more Volcano Engine accounts. The active account\'s Ark Flow Plan quota (5h / D / W / M) shows in the status bar.'),
    ])
  }

  function renderToolbar() {
    return h('div', { class: 'volc-toolbar' }, [
      h('button', {
        class: 'volc-btn volc-btn-primary',
        onClick: () => startAddAccount(),
      }, '+ Add account'),
      h('button', {
        class: 'volc-btn',
        onClick: () => refresh(),
      }, 'Refresh now'),
      lastRefreshedAt.value
        ? h('span', { class: 'volc-meta' },
          `last refreshed ${new Date(lastRefreshedAt.value).toLocaleString()}`)
        : null,
      lastError.value
        ? h('span', { class: 'volc-error-text' }, `⚠ ${lastError.value}`)
        : null,
    ])
  }

  function renderAccountRow(/** @type {Account} */ acc) {
    const isActive = acc.id === activeAccountId.value
    const maskedAk = acc.accessKey.length > 8
      ? `${acc.accessKey.slice(0, 4)}...${acc.accessKey.slice(-4)}`
      : acc.accessKey
    return h('div', { class: 'volc-account-row', key: acc.id }, [
      h('div', { class: 'volc-account-info' }, [
        h('div', { class: 'volc-account-label' }, acc.label),
        h('div', { class: 'volc-account-ak' }, `AK: ${maskedAk}`),
      ]),
      h('div', { class: 'volc-account-actions' }, [
        isActive
          ? h('span', { class: 'volc-badge volc-badge-active' }, 'Active')
          : h('button', {
              class: 'volc-btn volc-btn-small',
              onClick: () => setActive(acc.id),
            }, 'Set active'),
        h('button', {
          class: 'volc-btn volc-btn-small',
          onClick: () => startEditAccount(acc),
        }, 'Edit'),
        h('button', {
          class: 'volc-btn volc-btn-small volc-btn-danger',
          onClick: () => deleteAccount(acc.id),
        }, 'Delete'),
      ]),
    ])
  }

  function renderAccountList() {
    if (accounts.value.length === 0) {
      return h('div', { class: 'volc-empty' },
        'No accounts yet. Click "Add account" to configure your Volcano Engine AK/SK.')
    }
    return h('div', { class: 'volc-account-list' },
      accounts.value.map(renderAccountRow))
  }

  function renderEditForm() {
    const e = editing.value
    if (!e) return null
    return h('div', { class: 'volc-edit-form' }, [
      h('div', { class: 'volc-form-row' }, [
        h('label', { for: 'volc-label' }, 'Label'),
        h('input', {
          id: 'volc-label',
          type: 'text',
          placeholder: 'e.g. Work, Personal',
          value: e.label,
          onInput: (/** @type {any} */ ev) => { e.label = ev.target.value },
        }),
      ]),
      h('div', { class: 'volc-form-row' }, [
        h('label', { for: 'volc-ak' }, 'Access Key ID'),
        h('input', {
          id: 'volc-ak',
          type: 'text',
          placeholder: 'AKLT...',
          value: e.accessKey,
          onInput: (/** @type {any} */ ev) => { e.accessKey = ev.target.value },
        }),
      ]),
      h('div', { class: 'volc-form-row' }, [
        h('label', { for: 'volc-sk' }, 'Secret Access Key'),
        h('input', {
          id: 'volc-sk',
          type: showSecret.value ? 'text' : 'password',
          placeholder: '••••••••',
          value: e.secretKey,
          onInput: (/** @type {any} */ ev) => { e.secretKey = ev.target.value },
        }),
        h('button', {
          class: 'volc-btn volc-btn-small',
          type: 'button',
          onClick: () => { showSecret.value = !showSecret.value },
        }, showSecret.value ? 'Hide' : 'Show'),
      ]),
      formError.value
        ? h('div', { class: 'volc-error-text' }, formError.value)
        : null,
      h('div', { class: 'volc-form-actions' }, [
        h('button', {
          class: 'volc-btn volc-btn-primary',
          onClick: () => saveAccount(),
        }, e.isNew ? 'Add' : 'Save'),
        h('button', {
          class: 'volc-btn',
          onClick: () => cancelEdit(),
        }, 'Cancel'),
      ]),
    ])
  }

  function renderConfig() {
    return h('div', { class: 'volc-config' }, [
      renderHeader(),
      renderToolbar(),
      renderAccountList(),
      renderEditForm(),
      h('details', { class: 'volc-help' }, [
        h('summary', null, 'How to get AK/SK'),
        h('p', null, [
          h('span', null, 'Visit '),
          h('a', {
            href: 'https://console.volcengine.com/iam/keymanage/',
            target: '_blank',
            rel: 'noreferrer',
          }, 'Volcano Engine IAM Key Management'),
          h('span', null,
            ' to create an Access Key. The AK/SK is stored locally in plugin storage and used only to sign Volcano API requests.'),
        ]),
        h('p', null, [
          h('span', null, 'API: '),
          h('code', null, `POST ${ARK_ENDPOINT}/?Action=${ARK_ACTION}&Version=${ARK_API_VERSION}`),
        ]),
        h('p', null, [
          h('span', null, 'Note: the Agent Plan dedicated API Key (ark-...) does NOT work for this endpoint -- it only authorizes the inference API (/api/v3/*). GetAFPUsage requires AK/SK HMAC signing.'),
        ]),
      ]),
    ])
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  let refreshTimer = null
  const settingsDisposable = ctx.settings.onDidChange(() => {
    // Settings changes don't carry account info; refresh anyway to be safe.
    refresh().catch(() => {})
  })

  // Load storage and start the refresh timer immediately. The plugin's
  // activate() runs outside a Vue component setup (called from App.vue's
  // onLoginSuccess), so ctx.onMounted (Vue's onMounted) would never fire.
  void (async () => {
    await loadFromStorage()
    refresh().catch(() => {})
    refreshTimer = setInterval(() => {
      refresh().catch(() => {})
    }, REFRESH_INTERVAL_MS)
  })()

  const refreshCommand = ctx.commands.register('volc-ark-quota.refresh', () => {
    refresh().catch(() => {})
  })

  return {
    component: { render: renderConfig },
    monitor: { series },
    dispose() {
      refreshCommand.dispose()
      settingsDisposable.dispose()
      if (refreshTimer) clearInterval(refreshTimer)
    },
  }
}

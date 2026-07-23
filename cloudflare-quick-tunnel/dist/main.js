// src/i18n.ts
var messages = {
  en: {
    pluginName: "Cloudflare Tunnel",
    supervisorNoOutput: "Supervisor returned no command output",
    supervisorNoJson: "Supervisor returned no JSON",
    supervisorFailed: "Supervisor command failed",
    invalidCommandResponse: "Dinotty returned an invalid plugin command response",
    commandFailed: (code) => `Command failed (${code})`,
    invalidAccessKey: "Invalid access key",
    invalidAccessKeyMessage: "Access keys must contain 12 to 256 characters.",
    settingsSaved: "Settings saved. They apply to the next tunnel.",
    unableToSave: "Unable to save settings",
    tunnelStateError: (state) => `Tunnel entered the ${state} state`,
    tunnelTimeout: (seconds) => `Tunnel did not connect within ${seconds} seconds`,
    unableToConnect: "Unable to connect tunnel",
    unableToCancel: "Unable to cancel connection",
    stopConfirmation: "Stop Cloudflare Tunnel and revoke every active session?",
    unableToStop: "Unable to stop tunnel",
    copied: (label) => `${label} copied`,
    accessKey: "Access key",
    activeKeyDescription: "This key is active and included in the current tunnel link. Stop the tunnel before changing it.",
    inactiveKeyDescription: "A secure random key is generated automatically. Edit it here if you prefer your own key.",
    keyPlaceholder: "12-256 characters",
    hide: "Hide",
    show: "Show",
    copy: "Copy",
    random: "Random",
    saveConfiguration: "Save configuration",
    state: "State",
    cloudflareEdge: "Cloudflare edge",
    pending: "Pending",
    streams: "Streams",
    reconnects: "Reconnects",
    received: "Received",
    sent: "Sent",
    refreshStatus: "Refresh status",
    statusSource: "Status source",
    lastChecked: "Last checked",
    sourceGateway: "Tunnel Gateway",
    sourceSupervisor: "Supervisor",
    sourceUnknown: "Not detected",
    neverChecked: "Never",
    checkedJustNow: "Just now",
    checkedSecondsAgo: (seconds) => `${seconds}s ago`,
    statusUnavailable: "Status unavailable",
    statusStaleSuffix: "stale",
    statusRequestFailed: "Unable to read the current tunnel status",
    statusHttpError: (status) => `Status request failed (${status})`,
    subtitle: "Create a temporary, access-controlled tunnel to Dinotty.",
    requestingTunnel: "Requesting a tunnel from Cloudflare...",
    tunnelUrlPlaceholder: "The tunnel URL will appear here",
    tunnelLink: "Tunnel link",
    stop: "Stop",
    cancel: "Cancel",
    cancelling: "Cancelling...",
    connecting: "Connecting...",
    connect: "Connect",
    tunnelSettings: "Tunnel settings",
    accessTab: "Access",
    statusTab: "Status",
    statuses: {
      stopped: "Stopped",
      awaiting_run: "Awaiting start",
      starting_gateway: "Starting gateway",
      requesting_tunnel: "Requesting tunnel",
      connecting_edge: "Connecting to edge",
      connected: "Connected",
      stopping: "Stopping",
      error: "Error",
      unknown: "Checking status",
      stale: "Status stale",
      unavailable: "Status unavailable"
    }
  },
  zh: {
    pluginName: "Cloudflare\u96A7\u9053",
    supervisorNoOutput: "Supervisor \u6CA1\u6709\u8FD4\u56DE\u547D\u4EE4\u8F93\u51FA",
    supervisorNoJson: "Supervisor \u6CA1\u6709\u8FD4\u56DE JSON",
    supervisorFailed: "Supervisor \u547D\u4EE4\u6267\u884C\u5931\u8D25",
    invalidCommandResponse: "Dinotty \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u63D2\u4EF6\u547D\u4EE4\u54CD\u5E94",
    commandFailed: (code) => `\u547D\u4EE4\u6267\u884C\u5931\u8D25\uFF08${code}\uFF09`,
    invalidAccessKey: "\u8BBF\u95EE\u5BC6\u94A5\u65E0\u6548",
    invalidAccessKeyMessage: "\u8BBF\u95EE\u5BC6\u94A5\u957F\u5EA6\u5FC5\u987B\u4E3A 12 \u5230 256 \u4E2A\u5B57\u7B26\u3002",
    settingsSaved: "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u5C06\u5728\u4E0B\u6B21\u521B\u5EFA\u96A7\u9053\u65F6\u751F\u6548\u3002",
    unableToSave: "\u65E0\u6CD5\u4FDD\u5B58\u8BBE\u7F6E",
    tunnelStateError: (state) => `\u96A7\u9053\u8FDB\u5165\u5F02\u5E38\u72B6\u6001\uFF1A${state}`,
    tunnelTimeout: (seconds) => `\u96A7\u9053\u672A\u80FD\u5728 ${seconds} \u79D2\u5185\u8FDE\u63A5`,
    unableToConnect: "\u65E0\u6CD5\u8FDE\u63A5\u96A7\u9053",
    unableToCancel: "\u65E0\u6CD5\u53D6\u6D88\u8FDE\u63A5",
    stopConfirmation: "\u8981\u505C\u6B62 Cloudflare\u96A7\u9053\u5E76\u64A4\u9500\u6240\u6709\u6D3B\u52A8\u4F1A\u8BDD\u5417\uFF1F",
    unableToStop: "\u65E0\u6CD5\u505C\u6B62\u96A7\u9053",
    copied: (label) => `\u5DF2\u590D\u5236\uFF1A${label}`,
    accessKey: "\u8BBF\u95EE\u5BC6\u94A5",
    activeKeyDescription: "\u6B64\u5BC6\u94A5\u6B63\u5728\u4F7F\u7528\uFF0C\u5E76\u5DF2\u5305\u542B\u5728\u5F53\u524D\u96A7\u9053\u94FE\u63A5\u4E2D\u3002\u8BF7\u5148\u505C\u6B62\u96A7\u9053\u518D\u8FDB\u884C\u4FEE\u6539\u3002",
    inactiveKeyDescription: "\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u751F\u6210\u5B89\u5168\u7684\u968F\u673A\u5BC6\u94A5\uFF0C\u4F60\u4E5F\u53EF\u4EE5\u5728\u6B64\u8BBE\u7F6E\u81EA\u5DF1\u7684\u5BC6\u94A5\u3002",
    keyPlaceholder: "12-256 \u4E2A\u5B57\u7B26",
    hide: "\u9690\u85CF",
    show: "\u663E\u793A",
    copy: "\u590D\u5236",
    random: "\u968F\u673A\u751F\u6210",
    saveConfiguration: "\u4FDD\u5B58\u8BBE\u7F6E",
    state: "\u72B6\u6001",
    cloudflareEdge: "Cloudflare \u8FB9\u7F18\u8282\u70B9",
    pending: "\u7B49\u5F85\u4E2D",
    streams: "\u6570\u636E\u6D41",
    reconnects: "\u91CD\u8FDE\u6B21\u6570",
    received: "\u5DF2\u63A5\u6536",
    sent: "\u5DF2\u53D1\u9001",
    refreshStatus: "\u5237\u65B0\u72B6\u6001",
    statusSource: "\u72B6\u6001\u6765\u6E90",
    lastChecked: "\u4E0A\u6B21\u786E\u8BA4",
    sourceGateway: "\u96A7\u9053\u7F51\u5173",
    sourceSupervisor: "Supervisor",
    sourceUnknown: "\u5C1A\u672A\u8BC6\u522B",
    neverChecked: "\u4ECE\u672A",
    checkedJustNow: "\u521A\u521A",
    checkedSecondsAgo: (seconds) => `${seconds} \u79D2\u524D`,
    statusUnavailable: "\u72B6\u6001\u4E0D\u53EF\u7528",
    statusStaleSuffix: "\u72B6\u6001\u5DF2\u8FC7\u671F",
    statusRequestFailed: "\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u96A7\u9053\u72B6\u6001",
    statusHttpError: (status) => `\u72B6\u6001\u8BF7\u6C42\u5931\u8D25\uFF08${status}\uFF09`,
    subtitle: "\u521B\u5EFA\u4E00\u6761\u4E34\u65F6\u3001\u53D7\u8BBF\u95EE\u63A7\u5236\u7684 Dinotty \u96A7\u9053\u3002",
    requestingTunnel: "\u6B63\u5728\u5411 Cloudflare \u7533\u8BF7\u96A7\u9053...",
    tunnelUrlPlaceholder: "\u96A7\u9053\u94FE\u63A5\u5C06\u5728\u8FD9\u91CC\u663E\u793A",
    tunnelLink: "\u96A7\u9053\u94FE\u63A5",
    stop: "\u505C\u6B62",
    cancel: "\u53D6\u6D88",
    cancelling: "\u6B63\u5728\u53D6\u6D88...",
    connecting: "\u6B63\u5728\u8FDE\u63A5...",
    connect: "\u8FDE\u63A5",
    tunnelSettings: "\u96A7\u9053\u8BBE\u7F6E",
    accessTab: "\u8BBF\u95EE\u63A7\u5236",
    statusTab: "\u72B6\u6001",
    statuses: {
      stopped: "\u5DF2\u505C\u6B62",
      awaiting_run: "\u7B49\u5F85\u542F\u52A8",
      starting_gateway: "\u6B63\u5728\u542F\u52A8\u7F51\u5173",
      requesting_tunnel: "\u6B63\u5728\u7533\u8BF7\u96A7\u9053",
      connecting_edge: "\u6B63\u5728\u8FDE\u63A5\u8FB9\u7F18\u8282\u70B9",
      connected: "\u5DF2\u8FDE\u63A5",
      stopping: "\u6B63\u5728\u505C\u6B62",
      error: "\u9519\u8BEF",
      unknown: "\u6B63\u5728\u68C0\u67E5\u72B6\u6001",
      stale: "\u72B6\u6001\u5DF2\u8FC7\u671F",
      unavailable: "\u72B6\u6001\u4E0D\u53EF\u7528"
    }
  }
};
function catalog(locale) {
  return messages[locale];
}
function statusText(locale, status) {
  const translated = messages[locale].statuses[status];
  if (translated) return translated;
  return status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

// src/main.ts
function generateAccessKey() {
  const bytes2 = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes2) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function parseJson(stdout, locale, acceptErrorState = false) {
  const text = catalog(locale);
  if (typeof stdout !== "string") throw new Error(text.supervisorNoOutput);
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error(text.supervisorNoJson);
  const value = JSON.parse(line);
  if (!acceptErrorState && value.ok === false) throw new Error(value.error || text.supervisorFailed);
  return value;
}
function bytes(value = 0) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function activate(ctx) {
  const state = ctx.reactive({
    status: { state: "unknown" },
    statusAvailability: "loading",
    statusSource: "unknown",
    statusError: null,
    lastStatusAt: null,
    statusFailures: 0,
    busy: false,
    startPhase: "idle",
    loaded: false,
    activeTab: "access",
    accessKey: "",
    keyVisible: true,
    locale: ctx.i18n?.getLocale() ?? "en"
  });
  let pollTimer;
  let refreshInFlight;
  let statusAbort;
  let activeStart;
  let disposed = false;
  const localeSubscription = ctx.i18n?.onDidChangeLocale((locale) => {
    state.locale = locale;
  });
  const text = () => catalog(state.locale);
  async function run(args, timeout = 3e4, acceptErrorState = false) {
    const result = await ctx.exec.run([...args, "--json"], { timeout });
    if (typeof result?.code !== "number") {
      throw new Error(result?.error || text().invalidCommandResponse);
    }
    if (result.code !== 0) {
      if (typeof result.stdout === "string" && result.stdout.trim()) {
        try {
          parseJson(result.stdout, state.locale);
        } catch (error) {
          throw error;
        }
      }
      throw new Error(result.stderr || text().commandFailed(result.code));
    }
    return parseJson(result.stdout, state.locale, acceptErrorState);
  }
  async function storageSet(key, value) {
    try {
      await ctx.storage.set(key, value);
    } catch (error) {
      const message = String(error?.message || error);
      if (message.includes("Response with null body status cannot have body")) return;
      throw error;
    }
  }
  async function loadGatewayStatus(timeout) {
    if (state.statusSource === "supervisor-cli") return null;
    const controller = new AbortController();
    statusAbort = controller;
    const timer = setTimeout(() => controller.abort(), Math.min(timeout, 3e3));
    try {
      const response = await fetch("/.dinotty-share/tunnel-status", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(text().statusHttpError(response.status));
      if (!response.headers.get("content-type")?.includes("application/json")) return null;
      const value = await response.json();
      if (value.schemaVersion !== 1 || value.source !== "share-gateway" || typeof value.state !== "string") {
        return null;
      }
      state.statusSource = "share-gateway";
      return {
        ok: value.state !== "error",
        state: value.state,
        generationId: value.generationId,
        publicUrl: value.publicUrl,
        edgeLocation: value.edgeLocation,
        gateway: value.gateway,
        metrics: value.metrics,
        error: value.error?.message || null
      };
    } catch (error) {
      if (state.statusSource === "unknown") return null;
      throw error;
    } finally {
      clearTimeout(timer);
      if (statusAbort === controller) statusAbort = void 0;
    }
  }
  async function readStatus(timeout) {
    const gatewayStatus = await loadGatewayStatus(timeout);
    if (gatewayStatus) return gatewayStatus;
    const status = await run(["status"], timeout, true);
    state.statusSource = "supervisor-cli";
    return status;
  }
  async function refreshOnce(silent, timeout) {
    try {
      const status = await readStatus(timeout);
      if (disposed) return null;
      state.status = status;
      state.statusAvailability = "fresh";
      state.statusError = null;
      state.lastStatusAt = Date.now();
      state.statusFailures = 0;
      return status;
    } catch (error) {
      if (disposed) return null;
      const message = error?.name === "AbortError" ? text().statusRequestFailed : error?.message || text().statusRequestFailed;
      state.statusFailures += 1;
      state.statusAvailability = state.lastStatusAt === null ? "unavailable" : "stale";
      state.statusError = message;
      if (!silent) ctx.ui.notify(message, "error", text().pluginName);
      return null;
    }
  }
  function refresh(silent = false, timeout = 5e3) {
    if (refreshInFlight) return refreshInFlight;
    const request = refreshOnce(silent, timeout).finally(() => {
      if (refreshInFlight === request) refreshInFlight = void 0;
    });
    refreshInFlight = request;
    return request;
  }
  function schedulePoll() {
    if (disposed) return;
    if (pollTimer) clearTimeout(pollTimer);
    const delay = state.statusFailures === 0 ? 2e3 : Math.min(15e3, 2e3 * 2 ** Math.min(state.statusFailures, 3));
    pollTimer = setTimeout(async () => {
      await refresh(true);
      schedulePoll();
    }, delay);
  }
  async function initialize() {
    try {
      const settings = await ctx.storage.get("settings");
      const current = await ctx.storage.get("current-access");
      state.accessKey = settings?.accessKey || settings?.customAccessKey || current?.accessKey || generateAccessKey();
      await storageSet("settings", { accessKey: state.accessKey });
      await refresh(true);
    } finally {
      state.loaded = true;
      schedulePoll();
    }
  }
  async function saveSettings() {
    const accessKey = state.accessKey;
    if (accessKey.length < 12 || accessKey.length > 256) {
      ctx.ui.notify(text().invalidAccessKeyMessage, "error", text().invalidAccessKey);
      return;
    }
    try {
      await storageSet("settings", { accessKey });
      ctx.ui.notify(text().settingsSaved, "info", text().pluginName);
    } catch (error) {
      ctx.ui.notify(error.message || String(error), "error", text().unableToSave);
    }
  }
  async function start() {
    if (state.busy || state.status.state === "connected") return;
    const attempt = { cancelRequested: false };
    activeStart = attempt;
    state.busy = true;
    state.startPhase = "preparing";
    try {
      const args = ["prepare"];
      args.push("--access-key", state.accessKey);
      args.push("--locale", state.locale);
      const prepared = await run(args);
      attempt.generationId = prepared.generationId;
      state.accessKey = prepared.accessKey;
      await storageSet("current-access", {
        generationId: prepared.generationId,
        accessKey: prepared.accessKey
      });
      state.status = { state: "starting_gateway", generationId: prepared.generationId };
      state.statusAvailability = "fresh";
      state.statusError = null;
      attempt.process = await ctx.process.start(["run", "--generation", prepared.generationId, "--json"]);
      state.startPhase = "connecting";
      const timeoutSeconds = 50;
      const deadline = Date.now() + timeoutSeconds * 1e3;
      while (Date.now() < deadline) {
        if (attempt.cancelRequested && await attempt.cancelPromise) return;
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, deadline - Date.now())));
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const status = await refresh(true, Math.min(1e3, remaining));
        if (attempt.cancelRequested && await attempt.cancelPromise) return;
        if (status?.state === "connected") {
          return;
        }
        if (status && (status.ok === false || status.state === "error")) {
          throw new Error(status.error || text().tunnelStateError(status.state));
        }
      }
      throw new Error(text().tunnelTimeout(timeoutSeconds));
    } catch (error) {
      const cancelled = attempt.cancelRequested && await attempt.cancelPromise;
      if (!cancelled) ctx.ui.notify(error.message, "error", text().unableToConnect);
      await refresh(true);
    } finally {
      if (activeStart === attempt) {
        activeStart = void 0;
        state.startPhase = "idle";
        state.busy = false;
      }
    }
  }
  async function cancelStart() {
    const attempt = activeStart;
    if (!attempt?.process || state.startPhase !== "connecting") return;
    const markStopped = () => {
      state.status = { state: "stopped" };
      state.statusAvailability = "fresh";
      state.statusError = null;
      state.lastStatusAt = Date.now();
      state.statusFailures = 0;
    };
    attempt.cancelRequested = true;
    state.startPhase = "cancelling";
    attempt.cancelPromise = (async () => {
      let processStopError;
      try {
        await attempt.process.stop();
        await refresh(true);
        markStopped();
        return true;
      } catch (error) {
        processStopError = error;
      }
      try {
        if (!attempt.generationId) throw processStopError;
        await run(["stop", "--generation", attempt.generationId], 2e4);
        await refresh(true);
        markStopped();
        return true;
      } catch (error) {
        const status = await refresh(true);
        if (status && (status.state === "stopped" || status.state === "error")) {
          markStopped();
          return true;
        }
        if (activeStart === attempt) {
          attempt.cancelRequested = false;
          state.startPhase = "connecting";
          ctx.ui.notify(error?.message || String(processStopError), "error", text().unableToCancel);
        }
        return false;
      }
    })();
    await attempt.cancelPromise;
  }
  async function stop() {
    const generation = state.status.generationId;
    if (!generation || !await ctx.ui.confirm(text().stopConfirmation)) return;
    state.busy = true;
    try {
      await run(["stop", "--generation", generation], 2e4);
      await refresh(true);
    } catch (error) {
      ctx.ui.notify(error.message, "error", text().unableToStop);
    } finally {
      state.busy = false;
    }
  }
  const connected = ctx.computed(() => state.status.state === "connected");
  const displayedStatus = ctx.computed(() => {
    if (state.statusAvailability === "unavailable") return text().statusUnavailable;
    const value = statusText(state.locale, state.status.state);
    return state.statusAvailability === "stale" ? `${value} \xB7 ${text().statusStaleSuffix}` : value;
  });
  const tunnelUrl = ctx.computed(() => {
    if (!state.status.publicUrl || !state.accessKey) return state.status.publicUrl || "";
    const url = new URL(state.status.publicUrl);
    url.searchParams.set("access_key", state.accessKey);
    return url.toString();
  });
  async function copy(value, label, silent = false) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    if (!silent) ctx.ui.notify(text().copied(label), "info", text().pluginName);
  }
  function button(label, action, className = "", disabled = false, allowWhileBusy = false) {
    return ctx.h("button", { type: "button", class: `cfqt-button ${className}`, disabled: !allowWhileBusy && state.busy || disabled, onClick: action }, label);
  }
  function connectButton() {
    const cancellable = state.startPhase === "connecting";
    const starting = state.startPhase !== "idle";
    const label = cancellable ? ctx.h("span", { class: "cfqt-connect-label" }, [
      ctx.h("span", { class: "cfqt-connect-label--connecting" }, text().connecting),
      ctx.h("span", { class: "cfqt-connect-label--cancel" }, text().cancel)
    ]) : ctx.h("span", null, state.startPhase === "cancelling" ? text().cancelling : starting ? text().connecting : text().connect);
    const disabled = state.startPhase === "idle" ? !state.loaded || state.statusAvailability !== "fresh" : !cancellable;
    const className = `cfqt-button--primary cfqt-generate cfqt-generate--cloudflare${starting ? " is-busy" : ""}${cancellable ? " is-cancellable" : ""}`;
    return button([cloudflareMark(), label], cancellable ? cancelStart : start, className, disabled, cancellable);
  }
  function cloudflareMark() {
    return ctx.h("svg", { class: "cfqt-cloudflare-mark", viewBox: "54 2 50 25", "aria-hidden": "true", focusable: "false" }, [
      ctx.h("path", { d: "M88.1 24c.3-1 .2-2-.3-2.6-.5-.6-1.2-1-2.1-1.1l-17.4-.2c-.1 0-.2-.1-.3-.1-.1-.1-.1-.2 0-.3.1-.2.2-.3.4-.3l17.5-.2c2.1-.1 4.3-1.8 5.1-3.8l1-2.6c0-.1.1-.2 0-.3-1.1-5.1-5.7-8.9-11.1-8.9-5 0-9.3 3.2-10.8 7.7-1-.7-2.2-1.1-3.6-1-2.4.2-4.3 2.2-4.6 4.6-.1.6 0 1.2.1 1.8-3.9.1-7.1 3.3-7.1 7.3 0 .4 0 .7.1 1.1 0 .2.2.3.3.3h32.1c.2 0 .4-.1.4-.3l.3-1.1z" }),
      ctx.h("path", { d: "M93.6 12.8h-.5c-.1 0-.2.1-.3.2l-.7 2.4c-.3 1-.2 2 .3 2.6.5.6 1.2 1 2.1 1.1l3.7.2c.1 0 .2.1.3.1.1.1.1.2 0 .3-.1.2-.2.3-.4.3l-3.8.2c-2.1.1-4.3 1.8-5.1 3.8l-.2.9c-.1.1 0 .3.2.3h13.2c.2 0 .3-.1.3-.3.2-.8.4-1.7.4-2.6 0-5.2-4.3-9.5-9.5-9.5" })
    ]);
  }
  function field(label, value) {
    return ctx.h("div", { class: "cfqt-fact" }, [ctx.h("span", null, label), ctx.h("strong", null, value)]);
  }
  function accessPanel() {
    return ctx.h("div", { class: "cfqt-tab-panel" }, [
      ctx.h("div", { class: "cfqt-setting" }, [
        ctx.h("div", { class: "cfqt-setting-copy" }, [
          ctx.h("strong", null, text().accessKey),
          ctx.h("p", null, connected.value ? text().activeKeyDescription : text().inactiveKeyDescription)
        ]),
        ctx.h("div", { class: "cfqt-secret-row" }, [
          ctx.h("input", {
            type: state.keyVisible ? "text" : "password",
            value: state.accessKey,
            disabled: connected.value || state.busy,
            placeholder: text().keyPlaceholder,
            onInput: (event) => {
              state.accessKey = event.target.value;
            }
          }),
          button(state.keyVisible ? text().hide : text().show, () => {
            state.keyVisible = !state.keyVisible;
          }),
          button(text().copy, () => copy(state.accessKey, text().accessKey), "", !state.accessKey),
          button(text().random, () => {
            state.accessKey = generateAccessKey();
          }, "", connected.value)
        ])
      ]),
      ctx.h("div", { class: "cfqt-panel-actions" }, [button(text().saveConfiguration, saveSettings, "cfqt-button--primary")])
    ]);
  }
  function statusPanel() {
    const metrics = state.status.metrics;
    return ctx.h("div", { class: "cfqt-tab-panel" }, [
      ctx.h("div", { class: "cfqt-fact-grid" }, [
        field(text().state, displayedStatus.value),
        field(text().statusSource, state.statusSource === "share-gateway" ? text().sourceGateway : state.statusSource === "supervisor-cli" ? text().sourceSupervisor : text().sourceUnknown),
        field(text().lastChecked, state.lastStatusAt === null ? text().neverChecked : Date.now() - state.lastStatusAt < 2e3 ? text().checkedJustNow : text().checkedSecondsAgo(Math.floor((Date.now() - state.lastStatusAt) / 1e3))),
        field(text().cloudflareEdge, state.status.edgeLocation || text().pending),
        field(text().streams, String(metrics?.streamsTotal ?? 0)),
        field(text().reconnects, String(metrics?.reconnects ?? 0)),
        field(text().received, bytes(metrics?.bytesIn)),
        field(text().sent, bytes(metrics?.bytesOut))
      ]),
      ctx.h("div", { class: "cfqt-panel-actions" }, [button(text().refreshStatus, () => refresh())])
    ]);
  }
  const component = { setup() {
    void initialize();
    return () => ctx.h("div", { class: "cfqt-shell" }, [ctx.h("main", { class: "cfqt-window" }, [
      ctx.h("header", { class: "cfqt-window-header" }, [
        ctx.h("div", null, [ctx.h("h1", null, text().pluginName), ctx.h("p", null, text().subtitle)]),
        ctx.h("span", { class: `cfqt-status cfqt-status--${state.statusAvailability === "fresh" ? state.status.state : state.statusAvailability}` }, [ctx.h("i"), displayedStatus.value])
      ]),
      ctx.h("section", { class: "cfqt-search" }, [
        ctx.h("div", { class: "cfqt-url-field" }, [
          ctx.h("span", { "aria-hidden": "true" }, "\u2315"),
          tunnelUrl.value ? ctx.h("a", { href: tunnelUrl.value, target: "_blank", rel: "noreferrer" }, tunnelUrl.value) : ctx.h("span", { class: "cfqt-placeholder" }, state.busy ? text().requestingTunnel : text().tunnelUrlPlaceholder),
          tunnelUrl.value ? button(text().copy, () => copy(tunnelUrl.value, text().tunnelLink, true), "cfqt-button--compact") : null
        ]),
        connected.value ? button(text().stop, stop, "cfqt-button--danger cfqt-generate") : connectButton()
      ]),
      state.status.error || state.statusError ? ctx.h("div", {
        class: state.statusAvailability === "stale" ? "cfqt-warning" : "cfqt-error",
        role: "alert"
      }, state.status.error || state.statusError) : null,
      ctx.h("nav", { class: "cfqt-tabs", "aria-label": text().tunnelSettings }, ["access", "status"].map((tab) => ctx.h("button", { type: "button", class: state.activeTab === tab ? "active" : "", onClick: () => {
        state.activeTab = tab;
      } }, tab === "access" ? text().accessTab : text().statusTab))),
      state.activeTab === "access" ? accessPanel() : statusPanel()
    ])]);
  } };
  const openCommand = ctx.commands.register("cloudflare-quick-tunnel.open", () => ctx.open());
  const stopCommand = ctx.commands.register("cloudflare-quick-tunnel.stop", stop);
  return { component, dispose() {
    disposed = true;
    if (pollTimer) clearTimeout(pollTimer);
    statusAbort?.abort();
    localeSubscription?.dispose();
    openCommand.dispose();
    stopCommand.dispose();
  } };
}
export {
  activate
};

export function activate(ctx) {
  const h = ctx.h

  // State
  const cpuUsage = ctx.ref(0)
  const cpuCores = ctx.ref([])
  const memUsed = ctx.ref(0)
  const memTotal = ctx.ref(0)
  const memPercent = ctx.ref(0)
  const swapUsed = ctx.ref(0)
  const swapTotal = ctx.ref(0)
  const diskInfo = ctx.ref([])
  const topProcs = ctx.ref([])
  const uptime = ctx.ref('')
  const osType = ctx.ref('')
  const cpuModel = ctx.ref('')

  // Chart history
  const cpuHistory = ctx.ref([])
  const memHistory = ctx.ref([])
  const MAX_HISTORY = 60

  // Canvas refs
  let cpuCanvas = null
  let memCanvas = null

  let updateTimer = null
  let isUpdating = false

  function pushHistory(arr, val) {
    arr.push(val)
    if (arr.length > MAX_HISTORY) arr.shift()
    return arr
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
    return (bytes / 1073741824).toFixed(1) + ' GB'
  }

  async function getOS() {
    try {
      const { stdout } = await ctx.exec.run(['uname', '-s'])
      return stdout.trim()
    } catch (e) {
      console.warn('getOS failed:', e)
      return 'Unknown'
    }
  }

  async function updateCPU() {
    try {
      const os = osType.value
      if (os === 'Darwin') {
        const { stdout } = await ctx.exec.run(['sh', '-c', 'top -l 1 -n 0 | grep "CPU usage"'])
        const match = stdout.match(/(\d+\.?\d*)%\s*user.*?(\d+\.?\d*)%\s*sys.*?(\d+\.?\d*)%\s*idle/)
        if (match) {
          const total = 100 - parseFloat(match[3])
          cpuUsage.value = Math.round(total)
          pushHistory(cpuHistory.value, total)
          cpuHistory.value = [...cpuHistory.value]
        }
      } else {
        const { stdout } = await ctx.exec.run(['sh', '-c', "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf \"%.1f\", usage}'"])
        const val = parseFloat(stdout.trim())
        if (!isNaN(val)) {
          cpuUsage.value = Math.round(val)
          pushHistory(cpuHistory.value, val)
          cpuHistory.value = [...cpuHistory.value]
        }
      }
    } catch (e) {
      console.warn('updateCPU failed:', e)
    }
  }

  async function updateMemory() {
    try {
      const os = osType.value
      if (os === 'Darwin') {
        const { stdout: vmOut } = await ctx.exec.run(['vm_stat'])
        const { stdout: hwOut } = await ctx.exec.run(['sysctl', '-n', 'hw.memsize'])

        const pageSize = 16384
        const pages = {}
        vmOut.split('\n').forEach(line => {
          const m = line.match(/^(.+?):\s+(\d+)\./)
          if (m) pages[m[1].trim()] = parseInt(m[2])
        })

        const totalBytes = parseInt(hwOut.trim())
        const activeBytes = (pages['Pages active'] || 0) * pageSize
        const wiredBytes = (pages['Pages wired down'] || 0) * pageSize
        const usedBytes = activeBytes + wiredBytes

        memTotal.value = totalBytes
        memUsed.value = usedBytes
        memPercent.value = Math.round((usedBytes / totalBytes) * 100)
        pushHistory(memHistory.value, memPercent.value)
        memHistory.value = [...memHistory.value]

        // Swap
        try {
          const { stdout: swapOut } = await ctx.exec.run(['sysctl', '-n', 'vm.swapusage'])
          const sm = swapOut.match(/total\s*=\s*([\d.]+)M\s*used\s*=\s*([\d.]+)M/)
          if (sm) {
            swapTotal.value = parseFloat(sm[1]) * 1048576
            swapUsed.value = parseFloat(sm[2]) * 1048576
          }
        } catch {}
      } else {
        const { stdout } = await ctx.exec.run(['sh', '-c', "free -b | grep Mem"])
        const parts = stdout.trim().split(/\s+/)
        if (parts.length >= 3) {
          memTotal.value = parseInt(parts[1])
          memUsed.value = parseInt(parts[2])
          memPercent.value = Math.round((memUsed.value / memTotal.value) * 100)
          pushHistory(memHistory.value, memPercent.value)
          memHistory.value = [...memHistory.value]
        }
        const { stdout: swOut } = await ctx.exec.run(['sh', '-c', "free -b | grep Swap"])
        const sp = swOut.trim().split(/\s+/)
        if (sp.length >= 3) {
          swapTotal.value = parseInt(sp[1])
          swapUsed.value = parseInt(sp[2])
        }
      }
    } catch {}
  }

  async function updateDisk() {
    try {
      const { stdout } = await ctx.exec.run(['sh', '-c', "df -h --output=source,size,used,avail,pcent,target 2>/dev/null || df -h"])
      const lines = stdout.trim().split('\n').slice(1)
      const disks = []
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 6 && (parts[0].startsWith('/dev/') || parts[0].startsWith('/System'))) {
          disks.push({
            device: parts[0],
            size: parts[1],
            used: parts[2],
            avail: parts[3],
            percent: parts[4],
            mount: parts[5],
          })
        }
      })
      diskInfo.value = disks
    } catch {}
  }

  async function updateTopProcesses() {
    try {
      const os = osType.value
      if (os === 'Darwin') {
        const { stdout } = await ctx.exec.run(['sh', '-c', 'ps -axo pid,pcpu,pmem,comm -r | head -6'])
        const lines = stdout.trim().split('\n').slice(1)
        topProcs.value = lines.map(line => {
          const parts = line.trim().split(/\s+/)
          return { pid: parts[0], cpu: parts[1] + '%', mem: parts[2] + '%', name: parts.slice(3).join(' ').split('/').pop() }
        })
      } else {
        const { stdout } = await ctx.exec.run(['sh', '-c', 'ps -axo pid,pcpu,pmem,comm --sort=-pcpu | head -6'])
        const lines = stdout.trim().split('\n').slice(1)
        topProcs.value = lines.map(line => {
          const parts = line.trim().split(/\s+/)
          return { pid: parts[0], cpu: parts[1] + '%', mem: parts[2] + '%', name: parts.slice(3).join(' ').split('/').pop() }
        })
      }
    } catch {}
  }

  async function updateUptime() {
    try {
      const { stdout } = await ctx.exec.run(['uptime'])
      const match = stdout.match(/up\s+(.+?),\s+\d+\s+user/)
      if (match) uptime.value = match[1].trim()
      else uptime.value = stdout.split('up')[1]?.split(',')[0]?.trim() || ''
    } catch {}
  }

  async function updateAll() {
    if (isUpdating) return
    isUpdating = true
    try {
      await Promise.all([updateCPU(), updateMemory(), updateDisk(), updateTopProcesses()])
    } catch (e) {
      console.warn('updateAll error:', e)
    }
    isUpdating = false
  }

  function drawChart(canvas, data, color, label, valueText) {
    if (!canvas || !canvas.clientWidth) return
    const ctx2d = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    ctx2d.scale(dpr, dpr)
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight

    ctx2d.clearRect(0, 0, cw, ch)

    // Grid lines
    ctx2d.strokeStyle = 'rgba(160, 160, 160, 0.06)'
    ctx2d.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = (ch / 4) * i
      ctx2d.beginPath()
      ctx2d.moveTo(0, y)
      ctx2d.lineTo(cw, y)
      ctx2d.stroke()
    }

    if (data.length < 2) return

    // Draw filled area
    const step = cw / (MAX_HISTORY - 1)
    ctx2d.beginPath()
    ctx2d.moveTo(0, ch)
    data.forEach((val, i) => {
      const x = i * step
      const y = ch - (val / 100) * ch
      if (i === 0) ctx2d.lineTo(x, y)
      else ctx2d.lineTo(x, y)
    })
    ctx2d.lineTo((data.length - 1) * step, ch)
    ctx2d.closePath()

    const grad = ctx2d.createLinearGradient(0, 0, 0, ch)
    grad.addColorStop(0, color + '40')
    grad.addColorStop(1, color + '05')
    ctx2d.fillStyle = grad
    ctx2d.fill()

    // Draw line
    ctx2d.beginPath()
    data.forEach((val, i) => {
      const x = i * step
      const y = ch - (val / 100) * ch
      if (i === 0) ctx2d.moveTo(x, y)
      else ctx2d.lineTo(x, y)
    })
    ctx2d.strokeStyle = color
    ctx2d.lineWidth = 1.5
    ctx2d.stroke()

    // Glow
    ctx2d.shadowColor = color
    ctx2d.shadowBlur = 4
    ctx2d.stroke()
    ctx2d.shadowBlur = 0
  }

  function redrawCharts() {
    drawChart(cpuCanvas, cpuHistory.value, '#aaaaaa', 'CPU', cpuUsage.value + '%')
    drawChart(memCanvas, memHistory.value, '#ff0040', 'MEM', memPercent.value + '%')
  }

  let resizeTimer = null
  function onResize() {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(redrawCharts, 100)
  }

  ctx.commands.register('jiahao-monitor.open', () => { ctx.open() })

  return {
    component: {
      setup() {
        ctx.onMounted(async () => {
          osType.value = await getOS()
          try {
            const { stdout } = await ctx.exec.run(['sh', '-c', "sysctl -n machdep.cpu.brand_string 2>/dev/null || lscpu 2>/dev/null | grep 'Model name' | cut -d: -f2"])
            cpuModel.value = stdout.trim()
          } catch {}

          await updateUptime()
          await updateAll()
          updateTimer = setInterval(() => {
            updateAll()
            redrawCharts()
          }, 2000)
          window.addEventListener('resize', onResize)
        })

        ctx.onUnmounted(() => {
          if (updateTimer) clearInterval(updateTimer)
          window.removeEventListener('resize', onResize)
        })

        return {}
      },
      render() {
        return h('div', { class: 'jm-root' }, [
          // Header
          h('div', { class: 'jm-header' }, [
            h('h1', { class: 'jm-title' }, [
              'SYSTEM MONITOR',
              cpuModel.value ? h('i', { class: 'jm-subtitle' }, cpuModel.value) : null,
            ].filter(Boolean)),
          ]),

          // CPU Section
          h('div', { class: 'jm-section' }, [
            h('div', { class: 'jm-section-header' }, [
              h('span', { class: 'jm-label' }, 'CPU'),
              h('span', { class: 'jm-value' }, cpuUsage.value + '%'),
            ]),
            h('canvas', {
              class: 'jm-chart',
              ref: el => {
                cpuCanvas = el
                if (el) {
                  requestAnimationFrame(() => drawChart(el, cpuHistory.value, '#aaaaaa', 'CPU', cpuUsage.value + '%'))
                }
              },
            }),
          ]),

          // Memory Section
          h('div', { class: 'jm-section' }, [
            h('div', { class: 'jm-section-header' }, [
              h('span', { class: 'jm-label' }, 'MEMORY'),
              h('span', { class: 'jm-value' }, memPercent.value + '%'),
            ]),
            h('div', { class: 'jm-mem-info' }, [
              h('span', null, 'USING ' + formatBytes(memUsed.value) + ' / ' + formatBytes(memTotal.value)),
            ]),
            h('canvas', {
              class: 'jm-chart',
              ref: el => {
                memCanvas = el
                if (el) {
                  requestAnimationFrame(() => drawChart(el, memHistory.value, '#ff0040', 'MEM', memPercent.value + '%'))
                }
              },
            }),
            // Memory dot grid
            h('div', { class: 'jm-dotgrid' },
              Array.from({ length: 200 }, (_, i) => {
                const threshold = memPercent.value / 100 * 200
                let cls = 'jm-dot jm-dot-free'
                if (i < threshold) cls = 'jm-dot jm-dot-active'
                return h('div', { key: i, class: cls })
              })
            ),
          ]),

          // Disk Section
          h('div', { class: 'jm-section' }, [
            h('div', { class: 'jm-section-header' }, [
              h('span', { class: 'jm-label' }, 'DISK'),
            ]),
            ...diskInfo.value.map((disk, i) =>
              h('div', { key: 'd' + i, class: 'jm-disk-row' }, [
                h('span', { class: 'jm-disk-mount' }, disk.mount),
                h('div', { class: 'jm-disk-bar-wrap' }, [
                  h('div', {
                    class: 'jm-disk-bar',
                    style: `width: ${disk.percent}`,
                  }),
                ]),
                h('span', { class: 'jm-disk-info' }, disk.used + ' / ' + disk.size),
              ])
            ),
          ]),

          // Top Processes
          h('div', { class: 'jm-section' }, [
            h('div', { class: 'jm-section-header' }, [
              h('span', { class: 'jm-label' }, 'TOP PROCESSES'),
              h('span', { class: 'jm-uptime' }, uptime.value ? 'UP ' + uptime.value : ''),
            ]),
            h('div', { class: 'jm-proc-header' }, [
              h('span', null, 'PID'),
              h('span', null, 'NAME'),
              h('span', null, 'CPU'),
              h('span', null, 'MEM'),
            ]),
            ...topProcs.value.map((proc, i) =>
              h('div', { key: 'p' + i, class: 'jm-proc-row' }, [
                h('span', { class: 'jm-proc-pid' }, proc.pid),
                h('span', { class: 'jm-proc-name' }, proc.name),
                h('span', { class: 'jm-proc-cpu' }, proc.cpu),
                h('span', { class: 'jm-proc-mem' }, proc.mem),
              ])
            ),
          ]),
        ])
      },
    },

    monitor: {
      series: [
        {
          id: 'jiahao-monitor:cpu',
          label: 'CPU Usage',
          scale: 'percent',
          color: '#aaaaaa',
          statusIcon: 'Cpu',
          current: () => cpuUsage.value,
          statusText: () => 'CPU ' + cpuUsage.value + '%',
          detail: () => [
            { label: 'Usage', value: cpuUsage.value + '%' },
            { label: 'OS', value: osType.value },
            { label: 'Uptime', value: uptime.value },
          ],
        },
        {
          id: 'jiahao-monitor:mem',
          label: 'Memory Usage',
          scale: 'percent',
          color: '#ff0040',
          statusIcon: 'MemoryStick',
          current: () => memPercent.value,
          statusText: () => 'MEM ' + memPercent.value + '%',
          detail: () => [
            { label: 'Used', value: formatBytes(memUsed.value) },
            { label: 'Total', value: formatBytes(memTotal.value) },
            { label: 'Swap Used', value: formatBytes(swapUsed.value) },
            { label: 'Swap Total', value: formatBytes(swapTotal.value) },
          ],
        },
      ],
    },

    dispose() {
      if (updateTimer) clearInterval(updateTimer)
    },
  }
}

// ── Simplified continent outlines for connection drawing ──
const CONTINENTS_OUTLINE = [
  [[70,-168],[72,-100],[65,-60],[50,-55],[44,-65],[30,-80],[25,-80],[20,-105],[30,-115],[35,-120],[48,-125],[55,-130],[60,-140],[65,-168],[70,-168]],
  [[12,-70],[5,-78],[-5,-80],[-15,-75],[-25,-70],[-35,-60],[-50,-70],[-55,-68],[-55,-63],[-45,-55],[-30,-45],[-20,-40],[-5,-50],[0,-50],[5,-60],[12,-70]],
  [[70,20],[72,40],[65,45],[55,40],[48,30],[45,25],[38,25],[36,0],[40,-8],[43,-10],[48,-5],[50,2],[55,10],[55,15],[60,25],[65,25],[70,20]],
  [[35,-5],[37,10],[33,35],[12,44],[0,42],[-5,40],[-15,40],[-25,35],[-35,20],[-35,18],[-30,15],[-25,12],[-15,12],[-5,8],[0,10],[5,0],[10,-15],[15,-17],[20,-17],[25,-15],[30,-10],[35,-5]],
  [[70,40],[72,80],[70,130],[65,170],[60,165],[55,140],[50,130],[45,140],[40,130],[35,120],[30,120],[25,105],[20,100],[10,105],[5,100],[10,80],[20,75],[25,65],[30,50],[35,40],[40,30],[45,35],[50,30],[55,40],[60,50],[65,55],[70,40]],
  [[-15,130],[-20,115],[-25,115],[-35,118],[-35,140],[-30,153],[-25,153],[-20,148],[-15,145],[-12,137],[-15,130]],
]

export function activate(ctx) {
  const h = ctx.h

  const geoInfo = ctx.ref({ lat: 0, lon: 0, city: '', country: '' })
  const status = ctx.ref('loading')
  const globeReady = ctx.ref(false)
  let canvas = null
  let globe = null
  let animId = null
  let markerLat = 39.9
  let markerLon = 116.4
  let geoData = null
  let ENCOM = null

  async function fetchGeo() {
    status.value = 'loading'
    const apis = [
      { url: 'http://ip-api.com/json/?fields=status,lat,lon,city,country', parse: d => d.status === 'success' ? { lat: d.lat, lon: d.lon, city: d.city, country: d.country } : null },
      { url: 'https://ipapi.co/json/', parse: d => d.latitude ? { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_name } : null },
      { url: 'https://ipwho.is/', parse: d => d.success !== false ? { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country } : null },
    ]
    for (const api of apis) {
      try {
        const { stdout } = await ctx.exec.run(['sh', '-c', `curl -sL --max-time 5 '${api.url}' 2>/dev/null`], { timeout: 8000 })
        const data = JSON.parse(stdout.trim())
        const geo = api.parse(data)
        if (geo && geo.lat && geo.lon) {
          markerLat = geo.lat
          markerLon = geo.lon
          geoInfo.value = { lat: geo.lat, lon: geo.lon, city: geo.city || '', country: geo.country || '' }
          status.value = 'online'
          return
        }
      } catch {}
    }
    geoInfo.value = { lat: markerLat, lon: markerLon, city: 'Beijing', country: 'China' }
    status.value = 'online'
  }

  async function loadVendorScript(relativePath) {
    const res = await ctx.fetchAsset(relativePath)
    if (!res.ok) throw new Error(`load ${relativePath} failed: ${res.status}`)
    const code = await res.text()
    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = blobUrl
      script.onload = resolve
      script.onerror = () => reject(new Error(`script load failed: ${relativePath}`))
      document.head.appendChild(script)
    })
    URL.revokeObjectURL(blobUrl)
  }

  async function loadGridData() {
    const resp = await fetch(ctx.assetUrl('./grid.json'))
    if (!resp.ok) throw new Error(`load grid.json failed: ${resp.status}`)
    return resp.json()
  }

  async function initGlobe() {
    try {
      if (!window.ENCOM) window.ENCOM = {}

      // Load encom-globe.js (includes Three.js r66) via fetchAsset + Blob URL
      await loadVendorScript('./encom-globe.js')

      ENCOM = window.ENCOM
      if (!ENCOM || !ENCOM.Globe) {
        console.warn('ENCOM.Globe not available after loading')
        return false
      }

      // Load grid data via assetUrl
      geoData = await loadGridData()
      if (!geoData || !geoData.tiles) {
        console.warn('grid.json missing tiles data')
        return false
      }

      return true
    } catch (e) {
      console.warn('Failed to load ENCOM Globe:', e)
      return false
    }
  }

  function createGlobe() {
    if (!canvas || !ENCOM || !geoData) return

    const container = canvas.parentElement
    const w = container.offsetWidth
    const ht = container.offsetHeight

    globe = new ENCOM.Globe(w, ht, {
      font: 'monospace',
      data: [],
      tiles: geoData.tiles,
      baseColor: '#000000',
      markerColor: '#aacfd1',
      pinColor: '#aacfd1',
      satelliteColor: '#aacfd1',
      scale: 1.1,
      viewAngle: 0.630,
      dayLength: 1000 * 45,
      introLinesDuration: 2000,
      introLinesColor: '#aacfd1',
      maxPins: 300,
      maxMarkers: 100,
    })

    canvas.style.display = 'none'
    container.appendChild(globe.domElement)

    globe.init(0x111111, () => {
      globeReady.value = true
      animate()
    })

    // Satellites
    const constellation = []
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        constellation.push({
          lat: 50 * i - 30 + 15 * Math.random(),
          lon: 120 * j - 120 + 30 * i,
          altitude: 1.3 + Math.random() * 0.4,
        })
      }
    }
    globe.addConstellation(constellation)

    // Resize handler
    const onResize = () => {
      if (!globe) return
      const cw = container.offsetWidth
      const ch = container.offsetHeight
      globe.camera.aspect = cw / ch
      globe.camera.updateProjectionMatrix()
      globe.renderer.setSize(cw, ch)
    }
    window.addEventListener('resize', onResize)
    globe._resizeHandler = onResize
    globe._container = container
  }

  function animate() {
    if (globe) globe.tick()
    animId = requestAnimationFrame(animate)
  }

  // Marker
  let lastMarkerLat = null
  let lastMarkerLon = null
  let currentPin = null
  let currentMarker = null

  function updateMarker() {
    if (!globe || !globeReady.value) return
    if (markerLat === lastMarkerLat && markerLon === lastMarkerLon) return

    if (currentPin) { try { currentPin.remove() } catch {} }
    if (currentMarker) { try { currentMarker.remove() } catch {} }
    globe.pins = []
    globe.markers = []

    currentPin = globe.addPin(markerLat, markerLon, '', 1.2)
    currentMarker = globe.addMarker(markerLat, markerLon, `${geoInfo.value.country} ${geoInfo.value.city}`, false, 1.2)

    lastMarkerLat = markerLat
    lastMarkerLon = markerLon
  }

  ctx.commands.register('jiahao-globe.open', () => { ctx.open() })

  return {
    component: {
      setup() {
        ctx.onMounted(async () => {
          const loaded = await initGlobe()
          if (loaded) {
            createGlobe()
            const checkReady = setInterval(() => {
              if (globeReady.value) {
                clearInterval(checkReady)
                updateMarker()
                setInterval(updateMarker, 1000)
              }
            }, 200)
          }
          await fetchGeo()
        })
        ctx.onUnmounted(() => {
          if (animId) cancelAnimationFrame(animId)
          if (globe) {
            if (globe._resizeHandler) window.removeEventListener('resize', globe._resizeHandler)
            if (globe.domElement && globe.domElement.parentNode) {
              globe.domElement.parentNode.removeChild(globe.domElement)
            }
          }
        })
        return {}
      },
      render() {
        const geo = geoInfo.value
        const isOnline = status.value === 'online'
        const isLoading = status.value === 'loading'

        return h('div', { class: 'jg-root' }, [
          h('div', { class: 'jg-header' }, [
            h('div', { class: 'jg-header-content' }, [
              h('h1', { class: 'jg-title' }, [
                'WORLD VIEW',
                h('i', { class: 'jg-subtitle' }, 'GLOBAL NETWORK MAP'),
              ]),
              h('h2', { class: 'jg-coord' }, [
                'ENDPOINT LAT/LON ',
                h('i', { class: 'jg-coord-val' + (isOnline ? '' : ' jg-off') },
                  isLoading ? '...' : isOnline ? geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) : '(OFFLINE)'
                ),
              ]),
              geo.city ? h('div', { class: 'jg-location' }, geo.country + ' / ' + geo.city) : null,
            ].filter(Boolean)),
          ]),
          h('div', { class: 'jg-canvas-wrap' }, [
            h('canvas', { class: 'jg-canvas', ref: el => { canvas = el } }),
          ]),
          h('div', { class: 'jg-footer' }, [
            h('span', { class: 'jg-fl' }, 'LAT'),
            h('span', { class: 'jg-fv' }, isOnline ? geo.lat.toFixed(2) : '--'),
            h('span', { class: 'jg-fs' }),
            h('span', { class: 'jg-fl' }, 'LON'),
            h('span', { class: 'jg-fv' }, isOnline ? geo.lon.toFixed(2) : '--'),
            h('span', { class: 'jg-fs' }),
            h('span', { class: 'jg-fl' }, 'STATUS'),
            h('span', { class: 'jg-fst' + (isOnline ? ' jg-on' : isLoading ? '' : ' jg-off-tag') },
              isLoading ? 'LOADING' : isOnline ? 'ONLINE' : 'OFFLINE'
            ),
          ]),
          !globeReady.value && !isLoading
            ? h('div', { class: 'jg-loading' }, 'INITIALIZING GLOBE...')
            : null,
        ].filter(Boolean))
      },
    },
    dispose() {
      if (animId) cancelAnimationFrame(animId)
    },
  }
}

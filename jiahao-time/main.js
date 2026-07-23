export function activate(ctx) {
  const h = ctx.h

  const timeStr = ctx.ref('')
  const dateStr = ctx.ref('')
  const ampm = ctx.ref('')
  const twelveHours = ctx.ref(false)

  function pad(n) {
    return n < 10 ? '0' + n : '' + n
  }

  function updateClock() {
    const now = new Date()
    let hours = now.getHours()
    const minutes = now.getMinutes()
    const seconds = now.getSeconds()

    if (twelveHours.value) {
      ampm.value = hours >= 12 ? 'PM' : 'AM'
      if (hours > 12) hours -= 12
      if (hours === 0) hours = 12
    }

    timeStr.value = pad(hours) + ':' + pad(minutes) + ':' + pad(seconds)
  }

  function updateDate() {
    const now = new Date()
    dateStr.value = now.getFullYear() + '年' + pad(now.getMonth() + 1) + '月' + pad(now.getDate()) + '日'
  }

  let clockTimer
  let dateTimer

  ctx.commands.register('jiahao-time.open', () => { ctx.open() })

  return {
    component: {
      setup() {
        ctx.onMounted(() => {
          updateClock()
          updateDate()
          clockTimer = setInterval(updateClock, 1000)

          // Schedule date update at next midnight
          const now = new Date()
          const msToMidnight = ((23 - now.getHours()) * 3600000) + ((59 - now.getMinutes()) * 60000) + ((59 - now.getSeconds()) * 1000) + (1000 - now.getMilliseconds())
          dateTimer = setTimeout(() => {
            updateDate()
            dateTimer = setInterval(updateDate, 86400000)
          }, msToMidnight)
        })

        ctx.onUnmounted(() => {
          clearInterval(clockTimer)
          clearTimeout(dateTimer)
          clearInterval(dateTimer)
        })

        return {}
      },
      render() {
        const digits = timeStr.value.split('')
        return h('div', { class: 'jt-root' }, [
          h('div', { class: 'jt-clock' }, [
            h('div', { class: 'jt-time' },
              digits.map((ch, i) => {
                if (ch === ':') {
                  return h('em', { key: 'c' + i, class: 'jt-colon' }, ':')
                }
                return h('span', { key: 'd' + i, class: 'jt-digit' }, ch)
              }).concat(
                twelveHours.value && ampm.value
                  ? [h('span', { key: 'ampm', class: 'jt-ampm' }, ampm.value)]
                  : []
              )
            ),
            h('div', { class: 'jt-date' }, dateStr.value),
          ]),
          h('div', { class: 'jt-controls' }, [
            h('button', {
              class: 'jt-btn' + (twelveHours.value ? ' jt-btn-active' : ''),
              onClick: () => { twelveHours.value = !twelveHours.value; updateClock() },
            }, twelveHours.value ? '12H' : '24H'),
          ]),
        ])
      },
    },
  }
}

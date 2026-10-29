import './race-hud.css'
import { MODELS } from './models.js'
import { clock, gap, letter } from './race.js'
import { sound } from './sound.js'

const SPLIT = 2.5 // seconds a split stays up
const SHOWN = 6 // places on the finish card
const CARD = 15 // seconds the finish card stays up

const vehicleIcon = (v) => (v === 'foot' ? 'foot' : v === 'bike' ? 'act-bike' : 'act-car')
const vehicleName = (v) => (v === 'foot' ? 'zu Fuß' : v === 'bike' ? 'Fahrrad' : (MODELS[v]?.name ?? 'Auto'))
const vehicleTag = (v) =>
	`<img class="icon" src="/icons/${vehicleIcon(v)}.png" alt="${vehicleName(v)}" title="${vehicleName(v)}">${MODELS[v] && v !== 'car' ? `<small>${vehicleName(v)}</small>` : ''}`

export function createRaceHud({ placeGate, finish, restart, share }) {
	const el = document.createElement('div')
	el.id = 'race'
	el.innerHTML = `
		<div class="corner">
		<div class="watch" hidden><div class="gates"></div><b class="time"></b><span class="split"></span><button type="button" class="next-step"></button></div>
		<div class="race-buttons">
			<button type="button" class="restart" aria-label="Neustart (Q)" title="Neustart (Q)"><img class="icon" src="/icons/race-restart.png" alt=""><kbd>Q</kbd></button>
			<button type="button" class="finish" aria-label="Rennen fertig (F)" title="Rennen fertig (F)"><img class="icon" src="/icons/race-finish.png" alt=""><kbd>F</kbd></button>
			<button type="button" class="gate" aria-label="Tor setzen (G)" title="Tor setzen (G)"><img class="icon" src="/icons/race-gate.png" alt=""><kbd>G</kbd></button>
		</div>
		<div class="card" hidden></div>
		</div>
		<div class="count" hidden></div>`
	document.body.append(el)
	const $ = (s) => el.querySelector(s)
	const watch = $('.watch')
	const gatesEl = $('.gates')
	const time = $('.time')
	const split = $('.split')
	const count = $('.count')
	const card = $('.card')
	const nextStep = $('.next-step')
	nextStep.addEventListener('pointerdown', (e) => {
		e.preventDefault()
		e.stopPropagation()
		sound.start()
		;(nextStep.dataset.step === 'finish' ? finish : placeGate)()
	})
	card.addEventListener('pointerdown', (e) => {
		if (!e.target.closest('.share')) return
		e.preventDefault()
		e.stopPropagation()
		share()
	})
	const buttons = { gate: $('.gate'), finish: $('.finish'), restart: $('.restart') }
	const press = { gate: placeGate, finish, restart }
	for (const [name, button] of Object.entries(buttons)) {
		button.addEventListener('pointerdown', (e) => {
			e.preventDefault()
			e.stopPropagation()
			sound.start()
			press[name]()
		})
		button.addEventListener('click', (e) => e.preventDefault())
	}

	let shown = {}
	let splitFor = 0
	let cardFor = 0
	let beat = null // what the countdown shows
	let goFor = 0
	function pop(text) {
		count.textContent = text
		count.hidden = false
		count.classList.remove('pop')
		void count.offsetWidth
		count.classList.add('pop')
	}
	const set = (key, value, apply) => {
		if (shown[key] === value) return
		shown[key] = value
		apply(value)
	}

	return {
		// `view`: { mode: 'idle' | 'draft' | 'countdown' | 'running' | 'done',
		// gates, next, t, count, canFinish, canRestart }.
		update(view, dt) {
			const { mode } = view
			set('watch', mode !== 'idle', (on) => (watch.hidden = !on))
			set('mode', mode, (m) => {
				el.dataset.mode = m
				if (m === 'countdown') split.className = 'split'
			})
			set('badges', `${mode}:${view.gates}:${view.next}`, () => {
				const badges = Array.from({ length: view.gates }, (_, i) => {
					const last = mode === 'draft' && i === view.gates - 1 && i > 0 ? ' last' : ''
					const state = (mode === 'draft' ? 'set' : i < view.next ? 'taken' : i === view.next ? 'next' : '') + last
					return `<i class="${state}">${letter(i)}</i>`
				})
				if (mode === 'draft') badges.push('<i class="add">+</i>')
				gatesEl.innerHTML = badges.join('')
			})
			const step = mode !== 'draft' ? '' : view.gates < 2 ? 'gate' : 'finish'
			set('step', step, (s) => {
				nextStep.dataset.step = s
				nextStep.hidden = !s
				nextStep.innerHTML =
					s === 'gate'
						? '<img class="icon" src="/icons/race-gate.png" alt=""><span>Nächstes Tor</span><kbd>G</kbd>'
						: '<img class="icon" src="/icons/race-finish.png" alt=""><span>Ziel &amp; los</span><kbd>F</kbd>'
			})
			const t = mode === 'draft' ? '' : clock(view.t)
			set('time', t, (v) => (time.textContent = v))
			set('restart', view.canRestart, (on) => buttons.restart.classList.toggle('can', on))
			set('gate', mode !== 'countdown' && mode !== 'running', (on) => buttons.gate.classList.toggle('can', on))
			set('finish', view.canFinish, (on) => buttons.finish.classList.toggle('can', on))
			if (mode === 'countdown') {
				const n = Math.ceil(view.count)
				if (n !== beat) {
					beat = n
					pop(String(n))
					beep(660, 0.12)
				}
			} else if (typeof beat === 'number' && mode === 'running') {
				beat = 'go'
				pop('LOS!')
				beep(1320, 0.3)
				goFor = 0.8
			} else if (beat !== null && (goFor -= dt) <= 0) {
				beat = null
				count.hidden = true
			}
			if (splitFor > 0 && (splitFor -= dt) <= 0) split.className = 'split'
			if ((mode !== 'done' || (cardFor -= dt) < 0) && !card.hidden) card.hidden = true
		},

		split({ time: t, delta, finish: last }) {
			split.textContent = delta === null ? clock(t) : gap(delta)
			split.className = `split on ${delta === null ? '' : delta < 0 ? 'ahead' : 'behind'}`
			splitFor = SPLIT
			if (!last) chime([880, 1320])
		},

		result({ time: t, best, place, times, previous, rival }) {
			const rows = times
				.slice(0, SHOWN)
				.map(
					(row, i) =>
						`<li class="${i === place ? 'you' : ''}"><span>${i + 1}</span>${vehicleTag(row.vehicle)}<b>${clock(row.time)}</b></li>`,
				)
				.join('')
			const head = best ? '<em class="best">Bestzeit!</em>' : `<em class="behind">${gap(t - previous)}</em>`
			const vs = !rival
				? ''
				: `<small class="vs ${t < rival.time ? 'ahead' : 'behind'}">${t < rival.time ? 'Schneller' : 'Langsamer'} als ${rival.name || 'der Geist'}: ${gap(t - rival.time)}</small>`
			card.innerHTML = `<b class="final">${clock(t)}</b>${head}${vs}<ol>${rows}</ol><button type="button" class="share">${rival && t < rival.time ? 'Link zurückschicken' : 'Link teilen'}</button><p><img class="icon" src="/icons/race-restart.png" alt="Nochmal"><kbd>Q</kbd></p>`
			card.hidden = false
			cardFor = CARD
			chime(best ? [880, 1109, 1319, 1760] : [880, 1109, 1319])
		},

		placed: () => chime([1046]),
		saved: () => chime([784, 1046, 1568]),
	}
}

function chime(notes) {
	notes.forEach((hz, i) => beep(hz, 0.5, i * 0.09))
}

function beep(hz, length, delay = 0) {
	const audio = sound.audio()
	if (!audio || audio.muted) return
	const { context, master } = audio
	const at = context.currentTime + delay
	const osc = context.createOscillator()
	const gain = context.createGain()
	osc.type = 'triangle'
	osc.frequency.value = hz
	gain.gain.setValueAtTime(0, at)
	gain.gain.linearRampToValueAtTime(0.12, at + 0.008)
	gain.gain.exponentialRampToValueAtTime(0.001, at + length)
	osc.connect(gain).connect(master)
	osc.start(at)
	osc.stop(at + length + 0.05)
}

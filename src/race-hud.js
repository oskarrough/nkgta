// The race on screen: a stopwatch top-left with the gates as little badges
// (taken ones dark, the next one yellow) and a split chip that flashes green
// ahead of your best and red behind; 3-2-1 over the street; and at the finish
// a card under the watch with your time and the leaderboard, a picture of the
// vehicle beside each time. Buttons for the gate flag, finishing and
// restarting show when they do something, always on a phone; on a keyboard
// each has its key in the corner. The chimes are made here too.
import './race-hud.css'
import { MODELS } from './models.js'
import { clock, gap, letter } from './race.js'
import { sound } from './sound.js'

const SPLIT = 2.5 // seconds a split stays up
const SHOWN = 6 // places on the finish card
const CARD = 10 // seconds the finish card stays up

const vehicleIcon = (v) => (v === 'foot' ? 'foot' : v === 'bike' ? 'act-bike' : 'act-car')
const vehicleName = (v) => (v === 'foot' ? 'zu Fuß' : v === 'bike' ? 'Fahrrad' : (MODELS[v]?.name ?? 'Auto'))
const vehicleTag = (v) =>
	`<img class="icon" src="/icons/${vehicleIcon(v)}.png" alt="${vehicleName(v)}" title="${vehicleName(v)}">${MODELS[v] && v !== 'car' ? `<small>${vehicleName(v)}</small>` : ''}`

export function createRaceHud({ placeGate, finish, restart }) {
	const el = document.createElement('div')
	el.id = 'race'
	el.innerHTML = `
		<div class="corner">
		<div class="watch" hidden><div class="gates"></div><b class="time"></b><span class="split"></span></div>
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
					const state = mode === 'draft' ? 'set' : i < view.next ? 'taken' : i === view.next ? 'next' : ''
					return `<i class="${state}">${letter(i)}</i>`
				})
				if (mode === 'draft') badges.push('<i class="add">+</i>')
				gatesEl.innerHTML = badges.join('')
			})
			const t = mode === 'draft' ? '' : clock(view.t)
			set('time', t, (v) => (time.textContent = v))
			set('restart', view.canRestart, (on) => buttons.restart.classList.toggle('can', on))
			set('gate', mode !== 'countdown' && mode !== 'running', (on) => buttons.gate.classList.toggle('can', on))
			set('finish', view.canFinish, (on) => buttons.finish.classList.toggle('can', on))
			// 3, 2, 1 with a beep each, then LOS! on a higher one.
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

		// A gate taken: the split against the best run there, if there is one.
		split({ gate, time: t, delta, finish: last }) {
			split.textContent = delta === null ? clock(t) : gap(delta)
			split.className = `split on ${delta === null ? '' : delta < 0 ? 'ahead' : 'behind'}`
			splitFor = SPLIT
			if (!last) chime([880, 1320])
		},

		// Over the line: the time, and where it landed among the race's times.
		result({ time: t, best, place, times, previous }) {
			const rows = times
				.slice(0, SHOWN)
				.map(
					(row, i) =>
						`<li class="${i === place ? 'you' : ''}"><span>${i + 1}</span>${vehicleTag(row.vehicle)}<b>${clock(row.time)}</b></li>`,
				)
				.join('')
			const head = best ? '<em class="best">Bestzeit!</em>' : `<em class="behind">${gap(t - previous)}</em>`
			card.innerHTML = `<b class="final">${clock(t)}</b>${head}<ol>${rows}</ol><p><img class="icon" src="/icons/race-restart.png" alt="Nochmal"><kbd>Q</kbd></p>`
			card.hidden = false
			cardFor = CARD
			chime(best ? [880, 1109, 1319, 1760] : [880, 1109, 1319])
		},

		// A new gate dropped, or the race saved: a little plink.
		placed: () => chime([1046]),
		saved: () => chime([784, 1046, 1568]),
	}
}

// Rising notes, struck like a bell.
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

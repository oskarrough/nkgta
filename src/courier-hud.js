import './courier-hud.css'
import { badgeSprites } from './sprites.js'
import { euro } from './pfand.js'
import { beep, chime } from './race-hud.js'
import { sound } from './sound.js'

const PAID = 6 // seconds the pay slip stays up

export const mmss = (s) => {
	const t = Math.max(0, Math.ceil(s))
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

let badges = null
const badgeOf = (kind) => {
	badges ??= Object.fromEntries(Object.entries(badgeSprites()).map(([k, c]) => [k, c.toDataURL()]))
	return badges[kind]
}

// The courier app on the pocket device: waiting, the offer, the ride's clock
// and the pay slip. An offer takes the screen and buzzes; the slip hands it back.
export function createCourierHud({ accept, pocket }) {
	const page = document.createElement('div')
	page.className = 'app-job'
	page.innerHTML = `
		<p class="wait"><img class="icon" src="/icons/job-bag.png" alt=""><span></span></p>
		<div class="offer" hidden>
			<div class="route"><img class="kitchen" alt=""><b class="from"></b><img class="icon door" src="/icons/job-door.png" alt="nach"><b class="to"></b></div>
			<div class="deal"><span class="pay"></span><span class="limit"></span><kbd>C</kbd></div>
			<i class="fuse"></i>
		</div>
		<div class="ride" hidden>
			<div class="goal"><img class="kitchen" alt=""><img class="icon door" src="/icons/job-door.png" alt=""><b class="where"></b></div>
			<b class="left"></b>
			<div class="items"></div>
		</div>
		<div class="slip" hidden></div>`
	const $ = (s) => page.querySelector(s)
	const wait = $('.wait')
	const offer = $('.offer')
	const ride = $('.ride')
	const slip = $('.slip')
	pocket.add({
		id: 'job',
		icon: 'job-bag',
		label: 'Kurier (C nimmt an)',
		page,
		tap() {
			sound.start()
			accept()
		},
	})

	const shown = {}
	const set = (key, value, apply) => {
		if (shown[key] === value) return
		shown[key] = value
		apply(value)
	}
	let slipFor = 0
	let tock = null

	return {
		update({ mode, job, fuse = 0, left = 0, spilt = 0 }, dt) {
			set('mode', mode, (m) => {
				const was = page.dataset.mode
				page.dataset.mode = m
				offer.hidden = m !== 'offer'
				ride.hidden = m !== 'pickup' && m !== 'deliver'
				if (m === 'offer') pocket.alert('job')
				else if (was === 'offer' && m === 'pickup') pocket.calm('job')
				else if (was === 'offer') pocket.release('job')
				wait.querySelector('span').textContent = m === 'off' ? 'Kurier aus' : 'Warte auf Fahrten…'
			})
			wait.hidden = !offer.hidden || !ride.hidden || !slip.hidden
			set('job', job, (j) => {
				if (!j) return
				tock = null
				for (const img of page.querySelectorAll('.kitchen')) img.src = badgeOf(j.from.kind)
				$('.from').textContent = j.from.name
				$('.to').textContent = `${j.to.street} ${j.to.number}`
				$('.pay').textContent = euro(j.pay)
				$('.limit').textContent = mmss(j.limit)
			})
			if (mode === 'offer') offer.style.setProperty('--fuse', fuse.toFixed(3))
			const riding = mode === 'pickup' || mode === 'deliver'
			if (riding) {
				set('where', `${mode}:${job.from.name}:${job.to.street}:${job.to.number}`, () => {
					$('.where').textContent = mode === 'pickup' ? job.from.name : `${job.to.street} ${job.to.number}`
					ride.dataset.leg = mode
				})
				set('items', `${job.items.join()}:${spilt}`, () => {
					const kept = job.items.length - spilt
					$('.items').innerHTML = job.items.map((item, i) => `<span class="${i >= kept ? 'spilt' : ''}">${item}</span>`).join('')
				})
				const t = mode === 'deliver' ? mmss(left) : mmss(job.limit)
				set('left', t, (v) => ($('.left').textContent = v))
				set('late', mode === 'deliver' && left < 15, (on) => ride.classList.toggle('late', on))

				const n = Math.ceil(left)
				if (mode === 'deliver' && left > 0 && n <= 10 && n !== tock) {
					tock = n
					beep(n <= 3 ? 1320 : 990, 0.06)
				}
			}
			pocket.tag('job', mode === 'deliver' ? `KURIER ${mmss(left)}` : mode === 'pickup' ? 'KURIER' : '')
			if (slipFor > 0 && (slipFor -= dt) <= 0) {
				slip.hidden = true
				pocket.release('job')
			}
		},

		ping() {
			beep(523, 0.09)
			beep(523, 0.09, 0.16)
		},
		took: () => chime([784, 1046]),
		picked: () => chime([880, 1320]),
		bump: () => sound.spill(1),
		lost() {
			slip.innerHTML = '<b class="total gone">€0,00</b><em>Essen weg</em>'
			showSlip()
		},

		paid({ base, tip, knocks, total, late }) {
			const rows = [
				`<li><img class="icon" src="/icons/job-bag.png" alt="Fahrt"><b>${euro(base)}</b></li>`,
				tip ? `<li class="tip"><span>Trinkgeld</span><b>+${euro(tip)}</b></li>` : '',
				knocks ? `<li class="knocks"><span>verschüttet</span><b>−${euro(knocks)}</b></li>` : '',
			]
			slip.innerHTML = `<b class="total">+${euro(total)}</b>${late ? '<em>zu spät</em>' : ''}<ol>${rows.join('')}</ol>`
			showSlip()
			sound.till()
			chime(tip && !knocks ? [880, 1109, 1319, 1760] : [880, 1109, 1319])
		},
	}

	function showSlip() {
		slip.hidden = false
		ride.hidden = true
		slipFor = PAID
		pocket.alert('job')
	}
}

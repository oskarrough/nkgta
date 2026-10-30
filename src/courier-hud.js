import './courier-hud.css'
import { badgeSprites } from './sprites.js'
import { euro } from './pfand.js'
import { beep, chime } from './race-hud.js'
import { sound } from './sound.js'

const PAID = 6 // seconds the pay slip stays up

const mmss = (s) => {
	const t = Math.max(0, Math.ceil(s))
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

let badges = null
const badgeOf = (kind) => {
	badges ??= Object.fromEntries(Object.entries(badgeSprites()).map(([k, c]) => [k, c.toDataURL()]))
	return badges[kind]
}

// The courier on the pocket device. An offer takes the screen, lit, with one
// big key to take it; the ride itself is on the map, its clock on the top
// line; the pay slip takes the screen for a moment and hands it back.
export function createCourierHud({ accept, pocket }) {
	const page = document.createElement('div')
	page.className = 'app-job'
	page.innerHTML = `
		<div class="offer" hidden>
			<div class="route"><img class="kitchen" alt=""><b class="from"></b><img class="icon door" src="/icons/job-door.png" alt="nach"><b class="to"></b></div>
			<p class="deal"><span class="pay"></span><span class="limit"></span></p>
			<button type="button" class="take"><i class="fuse"></i><span>Annehmen</span><kbd>C</kbd></button>
		</div>
		<div class="slip" hidden></div>`
	const $ = (s) => page.querySelector(s)
	const offer = $('.offer')
	const slip = $('.slip')
	pocket.add({ id: 'job', page, tap: take })
	$('.take').addEventListener('click', take)
	function take() {
		sound.start()
		accept()
	}

	const shown = {}
	const set = (key, value, apply) => {
		if (shown[key] === value) return
		shown[key] = value
		apply(value)
	}
	let slipFor = 0
	let tock = null

	return {
		update({ mode, job, fuse = 0, left = 0 }, dt) {
			set('mode', mode, (m) => {
				offer.hidden = m !== 'offer'
				if (m === 'offer') {
					slip.hidden = true
					slipFor = 0
					pocket.alert('job')
				} else if (slip.hidden) pocket.release('job')
			})
			set('job', job, (j) => {
				if (!j) return
				tock = null
				$('.kitchen').src = badgeOf(j.from.kind)
				$('.from').textContent = j.from.name
				$('.to').textContent = `${j.to.street}\u00a0${j.to.number}`
				$('.pay').textContent = euro(j.pay)
				$('.limit').textContent = mmss(j.limit)
			})
			if (mode === 'offer') offer.style.setProperty('--fuse', fuse.toFixed(3))
			if (mode === 'deliver') {
				const n = Math.ceil(left)
				if (left > 0 && n <= 10 && n !== tock) {
					tock = n
					beep(n <= 3 ? 1320 : 990, 0.06)
				}
			}
			pocket.tag(
				'job',
				mode === 'deliver' ? mmss(left) : mode === 'pickup' ? mmss(job.limit) : '',
				mode === 'deliver' && left < 15,
				mode === 'deliver' ? Math.max(0, left / job.limit) : 1,
			)
			if (slipFor > 0 && (slipFor -= dt) <= 0) {
				slip.hidden = true
				pocket.release('job')
			}
		},

		ping() {
			beep(523, 0.09)
			beep(523, 0.09, 0.16)
			navigator.vibrate?.([60, 80, 60])
		},
		took: () => chime([784, 1046]),
		picked: () => chime([880, 1320]),
		bump: () => sound.spill(1),
		lost() {
			slip.innerHTML = '<b class="total">€0,00</b><em>Essen weg</em>'
			showSlip()
		},

		paid({ base, tip, knocks, total, late }) {
			const rows = [
				`<li><img class="icon" src="/icons/job-bag.png" alt="Fahrt"><b>${euro(base)}</b></li>`,
				tip ? `<li><span>Trinkgeld</span><b>+${euro(tip)}</b></li>` : '',
				knocks ? `<li><span>verschüttet</span><b>−${euro(knocks)}</b></li>` : '',
			]
			slip.innerHTML = `<b class="total">+${euro(total)}</b>${late ? '<em>zu spät</em>' : ''}<ol>${rows.join('')}</ol>`
			showSlip()
			sound.till()
			chime(tip && !knocks ? [880, 1109, 1319, 1760] : [880, 1109, 1319])
		},
	}

	function showSlip() {
		slip.hidden = false
		offer.hidden = true
		slipFor = PAID
		pocket.alert('job')
	}
}

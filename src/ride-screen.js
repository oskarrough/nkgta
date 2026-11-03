import { nearBike, selectRide } from './player.js'
import { RIDES, rideKind } from './rides.js'
import './ride-screen.css'

export function createRideScreen({ player, pocket, available }) {
	const page = document.createElement('div')
	page.className = 'app-rides'
	page.innerHTML = `<header>Rollen <button type="button" data-map aria-label="Zur Karte">×</button></header><div class="choices">${Object.entries(
		RIDES,
	)
		.map(([kind, ride]) => `<button type="button" data-ride="${kind}">${ride.name}</button>`)
		.join('')}</div><small></small>`
	const note = page.querySelector('small')
	let shown = ''
	function update() {
		const ready = available() && nearBike(player)
		const state = `${ready}:${rideKind(player)}`
		if (shown === state) return
		shown = state
		for (const button of page.querySelectorAll('[data-ride]')) {
			button.disabled = !ready
			button.ariaPressed = String(button.dataset.ride === rideKind(player))
		}
		note.textContent = !ready
			? 'Zum Tauschen absteigen und neben deinen Rollen stehen.'
			: rideKind(player) === 'kite'
				? 'E: aufsteigen · Wind nach Nordost. Freies Feld; mit dem Wind schnell, dagegen kaum.'
				: rideKind(player) === 'bike'
					? 'E: aufsteigen · WASD oder Stick: fahren.'
					: 'E: aufsteigen · WASD / Stick: fahren, Leertaste: bremsen. Asphalt rollt am besten.'
	}
	page.addEventListener('click', (e) => {
		if (e.target.closest('[data-map]')) return pocket.show('map')
		const kind = e.target.closest('[data-ride]')?.dataset.ride
		if (kind && available() && selectRide(player, kind)) {
			pocket.say(`${RIDES[kind].name} · E: aufsteigen`)
			update()
		}
	})
	pocket.add({ id: 'rides', page, shown: update, update })
	return { open: () => pocket.show(pocket.current() === 'rides' ? 'map' : 'rides') }
}

import { SOLID, T } from './tiles.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const neighbours = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1],
]
const reach = 1.35

function pavement(world, from, radius) {
	const cells = [{ x: Math.floor(from.x) + 0.5, y: Math.floor(from.y) + 0.5 }]
	const seen = new Set()
	for (let i = 0; i < cells.length; i++) {
		const at = cells[i]
		if (world.tileAt(at.x, at.y) === T.SIDEWALK && distance(at, from) >= radius) return at
		for (const [dx, dy] of neighbours) {
			const x = at.x + dx
			const y = at.y + dy
			const key = x + y * world.W
			if (seen.has(key) || Math.hypot(x - from.x, y - from.y) > radius + 1) continue
			seen.add(key)
			const tile = world.tileAt(x, y)
			if (tile === T.SIDEWALK || tile === T.CYCLEWAY || tile === T.GROUND || tile === T.GRASS) cells.push({ x, y })
		}
	}
}

export function createLostDog(world, shops, player, say, bark) {
	let owner, dog, shopName
	const nearby = shops.filter((s) => s.kind === 'spaeti').sort((a, b) => distance(a.stand, player) - distance(b.stand, player))
	for (const shop of nearby) {
		const home = pavement(world, shop.stand, 2.6)
		const hiding = home && pavement(world, home, 16)
		if (!hiding) continue
		dog = { ...hiding, kind: 'dog', dir: 0, stride: 0, bark: 0, free: true }
		owner = { ...home, dir: Math.atan2(shop.stand.y - home.y, shop.stand.x - home.x), stride: 0, seed: 0.448, pet: dog }
		shopName = shop.name
		break
	}

	let stage = 'waiting'
	let calledOut = false
	let nextBark = 0
	const trail = []
	function near(actor) {
		if (distance(player, actor) > reach) return false
		for (const k of [0.25, 0.5, 0.75]) {
			if (SOLID.has(world.tileAt(player.x + (actor.x - player.x) * k, player.y + (actor.y - player.y) * k))) return false
		}
		return true
	}
	function hint() {
		if (!owner || player.car || player.onBike || stage === 'home') return null
		if (stage === 'search' && near(dog)) return { action: 'shop', note: 'Motte rufen' }
		if (!near(owner)) return null
		if (stage === 'lead' && distance(dog, owner) > 2) return null
		return { action: 'shop', note: stage === 'lead' ? 'Motte übergeben' : 'Nach dem Hund fragen' }
	}
	return {
		owner,
		hint,
		use() {
			if (!hint()) return false
			if (stage === 'search' && near(dog)) {
				stage = 'lead'
				trail.push({ x: player.x, y: player.y })
				say(`Motte wedelt. Bring sie zu ${shopName} zurück.`, 5)
			} else if (stage === 'lead') {
				stage = 'home'
				dog.free = false
				dog.bark = 0
				owner.dir = Math.atan2(dog.y - owner.y, dog.x - owner.x)
				dog.dir = Math.atan2(owner.y - dog.y, owner.x - dog.x)
				say('„Motte! Da bist du ja! Danke, dass du sie heimgebracht hast.“', 6)
			} else {
				stage = 'search'
				nextBark = 0
				say('„Hast du Motte gesehen? Braun, rotes Halsband. Hör mal, sie bellt immer zweimal.“', 7)
			}
			return true
		},
		update(dt, active, camera) {
			if (!dog || stage === 'home') return
			if (stage === 'waiting') {
				if (active && !calledOut && distance(player, owner) < 5) {
					say('Vom Späti ruft jemand: „Motte! Hast du meinen Hund gesehen?“', 5)
					calledOut = true
				}
				return
			}
			dog.bark = Math.max(0, dog.bark - dt)
			const d = distance(dog, player)
			if (stage === 'lead') {
				if (!active || player.car || player.onBike || d > 4) {
					stage = 'search'
					trail.length = 0
					nextBark = 0
					if (active) say('Motte wartet. Geh zu Fuß zu ihr zurück.')
					return
				}
				const last = trail.at(-1) ?? dog
				if (distance(last, player) > 0.12) trail.push({ x: player.x, y: player.y })
				let step = dt * 2.6
				while (step > 0 && trail.length) {
					const target = trail[0]
					const gap = distance(dog, target)
					if (trail.length < 5 && d <= 0.48) break
					const move = Math.min(step, gap)
					if (move > 0) {
						dog.dir = Math.atan2(target.y - dog.y, target.x - dog.x)
						dog.x += Math.cos(dog.dir) * move
						dog.y += Math.sin(dog.dir) * move
						dog.stride += move * 18
					}
					step -= move
					if (gap <= move) trail.shift()
				}
			} else if (active && d < 32 && (nextBark -= dt) <= 0) {
				const angle = camera ? Math.atan2(camera.target.y - camera.y, camera.target.x - camera.x) : -Math.PI / 2
				const across = -(dog.x - player.x) * Math.sin(angle) + (dog.y - player.y) * Math.cos(angle)
				bark(1 - d / 32, across / Math.max(1, d))
				dog.bark = 0.6
				nextBark = 3.2
			}
		},
	}
}

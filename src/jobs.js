const KITCHENS = new Set(['doener', 'imbiss', 'spaeti', 'restaurant'])
const PICKUP = { near: 25, far: 170 } // tiles from you to the kitchen
const DROP = { near: 110, far: 330 } // tiles from the kitchen to the door

const BIKE = 2.9
const DETOUR = 1.3
const FIND = 18 // seconds

const PAY = { base: 250, perTile: 1.1, tip: 0.6, bump: 50, late: 0.5 }

const ORDERS = {
	doener: [
		['Döner', 'Ayran'],
		['Dürüm', 'Ayran'],
		['Döner', 'Döner', 'Cola'],
		['Lahmacun', 'Ayran'],
	],
	imbiss: [
		['Currywurst', 'Pommes', 'Cola'],
		['Falafel', 'Fritz-Kola'],
		['Pommes', 'Bier'],
	],
	spaeti: [
		['Chips', 'Club-Mate'],
		['Kippen', 'Sterni'],
		['Eis', 'Club-Mate', 'Club-Mate'],
	],
	restaurant: [
		['Pizza', 'Wein'],
		['Pho', 'Limo'],
		['Pasta', 'Wasser'],
	],
}

export function offerJob(shops, doors, x, y, random = Math.random) {
	const kitchens = shops.filter((s) => KITCHENS.has(s.kind) && within(s.stand, x, y, PICKUP))
	if (!kitchens.length || !doors.length) return null
	for (let tries = 0; tries < 8; tries++) {
		const from = kitchens[Math.floor(random() * kitchens.length)]
		const to = pick(doors, random, (d) => within(d.stand, from.stand.x, from.stand.y, DROP))
		if (!to) continue
		const tiles = Math.hypot(to.stand.x - from.stand.x, to.stand.y - from.stand.y)
		const menu = ORDERS[from.kind]
		return { from, to, tiles, items: [...menu[Math.floor(random() * menu.length)]], limit: timeFor(tiles), pay: basePay(tiles) }
	}
	return null
}

export const timeFor = (tiles) => Math.round((tiles * DETOUR) / BIKE + FIND)

const basePay = (tiles) => Math.round((PAY.base + tiles * PAY.perTile) / 10) * 10

export function payout(job, t, knocked) {
	const bumps = Math.min(knocked, job.items?.length ?? knocked)
	const spare = job.limit - t
	const tip = spare > 0 ? Math.round((spare * PAY.tip * job.pay) / job.limit / 10) * 10 : 0
	const base = spare >= 0 ? job.pay : Math.round((job.pay * PAY.late) / 10) * 10
	const knocks = Math.min(bumps * PAY.bump, base + tip - 50)
	return { base, tip, knocks: Math.max(0, knocks), total: Math.max(50, base + tip - knocks), late: spare < 0 }
}

const within = (p, x, y, { near, far }) => {
	const d = Math.hypot(p.x - x, p.y - y)
	return d >= near && d <= far
}

function pick(list, random, ok) {
	for (let i = 0; i < 60; i++) {
		const item = list[Math.floor(random() * list.length)]
		if (ok(item)) return item
	}
	return null
}

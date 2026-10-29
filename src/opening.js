import OpeningHours from 'opening_hours'

const DEFAULTS = {
	spaeti: 'Mo-Su 08:00-02:00',
	kiosk: 'Mo-Su 08:00-02:00',
	convenience: 'Mo-Su 08:00-02:00',
	bar: 'Mo-Su 17:00-02:00',
	pub: 'Mo-Su 17:00-02:00',
	nightclub: 'Fr-Sa 22:00-05:00',
	cafe: 'Mo-Su 09:00-18:00',
	bakery: 'Mo-Sa 07:00-18:00; Su 08:00-14:00',
	doener: 'Mo-Su 11:00-23:00',
	imbiss: 'Mo-Su 11:00-23:00',
	fast_food: 'Mo-Su 11:00-23:00',
	restaurant: 'Mo-Su 12:00-23:00',
	supermarket: 'Mo-Sa 08:00-21:00',
	pharmacy: 'Mo-Fr 09:00-18:00; Sa 09:00-14:00',
}
const DEFAULT = 'Mo-Sa 10:00-19:00'
const cache = new Map()
const location = { address: { country_code: 'de', state: 'Berlin' }, lat: 52.48, lon: 13.43 }

function parse(value) {
	if (!cache.has(value)) {
		try {
			cache.set(value, new OpeningHours(value, location))
		} catch {
			cache.set(value, null)
		}
	}
	return cache.get(value)
}

export function isOpen(place, hour, day) {
	const fallback = DEFAULTS[place.openingKind ?? place.kind] ?? DEFAULT
	const date = new Date(2024, 0, 8 + day, 0, Math.floor(hour * 60))
	try {
		return (parse(place.openingHours) ?? parse(fallback)).getState(date)
	} catch {
		return parse(fallback).getState(date)
	}
}

export function createOpening() {
	let hour = 11,
		day = 0,
		minute = -1
	const listeners = new Map()
	return {
		isOpen: (place) => isOpen(place, hour, day),
		watch(place, fn) {
			const key = `${place.openingKind ?? place.kind}:${place.openingHours ?? ''}`
			if (!listeners.has(key)) listeners.set(key, { place, callbacks: [], value: isOpen(place, hour, day) })
			const group = listeners.get(key)
			group.callbacks.push(fn)
			fn(group.value)
		},
		set(h, d) {
			hour = h
			day = d
			const next = d * 1440 + Math.floor(h * 60)
			if (next === minute) return
			minute = next
			for (const group of listeners.values()) {
				const open = isOpen(group.place, hour, day)
				if (open === group.value) continue
				group.value = open
				for (const fn of group.callbacks) fn(open)
			}
		},
	}
}

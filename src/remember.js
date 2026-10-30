// What the browser keeps for you between visits: settings, your name, your
// races. Storage can be blocked (a sandboxed frame, strict privacy) or full;
// then the game just forgets and carries on.

export const storage = (() => {
	try {
		return localStorage
	} catch {
		return { getItem: () => null, setItem() {} }
	}
})()

export function recall(key, fallback = null) {
	const raw = storage.getItem(key)
	if (raw === null) return fallback
	try {
		return JSON.parse(raw)
	} catch {
		return raw // saved as a bare string before values were JSON, like a name
	}
}

export function remember(key, value) {
	try {
		storage.setItem(key, JSON.stringify(value))
	} catch {
		// Then it lasts until the tab closes.
	}
}

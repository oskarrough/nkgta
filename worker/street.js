// The Worker in front of the static site: /street is a WebSocket into the
// relay for one area, everything else is the built game.
const MAX = { peers: 50, message: 512 }

export default {
	fetch(request, env) {
		const url = new URL(request.url)
		if (url.pathname !== '/street') return env.ASSETS.fetch(request)
		if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 })
		const room = (url.searchParams.get('room') || 'default').slice(0, 120)
		return env.STREET.get(env.STREET.idFromName(room)).fetch(request)
	},
}

// One area's players. It only passes poses on, tagged with who sent them;
// it keeps nothing, so a restart costs a reconnect and no more.
export class Street {
	constructor(state) {
		this.state = state
	}

	fetch() {
		if (this.state.getWebSockets().length >= MAX.peers) return new Response('Full', { status: 503 })
		const [client, server] = Object.values(new WebSocketPair())
		this.state.acceptWebSocket(server)
		server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8) })
		return new Response(null, { status: 101, webSocket: client })
	}

	webSocketMessage(ws, data) {
		if (typeof data !== 'string' || data.length > MAX.message) return
		let msg
		try {
			msg = JSON.parse(data)
		} catch {
			return
		}
		if (msg?.t !== 'pose') return
		const { id } = ws.deserializeAttachment()
		this.broadcast(ws, JSON.stringify({ ...msg, id }))
	}

	webSocketClose(ws) {
		this.leave(ws)
	}

	webSocketError(ws) {
		this.leave(ws)
	}

	leave(ws) {
		const { id } = ws.deserializeAttachment()
		this.broadcast(ws, JSON.stringify({ t: 'leave', id }))
	}

	broadcast(from, text) {
		for (const ws of this.state.getWebSockets())
			if (ws !== from)
				try {
					ws.send(text)
				} catch {
					// Already closing: its own close will tell the others.
				}
	}
}

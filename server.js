const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const serverless = require('serverless-http');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Fragen laden
const questions = JSON.parse(fs.readFileSync(__dirname + '/data/questions.json', 'utf-8'));

const lobbies = {};
const userSessions = {}; // Store user sessions to handle reconnections

app.use(express.static('public'));

io.on('connection', socket => {
	// Handle reconnection
	socket.on('reconnectUser', ({ username, code }) => {
		const lobby = lobbies[code];
		if (!lobby) {
			return socket.emit('errorMsg', 'Lobby nicht gefunden');
		}
		const existingUser = lobby.users.find(u => u.name === username);
		if (existingUser) {
			existingUser.id = socket.id; // Update the socket ID
			socket.join(code);
			userSessions[socket.id] = { username, code }; // Update session
			socket.emit('lobbyCreated', code);
			io.in(code).emit('updateUsers', lobby.users);
			console.log(lobby.host, existingUser.id);
			console.log(lobby);
			if (lobby.host === null || lobby.host === existingUser.id) {
				lobby.host = socket.id; // Reassign host if necessary
				socket.emit('hostReconnected'); // Notify the client they are the host
			}
			if (lobby.closed) {
				socket.emit('quizStarted');
			}
		} else {
			socket.emit('errorMsg', 'Benutzer nicht gefunden');
		}
	});

	// Lobby erstellen
	socket.on('createLobby', ({ username, code }) => {
		if (lobbies[code]) {
			return socket.emit('errorMsg', 'Lobby-Code bereits vergeben');
		}
		lobbies[code] = {
			host: socket.id,
			users: [{ id: socket.id, name: username, score: 0 }],
			questions: shuffle([...questions]),
			currentIndex: 0,
			waiting: [],
			closed: false
		};
		socket.join(code);
		userSessions[socket.id] = { username, code }; // Store session
		socket.emit('lobbyCreated', code);
		io.in(code).emit('updateUsers', lobbies[code].users);
	});

	// Lobby beitreten
	socket.on('joinLobby', ({ username, code }) => {
		const lobby = lobbies[code];
		if (!lobby) {
			return socket.emit('errorMsg', 'Lobby nicht gefunden');
		}
		if (lobby.closed) {
			return socket.emit('errorMsg', 'Quiz hat bereits begonnen');
		}
		lobby.users.push({ id: socket.id, name: username, score: 0 });
		socket.join(code);
		userSessions[socket.id] = { username, code }; // Store session
		socket.emit('lobbyCreated', code); 
		io.in(code).emit('updateUsers', lobby.users);
	});

	// Quiz starten (Host)
	socket.on('startQuiz', code => {
		const lobby = lobbies[code];
		if (socket.id !== lobby.host) return;
		lobby.closed = true;
		io.in(code).emit('quizStarted');
		sendQuestion(code);
	});

	// Buzzer
	socket.on('buzz', code => {
		const lobby = lobbies[code];

		if (!lobby || lobby.closed === false || socket.id === lobby.host) return; // Host cannot buzz
		if (!lobby.waiting.includes(socket.id)) {
			lobby.waiting.push(socket.id);
			io.to(lobby.host).emit('buzzList', lobby.waiting.map(id => {
				const u = lobby.users.find(x => x.id === id);
				return { id, name: u.name };
			}));
		}
	});

	// Antwort markieren
	socket.on('markAnswer', ({ code, userId, correct }) => {
		const lobby = lobbies[code];
		if (socket.id !== lobby.host) return;

		if (correct) {
			const user = lobby.users.find(x => x.id === userId);
			user.score++;
			io.in(code).emit('updateScores', lobby.users);
			lobby.waiting = lobby.waiting.filter(id => id !== userId);
			updateBuzzList(code);
			sendQuestion(code);
		} else {
			lobby.waiting = lobby.waiting.filter(id => id !== userId);
			updateBuzzList(code);
		}
	});

	// Nächste Frage (Host)
	socket.on('nextQuestion', code => {
		if (socket.id !== lobbies[code].host) return;
		sendQuestion(code);
	});

	// Trenne Verbindungen
	socket.on('disconnect', () => {
		const session = userSessions[socket.id];
		if (session) {
			const { code, username } = session;
			const lobby = lobbies[code];
			if (lobby) {
				const user = lobby.users.find(u => u.name === username);
				if (user) {
					user.id = null; // Mark user as temporarily disconnected
				}
			}
			delete userSessions[socket.id];
		}
	});

	function updateBuzzList(code){
		const lobby = lobbies[code];
		io.to(lobby.host).emit('buzzList', lobby.waiting.map(id => {
			const u = lobby.users.find(x => x.id === id);
			return { id, name: u.name };
		}));
	}

	// Frage senden
	function sendQuestion(code) {
		const lobby = lobbies[code];
		if (lobby.currentIndex >= lobby.questions.length) {
			io.in(code).emit('quizEnded');
			return;
		}
		const q = lobby.questions[lobby.currentIndex++];
		lobby.waiting = [];
		io.in(code).emit('newQuestion', q);
		io.to(lobby.host).emit('showAnswer', q.answer);
		io.to(lobby.host).emit('updateScores', lobby.users);
	}
});

// Utility: mischen
function shuffle(a) {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

if (process.env.NETLIFY) {
	module.exports.handler = serverless(app);
} else {
	const PORT = process.env.PORT || 3000;
	server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
}
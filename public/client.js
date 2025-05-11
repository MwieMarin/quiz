const socket = io();

// Elemente
const login = document.getElementById('login');
const lobbyDiv = document.getElementById('lobby');
const quizDiv = document.getElementById('quiz');
const usersUl = document.getElementById('users');
const errorP = document.getElementById('error');
const lobbyCodeSpan = document.getElementById('lobby-code');
const btnCreate = document.getElementById('create');
const btnJoin = document.getElementById('join');
const btnStart = document.getElementById('start');
const btnBuzz = document.getElementById('buzz');

const buzzArea = document.getElementById('buzz-area');
const leaderboard = document.getElementById('leaderboard');

let code = null;
let isHost = false;

// Fehler anzeigen
function showError(msg) {
	errorP.textContent = msg;
	setTimeout(() => errorP.textContent = '', 3000);
}

// Lobby einrichten
function setupLobby(c, host) {
	code = c;
	isHost = host;
	login.hidden = true;
	lobbyDiv.hidden = false;
	btnStart.hidden = !host;
	lobbyCodeSpan.textContent = c;
}

// Lobby erstellen
btnCreate.onclick = () => {
	const name = document.getElementById('username').value.trim();
	if (!name) return showError('Bitte Name eingeben');
	const newCode = Math.random().toString(36).substr(2, 5).toUpperCase();
	isHost = true;
	localStorage.setItem('username', name);
	localStorage.setItem('code', newCode);
	socket.emit('createLobby', { username: name, code: newCode });
};

// Lobby beitreten
btnJoin.onclick = () => {
	const name = document.getElementById('username').value.trim();
	const inputCode = document.getElementById('code').value.trim().toUpperCase();
	if (!name || !inputCode) return showError('Bitte Name und Code eingeben');
	localStorage.setItem('username', name);
	localStorage.setItem('code', inputCode);
	socket.emit('joinLobby', { username: name, code: inputCode });
};

// Quiz starten (Host)
btnStart.onclick = () => {
	if (!isHost) return;
	socket.emit('startQuiz', code);
};

// Buzzer
btnBuzz.onclick = () => {
	socket.emit('buzz', code);
};

// Server-Events
socket.on('lobbyCreated', c => {
	setupLobby(c, isHost);
});

socket.on('updateUsers', users => {
	usersUl.innerHTML = users.map(u => `<li>${u.name} (${u.score})</li>`).join('');
});

socket.on('errorMsg', msg => {
	showError(msg);
	localStorage.removeItem('username');
	localStorage.removeItem('code');
});

socket.on('quizStarted', () => {
	lobbyDiv.hidden = true;
	quizDiv.hidden = false;

	btnBuzz.hidden = isHost;
	leaderboard.hidden = !isHost;
});

socket.on('newQuestion', q => {
	displayQuestion(q);
});

socket.on('showAnswer', ans => {
	console.log('Korrekte Antwort:', ans);
	const area = document.getElementById('question-area');
	area.innerHTML += `<p>Richtige Antwort: ${ans}</p>`;
});

socket.on('buzzList', list => {
	if (isHost) {
		buzzArea.hidden = false;
		buzzArea.innerHTML = list.map(user => `
			<div>
				${user.name}
				<button onclick="markAnswer('${user.id}', true)">Richtig</button>
				<button onclick="markAnswer('${user.id}', false)">Falsch</button>
			</div>
		`).join('');
	}
});

socket.on('updateScores', users => {
	if (isHost) {
		leaderboard.innerHTML = users.map(u => `<li>${u.name}: ${u.score}</li>`).join('');
	}
});

socket.on('hostReconnected', () => {
  isHost = true;
  btnStart.hidden = false;
  leaderboard.hidden = false;
  buzzArea.hidden = false;
});

socket.on('pauseSpotifyEmbed', () => {
	const iframe = document.querySelector('iframe[src*="open.spotify.com/embed/track"]');
	if (iframe) {
		iframe.contentWindow.postMessage({ command: 'pause' }, '*');
	}
});

function markAnswer(userId, correct) {
	socket.emit('markAnswer', { code, userId, correct });
}

// Frage anzeigen
function displayQuestion(q) {
	const area = document.getElementById('question-area');
	let html = `<h2>${q.question}</h2>`;
	
	switch (q.type) {
		case 'mc':
			if (isHost) {
				html += `<ul>Antwortmöglichkeiten:<ul>`;
				html += q.options.map(o => `<li>${o}</li>`).join('');
				html += `</ul>`;
			}
			break;
		case 'estimate':
			html += `<p>Schätzfrage!</p>`;
			break;
		case 'celeb':
			html += `<img src="${q.image}">`;
			break;
		case 'music':
			if (isHost) {
				const songId = q.url.split('/track/')[1];
				html += `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${songId}" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
			}
			break;
		case 'quote':
			html += `<blockquote>${q.quote}</blockquote>`;
			break;
		case 'lettersalad':
			html += `<h2>${q.lettersalad}</h2>`;
			break;
		default:
			html += `<p>Unbekannter Fragetyp!</p>`;
			break;
	}
	area.innerHTML = html;
}

window.onload = () => {
  const storedUsername = localStorage.getItem('username');
  const storedCode = localStorage.getItem('code');
  if (storedUsername && storedCode) {
    socket.emit('reconnectUser', { username: storedUsername, code: storedCode });
  }
};
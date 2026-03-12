// --- Get room ID from URL ---
const roomId = window.location.pathname.split('/').pop();

// --- UI Elements ---
const statusEl = document.getElementById('status');
const subtitlesEl = document.getElementById('subtitles');
const placeholderEl = document.getElementById('placeholder');
const micBtn = document.getElementById('mic-btn');
const langSelect = document.getElementById('language');
const roomCodeEl = document.getElementById('room-code');
const shareUrlEl = document.getElementById('share-url');
const copyBtn = document.getElementById('copy-btn');
const userCountEl = document.getElementById('user-count');
const callBtn = document.getElementById('call-btn');
const hangupBtn = document.getElementById('hangup-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const langButtons = document.querySelectorAll('[data-lang-btn]');

// --- State ---
let ws = null;
let recognition = null;
let isListening = false;
let isCaller = false;
let localStream = null;
let peerConnection = null;
let callActive = false;
let pendingOffer = null;
let uiLang = 'en';
let interimLineEl = null;
const uiTranslations = {
    en: {
        notice: 'Best results on Android Chrome. iOS Safari/WKWebView may not support live dictation.',
        i_speak: 'I speak:',
        select_lang: 'Select language',
        start_listen: 'Start Listening',
        stop_listen: 'Stop Listening',
        start_call: 'Start Call',
        hangup: 'Hang Up',
        placeholder1: 'Select your language and click "Start Listening" to begin.',
        placeholder2: 'Share the room link with the other person so they can join.',
        share_link: 'Share link:',
        copy: 'Copy',
        copied: 'Copied!',
        connected: 'connected',
        incoming: 'Incoming call. Click "Start Call" to accept.',
        listen_status: 'Listening...',
        paused: 'Paused. Click to resume.',
        connected_status: 'Connected. Select your language to start.',
        ready_status: 'Ready. Click "Start Listening" to begin.',
        mic_denied: 'Microphone access denied. Allow mic and try again.',
        cam_denied: 'Camera/mic permission denied. Allow and try again.',
    },
    es: {
        notice: 'Mejores resultados en Android Chrome. iOS Safari/WKWebView puede no soportar dictado en vivo.',
        i_speak: 'Yo hablo:',
        select_lang: 'Selecciona idioma',
        start_listen: 'Comenzar a escuchar',
        stop_listen: 'Dejar de escuchar',
        start_call: 'Iniciar llamada',
        hangup: 'Colgar',
        placeholder1: 'Selecciona tu idioma y presiona "Comenzar a escuchar".',
        placeholder2: 'Comparte el enlace de la sala para que la otra persona se una.',
        share_link: 'Compartir enlace:',
        copy: 'Copiar',
        copied: 'Copiado!',
        connected: 'conectado',
        incoming: 'Llamada entrante. Presiona "Iniciar llamada" para aceptar.',
        listen_status: 'Escuchando...',
        paused: 'Pausado. Toca para reanudar.',
        connected_status: 'Conectado. Selecciona tu idioma para empezar.',
        ready_status: 'Listo. Presiona "Comenzar a escuchar".',
        mic_denied: 'Acceso al microfono denegado. Permite el microfono y reintenta.',
        cam_denied: 'Permiso de camara/microfono denegado. Permite y reintenta.',
    }
};

// --- Init ---
roomCodeEl.textContent = roomId;
shareUrlEl.textContent = window.location.href;

copyBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        copyBtn.textContent = uiTranslations[uiLang].copied;
        setTimeout(() => { copyBtn.textContent = uiTranslations[uiLang].copy; }, 2000);
    });
};

// --- Check Speech API support ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    setStatus('Speech recognition not supported in this browser. Use Chrome or Edge.', 'error');
    micBtn.disabled = true;
}

// --- WebSocket Connection ---
function connect() {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${location.host}/ws/${roomId}`);

    ws.onopen = () => {
        setStatus(uiTranslations[uiLang].connected_status, 'ok');
        if (langSelect.value) {
            ws.send(JSON.stringify({ type: 'set_language', language: langSelect.value }));
            micBtn.disabled = false;
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'welcome') {
            isCaller = data.role === 'caller';
        } else if (data.type === 'subtitle') {
            addSubtitle(data.translated, data.original, 'partner');
        } else if (data.type === 'transcript') {
            addSubtitle(data.text, null, 'self');
        } else if (data.type === 'status') {
            userCountEl.textContent = data.user_count + ' ' + uiTranslations[uiLang].connected;
            callBtn.disabled = !data.ready;
            if (!data.ready) {
                stopCall();
            }
        } else if (data.type === 'error') {
            setStatus(data.message, 'error');
        } else if (data.type === 'webrtc_offer') {
            handleOffer(data.data);
        } else if (data.type === 'webrtc_answer') {
            handleAnswer(data.data);
        } else if (data.type === 'webrtc_ice') {
            handleIce(data.data);
        } else if (data.type === 'webrtc_hangup') {
            stopCall();
        }
    };

    ws.onclose = () => {
        setStatus('Disconnected. Reconnecting...', 'error');
        setTimeout(connect, 3000);
    };

    ws.onerror = () => {};
}

connect();

// --- Language Selection ---
langSelect.onchange = () => {
    if (langSelect.value && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'set_language', language: langSelect.value }));
        micBtn.disabled = false;
        setStatus(uiTranslations[uiLang].ready_status, 'ok');
    }
    // Update recognition language if already created
    if (recognition) {
        recognition.lang = getSpeechLang(langSelect.value);
    }
};

// --- Map language codes to Speech API locale codes ---
function getSpeechLang(lang) {
    const map = {
        'en': 'en-US',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'pt': 'pt-BR',
        'it': 'it-IT',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'zh': 'zh-CN',
        'ru': 'ru-RU',
        'ar': 'ar-SA',
    };
    return map[lang] || lang;
}

// --- Mic Button ---
micBtn.onclick = () => {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
};

// --- Call Controls ---
callBtn.onclick = () => {
    startCall();
};

hangupBtn.onclick = () => {
    sendSignal('webrtc_hangup', null);
    stopCall();
};

// --- Speech Recognition ---
function startListening() {
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechLang(langSelect.value);

    recognition.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript.trim();
            if (!text) continue;
            if (result.isFinal) {
                clearInterim();
                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log('[Speech] Recognized:', text);
                    ws.send(JSON.stringify({ type: 'speech_text', text: text }));
                }
            } else {
                interimText += (interimText ? ' ' : '') + text;
            }
        }

        if (interimText) {
            showInterim(interimText);
        }
    };

    recognition.onerror = (event) => {
        console.log('[Speech] Error:', event.error);
        if (event.error === 'not-allowed') {
            setStatus(uiTranslations[uiLang].mic_denied, 'error');
            isListening = false;
            micBtn.textContent = uiTranslations[uiLang].start_listen;
            micBtn.classList.remove('active');
        }
        // For other errors (network, no-speech), onend will restart it
    };

    recognition.onend = () => {
        // Auto-restart if we're still supposed to be listening
        if (isListening) {
            console.log('[Speech] Restarting recognition...');
            try {
                recognition.start();
            } catch (e) {
                // Already started, ignore
            }
        }
    };

    recognition.start();
    isListening = true;
    micBtn.textContent = uiTranslations[uiLang].stop_listen;
    micBtn.classList.add('active');
    setStatus(uiTranslations[uiLang].listen_status, 'listening');
    hidePlaceholder();
}

function stopListening() {
    isListening = false;
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
    clearInterim();
    micBtn.textContent = uiTranslations[uiLang].start_listen;
    micBtn.classList.remove('active');
    setStatus(uiTranslations[uiLang].paused, 'ok');
}

// --- WebRTC Call ---
async function startCall() {
    if (callActive) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (err) {
        setStatus(uiTranslations[uiLang].cam_denied, 'error');
        return;
    }

    localVideo.srcObject = localStream;
    ensurePeerConnection();

    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    callActive = true;
    hangupBtn.disabled = false;

    if (pendingOffer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal('webrtc_answer', answer);
        pendingOffer = null;
    } else if (isCaller) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal('webrtc_offer', offer);
    }
}

function stopCall() {
    callActive = false;
    hangupBtn.disabled = true;
    pendingOffer = null;

    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
}

function ensurePeerConnection() {
    if (peerConnection) return;
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal('webrtc_ice', event.candidate);
        }
    };

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
}

async function handleOffer(offer) {
    if (!offer) return;
    if (!callActive) {
        pendingOffer = offer;
        callBtn.disabled = false;
        setStatus(uiTranslations[uiLang].incoming, 'ok');
        return;
    }
    ensurePeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendSignal('webrtc_answer', answer);
}

async function handleAnswer(answer) {
    if (!peerConnection || !answer) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIce(candidate) {
    if (!peerConnection || !candidate) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.log('[WebRTC] ICE error:', e);
    }
}

function sendSignal(type, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, data }));
}

// --- Subtitle Display ---
function addSubtitle(text, original, source) {
    hidePlaceholder();

    const div = document.createElement('div');
    div.classList.add('subtitle-line', source);

    if (source === 'self') {
        div.innerHTML = `<span class="label">You:</span> ${escapeHtml(text)}`;
    } else {
        div.innerHTML = `<span class="translated">${escapeHtml(text)}</span>`;
        if (original) {
            const orig = document.createElement('div');
            orig.classList.add('original');
            orig.textContent = original;
            div.appendChild(orig);
        }
    }

    subtitlesEl.appendChild(div);
    subtitlesEl.scrollTop = subtitlesEl.scrollHeight;

    while (subtitlesEl.children.length > 51) {
        const first = subtitlesEl.querySelector('.subtitle-line');
        if (first) subtitlesEl.removeChild(first);
    }
}

function hidePlaceholder() {
    if (placeholderEl) placeholderEl.style.display = 'none';
}

function showInterim(text) {
    hidePlaceholder();
    if (!interimLineEl) {
        interimLineEl = document.createElement('div');
        interimLineEl.classList.add('subtitle-line', 'self', 'interim');
        subtitlesEl.appendChild(interimLineEl);
    }
    interimLineEl.innerHTML = `<span class="label">You:</span> ${escapeHtml(text)}<span class="dots">…</span>`;
    subtitlesEl.scrollTop = subtitlesEl.scrollHeight;
}

function clearInterim() {
    if (interimLineEl && interimLineEl.parentNode) {
        interimLineEl.parentNode.removeChild(interimLineEl);
    }
    interimLineEl = null;
}

// --- Helpers ---
function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'status ' + (type || '');
}

function applyUiLang(lang) {
    uiLang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const value = uiTranslations[lang][key];
        if (value) el.textContent = value;
    });
    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
        btn.classList.toggle('secondary', btn.getAttribute('data-lang-btn') !== lang);
    });
    copyBtn.textContent = uiTranslations[lang].copy;
    if (!isListening) {
        micBtn.textContent = uiTranslations[lang].start_listen;
    }
    callBtn.textContent = uiTranslations[lang].start_call;
    hangupBtn.textContent = uiTranslations[lang].hangup;
}

langButtons.forEach((btn) => {
    btn.onclick = () => applyUiLang(btn.getAttribute('data-lang-btn'));
});

const preferredLang = (navigator.language || '').toLowerCase();
if (preferredLang.startsWith('es')) {
    uiLang = 'es';
}
applyUiLang(uiLang);

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

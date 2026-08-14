# Live Translator

Real-time video calls with instant voice translation. Speak in your language and see live subtitles on the other side.

**Live Demo:** https://translator-oied.onrender.com

## Features

### Core
- 1:1 WebRTC video call with signaling over WebSocket
- Picture-in-picture local video; main remote video
- Subtitle overlay on video
- Interim speech results (faster perceived latency)
- Text input fallback (type + send)

### Infrastructure / Performance
- Render deployment (`render.yaml`)
- Translation offloaded to thread (`asyncio.to_thread`)
- WebSocket status updates + reconnection
- Mic level meter (visual input indicator)

### UI / UX
- Share base URL + create & copy room link
- UI language dropdown (English, Spanish, Arabic, Hindi, Tagalog)
- UI language auto-detect
- Advanced language variants panel
- Warning banner compacted to an “i” pill on mobile
- Larger subtitle area + overlay adjustments

## Supported Languages (Speech Recognition Locales)

**Main list:**
- English (en-US)
- Spanish (es-ES)
- Portuguese (Brazil) (pt-BR)
- French (fr-FR)
- German (de-DE)
- Turkish (tr-TR)
- Urdu (Pakistan) (ur-PK)
- Japanese (ja-JP)
- Tagalog/Filipino (fil-PH)
- Malay (ms-MY)
- Indonesian (id-ID)
- Vietnamese (vi-VN)
- Thai (th-TH)
- Azerbaijani (az-AZ)
- Chinese (Simplified) (zh-CN)
- Hindi (hi-IN)
- Arabic (generic) (ar-SA)
- Russian (ru-RU)

**Advanced panel:**
- Spanish (Mexico) (es-MX)
- Spanish (Colombia) (es-CO)
- Spanish (Venezuela) (es-VE)
- Spanish (Argentina) (es-AR)
- Spanish (Ecuador) (es-EC)
- Spanish (Dominican Rep.) (es-DO)
- Spanish (Peru) (es-PE)
- Chinese (Traditional) (zh-TW)

## How to Use

1. Go to https://translator-oied.onrender.com
2. Click **Create New Room**
3. Copy the link and send it to your partner
4. Select your language from the dropdown
5. Allow access to your camera and microphone
6. Click **Start Listening** and start talking

Translations and subtitles appear automatically for both participants.

## Tech Stack

- **Backend**: FastAPI + Uvicorn + WebSockets
- **Translation**: deep-translator (Google Translate)
- **Frontend**: Vanilla JavaScript + WebRTC + Browser Speech API
- **Deployment**: Render (free tier)

## Project Structure

```
translator/
  server.py
  requirements.txt
  render.yaml
  static/
    index.html
    room.html
    app.js
    style.css
```

## Running Locally

```bash
git clone https://github.com/richsteve17/translator.git
cd translator
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000 in your browser.

## Deployment on Render

The repository includes a `render.yaml` file for one-click deployment.

## Notes

- Rooms are stored in memory only (active calls end if the server restarts).
- Translation errors are handled gracefully.

## Roadmap

- Persistent rooms using Redis
- Fallback translation providers (DeepL, etc.)
- Subtitle customization
- Mobile PWA support

Made by richsteve17

import asyncio
import json
import os
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from deep_translator import GoogleTranslator

APP_VERSION = "2026-03-21.1"

# --- TURN server config (read from env) ---
TURN_URLS = os.environ.get("TURN_URLS", "")
TURN_USERNAME = os.environ.get("TURN_USERNAME", "")
TURN_PASSWORD = os.environ.get("TURN_PASSWORD", "")


def get_ice_servers():
    servers = [{"urls": "stun:stun.l.google.com:19302"}]
    if TURN_URLS:
        for url in TURN_URLS.split(","):
            url = url.strip()
            if url:
                servers.append({
                    "urls": url,
                    "username": TURN_USERNAME,
                    "credential": TURN_PASSWORD,
                })
    return servers
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory room storage
rooms: dict[str, dict] = {}


# --- HTTP Routes ---

@app.get("/")
async def home():
    return FileResponse(
        "static/index.html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/room/{room_id}")
async def room_page(room_id: str):
    return FileResponse(
        "static/room.html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )



@app.post("/create-room")
async def create_room():
    room_id = uuid.uuid4().hex[:6]
    rooms[room_id] = {"users": {}}
    return {"room_id": room_id}

@app.get("/version")
async def version():
    return {"version": APP_VERSION}


# --- WebSocket ---

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(ws: WebSocket, room_id: str):
    await ws.accept()

    if room_id not in rooms:
        rooms[room_id] = {"users": {}}

    if len(rooms[room_id]["users"]) >= 2:
        await ws.send_json({"type": "error", "message": "Room is full"})
        await ws.close()
        return

    user_id = uuid.uuid4().hex[:8]
    rooms[room_id]["users"][user_id] = {"ws": ws, "language": None}
    print(f"User {user_id} joined room {room_id} ({len(rooms[room_id]['users'])} users)")

    role = "caller" if len(rooms[room_id]["users"]) == 1 else "callee"
    await ws.send_json({
        "type": "welcome",
        "user_id": user_id,
        "role": role,
        "ice_servers": get_ice_servers(),
    })

    await broadcast_status(room_id)

    try:
        while True:
            data = await ws.receive_json()

            if data["type"] == "set_language":
                rooms[room_id]["users"][user_id]["language"] = data["language"]
                await broadcast_status(room_id)

            elif data["type"] == "speech_text":
                text = data.get("text", "").strip()
                if text:
                    await process_text(room_id, user_id, text)
            elif data["type"] in ("webrtc_offer", "webrtc_answer", "webrtc_ice", "webrtc_hangup"):
                await relay_signal(room_id, user_id, data)

    except WebSocketDisconnect:
        if room_id in rooms and user_id in rooms[room_id]["users"]:
            del rooms[room_id]["users"][user_id]
            if not rooms[room_id]["users"]:
                del rooms[room_id]
            else:
                await broadcast_status(room_id)


async def broadcast_status(room_id: str):
    if room_id not in rooms:
        return
    room = rooms[room_id]
    count = len(room["users"])
    languages = [u["language"] for u in room["users"].values() if u["language"]]
    for user in room["users"].values():
        try:
            await user["ws"].send_json({
                "type": "status",
                "user_count": count,
                "languages": languages,
                "ready": count == 2,
            })
        except Exception:
            pass


async def process_text(room_id: str, sender_id: str, text: str):
    """Translate text and send to the other user."""
    if room_id not in rooms or sender_id not in rooms[room_id]["users"]:
        return

    room = rooms[room_id]
    sender = room["users"][sender_id]
    sender_lang = sender["language"]

    if not sender_lang:
        return

    # Send original text back to speaker
    try:
        await sender["ws"].send_json({
            "type": "transcript",
            "text": text,
        })
    except Exception:
        pass

    # Translate and send to other users
    for uid, user in room["users"].items():
        if uid != sender_id and user["language"]:
            try:
                translated = await asyncio.to_thread(
                    translate_text, text, sender_lang, user["language"]
                )
                await user["ws"].send_json({
                    "type": "subtitle",
                    "original": text,
                    "translated": translated,
                })
            except Exception:
                pass


async def relay_signal(room_id: str, sender_id: str, data: dict):
    if room_id not in rooms or sender_id not in rooms[room_id]["users"]:
        return

    payload_type = data.get("type")
    payload = {
        "type": payload_type,
        "data": data.get("data"),
    }

    room = rooms[room_id]
    for uid, user in room["users"].items():
        if uid != sender_id:
            try:
                await user["ws"].send_json(payload)
            except Exception:
                pass


def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    if source_lang == target_lang:
        return text
    try:
        return GoogleTranslator(source=source_lang, target=target_lang).translate(text)
    except Exception as e:
        print(f"Translation error: {e}")
        return f"[Translation error] {text}"

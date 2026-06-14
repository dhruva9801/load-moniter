"""
CLM Keystroke Agent
-------------------
Captures keystrokes system-wide using pynput and broadcasts
raw timing events to Angular via a local WebSocket server.

Install dependencies:
    pip install pynput websockets

Run:
    python clm_agent.py

Keep this running in the background while you use your computer.
Angular connects automatically on ws://localhost:8765
"""

import asyncio
import json
import time
import websockets
from pynput import keyboard

# All currently connected Angular clients
connected_clients: set = set()

# Tracks keydown timestamps keyed by key string
# e.g. { 'a': 1718123400.123, 'Key.shift': 1718123400.200 }
press_times: dict = {}


def key_to_str(key) -> str:
    """Normalize a pynput key to a consistent string."""
    try:
        return key.char  # regular character key e.g. 'a', '3'
    except AttributeError:
        return str(key)  # special key e.g. 'Key.shift', 'Key.backspace'


def on_press(key):
    """Called by pynput on every keydown event."""
    k = key_to_str(key)
    press_times[k] = time.time()


def on_release(key):
    """Called by pynput on every keyup event."""
    k = key_to_str(key)

    if k not in press_times:
        return  # keydown was missed (e.g. app started mid-press)

    press_time   = press_times.pop(k)
    release_time = time.time()
    hold_ms      = (release_time - press_time) * 1000

    # Package the event as JSON and broadcast to all Angular clients
    event = {
        "type":        "keyup",
        "key":         k,
        "pressTime":   press_time * 1000,    # ms since epoch (matches JS Date.now())
        "releaseTime": release_time * 1000,
        "holdMs":      round(hold_ms, 2)
    }

    # Schedule the broadcast on the event loop from this thread
    if connected_clients:
        asyncio.run_coroutine_threadsafe(
            broadcast(json.dumps(event)),
            loop
        )


async def broadcast(message: str):
    """Send a message to every connected Angular client."""
    dead = set()
    for ws in connected_clients:
        try:
            await ws.send(message)
        except websockets.exceptions.ConnectionClosed:
            dead.add(ws)
    connected_clients.difference_update(dead)


async def handler(websocket):
    """Handles a new Angular client connecting."""
    connected_clients.add(websocket)
    print(f"[CLM] Angular connected. Clients: {len(connected_clients)}")

    try:
        # Send a ready signal so Angular knows the agent is alive
        await websocket.send(json.dumps({"type": "ready"}))
        # Keep the connection open — agent drives all messages
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)
        print(f"[CLM] Angular disconnected. Clients: {len(connected_clients)}")


async def main():
    print("[CLM] Agent started. Listening on ws://localhost:8765")
    print("[CLM] Start your Angular app and begin typing.")
    print("[CLM] Press Ctrl+C to stop.\n")

    async with websockets.serve(handler, "localhost", 8765):
        await asyncio.Future()  # run forever


# Start the pynput listener on a background thread (it's blocking)
listener = keyboard.Listener(on_press=on_press, on_release=on_release)
listener.start()

# Run the async WebSocket server on the main thread
loop = asyncio.get_event_loop()
try:
    loop.run_until_complete(main())
except KeyboardInterrupt:
    print("\n[CLM] Agent stopped.")
    listener.stop()
"""
WebSocket router for FaceTrack.

Provides two WebSocket channels:
  - /ws/video-feed  -- streams processed video frames to connected clients
  - /ws/events      -- pushes real-time event notifications (attendance, alerts)

A shared ConnectionManager is exported so other modules (e.g. FrameProcessor,
AttendanceService) can broadcast messages without importing the router itself.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages per-channel WebSocket connections and broadcasts."""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        """Accept the WebSocket handshake and register the connection."""
        await websocket.accept()
        self.active_connections.setdefault(channel, []).append(websocket)
        logger.info(
            "WebSocket connected on channel '%s' (%d total)",
            channel,
            len(self.active_connections[channel]),
        )

    def disconnect(self, websocket: WebSocket, channel: str) -> None:
        """Remove a WebSocket from the channel's connection list."""
        conns = self.active_connections.get(channel, [])
        if websocket in conns:
            conns.remove(websocket)
        logger.info(
            "WebSocket disconnected from channel '%s' (%d remaining)",
            channel,
            len(conns),
        )

    async def broadcast(self, channel: str, message: Any) -> None:
        """
        Send *message* to every connection on *channel*.

        If *message* is a ``str`` it is sent as text; otherwise it is
        serialised as JSON.  Broken connections are silently removed.
        """
        conns = self.active_connections.get(channel, [])
        stale: list[WebSocket] = []

        for ws in conns:
            try:
                if isinstance(message, str):
                    await ws.send_text(message)
                else:
                    await ws.send_json(message)
            except Exception:
                stale.append(ws)

        # Clean up any connections that failed
        for ws in stale:
            self.disconnect(ws, channel)


# Singleton shared across the application
ws_manager = ConnectionManager()


# ---- WebSocket endpoints ---------------------------------------------------

@router.websocket("/ws/video-feed")
async def video_feed_ws(websocket: WebSocket) -> None:
    """Persistent WebSocket for streaming video frames to the frontend."""
    channel = "video-feed"
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            # Keep the connection alive by waiting for client messages.
            # The client can send pings/keep-alives; we just need to
            # keep the receive loop running so FastAPI detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
    except Exception:
        ws_manager.disconnect(websocket, channel)


@router.websocket("/ws/events")
async def events_ws(websocket: WebSocket) -> None:
    """Persistent WebSocket for real-time event notifications."""
    channel = "events"
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
    except Exception:
        ws_manager.disconnect(websocket, channel)

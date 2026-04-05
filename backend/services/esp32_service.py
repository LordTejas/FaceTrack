"""
ESP32 TFT display notification service for FaceTrack.

Sends attendance notifications to an ESP32-driven TFT screen via HTTP
and provides a health-check endpoint.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from config import ESP32TFTConfig

logger = logging.getLogger(__name__)

# Default timeout for HTTP requests to the ESP32 device (seconds)
_DEFAULT_TIMEOUT = 5.0


class ESP32Service:
    """
    Communicates with an ESP32 TFT display over HTTP to show
    real-time attendance notifications.
    """

    def __init__(self, config: ESP32TFTConfig) -> None:
        self._enabled: bool = config.enabled
        self._url: str | None = config.url
        self._client: httpx.AsyncClient = httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT,
        )

    # ------------------------------------------------------------------
    # Notifications
    # ------------------------------------------------------------------

    async def send_notification(
        self,
        name: str,
        student_id: str,
        status: str,
        time_str: str,
    ) -> None:
        """
        POST an attendance notification to the ESP32 display.

        If the service is disabled or the URL is not configured, the call
        is silently skipped. Network / timeout errors are caught and logged
        so they never crash the caller.
        """
        if not self._enabled or not self._url:
            return

        payload = {
            "name": name,
            "student_id": student_id,
            "status": status,
            "time": time_str,
        }

        try:
            response = await self._client.post(
                f"{self._url.rstrip('/')}/display",
                json=payload,
            )
            response.raise_for_status()
            logger.debug(
                "ESP32 notification sent for %s (%s)", name, status
            )
        except httpx.TimeoutException:
            logger.warning("ESP32 notification timed out for %s", name)
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "ESP32 returned HTTP %d for notification: %s",
                exc.response.status_code,
                exc,
            )
        except httpx.HTTPError as exc:
            logger.warning("ESP32 notification failed: %s", exc)

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def check_health(self) -> bool:
        """
        Ping the ESP32 health endpoint.

        Returns True if the device responds successfully, False otherwise.
        """
        if not self._enabled or not self._url:
            return False

        try:
            response = await self._client.get(
                f"{self._url.rstrip('/')}/health",
            )
            return response.status_code == 200
        except httpx.HTTPError as exc:
            logger.debug("ESP32 health check failed: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def is_enabled(self) -> bool:
        """Return True if the ESP32 TFT integration is enabled."""
        return self._enabled

    async def close(self) -> None:
        """Gracefully close the underlying HTTP client."""
        await self._client.aclose()

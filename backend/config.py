"""
FaceTrack configuration module.

Loads defaults, applies overrides from data/config.json if present,
and exposes a singleton via get_config().
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock
from typing import Any

from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8000


class RecognitionConfig(BaseModel):
    confidence_threshold: float = 0.75
    uncertain_threshold: float = 0.50
    model: str = "face_recognition"
    tolerance: float = 0.6
    min_face_width_px: int = 60


class AttendanceConfig(BaseModel):
    cooldown_seconds: int = 30
    save_snapshots: bool = True
    auto_capture_enabled: bool = True


class CameraConfig(BaseModel):
    frame_skip: int = 2
    jpeg_quality: int = 85
    max_resolution: list[int] = Field(default_factory=lambda: [1280, 720])
    esp32_min_face_width_px: int = 80


class ESP32TFTConfig(BaseModel):
    enabled: bool = False
    url: str | None = None


class StorageConfig(BaseModel):
    data_dir: str = "data"
    max_snapshot_age_days: int = 90


class AppConfig(BaseModel):
    """Flat-ish application configuration with grouped sub-models."""

    server: ServerConfig = Field(default_factory=ServerConfig)
    recognition: RecognitionConfig = Field(default_factory=RecognitionConfig)
    attendance: AttendanceConfig = Field(default_factory=AttendanceConfig)
    camera: CameraConfig = Field(default_factory=CameraConfig)
    esp32_tft: ESP32TFTConfig = Field(default_factory=ESP32TFTConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)

    model_config = {"json_schema_serialization_defaults_required": True}

    @classmethod
    def load(cls) -> AppConfig:
        """Create config with defaults, then overlay values from config.json if it exists."""
        config = cls()
        config_path = Path(config.storage.data_dir) / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    overrides = json.load(f)
                config = _deep_merge(config, overrides)
            except (json.JSONDecodeError, OSError) as exc:
                # Log but don't crash on bad config file
                print(f"[config] Warning: failed to load {config_path}: {exc}")
        return config

    def save(self) -> None:
        """Persist current config to data/config.json."""
        config_path = Path(self.storage.data_dir) / "config.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(self.model_dump(), f, indent=2)

    def update(self, overrides: dict[str, Any]) -> None:
        """Apply a dict of overrides (potentially nested) and save."""
        merged = _deep_merge(self, overrides)
        # Copy all fields from the merged result
        for field_name in self.model_fields:
            setattr(self, field_name, getattr(merged, field_name))
        self.save()


def _deep_merge(config: AppConfig, overrides: dict[str, Any]) -> AppConfig:
    """
    Deep-merge a dict of overrides into an AppConfig, returning a new instance.
    Only keys that exist in the model are applied; unknown keys are ignored.
    """
    current = config.model_dump()
    _recursive_merge(current, overrides)
    return AppConfig.model_validate(current)


def _recursive_merge(base: dict, overrides: dict) -> None:
    """Recursively merge overrides into base dict in place."""
    for key, value in overrides.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _recursive_merge(base[key], value)
        else:
            base[key] = value


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_config: AppConfig | None = None
_lock = Lock()


def get_config() -> AppConfig:
    """Return the singleton AppConfig, creating it on first call."""
    global _config
    if _config is None:
        with _lock:
            if _config is None:
                _config = AppConfig.load()
    return _config


def reset_config() -> None:
    """Reset the singleton (useful for testing)."""
    global _config
    with _lock:
        _config = None

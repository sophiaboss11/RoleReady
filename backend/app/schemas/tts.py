from pydantic import BaseModel
from typing import Literal
from uuid import UUID

TTS_VOICE = Literal["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
TTS_MODEL = Literal["tts-1", "tts-1-hd"]
TTS_FORMAT = Literal["mp3", "opus", "aac", "flac", "wav", "pcm"]


class TTSGenerateRequest(BaseModel):
    project_id: UUID
    voice: TTS_VOICE = "alloy"
    model: TTS_MODEL = "tts-1"
    format: TTS_FORMAT = "mp3"

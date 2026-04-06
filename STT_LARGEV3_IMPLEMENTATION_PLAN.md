# STT Large-v3 Implementation Plan

## Objective

Standardize backend speech-to-text on faster-whisper Large-v3 for higher Indian-English accuracy, and remove legacy base/small model references to keep configuration clean.

## Scope

- Enforce Large-v3 as the backend default model.
- Update environment templates to Large-v3-first settings.
- Remove legacy `WHISPER_MODEL` config surface that referenced base/small variants.
- Update README environment variable table to reflect the active STT configuration.

## Execution Steps

1. Update runtime default in audio router to `large-v3`.
2. Update `.env` and `.env.example` STT section:
   - Remove `WHISPER_MODEL`.
   - Set `FASTER_WHISPER_MODEL=large-v3`.
   - Set `FASTER_WHISPER_COMPUTE_TYPE=int8_float16` for 4GB VRAM compatibility.
3. Remove legacy `WHISPER_MODEL` field from backend settings model.
4. Update README environment table to remove `WHISPER_MODEL` and document `FASTER_WHISPER_*` variables.
5. Rebuild backend container so runtime picks up updated env values.
6. Verify container STT environment values post-rebuild.

## Expected Outcome

- Single clean STT path centered on faster-whisper Large-v3.
- No remaining base/small default references in active STT configuration.
- Backend ready for improved transcription quality with constrained VRAM hardware.

## Status

- [x] Planned
- [x] Implemented

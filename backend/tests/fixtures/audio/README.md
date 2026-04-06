This directory is intentionally left empty.

To run `stt_evaluation_harness.py` in `--mode audio`, add your own short audio clips
with filenames matching the harness case IDs, using one of the supported extensions:

Supported: `.wav`, `.webm`, `.mp3`, `.ogg`, `.m4a`, `.mp4`, `.flac`

Example:
  - `farm_name_quiet_correct.wav`
  - `farm_name_prefix_noise.webm`
  - `farm_name_filler_and_lowercase.mp3`

Then run:
  python backend/tests/stt_evaluation_harness.py --mode audio --audio-dir backend/tests/fixtures/audio --server http://localhost:8000


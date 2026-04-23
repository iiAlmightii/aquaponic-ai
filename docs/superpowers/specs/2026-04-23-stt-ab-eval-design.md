# STT A/B Evaluation Pipeline — Design Spec
**Date:** 2026-04-23  
**Goal:** Produce empirical WER comparison between System A (faster-whisper + AquaponicAI normalization) and System B (Sarvam Saarika v2) across 320 labeled audio clips from 8 speakers. Results become Table 3 and Figure 3 of the IEEE paper.

---

## 1. Overview

A guided audio collection module is added to the existing React frontend at `/eval/record`. Participants access it via a public ngrok tunnel to the local Docker stack. Each participant records 40 clips (one sentence at a time, with re-record support). Clips upload to a new FastAPI endpoint that saves them to disk with ground-truth manifests. After all participants finish, a standalone Python evaluation script sends every clip through both STT systems, computes WER, and writes paper-ready output tables and charts.

**Outcome is unknown before the experiment.** The evaluation is a fair comparison — results determine which system performs better and in which conditions.

---

## 2. Recording Script

**40 sentences across 4 groups, 10 per group.**

### Group A — Clean speech (control)
1. My farm uses an NFT system.
2. I am raising tilapia and barramundi.
3. The fish tank holds two thousand litres.
4. I have one hundred tilapia fingerlings.
5. The harvest cycle is six months.
6. I also grow trout in a media bed system.
7. The system type is deep water culture.
8. I have fifty catfish and thirty trout.
9. We use a raft system for the crops.
10. The stocking density is five fish per cubic metre.

### Group B — Indian numbers & scale words
11. The capital expenditure is five lakh rupees.
12. Monthly revenue is fifty-five thousand rupees.
13. I spent two lakh on infrastructure.
14. The monthly operating cost is thirty thousand.
15. My total investment was one crore rupees.
16. I earn forty thousand from fish every month.
17. The equipment cost one lakh fifty thousand.
18. Annual profit is three lakh rupees.
19. My farm area is one thousand square metres.
20. I started with fifty thousand rupees initial stock.

### Group C — Crop and location terms
21. I grow lettuce, spinach, and basil in the aquaponic beds.
22. The crop area is two hundred square metres.
23. Monthly yield is about fifty kilograms of lettuce.
24. My farm is located in Bengaluru, Karnataka.
25. I also cultivate mint and okra.
26. The growing area covers five hundred square feet.
27. I sell tomatoes and capsicum to local markets.
28. The farm is in Pune, Maharashtra.
29. Crop revenue is fifteen thousand per month.
30. I grow herbs like basil and mint near the fish tanks.

### Group D — Fillers and homophones (stress test)
31. Um, I have, uh, about twenty thousand litres capacity.
32. You know, I raise till — I mean tilapia — in the main tank.
33. My farm, basically, earns around two lakh, sort of, annually.
34. I think it is, like, an NFT — an n f t — system.
35. Uh, the harvest is, um, every six months or so.
36. I have, you know, around five lakh in capital expenses.
37. Actually I grow talapia — I mean tilapia — and some trout.
38. My location is, uh, Bangalore — Bengaluru — in Karnataka.
39. Um, the monthly revenue is, like, fifty five thousand rupees.
40. I use, basically, a media bead — I mean media bed — system.

---

## 3. Frontend Recording Module

**Route:** `/eval/record`  
**File:** `frontend/src/app/components/eval/EvalRecorder.tsx`  
**Registered in:** `frontend/src/main.tsx`

### UI Flow
1. Participant enters their name/ID (e.g. "priya_01") → stored in component state, prefixes every upload
2. Script group and progress shown: **"Clip 3 of 40"**
3. Current sentence displayed prominently (large font, centre screen)
4. Buttons follow a strict state machine (see below)
5. On successful upload → auto-advance to next sentence
6. At clip 40 → "All done! Thank you." screen with participant ID shown

### Per-Clip State Machine
```
idle
  └─[Record]──→ recording
                  └─[Stop]──→ stopped
                               ├─[Re-record]──→ idle   (blob discarded, no upload)
                               └─[Next]──→ uploading
                                             ├─ success → done → advance
                                             └─ error → error state → [Retry] → uploading
```

### MediaRecorder Configuration
- Format: `audio/webm;codecs=opus`
- No time limit — participant stops manually
- Blob collected on `dataavailable` event after stop

### Upload Payload (multipart/form-data)
| Field | Type | Value |
|---|---|---|
| `audio` | File | webm blob |
| `participant_id` | string | "priya_01" |
| `clip_id` | integer | 1–40 |
| `ground_truth` | string | exact sentence shown on screen |

### No Authentication
The `/eval/record` route requires no login. It is a standalone tool page, not part of the main app navigation.

---

## 4. Backend Collection Endpoint

**New file:** `backend/routers/eval.py`  
**Registered in:** `backend/main.py` only when `EVAL_MODE=true` in `.env`  
**Endpoint:** `POST /api/v1/eval/upload`

### Storage Layout
```
backend/data/eval_clips/
  {participant_id}/
    clip_01.webm
    clip_02.webm
    ...
    clip_40.webm
    manifest.json
  master_manifest.json
```

### manifest.json (per participant)
```json
{
  "participant_id": "priya_01",
  "clips": {
    "1": {
      "ground_truth": "My farm uses an NFT system.",
      "group": "A",
      "file": "clip_01.webm",
      "recorded_at": "2026-04-23T10:15:00Z"
    }
  }
}
```

### master_manifest.json
Tracks all participants and their completion counts. Updated on every upload. Used by the eval script to know which participants are complete.

### Response
```json
{ "status": "saved", "clip_id": 3, "participant_id": "priya_01" }
```

### Error Handling
- Duplicate clip (same participant + clip_id): overwrite silently (supports re-record on network error)
- Missing fields: 422 response
- Disk write failure: 500 response with message

---

## 5. WER Evaluation Pipeline

**File:** `backend/eval/run_wer_eval.py`  
**Run once** after all participants finish recording.

### Dependencies (added to requirements.txt)
- `jiwer` — WER computation
- `requests` — Sarvam API calls
- `pydub` — webm → wav conversion
- `matplotlib` — bar chart output

### Processing Steps
```
For each clip across all participants:
  1. Load clip_{n}.webm
  2. pydub converts → temp wav (16kHz, mono)
  3. System A: faster-whisper.transcribe(wav) → post_process_transcript()
  4. System B: POST https://api.sarvam.ai/speech-to-text (raw output, no post-processing)
  5. Compute WER(transcript_A, ground_truth) via jiwer
  6. Compute WER(transcript_B, ground_truth) via jiwer
  7. Append row to results dataframe
```

### Sarvam API Call
- URL: `https://api.sarvam.ai/speech-to-text`
- Header: `API-Subscription-Key: {SARVAM_API_KEY}`
- Body: multipart with wav file, `model=saarika:v2`, `language_code=en-IN`
- **No post-processing applied to Sarvam output** — raw transcript only (correct baseline)

### WER Formula
```
WER = (Substitutions + Deletions + Insertions) / Reference word count
```
Computed by `jiwer.wer(reference, hypothesis)` after lowercasing and stripping punctuation from both strings.

### Outputs Written to `backend/eval/eval_results/`

| File | Contents |
|---|---|
| `results.csv` | Per-clip: participant, clip_id, group, ground_truth, whisper_transcript, sarvam_transcript, whisper_wer, sarvam_wer |
| `summary.md` | Aggregated WER table by group — paste into LaTeX paper |
| `wer_by_group.png` | Grouped bar chart — Figure 3 in paper |
| `agreement_analysis.md` | Clips where both systems failed — indicates ambiguous ground truth |

### Output Table Structure (paper Table 3)
| Script Group | Description | N clips | Whisper+Norm WER | Sarvam WER | Δ |
|---|---|---|---|---|---|
| A | Clean speech | 80 | | | |
| B | Indian numbers | 80 | | | |
| C | Crop/location | 80 | | | |
| D | Fillers+homophones | 80 | | | |
| **Overall** | | **320** | | | |

Values filled by the script at runtime. Δ = Sarvam WER − Whisper WER (positive = Whisper better, negative = Sarvam better).

---

## 6. Environment Variables Added

| Variable | Purpose |
|---|---|
| `EVAL_MODE` | `true` to register eval router in main.py |
| `SARVAM_API_KEY` | Free tier key from dashboard.sarvam.ai |

Both added to `.env.example` with placeholder values.

---

## 7. Paper Integration

| Paper section | Addition |
|---|---|
| Section IV Methodology | "Evaluation dataset: 320 utterances from 8 speakers across 4 script groups covering clean speech, Indian numerical vocabulary, domain terminology, and filler-laden input" |
| Section V System Validation | New subsection: *STT Comparative Evaluation* describing methodology |
| Section VI Results | Table 3 (WER by group), Figure 3 (grouped bar chart) |
| Section VII Discussion | Objective interpretation of which system performs better in which conditions, implications for production STT choice |

---

## 8. ngrok Setup (one command)

```bash
# Install ngrok (once)
snap install ngrok

# Authenticate (once, free account)
ngrok config add-authtoken <your_token>

# Expose the app while Docker is running
ngrok http 80

# Share the https://abc123.ngrok.io URL with participants
```

---

## 9. What This Spec Does Not Cover

- Multilingual evaluation (Kannada/Hindi input) — future work
- Fine-tuning either STT model — out of scope
- Statistical significance testing — optional enhancement if time permits (paired t-test on per-clip WER)

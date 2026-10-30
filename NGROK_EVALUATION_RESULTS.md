# ngrok Voice Evaluation Results

## Overview

**Test Date:** May 22-24, 2026  
**Location:** Docker volumes (`aquaponic-ai_eval_data`)  
**Storage Path:** `backend/data/eval_clips/` and `backend/data/eval_results/`

---

## Participants & Data Collection

**5 participants** completed the evaluation with **40 audio clips each** (200 total):

| Participant | Clips | Status | Recording Dates |
|---|---|---|---|
| Chandan | 40 | ✓ Complete | May 22-24 |
| Chethana | 40 | ✓ Complete | May 22-24 |
| Sangeethan | 40 | ✓ Complete | May 22-24 |
| chandana | 40 | ✓ Complete | May 22-24 |
| Balajik | 40 | ✓ Complete | May 22-24 |

---

## Questionnaire Structure

All 40 clips per participant were organized into **4 test groups**:

### **Group A: Clean Speech (Clips 1-10, 10 sentences)**
Domain-specific aquaponics vocabulary with clear pronunciation:
1. "My farm uses an NFT system."
2. "I am raising tilapia and barramundi."
3. "The fish tank holds two thousand litres."
4. "I have one hundred tilapia fingerlings."
5. "The harvest cycle is six months."
6. "I also grow trout in a media bed system."
7. "The system type is deep water culture."
8. "I have fifty catfish and thirty trout."
9. "We use a raft system for the crops."
10. "The stocking density is five fish per cubic metre."

### **Group B: Indian Numbers & Currency (Clips 11-20, 10 sentences)**
Financial data with Indian numbering system (lakhs, crores):
11. "The capital expenditure is five lakh rupees."
12. "Monthly revenue is fifty-five thousand rupees."
13. "I spent two lakh on infrastructure."
14. "The monthly operating cost is thirty thousand."
15. "My total investment was one crore rupees."
16. "I earn forty thousand from fish every month."
17. "The equipment cost one lakh fifty thousand."
18. "Annual profit is three lakh rupees."
19. "My farm area is one thousand square metres."
20. "I started with fifty thousand rupees initial stock."

### **Group C: Crops & Locations (Clips 21-30, 10 sentences)**
Agricultural products and geographic references:
21. "I grow lettuce, spinach, and basil in the aquaponic beds."
22. "The crop area is two hundred square metres."
23. "Monthly yield is about fifty kilograms of lettuce."
24. "My farm is located in Bengaluru, Karnataka."
25. "I also cultivate mint and okra."
26. "The growing area covers five hundred square feet."
27. "I sell tomatoes and capsicum to local markets."
28. "The farm is in Pune, Maharashtra."
29. "Crop revenue is fifteen thousand per month."
30. "I grow herbs like basil and mint near the fish tanks."

### **Group D: Fillers & Homophones (Clips 31-40, 10 sentences)**
Natural speech with filler words, hesitations, and phonetic ambiguities:
31. "Um, I have, uh, about twenty thousand litres capacity."
32. "You know, I raise till, I mean tilapia, in the main tank."
33. "My farm, basically, earns around two lakh, sort of, annually."
34. "I think it is, like, an NFT, an n f t, system."
35. "Uh, the harvest is, um, every six months or so."
36. "I have, you know, around five lakh in capital expenses."
37. "Actually I grow talapia, I mean tilapia, and some trout."
38. "My location is, uh, Bangalore, Bengaluru, in Karnataka."
39. "Um, the monthly revenue is, like, fifty five thousand rupees."
40. "I use, basically, a media bead, I mean media bed, system."

---

## STT Model Comparison Results

### **Word Error Rate (WER) by Group**

| Group | Description | N | Whisper WER | Sarvam WER | Δ | Winner |
|---|---|---|---|---|---|---|
| **A** | Clean speech | 50 | 0.263 | 0.247 | −0.015 | Sarvam ✓ |
| **B** | Indian numbers | 50 | 0.295 | 0.338 | +0.043 | Whisper ✓ |
| **C** | Crops/locations | 50 | 0.219 | 0.167 | −0.052 | Sarvam ✓ |
| **D** | Fillers+homophones | 50 | 0.433 | 0.256 | −0.178 | Sarvam ✓✓ |
| **OVERALL** | **All 200 clips** | **200** | **0.303** | **0.252** | **−0.050** | **Sarvam** |

**Key Findings:**
- **Sarvam is 5% better overall** (WER: 0.252 vs 0.303)
- Sarvam excels with natural speech patterns (Group D: −17.8% improvement)
- Whisper performs better with structured financial numbers (Group B only)
- Sarvam handles aquaponics domain terminology better
- Both models struggle with homophone disambiguation and very technical numbers

---

## Problem Areas (High WER > 0.50)

**13 clips** had WER > 0.50 for both systems, indicating:
- Ambiguous ground truth or poor recording quality
- Common issues: "barramundi" → "barra mundi", "tilapia" → "talapia"
- Number with complex formatting: "one lakh fifty thousand" → "1,50,000"

### High-Error Clips:
| Participant | Clip | Issue | Whisper WER | Sarvam WER |
|---|---|---|---|---|
| Chethana | 8 | "fifty...thirty" (double numbers) | 1.286 | 0.714 |
| Chethana | 9 | "raft system" (clear but complex) | 1.000 | 1.000 |
| Chethana | 2 | "barramundi" pronunciation | 0.667 | 0.833 |
| chandana | 2 | "barramundi" variant accent | 0.667 | 1.000 |
| (5 more) | Various | Equipment costs, currency phrases | 0.556–0.625 | 0.556–0.875 |

---

## Files & Artifacts

### **Location:** Docker volumes
```
aquaponic-ai_eval_data/
├── eval_clips/
│   ├── master_manifest.json          # Participant list
│   ├── Chethana/
│   │   ├── manifest.json             # Chethana's clips metadata
│   │   └── clip_01.webm...clip_40.webm
│   ├── Chandan/
│   ├── Sangeethan/
│   ├── chandana/
│   └── Balajik/
└── eval_results/
    ├── results.csv                   # Full WER results (200 rows)
    ├── summary.md                    # This summary table
    ├── agreement_analysis.md         # High-error analysis
    ├── status.json                   # Evaluation completion status
    └── wer_by_group.png              # WER visualization chart
```

### **Exported Files** (also in this workspace):
- `NGROK_EVALUATION_RESULTS.md` (this file)
- `evaluation_results.csv` (complete CSV with all 200 test cases)

---

## How to Access the Clips Locally

The evaluation clips are stored in Docker volumes. To examine them:

```bash
# Check what participants are in the volume
docker run --rm -v aquaponic-ai_eval_data:/eval alpine cat /eval/eval_clips/master_manifest.json

# Extract a single participant's manifest (shows ground truth for each clip)
docker run --rm -v aquaponic-ai_eval_data:/eval alpine cat /eval/eval_clips/Chethana/manifest.json

# Export results to local filesystem
docker run --rm -v aquaponic-ai_eval_data:/eval alpine cat /eval/eval_results/results.csv > local_results.csv
```

---

## Recommendations

1. **Use Sarvam as primary STT** for Indian-English aquaponics domain (5% WER improvement)
2. **Fallback to Whisper** only for structured financial questions (Group B)
3. **Add domain dictionary** for aquaponics fish species (tilapia, barramundi, carp, trout)
4. **Filler word handling** — Sarvam's post-processing is superior for natural speech
5. **Currency normalization** — Consider phrase detection for "X lakh" and "Y crore"

---

## Test Metadata

- **Backend Version:** Located in `backend/routers/eval.py`
- **STT Pipeline:** `backend/eval/run_wer_eval.py`
- **Voice Processing:** `backend/services/voice_interpretation.py`
- **Test Trigger:** ngrok HTTP tunnel at `https://<domain>/eval/record`
- **Evaluation Date:** May 22-24, 2026

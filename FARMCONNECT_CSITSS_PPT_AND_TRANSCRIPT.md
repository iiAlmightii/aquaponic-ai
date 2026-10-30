# 🎤 FarmConnect: Official Conference Presentation & Spoken Transcript (Streamlined & Visual-Ready)
**10th International Conference on Computational Systems & Information Technology for Sustainable Solutions (CSITSS-2026)**  
**Track 4-8: Data Science, Analytics, and Intelligent Decision Systems | Session 6C**  
**Paper ID:** 604 | **Presenter:** Chandan K | **Target Time:** ~8.5 to 9.5 minutes (Leaving ~3.5 min for Q&A)

---

# DESIGN & VISUAL GUIDELINES FOR PREZI / PPT
* **Color Palette:**
  * **Primary (Deep Forest Green):** `#064e3b` — Represents agriculture, sustainability, and trust.
  * **Accent (Vibrant Emerald / Mint):** `#059669` / `#10b981` — Highlights key metrics and badges.
  * **Secondary Accent (Ocean / Cyan Blue):** `#0284c7` — Represents aquaculture and water systems.
  * **Neutral Background:** Clean White (`#ffffff`) or Soft Slate (`#f8fafc`).
  * **Alert / Caution:** Amber (`#f59e0b`) for risk and pessimistic scenarios.
* **Layout Rule:** 
  * **Zero dense paragraphs.** Every slide uses visual cards, stat callouts, icons, or workflow arrows.
  * **Zero equations on slides.** Keeps the slides clean, avoids panel traps, and allows you to explain the logic naturally in speech.

---

# PART 1: SIMPLIFIED SLIDE CONTENT (11 SLIDES)

---

### SLIDE 1: TITLE SLIDE
* **Branding:** RV College of Engineering® | *Go, change the world®*
* **Conference:** 10th International Conference on Computational Systems & Information Technology for Sustainable Solutions (CSITSS-2026)
* **Session Track:** Track 4-8: Data Science, Analytics, and Intelligent Decision Systems (Session 6C)
* **Paper ID:** 604
* **Title:**  
  ## FarmConnect: A Voice-Driven Adaptive Decision Support System for Aquaponic and Land Farm Planning with Multi-Scenario Financial Analysis
* **Authors:** Chandan K$^1$, Dr. Deepika K$^2$, Karthik H S$^1$
* **Affiliation:** Department of Master of Computer Applications, RV College of Engineering®, Bengaluru, India
* **Presenter:** Chandan K (`chandank.mca24@rvce.edu.in`)
* *Visual Cue:* Clean, modern title banner with college logo and emerald accent lines.

---

### SLIDE 2: TABLE OF CONTENTS
* **Header:** Table of Contents
* *Visual Layout: 4x2 clean numbered cards with icons*
  * **01.** Problem & Agronomic Context
  * **02.** Research Gap
  * **03.** Objectives
  * **04.** Methodology & Voice Pipeline
  * **05.** System Architecture
  * **06.** Financial Engine & Resilience
  * **07.** Key Results & Evaluation
  * **08.** Conclusions & Roadmap

---

### SLIDE 3: INTRODUCTION
* **Header:** Introduction
* *Visual Layout: 3 Infographic Stat Cards + 1 Core Takeaway Banner*
  * **Card 1 [Eco-Potential]:** **90–95% Water Saved**  
    *Aquaponics recirculates water between fish and plants to produce dual harvest streams.*
  * **Card 2 [The Crisis]:** **>60% First-Year Failure Rate**  
    *Smallholder setups collapse primarily due to poor capital budgeting, not biological failure.*
  * **Card 3 [The Barrier]:** **Complex Forms & Spreadsheets**  
    *Rural operators struggle with heavy data entry, multi-tab sheets, and lack of expert guidance.*
  * **Solution Banner (FarmConnect):**  
    *An end-to-end voice-first platform that turns a **10-minute natural conversation** into bank-ready financial plans.*
* *Visual Cue:* Split graphic: Left = Aquaponic recirculating cycle icon; Right = Farmer speaking into a smartphone.

---

### SLIDE 4: RESEARCH / LITERATURE GAP
* **Header:** Research/ Literature Gap
* *Visual Layout: 3 Highlight Callouts + Clean Comparison Matrix*
  * **Water Quality vs. Financial Reality:** Existing smart systems monitor sensors (pH, temperature), but completely ignore farm profitability and cash flow.
  * **Missing Risk Boundaries:** Current farm planning tools provide only a single static estimate; they do not show what happens if market prices crash.
  * **Speech Recognition Barriers:** Standard voice assistants struggle with regional accents, agricultural jargon, and large Indian numbering units.

**Feature Comparison Matrix:**
| Feature | Traditional Spreadsheets | Advisory Apps | FarmConnect |
| :--- | :---: | :---: | :---: |
| **Voice-First Input** | ❌ No | ⚠️ Limited | ✅ **Yes** |
| **Adaptive Survey** | ❌ No | ⚠️ Form-based | ✅ **Yes** |
| **Multi-Scenario Risk Bounds** | ⚠️ Manual | ❌ No | ✅ **Yes** |
| **Live Commodity Market Prices**| ❌ No | ⚠️ Cached | ✅ **Yes** |
| **Aquaponic + Land Support** | ⚠️ Generic | ❌ Land Only | ✅ **Yes** |

---

### SLIDE 5: MOTIVATION AND OBJECTIVES
* **Header:** Motivation and Objectives
* **Motivation:** Smallholders need bank loans and government subsidies (NABARD / PMMSY) to start, but lack formal project feasibility reports.
* *Visual Layout: 4 Crisp Bullet Cards (All starting with "To")*
  * **To develop** a voice-first adaptive decision support platform for aquaponic and land farming.
  * **To design** a domain-specific voice pipeline that normalizes agricultural vocabulary, Indian number formats, and regional accents.
  * **To formulate** a deterministic financial planning engine that projects costs and profits across three revenue scenarios.
  * **To architect** a containerized, resilient system with real-time market price integration and offline session recovery.

---

### SLIDE 6: METHODOLOGY
* **Header:** Methodology
* *Visual Layout: Horizontal 3-Step Process Flowchart*
  * **Step 1: Adaptive Survey (Stateless FSM)**  
    *29 dynamic questions that automatically skip irrelevant queries based on prior answers (e.g., skips gravel bed questions for pipe-based systems).*
  * **Step 2: Voice Interpretation Cascade**  
    *• Cleans conversational filler words (`um`, `uh`).*  
    *• Auto-corrects farm terminology (e.g., "talapia" $\to$ "tilapia").*  
    *• Converts spoken Indian values (e.g., "two lakh" $\to$ 2,00,000).*
  * **Step 3: Confidence-Based Confirmation Gate**  
    *Combines speech confidence and entity accuracy into a single score. Only prompts the user for confirmation when audio is noisy or ambiguous.*
* *Visual Cue:* Clean process diagram: `[Voice Input] ➔ [Speech Normalization] ➔ [Adaptive FSM] ➔ [Financial Engine] ➔ [Report]`.

---

### SLIDE 7: IMPLEMENTATION (ARCHITECTURE & LOCAL VOICE)
* **Header:** Implementation
* *Visual Layout: 3-Tier Layered Architecture Diagram*
  * **1. Presentation Layer:** React 18 SPA with real-time on-screen speech feedback for zero perceived latency.
  * **2. Application Layer:** Python 3.12 FastAPI backend handling high-speed asynchronous processing.
  * **3. Data & Cache Layer:** PostgreSQL (JSONB) for flexible survey progress + Redis for instant price caching.
* *Key Engineering Highlights:*
  * **On-Premise Speech Engine:** Uses local `faster-whisper` (int8 optimized) on server CPU — **Zero cloud API costs** and **100% farmer data privacy**.
  * **Dropout Resilience:** Every answer is saved immediately. If mobile internet drops, the session resumes seamlessly upon reconnecting.

---

### SLIDE 8: IMPLEMENTATION (FINANCIAL ENGINE & RESILIENCE)
* **Header:** Implementation
* *Visual Layout: 3 Infographic Feature Blocks*
  * **Multi-Scenario Capital Budgeting:**  
    *Computes startup CAPEX, monthly running OPEX, and net returns across 3 risk levels:*  
    *• Pessimistic (-25% market/harvest shock)*  
    *• Base (Standard market conditions)*  
    *• Optimistic (+30% direct-to-consumer premium)*
  * **Institutional Financial Metrics:**  
    *Projects Return on Investment (ROI), Payback Period, and Net Present Value (NPV) using standard **8% subsidized agricultural loan rates**.*
  * **4-Tier Live Price Fallback:**  
    *Local Mandi Price $\to$ State Average $\to$ National Median $\to$ Historical Baseline (guarantees the system never halts if government APIs go down).*
  * **Automated Agronomic Advice:**  
    *8 built-in financial health rules (e.g., alerts the farmer if fish feed costs exceed 45% of running expenses).*

---

### SLIDE 9: RESULTS AND DISCUSSIONS
* **Header:** Results and Discussions
* *Visual Layout: 4 Stat & Metric Callout Cards*
  * **100% Calculation Correctness**  
    *Passed all 36 deterministic software test fixtures with exact analytical matching (60% Base ROI, 20-month payback).*
  * **200 Realistic Audio Samples Evaluated**  
    *Tested across diverse regional accents overlaid with agricultural background noise.*
  * **Near 100% Intent Extraction Accuracy**  
    *While conventional Word Error Rate (WER) was 30.25% due to formatting penalties (e.g., "520" vs "five hundred and twenty"), the system extracted the exact intended numbers and entities with near-perfect accuracy.*
  * **Fast Field Performance**  
    *Sub-second survey responses; complete multi-scenario report ready in under 3 minutes.*

---

### SLIDE 10: CONCLUSIONS AND FUTURE WORK
* **Header:** Conclusions and Future work
* *Visual Layout: Two Equal Columns (Left = Achievements, Right = Roadmap)*
* **Conclusions:**
  * Successfully unified voice input, adaptive surveys, and multi-scenario financial planning into a working, rural-ready platform.
  * Replaced intimidating spreadsheets with an easy 10-minute spoken interview.
  * Generates professional, bankable project reports to help farmers secure agricultural loans and subsidies.
* **Future Work:**
  * **Real-World Farmer Trials:** Conducting user studies with 50+ local farmers to measure ease-of-use and completion time.
  * **Regional Language Support:** Expanding voice recognition to regional Indian languages (Kannada, Hindi, Tamil).
  * **Long-Term Profit Validation:** Comparing predicted financial projections against real harvest earnings over 6 and 12 months.

---

### SLIDE 11: REFERENCES
* **Header:** References
* **[1]** A. K. Verma et al., "Aquaponics as an integrated agri-aquaculture system (IAAS): Emerging trends and future prospects," *Technol. Forecast. Soc. Chang.*, vol. 194, 2023.
* **[2]** V. Lobanov et al., "Aquaponics and the crossroads of profitability and sustainability viewed through sensitivity and risk modeling," *J. Clean. Prod.*, vol. 528, 2025.
* **[3]** A. Radford et al., "Robust speech recognition via large-scale weak supervision," in *Proc. ICML*, vol. 202, 2023.
* **[4]** A. Baevski et al., "wav2vec 2.0: A framework for self-supervised learning of speech representations," in *Proc. NeurIPS*, vol. 33, 2020.
* **[5]** R. Biswas and N. Goel, "Intelligent chatbot assistant in agriculture domain," in *Proc. Int. Conf. Agriculture-Centric Computation*, 2023.
* **[6]** A. A. Balkrishna et al., "Significance of smart agriculture technologies in India: Initiatives, challenges, and future directions," *Smart Agric. Technol.*, vol. 5, 2023.

---
---

# PART 2: SPOKEN TRANSCRIPT (NATURAL, CRISP, & CONFIDENT)
**Pacing:** ~130 words per minute | **Total Target Time:** ~8 minutes 45 seconds  
*(Leaves ~3.5 minutes for Panel Q&A within your 12.5-minute slot)*

---

### SLIDE 1: TITLE SLIDE (0:00 – 0:35 | 35s)
> "A very good afternoon to the respected Session Chair, esteemed jury members, and fellow participants.  
> I am Chandan K, from the Department of Master of Computer Applications at RV College of Engineering, Bengaluru. Today, on behalf of my co-authors Dr. Deepika K and Karthik H S, I am delighted to present our research paper:  
> **'FarmConnect: A Voice-Driven Adaptive Decision Support System for Aquaponic and Land Farm Planning with Multi-Scenario Financial Analysis.'**  
> Our work focuses on an important challenge in smart agriculture: helping smallholder farmers make sound financial and operational decisions through an intuitive, voice-first platform."

---

### SLIDE 2: TABLE OF CONTENTS (0:35 – 0:55 | 20s)
> "Here is an outline of today’s talk: I will begin with the agricultural problem and the gaps in current tools. I will then explain our core objectives, walk through our methodology and system design, discuss our testing and speech recognition results, and conclude with our future field deployment plans."

---

### SLIDE 3: INTRODUCTION (0:55 – 1:55 | 60s)
> "Aquaponics is an exciting sustainable farming technique that recirculates water between fish aquaculture and hydroponic crop beds. It saves **up to 95% of freshwater** compared to traditional farming while producing two simultaneous income sources—fresh fish and organic vegetables.  
> However, despite these benefits, research shows that **over 60% of smallholder commercial aquaponic ventures fail within their very first year.**  
> Interestingly, they don’t fail because the fish or plants die—they fail due to **inadequate financial planning**. Managing an aquaponic farm requires balancing fish feeding costs, staggered harvest timelines, power bills, and market price changes. Standard spreadsheets simply cannot handle these linked biological and financial factors.  
> At the same time, rural farmers often find complex, form-heavy software difficult to use in daily farm settings. FarmConnect was built to bridge this gap: it allows a farmer to speak naturally for **about 10 minutes** to generate a complete, multi-scenario financial plan."

---

### SLIDE 4: RESEARCH / LITERATURE GAP (1:55 – 2:50 | 55s)
> "Looking at existing agricultural decision support tools, we noted three major gaps:  
> First, most smart aquaponic research focuses heavily on **sensor monitoring**—like tracking pH and dissolved oxygen—while leaving out the financial planning needed to keep the business profitable.  
> Second, existing planning tools provide only **single static estimates**. They don’t show farmers the downside risks—like what happens to their cash flow if market prices drop by 20%.  
> Third, general voice assistants struggle with regional accents, fail to recognize specialized farm terms, and stumble on Indian numbering systems like *lakh* and *crore*.  
> As summarized in the matrix on this slide, FarmConnect combines a voice-first interface, adaptive questionnaires, multi-scenario financial projections, and live mandi prices into one practical platform."

---

### SLIDE 5: MOTIVATION AND OBJECTIVES (2:50 – 3:35 | 45s)
> "Starting an aquaponic unit requires significant capital investment, usually between 3 to 10 lakh rupees. Farmers often need bank loans or government subsidies like NABARD or PMMSY, which strictly require a bankable project feasibility report.  
> To address this, our project set four straightforward objectives:  
> • **To develop** an adaptive, voice-driven decision support system tailored for aquaponic and land farm planning.  
> • **To design** a domain-specific voice processing pipeline that cleans spoken input, maps agricultural terms, and accurately parses Indian number formats.  
> • **To formulate** a deterministic financial engine that projects costs, returns, and payback across three distinct market scenarios.  
> • **To architect** a reliable, edge-deployable system with real-time market price integration and automatic offline recovery."

---

### SLIDE 6: METHODOLOGY (3:35 – 4:50 | 75s)
> "Now let us look at our methodology, which connects spoken user input to deterministic financial calculations.  
> Data collection is driven by an **Adaptive Questionnaire Engine** with 29 questions across six farm categories. Acting as a state machine, it automatically skips irrelevant questions. For example, if a farmer selects a pipe-based NFT system, the system automatically skips questions about gravel media volume.  
> When the farmer speaks, their voice passes through a **three-stage interpretation pipeline**:  
> First, it removes conversational filler words like 'um' and 'uh' and corrects domain terms—for instance, correcting 'talapia' to 'tilapia'.  
> Second, it passes through our spoken number cascade. It extracts numbers and handles Indian scale words directly—turning spoken phrases like 'two lakh' into 200,000, while handling common homophones like 'won' and 'ate'.  
> Third, it uses a **confidence confirmation gate**. By combining the speech recognition confidence with our entity extraction rules, the system only prompts the user for confirmation when the input is truly noisy or unclear. This keeps the conversation natural and avoids annoying repetitive confirmation prompts."

---

### SLIDE 7: IMPLEMENTATION (ARCHITECTURE & VOICE) (4:50 – 6:00 | 70s)
> "Turning to system implementation: FarmConnect uses a decoupled three-tier architecture built with Docker Compose.  
> The **Presentation Layer** is a modern React application. We created a custom voice recorder hook using the browser's native speech API to give farmers instant, on-screen visual feedback as they speak.  
> The **Application Layer** is powered by a high-speed Python FastAPI backend that handles all business logic asynchronously. For reliable speech transcription, we host a local instance of **faster-whisper** optimized with int8 quantization directly on the server CPU. This is a crucial design choice: it requires no expensive cloud API calls, keeps memory usage under 800 MB, and ensures complete data privacy for the farmer.  
> In the **Data Layer**, PostgreSQL stores user data, while survey answers are accumulated in a flexible JSON format. We also implemented automatic state saving: if a farmer’s mobile connection drops mid-survey, all progress is preserved, and they can resume immediately upon reconnecting."

---

### SLIDE 8: IMPLEMENTATION (FINANCIAL ENGINE & RESILIENCE) (6:00 – 7:15 | 75s)
> "On the financial side, the engine translates survey answers into 14 key financial metrics across three revenue outlooks:  
> • **Pessimistic**, simulating a 25% drop in prices or yields;  
> • **Base**, reflecting normal market conditions; and  
> • **Optimistic**, modeling premium direct-to-consumer sales.  
> In our calculations, startup capital aggregates infrastructure, pumps, and initial stock—including an automatic **10% safety buffer for natural biological mortality**.  
> We compute Return on Investment, Payback Period, and Net Present Value using an **8% annual discount rate**, which aligns with subsidized agricultural loan rates offered by NABARD and the Kisan Credit Card scheme.  
> For the Internal Rate of Return, we implemented a robust bisection search that converges reliably to within one paisa precision without the risk of division-by-zero crashes.  
> To protect against internet outages, our market price lookup uses a **4-tier fallback**: checking the local district mandi first, then the state average, then cached national medians, and finally reliable baseline benchmarks.  
> Finally, an automated rule engine checks farm health—for example, warning the operator if fish feed expenses exceed 45% of running costs."

---

### SLIDE 9: RESULTS AND DISCUSSIONS (7:15 – 8:15 | 60s)
> "Let us look at our key results.  
> First, our financial engine was validated across a **36-case test suite with a 100% pass rate**, confirming that all financial formulas and scenario progressions match analytical ground truths exactly.  
> Second, we tested our speech pipeline on a dataset of **200 audio samples** recorded across diverse regional accents and overlaid with simulated farm background noise.  
> While the raw Word Error Rate was 30.25%, an important finding emerged: traditional word error rate heavily penalizes formatting differences—such as transcribing spoken 'five hundred and twenty' as '520'. Because our normalization pipeline extracts the exact intended integer 520, our system achieved **near 100% Functional Intent Extraction Accuracy**. In practical farm advisory, extracting the right data values is what truly matters.  
> In terms of speed, survey responses take under 200 milliseconds, and complete financial plans are generated in under 3 minutes."

---

### SLIDE 10: CONCLUSIONS AND FUTURE WORK (8:15 – 9:00 | 45s)
> "In conclusion, FarmConnect successfully unifies voice-driven data entry, dynamic surveys, and multi-scenario capital budgeting into a working, field-ready platform. It removes the barrier of complex spreadsheets, allowing rural operators to generate bank-ready financial projections through a simple conversation.  
> Looking ahead, our future work focuses on three practical goals:  
> 1. **Conducting field trials** with 50+ local farmers to measure real-world usability and survey completion times.  
> 2. **Adding regional language support** for vernacular Indian languages like Kannada, Hindi, and Tamil.  
> 3. **Auditing long-term financial accuracy** by comparing our model’s predictions against actual farm earnings over 6 and 12 months."

---

### SLIDE 11: REFERENCES & CLOSING (9:00 – 9:15 | 15s)
> "The key literature supporting our agronomic, financial, and speech systems is shown on this slide.  
> We thank the Department of MCA at RV College of Engineering for their support and research infrastructure.  
> Thank you very much for your time. My co-authors and I will be happy to take any questions."

---

*(End of presentation at 9 minutes 15 seconds. You step smoothly into Q&A with 3.5 minutes remaining!)*

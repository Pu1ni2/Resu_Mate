<p align="center">
  <img src="https://img.shields.io/badge/Python-3.13-blue?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/LiveKit-WebRTC-FF6B35?logo=webrtc&logoColor=white" />
  <img src="https://img.shields.io/badge/Simli-Avatar-8B5CF6" />
  <img src="https://img.shields.io/badge/ChromaDB-Vector--Store-green" />
</p>

# ResuMate AI

**A full-stack multi-agent AI hiring platform** with real-time avatar interviews, career coaching, and intelligent candidate evaluation.

ResuMate AI isn't a wrapper around ChatGPT — it's a production-grade system where **5 specialized AI agents** orchestrate the entire hiring pipeline, from resume parsing to live video interviews with a lip-synced AI avatar.

---
## Architecture

<p align="center">
  <img src="./architecture.png" alt="ResuMate AI Architecture" width="100%" />
</p>
```
## Architecture

### System Overview

```
                         ┌─────────────────────────────────┐
                         │        ResuMate AI Platform       │
                         └────────────────┬──────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
            ┌───────▼───────┐    ┌───────▼────────┐   ┌───────▼───────┐
            │    Hiring     │    │   Candidate    │   │   Interview   │
            │    Manager    │    │    Portal      │   │    System     │
            │    Portal     │    │               │   │               │
            └───────┬───────┘    └───────┬────────┘   └───────┬───────┘
                    │                    │                     │
                    ▼                    ▼                     ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                    FastAPI Backend                          │
       │                  (15+ REST Endpoints)                      │
       └─────────────────────────┬───────────────────────────────────┘
                                 │
       ┌────────────┬────────────┼────────────┬────────────┐
       │            │            │            │            │
  ┌────▼────┐ ┌────▼────┐ ┌────▼─────┐ ┌───▼─────┐ ┌───▼──────┐
  │  Data   │ │   HR    │ │Technical │ │Research │ │ Advisor  │
  │  Agent  │ │  Agent  │ │  Agent   │ │  Agent  │ │  Agent   │
  └─────────┘ └─────────┘ └────┬─────┘ └─────────┘ └────┬─────┘
                               │                         │
                         ┌─────┴─────┐            ┌──────┼──────┐
                         │           │            │      │      │
                    ┌────▼───┐ ┌────▼────┐  ┌────▼──┐ ┌▼────┐ ┌▼──────┐
                    │Interview│ │Scoring  │  │Resume │ │Int. │ │Career │
                    │ Agent  │ │ Agent   │  │Coach  │ │Prep │ │Advisor│
                    └────────┘ └─────────┘  └───────┘ └─────┘ └───────┘
```

### Agent Framework

Each agent follows the **Plan → Execute → Reflect → Output** pipeline:

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   PLAN   │ ──▶ │ EXECUTE  │ ──▶ │ REFLECT  │ ──▶ │  OUTPUT  │
│          │     │          │     │          │     │          │
│ Analyze  │     │ Run      │     │ Quality  │     │ Format   │
│ task     │     │ tools    │     │ check    │     │ results  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Interview System Architecture

```
┌──────────────────┐              ┌──────────────────────┐
│                  │   LiveKit    │                      │
│  Candidate       │   WebRTC    │   Interview Agent     │
│  Browser         │◄──────────►│   (Python Process)    │
│                  │    Room     │                      │
│  ┌────────────┐  │              │  ┌────────────────┐  │
│  │ Camera     │  │              │  │ OpenAI         │  │
│  │ + Mic      │  │              │  │ Realtime API   │  │
│  ├────────────┤  │              │  │ (Voice-to-     │  │
│  │ Face       │  │              │  │  Voice)        │  │
│  │ Tracking   │  │              │  ├────────────────┤  │
│  ├────────────┤  │              │  │ Simli Avatar   │  │
│  │ Tab        │  │              │  │ (Lip-synced    │  │
│  │ Monitor    │  │              │  │  Face)         │  │
│  └────────────┘  │              │  └────────────────┘  │
└──────────────────┘              └──────────────────────┘
```

## Features

### Hiring Manager Portal
- **Resume Upload & RAG** — PDF/DOCX parsing, ChromaDB vector storage, contextual AI chat
- **Scanner Agent** — Extracts embedded links from PDFs, scrapes GitHub profiles, searches LinkedIn via Tavily
- **AI Chat** — Multi-candidate comparison, voice input/output, anonymization mode
- **Hiring Agent** — Role-specific evaluation with JD matching, generates fit reports
- **Email Composer** — AI-drafted emails (interest, interview, offer, pass, follow-up) with Gmail/Outlook integration
- **Interview Creator** — Configure role, level, questions, focus areas → grants candidate access

### Candidate Portal
- **Resume Upload** — Single-resume-per-candidate with replace flow
- **AI Advisor (3 Sub-Agents)**
  - **Resume Coach** — Identifies gaps, suggests improvements, ATS optimization
  - **Interview Prep** — Practice questions, STAR method coaching, role-specific prep
  - **Career Advisor** — Strengths analysis, career paths, skill recommendations
- **Live AI Interview** — Real-time video interview with AI avatar
- **Interview Report** — Collapsible view with scores, eye contact %, proctoring summary

### Interview System
- **LiveKit Cloud** — WebRTC room infrastructure for real-time audio/video
- **Simli Avatar** — Lip-synced AI avatar as the interviewer's face
- **OpenAI Realtime API** — Voice-to-voice conversation (no TTS/STT latency)
- **Proctoring** — Face detection, eye tracking, tab monitoring, fullscreen enforcement
- **3-Violation Auto-Termination** — Tab switch, window blur, or fullscreen exit = violation

### UI/UX
- **Glassmorphism Design** — Backdrop blur, gradient borders, subtle animations
- **Dark + Light Theme** — Full support on both portals (amber accent hiring, blue accent candidate)
- **DM Sans Typography** — Consistent font system across all pages
- **Responsive** — Mobile-friendly sidebar collapse
- **Keyboard Shortcuts** — T (theme), K (search), / (chat focus)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, React Router, Lucide Icons |
| **Backend** | FastAPI, Python 3.13, Uvicorn |
| **AI/LLM** | OpenAI GPT-4o, text-embedding-3-small, Whisper, TTS, Realtime API |
| **Vector DB** | ChromaDB with LangChain integration |
| **Interview** | LiveKit Cloud (WebRTC), Simli (avatar), OpenAI Realtime (voice) |
| **Search** | Tavily API for web search and fact-checking |
| **Styling** | Custom CSS with design tokens, CSS variables, glassmorphism |

---

## Agent Framework

Each agent follows the **Plan → Execute → Reflect → Output** pipeline:

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  PLAN   │ →  │ EXECUTE │ →  │ REFLECT │ →  │ OUTPUT  │
│         │    │         │    │         │    │         │
│ Analyze │    │ Run     │    │ Check   │    │ Format  │
│ task &  │    │ tools & │    │ quality │    │ results │
│ decide  │    │ gather  │    │ & retry │    │ & send  │
│ approach│    │ data    │    │ if poor │    │ to user │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

**Step-level retry** with exponential backoff. Persistent memory via `agent_memory.json`. Metrics tracked per agent.

---

## 5 Specialized Agents

| Agent | Role | Tools |
|-------|------|-------|
| **Data Agent** | Resume parsing, profile scraping, data enrichment | PyPDF2, Playwright, GitHub API, Tavily |
| **HR Agent** | Candidate evaluation, email drafting, hiring recommendations | GPT-4o, salary research |
| **Technical Agent** | Interview orchestration with 2 sub-agents | LiveKit, Simli, OpenAI Realtime |
| ↳ Interview Agent | Conducts live avatar interview | Voice AI, Simli lip-sync |
| ↳ Scoring Agent | Per-question scoring, final report | GPT-4o evaluation |
| **Research Agent** | Web search, fact-checking, citation | Tavily Search API |
| **Advisor Agent** | Candidate career coaching (3 modes) | GPT-4o, resume context |

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- OpenAI API key
- Tavily API key (for web search)
- LiveKit Cloud account (for interviews)
- Simli account (for avatar)

### Environment Variables

Create `backend/.env`:

```env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
GITHUB_TOKEN=ghp_...
DATABASE_URL=sqlite+aiosqlite:///./resumate.db
CORS_ORIGINS=http://localhost:3001

# LiveKit (for interview system)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret

# Simli (for AI avatar)
SIMLI_API_KEY=your-simli-key
SIMLI_FACE_ID=your-face-id
```

### Installation

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
pip install PyJWT livekit-agents livekit-plugins-openai livekit-plugins-simli

# Frontend
cd frontend
npm install
npm install livekit-client
```

### Running

```bash
# Terminal 1: Backend API
cd backend
python -m uvicorn main:app --reload --port 8001

# Terminal 2: Interview Agent (LiveKit + Simli)
cd backend
python interview_agent.py dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

Open **http://localhost:3001**

---

## Project Structure

```
resumate-pro/
├── backend/
│   ├── main.py                      # FastAPI app + router registration
│   ├── interview_agent.py           # LiveKit interview agent (separate process)
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat.py              # Chat, interview, TTS/STT endpoints
│   │   │   ├── candidates.py        # Upload, delete, CRUD endpoints
│   │   │   ├── livekit_routes.py    # Room creation, token generation
│   │   │   └── advisor_agent.py     # Candidate-facing advisor (3 sub-agents)
│   │   ├── agents/
│   │   │   ├── base_agent.py        # Plan → Execute → Reflect → Output framework
│   │   │   ├── orchestrator.py      # Agent routing and coordination
│   │   │   ├── data_agent.py        # Resume parsing + profile scraping
│   │   │   ├── hr_agent.py          # Evaluation + email drafting
│   │   │   ├── technical_agent.py   # Interview question generation + scoring
│   │   │   └── research_agent.py    # Web search + fact checking
│   │   ├── services/
│   │   │   ├── resume_rag.py        # ChromaDB RAG + resume analysis
│   │   │   └── auth.py              # Token authentication
│   │   └── core/
│   │       ├── config.py            # Settings + environment variables
│   │       └── database.py          # Database initialization
│   └── uploads/                     # Temporary file storage
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                 # App entry + CSS imports
│   │   ├── App.jsx                  # Route definitions
│   │   ├── components/
│   │   │   ├── Landing.jsx          # Landing page with agent showcase
│   │   │   ├── Dashboard.jsx        # Hiring manager dashboard (2500+ lines)
│   │   │   ├── CandidateFocus.jsx   # Deep-dive tools per candidate (1150 lines)
│   │   │   ├── CandidateLogin.jsx   # Email-based candidate authentication
│   │   │   ├── CandidateDashboard.jsx # Candidate portal with advisor chat
│   │   │   ├── InterviewRoom.jsx    # LiveKit + Simli interview room
│   │   │   └── ProductLayer.jsx     # Theme toggle, onboarding, notifications
│   │   ├── context/
│   │   │   └── AppContext.jsx       # Global state management
│   │   ├── services/
│   │   │   └── api.js               # Backend API client
│   │   └── styles/
│   │       ├── design-system.css    # Design tokens, primitives, animations
│   │       ├── landing.css          # Landing page styles
│   │       ├── global.css           # Dashboard + scanner styles
│   │       ├── candidate-theme.css  # Candidate portal (blue accent)
│   │       ├── interview-room.css   # Fullscreen interview UI
│   │       ├── dashboard-polish.css # Responsive + accessibility
│   │       ├── bugfixes.css         # Theme overrides + fixes
│   │       └── product-layer.css    # Theme toggle + onboarding
│   └── vite.config.js              # Dev server + API proxy
│
└── .gitattributes                   # GitHub language detection
```

---

## API Endpoints

### Chat & AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/send` | Send message to AI chat |
| POST | `/api/chat/text-to-speech` | Convert text to speech |
| POST | `/api/chat/speech-to-text` | Transcribe audio |
| POST | `/api/chat/generate-interview-questions` | Generate role-specific questions |
| POST | `/api/chat/score-answer` | Score an interview answer |
| POST | `/api/chat/interview-report` | Generate comprehensive report |
| POST | `/api/chat/create-interview` | Create interview for candidate |
| POST | `/api/chat/verify-email` | Candidate login verification |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/candidates/upload` | Upload and analyze resume |
| GET | `/api/candidates` | Get all candidates |
| DELETE | `/api/candidates/{id}` | Delete candidate + clear hash |
| DELETE | `/api/candidates` | Delete all candidates |

### Advisor (Candidate-Facing)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/advisor/upload-resume` | Candidate resume upload |
| POST | `/api/advisor/chat` | Chat with advisor (4 modes) |
| GET | `/api/advisor/context/{email}` | Get candidate context |

### LiveKit
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/livekit/create-room` | Create interview room |
| POST | `/api/livekit/join-room` | Join existing room |
| GET | `/api/livekit/interview-room-config/{name}` | Get room config |

---

## How It Works

### Hiring Manager Flow
```
Upload Resume → Data Agent parses + enriches
     ↓
Scanner Agent → scrapes GitHub, LinkedIn
     ↓
AI Chat → discuss candidates with context
     ↓
Hiring Agent → evaluates against job description
     ↓
Create Interview → configures role, questions, focus areas
     ↓
Email Candidate → AI-drafted invitation
```

### Candidate Flow
```
Login (email verification) → access granted by hiring manager
     ↓
Upload Resume → AI analyzes and stores context
     ↓
AI Advisor → Resume Coach | Interview Prep | Career Advisor
     ↓
Join Interview → LiveKit room connects
     ↓
AI Avatar (Simli) interviews candidate in real-time
     ↓
Report generated → scores, eye contact, proctoring data
```

### Interview Architecture
```
Candidate Browser                    Backend Agent Process
┌─────────────┐                     ┌──────────────────────┐
│ Camera + Mic │ ←── LiveKit ──→    │ OpenAI Realtime API  │
│ Face Tracking│     WebRTC         │ (voice-to-voice)     │
│ Tab Monitor  │     Room           │         ↓            │
│              │                    │ Simli Avatar         │
│ Avatar Video │ ←── LiveKit ──→    │ (lip-synced face)    │
│ (lip-synced) │     Video Track    │                      │
└─────────────┘                     └──────────────────────┘
```

---

## Prompt Engineering

The system uses carefully crafted prompts for each agent:

- **Interview Agent** — System prompt includes role, level, candidate name, focus areas. Instructs the AI to greet first, ask one question at a time, acknowledge answers, and maintain professional tone.
- **Scoring Agent** — Evaluates against specific role requirements with 1-10 scoring rubric.
- **Advisor Sub-Agents** — Each mode (Resume Coach, Interview Prep, Career Advisor) has distinct personality and expertise. Interview Prep asks clarifying questions before giving advice.
- **Anonymization** — Bidirectional regex-based name mapping applied across all AI response paths.

---

## License

MIT

---

<p align="center">
  Built by <strong>Sai Punith Kolla</strong>
</p>
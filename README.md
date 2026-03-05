# ResuMate AI v3 — Multi-Agent Hiring Platform

An AI-powered hiring platform built with a custom multi-agent framework. Features resume analysis, automated candidate profiling, live AI video interviews, and intelligent hiring recommendations.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              AGENT ORCHESTRATOR                  │
│         (Routes tasks to right agent)            │
└──────────┬──────────┬──────────┬────────────────┘
           │          │          │
    ┌──────▼──┐ ┌─────▼────┐ ┌──▼──────────┐
    │  DATA   │ │   HR     │ │ TECHNICAL   │  ┌──────────┐
    │  AGENT  │ │  AGENT   │ │   AGENT     │  │ RESEARCH │
    │         │ │          │ │             │  │  AGENT   │
    │ Scan    │ │ Evaluate │ │ Interview   │  │          │
    │ Extract │ │ Email    │ │ Score       │  │ Search   │
    │ Enrich  │ │ Compare  │ │ Questions   │  │ Cite     │
    └─────────┘ └──────────┘ └─────────────┘  └──────────┘
         │           │             │                │
    ┌────▼───────────▼─────────────▼────────────────▼──┐
    │                SHARED TOOLS                       │
    │  OpenAI │ Tavily │ GitHub API │ Playwright │ PDF  │
    └──────────────────────────────────────────────────┘
```

### Agent Framework
Every agent follows: **PLAN → EXECUTE → REFLECT → OUTPUT**
- **Planning**: Agent creates a multi-step execution plan
- **Execution**: Each step calls tools with retry logic + exponential backoff
- **Reflection**: Agent checks output quality, retries if needed
- **Memory**: Persistent memory across conversations

### Agents
| Agent | Role | Tools |
|-------|------|-------|
| **Data Agent** | Resume scanning, profile enrichment | PDF, Playwright, GitHub API, Tavily |
| **HR Agent** | Candidate evaluation, email drafting | LLM, Tavily (salary data) |
| **Technical Agent** | Interview questions, scoring, reports | LLM, Tavily (tech trends) |
| **Research Agent** | Web search, fact-checking | Tavily, LLM |

## Features

### Hiring Manager Portal (`/hiring`)
- Upload & analyze multiple resumes (RAG with ChromaDB)
- AI Scanner Agent (Matrix rain animation, auto-discovers GitHub/LinkedIn)
- Candidate Focus with 6 tools:
  - AI Chat (with auto web search, Perplexity-style)
  - Web Search (Tavily)
  - Hiring Agent (evaluation + fit report)
  - Email Composer (Gmail/Outlook integration)
  - GitHub Analyzer
  - Calendly Scheduler
- Create Interview for candidates

### Candidate Portal (`/candidate`)
- Email-based login (access granted by hiring manager)
- Resume upload & AI analysis
- AI Chat
- Live AI Video Interview:
  - Real-time camera feed
  - AI asks questions via voice (TTS)
  - Candidate answers via mic (Whisper STT)
  - Real-time scoring per answer
  - Full evaluation report with recommendations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Lucide Icons |
| Backend | FastAPI, Python 3.12 |
| AI/LLM | OpenAI GPT-4o, Whisper, TTS |
| RAG | LangChain, ChromaDB |
| Search | Tavily AI Search |
| Browser | Playwright (headless Chromium) |
| Database | PostgreSQL (prod) / SQLite (dev) |
| ORM | SQLAlchemy (async) |
| Deployment | Render |

## Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- API keys: OpenAI, Tavily, GitHub (optional), Calendly (optional)

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
playwright install chromium

# Configure
copy .env.example .env
# Edit .env with your API keys

# Run
python -m uvicorn main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3001
```

### Environment Variables
```env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
GITHUB_TOKEN=ghp_...          # Optional
CALENDLY_TOKEN=...             # Optional
DATABASE_URL=sqlite+aiosqlite:///./resumate.db
CORS_ORIGINS=http://localhost:3001
```

## API Endpoints

### Chat & AI
| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| POST | `/api/chat/send` | RAG | Multi-candidate chat |
| POST | `/api/chat/focus` | Research | Single-candidate deep chat |
| POST | `/api/chat/web-search` | Research | Web search |
| POST | `/api/chat/scan-resume` | Data | Scanner agent |

### Hiring
| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| POST | `/api/chat/hiring-agent` | HR | Candidate evaluation |
| POST | `/api/chat/draft-email` | HR | Email drafting |
| POST | `/api/chat/github-analyze` | Data | GitHub analysis |

### Interview
| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| POST | `/api/chat/generate-interview-questions` | Technical | Generate questions |
| POST | `/api/chat/score-answer` | Technical | Score answer |
| POST | `/api/chat/interview-report` | Technical | Full report |

### Candidate Portal
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/verify-email` | Candidate login |
| POST | `/api/chat/create-interview` | Create interview |

### Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System health |
| GET | `/monitoring` | Agent metrics & stats |

## Deployment (Render)

### Backend
1. New Web Service → Connect GitHub repo
2. Build Command: `pip install -r requirements.txt && playwright install chromium`
3. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables
5. Add PostgreSQL database (free tier)

### Frontend
1. New Static Site → Connect GitHub repo
2. Build Command: `npm install && npm run build`
3. Publish Directory: `dist`

## Project Structure
```
resumate-v3/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── app/
│   │   ├── agents/          ← Custom agent framework
│   │   │   ├── base_agent.py
│   │   │   ├── orchestrator.py
│   │   │   ├── data_agent.py
│   │   │   ├── hr_agent.py
│   │   │   ├── technical_agent.py
│   │   │   └── research_agent.py
│   │   ├── tools/           ← Reusable tool wrappers
│   │   │   ├── openai_tool.py
│   │   │   ├── tavily_tool.py
│   │   │   ├── github_tool.py
│   │   │   ├── browser_tool.py
│   │   │   ├── pdf_tool.py
│   │   │   └── voice_tool.py
│   │   ├── api/             ← Thin API layer
│   │   ├── models/          ← Database models
│   │   ├── core/            ← Config + DB
│   │   └── services/        ← RAG + Auth
│   └── uploads/
│
└── frontend/
    └── src/
        ├── components/      ← React components
        ├── context/         ← Global state
        ├── services/        ← API client
        └── styles/          ← CSS
```

## Built By
Punith — AI Engineer

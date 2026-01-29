# 🎯 ResuMate AI - Intelligent Resume Analytics Platform

<div align="center">

![ResuMate AI](https://img.shields.io/badge/ResuMate-AI%20Powered-F59E0B?style=for-the-badge&logo=openai&logoColor=white)
![GPT-5.2](https://img.shields.io/badge/GPT-5.2-10B981?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-RAG-3B82F6?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)

**AI-powered resume analysis platform with RAG, voice interaction, and anonymization support.**

[Features](#-features) • [Demo](#-demo) • [Installation](#-installation) • [Deployment](#-deployment) • [Architecture](#-architecture) • [API](#-api-documentation)

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Demo](#-demo)
- [Technology Stack](#-technology-stack)
- [Installation](#-installation)
- [Deployment](#-deployment)
- [Architecture](#-architecture)
- [How It Works](#-how-it-works)
- [API Documentation](#-api-documentation)
- [Configuration](#-configuration)
- [Contributing](#-contributing)

---

## ✨ Features

### 🤖 AI-Powered Analysis
- **GPT-5.2 Integration**: Latest OpenAI model for deep, accurate resume analysis
- **Intelligent Extraction**: Automatically extracts skills, experience, education, and more
- **Smart Summarization**: Generates professional summaries for each candidate
- **Experience Calculation**: Accurately calculates total experience from job history

### 🔍 RAG (Retrieval-Augmented Generation)
- **No Hallucinations**: AI only responds with information from actual resumes
- **ChromaDB Vector Store**: Semantic search across all resume content
- **Context-Aware Responses**: Retrieves relevant resume sections for each query
- **Chunk-Based Processing**: Splits resumes into optimal chunks for precise retrieval

### 🎤 Voice Interaction
- **Speech-to-Text**: Ask questions using your voice (OpenAI Whisper)
- **Text-to-Speech**: AI reads responses aloud (OpenAI TTS)
- **Smart Auto-Speak**: Only speaks when you use voice input
- **Manual Playback**: Click speaker icon on any message to hear it

### 🔒 Privacy & Anonymization
- **Full Anonymization**: Toggle to replace real names with "Candidate 1", "Candidate 2", etc.
- **AI Respects Anonymity**: AI uses anonymous names in responses when enabled
- **Unbiased Review**: Evaluate candidates without name bias
- **Instant Toggle**: Switch between modes anytime

### 📊 Visual Analytics
- **Experience Comparison**: Side-by-side experience visualization
- **Skills Distribution**: Top skills across selected candidates
- **Role Analysis**: Distribution of predicted roles
- **Level Breakdown**: Entry/Junior/Mid/Senior distribution
- **Glassmorphism UI**: Beautiful, modern design with animations

### 💬 Smart Chat Interface
- **Context Memory**: Remembers last 10 conversation exchanges
- **Pronoun Resolution**: "Tell me about him" → refers to last discussed male candidate
- **Informal Queries**: Ask "what about the guys" or "more about her"
- **Follow-up Suggestions**: Context-aware suggested questions
- **Markdown Rendering**: Rich formatted responses with tables and lists

### 📁 File Management
- **Multi-Format Support**: PDF, DOCX, DOC, TXT files
- **Bulk Upload**: Upload 20+ resumes at once
- **Duplicate Detection**: Prevents uploading same file twice
- **Size Limit**: 5MB per file with clear error messages
- **Resume Validation**: Detects and flags non-resume files

### 🎨 User Experience
- **Glassmorphism Design**: Modern, translucent UI elements
- **Cursor Glow Effect**: Interactive cursor lighting
- **Floating Animations**: Subtle motion graphics
- **Responsive Layout**: Works on desktop and tablet
- **Dark Theme**: Easy on the eyes

---

## 🎬 Demo

### Home Page
Beautiful landing page with feature highlights and call-to-action.

### Upload Tab
Drag-and-drop or click to upload resumes. See candidates as cards with key info.

### Analytics Tab
Visual charts comparing experience, skills, and roles across selected candidates.

### AI Chat Tab
Conversational interface to ask anything about your candidates.

---

## 🛠 Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with hooks |
| **Vite** | Fast build tool and dev server |
| **React Router** | Client-side routing |
| **Framer Motion** | Animations and transitions |
| **Lucide React** | Beautiful icon library |
| **Marked** | Markdown parsing for AI responses |
| **Axios** | HTTP client for API calls |

### Backend
| Technology | Purpose |
|------------|---------|
| **FastAPI** | High-performance Python API framework |
| **LangChain** | LLM orchestration and RAG pipeline |
| **ChromaDB** | Vector database for semantic search |
| **OpenAI GPT-5.2** | Large language model for analysis |
| **OpenAI Whisper** | Speech-to-text transcription |
| **OpenAI TTS** | Text-to-speech synthesis |
| **PyPDF** | PDF text extraction |
| **python-docx** | DOCX file processing |

### AI/ML Pipeline
| Component | Technology |
|-----------|------------|
| **Embeddings** | OpenAI text-embedding-3-small |
| **LLM** | GPT-5.2 (gpt-5.2) |
| **Vector Store** | ChromaDB with persistent storage |
| **Text Splitter** | RecursiveCharacterTextSplitter |
| **Speech** | Whisper-1, TTS-1 with Nova voice |

---

## 📦 Installation

### Prerequisites
- Python 3.10+ 
- Node.js 18+
- OpenAI API Key

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/resumate-ai.git
cd resumate-ai
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install
```

### 4. Run Development Servers

**Backend** (Terminal 1):
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

**Frontend** (Terminal 2):
```bash
cd frontend
npm run dev
```

### 5. Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## 🚀 Deployment

### Option 1: Render (Recommended - Free Tier)

#### Backend Deployment

1. **Create Render Account**: https://render.com

2. **Create Web Service**:
   - Connect your GitHub repository
   - Select the `backend` directory
   - Configure:
```
     Name: resumate-api
     Runtime: Python 3
     Build Command: pip install -r requirements.txt
     Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

3. **Add Environment Variables**:
```
   OPENAI_API_KEY=sk-your-key
   CHROMA_DIR=chroma_db
   CHROMA_COLLECTION=resumes
```

#### Frontend Deployment

1. **Create Static Site** on Render:
   - Connect same repository
   - Select `frontend` directory
   - Configure:
```
     Name: resumate-ui
     Build Command: npm install && npm run build
     Publish Directory: dist
```

2. **Add Environment Variable**:
```
   VITE_API_URL=https://resumate-api.onrender.com
```

3. **Update vite.config.js** for production:
```javascript
   export default defineConfig({
     plugins: [react()],
     server: {
       proxy: {
         '/api': {
           target: process.env.VITE_API_URL || 'http://localhost:8000',
           changeOrigin: true
         }
       }
     }
   })
```

### Option 2: Railway (Free Tier)

1. **Create Railway Account**: https://railway.app

2. **Deploy Backend**:
```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login and deploy
   railway login
   cd backend
   railway init
   railway up
```

3. **Deploy Frontend**:
```bash
   cd frontend
   railway init
   railway up
```

### Option 3: Vercel + Render

1. **Frontend on Vercel**:
   - Import GitHub repo to Vercel
   - Set root directory to `frontend`
   - Add `VITE_API_URL` environment variable

2. **Backend on Render**:
   - Follow Render backend steps above

### Option 4: Docker Deployment

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - CHROMA_DIR=/app/chroma_db
    volumes:
      - chroma_data:/app/chroma_db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  chroma_data:
```

**backend/Dockerfile**:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**frontend/Dockerfile**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
```

---

## 🏗 Architecture

### System Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  Landing Page  │  Upload Tab  │  Analytics Tab  │  AI Chat Tab  │
│                │              │                 │               │
│  • Features    │  • Drag/Drop │  • Charts       │  • Messages   │
│  • CTA         │  • Cards     │  • Comparisons  │  • Voice      │
│  • Navigation  │  • Selection │  • Glassmorphism│  • Suggestions│
└────────────────┴──────────────┴─────────────────┴───────────────┘
                                │
                                │ HTTP/REST API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Candidates  │  │    Chat     │  │        Voice            │ │
│  │    API      │  │    API      │  │         API             │ │
│  │             │  │             │  │                         │ │
│  │ • Upload    │  │ • Send      │  │ • Speech-to-Text        │ │
│  │ • List      │  │ • Intro     │  │ • Text-to-Speech        │ │
│  │ • Delete    │  │ • Clear     │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Resume RAG Service                       │  │
│  │                                                           │  │
│  │  • Text Extraction (PDF, DOCX, TXT)                      │  │
│  │  • Resume Validation                                      │  │
│  │  • Name Extraction                                        │  │
│  │  • Chunking (1000 chars, 200 overlap)                    │  │
│  │  • Embedding Generation                                   │  │
│  │  • Context Building                                       │  │
│  │  • Query Understanding                                    │  │
│  │  • Anonymization                                          │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │ ChromaDB │    │  OpenAI  │    │  OpenAI  │
       │ (Vectors)│    │  GPT-5.2 │    │  Whisper │
       │          │    │          │    │   TTS    │
       └──────────┘    └──────────┘    └──────────┘
```

### Data Flow
```
1. UPLOAD FLOW
   User uploads PDF → Extract Text → Validate Resume → Extract Name
   → Chunk Text → Generate Embeddings → Store in ChromaDB → Analyze with GPT
   → Return Structured Data

2. CHAT FLOW
   User Message → Understand Query → Retrieve Relevant Chunks
   → Build Context → Generate Response → Apply Anonymization
   → Return Response + Suggestions

3. VOICE FLOW
   Record Audio → Send to Whisper → Get Transcription → Process as Chat
   → Get Response → Convert to Speech (if voice input) → Play Audio
```

---

## 🔧 How It Works

### 1. Document Processing Pipeline
```python
# Text Extraction
def _extract_text(file_path, file_name):
    if ext == '.pdf':
        loader = PyPDFLoader(file_path)
    elif ext == '.docx':
        loader = Docx2txtLoader(file_path)
    elif ext == '.txt':
        loader = TextLoader(file_path)
    return loader.load()
```

### 2. Chunking Strategy
```python
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,      # Characters per chunk
    chunk_overlap=200,    # Overlap for context continuity
    separators=["\n\n", "\n", ". ", " ", ""]  # Priority split points
)
```

**Why these settings?**
- **1000 chars**: Optimal for embedding models, captures meaningful sections
- **200 overlap**: Ensures context isn't lost at chunk boundaries
- **Separators**: Preserves paragraph and sentence integrity

### 3. Embedding & Storage
```python
# Generate embeddings using OpenAI
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Store in ChromaDB with metadata
vectordb.add_documents([
    Document(
        page_content=chunk,
        metadata={
            "candidate_id": 1,
            "candidate_name": "John Doe",
            "chunk_index": 0,
            "is_resume": True
        }
    )
])
```

### 4. RAG Query Process
```python
# 1. Retrieve relevant chunks
results = vectordb.similarity_search(
    query="Who has Python experience?",
    k=15,  # Top 15 most similar chunks
    filter={"candidate_id": {"$in": [1, 2, 3]}}  # Only selected candidates
)

# 2. Build context from chunks + structured data
context = build_candidate_context(selected_candidates, results)

# 3. Generate response with strict instructions
response = llm.invoke([
    SystemMessage(content=f"Only use this context: {context}"),
    HumanMessage(content=query)
])
```

### 5. Anonymization System
```python
# Create bidirectional mapping
real_to_anon = {"John Doe": "Candidate 1", "John": "Candidate 1"}
anon_to_real = {"Candidate 1": "John Doe", "candidate 1": "John Doe"}

# Replace in context before sending to AI
context = replace_names(context, real_to_anon)

# Replace in response after receiving from AI
response = replace_names(response, real_to_anon)
```

### 6. Experience Calculation Prompt
```python
prompt = """
EXPERIENCE CALCULATION - IMPORTANT:
1. List EACH job with start and end dates
2. Calculate months for EACH job separately
3. If "Present" or "Current", use January 2025 as end
4. Be CONSERVATIVE - if unsure, estimate lower
5. Most people have 0-15 years. 20+ is rare.

Example:
- Job 1: Jan 2020 - Dec 2021 = 24 months
- Job 2: Jan 2022 - Present = 36 months
- Total: 60 months = 5.0 years
"""
```

---

## 📡 API Documentation

### Candidates API

#### Upload Resume
```http
POST /api/candidates/upload
Content-Type: multipart/form-data

file: <resume.pdf>
```

**Response:**
```json
{
  "id": 1,
  "name": "John Doe",
  "file_name": "john_resume.pdf",
  "is_resume": true,
  "summary": "Experienced software engineer...",
  "total_experience_years": 5.5,
  "predicted_role": "Senior Software Engineer",
  "experience_level": "Senior",
  "skills": ["Python", "React", "AWS"],
  "badges": [{"label": "Senior", "color": "blue"}]
}
```

#### Get All Candidates
```http
GET /api/candidates
```

#### Delete Candidate
```http
DELETE /api/candidates/{id}
```

### Chat API

#### Send Message
```http
POST /api/chat/send
Content-Type: application/json

{
  "message": "Who has the most experience?",
  "candidate_ids": [1, 2, 3],
  "anonymize": false
}
```

**Response:**
```json
{
  "response": "**John Doe** has the most experience with 5.5 years...",
  "suggestions": ["Compare their skills", "Tell me about John"],
  "conversation_id": "default"
}
```

#### Get Intro Message
```http
GET /api/chat/intro?candidate_count=3&anonymize=false
```

### Voice API

#### Speech to Text
```http
POST /api/chat/speech-to-text
Content-Type: multipart/form-data

audio: <recording.webm>
```

#### Text to Speech
```http
POST /api/chat/text-to-speech
Content-Type: application/json

{
  "text": "Hello, this is a test.",
  "voice": "nova"
}
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `OPENAI_MODEL` | LLM model to use | `gpt-5.2` |
| `CHROMA_DIR` | ChromaDB storage directory | `chroma_db` |
| `CHROMA_COLLECTION` | Collection name | `resumes` |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

### .env Example
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-5.2
CHROMA_DIR=chroma_db
CHROMA_COLLECTION=resumes
HOST=0.0.0.0
PORT=8000
DEBUG=True
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## 🔐 Security Considerations

1. **API Key Protection**: Never commit `.env` file
2. **File Validation**: Only accepts PDF, DOCX, TXT
3. **Size Limits**: 5MB max file size
4. **Duplicate Prevention**: SHA256 hash checking
5. **Input Sanitization**: All user inputs are validated

---

## 📈 Performance Tips

1. **Chunking**: Adjust `chunk_size` based on your documents
2. **Retrieval**: Tune `k` parameter for similarity search
3. **Caching**: ChromaDB persists embeddings automatically
4. **Batch Upload**: Upload multiple files simultaneously

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [OpenAI](https://openai.com) for GPT-5.2, Whisper, and TTS
- [LangChain](https://langchain.com) for RAG orchestration
- [ChromaDB](https://www.trychroma.com) for vector storage
- [FastAPI](https://fastapi.tiangolo.com) for the backend framework
- [React](https://react.dev) for the frontend framework

---

<div align="center">

**Built with ❤️ by [Your Name]**

[⬆ Back to Top](#-resumate-ai---intelligent-resume-analytics-platform)

</div>
```

---

## 2. GitHub Deployment Files

### `backend/Procfile` (for Render/Heroku)
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### `backend/runtime.txt`
```
python-3.11.7
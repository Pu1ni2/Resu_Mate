# 🎯 ResuMate AI - Intelligent Resume Analytics Platform

<div align="center">

![ResuMate AI](https://img.shields.io/badge/ResuMate-AI%20Powered-F59E0B?style=for-the-badge&logo=openai&logoColor=white)
![GPT-4o](https://img.shields.io/badge/GPT-4o-10B981?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-RAG-3B82F6?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)

**AI-powered resume analysis platform with RAG, voice interaction, and anonymization support.**

🔗 **Live Demo:** [https://resu-mate-ui.onrender.com](https://resu-mate-ui.onrender.com)

[Features](#-features) • [Demo](#-live-demo) • [Installation](#-installation) • [Deployment](#-deployment) • [Architecture](#-architecture) • [API](#-api-documentation)

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Live Demo](#-live-demo)
- [Technology Stack](#-technology-stack)
- [AI Models Used](#-ai-models-used)
- [Installation](#-installation)
- [Deployment](#-deployment)
- [Architecture](#-architecture)
- [How It Works](#-how-it-works)
- [Prompts & System Instructions](#-prompts--system-instructions)
- [API Documentation](#-api-documentation)
- [Configuration](#-configuration)
- [Contributing](#-contributing)

---

## ✨ Features

### 🤖 AI-Powered Analysis
- **GPT-4o Integration**: Latest OpenAI model for deep, accurate resume analysis
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

### 💬 Smart Chat Interface
- **Context Memory**: Remembers last 10 conversation exchanges
- **Pronoun Resolution**: "Tell me about him" → refers to last discussed male candidate
- **Informal Queries**: Ask "what about the guys" or "more about her"
- **Follow-up Suggestions**: Context-aware suggested questions
- **Markdown Rendering**: Rich formatted responses with tables and lists

### 📁 File Management
- **Multi-Format Support**: PDF, DOCX, DOC, TXT files
- **Bulk Upload**: Upload 20+ resumes at once
- **Duplicate Detection**: Prevents uploading same file twice (SHA-256 hash)
- **Size Limit**: 5MB per file with clear error messages
- **Resume Validation**: Detects and flags non-resume files


---

## 🎬 Live Demo

🔗 **Try it now:** [https://resu-mate-ui.onrender.com](https://resu-mate-ui.onrender.com)

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
| **Lucide React** | Beautiful icon library |
| **Marked** | Markdown parsing for AI responses |
| **Axios** | HTTP client for API calls |

### Backend
| Technology | Purpose |
|------------|---------|
| **FastAPI** | High-performance Python API framework |
| **LangChain** | LLM orchestration and RAG pipeline |
| **ChromaDB** | Vector database for semantic search |
| **OpenAI GPT-4o** | Large language model for analysis |
| **OpenAI Whisper** | Speech-to-text transcription |
| **OpenAI TTS** | Text-to-speech synthesis |
| **PyPDF** | PDF text extraction |
| **docx2txt** | DOCX file processing |

### AI/ML Pipeline
| Component | Technology |
|-----------|------------|
| **Embeddings** | OpenAI text-embedding-3-small |
| **LLM** | GPT-4o |
| **Vector Store** | ChromaDB with persistent storage |
| **Text Splitter** | RecursiveCharacterTextSplitter |
| **Speech** | Whisper-1, TTS-1 with Nova voice |

---

## 🤖 AI Models Used

| Model | Purpose | Details |
|-------|---------|---------|
| **GPT-4o** | Resume analysis, Q&A, comparisons | Latest multimodal model, temperature 0.2 |
| **text-embedding-3-small** | Vector embeddings for RAG | 1536 dimensions, optimized for search |
| **Whisper-1** | Speech-to-text | Supports multiple languages |
| **TTS-1** | Text-to-speech | Nova voice, natural sounding |

---

## 📦 Installation

### Prerequisites
- Python 3.11+ 
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

### Render (Recommended - Free Tier)

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
CORS_ORIGINS=https://your-frontend-url.onrender.com
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

2. **Add `_redirects` file** in `frontend/public/`:
```
/*    /index.html   200
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
       │ (Vectors)│    │  GPT-4o  │    │  Whisper │
       │          │    │          │    │   TTS    │
       └──────────┘    └──────────┘    └──────────┘
```

### Data Flow
```
1. UPLOAD FLOW
   User uploads PDF → Extract Text → Validate Resume → Extract Name
   → Check Duplicate (SHA-256) → Chunk Text → Generate Embeddings 
   → Store in ChromaDB → Analyze with GPT-4o → Return Structured Data

2. CHAT FLOW
   User Message → Understand Query → Resolve Pronouns → Retrieve Relevant Chunks
   → Build Context (selected candidates only) → Apply Anonymization (if enabled)
   → Generate Response → Post-process Response → Return Response + Suggestions

3. VOICE FLOW
   Record Audio → Send to Whisper → Get Transcription → Process as Chat
   → Get Response → Convert to Speech (if voice input) → Play Audio
```

---

## 🔧 How It Works

### 1. Document Processing Pipeline
```python
def _extract_text(file_path, file_name):
    """Extract text from various file formats"""
    ext = Path(file_name).suffix.lower()
    
    if ext == '.pdf':
        loader = PyPDFLoader(file_path)
    elif ext in ['.docx', '.doc']:
        loader = Docx2txtLoader(file_path)
    elif ext == '.txt':
        loader = TextLoader(file_path, encoding='utf-8')
    
    docs = loader.load()
    return "\n\n".join([d.page_content for d in docs])
```

### 2. Resume Validation
```python
def _is_valid_resume(text):
    """Check if document is actually a resume"""
    resume_keywords = [
        'experience', 'education', 'skills', 'work', 'employment',
        'university', 'college', 'degree', 'bachelor', 'master', 'phd',
        'developer', 'engineer', 'manager', 'analyst', 'designer',
        'project', 'team', 'company', 'role', 'responsibility',
        'proficient', 'expertise', 'certified', 'intern', 'career'
    ]
    text_lower = text.lower()
    matches = sum(1 for kw in resume_keywords if kw in text_lower)
    return matches >= 4  # At least 4 keywords = valid resume
```

### 3. Duplicate Detection
```python
def _get_file_hash(content: bytes) -> str:
    """Generate SHA-256 hash for duplicate detection"""
    return hashlib.sha256(content).hexdigest()

def check_duplicate(content: bytes) -> Optional[str]:
    file_hash = self._get_file_hash(content)
    if file_hash in self.uploaded_file_hashes:
        return "This file has already been uploaded. Duplicate files are not allowed."
    return None
```

### 4. Chunking Strategy
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

### 5. Embedding & Storage
```python
# Generate embeddings using OpenAI
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small",
    openai_api_key=settings.openai_api_key
)

# Store in ChromaDB with metadata
vectordb.add_documents([
    Document(
        page_content=chunk,
        metadata={
            "candidate_id": candidate_id,
            "candidate_name": name,
            "file_name": file_name,
            "chunk_index": i,
            "is_resume": is_resume
        }
    )
])
```

### 6. RAG Query Process
```python
# 1. Retrieve relevant chunks (only from selected candidates)
results = vectordb.similarity_search(
    query=message,
    k=15,  # Top 15 most similar chunks
    filter={"candidate_id": {"$in": selected_candidate_ids}}
)

# 2. Build context from structured data + chunks
context = build_candidate_context(selected_candidates)

# 3. Generate response with strict instructions
response = await llm.ainvoke(prompt.format_messages())
```

### 7. Anonymization System
```python
def _create_name_mapping(candidate_ids):
    """Create bidirectional name mapping"""
    real_to_anon = {}
    anon_to_real = {}
    
    for idx, cid in enumerate(candidate_ids, 1):
        real_name = candidates[cid]['name']
        anon_name = f"Candidate {idx}"
        
        real_to_anon[real_name] = anon_name
        anon_to_real[anon_name] = real_name
        
        # Also map first names
        first_name = real_name.split()[0]
        real_to_anon[first_name] = anon_name
    
    return real_to_anon, anon_to_real

def _replace_names(text, name_map):
    """Replace all occurrences of names (case-insensitive)"""
    result = text
    sorted_names = sorted(name_map.keys(), key=len, reverse=True)
    for name in sorted_names:
        if name and len(name) > 2:
            pattern = re.compile(re.escape(name), re.IGNORECASE)
            result = pattern.sub(name_map[name], result)
    return result
```

---

## 📝 Prompts & System Instructions

### Resume Analysis Prompt
```python
RESUME_ANALYSIS_PROMPT = """Analyze this resume and extract information accurately.

RESUME:
{resume_text}

EXPERIENCE CALCULATION - IMPORTANT:
1. List EACH job with start and end dates
2. Calculate months for EACH job separately
3. If "Present" or "Current", use January 2025 as end
4. Be CONSERVATIVE - if unsure, estimate lower
5. Most people have 0-15 years. 20+ is rare.

Return ONLY valid JSON:
{{
    "summary": "2-3 sentence summary",
    "total_experience_years": <number between 0-30>,
    "predicted_role": "job title",
    "experience_level": "Entry/Junior/Mid-Level/Senior/Lead",
    "location": "city, country or null",
    "skills": ["skill1", "skill2"],
    "education": [{{"degree": "...", "institution": "...", "year": 2020}}],
    "work_experience": [
        {{
            "title": "job title",
            "company": "company",
            "start_date": "Mon YYYY",
            "end_date": "Mon YYYY or Present",
            "duration_months": <number>
        }}
    ],
    "badges": [{{"label": "...", "color": "blue/green/purple/orange/pink"}}],
    "key_strengths": ["strength1", "strength2"]
}}

BADGES (pick 2-3 most relevant):
- "Senior" (blue): 7+ years experience
- "Experienced" (green): 4-7 years experience
- "Full Stack" (green): Both frontend + backend skills
- "ML/AI" (purple): Machine learning/AI experience
- "Cloud" (blue): AWS/GCP/Azure experience
- "Mobile" (pink): iOS/Android development
- "Data" (purple): Data science/analytics
- "DevOps" (blue): CI/CD, Docker, Kubernetes
- "Leader" (orange): Management/leadership experience
"""
```

### Chat System Prompt
```python
CHAT_SYSTEM_PROMPT = """You are ResuMate AI analyzing ONLY these {num_candidates} selected candidates: {candidate_list}

{anonymization_instruction}

STRICT RULES:
1. ONLY discuss the candidates listed above - no others
2. ONLY use information from the context below
3. If information is missing, say "This information is not available in [Candidate]'s resume"
4. Do NOT mention or reference any candidates not in the list above
5. Be specific with facts, numbers, dates from the provided context

CANDIDATE DATA (ONLY use this information):
{context}

Respond helpfully using **bold** for names and key points."""
```

### Anonymization Instruction (when enabled)
```python
ANONYMIZATION_INSTRUCTION = """
CRITICAL - ANONYMIZATION MODE IS ON:
- ONLY use "Candidate 1", "Candidate 2", etc. - NEVER use real names
- Replace any real name with the corresponding Candidate number
- If you don't know which candidate, say "one of the candidates"
"""
```

### Query Understanding Prompt
```python
QUERY_UNDERSTANDING_PROMPT = """Understand this user query about resume/candidate analysis.

User message: "{message}"

Available candidates: {candidate_names}
Recently discussed: {recent_candidates}

Determine:
1. Is this about resumes/candidates? (yes/no)
2. Which candidates is the user asking about?
3. What do they want to know?

Rules for pronoun resolution:
- "guys/men/males" = male candidates
- "girls/women/females" = female candidates  
- "them/they/their" = recently discussed candidates (last 2-3)
- "he/him/his" = last discussed male candidate
- "she/her" = last discussed female candidate
- "candidate 1", "candidate 2" etc = specific anonymous candidates
- "more about X" / "what was X" = find candidate with name X
- "all/everyone" = all selected candidates

Return JSON only:
{{
    "is_resume_related": true/false,
    "candidate_names": ["name1", "name2"] or ["all"] or [],
    "intent": "what user wants to know",
    "rephrased_query": "clear version of the query"
}}"""
```

### Non-Resume Response
```python
NON_RESUME_RESPONSE = """I'm **ResuMate AI**, your resume analysis assistant. I can only help with questions about uploaded candidates.

**I can help with:**
• Candidate profiles and skills
• Comparing candidates  
• Finding best fits for roles
• Experience and education details

Please ask about your candidates! 😊"""
```

### Intro Message (with candidates)
```python
INTRO_MESSAGE = """**Welcome to ResuMate AI!** 👋

I'm your resume analysis assistant. I can **only** help with questions about the **selected** candidates.

**I can help with:**
• Candidate profiles and skills
• Comparing candidates
• Finding best fits for roles
• Experience and education details

---

**Analyzing {candidate_count} selected candidate(s)!** 🎯{anonymization_note}

Ask me anything! Examples:
• "tell me about {example_name}"
• "who has most experience?"
• "compare their skills"

What would you like to know?"""
```

### Intro Message (no candidates)
```python
INTRO_MESSAGE_EMPTY = """**Welcome to ResuMate AI!** 👋

I'm your resume analysis assistant powered by **GPT-4o**.

⚠️ **Important:** I can ONLY help with questions about uploaded resumes and candidates.

**I can help with:**
• Analyzing candidate profiles and skills
• Comparing multiple candidates
• Finding best fits for specific roles
• Experience and education details

**To start:**
1. Go to **Upload** tab
2. Upload resumes (PDF, DOCX, TXT - max 5MB)
3. Select candidates
4. Come back here to chat!"""
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
  "file_hash": "a1b2c3...",
  "is_resume": true,
  "summary": "Experienced software engineer with 5 years...",
  "total_experience_years": 5.5,
  "predicted_role": "Senior Software Engineer",
  "experience_level": "Senior",
  "location": "San Francisco, CA",
  "skills": ["Python", "React", "AWS", "Docker"],
  "education": [{"degree": "BS Computer Science", "institution": "Stanford", "year": 2018}],
  "work_experience": [
    {
      "title": "Senior Software Engineer",
      "company": "Google",
      "start_date": "Jan 2020",
      "end_date": "Present",
      "duration_months": 60
    }
  ],
  "badges": [{"label": "Senior", "color": "blue"}, {"label": "Full Stack", "color": "green"}],
  "key_strengths": ["System Design", "Team Leadership"]
}
```

#### Get All Candidates
```http
GET /api/candidates
```

#### Delete Single Candidate
```http
DELETE /api/candidates/{id}
```

#### Delete All Candidates
```http
DELETE /api/candidates
```

### Chat API

#### Send Message
```http
POST /api/chat/send
Content-Type: application/json

{
  "message": "Who has the most experience?",
  "candidate_ids": [1, 2, 3],
  "conversation_id": "default",
  "anonymize": false
}
```

**Response:**
```json
{
  "response": "**John Doe** has the most experience with 5.5 years...",
  "suggestions": ["Compare their skills", "Tell me about John's projects"],
  "conversation_id": "default"
}
```

#### Get Intro Message
```http
GET /api/chat/intro?candidate_count=3&anonymize=false
```

#### Clear Chat History
```http
DELETE /api/chat/clear
```

### Voice API

#### Speech to Text
```http
POST /api/chat/speech-to-text
Content-Type: multipart/form-data

audio: <recording.webm>
```

**Response:**
```json
{
  "text": "Who has Python experience?",
  "error": null
}
```

#### Text to Speech
```http
POST /api/chat/text-to-speech
Content-Type: application/json

{
  "text": "John has 5 years of Python experience.",
  "voice": "nova"
}
```

**Response:** Audio file (audio/mpeg)

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `OPENAI_MODEL` | LLM model to use | `gpt-4o` |
| `CHROMA_DIR` | ChromaDB storage directory | `chroma_db` |
| `CHROMA_COLLECTION` | Collection name | `resumes` |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

### .env Example
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o
CHROMA_DIR=chroma_db
CHROMA_COLLECTION=resumes
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=http://localhost:3000,https://your-frontend.onrender.com
```

---

## 🔐 Security Considerations

1. **API Key Protection**: Never commit `.env` file
2. **File Validation**: Only accepts PDF, DOCX, TXT
3. **Size Limits**: 5MB max file size
4. **Duplicate Prevention**: SHA-256 hash checking
5. **Input Sanitization**: All user inputs validated via Pydantic
6. **CORS**: Configured to allow only specific origins

---

## 📁 Project Structure

```
resumate-ai/
├── README.md
├── .gitignore
│
├── backend/
│   ├── main.py                 # FastAPI app entry
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example           # Environment template
│   └── app/
│       ├── api/
│       │   ├── candidates.py   # Upload, list, delete endpoints
│       │   └── chat.py         # Chat, voice endpoints
│       ├── core/
│       │   └── config.py       # Settings management
│       └── services/
│           ├── auth.py         # Authentication
│           └── resume_rag.py   # RAG service (main logic)
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   └── _redirects          # SPA routing for Render
    └── src/
        ├── main.jsx            # React entry
        ├── App.jsx             # Router setup
        ├── context/
        │   └── AppContext.jsx  # Global state management
        ├── components/
        │   ├── Landing.jsx     # Home page
        │   └── Dashboard.jsx   # Main app (upload, analytics, chat)
        ├── services/
        │   └── api.js          # Axios API client
        └── styles/
            └── global.css      # All styles (glassmorphism, animations)
```

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

- [OpenAI](https://openai.com) for GPT-4o, Whisper, and TTS
- [LangChain](https://langchain.com) for RAG orchestration
- [ChromaDB](https://www.trychroma.com) for vector storage
- [FastAPI](https://fastapi.tiangolo.com) for the backend framework
- [React](https://react.dev) for the frontend framework
- [Render](https://render.com) for hosting

---

<div align="center">

**Built with ❤️ by Sai Punith Kolla**

🔗 [Live Demo](https://resu-mate-ui.onrender.com)

[⬆ Back to Top](#-resumate-ai---intelligent-resume-analytics-platform)

</div>
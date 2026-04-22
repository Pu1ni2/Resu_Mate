import os
import shutil
import json
import hashlib
import re
from typing import List, Dict, Optional, Set, Tuple
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage
from langchain_core.documents import Document

from app.core.config import settings

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


class ResumeRAGService:
    def __init__(self):
        self.chroma_dir = settings.chroma_dir
        self.collection_name = settings.chroma_collection
        self.embeddings = None
        self.llm = None
        self.vectordb = None
        self.candidates: Dict[int, Dict] = {}
        self.candidate_counter = 0
        self.recently_discussed: List[str] = []
        self.uploaded_file_hashes: Set[str] = set()
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
        self._init_services()
    
    def _init_services(self):
        """Initialize OpenAI and ChromaDB services"""
        if not settings.openai_api_key:
            print("Warning: OpenAI API key not set")
            return
        
        try:
            # Initialize embeddings with correct parameters
            self.embeddings = OpenAIEmbeddings(
                model="text-embedding-3-small",
                openai_api_key=settings.openai_api_key  # Changed from openai_api_key
            )
            
            # Initialize LLM
            self.llm = ChatOpenAI(
                model=settings.openai_model,
                temperature=0.2,
                openai_api_key=settings.openai_api_key  # Changed from openai_api_key
            )
            
            self._init_vectordb()
            print("✅ OpenAI services initialized successfully")
            
        except Exception as e:
            print(f"❌ Error initializing services: {e}")
            self.embeddings = None
            self.llm = None


    
    def _init_vectordb(self):
        """Initialize ChromaDB vector store.

        ChromaDB on Windows is unstable — the Rust bindings panic on schema
        mismatches and langchain-chroma raises KeyError on embedding-config
        mismatches. Both failures are non-fatal for auth/chat-without-RAG, so
        we catch BaseException (PanicException inherits from BaseException)
        and fall back to vectordb=None. App continues to boot.
        """
        if not self.embeddings:
            return

        os.makedirs(self.chroma_dir, exist_ok=True)

        def _clear_chroma_singletons():
            """Drop cached chromadb clients so a wiped directory doesn't leave stale state."""
            try:
                from chromadb.api.shared_system_client import SharedSystemClient
                SharedSystemClient.clear_system_cache()
            except Exception:
                pass

        def _open():
            return Chroma(
                collection_name=self.collection_name,
                persist_directory=self.chroma_dir,
                embedding_function=self.embeddings,
            )

        # First attempt — open existing store.
        try:
            self.vectordb = _open()
            print(f"✅ ChromaDB initialized at {self.chroma_dir}")
            return
        except BaseException as e:
            print(f"⚠️ ChromaDB open failed ({type(e).__name__}: {e}); resetting store.")

        # Second attempt — wipe directory + clear singletons, then open fresh.
        try:
            _clear_chroma_singletons()
            shutil.rmtree(self.chroma_dir, ignore_errors=True)
            os.makedirs(self.chroma_dir, exist_ok=True)
            _clear_chroma_singletons()
            self.vectordb = _open()
            print(f"✅ ChromaDB re-initialized at {self.chroma_dir} (fresh store)")
            return
        except BaseException as e:
            print(f"⚠️ ChromaDB fresh-open failed ({type(e).__name__}: {e}); disabling vector store.")

        # Give up — the app boots without RAG. Upload/chat-with-RAG will be disabled
        # until chromadb is reinstalled (see requirements.txt: chromadb<0.6.0).
        self.vectordb = None
        print("❌ ChromaDB disabled — run: pip uninstall -y chromadb chromadb-rust-bindings langchain-chroma && pip install -r requirements.txt")
    
    # ... rest of the file remains the same ...
    
    def _get_file_hash(self, content: bytes) -> str:
        """Generate hash of file content"""
        return hashlib.sha256(content).hexdigest()
    
    def check_file_size(self, file_size: int) -> Optional[str]:
        if file_size > MAX_FILE_SIZE:
            return f"File size exceeds limit. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB, Your file: {file_size / (1024*1024):.2f}MB"
        return None
    
    def check_duplicate(self, content: bytes) -> Optional[str]:
        file_hash = self._get_file_hash(content)
        if file_hash in self.uploaded_file_hashes:
            return "This file has already been uploaded. Duplicate files are not allowed."
        return None
    
    def register_file(self, content: bytes):
        file_hash = self._get_file_hash(content)
        self.uploaded_file_hashes.add(file_hash)
        return file_hash
    
    def unregister_file(self, file_hash: str):
        """Remove file hash when candidate is deleted"""
        if file_hash in self.uploaded_file_hashes:
            self.uploaded_file_hashes.discard(file_hash)
    
    def delete_candidate(self, candidate_id: int):
        """Delete a candidate and remove their file hash"""
        if candidate_id in self.candidates:
            candidate = self.candidates[candidate_id]
        
        # Remove file hash if stored
            if 'file_hash' in candidate:
              self.unregister_file(candidate['file_hash'])
        
        # Remove from candidates
        del self.candidates[candidate_id]

    def clear_all(self):
        """Clear ALL data"""
        self.candidates = {}
        self.candidate_counter = 0
        self.recently_discussed = []
        self.uploaded_file_hashes = set()  # Clear ALL hashes
    
    # Clear ChromaDB
        if os.path.exists(self.chroma_dir):
            try:
                shutil.rmtree(self.chroma_dir)
            except Exception as e:
                print(f"Error clearing ChromaDB: {e}")
    
        self._init_vectordb()
        print("✅ All data cleared")

    def _extract_text(self, file_path: str, file_name: str) -> str:
        ext = Path(file_name).suffix.lower()
        try:
            if ext == '.pdf':
                loader = PyPDFLoader(file_path)
                docs = loader.load()
                return "\n\n".join([d.page_content for d in docs])
            elif ext in ['.docx', '.doc']:
                loader = Docx2txtLoader(file_path)
                docs = loader.load()
                return "\n\n".join([d.page_content for d in docs])
            elif ext == '.txt':
                loader = TextLoader(file_path, encoding='utf-8')
                docs = loader.load()
                return "\n\n".join([d.page_content for d in docs])
            else:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
        except Exception as e:
            print(f"Error extracting text: {e}")
            return ""
    
    def _extract_embedded_links(self, file_path: str, file_name: str) -> dict:
        """Extract embedded hyperlinks from PDF using PyMuPDF"""
        links = {
            "all_urls": [],
            "github_url": None,
            "linkedin_url": None,
            "portfolio_url": None,
            "email": None
        }
        
        ext = Path(file_name).suffix.lower()
        if ext != '.pdf':
            return links
        
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            
            for page in doc:
                # Get all links from the page
                for link in page.get_links():
                    uri = link.get("uri", "")
                    if not uri:
                        continue
                    
                    links["all_urls"].append(uri)
                    print(f"📎 Found embedded link: {uri}")
                    
                    # Categorize the link
                    uri_lower = uri.lower()
                    if 'github.com' in uri_lower and not links["github_url"]:
                        links["github_url"] = uri
                    elif 'linkedin.com' in uri_lower and not links["linkedin_url"]:
                        links["linkedin_url"] = uri
                    elif uri_lower.startswith('mailto:') and not links["email"]:
                        links["email"] = uri.replace('mailto:', '')
                    elif uri_lower.startswith('http') and not links["portfolio_url"]:
                        # Any other http link could be portfolio
                        if not any(skip in uri_lower for skip in ['github.com', 'linkedin.com', 'google.com', 'mailto:']):
                            links["portfolio_url"] = uri
            
            doc.close()
            print(f"✅ Extracted {len(links['all_urls'])} embedded links from PDF")
            
        except ImportError:
            print("⚠️ PyMuPDF not installed. Run: pip install PyMuPDF")
        except Exception as e:
            print(f"⚠️ Error extracting PDF links: {e}")
        
        return links
    
    def _is_valid_resume(self, text: str) -> bool:
        resume_keywords = [
            'experience', 'education', 'skills', 'work', 'employment',
            'university', 'college', 'degree', 'bachelor', 'master', 'phd',
            'developer', 'engineer', 'manager', 'analyst', 'designer',
            'project', 'team', 'company', 'role', 'responsibility',
            'proficient', 'expertise', 'certified', 'intern', 'career'
        ]
        text_lower = text.lower()
        matches = sum(1 for kw in resume_keywords if kw in text_lower)
        return matches >= 4
    
    def _extract_candidate_name(self, text: str, file_name: str) -> str:
        lines = text.split('\n')[:15]
        for line in lines:
            line = line.strip()
            if len(line) < 2 or len(line) > 50:
                continue
            if '@' in line or 'http' in line.lower():
                continue
            if sum(1 for c in line if c.isdigit()) > 2:
                continue
            skip_words = ['resume', 'cv', 'curriculum', 'vitae', 'profile', 'summary', 'objective', 'contact']
            if any(sw in line.lower() for sw in skip_words):
                continue
            words = line.split()
            if 2 <= len(words) <= 4:
                if all(w[0].isupper() for w in words if len(w) > 1):
                    return line
        
        name = Path(file_name).stem
        name = name.replace('_', ' ').replace('-', ' ')
        for suffix in ['resume', 'cv', 'Resume', 'CV', 'RESUME']:
            name = name.replace(suffix, '')
        name = ' '.join(word.capitalize() for word in name.split() if word)
        return name.strip() or "Unknown Candidate"
    
    async def add_resume(self, file_path: str, file_name: str, file_hash: str = None) -> Dict:
        """Add a resume and store its hash"""
        if not self.vectordb:
            return {"error": "Service not initialized. Check OpenAI API key."}
    
        text = self._extract_text(file_path, file_name)
    
        if not text or len(text) < 50:
          return {"error": "Could not extract text from file"}
        
        # Extract embedded hyperlinks from PDF
        embedded_links = self._extract_embedded_links(file_path, file_name)
    
        is_resume = self._is_valid_resume(text)
        name = self._extract_candidate_name(text, file_name)
    
        self.candidate_counter += 1
        candidate_id = self.candidate_counter
    
        chunks = self.text_splitter.split_text(text)
        documents = []
    
        for i, chunk in enumerate(chunks):
            doc = Document(
                page_content=chunk,
                metadata={
                    "candidate_id": candidate_id,
                    "candidate_name": name,
                    "file_name": file_name,
                    "chunk_index": i,
                    "is_resume": is_resume,
                }
            )
            documents.append(doc)
    
        self.vectordb.add_documents(documents)
        summary_data = await self._analyze_resume(text, name, is_resume)
    
        candidate_data = {
            "id": candidate_id,
            "name": name,
            "file_name": file_name,
            "file_hash": file_hash,
            "is_resume": is_resume,
            "raw_text": text[:1500],
            "text": text[:5000],
            "embedded_links": embedded_links,
            **summary_data
        }
    
        self.candidates[candidate_id] = candidate_data
        return candidate_data
    
    async def _analyze_resume(self, text: str, name: str, is_resume: bool) -> Dict:
        if not is_resume:
            return {
                "summary": f"This file ({name}) does not appear to be a resume.",
                "total_experience_years": 0,
                "predicted_role": "N/A",
                "experience_level": "N/A",
                "location": None,
                "skills": [],
                "education": [],
                "work_experience": [],
                "badges": [{"label": "Not a Resume", "color": "orange"}]
            }
        
        prompt = f"""Analyze this resume and extract information accurately.

RESUME:
{text[:7000]}

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

BADGES (pick 2-3):
- "Senior" (blue): 7+ years
- "Experienced" (green): 4-7 years
- "Full Stack" (green): frontend + backend
- "ML/AI" (purple): machine learning
- "Cloud" (blue): AWS/GCP/Azure
- "Mobile" (pink): iOS/Android
- "Data" (purple): data science
- "DevOps" (blue): CI/CD, Docker
- "Leader" (orange): management"""

        try:
            response = await self.llm.ainvoke([HumanMessage(content=prompt)])
            content = response.content.strip()
            
            if '```' in content:
                parts = content.split('```')
                for part in parts:
                    part = part.strip()
                    if part.startswith('json'):
                        content = part[4:].strip()
                        break
                    elif part.startswith('{'):
                        content = part
                        break
            
            data = json.loads(content)
            
            exp = data.get('total_experience_years', 0)
            if exp > 30:
                data['total_experience_years'] = 30
            elif exp < 0:
                data['total_experience_years'] = 0
                
            return data
            
        except Exception as e:
            print(f"Error analyzing resume: {e}")
            return {
                "summary": f"{name}'s resume",
                "total_experience_years": 0,
                "predicted_role": "Professional",
                "experience_level": "Entry",
                "location": None,
                "skills": [],
                "education": [],
                "work_experience": [],
                "badges": [],
                "key_strengths": []
            }
    
    def get_all_candidates(self) -> List[Dict]:
        return list(self.candidates.values())
    
    def get_candidate(self, candidate_id: int) -> Optional[Dict]:
        return self.candidates.get(candidate_id)
    
    # def delete_candidate(self, candidate_id: int):
    #     if candidate_id in self.candidates:
    #         candidate=self.candidates[candidate_id]
    #         del self.candidates[candidate_id]

    def delete_candidate(self, candidate_id: int):
        """Delete a candidate and remove their file hash so re-upload works"""
        if candidate_id in self.candidates:
            candidate = self.candidates[candidate_id]
        
            # Remove file hash — THIS IS THE KEY FIX
            file_hash = candidate.get('file_hash')
        if file_hash:
            self.uploaded_file_hashes.discard(file_hash)
            print(f"Removed file hash for candidate {candidate_id}")
        
        # Remove from ChromaDB
        if self.vectordb:
            try:
                self.vectordb._collection.delete(
                    where={"candidate_id": candidate_id}
                )
            except:
                pass
        
        del self.candidates[candidate_id]
        print(f"Deleted candidate {candidate_id}")

        
    
    def clear_all(self):
        """Clear ALL data"""
        self.candidates = {}
        self.candidate_counter = 0
        self.recently_discussed = []
        self.uploaded_file_hashes = set()
        if os.path.exists(self.chroma_dir):
            try:
                shutil.rmtree(self.chroma_dir)
            except Exception as e:
                print(f"Error clearing ChromaDB: {e}")
        self._init_vectordb()
        print("All data cleared")  
        
          
    def _create_name_mapping(self, candidate_ids: List[int]) -> Tuple[Dict[str, str], Dict[str, str]]:
        """Create mapping between real names and anonymous names"""
        real_to_anon = {}
        anon_to_real = {}
        
        for idx, cid in enumerate(candidate_ids, 1):
            if cid in self.candidates:
                real_name = self.candidates[cid]['name']
                anon_name = f"Candidate {idx}"
                real_to_anon[real_name] = anon_name
                anon_to_real[anon_name] = real_name
                anon_to_real[f"candidate {idx}"] = real_name  # lowercase version
                
                # Also map first name and parts
                name_parts = real_name.split()
                for part in name_parts:
                    if len(part) > 2:
                        real_to_anon[part] = anon_name
        
        return real_to_anon, anon_to_real
    
    def _replace_names(self, text: str, name_map: Dict[str, str]) -> str:
        """Replace names in text using the mapping"""
        result = text
        # Sort by length (longer names first) to avoid partial replacements
        sorted_names = sorted(name_map.keys(), key=len, reverse=True)
        for name in sorted_names:
            if name and len(name) > 2:
                pattern = re.compile(re.escape(name), re.IGNORECASE)
                result = pattern.sub(name_map[name], result)
        return result
    
    async def chat(
        self,
        message: str,
        candidate_ids: List[int],
        conversation_history: List[Dict] = None,
        anonymize: bool = False
    ) -> Dict:
        
        if not self.vectordb or not self.llm:
            return {
                "response": "**Error:** Service not initialized. Check OpenAI API key.",
                "suggestions": []
            }
        
        # IMPORTANT: Only use selected candidates
        selected_candidates = [self.candidates[cid] for cid in candidate_ids if cid in self.candidates]
        resume_candidates = [c for c in selected_candidates if c.get("is_resume", True)]
        
        if not resume_candidates:
            return {
                "response": "Please select at least one candidate. Go to **Upload** tab and click on candidates to select them.",
                "suggestions": ["Upload some resumes first"]
            }
        
        # Create name mappings
        real_to_anon, anon_to_real = self._create_name_mapping(candidate_ids)
        
        # Get ALL real names (for filtering out unselected candidates)
        all_real_names = set()
        for c in self.candidates.values():
            all_real_names.add(c['name'])
            for part in c['name'].split():
                if len(part) > 2:
                    all_real_names.add(part)
        
        # Get selected real names
        selected_real_names = set()
        for c in resume_candidates:
            selected_real_names.add(c['name'])
            for part in c['name'].split():
                if len(part) > 2:
                    selected_real_names.add(part)
        
        # Build context ONLY from selected candidates
        context_parts = []
        
        for idx, cid in enumerate(candidate_ids, 1):
            if cid not in self.candidates:
                continue
            c = self.candidates[cid]
            if not c.get("is_resume", True):
                continue
                
            display_name = f"Candidate {idx}" if anonymize else c['name']
            
            ctx = f"\n{'='*40}\n## {display_name}\n{'='*40}\n"
            ctx += f"**Role:** {c.get('predicted_role', 'N/A')} | **Level:** {c.get('experience_level', 'N/A')}\n"
            ctx += f"**Experience:** {c.get('total_experience_years', 0)} years\n"
            
            if c.get('location'):
                ctx += f"**Location:** {c['location']}\n"
            
            summary = c.get('summary', 'N/A')
            if anonymize:
                summary = self._replace_names(summary, real_to_anon)
            ctx += f"\n**Summary:** {summary}\n"
            
            if c.get('key_strengths'):
                ctx += f"**Strengths:** {', '.join(c['key_strengths'])}\n"
            
            if c.get('skills'):
                ctx += f"**Skills:** {', '.join(c['skills'][:15])}\n"
            
            if c.get('work_experience'):
                ctx += "\n**Work History:**\n"
                for exp in c['work_experience'][:5]:
                    dur = exp.get('duration_months', 0)
                    dur_str = f"{dur} months" if dur else "N/A"
                    ctx += f"• {exp.get('title')} at {exp.get('company')} ({exp.get('start_date', '?')} - {exp.get('end_date', '?')}, {dur_str})\n"
            
            if c.get('education'):
                ctx += "\n**Education:**\n"
                for edu in c['education'][:3]:
                    ctx += f"• {edu.get('degree')} - {edu.get('institution')}\n"
            
            if c.get('badges'):
                ctx += f"\n**Badges:** {', '.join(b['label'] for b in c['badges'])}\n"
            
            context_parts.append(ctx)
        
        # Build display names for system prompt
        if anonymize:
            candidate_list = ', '.join(f"Candidate {i+1}" for i in range(len(resume_candidates)))
        else:
            candidate_list = ', '.join(c['name'] for c in resume_candidates)
        
        context = "\n".join(context_parts)
        
        # System prompt - STRICT instructions
        anon_instruction = ""
        if anonymize:
            anon_instruction = """
CRITICAL - ANONYMIZATION MODE IS ON:
- ONLY use "Candidate 1", "Candidate 2", etc. - NEVER use real names
- Replace any real name with the corresponding Candidate number
- If you don't know which candidate, say "one of the candidates"
"""
        
        system_prompt = f"""You are ResuMate AI analyzing ONLY these {len(resume_candidates)} selected candidates: {candidate_list}
{anon_instruction}
STRICT RULES:
1. ONLY discuss the candidates listed above - no others
2. ONLY use information from the context below
3. If information is missing, say "This information is not available in [Candidate]'s resume"
4. Do NOT mention or reference any candidates not in the list above
5. Be specific with facts, numbers, dates from the provided context

CANDIDATE DATA (ONLY use this information):
{context}

Respond helpfully using **bold** for names and key points."""

        messages_list = [("system", system_prompt)]
        
        # Add conversation history (but filter it if anonymize changed)
        if conversation_history:
            for msg in conversation_history[-20:]:
                role = "assistant" if msg.get("role") == "assistant" else "human"
                content = msg.get("content", "")
                # If anonymize is on, replace any real names in history
                if anonymize:
                    content = self._replace_names(content, real_to_anon)
                messages_list.append((role, content))
        
        messages_list.append(("human", message))
        
        try:
            prompt = ChatPromptTemplate.from_messages(messages_list)
            response = await self.llm.ainvoke(prompt.format_messages())
            response_text = response.content
            
            # If anonymize is ON, ensure no real names leak through
            if anonymize:
                response_text = self._replace_names(response_text, real_to_anon)
                # Double check - remove any names not in our mapping
                for name in all_real_names - selected_real_names:
                    if name.lower() in response_text.lower():
                        pattern = re.compile(re.escape(name), re.IGNORECASE)
                        response_text = pattern.sub("[Candidate]", response_text)
            
            # Update recently discussed
            if anonymize:
                mentioned = [f"Candidate {candidate_ids.index(c['id']) + 1}" for c in resume_candidates]
            else:
                mentioned = [c['name'] for c in resume_candidates]
            self.recently_discussed = mentioned[-10:]
            
        except Exception as e:
            response_text = f"**Error:** {str(e)}"
        
        suggestions = self._generate_suggestions(resume_candidates, anonymize, candidate_ids)
        
        return {"response": response_text, "suggestions": suggestions}
    
    def _generate_suggestions(self, candidates: List[Dict], anonymize: bool, all_candidate_ids: List[int]) -> List[str]:
        if anonymize:
            names = [f"Candidate {all_candidate_ids.index(c['id']) + 1}" for c in candidates if c['id'] in all_candidate_ids]
        else:
            names = [c['name'] for c in candidates]
        
        if not names:
            return ["Upload some resumes"]
        
        if len(names) == 1:
            n = names[0]
            return [
                f"What are {n}'s strengths?",
                f"Tell me more about {n}",
                f"Any concerns about {n}?",
                "Compare with others"
            ]
        else:
            return [
                "Compare all candidates",
                "Who has most experience?",
                "Compare their skills",
                "Best fit for senior role?"
            ]
    
    def get_intro_message(self, candidate_count: int, anonymize: bool = False) -> Dict:
        if candidate_count == 0:
            return {
                "response": """**Welcome to ResuMate AI!** 👋

I'm your resume analysis assistant powered by **GPT-5.2**.

⚠️ **Important:** I can ONLY help with questions about uploaded resumes and candidates.

**I can help with:**
- Analyzing candidate profiles and skills
- Comparing multiple candidates
- Finding best fits for specific roles
- Experience and education details

**To start:**
1. Go to **Upload** tab
2. Upload resumes (PDF, DOCX, TXT - max 5MB)
3. Select candidates
4. Come back here to chat!""",
                "suggestions": ["What can you do?", "How many resumes can I upload?"]
            }
        
        anon_note = ""
        example_name = "candidate 1" if anonymize else "ravi"
        if anonymize:
            anon_note = "\n\n🔒 **Anonymization is ON** - I'll refer to candidates as Candidate 1, Candidate 2, etc."
        
        return {
            "response": f"""**Welcome to ResuMate AI!** 👋

I'm your resume analysis assistant. I can **only** help with questions about the **selected** candidates.

**I can help with:**
- Candidate profiles and skills
- Comparing candidates
- Finding best fits for roles
- Experience and education details

---

**Analyzing {candidate_count} selected candidate{'s' if candidate_count > 1 else ''}!** 🎯{anon_note}

Ask me anything! Examples:
- "tell me about {example_name}"
- "who has most experience?"
- "compare their skills"

What would you like to know?""",
            "suggestions": [
                "Overview of all candidates",
                "Who has most experience?",
                "Compare their skills",
                "Best fit for senior role?"
            ]
        }


# Create singleton instance
resume_rag = ResumeRAGService()
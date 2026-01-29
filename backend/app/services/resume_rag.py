# # # """
# # # Resume RAG Service using LangChain + ChromaDB
# # # - Handles multiple resumes (20+)
# # # - Context-aware chat with memory
# # # - Validates resumes vs random files
# # # - Proper name extraction
# # # - Follow-up suggestions
# # # """
# # # import os
# # # import shutil
# # # import json
# # # from typing import List, Dict, Optional
# # # from pathlib import Path

# # # from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
# # # from langchain_text_splitters import RecursiveCharacterTextSplitter
# # # from langchain_openai import OpenAIEmbeddings, ChatOpenAI
# # # from langchain_chroma import Chroma
# # # from langchain_core.prompts import ChatPromptTemplate
# # # from langchain_core.messages import HumanMessage, AIMessage
# # # from langchain_core.documents import Document

# # # from app.core.config import settings

# # # class ResumeRAGService:
# # #     def __init__(self):
# # #         self.chroma_dir = settings.chroma_dir
# # #         self.collection_name = settings.chroma_collection
# # #         self.embeddings = None
# # #         self.llm = None
# # #         self.vectordb = None
# # #         self.candidates = {}  # candidate_id -> metadata
# # #         self.candidate_counter = 0
# # #         self.chat_history = []  # Global chat history for context
# # #         self.last_mentioned_candidate = None  # Track for he/she references
        
# # #         self.text_splitter = RecursiveCharacterTextSplitter(
# # #             chunk_size=1000,
# # #             chunk_overlap=200,
# # #             separators=["\n\n", "\n", ". ", " ", ""]
# # #         )
        
# # #         self._init_services()
    
# # #     def _init_services(self):
# # #         """Initialize OpenAI and ChromaDB"""
# # #         if not settings.openai_api_key:
# # #             print("Warning: OpenAI API key not set")
# # #             return
        
# # #         self.embeddings = OpenAIEmbeddings(
# # #             model="text-embedding-3-small",
# # #             openai_api_key=settings.openai_api_key
# # #         )
        
# # #         self.llm = ChatOpenAI(
# # #             model=settings.openai_model,
# # #             temperature=0.3,
# # #             openai_api_key=settings.openai_api_key
# # #         )
        
# # #         self._init_vectordb()
    
# # #     def _init_vectordb(self):
# # #         """Initialize or load ChromaDB"""
# # #         if not self.embeddings:
# # #             return
            
# # #         os.makedirs(self.chroma_dir, exist_ok=True)
        
# # #         self.vectordb = Chroma(
# # #             collection_name=self.collection_name,
# # #             persist_directory=self.chroma_dir,
# # #             embedding_function=self.embeddings
# # #         )
    
# # #     def _extract_text(self, file_path: str, file_name: str) -> str:
# # #         """Extract text from PDF, DOCX, or TXT"""
# # #         ext = Path(file_name).suffix.lower()
        
# # #         try:
# # #             if ext == '.pdf':
# # #                 loader = PyPDFLoader(file_path)
# # #                 docs = loader.load()
# # #                 return "\n\n".join([d.page_content for d in docs])
# # #             elif ext in ['.docx', '.doc']:
# # #                 loader = Docx2txtLoader(file_path)
# # #                 docs = loader.load()
# # #                 return "\n\n".join([d.page_content for d in docs])
# # #             elif ext == '.txt':
# # #                 loader = TextLoader(file_path, encoding='utf-8')
# # #                 docs = loader.load()
# # #                 return "\n\n".join([d.page_content for d in docs])
# # #             else:
# # #                 with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
# # #                     return f.read()
# # #         except Exception as e:
# # #             print(f"Error extracting text: {e}")
# # #             return ""
    
# # #     def _is_valid_resume(self, text: str) -> bool:
# # #         """Check if document looks like a resume"""
# # #         resume_keywords = [
# # #             'experience', 'education', 'skills', 'work', 'employment',
# # #             'university', 'college', 'degree', 'bachelor', 'master', 'phd',
# # #             'developer', 'engineer', 'manager', 'analyst', 'designer',
# # #             'project', 'team', 'company', 'role', 'responsibility',
# # #             'proficient', 'expertise', 'certified', 'qualification',
# # #             'intern', 'job', 'position', 'career', 'professional'
# # #         ]
# # #         text_lower = text.lower()
# # #         matches = sum(1 for kw in resume_keywords if kw in text_lower)
# # #         return matches >= 4  # Need at least 4 resume-related keywords
    
# # #     def _extract_candidate_name(self, text: str, file_name: str) -> str:
# # #         """Extract candidate name from resume text or filename"""
# # #         # Try first few lines of resume
# # #         lines = text.split('\n')[:15]
# # #         for line in lines:
# # #             line = line.strip()
# # #             if len(line) < 2 or len(line) > 50:
# # #                 continue
# # #             # Skip lines with email, phone, urls
# # #             if '@' in line or 'http' in line.lower():
# # #                 continue
# # #             if any(c.isdigit() for c in line) and len([c for c in line if c.isdigit()]) > 2:
# # #                 continue
# # #             # Skip common headers
# # #             skip_words = ['resume', 'cv', 'curriculum', 'vitae', 'profile', 'summary', 'objective', 'contact']
# # #             if any(sw in line.lower() for sw in skip_words):
# # #                 continue
            
# # #             words = line.split()
# # #             if 2 <= len(words) <= 4:
# # #                 # Check if words look like names (capitalized)
# # #                 if all(w[0].isupper() for w in words if len(w) > 1):
# # #                     return line
        
# # #         # Fallback to filename
# # #         name = Path(file_name).stem
# # #         # Clean filename: Punith_Resume.pdf -> Punith
# # #         name = name.replace('_', ' ').replace('-', ' ')
# # #         # Remove common suffixes
# # #         for suffix in ['resume', 'cv', 'Resume', 'CV', 'RESUME']:
# # #             name = name.replace(suffix, '')
# # #         name = ' '.join(word.capitalize() for word in name.split() if word)
# # #         return name.strip() or "Unknown Candidate"
    
# # #     async def add_resume(self, file_path: str, file_name: str) -> Dict:
# # #         """Process and add a resume to the vector database"""
# # #         if not self.vectordb:
# # #             return {"error": "Service not initialized. Check OpenAI API key."}
        
# # #         text = self._extract_text(file_path, file_name)
        
# # #         if not text or len(text) < 50:
# # #             return {"error": "Could not extract text from file"}
        
# # #         is_resume = self._is_valid_resume(text)
# # #         name = self._extract_candidate_name(text, file_name)
        
# # #         self.candidate_counter += 1
# # #         candidate_id = self.candidate_counter
        
# # #         # Create chunks with metadata
# # #         chunks = self.text_splitter.split_text(text)
# # #         documents = []
        
# # #         for i, chunk in enumerate(chunks):
# # #             doc = Document(
# # #                 page_content=chunk,
# # #                 metadata={
# # #                     "candidate_id": candidate_id,
# # #                     "candidate_name": name,
# # #                     "file_name": file_name,
# # #                     "chunk_index": i,
# # #                     "is_resume": is_resume,
# # #                     "source": "resume" if is_resume else "other"
# # #                 }
# # #             )
# # #             documents.append(doc)
        
# # #         # Add to vectordb
# # #         self.vectordb.add_documents(documents)
        
# # #         # Use LLM to extract structured info
# # #         summary_data = await self._analyze_resume(text, name, is_resume)
        
# # #         # Store candidate info
# # #         candidate_data = {
# # #             "id": candidate_id,
# # #             "name": name,
# # #             "file_name": file_name,
# # #             "is_resume": is_resume,
# # #             "raw_text": text[:1000],
# # #             **summary_data
# # #         }
        
# # #         self.candidates[candidate_id] = candidate_data
        
# # #         return candidate_data
    
# # #     async def _analyze_resume(self, text: str, name: str, is_resume: bool) -> Dict:
# # #         """Use LLM to extract structured info from resume"""
# # #         if not is_resume:
# # #             return {
# # #                 "summary": f"This file ({name}) does not appear to be a resume.",
# # #                 "total_experience_years": 0,
# # #                 "predicted_role": "N/A",
# # #                 "experience_level": "N/A",
# # #                 "location": None,
# # #                 "skills": [],
# # #                 "education": [],
# # #                 "work_experience": [],
# # #                 "badges": [{"label": "Not a Resume", "color": "orange"}]
# # #             }
        
# # #         prompt = f"""Analyze this resume and extract structured information.

# # # RESUME TEXT:
# # # {text[:6000]}

# # # INSTRUCTIONS:
# # # 1. Calculate total experience by adding up EACH job duration (start to end date)
# # # 2. Extract the person's name from the resume content
# # # 3. List all skills mentioned
# # # 4. Extract education details
# # # 5. Extract work experience with durations

# # # Return ONLY valid JSON (no markdown, no explanation):
# # # {{
# # #     "summary": "2-3 sentence professional summary of {name}",
# # #     "total_experience_years": <calculated_number>,
# # #     "predicted_role": "most suitable job title",
# # #     "experience_level": "Entry/Junior/Mid-Level/Senior/Lead/Principal",
# # #     "location": "city, country or null if not found",
# # #     "skills": ["skill1", "skill2", "skill3"],
# # #     "education": [
# # #         {{"degree": "degree name", "institution": "school name", "year": 2020}}
# # #     ],
# # #     "work_experience": [
# # #         {{"title": "job title", "company": "company name", "start": "MM/YYYY", "end": "MM/YYYY or Present", "duration_months": 24}}
# # #     ],
# # #     "badges": [
# # #         {{"label": "badge name", "color": "blue/green/purple/orange/pink"}}
# # #     ]
# # # }}

# # # BADGE RULES (assign 2-4 relevant badges):
# # # - "Veteran" (purple): 10+ years total experience
# # # - "Senior" (blue): 7-10 years experience
# # # - "Experienced" (green): 4-7 years experience
# # # - "Full Stack" (green): has both frontend AND backend skills
# # # - "ML/AI Expert" (purple): machine learning or AI skills
# # # - "Cloud Native" (blue): AWS/GCP/Azure experience
# # # - "Mobile Dev" (pink): iOS/Android/React Native/Flutter
# # # - "Data Expert" (purple): data science, analytics, SQL expertise
# # # - "DevOps" (blue): CI/CD, Docker, Kubernetes
# # # - "Leadership" (orange): management or team lead experience"""

# # #         try:
# # #             response = await self.llm.ainvoke([HumanMessage(content=prompt)])
# # #             content = response.content.strip()
            
# # #             # Clean JSON from markdown
# # #             if '```' in content:
# # #                 content = content.split('```')[1]
# # #                 if content.startswith('json'):
# # #                     content = content[4:]
# # #                 content = content.strip()
            
# # #             data = json.loads(content)
# # #             return data
            
# # #         except Exception as e:
# # #             print(f"Error analyzing resume: {e}")
# # #             return {
# # #                 "summary": f"{name}'s professional resume",
# # #                 "total_experience_years": 0,
# # #                 "predicted_role": "Professional",
# # #                 "experience_level": "Entry",
# # #                 "location": None,
# # #                 "skills": [],
# # #                 "education": [],
# # #                 "work_experience": [],
# # #                 "badges": []
# # #             }
    
# # #     def get_all_candidates(self) -> List[Dict]:
# # #         """Get all stored candidates"""
# # #         return list(self.candidates.values())
    
# # #     def get_candidate(self, candidate_id: int) -> Optional[Dict]:
# # #         """Get specific candidate"""
# # #         return self.candidates.get(candidate_id)
    
# # #     def delete_candidate(self, candidate_id: int):
# # #         """Remove candidate"""
# # #         if candidate_id in self.candidates:
# # #             del self.candidates[candidate_id]
    
# # #     def clear_all(self):
# # #         """Clear all data"""
# # #         self.candidates = {}
# # #         self.candidate_counter = 0
# # #         self.chat_history = []
# # #         self.last_mentioned_candidate = None
        
# # #         if os.path.exists(self.chroma_dir):
# # #             shutil.rmtree(self.chroma_dir)
# # #         self._init_vectordb()
    
# # #     async def chat(
# # #         self,
# # #         message: str,
# # #         candidate_ids: List[int],
# # #         conversation_history: List[Dict] = None
# # #     ) -> Dict:
# # #         """RAG-based chat with context awareness and memory"""
        
# # #         if not self.vectordb or not self.llm:
# # #             return {
# # #                 "response": "**Error:** Service not initialized. Please check your OpenAI API key in the .env file.",
# # #                 "suggestions": []
# # #             }
        
# # #         # Enhance the query using conversation context
# # #         enhanced_message = self._enhance_query(message, conversation_history or [])
        
# # #         # Get selected candidates info
# # #         selected_candidates = [self.candidates[cid] for cid in candidate_ids if cid in self.candidates]
        
# # #         if not selected_candidates:
# # #             return {
# # #                 "response": "Please select at least one candidate to analyze.",
# # #                 "suggestions": ["Upload some resumes first", "Select candidates from the list"]
# # #             }
        
# # #         # Filter only resumes (not random files)
# # #         resume_candidates = [c for c in selected_candidates if c.get("is_resume", True)]
        
# # #         # Retrieve relevant chunks from ChromaDB
# # #         try:
# # #             # Search in vectordb
# # #             results = self.vectordb.similarity_search(
# # #                 enhanced_message,
# # #                 k=15,
# # #                 filter={"candidate_id": {"$in": candidate_ids}} if candidate_ids else None
# # #             )
            
# # #             # Filter to only resume documents
# # #             resume_docs = [doc for doc in results if doc.metadata.get("is_resume", True)]
            
# # #         except Exception as e:
# # #             print(f"Retrieval error: {e}")
# # #             resume_docs = []
        
# # #         # Build context from retrieved docs and candidate summaries
# # #         context_parts = []
        
# # #         # Add candidate summaries
# # #         for c in resume_candidates:
# # #             ctx = f"\n### {c['name']}'s Profile\n"
# # #             ctx += f"**Role:** {c.get('predicted_role', 'N/A')} | **Level:** {c.get('experience_level', 'N/A')} | **Experience:** {c.get('total_experience_years', 0)} years\n"
# # #             if c.get('location'):
# # #                 ctx += f"**Location:** {c['location']}\n"
# # #             ctx += f"**Summary:** {c.get('summary', 'N/A')}\n"
# # #             if c.get('skills'):
# # #                 ctx += f"**Skills:** {', '.join(c['skills'][:15])}\n"
# # #             if c.get('work_experience'):
# # #                 ctx += "**Experience:**\n"
# # #                 for exp in c['work_experience'][:5]:
# # #                     ctx += f"  - {exp.get('title', 'Role')} at {exp.get('company', 'Company')} ({exp.get('start', '')} - {exp.get('end', '')})\n"
# # #             if c.get('education'):
# # #                 ctx += "**Education:**\n"
# # #                 for edu in c['education'][:3]:
# # #                     ctx += f"  - {edu.get('degree', 'Degree')} from {edu.get('institution', 'Institution')}\n"
# # #             context_parts.append(ctx)
        
# # #         # Add relevant chunks
# # #         if resume_docs:
# # #             context_parts.append("\n### Detailed Resume Excerpts:")
# # #             for doc in resume_docs[:10]:
# # #                 cname = doc.metadata.get("candidate_name", "Unknown")
# # #                 context_parts.append(f"\n[{cname}]: {doc.page_content[:500]}")
        
# # #         context = "\n".join(context_parts)
        
# # #         # Build system prompt
# # #         system_prompt = f"""You are ResuMate AI, an expert HR assistant analyzing candidate resumes.

# # # ## YOUR CAPABILITIES
# # # - Analyze and compare candidates in detail
# # # - Find best fits for specific roles
# # # - Answer questions about skills, experience, education
# # # - Provide hiring recommendations

# # # ## CRITICAL RULES
# # # 1. **ONLY use information from the provided context** - never make up facts
# # # 2. If information is NOT in context: "This information is not available in [Name]'s resume"
# # # 3. When user says "he/she/they" without a name, refer to: {self.last_mentioned_candidate or 'the last discussed candidate'}
# # # 4. **Be specific** - use actual names, numbers, dates from resumes
# # # 5. For skill-based questions (e.g., "who has frontend experience"), infer from listed skills AND job titles/descriptions
# # # 6. When comparing, create clear tables or structured comparisons

# # # ## CANDIDATE CONTEXT
# # # {context}

# # # ## RESPONSE FORMAT
# # # - Use **bold** for names and key points
# # # - Use bullet points for lists
# # # - Be concise but thorough
# # # - Always mention which candidate you're discussing"""

# # #         # Build messages
# # #         messages = [("system", system_prompt)]
        
# # #         # Add conversation history for context
# # #         if conversation_history:
# # #             for msg in conversation_history[-8:]:
# # #                 role = "assistant" if msg.get("role") == "assistant" else "human"
# # #                 messages.append((role, msg.get("content", "")))
        
# # #         messages.append(("human", message))
        
# # #         # Get LLM response
# # #         try:
# # #             prompt = ChatPromptTemplate.from_messages(messages)
# # #             response = await self.llm.ainvoke(prompt.format_messages())
# # #             response_text = response.content
            
# # #             # Track mentioned candidates for pronoun resolution
# # #             for c in selected_candidates:
# # #                 if c['name'].lower() in response_text.lower():
# # #                     self.last_mentioned_candidate = c['name']
# # #                     break
            
# # #         except Exception as e:
# # #             response_text = f"**Error generating response:** {str(e)}"
        
# # #         # Generate context-aware suggestions
# # #         suggestions = self._generate_suggestions(message, selected_candidates)
        
# # #         return {
# # #             "response": response_text,
# # #             "suggestions": suggestions
# # #         }
    
# # #     def _enhance_query(self, message: str, history: List[Dict]) -> str:
# # #         """Enhance query with context from history for better retrieval"""
# # #         # Handle pronouns by checking recent history
# # #         pronouns = ['he', 'she', 'they', 'him', 'her', 'his', 'their', 'them']
# # #         message_lower = message.lower()
        
# # #         if any(f" {p} " in f" {message_lower} " for p in pronouns):
# # #             # Look for last mentioned name in history
# # #             for msg in reversed(history[-5:]):
# # #                 content = msg.get("content", "")
# # #                 for cid, candidate in self.candidates.items():
# # #                     if candidate['name'].lower() in content.lower():
# # #                         # Add name context to query
# # #                         return f"{message} (referring to {candidate['name']})"
        
# # #         return message
    
# # #     def _generate_suggestions(self, last_message: str, candidates: List[Dict]) -> List[str]:
# # #         """Generate context-aware follow-up questions"""
# # #         suggestions = []
# # #         msg_lower = last_message.lower()
        
# # #         names = [c['name'] for c in candidates if c.get('is_resume', True)]
        
# # #         if len(names) == 0:
# # #             return ["Upload some resumes to get started"]
        
# # #         # Context-based suggestions
# # #         if 'experience' in msg_lower:
# # #             suggestions.append("Compare their technical skills")
# # #             suggestions.append("Who has leadership experience?")
# # #         elif 'skill' in msg_lower:
# # #             suggestions.append("Who is best for a senior role?")
# # #             suggestions.append("Compare their work history")
# # #         elif 'compare' in msg_lower or 'vs' in msg_lower:
# # #             suggestions.append("Who would you recommend hiring?")
# # #             suggestions.append("What are their salary expectations?")
# # #         elif 'best' in msg_lower or 'fit' in msg_lower:
# # #             suggestions.append("What are the trade-offs between them?")
# # #             suggestions.append("Who has more relevant experience?")
# # #         elif len(names) == 1:
# # #             name = names[0]
# # #             suggestions = [
# # #                 f"What are {name}'s key strengths?",
# # #                 f"Summarize {name}'s work experience",
# # #                 f"What questions should I ask {name}?",
# # #                 f"Any concerns about {name}?"
# # #             ]
# # #         else:
# # #             suggestions = [
# # #                 "Compare all candidates",
# # #                 "Who has the most experience?",
# # #                 "Who is best for a frontend role?",
# # #                 "Rank by technical expertise"
# # #             ]
        
# # #         return suggestions[:4]
    
# # #     def get_intro_message(self, candidate_count: int) -> Dict:
# # #         """Get intro message for chat"""
# # #         if candidate_count == 0:
# # #             return {
# # #                 "response": """**Welcome to ResuMate AI!** 👋

# # # I'm your intelligent hiring assistant powered by **GPT-5.2**.

# # # **To get started:**
# # # 1. Go to the **Upload** tab
# # # 2. Upload candidate resumes (PDF, DOCX, TXT)
# # # 3. Select candidates to analyze
# # # 4. Come back here to chat!

# # # **I can help you:**
# # # • Compare multiple candidates
# # # • Find best fits for specific roles
# # # • Analyze skills and experience
# # # • Answer any questions about candidates""",
# # #                 "suggestions": [
# # #                     "What file types do you support?",
# # #                     "How many resumes can I upload?",
# # #                     "What can you analyze?"
# # #                 ]
# # #             }
        
# # #         return {
# # #             "response": f"""**Ready to analyze {candidate_count} candidate{'s' if candidate_count > 1 else ''}!** 🎯

# # # I've processed the resumes and I'm ready to help you:
# # # • **Compare** candidates side by side
# # # • **Find** the best fit for any role
# # # • **Analyze** specific skills or experience
# # # • **Answer** any questions about the candidates

# # # What would you like to know?""",
# # #             "suggestions": [
# # #                 "Give me an overview of all candidates",
# # #                 "Who has the most experience?",
# # #                 "Compare their technical skills",
# # #                 "Who is best for a senior role?"
# # #             ]
# # #         }


# # # # Singleton instance
# # # resume_rag = ResumeRAGService()
# # """
# # Resume RAG Service using LangChain + ChromaDB
# # - Handles multiple resumes (20+)
# # - Context-aware chat with memory (10+ messages)
# # - Validates resumes vs random files
# # - ONLY answers resume-related questions
# # """
# # import os
# # import shutil
# # import json
# # from typing import List, Dict, Optional
# # from pathlib import Path

# # from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
# # from langchain_text_splitters import RecursiveCharacterTextSplitter
# # from langchain_openai import OpenAIEmbeddings, ChatOpenAI
# # from langchain_chroma import Chroma
# # from langchain_core.prompts import ChatPromptTemplate
# # from langchain_core.messages import HumanMessage, AIMessage
# # from langchain_core.documents import Document

# # from app.core.config import settings

# # class ResumeRAGService:
# #     def __init__(self):
# #         self.chroma_dir = settings.chroma_dir
# #         self.collection_name = settings.chroma_collection
# #         self.embeddings = None
# #         self.llm = None
# #         self.vectordb = None
# #         self.candidates = {}
# #         self.candidate_counter = 0
# #         self.last_mentioned_candidate = None
        
# #         self.text_splitter = RecursiveCharacterTextSplitter(
# #             chunk_size=1000,
# #             chunk_overlap=200,
# #             separators=["\n\n", "\n", ". ", " ", ""]
# #         )
        
# #         self._init_services()
    
# #     def _init_services(self):
# #         if not settings.openai_api_key:
# #             print("Warning: OpenAI API key not set")
# #             return
        
# #         self.embeddings = OpenAIEmbeddings(
# #             model="text-embedding-3-small",
# #             openai_api_key=settings.openai_api_key
# #         )
        
# #         self.llm = ChatOpenAI(
# #             model=settings.openai_model,
# #             temperature=0.3,
# #             openai_api_key=settings.openai_api_key
# #         )
        
# #         self._init_vectordb()
    
# #     def _init_vectordb(self):
# #         if not self.embeddings:
# #             return
# #         os.makedirs(self.chroma_dir, exist_ok=True)
# #         self.vectordb = Chroma(
# #             collection_name=self.collection_name,
# #             persist_directory=self.chroma_dir,
# #             embedding_function=self.embeddings
# #         )
    
# #     def _extract_text(self, file_path: str, file_name: str) -> str:
# #         ext = Path(file_name).suffix.lower()
# #         try:
# #             if ext == '.pdf':
# #                 loader = PyPDFLoader(file_path)
# #                 docs = loader.load()
# #                 return "\n\n".join([d.page_content for d in docs])
# #             elif ext in ['.docx', '.doc']:
# #                 loader = Docx2txtLoader(file_path)
# #                 docs = loader.load()
# #                 return "\n\n".join([d.page_content for d in docs])
# #             elif ext == '.txt':
# #                 loader = TextLoader(file_path, encoding='utf-8')
# #                 docs = loader.load()
# #                 return "\n\n".join([d.page_content for d in docs])
# #             else:
# #                 with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
# #                     return f.read()
# #         except Exception as e:
# #             print(f"Error extracting text: {e}")
# #             return ""
    
# #     def _is_valid_resume(self, text: str) -> bool:
# #         resume_keywords = [
# #             'experience', 'education', 'skills', 'work', 'employment',
# #             'university', 'college', 'degree', 'bachelor', 'master', 'phd',
# #             'developer', 'engineer', 'manager', 'analyst', 'designer',
# #             'project', 'team', 'company', 'role', 'responsibility',
# #             'proficient', 'expertise', 'certified', 'qualification',
# #             'intern', 'job', 'position', 'career', 'professional'
# #         ]
# #         text_lower = text.lower()
# #         matches = sum(1 for kw in resume_keywords if kw in text_lower)
# #         return matches >= 4
    
# #     def _extract_candidate_name(self, text: str, file_name: str) -> str:
# #         lines = text.split('\n')[:15]
# #         for line in lines:
# #             line = line.strip()
# #             if len(line) < 2 or len(line) > 50:
# #                 continue
# #             if '@' in line or 'http' in line.lower():
# #                 continue
# #             if any(c.isdigit() for c in line) and len([c for c in line if c.isdigit()]) > 2:
# #                 continue
# #             skip_words = ['resume', 'cv', 'curriculum', 'vitae', 'profile', 'summary', 'objective', 'contact']
# #             if any(sw in line.lower() for sw in skip_words):
# #                 continue
# #             words = line.split()
# #             if 2 <= len(words) <= 4:
# #                 if all(w[0].isupper() for w in words if len(w) > 1):
# #                     return line
        
# #         name = Path(file_name).stem
# #         name = name.replace('_', ' ').replace('-', ' ')
# #         for suffix in ['resume', 'cv', 'Resume', 'CV', 'RESUME']:
# #             name = name.replace(suffix, '')
# #         name = ' '.join(word.capitalize() for word in name.split() if word)
# #         return name.strip() or "Unknown Candidate"
    
# #     async def add_resume(self, file_path: str, file_name: str) -> Dict:
# #         if not self.vectordb:
# #             return {"error": "Service not initialized. Check OpenAI API key."}
        
# #         text = self._extract_text(file_path, file_name)
        
# #         if not text or len(text) < 50:
# #             return {"error": "Could not extract text from file"}
        
# #         is_resume = self._is_valid_resume(text)
# #         name = self._extract_candidate_name(text, file_name)
        
# #         self.candidate_counter += 1
# #         candidate_id = self.candidate_counter
        
# #         chunks = self.text_splitter.split_text(text)
# #         documents = []
        
# #         for i, chunk in enumerate(chunks):
# #             doc = Document(
# #                 page_content=chunk,
# #                 metadata={
# #                     "candidate_id": candidate_id,
# #                     "candidate_name": name,
# #                     "file_name": file_name,
# #                     "chunk_index": i,
# #                     "is_resume": is_resume,
# #                     "source": "resume" if is_resume else "other"
# #                 }
# #             )
# #             documents.append(doc)
        
# #         self.vectordb.add_documents(documents)
# #         summary_data = await self._analyze_resume(text, name, is_resume)
        
# #         candidate_data = {
# #             "id": candidate_id,
# #             "name": name,
# #             "file_name": file_name,
# #             "is_resume": is_resume,
# #             "raw_text": text[:1000],
# #             **summary_data
# #         }
        
# #         self.candidates[candidate_id] = candidate_data
# #         return candidate_data
    
# #     async def _analyze_resume(self, text: str, name: str, is_resume: bool) -> Dict:
# #         if not is_resume:
# #             return {
# #                 "summary": f"This file ({name}) does not appear to be a resume.",
# #                 "total_experience_years": 0,
# #                 "predicted_role": "N/A",
# #                 "experience_level": "N/A",
# #                 "location": None,
# #                 "skills": [],
# #                 "education": [],
# #                 "work_experience": [],
# #                 "badges": [{"label": "Not a Resume", "color": "orange"}]
# #             }
        
# #         prompt = f"""Analyze this resume and extract structured information.

# # RESUME TEXT:
# # {text[:6000]}

# # INSTRUCTIONS:
# # 1. Calculate total experience by adding up EACH job duration (start to end date)
# # 2. Extract the person's name from the resume content
# # 3. List all skills mentioned
# # 4. Extract education details
# # 5. Extract work experience with durations

# # Return ONLY valid JSON (no markdown, no explanation):
# # {{
# #     "summary": "2-3 sentence professional summary of {name}",
# #     "total_experience_years": <calculated_number>,
# #     "predicted_role": "most suitable job title",
# #     "experience_level": "Entry/Junior/Mid-Level/Senior/Lead/Principal",
# #     "location": "city, country or null if not found",
# #     "skills": ["skill1", "skill2", "skill3"],
# #     "education": [
# #         {{"degree": "degree name", "institution": "school name", "year": 2020}}
# #     ],
# #     "work_experience": [
# #         {{"title": "job title", "company": "company name", "start": "MM/YYYY", "end": "MM/YYYY or Present", "duration_months": 24}}
# #     ],
# #     "badges": [
# #         {{"label": "badge name", "color": "blue/green/purple/orange/pink"}}
# #     ]
# # }}

# # BADGE RULES (assign 2-4 relevant badges):
# # - "Veteran" (purple): 10+ years total experience
# # - "Senior" (blue): 7-10 years experience
# # - "Experienced" (green): 4-7 years experience
# # - "Full Stack" (green): has both frontend AND backend skills
# # - "ML/AI Expert" (purple): machine learning or AI skills
# # - "Cloud Native" (blue): AWS/GCP/Azure experience
# # - "Mobile Dev" (pink): iOS/Android/React Native/Flutter
# # - "Data Expert" (purple): data science, analytics, SQL expertise
# # - "DevOps" (blue): CI/CD, Docker, Kubernetes
# # - "Leadership" (orange): management or team lead experience"""

# #         try:
# #             response = await self.llm.ainvoke([HumanMessage(content=prompt)])
# #             content = response.content.strip()
            
# #             if '```' in content:
# #                 content = content.split('```')[1]
# #                 if content.startswith('json'):
# #                     content = content[4:]
# #                 content = content.strip()
            
# #             data = json.loads(content)
# #             return data
            
# #         except Exception as e:
# #             print(f"Error analyzing resume: {e}")
# #             return {
# #                 "summary": f"{name}'s professional resume",
# #                 "total_experience_years": 0,
# #                 "predicted_role": "Professional",
# #                 "experience_level": "Entry",
# #                 "location": None,
# #                 "skills": [],
# #                 "education": [],
# #                 "work_experience": [],
# #                 "badges": []
# #             }
    
# #     def get_all_candidates(self) -> List[Dict]:
# #         return list(self.candidates.values())
    
# #     def get_candidate(self, candidate_id: int) -> Optional[Dict]:
# #         return self.candidates.get(candidate_id)
    
# #     def delete_candidate(self, candidate_id: int):
# #         if candidate_id in self.candidates:
# #             del self.candidates[candidate_id]
    
# #     def clear_all(self):
# #         self.candidates = {}
# #         self.candidate_counter = 0
# #         self.last_mentioned_candidate = None
        
# #         if os.path.exists(self.chroma_dir):
# #             shutil.rmtree(self.chroma_dir)
# #         self._init_vectordb()
    
# #     def _is_resume_related_question(self, message: str) -> bool:
# #         """Check if the question is related to resumes/candidates"""
# #         resume_keywords = [
# #             'candidate', 'resume', 'cv', 'experience', 'skill', 'education',
# #             'qualification', 'work', 'job', 'role', 'company', 'project',
# #             'compare', 'best', 'fit', 'hire', 'interview', 'strength',
# #             'weakness', 'background', 'profile', 'summary', 'who', 'which',
# #             'recommend', 'suggest', 'tell me about', 'what does', 'how many',
# #             'years', 'degree', 'university', 'college', 'technology', 'tech',
# #             'programming', 'developer', 'engineer', 'analyst', 'manager',
# #             'senior', 'junior', 'lead', 'frontend', 'backend', 'fullstack',
# #             'salary', 'location', 'certification', 'he', 'she', 'they', 'his', 'her'
# #         ]
# #         msg_lower = message.lower()
# #         return any(kw in msg_lower for kw in resume_keywords)
    
# #     async def chat(
# #         self,
# #         message: str,
# #         candidate_ids: List[int],
# #         conversation_history: List[Dict] = None
# #     ) -> Dict:
# #         """RAG-based chat with context awareness and memory"""
        
# #         if not self.vectordb or not self.llm:
# #             return {
# #                 "response": "**Error:** Service not initialized. Please check your OpenAI API key in the .env file.",
# #                 "suggestions": []
# #             }
        
# #         # Check if question is resume-related
# #         if not self._is_resume_related_question(message):
# #             return {
# #                 "response": "I'm **ResuMate AI**, your dedicated resume analysis assistant. I can only help with questions related to the uploaded resumes and candidates.\n\n**I can help you with:**\n- Analyzing candidate profiles\n- Comparing candidates\n- Finding best fits for roles\n- Answering questions about skills, experience, education\n- Providing hiring recommendations\n\nPlease ask me something about your candidates! 😊",
# #                 "suggestions": [
# #                     "Give me an overview of all candidates",
# #                     "Who has the most experience?",
# #                     "Compare their technical skills",
# #                     "Who is best for a senior developer role?"
# #                 ]
# #             }
        
# #         # Enhance the query using conversation context
# #         enhanced_message = self._enhance_query(message, conversation_history or [])
        
# #         # Get selected candidates info
# #         selected_candidates = [self.candidates[cid] for cid in candidate_ids if cid in self.candidates]
        
# #         if not selected_candidates:
# #             return {
# #                 "response": "Please select at least one candidate to analyze. Go to the **Upload** tab and click on candidates to select them.",
# #                 "suggestions": ["Upload some resumes first", "Select candidates from the list"]
# #             }
        
# #         # Filter only resumes
# #         resume_candidates = [c for c in selected_candidates if c.get("is_resume", True)]
        
# #         # Retrieve relevant chunks from ChromaDB
# #         try:
# #             results = self.vectordb.similarity_search(
# #                 enhanced_message,
# #                 k=15,
# #                 filter={"candidate_id": {"$in": candidate_ids}} if candidate_ids else None
# #             )
# #             resume_docs = [doc for doc in results if doc.metadata.get("is_resume", True)]
# #         except Exception as e:
# #             print(f"Retrieval error: {e}")
# #             resume_docs = []
        
# #         # Build context
# #         context_parts = []
# #         for c in resume_candidates:
# #             ctx = f"\n### {c['name']}'s Profile\n"
# #             ctx += f"**Role:** {c.get('predicted_role', 'N/A')} | **Level:** {c.get('experience_level', 'N/A')} | **Experience:** {c.get('total_experience_years', 0)} years\n"
# #             if c.get('location'):
# #                 ctx += f"**Location:** {c['location']}\n"
# #             ctx += f"**Summary:** {c.get('summary', 'N/A')}\n"
# #             if c.get('skills'):
# #                 ctx += f"**Skills:** {', '.join(c['skills'][:15])}\n"
# #             if c.get('work_experience'):
# #                 ctx += "**Experience:**\n"
# #                 for exp in c['work_experience'][:5]:
# #                     ctx += f"  - {exp.get('title', 'Role')} at {exp.get('company', 'Company')} ({exp.get('start', '')} - {exp.get('end', '')})\n"
# #             if c.get('education'):
# #                 ctx += "**Education:**\n"
# #                 for edu in c['education'][:3]:
# #                     ctx += f"  - {edu.get('degree', 'Degree')} from {edu.get('institution', 'Institution')}\n"
# #             context_parts.append(ctx)
        
# #         if resume_docs:
# #             context_parts.append("\n### Detailed Resume Excerpts:")
# #             for doc in resume_docs[:10]:
# #                 cname = doc.metadata.get("candidate_name", "Unknown")
# #                 context_parts.append(f"\n[{cname}]: {doc.page_content[:500]}")
        
# #         context = "\n".join(context_parts)
        
# #         # System prompt with strict resume-only focus
# #         system_prompt = f"""You are ResuMate AI, an expert HR assistant that ONLY analyzes candidate resumes.

# # ## STRICT RULES - YOU MUST FOLLOW
# # 1. **ONLY answer questions about the uploaded resumes and candidates**
# # 2. If asked about anything NOT related to resumes (weather, coding help, general knowledge, etc.), politely decline and say: "I can only help with questions about the uploaded resumes and candidates. Please ask me something about your candidates!"
# # 3. **ONLY use information from the provided context** - never make up facts
# # 4. If information is NOT in context: "This information is not available in [Name]'s resume"
# # 5. When user says "he/she/they" without a name, refer to: {self.last_mentioned_candidate or 'the last discussed candidate'}
# # 6. **Be specific** - use actual names, numbers, dates from resumes
# # 7. For skill-based questions, infer from listed skills AND job titles/descriptions

# # ## CANDIDATE CONTEXT
# # {context}

# # ## RESPONSE FORMAT
# # - Use **bold** for names and key points
# # - Use bullet points for lists
# # - Be concise but thorough
# # - Always mention which candidate you're discussing"""

# #         # Build messages with FULL conversation history (minimum 10 messages)
# #         messages = [("system", system_prompt)]
        
# #         # Include last 10 conversation exchanges (20 messages)
# #         if conversation_history:
# #             history_to_include = conversation_history[-20:]  # Last 10 exchanges (user + assistant)
# #             for msg in history_to_include:
# #                 role = "assistant" if msg.get("role") == "assistant" else "human"
# #                 messages.append((role, msg.get("content", "")))
        
# #         messages.append(("human", message))
        
# #         # Get LLM response
# #         try:
# #             prompt = ChatPromptTemplate.from_messages(messages)
# #             response = await self.llm.ainvoke(prompt.format_messages())
# #             response_text = response.content
            
# #             # Track mentioned candidates
# #             for c in selected_candidates:
# #                 if c['name'].lower() in response_text.lower():
# #                     self.last_mentioned_candidate = c['name']
# #                     break
            
# #         except Exception as e:
# #             response_text = f"**Error generating response:** {str(e)}"
        
# #         suggestions = self._generate_suggestions(message, selected_candidates)
        
# #         return {
# #             "response": response_text,
# #             "suggestions": suggestions
# #         }
    
# #     def _enhance_query(self, message: str, history: List[Dict]) -> str:
# #         pronouns = ['he', 'she', 'they', 'him', 'her', 'his', 'their', 'them']
# #         message_lower = message.lower()
        
# #         if any(f" {p} " in f" {message_lower} " for p in pronouns):
# #             for msg in reversed(history[-10:]):
# #                 content = msg.get("content", "")
# #                 for cid, candidate in self.candidates.items():
# #                     if candidate['name'].lower() in content.lower():
# #                         return f"{message} (referring to {candidate['name']})"
        
# #         return message
    
# #     def _generate_suggestions(self, last_message: str, candidates: List[Dict]) -> List[str]:
# #         suggestions = []
# #         msg_lower = last_message.lower()
        
# #         names = [c['name'] for c in candidates if c.get('is_resume', True)]
        
# #         if len(names) == 0:
# #             return ["Upload some resumes to get started"]
        
# #         if 'experience' in msg_lower:
# #             suggestions.append("Compare their technical skills")
# #             suggestions.append("Who has leadership experience?")
# #         elif 'skill' in msg_lower:
# #             suggestions.append("Who is best for a senior role?")
# #             suggestions.append("Compare their work history")
# #         elif 'compare' in msg_lower or 'vs' in msg_lower:
# #             suggestions.append("Who would you recommend hiring?")
# #             suggestions.append("What are the trade-offs between them?")
# #         elif 'best' in msg_lower or 'fit' in msg_lower:
# #             suggestions.append("What are their key strengths?")
# #             suggestions.append("Who has more relevant experience?")
# #         elif len(names) == 1:
# #             name = names[0]
# #             suggestions = [
# #                 f"What are {name}'s key strengths?",
# #                 f"Summarize {name}'s work experience",
# #                 f"What questions should I ask {name}?",
# #                 f"Any concerns about {name}?"
# #             ]
# #         else:
# #             suggestions = [
# #                 "Compare all candidates",
# #                 "Who has the most experience?",
# #                 "Who is best for a frontend role?",
# #                 "Rank by technical expertise"
# #             ]
        
# #         return suggestions[:4]
    
# #     def get_intro_message(self, candidate_count: int) -> Dict:
# #         if candidate_count == 0:
# #             return {
# #                 "response": """**Welcome to ResuMate AI!** 👋

# # I'm your dedicated resume analysis assistant powered by **GPT-5.2**.

# # **⚠️ Important:** I can ONLY help with questions about uploaded resumes and candidates. I cannot answer general questions, help with coding, or discuss topics outside of resume analysis.

# # **To get started:**
# # 1. Go to the **Upload** tab
# # 2. Upload candidate resumes (PDF, DOCX, TXT)
# # 3. Select candidates to analyze
# # 4. Come back here to chat!

# # **I can help you:**
# # - Compare multiple candidates
# # - Find best fits for specific roles
# # - Analyze skills and experience
# # - Answer questions about candidates""",
# #                 "suggestions": [
# #                     "What can you help me with?",
# #                     "How many resumes can I upload?",
# #                     "What file types do you support?"
# #                 ]
# #             }
        
# #         return {
# #             "response": f"""**Ready to analyze {candidate_count} candidate{'s' if candidate_count > 1 else ''}!** 🎯

# # I've processed the resumes and I'm ready to help. Remember, I can **only** answer questions about these candidates and their resumes.

# # What would you like to know?""",
# #             "suggestions": [
# #                 "Give me an overview of all candidates",
# #                 "Who has the most experience?",
# #                 "Compare their technical skills",
# #                 "Who is best for a senior role?"
# #             ]
# #         }


# # # Singleton instance
# # resume_rag = ResumeRAGService()

# """
# Resume RAG Service using LangChain + ChromaDB
# """
# import os
# import shutil
# import json
# import hashlib
# from typing import List, Dict, Optional, Set
# from pathlib import Path

# from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
# from langchain_text_splitters import RecursiveCharacterTextSplitter
# from langchain_openai import OpenAIEmbeddings, ChatOpenAI
# from langchain_chroma import Chroma
# from langchain_core.prompts import ChatPromptTemplate
# from langchain_core.messages import HumanMessage
# from langchain_core.documents import Document

# from app.core.config import settings

# MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


# class ResumeRAGService:
#     def __init__(self):
#         self.chroma_dir = settings.chroma_dir
#         self.collection_name = settings.chroma_collection
#         self.embeddings = None
#         self.llm = None
#         self.vectordb = None
#         self.candidates: Dict[int, Dict] = {}
#         self.candidate_counter = 0
#         self.recently_discussed: List[str] = []
#         self.uploaded_file_hashes: Set[str] = set()
        
#         self.text_splitter = RecursiveCharacterTextSplitter(
#             chunk_size=1000,
#             chunk_overlap=200,
#             separators=["\n\n", "\n", ". ", " ", ""]
#         )
        
#         self._init_services()
    
#     def _init_services(self):
#         if not settings.openai_api_key:
#             print("Warning: OpenAI API key not set")
#             return
        
#         self.embeddings = OpenAIEmbeddings(
#             model="text-embedding-3-small",
#             openai_api_key=settings.openai_api_key
#         )
        
#         self.llm = ChatOpenAI(
#             model=settings.openai_model,
#             temperature=0.2,
#             openai_api_key=settings.openai_api_key
#         )
        
#         self._init_vectordb()
    
#     def _init_vectordb(self):
#         if not self.embeddings:
#             return
#         os.makedirs(self.chroma_dir, exist_ok=True)
#         self.vectordb = Chroma(
#             collection_name=self.collection_name,
#             persist_directory=self.chroma_dir,
#             embedding_function=self.embeddings
#         )
    
#     def _get_file_hash(self, content: bytes) -> str:
#         return hashlib.sha256(content).hexdigest()
    
#     def check_file_size(self, file_size: int) -> Optional[str]:
#         if file_size > MAX_FILE_SIZE:
#             return f"File size exceeds limit. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB, Your file: {file_size / (1024*1024):.2f}MB"
#         return None
    
#     def check_duplicate(self, content: bytes) -> Optional[str]:
#         file_hash = self._get_file_hash(content)
#         if file_hash in self.uploaded_file_hashes:
#             return "This file has already been uploaded. Duplicate files are not allowed."
#         return None
    
#     def register_file(self, content: bytes):
#         file_hash = self._get_file_hash(content)
#         self.uploaded_file_hashes.add(file_hash)
    
#     def _extract_text(self, file_path: str, file_name: str) -> str:
#         ext = Path(file_name).suffix.lower()
#         try:
#             if ext == '.pdf':
#                 loader = PyPDFLoader(file_path)
#                 docs = loader.load()
#                 return "\n\n".join([d.page_content for d in docs])
#             elif ext in ['.docx', '.doc']:
#                 loader = Docx2txtLoader(file_path)
#                 docs = loader.load()
#                 return "\n\n".join([d.page_content for d in docs])
#             elif ext == '.txt':
#                 loader = TextLoader(file_path, encoding='utf-8')
#                 docs = loader.load()
#                 return "\n\n".join([d.page_content for d in docs])
#             else:
#                 with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
#                     return f.read()
#         except Exception as e:
#             print(f"Error extracting text: {e}")
#             return ""
    
#     def _is_valid_resume(self, text: str) -> bool:
#         resume_keywords = [
#             'experience', 'education', 'skills', 'work', 'employment',
#             'university', 'college', 'degree', 'bachelor', 'master', 'phd',
#             'developer', 'engineer', 'manager', 'analyst', 'designer',
#             'project', 'team', 'company', 'role', 'responsibility',
#             'proficient', 'expertise', 'certified', 'intern', 'career'
#         ]
#         text_lower = text.lower()
#         matches = sum(1 for kw in resume_keywords if kw in text_lower)
#         return matches >= 4
    
#     def _extract_candidate_name(self, text: str, file_name: str) -> str:
#         lines = text.split('\n')[:15]
#         for line in lines:
#             line = line.strip()
#             if len(line) < 2 or len(line) > 50:
#                 continue
#             if '@' in line or 'http' in line.lower():
#                 continue
#             if sum(1 for c in line if c.isdigit()) > 2:
#                 continue
#             skip_words = ['resume', 'cv', 'curriculum', 'vitae', 'profile', 'summary', 'objective', 'contact']
#             if any(sw in line.lower() for sw in skip_words):
#                 continue
#             words = line.split()
#             if 2 <= len(words) <= 4:
#                 if all(w[0].isupper() for w in words if len(w) > 1):
#                     return line
        
#         name = Path(file_name).stem
#         name = name.replace('_', ' ').replace('-', ' ')
#         for suffix in ['resume', 'cv', 'Resume', 'CV', 'RESUME']:
#             name = name.replace(suffix, '')
#         name = ' '.join(word.capitalize() for word in name.split() if word)
#         return name.strip() or "Unknown Candidate"
    
#     async def add_resume(self, file_path: str, file_name: str) -> Dict:
#         if not self.vectordb:
#             return {"error": "Service not initialized. Check OpenAI API key."}
        
#         text = self._extract_text(file_path, file_name)
        
#         if not text or len(text) < 50:
#             return {"error": "Could not extract text from file"}
        
#         is_resume = self._is_valid_resume(text)
#         name = self._extract_candidate_name(text, file_name)
        
#         self.candidate_counter += 1
#         candidate_id = self.candidate_counter
        
#         chunks = self.text_splitter.split_text(text)
#         documents = []
        
#         for i, chunk in enumerate(chunks):
#             doc = Document(
#                 page_content=chunk,
#                 metadata={
#                     "candidate_id": candidate_id,
#                     "candidate_name": name,
#                     "file_name": file_name,
#                     "chunk_index": i,
#                     "is_resume": is_resume,
#                 }
#             )
#             documents.append(doc)
        
#         self.vectordb.add_documents(documents)
#         summary_data = await self._analyze_resume(text, name, is_resume)
        
#         candidate_data = {
#             "id": candidate_id,
#             "name": name,
#             "file_name": file_name,
#             "is_resume": is_resume,
#             "raw_text": text[:1500],
#             **summary_data
#         }
        
#         self.candidates[candidate_id] = candidate_data
#         return candidate_data
    
#     async def _analyze_resume(self, text: str, name: str, is_resume: bool) -> Dict:
#         if not is_resume:
#             return {
#                 "summary": f"This file ({name}) does not appear to be a resume.",
#                 "total_experience_years": 0,
#                 "predicted_role": "N/A",
#                 "experience_level": "N/A",
#                 "location": None,
#                 "skills": [],
#                 "education": [],
#                 "work_experience": [],
#                 "badges": [{"label": "Not a Resume", "color": "orange"}]
#             }
        
#         prompt = f"""Analyze this resume and extract information accurately.

# RESUME:
# {text[:7000]}

# EXPERIENCE CALCULATION - IMPORTANT:
# 1. List EACH job with start and end dates
# 2. Calculate months for EACH job separately
# 3. If "Present" or "Current", use January 2025 as end
# 4. Be CONSERVATIVE - if unsure, estimate lower
# 5. Most people have 0-15 years. 20+ is rare.

# Return ONLY valid JSON:
# {{
#     "summary": "2-3 sentence summary",
#     "total_experience_years": <number between 0-30>,
#     "predicted_role": "job title",
#     "experience_level": "Entry/Junior/Mid-Level/Senior/Lead",
#     "location": "city, country or null",
#     "skills": ["skill1", "skill2"],
#     "education": [{{"degree": "...", "institution": "...", "year": 2020}}],
#     "work_experience": [
#         {{
#             "title": "job title",
#             "company": "company",
#             "start_date": "Mon YYYY",
#             "end_date": "Mon YYYY or Present",
#             "duration_months": <number>
#         }}
#     ],
#     "badges": [{{"label": "...", "color": "blue/green/purple/orange/pink"}}],
#     "key_strengths": ["strength1", "strength2"]
# }}

# BADGES (pick 2-3):
# - "Senior" (blue): 7+ years
# - "Experienced" (green): 4-7 years
# - "Full Stack" (green): frontend + backend
# - "ML/AI" (purple): machine learning
# - "Cloud" (blue): AWS/GCP/Azure
# - "Mobile" (pink): iOS/Android
# - "Data" (purple): data science
# - "DevOps" (blue): CI/CD, Docker
# - "Leader" (orange): management"""

#         try:
#             response = await self.llm.ainvoke([HumanMessage(content=prompt)])
#             content = response.content.strip()
            
#             if '```' in content:
#                 parts = content.split('```')
#                 for part in parts:
#                     part = part.strip()
#                     if part.startswith('json'):
#                         content = part[4:].strip()
#                         break
#                     elif part.startswith('{'):
#                         content = part
#                         break
            
#             data = json.loads(content)
            
#             exp = data.get('total_experience_years', 0)
#             if exp > 30:
#                 data['total_experience_years'] = 30
#             elif exp < 0:
#                 data['total_experience_years'] = 0
                
#             return data
            
#         except Exception as e:
#             print(f"Error analyzing resume: {e}")
#             return {
#                 "summary": f"{name}'s resume",
#                 "total_experience_years": 0,
#                 "predicted_role": "Professional",
#                 "experience_level": "Entry",
#                 "location": None,
#                 "skills": [],
#                 "education": [],
#                 "work_experience": [],
#                 "badges": [],
#                 "key_strengths": []
#             }
    
#     def get_all_candidates(self) -> List[Dict]:
#         return list(self.candidates.values())
    
#     def get_candidate(self, candidate_id: int) -> Optional[Dict]:
#         return self.candidates.get(candidate_id)
    
#     def delete_candidate(self, candidate_id: int):
#         if candidate_id in self.candidates:
#             del self.candidates[candidate_id]
    
#     def clear_all(self):
#         self.candidates = {}
#         self.candidate_counter = 0
#         self.recently_discussed = []
#         self.uploaded_file_hashes = set()
#         if os.path.exists(self.chroma_dir):
#             shutil.rmtree(self.chroma_dir)
#         self._init_vectordb()
    
#     def _find_candidate_by_name(self, name_query: str) -> List[Dict]:
#         name_lower = name_query.lower().strip()
#         matches = []
#         for c in self.candidates.values():
#             if not c.get("is_resume", True):
#                 continue
#             cname = c.get("name", "").lower()
#             if name_lower in cname or any(part in cname for part in name_lower.split()):
#                 matches.append(c)
#             name_parts = cname.split()
#             if any(name_lower == part for part in name_parts):
#                 matches.append(c)
#         return list({c['id']: c for c in matches}.values())
    
#     async def _understand_query(self, message: str, candidates: List[Dict], history: List[Dict]) -> Dict:
#         candidate_names = [c['name'] for c in candidates]
#         recent = self.recently_discussed[-5:] if self.recently_discussed else []
        
#         understand_prompt = f"""Understand this user query about resume/candidate analysis.

# User message: "{message}"

# Available candidates: {', '.join(candidate_names)}
# Recently discussed: {', '.join(recent) if recent else 'None'}

# Determine:
# 1. Is this about resumes/candidates? (yes/no)
# 2. Which candidates is the user asking about?
# 3. What do they want to know?

# Rules:
# - "guys/men/males" = male candidates
# - "girls/women/females" = female candidates  
# - "them/they/their" = recently discussed (last 2-3)
# - "he/him/his" = last discussed male
# - "she/her" = last discussed female
# - "more about X" / "what was X" = find candidate with name X
# - "all/everyone" = all candidates

# Return JSON only:
# {{
#     "is_resume_related": true/false,
#     "candidate_names": ["name1", "name2"] or ["all"] or [],
#     "intent": "what user wants",
#     "rephrased_query": "clear version"
# }}"""

#         try:
#             response = await self.llm.ainvoke([HumanMessage(content=understand_prompt)])
#             content = response.content.strip()
#             if '```' in content:
#                 for part in content.split('```'):
#                     part = part.strip()
#                     if part.startswith('json'):
#                         content = part[4:].strip()
#                         break
#                     elif part.startswith('{'):
#                         content = part
#                         break
#             return json.loads(content)
#         except:
#             return {
#                 "is_resume_related": True,
#                 "candidate_names": ["all"],
#                 "intent": "general question",
#                 "rephrased_query": message
#             }
    
#     def _update_recently_discussed(self, names: List[str]):
#         for name in names:
#             if name in self.recently_discussed:
#                 self.recently_discussed.remove(name)
#             self.recently_discussed.append(name)
#         self.recently_discussed = self.recently_discussed[-10:]
    
#     async def chat(
#         self,
#         message: str,
#         candidate_ids: List[int],
#         conversation_history: List[Dict] = None
#     ) -> Dict:
        
#         if not self.vectordb or not self.llm:
#             return {
#                 "response": "**Error:** Service not initialized. Check OpenAI API key.",
#                 "suggestions": []
#             }
        
#         selected_candidates = [self.candidates[cid] for cid in candidate_ids if cid in self.candidates]
#         resume_candidates = [c for c in selected_candidates if c.get("is_resume", True)]
        
#         if not resume_candidates:
#             return {
#                 "response": "Please select at least one candidate. Go to **Upload** tab and click on candidates to select them.",
#                 "suggestions": ["Upload some resumes first"]
#             }
        
#         understanding = await self._understand_query(message, resume_candidates, conversation_history or [])
        
#         if not understanding.get("is_resume_related", True):
#             return {
#                 "response": """I'm **ResuMate AI**, your resume analysis assistant. I can only help with questions about uploaded candidates.

# **I can help with:**
# - Candidate profiles and skills
# - Comparing candidates  
# - Finding best fits for roles
# - Experience and education details

# Please ask about your candidates! 😊""",
#                 "suggestions": [
#                     "Tell me about all candidates",
#                     "Who has the most experience?",
#                     "Compare their skills"
#                 ]
#             }
        
#         target_names = understanding.get("candidate_names", ["all"])
#         target_candidates = []
        
#         if "all" in target_names or not target_names:
#             target_candidates = resume_candidates
#         else:
#             for name in target_names:
#                 for c in resume_candidates:
#                     if name.lower() in c['name'].lower():
#                         target_candidates.append(c)
#                         break
#                 else:
#                     matches = self._find_candidate_by_name(name)
#                     for m in matches:
#                         if m['id'] in candidate_ids:
#                             target_candidates.append(m)
            
#             if not target_candidates:
#                 target_candidates = resume_candidates
        
#         target_candidates = list({c['id']: c for c in target_candidates}.values())
        
#         context_parts = []
#         for c in target_candidates:
#             ctx = f"\n{'='*40}\n## {c['name']}\n{'='*40}\n"
#             ctx += f"**Role:** {c.get('predicted_role', 'N/A')} | **Level:** {c.get('experience_level', 'N/A')}\n"
#             ctx += f"**Experience:** {c.get('total_experience_years', 0)} years\n"
            
#             if c.get('location'):
#                 ctx += f"**Location:** {c['location']}\n"
            
#             ctx += f"\n**Summary:** {c.get('summary', 'N/A')}\n"
            
#             if c.get('key_strengths'):
#                 ctx += f"**Strengths:** {', '.join(c['key_strengths'])}\n"
            
#             if c.get('skills'):
#                 ctx += f"**Skills:** {', '.join(c['skills'][:15])}\n"
            
#             if c.get('work_experience'):
#                 ctx += "\n**Work History:**\n"
#                 for exp in c['work_experience'][:5]:
#                     dur = exp.get('duration_months', 0)
#                     dur_str = f"{dur} months" if dur else "N/A"
#                     ctx += f"• {exp.get('title')} at {exp.get('company')} ({exp.get('start_date', '?')} - {exp.get('end_date', '?')}, {dur_str})\n"
            
#             if c.get('education'):
#                 ctx += "\n**Education:**\n"
#                 for edu in c['education'][:3]:
#                     ctx += f"• {edu.get('degree')} - {edu.get('institution')}\n"
            
#             if c.get('badges'):
#                 ctx += f"\n**Badges:** {', '.join(b['label'] for b in c['badges'])}\n"
            
#             context_parts.append(ctx)
        
#         try:
#             target_ids = [c['id'] for c in target_candidates]
#             results = self.vectordb.similarity_search(
#                 understanding.get('rephrased_query', message),
#                 k=15,
#                 filter={"candidate_id": {"$in": target_ids}} if target_ids else None
#             )
#             for doc in results[:10]:
#                 if doc.metadata.get("is_resume", True):
#                     context_parts.append(f"\n[{doc.metadata.get('candidate_name')}]: {doc.page_content[:500]}\n")
#         except:
#             pass
        
#         context = "\n".join(context_parts)
        
#         target_names_str = ', '.join(c['name'] for c in target_candidates)
#         system_prompt = f"""You are ResuMate AI analyzing: {target_names_str}

# RULES:
# 1. ONLY use information from context
# 2. If info not available, say "This is not in [Name]'s resume"
# 3. Use candidate names, not pronouns
# 4. Be specific with facts, numbers, dates

# CONTEXT:
# {context}

# User's intent: {understanding.get('intent', 'general question')}

# Respond helpfully using **bold** for names."""

#         messages = [("system", system_prompt)]
        
#         if conversation_history:
#             for msg in conversation_history[-20:]:
#                 role = "assistant" if msg.get("role") == "assistant" else "human"
#                 messages.append((role, msg.get("content", "")))
        
#         messages.append(("human", message))
        
#         try:
#             prompt = ChatPromptTemplate.from_messages(messages)
#             response = await self.llm.ainvoke(prompt.format_messages())
#             response_text = response.content
            
#             mentioned = [c['name'] for c in target_candidates if c['name'].lower() in response_text.lower()]
#             if mentioned:
#                 self._update_recently_discussed(mentioned)
#             elif target_candidates:
#                 self._update_recently_discussed([c['name'] for c in target_candidates])
            
#         except Exception as e:
#             response_text = f"**Error:** {str(e)}"
        
#         suggestions = self._generate_suggestions(target_candidates)
        
#         return {"response": response_text, "suggestions": suggestions}
    
#     def _generate_suggestions(self, candidates: List[Dict]) -> List[str]:
#         names = [c['name'] for c in candidates]
#         recent = self.recently_discussed[-3:] if self.recently_discussed else []
        
#         if not names:
#             return ["Upload some resumes"]
        
#         if len(names) == 1:
#             n = names[0]
#             return [
#                 f"What are {n}'s strengths?",
#                 f"Tell me more about {n}",
#                 f"Any concerns about {n}?",
#                 "Compare with others"
#             ]
#         elif recent:
#             return [
#                 f"Tell me more about them",
#                 f"Compare {recent[-1]} with others",
#                 "Who is best for a senior role?",
#                 "What are their key differences?"
#             ]
#         else:
#             return [
#                 "Overview of all candidates",
#                 "Who has most experience?",
#                 "Compare their skills",
#                 "Best fit for senior role?"
#             ]
    
#     def get_intro_message(self, candidate_count: int) -> Dict:
#         if candidate_count == 0:
#             return {
#                 "response": """**Welcome to ResuMate AI!** 👋

# I'm your resume analysis assistant powered by **GPT-5.2**.

# ⚠️ **Important:** I can ONLY help with questions about uploaded resumes and candidates.

# **I can help with:**
# - Analyzing candidate profiles and skills
# - Comparing multiple candidates
# - Finding best fits for specific roles
# - Experience and education details

# **To start:**
# 1. Go to **Upload** tab
# 2. Upload resumes (PDF, DOCX, TXT - max 5MB)
# 3. Select candidates
# 4. Come back here to chat!""",
#                 "suggestions": ["What can you do?", "How many resumes can I upload?"]
#             }
        
#         return {
#             "response": f"""**Welcome to ResuMate AI!** 👋

# I'm your resume analysis assistant. I can **only** help with questions about uploaded candidates.

# **I can help with:**
# - Candidate profiles and skills
# - Comparing candidates
# - Finding best fits for roles
# - Experience and education details

# ---

# **Analyzing {candidate_count} candidate{'s' if candidate_count > 1 else ''}!** 🎯

# Ask me anything! You can use informal language like:
# - "tell me about ravi"
# - "what about the guys"
# - "more about her"

# What would you like to know?""",
#             "suggestions": [
#                 "Overview of all candidates",
#                 "Who has most experience?",
#                 "Compare their skills",
#                 "Best fit for senior role?"
#             ]
#         }


# # Create singleton instance
# resume_rag = ResumeRAGService()

"""
Resume RAG Service with Anonymization Support - FIXED FOR DEPLOYMENT
"""
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
                api_key=settings.openai_api_key  # Changed from openai_api_key
            )
            
            self._init_vectordb()
            print("✅ OpenAI services initialized successfully")
            
        except Exception as e:
            print(f"❌ Error initializing services: {e}")
            self.embeddings = None
            self.llm = None
    
    def _init_vectordb(self):
        """Initialize ChromaDB vector store"""
        if not self.embeddings:
            return
        
        try:
            os.makedirs(self.chroma_dir, exist_ok=True)
            self.vectordb = Chroma(
                collection_name=self.collection_name,
                persist_directory=self.chroma_dir,
                embedding_function=self.embeddings
            )
            print(f"✅ ChromaDB initialized at {self.chroma_dir}")
        except Exception as e:
            print(f"❌ Error initializing ChromaDB: {e}")
            self.vectordb = None
    
    # ... rest of the file remains the same ...
    
    def _get_file_hash(self, content: bytes) -> str:
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
    
    async def add_resume(self, file_path: str, file_name: str) -> Dict:
        if not self.vectordb:
            return {"error": "Service not initialized. Check OpenAI API key."}
        
        text = self._extract_text(file_path, file_name)
        
        if not text or len(text) < 50:
            return {"error": "Could not extract text from file"}
        
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
            "is_resume": is_resume,
            "raw_text": text[:1500],
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
    
    def delete_candidate(self, candidate_id: int):
        if candidate_id in self.candidates:
            del self.candidates[candidate_id]
    
    def clear_all(self):
        self.candidates = {}
        self.candidate_counter = 0
        self.recently_discussed = []
        self.uploaded_file_hashes = set()
        if os.path.exists(self.chroma_dir):
            shutil.rmtree(self.chroma_dir)
        self._init_vectordb()
    
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
"""PDF Tool — Extract text and embedded hyperlinks from PDFs"""
import re
from typing import Dict
from pathlib import Path


class PDFTool:
    async def call(self, params: Dict, context: Dict = None) -> Dict:
        """Extract text and links from a PDF file"""
        file_path = params.get("file_path", "")
        if not file_path:
            return {"error": "No file path", "text": "", "links": {}}

        text = self._extract_text(file_path, params.get("file_name", ""))
        links = self._extract_links(file_path, params.get("file_name", ""))
        
        return {"text": text, "links": links}

    def _extract_text(self, file_path: str, file_name: str = "") -> str:
        ext = Path(file_name or file_path).suffix.lower()
        try:
            if ext == '.pdf':
                from langchain_community.document_loaders import PyPDFLoader
                loader = PyPDFLoader(file_path)
                docs = loader.load()
                return "\n\n".join([d.page_content for d in docs])
            elif ext in ['.docx', '.doc']:
                from langchain_community.document_loaders import Docx2txtLoader
                loader = Docx2txtLoader(file_path)
                docs = loader.load()
                return "\n\n".join([d.page_content for d in docs])
            else:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
        except Exception as e:
            print(f"Text extraction error: {e}")
            return ""

    def _extract_links(self, file_path: str, file_name: str = "") -> Dict:
        """Extract embedded hyperlinks from PDF using PyMuPDF"""
        links = {"all_urls": [], "github_url": None, "linkedin_url": None, "portfolio_url": None, "email": None}
        ext = Path(file_name or file_path).suffix.lower()
        if ext != '.pdf':
            return links
        try:
            import fitz
            doc = fitz.open(file_path)
            for page in doc:
                for link in page.get_links():
                    uri = link.get("uri", "")
                    if not uri:
                        continue
                    links["all_urls"].append(uri)
                    uri_lower = uri.lower()
                    if 'github.com' in uri_lower and not links["github_url"]:
                        links["github_url"] = uri
                    elif 'linkedin.com' in uri_lower and not links["linkedin_url"]:
                        links["linkedin_url"] = uri
                    elif uri_lower.startswith('mailto:') and not links["email"]:
                        links["email"] = uri.replace('mailto:', '')
                    elif uri_lower.startswith('http') and not links["portfolio_url"]:
                        if not any(skip in uri_lower for skip in ['github.com', 'linkedin.com', 'google.com']):
                            links["portfolio_url"] = uri
            doc.close()
        except ImportError:
            print("⚠️ PyMuPDF not installed")
        except Exception as e:
            print(f"PDF link extraction error: {e}")
        return links

    def extract_contact_from_text(self, text: str) -> Dict:
        """Extract email, phone, GitHub, LinkedIn from text using regex"""
        contact = {"email": None, "phone": None, "github_username": None, "linkedin_username": None}

        # Email
        m = re.search(r'([a-zA-Z0-9][\w.-]*@[\w.-]+\.\w{2,})', text)
        if m:
            contact["email"] = m.group(1)

        # Phone
        m = re.search(r'[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}', text)
        if m:
            contact["phone"] = m.group().strip()

        # GitHub
        for pattern in [r'github\.com/([a-zA-Z0-9_-]+)', r'/github\s*([a-zA-Z0-9_-]+)', r'github[^\w]*([a-zA-Z0-9_-]{2,})']:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                username = m.group(1).strip()
                if username.lower() not in ['com', 'io', 'org', 'profile', 'settings', 'in', 'alt', '']:
                    contact["github_username"] = username
                    break

        # LinkedIn
        for pattern in [r'linkedin\.com/in/([a-zA-Z0-9_-]+)', r'/linkedin-in\s*([a-zA-Z0-9_-]+)', r'/linkedin[^\w]*([a-zA-Z0-9_-]{2,})']:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                username = m.group(1).strip().rstrip('/')
                if username.lower() not in ['in', 'com', 'profile', '']:
                    contact["linkedin_username"] = username
                    break

        return contact


pdf_tool = PDFTool()

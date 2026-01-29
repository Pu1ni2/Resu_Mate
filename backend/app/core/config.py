# from pydantic_settings import BaseSettings
# from functools import lru_cache

# class Settings(BaseSettings):
#     openai_api_key: str = ""
#     openai_model: str = "gpt-5.2"
#     chroma_dir: str = "chroma_db"
#     chroma_collection: str = "resumes"
#     host: str = "0.0.0.0"
#     port: int = 8000
#     debug: bool = True
#     cors_origins: str = "http://localhost:3000,http://localhost:5173"
    
#     @property
#     def cors_origins_list(self) -> list:
#         return [o.strip() for o in self.cors_origins.split(",")]
    
#     class Config:
#         env_file = ".env"

# @lru_cache()
# def get_settings() -> Settings:
#     return Settings()

# settings = get_settings()


"""Configuration settings for the application"""
import os
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    
    # ChromaDB
    chroma_dir: str = "chroma_db"
    chroma_collection: str = "resumes"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
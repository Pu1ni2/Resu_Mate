"""Simple Auth - Demo mode only, no real authentication"""
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

security = HTTPBearer(auto_error=False)

class DemoUser:
    def __init__(self):
        self.id = 1
        self.name = "Recruiter"
        self.email = "demo@resumate.ai"

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    # Accept any token or no token, return demo user
    return DemoUser()

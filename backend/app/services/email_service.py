"""Email Service — SendGrid with graceful console fallback"""
from app.core.config import settings


class EmailService:
    def __init__(self):
        self._sg = None
        if settings.sendgrid_api_key:
            try:
                import sendgrid as sg_module
                self._sg = sg_module.SendGridAPIClient(api_key=settings.sendgrid_api_key)
            except Exception as e:
                print(f"[EmailService] SendGrid init failed: {e}")

    async def send(self, to_email: str, subject: str, html_body: str) -> bool:
        """Send an email. Falls back to console print if SendGrid not configured."""
        if not self._sg:
            print(f"\n[EMAIL STUB] To: {to_email}\nSubject: {subject}\n{html_body}\n")
            return True
        try:
            from sendgrid.helpers.mail import Mail
            message = Mail(
                from_email=settings.from_email,
                to_emails=to_email,
                subject=subject,
                html_content=html_body,
            )
            response = self._sg.send(message)
            success = 200 <= response.status_code < 300
            if not success:
                print(f"[EmailService] Send failed: {response.status_code}")
            return success
        except Exception as e:
            print(f"[EmailService] Send error: {e}")
            return False

    async def send_otp(self, to_email: str, code: str) -> bool:
        html = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">ResuMate AI — Access Code</h2>
          <p>Your one-time access code is:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1E40AF; padding: 16px; background: #EFF6FF; border-radius: 8px; text-align: center;">
            {code}
          </div>
          <p style="color: #6B7280; margin-top: 16px;">This code expires in 15 minutes. Do not share it with anyone.</p>
        </div>
        """
        return await self.send(to_email, "Your ResuMate Interview Access Code", html)

    async def send_interview_invitation(
        self, to_email: str, candidate_name: str, role: str, login_url: str
    ) -> bool:
        html = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Interview Invitation — {role}</h2>
          <p>Hi {candidate_name},</p>
          <p>You have been invited to complete an AI-powered interview for the <strong>{role}</strong> position.</p>
          <p>
            <a href="{login_url}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
              Start Interview
            </a>
          </p>
          <p style="color:#6B7280;">If the button doesn't work, copy this link: {login_url}</p>
        </div>
        """
        return await self.send(to_email, f"Interview Invitation: {role}", html)

    async def send_email_draft(self, to_email: str, subject: str, body: str) -> bool:
        html = body.replace("\n", "<br>")
        return await self.send(to_email, subject, f'<div style="font-family:sans-serif;">{html}</div>')


email_service = EmailService()

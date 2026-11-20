"""Email Service: SendGrid, and nothing sent without it."""
import asyncio
import html
import logging
from app.core.config import settings
from app.core.errors import log_text

logger = logging.getLogger("resumate.email")

# How a delivery went (EmailService.deliver): sent; the service busy, slow or
# out of reach, so a later try may get through; refused, which trying again
# won't change; or not tried, email not being set up here.
SENT, BUSY, REFUSED, OFF = "sent", "busy", "refused", "off"


class EmailService:
    def __init__(self):
        self._sg = None
        if settings.sendgrid_api_key:
            try:
                import sendgrid as sg_module
                self._sg = sg_module.SendGridAPIClient(api_key=settings.sendgrid_api_key)
                # Each request the client makes takes its timeout from here.
                self._sg.client.timeout = settings.sendgrid_timeout_seconds
            except Exception as e:
                logger.warning("SendGrid init failed: %s", log_text(e))

    @property
    def configured(self) -> bool:
        """True only when SendGrid is set up and emails will actually be delivered."""
        return self._sg is not None

    def require_in_production(self) -> None:
        """Production doesn't start without email.

        Without it no sign-in code, interview invitation, password reset or
        deletion code reaches anyone, and the codes used to go to the log
        instead. The server checks when it starts (main.py), not when the
        settings load, so migrations and CI's checks run without email. Local
        development (DEBUG) works without it, showing the codes instead.
        """
        if settings.debug or self.configured:
            return
        raise RuntimeError(
            "Email isn't set up, and production needs it: without it no sign-in code, "
            "interview invitation, password reset or deletion code can be sent. Set "
            "SENDGRID_API_KEY, and FROM_EMAIL to a sender SendGrid has verified."
        )

    async def deliver(self, to_email: str, subject: str, html_body: str) -> str:
        """Send an email, and say how it went: SENT, BUSY (SendGrid busy,
        slow or out of reach: a later try may get through), REFUSED (it said
        no, which trying again won't change) or OFF (email isn't set up).

        A busy SendGrid answers 429 or 5xx; its client raises those as errors
        carrying the status. Each try takes at most SENDGRID_TIMEOUT_SECONDS.
        """
        if not self._sg:
            # Not the message itself, nor who it was for: it can hold a sign-in
            # code or a password-reset link, and more people read a server's
            # log than the mailbox.
            print("[EMAIL] not sent: email isn't set up on this server")
            return OFF
        try:
            from sendgrid.helpers.mail import Mail
            message = Mail(
                from_email=settings.from_email,
                to_emails=to_email,
                subject=subject,
                html_content=html_body,
            )
            # In a thread: the SendGrid client blocks, and every sign-in code
            # and invitation held up all other requests until SendGrid answered.
            # The client's own timeout is per network step, so a slow answer
            # could still run on; this caps the whole send.
            response = await asyncio.wait_for(
                asyncio.to_thread(self._sg.send, message), timeout=settings.sendgrid_timeout_seconds,
            )
            status = response.status_code
        except Exception as e:
            if isinstance(e, TimeoutError) or isinstance(getattr(e, "reason", None), TimeoutError):
                logger.warning("SendGrid didn't answer within %ss", settings.sendgrid_timeout_seconds)
                return BUSY
            status = getattr(e, "status_code", None)
            if not isinstance(status, int):
                # Out of reach: no answer at all.
                logger.error("SendGrid send error: %s", log_text(e))
                return BUSY
        if 200 <= status < 300:
            return SENT
        logger.warning("SendGrid rejected message: status=%s", status)
        return BUSY if status == 429 or status >= 500 else REFUSED

    async def send(self, to_email: str, subject: str, html_body: str) -> bool:
        """Send an email. Returns True only if SendGrid accepted it.

        Without SendGrid (local development: production doesn't start without
        it), it says so in the log and returns False, so callers can tell and
        answer accordingly, e.g. with the code in a DEBUG response.
        """
        return await self.deliver(to_email, subject, html_body) == SENT

    async def send_interview_invitation(
        self, to_email: str, candidate_name: str, role: str, login_url: str, company: str = ""
    ) -> bool:
        """The invitation names the company inviting: it said only that "you
        have been invited", by no one in particular."""
        # Escaped: the name comes from a résumé, and a "<" in it, or in the
        # role, broke the email or put markup in it.
        name, role_text, link, company_text = (html.escape(v or "") for v in (candidate_name, role, login_url, company))
        inviter = f"{company_text} has invited you" if company_text else "You have been invited"
        body = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Interview Invitation — {role_text}</h2>
          <p>Hi {name},</p>
          <p>{inviter} to complete an AI-powered interview for the <strong>{role_text}</strong> position.</p>
          <p>
            <a href="{link}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
              Start Interview
            </a>
          </p>
          <p style="color:#6B7280;">If the button doesn't work, copy this link: {link}</p>
        </div>
        """
        subject = f"Interview invitation from {company}: {role}" if company else f"Interview Invitation: {role}"
        return await self.send(to_email, subject, body)

    async def send_email_draft(self, to_email: str, subject: str, body: str, login_url: str = "") -> bool:
        """A plain-text email the manager reviewed, sent as written.

        With login_url, it ends with the button and link to the candidate
        portal, as the invitation does.
        """
        text = html.escape(body).replace("\n", "<br>")
        page = f'<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><p>{text}</p>'
        if login_url:
            link = html.escape(login_url)
            page += (
                f'<p><a href="{link}" style="background:#3B82F6;color:white;padding:12px 24px;'
                f'border-radius:6px;text-decoration:none;display:inline-block;">Start Interview</a></p>'
                f'<p style="color:#6B7280;">If the button doesn\'t work, copy this link: {link}</p>'
            )
        # One line: a line break in a subject is not a valid header.
        return await self.send(to_email, " ".join(subject.split()), page + "</div>")


def sign_in_code_email(code: str) -> tuple:
    """The sign-in code's subject and page: made as the outbox sends it,
    the code issued then, so it's never stored."""
    html = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Your ResuMate access code</h2>
          <p>Your one-time access code is:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1E40AF; padding: 16px; background: #EFF6FF; border-radius: 8px; text-align: center;">
            {code}
          </div>
          <p style="color: #6B7280; margin-top: 16px;">This code expires in 15 minutes. Do not share it with anyone.</p>
        </div>
        """
    return "Your ResuMate Interview Access Code", html


def erasure_code_email(code: str) -> tuple:
    """The subject and page of the code that confirms a deletion: made as
    the outbox sends it, the code issued then, so it's never stored."""
    safe_code = html.escape(code)
    body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Confirm deleting your data</h2>
          <p>Someone asked ResuMate to delete the data it holds about this address. If it was you, enter this code on the deletion page:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1E40AF; padding: 16px; background: #EFF6FF; border-radius: 8px; text-align: center;">
            {safe_code}
          </div>
          <p style="color: #6B7280; margin-top: 16px;">It works for 15 minutes. If you didn't ask, ignore this email: nothing is deleted without the code.</p>
        </div>
        """
    return "Confirm deleting your ResuMate data", body


def password_reset_email(reset_url: str) -> tuple:
    """The password reset's subject and page, with its link: made as the
    outbox sends it, so the link is never stored."""
    link = html.escape(reset_url)
    body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Reset your ResuMate password</h2>
          <p>Someone asked to reset the password for this address. If it was you, choose a new one:</p>
          <p>
            <a href="{link}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
              Choose a new password
            </a>
          </p>
          <p style="color:#6B7280;">The link works once, for 30 minutes. If you didn't ask, ignore this email: your password stays as it is.</p>
          <p style="color:#6B7280;">If the button doesn't work, copy this link: {link}</p>
        </div>
        """
    return "Reset your ResuMate password", body


def verification_email(confirm_url: str) -> tuple:
    """The subject and page of the email that confirms a manager's address,
    with its link: made as the outbox sends it, so the link is never stored."""
    link = html.escape(confirm_url)
    body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Confirm your email for ResuMate</h2>
          <p>Someone signed up for ResuMate with this address. If it was you, confirm it, and you can email candidates from your workspace:</p>
          <p>
            <a href="{link}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
              Confirm my email
            </a>
          </p>
          <p style="color:#6B7280;">The link works for 7 days. If you didn't sign up, ignore this email.</p>
          <p style="color:#6B7280;">If the button doesn't work, copy this link: {link}</p>
        </div>
        """
    return "Confirm your email for ResuMate", body


email_service = EmailService()

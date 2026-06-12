"""Object storage for original resume files (S3-compatible).

Optional by design. When S3 isn't configured (no bucket) or boto3 isn't
installed, every method is a safe no-op and `enabled` is False — the app keeps
its prior "parse the resume, then delete the upload" behaviour and stores no
originals. When configured, originals are uploaded so a manager can re-download
them and GDPR erasure can remove them.

Works with AWS S3, Cloudflare R2, Backblaze B2 — any S3 API endpoint.
"""
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("resumate.storage")


class StorageService:
    def __init__(self):
        self._client = None
        self.bucket = (settings.s3_bucket or "").strip()
        if not self.bucket:
            return  # disabled — no bucket configured
        try:
            import boto3  # imported lazily so the app runs without boto3 installed
            kwargs = {
                "region_name": settings.s3_region or "us-east-1",
                "aws_access_key_id": settings.s3_access_key or None,
                "aws_secret_access_key": settings.s3_secret_key or None,
            }
            if settings.s3_endpoint:
                kwargs["endpoint_url"] = settings.s3_endpoint
            self._client = boto3.client("s3", **kwargs)
            logger.info("Object storage enabled (bucket=%s)", self.bucket)
        except Exception as e:
            self._client = None
            logger.warning("Object storage init failed, running without it: %s", e)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @staticmethod
    def key_for(manager_id, candidate_id, safe_name: str) -> str:
        mgr = manager_id if manager_id is not None else 0
        return f"resumes/{mgr}/{candidate_id}/{safe_name}"

    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> Optional[str]:
        """Upload bytes; return the stored key, or None if disabled/failed."""
        if not self.enabled:
            return None
        try:
            self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
            return key
        except Exception as e:
            logger.warning("S3 upload failed for %s: %s", key, e)
            return None

    def presigned_url(self, key: str, expires: int = 300) -> Optional[str]:
        """Return a short-lived download URL, or None if disabled/failed."""
        if not self.enabled:
            return None
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires,
            )
        except Exception as e:
            logger.warning("S3 presign failed for %s: %s", key, e)
            return None

    def download(self, key: str) -> Optional[bytes]:
        """Fetch object bytes (for proxied download), or None."""
        if not self.enabled:
            return None
        try:
            obj = self._client.get_object(Bucket=self.bucket, Key=key)
            return obj["Body"].read()
        except Exception as e:
            logger.warning("S3 download failed for %s: %s", key, e)
            return None

    def delete(self, key: str) -> bool:
        if not self.enabled or not key:
            return False
        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as e:
            logger.warning("S3 delete failed for %s: %s", key, e)
            return False


storage_service = StorageService()

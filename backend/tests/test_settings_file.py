"""The tests run with no settings file.

backend/.env holds a developer's real keys. The settings read it from the
working directory and livekit_routes loads it into the environment, so a local
test run had OpenAI, SendGrid and S3 to hand, and could send real email.
conftest points RESUMATE_ENV_FILE at an empty file instead.
"""
import os

from app.core import config


def _a_real_looking_settings_file(folder):
    (folder / ".env").write_text("SENDGRID_API_KEY=SG.real-looking\nS3_BUCKET=real-bucket\n", encoding="utf-8")


def test_the_tests_name_an_empty_settings_file():
    assert os.environ["RESUMATE_ENV_FILE"] == os.devnull
    assert config.ENV_FILE == os.devnull
    assert config.Settings.model_config["env_file"] == os.devnull


def test_a_settings_file_where_the_tests_run_is_not_read(tmp_path, monkeypatch):
    _a_real_looking_settings_file(tmp_path)
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("SENDGRID_API_KEY", raising=False)
    monkeypatch.delenv("S3_BUCKET", raising=False)
    settings = config.Settings()
    assert settings.sendgrid_api_key == ""
    assert settings.s3_bucket == ""


def test_the_same_file_is_read_without_the_override(tmp_path, monkeypatch):
    # As in development, where RESUMATE_ENV_FILE isn't set and .env is used.
    _a_real_looking_settings_file(tmp_path)
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("SENDGRID_API_KEY", raising=False)
    assert config.Settings(_env_file=".env").sendgrid_api_key == "SG.real-looking"


def test_no_key_reaches_the_environment():
    import app.api.livekit_routes  # noqa: F401  (the app imports it; it loads the file)
    keys = ("OPENAI_API_KEY", "SENDGRID_API_KEY", "S3_BUCKET", "LIVEKIT_API_KEY", "TAVILY_API_KEY")
    # Names only: a failure must not print a real key, or the environment.
    reaching = [key for key in keys if os.environ.get(key)]
    assert reaching == [], "these keys reach the tests: " + ", ".join(reaching)

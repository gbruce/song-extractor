from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "songcraft-api"
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    data_dir: Path = Path("./data")
    sqlite_filename: str = "songcraft.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def sqlite_path(self) -> Path:
        return self.data_dir / self.sqlite_filename


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings

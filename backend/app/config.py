from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "广告 TVC 制作网站"
    app_env: str = "local"
    app_host: str = "0.0.0.0"
    app_port: int = 9898
    cors_origins: list[str] = [
        "http://localhost:8989",
        "https://lens-rhyme.tensorbytes.com",
        "https://admin.lens-rhyme.tensorbytes.com",
    ]
    storage_dir: str = "./storage"
    max_brief_file_size_mb: Annotated[int, Field(ge=1)] = 50
    max_reference_file_size_mb: Annotated[int, Field(ge=1)] = 200
    pdf_render_max_pages: Annotated[int, Field(ge=1)] = 6
    pdf_render_scale: Annotated[float, Field(gt=0, le=4)] = 2.0
    pdf_render_max_image_size: Annotated[int, Field(ge=256)] = 1600
    ark_api_key: str = ""
    ark_files_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_chat_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    seed_model_name: str = "seed-2.1"
    seedance_model_name: str = "seedance-2.0"
    task_poll_interval_seconds: Annotated[int, Field(ge=1)] = 5
    video_transition_seconds: Annotated[float, Field(ge=0)] = 0.5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    def public_dict(self) -> dict[str, object]:
        data = self.model_dump()
        data["ark_api_key"] = "configured" if self.ark_api_key else "missing"
        return data


@lru_cache
def get_settings() -> Settings:
    return Settings()

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.public import public_router
from app.api.v1.router import v1_router
from app.core.config import get_settings
from app.core.exceptions import (
    DomainError,
    ExternalServiceError,
    InfraError,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(public_router)
app.include_router(v1_router)



@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(NotFoundError)
async def not_found_error_handler(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(InfraError)
async def infra_error_handler(request: Request, exc: InfraError):
    logger.error("Infrastructure error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.exception_handler(ExternalServiceError)
async def external_service_error_handler(request: Request, exc: ExternalServiceError):
    logger.error("External service error: %s", exc)
    return JSONResponse(status_code=502, content={"detail": str(exc)})

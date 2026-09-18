from fastapi import APIRouter

public_router = APIRouter(tags=["public"])


@public_router.get("/health")
def health_check():
    return {"status": "ok"}

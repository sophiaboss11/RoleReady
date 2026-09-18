class DomainError(Exception):
    """Business logic violation (422)."""


class NotFoundError(Exception):
    """Requested resource was not found (404)."""


class InfraError(Exception):
    """Database or storage failure (500)."""


class ExternalServiceError(Exception):
    """External service (Gemini, Ollama) failure (502)."""


class ValidationError(Exception):
    """Input validation failure (400)."""

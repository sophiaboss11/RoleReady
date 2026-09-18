"""Repository layer for database-bound operations.

Application services should depend on repositories rather than calling
Supabase directly. This keeps IO boundaries explicit and makes the
intended architecture visible in the codebase.
"""

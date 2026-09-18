"""Tenant-aware authorization primitives for API endpoints.

Rule for contributors:
- Authenticate at router level (`get_current_user`).
- Authorize tenant scope at endpoint level with `*Access` dependencies below.
- Never query tenant data with service_role before authorization.
"""

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request

from app.core.supabase import get_service_role_client


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str


@dataclass(frozen=True)
class OrganizationAccess:
    user_id: str
    organization_id: str
    is_admin: bool


@dataclass(frozen=True)
class ProjectAccess:
    user_id: str
    project_id: str
    organization_id: str
    is_admin: bool


@dataclass(frozen=True)
class TrainingAccess:
    user_id: str
    training_id: str
    project_id: str
    organization_id: str
    is_admin: bool


@dataclass(frozen=True)
class AssignmentOwnerAccess:
    """Access for the assigned user or an org admin."""
    user_id: str
    assignment_id: str
    training_id: str
    organization_id: str
    is_admin: bool
    is_assignee: bool


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return auth_header[7:]


async def get_current_user(request: Request) -> AuthenticatedUser:
    """FastAPI dependency: validates JWT via Supabase Auth and returns the authenticated user."""
    token = _extract_bearer_token(request)
    client = get_service_role_client()
    try:
        response = client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return AuthenticatedUser(user_id=response.user.id)


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


async def check_member_of_organization(user_id: str, org_id: str) -> None:
    """Raise 403 if user is not a member of the organization."""
    client = get_service_role_client()
    resp = (
        client.table("organization_member")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", org_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=403, detail="Not a member of this organization")


async def check_admin_for_organization(user_id: str, org_id: str) -> None:
    """Raise 403 if user is not an admin of the organization."""
    client = get_service_role_client()
    resp = (
        client.table("organization_member")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", org_id)
        .eq("role", "admin")
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=403, detail="Admin role required")


async def assert_users_share_organization(requester_id: str, target_user_id: str) -> None:
    """Raise 403 unless both users share at least one organization."""
    if requester_id == target_user_id:
        return

    client = get_service_role_client()
    requester_resp = (
        client.table("organization_member")
        .select("organization_id")
        .eq("user_id", requester_id)
        .execute()
    )
    requester_org_ids = {
        row["organization_id"]
        for row in (requester_resp.data or [])
        if row.get("organization_id")
    }
    if not requester_org_ids:
        raise HTTPException(status_code=403, detail="No organization membership found")

    shared_org_resp = (
        client.table("organization_member")
        .select("id")
        .eq("user_id", target_user_id)
        .in_("organization_id", list(requester_org_ids))
        .limit(1)
        .execute()
    )
    if not shared_org_resp.data:
        raise HTTPException(status_code=403, detail="Target user is not in your organization")


async def get_project_organization_id(project_id: str) -> str:
    """Resolve project_id → organization_id. Raises 404 if not found."""
    client = get_service_role_client()
    resp = (
        client.schema("RoleReady")
        .table("project")
        .select("organization_id")
        .eq("id", project_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

    organization_id = resp.data[0].get("organization_id")
    if not organization_id:
        raise HTTPException(
            status_code=409,
            detail="Project is missing organization_id and cannot be authorized",
        )
    return organization_id


async def authorize_organization_member(user: CurrentUser, organization_id: str) -> OrganizationAccess:
    await check_member_of_organization(user.user_id, organization_id)
    return OrganizationAccess(user_id=user.user_id, organization_id=organization_id, is_admin=False)


async def authorize_organization_admin(user: CurrentUser, organization_id: str) -> OrganizationAccess:
    await check_admin_for_organization(user.user_id, organization_id)
    return OrganizationAccess(user_id=user.user_id, organization_id=organization_id, is_admin=True)


async def authorize_project_member(user: CurrentUser, project_id: str) -> ProjectAccess:
    organization_id = await get_project_organization_id(project_id)
    await check_member_of_organization(user.user_id, organization_id)
    return ProjectAccess(
        user_id=user.user_id,
        project_id=project_id,
        organization_id=organization_id,
        is_admin=False,
    )


async def authorize_project_admin(user: CurrentUser, project_id: str) -> ProjectAccess:
    access = await authorize_project_member(user, project_id)
    await check_admin_for_organization(user.user_id, access.organization_id)
    return ProjectAccess(
        user_id=access.user_id,
        project_id=access.project_id,
        organization_id=access.organization_id,
        is_admin=True,
    )


async def require_organization_member_access(
    organization_id: str,
    user: CurrentUser,
) -> OrganizationAccess:
    return await authorize_organization_member(user, organization_id)


async def require_organization_admin_access(
    organization_id: str,
    user: CurrentUser,
) -> OrganizationAccess:
    return await authorize_organization_admin(user, organization_id)


async def require_project_member_access(
    project_id: UUID,
    user: CurrentUser,
) -> ProjectAccess:
    return await authorize_project_member(user, str(project_id))


async def require_project_admin_access(
    project_id: UUID,
    user: CurrentUser,
) -> ProjectAccess:
    return await authorize_project_admin(user, str(project_id))


OrganizationMemberAccess = Annotated[OrganizationAccess, Depends(require_organization_member_access)]
OrganizationAdminAccess = Annotated[OrganizationAccess, Depends(require_organization_admin_access)]
ProjectMemberAccess = Annotated[ProjectAccess, Depends(require_project_member_access)]
ProjectAdminAccess = Annotated[ProjectAccess, Depends(require_project_admin_access)]

# ---------------------------------------------------------------------------
# Training-level authorization
# ---------------------------------------------------------------------------

async def get_training_context(training_id: str) -> tuple[str, str]:
    """Resolve training_id → (project_id, organization_id). Raises 404 if not found."""
    client = get_service_role_client()
    resp = (
        client.schema("RoleReady")
        .table("training")
        .select("project_id")
        .eq("id", training_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Training {training_id} not found")

    project_id = resp.data[0]["project_id"]
    organization_id = await get_project_organization_id(project_id)
    return project_id, organization_id


async def authorize_training_member(user: CurrentUser, training_id: str) -> TrainingAccess:
    project_id, organization_id = await get_training_context(training_id)
    await check_member_of_organization(user.user_id, organization_id)
    return TrainingAccess(
        user_id=user.user_id,
        training_id=training_id,
        project_id=project_id,
        organization_id=organization_id,
        is_admin=False,
    )


async def authorize_training_admin(user: CurrentUser, training_id: str) -> TrainingAccess:
    project_id, organization_id = await get_training_context(training_id)
    await check_admin_for_organization(user.user_id, organization_id)
    return TrainingAccess(
        user_id=user.user_id,
        training_id=training_id,
        project_id=project_id,
        organization_id=organization_id,
        is_admin=True,
    )


async def require_training_member_access(
    training_id: UUID,
    user: CurrentUser,
) -> TrainingAccess:
    return await authorize_training_member(user, str(training_id))


async def require_training_admin_access(
    training_id: UUID,
    user: CurrentUser,
) -> TrainingAccess:
    return await authorize_training_admin(user, str(training_id))


TrainingMemberAccess = Annotated[TrainingAccess, Depends(require_training_member_access)]
TrainingAdminAccess = Annotated[TrainingAccess, Depends(require_training_admin_access)]


# ---------------------------------------------------------------------------
# Assignment-level authorization (assignee or org admin)
# ---------------------------------------------------------------------------

async def require_assignment_access(
    assignment_id: UUID,
    user: CurrentUser,
) -> AssignmentOwnerAccess:
    """Allow access if user is the assignee OR an org admin."""
    client = get_service_role_client()
    resp = (
        client.schema("RoleReady")
        .table("training_assignment")
        .select("training_id, user_id")
        .eq("id", str(assignment_id))
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Assignment {assignment_id} not found")

    row = resp.data[0]
    training_id = row["training_id"]
    assignee_id = row["user_id"]
    is_assignee = assignee_id == user.user_id

    project_id, organization_id = await get_training_context(training_id)

    # Allow if assignee OR org admin
    if is_assignee:
        await check_member_of_organization(user.user_id, organization_id)
    else:
        await check_admin_for_organization(user.user_id, organization_id)

    return AssignmentOwnerAccess(
        user_id=user.user_id,
        assignment_id=str(assignment_id),
        training_id=training_id,
        organization_id=organization_id,
        is_admin=not is_assignee,
        is_assignee=is_assignee,
    )


AssignmentAccess = Annotated[AssignmentOwnerAccess, Depends(require_assignment_access)]

from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.exceptions import DomainError, InfraError, NotFoundError
from app.repositories.types import (
    ChallengeParticipationRow,
    ChallengeRow,
    LeaderboardSnapshotRow,
    ProfileRow,
)


class SocialRepository:
    def __init__(self, client: Client):
        self.client = client

    # -- Leaderboard --------------------------------------------------------

    def get_leaderboard(
        self,
        *,
        organization_id: str,
        period_type: str,
        period_start: str,
    ) -> list[LeaderboardSnapshotRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("leaderboard_snapshot")
                .select("*")
                .eq("organization_id", organization_id)
                .eq("period_type", period_type)
                .eq("period_start", period_start)
                .order("rank")
                .limit(100)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch leaderboard: {exc}") from exc
        return response.data or []

    def compute_leaderboard(
        self,
        *,
        organization_id: str,
        period_type: str,
        period_start: str,
        period_end: str,
    ) -> None:
        try:
            self.client.rpc("compute_leaderboard", {
                "p_organization_id": organization_id,
                "p_period_type": period_type,
                "p_period_start": period_start,
                "p_period_end": period_end,
            }).execute()
        except Exception as exc:
            raise InfraError(f"Failed to compute leaderboard: {exc}") from exc

    # -- Challenge ----------------------------------------------------------

    def create_challenge(self, row: ChallengeRow) -> ChallengeRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("challenge")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to create challenge: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to create challenge")
        return response.data[0]

    def update_challenge(self, challenge_id: str, update_data: dict[str, Any]) -> ChallengeRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("challenge")
                .update(update_data)
                .eq("id", challenge_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to update challenge: {exc}") from exc
        if not response.data:
            raise NotFoundError("Challenge not found")
        return response.data[0]

    def get_challenge(self, challenge_id: str) -> ChallengeRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("challenge")
                .select("*")
                .eq("id", challenge_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch challenge: {exc}") from exc
        if not response.data:
            raise NotFoundError("Challenge not found")
        return response.data[0]

    def list_challenges(
        self,
        *,
        organization_id: str,
        status: str | None = None,
    ) -> list[ChallengeRow]:
        try:
            query = (
                self.client.schema("RoleReady")
                .table("challenge")
                .select("*")
                .eq("organization_id", organization_id)
                .order("start_date", desc=True)
            )
            if status:
                query = query.eq("status", status)
            response = query.limit(100).execute()
        except Exception as exc:
            raise InfraError(f"Failed to list challenges: {exc}") from exc
        return response.data or []

    # -- Challenge Participation --------------------------------------------

    def join_challenge(self, row: ChallengeParticipationRow) -> ChallengeParticipationRow:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("challenge_participation")
                .insert(row)
                .execute()
            )
        except Exception as exc:
            message = str(exc).lower()
            if "duplicate key" in message or "unique" in message:
                raise DomainError("Already participating in this challenge") from exc
            raise InfraError(f"Failed to join challenge: {exc}") from exc
        if not response.data:
            raise InfraError("Failed to join challenge")
        return response.data[0]

    def list_participants(self, challenge_id: str) -> list[ChallengeParticipationRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("challenge_participation")
                .select("*")
                .eq("challenge_id", challenge_id)
                .order("current_value", desc=True)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list participants: {exc}") from exc
        return response.data or []

    def get_participation(
        self,
        *,
        challenge_id: str,
        user_id: str,
    ) -> ChallengeParticipationRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("challenge_participation")
                .select("*")
                .eq("challenge_id", challenge_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch participation: {exc}") from exc
        return response.data[0] if response.data else None

    # -- Profiles -----------------------------------------------------------

    def list_profiles(self, user_ids: list[str]) -> dict[str, ProfileRow]:
        if not user_ids:
            return {}
        try:
            response = (
                self.client.table("profile")
                .select("id, display_name, avatar_url")
                .in_("id", list(set(user_ids)))
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch profiles: {exc}") from exc
        return {row["id"]: row for row in (response.data or [])}

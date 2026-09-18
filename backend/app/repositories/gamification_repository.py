from __future__ import annotations

from supabase import Client

from app.core.exceptions import InfraError
from app.repositories.types import (
    DailyActivityRow,
    LearnerGamificationProfileRow,
    XpLedgerRow,
)


class GamificationRepository:
    def __init__(self, client: Client):
        self.client = client

    # -- XP Ledger ---------------------------------------------------------

    def grant_xp(
        self,
        *,
        user_id: str,
        amount: int,
        reason: str,
        source_type: str = "system",
        source_id: str | None = None,
        training_id: str | None = None,
    ) -> XpLedgerRow | None:
        try:
            response = self.client.rpc("grant_xp", {
                    "p_user_id": user_id,
                    "p_amount": amount,
                    "p_reason": reason,
                    "p_source_type": source_type,
                    "p_source_id": source_id,
                    "p_training_id": training_id,
                }).execute()
        except Exception as exc:
            raise InfraError(f"Failed to grant XP: {exc}") from exc
        data = response.data
        if isinstance(data, list) and data:
            return data[0]
        if isinstance(data, dict):
            return data
        return None

    def list_xp_ledger(
        self,
        *,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[XpLedgerRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("xp_ledger")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list XP ledger: {exc}") from exc
        return response.data or []

    def get_daily_xp_total(self, *, user_id: str, date_str: str) -> int:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("daily_activity")
                .select("xp_earned")
                .eq("user_id", user_id)
                .eq("activity_date", date_str)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to get daily XP: {exc}") from exc
        if response.data:
            return response.data[0].get("xp_earned", 0)
        return 0

    # -- Gamification Profile -----------------------------------------------

    def get_profile(self, user_id: str) -> LearnerGamificationProfileRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_gamification_profile")
                .select("*")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch gamification profile: {exc}") from exc
        return response.data[0] if response.data else None

    def list_profiles_by_org(
        self,
        *,
        organization_id: str,
        limit: int = 100,
    ) -> list[LearnerGamificationProfileRow]:
        try:
            member_response = (
                self.client.table("organization_member")
                .select("user_id")
                .eq("organization_id", organization_id)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list profiles: {exc}") from exc

        user_ids = list({
            row["user_id"]
            for row in (member_response.data or [])
            if row.get("user_id")
        })
        if not user_ids:
            return []

        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_gamification_profile")
                .select("*")
                .in_("user_id", user_ids)
                .order("total_xp", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list profiles: {exc}") from exc

        return response.data or []

    def list_profiles(
        self,
        *,
        user_ids: list[str],
    ) -> dict[str, LearnerGamificationProfileRow]:
        if not user_ids:
            return {}
        try:
            response = (
                self.client.schema("RoleReady")
                .table("learner_gamification_profile")
                .select("*")
                .in_("user_id", list(set(user_ids)))
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch gamification profiles: {exc}") from exc
        return {row["user_id"]: row for row in (response.data or [])}

    # -- Streak -------------------------------------------------------------

    def recalculate_streak(self, user_id: str) -> int:
        try:
            response = self.client.rpc("recalculate_streak", {
                "p_user_id": user_id,
            }).execute()
        except Exception as exc:
            raise InfraError(f"Failed to recalculate streak: {exc}") from exc
        data = response.data
        if isinstance(data, int):
            return data
        if isinstance(data, list) and data:
            return data[0] if isinstance(data[0], int) else 0
        return 0

    # -- Daily Activity -----------------------------------------------------

    def get_daily_activity(
        self,
        *,
        user_id: str,
        activity_date: str,
    ) -> DailyActivityRow | None:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("daily_activity")
                .select("*")
                .eq("user_id", user_id)
                .eq("activity_date", activity_date)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to fetch daily activity: {exc}") from exc
        return response.data[0] if response.data else None

    def list_daily_activity(
        self,
        *,
        user_id: str,
        from_date: str,
        to_date: str,
    ) -> list[DailyActivityRow]:
        try:
            response = (
                self.client.schema("RoleReady")
                .table("daily_activity")
                .select("*")
                .eq("user_id", user_id)
                .gte("activity_date", from_date)
                .lte("activity_date", to_date)
                .order("activity_date")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list daily activity: {exc}") from exc
        return response.data or []

    def list_daily_activity_for_users(
        self,
        *,
        user_ids: list[str],
        from_date: str,
        to_date: str,
    ) -> list[DailyActivityRow]:
        unique_user_ids = list(set(user_ids))
        if not unique_user_ids:
            return []

        try:
            response = (
                self.client.schema("RoleReady")
                .table("daily_activity")
                .select("*")
                .in_("user_id", unique_user_ids)
                .gte("activity_date", from_date)
                .lte("activity_date", to_date)
                .order("activity_date")
                .execute()
            )
        except Exception as exc:
            raise InfraError(f"Failed to list daily activity: {exc}") from exc
        return response.data or []

    def increment_profile_metrics(
        self,
        *,
        user_id: str,
        total_watch_seconds: int = 0,
        total_listen_seconds: int = 0,
        total_lessons_completed: int = 0,
        total_steps_completed: int = 0,
        quiz_total_score: int = 0,
        quiz_total_max_score: int = 0,
    ) -> LearnerGamificationProfileRow:
        try:
            response = self.client.rpc("increment_gamification_profile", {
                    "p_user_id": user_id,
                    "p_total_watch_seconds": total_watch_seconds,
                    "p_total_listen_seconds": total_listen_seconds,
                    "p_total_lessons_completed": total_lessons_completed,
                    "p_total_steps_completed": total_steps_completed,
                    "p_quiz_total_score": quiz_total_score,
                    "p_quiz_total_max_score": quiz_total_max_score,
                }).execute()
        except Exception as exc:
            raise InfraError(f"Failed to increment gamification profile: {exc}") from exc
        data = response.data
        if isinstance(data, list) and data:
            return data[0]
        if isinstance(data, dict):
            return data
        raise InfraError("increment_gamification_profile returned no data")

    def increment_daily_activity(
        self,
        *,
        user_id: str,
        activity_date: str,
        xp_earned: int = 0,
        lessons_completed: int = 0,
        steps_completed: int = 0,
        watch_seconds: int = 0,
        listen_seconds: int = 0,
        quiz_attempts: int = 0,
    ) -> DailyActivityRow:
        try:
            response = self.client.rpc("increment_daily_activity", {
                    "p_user_id": user_id,
                    "p_activity_date": activity_date,
                    "p_xp_earned": xp_earned,
                    "p_lessons_completed": lessons_completed,
                    "p_steps_completed": steps_completed,
                    "p_watch_seconds": watch_seconds,
                    "p_listen_seconds": listen_seconds,
                    "p_quiz_attempts": quiz_attempts,
                }).execute()
        except Exception as exc:
            raise InfraError(f"Failed to increment daily activity: {exc}") from exc
        data = response.data
        if isinstance(data, list) and data:
            return data[0]
        if isinstance(data, dict):
            return data
        raise InfraError("increment_daily_activity returned no data")

-- wrapped in implicit transaction by supabase db push

CREATE OR REPLACE FUNCTION public.update_module_progress_atomic(
    p_assignment_id uuid,
    p_training_id uuid,
    p_module_id uuid,
    p_status text DEFAULT NULL,
    p_progress_pct integer DEFAULT NULL,
    p_last_position_seconds integer DEFAULT NULL,
    p_score integer DEFAULT NULL,
    p_max_score integer DEFAULT NULL
) RETURNS SETOF "RoleReady".module_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_progress "RoleReady".module_progress%ROWTYPE;
    v_existing "RoleReady".module_progress%ROWTYPE;
    v_now timestamptz := now();
    v_module_count integer;
    v_completed_module_count integer;
    v_any_engagement boolean;
    v_new_assignment_status text;
BEGIN
    IF p_status IS NULL
       AND p_progress_pct IS NULL
       AND p_last_position_seconds IS NULL
       AND p_score IS NULL
       AND p_max_score IS NULL THEN
        RAISE EXCEPTION 'At least one progress field is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "RoleReady".training_assignment
        WHERE id = p_assignment_id
          AND training_id = p_training_id
    ) THEN
        RAISE EXCEPTION 'Assignment does not belong to this training';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "RoleReady".training_module
        WHERE id = p_module_id
          AND training_id = p_training_id
    ) THEN
        RAISE EXCEPTION 'Module does not belong to this training';
    END IF;

    SELECT *
    INTO v_existing
    FROM "RoleReady".module_progress
    WHERE assignment_id = p_assignment_id
      AND module_id = p_module_id
    LIMIT 1;

    IF FOUND THEN
        UPDATE "RoleReady".module_progress
        SET
            status = COALESCE(p_status, v_existing.status),
            progress_pct = COALESCE(
                p_progress_pct,
                CASE
                    WHEN p_status = 'completed' THEN 100
                    ELSE v_existing.progress_pct
                END
            ),
            last_position_seconds = COALESCE(p_last_position_seconds, v_existing.last_position_seconds),
            score = COALESCE(p_score, v_existing.score),
            max_score = COALESCE(p_max_score, v_existing.max_score),
            attempts = CASE
                WHEN p_status = 'completed' OR p_score IS NOT NULL THEN v_existing.attempts + 1
                ELSE v_existing.attempts
            END,
            started_at = CASE
                WHEN COALESCE(p_status, v_existing.status) IN ('in_progress', 'completed')
                     AND v_existing.started_at IS NULL THEN v_now
                ELSE v_existing.started_at
            END,
            completed_at = CASE
                WHEN COALESCE(p_status, v_existing.status) = 'completed'
                THEN COALESCE(v_existing.completed_at, v_now)
                ELSE NULL
            END,
            updated_at = v_now
        WHERE id = v_existing.id
        RETURNING *
        INTO v_progress;
    ELSE
        INSERT INTO "RoleReady".module_progress (
            assignment_id,
            module_id,
            status,
            progress_pct,
            last_position_seconds,
            score,
            max_score,
            attempts,
            started_at,
            completed_at,
            updated_at
        )
        VALUES (
            p_assignment_id,
            p_module_id,
            COALESCE(p_status, 'not_started'),
            COALESCE(
                p_progress_pct,
                CASE
                    WHEN p_status = 'completed' THEN 100
                    ELSE 0
                END
            ),
            p_last_position_seconds,
            p_score,
            p_max_score,
            CASE
                WHEN p_status = 'completed' OR p_score IS NOT NULL THEN 1
                ELSE 0
            END,
            CASE
                WHEN COALESCE(p_status, 'not_started') IN ('in_progress', 'completed') THEN v_now
                ELSE NULL
            END,
            CASE
                WHEN p_status = 'completed' THEN v_now
                ELSE NULL
            END,
            v_now
        )
        RETURNING *
        INTO v_progress;
    END IF;

    SELECT COUNT(*)
    INTO v_module_count
    FROM "RoleReady".training_module
    WHERE training_id = p_training_id;

    SELECT COUNT(*)
    INTO v_completed_module_count
    FROM "RoleReady".training_module
    JOIN "RoleReady".module_progress
      ON module_progress.module_id = training_module.id
     AND module_progress.assignment_id = p_assignment_id
     AND module_progress.status = 'completed'
    WHERE training_module.training_id = p_training_id;

    SELECT EXISTS (
        SELECT 1
        FROM "RoleReady".module_progress
        WHERE assignment_id = p_assignment_id
          AND (
              status IN ('in_progress', 'completed')
              OR progress_pct > 0
              OR score IS NOT NULL
              OR last_position_seconds IS NOT NULL
          )
    )
    INTO v_any_engagement;

    IF v_module_count > 0
       AND v_completed_module_count >= v_module_count THEN
        v_new_assignment_status := 'completed';
    ELSIF v_any_engagement THEN
        v_new_assignment_status := 'in_progress';
    ELSE
        v_new_assignment_status := 'assigned';
    END IF;

    UPDATE "RoleReady".training_assignment
    SET
        status = v_new_assignment_status,
        started_at = CASE
            WHEN v_new_assignment_status IN ('in_progress', 'completed')
                 AND started_at IS NULL THEN v_now
            WHEN v_new_assignment_status = 'assigned' THEN NULL
            ELSE started_at
        END,
        completed_at = CASE
            WHEN v_new_assignment_status = 'completed'
            THEN COALESCE(completed_at, v_now)
            ELSE NULL
        END,
        updated_at = v_now
    WHERE id = p_assignment_id;

    RETURN NEXT v_progress;
END;
$$;

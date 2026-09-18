-- =============================================================
-- Training RPC functions for atomic multi-write workflows.
--
-- These functions move orchestration that spans multiple tables
-- into PostgreSQL transaction boundaries so the backend does not
-- rely on best-effort cleanup after partial failure.
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_training_from_project_atomic(
    p_project_id uuid,
    p_organization_id uuid,
    p_created_by uuid,
    p_title text,
    p_description text DEFAULT NULL,
    p_due_date timestamptz DEFAULT NULL,
    p_asset_types text[] DEFAULT ARRAY[]::text[],
    p_assignee_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_publish boolean DEFAULT true
) RETURNS SETOF "RoleReady".training
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_training "RoleReady".training%ROWTYPE;
    v_missing_asset_types text[];
    v_missing_assignee_ids uuid[];
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "RoleReady".project
        WHERE id = p_project_id
          AND organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Project % does not belong to organization %', p_project_id, p_organization_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM organization_member
        WHERE organization_id = p_organization_id
          AND user_id = p_created_by
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'created_by must be an admin of the organization';
    END IF;

    IF COALESCE(array_length(p_asset_types, 1), 0) = 0 THEN
        RAISE EXCEPTION 'At least one asset type is required';
    END IF;

    WITH requested_assets AS (
        SELECT DISTINCT ON (asset_type)
            asset_type,
            ordinality
        FROM unnest(p_asset_types) WITH ORDINALITY AS requested(asset_type, ordinality)
        ORDER BY asset_type, ordinality
    ),
    available_assets AS (
        SELECT 'summary'::text AS asset_type
        WHERE EXISTS (
            SELECT 1
            FROM "RoleReady".project_summary
            WHERE project_id = p_project_id
        )
        UNION ALL
        SELECT 'infographic'::text
        WHERE EXISTS (
            SELECT 1
            FROM "RoleReady".project_infographic
            WHERE project_id = p_project_id
              AND COALESCE(is_processed, true)
        )
        UNION ALL
        SELECT 'mindmap'::text
        WHERE EXISTS (
            SELECT 1
            FROM "RoleReady".project_mindmap
            WHERE project_id = p_project_id
              AND COALESCE(is_processed, true)
        )
        UNION ALL
        SELECT 'audio'::text
        WHERE EXISTS (
            SELECT 1
            FROM "RoleReady".project_audio
            WHERE project_id = p_project_id
              AND COALESCE(is_processed, true)
        )
        UNION ALL
        SELECT 'video'::text
        WHERE EXISTS (
            SELECT 1
            FROM "RoleReady".project_video
            WHERE project_id = p_project_id
              AND COALESCE(is_processed, true)
        )
    )
    SELECT array_agg(requested_assets.asset_type ORDER BY requested_assets.ordinality)
    INTO v_missing_asset_types
    FROM requested_assets
    LEFT JOIN available_assets
      ON available_assets.asset_type = requested_assets.asset_type
    WHERE available_assets.asset_type IS NULL;

    IF COALESCE(array_length(v_missing_asset_types, 1), 0) > 0 THEN
        RAISE EXCEPTION 'Selected assets are not available for this project: %',
            array_to_string(v_missing_asset_types, ', ');
    END IF;

    IF COALESCE(array_length(p_assignee_ids, 1), 0) > 0 THEN
        WITH requested_assignees AS (
            SELECT DISTINCT ON (user_id)
                user_id,
                ordinality
            FROM unnest(p_assignee_ids) WITH ORDINALITY AS requested(user_id, ordinality)
            ORDER BY user_id, ordinality
        ),
        member_users AS (
            SELECT organization_member.user_id
            FROM organization_member
            WHERE organization_id = p_organization_id
              AND user_id = ANY(p_assignee_ids)
        )
        SELECT array_agg(requested_assignees.user_id ORDER BY requested_assignees.ordinality)
        INTO v_missing_assignee_ids
        FROM requested_assignees
        LEFT JOIN member_users
          ON member_users.user_id = requested_assignees.user_id
        WHERE member_users.user_id IS NULL;

        IF COALESCE(array_length(v_missing_assignee_ids, 1), 0) > 0 THEN
            RAISE EXCEPTION 'Assignees must belong to the organization: %',
                array_to_string(
                    ARRAY(SELECT value::text FROM unnest(v_missing_assignee_ids) AS value),
                    ', '
                );
        END IF;
    END IF;

    INSERT INTO "RoleReady".training (
        project_id,
        title,
        description,
        status,
        created_by
    )
    VALUES (
        p_project_id,
        p_title,
        p_description,
        CASE WHEN p_publish THEN 'published' ELSE 'draft' END,
        p_created_by
    )
    RETURNING *
    INTO v_training;

    WITH requested_assets AS (
        SELECT DISTINCT ON (asset_type)
            asset_type,
            ordinality
        FROM unnest(p_asset_types) WITH ORDINALITY AS requested(asset_type, ordinality)
        ORDER BY asset_type, ordinality
    )
    INSERT INTO "RoleReady".training_module (
        id,
        training_id,
        title,
        description,
        module_type,
        sort_order,
        content_url,
        content_body,
        is_required,
        estimated_duration_minutes,
        created_at,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        v_training.id,
        CASE requested_assets.asset_type
            WHEN 'summary' THEN 'Summary'
            WHEN 'infographic' THEN 'Infographic'
            WHEN 'mindmap' THEN 'Mindmap'
            WHEN 'audio' THEN 'Audio Narration'
            WHEN 'video' THEN 'Video'
            ELSE initcap(requested_assets.asset_type)
        END,
        NULL,
        requested_assets.asset_type,
        requested_assets.ordinality - 1,
        NULL,
        NULL,
        true,
        NULL,
        v_training.created_at,
        v_training.updated_at
    FROM requested_assets
    ORDER BY requested_assets.ordinality;

    IF COALESCE(array_length(p_assignee_ids, 1), 0) > 0 THEN
        WITH requested_assignees AS (
            SELECT DISTINCT ON (user_id)
                user_id,
                ordinality
            FROM unnest(p_assignee_ids) WITH ORDINALITY AS requested(user_id, ordinality)
            ORDER BY user_id, ordinality
        )
        INSERT INTO "RoleReady".training_assignment (
            id,
            training_id,
            user_id,
            assigned_by,
            status,
            due_date,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            v_training.id,
            requested_assignees.user_id,
            p_created_by,
            'assigned',
            p_due_date,
            v_training.created_at,
            v_training.updated_at
        FROM requested_assignees
        ORDER BY requested_assignees.ordinality;
    END IF;

    RETURN NEXT v_training;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_training_modules_atomic(
    p_training_id uuid,
    p_modules jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_duplicate_count integer;
    v_missing_module_ids uuid[];
BEGIN
    IF jsonb_typeof(p_modules) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'modules payload must be a JSON array';
    END IF;

    IF jsonb_array_length(p_modules) = 0 THEN
        RAISE EXCEPTION 'modules payload must not be empty';
    END IF;

    WITH parsed_modules AS (
        SELECT
            (item->>'module_id')::uuid AS module_id,
            (item->>'sort_order')::integer AS sort_order
        FROM jsonb_array_elements(p_modules) AS item
    )
    SELECT COUNT(*) - COUNT(DISTINCT module_id)
    INTO v_duplicate_count
    FROM parsed_modules;

    IF v_duplicate_count > 0 THEN
        RAISE EXCEPTION 'Duplicate module IDs are not allowed';
    END IF;

    WITH parsed_modules AS (
        SELECT
            (item->>'module_id')::uuid AS module_id
        FROM jsonb_array_elements(p_modules) AS item
    )
    SELECT array_agg(parsed_modules.module_id)
    INTO v_missing_module_ids
    FROM parsed_modules
    LEFT JOIN "RoleReady".training_module
      ON training_module.id = parsed_modules.module_id
     AND training_module.training_id = p_training_id
    WHERE training_module.id IS NULL;

    IF COALESCE(array_length(v_missing_module_ids, 1), 0) > 0 THEN
        RAISE EXCEPTION 'Modules do not belong to this training: %',
            array_to_string(
                ARRAY(SELECT value::text FROM unnest(v_missing_module_ids) AS value),
                ', '
            );
    END IF;

    WITH parsed_modules AS (
        SELECT
            (item->>'module_id')::uuid AS module_id,
            (item->>'sort_order')::integer AS sort_order
        FROM jsonb_array_elements(p_modules) AS item
    )
    UPDATE "RoleReady".training_module
    SET
        sort_order = parsed_modules.sort_order,
        updated_at = now()
    FROM parsed_modules
    WHERE training_module.id = parsed_modules.module_id
      AND training_module.training_id = p_training_id;
END;
$$;

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
    v_required_module_count integer;
    v_completed_required_count integer;
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
                WHEN COALESCE(p_status, v_existing.status) = 'completed' THEN v_now
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
    INTO v_required_module_count
    FROM "RoleReady".training_module
    WHERE training_id = p_training_id
      AND is_required;

    SELECT COUNT(*)
    INTO v_completed_required_count
    FROM "RoleReady".training_module
    JOIN "RoleReady".module_progress
      ON module_progress.module_id = training_module.id
     AND module_progress.assignment_id = p_assignment_id
     AND module_progress.status = 'completed'
    WHERE training_module.training_id = p_training_id
      AND training_module.is_required;

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

    IF v_required_module_count > 0
       AND v_completed_required_count >= v_required_module_count THEN
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
            WHEN v_new_assignment_status = 'completed' THEN v_now
            ELSE NULL
        END,
        updated_at = v_now
    WHERE id = p_assignment_id;

    RETURN NEXT v_progress;
END;
$$;

REVOKE ALL ON FUNCTION public.create_training_from_project_atomic(
    uuid, uuid, uuid, text, text, timestamptz, text[], uuid[], boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_from_project_atomic(
    uuid, uuid, uuid, text, text, timestamptz, text[], uuid[], boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.reorder_training_modules_atomic(
    uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_training_modules_atomic(
    uuid, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.update_module_progress_atomic(
    uuid, uuid, uuid, text, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_module_progress_atomic(
    uuid, uuid, uuid, text, integer, integer, integer, integer
) TO service_role;

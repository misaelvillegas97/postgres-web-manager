-- Migration 002: Seed workspace and users used by dev-mode mock auth.

INSERT INTO workspaces (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001',
        'Development Workspace',
        'development')
ON CONFLICT (id) DO UPDATE
    SET name       = EXCLUDED.name,
        slug       = EXCLUDED.slug,
        updated_at = NOW();

INSERT INTO users (id, workspace_id, email, display_name, role)
VALUES ('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000001',
        'admin@pgstudio.local',
        'Admin User',
        'OWNER'),
       ('00000000-0000-4000-8000-000000000102',
        '00000000-0000-4000-8000-000000000001',
        'dev@pgstudio.local',
        'Developer',
        'DEVELOPER')
ON CONFLICT (workspace_id, email) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        role         = EXCLUDED.role,
        updated_at   = NOW();

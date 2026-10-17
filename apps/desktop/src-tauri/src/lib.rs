mod commands;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create local metadata tables",
            sql: r#"
            CREATE TABLE IF NOT EXISTS recent_workspaces (
                path TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                opened_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recovery_snapshots (
                workspace_path TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                markdown TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (workspace_path, relative_path)
            );
            CREATE TABLE IF NOT EXISTS sync_state (
                workspace_path TEXT PRIMARY KEY NOT NULL,
                remote_workspace_id TEXT NOT NULL,
                cursor INTEGER,
                enabled INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "track document sync bases",
            sql: r#"
                CREATE TABLE IF NOT EXISTS sync_documents (
                    workspace_path TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    base_revision INTEGER NOT NULL,
                    base_hash TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (workspace_path, relative_path)
                );
            "#,
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:writree.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::open_workspace,
            commands::create_document,
            commands::rename_document,
            commands::read_document,
            commands::save_document,
            commands::save_image,
            commands::read_workspace_image,
            commands::apply_sync_document,
            commands::write_conflict_copy,
            commands::git_status,
            commands::git_diff,
            commands::git_commit,
            commands::git_push,
            commands::store_refresh_token,
            commands::load_refresh_token,
            commands::delete_refresh_token,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Writree");
}

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output};
use uuid::Uuid;

const SKIPPED_DIRECTORIES: &[&str] =
    &[".git", "node_modules", "target", "build", "dist", ".gradle"];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    name: String,
    path: String,
    kind: &'static str,
    children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    root_path: String,
    name: String,
    files: Vec<FileNode>,
    git_repository: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSnapshot {
    relative_path: String,
    markdown: String,
    content_hash: String,
    modified_at: i64,
    line_ending: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentRequest {
    root_path: String,
    relative_path: String,
    markdown: String,
    expected_hash: String,
    line_ending: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentResult {
    content_hash: String,
    modified_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySyncDocumentRequest {
    root_path: String,
    relative_path: String,
    markdown: Option<String>,
    expected_file_hash: Option<String>,
    deleted: bool,
    line_ending: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    path: String,
    state: String,
    staged: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    branch: Option<String>,
    upstream: Option<String>,
    operation: String,
    entries: Vec<GitStatusEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitRequest {
    root_path: String,
    paths: Vec<String>,
    message: String,
}

#[derive(Debug, Serialize)]
pub struct GitCommitResult {
    commit: String,
    summary: String,
}

#[tauri::command]
pub fn open_workspace(root_path: String) -> Result<WorkspaceSnapshot, String> {
    let root = canonical_directory(&root_path)?;
    let files = read_tree(&root, &root, 0)?;
    let git_repository = git_output(&root, &["rev-parse", "--is-inside-work-tree"])
        .map(|output| output.status.success())
        .unwrap_or(false);
    Ok(WorkspaceSnapshot {
        name: root
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("workspace")
            .to_string(),
        root_path: root.to_string_lossy().to_string(),
        files,
        git_repository,
    })
}

#[tauri::command]
pub fn create_document(
    root_path: String,
    relative_path: String,
) -> Result<DocumentSnapshot, String> {
    let root = canonical_directory(&root_path)?;
    let relative = markdown_relative_path(&relative_path)?;
    let path = workspace_destination(&root, &relative)?;
    ensure_markdown(&path)?;
    if path.exists() {
        return Err("같은 이름의 파일이 이미 있습니다.".into());
    }

    let title = path
        .file_stem()
        .and_then(OsStr::to_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("새 문서");
    let markdown = format!("# {title}\n\n");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(io_error("새 문서를 만들지 못했습니다"))?;
    file.write_all(markdown.as_bytes())
        .map_err(io_error("새 문서를 쓰지 못했습니다"))?;
    file.sync_all()
        .map_err(io_error("새 문서를 디스크에 반영하지 못했습니다"))?;

    read_document(root.to_string_lossy().to_string(), relative)
}

#[tauri::command]
pub fn read_document(root_path: String, relative_path: String) -> Result<DocumentSnapshot, String> {
    let root = canonical_directory(&root_path)?;
    let path = existing_workspace_file(&root, &relative_path)?;
    ensure_markdown(&path)?;
    let bytes = fs::read(&path).map_err(io_error("문서를 읽지 못했습니다"))?;
    let raw = String::from_utf8(bytes.clone())
        .map_err(|_| "지원하지 않는 인코딩입니다. Writree는 UTF-8 문서만 엽니다.".to_string())?;
    let line_ending = if raw.contains("\r\n") { "crlf" } else { "lf" };
    let markdown = raw.replace("\r\n", "\n");
    let metadata = fs::metadata(&path).map_err(io_error("문서 정보를 읽지 못했습니다"))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default();
    Ok(DocumentSnapshot {
        relative_path: normalize_relative(&relative_path)?,
        markdown,
        content_hash: sha256(&bytes),
        modified_at,
        line_ending,
    })
}

#[tauri::command]
pub fn save_document(request: SaveDocumentRequest) -> Result<SaveDocumentResult, String> {
    let root = canonical_directory(&request.root_path)?;
    let path = existing_workspace_file(&root, &request.relative_path)?;
    ensure_markdown(&path)?;
    let current = fs::read(&path).map_err(io_error("저장 전 원본을 읽지 못했습니다"))?;
    let current_hash = sha256(&current);
    if !request.expected_hash.is_empty() && current_hash != request.expected_hash {
        return Err("FILE_CONFLICT: 파일이 다른 프로그램에서 변경되어 덮어쓰지 않았습니다.".into());
    }
    let normalized = request.markdown.replace("\r\n", "\n");
    let output = if request.line_ending == "crlf" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    atomic_write(&path, output.as_bytes())?;
    let metadata = fs::metadata(&path).map_err(io_error("저장된 문서 정보를 읽지 못했습니다"))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default();
    Ok(SaveDocumentResult {
        content_hash: sha256(output.as_bytes()),
        modified_at,
    })
}

#[tauri::command]
pub fn save_image(root_path: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 25 * 1024 * 1024 {
        return Err("이미지는 1바이트 이상 25MB 이하여야 합니다.".into());
    }
    let root = canonical_directory(&root_path)?;
    let assets = root.join("assets");
    fs::create_dir_all(&assets).map_err(io_error("assets 폴더를 만들지 못했습니다"))?;
    let assets =
        dunce::canonicalize(&assets).map_err(io_error("assets 폴더를 확인하지 못했습니다"))?;
    ensure_within(&root, &assets)?;
    let safe_name = sanitize_file_name(&file_name);
    let extension = Path::new(&safe_name)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("PNG, JPG, GIF, WebP, SVG 이미지만 저장할 수 있습니다.".into());
    }
    let stem = Path::new(&safe_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("image");
    let mut destination = assets.join(&safe_name);
    let mut counter = 2;
    while destination.exists() {
        destination = assets.join(format!("{stem}-{counter}.{extension}"));
        counter += 1;
    }
    atomic_write(&destination, &bytes)?;
    Ok(format!(
        "assets/{}",
        destination
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("image")
    ))
}

#[tauri::command]
pub fn read_workspace_image(root_path: String, relative_path: String) -> Result<String, String> {
    let root = canonical_directory(&root_path)?;
    let relative = normalize_relative(&relative_path)?;
    if !relative.starts_with("assets/") {
        return Err("assets 폴더 안의 이미지만 표시할 수 있습니다.".into());
    }
    let path = existing_workspace_file(&root, &relative)?;
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("지원하지 않는 이미지 형식입니다.".into());
    }
    let bytes = fs::read(path).map_err(io_error("이미지를 읽지 못했습니다"))?;
    if bytes.len() > 25 * 1024 * 1024 {
        return Err("25MB보다 큰 이미지는 미리 볼 수 없습니다.".into());
    }
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => return Err("지원하지 않는 이미지 형식입니다.".into()),
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn apply_sync_document(
    request: ApplySyncDocumentRequest,
) -> Result<Option<SaveDocumentResult>, String> {
    let root = canonical_directory(&request.root_path)?;
    let path = workspace_destination(&root, &request.relative_path)?;
    ensure_markdown(&path)?;

    if path.exists() {
        let current = fs::read(&path).map_err(io_error("동기화 전 원본을 읽지 못했습니다"))?;
        let expected = request.expected_file_hash.as_deref().ok_or_else(|| {
            "SYNC_CONFLICT: 기존 파일의 기준 해시가 없어 덮어쓰지 않았습니다.".to_string()
        })?;
        if sha256(&current) != expected {
            return Err(
                "SYNC_CONFLICT: 로컬 파일이 기준본과 달라 원격 변경을 적용하지 않았습니다.".into(),
            );
        }
    } else if request.expected_file_hash.is_some() {
        return Err(
            "SYNC_CONFLICT: 기준 파일이 로컬에서 사라져 원격 변경을 적용하지 않았습니다.".into(),
        );
    }

    if request.deleted {
        if path.exists() {
            move_to_sync_trash(&root, &path, &request.relative_path)?;
        }
        return Ok(None);
    }

    let normalized = request
        .markdown
        .ok_or_else(|| "원격 문서 본문이 없습니다.".to_string())?
        .replace("\r\n", "\n");
    let output = if request.line_ending.as_deref() == Some("crlf") {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    atomic_write(&path, output.as_bytes())?;
    let metadata = fs::metadata(&path).map_err(io_error("동기화된 문서 정보를 읽지 못했습니다"))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default();
    Ok(Some(SaveDocumentResult {
        content_hash: sha256(output.as_bytes()),
        modified_at,
    }))
}

#[tauri::command]
pub fn write_conflict_copy(
    root_path: String,
    relative_path: String,
    markdown: String,
    device_name: String,
) -> Result<String, String> {
    let root = canonical_directory(&root_path)?;
    let normalized = normalize_relative(&relative_path)?;
    let source = Path::new(&normalized);
    ensure_markdown(source)?;
    let parent = source.parent().unwrap_or_else(|| Path::new(""));
    let stem = source
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("document");
    let extension = source.extension().and_then(OsStr::to_str).unwrap_or("md");
    let device = sanitize_component(&device_name);
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let mut name = format!("{stem}.conflict-{timestamp}-{device}.{extension}");
    let mut relative = parent.join(&name).to_string_lossy().replace('\\', "/");
    let mut destination = workspace_destination(&root, &relative)?;
    if destination.exists() {
        name = format!(
            "{stem}.conflict-{timestamp}-{device}-{}.{}",
            Uuid::new_v4(),
            extension
        );
        relative = parent.join(name).to_string_lossy().replace('\\', "/");
        destination = workspace_destination(&root, &relative)?;
    }
    atomic_write(&destination, markdown.replace("\r\n", "\n").as_bytes())?;
    Ok(relative)
}

#[tauri::command]
pub fn git_status(root_path: String) -> Result<GitSnapshot, String> {
    let root = canonical_directory(&root_path)?;
    ensure_git_repository(&root)?;
    let branch = git_text_allow_failure(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let upstream = git_text_allow_failure(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"])?;
    let output = checked_git(
        &root,
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )?;
    let mut entries = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[..2];
        let mut path = line[3..].trim_matches('"').to_string();
        if let Some((_, renamed)) = path.rsplit_once(" -> ") {
            path = renamed.to_string();
        }
        entries.push(GitStatusEntry {
            path: path.replace('\\', "/"),
            state: git_state(status).to_string(),
            staged: status.as_bytes()[0] != b' ' && status.as_bytes()[0] != b'?',
        });
    }
    Ok(GitSnapshot {
        branch,
        upstream,
        operation: git_operation(&root)?,
        entries,
    })
}

#[tauri::command]
pub fn git_diff(root_path: String, relative_path: String) -> Result<String, String> {
    let root = canonical_directory(&root_path)?;
    ensure_git_repository(&root)?;
    let relative = validate_git_path(&root, &relative_path)?;
    let tracked = git_output(&root, &["ls-files", "--error-unmatch", "--", &relative])?
        .status
        .success();
    let output = if tracked {
        checked_git(&root, &["diff", "--no-ext-diff", "--", &relative])?
    } else {
        let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
        git_output(&root, &["diff", "--no-index", "--", null_device, &relative])?
    };
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn git_commit(request: GitCommitRequest) -> Result<GitCommitResult, String> {
    let root = canonical_directory(&request.root_path)?;
    ensure_git_repository(&root)?;
    if request.message.trim().is_empty() {
        return Err("커밋 메시지를 입력하세요.".into());
    }
    if request.message.len() > 500 {
        return Err("커밋 메시지는 500자 이하여야 합니다.".into());
    }
    if request.paths.is_empty() {
        return Err("커밋할 파일을 선택하세요.".into());
    }
    if git_operation(&root)? != "normal" {
        return Err("merge/rebase/cherry-pick 진행 중에는 Writree에서 커밋할 수 없습니다.".into());
    }
    if git_text_allow_failure(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"])?.is_none() {
        return Err("detached HEAD 상태에서는 Writree에서 커밋할 수 없습니다.".into());
    }

    let mut paths = Vec::new();
    for path in request.paths {
        paths.push(validate_git_path(&root, &path)?);
    }
    let mut args = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    checked_git(&root, &args)?;

    let mut commit_args = vec!["commit", "--only", "-m", request.message.trim(), "--"];
    commit_args.extend(paths.iter().map(String::as_str));
    let output = checked_git(&root, &commit_args)?;
    let commit = git_text(&root, &["rev-parse", "HEAD"])?;
    Ok(GitCommitResult {
        commit,
        summary: String::from_utf8_lossy(&output.stdout).trim().to_string(),
    })
}

#[tauri::command]
pub fn git_push(root_path: String) -> Result<String, String> {
    let root = canonical_directory(&root_path)?;
    ensure_git_repository(&root)?;
    if git_operation(&root)? != "normal" {
        return Err("merge/rebase/cherry-pick 진행 중에는 push할 수 없습니다.".into());
    }
    if git_text_allow_failure(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"])?.is_none() {
        return Err("현재 브랜치에 upstream이 없습니다. 터미널에서 git push -u origin <branch>를 먼저 실행하세요.".into());
    }
    let output = checked_git(&root, &["push"])?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(if text.trim().is_empty() {
        "Push 완료".into()
    } else {
        text.trim().into()
    })
}

#[tauri::command]
pub fn store_refresh_token(token: String) -> Result<(), String> {
    keyring::Entry::new("io.github.writree.desktop", "refresh-token")
        .map_err(|error| error.to_string())?
        .set_password(&token)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_refresh_token() -> Result<Option<String>, String> {
    match keyring::Entry::new("io.github.writree.desktop", "refresh-token")
        .map_err(|error| error.to_string())?
        .get_password()
    {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn delete_refresh_token() -> Result<(), String> {
    match keyring::Entry::new("io.github.writree.desktop", "refresh-token")
        .map_err(|error| error.to_string())?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn read_tree(root: &Path, directory: &Path, depth: usize) -> Result<Vec<FileNode>, String> {
    if depth > 16 {
        return Ok(Vec::new());
    }
    let mut nodes = Vec::new();
    let entries = fs::read_dir(directory).map_err(io_error("워크스페이스를 읽지 못했습니다"))?;
    for entry in entries {
        let entry = entry.map_err(io_error("워크스페이스 항목을 읽지 못했습니다"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIPPED_DIRECTORIES.contains(&name.as_str()) {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(io_error("파일 종류를 확인하지 못했습니다"))?;
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "워크스페이스 경로를 계산하지 못했습니다.".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if file_type.is_dir() {
            let children = read_tree(root, &path, depth + 1)?;
            if !children.is_empty() {
                nodes.push(FileNode {
                    name,
                    path: relative,
                    kind: "directory",
                    children: Some(children),
                });
            }
        } else if is_markdown(&path) {
            nodes.push(FileNode {
                name,
                path: relative,
                kind: "file",
                children: None,
            });
        }
    }
    nodes.sort_by(|a, b| {
        (a.kind != "directory", a.name.to_ascii_lowercase())
            .cmp(&(b.kind != "directory", b.name.to_ascii_lowercase()))
    });
    Ok(nodes)
}

fn canonical_directory(value: &str) -> Result<PathBuf, String> {
    let path =
        dunce::canonicalize(value).map_err(io_error("워크스페이스 폴더를 찾지 못했습니다"))?;
    if !path.is_dir() {
        return Err("워크스페이스 경로가 폴더가 아닙니다.".into());
    }
    Ok(path)
}

fn normalize_relative(value: &str) -> Result<String, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("워크스페이스 밖의 경로는 사용할 수 없습니다.".into());
    }
    Ok(path.to_string_lossy().replace('\\', "/"))
}

fn markdown_relative_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("파일 이름을 입력하세요.".into());
    }
    let mut relative = normalize_relative(trimmed)?;
    if relative
        .split('/')
        .any(|part| part.is_empty() || part.starts_with('.'))
    {
        return Err("워크스페이스 안의 올바른 파일 이름을 입력하세요.".into());
    }
    if Path::new(&relative).extension().is_none() {
        relative.push_str(".md");
    }
    ensure_markdown(Path::new(&relative))?;
    Ok(relative)
}

fn existing_workspace_file(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = normalize_relative(relative)?;
    let path =
        dunce::canonicalize(root.join(relative)).map_err(io_error("파일을 찾지 못했습니다"))?;
    ensure_within(root, &path)?;
    if !path.is_file() {
        return Err("선택한 경로가 파일이 아닙니다.".into());
    }
    Ok(path)
}

fn workspace_destination(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = normalize_relative(relative)?;
    let candidate = root.join(relative);
    if candidate.exists() {
        let canonical = dunce::canonicalize(&candidate)
            .map_err(io_error("워크스페이스 파일을 확인하지 못했습니다"))?;
        ensure_within(root, &canonical)?;
        return Ok(canonical);
    }
    let parent = candidate
        .parent()
        .ok_or_else(|| "파일의 상위 폴더를 찾지 못했습니다.".to_string())?;
    fs::create_dir_all(parent).map_err(io_error("문서 폴더를 만들지 못했습니다"))?;
    let canonical_parent =
        dunce::canonicalize(parent).map_err(io_error("문서 폴더를 확인하지 못했습니다"))?;
    ensure_within(root, &canonical_parent)?;
    let file_name = candidate
        .file_name()
        .ok_or_else(|| "파일 이름이 올바르지 않습니다.".to_string())?;
    Ok(canonical_parent.join(file_name))
}

fn ensure_within(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("워크스페이스 밖의 경로는 사용할 수 없습니다.".into())
    }
}

fn ensure_markdown(path: &Path) -> Result<(), String> {
    if is_markdown(path) {
        Ok(())
    } else {
        Err("Markdown 파일만 편집할 수 있습니다.".into())
    }
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown")
    )
}

fn validate_git_path(root: &Path, value: &str) -> Result<String, String> {
    let relative = normalize_relative(value)?;
    let joined = root.join(&relative);
    if joined.exists() {
        let canonical =
            dunce::canonicalize(&joined).map_err(io_error("Git 경로를 확인하지 못했습니다"))?;
        ensure_within(root, &canonical)?;
    }
    let extension = joined
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = extension == "md"
        || extension == "markdown"
        || (relative.starts_with("assets/") && IMAGE_EXTENSIONS.contains(&extension.as_str()));
    if !allowed {
        return Err(format!(
            "Writree에서는 Markdown과 assets 이미지 파일만 커밋할 수 있습니다: {relative}"
        ));
    }
    Ok(relative)
}

fn ensure_git_repository(root: &Path) -> Result<(), String> {
    let output = git_output(root, &["rev-parse", "--is-inside-work-tree"])?;
    if output.status.success() {
        Ok(())
    } else {
        Err("Git 저장소가 아닙니다.".into())
    }
}

fn git_output(root: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|error| format!("Git을 실행하지 못했습니다. Git 설치를 확인하세요: {error}"))
}

fn checked_git(root: &Path, args: &[&str]) -> Result<Output, String> {
    let output = git_output(root, args)?;
    if output.status.success() {
        return Ok(output);
    }
    let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if message.is_empty() {
        format!("Git 명령이 실패했습니다: git {}", args.join(" "))
    } else {
        message
    })
}

fn git_text(root: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&checked_git(root, args)?.stdout)
        .trim()
        .to_string())
}

fn git_text_allow_failure(root: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let output = git_output(root, args)?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!value.is_empty()).then_some(value))
}

fn git_operation(root: &Path) -> Result<String, String> {
    let git_dir_value = git_text(root, &["rev-parse", "--git-dir"])?;
    let git_dir_path = PathBuf::from(git_dir_value);
    let git_dir = if git_dir_path.is_absolute() {
        git_dir_path
    } else {
        root.join(git_dir_path)
    };
    if git_dir.join("MERGE_HEAD").exists() {
        return Ok("merge".into());
    }
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        return Ok("rebase".into());
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return Ok("cherry-pick".into());
    }
    Ok("normal".into())
}

fn git_state(status: &str) -> &'static str {
    if status.contains('U') || matches!(status, "AA" | "DD") {
        "conflicted"
    } else if status == "??" {
        "untracked"
    } else if status.contains('R') {
        "renamed"
    } else if status.contains('D') {
        "deleted"
    } else if status.contains('A') {
        "added"
    } else {
        "modified"
    }
}

fn sanitize_file_name(value: &str) -> String {
    let name = Path::new(value)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("image.png");
    let sanitized: String = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let compact = sanitized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        format!("image-{}.png", Uuid::new_v4())
    } else {
        compact
    }
}

fn sanitize_component(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let compact = sanitized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        "remote".into()
    } else {
        compact
    }
}

fn move_to_sync_trash(root: &Path, source: &Path, relative: &str) -> Result<(), String> {
    let trash_root = root
        .join(".writree-trash")
        .join(Utc::now().format("%Y%m%d-%H%M%S").to_string())
        .join(Uuid::new_v4().to_string());
    let destination = trash_root.join(normalize_relative(relative)?);
    let parent = destination
        .parent()
        .ok_or_else(|| "휴지통 경로를 만들지 못했습니다.".to_string())?;
    fs::create_dir_all(parent).map_err(io_error("동기화 휴지통을 만들지 못했습니다"))?;
    fs::rename(source, destination).map_err(io_error("삭제된 문서를 휴지통으로 옮기지 못했습니다"))
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "파일의 상위 폴더를 찾지 못했습니다.".to_string())?;
    let temp = parent.join(format!(".writree-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(io_error("임시 저장 파일을 만들지 못했습니다"))?;
        file.write_all(bytes)
            .map_err(io_error("임시 저장 파일을 쓰지 못했습니다"))?;
        file.sync_all()
            .map_err(io_error("임시 저장 파일을 디스크에 반영하지 못했습니다"))?;
        replace_file(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let success = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if success == 0 {
        Err(format!(
            "파일을 원자적으로 교체하지 못했습니다: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination).map_err(io_error("파일을 원자적으로 교체하지 못했습니다"))
}

fn io_error(context: &'static str) -> impl FnOnce(std::io::Error) -> String {
    move |error| format!("{context}: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_parent_directory_paths() {
        assert!(normalize_relative("../secret.md").is_err());
        assert!(normalize_relative("docs/guide.md").is_ok());
    }

    #[test]
    fn creates_a_markdown_document_without_overwriting() {
        let directory = tempdir().unwrap();
        let root = directory.path().to_string_lossy().to_string();
        let created = create_document(root.clone(), "notes/첫 글".into()).unwrap();
        assert_eq!(created.relative_path, "notes/첫 글.md");
        assert_eq!(created.markdown, "# 첫 글\n\n");
        assert!(create_document(root, "notes/첫 글.md".into()).is_err());
    }

    #[test]
    fn rejects_hidden_documents_that_the_file_tree_cannot_show() {
        let directory = tempdir().unwrap();
        let root = directory.path().to_string_lossy().to_string();
        assert!(create_document(root, ".hidden.md".into()).is_err());
    }

    #[test]
    fn sanitizes_image_file_names() {
        assert_eq!(
            sanitize_file_name("My Screenshot (1).PNG"),
            "my-screenshot-1-.png"
        );
    }

    #[test]
    fn maps_git_statuses() {
        assert_eq!(git_state("??"), "untracked");
        assert_eq!(git_state("UU"), "conflicted");
        assert_eq!(git_state(" M"), "modified");
    }

    #[test]
    fn atomic_write_replaces_the_destination() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("README.md");
        fs::write(&path, b"before").unwrap();
        atomic_write(&path, b"after").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "after");
    }

    #[test]
    fn commit_only_stages_the_selected_markdown_file() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        run_git(root, &["init"]);
        run_git(root, &["config", "user.email", "writree-tests@example.com"]);
        run_git(root, &["config", "user.name", "Writree tests"]);
        fs::write(root.join("README.md"), "initial\n").unwrap();
        fs::write(root.join("notes.md"), "initial\n").unwrap();
        run_git(root, &["add", "--", "README.md", "notes.md"]);
        run_git(root, &["commit", "-m", "test: initial"]);
        fs::write(root.join("README.md"), "selected\n").unwrap();
        fs::write(root.join("notes.md"), "must remain dirty\n").unwrap();

        let result = git_commit(GitCommitRequest {
            root_path: root.to_string_lossy().to_string(),
            paths: vec!["README.md".into()],
            message: "docs: update readme".into(),
        })
        .unwrap();

        assert!(!result.commit.is_empty());
        let committed =
            git_text(root, &["show", "--pretty=format:", "--name-only", "HEAD"]).unwrap();
        assert_eq!(committed, "README.md");
        let status = git_text(root, &["status", "--porcelain", "--", "notes.md"]).unwrap();
        assert!(status.contains("notes.md"));
    }

    #[test]
    fn opens_a_one_megabyte_markdown_document_under_the_target() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("large.md");
        fs::write(&path, "# performance\n".repeat(75_000)).unwrap();
        let started = std::time::Instant::now();
        let snapshot = read_document(
            directory.path().to_string_lossy().to_string(),
            "large.md".into(),
        )
        .unwrap();
        let elapsed = started.elapsed();
        eprintln!("opened {} bytes in {:?}", snapshot.markdown.len(), elapsed);
        assert!(snapshot.markdown.len() >= 1_000_000);
        assert!(elapsed < std::time::Duration::from_secs(3));
    }

    fn run_git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

// Prevents an additional console window on Windows in release. DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{
    AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// ---------------------------------------------------------------------------
// Path / process helpers (ported from the Electron main.js bundling logic)
// ---------------------------------------------------------------------------

/// Bundled binaries have a `.exe` suffix on Windows and no suffix elsewhere.
fn binary_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

/// Directory the first-run setup flow downloads yt-dlp/ffmpeg into: a `bin/`
/// folder under the app's writable data directory (the resource directory of
/// a packaged app is typically read-only, so downloaded binaries can't live
/// there). Created if it doesn't exist yet.
fn app_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?
        .join("bin");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Resolve a binary (yt-dlp / ffmpeg / ffprobe), falling back to the system PATH.
///
/// Order: downloaded at first launch -> bundled app resources (if the build
/// still ships them) -> local dev `bin/` -> parent `../bin/` -> PATH.
fn resolve_binary(app: &AppHandle, base: &str) -> PathBuf {
    let name = binary_name(base);

    // 1. Downloaded by the first-run setup flow — the primary location for a
    //    packaged app, since it's always writable.
    if let Ok(data_dir) = app.path().app_data_dir() {
        let p = data_dir.join("bin").join(&name);
        if p.exists() {
            return p;
        }
    }

    // 2. Production: bundled under the app resource directory (see tauri.conf.json).
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("bin").join(&name);
        if p.exists() {
            return p;
        }
    }

    // 3. Development: `bin/` relative to the current working directory or its parent
    //    (covers both `npm run tauri dev` from the repo root and running the binary
    //    directly from `src-tauri/`).
    if let Ok(cwd) = std::env::current_dir() {
        for candidate in [
            cwd.join("bin").join(&name),
            cwd.join("..").join("bin").join(&name),
        ] {
            if candidate.exists() {
                return candidate;
            }
        }
    }

    // 4. Fallback to whatever is on the system PATH.
    PathBuf::from(name)
}

/// Directory containing the bundled ffmpeg, if present.
fn ffmpeg_dir(app: &AppHandle) -> Option<PathBuf> {
    let p = resolve_binary(app, "ffmpeg");
    if p.exists() {
        p.parent().map(|d| d.to_path_buf())
    } else {
        None
    }
}

/// Location of the Netscape-format cookies file inside the app data directory.
fn cookies_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("cookies");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("cookies.txt")
}

/// Build a `Command` that never flashes a console window on Windows.
fn configured_command(program: &Path) -> Command {
    let cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    #[cfg(not(windows))]
    cmd
}

/// Prepend a directory to the child process PATH so bundled ffmpeg is found.
fn prepend_path(cmd: &mut Command, dir: &Path) {
    let existing = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = vec![dir.to_path_buf()];
    paths.extend(std::env::split_paths(&existing));
    if let Ok(joined) = std::env::join_paths(paths) {
        cmd.env("PATH", joined);
    }
}

// ---------------------------------------------------------------------------
// First-run dependency setup (downloads yt-dlp / ffmpeg / ffprobe)
// ---------------------------------------------------------------------------

// The stable yt-dlp release lags behind YouTube's frequent player/API changes
// (PO Token enforcement, SABR rollout) by days to weeks. The nightly-builds repo
// publishes the same asset names built straight off master, usually within
// hours of a fix landing, so we track that channel instead.
const YTDLP_RELEASE_BASE: &str =
    "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download";

/// Extractor args passed for every YouTube request. `default` keeps yt-dlp's
/// own (frequently-updated) client fallback logic — which, on a current
/// nightly build, already resolves the "only 360p without cookies" SABR/PO
/// Token bug on its own — and `tv` is added alongside it because `tv` doesn't
/// require a PO Token but does honor `--cookies`, so it's the client that
/// benefits most once a user logs in for age-restricted/members-only videos.
/// Explicitly restricting to a narrow client list (e.g. just `tv`) was tried
/// and measured *worse*: it drops the `default` fallback chain and produces
/// extra signature-solving failures for no gain. This is a moving target as
/// YouTube changes requirements; see
/// https://github.com/yt-dlp/yt-dlp/wiki/Po-Token-Guide for current guidance.
const YOUTUBE_EXTRACTOR_ARGS: &str = "youtube:player_client=default,tv";
const FFMPEG_WINDOWS_URL: &str = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
const FFMPEG_MACOS_FFMPEG_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";
const FFMPEG_MACOS_FFPROBE_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip";
const FFMPEG_LINUX_RELEASE_BASE: &str = "https://johnvansickle.com/ffmpeg/releases";

/// Status values reported in `dependency-setup-event`, matching what the
/// frontend's Initialization screen switches on.
#[derive(Clone, Copy)]
enum SetupStatus {
    Downloading,
    Extracting,
    Finished,
    Error,
}

impl SetupStatus {
    fn as_str(self) -> &'static str {
        match self {
            SetupStatus::Downloading => "downloading",
            SetupStatus::Extracting => "extracting",
            SetupStatus::Finished => "finished",
            SetupStatus::Error => "error",
        }
    }
}

/// Emit a `dependency-setup-event` — the frontend's only window into what the
/// first-run setup flow is doing.
fn emit_setup_event(app: &AppHandle, file: &str, progress: f64, status: SetupStatus, message: Option<&str>) {
    let _ = app.emit(
        "dependency-setup-event",
        json!({
            "file": file,
            "progress": progress,
            "status": status.as_str(),
            "message": message,
        }),
    );
}

/// Make a downloaded file executable on Unix; no-op on Windows, where the
/// `.exe` extension alone is sufficient.
fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to make {} executable: {e}", path.display()))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Download `url` to `dest`, streaming to disk in chunks and emitting
/// `dependency-setup-event` progress updates (throttled to whole-percent
/// steps so we don't flood the frontend with events).
fn download_with_progress(
    app: &AppHandle,
    client: &reqwest::blocking::Client,
    url: &str,
    dest: &Path,
    file_label: &str,
) -> Result<(), String> {
    emit_setup_event(app, file_label, 0.0, SetupStatus::Downloading, None);

    let mut response = client
        .get(url)
        .header("User-Agent", "video-downloader-app")
        .send()
        .map_err(|e| format!("Network error downloading {file_label}: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download {file_label}: server returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(dest)
        .map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;

    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    let mut last_emitted_pct = -1.0_f64;

    loop {
        let n = response
            .read(&mut buf)
            .map_err(|e| format!("Network error downloading {file_label}: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("Failed to write {}: {e}", dest.display()))?;
        downloaded += n as u64;

        if total > 0 {
            let pct = (downloaded as f64 / total as f64) * 100.0;
            if pct - last_emitted_pct >= 1.0 {
                last_emitted_pct = pct;
                emit_setup_event(app, file_label, pct, SetupStatus::Downloading, None);
            }
        }
    }

    emit_setup_event(app, file_label, 100.0, SetupStatus::Downloading, None);
    Ok(())
}

/// yt-dlp's release asset URL and local filename for the current OS/architecture.
fn ytdlp_asset() -> Result<(String, &'static str), String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", _) => Ok((format!("{YTDLP_RELEASE_BASE}/yt-dlp.exe"), "yt-dlp.exe")),
        ("macos", _) => Ok((format!("{YTDLP_RELEASE_BASE}/yt-dlp_macos"), "yt-dlp")),
        ("linux", "x86_64") => Ok((format!("{YTDLP_RELEASE_BASE}/yt-dlp_linux"), "yt-dlp")),
        ("linux", "aarch64") => Ok((format!("{YTDLP_RELEASE_BASE}/yt-dlp_linux_aarch64"), "yt-dlp")),
        (os, arch) => Err(format!("yt-dlp: unsupported OS/architecture \"{os}/{arch}\"")),
    }
}

fn download_ytdlp_if_missing(app: &AppHandle, client: &reqwest::blocking::Client, bin_dir: &Path) -> Result<(), String> {
    let (url, filename) = ytdlp_asset()?;
    let dest = bin_dir.join(filename);
    if dest.exists() {
        return Ok(());
    }

    download_with_progress(app, client, &url, &dest, "yt-dlp")?;
    make_executable(&dest)?;
    Ok(())
}

/// Best-effort self-update of an already-downloaded yt-dlp to the latest
/// nightly build, using yt-dlp's own updater rather than re-downloading via
/// `reqwest` — this is what keeps installs from prior app versions current
/// even though `download_ytdlp_if_missing` only acts when the binary is
/// absent. Failures (offline, rate-limited, etc.) are swallowed since this
/// runs on every launch and must never block startup.
fn update_ytdlp_to_nightly(bin_dir: &Path) {
    let bin = bin_dir.join(binary_name("yt-dlp"));
    if !bin.exists() {
        return;
    }
    let _ = configured_command(&bin).args(["--update-to", "nightly"]).output();
}

fn ffmpeg_ready(bin_dir: &Path) -> bool {
    bin_dir.join(binary_name("ffmpeg")).exists() && bin_dir.join(binary_name("ffprobe")).exists()
}

/// Extract a zip archive's entries whose *file name* (ignoring any internal
/// subfolder, e.g. an unpacked `ffmpeg-7.1-essentials_build/bin/`) matches one
/// of `wanted`, writing each directly into `bin_dir`. Returns the set of
/// wanted names that were actually found and extracted.
fn extract_zip_matching(zip_path: &Path, bin_dir: &Path, wanted: &[&str]) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open {}: {e}", zip_path.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read {}: {e}", zip_path.display()))?;

    let mut found = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {e}"))?;
        let entry_name = entry.name().to_string();
        let base = Path::new(&entry_name)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("");

        if let Some(matched) = wanted.iter().find(|w| base.eq_ignore_ascii_case(w)) {
            let dest_path = bin_dir.join(matched);
            let mut out = std::fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create {}: {e}", dest_path.display()))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Failed to extract {base}: {e}"))?;
            drop(out);
            make_executable(&dest_path)?;
            found.push((*matched).to_string());
        }
    }
    Ok(found)
}

fn setup_ffmpeg_windows(app: &AppHandle, client: &reqwest::blocking::Client, bin_dir: &Path) -> Result<(), String> {
    let zip_path = bin_dir.join("ffmpeg-download.zip");
    download_with_progress(app, client, FFMPEG_WINDOWS_URL, &zip_path, "ffmpeg")?;

    emit_setup_event(app, "ffmpeg", 0.0, SetupStatus::Extracting, None);
    let found = extract_zip_matching(&zip_path, bin_dir, &["ffmpeg.exe", "ffprobe.exe"])?;
    let _ = std::fs::remove_file(&zip_path);

    if found.len() < 2 {
        return Err("ffmpeg.exe/ffprobe.exe were not found inside the downloaded archive".to_string());
    }
    emit_setup_event(app, "ffmpeg", 100.0, SetupStatus::Extracting, None);
    Ok(())
}

fn setup_ffmpeg_macos(app: &AppHandle, client: &reqwest::blocking::Client, bin_dir: &Path) -> Result<(), String> {
    for (name, url) in [("ffmpeg", FFMPEG_MACOS_FFMPEG_URL), ("ffprobe", FFMPEG_MACOS_FFPROBE_URL)] {
        let zip_path = bin_dir.join(format!("{name}-download.zip"));
        download_with_progress(app, client, url, &zip_path, name)?;

        emit_setup_event(app, name, 0.0, SetupStatus::Extracting, None);
        let found = extract_zip_matching(&zip_path, bin_dir, &[name])?;
        let _ = std::fs::remove_file(&zip_path);

        if found.is_empty() {
            return Err(format!("{name} was not found inside the downloaded archive"));
        }
        emit_setup_event(app, name, 100.0, SetupStatus::Extracting, None);
    }
    Ok(())
}

fn setup_ffmpeg_linux(app: &AppHandle, client: &reqwest::blocking::Client, bin_dir: &Path) -> Result<(), String> {
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => return Err(format!("ffmpeg: unsupported Linux architecture \"{other}\"")),
    };
    let url = format!("{FFMPEG_LINUX_RELEASE_BASE}/ffmpeg-release-{arch}-static.tar.xz");
    let tar_path = bin_dir.join("ffmpeg-download.tar.xz");
    download_with_progress(app, client, &url, &tar_path, "ffmpeg")?;

    emit_setup_event(app, "ffmpeg", 0.0, SetupStatus::Extracting, None);
    let status = configured_command(Path::new("tar"))
        .arg("-xJf")
        .arg(&tar_path)
        .arg("-C")
        .arg(bin_dir)
        .status()
        .map_err(|e| format!("Failed to run tar: {e}"))?;
    if !status.success() {
        return Err(format!("tar exited with status {status}"));
    }

    // Move ffmpeg/ffprobe out of the extracted ffmpeg-<version>-<arch>-static/
    // subfolder and clean up, regardless of the exact version in its name.
    if let Ok(entries) = std::fs::read_dir(bin_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_static_build_dir = path.is_dir()
                && path
                    .file_name()
                    .and_then(|f| f.to_str())
                    .map(|n| n.starts_with("ffmpeg-") && n.ends_with("-static"))
                    .unwrap_or(false);
            if !is_static_build_dir {
                continue;
            }
            for name in ["ffmpeg", "ffprobe"] {
                let src = path.join(name);
                if src.exists() {
                    let dest = bin_dir.join(name);
                    std::fs::rename(&src, &dest)
                        .map_err(|e| format!("Failed to move {name}: {e}"))?;
                    make_executable(&dest)?;
                }
            }
            let _ = std::fs::remove_dir_all(&path);
        }
    }

    let _ = std::fs::remove_file(&tar_path);

    if !ffmpeg_ready(bin_dir) {
        return Err("ffmpeg/ffprobe were not found after extracting the downloaded archive".to_string());
    }
    emit_setup_event(app, "ffmpeg", 100.0, SetupStatus::Extracting, None);
    Ok(())
}

fn download_ffmpeg_if_missing(app: &AppHandle, client: &reqwest::blocking::Client, bin_dir: &Path) -> Result<(), String> {
    if ffmpeg_ready(bin_dir) {
        return Ok(());
    }

    match std::env::consts::OS {
        "windows" => setup_ffmpeg_windows(app, client, bin_dir),
        "macos" => setup_ffmpeg_macos(app, client, bin_dir),
        "linux" => setup_ffmpeg_linux(app, client, bin_dir),
        other => Err(format!("ffmpeg: unsupported OS \"{other}\"")),
    }
}

/// Download whichever of yt-dlp/ffmpeg/ffprobe are missing into `app_bin_dir`,
/// emitting `dependency-setup-event` throughout. Already-present binaries are
/// left untouched, so this is safe (and cheap) to call on every launch, and to
/// retry after a partial failure.
fn run_dependency_setup(app: &AppHandle) -> Result<(), String> {
    let bin_dir = app_bin_dir(app)?;
    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    download_ytdlp_if_missing(app, &client, &bin_dir)?;
    update_ytdlp_to_nightly(&bin_dir);
    download_ffmpeg_if_missing(app, &client, &bin_dir)?;

    emit_setup_event(app, "", 100.0, SetupStatus::Finished, None);
    Ok(())
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/// Strip characters that are illegal in filenames and cap the length at 100.
fn sanitize_title(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    cleaned.chars().take(100).collect()
}

/// Format a duration in seconds to `M:SS` or `H:MM:SS`.
fn format_duration(seconds: Option<f64>) -> String {
    match seconds {
        Some(s) if s > 0.0 => {
            let total = s.floor() as u64;
            let hrs = total / 3600;
            let mins = (total % 3600) / 60;
            let secs = total % 60;
            if hrs > 0 {
                format!("{hrs}:{mins:02}:{secs:02}")
            } else {
                format!("{mins}:{secs:02}")
            }
        }
        _ => "Unknown".to_string(),
    }
}

/// Random 6-character uppercase fallback name (used when info extraction fails).
fn random_name() -> String {
    let mut x = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut s = String::new();
    for _ in 0..6 {
        let digit = (x % 36) as u32;
        x /= 36;
        let c = std::char::from_digit(digit, 36).unwrap_or('0');
        s.push(c.to_ascii_uppercase());
    }
    s
}

/// Numeric ("1.10" > "1.9") version comparison, mirroring the old localeCompare.
fn version_gt(a: &str, b: &str) -> bool {
    fn parts(v: &str) -> Vec<u64> {
        v.split('.')
            .map(|seg| {
                seg.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0)
            })
            .collect()
    }
    let (pa, pb) = (parts(a), parts(b));
    for i in 0..pa.len().max(pb.len()) {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

/// Extract the download percentage from a yt-dlp progress line.
fn parse_percent(line: &str) -> Option<f64> {
    let idx = line.find('%')?;
    let bytes = line.as_bytes();
    let mut start = idx;
    while start > 0 {
        let c = bytes[start - 1];
        if c.is_ascii_digit() || c == b'.' {
            start -= 1;
        } else {
            break;
        }
    }
    line[start..idx].parse::<f64>().ok()
}

/// Parse and validate a URL supplied by the frontend — a quick-access login
/// link, a failed download's own URL, or whatever a user pastes into the
/// custom-login box — before it's ever handed to the webview. yt-dlp supports
/// hundreds of sites, so login is deliberately not restricted to a fixed
/// platform list; this just guards against malformed or unsafe input reaching
/// `WebviewWindowBuilder`/`navigate`.
fn validate_login_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Please enter a URL".to_string());
    }

    // Let plain "tiktok.com/login"-style input work without forcing the user
    // to type out a scheme.
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    let parsed = candidate
        .parse::<Url>()
        .map_err(|e| format!("That doesn't look like a valid URL: {e}"))?;

    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "Unsupported URL scheme \"{other}\" — only http/https links can be opened"
            ))
        }
    }

    if parsed.host_str().is_none() {
        return Err("URL must include a domain (e.g. https://example.com/login)".to_string());
    }

    Ok(parsed)
}

/// Summary of a cookie-capture operation, surfaced to the frontend.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CookieSummary {
    count: usize,
    domains: Vec<String>,
}

/// Tighten permissions on the cookies file so other local users can't read it.
fn restrict_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    {
        let _ = path; // On Windows the app-data directory is already per-user.
    }
}

/// A single parsed line from a Netscape-format cookies file.
#[derive(Clone)]
struct CookieLine {
    /// As written to disk — may carry a leading `#HttpOnly_` marker.
    domain_field: String,
    flag: String,
    path: String,
    secure: String,
    expires: String,
    name: String,
    value: String,
}

impl CookieLine {
    /// Identity used for merging: same bare domain (ignoring the `#HttpOnly_`
    /// marker and any leading dot) and same cookie name. This is deliberately
    /// looser than a real cookie jar's (domain, path, name) key — it's enough
    /// to let YouTube/Facebook/Instagram logins coexist and to let a fresh
    /// login for one platform update its own stale cookies, without needing
    /// exact path equality.
    fn merge_key(&self) -> (String, String) {
        let bare = self
            .domain_field
            .trim_start_matches("#HttpOnly_")
            .trim_start_matches('.')
            .to_string();
        (bare, self.name.clone())
    }

    fn to_line(&self) -> String {
        format!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
            self.domain_field, self.flag, self.path, self.secure, self.expires, self.name, self.value
        )
    }
}

/// Parse an existing Netscape cookies file. A line is only skipped as a
/// "real" comment if it isn't an `#HttpOnly_`-marked cookie line underneath —
/// otherwise every HttpOnly cookie (session auth tokens included) would be
/// silently dropped the moment we tried to merge into an existing file.
fn parse_netscape_cookies(content: &str) -> Vec<CookieLine> {
    const HTTPONLY_PREFIX: &str = "#HttpOnly_";
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim_end_matches('\r');
            if line.trim().is_empty() {
                return None;
            }
            if line.starts_with('#') && !line.starts_with(HTTPONLY_PREFIX) {
                return None;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() != 7 {
                return None;
            }
            Some(CookieLine {
                domain_field: parts[0].to_string(),
                flag: parts[1].to_string(),
                path: parts[2].to_string(),
                secure: parts[3].to_string(),
                expires: parts[4].to_string(),
                name: parts[5].to_string(),
                value: parts[6].to_string(),
            })
        })
        .collect()
}

/// Read the cookies currently held by a webview and *merge* them into
/// `cookies.txt` (in the strict Netscape format yt-dlp's `--cookies` expects),
/// rather than overwriting the file outright — otherwise logging into a
/// second platform (e.g. Facebook after YouTube) would silently wipe out the
/// first platform's session cookies.
///
/// Correctness details that matter for yt-dlp / Python's `http.cookiejar`:
/// - The "include subdomains" flag (column 2) must agree with the leading dot on
///   the domain, otherwise the cookie is silently dropped or mismatched.
/// - HttpOnly cookies — which include the YouTube/Facebook session tokens — must
///   be written with a `#HttpOnly_` domain prefix, or they are ignored.
fn save_cookies_from_window(app: &AppHandle, win: &WebviewWindow) -> Result<CookieSummary, String> {
    let cookies = win.cookies().map_err(|e| e.to_string())?;
    let path = cookies_path(app);

    // Start from whatever is already saved so this capture merges into it.
    let mut merged: Vec<CookieLine> = if path.exists() {
        std::fs::read_to_string(&path)
            .map(|existing| parse_netscape_cookies(&existing))
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut captured_domains: Vec<String> = Vec::new();
    let mut captured_count = 0usize;

    for cookie in &cookies {
        // A cookie with no domain cannot be matched to a request by yt-dlp.
        let domain = match cookie.domain() {
            Some(d) if !d.is_empty() => d,
            _ => continue,
        };

        // The include-subdomains flag must be consistent with the leading dot.
        let include_subdomains = domain.starts_with('.');
        let flag = if include_subdomains { "TRUE" } else { "FALSE" }.to_string();
        let cookie_path = cookie.path().unwrap_or("/").to_string();
        let secure = if cookie.secure().unwrap_or(false) { "TRUE" } else { "FALSE" }.to_string();
        // Session cookies (no explicit expiry) are written as 0; clamp negatives.
        let expires = cookie
            .expires_datetime()
            .map(|dt| dt.unix_timestamp().max(0))
            .unwrap_or(0)
            .to_string();

        // Mark HttpOnly cookies the way http.cookiejar expects to read them back.
        let domain_field = if cookie.http_only().unwrap_or(false) {
            format!("#HttpOnly_{domain}")
        } else {
            domain.to_string()
        };

        let entry = CookieLine {
            domain_field,
            flag,
            path: cookie_path,
            secure,
            expires,
            name: cookie.name().to_string(),
            value: cookie.value().to_string(),
        };

        // Update the existing entry in place if this cookie already exists
        // (same domain + name), otherwise append it as a new one.
        let key = entry.merge_key();
        match merged.iter_mut().find(|c| c.merge_key() == key) {
            Some(existing) => *existing = entry,
            None => merged.push(entry),
        }

        let bare = domain.trim_start_matches('.').to_string();
        if !bare.is_empty() && !captured_domains.contains(&bare) {
            captured_domains.push(bare);
        }
        captured_count += 1;
    }

    let mut content = String::from(
        "# Netscape HTTP Cookie File\n# Generated by Video Downloader. Do not edit.\n\n",
    );
    for entry in &merged {
        content.push_str(&entry.to_line());
    }

    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    restrict_permissions(&path);

    // Notify the UI so it can refresh the displayed login status. Reports
    // what THIS capture contributed, not the merged file's grand total.
    let _ = app.emit(
        "cookies-updated",
        json!({ "count": captured_count, "domains": &captured_domains }),
    );

    Ok(CookieSummary { count: captured_count, domains: captured_domains })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Check GitHub releases for a newer version of the app.
#[tauri::command]
async fn check_for_update() -> Value {
    let current = env!("CARGO_PKG_VERSION").to_string();
    match fetch_latest_release().await {
        Ok(data) => {
            let latest = data
                .get("tag_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim_start_matches('v')
                .to_string();
            let release_url = data
                .get("html_url")
                .and_then(|v| v.as_str())
                .unwrap_or("https://github.com/Rafat-Pantho/video-downloader/releases/latest")
                .to_string();
            let update_available =
                !latest.is_empty() && latest != current && version_gt(&latest, &current);
            json!({
                "updateAvailable": update_available,
                "currentVersion": current,
                "latestVersion": latest,
                "releaseUrl": release_url
            })
        }
        // Silently fail — don't block the user if the check fails.
        Err(e) => json!({ "updateAvailable": false, "error": e }),
    }
}

async fn fetch_latest_release() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("video-downloader-app")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("https://api.github.com/repos/Rafat-Pantho/video-downloader/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status().as_u16()));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

/// Check that yt-dlp is available and report its version.
#[tauri::command]
async fn check_ytdlp(app: AppHandle) -> Value {
    let bin = resolve_binary(&app, "yt-dlp");
    let result = tauri::async_runtime::spawn_blocking(move || {
        configured_command(&bin).arg("--version").output()
    })
    .await;

    match result {
        Ok(Ok(out)) if out.status.success() => json!({
            "installed": true,
            "version": String::from_utf8_lossy(&out.stdout).trim()
        }),
        _ => json!({ "installed": false, "version": Value::Null }),
    }
}

/// Bundled yt-dlp is always present; this simply confirms it exists.
#[tauri::command]
fn install_ytdlp(app: AppHandle) -> Value {
    let bin = resolve_binary(&app, "yt-dlp");
    if bin.exists() {
        json!({ "success": true })
    } else {
        json!({ "success": false, "error": "Bundled yt-dlp not found" })
    }
}

/// Startup gate check: are yt-dlp and ffmpeg/ffprobe actually present? Used by
/// the React Initialization screen to decide whether to block the main UI
/// behind a setup flow.
#[tauri::command]
fn check_dependencies(app: AppHandle) -> Value {
    let ytdlp_ready = resolve_binary(&app, "yt-dlp").exists();
    let ffmpeg_ready = resolve_binary(&app, "ffmpeg").exists() && resolve_binary(&app, "ffprobe").exists();
    json!({
        "ready": ytdlp_ready && ffmpeg_ready,
        "ytdlp": ytdlp_ready,
        "ffmpeg": ffmpeg_ready
    })
}

/// Download whichever of yt-dlp/ffmpeg/ffprobe are missing, emitting
/// `dependency-setup-event` throughout. Safe to call repeatedly — already
/// -present binaries are skipped, so retrying after a partial failure only
/// redoes the parts that didn't finish.
#[tauri::command]
async fn setup_dependencies(app: AppHandle) -> Value {
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run_dependency_setup(&app_for_task)).await;

    match result {
        Ok(Ok(())) => json!({ "success": true }),
        Ok(Err(error)) => {
            emit_setup_event(&app, "", 0.0, SetupStatus::Error, Some(&error));
            json!({ "success": false, "error": error })
        }
        Err(join_error) => {
            let message = format!("Setup task failed unexpectedly: {join_error}");
            emit_setup_event(&app, "", 0.0, SetupStatus::Error, Some(&message));
            json!({ "success": false, "error": message })
        }
    }
}

/// Fetch video metadata and the list of available quality tiers in one call.
#[tauri::command]
async fn get_video_info(app: AppHandle, url: String) -> Value {
    let bin = resolve_binary(&app, "yt-dlp");
    let ffdir = ffmpeg_dir(&app);
    let cookies = cookies_path(&app);

    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = configured_command(&bin);
        // Deliberately no `--no-warnings`: yt-dlp's cookie loader reports skipped/
        // rejected cookie file entries as warnings, and we want that visible in
        // `stderr` below rather than silently swallowed.
        cmd.args(["--no-playlist", "--no-download", "-j"]);
        cmd.arg("--extractor-args").arg(YOUTUBE_EXTRACTOR_ARGS);
        if cookies.exists() {
            cmd.arg("--cookies").arg(&cookies);
        }
        if let Some(dir) = &ffdir {
            // Point yt-dlp at our locally-downloaded ffmpeg here too, for parity
            // with the download command. (Info extraction never merges, so this
            // is a no-op in practice, but keeps both commands configured the same.)
            let ffmpeg_exe = dir.join(binary_name("ffmpeg"));
            cmd.arg("--ffmpeg-location").arg(&ffmpeg_exe);
            prepend_path(&mut cmd, dir);
        }
        cmd.arg(&url);
        cmd.output()
    })
    .await;

    let output = match output {
        Ok(Ok(o)) => o,
        _ => {
            return json!({
                "success": false,
                "title": random_name(),
                "error": "Failed to run yt-dlp.",
                "qualities": []
            })
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() && stdout.trim().is_empty() {
        let error = if stderr.contains("Cannot parse data") {
            "Unable to extract video info. The platform may require login or the link may be invalid."
        } else if stderr.contains("Unsupported URL") {
            "This URL is not supported by yt-dlp."
        } else if stderr.contains("Video unavailable") {
            "This video is unavailable or private."
        } else if stderr.contains("This video requires payment") {
            "This video requires payment to access."
        } else {
            "Failed to fetch video info."
        };
        // Include yt-dlp's raw stderr so the real reason (e.g. a rejected/expired
        // cookie, a bot-check challenge, etc.) is visible instead of just the
        // generic bucket above swallowing it.
        return json!({
            "success": false,
            "title": random_name(),
            "error": error,
            "stderr": stderr.trim(),
            "qualities": []
        });
    }

    let info: Value = match serde_json::from_str(&stdout) {
        Ok(v) => v,
        Err(_) => {
            return json!({
                "success": false,
                "title": random_name(),
                "error": "Could not parse video information.",
                "stderr": stderr.trim(),
                "qualities": []
            })
        }
    };

    let duration = format_duration(info.get("duration").and_then(|v| v.as_f64()));
    let title = sanitize_title(info.get("title").and_then(|v| v.as_str()).unwrap_or("video"));
    let thumbnail = info.get("thumbnail").and_then(|v| v.as_str());

    // Collect the "resolution" of each video-bearing format as min(height, width),
    // matching yt-dlp's own orientation-agnostic `res` sort field (see
    // FormatSorter.settings['res'] in yt-dlp). Portrait clips (Facebook/Instagram
    // Reels, YouTube Shorts) report a `height` larger than their `width` — using
    // raw `height` alone would advertise quality tiers the download can't actually
    // honor once capped the same orientation-safe way (see `resolution_cap`).
    let mut resolutions: Vec<i64> = Vec::new();
    if let Some(formats) = info.get("formats").and_then(|v| v.as_array()) {
        for fmt in formats {
            let has_video = fmt
                .get("vcodec")
                .and_then(|v| v.as_str())
                .map(|c| c != "none")
                .unwrap_or(false);
            if !has_video {
                continue;
            }
            let height = fmt.get("height").and_then(|v| v.as_i64());
            let width = fmt.get("width").and_then(|v| v.as_i64());
            if let Some(res) = match (height, width) {
                (Some(h), Some(w)) => Some(h.min(w)),
                (Some(h), None) => Some(h),
                (None, Some(w)) => Some(w),
                (None, None) => None,
            } {
                resolutions.push(res);
            }
        }
    }

    let tiers: [(&str, &str, i64); 8] = [
        ("4k", "4K (2160p)", 2160),
        ("2k", "2K (1440p)", 1440),
        ("1080p", "1080p (Full HD)", 1080),
        ("720p", "720p (HD)", 720),
        ("480p", "480p (SD)", 480),
        ("360p", "360p", 360),
        ("240p", "240p", 240),
        ("144p", "144p", 144),
    ];

    let mut qualities: Vec<Value> = Vec::new();
    for (value, label, min_height) in tiers {
        if resolutions.iter().any(|r| *r >= min_height) {
            qualities.push(json!({ "value": value, "label": label }));
        }
    }
    if let Some(first) = qualities.first_mut() {
        let label = first
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        first["label"] = json!(format!("{label} (Best Quality)"));
        first["isBest"] = json!(true);
    }

    json!({
        "success": true,
        "title": title,
        "duration": duration,
        "thumbnail": thumbnail,
        "qualities": qualities
    })
}

/// Open a native folder-picker dialog, defaulting to the Downloads folder.
#[tauri::command]
async fn select_folder(app: AppHandle) -> Option<String> {
    let start = app.path().download_dir().ok();
    let (tx, rx) = std::sync::mpsc::channel();

    let mut builder = app.dialog().file();
    if let Some(dir) = start {
        builder = builder.set_directory(dir);
    }
    builder.pick_folder(move |folder| {
        let _ = tx.send(folder);
    });

    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .ok()
        .flatten()
        .and_then(|fp| fp.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// yt-dlp format selection string for a requested quality tier.
///
/// Deliberately orientation-agnostic: it never filters by raw `height`. yt-dlp
/// reports a portrait clip's native frame height as-is (e.g. 1920 for a
/// 1080-wide vertical Reel) — a `[height<=1080]` filter would reject that
/// format entirely and fall back to a much smaller rendition, which is exactly
/// the "shrinking" bug. Any resolution cap is applied separately via
/// `--format-sort res:<N>` (see `resolution_cap` / `run_download`), since
/// yt-dlp's `res` field is `min(height, width)` and so caps correctly
/// regardless of orientation.
fn build_format_string(quality: &str) -> String {
    if quality == "audio" {
        "bestaudio*[acodec!=none]/bestaudio/best".to_string()
    } else {
        // No `[ext=mp4]`/`[ext=m4a]` filter: restricting to those containers
        // hides the best available stream whenever it's webm/vp9/av1 (which is
        // routinely true at 4K), silently capping quality. Requesting
        // *separate* best video+audio (rather than a pre-merged stream) is what
        // lifts YouTube above its 360p progressive-only ceiling — but it only
        // works when ffmpeg is present to merge them, which is why run_download
        // always passes `--ffmpeg-location`. The user's chosen output container
        // is applied afterwards, either via `--merge-output-format` or, if that
        // doesn't land on it, an explicit ffmpeg conversion pass (see
        // `ensure_container`) — so format selection here is free to always go
        // after the absolute best quality regardless of codec/container. The
        // per-tier resolution cap is applied on top via `--format-sort res:<N>`
        // (see run_download / resolution_cap).
        "bestvideo+bestaudio/best".to_string()
    }
}

/// Resolution cap (in the orientation-agnostic `min(height, width)` sense) for a
/// named quality tier, applied via `--format-sort res:<N>`. `None` means no cap
/// (e.g. "best"/"audio", or an unrecognized tier) — yt-dlp picks its own best.
fn resolution_cap(quality: &str) -> Option<u32> {
    match quality {
        "4k" => Some(2160),
        "2k" => Some(1440),
        "1080p" => Some(1080),
        "720p" => Some(720),
        "480p" => Some(480),
        "360p" => Some(360),
        "240p" => Some(240),
        "144p" => Some(144),
        _ => None,
    }
}

/// Download a video/audio stream, emitting `download-progress` events as it runs.
#[tauri::command]
async fn download_video(
    app: AppHandle,
    url: String,
    folder: String,
    filename: String,
    format: String,
    quality: String,
) -> Value {
    let bin = resolve_binary(&app, "yt-dlp");
    let ffdir = ffmpeg_dir(&app);
    let cookies = cookies_path(&app);
    let app_for_task = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_download(app_for_task, bin, ffdir, cookies, url, folder, filename, format, quality)
    })
    .await;

    result.unwrap_or_else(|e| {
        json!({ "success": false, "error": format!("Download task failed: {e}") })
    })
}

/// Sidecar files yt-dlp may leave alongside the real media file — thumbnails,
/// subtitles, its own bookkeeping — that must never be mistaken for the
/// actual download when hunting for what got produced.
const NON_MEDIA_SIDE_CAR_EXTENSIONS: &[&str] = &[
    "part", "ytdl", "webp", "jpg", "jpeg", "png", "description", "json", "srt", "vtt", "ass",
];

/// Locate the media file yt-dlp actually produced for `filename`. Needed
/// because the real output extension isn't known ahead of time: it depends on
/// which formats got selected and merged, especially for the "any container"
/// choice, where nothing forces a specific one. Picks the most-recently
/// modified match in case a stale sidecar/partial file with the same stem
/// happens to linger.
fn find_downloaded_file(folder: &Path, filename: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(folder).ok()?;
    let mut candidates: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_stem().and_then(|s| s.to_str()) != Some(filename) {
            continue;
        }
        let is_media = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| !NON_MEDIA_SIDE_CAR_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
            .unwrap_or(false);
        if !is_media {
            continue;
        }
        if let Ok(modified) = entry.metadata().and_then(|m| m.modified()) {
            candidates.push((modified, path));
        }
    }
    candidates.sort_by_key(|(t, _)| *t);
    candidates.pop().map(|(_, p)| p)
}

/// Codec choice for a from-scratch re-encode into `container`, used only when
/// a plain stream-copy remux fails outright (i.e. the source codec is one the
/// target container's spec won't allow at all, so no remux could ever work).
fn transcode_args_for_container(container: &str) -> &'static [&'static str] {
    match container {
        "mp4" => &["-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-b:a", "192k"],
        "webm" => &["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"],
        // mkv (and anything else) accepts virtually any codec, so a failed
        // copy remux here means something else is wrong — re-attempting a
        // copy is still the right first (and only) fallback to try.
        _ => &["-c:v", "copy", "-c:a", "copy"],
    }
}

/// Make sure `src` ends up in the user's requested `desired_ext` container,
/// converting with ffmpeg if yt-dlp's own merge didn't already land on it —
/// e.g. it fell back to mkv because the source's codecs aren't legal inside
/// the requested container. Tries a fast stream-copy remux first (lossless,
/// just repackaging), only re-encoding if that's rejected outright. Returns
/// the path to the file in its final, correct container.
fn ensure_container(ffdir: &Option<PathBuf>, src: &Path, desired_ext: &str) -> Result<PathBuf, String> {
    if src.extension().and_then(|e| e.to_str()) == Some(desired_ext) {
        return Ok(src.to_path_buf());
    }

    let ffmpeg_bin = match ffdir {
        Some(dir) => dir.join(binary_name("ffmpeg")),
        None => PathBuf::from(binary_name("ffmpeg")),
    };
    let dst = src.with_extension(desired_ext);

    let run_ffmpeg = |codec_args: &[&str]| -> bool {
        configured_command(&ffmpeg_bin)
            .arg("-y")
            .arg("-i")
            .arg(src)
            .args(codec_args)
            .arg(&dst)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    };

    if !run_ffmpeg(&["-c", "copy"]) && !run_ffmpeg(transcode_args_for_container(desired_ext)) {
        return Err(format!("ffmpeg could not convert the download to .{desired_ext}"));
    }

    let _ = std::fs::remove_file(src);
    Ok(dst)
}

#[allow(clippy::too_many_arguments)]
fn run_download(
    app: AppHandle,
    bin: PathBuf,
    ffdir: Option<PathBuf>,
    cookies: PathBuf,
    url: String,
    folder: String,
    filename: String,
    format: String,
    quality: String,
) -> Value {
    let output_path = Path::new(&folder)
        .join(format!("{filename}.%(ext)s"))
        .to_string_lossy()
        .to_string();
    let is_audio_only = quality == "audio";
    let format_string = build_format_string(&quality);

    let mut cmd = configured_command(&bin);
    cmd.arg("--format")
        .arg(&format_string)
        .arg("--output")
        .arg(&output_path)
        .args([
            "--no-playlist",
            "--progress",
            "--newline",
            "--embed-metadata",
            "--no-post-overwrites",
        ]);
    cmd.arg("--extractor-args").arg(YOUTUBE_EXTRACTOR_ARGS);

    if is_audio_only {
        cmd.arg("--extract-audio")
            .arg("--audio-format")
            .arg(&format)
            .args(["--audio-quality", "0"]);
    } else {
        // "any" means the user doesn't care which container they get — skip
        // forcing one so yt-dlp just uses whatever the source naturally merges
        // into (falling back to mkv itself if the streams are incompatible).
        // For a concrete choice, still let yt-dlp attempt it directly (fast
        // path when it just works) with mkv as yt-dlp's own fallback; whatever
        // it actually produces is reconciled against the request afterwards by
        // `ensure_container`, which is what guarantees the final file really is
        // in the requested container even if this attempt falls back to mkv.
        if format != "any" {
            cmd.arg("--merge-output-format").arg(format!("{format}/mkv"));
        }

        // Cap quality by `res` (= min(height, width)), not raw height, so portrait
        // sources (Facebook/Instagram Reels, YouTube Shorts) are capped by their
        // true short edge instead of being clipped against their long edge and
        // forced down to a much smaller rendition. `res:<N>` is a hard cap: yt-dlp
        // never picks a format above it unless nothing smaller exists.
        if let Some(cap) = resolution_cap(&quality) {
            cmd.arg("--format-sort").arg(format!("res:{cap}"));
        }

        // Merging is a plain stream copy (no scale/pad filters are ever passed),
        // so the source's resolution, orientation, and aspect ratio pass through
        // to the container unchanged.
    }

    if cookies.exists() {
        cmd.arg("--cookies").arg(&cookies);
    }

    if let Some(dir) = &ffdir {
        let ffmpeg_exe = dir.join(binary_name("ffmpeg"));
        cmd.arg("--ffmpeg-location").arg(&ffmpeg_exe);
        prepend_path(&mut cmd, dir);
    }

    cmd.arg(&url);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => {
            return json!({
                "success": false,
                "error": "Failed to run yt-dlp. Make sure it is installed."
            })
        }
    };

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    // Collect stderr on a separate thread while we stream stdout progress.
    let app_for_err = app.clone();
    let err_handle = std::thread::spawn(move || {
        let mut buffer = String::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if line.contains("ERROR") {
                let _ = app_for_err.emit("download-error", line.clone());
            }
            buffer.push_str(&line);
            buffer.push('\n');
        }
        buffer
    });

    let mut last_progress = 0.0_f64;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if line.contains("[download]") && line.contains('%') {
            if let Some(progress) = parse_percent(&line) {
                if progress > last_progress {
                    last_progress = progress;
                    let _ = app.emit(
                        "download-progress",
                        json!({ "progress": progress, "message": line }),
                    );
                }
            }
        }
    }

    let status = child.wait().ok();
    let error_messages = err_handle.join().unwrap_or_default();

    if status.and_then(|s| s.code()) == Some(0) {
        let downloaded = find_downloaded_file(Path::new(&folder), &filename);

        // Audio already comes out in exactly `format` via `--audio-format`; an
        // "any" container deliberately accepts whatever yt-dlp produced. Only a
        // concrete video container needs reconciling against what actually got
        // written, since yt-dlp may have fallen back to mkv internally.
        let final_path = match downloaded {
            Some(path) if is_audio_only || format == "any" => Ok(path),
            Some(path) => ensure_container(&ffdir, &path, &format),
            None => Ok(Path::new(&folder).join(format!("{filename}.{format}"))),
        };

        let final_path = match final_path {
            Ok(path) => path,
            Err(e) => {
                return json!({
                    "success": false,
                    "error": format!("Download succeeded but converting it failed: {e}")
                })
            }
        };

        let size = std::fs::metadata(&final_path)
            .ok()
            .map(|m| format!("{:.2}", m.len() as f64 / 1024.0 / 1024.0));
        json!({
            "success": true,
            "path": final_path.to_string_lossy(),
            "size": size
        })
    } else {
        let needs_login = [
            "This video is private",
            "This video requires payment",
            "members-only",
            "age-restricted",
            "Sign in to confirm your age",
            "This live stream recording is not available",
            "This video is unavailable",
        ]
        .iter()
        .any(|needle| error_messages.contains(needle));

        // Always hand the raw yt-dlp stderr back to the frontend so failures that
        // involve cookies (a rejected/expired auth cookie, a "unable to load
        // cookies" file-read error, a bot-check challenge, etc.) are diagnosable
        // instead of hidden behind a generic message.
        let raw_stderr = error_messages.trim();
        if needs_login {
            json!({
                "success": false,
                "needsLogin": true,
                "url": url,
                "error": "This video requires login. Click \"Login\" to authenticate.",
                "stderr": raw_stderr
            })
        } else {
            json!({
                "success": false,
                "error": "Download failed. The video may be unavailable, private, or restricted.",
                "stderr": raw_stderr
            })
        }
    }
}

/// Reveal a folder in the system file manager.
#[tauri::command]
fn open_folder(app: AppHandle, folder_path: String) -> Value {
    match app.opener().open_path(folder_path, None::<&str>) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// Open an external URL in the user's default browser (replaces shell.openExternal).
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Value {
    match app.opener().open_url(url, None::<&str>) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// Open an embedded browser window so the user can log in to any site — a
/// quick-access URL from the frontend (YouTube/Facebook/Instagram), a failed
/// download's own URL, or a custom URL the user pasted in. Cookies are
/// captured on close (or on demand via `capture_login_cookies`).
#[tauri::command]
async fn open_login_window(app: AppHandle, url: String) -> Value {
    let parsed = match validate_login_url(&url) {
        Ok(u) => u,
        Err(e) => return json!({ "success": false, "error": e }),
    };

    // If a login window is already open, navigate it to the newly requested
    // URL instead of just focusing it — otherwise switching from e.g. YouTube
    // to a custom site mid-session would silently keep showing YouTube.
    if let Some(existing) = app.get_webview_window("login") {
        if let Err(e) = existing.navigate(parsed) {
            return json!({ "success": false, "error": e.to_string() });
        }
        let _ = existing.set_focus();
        return json!({ "success": true });
    }

    let builder = WebviewWindowBuilder::new(&app, "login", WebviewUrl::External(parsed))
        .title("Login to continue")
        .inner_size(800.0, 600.0)
        .focused(true);

    match builder.build() {
        Ok(win) => {
            // Persist cookies whenever the login window is closed, and let the
            // frontend know once it's actually gone (covers both the user closing
            // it via OS chrome and a programmatic `close_login_window` call), so
            // the "finish login" UI doesn't linger after the window disappears.
            let app_for_event = app.clone();
            let win_for_event = win.clone();
            let app_for_destroyed = app.clone();
            win.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { .. } => {
                    let _ = save_cookies_from_window(&app_for_event, &win_for_event);
                }
                WindowEvent::Destroyed => {
                    let _ = app_for_destroyed.emit("login-window-closed", ());
                }
                _ => {}
            });
            json!({ "success": true })
        }
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// Snapshot the login window's cookies to disk on demand — e.g. once the user has
/// finished signing in — without waiting for the window to be closed. Returns how
/// many cookies were captured and for which domains so the UI can confirm success.
#[tauri::command]
fn capture_login_cookies(app: AppHandle) -> Value {
    match app.get_webview_window("login") {
        Some(win) => match save_cookies_from_window(&app, &win) {
            Ok(summary) => json!({
                "success": true,
                "count": summary.count,
                "domains": summary.domains
            }),
            Err(e) => json!({ "success": false, "error": e }),
        },
        None => json!({ "success": false, "error": "Login window is not open" }),
    }
}

/// Save cookies from the login window, then close it.
#[tauri::command]
fn close_login_window(app: AppHandle) -> Value {
    if let Some(win) = app.get_webview_window("login") {
        let _ = save_cookies_from_window(&app, &win);
        let _ = win.close();
    }
    json!({ "success": true })
}

/// Read the raw cookies.txt content.
#[tauri::command]
fn load_cookies(app: AppHandle) -> Value {
    let path = cookies_path(&app);
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => json!({ "success": true, "content": content }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        }
    } else {
        json!({ "success": true, "content": "" })
    }
}

/// Overwrite cookies.txt with the provided content.
#[tauri::command]
fn save_cookies(app: AppHandle, cookies_content: String) -> Value {
    match std::fs::write(cookies_path(&app), cookies_content) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

/// Report whether cookies exist and which domains they cover.
#[tauri::command]
fn check_login_status(app: AppHandle) -> Value {
    let path = cookies_path(&app);
    if !path.exists() {
        return json!({ "success": true, "loggedIn": false, "domains": [], "cookieCount": 0 });
    }

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };

    let cookie_lines: Vec<&str> = content
        .lines()
        .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .collect();

    let mut domains: Vec<String> = Vec::new();
    for line in &cookie_lines {
        if let Some(first) = line.split('\t').next() {
            let domain = first.trim_start_matches('.').to_string();
            if !domain.is_empty() && !domains.contains(&domain) {
                domains.push(domain);
            }
        }
    }

    json!({
        "success": true,
        "loggedIn": !cookie_lines.is_empty(),
        "domains": domains,
        "cookieCount": cookie_lines.len()
    })
}

/// Delete the saved cookies file and clear the login window's cookie store.
#[tauri::command]
fn clear_cookies(app: AppHandle) -> Value {
    let path = cookies_path(&app);
    if path.exists() {
        if let Err(e) = std::fs::remove_file(&path) {
            return json!({ "success": false, "error": e.to_string() });
        }
    }

    // If the login window is open, wipe its in-memory cookies too.
    if let Some(win) = app.get_webview_window("login") {
        if let Ok(cookies) = win.cookies() {
            for cookie in cookies {
                let _ = win.delete_cookie(cookie);
            }
        }
    }

    json!({ "success": true })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_for_update,
            check_ytdlp,
            install_ytdlp,
            check_dependencies,
            setup_dependencies,
            get_video_info,
            select_folder,
            download_video,
            open_folder,
            open_external,
            open_login_window,
            capture_login_cookies,
            close_login_window,
            load_cookies,
            save_cookies,
            check_login_status,
            clear_cookies
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## v3.1.0 - 2025-01-XX

### Added

- **Bundled yt-dlp and FFmpeg**: The application now includes yt-dlp.exe and ffmpeg.exe, eliminating the need for Python or manual installations.
- Automatic download of yt-dlp and FFmpeg during installation via postinstall scripts.
- `download-ytdlp.js` script to fetch the latest yt-dlp executable from GitHub.
- `download-ffmpeg.js` script to download and extract FFmpeg essentials.

### Fixed

- **Video and audio merge issue**: Fixed problem where video and audio were downloaded as separate files on some systems by adding `--merge-output-format` and `--postprocessor-args` flags.
- Path detection for bundled executables in both development and production environments.

### Changed

- Modified `main.js` to use bundled yt-dlp and FFmpeg executables with proper PATH injection.
- Updated electron-builder configuration to include `bin/**/*` files in the unpacked resources.

## v3.0.1 - 2025-10-24

### Added

- GitHub Actions workflow to automatically build and publish releases on tags.
- README badges (Build, Release, Downloads, License) and Download section.

### Changed

- Documentation improvements for publishing to GitHub and automated releases.

## v3.0.0 - 2025-10-23

### Highlights

- Initial GUI release with Electron.
- Modern dark-themed interface with real-time progress.
- Quality selection (Best, 1080p, 720p, 480p, Audio Only) and multiple formats (MP4, MKV, WebM, AVI).
- Windows installer build support using electron-builder.

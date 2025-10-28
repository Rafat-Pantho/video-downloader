# Video Downloader v3.3.0 - Desktop Edition

![Build](https://github.com/Rafat-Pantho/video-downloader/actions/workflows/release.yml/badge.svg)
![Release](https://img.shields.io/github/v/release/Rafat-Pantho/video-downloader)
![Downloads](https://img.shields.io/github/downloads/Rafat-Pantho/video-downloader/total)
![License](https://img.shields.io/github/license/Rafat-Pantho/video-downloader)

## ⬇️ Download v3.3.0

- Latest release: [v3.3.0](https://github.com/Rafat-Pantho/video-downloader/releases/tag/v3.3.0)
- All releases: [Releases page](https://github.com/Rafat-Pantho/video-downloader/releases)

### Direct download links (v3.3.0)

- **Windows (x64)**: [video-downloader-v3.3.0-win-x64.exe](https://github.com/Rafat-Pantho/video-downloader/releases/download/v3.3.0/video-downloader-win-x64.exe)
- **macOS (arm64)**: [video-downloader-v3.3.0-mac-arm64.dmg](https://github.com/Rafat-Pantho/video-downloader/releases/download/v3.3.0/video-downloader-mac-arm64.dmg)
  - Optional portable: [video-downloader-v3.3.0-mac-arm64.zip](https://github.com/Rafat-Pantho/video-downloader/releases/download/v3.3.0/video-downloader-mac-arm64.zip)
- **Linux (x64 AppImage)**: [video-downloader-v3.3.0-linux-x64.AppImage](https://github.com/Rafat-Pantho/video-downloader/releases/download/v3.3.0/video-downloader-linux-x64.AppImage)

**Platform Support:**

- ✅ Windows 10/11 (64-bit)
- ✅ macOS 10.13+ (Intel and Apple Silicon)
- ✅ Linux (Ubuntu, Debian, Fedora, etc.)
- ⏳ Android version planned for future release

Notes:

- macOS builds may be unsigned; right-click the app and choose Open on first launch.
- For AppImage on Linux, run: `chmod +x video-downloader-linux-x64.AppImage`

A modern, beautiful **desktop application** for downloading videos from YouTube, Facebook, Instagram, TikTok, and 1000+ websites.

## ✨ Features (v3.3.0)

- 🎨 **Modern React UI** - Complete UI rewrite in React with component-based architecture
- 💜 **Purple Gradient Theme** - Eye-soothing gradient from light to dark purple
- 🧭 **Hideable Navigation Sidebar** - Slide-in/out sidebar to switch between pages
- 🏠 **Home Page** - Video URL input, info preview, settings, and real-time progress
- 🍪 **Cookie Management Page** - View, edit, and delete cookies (all, multiple, single)
- 🔐 **Embedded Login** - No browser extensions needed! Login directly in the app for private/age-restricted videos
- 🚀 **Easy to Use** - Simple, intuitive workflow
- 📥 **Multi-Platform** - YouTube, Facebook, Instagram, TikTok, Twitter, and 1000+ sites
- 🎬 **Quality Options** - Choose from Best, 1080p, 720p, 480p, or Audio Only
- 📊 **Real-time Progress** - Live download progress with percentage
- 💾 **Multiple Formats** - MP4, MKV, WebM, AVI
- ⚡ **Powered by yt-dlp** - Most reliable video downloader available
- 🖥️ **Windows Optimized** - Native Windows desktop experience

## 🚀 Quick Start

### First Time Setup

1. **Install dependencies**

  ```bash
  npm install
  ```

2. **Run the application**

  ```bash
  npm start
  ```

Notes:

- The application ships with a bundled `yt-dlp` and will automatically download a bundled `ffmpeg` on Windows during postinstall if not present. No separate Python or manual yt-dlp/ffmpeg installation is required.
- `npm start` runs the React build (webpack) and then launches Electron.
- If an automatic ffmpeg download fails, the app will still run but some merging features may require a system `ffmpeg`.

## 📋 Requirements

- Node.js 18+
- Windows 10/11 / macOS / Linux (desktop builds supported)

Notes:

- Python is no longer required — `yt-dlp` is bundled with the app.

## 🎯 How to Use

1. **Enter Video URL** - Paste any video URL into the input field on the Home page
2. **Fetch Info** - Click "Fetch Info" to retrieve video details
3. **Configure Settings**:
   - Choose download folder (default: Downloads)
   - Edit filename if desired
   - Select video format (MP4, MKV, WebM, AVI)
   - Choose quality (Best, 1080p, 720p, 480p, Audio Only)
4. **Download** - Click "Start Download" and watch the progress
5. **Complete** - Open folder or download another video
6. **Toggle Navigation** - Use the ◀/▶ button to show/hide the sidebar
7. **Manage Cookies** - Switch to the Cookie Management page to view/edit/delete cookies or open the login window

## 🛠️ Available Scripts

- `npm start` - Launch the GUI application
- `npm run dev` - Run in development mode
- `npm run cli` - Use the old CLI interface
- `npm run webpack` - Build the React bundle once (development mode)
- `npm run webpack:watch` - Rebuild on changes (development mode)
- `npm run build` - Build Windows installer (.exe)
- `npm run build:dir` - Build unpacked app folder

## 📦 Building Installer

To create a Windows installer:

```bash
npm run build
```

The installer will be created in the `dist` folder.

## 🤖 Automated Releases (GitHub Actions)

Tagging a version will automatically build the Windows installer and attach it to a GitHub Release.

```powershell
# Create and push a version tag (example)
git tag v3.1.1
git push origin v3.1.1
```

The workflow lives at `.github/workflows/release.yml` and uploads:

- `dist/*.exe`
- `dist/*.blockmap`

## 📤 Publish to GitHub

Follow these steps to publish this project to a new GitHub repository.

1. Create a new empty repository on GitHub (do not add a README, .gitignore, or license).
2. Initialize git locally and push your code:

```powershell
# From the project root
# Initialize and make the first commit
git init
git branch -M main

# Ensure build artifacts are ignored (dist/, installers, etc.)
# The provided .gitignore already covers Electron outputs

git add .
git commit -m "chore: initial GUI app v3.0"

# Set your GitHub repo URL
$repo = "https://github.com/Rafat-Pantho/video-downloader.git"
git remote add origin $repo

# Push to GitHub
git push -u origin main
```

If you already created a repo with a different name, update the remote URL accordingly.

### Optional: Tag a release

```powershell
git tag v3.0.0
git push origin v3.0.0
```

### Optional: GitHub Releases (upload installer)

After running `npm run build`, upload the generated installer from `dist/Video Downloader Setup 3.0.0.exe` to a new GitHub Release on the repo.

## 🎨 Features Overview

### Video Information Preview

- Automatic title detection
- Video duration display
- Thumbnail preview

### Download Options

- **Format**: MP4 (Recommended), MKV, WebM, AVI
- **Quality**:
  - Best Available (highest quality)
  - 1080p Full HD
  - 720p HD
  - 480p SD
  - Audio Only (extract audio)

### User Interface

- Dark theme optimized for eyes
- Smooth animations and transitions
- Real-time progress tracking
- One-click folder opening
- Error notifications with helpful messages

## 🆘 Troubleshooting

### yt-dlp not found

The app will offer to install yt-dlp automatically. If that fails:

```bash
python -m pip install yt-dlp
# or
pip install yt-dlp
```

### Python not found

Download and install Python from [python.org](https://www.python.org/downloads/)

### Download fails

- Check your internet connection
- Verify the video URL is correct and accessible
- Some videos may be region-restricted or private
- Try updating yt-dlp: `pip install -U yt-dlp`

### App won't start

```bash
# Reinstall dependencies
npm install
# Try running in dev mode
npm run dev
```

## 🔧 Technical Details

### Architecture

- **Electron**: Cross-platform desktop framework
- **Main Process** (`main.js`): Handles system operations, file system, yt-dlp, cookies, and IPC handlers
- **Renderer** (React): `src/` React components bundled via webpack, loaded by `react-index.html`
- **IPC Communication**: Secure messaging between processes

### File Structure

```text
video-downloader/
├── assets/                 # Application icons and images
├── react-index.html        # HTML wrapper that loads the React bundle
├── main.js                 # Electron main process (CommonJS)
├── src/
│   ├── App.jsx             # Root React component
│   ├── App.css             # Global styles (purple gradient theme)
│   ├── index.jsx           # React entry
│   └── components/
│       ├── Navigation.jsx  # Hideable sidebar
│       ├── HomePage.jsx    # Downloads page
│       ├── CookieManagement.jsx # Cookie CRUD page
│       ├── Navigation.css
│       ├── HomePage.css
│       └── CookieManagement.css
├── dist/
│   └── bundle.js           # Webpack-built React bundle
├── webpack.config.js       # Webpack configuration (electron-renderer target)
├── index.js                # Legacy CLI interface
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## 🔐 Code Signing (optional)

You can enable signed installers (recommended for users):

- Windows: create a code-signing certificate (PFX) and set GitHub secrets:
  - WIN_CSC_LINK (base64 or HTTPS link to PFX)
  - WIN_CSC_KEY_PASSWORD (certificate password)
- macOS: provide Apple ID credentials and team information (for signing/notarization):
  - APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID

The build workflow will automatically upload unsigned artifacts; once secrets are configured, electron-builder will sign when possible.

## 📝 Supported Websites

YouTube, Facebook, Instagram, TikTok, Twitter, Vimeo, Dailymotion, Reddit, Twitch, and 1000+ more!

Full list: [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## 🎉 What's New in v3.3.0

### Major UI Update (React + Purple Theme)

- ✨ Complete UI redesign using React
- 💜 Purple gradient theme with glassmorphism cards and smooth animations
- 🧭 Hideable navigation sidebar (Home, Cookie Management)
- 🏠 Home Page improvements: info preview, richer settings, progress bar
- 🍪 Cookie Management: delete all, bulk delete, delete one, edit cookie values
- 🔌 IPC updates: load/save/clear cookies, open login window

> Tip: The navigation can be toggled with the button at the top-left (◀/▶).

### Developer Experience

- Webpack + Babel pipeline for JSX and CSS
- Electron renderer targeting for optimal integration
- CommonJS `main.js` for compatibility (no `type: module` required)

---

## Highlights from v3.2.0

### NEW: Embedded Browser Login 🔐

- ✅ **No browser extensions needed** - Login directly in the app
- ✅ **Automatic detection** - App prompts for login when private/restricted videos are detected
- ✅ **Access private videos** - Download from private Facebook groups
- ✅ **Age-restricted YouTube** - Bypass age restrictions with your account
- ✅ **Multi-site support** - Works with Facebook, YouTube, Instagram, Twitter, and more
- ✅ **Secure storage** - Session cookies saved locally on your device
- ✅ **Persistent login** - Stay logged in for future downloads

### 3.1.x Highlights

- ✅ Bundled yt-dlp (no Python required)
- ✅ Bundled ffmpeg for Windows with reliable downloader (handles HTTP redirects)
- ✅ Fixed video+audio merging by explicitly providing bundled ffmpeg location
- ✅ Fixed YouTube Music playlist info fetch (now uses --no-playlist for single links)
- ✅ Improved error handling and user-friendly messages for unsupported/private/geo-restricted videos
- ✅ Increased info-fetch timeout for slower platforms (Facebook/Instagram)
- ✅ CI/release fixes: explicit artifact globs and release upload reliability

## 🔐 Using Embedded Login for Private Videos

The app now features **built-in browser login** - no need to install any browser extensions!

### How It Works

1. **Try to download** a private or age-restricted video
2. **App detects** the restriction automatically
3. **Login prompt** appears - click "Login"
4. **Browser window** opens within the app
5. **Login normally** to the website (Facebook, YouTube, etc.)
6. **Close the window** when done - your session is saved!
7. **Download again** - the video will now download successfully

### Supported Scenarios

- 🔒 Private Facebook group videos
- 🔞 Age-restricted YouTube videos  
- 👥 Member-only content
- 🔐 Videos requiring authentication
- 📱 Instagram private accounts
- 🐦 Twitter/X protected tweets

### Manual Login

You can also login proactively:

1. Click the **"Login"** button in the app
2. Login to your account
3. Close the window
4. Your session is saved for future downloads

### Logout

Click **"Logout"** to clear all saved cookies and sessions.

## 📄 License

ISC License

## 🙏 Credits

Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The best video downloader

## 📝 Notes

- Private/age-restricted videos may not work
- Some videos are geo-blocked
- First download may take a moment to start

## ✅ Tested On

- ✅ YouTube
- ✅ YouTube Music
- ✅ Facebook
- ✅ Instagram
- ✅ TikTok
- ✅ Twitter/X

---

**Simple. Fast. Reliable.** 🎉

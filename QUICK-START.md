# 🚀 Quick Start Guide - Video Downloader v3.0

## First Launch

1. **Open Terminal/Command Prompt** in the project folder

2. **Install Dependencies** (first time only)
   ```bash
   npm install
   ```

3. **Launch the App**
   ```bash
   npm start
   ```

## Using the Application

### Step 1: Enter Video URL
- Paste any video URL (YouTube, Facebook, Instagram, TikTok, etc.)
- Click **Fetch Info** button

### Step 2: Review Video Information
- See video title, duration, and thumbnail
- The app will auto-fill the filename

### Step 3: Configure Download Settings
- **Folder**: Click Browse to select where to save (default: Downloads)
- **Filename**: Edit if desired (no extension needed)
- **Format**: Choose MP4, MKV, WebM, or AVI
- **Quality**: Select Best, 1080p, 720p, 480p, or Audio Only

### Step 4: Download
- Click **Start Download**
- Watch real-time progress
- When complete, click **Open Folder** to see your file

### Step 5: Download More
- Click **Download Another** to start over

## Keyboard Shortcuts

- **Enter** on URL field = Fetch Info
- **Ctrl + C** = Copy selected text
- **Ctrl + V** = Paste URL

## Tips

✅ **Best Quality**: Select "Best Available" for highest quality
✅ **Audio Only**: Great for music videos or podcasts
✅ **Multiple Downloads**: After one completes, download another instantly
✅ **Check Space**: Make sure you have enough disk space
✅ **Update yt-dlp**: Run `pip install -U yt-dlp` periodically for best results

## Common Issues

### "yt-dlp not found"
The app will offer to install it. If that fails:
```bash
pip install yt-dlp
```

### "Python not found"
Install Python from: https://www.python.org/downloads/
Make sure to check "Add Python to PATH" during installation

### Download Slow
- Check your internet connection
- Some videos are large (4K videos can be several GB)
- Try a lower quality option

### Video Unavailable
- Some videos are region-locked
- Private videos cannot be downloaded
- Age-restricted content may require authentication

## Building an Installer

To create a Windows .exe installer:

```bash
npm run build
```

The installer will be in the `dist` folder.

## Need Help?

- Check README.md for full documentation
- Update yt-dlp: `pip install -U yt-dlp`
- Report issues or bugs to the developer

---

**Enjoy downloading! 🎉**

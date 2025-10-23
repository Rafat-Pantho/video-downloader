import inquirer from 'inquirer';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

const execPromise = promisify(exec);

// Generate random name
function generateRandomName() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Check if yt-dlp is installed
async function checkYtDlp() {
  try {
    const { stdout } = await execPromise('yt-dlp --version');
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

// Install yt-dlp
async function installYtDlp() {
  console.log(chalk.yellow('\n⚠️  Installing yt-dlp...\n'));
  try {
    await execPromise('python -m pip install -U yt-dlp');
    console.log(chalk.green('✓ yt-dlp installed successfully!\n'));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Failed to install yt-dlp'));
    console.log(chalk.yellow('\nPlease install manually:'));
    console.log(chalk.cyan('  pip install yt-dlp\n'));
    return false;
  }
}

// Get video title
async function getVideoTitle(url) {
  try {
    const { stdout } = await execPromise(`yt-dlp --get-title "${url}"`, { timeout: 30000 });
    return stdout.trim().replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  } catch (error) {
    return generateRandomName();
  }
}

// Show Windows folder dialog
async function selectFolder() {
  return new Promise((resolve) => {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = 'Select download folder'
      $dialog.SelectedPath = [Environment]::GetFolderPath('UserProfile') + '\\Downloads'
      if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.SelectedPath }
    `.replace(/\n/g, '; ');

    exec(`powershell -Command "${psScript}"`, (error, stdout) => {
      const folder = stdout.trim();
      resolve(folder || path.join(process.env.USERPROFILE, 'Downloads'));
    });
  });
}

// Show custom dialog with all options
async function showDownloadDialog(defaultName) {
  return new Promise((resolve) => {
    // Escape single quotes in defaultName
    const safeName = defaultName.replace(/'/g, "''");
    
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Download Settings'
$form.Size = New-Object System.Drawing.Size(520, 320)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.TopMost = $true

$lblFolder = New-Object System.Windows.Forms.Label
$lblFolder.Location = New-Object System.Drawing.Point(20, 20)
$lblFolder.Size = New-Object System.Drawing.Size(100, 20)
$lblFolder.Text = 'Save to folder:'
$form.Controls.Add($lblFolder)

$txtFolder = New-Object System.Windows.Forms.TextBox
$txtFolder.Location = New-Object System.Drawing.Point(20, 45)
$txtFolder.Size = New-Object System.Drawing.Size(380, 25)
$txtFolder.Text = [Environment]::GetFolderPath('UserProfile') + '\\Downloads'
$form.Controls.Add($txtFolder)

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Location = New-Object System.Drawing.Point(410, 43)
$btnBrowse.Size = New-Object System.Drawing.Size(80, 27)
$btnBrowse.Text = 'Browse...'
$btnBrowse.Add_Click({
  $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $folderDialog.SelectedPath = $txtFolder.Text
  if ($folderDialog.ShowDialog() -eq 'OK') {
    $txtFolder.Text = $folderDialog.SelectedPath
  }
})
$form.Controls.Add($btnBrowse)

$lblName = New-Object System.Windows.Forms.Label
$lblName.Location = New-Object System.Drawing.Point(20, 90)
$lblName.Size = New-Object System.Drawing.Size(150, 20)
$lblName.Text = 'Filename (no extension):'
$form.Controls.Add($lblName)

$txtName = New-Object System.Windows.Forms.TextBox
$txtName.Location = New-Object System.Drawing.Point(20, 115)
$txtName.Size = New-Object System.Drawing.Size(470, 25)
$txtName.Text = '${safeName}'
$form.Controls.Add($txtName)

$lblFormat = New-Object System.Windows.Forms.Label
$lblFormat.Location = New-Object System.Drawing.Point(20, 160)
$lblFormat.Size = New-Object System.Drawing.Size(100, 20)
$lblFormat.Text = 'Video format:'
$form.Controls.Add($lblFormat)

$cmbFormat = New-Object System.Windows.Forms.ComboBox
$cmbFormat.Location = New-Object System.Drawing.Point(20, 185)
$cmbFormat.Size = New-Object System.Drawing.Size(470, 25)
$cmbFormat.DropDownStyle = 'DropDownList'
@('mp4', 'mkv', 'webm', 'avi') | ForEach-Object { [void]$cmbFormat.Items.Add($_) }
$cmbFormat.SelectedIndex = 0
$form.Controls.Add($cmbFormat)

$btnOK = New-Object System.Windows.Forms.Button
$btnOK.Location = New-Object System.Drawing.Point(310, 235)
$btnOK.Size = New-Object System.Drawing.Size(85, 32)
$btnOK.Text = 'Download'
$btnOK.DialogResult = 'OK'
$form.AcceptButton = $btnOK
$form.Controls.Add($btnOK)

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Location = New-Object System.Drawing.Point(405, 235)
$btnCancel.Size = New-Object System.Drawing.Size(85, 32)
$btnCancel.Text = 'Cancel'
$btnCancel.DialogResult = 'Cancel'
$form.CancelButton = $btnCancel
$form.Controls.Add($btnCancel)

$result = $form.ShowDialog()
if ($result -eq 'OK') {
  $data = @{
    folder = $txtFolder.Text
    name = $txtName.Text
    format = $cmbFormat.SelectedItem.ToString()
  }
  $json = $data | ConvertTo-Json -Compress
  Write-Output "OK:$json"
} else {
  Write-Output 'CANCEL'
}
`;

    // Write script to temporary file
    const tempFile = path.join(process.env.TEMP || '/tmp', `dialog_${Date.now()}.ps1`);
    
    try {
      fs.writeFileSync(tempFile, psScript, 'utf8');
    } catch (err) {
      console.error(chalk.red('Failed to create temp script:'), err.message);
      resolve(null);
      return;
    }

    exec(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch {}

      const output = stdout.trim();
      
      if (error) {
        console.error(chalk.red('Dialog error:'), stderr || error.message);
        resolve(null);
        return;
      }

      if (output.startsWith('OK:')) {
        try {
          const json = output.substring(3);
          resolve(JSON.parse(json));
        } catch (e) {
          console.error(chalk.red('Failed to parse dialog result:'), e.message);
          console.error(chalk.gray('Raw output:'), output);
          resolve(null);
        }
      } else if (output === 'CANCEL') {
        resolve(null);
      } else {
        console.error(chalk.red('Unexpected dialog output:'), output);
        resolve(null);
      }
    });
  });
}

// Download video
async function downloadVideo(url, folder, filename, format) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(folder, `${filename}.%(ext)s`);
    
    const args = [
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', format,
      '--output', outputPath,
      '--no-playlist',
      '--progress',
      '--newline',
      url
    ];

    console.log(chalk.cyan('\n⬇️  Downloading...\n'));
    
    const ytdlp = spawn('yt-dlp', args);
    let lastLine = '';

    ytdlp.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text.includes('[download]') && text.includes('%')) {
        process.stdout.write('\r' + chalk.cyan(text));
        lastLine = text;
      }
    });

    ytdlp.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ERROR')) {
        console.error(chalk.red('\n' + text));
      }
    });

    ytdlp.on('close', (code) => {
      console.log('\n');
      if (code === 0) {
        const finalPath = path.join(folder, `${filename}.${format}`);
        resolve(finalPath);
      } else {
        reject(new Error('Download failed. The video may be unavailable, private, or restricted.'));
      }
    });

    ytdlp.on('error', (err) => {
      reject(new Error('Failed to run yt-dlp. Make sure it is installed.'));
    });
  });
}

// Main
async function main() {
  console.clear();
  console.log(chalk.cyan.bold('\n╔════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║     Video Downloader v2.0              ║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════╝\n'));

  // Check yt-dlp
  const spinner = ora('Checking yt-dlp...').start();
  const version = await checkYtDlp();
  
  if (!version) {
    spinner.stop();
    const { install } = await inquirer.prompt([{
      type: 'confirm',
      name: 'install',
      message: 'yt-dlp not found. Install it now?',
      default: true
    }]);
    
    if (!install || !(await installYtDlp())) {
      console.log(chalk.red('Cannot continue without yt-dlp.\n'));
      process.exit(1);
    }
  } else {
    spinner.succeed(chalk.green(`yt-dlp ${version} found`));
  }

  while (true) {
    // Get URL
    const { url } = await inquirer.prompt([{
      type: 'input',
      name: 'url',
      message: 'Enter video URL:',
      validate: input => input.includes('http') ? true : 'Please enter a valid URL'
    }]);

    // Get title
    const titleSpinner = ora('Getting video info...').start();
    const defaultName = await getVideoTitle(url);
    titleSpinner.succeed('Video info retrieved');

    // Show dialog
    console.log(chalk.cyan('\n📋 Opening settings dialog...\n'));
    const settings = await showDownloadDialog(defaultName);

    if (!settings) {
      console.log(chalk.yellow('⚠️  Cancelled by user\n'));
      const { retry } = await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Try another video?',
        default: true
      }]);
      if (!retry) break;
      continue;
    }

    // Ensure folder exists
    if (!fs.existsSync(settings.folder)) {
      fs.mkdirSync(settings.folder, { recursive: true });
    }

    // Download
    try {
      const filePath = await downloadVideo(url, settings.folder, settings.name, settings.format);
      
      console.log(chalk.green.bold('✓ Download complete!'));
      console.log(chalk.cyan(`📁 ${filePath}`));
      
      if (fs.existsSync(filePath)) {
        const size = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
        console.log(chalk.gray(`📊 Size: ${size} MB\n`));
      }
    } catch (error) {
      console.error(chalk.red(`\n✗ ${error.message}\n`));
    }

    // Continue?
    const { another } = await inquirer.prompt([{
      type: 'confirm',
      name: 'another',
      message: 'Download another video?',
      default: false
    }]);

    if (!another) break;
    console.log('\n' + '─'.repeat(50) + '\n');
  }

  console.log(chalk.cyan.bold('\n👋 Thank you!\n'));
}

main().catch(err => {
  console.error(chalk.red('\n✗ Error:'), err.message);
  process.exit(1);
});

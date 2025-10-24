import { spawn } from 'child_process';

function runScript(scriptName) {
  return new Promise((resolve) => {
    console.log(`\nRunning ${scriptName}...`);
    const child = spawn('node', [scriptName], { stdio: 'inherit', shell: true });
    
    child.on('close', (code) => {
      if (code !== 0) {
        console.log(`${scriptName} exited with code ${code}, but continuing...`);
      }
      resolve(); // Always resolve, never reject
    });
    
    child.on('error', (err) => {
      console.error(`Error running ${scriptName}:`, err.message);
      resolve(); // Continue even on error
    });
  });
}

async function main() {
  await runScript('download-ytdlp.js');
  await runScript('download-ffmpeg.js');
  console.log('\n✓ Postinstall complete');
}

main().catch(err => {
  console.error('Postinstall error:', err);
  process.exit(0); // Exit with success anyway to not fail npm install
});

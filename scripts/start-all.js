// Menjalankan gateway, Service Nilai, dan Service Transkrip sekaligus.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../shared/config');

if (!fs.existsSync(config.DB_PATH)) {
  console.log('Database belum ada. Jalankan dahulu: npm run seed');
  process.exit(1);
}

const proses = [
  ['GATEWAY', 'gateway/index.js'],
  ['NILAI', 'services/nilai/index.js'],
  ['TRANSKRIP', 'services/transkrip/index.js'],
].map(([nama, file]) => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', file)], { stdio: 'inherit' });
  child.on('exit', (code) => console.log(`[${nama}] berhenti (code ${code})`));
  return child;
});

const matikan = () => {
  proses.forEach((p) => p.kill());
  process.exit(0);
};
process.on('SIGINT', matikan);
process.on('SIGTERM', matikan);

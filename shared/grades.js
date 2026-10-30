// Konversi nilai angka (0–100) ke nilai huruf.
function toHuruf(angka) {
  if (angka >= 85) return 'A';
  if (angka >= 80) return 'A-';
  if (angka >= 75) return 'B+';
  if (angka >= 70) return 'B';
  if (angka >= 65) return 'B-';
  if (angka >= 60) return 'C+';
  if (angka >= 55) return 'C';
  if (angka >= 40) return 'D';
  return 'E';
}

module.exports = { toHuruf };

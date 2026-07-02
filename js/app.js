const guard = new MovementGuard({ speedLimitKmh: 1 });

const overlay = document.getElementById('speed-lock-overlay');
const lockSpeedValue = document.getElementById('lock-speed-value');
const badge = document.getElementById('speed-badge');
const badgeValue = document.getElementById('speed-badge-value');
const badgeLabel = badge.querySelector('.speed-badge-label');
const gpsError = document.getElementById('gps-error');

guard.addEventListener('lock', () => {
  overlay.classList.add('is-visible');
});

guard.addEventListener('unlock', () => {
  overlay.classList.remove('is-visible');
});

guard.addEventListener('speedchange', (e) => {
  const kmh = e.detail.speedKmh.toFixed(1);
  badgeValue.textContent = `${kmh} km/h`;
  lockSpeedValue.textContent = `${kmh} km/h`;

  if (e.detail.locked) {
    badge.className = 'speed-badge speed-badge--critical';
    badgeLabel.textContent = 'Exceso de velocidad';
  } else {
    badge.className = 'speed-badge speed-badge--good';
    badgeLabel.textContent = 'Velocidad normal';
  }
});

guard.addEventListener('error', (e) => {
  gpsError.textContent = `Error de GPS (${e.detail.code}): ${e.detail.message || ''}`;
});

// -- Control GPS real --
document.getElementById('start-gps').addEventListener('click', () => {
  gpsError.textContent = '';
  guard.start();
});

document.getElementById('stop-gps').addEventListener('click', () => {
  guard.stop();
});

// -- Panel de simulación (solo demostración) --
const simSlider = document.getElementById('sim-speed');
const simSpeedValue = document.getElementById('sim-speed-value');

simSlider.addEventListener('input', () => {
  simSpeedValue.textContent = simSlider.value;
  guard.simulateSpeed(Number(simSlider.value));
});

document.querySelectorAll('[data-sim-speed]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kmh = Number(btn.dataset.simSpeed);
    simSlider.value = kmh;
    simSpeedValue.textContent = kmh;
    guard.simulateSpeed(kmh);
  });
});
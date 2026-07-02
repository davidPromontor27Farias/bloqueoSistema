class MovementGuard extends EventTarget {
  constructor({
    speedLimitKmh = 10,
    lockDebounceMs = 1500,
    unlockDebounceMs = 1500,
    smoothingAlpha = 0.35,
    minAccuracyMeters = 50,
  } = {}) {
    super();

    this.speedLimitKmh = speedLimitKmh;
    this.lockDebounceMs = lockDebounceMs;
    this.unlockDebounceMs = unlockDebounceMs;
    this.smoothingAlpha = smoothingAlpha;
    this.minAccuracyMeters = minAccuracyMeters;

    this._watchId = null;
    this._lastPosition = null;
    this._smoothedSpeedKmh = null;
    this._locked = false;
    this._aboveSince = null;
    this._belowSince = null;
  }

  get isLocked() {
    return this._locked;
  }

  get currentSpeedKmh() {
    return this._smoothedSpeedKmh;
  }

  get isTracking() {
    return this._watchId !== null;
  }

  /** Inicia el monitoreo real por GPS. Requiere contexto seguro (https o localhost). */
  start() {
    if (!('geolocation' in navigator)) {
      this._emit('error', {
        code: 'unsupported',
        message: 'Este navegador no soporta geolocalización.',
      });
      return false;
    }

    if (this._watchId !== null) return true; // ya está corriendo

    this._watchId = navigator.geolocation.watchPosition(
      (position) => this._handlePosition(position),
      (error) => this._handleGeoError(error),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return true;
  }

  /** Detiene el monitoreo real por GPS y reinicia el estado interno. */
  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    this._lastPosition = null;
    this._aboveSince = null;
    this._belowSince = null;
  }

  /**
   * Alimenta una velocidad simulada (km/h) por el mismo pipeline de
   * suavizado y decisión de bloqueo que usan las lecturas GPS reales.
   * Pensado para demostración/pruebas, no reemplaza al GPS real.
   */
  simulateSpeed(kmh) {
    const rawKmh = Math.max(0, Number(kmh) || 0);
    this._updateSmoothedSpeed(rawKmh);
    this._evaluate({ simulated: true, accuracy: null });
  }

  // -- internos --------------------------------------------------------

  _handlePosition(position) {
    const { coords, timestamp } = position;

    if (
      typeof coords.accuracy === 'number' &&
      coords.accuracy > this.minAccuracyMeters
    ) {
      // Señal GPS poco confiable: no actualizamos velocidad con este dato.
      this._lastPosition = { coords, timestamp };
      return;
    }

    let speedMs = null;

    if (typeof coords.speed === 'number' && coords.speed >= 0) {
      speedMs = coords.speed;
    } else if (this._lastPosition) {
      const dtSec = (timestamp - this._lastPosition.timestamp) / 1000;
      if (dtSec > 0.5) {
        const distM = MovementGuard._haversineMeters(
          this._lastPosition.coords.latitude,
          this._lastPosition.coords.longitude,
          coords.latitude,
          coords.longitude
        );
        speedMs = distM / dtSec;
      }
    }

    this._lastPosition = { coords, timestamp };

    if (speedMs === null) return; // primera lectura: aún no hay velocidad

    this._updateSmoothedSpeed(speedMs * 3.6);
    this._evaluate({ simulated: false, accuracy: coords.accuracy });
  }

  _handleGeoError(error) {
    const codes = {
      1: 'permission_denied',
      2: 'position_unavailable',
      3: 'timeout',
    };
    this._emit('error', {
      code: codes[error.code] || 'unknown',
      message: error.message,
    });
  }

  _updateSmoothedSpeed(rawKmh) {
    this._smoothedSpeedKmh =
      this._smoothedSpeedKmh === null
        ? rawKmh
        : this.smoothingAlpha * rawKmh +
          (1 - this.smoothingAlpha) * this._smoothedSpeedKmh;
  }

  _evaluate({ simulated, accuracy }) {
    const now = Date.now();
    const speedKmh = this._smoothedSpeedKmh;
    const overLimit = speedKmh > this.speedLimitKmh;

    if (overLimit) {
      if (this._aboveSince === null) this._aboveSince = now;
      this._belowSince = null;

      if (!this._locked && now - this._aboveSince >= this.lockDebounceMs) {
        this._locked = true;
        this._emit('lock', { speedKmh, simulated });
      }
    } else {
      if (this._belowSince === null) this._belowSince = now;
      this._aboveSince = null;

      if (this._locked && now - this._belowSince >= this.unlockDebounceMs) {
        this._locked = false;
        this._emit('unlock', { speedKmh, simulated });
      }
    }

    this._emit('speedchange', {
      speedKmh,
      accuracy,
      locked: this._locked,
      simulated,
    });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  static _haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
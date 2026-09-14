import { clearStreamRealtimeGrant, getStreamRealtimeGrant } from './realtime-grant.js';

const WARNING_LEAD_MS = 2 * 60_000;

let warningTimer: number | null = null;
let endTimer: number | null = null;
let stopped = false;

function setStatus(message: string): void {
  const target = document.querySelector<HTMLElement>('[data-realtime-status]');
  if (target) target.textContent = message;
}

function clearTimers(): void {
  if (warningTimer !== null) clearTimeout(warningTimer);
  if (endTimer !== null) clearTimeout(endTimer);
  warningTimer = null;
  endTimer = null;
}

function showWarning(): void {
  if (stopped) return;
  setStatus('そろそろ終了します');
}

function forceHome(): void {
  if (stopped) return;
  stopped = true;
  clearTimers();
  clearStreamRealtimeGrant();
  location.replace('./index.html');
}

function scheduleLifecycle(): void {
  if (stopped) return;
  clearTimers();
  const grant = getStreamRealtimeGrant();
  if (!grant) return;

  const now = Date.now();
  const warningDelay = grant.expiresAt - WARNING_LEAD_MS - now;
  const endDelay = grant.expiresAt - now;

  if (endDelay <= 0) {
    forceHome();
    return;
  }
  if (warningDelay <= 0) {
    showWarning();
  } else {
    warningTimer = window.setTimeout(showWarning, warningDelay);
  }
  endTimer = window.setTimeout(forceHome, endDelay);
}

function serviceReady(): boolean {
  const content = document.querySelector<HTMLElement>('[data-service-content]');
  return !!content && content.hidden === false;
}

document.addEventListener('orikuro:service-ready', scheduleLifecycle, { once: true });
if (serviceReady()) scheduleLifecycle();
window.addEventListener('pagehide', () => {
  stopped = true;
  clearTimers();
}, { once: true });

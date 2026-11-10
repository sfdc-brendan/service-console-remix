import type { WorkItem } from '@/api/console/consoleApi';

let audio: AudioContext | null = null;

/** Two-tone chime. Browsers only allow audio after the agent has interacted with the page. */
export function playOfferChime(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') {
      void audio.resume();
    }
    const start = audio.currentTime;
    [660, 880].forEach((frequency, index) => {
      if (!audio) {
        return;
      }
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = start + index * 0.16;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.34);
    });
  } catch {
    // audio is a nicety; the offer card is the source of truth
  }
}

/** Ask once, from a click, so desktop alerts can reach agents working in another window. */
export function requestOfferNotifications(): void {
  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'default'
  ) {
    void Notification.requestPermission();
  }
}

export function notifyOffer(work: WorkItem, onOpen: () => void): void {
  if (
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted' ||
    document.visibilityState === 'visible'
  ) {
    return;
  }
  const skills = work.routing?.skills.map(skill => skill.name).join(', ');
  const notification = new Notification(
    `New ${work.channel === 'Case' ? 'case' : work.channel.toLowerCase()} for you · ${work.priority}`,
    {
      body: [
        work.subject,
        work.routing?.intent,
        skills ? `Skills: ${skills}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      tag: `slk-offer-${work.id}`,
      requireInteraction: true,
    }
  );
  notification.onclick = () => {
    window.focus();
    onOpen();
    notification.close();
  };
}

const deleteRequest = document.querySelector<HTMLInputElement>('[data-preregister-delete-request]');
const subject = document.querySelector<HTMLInputElement>('#contact-subject');
const message = document.querySelector<HTMLTextAreaElement>('#contact-message');
const subjectField = subject?.closest<HTMLElement>('.contact-field') ?? null;
const messageField = message?.closest<HTMLElement>('.contact-field') ?? null;
const submit = document.querySelector<HTMLButtonElement>('[data-contact-form] button[type="submit"]');
const modeNote = document.querySelector<HTMLElement>('[data-delete-mode-note]');

function applyMode(): void {
  if (!deleteRequest || !subject || !message) return;
  const active = deleteRequest.checked;

  if (active) {
    subject.value = '';
    message.value = '';
  }

  subject.disabled = active;
  message.disabled = active;
  subject.required = !active;
  message.required = !active;
  subjectField?.classList.toggle('is-disabled', active);
  messageField?.classList.toggle('is-disabled', active);
  modeNote?.toggleAttribute('hidden', !active);

  subject.dispatchEvent(new Event('input', { bubbles: true }));
  message.dispatchEvent(new Event('input', { bubbles: true }));

  if (submit) submit.textContent = active ? '削除確認メールを送信' : '送信';
}

deleteRequest?.addEventListener('change', applyMode);
applyMode();

// onboarding.js - Client-Side Onboarding & Auth Logic
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('onboardingForm');
  const alertBanner = document.getElementById('alertBanner');
  const nameInput = document.getElementById('name');
  const contactTypeSelect = document.getElementById('contactType');
  const contactInput = document.getElementById('contact');
  const expectationsInput = document.getElementById('expectations');
  const btnSubmit = document.getElementById('btnSubmit');

  // Expectations mystery button
  const btnSkipExpectations = document.getElementById('btnSkipExpectations');
  const contactHint = document.getElementById('contactHint');

  // 1. Check existing session on load (unless user explicitly requested to reset / back to login)
  async function checkSession() {
    const isReset = new URLSearchParams(window.location.search).has('reset');
    if (isReset) {
      try {
        await fetch('/api/auth', { method: 'DELETE' });
      } catch (e) {}
      localStorage.removeItem('applicant_id');
      localStorage.removeItem('applicant_status');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return;
    }

    try {
      const storedId = localStorage.getItem('applicant_id');
      const query = storedId ? `?applicant_id=${encodeURIComponent(storedId)}` : '';
      const res = await fetch(`/api/auth${query}`);
      const data = await res.json();

      if (data.authenticated && data.applicant) {
        const app = data.applicant;
        localStorage.setItem('applicant_id', app.id);
        localStorage.setItem('applicant_status', app.status || 'viewing');

        // Route according to status
        if (app.status === 'accepted') {
          window.location.href = '/accepted.html';
        } else if (app.status === 'rejected') {
          window.location.href = '/rejected.html';
        } else {
          window.location.href = '/dashboard.html';
        }
      }
    } catch (err) {
      console.warn('Session check warning:', err.message);
    }
  }

  checkSession();

  // 2. Dynamic contact input placeholder & hints (zero emojis)
  contactTypeSelect.addEventListener('change', () => {
    const type = contactTypeSelect.value;
    switch (type) {
      case 'instagram':
        contactInput.placeholder = '@your_cutest_handle';
        if (contactHint) contactHint.textContent = 'Your actual handle so I can double-tap your stories.';
        break;
      case 'telegram':
        contactInput.placeholder = '@your_secret_handle';
        if (contactHint) contactHint.textContent = 'Where we can text safely and exchange memes 24/7.';
        break;
      case 'snapchat':
        contactInput.placeholder = 'your_snap_username';
        if (contactHint) contactHint.textContent = 'Send me your funniest face snaps.';
        break;
      case 'whatsapp':
        contactInput.placeholder = '+91 98765 43210';
        if (contactHint) contactHint.textContent = 'Real number so my messages reach only you.';
        break;
      case 'phone':
        contactInput.placeholder = '+91 98765 43210';
        if (contactHint) contactHint.textContent = 'So I can call you when you are on my mind.';
        break;
      case 'email':
        contactInput.placeholder = 'your_sweet_email@example.com';
        if (contactHint) contactHint.textContent = 'Where my digital love notes will not bounce.';
        break;
      default:
        contactInput.placeholder = 'Contact handle';
        if (contactHint) contactHint.textContent = 'Where my late-night texts should go.';
    }
  });

  // 3. Skip / Mystery Expectations Handler
  if (btnSkipExpectations) {
    btnSkipExpectations.addEventListener('click', () => {
      expectationsInput.value = 'Skipped — I prefer to let the chemistry happen organically.';
    });
  }

  // Helper: Show/Hide Alert Banner
  function showAlert(message) {
    alertBanner.textContent = message;
    alertBanner.style.display = 'block';
  }

  function hideAlert() {
    alertBanner.style.display = 'none';
  }

  // 4. Handle Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const name = nameInput.value.trim();
    const contactType = contactTypeSelect.value;
    const contact = contactInput.value.trim();
    const expectations = expectationsInput.value.trim() || 'Skipped — Open to exploring the vibe organically';

    if (!name) {
      showAlert('Please enter your name.');
      return;
    }
    if (!contact) {
      showAlert('Please enter your contact handle.');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Connecting...';

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contactType,
          contact,
          photo: 'default-avatar',
          expectations,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to authenticate');
      }

      const applicant = data.applicant;
      localStorage.setItem('applicant_id', applicant.id);
      localStorage.setItem('applicant_status', applicant.status || 'viewing');

      // Navigate to pitch deck
      window.location.href = '/dashboard.html';
    } catch (err) {
      showAlert(err.message || 'Something went wrong. Please try again.');
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Enter Pitch Deck \u2192';
    }
  });
});

// onboarding.js - Client-Side Onboarding & Auth Logic
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('onboardingForm');
  const alertBanner = document.getElementById('alertBanner');
  const nameInput = document.getElementById('name');
  const contactTypeSelect = document.getElementById('contactType');
  const contactInput = document.getElementById('contact');
  const expectationsInput = document.getElementById('expectations');
  const btnSubmit = document.getElementById('btnSubmit');

  // Photo elements
  const fileInput = document.getElementById('fileInput');
  const btnUploadFile = document.getElementById('btnUploadFile');
  const btnToggleUrl = document.getElementById('btnToggleUrl');
  const btnSkipPhoto = document.getElementById('btnSkipPhoto');
  const urlContainer = document.getElementById('urlInputContainer');
  const photoUrlInput = document.getElementById('photoUrl');
  const previewImage = document.getElementById('previewImage');
  const previewPlaceholder = document.getElementById('previewPlaceholder');

  // Expectations skip button
  const btnSkipExpectations = document.getElementById('btnSkipExpectations');

  const contactHint = document.getElementById('contactHint');
  const photoStatusNote = document.getElementById('photoStatusNote');

  let currentPhoto = '';

  // 1. Check existing session on load
  async function checkSession() {
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

  // 3. Photo Upload with Canvas Compression
  btnUploadFile.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showAlert('Please choose an image file (PNG, JPG, or WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showAlert('Image file must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress image using canvas
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800; // Optimal size for fast mobile upload and Telegram bot

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        currentPhoto = canvas.toDataURL('image/jpeg', 0.82);
        showPhotoPreview(currentPhoto);
        if (photoStatusNote) {
          photoStatusNote.textContent = 'Looking gorgeous! Ready to steal my heart.';
          photoStatusNote.style.color = '#059669';
        }
        hideAlert();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // 4. Toggle URL Input & Preview
  btnToggleUrl.addEventListener('click', () => {
    const isVisible = urlContainer.style.display !== 'none';
    urlContainer.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) photoUrlInput.focus();
  });

  photoUrlInput.addEventListener('input', () => {
    const urlVal = photoUrlInput.value.trim();
    if (urlVal) {
      currentPhoto = urlVal;
      showPhotoPreview(urlVal);
      if (photoStatusNote) {
        photoStatusNote.textContent = 'Looking gorgeous! Ready to steal my heart.';
        photoStatusNote.style.color = '#059669';
      }
    }
  });

  // 5. Skip Handlers
  btnSkipPhoto.addEventListener('click', () => {
    currentPhoto = 'default-avatar';
    previewImage.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    photoUrlInput.value = '';
    urlContainer.style.display = 'none';
    if (photoStatusNote) {
      photoStatusNote.textContent = 'Too shy? Your charm already speaks for itself.';
      photoStatusNote.style.color = 'var(--text-dim)';
    }
  });

  btnSkipExpectations.addEventListener('click', () => {
    expectationsInput.value = 'Skipped — I prefer to let the chemistry happen organically.';
  });

  // Helper: Display Photo Preview
  function showPhotoPreview(src) {
    previewImage.src = src;
    previewImage.style.display = 'block';
    previewPlaceholder.style.display = 'none';
  }

  // Helper: Show/Hide Alert Banner
  function showAlert(message) {
    alertBanner.textContent = message;
    alertBanner.style.display = 'block';
  }

  function hideAlert() {
    alertBanner.style.display = 'none';
  }

  // 6. Handle Form Submit
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
          photo: currentPhoto || 'default-avatar',
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

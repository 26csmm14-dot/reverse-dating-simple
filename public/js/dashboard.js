// dashboard.js - Pitch Deck Interactions, Date Selection, & Proposal Submission
document.addEventListener('DOMContentLoaded', () => {
  let applicant = null;
  let selectedDateId = 'trail-trek';
  let selectedDateTitle = 'Scenic Mountain Trail Trek & Hilltop Sunset';
  let isPending = false;
  let pollInterval = null;

  // DOM Elements
  const navUserName = document.getElementById('navUserName');
  const btnLogout = document.getElementById('btnLogout');
  const pendingBanner = document.getElementById('pendingBanner');
  const btnRefreshStatus = document.getElementById('btnRefreshStatus');
  const dateOptions = document.querySelectorAll('.date-option');
  const selectedDateLabel = document.getElementById('selectedDateLabel');

  // Modal Elements
  const btnOpenModal = document.getElementById('btnOpenModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const proposalModal = document.getElementById('proposalModal');
  const proposalForm = document.getElementById('proposalForm');
  const modalCandidateName = document.getElementById('modalCandidateName');
  const modalDateTitle = document.getElementById('modalDateTitle');
  const pitchNote = document.getElementById('pitchNote');
  const btnSubmitProposal = document.getElementById('btnSubmitProposal');
  const modalAlert = document.getElementById('modalAlert');

  // 1. Session verification & load
  async function loadSession() {
    const storedId = localStorage.getItem('applicant_id');
    const query = storedId ? `?applicant_id=${encodeURIComponent(storedId)}` : '';

    try {
      const res = await fetch(`/api/auth${query}`);
      const data = await res.json();

      if (data.authenticated && data.applicant) {
        applicant = data.applicant;
        navUserName.textContent = applicant.name || 'Candidate';
        modalCandidateName.value = applicant.name || 'Candidate';
        modalDateTitle.value = selectedDateTitle;
        handleStatusChange(applicant.status);
      } else {
        navUserName.textContent = 'Guest';
        modalCandidateName.value = 'Guest';
        modalDateTitle.value = selectedDateTitle;
      }
    } catch (err) {
      console.warn('Session load error:', err.message);
    }
  }

  // Handle applicant status routing and banner
  function handleStatusChange(status, isLivePoll = false) {
    if (status === 'accepted') {
      if (pollInterval) clearInterval(pollInterval);
      if (isLivePoll) {
        // Only redirect automatically if decision happened during active live polling
        window.location.href = '/accepted.html';
        return;
      }
      // If user navigated or returned to pitch deck from accepted.html, allow them to stay on portfolio!
      isPending = false;
      pendingBanner.style.display = 'none';
      btnOpenModal.textContent = 'Connection Unlocked \u2192';
      btnOpenModal.disabled = false;
      btnOpenModal.onclick = () => {
        window.location.href = '/accepted.html';
      };
      return;
    }

    if (status === 'rejected') {
      if (pollInterval) clearInterval(pollInterval);
      if (isLivePoll) {
        window.location.href = '/rejected.html';
        return;
      }
      isPending = false;
      pendingBanner.style.display = 'none';
      btnOpenModal.textContent = 'Application Concluded';
      btnOpenModal.disabled = true;
      btnOpenModal.onclick = null;
      return;
    }

    if (status === 'pending') {
      isPending = true;
      pendingBanner.style.display = 'flex';
      btnOpenModal.textContent = 'Application Pending...';
      btnOpenModal.disabled = true;
      btnOpenModal.onclick = null;
      startStatusPolling();
    } else {
      isPending = false;
      pendingBanner.style.display = 'none';
      btnOpenModal.textContent = 'Submit Proposal \u2192';
      btnOpenModal.disabled = false;
      btnOpenModal.onclick = null;
    }
  }

  // 2. Real-time status polling (detects Telegram bot decision)
  function startStatusPolling() {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      if (!applicant || !applicant.id) return;
      try {
        const res = await fetch(`/api/status?applicant_id=${encodeURIComponent(applicant.id)}`);
        const data = await res.json();
        if (data.status && data.status !== 'pending' && data.status !== 'viewing') {
          handleStatusChange(data.status, true);
        }
      } catch (e) {
        // quiet ignore
      }
    }, 1500);
  }

  // 3. First Date Selection
  dateOptions.forEach((option) => {
    option.addEventListener('click', () => {
      dateOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');

      selectedDateId = option.dataset.dateId;
      selectedDateTitle = option.dataset.dateTitle;

      selectedDateLabel.textContent = `Selected: ${selectedDateTitle.split('&')[0].trim()}`;
      modalDateTitle.value = selectedDateTitle;
    });
  });

  // 4. Modal Open & Close
  btnOpenModal.addEventListener('click', () => {
    if (applicant && applicant.status === 'accepted') {
      window.location.href = '/accepted.html';
      return;
    }
    if (isPending) return;
    if (!applicant || !applicant.id) {
      window.location.href = '/index.html';
      return;
    }
    proposalModal.classList.add('open');
  });

  btnCloseModal.addEventListener('click', () => {
    proposalModal.classList.remove('open');
  });

  proposalModal.addEventListener('click', (e) => {
    if (e.target === proposalModal) {
      proposalModal.classList.remove('open');
    }
  });

  // 5. Proposal Submission
  proposalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalAlert.style.display = 'none';

    if (!applicant || !applicant.id) {
      modalAlert.textContent = 'Session lost. Please refresh the page.';
      modalAlert.style.display = 'block';
      return;
    }

    btnSubmitProposal.disabled = true;
    btnSubmitProposal.textContent = 'Transmitting...';

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantId: applicant.id,
          firstDateIdea: selectedDateTitle,
          pitch: pitchNote.value.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit proposal.');
      }

      // Update state
      localStorage.setItem('applicant_status', 'pending');
      proposalModal.classList.remove('open');
      handleStatusChange('pending');
    } catch (err) {
      modalAlert.textContent = err.message || 'Error submitting proposal.';
      modalAlert.style.display = 'block';
      btnSubmitProposal.disabled = false;
      btnSubmitProposal.textContent = 'Send Proposal to Pruthviraj \u2192';
    }
  });

  // 6. Manual Status Refresh
  btnRefreshStatus.addEventListener('click', async () => {
    if (!applicant || !applicant.id) return;
    btnRefreshStatus.textContent = 'Checking...';
    try {
      const res = await fetch(`/api/status?applicant_id=${encodeURIComponent(applicant.id)}`);
      const data = await res.json();
      handleStatusChange(data.status);
    } catch (e) {
      // quiet
    } finally {
      btnRefreshStatus.textContent = 'Refresh';
    }
  });

  // 7. Logout
  btnLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } catch (e) {}
    localStorage.removeItem('applicant_id');
    localStorage.removeItem('applicant_status');
    window.location.href = '/index.html';
  });

  loadSession();
});

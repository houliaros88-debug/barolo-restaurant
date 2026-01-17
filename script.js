const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      document.body.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealItems = document.querySelectorAll('[data-reveal]');
if (revealItems.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

const gallery = document.querySelector('.gallery-grid');
const galleryButtons = document.querySelectorAll('.gallery-arrow');
if (gallery && galleryButtons.length) {
  const getScrollAmount = () => Math.max(gallery.clientWidth * 0.6, 240);
  galleryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const direction = button.dataset.dir === 'next' ? 1 : -1;
      gallery.scrollBy({
        left: direction * getScrollAmount(),
        behavior: 'smooth',
      });
    });
  });
}

const reservationForm = document.querySelector('#reservation-form');
if (reservationForm) {
  const status = reservationForm.querySelector('.form-status');
  const submitButton = reservationForm.querySelector('button[type="submit"]');

  const setStatus = (message, state) => {
    if (!status) {
      return;
    }
    status.textContent = message;
    if (state) {
      status.dataset.state = state;
    } else {
      delete status.dataset.state;
    }
  };

  reservationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(reservationForm);
    if (formData.get('website')) {
      setStatus('Thank you. We will be in touch shortly.', 'success');
      reservationForm.reset();
      return;
    }

    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      date: String(formData.get('date') || '').trim(),
      time: String(formData.get('time') || '').trim(),
      guests: Number(formData.get('guests') || 0),
      notes: String(formData.get('notes') || '').trim() || null,
    };

    const timeMatch = payload.time.match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      setStatus('Please choose a valid time.', 'error');
      return;
    }

    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const totalMinutes = hours * 60 + minutes;
    const isAllowedTime = totalMinutes >= 17 * 60 && totalMinutes <= 23 * 60;

    if (!isAllowedTime) {
      setStatus('Reservations are available between 17:00 and 23:00.', 'error');
      return;
    }

    if (payload.date) {
      const [year, month, day] = payload.date.split('-').map(Number);
      if (year && month && day) {
        const serviceDate = new Date(year, month - 1, day);
        if (serviceDate.getDay() === 2) {
          setStatus('We are closed on Tuesdays. Please choose another day.', 'error');
          return;
        }
      }
    }

    setStatus('Sending your request...', 'loading');
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let result = {};
      try {
        result = await response.json();
      } catch (error) {
        result = {};
      }

      if (!response.ok) {
        throw new Error(result.error || 'Booking failed. Please try again.');
      }

      setStatus(result.message || 'Request received. We will confirm by email.', 'success');
      reservationForm.reset();
    } catch (error) {
      setStatus(error.message || 'Booking failed. Please try again later.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

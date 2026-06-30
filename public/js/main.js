/* ===================================
   EuroPolitika — Main JavaScript
   =================================== */

(function () {
  'use strict';

  /* --- Subscribe Form AJAX --- */
  var subscribeForm = document.getElementById('subscribeForm');
  if (subscribeForm) {
    subscribeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var emailInput = this.querySelector('input[name="email"]');
      var email = emailInput.value.trim();
      var submitBtn = this.querySelector('button[type="submit"]');

      if (!email) return;

      var originalText = submitBtn.textContent;
      submitBtn.textContent = 'GÖNDERİLİYOR...';
      submitBtn.disabled = true;

      try {
        var res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email }),
        });

        var data = await res.json();

        if (res.ok) {
          showToast('Başarıyla abone oldunuz! 🎉', 'success');
          emailInput.value = '';
        } else {
          showToast(data.error || 'Bir hata oluştu.', 'error');
        }
      } catch (err) {
        showToast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  /* --- Toast Notification System --- */
  function showToast(message, type) {
    type = type || 'success';
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      toast.addEventListener('animationend', function () {
        toast.remove();
      });
    }, 3500);
  }

  // Expose globally for other scripts
  window.showToast = showToast;

  /* --- Fade-in on Scroll (IntersectionObserver) --- */
  function initFadeIn() {
    var cards = document.querySelectorAll('.article-card');
    if (!cards.length) return;

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('fade-in-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.1,
          rootMargin: '0px 0px -40px 0px',
        }
      );

      cards.forEach(function (card) {
        observer.observe(card);
      });
    } else {
      // Fallback: show all immediately
      cards.forEach(function (card) {
        card.classList.add('fade-in-visible');
      });
    }
  }

  /* --- Back to Top Button --- */
  function initBackToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;

    function toggleVisibility() {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    toggleVisibility();

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* --- Share Button Handlers --- */
  function initShareButtons() {
    document.querySelectorAll('.share-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var platform = this.dataset.platform;
        var url = encodeURIComponent(window.location.href);
        var title = encodeURIComponent(document.title);
        var shareUrl = '';

        switch (platform) {
          case 'twitter':
            shareUrl =
              'https://twitter.com/intent/tweet?url=' + url + '&text=' + title;
            break;
          case 'linkedin':
            shareUrl =
              'https://www.linkedin.com/sharing/share-offsite/?url=' + url;
            break;
          case 'whatsapp':
            shareUrl = 'https://wa.me/?text=' + title + '%20' + url;
            break;
        }

        if (shareUrl) {
          window.open(shareUrl, '_blank', 'width=600,height=400,scrollbars=yes');
        }
      });
    });
  }

  /* --- Init on DOM Ready --- */
  document.addEventListener('DOMContentLoaded', function () {
    initFadeIn();
    initBackToTop();
    initShareButtons();
  });
})();

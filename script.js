document.addEventListener('DOMContentLoaded', () => {
  const videos = [...document.querySelectorAll('.video-face video')];
  const forcePlay = (video) => { const promise = video.play(); if (promise?.catch) promise.catch(() => {}); };

  videos.forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.load();
    ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'pause', 'ended', 'stalled', 'suspend']
      .forEach((eventName) => video.addEventListener(eventName, () => forcePlay(video)));
  });

  const videoStage = document.querySelector('.video-stage');
  if (videoStage) {
    const startAllVideos = () => videos.forEach(forcePlay);
    const videoObserver = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) startAllVideos(); },
      { threshold: 0.1 }
    );
    videoObserver.observe(videoStage);
    startAllVideos();
    setInterval(() => videos.forEach((video) => { if (video.paused) forcePlay(video); }), 1500);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') startAllVideos();
    });
  }

  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const pad = (value) => String(value).padStart(2, '0');
  const updateTimers = () => {
    const now = new Date();
    const elapsed = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();
    const totalSeconds = Math.ceil((DAY_IN_MS - elapsed) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    document.querySelectorAll('[data-timer-hours]').forEach((el) => { el.childNodes[0].nodeValue = pad(hours); });
    document.querySelectorAll('[data-timer-minutes]').forEach((el) => { el.childNodes[0].nodeValue = pad(minutes); });
    document.querySelectorAll('[data-timer-seconds]').forEach((el) => { el.childNodes[0].nodeValue = pad(seconds); });
  };
  updateTimers();
  setInterval(updateTimers, 250);

  const reviewCarousel = document.querySelector('[data-review-carousel]');
  if (reviewCarousel) {
    const track = reviewCarousel.querySelector('.review-track');
    const slides = [...reviewCarousel.querySelectorAll('.review-slide')];
    const dotsContainer = reviewCarousel.querySelector('.review-dots');
    const previousButton = reviewCarousel.querySelector('.review-prev');
    const nextButton = reviewCarousel.querySelector('.review-next');
    let currentSlide = 0;
    let touchStartX = 0;

    const dots = slides.map((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'review-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Показати відгук ${index + 1}`);
      dot.addEventListener('click', () => showSlide(index));
      dotsContainer.appendChild(dot);
      return dot;
    });

    const showSlide = (index) => {
      currentSlide = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
      dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === currentSlide));
    };

    previousButton.addEventListener('click', () => showSlide(currentSlide - 1));
    nextButton.addEventListener('click', () => showSlide(currentSlide + 1));
    reviewCarousel.addEventListener('touchstart', (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
    reviewCarousel.addEventListener('touchend', (event) => {
      const distance = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(distance) > 45) showSlide(currentSlide + (distance < 0 ? 1 : -1));
    }, { passive: true });
    showSlide(0);
  }

  const stickyBuyButton = document.querySelector('.sticky-buy');
  const buySections = [...document.querySelectorAll('[data-buy-section]')];
  if (stickyBuyButton && buySections.length) {
    const visibleBuySections = new Set();
    const updateStickyButton = () => {
      stickyBuyButton.classList.toggle('is-hidden', visibleBuySections.size > 0);
    };
    const buySectionObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) visibleBuySections.add(entry.target);
        else visibleBuySections.delete(entry.target);
        updateStickyButton();
      }),
      { threshold: 0.08 }
    );
    const initiallyVisible = buySections.some((section) => {
      const bounds = section.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < window.innerHeight;
    });
    stickyBuyButton.classList.toggle('is-hidden', initiallyVisible);
    buySections.forEach((section) => buySectionObserver.observe(section));
  }

  const reveal = document.querySelectorAll('[data-reveal]');
  const revealObserver = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    }),
    { threshold: 0.12 }
  );
  reveal.forEach((el) => revealObserver.observe(el));
});

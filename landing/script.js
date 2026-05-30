// AI Writer Pro - Landing Page
document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll for nav links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Animate stats on scroll
  const statsSection = document.querySelector('.stats');
  if (statsSection) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('.stat-card').forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = `all 0.5s ease ${i * 0.1}s`;
            setTimeout(() => {
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, 100);
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    observer.observe(statsSection);
  }

  // Feature cards hover effect
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-4px)';
    });
    card.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
    });
  });

  // Lemon Squeezy checkout — direct links
  const CHECKOUT_LINKS = {
    pro: 'https://xiaoqi.lemonsqueezy.com/checkout/buy/a9844e25-dc1f-483f-8207-0dec1e5afde2',
    business: 'https://xiaoqi.lemonsqueezy.com/checkout/buy/0ed4e5bd-ce8a-4823-8715-0fa798825c6c'
  };

  document.querySelectorAll('.checkout-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const plan = btn.dataset.plan;
      if (CHECKOUT_LINKS[plan]) {
        window.open(CHECKOUT_LINKS[plan], '_blank');
      }
    });
  });

  console.log('AI Writer Pro - Landing page ready');
});

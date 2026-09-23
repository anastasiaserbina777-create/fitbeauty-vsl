document.addEventListener('DOMContentLoaded', () => {
  const contentElements = [...document.body.children].filter((element) => !['SCRIPT', 'HEADER', 'FOOTER'].includes(element.tagName));
  const paragraphs = contentElements.filter((element) => element.tagName === 'P');

  paragraphs.forEach((paragraph, index) => {
    const text = paragraph.textContent.trim();
    const isMainTitle = index === 0 && text === text.toUpperCase();
    const isSectionTitle = /^\d+\.\s+[А-ЯІЇЄҐ0-9\s’'"–—-]+$/.test(text) || text === 'РЕКВІЗИТИ ВИКОНАВЦЯ';
    if (!isMainTitle && !isSectionTitle) return;

    const heading = document.createElement(isMainTitle ? 'h1' : 'h2');
    heading.innerHTML = paragraph.innerHTML;
    paragraph.replaceWith(heading);
  });

  const top = document.createElement('header');
  top.className = 'legal-top';
  top.innerHTML = '<a href="index.html">← Повернутися на Fit Beauty</a>';
  document.body.prepend(top);

  const footer = document.createElement('footer');
  footer.className = 'legal-bottom';
  footer.innerHTML = '<a href="privacy.html">Політика конфіденційності</a><a href="offer.html">Публічна оферта</a>';
  document.body.append(footer);
});

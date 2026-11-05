// The quick quiz on the lesson pages: tap an answer to see if it's right. Answers are remembered on this device.
document.querySelectorAll('.quiz').forEach((box) => {
  const key = 'sd-quiz-' + box.dataset.n;
  const answer = box.dataset.answer;
  const show = (k, save) => {
    box.querySelectorAll('button').forEach((b) => {
      b.disabled = true;
      if (b.dataset.k === answer) { b.classList.add('right'); b.textContent += ' ✓'; }
      else if (b.dataset.k === k) b.classList.add('wrong');
      else b.classList.add('faded');
    });
    const v = box.querySelector('.verdict');
    v.hidden = false;
    v.textContent = (k === answer ? 'Right. ' : 'Not quite. ') + (box.dataset.explain || '');
    if (save) try { localStorage.setItem(key, k); } catch {}
  };
  let prev = null;
  try { prev = localStorage.getItem(key); } catch {}
  if (prev) show(prev, false);
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => show(b.dataset.k, true)));
});

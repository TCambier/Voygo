export function initTravelerStepper() {
  const input = document.querySelector('#voyageurs');
  const minusBtn = document.querySelector('#voyageurs-minus');
  const plusBtn = document.querySelector('#voyageurs-plus');
  if (!input || !minusBtn || !plusBtn) return;

  const MIN_TRAVELERS = 1;
  const MAX_TRAVELERS = 10;

  function clampValue(value) {
    if (Number.isNaN(value)) return MIN_TRAVELERS;
    return Math.min(MAX_TRAVELERS, Math.max(MIN_TRAVELERS, value));
  }

  function sync(value) {
    const safeValue = clampValue(value);
    input.value = String(safeValue);
    minusBtn.disabled = safeValue <= MIN_TRAVELERS;
    plusBtn.disabled = safeValue >= MAX_TRAVELERS;
  }

  minusBtn.addEventListener('click', () => {
    sync(parseInt(input.value, 10) - 1);
  });

  plusBtn.addEventListener('click', () => {
    sync(parseInt(input.value, 10) + 1);
  });

  sync(parseInt(input.value, 10));
}

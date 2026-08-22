// ---------- slepen om te verwisselen ----------
const dragState = { from: null, over: null, moved: false, pointerId: null };
const DRAG_THRESHOLD = 5; // pixels voordat het een sleep wordt in plaats van een klik

function slotFromPoint(x, y){
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const hit = el.closest ? el.closest('.slot-hit') : null;
  if (!hit || hit.dataset.slot === undefined) return null;
  return parseInt(hit.dataset.slot, 10);
}

function onCellPointerDown(e){
  if (e.button !== undefined && e.button !== 0) return;
  const slotIdx = parseInt(e.currentTarget.dataset.slot, 10);
  dragState.from = slotIdx;
  dragState.over = slotIdx;
  dragState.moved = false;
  dragState.pointerId = e.pointerId;
  dragState.startX = e.clientX;
  dragState.startY = e.clientY;
  boardEl.classList.add('dragging');
  renderBoard();
}

function onPointerMove(e){
  if (dragState.from === null || e.pointerId !== dragState.pointerId) return;
  if (!dragState.moved){
    const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragState.moved = true;
  }
  e.preventDefault();
  const over = slotFromPoint(e.clientX, e.clientY);
  if (over !== dragState.over){
    dragState.over = over;
    renderBoard();
  }
}

function onPointerUp(e){
  if (dragState.from === null || e.pointerId !== dragState.pointerId) return;
  const from = dragState.from;
  const over = dragState.moved ? slotFromPoint(e.clientX, e.clientY) : null;
  const wasDrag = dragState.moved;
  dragState.from = null; dragState.over = null; dragState.moved = false; dragState.pointerId = null;
  boardEl.classList.remove('dragging');

  if (wasDrag){
    if (over !== null && over !== from){
      if (trySwap(from, over)) selectedSlot = over;
      else selectedSlot = from;
    } else {
      selectedSlot = from;
    }
  } else {
    // gewone klik: alleen selecteren / deselecteren
    selectedSlot = (selectedSlot === from) ? null : from;
  }
  renderBoard();
}

document.addEventListener('pointermove', onPointerMove, { passive:false });
document.addEventListener('pointerup', onPointerUp);
document.addEventListener('pointercancel', ()=>{
  if (dragState.from === null) return;
  dragState.from = null; dragState.over = null; dragState.moved = false; dragState.pointerId = null;
  boardEl.classList.remove('dragging');
  renderBoard();
});



export const exportingState = $state({
  active: false,
});

export function startExporting() {
  exportingState.active = true;
}

export function stopExporting() {
  exportingState.active = false;
}

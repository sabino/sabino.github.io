import './install';
const mode = new URLSearchParams(location.search);
if (mode.has('study')) {
  void import('./main');
} else if (mode.has('generative') || mode.has('lab')) {
  void import('./procedural/app');
} else {
  void import('./stichos/app');
}

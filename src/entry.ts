if (new URLSearchParams(location.search).has('study')) {
  void import('./main');
} else {
  void import('./procedural/app');
}

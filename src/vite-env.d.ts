/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEER_ICE_SERVERS?: string;
  readonly VITE_PEER_ICE_ENDPOINT?: string;
  readonly VITE_PEER_SIGNAL_URL?: string;
  readonly VITE_PEER_RELAY_ONLY?: string;
}

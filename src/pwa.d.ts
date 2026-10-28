declare module "virtual:pwa-register" {
  export function registerSW(options?: { onNeedRefresh?: () => void; onOfflineReady?: () => void }): (reload?: boolean) => Promise<void>;
}

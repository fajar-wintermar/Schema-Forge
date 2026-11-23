import React, { useState } from 'react';
import { MonitorDown, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isFirefox, isAndroid, install } =
    usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showFirefoxGuide, setShowFirefoxGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install SchemaForge as an offline desktop/mobile app"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors whitespace-nowrap shrink-0"
      >
        <MonitorDown className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden xl:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Install SchemaForge on iPhone / iPad"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="hidden xl:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Install SchemaForge on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside">
                <li>
                  Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Open SchemaForge from your Home Screen to work offline in
                  standalone mode.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isFirefox) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowFirefoxGuide(true)}
          title="How to install SchemaForge on Firefox"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <MonitorDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="hidden xl:inline">Install Guide</span>
        </button>

        {showFirefoxGuide && (
          <div
            onClick={() => setShowFirefoxGuide(false)}
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Install SchemaForge on Firefox
                </h3>
                <button
                  type="button"
                  onClick={() => setShowFirefoxGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {isAndroid ? (
                <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside">
                  <li>
                    Tap the <strong>⋮ Menu</strong> button in Firefox&apos;s toolbar.
                  </li>
                  <li>
                    Select <strong>Add app to Home screen</strong> (or <strong>Install</strong>).
                  </li>
                </ol>
              ) : (
                <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    Firefox Desktop does not support browser-triggered{' '}
                    <code className="font-mono">beforeinstallprompt</code> dialogs.
                  </p>
                  <ul className="space-y-1.5 list-disc list-inside">
                    <li>
                      <strong>Firefox on Windows (143+):</strong> Click the{' '}
                      <strong>Add tab to taskbar</strong> icon in the address bar.
                    </li>
                    <li>
                      <strong>macOS / Linux / All Desktops:</strong> Install the{' '}
                      <strong>PWAsForFirefox</strong> extension, or open this URL in{' '}
                      <strong>Chrome / Edge / Brave</strong> for 1-click desktop install.
                    </li>
                    <li>
                      Offline Service Worker + IndexedDB storage already run in your Firefox tab.
                    </li>
                  </ul>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowFirefoxGuide(false)}
                className="mt-4 w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

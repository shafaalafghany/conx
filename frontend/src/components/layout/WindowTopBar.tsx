import React, { useState, useEffect } from 'react';
import { ThemeToggle } from '../ThemeToggle';

interface WindowTopBarProps {
  sidebarCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const WindowTopBar: React.FC<WindowTopBarProps> = ({
  sidebarCollapsed,
  onToggleCollapse,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMacDesktop =
    typeof window !== 'undefined' &&
    Boolean((window as any).go) &&
    typeof navigator !== 'undefined' &&
    /Mac/i.test(navigator.userAgent);

  useEffect(() => {
    const checkFullscreen = async () => {
      if (typeof window !== 'undefined' && (window as any).runtime?.WindowIsFullscreen) {
        try {
          const fs = await (window as any).runtime.WindowIsFullscreen();
          setIsFullscreen(!!fs);
        } catch {}
      }
    };

    checkFullscreen();
    window.addEventListener('resize', checkFullscreen);
    return () => window.removeEventListener('resize', checkFullscreen);
  }, []);

  return (
    <div
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
      className="h-10 flex items-center justify-between px-3 select-none flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700/80 wails-drag"
    >
      <div className="flex items-center gap-1.5">
        {/* Dedicated reserved space for macOS window buttons (🔴 🟡 🟢) only on macOS desktop when not fullscreen */}
        {isMacDesktop && !isFullscreen && <div className="w-[72px] h-full flex-shrink-0" />}

        {/* Sidebar collapse/expand toggle button (Spotify style navigation position) */}
        <button
          onClick={onToggleCollapse}
          style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
          className="wails-no-drag p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarCollapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* Right controls: Theme toggle */}
      <div
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
        className="flex items-center gap-2 wails-no-drag"
      >
        <ThemeToggle />
      </div>
    </div>
  );
};

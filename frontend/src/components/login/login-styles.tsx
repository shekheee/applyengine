/** Page-scoped styles for login — does not modify globals.css */
export function LoginStyles() {
  return (
    <style>{`
      @keyframes login-rise {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes login-glow-pulse {
        0%,
        100% {
          opacity: 0.45;
        }
        50% {
          opacity: 0.75;
        }
      }

      @keyframes login-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .login-rise {
        animation: login-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .login-rise-1 { animation-delay: 0.04s; }
      .login-rise-2 { animation-delay: 0.1s; }
      .login-rise-3 { animation-delay: 0.16s; }
      .login-rise-4 { animation-delay: 0.22s; }
      .login-rise-5 { animation-delay: 0.28s; }

      .login-orb {
        animation: login-glow-pulse 8s ease-in-out infinite;
      }

      .login-orb-delay {
        animation-delay: -4s;
      }

      .login-spinner {
        animation: login-spin 0.7s linear infinite;
      }

      .login-grid-bg {
        background-image: radial-gradient(
          circle at 1px 1px,
          color-mix(in srgb, var(--border-strong) 55%, transparent) 1px,
          transparent 0
        );
        background-size: 24px 24px;
      }

      .login-form-shell {
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--panel) 96%, white) 0%,
          var(--panel) 100%
        );
        box-shadow:
          var(--shadow-lg),
          inset 0 1px 0 color-mix(in srgb, white 6%, transparent);
      }

      .login-mode-btn[data-active="true"] {
        background: color-mix(in srgb, var(--primary) 18%, var(--panel-2));
        color: var(--text);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent),
          0 2px 12px -4px var(--glow-soft);
      }

      @media (prefers-reduced-motion: reduce) {
        .login-rise,
        .login-rise-1,
        .login-rise-2,
        .login-rise-3,
        .login-rise-4,
        .login-rise-5,
        .login-orb,
        .login-orb-delay,
        .login-spinner {
          animation: none !important;
        }
      }
    `}</style>
  );
}

import React, { useEffect, useState } from 'react';

let resolver = null;
let setDialogState = null;

/**
 * Promise-based replacement for window.confirm(). Resolves to `true`/`false`
 * once the user picks an option; the modal is rendered by <ConfirmDialogHost/>
 * (mounted once at the app root).
 */
export function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    resolver = resolve;
    if (setDialogState) {
      setDialogState({
        open: true,
        message,
        title: options.title || 'Please confirm',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        danger: !!options.danger,
      });
    } else {
      // Host not mounted yet — fail safe rather than hang the caller forever.
      resolve(false);
    }
  });
}

const initialState = { open: false, message: '', title: '', confirmText: '', cancelText: '', danger: false };

export function ConfirmDialogHost() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    setDialogState = setState;
    return () => {
      setDialogState = null;
    };
  }, []);

  const close = (result) => {
    setState(initialState);
    if (resolver) {
      resolver(result);
      resolver = null;
    }
  };

  if (!state.open) return null;

  return (
    <div className="modal-overlay" onClick={() => close(false)}>
      <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{state.title}</h2>
        <p className="confirm-message">{state.message}</p>
        <div className="modal-actions">
          <button
            className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => close(true)}
            autoFocus
          >
            {state.confirmText}
          </button>
          <button className="btn btn-secondary" onClick={() => close(false)}>
            {state.cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}

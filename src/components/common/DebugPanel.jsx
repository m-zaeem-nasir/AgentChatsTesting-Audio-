import { useState } from 'react';
import { Box, Button, Typography } from '@mui/joy';

export function useDebugLogger() {
  // Very small logger that forwards to console with a prefix
  const log = (...args) => console.log('[DEBUG]', ...args);
  const warn = (...args) => console.warn('[DEBUG]', ...args);
  const error = (...args) => console.error('[DEBUG]', ...args);
  return { log, warn, error };
}

export default function DebugPanel({ refCallback }) {
  const [open, setOpen] = useState(false);

  // The refCallback will receive the logger if the parent passes it
  if (refCallback) {
    refCallback({ log: console.log, warn: console.warn, error: console.error });
  }

  return (
    <Box sx={{ position: 'fixed', bottom: 0, right: 0, p: 1 }}>
      <Button variant="soft" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide Debug' : 'Show Debug'}
      </Button>
      {open && (
        <Box sx={{ mt: 1, p: 1, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1">Debug Panel</Typography>
          <Typography variant="body2">Logs are printed to the console.</Typography>
        </Box>
      )}
    </Box>
  );
}

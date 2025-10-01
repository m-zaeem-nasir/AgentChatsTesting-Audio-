import { Snackbar } from "@mui/joy";
import { useEffect, useState } from "react";

export default function SnackbarNotifier({
  message,
  open,
  onClose,
  autoHideDuration = 3000,
}) {
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    setVisible(open);
  }, [open]);

  const handleClose = () => {
    setVisible(false);
    if (onClose) onClose();
  };

  return (
    <Snackbar
      open={visible}
      message={message}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
    />
  );
}

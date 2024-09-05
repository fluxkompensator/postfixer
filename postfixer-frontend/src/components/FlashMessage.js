import React, { useState, useEffect } from 'react';
import { Snackbar, makeStyles } from '@material-ui/core';
import MuiAlert from '@material-ui/lab/Alert';

const useStyles = makeStyles((theme) => ({
  root: {
    width: '100%',
    '& > * + *': {
      marginTop: theme.spacing(2),
    },
  },
}));

function Alert(props) {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
}

function FlashMessage({ message, onClose }) {
  const classes = useStyles();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
    const timer = setTimeout(() => {
      setOpen(false);
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [message, onClose]);

  const handleClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
    onClose();
  };

  return (
    <div className={classes.root}>
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        open={open}
        onClose={handleClose}
        key={message}
      >
        <Alert onClose={handleClose} severity="info">
          {message}
        </Alert>
      </Snackbar>
    </div>
  );
}

export default FlashMessage;

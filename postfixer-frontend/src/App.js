import React, { useState, useMemo } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@material-ui/core';
import { red } from '@material-ui/core/colors';
import Dashboard from './components/Dashboard';

function App() {
  const [darkMode, setDarkMode] = useState(true);  // Set initial state to true for dark mode

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          type: darkMode ? 'dark' : 'light',
          primary: {
            main: darkMode ? red[400] : '#3f51b5', // Use red[400] for dark mode, default blue for light mode
          },
        },
      }),
    [darkMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Dashboard darkMode={darkMode} setDarkMode={setDarkMode} />
    </ThemeProvider>
  );
}

export default App;

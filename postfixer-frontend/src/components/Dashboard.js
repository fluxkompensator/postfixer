import React, { useState, useEffect, forwardRef, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import axiosRetry from 'axios-retry';
import { Container, Typography, Tabs, Tab, Box, Switch, FormControlLabel, AppBar, Toolbar, Paper } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import Brightness4Icon from '@material-ui/icons/Brightness4';
import Brightness7Icon from '@material-ui/icons/Brightness7';
import RecentRequests from './RecentRequests';
import RulesList from './RulesList';
import RateLimiterList from './RateLimiterList';

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 10000, // 10 seconds
});

axiosRetry(api, {
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000; // time interval between retries
  },
  retryCondition: (error) => {
    // if retry condition is not specified, by default idempotent requests are retried
    return error.code === 'ECONNABORTED' || axios.isRetryableError(error);
  },
});

const socket = io('http://localhost:8000', {
  transports: ['websocket'],
  autoConnect: false
});

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
  },
  title: {
    flexGrow: 1,
  },
  content: {
    marginTop: theme.spacing(2),
    width: '100%',
  },
  tabsContainer: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: theme.palette.background.paper,
  },
  tabContent: {
    width: '100%',
    padding: theme.spacing(2),
  },
  logo: {
    height: '64px', // Adjust this value to match AppBar height
    width: 'auto',
    marginRight: theme.spacing(2),
  },
  appBar: {
    height: '64px', // Set a fixed height for the AppBar
  },
  toolbar: {
    height: '100%',
    minHeight: '64px',
    display: 'flex',
    alignItems: 'center',
  },
  connectionStatus: {
    marginLeft: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

const ForwardedSwitch = forwardRef((props, ref) => <Switch {...props} ref={ref} />);

function Dashboard({ darkMode, setDarkMode }) {
  const classes = useStyles();
  const [historicalData, setHistoricalData] = useState([]);
  const [recentData, setRecentData] = useState({});
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [serverReady, setServerReady] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const checkServerStatus = useCallback(async (retryCount = 0) => {
    try {
      const response = await api.get('/api/server_status');
      if (response.data.status === 'ready') {
        setServerReady(true);
        return true;
      }
    } catch (error) {
      console.error('Error checking server status:', error);
    }

    if (retryCount < MAX_RETRIES) {
      setTimeout(() => checkServerStatus(retryCount + 1), RETRY_DELAY);
    } else {
      console.error('Max retries reached. Server is not ready.');
    }
    return false;
  }, []);

  const fetchDataWithRetry = useCallback(async (fetchFunction, retryCount = 0) => {
    if (!serverReady) {
      await checkServerStatus();
    }

    try {
      return await fetchFunction();
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchDataWithRetry(fetchFunction, retryCount + 1);
      }
      throw error;
    }
  }, [serverReady, checkServerStatus]);

  const fetchData = useCallback(() => {
    return fetchDataWithRetry(async () => {
      const response = await api.get('/api/data');
      console.log('Fetched data:', response.data);
      
      const processedHistoricalData = response.data.historical_data.map(item => ({
        ...item,
        timestamp: item.timestamp || new Date().toISOString()
      }));
      
      setHistoricalData(processedHistoricalData);
      setRecentData(response.data.recent_data);
    });
  }, [fetchDataWithRetry]);

  const fetchRules = useCallback(() => {
    return fetchDataWithRetry(async () => {
      const response = await api.get('/api/rules');
      setRules(response.data);
    });
  }, [fetchDataWithRetry]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchData(), fetchRules()]);
    } catch (error) {
      setError('Failed to fetch data. Please try again.');
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchData, fetchRules]);

  const initializeSocket = useCallback(() => {
    if (!socket.connected) {
      console.log('Initializing socket connection...');
      socket.connect();
    }
  }, []);

  const setupSocketListeners = useCallback(() => {
    function onConnect() {
      console.log('Connected to server');
      setSocketConnected(true);
      socket.emit('join', { room: 'updates' });
      console.log('Joined updates room');
      fetchAllData();
    }

    function onDisconnect(reason) {
      console.log('Disconnected from server:', reason);
      setSocketConnected(false);
      setServerReady(false);
    }

    function onNewData(newData) {
      console.log('New data received:', newData);
      setHistoricalData(prevData => [newData.data, ...prevData]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new_data', onNewData);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new_data', onNewData);
    };
  }, [fetchAllData]);

  useEffect(() => {
    checkServerStatus();
    initializeSocket();
    const cleanup = setupSocketListeners();

    return () => {
      cleanup();
      if (socket.connected) {
        socket.emit('leave', { room: 'updates' });
        console.log('Left updates room');
        socket.disconnect();
      }
    };
  }, [checkServerStatus, initializeSocket, setupSocketListeners]);

  useEffect(() => {
    if (socketConnected) {
      fetchAllData();
    }
  }, [socketConnected, fetchAllData]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleDarkModeToggle = () => {
    setDarkMode(!darkMode);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className={classes.root}>
      <AppBar position="static" color="default" className={classes.appBar}>
        <Toolbar className={classes.toolbar}>
          <img src={`${process.env.PUBLIC_URL}/logo.webp`} alt="Postfixer Logo" className={classes.logo} />
          <Typography variant="h4" className={classes.title}>
            Postfixer Dashboard
          </Typography>
          <FormControlLabel
            control={
              <ForwardedSwitch
                checked={darkMode}
                onChange={handleDarkModeToggle}
                icon={<Brightness7Icon />}
                checkedIcon={<Brightness4Icon />}
              />
            }
            label={darkMode ? "Dark Mode" : "Light Mode"}
          />
          <Typography className={classes.connectionStatus}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Toolbar>
      </AppBar>
      <div className={classes.content}>
        <Paper className={classes.tabsContainer}>
          <Tabs value={activeTab} onChange={handleTabChange} indicatorColor="primary" textColor="primary">
            <Tab label="Recent Requests" />
            <Tab label="Rules" />
            <Tab label="Rate Limiters" />
          </Tabs>
        </Paper>
        <Box className={classes.tabContent}>
          {activeTab === 0 ? (
            <RecentRequests data={historicalData} />
          ) : activeTab === 1 ? (
            <RulesList rules={rules} onRulesChange={fetchRules} />
          ) : (
            <RateLimiterList />
          )}
        </Box>
      </div>
    </div>
  );
}

export default Dashboard;

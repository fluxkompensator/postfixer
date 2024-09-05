import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Table, TableBody, TableCell, Divider, TableContainer, TableHead, makeStyles, TableRow, Grid, Paper, Button, TextField, Select, MenuItem, FormControl, InputLabel, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Typography, Box, TablePagination } from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 10000,
});

axiosRetry(api, {
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000;
  },
  retryCondition: (error) => {
    return error.code === 'ECONNABORTED' || axios.isRetryableError(error);
  },
});

const useStyles = makeStyles((theme) => ({
  table: {
    '& .MuiTableCell-root': {
      padding: '6px 16px',
    },
  },
  smallText: {
    fontSize: '0.875rem',
  },
}));

function RateLimiterList() {
  const classes = useStyles();
  const [rateLimiters, setRateLimiters] = useState([]);
  const [newLimiter, setNewLimiter] = useState({ key: '', value: '', condition: 'exact', limit: '', duration: '', customText: '' });
  const [keyOptions, setKeyOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingLimiter, setEditingLimiter] = useState(null);
  const [topRateLimitCounters, setTopRateLimitCounters] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [connectionError, setConnectionError] = useState(null);

  const fetchKeyOptions = useCallback(async () => {
    try {
      const response = await api.get('/api/key_options');
      setKeyOptions(response.data);
      setConnectionError(null);
    } catch (error) {
      console.error('Error fetching key options:', error);
      setConnectionError('Unable to connect to the server. Please try again later.');
    }
  }, []);

  useEffect(() => {
    fetchKeyOptions();
    fetchRateLimiters();
    fetchTopRateLimitCounters();
    const interval = setInterval(fetchTopRateLimitCounters, 5000);
    return () => clearInterval(interval);
  }, [fetchKeyOptions]);

  const fetchRateLimiters = async () => {
    try {
      const response = await api.get('/api/rate_limiters');
      setRateLimiters(response.data);
    } catch (error) {
      console.error('Error fetching rate limiters:', error);
    }
  };

  const fetchTopRateLimitCounters = async () => {
    try {
      const limit = rowsPerPage * 5;
      const response = await api.get(`/api/top_rate_limit_counters?limit=${limit}`);
      setTopRateLimitCounters(response.data);
    } catch (error) {
      console.error('Error fetching top rate limit counters:', error);
    }
  };

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    setNewLimiter({ key: '', value: '', condition: 'exact', limit: '', duration: '', customText: '' });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewLimiter({ ...newLimiter, [name]: value });
  };

  const handleCreateLimiter = async () => {
    try {
      await api.post('/api/rate_limiters', newLimiter);
      fetchRateLimiters();
      handleClose();
    } catch (error) {
      console.error('Error creating rate limiter:', error);
    }
  };

  const handleEditOpen = (limiter) => {
    setEditingLimiter(limiter);
    setEditOpen(true);
  };

  const handleEditClose = () => {
    setEditingLimiter(null);
    setEditOpen(false);
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    setEditingLimiter({ ...editingLimiter, [name]: value });
  };

  const handleUpdateLimiter = async () => {
    try {
      await api.put(`/api/rate_limiters/${editingLimiter._id}`, editingLimiter);
      fetchRateLimiters();
      handleEditClose();
    } catch (error) {
      console.error('Error updating rate limiter:', error);
    }
  };

  const handleDeleteLimiter = async (id) => {
    try {
      await api.delete(`/api/rate_limiters/${id}`);
      fetchRateLimiters();
    } catch (error) {
      console.error('Error deleting rate limiter:', error);
    }
  };

  const getValuePlaceholder = (condition) => {
    switch (condition) {
      case 'exact':
        return 'e.g., example@domain.com';
      case 'regex':
        return 'e.g., ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
      case 'wildcard':
        return 'e.g., *@example.com';
      default:
        return '';
    }
  };

  const isCountExceedingLimit = (count, limit) => {
    return parseInt(count, 10) >= parseInt(limit, 10);
  };

  const getColorStyle = (count, limit) => {
    return isCountExceedingLimit(count, limit) ? { color: '#ef5350' } : {};
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
  };

  if (connectionError) {
    return <Typography color="error">{connectionError}</Typography>;
  }

  return (
    <Paper>
      <Box p={2}>
        <Grid container spacing={2} alignItems="center" justifyContent="center">
        <Grid item>
          <Typography variant="h6">Rate Limiters</Typography>
        </Grid>
        <Grid item>
        <Button variant="outlined" color="primary" onClick={handleOpen}>
          Add Rate Limiter
        </Button>
        </Grid>
        </Grid>
      </Box>
      <TableContainer>
        <Table stickyHeader className={classes.table} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Condition</TableCell>
              <TableCell>Limit</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Custom Text</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rateLimiters.map((limiter) => (
              <TableRow key={limiter._id}>
                <TableCell>{limiter.key}</TableCell>
                <TableCell>{limiter.value}</TableCell>
                <TableCell>{limiter.condition}</TableCell>
                <TableCell>{limiter.limit}</TableCell>
                <TableCell>{limiter.duration} minutes</TableCell>
                <TableCell>{limiter.customText || 'Default'}</TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleEditOpen(limiter)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDeleteLimiter(limiter._id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Separator */}
      <Box my={4} height={4} bgcolor="rgba(0, 0, 0, 0.12)">
        <Divider />
      </Box>

      {/* Top Rate Limit Counters Table */}
      <Box p={2} mt={4}>
        <Typography variant="h6">Top Rate Limit Counters</Typography>
      </Box>
      <TableContainer>
        <Table stickyHeader className={classes.table} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Limiter Key</TableCell>
              <TableCell>Limiter Value</TableCell>
              <TableCell>Condition</TableCell>
              <TableCell>Limit</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Counter Key</TableCell>
              <TableCell>Counter Value</TableCell>
              <TableCell>Count</TableCell>
              <TableCell>Timestamp</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {topRateLimitCounters.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((counter) => (
              <TableRow key={counter._id}>
                <TableCell>{counter.limiter_key}</TableCell>
                <TableCell>{counter.limiter_value}</TableCell>
                <TableCell>{counter.limiter_condition}</TableCell>
                <TableCell>
                  <span style={getColorStyle(counter.count, counter.limiter_limit)}>
                    {counter.limiter_limit}
                  </span>
                </TableCell>
                <TableCell>{counter.limiter_duration} minutes</TableCell>
                <TableCell>{counter.key}</TableCell>
                <TableCell>{counter.value}</TableCell>
                <TableCell>
                  <span style={getColorStyle(counter.count, counter.limiter_limit)}>
                    {counter.count}
                  </span>
                </TableCell>
                <TableCell>{new Date(counter.timestamp).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 20, 30, 40, 50]}
        component="div"
        count={topRateLimitCounters.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      {/* Add Rate Limiter Dialog */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Add New Rate Limiter</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel>Key</InputLabel>
            <Select
              name="key"
              value={newLimiter.key}
              onChange={handleInputChange}
            >
              {keyOptions.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Condition</InputLabel>
            <Select
              name="condition"
              value={newLimiter.condition}
              onChange={handleInputChange}
            >
              <MenuItem value="exact">Exact</MenuItem>
              <MenuItem value="regex">Regex</MenuItem>
              <MenuItem value="wildcard">Wildcard</MenuItem>
            </Select>
          </FormControl>
          <TextField
            name="value"
            label="Value"
            fullWidth
            value={newLimiter.value}
            onChange={handleInputChange}
            margin="normal"
            placeholder={getValuePlaceholder(newLimiter.condition)}
          />
          <TextField
            name="limit"
            label="Limit"
            type="number"
            fullWidth
            value={newLimiter.limit}
            onChange={handleInputChange}
            margin="normal"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Duration</InputLabel>
            <Select
              name="duration"
              value={newLimiter.duration}
              onChange={handleInputChange}
            >
              <MenuItem value={5}>5 minutes</MenuItem>
              <MenuItem value={20}>20 minutes</MenuItem>
              <MenuItem value={60}>1 hour</MenuItem>
              <MenuItem value={720}>12 hours</MenuItem>
              <MenuItem value={1440}>24 hours</MenuItem>
              <MenuItem value={10080}>1 Week</MenuItem>
            </Select>
          </FormControl>
          <TextField
            name="customText"
            label="Custom Text (Optional)"
            fullWidth
            value={newLimiter.customText}
            onChange={handleInputChange}
            margin="normal"
            placeholder="Custom message for rate limit exceeded"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleCreateLimiter} color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Rate Limiter Dialog */}
      <Dialog open={editOpen} onClose={handleEditClose}>
        <DialogTitle>Edit Rate Limiter</DialogTitle>
        <DialogContent>
          {editingLimiter && (
            <>
              <FormControl fullWidth margin="normal">
                <InputLabel>Key</InputLabel>
                <Select
                  name="key"
                  value={editingLimiter.key}
                  onChange={handleEditInputChange}
                >
                  {keyOptions.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth margin="normal">
                <InputLabel>Condition</InputLabel>
                <Select
                  name="condition"
                  value={editingLimiter.condition}
                  onChange={handleEditInputChange}
                >
                  <MenuItem value="exact">Exact</MenuItem>
                  <MenuItem value="regex">Regex</MenuItem>
                  <MenuItem value="wildcard">Wildcard</MenuItem>
                </Select>
              </FormControl>
              <TextField
                name="value"
                label="Value"
                fullWidth
                value={editingLimiter.value}
                onChange={handleEditInputChange}
                margin="normal"
                placeholder={getValuePlaceholder(editingLimiter.condition)}
              />
              <TextField
                name="limit"
                label="Limit"
                type="number"
                fullWidth
                value={editingLimiter.limit}
                onChange={handleEditInputChange}
                margin="normal"
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Duration</InputLabel>
                <Select
                  name="duration"
                  value={editingLimiter.duration}
                  onChange={handleEditInputChange}
                >
                  <MenuItem value={5}>5 minutes</MenuItem>
                  <MenuItem value={20}>20 minutes</MenuItem>
                  <MenuItem value={60}>1 hour</MenuItem>
                </Select>
              </FormControl>
              <TextField
                name="customText"
                label="Custom Text (Optional)"
                fullWidth
                value={editingLimiter.customText || ''}
                onChange={handleEditInputChange}
                margin="normal"
                placeholder="Custom message for rate limit exceeded"
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancel</Button>
          <Button onClick={handleUpdateLimiter} color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default RateLimiterList;
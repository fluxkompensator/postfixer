import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Table, Typography, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, List, ListItem, ListItemText, Grid, TablePagination, Button, 
  Box, makeStyles, Tooltip 
} from '@material-ui/core';
import InfoIcon from '@material-ui/icons/Info';

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

const TablePaginationComponent = (props) => (
  <TablePagination component="div" {...props} />
);

function RecentRequests({ data }) {
  const classes = useStyles();
  const [activeColumns, setActiveColumns] = useState([
    'queue_id', 'sasl_username', 'sender', 'recipient', 'size', 'final_action', 'timestamp'
  ]);

  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ruleInfo, setRuleInfo] = useState({});

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [showColumnSelection, setShowColumnSelection] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    axios.get('http://localhost:8000/api/key_options')
      .then(response => {
        const newColumns = response.data.map(key => ({
          id: key,
          label: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        }));
        const additionalColumns = [
          { id: '_id', label: 'ID' },
          { id: 'final_action', label: 'Final Action' },
          { id: 'timestamp', label: 'Timestamp' }
        ];
        setColumns([...newColumns, ...additionalColumns]);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error fetching key options:', error);
        setIsLoading(false);
      });

    axios.get('http://localhost:8000/api/rules')
      .then(response => {
        const ruleMap = {};
        response.data.forEach(rule => {
          ruleMap[rule.rule_id] = rule.name;
        });
        setRuleInfo(ruleMap);
      })
      .catch(error => {
        console.error('Error fetching rules:', error);
      });
  }, []);

  const toggleColumn = (columnId) => {
    setActiveColumns(prev => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      } else {
        const finalActionIndex = prev.indexOf('final_action');
        if (finalActionIndex !== -1) {
          const newColumns = [...prev];
          newColumns.splice(finalActionIndex, 0, columnId);
          return newColumns;
        } else {
          // If 'final_action' is not present, add to the second-to-last position
          return [...prev.slice(0, -1), columnId, prev[prev.length - 1]];
        }
      }
    });
  };

  const ensureColumnOrder = (cols) => {
    const withoutFinalAndTimestamp = cols.filter(col => col !== 'final_action' && col !== 'timestamp');
    const finalActionIndex = cols.indexOf('final_action');
    const timestampIndex = cols.indexOf('timestamp');

    if (finalActionIndex !== -1) {
      withoutFinalAndTimestamp.push('final_action');
    }
    if (timestampIndex !== -1) {
      withoutFinalAndTimestamp.push('timestamp');
    }

    return withoutFinalAndTimestamp;
  };

  useEffect(() => {
    const orderedColumns = ensureColumnOrder(activeColumns);
    if (JSON.stringify(orderedColumns) !== JSON.stringify(activeColumns)) {
      setActiveColumns(orderedColumns);
    }
  }, [activeColumns]);

  const inactiveColumns = columns.filter(column => !activeColumns.includes(column.id));

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const toggleColumnSelection = () => {
    setShowColumnSelection(!showColumnSelection);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const renderCellContent = (request, columnId) => {
    switch (columnId) {
      case 'client_ip':
        return request.client_address || 'N/A';
      case 'final_action':
        if (request.final_action && request.final_action.startsWith('REJECT Rate limit exceeded')) {
          return (
            <Tooltip title="Rate limit exceeded" arrow>
              <span>{request.final_action}</span>
            </Tooltip>
          );
        } else if (request.rule_results && request.rule_results.length > 0) {
          const rule = request.rule_results[0];
          return (
            <Tooltip title={`Rule: ${ruleInfo[rule.rule_id] || 'Unknown'} (ID: ${rule.rule_id || 'N/A'})`} arrow>
              <span>{request.final_action || 'N/A'}</span>
            </Tooltip>
          );
        } else {
          return request.final_action || 'N/A';
        }
      case 'timestamp':
        return formatTimestamp(request[columnId]);
      default:
        return request[columnId] || 'N/A';
    }
  };

  return (
    <Paper>
      <Box p={2}>
        <Grid container spacing={2} alignItems="center" justifyContent="center">
          <Grid item>
            <Typography variant="h6">Requests</Typography>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined" 
              color="primary" 
              onClick={toggleColumnSelection}
            >
              {showColumnSelection ? 'Hide' : 'Show'} Column Selection
            </Button>
          </Grid>
        </Grid>
      </Box>
      <Box style={{ display: showColumnSelection ? 'block' : 'none' }}>
        <Box p={2}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="subtitle1">Inactive Columns</Typography>
              <Paper style={{ maxHeight: 200, overflow: 'auto' }}>
                <List>
                  {inactiveColumns.map(column => (
                    <ListItem button key={column.id} onClick={() => toggleColumn(column.id)}>
                      <ListItemText primary={column.label} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="subtitle1">Active Columns</Typography>
              <Paper style={{ maxHeight: 200, overflow: 'auto' }}>
                <List>
                  {activeColumns.map(columnId => {
                    const column = columns.find(c => c.id === columnId);
                    return column ? (
                      <ListItem button key={columnId} onClick={() => toggleColumn(columnId)}>
                        <ListItemText primary={column.label} />
                      </ListItem>
                    ) : null;
                  })}
                </List>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Box>
      <TableContainer>
        <Table stickyHeader className={classes.table} size="small">
          <TableHead>
            <TableRow>
              {activeColumns.map(columnId => {
                const column = columns.find(c => c.id === columnId);
                return column ? (
                  <TableCell key={columnId} className={classes.smallText}>
                    {column.label}
                    {columnId === 'final_action' && (
                      <Tooltip title="Hover over actions to see responsible rule">
                        <InfoIcon fontSize="small" style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
                      </Tooltip>
                    )}
                  </TableCell>
                ) : null;
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {data
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((request) => (
                <TableRow key={request._id}>
                  {activeColumns.map(columnId => (
                    <TableCell key={columnId} className={classes.smallText}>
                      {renderCellContent(request, columnId)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePaginationComponent
        rowsPerPageOptions={[25, 50, 100]}
        count={data.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

export default RecentRequests;
